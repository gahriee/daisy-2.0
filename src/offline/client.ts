import {
  assertOfflineUnlockWithinWindow,
  decryptJsonPayload,
  DEFAULT_INACTIVITY_LOCK_MS,
  initializeTrustedDeviceVaultKey,
  initializeVaultKeyMetadata,
  isTrustedDeviceVaultKeyMetadata,
  VaultKeyCustody,
  verifyAndUnlockVaultKey,
  verifyTrustedDeviceVaultKey,
} from "./crypto";
import {
  DAISY_OFFLINE_SCHEMA_VERSION,
  DaisyOfflineDatabase,
  type OutboxOperationEnvelope,
  type OutboxRecord,
} from "./db";
import { getOfflineSyncStatus, type SyncStatusSummary } from "./sync-engine";

let browserDb: DaisyOfflineDatabase | null = null;
let sharedCustody: VaultKeyCustody | null = null;

export function getBrowserOfflineDb(): DaisyOfflineDatabase {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB offline vault is browser-only.");
  }
  if (!browserDb) {
    browserDb = new DaisyOfflineDatabase();
  }
  return browserDb;
}

export function getVaultCustody(): VaultKeyCustody {
  if (!sharedCustody) {
    sharedCustody = new VaultKeyCustody(DEFAULT_INACTIVITY_LOCK_MS);
  }
  return sharedCustody;
}

export type StorageQuotaStatus = {
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
  nearQuota: boolean;
};

/**
 * Requests durable storage permission and inspects quota headroom cleanly.
 */
export async function inspectAndRequestStorageQuota(): Promise<StorageQuotaStatus> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return {
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
      nearQuota: false,
    };
  }

  let persisted: boolean | null = null;
  try {
    if (typeof navigator.storage.persisted === "function") {
      persisted = await navigator.storage.persisted();
      if (!persisted && typeof navigator.storage.persist === "function") {
        persisted = await navigator.storage.persist();
      }
    }
  } catch {
    persisted = null;
  }

  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  let nearQuota = false;
  try {
    if (typeof navigator.storage.estimate === "function") {
      const estimate = await navigator.storage.estimate();
      usageBytes = estimate.usage ?? null;
      quotaBytes = estimate.quota ?? null;
      if (
        usageBytes !== null &&
        quotaBytes !== null &&
        quotaBytes > 0 &&
        usageBytes / quotaBytes >= 0.8
      ) {
        nearQuota = true;
      }
    }
  } catch {
    // Keep null metrics when estimate is unsupported.
  }

  return { persisted, usageBytes, quotaBytes, nearQuota };
}

/**
 * Anchors the last validated online Owner session timestamp and active device ID
 * inside `vaultMeta`. Sync alone must never refresh `lastOnlineAuthAtMs`.
 */
export async function recordOnlineSessionAnchor(
  db: DaisyOfflineDatabase,
  input: {
    ownerUserId: string;
    deviceId: string | null;
    offlineUnlockMaxDays?: number;
    nowMs?: number;
  },
): Promise<void> {
  const existing = await db.vaultMeta.get("auth");
  const prev = existing?.key === "auth" ? existing : null;
  await db.vaultMeta.put({
    key: "auth",
    lastOnlineAuthAtMs: input.nowMs ?? Date.now(),
    offlineUnlockMaxDays:
      input.offlineUnlockMaxDays ?? prev?.offlineUnlockMaxDays ?? 7,
    ownerUserId: input.ownerUserId,
    deviceId: input.deviceId,
  });
}

export type TrustedDeviceUnlockResult =
  | {
      status: "unlocked";
      initializedNew: boolean;
      deviceId: string;
    }
  | {
      status: "untrusted_device";
    }
  | {
      status: "needs_online_setup";
    }
  | {
      status: "legacy_passphrase_required";
    }
  | {
      status: "expired";
      reason: string;
    };

/**
 * Automatically initializes or unlocks the offline vault on an Owner-approved
 * trusted device using a non-extractable AES-256-GCM CryptoKey stored in
 * IndexedDB — no manual sync password required.
 *
 * Refuses to auto-unlock on untrusted/revoked browsers or outside the
 * configured `offlineUnlockMaxDays` window when offline.
 */
export async function ensureTrustedDeviceVaultUnlocked(input: {
  db: DaisyOfflineDatabase;
  custody: VaultKeyCustody;
  isOnline: boolean;
  nowMs?: number;
}): Promise<TrustedDeviceUnlockResult> {
  const nowMs = input.nowMs ?? Date.now();
  const [cryptoMeta, authMeta, syncMeta] = await Promise.all([
    input.db.vaultMeta.get("crypto"),
    input.db.vaultMeta.get("auth"),
    input.db.vaultMeta.get("sync"),
  ]);

  const auth = authMeta?.key === "auth" ? authMeta : null;
  if (!auth?.deviceId) {
    input.custody.lock();
    return { status: "untrusted_device" };
  }

  if (!input.isOnline) {
    try {
      assertOfflineUnlockWithinWindow({
        lastOnlineAuthAtMs: auth.lastOnlineAuthAtMs,
        offlineUnlockMaxDays: auth.offlineUnlockMaxDays ?? 7,
        nowMs,
      });
    } catch (error) {
      input.custody.lock();
      return {
        status: "expired",
        reason:
          error instanceof Error
            ? error.message
            : "Connect to the internet and sign in again to refresh offline access.",
      };
    }
  }

  // Already unlocked in memory for this trusted device.
  if (
    input.custody.isUnlocked(nowMs) &&
    cryptoMeta?.key === "crypto" &&
    isTrustedDeviceVaultKeyMetadata(cryptoMeta.metadata)
  ) {
    return {
      status: "unlocked",
      initializedNew: false,
      deviceId: auth.deviceId,
    };
  }

  // Existing trusted-device key stored in IndexedDB.
  if (
    cryptoMeta?.key === "crypto" &&
    isTrustedDeviceVaultKeyMetadata(cryptoMeta.metadata)
  ) {
    const key = await verifyTrustedDeviceVaultKey(cryptoMeta.metadata);
    input.custody.setUnlockedKey(key, nowMs);
    return {
      status: "unlocked",
      initializedNew: false,
      deviceId: auth.deviceId,
    };
  }

  // Legacy passphrase-encrypted vault: auto-migrate cleanly if online and nothing
  // is unsynced; otherwise ask for the old password once so no offline work is lost.
  if (cryptoMeta?.key === "crypto") {
    const unsyncedCount = await input.db.outbox
      .where("status")
      .anyOf(["pending", "syncing", "conflict", "rejected", "blocked"])
      .count();

    if (!input.isOnline || unsyncedCount > 0) {
      return { status: "legacy_passphrase_required" };
    }

    await resetOfflineVaultForNewPassphrase({
      db: input.db,
      custody: input.custody,
    });
  } else if (!input.isOnline) {
    return { status: "needs_online_setup" };
  }

  const created = await initializeTrustedDeviceVaultKey();
  await input.db.vaultMeta.put({
    key: "crypto",
    metadata: created.metadata,
  });
  if (!syncMeta) {
    await input.db.vaultMeta.put({
      key: "sync",
      schemaVersion: DAISY_OFFLINE_SCHEMA_VERSION,
      watermark: null,
      syncCursor: null,
      lastSyncedAt: null,
      nextLocalSequence: 1,
      rebootstrapRequired: false,
    });
  }

  input.custody.setUnlockedKey(created.key, nowMs);
  return {
    status: "unlocked",
    initializedNew: true,
    deviceId: auth.deviceId,
  };
}

/**
 * Initializes or unlocks the Owner's encrypted IndexedDB vault, enforcing the
 * server-configured `offlineUnlockMaxDays` window before holding the key in memory.
 */
export async function unlockOrInitializeOfflineVault(input: {
  db: DaisyOfflineDatabase;
  custody: VaultKeyCustody;
  passphrase: string;
  isOnline: boolean;
  nowMs?: number;
}): Promise<{
  initializedNew: boolean;
  status: SyncStatusSummary;
  deviceId: string | null;
  lastOnlineAuthAtMs: number | null;
}> {
  const nowMs = input.nowMs ?? Date.now();
  const [cryptoMeta, authMeta, syncMeta] = await Promise.all([
    input.db.vaultMeta.get("crypto"),
    input.db.vaultMeta.get("auth"),
    input.db.vaultMeta.get("sync"),
  ]);

  const auth = authMeta?.key === "auth" ? authMeta : null;
  if (!input.isOnline) {
    assertOfflineUnlockWithinWindow({
      lastOnlineAuthAtMs: auth?.lastOnlineAuthAtMs ?? null,
      offlineUnlockMaxDays: auth?.offlineUnlockMaxDays ?? 7,
      nowMs,
    });
  }

  let initializedNew = false;
  let key: CryptoKey;

  if (!cryptoMeta || cryptoMeta.key !== "crypto") {
    if (!input.isOnline) {
      throw new Error(
        "Connect online once after signing in to set up your offline vault passphrase.",
      );
    }
    const created = await initializeVaultKeyMetadata(input.passphrase);
    key = created.key;
    initializedNew = true;
    await input.db.vaultMeta.put({
      key: "crypto",
      metadata: created.metadata,
    });
    if (!syncMeta) {
      await input.db.vaultMeta.put({
        key: "sync",
        schemaVersion: DAISY_OFFLINE_SCHEMA_VERSION,
        watermark: null,
        syncCursor: null,
        lastSyncedAt: null,
        nextLocalSequence: 1,
        rebootstrapRequired: false,
      });
    }
  } else if (isTrustedDeviceVaultKeyMetadata(cryptoMeta.metadata)) {
    key = await verifyTrustedDeviceVaultKey(cryptoMeta.metadata);
  } else {
    key = await verifyAndUnlockVaultKey(input.passphrase, cryptoMeta.metadata);
  }

  input.custody.setUnlockedKey(key, nowMs);
  const status = await getOfflineSyncStatus(input.db);
  return {
    initializedNew,
    status,
    deviceId: auth?.deviceId ?? null,
    lastOnlineAuthAtMs: auth?.lastOnlineAuthAtMs ?? null,
  };
}

export type DecryptedEntityView = {
  key: string;
  entityType: string;
  entityId: string;
  isPendingLocal: boolean;
  hasConflict: boolean;
  pendingOpCount: number;
  updatedAt: string;
  data: Record<string, unknown>;
};

export type DecryptedSnapshotView = {
  key: string;
  entityType: string;
  entityId: string;
  sequence: string;
  version: number;
  operation: "upsert" | "tombstone";
  occurredAt: string;
  data: Record<string, unknown>;
};

export async function listDecryptedSnapshots(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  entityTypes?: string[],
): Promise<DecryptedSnapshotView[]> {
  const rows = entityTypes?.length
    ? await db.snapshots.where("entityType").anyOf(entityTypes).toArray()
    : await db.snapshots.toArray();
  return Promise.all(
    rows.map(async (row) => ({
      key: row.key,
      entityType: row.entityType,
      entityId: row.entityId,
      sequence: row.sequence,
      version: row.version,
      operation: row.operation,
      occurredAt: row.occurredAt,
      data: await decryptJsonPayload<Record<string, unknown>>(
        key,
        row.encryptedPayload,
      ),
    })),
  );
}

export async function listDecryptedProjections(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  entityTypes?: string[],
): Promise<DecryptedEntityView[]> {
  const rows = entityTypes?.length
    ? await db.projections.where("entityType").anyOf(entityTypes).toArray()
    : await db.projections.toArray();
  const decoded = await Promise.all(
    rows.map(async (row) => ({
      key: row.key,
      entityType: row.entityType,
      entityId: row.entityId,
      isPendingLocal: row.isPendingLocal,
      hasConflict: row.hasConflict,
      pendingOpCount: row.pendingOpCount,
      updatedAt: row.updatedAt,
      data: await decryptJsonPayload<Record<string, unknown>>(
        key,
        row.encryptedPayload,
      ),
    })),
  );
  return decoded.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listActiveOutboxRecords(
  db: DaisyOfflineDatabase,
): Promise<OutboxRecord[]> {
  return db.outbox
    .where("status")
    .anyOf(["pending", "syncing", "conflict", "rejected", "blocked"])
    .sortBy("localSequence");
}

export type NeedsAttentionView = {
  record: OutboxRecord;
  envelope: OutboxOperationEnvelope;
};

export async function listDecryptedNeedsAttention(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<NeedsAttentionView[]> {
  const rows = await db.outbox
    .where("status")
    .anyOf(["conflict", "rejected", "blocked"])
    .sortBy("localSequence");

  return Promise.all(
    rows.map(async (record) => ({
      record,
      envelope: await decryptJsonPayload<OutboxOperationEnvelope>(
        key,
        record.encryptedOperation,
      ),
    })),
  );
}

export async function listDecryptedPendingOutbox(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<NeedsAttentionView[]> {
  const rows = await db.outbox
    .where("status")
    .anyOf(["pending", "syncing"])
    .sortBy("localSequence");

  return Promise.all(
    rows.map(async (record) => ({
      record,
      envelope: await decryptJsonPayload<OutboxOperationEnvelope>(
        key,
        record.encryptedOperation,
      ),
    })),
  );
}

/**
 * Clears the encrypted local copy on this browser (snapshots, projections,
 * outbox, attachments, sync locks, and crypto/sync metadata) while preserving
 * the trusted-device auth anchor so the Owner can generate a new sync password
 * and download a fresh copy from the server.
 */
export async function resetOfflineVaultForNewPassphrase(input: {
  db: DaisyOfflineDatabase;
  custody: VaultKeyCustody;
}): Promise<void> {
  input.custody.lock();
  await input.db.transaction(
    "rw",
    [
      input.db.vaultMeta,
      input.db.snapshots,
      input.db.projections,
      input.db.outbox,
      input.db.attachments,
      input.db.syncLocks,
    ],
    async () => {
      await Promise.all([
        input.db.snapshots.clear(),
        input.db.projections.clear(),
        input.db.outbox.clear(),
        input.db.attachments.clear(),
        input.db.syncLocks.clear(),
        input.db.vaultMeta.delete("crypto"),
        input.db.vaultMeta.delete("sync"),
      ]);
    },
  );
}
