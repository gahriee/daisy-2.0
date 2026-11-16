import Dexie, { type Table } from "dexie";
import type { OverpaymentPolicyValue } from "@/features/settings/schemas";
import type { AnySyncOperationType } from "@/features/sync/contracts";
import {
  decryptJsonPayload,
  encryptBinaryBlob,
  encryptJsonPayload,
  type EncryptedBinaryRecord,
  type EncryptedPayloadRecord,
  type VaultKeyMetadata,
} from "./crypto";

export const DAISY_OFFLINE_DB_NAME = "daisy-offline-vault";
export const DAISY_OFFLINE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_LOCAL_LEASE_MS = 30_000;

export type OfflineOutboxStatus =
  "pending" | "syncing" | "applied" | "conflict" | "rejected" | "blocked";

export type VaultMetaRecord =
  | {
      key: "auth";
      lastOnlineAuthAtMs: number | null;
      offlineUnlockMaxDays: number;
      ownerUserId: string | null;
      deviceId: string | null;
    }
  | {
      key: "crypto";
      metadata: VaultKeyMetadata;
    }
  | {
      key: "sync";
      schemaVersion: number;
      watermark: string | null;
      syncCursor: string | null;
      lastSyncedAt: string | null;
      nextLocalSequence: number;
      rebootstrapRequired: boolean;
    }
  | {
      key: "policies";
      policiesComplete: boolean;
      receiptPrefix: string | null;
      overpaymentPolicy: OverpaymentPolicyValue | null;
      proofMaxBytes: number;
      proofMaxFilesPerRecord: number;
      proofMaxMb: number;
      missingPolicyLabels: string[];
    };

export type SnapshotRecord = {
  key: string; // `${entityType}:${entityId}`
  entityType: string;
  entityId: string;
  sequence: string;
  version: number;
  operation: "upsert" | "tombstone";
  occurredAt: string;
  encryptedPayload: EncryptedPayloadRecord;
};

export type ProjectionRecord = {
  key: string; // `${entityType}:${entityId}`
  entityType: string;
  entityId: string;
  isPendingLocal: boolean;
  hasConflict: boolean;
  pendingOpCount: number;
  updatedAt: string;
  encryptedPayload: EncryptedPayloadRecord;
};

export type OutboxOperationEnvelope = {
  protocolVersion: 1;
  opId: string;
  deviceId: string;
  localSequence: number;
  type: AnySyncOperationType;
  entityId: string;
  baseVersion: number;
  dependsOn: string[];
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type OutboxRecord = {
  opId: string;
  deviceId: string;
  localSequence: number;
  entityType: string;
  entityId: string;
  type: AnySyncOperationType;
  baseVersion: number;
  dependsOn: string[];
  attachmentIds: string[];
  status: OfflineOutboxStatus;
  reason: string | null;
  resultingVersion: number | null;
  retryCount: number;
  nextRetryAtMs: number;
  submittedOnce: boolean;
  encryptedOperation: EncryptedPayloadRecord;
  createdAt: string;
  updatedAt: string;
};

export type OfflineAttachmentKind = "payment_proof" | "maintenance_attachment";

export type AttachmentRecord = {
  attachmentId: string;
  opId: string;
  clientFileId: string;
  kind: OfflineAttachmentKind;
  intentEndpoint: string;
  intentId: string | null;
  uploadUrl: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  status: "queued" | "uploaded" | "failed";
  encryptedBytes: EncryptedBinaryRecord;
  createdAt: string;
  updatedAt: string;
};

export type SyncLockRecord = {
  lockName: string;
  ownerToken: string;
  expiresAtMs: number;
};

export class DaisyOfflineDatabase extends Dexie {
  vaultMeta!: Table<VaultMetaRecord, string>;
  snapshots!: Table<SnapshotRecord, string>;
  projections!: Table<ProjectionRecord, string>;
  outbox!: Table<OutboxRecord, string>;
  attachments!: Table<AttachmentRecord, string>;
  syncLocks!: Table<SyncLockRecord, string>;

  constructor(options?: {
    name?: string;
    indexedDB?: IDBFactory;
    IDBKeyRange?: typeof IDBKeyRange;
  }) {
    super(
      options?.name ?? DAISY_OFFLINE_DB_NAME,
      options?.indexedDB
        ? {
            indexedDB: options.indexedDB,
            ...(options.IDBKeyRange
              ? { IDBKeyRange: options.IDBKeyRange }
              : {}),
          }
        : undefined,
    );

    this.version(DAISY_OFFLINE_SCHEMA_VERSION).stores({
      vaultMeta: "&key",
      snapshots: "&key, entityType, sequence",
      projections: "&key, entityType",
      outbox: "&opId, status, localSequence, [status+localSequence], entityId",
      attachments: "&attachmentId, opId, status",
      syncLocks: "&lockName",
    });
  }
}

export function snapshotEntityKey(
  entityType: string,
  entityId: string,
): string {
  return `${entityType}:${entityId}`;
}

/**
 * Finds the most recent unacknowledged local outbox operation targeting the
 * same entity so sequential offline edits chain explicit `dependsOn` links.
 */
export async function findLatestActiveEntityOutboxOpId(
  db: DaisyOfflineDatabase,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const rows = await db.outbox
    .where("entityId")
    .equals(entityId)
    .sortBy("localSequence");
  const active = rows.filter(
    (row) =>
      row.entityType === entityType &&
      (row.status === "pending" || row.status === "syncing"),
  );
  return active.at(-1)?.opId ?? null;
}

export function inferEntityTypeFromOp(type: AnySyncOperationType): string {
  if (type.startsWith("tenant.")) return "tenant";
  if (type.startsWith("transient_guest.")) return "transient_guest";
  if (type.startsWith("transient_reservation.")) return "transient_reservation";
  if (type === "payment.record") return "payment";
  if (type.startsWith("maintenance.")) return "maintenance_request";
  return "unknown";
}

/**
 * Checks stored schema version compatibility so incompatible upgrades never
 * silently drop pending offline work or queued encrypted attachments.
 */
export async function assertOfflineSchemaCompatible(
  db: DaisyOfflineDatabase,
): Promise<void> {
  const syncMeta = await db.vaultMeta.get("sync");
  if (!syncMeta || syncMeta.key !== "sync") {
    return;
  }
  if (syncMeta.schemaVersion > DAISY_OFFLINE_SCHEMA_VERSION) {
    const pendingCount = await db.outbox
      .where("status")
      .anyOf(["pending", "syncing", "conflict", "rejected", "blocked"])
      .count();
    throw new Error(
      pendingCount > 0
        ? `Offline vault schema v${syncMeta.schemaVersion} is newer than this app (v${DAISY_OFFLINE_SCHEMA_VERSION}) with ${pendingCount} unsynced items. Reload the latest app before modifying data.`
        : `Offline vault schema v${syncMeta.schemaVersion} requires updating the application.`,
    );
  }
}

/**
 * Atomically queues a new offline operation, optional encrypted attachments, and
 * tentative local projection in one IndexedDB transaction. Any quota/storage
 * failure rolls back so UI never shows "Saved on this device".
 */
export async function enqueueOfflineOperationAtomic(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  input: {
    opId: string;
    deviceId: string;
    type: AnySyncOperationType;
    entityId: string;
    baseVersion: number;
    dependsOn?: string[];
    payload: Record<string, unknown>;
    occurredAt?: string;
    projectionPayload?: Record<string, unknown>;
    attachments?: Array<{
      attachmentId: string;
      clientFileId: string;
      kind: OfflineAttachmentKind;
      intentEndpoint: string;
      fileName: string;
      mimeType: string;
      bytes: Uint8Array;
      sha256: string;
    }>;
  },
): Promise<{ outbox: OutboxRecord; localSequence: number }> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const entityType = inferEntityTypeFromOp(input.type);
  const projectionKey = snapshotEntityKey(entityType, input.entityId);

  // Encrypt before entering Dexie IDB transaction so async WebCrypto work never
  // triggers IDB TransactionInactiveError across IndexedDB implementations.
  const preparedAttachments = await Promise.all(
    (input.attachments ?? []).map(async (item) => ({
      attachmentId: item.attachmentId,
      opId: input.opId,
      clientFileId: item.clientFileId,
      kind: item.kind,
      intentEndpoint: item.intentEndpoint,
      intentId: null,
      uploadUrl: null,
      fileName: item.fileName,
      mimeType: item.mimeType,
      byteSize: item.bytes.byteLength,
      sha256: item.sha256,
      status: "queued" as const,
      encryptedBytes: await encryptBinaryBlob(key, item.bytes, item.mimeType),
      createdAt: occurredAt,
      updatedAt: occurredAt,
    })),
  );

  // Reserve monotonic localSequence first? Wait: we must assign sequence inside TX
  // AND encrypt operation envelope with final localSequence! Since WebCrypto cannot
  // run mid-IDB-tx reliably in strict IDB specs, pre-reserve sequence or run short TX:
  // wait: let's allocate localSequence atomically OR encrypt with tentative seq then
  // assign final sequence inside TX? No, localSequence sits inside encryptedOperation too!
  // Let's check existing syncMeta sequence cleanly or run inside db.transaction with WebCrypto
  // Wait: in IndexedDB (`fake-indexeddb` & browsers), microtasks outside IDB can auto-commit IDB tx!
  // Solution: run a short atomic sequence reservation in TX1 OR derive localSequence from max outbox
  // ONLY inside the TX AFTER encrypting? Wait: if Outbox.localSequence is only metadata checked sequentially
  // by client and server doesn't enforce gaplessness (server schema requires `localSequence >= 1`), reserving
  // `nextLocalSequence` cleanly before encrypting AND guarding uniqueness with `outbox.add` (`ConstraintError` on collision)
  // OR using a sequence key gives both strict IDB-safe WebCrypto + atomic multi-store `outbox`+`attachments`+`projections` commit!
  const reservedSeq = await db.transaction("rw", db.vaultMeta, async () => {
    const meta = await db.vaultMeta.get("sync");
    const current = meta?.key === "sync" ? meta.nextLocalSequence : 1;
    await db.vaultMeta.put({
      key: "sync",
      schemaVersion: DAISY_OFFLINE_SCHEMA_VERSION,
      watermark: meta?.key === "sync" ? meta.watermark : null,
      syncCursor: meta?.key === "sync" ? meta.syncCursor : null,
      lastSyncedAt: meta?.key === "sync" ? meta.lastSyncedAt : null,
      nextLocalSequence: current + 1,
      rebootstrapRequired:
        meta?.key === "sync" ? meta.rebootstrapRequired : false,
    });
    return current;
  });

  const envelope: OutboxOperationEnvelope = {
    protocolVersion: 1,
    opId: input.opId,
    deviceId: input.deviceId,
    localSequence: reservedSeq,
    type: input.type,
    entityId: input.entityId,
    baseVersion: input.baseVersion,
    dependsOn: input.dependsOn ?? [],
    payload: input.payload,
    occurredAt,
  };

  const encryptedOperation = await encryptJsonPayload(key, envelope);
  const encryptedProjection = input.projectionPayload
    ? await encryptJsonPayload(key, {
        ...input.projectionPayload,
        _pendingLocal: true,
        _opType: input.type,
      })
    : null;

  const outboxRecord: OutboxRecord = {
    opId: input.opId,
    deviceId: input.deviceId,
    localSequence: reservedSeq,
    entityType,
    entityId: input.entityId,
    type: input.type,
    baseVersion: input.baseVersion,
    dependsOn: input.dependsOn ?? [],
    attachmentIds: preparedAttachments.map((a) => a.attachmentId),
    status: "pending",
    reason: null,
    resultingVersion: null,
    retryCount: 0,
    nextRetryAtMs: 0,
    submittedOnce: false,
    encryptedOperation,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };

  await db.transaction(
    "rw",
    [db.outbox, db.attachments, db.projections],
    async () => {
      await db.outbox.add(outboxRecord);
      if (preparedAttachments.length > 0) {
        await db.attachments.bulkAdd(preparedAttachments);
      }
      if (encryptedProjection) {
        const existingProj = await db.projections.get(projectionKey);
        await db.projections.put({
          key: projectionKey,
          entityType,
          entityId: input.entityId,
          isPendingLocal: true,
          hasConflict: existingProj?.hasConflict ?? false,
          pendingOpCount: (existingProj?.pendingOpCount ?? 0) + 1,
          updatedAt: occurredAt,
          encryptedPayload: encryptedProjection,
        });
      }
    },
  );

  return { outbox: outboxRecord, localSequence: reservedSeq };
}

/**
 * Rebuilds local decrypted projections from confirmed snapshots merged with any
 * still-pending or Needs-attention outbox entries without losing local drafts.
 */
async function buildRebasedProjections(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  affectedKeys: Iterable<string>,
  nowIso: string,
): Promise<{
  puts: ProjectionRecord[];
  deletes: string[];
}> {
  const uniqueKeys = Array.from(new Set(affectedKeys));
  const puts: ProjectionRecord[] = [];
  const deletes: string[] = [];

  for (const compositeKey of uniqueKeys) {
    const colonIdx = compositeKey.indexOf(":");
    const entityType = colonIdx === -1 ? "" : compositeKey.slice(0, colonIdx);
    const entityId = colonIdx === -1 ? "" : compositeKey.slice(colonIdx + 1);
    if (!entityType || !entityId) continue;

    const snapshot = await db.snapshots.get(compositeKey);
    const localOps = (
      await db.outbox.where("entityId").equals(entityId).sortBy("localSequence")
    ).filter(
      (op) =>
        op.entityType === entityType &&
        (op.status === "pending" ||
          op.status === "syncing" ||
          op.status === "conflict" ||
          op.status === "rejected" ||
          op.status === "blocked"),
    );

    const hasConflict = localOps.some(
      (op) =>
        op.status === "conflict" ||
        op.status === "rejected" ||
        op.status === "blocked",
    );

    if (!snapshot && localOps.length === 0) {
      deletes.push(compositeKey);
      continue;
    }

    let merged: Record<string, unknown> = {};
    if (snapshot) {
      const confirmed = await decryptJsonPayload<Record<string, unknown>>(
        key,
        snapshot.encryptedPayload,
      );
      merged = {
        ...confirmed,
        _operation: snapshot.operation,
        _version: snapshot.version,
        _sequence: snapshot.sequence,
        _pendingLocal: false,
      };
    }

    for (const pendingOp of localOps) {
      if (
        pendingOp.status === "conflict" ||
        pendingOp.status === "rejected" ||
        pendingOp.status === "blocked"
      ) {
        continue;
      }
      const env = await decryptJsonPayload<OutboxOperationEnvelope>(
        key,
        pendingOp.encryptedOperation,
      );
      const archiveDelta = pendingOp.type.endsWith(".archive")
        ? { archivedAt: env.occurredAt }
        : pendingOp.type.endsWith(".restore")
          ? { archivedAt: null }
          : {};
      const statusDelta =
        pendingOp.type === "maintenance.update" &&
        typeof env.payload.statusTo === "string" &&
        env.payload.statusTo
          ? { status: env.payload.statusTo }
          : pendingOp.type === "transient_reservation.create"
            ? { status: "TENTATIVE" }
            : pendingOp.type === "transient_reservation.checkin"
              ? { status: "CHECKED_IN", checkedInAt: env.occurredAt }
              : pendingOp.type === "transient_reservation.checkout"
                ? { status: "CHECKED_OUT", checkedOutAt: env.occurredAt }
                : {};
      merged = {
        ...merged,
        ...env.payload,
        ...archiveDelta,
        ...statusDelta,
        id: entityId,
        _pendingLocal: true,
        _opType: pendingOp.type,
      };
    }

    if (snapshot?.operation === "tombstone" && localOps.length === 0) {
      // Keep confirmed tombstone marker visible or drop active projection safely
      merged = {
        ...merged,
        archivedAt: merged.archivedAt ?? snapshot.occurredAt,
        _tombstone: true,
      };
    }

    const encryptedPayload = await encryptJsonPayload(key, merged);
    puts.push({
      key: compositeKey,
      entityType,
      entityId,
      isPendingLocal: localOps.some(
        (op) => op.status === "pending" || op.status === "syncing",
      ),
      hasConflict,
      pendingOpCount: localOps.length,
      updatedAt: nowIso,
      encryptedPayload,
    });
  }

  return { puts, deletes };
}

/**
 * Applies a bootstrap or pull sync page and advances watermark/cursor inside ONE
 * atomic IndexedDB transaction, rebasing projections while preserving pending ops.
 */
export async function applySyncChangesAtomic(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  input: {
    changes: Array<{
      sequence: string;
      entityType: string;
      entityId: string;
      version: number;
      operation: "upsert" | "tombstone";
      payload: unknown;
      occurredAt: string;
    }>;
    nextSyncCursor?: string | null;
    watermark?: string | null;
    rebootstrapRequired?: boolean;
    nowIso?: string;
  },
): Promise<{ appliedCount: number }> {
  const nowIso = input.nowIso ?? new Date().toISOString();

  // Pre-encrypt snapshots outside IDB transaction for safe cross-engine IndexedDB commits.
  const preparedSnapshots: SnapshotRecord[] = await Promise.all(
    input.changes.map(async (change) => ({
      key: snapshotEntityKey(change.entityType, change.entityId),
      entityType: change.entityType,
      entityId: change.entityId,
      sequence: change.sequence,
      version: change.version,
      operation: change.operation,
      occurredAt: change.occurredAt,
      encryptedPayload: await encryptJsonPayload(key, change.payload ?? {}),
    })),
  );

  // First commit snapshot rows + sync cursor atomically, then compute rebased projections & write.
  const existingSyncMeta = await db.vaultMeta.get("sync");
  await db.transaction("rw", [db.snapshots, db.vaultMeta], async () => {
    if (preparedSnapshots.length > 0) {
      await db.snapshots.bulkPut(preparedSnapshots);
    }
    const prev = existingSyncMeta?.key === "sync" ? existingSyncMeta : null;
    await db.vaultMeta.put({
      key: "sync",
      schemaVersion: DAISY_OFFLINE_SCHEMA_VERSION,
      watermark:
        input.watermark !== undefined
          ? input.watermark
          : (prev?.watermark ?? null),
      syncCursor:
        input.nextSyncCursor !== undefined
          ? input.nextSyncCursor
          : (prev?.syncCursor ?? null),
      lastSyncedAt: nowIso,
      nextLocalSequence: prev?.nextLocalSequence ?? 1,
      rebootstrapRequired: input.rebootstrapRequired ?? false,
    });
  });

  if (preparedSnapshots.length > 0) {
    const rebased = await buildRebasedProjections(
      db,
      key,
      preparedSnapshots.map((s) => s.key),
      nowIso,
    );
    await db.transaction("rw", db.projections, async () => {
      if (rebased.puts.length > 0) {
        await db.projections.bulkPut(rebased.puts);
      }
      if (rebased.deletes.length > 0) {
        await db.projections.bulkDelete(rebased.deletes);
      }
    });
  }

  return { appliedCount: preparedSnapshots.length };
}

/**
 * Rebuilds the projection for one entity from confirmed server state and remaining
 * local operations, removing a chosen Needs-attention operation cleanly.
 */
export async function discardNeedsAttentionOperation(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  opId: string,
): Promise<void> {
  const target = await db.outbox.get(opId);
  if (!target) return;

  const targetKey = snapshotEntityKey(target.entityType, target.entityId);
  const nowIso = new Date().toISOString();

  await db.transaction("rw", [db.outbox, db.attachments], async () => {
    await db.outbox.delete(opId);
    await db.attachments.where("opId").equals(opId).delete();
  });

  const rebased = await buildRebasedProjections(db, key, [targetKey], nowIso);
  await db.transaction("rw", db.projections, async () => {
    if (rebased.puts.length > 0) {
      await db.projections.bulkPut(rebased.puts);
    }
    if (rebased.deletes.length > 0) {
      await db.projections.bulkDelete(rebased.deletes);
    }
  });
}

/**
 * Creates a brand-new operation ID bound to the current confirmed server version
 * ("Keep mine") without reusing an already-rejected/conflicted ID, and removes
 * the superseded Needs-attention row.
 */
export async function keepMineNeedsAttentionOperation(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  input: {
    supersededOpId: string;
    newOpId: string;
    newPayload?: Record<string, unknown>;
  },
): Promise<{ outbox: OutboxRecord }> {
  const existing = await db.outbox.get(input.supersededOpId);
  if (!existing) {
    throw new Error("Superseded offline operation not found.");
  }

  const oldEnvelope = await decryptJsonPayload<OutboxOperationEnvelope>(
    key,
    existing.encryptedOperation,
  );
  const snapshot = await db.snapshots.get(
    snapshotEntityKey(existing.entityType, existing.entityId),
  );
  const currentServerVersion = snapshot ? snapshot.version : 0;

  const { outbox } = await enqueueOfflineOperationAtomic(db, key, {
    opId: input.newOpId,
    deviceId: existing.deviceId,
    type: existing.type,
    entityId: existing.entityId,
    baseVersion: currentServerVersion,
    dependsOn: [],
    payload: input.newPayload ?? oldEnvelope.payload,
    projectionPayload: input.newPayload ?? oldEnvelope.payload,
  });

  await discardNeedsAttentionOperation(db, key, input.supersededOpId);
  return { outbox };
}
