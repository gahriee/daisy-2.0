import {
  SYNC_PAGE_MAX_RECORDS,
  SYNC_PUSH_MAX_BYTES,
  SYNC_PUSH_MAX_OPS,
  type SyncBootstrapPageDto,
  type SyncPullPageDto,
  type SyncPushResponseDto,
} from "@/features/sync/contracts";
import { uploadQueuedAttachmentsForOp, type FetchLike } from "./attachments";
import { decryptJsonPayload, encryptJsonPayload } from "./crypto";
import {
  applySyncChangesAtomic,
  assertOfflineSchemaCompatible,
  DEFAULT_LOCAL_LEASE_MS,
  type DaisyOfflineDatabase,
  type OutboxOperationEnvelope,
  type OutboxRecord,
} from "./db";

const SYNC_LOCK_NAME = "daisy-sync-leader";
const MAX_PULL_PAGES_PER_RUN = 50;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60_000;

export type SyncStatusSummary = {
  pendingCount: number;
  needsAttentionCount: number;
  syncingCount: number;
  lastSyncedAt: string | null;
  watermark: string | null;
  hasCursor: boolean;
  rebootstrapRequired: boolean;
};

export type SyncRunResult = {
  status: "completed" | "already_running" | "rate_limited";
  pushedCount: number;
  appliedCount: number;
  needsAttentionCount: number;
  pulledCount: number;
  rebootstrapped: boolean;
  retryAfterSeconds?: number;
};

function computeBackoffMs(retryCount: number, nowMs: number): number {
  const exp = Math.min(
    BASE_BACKOFF_MS * Math.pow(2, retryCount),
    MAX_BACKOFF_MS,
  );
  const jitter = Math.floor((nowMs % 500) + 100);
  return Math.min(exp + jitter, MAX_BACKOFF_MS);
}

/**
 * Queries current outbox counts and cursor metadata without reading decrypted PII.
 */
export async function getOfflineSyncStatus(
  db: DaisyOfflineDatabase,
): Promise<SyncStatusSummary> {
  const [pendingCount, needsAttentionCount, syncingCount, syncMeta] =
    await Promise.all([
      db.outbox.where("status").equals("pending").count(),
      db.outbox
        .where("status")
        .anyOf(["conflict", "rejected", "blocked"])
        .count(),
      db.outbox.where("status").equals("syncing").count(),
      db.vaultMeta.get("sync"),
    ]);

  const meta = syncMeta?.key === "sync" ? syncMeta : null;
  return {
    pendingCount,
    needsAttentionCount,
    syncingCount,
    lastSyncedAt: meta?.lastSyncedAt ?? null,
    watermark: meta?.watermark ?? null,
    hasCursor: Boolean(meta?.syncCursor),
    rebootstrapRequired: meta?.rebootstrapRequired ?? false,
  };
}

/**
 * Acquires single-leader coordination via `navigator.locks` when present,
 * backed by an atomic IndexedDB lease row so tabs never race queue processing.
 */
export async function runWithSyncLeader<T>(
  db: DaisyOfflineDatabase,
  ownerToken: string,
  fn: () => Promise<T>,
  nowMs: number = Date.now(),
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const runLeaseProtected = async (): Promise<
    { acquired: true; result: T } | { acquired: false }
  > => {
    const acquired = await db.transaction("rw", db.syncLocks, async () => {
      const existing = await db.syncLocks.get(SYNC_LOCK_NAME);
      if (
        existing &&
        existing.ownerToken !== ownerToken &&
        existing.expiresAtMs > nowMs
      ) {
        return false;
      }
      await db.syncLocks.put({
        lockName: SYNC_LOCK_NAME,
        ownerToken,
        expiresAtMs: nowMs + DEFAULT_LOCAL_LEASE_MS,
      });
      return true;
    });

    if (!acquired) {
      return { acquired: false };
    }

    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      await db.transaction("rw", db.syncLocks, async () => {
        const current = await db.syncLocks.get(SYNC_LOCK_NAME);
        if (current?.ownerToken === ownerToken) {
          await db.syncLocks.delete(SYNC_LOCK_NAME);
        }
      });
    }
  };

  const navLocks =
    typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (navLocks?.request) {
    return navLocks.request(
      SYNC_LOCK_NAME,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return { acquired: false };
        return runLeaseProtected();
      },
    );
  }

  return runLeaseProtected();
}

async function runBootstrapLoop(input: {
  db: DaisyOfflineDatabase;
  key: CryptoKey;
  fetchFn: FetchLike;
}): Promise<number> {
  let total = 0;
  let cursor: string | undefined;

  for (let pageIndex = 0; pageIndex < 200; pageIndex += 1) {
    const res = await input.fetchFn("/api/sync/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        limit: SYNC_PAGE_MAX_RECORDS,
        ...(cursor ? { cursor } : {}),
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(errBody?.error ?? `Bootstrap failed (${res.status}).`);
    }

    const page = (await res.json()) as SyncBootstrapPageDto;
    await applySyncChangesAtomic(input.db, input.key, {
      changes: page.records,
      watermark: page.watermark,
      nextSyncCursor: page.syncCursor ?? null,
      rebootstrapRequired: false,
    });

    total += page.records.length;
    if (!page.hasMore || !page.cursor) {
      break;
    }
    cursor = page.cursor;
  }

  return total;
}

/**
 * Executes one complete foreground sync pass under single-leader coordination:
 * 1. Push eligible queued operations (with attachment uploads & dependency version binding)
 * 2. Pull incremental deltas (or bootstrap / rebootstrap on 410)
 */
export async function syncOfflineWorkspace(input: {
  db: DaisyOfflineDatabase;
  key: CryptoKey;
  ownerToken: string;
  fetchFn?: FetchLike;
  nowMs?: number;
}): Promise<SyncRunResult> {
  const fetchFn = input.fetchFn ?? fetch;
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  await assertOfflineSchemaCompatible(input.db);

  const leaderRun = await runWithSyncLeader(
    input.db,
    input.ownerToken,
    async () => {
      let pushedCount = 0;
      let appliedCount = 0;
      let needsAttentionCount = 0;
      let pulledCount = 0;
      let rebootstrapped = false;

      // 1. Push pending outbox items before pulling deltas.
      const pendingOps = await input.db.outbox
        .where("status")
        .equals("pending")
        .sortBy("localSequence");

      const allOps = await input.db.outbox.toArray();
      const opStatusMap = new Map<string, OutboxRecord>(
        allOps.map((row) => [row.opId, row]),
      );

      const eligibleEnvelopes: OutboxOperationEnvelope[] = [];
      let approxBytes = 64;

      for (const op of pendingOps) {
        if (op.nextRetryAtMs > nowMs) continue;
        if (eligibleEnvelopes.length >= SYNC_PUSH_MAX_OPS) break;

        // Evaluate dependency states cleanly before submission.
        let blockedByDep: OutboxRecord | null = null;
        let waitingOnPendingDep = false;
        let resolvedPredVersion: number | null = null;

        for (const depOpId of op.dependsOn) {
          const dep = opStatusMap.get(depOpId);
          if (!dep) continue; // Already pruned or satisfied
          if (
            dep.status === "conflict" ||
            dep.status === "rejected" ||
            dep.status === "blocked"
          ) {
            blockedByDep = dep;
            break;
          }
          if (dep.status === "pending" || dep.status === "syncing") {
            waitingOnPendingDep = true;
            break;
          }
          if (dep.status === "applied" && dep.resultingVersion !== null) {
            resolvedPredVersion = dep.resultingVersion;
          }
        }

        if (blockedByDep) {
          const blockedUpdate: Partial<OutboxRecord> = {
            status: "blocked",
            reason: `Blocked by predecessor operation ${blockedByDep.opId} (${blockedByDep.status}).`,
            updatedAt: nowIso,
          };
          await input.db.outbox.update(op.opId, blockedUpdate);
          opStatusMap.set(op.opId, { ...op, ...blockedUpdate });
          needsAttentionCount += 1;
          continue;
        }

        if (waitingOnPendingDep) {
          continue;
        }

        // Upload queued encrypted attachments first (obtaining stable intentIds).
        let uploadedIntentIds: string[] = [];
        if (op.attachmentIds.length > 0) {
          uploadedIntentIds = await uploadQueuedAttachmentsForOp({
            db: input.db,
            key: input.key,
            opId: op.opId,
            fetchFn,
          });
        }

        let envelope = await decryptJsonPayload<OutboxOperationEnvelope>(
          input.key,
          op.encryptedOperation,
        );

        // Bind unsubmitted dependent operations to acknowledged predecessor resultingVersion
        // and inject uploaded attachment intentIds before first submission.
        if (!op.submittedOnce) {
          let changed = false;
          if (
            resolvedPredVersion !== null &&
            envelope.baseVersion !== resolvedPredVersion
          ) {
            envelope = { ...envelope, baseVersion: resolvedPredVersion };
            changed = true;
          }
          if (
            uploadedIntentIds.length > 0 &&
            (op.type === "payment.record" ||
              op.type === "maintenance.create" ||
              op.type === "maintenance.update")
          ) {
            const payloadKey =
              op.type === "payment.record"
                ? "proofIntentIds"
                : "attachmentIntentIds";
            envelope = {
              ...envelope,
              payload: {
                ...envelope.payload,
                [payloadKey]: uploadedIntentIds,
              },
            };
            changed = true;
          }
          if (changed) {
            const reEncrypted = await encryptJsonPayload(input.key, envelope);
            await input.db.outbox.update(op.opId, {
              baseVersion: envelope.baseVersion,
              encryptedOperation: reEncrypted,
              updatedAt: nowIso,
            });
          }
        }

        const opBytes = JSON.stringify(envelope).length;
        if (
          eligibleEnvelopes.length > 0 &&
          approxBytes + opBytes > SYNC_PUSH_MAX_BYTES
        ) {
          break;
        }
        approxBytes += opBytes;
        eligibleEnvelopes.push(envelope);
      }

      if (eligibleEnvelopes.length > 0) {
        const pushRes = await fetchFn("/api/sync/push", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operations: eligibleEnvelopes }),
        });

        if (pushRes.status === 429) {
          const retryHeader = Number(
            pushRes.headers.get("retry-after") ?? "10",
          );
          const retryAfterSeconds = Number.isFinite(retryHeader)
            ? Math.max(1, retryHeader)
            : 10;
          const retryAtMs = nowMs + retryAfterSeconds * 1000;
          await Promise.all(
            eligibleEnvelopes.map((env) =>
              input.db.outbox.update(env.opId, {
                submittedOnce: true,
                nextRetryAtMs: retryAtMs,
                updatedAt: nowIso,
              }),
            ),
          );
          return {
            status: "rate_limited" as const,
            pushedCount: 0,
            appliedCount: 0,
            needsAttentionCount,
            pulledCount: 0,
            rebootstrapped: false,
            retryAfterSeconds,
          };
        }

        if (!pushRes.ok) {
          // Transient 5xx/network error: increment backoff with jitter while preserving opIds.
          await Promise.all(
            eligibleEnvelopes.map(async (env) => {
              const prev = await input.db.outbox.get(env.opId);
              const nextRetry = (prev?.retryCount ?? 0) + 1;
              await input.db.outbox.update(env.opId, {
                submittedOnce: true,
                retryCount: nextRetry,
                nextRetryAtMs: nowMs + computeBackoffMs(nextRetry, nowMs),
                updatedAt: nowIso,
              });
            }),
          );
          throw new Error(`Sync push failed (${pushRes.status}).`);
        }

        const pushBody = (await pushRes.json()) as SyncPushResponseDto;
        pushedCount = pushBody.outcomes.length;

        for (const outcome of pushBody.outcomes) {
          if (outcome.status === "retry" || outcome.retryable) {
            await input.db.outbox.update(outcome.opId, {
              submittedOnce: true,
              nextRetryAtMs: nowMs + computeBackoffMs(0, nowMs),
              updatedAt: nowIso,
            });
            continue;
          }

          if (outcome.status === "applied" || outcome.status === "duplicate") {
            appliedCount += 1;
            await input.db.transaction(
              "rw",
              [dbOutboxTable(input.db), input.db.attachments],
              async () => {
                await input.db.outbox.update(outcome.opId, {
                  status: "applied",
                  submittedOnce: true,
                  reason: outcome.reason,
                  resultingVersion: outcome.resultingVersion,
                  updatedAt: nowIso,
                });
                await input.db.attachments
                  .where("opId")
                  .equals(outcome.opId)
                  .delete();
              },
            );
            continue;
          }

          needsAttentionCount += 1;
          await input.db.outbox.update(outcome.opId, {
            status: outcome.status,
            submittedOnce: true,
            reason: outcome.reason,
            resultingVersion: outcome.resultingVersion,
            updatedAt: nowIso,
          });
        }
      }

      // 2. Pull incremental deltas (or bootstrap if cursor is absent).
      const syncMeta = await input.db.vaultMeta.get("sync");
      const currentCursor =
        syncMeta?.key === "sync" ? syncMeta.syncCursor : null;

      if (!currentCursor) {
        pulledCount += await runBootstrapLoop({
          db: input.db,
          key: input.key,
          fetchFn,
        });
      } else {
        let cursorToUse = currentCursor;
        for (let pageIdx = 0; pageIdx < MAX_PULL_PAGES_PER_RUN; pageIdx += 1) {
          const pullRes = await fetchFn(
            `/api/sync/pull?cursor=${encodeURIComponent(cursorToUse)}&limit=${SYNC_PAGE_MAX_RECORDS}`,
            { cache: "no-store" },
          );

          if (pullRes.status === 410) {
            rebootstrapped = true;
            pulledCount += await runBootstrapLoop({
              db: input.db,
              key: input.key,
              fetchFn,
            });
            break;
          }

          if (!pullRes.ok) {
            throw new Error(`Sync pull failed (${pullRes.status}).`);
          }

          const page = (await pullRes.json()) as SyncPullPageDto;
          await applySyncChangesAtomic(input.db, input.key, {
            changes: page.changes,
            nextSyncCursor: page.nextCursor,
            rebootstrapRequired: false,
            nowIso,
          });

          pulledCount += page.changes.length;
          cursorToUse = page.nextCursor;
          if (!page.hasMore) {
            break;
          }
        }
      }

      return {
        status: "completed" as const,
        pushedCount,
        appliedCount,
        needsAttentionCount,
        pulledCount,
        rebootstrapped,
      };
    },
    nowMs,
  );

  if (!leaderRun.acquired) {
    return {
      status: "already_running",
      pushedCount: 0,
      appliedCount: 0,
      needsAttentionCount: 0,
      pulledCount: 0,
      rebootstrapped: false,
    };
  }

  return leaderRun.result;
}

function dbOutboxTable(db: DaisyOfflineDatabase) {
  return db.outbox;
}
