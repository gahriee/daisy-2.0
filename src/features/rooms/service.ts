import "server-only";
import { toManilaDate } from "@/lib/dates";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import { formatMoneyDecimal, parseMoneyDecimal } from "@/lib/money";
import { getDatabase } from "@/server/db/client";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { isPgConstraintError } from "@/server/db/pg-errors";
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
} from "@/server/sync/publish";
import {
  hasActiveOrUpcomingAllocations,
  lockAllocationResources,
} from "@/features/allocations/service";
import {
  ArchiveRestoreBedSchema,
  ArchiveRestoreRoomSchema,
  ArchiveRestoreRoomTypeSchema,
  CreateBedSchema,
  CreateRoomSchema,
  CreateRoomTypeSchema,
  UpdateBedSchema,
  UpdateRoomSchema,
  UpdateRoomTypeSchema,
  type BedDto,
  type BedStatusValue,
  type CreateBedInput,
  type CreateRoomInput,
  type CreateRoomTypeInput,
  type InventoryOverviewDto,
  type RoomDto,
  type RoomTypeDto,
  type RoomWithBedsDto,
  type UpdateBedInput,
  type UpdateRoomInput,
  type UpdateRoomTypeInput,
} from "./schemas";

const roomTypeSelect = {
  id: true,
  version: true,
  name: true,
  monthlyRate: true,
  dailyRate: true,
  description: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      rooms: { where: { archivedAt: null } },
    },
  },
} as const;

const roomSummarySelect = {
  id: true,
  version: true,
  number: true,
  floor: true,
  roomTypeId: true,
  roomType: {
    select: {
      id: true,
      name: true,
      archivedAt: true,
    },
  },
  capacity: true,
  baseMonthlyRate: true,
  transientDailyRate: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function decimalToString(value: { toString(): string }): string {
  return formatMoneyDecimal(parseMoneyDecimal(value.toString()));
}

function toRoomTypeDto(row: {
  id: string;
  version: number;
  name: string;
  monthlyRate: { toString(): string };
  dailyRate: { toString(): string } | null;
  description: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { rooms: number };
}): RoomTypeDto {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    monthlyRate: decimalToString(row.monthlyRate),
    dailyRate: row.dailyRate ? decimalToString(row.dailyRate) : null,
    description: row.description,
    activeRoomCount: row._count?.rooms ?? 0,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRoomDto(row: {
  id: string;
  version: number;
  number: string;
  floor: string | null;
  roomTypeId: string;
  roomType: {
    id: string;
    name: string;
    archivedAt: Date | null;
  };
  capacity: number;
  baseMonthlyRate: { toString(): string };
  transientDailyRate: { toString(): string } | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RoomDto {
  return {
    id: row.id,
    version: row.version,
    number: row.number,
    floor: row.floor,
    roomTypeId: row.roomTypeId,
    roomTypeName: row.roomType.name,
    roomTypeArchived: row.roomType.archivedAt !== null,
    capacity: row.capacity,
    baseMonthlyRate: decimalToString(row.baseMonthlyRate),
    transientDailyRate: row.transientDailyRate
      ? decimalToString(row.transientDailyRate)
      : null,
    notes: row.notes,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toBedDto(
  row: {
    id: string;
    roomId: string;
    version: number;
    number: string;
    label: string | null;
    monthlyRate: { toString(): string };
    dailyRate: { toString(): string } | null;
    status: BedStatusValue;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  extra?: {
    activeAllocationCount?: number;
    currentStaySummary?: string | null;
  },
): BedDto {
  return {
    id: row.id,
    roomId: row.roomId,
    version: row.version,
    number: row.number,
    label: row.label,
    monthlyRate: decimalToString(row.monthlyRate),
    dailyRate: row.dailyRate ? decimalToString(row.dailyRate) : null,
    status: row.status,
    activeAllocationCount: extra?.activeAllocationCount ?? 0,
    currentStaySummary: extra?.currentStaySummary ?? null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listInventoryOverview(
  ownerUserId: string,
  options?: { asOfUtc?: Date },
): Promise<InventoryOverviewDto> {
  const db = getDatabase();
  const asOfUtc = options?.asOfUtc ?? new Date();

  const [roomTypes, rooms, activeAllocations] = await Promise.all([
    db.roomType.findMany({
      where: { ownerUserId },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      select: roomTypeSelect,
    }),
    db.room.findMany({
      where: { ownerUserId },
      orderBy: [{ archivedAt: "asc" }, { number: "asc" }],
      select: {
        ...roomSummarySelect,
        beds: {
          orderBy: [{ archivedAt: "asc" }, { number: "asc" }],
          select: {
            id: true,
            roomId: true,
            version: true,
            number: true,
            label: true,
            monthlyRate: true,
            dailyRate: true,
            status: true,
            archivedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
    db.allocation.findMany({
      where: {
        ownerUserId,
        status: "ACTIVE",
        endDate: { gt: asOfUtc },
      },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        roomId: true,
        bedId: true,
        type: true,
        startDate: true,
        endDate: true,
        tenantAssignment: {
          select: {
            id: true,
            tenant: { select: { fullName: true } },
          },
        },
      },
    }),
  ]);

  const allocationsByBed = new Map<
    string,
    Array<(typeof activeAllocations)[number]>
  >();
  for (const alloc of activeAllocations) {
    const existing = allocationsByBed.get(alloc.bedId) ?? [];
    existing.push(alloc);
    allocationsByBed.set(alloc.bedId, existing);
  }

  let activeRooms = 0;
  let totalActiveBeds = 0;
  let availableBeds = 0;
  let occupiedBeds = 0;
  let maintenanceBeds = 0;

  const roomDtos: RoomWithBedsDto[] = rooms.map((room) => {
    if (room.archivedAt === null) activeRooms += 1;

    let roomAllocationCount = 0;
    const bedDtos: BedDto[] = room.beds.map((bed) => {
      const bedAllocations = allocationsByBed.get(bed.id) ?? [];
      roomAllocationCount += bedAllocations.length;

      const coveringNow =
        bedAllocations.find(
          (a) => a.startDate <= asOfUtc && a.endDate > asOfUtc,
        ) ?? bedAllocations[0];

      let derivedStatus: BedStatusValue = bed.status;
      if (bed.archivedAt !== null) {
        derivedStatus = "ARCHIVED";
      } else if (
        coveringNow &&
        coveringNow.startDate <= asOfUtc &&
        coveringNow.endDate > asOfUtc
      ) {
        derivedStatus =
          coveringNow.type === "MAINTENANCE_HOLD" ? "MAINTENANCE" : "OCCUPIED";
      } else if (bed.status !== "MAINTENANCE") {
        derivedStatus = "AVAILABLE";
      }

      if (bed.archivedAt === null) {
        totalActiveBeds += 1;
        if (derivedStatus === "AVAILABLE") availableBeds += 1;
        else if (derivedStatus === "OCCUPIED") occupiedBeds += 1;
        else if (derivedStatus === "MAINTENANCE") maintenanceBeds += 1;
      }

      let currentStaySummary: string | null = null;
      if (coveringNow) {
        const who = coveringNow.tenantAssignment?.tenant.fullName
          ? coveringNow.tenantAssignment.tenant.fullName
          : coveringNow.type === "MAINTENANCE_HOLD"
            ? "Maintenance hold"
            : "Scheduled booking";
        const timing =
          coveringNow.startDate <= asOfUtc
            ? `Until ${toManilaDate(coveringNow.endDate)}`
            : `Starts ${toManilaDate(coveringNow.startDate)}`;
        currentStaySummary = `${who} · ${timing}`;
      }

      return toBedDto(
        { ...bed, status: derivedStatus },
        {
          activeAllocationCount: bedAllocations.length,
          currentStaySummary,
        },
      );
    });

    return {
      ...toRoomDto(room),
      activeAllocationCount: roomAllocationCount,
      beds: bedDtos,
    };
  });

  return {
    summary: {
      totalRooms: rooms.length,
      activeRooms,
      totalActiveBeds,
      availableBeds,
      occupiedBeds,
      maintenanceBeds,
    },
    roomTypes: roomTypes.map(toRoomTypeDto),
    rooms: roomDtos,
  };
}

type RoomTxClient = Parameters<
  Parameters<ReturnType<typeof getDatabase>["$transaction"]>[0]
>[0];

async function publishRoomTypeChange(
  tx: RoomTxClient,
  ownerUserId: string,
  dto: RoomTypeDto,
  action:
    | "room_type.created"
    | "room_type.updated"
    | "room_type.archived"
    | "room_type.restored",
  operation: "upsert" | "tombstone",
): Promise<void> {
  const sequence = await allocateSyncSequence(tx, ownerUserId);

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "rooms",
    action,
    actorType: "owner",
    actorId: ownerUserId,
    entityType: "room_type",
    entityId: dto.id,
    metadata: { version: dto.version },
  });

  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "room_type",
    entityId: dto.id,
    version: dto.version,
    operation,
    payload: dto,
  });
}

export async function createRoomType(
  ownerUserId: string,
  rawInput: CreateRoomTypeInput,
): Promise<RoomTypeDto> {
  const parsed = CreateRoomTypeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Check room type fields and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await ensureOwnerRecord(tx, ownerUserId);

      const created = await tx.roomType.create({
        data: {
          ownerUserId,
          version: 1,
          name: input.name,
          monthlyRate: input.monthlyRate,
          dailyRate: input.dailyRate,
          description: input.description,
        },
        select: roomTypeSelect,
      });

      const dto = toRoomTypeDto(created);
      await publishRoomTypeChange(
        tx,
        ownerUserId,
        dto,
        "room_type.created",
        "upsert",
      );
      return dto;
    });
  } catch (error) {
    if (
      isPgConstraintError(
        error,
        "23505",
        "RoomType_ownerUserId_name_active_key",
      )
    ) {
      throw new ConflictError(
        "An active room type with that name already exists.",
      );
    }
    throw error;
  }
}

export async function updateRoomType(
  ownerUserId: string,
  rawInput: UpdateRoomTypeInput,
): Promise<RoomTypeDto> {
  const parsed = UpdateRoomTypeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Check room type fields and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.roomType.findFirst({
        where: { id: input.roomTypeId, ownerUserId },
        select: { id: true, version: true, archivedAt: true },
      });
      if (!existing) {
        throw new NotFoundError("The requested room type was not found.");
      }
      if (existing.archivedAt !== null) {
        throw new PreconditionError(
          "Restore this room type before editing it.",
        );
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictError(
          "This room type changed elsewhere. Reload and try again.",
        );
      }

      const updated = await tx.roomType.updateMany({
        where: {
          id: existing.id,
          ownerUserId,
          version: input.expectedVersion,
          archivedAt: null,
        },
        data: {
          version: { increment: 1 },
          name: input.name,
          monthlyRate: input.monthlyRate,
          dailyRate: input.dailyRate,
          description: input.description,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This room type changed elsewhere. Reload and try again.",
        );
      }

      const saved = await tx.roomType.findUniqueOrThrow({
        where: { id: existing.id },
        select: roomTypeSelect,
      });

      const dto = toRoomTypeDto(saved);
      await publishRoomTypeChange(
        tx,
        ownerUserId,
        dto,
        "room_type.updated",
        "upsert",
      );
      return dto;
    });
  } catch (error) {
    if (
      isPgConstraintError(
        error,
        "23505",
        "RoomType_ownerUserId_name_active_key",
      )
    ) {
      throw new ConflictError(
        "An active room type with that name already exists.",
      );
    }
    throw error;
  }
}

export async function archiveRoomType(
  ownerUserId: string,
  rawInput: { roomTypeId: string; expectedVersion: number },
  asOfUtc: Date = new Date(),
): Promise<RoomTypeDto> {
  const parsed = ArchiveRestoreRoomTypeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid room type archive request.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  return db.$transaction(async (tx) => {
    const existing = await tx.roomType.findFirst({
      where: { id: input.roomTypeId, ownerUserId },
      select: { id: true, version: true, archivedAt: true },
    });
    if (!existing) {
      throw new NotFoundError("The requested room type was not found.");
    }
    if (existing.archivedAt !== null) {
      throw new ConflictError("This room type is already archived.");
    }
    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        "This room type changed elsewhere. Reload and try again.",
      );
    }

    const updated = await tx.roomType.updateMany({
      where: {
        id: existing.id,
        ownerUserId,
        version: input.expectedVersion,
        archivedAt: null,
      },
      data: {
        archivedAt: asOfUtc,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "This room type changed elsewhere. Reload and try again.",
      );
    }

    const saved = await tx.roomType.findUniqueOrThrow({
      where: { id: existing.id },
      select: roomTypeSelect,
    });

    const dto = toRoomTypeDto(saved);
    await publishRoomTypeChange(
      tx,
      ownerUserId,
      dto,
      "room_type.archived",
      "tombstone",
    );
    return dto;
  });
}

export async function restoreRoomType(
  ownerUserId: string,
  rawInput: { roomTypeId: string; expectedVersion: number },
): Promise<RoomTypeDto> {
  const parsed = ArchiveRestoreRoomTypeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid room type restore request.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.roomType.findFirst({
        where: { id: input.roomTypeId, ownerUserId },
        select: { id: true, version: true, archivedAt: true },
      });
      if (!existing) {
        throw new NotFoundError("The requested room type was not found.");
      }
      if (existing.archivedAt === null) {
        throw new ConflictError("This room type is already active.");
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictError(
          "This room type changed elsewhere. Reload and try again.",
        );
      }

      const updated = await tx.roomType.updateMany({
        where: {
          id: existing.id,
          ownerUserId,
          version: input.expectedVersion,
        },
        data: {
          archivedAt: null,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This room type changed elsewhere. Reload and try again.",
        );
      }

      const saved = await tx.roomType.findUniqueOrThrow({
        where: { id: existing.id },
        select: roomTypeSelect,
      });

      const dto = toRoomTypeDto(saved);
      await publishRoomTypeChange(
        tx,
        ownerUserId,
        dto,
        "room_type.restored",
        "upsert",
      );
      return dto;
    });
  } catch (error) {
    if (
      isPgConstraintError(
        error,
        "23505",
        "RoomType_ownerUserId_name_active_key",
      )
    ) {
      throw new ConflictError(
        "An active room type with that name already exists.",
      );
    }
    throw error;
  }
}

export async function createRoom(
  ownerUserId: string,
  rawInput: CreateRoomInput,
): Promise<RoomDto> {
  const parsed = CreateRoomSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check room fields and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await ensureOwnerRecord(tx, ownerUserId);

      const roomType = await tx.roomType.findFirst({
        where: { id: input.roomTypeId, ownerUserId },
        select: {
          id: true,
          monthlyRate: true,
          dailyRate: true,
          archivedAt: true,
        },
      });
      if (!roomType) {
        throw new NotFoundError("The selected room type was not found.");
      }
      if (roomType.archivedAt !== null) {
        throw new PreconditionError(
          "Selected room type is archived. Restore it or choose an active room type.",
        );
      }

      const resolvedMonthlyRate =
        input.baseMonthlyRate ?? decimalToString(roomType.monthlyRate);
      const resolvedDailyRate =
        rawInput.transientDailyRate === undefined
          ? roomType.dailyRate
            ? decimalToString(roomType.dailyRate)
            : null
          : input.transientDailyRate;

      const created = await tx.room.create({
        data: {
          ownerUserId,
          version: 1,
          number: input.number,
          floor: input.floor,
          roomTypeId: roomType.id,
          capacity: input.capacity,
          baseMonthlyRate: resolvedMonthlyRate,
          transientDailyRate: resolvedDailyRate,
          notes: input.notes,
        },
        select: roomSummarySelect,
      });

      const dto = toRoomDto(created);
      const sequence = await allocateSyncSequence(tx, ownerUserId);

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "rooms",
        action: "room.created",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "room",
        entityId: dto.id,
        metadata: {
          roomTypeId: dto.roomTypeId,
          capacity: dto.capacity,
        },
      });

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "room",
        entityId: dto.id,
        version: dto.version,
        operation: "upsert",
        payload: dto,
      });

      return dto;
    });
  } catch (error) {
    if (
      isPgConstraintError(error, "23505", "Room_ownerUserId_number_active_key")
    ) {
      throw new ConflictError(
        "An active room with that number already exists.",
      );
    }
    throw error;
  }
}

export async function updateRoom(
  ownerUserId: string,
  rawInput: UpdateRoomInput,
): Promise<RoomDto> {
  const parsed = UpdateRoomSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check room fields and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await lockAllocationResources(tx, ownerUserId, [input.roomId], []);

      const existing = await tx.room.findFirst({
        where: { id: input.roomId, ownerUserId },
        select: { id: true, roomTypeId: true, version: true, archivedAt: true },
      });
      if (!existing) {
        throw new NotFoundError("The requested room was not found.");
      }
      if (existing.archivedAt !== null) {
        throw new PreconditionError("Restore the room before editing it.");
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictError(
          "This room changed elsewhere. Reload and try again.",
        );
      }

      const roomType = await tx.roomType.findFirst({
        where: { id: input.roomTypeId, ownerUserId },
        select: { id: true, archivedAt: true },
      });
      if (!roomType) {
        throw new NotFoundError("The selected room type was not found.");
      }
      if (
        input.roomTypeId !== existing.roomTypeId &&
        roomType.archivedAt !== null
      ) {
        throw new PreconditionError(
          "Selected room type is archived. Restore it or choose an active room type.",
        );
      }

      const activeBedCount = await tx.bed.count({
        where: { ownerUserId, roomId: existing.id, archivedAt: null },
      });
      if (input.capacity < activeBedCount) {
        throw new PreconditionError(
          `Capacity cannot be below the ${activeBedCount} active bed(s) in this room.`,
        );
      }

      const updated = await tx.room.updateMany({
        where: {
          id: existing.id,
          ownerUserId,
          version: input.expectedVersion,
          archivedAt: null,
        },
        data: {
          version: { increment: 1 },
          number: input.number,
          floor: input.floor,
          roomTypeId: roomType.id,
          capacity: input.capacity,
          baseMonthlyRate: input.baseMonthlyRate,
          transientDailyRate: input.transientDailyRate,
          notes: input.notes,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This room changed elsewhere. Reload and try again.",
        );
      }

      const saved = await tx.room.findUniqueOrThrow({
        where: { id: existing.id },
        select: roomSummarySelect,
      });

      const dto = toRoomDto(saved);
      const sequence = await allocateSyncSequence(tx, ownerUserId);

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "rooms",
        action: "room.updated",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "room",
        entityId: dto.id,
        metadata: {
          version: dto.version,
          roomTypeId: dto.roomTypeId,
          capacity: dto.capacity,
        },
      });

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "room",
        entityId: dto.id,
        version: dto.version,
        operation: "upsert",
        payload: dto,
      });

      return dto;
    });
  } catch (error) {
    if (
      isPgConstraintError(error, "23505", "Room_ownerUserId_number_active_key")
    ) {
      throw new ConflictError(
        "An active room with that number already exists.",
      );
    }
    throw error;
  }
}

export async function archiveRoom(
  ownerUserId: string,
  rawInput: { roomId: string; expectedVersion: number },
  asOfUtc: Date = new Date(),
): Promise<RoomDto> {
  const parsed = ArchiveRestoreRoomSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid room archive request.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  return db.$transaction(async (tx) => {
    await lockAllocationResources(tx, ownerUserId, [input.roomId], []);

    const room = await tx.room.findFirst({
      where: { id: input.roomId, ownerUserId },
      select: { id: true, version: true, archivedAt: true },
    });
    if (!room) {
      throw new NotFoundError("The requested room was not found.");
    }
    if (room.archivedAt !== null) {
      throw new ConflictError("This room is already archived.");
    }
    if (room.version !== input.expectedVersion) {
      throw new ConflictError(
        "This room changed elsewhere. Reload and try again.",
      );
    }

    const activeBeds = await tx.bed.findMany({
      where: { ownerUserId, roomId: room.id, archivedAt: null },
      orderBy: { id: "asc" },
      select: { id: true, version: true },
    });
    if (activeBeds.length > 0) {
      await lockAllocationResources(
        tx,
        ownerUserId,
        [],
        activeBeds.map((b) => b.id),
      );
    }

    const blockedByAllocation = await hasActiveOrUpcomingAllocations(
      tx,
      ownerUserId,
      { roomId: room.id, asOfUtc },
    );
    if (blockedByAllocation) {
      throw new ConflictError(
        "Cannot archive this room while it has active or upcoming allocations.",
      );
    }

    const activeAssignmentCount = await tx.tenantAssignment.count({
      where: { ownerUserId, roomId: room.id, status: "ACTIVE" },
    });
    if (activeAssignmentCount > 0) {
      throw new ConflictError(
        "Cannot archive this room while a tenant assignment is active.",
      );
    }

    const now = asOfUtc;
    for (const bed of activeBeds) {
      await tx.bed.update({
        where: { id: bed.id },
        data: {
          archivedAt: now,
          status: "ARCHIVED",
          version: { increment: 1 },
        },
      });
      const archivedBed = await tx.bed.findUniqueOrThrow({
        where: { id: bed.id },
        select: {
          id: true,
          roomId: true,
          version: true,
          number: true,
          label: true,
          monthlyRate: true,
          dailyRate: true,
          status: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const bedDto = toBedDto(archivedBed);
      const bedSeq = await allocateSyncSequence(tx, ownerUserId);
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence: bedSeq,
        area: "rooms",
        action: "bed.archived",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "bed",
        entityId: bedDto.id,
        metadata: { roomId: bedDto.roomId, version: bedDto.version },
      });
      await appendChangeFeed(tx, {
        ownerUserId,
        sequence: bedSeq,
        entityType: "bed",
        entityId: bedDto.id,
        version: bedDto.version,
        operation: "tombstone",
        payload: bedDto,
      });
    }

    const updated = await tx.room.updateMany({
      where: {
        id: room.id,
        ownerUserId,
        version: input.expectedVersion,
        archivedAt: null,
      },
      data: {
        archivedAt: now,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "This room changed elsewhere. Reload and try again.",
      );
    }

    const saved = await tx.room.findUniqueOrThrow({
      where: { id: room.id },
      select: roomSummarySelect,
    });

    const dto = toRoomDto(saved);
    const sequence = await allocateSyncSequence(tx, ownerUserId);

    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "rooms",
      action: "room.archived",
      actorType: "owner",
      actorId: ownerUserId,
      entityType: "room",
      entityId: dto.id,
      metadata: { version: dto.version },
    });

    await appendChangeFeed(tx, {
      ownerUserId,
      sequence,
      entityType: "room",
      entityId: dto.id,
      version: dto.version,
      operation: "tombstone",
      payload: dto,
    });

    return dto;
  });
}

export async function restoreRoom(
  ownerUserId: string,
  rawInput: { roomId: string; expectedVersion: number },
): Promise<RoomDto> {
  const parsed = ArchiveRestoreRoomSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid room restore request.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await lockAllocationResources(tx, ownerUserId, [input.roomId], []);

      const room = await tx.room.findFirst({
        where: { id: input.roomId, ownerUserId },
        select: { id: true, version: true, archivedAt: true },
      });
      if (!room) {
        throw new NotFoundError("The requested room was not found.");
      }
      if (room.archivedAt === null) {
        throw new ConflictError("This room is already active.");
      }
      if (room.version !== input.expectedVersion) {
        throw new ConflictError(
          "This room changed elsewhere. Reload and try again.",
        );
      }

      const updated = await tx.room.updateMany({
        where: {
          id: room.id,
          ownerUserId,
          version: input.expectedVersion,
        },
        data: {
          archivedAt: null,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This room changed elsewhere. Reload and try again.",
        );
      }

      const saved = await tx.room.findUniqueOrThrow({
        where: { id: room.id },
        select: roomSummarySelect,
      });

      const dto = toRoomDto(saved);
      const sequence = await allocateSyncSequence(tx, ownerUserId);

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "rooms",
        action: "room.restored",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "room",
        entityId: dto.id,
        metadata: { version: dto.version },
      });

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "room",
        entityId: dto.id,
        version: dto.version,
        operation: "upsert",
        payload: dto,
      });

      return dto;
    });
  } catch (error) {
    if (
      isPgConstraintError(error, "23505", "Room_ownerUserId_number_active_key")
    ) {
      throw new ConflictError(
        "An active room with that number already exists.",
      );
    }
    throw error;
  }
}

export async function createBed(
  ownerUserId: string,
  rawInput: CreateBedInput,
  asOfUtc: Date = new Date(),
): Promise<BedDto> {
  const parsed = CreateBedSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check bed fields and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await lockAllocationResources(tx, ownerUserId, [input.roomId], []);

      const room = await tx.room.findFirst({
        where: { id: input.roomId, ownerUserId },
        select: { id: true, capacity: true, archivedAt: true },
      });
      if (!room) {
        throw new NotFoundError("The requested room was not found.");
      }
      if (room.archivedAt !== null) {
        throw new PreconditionError("Restore the room before adding a bed.");
      }

      const activeBeds = await tx.bed.count({
        where: { ownerUserId, roomId: room.id, archivedAt: null },
      });
      if (activeBeds >= room.capacity) {
        throw new PreconditionError(
          `Room capacity (${room.capacity}) has been reached. Increase room capacity first.`,
        );
      }

      const activeWholeRoomClaim = await tx.allocation.findFirst({
        where: {
          ownerUserId,
          roomId: room.id,
          scope: "WHOLE_ROOM",
          status: "ACTIVE",
          endDate: { gt: asOfUtc },
        },
        select: { id: true },
      });
      if (activeWholeRoomClaim) {
        throw new ConflictError(
          "Cannot add a bed while a whole-room booking is active or upcoming.",
        );
      }

      const created = await tx.bed.create({
        data: {
          ownerUserId,
          roomId: room.id,
          version: 1,
          number: input.number,
          label: input.label,
          monthlyRate: input.monthlyRate,
          dailyRate: input.dailyRate,
          status: "AVAILABLE",
        },
        select: {
          id: true,
          roomId: true,
          version: true,
          number: true,
          label: true,
          monthlyRate: true,
          dailyRate: true,
          status: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const dto = toBedDto(created);
      const sequence = await allocateSyncSequence(tx, ownerUserId);

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "rooms",
        action: "bed.created",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "bed",
        entityId: dto.id,
        metadata: { roomId: dto.roomId },
      });

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "bed",
        entityId: dto.id,
        version: dto.version,
        operation: "upsert",
        payload: dto,
      });

      return dto;
    });
  } catch (error) {
    if (isPgConstraintError(error, "23505", "Bed_roomId_number_active_key")) {
      throw new ConflictError(
        "An active bed with that number already exists in this room.",
      );
    }
    throw error;
  }
}

export async function updateBed(
  ownerUserId: string,
  rawInput: UpdateBedInput,
  asOfUtc: Date = new Date(),
): Promise<BedDto> {
  const parsed = UpdateBedSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check bed fields and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.bed.findFirst({
        where: { id: input.bedId, ownerUserId },
        select: {
          id: true,
          roomId: true,
          version: true,
          status: true,
          archivedAt: true,
        },
      });
      if (!existing) {
        throw new NotFoundError("The requested bed was not found.");
      }

      await lockAllocationResources(
        tx,
        ownerUserId,
        [existing.roomId],
        [existing.id],
      );

      if (existing.archivedAt !== null) {
        throw new PreconditionError("Restore the bed before editing it.");
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictError(
          "This bed changed elsewhere. Reload and try again.",
        );
      }

      const activeCover = await tx.allocation.findFirst({
        where: {
          ownerUserId,
          bedId: existing.id,
          status: "ACTIVE",
          startDate: { lte: asOfUtc },
          endDate: { gt: asOfUtc },
        },
        select: { type: true },
      });

      if (input.status === "MAINTENANCE") {
        const blocked = await hasActiveOrUpcomingAllocations(tx, ownerUserId, {
          bedId: existing.id,
          asOfUtc,
        });
        if (blocked) {
          throw new ConflictError(
            "Cannot mark this bed under maintenance while active or upcoming allocations exist.",
          );
        }
      }

      const nextStatus: BedStatusValue =
        activeCover && activeCover.type !== "MAINTENANCE_HOLD"
          ? "OCCUPIED"
          : input.status;

      const updated = await tx.bed.updateMany({
        where: {
          id: existing.id,
          ownerUserId,
          version: input.expectedVersion,
          archivedAt: null,
        },
        data: {
          version: { increment: 1 },
          number: input.number,
          label: input.label,
          monthlyRate: input.monthlyRate,
          dailyRate: input.dailyRate,
          status: nextStatus,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This bed changed elsewhere. Reload and try again.",
        );
      }

      const saved = await tx.bed.findUniqueOrThrow({
        where: { id: existing.id },
        select: {
          id: true,
          roomId: true,
          version: true,
          number: true,
          label: true,
          monthlyRate: true,
          dailyRate: true,
          status: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const dto = toBedDto(saved);
      const sequence = await allocateSyncSequence(tx, ownerUserId);

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "rooms",
        action: "bed.updated",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "bed",
        entityId: dto.id,
        metadata: {
          roomId: dto.roomId,
          version: dto.version,
          status: dto.status,
        },
      });

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "bed",
        entityId: dto.id,
        version: dto.version,
        operation: "upsert",
        payload: dto,
      });

      return dto;
    });
  } catch (error) {
    if (isPgConstraintError(error, "23505", "Bed_roomId_number_active_key")) {
      throw new ConflictError(
        "An active bed with that number already exists in this room.",
      );
    }
    throw error;
  }
}

export async function archiveBed(
  ownerUserId: string,
  rawInput: { bedId: string; expectedVersion: number },
  asOfUtc: Date = new Date(),
): Promise<BedDto> {
  const parsed = ArchiveRestoreBedSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid bed archive request.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  return db.$transaction(async (tx) => {
    const existing = await tx.bed.findFirst({
      where: { id: input.bedId, ownerUserId },
      select: { id: true, roomId: true, version: true, archivedAt: true },
    });
    if (!existing) {
      throw new NotFoundError("The requested bed was not found.");
    }

    await lockAllocationResources(
      tx,
      ownerUserId,
      [existing.roomId],
      [existing.id],
    );

    if (existing.archivedAt !== null) {
      throw new ConflictError("This bed is already archived.");
    }
    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        "This bed changed elsewhere. Reload and try again.",
      );
    }

    const blockedByAllocation = await hasActiveOrUpcomingAllocations(
      tx,
      ownerUserId,
      { bedId: existing.id, asOfUtc },
    );
    if (blockedByAllocation) {
      throw new ConflictError(
        "Cannot archive this bed while it has active or upcoming allocations.",
      );
    }

    const activeAssignmentCount = await tx.tenantAssignment.count({
      where: { ownerUserId, bedId: existing.id, status: "ACTIVE" },
    });
    if (activeAssignmentCount > 0) {
      throw new ConflictError(
        "Cannot archive this bed while a tenant assignment is active.",
      );
    }

    const updated = await tx.bed.updateMany({
      where: {
        id: existing.id,
        ownerUserId,
        version: input.expectedVersion,
        archivedAt: null,
      },
      data: {
        archivedAt: asOfUtc,
        status: "ARCHIVED",
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "This bed changed elsewhere. Reload and try again.",
      );
    }

    const saved = await tx.bed.findUniqueOrThrow({
      where: { id: existing.id },
      select: {
        id: true,
        roomId: true,
        version: true,
        number: true,
        label: true,
        monthlyRate: true,
        dailyRate: true,
        status: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const dto = toBedDto(saved);
    const sequence = await allocateSyncSequence(tx, ownerUserId);

    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "rooms",
      action: "bed.archived",
      actorType: "owner",
      actorId: ownerUserId,
      entityType: "bed",
      entityId: dto.id,
      metadata: { roomId: dto.roomId, version: dto.version },
    });

    await appendChangeFeed(tx, {
      ownerUserId,
      sequence,
      entityType: "bed",
      entityId: dto.id,
      version: dto.version,
      operation: "tombstone",
      payload: dto,
    });

    return dto;
  });
}

export async function restoreBed(
  ownerUserId: string,
  rawInput: { bedId: string; expectedVersion: number },
  asOfUtc: Date = new Date(),
): Promise<BedDto> {
  const parsed = ArchiveRestoreBedSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid bed restore request.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.bed.findFirst({
        where: { id: input.bedId, ownerUserId },
        select: { id: true, roomId: true, version: true, archivedAt: true },
      });
      if (!existing) {
        throw new NotFoundError("The requested bed was not found.");
      }

      await lockAllocationResources(
        tx,
        ownerUserId,
        [existing.roomId],
        [existing.id],
      );

      if (existing.archivedAt === null) {
        throw new ConflictError("This bed is already active.");
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictError(
          "This bed changed elsewhere. Reload and try again.",
        );
      }

      const room = await tx.room.findFirst({
        where: { id: existing.roomId, ownerUserId },
        select: { capacity: true, archivedAt: true },
      });
      if (!room || room.archivedAt !== null) {
        throw new PreconditionError(
          "Restore the parent room before restoring this bed.",
        );
      }

      const activeBedCount = await tx.bed.count({
        where: { ownerUserId, roomId: existing.roomId, archivedAt: null },
      });
      if (activeBedCount >= room.capacity) {
        throw new PreconditionError(
          `Room capacity (${room.capacity}) has been reached. Increase room capacity before restoring this bed.`,
        );
      }

      const activeWholeRoomClaim = await tx.allocation.findFirst({
        where: {
          ownerUserId,
          roomId: existing.roomId,
          scope: "WHOLE_ROOM",
          status: "ACTIVE",
          endDate: { gt: asOfUtc },
        },
        select: { id: true },
      });
      if (activeWholeRoomClaim) {
        throw new ConflictError(
          "Cannot restore a bed while a whole-room booking is active or upcoming.",
        );
      }

      const updated = await tx.bed.updateMany({
        where: {
          id: existing.id,
          ownerUserId,
          version: input.expectedVersion,
        },
        data: {
          archivedAt: null,
          status: "AVAILABLE",
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This bed changed elsewhere. Reload and try again.",
        );
      }

      const saved = await tx.bed.findUniqueOrThrow({
        where: { id: existing.id },
        select: {
          id: true,
          roomId: true,
          version: true,
          number: true,
          label: true,
          monthlyRate: true,
          dailyRate: true,
          status: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const dto = toBedDto(saved);
      const sequence = await allocateSyncSequence(tx, ownerUserId);

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "rooms",
        action: "bed.restored",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "bed",
        entityId: dto.id,
        metadata: { roomId: dto.roomId, version: dto.version },
      });

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "bed",
        entityId: dto.id,
        version: dto.version,
        operation: "upsert",
        payload: dto,
      });

      return dto;
    });
  } catch (error) {
    if (isPgConstraintError(error, "23505", "Bed_roomId_number_active_key")) {
      throw new ConflictError(
        "An active bed with that number already exists in this room.",
      );
    }
    throw error;
  }
}
