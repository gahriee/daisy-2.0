import type { OverpaymentPolicyValue } from "@/features/settings/schemas";
import type { AnySyncOperationType } from "@/features/sync/contracts";
import { prepareQueuedAttachments } from "./attachments";
import {
  ensureTrustedDeviceVaultUnlocked,
  getBrowserOfflineDb,
  getVaultCustody,
} from "./client";
import { isTrustedDeviceVaultKeyMetadata } from "./crypto";
import {
  discardNeedsAttentionOperation,
  enqueueOfflineOperationAtomic,
  findLatestActiveEntityOutboxOpId,
  inferEntityTypeFromOp,
  keepMineNeedsAttentionOperation,
  type OfflineAttachmentKind,
} from "./db";
import {
  getOfflineSyncStatus,
  syncOfflineWorkspace,
  type SyncRunResult,
  type SyncStatusSummary,
} from "./sync-engine";

export const DAISY_OFFLINE_VAULT_EVENT = "daisy:offline-vault-changed";
export const DAISY_OPEN_SYNC_MODAL_EVENT = "daisy:open-sync-modal";

export function notifyOfflineVaultChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DAISY_OFFLINE_VAULT_EVENT));
}

export function openOfflineSyncModal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DAISY_OPEN_SYNC_MODAL_EVENT));
}

export class OfflineVaultLockedError extends Error {
  constructor(
    message = "Unlock your offline vault passphrase to save changes on this device.",
  ) {
    super(message);
    this.name = "OfflineVaultLockedError";
  }
}

export class OfflineDeviceMissingError extends Error {
  constructor(
    message = "Register this device in Settings -> Trusted devices before queueing offline edits.",
  ) {
    super(message);
    this.name = "OfflineDeviceMissingError";
  }
}

export type OfflineVaultClientState = {
  online: boolean;
  vaultConfigured: boolean;
  vaultUnlocked: boolean;
  trustedDeviceAutoSync: boolean;
  deviceId: string | null;
  lastOnlineAuthAtMs: number | null;
  status: SyncStatusSummary;
};

/**
 * Persists non-PII Owner policy limits (receipt prefix, overpayment rule, proof
 * upload size/count limits) into `vaultMeta` for consistent offline rendering.
 */
export async function cacheOfflinePoliciesMeta(input: {
  policiesComplete?: boolean;
  receiptPrefix?: string | null;
  overpaymentPolicy?: OverpaymentPolicyValue | null;
  proofMaxBytes?: number;
  proofMaxFilesPerRecord?: number;
  proofMaxMb?: number;
  missingPolicyLabels?: string[];
}): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = getBrowserOfflineDb();
    const existing = await db.vaultMeta.get("policies");
    const prev = existing?.key === "policies" ? existing : null;
    await db.vaultMeta.put({
      key: "policies",
      policiesComplete:
        input.policiesComplete ?? prev?.policiesComplete ?? false,
      receiptPrefix:
        input.receiptPrefix !== undefined
          ? input.receiptPrefix
          : (prev?.receiptPrefix ?? null),
      overpaymentPolicy:
        input.overpaymentPolicy !== undefined
          ? input.overpaymentPolicy
          : (prev?.overpaymentPolicy ?? null),
      proofMaxBytes:
        input.proofMaxBytes ?? prev?.proofMaxBytes ?? 5 * 1024 * 1024,
      proofMaxFilesPerRecord:
        input.proofMaxFilesPerRecord ?? prev?.proofMaxFilesPerRecord ?? 5,
      proofMaxMb: input.proofMaxMb ?? prev?.proofMaxMb ?? 5,
      missingPolicyLabels:
        input.missingPolicyLabels ?? prev?.missingPolicyLabels ?? [],
    });
  } catch {
    // Ignore IDB errors in restricted environments.
  }
}

/**
 * Queries current offline vault state without decrypting personal data.
 */
export async function getOfflineVaultClientState(): Promise<OfflineVaultClientState> {
  const db = getBrowserOfflineDb();
  const custody = getVaultCustody();
  const [cryptoMeta, authMeta, status] = await Promise.all([
    db.vaultMeta.get("crypto"),
    db.vaultMeta.get("auth"),
    getOfflineSyncStatus(db),
  ]);
  const auth = authMeta?.key === "auth" ? authMeta : null;
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    vaultConfigured: cryptoMeta?.key === "crypto",
    vaultUnlocked: custody.isUnlocked(),
    trustedDeviceAutoSync:
      cryptoMeta?.key === "crypto" &&
      isTrustedDeviceVaultKeyMetadata(cryptoMeta.metadata),
    deviceId: auth?.deviceId ?? null,
    lastOnlineAuthAtMs: auth?.lastOnlineAuthAtMs ?? null,
    status,
  };
}

export type OfflineCapableSubmitResult =
  | {
      delivery: "synced";
      opId: string;
      entityId: string;
      message: string;
    }
  | {
      delivery: "queued";
      opId: string;
      entityId: string;
      message: string;
    }
  | {
      delivery: "needs_attention";
      opId: string;
      entityId: string;
      reason: string;
    };

/**
 * Unified local-outbox mutation helper (`client intent -> local outbox -> sync`).
 * Queues atomically in encrypted IndexedDB first, updates UI listeners, and runs
 * foreground push+pull immediately when online.
 */
export async function submitOfflineCapableMutation(input: {
  type: AnySyncOperationType;
  entityId: string;
  baseVersion: number;
  payload: Record<string, unknown>;
  projectionPayload?: Record<string, unknown>;
  dependsOn?: string[];
  attachments?: {
    kind: OfflineAttachmentKind;
    files: Array<{
      attachmentId: string;
      clientFileId: string;
      fileName: string;
      mimeType: string;
      bytes: Uint8Array;
    }>;
    maxBytes?: number;
    maxFiles?: number;
  };
  syncedMessage?: string;
  queuedMessage?: string;
  autoSync?: boolean;
}): Promise<OfflineCapableSubmitResult> {
  const db = getBrowserOfflineDb();
  const custody = getVaultCustody();
  if (!custody.isUnlocked()) {
    const auto = await ensureTrustedDeviceVaultUnlocked({
      db,
      custody,
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : false,
    });
    if (auto.status === "untrusted_device") {
      throw new OfflineDeviceMissingError();
    }
    if (auto.status !== "unlocked") {
      throw new OfflineVaultLockedError();
    }
  }
  const key = custody.getKey();

  const authMeta = await db.vaultMeta.get("auth");
  const deviceId = authMeta?.key === "auth" ? authMeta.deviceId : null;
  if (!deviceId) {
    throw new OfflineDeviceMissingError();
  }

  const entityType = inferEntityTypeFromOp(input.type);
  const chainedPredecessor =
    input.dependsOn !== undefined
      ? null
      : await findLatestActiveEntityOutboxOpId(db, entityType, input.entityId);

  const preparedAttachments = input.attachments
    ? await prepareQueuedAttachments(input.attachments)
    : undefined;

  const opId = crypto.randomUUID();
  await enqueueOfflineOperationAtomic(db, key, {
    opId,
    deviceId,
    type: input.type,
    entityId: input.entityId,
    baseVersion: input.baseVersion,
    dependsOn:
      input.dependsOn ?? (chainedPredecessor ? [chainedPredecessor] : []),
    payload: input.payload,
    ...(input.projectionPayload
      ? { projectionPayload: input.projectionPayload }
      : {}),
    ...(preparedAttachments ? { attachments: preparedAttachments } : {}),
  });

  notifyOfflineVaultChanged();

  const shouldAutoSync =
    input.autoSync !== false &&
    typeof navigator !== "undefined" &&
    navigator.onLine;

  if (shouldAutoSync) {
    try {
      await syncOfflineWorkspace({
        db,
        key,
        ownerToken: crypto.randomUUID(),
      });
      notifyOfflineVaultChanged();

      const updatedOp = await db.outbox.get(opId);
      if (updatedOp?.status === "applied") {
        return {
          delivery: "synced",
          opId,
          entityId: input.entityId,
          message: input.syncedMessage ?? "Saved and synced.",
        };
      }
      if (
        updatedOp &&
        (updatedOp.status === "conflict" ||
          updatedOp.status === "rejected" ||
          updatedOp.status === "blocked")
      ) {
        return {
          delivery: "needs_attention",
          opId,
          entityId: input.entityId,
          reason:
            updatedOp.reason ??
            "Server could not confirm this change. Review in Needs attention.",
        };
      }
    } catch {
      // Keep the already-persisted outbox entry safely queued for retry.
      notifyOfflineVaultChanged();
    }
  }

  return {
    delivery: "queued",
    opId,
    entityId: input.entityId,
    message:
      input.queuedMessage ??
      "Saved on this device. Will confirm with the server once synced.",
  };
}

/**
 * Triggers foreground push-before-pull sync when the browser is online and the
 * offline vault is unlocked with an active session key.
 */
export async function triggerForegroundSyncIfUnlocked(): Promise<SyncRunResult | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return null;
  }
  const db = getBrowserOfflineDb();
  const custody = getVaultCustody();
  if (!custody.isUnlocked()) {
    const auto = await ensureTrustedDeviceVaultUnlocked({
      db,
      custody,
      isOnline: true,
    });
    if (auto.status !== "unlocked") {
      return null;
    }
  }
  try {
    const res = await syncOfflineWorkspace({
      db,
      key: custody.getKey(),
      ownerToken: crypto.randomUUID(),
    });
    notifyOfflineVaultChanged();
    return res;
  } catch {
    notifyOfflineVaultChanged();
    return null;
  }
}

/**
 * Re-queues a Needs-attention outbox entry against current snapshot version
 * and syncs immediately if online.
 */
export async function resolveNeedsAttentionKeepMine(
  supersededOpId: string,
): Promise<void> {
  const db = getBrowserOfflineDb();
  const custody = getVaultCustody();
  if (!custody.isUnlocked()) {
    const auto = await ensureTrustedDeviceVaultUnlocked({
      db,
      custody,
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : false,
    });
    if (auto.status !== "unlocked") {
      throw new OfflineVaultLockedError();
    }
  }
  await keepMineNeedsAttentionOperation(db, custody.getKey(), {
    supersededOpId,
    newOpId: crypto.randomUUID(),
  });
  notifyOfflineVaultChanged();
  if (typeof navigator !== "undefined" && navigator.onLine) {
    await triggerForegroundSyncIfUnlocked();
  }
}

/**
 * Discards a chosen Needs-attention operation and rebuilds the entity projection
 * from confirmed server state.
 */
export async function resolveNeedsAttentionDiscard(
  opId: string,
): Promise<void> {
  const db = getBrowserOfflineDb();
  const custody = getVaultCustody();
  if (!custody.isUnlocked()) {
    const auto = await ensureTrustedDeviceVaultUnlocked({
      db,
      custody,
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : false,
    });
    if (auto.status !== "unlocked") {
      throw new OfflineVaultLockedError();
    }
  }
  await discardNeedsAttentionOperation(db, custody.getKey(), opId);
  notifyOfflineVaultChanged();
}
