import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { toManilaDate } from "@/lib/dates";
import {
  AllocationConflictError,
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import type { DatabaseExecutor } from "@/server/db/owner-record";
import { isPgConstraintError } from "@/server/db/pg-errors";
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
  type AuditActorType,
} from "@/server/sync/publish";
import {
  AllocationIntervalInputSchema,
  type AllocationDto,
  type AllocationScopeValue,
  type AllocationStatusValue,
  type AllocationTypeValue,
} from "./schemas";

function toAllocationDto(row: {
  id: string;
  roomId: string;
  bedId: string;
  allocationGroupId: string | null;
  scope: AllocationScopeValue;
  type: AllocationTypeValue;
  status: AllocationStatusValue;
  startDate: Date;
  endDate: Date;
  version: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AllocationDto {
  return {
    id: row.id,
    roomId: row.roomId,
    bedId: row.bedId,
    allocationGroupId: row.allocationGroupId,
    scope: row.scope,
    type: row.type,
    status: row.status,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    startDateManila: toManilaDate(row.startDate),
    endDateManila: toManilaDate(row.endDate),
    version: row.version,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Locks requested Room rows and Bed rows in deterministic ascending UUID order
 * inside an active transaction so concurrent bookings and room-level edits cannot deadlock.
 */
export async function lockAllocationResources(
  tx: DatabaseExecutor,
  ownerUserId: string,
  roomIds: string[],
  bedIds: string[],
): Promise<{
  lockedRoomIds: string[];
  lockedBedIds: string[];
}> {
  const uniqueRooms = [...new Set(roomIds)].sort();
  const uniqueBeds = [...new Set(bedIds)].sort();

  const lockedRoomIds: string[] = [];
  for (const roomId of uniqueRooms) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Room"
      WHERE "ownerUserId" = ${ownerUserId} AND "id" = ${roomId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundError("The requested room was not found.");
    }
    lockedRoomIds.push(roomId);
  }

  const lockedBedIds: string[] = [];
  for (const bedId of uniqueBeds) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Bed"
      WHERE "ownerUserId" = ${ownerUserId} AND "id" = ${bedId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundError("The requested bed was not found.");
    }
    lockedBedIds.push(bedId);
  }

  return { lockedRoomIds, lockedBedIds };
}

/**
 * Checks whether any active allocation exists with endDate > asOfUtc for the given room or bed.
 * Used to block soft archival of inventory while active or upcoming stays/holds remain.
 */
export async function hasActiveOrUpcomingAllocations(
  tx: DatabaseExecutor,
  ownerUserId: string,
  target: { roomId?: string; bedId?: string; asOfUtc?: Date },
): Promise<boolean> {
  const asOfUtc = target.asOfUtc ?? new Date();
  const count = await tx.allocation.count({
    where: {
      ownerUserId,
      status: "ACTIVE",
      endDate: { gt: asOfUtc },
      ...(target.roomId ? { roomId: target.roomId } : {}),
      ...(target.bedId ? { bedId: target.bedId } : {}),
    },
  });
  return count > 0;
}

/**
 * Recomputes a bed's live availability status from its allocations covering `asOfUtc`,
 * keeping Bed.status synchronized inside the mutating transaction.
 */
export async function syncBedAvailabilityStatusInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  bedId: string,
  asOfUtc: Date = new Date(),
  options?: { preserveManualMaintenance?: boolean },
): Promise<"AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED"> {
  const bed = await tx.bed.findFirst({
    where: { id: bedId, ownerUserId },
    select: { id: true, status: true, archivedAt: true },
  });
  if (!bed) {
    throw new NotFoundError("The requested bed was not found.");
  }
  if (bed.archivedAt !== null || bed.status === "ARCHIVED") {
    return "ARCHIVED";
  }

  const currentAllocation = await tx.allocation.findFirst({
    where: {
      ownerUserId,
      bedId,
      status: "ACTIVE",
      startDate: { lte: asOfUtc },
      endDate: { gt: asOfUtc },
    },
    select: { type: true },
  });

  let nextStatus: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
  if (currentAllocation) {
    nextStatus =
      currentAllocation.type === "MAINTENANCE_HOLD"
        ? "MAINTENANCE"
        : "OCCUPIED";
  } else if (
    options?.preserveManualMaintenance &&
    bed.status === "MAINTENANCE"
  ) {
    nextStatus = "MAINTENANCE";
  } else {
    nextStatus = "AVAILABLE";
  }

  if (bed.status !== nextStatus) {
    await tx.bed.update({
      where: { id: bed.id },
      data: {
        status: nextStatus,
        version: { increment: 1 },
      },
    });
  }

  return nextStatus;
}

export type CreateAllocationInput = {
  ownerUserId: string;
  actorType?: AuditActorType;
  actorId?: string;
  roomId: string;
  bedId?: string;
  transientReservationId?: string;
  maintenanceRequestId?: string;
  scope: AllocationScopeValue;
  type: AllocationTypeValue;
  startDate: Date;
  endDate: Date;
  notes?: string | null;
  asOfUtc?: Date;
};

/**
 * Creates one (BED) or a room-wide set (WHOLE_ROOM) of active half-open [startDate, endDate)
 * allocations under consistent resource locking and PostgreSQL btree_gist enforcement.
 */
export async function createAllocationInTx(
  tx: DatabaseExecutor,
  input: CreateAllocationInput,
): Promise<AllocationDto[]> {
  const parsed = AllocationIntervalInputSchema.safeParse({
    roomId: input.roomId,
    bedId: input.bedId,
    scope: input.scope,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    notes: input.notes ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check allocation dates and targets.",
    );
  }

  const data = parsed.data;
  const asOfUtc = input.asOfUtc ?? new Date();
  const actorType = input.actorType ?? "owner";
  const actorId = input.actorId ?? input.ownerUserId;

  // Lock parent room first before discovering beds for whole-room claims so no bed can be added mid-claim.
  await lockAllocationResources(tx, input.ownerUserId, [data.roomId], []);

  const room = await tx.room.findFirst({
    where: { id: data.roomId, ownerUserId: input.ownerUserId },
    select: { id: true, archivedAt: true },
  });
  if (!room) {
    throw new NotFoundError("The requested room was not found.");
  }
  if (room.archivedAt !== null) {
    throw new PreconditionError(
      "Restore the room before creating an allocation in it.",
    );
  }

  let targetBeds: Array<{
    id: string;
    status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED";
    archivedAt: Date | null;
  }>;

  if (data.scope === "WHOLE_ROOM") {
    const activeBeds = await tx.bed.findMany({
      where: {
        ownerUserId: input.ownerUserId,
        roomId: data.roomId,
        archivedAt: null,
      },
      orderBy: { id: "asc" },
      select: { id: true, status: true, archivedAt: true },
    });
    if (activeBeds.length === 0) {
      throw new PreconditionError(
        "Add at least one active bed to this room before reserving the whole room.",
      );
    }
    await lockAllocationResources(
      tx,
      input.ownerUserId,
      [],
      activeBeds.map((bed) => bed.id),
    );
    targetBeds = activeBeds;
  } else {
    const bedId = data.bedId!;
    await lockAllocationResources(tx, input.ownerUserId, [], [bedId]);
    const bed = await tx.bed.findFirst({
      where: {
        id: bedId,
        ownerUserId: input.ownerUserId,
        roomId: data.roomId,
      },
      select: { id: true, status: true, archivedAt: true },
    });
    if (!bed) {
      throw new NotFoundError(
        "The selected bed was not found in the selected room.",
      );
    }
    targetBeds = [bed];
  }

  for (const bed of targetBeds) {
    if (bed.archivedAt !== null || bed.status === "ARCHIVED") {
      throw new PreconditionError(
        "Archived beds cannot accept new allocations.",
      );
    }
    if (data.type !== "MAINTENANCE_HOLD" && bed.status === "MAINTENANCE") {
      throw new PreconditionError(
        "Beds under maintenance cannot be allocated until returned to service.",
      );
    }
  }

  const targetBedIds = targetBeds.map((bed) => bed.id);
  const overlapping = await tx.allocation.findFirst({
    where: {
      ownerUserId: input.ownerUserId,
      bedId: { in: targetBedIds },
      status: "ACTIVE",
      startDate: { lt: data.endDate },
      endDate: { gt: data.startDate },
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new AllocationConflictError();
  }

  const allocationGroupId = data.scope === "WHOLE_ROOM" ? randomUUID() : null;
  const createdDtos: AllocationDto[] = [];

  for (const bed of targetBeds) {
    let created;
    try {
      created = await tx.allocation.create({
        data: {
          ownerUserId: input.ownerUserId,
          roomId: data.roomId,
          bedId: bed.id,
          transientReservationId: input.transientReservationId ?? null,
          maintenanceRequestId: input.maintenanceRequestId ?? null,
          allocationGroupId,
          scope: data.scope,
          type: data.type,
          status: "ACTIVE",
          startDate: data.startDate,
          endDate: data.endDate,
          version: 1,
          notes: data.notes,
        },
        select: {
          id: true,
          roomId: true,
          bedId: true,
          allocationGroupId: true,
          scope: true,
          type: true,
          status: true,
          startDate: true,
          endDate: true,
          version: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (
        isPgConstraintError(
          error,
          "23P01",
          "Allocation_active_bed_interval_excl",
        )
      ) {
        throw new AllocationConflictError();
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2004"
      ) {
        throw new AllocationConflictError();
      }
      throw error;
    }

    await syncBedAvailabilityStatusInTx(
      tx,
      input.ownerUserId,
      bed.id,
      asOfUtc,
      {
        preserveManualMaintenance: true,
      },
    );

    const dto = toAllocationDto(created);
    const sequence = await allocateSyncSequence(tx, input.ownerUserId);

    await writeAuditEntry(tx, {
      ownerUserId: input.ownerUserId,
      sequence,
      area: "allocations",
      action: "allocation.created",
      actorType,
      actorId,
      entityType: "allocation",
      entityId: dto.id,
      metadata: {
        roomId: dto.roomId,
        bedId: dto.bedId,
        scope: dto.scope,
        type: dto.type,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });

    await appendChangeFeed(tx, {
      ownerUserId: input.ownerUserId,
      sequence,
      entityType: "allocation",
      entityId: dto.id,
      version: dto.version,
      operation: "upsert",
      payload: dto,
    });

    createdDtos.push(dto);
  }

  return createdDtos;
}

export async function completeAllocationInTx(
  tx: DatabaseExecutor,
  input: {
    ownerUserId: string;
    allocationId: string;
    truncatedEndDate: Date;
    asOfUtc?: Date;
    actorType?: AuditActorType;
    actorId?: string;
  },
): Promise<AllocationDto> {
  const existing = await tx.allocation.findFirst({
    where: { id: input.allocationId, ownerUserId: input.ownerUserId },
    select: {
      id: true,
      roomId: true,
      bedId: true,
      status: true,
      startDate: true,
      version: true,
    },
  });
  if (!existing) {
    throw new NotFoundError("The requested allocation was not found.");
  }
  if (existing.status !== "ACTIVE") {
    throw new ConflictError("Only active allocations can be completed.");
  }
  if (input.truncatedEndDate.getTime() <= existing.startDate.getTime()) {
    throw new ValidationError(
      "Move-out instant must be after the allocation start.",
    );
  }

  await lockAllocationResources(
    tx,
    input.ownerUserId,
    [existing.roomId],
    [existing.bedId],
  );

  const updated = await tx.allocation.updateMany({
    where: {
      id: existing.id,
      ownerUserId: input.ownerUserId,
      version: existing.version,
      status: "ACTIVE",
    },
    data: {
      status: "COMPLETED",
      endDate: input.truncatedEndDate,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new ConflictError(
      "Allocation was modified elsewhere. Reload and try again.",
    );
  }

  const saved = await tx.allocation.findUniqueOrThrow({
    where: { id: existing.id },
    select: {
      id: true,
      roomId: true,
      bedId: true,
      allocationGroupId: true,
      scope: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      version: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await syncBedAvailabilityStatusInTx(
    tx,
    input.ownerUserId,
    existing.bedId,
    input.asOfUtc ?? new Date(),
  );

  const dto = toAllocationDto(saved);
  const sequence = await allocateSyncSequence(tx, input.ownerUserId);

  await writeAuditEntry(tx, {
    ownerUserId: input.ownerUserId,
    sequence,
    area: "allocations",
    action: "allocation.completed",
    actorType: input.actorType ?? "owner",
    actorId: input.actorId ?? input.ownerUserId,
    entityType: "allocation",
    entityId: dto.id,
    metadata: {
      roomId: dto.roomId,
      bedId: dto.bedId,
      endDate: dto.endDate,
    },
  });

  await appendChangeFeed(tx, {
    ownerUserId: input.ownerUserId,
    sequence,
    entityType: "allocation",
    entityId: dto.id,
    version: dto.version,
    operation: "upsert",
    payload: dto,
  });

  return dto;
}

export async function cancelAllocationInTx(
  tx: DatabaseExecutor,
  input: {
    ownerUserId: string;
    allocationId: string;
    asOfUtc?: Date;
    actorType?: AuditActorType;
    actorId?: string;
  },
): Promise<AllocationDto> {
  const existing = await tx.allocation.findFirst({
    where: { id: input.allocationId, ownerUserId: input.ownerUserId },
    select: {
      id: true,
      roomId: true,
      bedId: true,
      status: true,
      version: true,
    },
  });
  if (!existing) {
    throw new NotFoundError("The requested allocation was not found.");
  }
  if (existing.status !== "ACTIVE") {
    throw new ConflictError("Only active allocations can be cancelled.");
  }

  await lockAllocationResources(
    tx,
    input.ownerUserId,
    [existing.roomId],
    [existing.bedId],
  );

  const updated = await tx.allocation.updateMany({
    where: {
      id: existing.id,
      ownerUserId: input.ownerUserId,
      version: existing.version,
      status: "ACTIVE",
    },
    data: {
      status: "CANCELLED",
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new ConflictError(
      "Allocation was modified elsewhere. Reload and try again.",
    );
  }

  const saved = await tx.allocation.findUniqueOrThrow({
    where: { id: existing.id },
    select: {
      id: true,
      roomId: true,
      bedId: true,
      allocationGroupId: true,
      scope: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      version: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await syncBedAvailabilityStatusInTx(
    tx,
    input.ownerUserId,
    existing.bedId,
    input.asOfUtc ?? new Date(),
  );

  const dto = toAllocationDto(saved);
  const sequence = await allocateSyncSequence(tx, input.ownerUserId);

  await writeAuditEntry(tx, {
    ownerUserId: input.ownerUserId,
    sequence,
    area: "allocations",
    action: "allocation.cancelled",
    actorType: input.actorType ?? "owner",
    actorId: input.actorId ?? input.ownerUserId,
    entityType: "allocation",
    entityId: dto.id,
    metadata: {
      roomId: dto.roomId,
      bedId: dto.bedId,
    },
  });

  await appendChangeFeed(tx, {
    ownerUserId: input.ownerUserId,
    sequence,
    entityType: "allocation",
    entityId: dto.id,
    version: dto.version,
    operation: "upsert",
    payload: dto,
  });

  return dto;
}
