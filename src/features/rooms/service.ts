import "server-only";
import type { Prisma } from "@/generated/prisma/client";
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
  applyVerifiedRoomPhotoPlanInTx,
  roomPhotoSelect,
  splitRoomPhotoDtos,
  verifyRoomPhotoManifestForWrite,
  type RoomPhotoRow,
} from "./photos";
import {
  ArchiveRestoreBedSchema,
  ArchiveRestoreRoomSchema,
  CreateBedSchema,
  CreateRoomSchema,
  UpdateBedSchema,
  UpdateRoomSchema,
  type BedDto,
  type BedStatusValue,
  type CreateBedInput,
  type CreateRoomInput,
  type InventoryOverviewDto,
  type RoomBuildingValue,
  type RoomDto,
  type RoomWithBedsDto,
  type UpdateBedInput,
  type UpdateRoomInput,
} from "./schemas";

export const roomSummarySelect = {
  id: true,
  version: true,
  building: true,
  number: true,
  floor: true,
  capacity: true,
  baseMonthlyRate: true,
  transientDailyRate: true,
  isTransientPublished: true,
  transientTitle: true,
  transientDescription: true,
  notes: true,
  photos: {
    orderBy: [
      { role: "asc" },
      { sortOrder: "asc" },
      { updatedAt: "asc" },
    ] as Prisma.RoomPhotoOrderByWithRelationInput[],
    select: roomPhotoSelect,
  },
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function decimalToString(value: { toString(): string }): string {
  return formatMoneyDecimal(parseMoneyDecimal(value.toString()));
}

export function toRoomDto(row: {
  id: string;
  version: number;
  building: RoomBuildingValue;
  number: string;
  floor: string | null;
  capacity: number;
  baseMonthlyRate: { toString(): string } | null;
  transientDailyRate: { toString(): string } | null;
  isTransientPublished: boolean;
  transientTitle?: string | null;
  transientDescription?: string | null;
  notes: string | null;
  photos?: RoomPhotoRow[];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RoomDto {
  const { previewPhoto, galleryPhotos } = splitRoomPhotoDtos(row.photos ?? []);
  return {
    id: row.id,
    version: row.version,
    building: row.building,
    number: row.number,
    floor: row.floor,
    capacity: row.capacity,
    baseMonthlyRate: row.baseMonthlyRate
      ? decimalToString(row.baseMonthlyRate)
      : null,
    transientDailyRate: row.transientDailyRate
      ? decimalToString(row.transientDailyRate)
      : null,
    isTransientPublished: row.isTransientPublished,
    transientTitle: row.transientTitle ?? null,
    transientDescription: row.transientDescription ?? null,
    notes: row.notes,
    previewPhoto,
    galleryPhotos,
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
    monthlyRate: { toString(): string } | null;
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
    monthlyRate: row.monthlyRate ? decimalToString(row.monthlyRate) : null,
    dailyRate: row.dailyRate ? decimalToString(row.dailyRate) : null,
    status: row.status,
    activeAllocationCount: extra?.activeAllocationCount ?? 0,
    currentStaySummary: extra?.currentStaySummary ?? null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getRoomDetail(
  ownerUserId: string,
  roomId: string,
  expectedBuilding?: RoomBuildingValue,
): Promise<(RoomDto & { activeAllocationCount: number }) | null> {
  const db = getDatabase();
  const nowUtc = new Date();

  const [roomRow, activeAllocationCount] = await Promise.all([
    db.room.findFirst({
      where: {
        id: roomId,
        ownerUserId,
        ...(expectedBuilding ? { building: expectedBuilding } : {}),
      },
      select: roomSummarySelect,
    }),
    db.allocation.count({
      where: {
        ownerUserId,
        roomId,
        status: "ACTIVE",
        endDate: { gt: nowUtc },
      },
    }),
  ]);

  if (!roomRow) {
    return null;
  }

  return {
    ...toRoomDto(roomRow),
    activeAllocationCount,
  };
}

export async function listInventoryOverview(
  ownerUserId: string,
  options?: { building?: RoomBuildingValue; asOfUtc?: Date },
): Promise<InventoryOverviewDto> {
  const db = getDatabase();
  const asOfUtc = options?.asOfUtc ?? new Date();
  const building = options?.building;

  const [rooms, activeAllocations] = await Promise.all([
    db.room.findMany({
      where: { ownerUserId, ...(building ? { building } : {}) },
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
        ...(building ? { room: { building } } : {}),
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
        currentStaySummary = `${who}\n${timing}`;
      }

      return toBedDto(
        { ...bed, status: derivedStatus },
        {
          activeAllocationCount: bedAllocations.length,
          currentStaySummary,
        },
      );
    });

    if (room.archivedAt === null && room.beds.length === 0) {
      totalActiveBeds += 1;
      availableBeds += 1;
    }

    return {
      ...toRoomDto(room),
      activeAllocationCount: roomAllocationCount,
      beds: bedDtos,
    };
  });

  return {
    ...(building ? { building } : {}),
    summary: {
      totalRooms: rooms.length,
      activeRooms,
      totalActiveBeds,
      availableBeds,
      occupiedBeds,
      maintenanceBeds,
    },
    rooms: roomDtos,
  };
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
  const photoPlan = await verifyRoomPhotoManifestForWrite({
    ownerUserId,
    roomId: null,
    manifest: input.photos,
  });
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await ensureOwnerRecord(tx, ownerUserId);

      const resolvedMonthlyRate =
        input.building === "BOARDING" ? input.baseMonthlyRate : null;
      const resolvedDailyRate =
        input.building === "TRANSIENT" ? input.transientDailyRate : null;
      if (input.building === "BOARDING" && !resolvedMonthlyRate) {
        throw new ValidationError(
          "Enter a monthly rate for Boarding House rooms.",
        );
      }
      if (input.building === "TRANSIENT" && !resolvedDailyRate) {
        throw new ValidationError(
          "Enter a daily rate for Transient Building rooms.",
        );
      }

      const publishToPublic =
        input.building === "TRANSIENT" && input.isTransientPublished === true;
      if (
        publishToPublic &&
        (!resolvedDailyRate ||
          parseMoneyDecimal(resolvedDailyRate) <= BigInt(0))
      ) {
        throw new PreconditionError(
          "Enter a daily rate greater than ₱0 before publishing this room for public booking.",
        );
      }

      const created = await tx.room.create({
        data: {
          ownerUserId,
          version: 1,
          building: input.building,
          number: input.number,
          floor: input.floor,
          capacity: input.capacity,
          baseMonthlyRate: resolvedMonthlyRate,
          transientDailyRate: resolvedDailyRate,
          isTransientPublished: publishToPublic,
          transientTitle:
            input.building === "TRANSIENT" ? input.transientTitle : null,
          transientDescription:
            input.building === "TRANSIENT" ? input.transientDescription : null,
          notes: input.notes,
        },
        select: roomSummarySelect,
      });

      const photoResult = await applyVerifiedRoomPhotoPlanInTx(tx, {
        ownerUserId,
        roomId: created.id,
        plan: photoPlan,
      });

      const saved = photoResult.changed
        ? await tx.room.findUniqueOrThrow({
            where: { id: created.id },
            select: roomSummarySelect,
          })
        : created;

      const dto = toRoomDto(saved);
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
          capacity: dto.capacity,
          isTransientPublished: dto.isTransientPublished,
          photoCount: (dto.previewPhoto ? 1 : 0) + dto.galleryPhotos.length,
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
      isPgConstraintError(
        error,
        "23505",
        "Room_ownerUserId_building_number_active_key",
      )
    ) {
      throw new ConflictError(
        "An active room with that number already exists in this building.",
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
  const photoPlan = await verifyRoomPhotoManifestForWrite({
    ownerUserId,
    roomId: input.roomId,
    manifest: input.photos,
  });
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await lockAllocationResources(tx, ownerUserId, [input.roomId], []);

      const existing = await tx.room.findFirst({
        where: { id: input.roomId, ownerUserId },
        select: {
          id: true,
          building: true,
          version: true,
          archivedAt: true,
          isTransientPublished: true,
          transientTitle: true,
          transientDescription: true,
        },
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
      if (
        input.building !== undefined &&
        input.building !== existing.building
      ) {
        throw new ValidationError(
          "Room building cannot be changed after creation.",
        );
      }
      if (
        existing.building === "BOARDING" &&
        input.transientDailyRate !== null
      ) {
        throw new ValidationError(
          "Boarding House rooms cannot set a transient daily rate.",
        );
      }
      if (existing.building === "TRANSIENT" && input.baseMonthlyRate !== null) {
        throw new ValidationError(
          "Transient Building rooms cannot set a monthly boarding rate.",
        );
      }
      if (
        existing.building === "BOARDING" &&
        (input.isTransientPublished === true ||
          (input.transientTitle !== undefined &&
            input.transientTitle !== null) ||
          (input.transientDescription !== undefined &&
            input.transientDescription !== null))
      ) {
        throw new ValidationError(
          "Boarding House rooms cannot be published on /book.",
        );
      }
      if (
        existing.building === "BOARDING" &&
        photoPlan &&
        (photoPlan.preview !== null || photoPlan.gallery.length > 0)
      ) {
        throw new PreconditionError(
          "Boarding House rooms do not support public room photos.",
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

      const resolvedMonthlyRate =
        existing.building === "BOARDING" ? input.baseMonthlyRate : null;
      const resolvedDailyRate =
        existing.building === "TRANSIENT" ? input.transientDailyRate : null;
      if (existing.building === "BOARDING" && !resolvedMonthlyRate) {
        throw new ValidationError(
          "Enter a monthly rate for Boarding House rooms.",
        );
      }
      if (existing.building === "TRANSIENT" && !resolvedDailyRate) {
        throw new ValidationError(
          "Enter a daily rate for Transient Building rooms.",
        );
      }

      const nextIsTransientPublished =
        existing.building === "TRANSIENT"
          ? (input.isTransientPublished ?? existing.isTransientPublished)
          : false;
      const nextTransientTitle =
        existing.building === "TRANSIENT"
          ? input.transientTitle === undefined
            ? existing.transientTitle
            : input.transientTitle
          : null;
      const nextTransientDescription =
        existing.building === "TRANSIENT"
          ? input.transientDescription === undefined
            ? existing.transientDescription
            : input.transientDescription
          : null;

      if (
        nextIsTransientPublished &&
        (!resolvedDailyRate ||
          parseMoneyDecimal(resolvedDailyRate) <= BigInt(0))
      ) {
        throw new PreconditionError(
          "Enter a daily rate greater than ₱0 before publishing this room for public booking.",
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
          capacity: input.capacity,
          baseMonthlyRate: resolvedMonthlyRate,
          transientDailyRate: resolvedDailyRate,
          isTransientPublished: nextIsTransientPublished,
          transientTitle: nextTransientTitle,
          transientDescription: nextTransientDescription,
          notes: input.notes,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This room changed elsewhere. Reload and try again.",
        );
      }

      const photoResult = await applyVerifiedRoomPhotoPlanInTx(tx, {
        ownerUserId,
        roomId: existing.id,
        plan: photoPlan,
      });

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
          capacity: dto.capacity,
          isTransientPublished: dto.isTransientPublished,
          photosUpdated: photoResult.changed,
          photoCount: (dto.previewPhoto ? 1 : 0) + dto.galleryPhotos.length,
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
      isPgConstraintError(
        error,
        "23505",
        "Room_ownerUserId_building_number_active_key",
      )
    ) {
      throw new ConflictError(
        "An active room with that number already exists in this building.",
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
      isPgConstraintError(
        error,
        "23505",
        "Room_ownerUserId_building_number_active_key",
      )
    ) {
      throw new ConflictError(
        "An active room with that number already exists in this building.",
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
        select: { id: true, building: true, capacity: true, archivedAt: true },
      });
      if (!room) {
        throw new NotFoundError("The requested room was not found.");
      }
      if (room.archivedAt !== null) {
        throw new PreconditionError("Restore the room before adding a bed.");
      }
      if (room.building === "BOARDING") {
        if (!input.monthlyRate) {
          throw new ValidationError(
            "Enter a monthly rate for Boarding House beds.",
          );
        }
        if (input.dailyRate !== null) {
          throw new ValidationError(
            "Boarding House beds cannot set a daily rate.",
          );
        }
      } else {
        if (!input.dailyRate) {
          throw new ValidationError(
            "Enter a daily rate for Transient Building beds.",
          );
        }
        if (input.monthlyRate !== null) {
          throw new ValidationError(
            "Transient Building beds cannot set a monthly rate.",
          );
        }
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
          room: { select: { building: true } },
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
      if (existing.room.building === "BOARDING") {
        if (!input.monthlyRate) {
          throw new ValidationError(
            "Enter a monthly rate for Boarding House beds.",
          );
        }
        if (input.dailyRate !== null) {
          throw new ValidationError(
            "Boarding House beds cannot set a daily rate.",
          );
        }
      } else {
        if (!input.dailyRate) {
          throw new ValidationError(
            "Enter a daily rate for Transient Building beds.",
          );
        }
        if (input.monthlyRate !== null) {
          throw new ValidationError(
            "Transient Building beds cannot set a monthly rate.",
          );
        }
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

/**
 * Ensures an active room has a backing unit Bed record synced with the room's
 * monthly and transient daily rates so per-room tenant assignments, transient
 * stays, and maintenance holds operate without manual bed configuration.
 */
export async function syncRoomUnitBed(
  ownerUserId: string,
  roomId: string,
): Promise<string | null> {
  const db = getDatabase();

  return db.$transaction(async (tx) => {
    await lockAllocationResources(tx, ownerUserId, [roomId], []);

    const room = await tx.room.findFirst({
      where: { id: roomId, ownerUserId },
      select: {
        id: true,
        building: true,
        number: true,
        baseMonthlyRate: true,
        transientDailyRate: true,
        archivedAt: true,
      },
    });
    if (!room || room.archivedAt !== null) {
      return null;
    }

    const monthlyRate =
      room.building === "BOARDING" && room.baseMonthlyRate
        ? decimalToString(room.baseMonthlyRate)
        : null;
    const dailyRate =
      room.building === "TRANSIENT" && room.transientDailyRate
        ? decimalToString(room.transientDailyRate)
        : null;

    const activeBeds = await tx.bed.findMany({
      where: { ownerUserId, roomId: room.id, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        number: true,
        monthlyRate: true,
        dailyRate: true,
      },
    });

    if (activeBeds.length === 0) {
      const archivedBed = await tx.bed.findFirst({
        where: { ownerUserId, roomId: room.id, archivedAt: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

      if (archivedBed) {
        const restored = await tx.bed.update({
          where: { id: archivedBed.id },
          data: {
            archivedAt: null,
            status: "AVAILABLE",
            number: room.number,
            label: null,
            monthlyRate,
            dailyRate,
            version: { increment: 1 },
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
        const dto = toBedDto(restored);
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
        return dto.id;
      }

      const created = await tx.bed.create({
        data: {
          ownerUserId,
          roomId: room.id,
          version: 1,
          number: room.number,
          label: null,
          monthlyRate,
          dailyRate,
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
      return dto.id;
    }

    for (const bed of activeBeds) {
      const currentMonthly = bed.monthlyRate
        ? decimalToString(bed.monthlyRate)
        : null;
      const currentDaily = bed.dailyRate
        ? decimalToString(bed.dailyRate)
        : null;
      const nextNumber = activeBeds.length === 1 ? room.number : bed.number;

      if (
        currentMonthly === monthlyRate &&
        currentDaily === dailyRate &&
        bed.number === nextNumber
      ) {
        continue;
      }

      const updated = await tx.bed.update({
        where: { id: bed.id },
        data: {
          number: nextNumber,
          monthlyRate,
          dailyRate,
          version: { increment: 1 },
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
      const dto = toBedDto(updated);
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
    }

    return activeBeds[0]?.id ?? null;
  });
}
