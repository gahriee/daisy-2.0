import "server-only";
import { getServerOperationalLimits } from "@/config/business-config";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  cancelAllocationInTx,
  completeAllocationInTx,
  createAllocationInTx,
} from "@/features/allocations/service";
import { createTransientStayInvoiceInTx } from "@/features/billing/service";
import {
  applyVerifiedRoomPhotoPlanInTx,
  roomPhotoSelect,
  splitRoomPhotoDtos,
  verifyRoomPhotoManifestForWrite,
} from "@/features/rooms/photos";
import { roomSummarySelect, toRoomDto } from "@/features/rooms/service";
import { manilaDateTimeToUtc } from "@/lib/dates";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import { formatMoneyDecimal, parseMoneyDecimal } from "@/lib/money";
import { getDatabase } from "@/server/db/client";
import {
  ensureOwnerRecord,
  type DatabaseExecutor,
} from "@/server/db/owner-record";
import { isPgConstraintError } from "@/server/db/pg-errors";
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
  type AuditActorType,
} from "@/server/sync/publish";
import {
  computeTransientNights,
  computeTransientStayTotalCentavos,
  computeTransientStayUtcBounds,
  resolveTransientDailyRateCentavos,
} from "./calculations";
import {
  ApproveBookingRequestSchema,
  ArchiveTransientGuestSchema,
  ArchiveTransientReservationSchema,
  CancelTransientReservationSchema,
  CheckInTransientReservationSchema,
  CheckOutTransientReservationSchema,
  CreateTransientGuestSchema,
  CreateTransientReservationSchema,
  CreateTransientStayInvoiceSchema,
  RejectBookingRequestSchema,
  UpdateRoomTransientPublishSchema,
  UpdateTransientGuestSchema,
  UpdateTransientPolicyNoteSchema,
  WithdrawBookingRequestSchema,
  type ApproveBookingRequestInput,
  type ArchiveTransientGuestInput,
  type BookingRequestDetailDto,
  type BookingRequestDto,
  type CancelTransientReservationInput,
  type CheckInTransientReservationInput,
  type CheckOutTransientReservationInput,
  type CreateTransientGuestInput,
  type CreateTransientReservationInput,
  type CreateTransientStayInvoiceInput,
  type GuestSexValue,
  type RejectBookingRequestInput,
  type TransientBedOptionDto,
  type TransientGuestDto,
  type TransientReservationDto,
  type TransientRoomOptionDto,
  type TransientsOverviewDto,
  type UpdateRoomTransientPublishInput,
  type UpdateTransientGuestInput,
  type UpdateTransientPolicyNoteInput,
  type WithdrawBookingRequestInput,
} from "./schemas";

const ZERO = BigInt(0);

function decimalToString(value: { toString(): string }): string {
  return formatMoneyDecimal(parseMoneyDecimal(value.toString()));
}

async function lockSyncHeadForTransients(
  tx: DatabaseExecutor,
  ownerUserId: string,
): Promise<void> {
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
}

export const transientGuestSelect = {
  id: true,
  version: true,
  fullName: true,
  phone: true,
  email: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SelectedGuestRow = {
  id: string;
  version: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toTransientGuestDto(row: SelectedGuestRow): TransientGuestDto {
  return {
    id: row.id,
    version: row.version,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const transientReservationSelect = {
  id: true,
  version: true,
  guestId: true,
  roomId: true,
  bedId: true,
  scope: true,
  checkInDateManila: true,
  checkOutDateManila: true,
  startDate: true,
  endDate: true,
  nights: true,
  partySize: true,
  dailyRate: true,
  totalAmount: true,
  status: true,
  checkedInAt: true,
  checkedOutAt: true,
  cancelledAt: true,
  archivedAt: true,
  notes: true,
  cancellationReason: true,
  createdByActorType: true,
  createdAt: true,
  updatedAt: true,
  guest: { select: { fullName: true, phone: true, email: true } },
  room: {
    select: {
      title: true,
    },
  },
  bed: { select: { number: true } },
  invoices: {
    where: { status: { not: "VOID" as const } },
    take: 1,
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      totalAmount: true,
      paidAmount: true,
    },
  },
} as const;

type SelectedReservationRow = {
  id: string;
  version: number;
  guestId: string;
  roomId: string;
  bedId: string | null;
  scope: "BED" | "WHOLE_ROOM";
  checkInDateManila: string;
  checkOutDateManila: string;
  startDate: Date;
  endDate: Date;
  nights: number;
  partySize: number;
  dailyRate: { toString(): string };
  totalAmount: { toString(): string };
  status: "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  cancelledAt: Date | null;
  archivedAt: Date | null;
  notes: string | null;
  cancellationReason: string | null;
  createdByActorType: string;
  createdAt: Date;
  updatedAt: Date;
  guest: { fullName: string; phone: string | null; email: string | null };
  room: { title: string };
  bed: { number: string } | null;
  invoices: Array<{
    id: string;
    invoiceNumber: string | null;
    status: string;
    totalAmount: { toString(): string };
    paidAmount: { toString(): string };
  }>;
};

export function toTransientReservationDto(
  row: SelectedReservationRow,
): TransientReservationDto {
  const activeInv = row.invoices[0] ?? null;
  const invBalance = activeInv
    ? formatMoneyDecimal(
        parseMoneyDecimal(activeInv.totalAmount.toString()) -
          parseMoneyDecimal(activeInv.paidAmount.toString()),
      )
    : null;
  return {
    id: row.id,
    version: row.version,
    guestId: row.guestId,
    guestName: row.guest.fullName,
    guestPhone: row.guest.phone,
    guestEmail: row.guest.email,
    roomId: row.roomId,
    roomNumber: row.room.title,
    bedId: row.bedId,
    bedNumber: row.bed?.number ?? null,
    scope: row.scope,
    checkInDateManila: row.checkInDateManila,
    checkOutDateManila: row.checkOutDateManila,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    nights: row.nights,
    partySize: row.partySize,
    dailyRate: decimalToString(row.dailyRate),
    totalAmount: decimalToString(row.totalAmount),
    status: row.status,
    checkedInAt: row.checkedInAt ? row.checkedInAt.toISOString() : null,
    checkedOutAt: row.checkedOutAt ? row.checkedOutAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    notes: row.notes,
    cancellationReason: row.cancellationReason,
    activeInvoiceId: activeInv?.id ?? null,
    activeInvoiceNumber: activeInv?.invoiceNumber ?? null,
    activeInvoiceStatus: activeInv?.status ?? null,
    activeInvoiceTotal: activeInv
      ? decimalToString(activeInv.totalAmount)
      : null,
    activeInvoiceBalance: invBalance,
    createdByActorType: row.createdByActorType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const bookingRequestSelect = {
  id: true,
  version: true,
  referenceCode: true,
  roomId: true,
  scope: true,
  guestName: true,
  guestAge: true,
  guestSex: true,
  guestAddress: true,
  guestPhone: true,
  guestEmail: true,
  notes: true,
  checkInDateManila: true,
  checkOutDateManila: true,
  nights: true,
  partySize: true,
  adultsCount: true,
  childrenCount: true,
  quotedDailyRate: true,
  quotedTotalAmount: true,
  privacyConsentAccepted: true,
  status: true,
  rejectionReason: true,
  reviewedAt: true,
  approvedGuestId: true,
  approvedReservationId: true,
  createdAt: true,
  updatedAt: true,
  room: {
    select: {
      title: true,
      transientDailyRate: true,
    },
  },
} as const;

type SelectedBookingRequestRow = {
  id: string;
  version: number;
  referenceCode: string;
  roomId: string;
  scope: "BED" | "WHOLE_ROOM";
  guestName: string;
  guestAge: number | null;
  guestSex: string | null;
  guestAddress: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  notes: string | null;
  checkInDateManila: string;
  checkOutDateManila: string;
  nights: number;
  partySize: number;
  adultsCount: number | null;
  childrenCount: number | null;
  quotedDailyRate: { toString(): string };
  quotedTotalAmount: { toString(): string };
  privacyConsentAccepted: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  rejectionReason: string | null;
  reviewedAt: Date | null;
  approvedGuestId: string | null;
  approvedReservationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  room: {
    title: string;
    transientDailyRate: { toString(): string } | null;
  };
};

function normalizeGuestSex(raw: string | null): GuestSexValue | null {
  return raw === "MALE" || raw === "FEMALE" ? raw : null;
}

export function toBookingRequestDto(
  row: SelectedBookingRequestRow,
): BookingRequestDto {
  const currentRateCentavos = resolveTransientDailyRateCentavos({
    roomDailyRate: row.room.transientDailyRate,
  });
  const quotedCentavos = parseMoneyDecimal(row.quotedDailyRate.toString());
  const currentDailyRate =
    currentRateCentavos > ZERO ? formatMoneyDecimal(currentRateCentavos) : null;
  const rateChangedSinceSubmit =
    row.status === "PENDING" &&
    (currentRateCentavos <= ZERO || currentRateCentavos !== quotedCentavos);

  return {
    id: row.id,
    version: row.version,
    referenceCode: row.referenceCode,
    roomId: row.roomId,
    roomNumber: row.room.title,
    scope: row.scope,
    guestName: row.guestName,
    guestAge: row.guestAge,
    guestSex: normalizeGuestSex(row.guestSex),
    guestAddress: row.guestAddress,
    guestPhone: row.guestPhone,
    guestEmail: row.guestEmail,
    notes: row.notes,
    checkInDateManila: row.checkInDateManila,
    checkOutDateManila: row.checkOutDateManila,
    nights: row.nights,
    partySize: row.partySize,
    adultsCount: row.adultsCount,
    childrenCount: row.childrenCount,
    quotedDailyRate: decimalToString(row.quotedDailyRate),
    quotedTotalAmount: decimalToString(row.quotedTotalAmount),
    currentDailyRate,
    rateChangedSinceSubmit,
    privacyConsentAccepted: row.privacyConsentAccepted,
    status: row.status,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    approvedGuestId: row.approvedGuestId,
    approvedReservationId: row.approvedReservationId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function publishGuestSnapshotInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  dto: TransientGuestDto,
  operation: "upsert" | "tombstone" = "upsert",
): Promise<bigint> {
  const sequence = await allocateSyncSequence(tx, ownerUserId);
  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "transient_guest",
    entityId: dto.id,
    version: dto.version,
    operation,
    payload: dto as unknown as Prisma.InputJsonValue,
  });
  return sequence;
}

async function publishReservationSnapshotInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  dto: TransientReservationDto,
): Promise<bigint> {
  const sequence = await allocateSyncSequence(tx, ownerUserId);
  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "transient_reservation",
    entityId: dto.id,
    version: dto.version,
    operation: "upsert",
    payload: dto as unknown as Prisma.InputJsonValue,
  });
  return sequence;
}

async function publishBookingRequestSnapshotInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  dto: BookingRequestDto,
): Promise<bigint> {
  const sequence = await allocateSyncSequence(tx, ownerUserId);
  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "booking_request",
    entityId: dto.id,
    version: dto.version,
    operation: "upsert",
    payload: dto as unknown as Prisma.InputJsonValue,
  });
  return sequence;
}

async function requireConfiguredStayScheduleInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
): Promise<{ checkInTimeManila: string; checkOutTimeManila: string }> {
  const limits = getServerOperationalLimits();
  const settings = await tx.businessSettings.findUnique({
    where: { ownerUserId },
    select: { checkInTimeManila: true, checkOutTimeManila: true },
  });
  return {
    checkInTimeManila:
      settings?.checkInTimeManila ?? limits.defaultCheckInTimeManila,
    checkOutTimeManila:
      settings?.checkOutTimeManila ?? limits.defaultCheckOutTimeManila,
  };
}

const transientRoomListingSelect = {
  id: true,
  version: true,
  title: true,
  floor: true,
  capacity: true,
  transientDailyRate: true,
  isTransientPublished: true,
  summary: true,
  transientScope: true,
  photos: {
    orderBy: [
      { role: "asc" as const },
      { sortOrder: "asc" as const },
      { updatedAt: "asc" as const },
    ],
    select: roomPhotoSelect,
  },
  beds: {
    where: { archivedAt: null },
    orderBy: [{ number: "asc" as const }],
    select: { id: true, number: true, status: true, archivedAt: true },
  },
};

function toTransientRoomOptionDto(
  room: Prisma.RoomGetPayload<{ select: typeof transientRoomListingSelect }>,
): TransientRoomOptionDto {
  const resolvedCentavos = resolveTransientDailyRateCentavos({
    roomDailyRate: room.transientDailyRate,
  });
  const { previewPhoto, galleryPhotos } = splitRoomPhotoDtos(room.photos);
  return {
    id: room.id,
    version: room.version,
    number: room.title,
    floor: room.floor,
    capacity: room.capacity,
    resolvedDailyRate:
      resolvedCentavos > ZERO ? formatMoneyDecimal(resolvedCentavos) : null,
    isTransientPublished: room.isTransientPublished,
    transientTitle: room.title,
    transientDescription: room.summary,
    transientScope: room.transientScope,
    transientDailyRate: room.transientDailyRate
      ? decimalToString(room.transientDailyRate)
      : null,
    previewPhoto,
    galleryPhotos,
    beds: room.beds.map((bed) => ({
      id: bed.id,
      number: bed.number,
      status: bed.status,
      archivedAt: bed.archivedAt ? bed.archivedAt.toISOString() : null,
    })),
  };
}

export async function getTransientRoomListingDetail(
  ownerUserId: string,
  roomId: string,
): Promise<TransientRoomOptionDto | null> {
  const db = getDatabase();
  const row = await db.room.findFirst({
    where: {
      id: roomId,
      ownerUserId,
      building: "TRANSIENT",
      archivedAt: null,
    },
    select: transientRoomListingSelect,
  });
  return row ? toTransientRoomOptionDto(row) : null;
}

export async function getTransientsOverview(
  ownerUserId: string,
): Promise<TransientsOverviewDto> {
  const db = getDatabase();
  const [settings, requestRows, reservationRows, guestRows, roomRows] =
    await Promise.all([
      db.businessSettings.findUnique({
        where: { ownerUserId },
        select: {
          checkInTimeManila: true,
          checkOutTimeManila: true,
          transientPolicyNote: true,
        },
      }),
      db.bookingRequest.findMany({
        where: { ownerUserId },
        orderBy: [{ createdAt: "desc" }],
        take: 150,
        select: bookingRequestSelect,
      }),
      db.transientReservation.findMany({
        where: { ownerUserId },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 200,
        select: transientReservationSelect,
      }),
      db.transientGuest.findMany({
        where: { ownerUserId },
        orderBy: [{ archivedAt: "asc" }, { fullName: "asc" }],
        take: 200,
        select: transientGuestSelect,
      }),
      db.room.findMany({
        where: { ownerUserId, building: "TRANSIENT", archivedAt: null },
        orderBy: [{ title: "asc" }],
        select: transientRoomListingSelect,
      }),
    ]);

  const requests = requestRows.map(toBookingRequestDto);
  const reservations = reservationRows.map(toTransientReservationDto);
  const guests = guestRows.map(toTransientGuestDto);
  const rooms = roomRows.map(toTransientRoomOptionDto);

  const limits = getServerOperationalLimits();
  return {
    checkInTimeManila:
      settings?.checkInTimeManila ?? limits.defaultCheckInTimeManila,
    checkOutTimeManila:
      settings?.checkOutTimeManila ?? limits.defaultCheckOutTimeManila,
    transientPolicyNote: settings?.transientPolicyNote ?? null,
    totals: {
      pendingRequests: requests.filter((r) => r.status === "PENDING").length,
      confirmedReservations: reservations.filter(
        (r) => r.archivedAt === null && r.status === "CONFIRMED",
      ).length,
      checkedInReservations: reservations.filter(
        (r) => r.archivedAt === null && r.status === "CHECKED_IN",
      ).length,
      archivedReservations: reservations.filter((r) => r.archivedAt !== null)
        .length,
      publishedRooms: rooms.filter((r) => r.isTransientPublished).length,
    },
    requests,
    reservations,
    guests,
    rooms,
  };
}

export async function getBookingRequestDetail(
  ownerUserId: string,
  requestId: string,
): Promise<BookingRequestDetailDto> {
  const db = getDatabase();
  const [settings, row] = await Promise.all([
    db.businessSettings.findUnique({
      where: { ownerUserId },
      select: { checkInTimeManila: true, checkOutTimeManila: true },
    }),
    db.bookingRequest.findFirst({
      where: { id: requestId, ownerUserId },
      select: {
        ...bookingRequestSelect,
        room: {
          select: {
            id: true,
            version: true,
            title: true,
            floor: true,
            capacity: true,
            transientDailyRate: true,
            isTransientPublished: true,
            summary: true,
            transientScope: true,
            photos: {
              orderBy: [
                { role: "asc" },
                { sortOrder: "asc" },
                { updatedAt: "asc" },
              ],
              select: roomPhotoSelect,
            },
            beds: {
              where: { archivedAt: null },
              orderBy: [{ number: "asc" }],
              select: {
                id: true,
                number: true,
                status: true,
                archivedAt: true,
              },
            },
          },
        },
      },
    }),
  ]);
  if (!row) {
    throw new NotFoundError("The requested booking request was not found.");
  }

  const limits = getServerOperationalLimits();
  const checkInTimeManila =
    settings?.checkInTimeManila ?? limits.defaultCheckInTimeManila;
  const checkOutTimeManila =
    settings?.checkOutTimeManila ?? limits.defaultCheckOutTimeManila;
  const { startUtc, endUtc } = computeTransientStayUtcBounds({
    checkInDateManila: row.checkInDateManila,
    checkOutDateManila: row.checkOutDateManila,
    checkInTimeHHmm: checkInTimeManila,
    checkOutTimeHHmm: checkOutTimeManila,
  });

  const conflictingAllocations = await db.allocation.findMany({
    where: {
      ownerUserId,
      roomId: row.roomId,
      status: "ACTIVE",
      startDate: { lt: endUtc },
      endDate: { gt: startUtc },
    },
    select: { bedId: true },
  });
  const blockedBedIds = new Set(conflictingAllocations.map((a) => a.bedId));

  const availableBedsForDates: TransientBedOptionDto[] = row.room.beds
    .filter((bed) => bed.status !== "MAINTENANCE" && !blockedBedIds.has(bed.id))
    .map((bed) => ({
      id: bed.id,
      number: bed.number,
      status: bed.status,
      archivedAt: bed.archivedAt ? bed.archivedAt.toISOString() : null,
    }));

  const wholeRoomAvailableForDates =
    row.room.beds.length > 0 &&
    row.room.beds.every(
      (bed) => bed.status !== "MAINTENANCE" && !blockedBedIds.has(bed.id),
    );

  const matchingWhereOr: Prisma.TransientGuestWhereInput[] = [];
  if (row.guestPhone) matchingWhereOr.push({ phone: row.guestPhone });
  if (row.guestEmail) matchingWhereOr.push({ email: row.guestEmail });

  const matchingGuestRows =
    matchingWhereOr.length > 0
      ? await db.transientGuest.findMany({
          where: {
            ownerUserId,
            archivedAt: null,
            OR: matchingWhereOr,
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 10,
          select: transientGuestSelect,
        })
      : [];

  const resolvedCentavos = resolveTransientDailyRateCentavos({
    roomDailyRate: row.room.transientDailyRate,
  });
  const { previewPhoto, galleryPhotos } = splitRoomPhotoDtos(row.room.photos);

  return {
    request: toBookingRequestDto(row),
    room: {
      id: row.room.id,
      version: row.room.version,
      number: row.room.title,
      floor: row.room.floor,
      capacity: row.room.capacity,
      resolvedDailyRate:
        resolvedCentavos > ZERO ? formatMoneyDecimal(resolvedCentavos) : null,
      isTransientPublished: row.room.isTransientPublished,
      transientTitle: row.room.title,
      transientDescription: row.room.summary,
      transientScope: row.room.transientScope,
      transientDailyRate: row.room.transientDailyRate
        ? decimalToString(row.room.transientDailyRate)
        : null,
      previewPhoto,
      galleryPhotos,
      beds: row.room.beds.map((bed) => ({
        id: bed.id,
        number: bed.number,
        status: bed.status,
        archivedAt: bed.archivedAt ? bed.archivedAt.toISOString() : null,
      })),
    },
    availableBedsForDates,
    wholeRoomAvailableForDates,
    matchingGuests: matchingGuestRows.map(toTransientGuestDto),
    checkInTimeManila: settings?.checkInTimeManila ?? "",
    checkOutTimeManila: settings?.checkOutTimeManila ?? "",
  };
}

export async function updateTransientPolicyNote(
  ownerUserId: string,
  rawInput: UpdateTransientPolicyNoteInput,
): Promise<{ transientPolicyNote: string | null }> {
  const parsed = UpdateTransientPolicyNoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Review the policy note.",
    );
  }
  const db = getDatabase();
  return db.$transaction(
    async (tx) => {
      await ensureOwnerRecord(tx, ownerUserId);
      const existing = await tx.businessSettings.findUnique({
        where: { ownerUserId },
        select: { id: true },
      });
      if (existing) {
        await tx.businessSettings.update({
          where: { ownerUserId },
          data: {
            transientPolicyNote: parsed.data.transientPolicyNote,
            version: { increment: 1 },
          },
        });
      } else {
        await tx.businessSettings.create({
          data: {
            ownerUserId,
            businessName: "",
            transientPolicyNote: parsed.data.transientPolicyNote,
          },
        });
      }
      const sequence = await allocateSyncSequence(tx, ownerUserId);
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "transients",
        action: "transient_policy_note.updated",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "business_settings",
        entityId: ownerUserId,
        metadata: { hasNote: Boolean(parsed.data.transientPolicyNote) },
      });
      return { transientPolicyNote: parsed.data.transientPolicyNote };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function updateRoomTransientPublish(
  ownerUserId: string,
  rawInput: UpdateRoomTransientPublishInput,
): Promise<{ roomId: string; version: number; isTransientPublished: boolean }> {
  const parsed = UpdateRoomTransientPublishSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check public room details.",
    );
  }
  const input = parsed.data;
  const photoPlan = await verifyRoomPhotoManifestForWrite({
    ownerUserId,
    roomId: input.roomId,
    manifest: input.photos,
  });
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: input.roomId, ownerUserId },
        select: {
          id: true,
          building: true,
          version: true,
          archivedAt: true,
          transientDailyRate: true,
        },
      });
      if (!room) {
        throw new NotFoundError("The requested room was not found.");
      }
      if (room.building !== "TRANSIENT") {
        throw new PreconditionError(
          "Only Transient Building rooms can be published for transient bookings.",
        );
      }
      if (room.archivedAt !== null && input.isTransientPublished) {
        throw new PreconditionError(
          "Restore the archived room before publishing it for transients.",
        );
      }
      if (room.version !== input.expectedVersion) {
        throw new ConflictError(
          "This room changed since you loaded it. Reload before updating publishing.",
        );
      }

      const effectiveDailyRateCentavos = resolveTransientDailyRateCentavos({
        roomDailyRate: input.transientDailyRate ?? room.transientDailyRate,
      });
      if (input.isTransientPublished && effectiveDailyRateCentavos <= ZERO) {
        throw new PreconditionError(
          "Set a positive daily rate before publishing this room for public booking.",
        );
      }
      if (input.isTransientPublished) {
        await requireConfiguredStayScheduleInTx(tx, ownerUserId);
      }

      const updated = await tx.room.updateMany({
        where: { id: room.id, ownerUserId, version: input.expectedVersion },
        data: {
          isTransientPublished: input.isTransientPublished,
          ...(input.transientTitle ? { title: input.transientTitle } : {}),
          ...(input.transientDescription !== undefined
            ? { summary: input.transientDescription }
            : {}),
          ...(input.transientScope
            ? { transientScope: input.transientScope }
            : {}),
          ...(input.transientDailyRate !== undefined
            ? { transientDailyRate: input.transientDailyRate }
            : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This room changed concurrently. Reload and try again.",
        );
      }

      const photoResult = await applyVerifiedRoomPhotoPlanInTx(tx, {
        ownerUserId,
        roomId: room.id,
        plan: photoPlan,
      });

      const savedRoom = await tx.room.findUniqueOrThrow({
        where: { id: room.id },
        select: {
          ...roomSummarySelect,
          isTransientPublished: true,
        },
      });
      const roomDto = toRoomDto(savedRoom);

      const sequence = await allocateSyncSequence(tx, ownerUserId);
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "transients",
        action: "room.transient_publish_updated",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "room",
        entityId: savedRoom.id,
        metadata: {
          isTransientPublished: savedRoom.isTransientPublished,
          transientScope: input.transientScope,
          photosUpdated: photoResult.changed,
          photoCount:
            (roomDto.previewPhoto ? 1 : 0) + roomDto.galleryPhotos.length,
          version: savedRoom.version,
        },
      });

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "room",
        entityId: roomDto.id,
        version: roomDto.version,
        operation: "upsert",
        payload: roomDto,
      });

      return {
        roomId: savedRoom.id,
        version: savedRoom.version,
        isTransientPublished: savedRoom.isTransientPublished,
      };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function createTransientGuestInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: CreateTransientGuestInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<TransientGuestDto> {
  const parsed = CreateTransientGuestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check guest details.",
    );
  }
  const input = parsed.data;
  await ensureOwnerRecord(tx, ownerUserId);

  const id = input.id ?? randomUUID();
  const created = await tx.transientGuest.create({
    data: {
      id,
      ownerUserId,
      version: 1,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
    },
    select: transientGuestSelect,
  });

  const dto = toTransientGuestDto(created);
  const sequence = await publishGuestSnapshotInTx(tx, ownerUserId, dto);
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "transients",
    action: "transient_guest.created",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "transient_guest",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: { version: dto.version },
  });
  return dto;
}

export async function createTransientGuest(
  ownerUserId: string,
  rawInput: CreateTransientGuestInput,
): Promise<TransientGuestDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) => createTransientGuestInTx(tx, ownerUserId, rawInput),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function updateTransientGuestInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: UpdateTransientGuestInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<TransientGuestDto> {
  const parsed = UpdateTransientGuestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check guest details.",
    );
  }
  const input = parsed.data;
  const existing = await tx.transientGuest.findFirst({
    where: { id: input.guestId, ownerUserId },
    select: { id: true, version: true },
  });
  if (!existing) {
    throw new NotFoundError("The requested transient guest was not found.");
  }
  if (existing.version !== input.expectedVersion) {
    throw new ConflictError(
      "Guest record changed since you loaded it. Reload before saving.",
    );
  }
  const updated = await tx.transientGuest.updateMany({
    where: {
      id: existing.id,
      ownerUserId,
      version: input.expectedVersion,
    },
    data: {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new ConflictError(
      "Guest record changed concurrently. Reload and try again.",
    );
  }
  const saved = await tx.transientGuest.findUniqueOrThrow({
    where: { id: existing.id },
    select: transientGuestSelect,
  });
  const dto = toTransientGuestDto(saved);
  const sequence = await publishGuestSnapshotInTx(tx, ownerUserId, dto);
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "transients",
    action: "transient_guest.updated",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "transient_guest",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: { version: dto.version },
  });
  return dto;
}

export async function updateTransientGuest(
  ownerUserId: string,
  rawInput: UpdateTransientGuestInput,
): Promise<TransientGuestDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) => updateTransientGuestInTx(tx, ownerUserId, rawInput),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function archiveTransientGuestInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: ArchiveTransientGuestInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<TransientGuestDto> {
  const parsed = ArchiveTransientGuestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid archive request.",
    );
  }
  const { guestId, expectedVersion } = parsed.data;
  const existing = await tx.transientGuest.findFirst({
    where: { id: guestId, ownerUserId },
    select: { id: true, version: true, archivedAt: true },
  });
  if (!existing) {
    throw new NotFoundError("The requested transient guest was not found.");
  }
  if (existing.version !== expectedVersion) {
    throw new ConflictError("Guest record changed since you loaded it.");
  }
  const activeStay = await tx.transientReservation.findFirst({
    where: {
      ownerUserId,
      guestId,
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
    },
    select: { id: true },
  });
  if (activeStay) {
    throw new PreconditionError(
      "Complete or cancel active transient stays before archiving this guest.",
    );
  }
  const updated = await tx.transientGuest.updateMany({
    where: { id: guestId, ownerUserId, version: expectedVersion },
    data: { archivedAt: new Date(), version: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ConflictError("Guest record changed concurrently.");
  }
  const saved = await tx.transientGuest.findUniqueOrThrow({
    where: { id: guestId },
    select: transientGuestSelect,
  });
  const dto = toTransientGuestDto(saved);
  const sequence = await publishGuestSnapshotInTx(
    tx,
    ownerUserId,
    dto,
    "tombstone",
  );
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "transients",
    action: "transient_guest.archived",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "transient_guest",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: { version: dto.version },
  });
  return dto;
}

export async function restoreTransientGuestInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: ArchiveTransientGuestInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<TransientGuestDto> {
  const parsed = ArchiveTransientGuestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid restore request.",
    );
  }
  const { guestId, expectedVersion } = parsed.data;
  const existing = await tx.transientGuest.findFirst({
    where: { id: guestId, ownerUserId },
    select: { id: true, version: true },
  });
  if (!existing) {
    throw new NotFoundError("The requested transient guest was not found.");
  }
  if (existing.version !== expectedVersion) {
    throw new ConflictError("Guest record changed since you loaded it.");
  }
  const updated = await tx.transientGuest.updateMany({
    where: { id: guestId, ownerUserId, version: expectedVersion },
    data: { archivedAt: null, version: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ConflictError("Guest record changed concurrently.");
  }
  const saved = await tx.transientGuest.findUniqueOrThrow({
    where: { id: guestId },
    select: transientGuestSelect,
  });
  const dto = toTransientGuestDto(saved);
  const sequence = await publishGuestSnapshotInTx(
    tx,
    ownerUserId,
    dto,
    "upsert",
  );
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "transients",
    action: "transient_guest.restored",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "transient_guest",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: { version: dto.version },
  });
  return dto;
}

export async function createTransientReservationInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: CreateTransientReservationInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<TransientReservationDto> {
  const parsed = CreateTransientReservationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check reservation details.",
    );
  }
  const input = parsed.data;

  const [guest, room, schedule] = await Promise.all([
    tx.transientGuest.findFirst({
      where: { id: input.guestId, ownerUserId },
      select: { id: true, archivedAt: true },
    }),
    tx.room.findFirst({
      where: { id: input.roomId, ownerUserId },
      select: {
        id: true,
        building: true,
        capacity: true,
        archivedAt: true,
        transientDailyRate: true,
      },
    }),
    requireConfiguredStayScheduleInTx(tx, ownerUserId),
  ]);

  if (!guest) {
    throw new NotFoundError("The selected transient guest was not found.");
  }
  if (guest.archivedAt !== null) {
    throw new PreconditionError(
      "Restore this archived guest before creating a stay.",
    );
  }
  if (!room) {
    throw new NotFoundError("The selected room was not found.");
  }
  if (room.building !== "TRANSIENT") {
    throw new PreconditionError(
      "Only Transient Building rooms can be booked for transient stays.",
    );
  }
  if (room.archivedAt !== null) {
    throw new PreconditionError(
      "Restore this archived room before booking a transient stay.",
    );
  }

  const nights = computeTransientNights(
    input.checkInDateManila,
    input.checkOutDateManila,
  );
  if (nights < 1) {
    throw new ValidationError("Check-out date must be after check-in date.");
  }
  if (input.scope === "BED" && input.partySize > 1) {
    throw new ValidationError(
      "Per-bed stays accommodate 1 guest per bed; choose Whole room for groups.",
    );
  }
  if (input.scope === "WHOLE_ROOM" && input.partySize > room.capacity) {
    throw new ValidationError(
      `Party size (${input.partySize}) exceeds Room capacity (${room.capacity}).`,
    );
  }

  const dailyRateCentavos = input.dailyRateOverride
    ? parseMoneyDecimal(input.dailyRateOverride)
    : resolveTransientDailyRateCentavos({
        roomDailyRate: room.transientDailyRate,
      });
  if (dailyRateCentavos <= ZERO) {
    throw new PreconditionError(
      "Set a positive daily rate on the room before booking a stay.",
    );
  }
  const totalCentavos = computeTransientStayTotalCentavos(
    dailyRateCentavos,
    nights,
  );

  const { startUtc, endUtc } = computeTransientStayUtcBounds({
    checkInDateManila: input.checkInDateManila,
    checkOutDateManila: input.checkOutDateManila,
    checkInTimeHHmm: schedule.checkInTimeManila,
    checkOutTimeHHmm: schedule.checkOutTimeManila,
  });

  const reservationId = input.id ?? randomUUID();
  const status = "CONFIRMED" as const;

  try {
    await tx.transientReservation.create({
      data: {
        id: reservationId,
        ownerUserId,
        version: 1,
        guestId: guest.id,
        roomId: room.id,
        bedId: input.bedId,
        scope: input.scope,
        checkInDateManila: input.checkInDateManila,
        checkOutDateManila: input.checkOutDateManila,
        startDate: startUtc,
        endDate: endUtc,
        nights,
        partySize: input.partySize,
        dailyRate: formatMoneyDecimal(dailyRateCentavos),
        totalAmount: formatMoneyDecimal(totalCentavos),
        status,
        notes: input.notes,
        createdByActorType: actor.actorType,
        createdByActorId: actor.actorId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isPgConstraintError(error, "23505")) {
      throw new ConflictError("A stay with this identifier already exists.");
    }
    throw error;
  }

  const allocations = await createAllocationInTx(tx, {
    ownerUserId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    roomId: room.id,
    ...(input.bedId ? { bedId: input.bedId } : {}),
    transientReservationId: reservationId,
    scope: input.scope,
    type: "TRANSIENT_RESERVATION",
    startDate: startUtc,
    endDate: endUtc,
    notes: input.notes,
  });

  const allocationGroupId = allocations[0]?.allocationGroupId ?? null;
  if (allocationGroupId) {
    await tx.transientReservation.update({
      where: { id: reservationId },
      data: { allocationGroupId },
      select: { id: true },
    });
  }

  if (input.issueInvoiceImmediately) {
    await createTransientStayInvoiceInTx(
      tx,
      ownerUserId,
      {
        transientReservationId: reservationId,
        dueDateManila: input.checkInDateManila,
        issueImmediately: true,
        notes: input.notes,
      },
      actor,
    );
  }

  const saved = await tx.transientReservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: transientReservationSelect,
  });
  const dto = toTransientReservationDto(saved);
  const sequence = await publishReservationSnapshotInTx(tx, ownerUserId, dto);
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "transients",
    action: "transient_reservation.created",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "transient_reservation",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: {
      guestId: dto.guestId,
      roomId: dto.roomId,
      bedId: dto.bedId,
      scope: dto.scope,
      status: dto.status,
      nights: dto.nights,
      totalAmount: dto.totalAmount,
      version: dto.version,
    },
  });
  return dto;
}

export async function createTransientReservation(
  ownerUserId: string,
  rawInput: CreateTransientReservationInput,
): Promise<TransientReservationDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForTransients(tx, ownerUserId);
      return createTransientReservationInTx(tx, ownerUserId, rawInput);
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function checkInTransientReservationInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: CheckInTransientReservationInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<TransientReservationDto> {
  const parsed = CheckInTransientReservationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid check-in request.",
    );
  }
  const { reservationId, expectedVersion } = parsed.data;
  const existing = await tx.transientReservation.findFirst({
    where: { id: reservationId, ownerUserId },
    select: { id: true, version: true, status: true },
  });
  if (!existing) {
    throw new NotFoundError("The requested transient stay was not found.");
  }
  if (existing.version !== expectedVersion) {
    throw new ConflictError(
      "This stay changed since you loaded it. Reload before checking in.",
    );
  }
  if (existing.status !== "CONFIRMED") {
    throw new PreconditionError("Only confirmed reservations can check in.");
  }

  const nowUtc = new Date();
  const updated = await tx.transientReservation.updateMany({
    where: {
      id: reservationId,
      ownerUserId,
      version: expectedVersion,
      status: "CONFIRMED",
    },
    data: {
      status: "CHECKED_IN",
      checkedInAt: nowUtc,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new ConflictError("Stay state changed concurrently.");
  }

  const saved = await tx.transientReservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: transientReservationSelect,
  });
  const dto = toTransientReservationDto(saved);
  const sequence = await publishReservationSnapshotInTx(tx, ownerUserId, dto);
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "transients",
    action: "transient_reservation.checked_in",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "transient_reservation",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: { version: dto.version },
  });
  return dto;
}

export async function checkInTransientReservation(
  ownerUserId: string,
  rawInput: CheckInTransientReservationInput,
): Promise<TransientReservationDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) => checkInTransientReservationInTx(tx, ownerUserId, rawInput),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function checkOutTransientReservationInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: CheckOutTransientReservationInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<TransientReservationDto> {
  const parsed = CheckOutTransientReservationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid check-out request.",
    );
  }
  const { reservationId, expectedVersion, actualCheckOutDateManila } =
    parsed.data;

  const existing = await tx.transientReservation.findFirst({
    where: { id: reservationId, ownerUserId },
    select: {
      id: true,
      version: true,
      status: true,
      startDate: true,
      endDate: true,
      allocations: {
        where: { status: "ACTIVE" },
        orderBy: [{ id: "asc" }],
        select: { id: true },
      },
    },
  });
  if (!existing) {
    throw new NotFoundError("The requested transient stay was not found.");
  }
  if (existing.version !== expectedVersion) {
    throw new ConflictError(
      "This stay changed since you loaded it. Reload before checking out.",
    );
  }
  if (existing.status !== "CHECKED_IN") {
    throw new PreconditionError("Only checked-in stays can check out.");
  }

  const nowUtc = new Date();
  let candidateEndUtc = nowUtc;
  if (actualCheckOutDateManila) {
    const limits = getServerOperationalLimits();
    const settings = await tx.businessSettings.findUnique({
      where: { ownerUserId },
      select: { checkOutTimeManila: true },
    });
    candidateEndUtc = manilaDateTimeToUtc(
      actualCheckOutDateManila,
      settings?.checkOutTimeManila ?? limits.defaultCheckOutTimeManila,
    );
  }

  // Clamp truncatedEndDate strictly inside (startDate, endDate] so early or same-day check-out succeeds cleanly.
  const minAfterStart = new Date(existing.startDate.getTime() + 60_000);
  const clampedAfterStart =
    candidateEndUtc.getTime() > existing.startDate.getTime()
      ? candidateEndUtc
      : minAfterStart;
  const truncatedEndDate =
    clampedAfterStart.getTime() <= existing.endDate.getTime()
      ? clampedAfterStart
      : existing.endDate;

  for (const alloc of existing.allocations) {
    await completeAllocationInTx(tx, {
      ownerUserId,
      allocationId: alloc.id,
      truncatedEndDate,
      asOfUtc: nowUtc,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
  }

  const updated = await tx.transientReservation.updateMany({
    where: {
      id: reservationId,
      ownerUserId,
      version: expectedVersion,
      status: "CHECKED_IN",
    },
    data: {
      status: "CHECKED_OUT",
      checkedOutAt: nowUtc,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new ConflictError("Stay state changed concurrently.");
  }

  const saved = await tx.transientReservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: transientReservationSelect,
  });
  const dto = toTransientReservationDto(saved);
  const sequence = await publishReservationSnapshotInTx(tx, ownerUserId, dto);
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "transients",
    action: "transient_reservation.checked_out",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "transient_reservation",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: { version: dto.version },
  });
  return dto;
}

export async function checkOutTransientReservation(
  ownerUserId: string,
  rawInput: CheckOutTransientReservationInput,
): Promise<TransientReservationDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) => checkOutTransientReservationInTx(tx, ownerUserId, rawInput),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

async function releaseReservationInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: CancelTransientReservationInput,
  targetStatus: "CANCELLED" | "NO_SHOW",
): Promise<TransientReservationDto> {
  const parsed = CancelTransientReservationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid reservation update.",
    );
  }
  const { reservationId, expectedVersion, reason } = parsed.data;
  const existing = await tx.transientReservation.findFirst({
    where: { id: reservationId, ownerUserId },
    select: {
      id: true,
      version: true,
      status: true,
      allocations: {
        where: { status: "ACTIVE" },
        orderBy: [{ id: "asc" }],
        select: { id: true },
      },
    },
  });
  if (!existing) {
    throw new NotFoundError("The requested transient stay was not found.");
  }
  if (existing.version !== expectedVersion) {
    throw new ConflictError("This stay changed since you loaded it.");
  }
  if (existing.status !== "CONFIRMED") {
    throw new PreconditionError(
      "Only upcoming confirmed stays can be cancelled or marked no-show.",
    );
  }

  const nowUtc = new Date();
  for (const alloc of existing.allocations) {
    await cancelAllocationInTx(tx, {
      ownerUserId,
      allocationId: alloc.id,
      asOfUtc: nowUtc,
      actorType: "owner",
      actorId: ownerUserId,
    });
  }

  const updated = await tx.transientReservation.updateMany({
    where: {
      id: reservationId,
      ownerUserId,
      version: expectedVersion,
      status: "CONFIRMED",
    },
    data: {
      status: targetStatus,
      cancelledAt: nowUtc,
      cancellationReason: reason,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new ConflictError("Stay state changed concurrently.");
  }

  const saved = await tx.transientReservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: transientReservationSelect,
  });
  const dto = toTransientReservationDto(saved);
  const sequence = await publishReservationSnapshotInTx(tx, ownerUserId, dto);
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "transients",
    action:
      targetStatus === "NO_SHOW"
        ? "transient_reservation.no_show"
        : "transient_reservation.cancelled",
    actorType: "owner",
    actorId: ownerUserId,
    entityType: "transient_reservation",
    entityId: dto.id,
    metadata: { version: dto.version },
  });
  return dto;
}

export async function archiveTransientReservation(
  ownerUserId: string,
  rawInput: { reservationId: string; expectedVersion: number },
): Promise<TransientReservationDto> {
  const parsed = ArchiveTransientReservationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Select a valid stay to archive.",
    );
  }
  const { reservationId, expectedVersion } = parsed.data;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      const existing = await tx.transientReservation.findFirst({
        where: { id: reservationId, ownerUserId },
        select: { id: true, version: true, status: true, archivedAt: true },
      });
      if (!existing) {
        throw new NotFoundError("The requested transient stay was not found.");
      }
      if (existing.version !== expectedVersion) {
        throw new ConflictError("This stay changed since you loaded it.");
      }
      if (existing.archivedAt !== null) {
        throw new PreconditionError("This stay is already archived.");
      }
      if (existing.status === "CHECKED_IN" || existing.status === "CONFIRMED") {
        throw new PreconditionError(
          "Check out or cancel this stay before archiving.",
        );
      }

      const nowUtc = new Date();
      const updated = await tx.transientReservation.updateMany({
        where: {
          id: reservationId,
          ownerUserId,
          version: expectedVersion,
          archivedAt: null,
        },
        data: {
          archivedAt: nowUtc,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError("Stay state changed concurrently.");
      }

      const saved = await tx.transientReservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: transientReservationSelect,
      });
      const dto = toTransientReservationDto(saved);
      const sequence = await publishReservationSnapshotInTx(
        tx,
        ownerUserId,
        dto,
      );
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "transients",
        action: "transient_reservation.archived",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "transient_reservation",
        entityId: dto.id,
        metadata: { version: dto.version },
      });
      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function restoreTransientReservation(
  ownerUserId: string,
  rawInput: { reservationId: string; expectedVersion: number },
): Promise<TransientReservationDto> {
  const parsed = ArchiveTransientReservationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Select a valid stay to restore.",
    );
  }
  const { reservationId, expectedVersion } = parsed.data;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      const existing = await tx.transientReservation.findFirst({
        where: { id: reservationId, ownerUserId },
        select: { id: true, version: true, archivedAt: true },
      });
      if (!existing) {
        throw new NotFoundError("The requested transient stay was not found.");
      }
      if (existing.version !== expectedVersion) {
        throw new ConflictError("This stay changed since you loaded it.");
      }
      if (existing.archivedAt === null) {
        throw new PreconditionError("This stay is already active.");
      }

      const updated = await tx.transientReservation.updateMany({
        where: {
          id: reservationId,
          ownerUserId,
          version: expectedVersion,
          archivedAt: { not: null },
        },
        data: {
          archivedAt: null,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError("Stay state changed concurrently.");
      }

      const saved = await tx.transientReservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: transientReservationSelect,
      });
      const dto = toTransientReservationDto(saved);
      const sequence = await publishReservationSnapshotInTx(
        tx,
        ownerUserId,
        dto,
      );
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "transients",
        action: "transient_reservation.restored",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "transient_reservation",
        entityId: dto.id,
        metadata: { version: dto.version },
      });
      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function cancelTransientReservation(
  ownerUserId: string,
  rawInput: CancelTransientReservationInput,
): Promise<TransientReservationDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) =>
      releaseReservationInTx(tx, ownerUserId, rawInput, "CANCELLED"),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function markNoShowTransientReservation(
  ownerUserId: string,
  rawInput: CancelTransientReservationInput,
): Promise<TransientReservationDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) => releaseReservationInTx(tx, ownerUserId, rawInput, "NO_SHOW"),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function createTransientStayInvoice(
  ownerUserId: string,
  rawInput: CreateTransientStayInvoiceInput,
) {
  const parsed = CreateTransientStayInvoiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid stay invoice request.",
    );
  }
  const db = getDatabase();
  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForTransients(tx, ownerUserId);
      return createTransientStayInvoiceInTx(tx, ownerUserId, {
        transientReservationId: parsed.data.reservationId,
        ...(parsed.data.dueDateManila
          ? { dueDateManila: parsed.data.dueDateManila }
          : {}),
        issueImmediately: parsed.data.issueImmediately,
        notes: parsed.data.notes,
      });
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function approveBookingRequest(
  ownerUserId: string,
  rawInput: ApproveBookingRequestInput,
): Promise<{
  request: BookingRequestDto;
  reservation: TransientReservationDto;
}> {
  const parsed = ApproveBookingRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check approval details.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForTransients(tx, ownerUserId);

      const request = await tx.bookingRequest.findFirst({
        where: { id: input.requestId, ownerUserId },
        select: {
          id: true,
          version: true,
          status: true,
          roomId: true,
          scope: true,
          guestName: true,
          guestAge: true,
          guestSex: true,
          guestAddress: true,
          guestPhone: true,
          guestEmail: true,
          notes: true,
          checkInDateManila: true,
          checkOutDateManila: true,
          partySize: true,
          adultsCount: true,
          childrenCount: true,
          quotedDailyRate: true,
          room: {
            select: {
              building: true,
              transientDailyRate: true,
            },
          },
        },
      });
      if (!request) {
        throw new NotFoundError("The requested booking request was not found.");
      }
      if (request.room.building !== "TRANSIENT") {
        throw new PreconditionError(
          "Only Transient Building rooms can be approved for transient stays.",
        );
      }
      if (request.status !== "PENDING") {
        throw new ConflictError(
          `This booking request has already been ${request.status.toLowerCase()}.`,
        );
      }
      if (request.version !== input.expectedVersion) {
        throw new ConflictError(
          "This booking request changed since you loaded it. Reload and review before approving.",
        );
      }

      if (request.scope === "BED" && !input.bedId) {
        throw new ValidationError(
          "Select an available bed before approving a per-bed booking request.",
        );
      }

      const currentRateCentavos = resolveTransientDailyRateCentavos({
        roomDailyRate: request.room.transientDailyRate,
      });
      const quotedCentavos = parseMoneyDecimal(
        request.quotedDailyRate.toString(),
      );

      if (
        !input.confirmedDailyRate &&
        currentRateCentavos !== quotedCentavos &&
        !input.confirmRateChange
      ) {
        const currentLabel =
          currentRateCentavos > ZERO
            ? `PHP ${formatMoneyDecimal(currentRateCentavos)}`
            : "unset";
        throw new ConflictError(
          `The room nightly rate changed since this request was submitted (quoted PHP ${formatMoneyDecimal(quotedCentavos)}, current ${currentLabel}). Confirm the nightly rate before approving.`,
        );
      }

      const finalRateStr =
        input.confirmedDailyRate ??
        (input.confirmRateChange && currentRateCentavos > ZERO
          ? formatMoneyDecimal(currentRateCentavos)
          : formatMoneyDecimal(quotedCentavos));

      let guestId: string;
      if (input.existingGuestId) {
        const existingGuest = await tx.transientGuest.findFirst({
          where: { id: input.existingGuestId, ownerUserId },
          select: { id: true, archivedAt: true },
        });
        if (!existingGuest) {
          throw new NotFoundError("Selected existing guest was not found.");
        }
        if (existingGuest.archivedAt !== null) {
          throw new PreconditionError(
            "Restore the archived guest or create a new guest record.",
          );
        }
        guestId = existingGuest.id;
      } else {
        const demographicNotes = [
          request.guestAge != null ? `Age: ${request.guestAge}` : null,
          request.guestSex
            ? `Sex: ${request.guestSex === "MALE" ? "Male" : "Female"}`
            : null,
          request.guestAddress ? `Address: ${request.guestAddress}` : null,
        ]
          .filter(Boolean)
          .join(", ");

        const createdGuest = await createTransientGuestInTx(tx, ownerUserId, {
          fullName: request.guestName,
          phone: request.guestPhone,
          email: request.guestEmail,
          notes: demographicNotes || null,
        });
        guestId = createdGuest.id;
      }

      const reservation = await createTransientReservationInTx(
        tx,
        ownerUserId,
        {
          guestId,
          roomId: request.roomId,
          bedId: request.scope === "BED" ? input.bedId : null,
          scope: request.scope,
          checkInDateManila: request.checkInDateManila,
          checkOutDateManila: request.checkOutDateManila,
          partySize: request.partySize,
          dailyRateOverride: finalRateStr,
          notes: input.notes ?? request.notes,
          issueInvoiceImmediately: input.issueInvoiceImmediately,
        },
      );

      const nowUtc = new Date();
      const updatedReq = await tx.bookingRequest.updateMany({
        where: {
          id: request.id,
          ownerUserId,
          version: input.expectedVersion,
          status: "PENDING",
        },
        data: {
          status: "APPROVED",
          reviewedAt: nowUtc,
          approvedGuestId: guestId,
          approvedReservationId: reservation.id,
          version: { increment: 1 },
        },
      });
      if (updatedReq.count === 0) {
        throw new ConflictError(
          "This booking request was reviewed concurrently.",
        );
      }

      const refreshedReq = await tx.bookingRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: bookingRequestSelect,
      });
      const reqDto = toBookingRequestDto(refreshedReq);
      const sequence = await publishBookingRequestSnapshotInTx(
        tx,
        ownerUserId,
        reqDto,
      );
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "transients",
        action: "booking_request.approved",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "booking_request",
        entityId: reqDto.id,
        metadata: {
          approvedReservationId: reservation.id,
          approvedGuestId: guestId,
          finalDailyRate: finalRateStr,
          version: reqDto.version,
        },
      });

      return { request: reqDto, reservation };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

async function resolvePendingRequestWithoutStay(
  ownerUserId: string,
  requestId: string,
  expectedVersion: number,
  targetStatus: "REJECTED" | "WITHDRAWN",
  reason: string | null,
): Promise<BookingRequestDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) => {
      const existing = await tx.bookingRequest.findFirst({
        where: { id: requestId, ownerUserId },
        select: { id: true, status: true, version: true },
      });
      if (!existing) {
        throw new NotFoundError("The requested booking request was not found.");
      }
      if (existing.status !== "PENDING") {
        throw new ConflictError(
          `This booking request has already been ${existing.status.toLowerCase()}.`,
        );
      }
      if (existing.version !== expectedVersion) {
        throw new ConflictError(
          "This booking request changed since you loaded it.",
        );
      }

      const updated = await tx.bookingRequest.updateMany({
        where: {
          id: requestId,
          ownerUserId,
          version: expectedVersion,
          status: "PENDING",
        },
        data: {
          status: targetStatus,
          rejectionReason: reason,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError("Booking request changed concurrently.");
      }

      const saved = await tx.bookingRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: bookingRequestSelect,
      });
      const dto = toBookingRequestDto(saved);
      const sequence = await publishBookingRequestSnapshotInTx(
        tx,
        ownerUserId,
        dto,
      );
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "transients",
        action:
          targetStatus === "REJECTED"
            ? "booking_request.rejected"
            : "booking_request.withdrawn",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "booking_request",
        entityId: dto.id,
        metadata: { version: dto.version },
      });
      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function rejectBookingRequest(
  ownerUserId: string,
  rawInput: RejectBookingRequestInput,
): Promise<BookingRequestDto> {
  const parsed = RejectBookingRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Enter a rejection reason.",
    );
  }
  return resolvePendingRequestWithoutStay(
    ownerUserId,
    parsed.data.requestId,
    parsed.data.expectedVersion,
    "REJECTED",
    parsed.data.reason,
  );
}

export async function withdrawBookingRequest(
  ownerUserId: string,
  rawInput: WithdrawBookingRequestInput,
): Promise<BookingRequestDto> {
  const parsed = WithdrawBookingRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid withdrawal request.",
    );
  }
  return resolvePendingRequestWithoutStay(
    ownerUserId,
    parsed.data.requestId,
    parsed.data.expectedVersion,
    "WITHDRAWN",
    parsed.data.reason,
  );
}
