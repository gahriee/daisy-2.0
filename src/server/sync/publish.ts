import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  ensureOwnerRecord,
  type DatabaseExecutor,
} from "@/server/db/owner-record";

/**
 * Atomically initializes (if absent) and locks the Owner's SyncHead row FOR UPDATE,
 * then allocates and returns the next monotonic sequence number inside the caller's
 * transaction so concurrent commits never publish out of order.
 */
export async function allocateSyncSequence(
  tx: DatabaseExecutor,
  ownerUserId: string,
): Promise<bigint> {
  await ensureOwnerRecord(tx, ownerUserId);

  await tx.$executeRaw`
    INSERT INTO "SyncHead" ("ownerUserId", "lastSequence", "updatedAt")
    VALUES (${ownerUserId}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("ownerUserId") DO NOTHING
  `;

  await tx.$queryRaw<Array<{ lastSequence: bigint }>>`
    SELECT "lastSequence"
    FROM "SyncHead"
    WHERE "ownerUserId" = ${ownerUserId}
    FOR UPDATE
  `;

  const updated = await tx.$queryRaw<Array<{ lastSequence: bigint }>>`
    UPDATE "SyncHead"
    SET "lastSequence" = "lastSequence" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "ownerUserId" = ${ownerUserId}
    RETURNING "lastSequence"
  `;

  const row = updated[0];
  if (!row) {
    throw new Error("SyncHead allocation failed.");
  }
  return row.lastSequence;
}

export type AuditActorType =
  "owner" | "public_visitor" | "scheduled_job" | "sync_device";

export type WriteAuditInput = {
  ownerUserId: string;
  sequence?: bigint | null | undefined;
  area: string;
  action: string;
  actorType: AuditActorType;
  actorId: string;
  entityType: string;
  entityId: string;
  operationId?: string | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
};

/**
 * Writes an identifier-only audit entry inside an active transaction.
 * Never pass personal data (names, emails, phones, addresses, notes) or secrets.
 */
export async function writeAuditEntry(
  tx: DatabaseExecutor,
  input: WriteAuditInput,
): Promise<{ id: string }> {
  await ensureOwnerRecord(tx, input.ownerUserId);

  return tx.auditLog.create({
    data: {
      ownerUserId: input.ownerUserId,
      sequence: input.sequence ?? null,
      area: input.area,
      action: input.action,
      actorType: input.actorType,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      operationId: input.operationId ?? null,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
    select: { id: true },
  });
}

export type AppendChangeFeedInput = {
  ownerUserId: string;
  sequence: bigint;
  entityType: string;
  entityId: string;
  version: number;
  operation: "upsert" | "tombstone";
  payload: Prisma.InputJsonValue;
};

/**
 * Appends a full-record snapshot or tombstone into the Owner's change feed under
 * the SyncHead transaction lock.
 */
export async function appendChangeFeed(
  tx: DatabaseExecutor,
  input: AppendChangeFeedInput,
): Promise<void> {
  await tx.changeFeed.create({
    data: {
      ownerUserId: input.ownerUserId,
      sequence: input.sequence,
      entityType: input.entityType,
      entityId: input.entityId,
      version: input.version,
      operation: input.operation,
      payload: input.payload,
    },
  });
}
