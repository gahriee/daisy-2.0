import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { applyMaintenanceSyncOperation } from "@/features/maintenance/sync-handler";
import { applyPaymentSyncOperation } from "@/features/payments/sync-handler";
import {
  SYNC_PAGE_MAX_RECORDS,
  SYNC_PROTOCOL_VERSION,
  SyncBaseEnvelopeSchema,
  SyncBootstrapRequestSchema,
  SyncPullQuerySchema,
  SyncPushRequestSchema,
  type SyncBootstrapPageDto,
  type SyncChangeRecordDto,
  type SyncPullPageDto,
  type SyncPushOperationOutcomeDto,
  type SyncPushResponseDto,
} from "@/features/sync/contracts";
import { applyTenantSyncOperation } from "@/features/tenants/sync-handler";
import { applyTransientSyncOperation } from "@/features/transients/sync-handler";
import {
  ConflictError,
  ForbiddenError,
  PreconditionError,
  RateLimitedError,
  RebootstrapRequiredError,
  ValidationError,
} from "@/lib/errors";
import { lockActiveDeviceForShare } from "@/server/auth/device";
import { getDatabase } from "@/server/db/client";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import {
  signSyncCursor,
  SYNC_BOOTSTRAP_CURSOR_MAX_AGE_MS,
  SYNC_PULL_CURSOR_MAX_AGE_MS,
  verifySyncCursor,
} from "./cursor";

const ZERO = BigInt(0);
const SYNC_PUSH_RATE_MAX = 120;
const SYNC_PUSH_RATE_WINDOW_SECONDS = 60;

type RawBootstrapRow = {
  sequence: string;
  entityType: string;
  entityId: string;
  version: number;
  operation: string;
  payload: unknown;
  occurredAt: Date | string;
};

function serializeChangeRecord(row: {
  sequence: bigint | string;
  entityType: string;
  entityId: string;
  version: number;
  operation: string;
  payload: unknown;
  occurredAt: Date | string;
}): SyncChangeRecordDto {
  return {
    sequence:
      typeof row.sequence === "bigint" ? row.sequence.toString() : row.sequence,
    entityType: row.entityType,
    entityId: row.entityId,
    version: row.version,
    operation: row.operation === "tombstone" ? "tombstone" : "upsert",
    payload: row.payload,
    occurredAt:
      row.occurredAt instanceof Date
        ? row.occurredAt.toISOString()
        : new Date(row.occurredAt).toISOString(),
  };
}

async function consumeSyncPushLimit(ownerUserId: string): Promise<number> {
  const db = getDatabase();
  const prefix = `sync:${ownerUserId}:`;
  const key = `${prefix}push`;

  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "SecurityRateLimit"
      WHERE starts_with("key", ${prefix}) AND "resetsAt" <= CURRENT_TIMESTAMP
    `;
    return tx.$queryRaw<Array<{ count: number; retry: number }>>`
      INSERT INTO "SecurityRateLimit" ("key", "count", "resetsAt")
      VALUES (
        ${key},
        1,
        CURRENT_TIMESTAMP + (${SYNC_PUSH_RATE_WINDOW_SECONDS} * interval '1 second')
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "SecurityRateLimit"."count" + 1
        END,
        "resetsAt" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${SYNC_PUSH_RATE_WINDOW_SECONDS} * interval '1 second')
          ELSE "SecurityRateLimit"."resetsAt"
        END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetsAt" - CURRENT_TIMESTAMP))))::int AS retry
    `;
  });

  const row = rows[0];
  if (!row) {
    throw new Error("Sync push rate limit unavailable");
  }
  return row.count > SYNC_PUSH_RATE_MAX ? row.retry : 0;
}

/**
 * Reconstructs a fixed-watermark Owner snapshot from immutable `ChangeFeed`
 * history (including tombstones and archived entities) in bounded pages of
 * at most 100 records, returning an opaque `syncCursor` once complete.
 */
export async function bootstrapSyncSnapshot(input: {
  ownerUserId: string;
  deviceToken: string | undefined;
  rawBody?: unknown;
  nowMs?: number;
}): Promise<SyncBootstrapPageDto> {
  const parsedBody = SyncBootstrapRequestSchema.safeParse(input.rawBody ?? {});
  if (!parsedBody.success) {
    throw new ValidationError(
      parsedBody.error.issues[0]?.message ?? "Check bootstrap parameters.",
    );
  }

  const pageSize = parsedBody.data.limit ?? SYNC_PAGE_MAX_RECORDS;
  const nowMs = input.nowMs ?? Date.now();
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      const device = await lockActiveDeviceForShare(
        tx,
        input.ownerUserId,
        input.deviceToken,
      );

      let watermark: bigint;
      let afterEntityType: string | null = null;
      let afterEntityId: string | null = null;

      if (parsedBody.data.cursor) {
        const verified = verifySyncCursor(parsedBody.data.cursor, {
          kind: "bootstrap",
          ownerUserId: input.ownerUserId,
          deviceId: device.id,
          nowMs,
        });
        watermark = BigInt(verified.watermark);
        afterEntityType = verified.afterEntityType;
        afterEntityId = verified.afterEntityId;
      } else {
        await ensureOwnerRecord(tx, input.ownerUserId);
        await tx.$executeRaw`
          INSERT INTO "SyncHead" ("ownerUserId", "lastSequence", "updatedAt")
          VALUES (${input.ownerUserId}, 0, CURRENT_TIMESTAMP)
          ON CONFLICT ("ownerUserId") DO NOTHING
        `;
        const head = await tx.syncHead.findUnique({
          where: { ownerUserId: input.ownerUserId },
          select: { lastSequence: true },
        });
        watermark = head?.lastSequence ?? ZERO;
      }

      if (watermark === ZERO) {
        return {
          protocolVersion: SYNC_PROTOCOL_VERSION,
          watermark: "0",
          records: [],
          hasMore: false,
          cursor: null,
          syncCursor: signSyncCursor({
            v: SYNC_PROTOCOL_VERSION,
            kind: "pull",
            ownerUserId: input.ownerUserId,
            deviceId: device.id,
            seq: "0",
            issuedAt: nowMs,
            expiresAt: nowMs + SYNC_PULL_CURSOR_MAX_AGE_MS,
          }),
        };
      }

      const rawRows =
        afterEntityType !== null && afterEntityId !== null
          ? await tx.$queryRaw<RawBootstrapRow[]>`
              WITH latest AS (
                SELECT DISTINCT ON ("entityType", "entityId")
                  "sequence"::text AS "sequence",
                  "entityType",
                  "entityId" AS "entityIdUuid",
                  "version",
                  "operation",
                  "payload",
                  "occurredAt"
                FROM "ChangeFeed"
                WHERE "ownerUserId" = ${input.ownerUserId}
                  AND "sequence" <= ${watermark}
                ORDER BY "entityType" ASC, "entityId" ASC, "sequence" DESC
              )
              SELECT
                "sequence",
                "entityType",
                "entityIdUuid"::text AS "entityId",
                "version",
                "operation",
                "payload",
                "occurredAt"
              FROM latest
              WHERE (
                "entityType" > ${afterEntityType}
                OR (
                  "entityType" = ${afterEntityType}
                  AND "entityIdUuid" > ${afterEntityId}::uuid
                )
              )
              ORDER BY "entityType" ASC, "entityIdUuid" ASC
              LIMIT ${pageSize + 1}
            `
          : await tx.$queryRaw<RawBootstrapRow[]>`
              WITH latest AS (
                SELECT DISTINCT ON ("entityType", "entityId")
                  "sequence"::text AS "sequence",
                  "entityType",
                  "entityId" AS "entityIdUuid",
                  "version",
                  "operation",
                  "payload",
                  "occurredAt"
                FROM "ChangeFeed"
                WHERE "ownerUserId" = ${input.ownerUserId}
                  AND "sequence" <= ${watermark}
                ORDER BY "entityType" ASC, "entityId" ASC, "sequence" DESC
              )
              SELECT
                "sequence",
                "entityType",
                "entityIdUuid"::text AS "entityId",
                "version",
                "operation",
                "payload",
                "occurredAt"
              FROM latest
              ORDER BY "entityType" ASC, "entityIdUuid" ASC
              LIMIT ${pageSize + 1}
            `;

      const hasMore = rawRows.length > pageSize;
      const sliced = hasMore ? rawRows.slice(0, pageSize) : rawRows;
      const records = sliced.map(serializeChangeRecord);

      if (hasMore && records.length > 0) {
        const last = records[records.length - 1]!;
        return {
          protocolVersion: SYNC_PROTOCOL_VERSION,
          watermark: watermark.toString(),
          records,
          hasMore: true,
          cursor: signSyncCursor({
            v: SYNC_PROTOCOL_VERSION,
            kind: "bootstrap",
            ownerUserId: input.ownerUserId,
            deviceId: device.id,
            watermark: watermark.toString(),
            afterEntityType: last.entityType,
            afterEntityId: last.entityId,
            issuedAt: nowMs,
            expiresAt: nowMs + SYNC_BOOTSTRAP_CURSOR_MAX_AGE_MS,
          }),
          syncCursor: null,
        };
      }

      return {
        protocolVersion: SYNC_PROTOCOL_VERSION,
        watermark: watermark.toString(),
        records,
        hasMore: false,
        cursor: null,
        syncCursor: signSyncCursor({
          v: SYNC_PROTOCOL_VERSION,
          kind: "pull",
          ownerUserId: input.ownerUserId,
          deviceId: device.id,
          seq: watermark.toString(),
          issuedAt: nowMs,
          expiresAt: nowMs + SYNC_PULL_CURSOR_MAX_AGE_MS,
        }),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5000,
      timeout: 15000,
    },
  );
}

/**
 * Returns committed `ChangeFeed` records strictly after the verified opaque pull
 * cursor up to the captured `SyncHead` watermark (max 100 entries per page).
 * Rejects tampered, expired, rotated, or history-gapped cursors with 410.
 */
export async function pullSyncChanges(input: {
  ownerUserId: string;
  deviceToken: string | undefined;
  rawQuery: Record<string, unknown>;
  nowMs?: number;
}): Promise<SyncPullPageDto> {
  const parsed = SyncPullQuerySchema.safeParse(input.rawQuery);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check pull cursor parameters.",
    );
  }

  const nowMs = input.nowMs ?? Date.now();
  const pageSize = parsed.data.limit;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      const device = await lockActiveDeviceForShare(
        tx,
        input.ownerUserId,
        input.deviceToken,
      );

      const verified = verifySyncCursor(parsed.data.cursor, {
        kind: "pull",
        ownerUserId: input.ownerUserId,
        deviceId: device.id,
        nowMs,
      });
      const sinceSeq = BigInt(verified.seq);

      const head = await tx.syncHead.findUnique({
        where: { ownerUserId: input.ownerUserId },
        select: { lastSequence: true },
      });

      const headSequence = head?.lastSequence ?? ZERO;
      if (sinceSeq > headSequence) {
        throw new RebootstrapRequiredError(
          "Sync cursor sequence is ahead of server history. Rebootstrap required.",
        );
      }

      const feedRows = await tx.changeFeed.findMany({
        where: {
          ownerUserId: input.ownerUserId,
          sequence: { gt: sinceSeq, lte: headSequence },
        },
        orderBy: { sequence: "asc" },
        take: pageSize + 1,
        select: {
          sequence: true,
          entityType: true,
          entityId: true,
          version: true,
          operation: true,
          payload: true,
          occurredAt: true,
        },
      });

      const hasMore = feedRows.length > pageSize;
      const sliced = hasMore ? feedRows.slice(0, pageSize) : feedRows;
      const changes = sliced.map(serializeChangeRecord);

      const nextSeq = hasMore
        ? sliced[sliced.length - 1]!.sequence
        : headSequence;

      const nextCursor = signSyncCursor({
        v: SYNC_PROTOCOL_VERSION,
        kind: "pull",
        ownerUserId: input.ownerUserId,
        deviceId: device.id,
        seq: nextSeq.toString(),
        issuedAt: nowMs,
        expiresAt: nowMs + SYNC_PULL_CURSOR_MAX_AGE_MS,
      });

      return {
        protocolVersion: SYNC_PROTOCOL_VERSION,
        headSequence: headSequence.toString(),
        changes,
        hasMore,
        nextCursor,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5000,
      timeout: 15000,
    },
  );
}

/**
 * Validates and processes a bounded batch (1–50 ops, <= 1 MB) of offline-queued
 * mutations sequentially in per-operation transactions under active device share
 * lock + SyncHead lock, returning typed per-operation outcomes.
 */
export async function pushSyncOperations(input: {
  ownerUserId: string;
  deviceToken: string | undefined;
  rawBody: unknown;
  asOfUtc?: Date;
}): Promise<SyncPushResponseDto> {
  const parsedBatch = SyncPushRequestSchema.safeParse(input.rawBody);
  if (!parsedBatch.success) {
    throw new ValidationError(
      parsedBatch.error.issues[0]?.message ?? "Check sync push payload.",
    );
  }

  const db = getDatabase();
  const device = await db.$transaction((tx) =>
    lockActiveDeviceForShare(tx, input.ownerUserId, input.deviceToken),
  );

  const retryAfter = await consumeSyncPushLimit(input.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many sync push batches. Wait briefly and retry.",
    );
  }

  const deviceToken = input.deviceToken!;
  const validatedOps = parsedBatch.data.operations.map((rawOp) => {
    const base = SyncBaseEnvelopeSchema.safeParse(rawOp);
    if (!base.success) {
      throw new ValidationError(
        base.error.issues[0]?.message ?? "Invalid sync operation envelope.",
      );
    }
    if (base.data.protocolVersion !== SYNC_PROTOCOL_VERSION) {
      throw new ValidationError(
        `Unsupported sync protocol version (${base.data.protocolVersion}).`,
      );
    }
    if (base.data.deviceId !== device.id) {
      throw new PreconditionError(
        "Operation device ID does not match the active device credential.",
      );
    }
    return { rawOp, base: base.data };
  });

  const outcomes: SyncPushOperationOutcomeDto[] = [];

  for (const { rawOp, base } of validatedOps) {
    try {
      if (base.type.startsWith("tenant.")) {
        const res = await applyTenantSyncOperation({
          ownerUserId: input.ownerUserId,
          deviceToken,
          rawOperation: rawOp,
          ...(input.asOfUtc ? { asOfUtc: input.asOfUtc } : {}),
        });
        outcomes.push({
          opId: res.opId,
          status: res.status,
          reason: res.reason,
          resultingVersion: res.resultingVersion,
          retryable: false,
        });
      } else if (base.type.startsWith("transient_")) {
        const res = await applyTransientSyncOperation({
          ownerUserId: input.ownerUserId,
          deviceToken,
          rawOperation: rawOp,
        });
        outcomes.push({
          opId: res.opId,
          status: res.status,
          reason: res.reason,
          resultingVersion: res.resultingVersion,
          retryable: false,
          ...(res.reservation || res.guest
            ? { entity: res.reservation ?? res.guest }
            : {}),
        });
      } else if (base.type === "payment.record") {
        const res = await applyPaymentSyncOperation({
          ownerUserId: input.ownerUserId,
          deviceToken,
          rawOperation: rawOp,
        });
        outcomes.push({
          opId: res.opId,
          status: res.status,
          reason: res.reason,
          resultingVersion: res.resultingVersion,
          retryable: false,
          ...(res.payment ? { entity: res.payment } : {}),
        });
      } else if (base.type.startsWith("maintenance.")) {
        const res = await applyMaintenanceSyncOperation({
          ownerUserId: input.ownerUserId,
          deviceToken,
          rawOperation: rawOp,
        });
        outcomes.push({
          opId: res.opId,
          status: res.status,
          reason: res.reason,
          resultingVersion: res.resultingVersion,
          retryable: false,
          ...(res.request ? { entity: res.request } : {}),
        });
      } else {
        outcomes.push({
          opId: base.opId,
          status: "rejected",
          reason: `Unsupported sync operation type (${base.type}).`,
          resultingVersion: null,
          retryable: false,
        });
      }
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error;
      }
      if (error instanceof PreconditionError) {
        outcomes.push({
          opId: base.opId,
          status: "retry",
          reason: error.message,
          resultingVersion: null,
          retryable: true,
        });
      } else if (
        error instanceof ValidationError ||
        error instanceof ConflictError
      ) {
        outcomes.push({
          opId: base.opId,
          status: "rejected",
          reason: error.message,
          resultingVersion: null,
          retryable: false,
        });
      } else {
        throw error;
      }
    }
  }

  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    outcomes,
  };
}
