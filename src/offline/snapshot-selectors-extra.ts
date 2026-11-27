import type {
  BillingOverviewDto,
  BillingTenantOptionDto,
  InvoiceAdjustmentDto,
  InvoiceAdjustmentTypeValue,
  InvoiceDto,
  InvoiceItemDto,
  InvoiceItemTypeValue,
  InvoiceStatusValue,
} from "@/features/billing/schemas";
import type {
  DepositPolicyValue,
  ProrationPolicyValue,
} from "@/features/settings/schemas";
import {
  computeOccupancyPercent,
  deriveRoomUnitStatus,
  getManilaMonthWindow,
  getPreviousManilaMonthWindow,
} from "@/features/dashboard/calculations";
import type {
  DashboardBoardingMoveInDto,
  DashboardDueInvoiceDto,
  DashboardEndingAssignmentDto,
  DashboardMaintenanceItemDto,
  DashboardNoticeItemDto,
  DashboardPendingRequestDto,
  DashboardSnapshotDto,
  DashboardTransientTurnoverDto,
} from "@/features/dashboard/schemas";
import type {
  MaintenanceCategoryValue,
  MaintenancePriorityValue,
} from "@/features/maintenance/schemas";
import type {
  NoticeAudienceValue,
  NoticeDto,
  NoticeLifecycleStatus,
  NoticeOverviewDto,
  NoticeRoomOptionDto,
  NoticeTenantOptionDto,
} from "@/features/notices/schemas";
import type {
  BedDto,
  BedStatusValue,
  InventoryOverviewDto,
  RoomBuildingValue,
  RoomPhotoDto,
  RoomWithBedsDto,
} from "@/features/rooms/schemas";
import type {
  AllocationScopeValue,
  BookingRequestDto,
  BookingRequestStatusValue,
  GuestSexValue,
  TransientGuestDto,
  TransientReservationDto,
  TransientReservationStatusValue,
  TransientRoomOptionDto,
  TransientsOverviewDto,
} from "@/features/transients/schemas";
import { addManilaDays, diffManilaDays, toManilaDate } from "@/lib/dates";
import { addMoney, formatMoneyDecimal, subtractMoney } from "@/lib/money";
import {
  listActiveOutboxRecords,
  listDecryptedProjections,
  type DecryptedEntityView,
} from "./client";
import type { DaisyOfflineDatabase, OutboxRecord } from "./db";
import {
  asNumber,
  asNonEmptyString,
  asString,
  buildSyncBadgeMap,
  isRecordDeletedOrTombstone,
  mergeOverlayRecords,
  parseSafeMoney,
  toPaymentDtoFromRecord,
  ZERO_CENTAVOS,
  type OfflineEntitySyncBadge,
  type VaultPoliciesSnapshot,
} from "./snapshot-selectors";

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toTransientGuestDto(
  row: DecryptedEntityView,
): TransientGuestDto | null {
  const fullName = asString(row.data.fullName)?.trim();
  if (!fullName) return null;
  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    version: Math.max(
      row.isPendingLocal ? 0 : 1,
      asNumber(row.data._version ?? row.data.version, 1),
    ),
    fullName,
    phone: asString(row.data.phone),
    email: asString(row.data.email),
    notes: asString(row.data.notes),
    archivedAt: asString(row.data.archivedAt),
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
  };
}

function toTransientReservationDto(
  row: DecryptedEntityView,
  guestById?: Map<string, TransientGuestDto>,
  roomById?: Map<string, RoomWithBedsDto>,
): TransientReservationDto | null {
  if (isRecordDeletedOrTombstone(row)) return null;
  const guestId = asString(row.data.guestId);
  const roomId = asString(row.data.roomId);
  if (!guestId || !roomId) return null;

  const guest = guestById?.get(guestId);
  const room = roomById?.get(roomId);
  const rawStatus = asString(
    row.data.status,
  ) as TransientReservationStatusValue | null;
  const status: TransientReservationStatusValue =
    rawStatus === "TENTATIVE" ||
    rawStatus === "CONFIRMED" ||
    rawStatus === "CHECKED_IN" ||
    rawStatus === "CHECKED_OUT" ||
    rawStatus === "CANCELLED" ||
    rawStatus === "NO_SHOW"
      ? rawStatus
      : "TENTATIVE";

  const checkInDateManila = asNonEmptyString(
    row.data.checkInDateManila,
    toManilaDate(new Date(row.updatedAt)),
  );
  const checkOutDateManila = asNonEmptyString(
    row.data.checkOutDateManila,
    addManilaDays(checkInDateManila, 1),
  );
  let nights = asNumber(row.data.nights, 0);
  if (nights <= 0) {
    try {
      nights = Math.max(
        1,
        diffManilaDays(checkInDateManila, checkOutDateManila),
      );
    } catch {
      nights = 1;
    }
  }

  const dailyRateCentavos = parseSafeMoney(
    row.data.dailyRate ??
      row.data.dailyRateOverride ??
      room?.transientDailyRate ??
      "0.00",
  );
  const totalCentavos =
    row.data.totalAmount !== undefined
      ? parseSafeMoney(row.data.totalAmount)
      : dailyRateCentavos * BigInt(nights);

  const scope: AllocationScopeValue =
    asString(row.data.scope) === "BED" ? "BED" : "WHOLE_ROOM";

  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    version: Math.max(
      row.isPendingLocal ? 0 : 1,
      asNumber(row.data._version ?? row.data.version, 1),
    ),
    guestId,
    guestName:
      asString(row.data.guestName) ?? guest?.fullName ?? "Transient guest",
    guestPhone: asString(row.data.guestPhone) ?? guest?.phone ?? null,
    guestEmail: asString(row.data.guestEmail) ?? guest?.email ?? null,
    roomId,
    roomNumber: asString(row.data.roomNumber) ?? room?.title ?? "—",
    bedId: asString(row.data.bedId),
    bedNumber: asString(row.data.bedNumber),
    scope,
    checkInDateManila,
    checkOutDateManila,
    startDate: asNonEmptyString(row.data.startDate, row.updatedAt),
    endDate: asNonEmptyString(row.data.endDate, row.updatedAt),
    nights,
    partySize: Math.max(1, asNumber(row.data.partySize, 1)),
    dailyRate: formatMoneyDecimal(dailyRateCentavos),
    totalAmount: formatMoneyDecimal(totalCentavos),
    status,
    checkedInAt: asString(row.data.checkedInAt),
    checkedOutAt: asString(row.data.checkedOutAt),
    cancelledAt: asString(row.data.cancelledAt),
    notes: asString(row.data.notes),
    cancellationReason: asString(row.data.cancellationReason),
    activeInvoiceId: asString(row.data.activeInvoiceId),
    activeInvoiceNumber: asString(row.data.activeInvoiceNumber),
    activeInvoiceStatus: asString(row.data.activeInvoiceStatus),
    activeInvoiceTotal:
      row.data.activeInvoiceTotal != null
        ? formatMoneyDecimal(parseSafeMoney(row.data.activeInvoiceTotal))
        : null,
    activeInvoiceBalance:
      row.data.activeInvoiceBalance != null
        ? formatMoneyDecimal(parseSafeMoney(row.data.activeInvoiceBalance))
        : null,
    createdByActorType: asNonEmptyString(row.data.createdByActorType, "owner"),
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
  };
}

function toBookingRequestDto(
  row: DecryptedEntityView,
): BookingRequestDto | null {
  if (isRecordDeletedOrTombstone(row)) return null;
  const guestName = asString(row.data.guestName)?.trim();
  const roomId = asString(row.data.roomId);
  if (!guestName || !roomId) return null;

  const rawStatus = asString(
    row.data.status,
  ) as BookingRequestStatusValue | null;
  const status: BookingRequestStatusValue =
    rawStatus === "PENDING" ||
    rawStatus === "APPROVED" ||
    rawStatus === "REJECTED" ||
    rawStatus === "WITHDRAWN"
      ? rawStatus
      : "PENDING";

  const rawSex = asString(row.data.guestSex);
  const guestSex: GuestSexValue | null =
    rawSex === "MALE" || rawSex === "FEMALE" ? rawSex : null;

  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    version: Math.max(1, asNumber(row.data._version ?? row.data.version, 1)),
    referenceCode: asNonEmptyString(row.data.referenceCode, "—"),
    roomId,
    roomNumber: asNonEmptyString(row.data.roomNumber, "—"),
    scope: asString(row.data.scope) === "BED" ? "BED" : "WHOLE_ROOM",
    guestName,
    guestAge: typeof row.data.guestAge === "number" ? row.data.guestAge : null,
    guestSex,
    guestAddress: asString(row.data.guestAddress),
    guestPhone: asString(row.data.guestPhone),
    guestEmail: asString(row.data.guestEmail),
    notes: asString(row.data.notes),
    checkInDateManila: asNonEmptyString(row.data.checkInDateManila),
    checkOutDateManila: asNonEmptyString(row.data.checkOutDateManila),
    nights: Math.max(1, asNumber(row.data.nights, 1)),
    partySize: Math.max(1, asNumber(row.data.partySize, 1)),
    adultsCount:
      typeof row.data.adultsCount === "number" ? row.data.adultsCount : null,
    childrenCount:
      typeof row.data.childrenCount === "number"
        ? row.data.childrenCount
        : null,
    quotedDailyRate: formatMoneyDecimal(
      parseSafeMoney(row.data.quotedDailyRate),
    ),
    quotedTotalAmount: formatMoneyDecimal(
      parseSafeMoney(row.data.quotedTotalAmount),
    ),
    currentDailyRate:
      row.data.currentDailyRate != null
        ? formatMoneyDecimal(parseSafeMoney(row.data.currentDailyRate))
        : null,
    rateChangedSinceSubmit: toBoolean(row.data.rateChangedSinceSubmit),
    privacyConsentAccepted: toBoolean(row.data.privacyConsentAccepted, true),
    status,
    rejectionReason: asString(row.data.rejectionReason),
    reviewedAt: asString(row.data.reviewedAt),
    approvedGuestId: asString(row.data.approvedGuestId),
    approvedReservationId: asString(row.data.approvedReservationId),
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
  };
}

function reconstructRooms(projections: DecryptedEntityView[]): {
  rooms: RoomWithBedsDto[];
  roomById: Map<string, RoomWithBedsDto>;
} {
  const bedsByRoomId = new Map<string, BedDto[]>();
  for (const row of projections) {
    if (row.entityType !== "bed" || isRecordDeletedOrTombstone(row)) continue;
    const roomId = asString(row.data.roomId);
    if (!roomId) continue;
    const rawStatus = asString(row.data.status) as BedStatusValue | null;
    const status: BedStatusValue =
      rawStatus === "AVAILABLE" ||
      rawStatus === "OCCUPIED" ||
      rawStatus === "MAINTENANCE" ||
      rawStatus === "ARCHIVED"
        ? rawStatus
        : "AVAILABLE";
    const bed: BedDto = {
      id: asNonEmptyString(row.data.id, row.entityId),
      roomId,
      version: Math.max(1, asNumber(row.data._version ?? row.data.version, 1)),
      number: asNonEmptyString(row.data.number, "—"),
      label: asString(row.data.label),
      monthlyRate:
        row.data.monthlyRate != null
          ? formatMoneyDecimal(parseSafeMoney(row.data.monthlyRate))
          : null,
      dailyRate:
        row.data.dailyRate != null
          ? formatMoneyDecimal(parseSafeMoney(row.data.dailyRate))
          : null,
      status,
      activeAllocationCount: asNumber(row.data.activeAllocationCount, 0),
      currentStaySummary: asString(row.data.currentStaySummary),
      archivedAt: asString(row.data.archivedAt),
      createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
      updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
    };
    const list = bedsByRoomId.get(roomId) ?? [];
    list.push(bed);
    bedsByRoomId.set(roomId, list);
  }

  const rooms: RoomWithBedsDto[] = [];
  const roomById = new Map<string, RoomWithBedsDto>();
  for (const row of projections) {
    if (row.entityType !== "room" || isRecordDeletedOrTombstone(row)) continue;
    const id = asNonEmptyString(row.data.id, row.entityId);
    const title = (
      asString(row.data.title) ??
      asString(row.data.transientTitle) ??
      asString(row.data.number)
    )?.trim();
    if (!title) continue;
    const building: RoomBuildingValue =
      asString(row.data.building) === "TRANSIENT" ? "TRANSIENT" : "BOARDING";
    const beds = (bedsByRoomId.get(id) ?? []).sort((a, b) =>
      a.number.localeCompare(b.number),
    );
    const previewPhoto =
      row.data.previewPhoto && typeof row.data.previewPhoto === "object"
        ? (row.data.previewPhoto as RoomPhotoDto)
        : null;
    const galleryPhotos = Array.isArray(row.data.galleryPhotos)
      ? (row.data.galleryPhotos as RoomPhotoDto[])
      : [];

    const room: RoomWithBedsDto = {
      id,
      version: Math.max(1, asNumber(row.data._version ?? row.data.version, 1)),
      building,
      title,
      floor: asString(row.data.floor),
      capacity: Math.max(1, asNumber(row.data.capacity, 1)),
      baseMonthlyRate:
        row.data.baseMonthlyRate != null
          ? formatMoneyDecimal(parseSafeMoney(row.data.baseMonthlyRate))
          : null,
      transientDailyRate:
        row.data.transientDailyRate != null
          ? formatMoneyDecimal(parseSafeMoney(row.data.transientDailyRate))
          : null,
      isTransientPublished: toBoolean(row.data.isTransientPublished),
      summary:
        asString(row.data.summary) ??
        asString(row.data.transientDescription) ??
        asString(row.data.notes),
      previewPhoto,
      galleryPhotos,
      archivedAt: asString(row.data.archivedAt),
      createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
      updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
      activeAllocationCount: beds.reduce(
        (sum, bed) => sum + bed.activeAllocationCount,
        0,
      ),
      beds,
    };
    rooms.push(room);
    roomById.set(id, room);
  }

  rooms.sort((a, b) => a.title.localeCompare(b.title));
  return { rooms, roomById };
}

/**
 * Pure selector rebuilding `TransientsOverviewDto` + per-entity sync badges
 * for both `transient_guest` and `transient_reservation`.
 */
export function buildTransientsOverviewFromRecords(input: {
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
}): {
  overview: TransientsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const { rooms: allRooms, roomById } = reconstructRooms(input.projections);
  const guests: TransientGuestDto[] = [];
  const guestById = new Map<string, TransientGuestDto>();

  for (const row of input.projections) {
    if (row.entityType !== "transient_guest") continue;
    const guest = toTransientGuestDto(row);
    if (!guest) continue;
    guests.push(guest);
    guestById.set(guest.id, guest);
  }
  guests.sort(
    (a, b) =>
      Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
      a.fullName.localeCompare(b.fullName),
  );

  const reservations: TransientReservationDto[] = [];
  let tentativeReservations = 0;
  let confirmedReservations = 0;
  let checkedInReservations = 0;

  for (const row of input.projections) {
    if (row.entityType !== "transient_reservation") continue;
    const stay = toTransientReservationDto(row, guestById, roomById);
    if (!stay) continue;
    reservations.push(stay);
    if (stay.status === "TENTATIVE") tentativeReservations += 1;
    if (stay.status === "CONFIRMED") confirmedReservations += 1;
    if (stay.status === "CHECKED_IN") checkedInReservations += 1;
  }
  reservations.sort(
    (a, b) =>
      b.checkInDateManila.localeCompare(a.checkInDateManila) ||
      b.createdAt.localeCompare(a.createdAt),
  );

  const requests: BookingRequestDto[] = [];
  let pendingRequests = 0;
  for (const row of input.projections) {
    if (row.entityType !== "booking_request") continue;
    const req = toBookingRequestDto(row);
    if (!req) continue;
    requests.push(req);
    if (req.status === "PENDING") pendingRequests += 1;
  }
  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rooms: TransientRoomOptionDto[] = allRooms
    .filter((r) => r.building === "TRANSIENT" && r.archivedAt === null)
    .map((r) => ({
      id: r.id,
      version: r.version,
      number: r.title,
      floor: r.floor,
      capacity: r.capacity,
      resolvedDailyRate: r.transientDailyRate,
      isTransientPublished: r.isTransientPublished,
      transientTitle: r.title,
      transientDescription: r.summary,
      transientScope: null,
      transientDailyRate: r.transientDailyRate,
      previewPhoto: r.previewPhoto,
      galleryPhotos: r.galleryPhotos,
      beds: r.beds
        .filter((b) => b.archivedAt === null)
        .map((b) => ({
          id: b.id,
          number: b.number,
          status: b.status,
          archivedAt: b.archivedAt,
        })),
    }));

  const publishedRooms = rooms.filter((r) => r.isTransientPublished).length;

  return {
    overview: {
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      transientPolicyNote: null,
      totals: {
        pendingRequests,
        tentativeReservations,
        confirmedReservations,
        checkedInReservations,
        publishedRooms,
      },
      requests,
      reservations,
      guests,
      rooms,
    },
    syncBadges: buildSyncBadgeMap(input.outbox, [
      "transient_guest",
      "transient_reservation",
    ]),
  };
}

export function mergeTransientsOverviewWithVaultOverlay(input: {
  baseOverview: TransientsOverviewDto;
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
}): {
  overview: TransientsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const mergedGuests = mergeOverlayRecords<TransientGuestDto>({
    entityType: "transient_guest",
    serverRows: input.baseOverview.guests,
    projections: input.projections,
    outbox: input.outbox,
    toDto: toTransientGuestDto,
    mergeExisting: (serverRow, localDto) => ({
      ...serverRow,
      ...localDto,
      version: serverRow.version,
    }),
  });

  const mergedStays = mergeOverlayRecords<TransientReservationDto>({
    entityType: "transient_reservation",
    serverRows: input.baseOverview.reservations,
    projections: input.projections,
    outbox: input.outbox,
    toDto: (view) => toTransientReservationDto(view),
    mergeExisting: (serverRow, localDto) => ({
      ...serverRow,
      status: localDto.status,
      checkedInAt: localDto.checkedInAt ?? serverRow.checkedInAt,
      checkedOutAt: localDto.checkedOutAt ?? serverRow.checkedOutAt,
      updatedAt: localDto.updatedAt,
      version: serverRow.version,
    }),
  });

  return {
    overview: {
      ...input.baseOverview,
      guests: mergedGuests.rows,
      reservations: mergedStays.rows,
    },
    syncBadges: {
      ...mergedGuests.syncBadges,
      ...mergedStays.syncBadges,
    },
  };
}

export async function loadTransientsOverviewFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<{
  overview: TransientsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
  lastSyncedAt: string | null;
}> {
  const [projections, outbox, syncMeta] = await Promise.all([
    listDecryptedProjections(db, key, [
      "transient_guest",
      "transient_reservation",
      "booking_request",
      "room",
      "bed",
    ]),
    listActiveOutboxRecords(db),
    db.vaultMeta.get("sync"),
  ]);

  const built = buildTransientsOverviewFromRecords({ projections, outbox });
  return {
    ...built,
    lastSyncedAt: syncMeta?.key === "sync" ? syncMeta.lastSyncedAt : null,
  };
}

export function buildRoomsOverviewFromRecords(input: {
  projections: DecryptedEntityView[];
  building: RoomBuildingValue;
}): InventoryOverviewDto {
  const { rooms } = reconstructRooms(input.projections);
  const filteredRooms = rooms.filter((r) => r.building === input.building);
  const activeRooms = filteredRooms.filter((r) => r.archivedAt === null);

  let totalActiveBeds = 0;
  let availableBeds = 0;
  let occupiedBeds = 0;
  let maintenanceBeds = 0;

  for (const room of activeRooms) {
    for (const bed of room.beds) {
      if (bed.archivedAt !== null) continue;
      totalActiveBeds += 1;
      if (bed.status === "OCCUPIED") occupiedBeds += 1;
      else if (bed.status === "MAINTENANCE") maintenanceBeds += 1;
      else if (bed.status === "AVAILABLE") availableBeds += 1;
    }
  }

  return {
    building: input.building,
    summary: {
      totalRooms: filteredRooms.length,
      activeRooms: activeRooms.length,
      totalActiveBeds,
      availableBeds,
      occupiedBeds,
      maintenanceBeds,
    },
    rooms: filteredRooms,
  };
}

export async function loadRoomsOverviewFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  building: RoomBuildingValue,
): Promise<{
  overview: InventoryOverviewDto;
  lastSyncedAt: string | null;
}> {
  const [projections, syncMeta] = await Promise.all([
    listDecryptedProjections(db, key, ["room", "bed"]),
    db.vaultMeta.get("sync"),
  ]);
  return {
    overview: buildRoomsOverviewFromRecords({ projections, building }),
    lastSyncedAt: syncMeta?.key === "sync" ? syncMeta.lastSyncedAt : null,
  };
}

function toInvoiceDto(
  row: DecryptedEntityView,
  todayManila: string,
): InvoiceDto | null {
  if (isRecordDeletedOrTombstone(row)) return null;
  const rawStatus = asString(row.data.status) as InvoiceStatusValue | null;
  const status: InvoiceStatusValue =
    rawStatus === "DRAFT" ||
    rawStatus === "ISSUED" ||
    rawStatus === "PARTIALLY_PAID" ||
    rawStatus === "PAID" ||
    rawStatus === "VOID"
      ? rawStatus
      : "ISSUED";

  const totalCentavos = parseSafeMoney(row.data.totalAmount);
  const paidCentavos = parseSafeMoney(row.data.paidAmount);
  const bal = subtractMoney(totalCentavos, paidCentavos);
  const balanceCentavos = bal > ZERO_CENTAVOS ? bal : ZERO_CENTAVOS;
  const dueDateManila = asNonEmptyString(row.data.dueDateManila, todayManila);

  const items: InvoiceItemDto[] = Array.isArray(row.data.items)
    ? (row.data.items as Array<Record<string, unknown>>).map((item, idx) => ({
        id: asNonEmptyString(item.id, `${row.entityId}-item-${idx}`),
        itemType: (asString(item.itemType) as InvoiceItemTypeValue) ?? "RENT",
        description: asNonEmptyString(item.description, "Charge"),
        quantity: asNonEmptyString(item.quantity, "1.00"),
        unitAmount: formatMoneyDecimal(parseSafeMoney(item.unitAmount)),
        lineTotal: formatMoneyDecimal(parseSafeMoney(item.lineTotal)),
        sortOrder: asNumber(item.sortOrder, idx),
      }))
    : [];

  const adjustments: InvoiceAdjustmentDto[] = Array.isArray(
    row.data.adjustments,
  )
    ? (row.data.adjustments as Array<Record<string, unknown>>).map(
        (adj, idx) => ({
          id: asNonEmptyString(adj.id, `${row.entityId}-adj-${idx}`),
          type: (asString(adj.type) as InvoiceAdjustmentTypeValue) ?? "CREDIT",
          amount: formatMoneyDecimal(parseSafeMoney(adj.amount)),
          reason: asNonEmptyString(adj.reason),
          createdByActorType: asNonEmptyString(adj.createdByActorType, "owner"),
          createdAt: asNonEmptyString(adj.createdAt, row.updatedAt),
        }),
      )
    : [];

  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    tenantId: asString(row.data.tenantId),
    transientGuestId: asString(row.data.transientGuestId),
    transientReservationId: asString(row.data.transientReservationId),
    assignmentId: asString(row.data.assignmentId),
    version: Math.max(1, asNumber(row.data._version ?? row.data.version, 1)),
    invoiceNumber: asString(row.data.invoiceNumber),
    billingPeriod: asString(row.data.billingPeriod),
    periodStartManila: asNonEmptyString(
      row.data.periodStartManila,
      dueDateManila,
    ),
    periodEndManila: asNonEmptyString(row.data.periodEndManila, dueDateManila),
    dueDateManila,
    status,
    isOverdue:
      (status === "ISSUED" || status === "PARTIALLY_PAID") &&
      dueDateManila < todayManila,
    subtotalAmount: formatMoneyDecimal(
      parseSafeMoney(row.data.subtotalAmount ?? row.data.totalAmount),
    ),
    adjustmentAmount: formatMoneyDecimal(
      parseSafeMoney(row.data.adjustmentAmount ?? "0.00"),
    ),
    totalAmount: formatMoneyDecimal(totalCentavos),
    paidAmount: formatMoneyDecimal(paidCentavos),
    balanceAmount: formatMoneyDecimal(balanceCentavos),
    snapshotTenantName: asString(row.data.snapshotTenantName),
    snapshotRoomNumber: asString(row.data.snapshotRoomNumber),
    snapshotBedNumber: asString(row.data.snapshotBedNumber),
    snapshotMonthlyRate:
      row.data.snapshotMonthlyRate != null
        ? formatMoneyDecimal(parseSafeMoney(row.data.snapshotMonthlyRate))
        : null,
    snapshotProrationPolicy:
      (asString(
        row.data.snapshotProrationPolicy,
      ) as ProrationPolicyValue | null) ?? null,
    snapshotDepositPolicy:
      (asString(row.data.snapshotDepositPolicy) as DepositPolicyValue | null) ??
      null,
    notes: asString(row.data.notes),
    voidReason: asString(row.data.voidReason),
    issuedAt: asString(row.data.issuedAt),
    voidedAt: asString(row.data.voidedAt),
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
    items,
    adjustments,
  };
}

export function buildBillingOverviewFromRecords(input: {
  projections: DecryptedEntityView[];
  policiesMeta?: VaultPoliciesSnapshot | null | undefined;
  todayManila?: string;
}): BillingOverviewDto {
  const todayManila = input.todayManila ?? toManilaDate(new Date());
  const currentBillingPeriod = todayManila.slice(0, 7);
  const invoices: InvoiceDto[] = [];
  const tenants: BillingTenantOptionDto[] = [];

  for (const row of input.projections) {
    if (row.entityType === "tenant" && !isRecordDeletedOrTombstone(row)) {
      if (asString(row.data.archivedAt) !== null) continue;
      const fullName = asString(row.data.fullName)?.trim();
      if (!fullName) continue;
      tenants.push({
        id: asNonEmptyString(row.data.id, row.entityId),
        fullName,
        roomNumber: null,
        bedNumber: null,
        monthlyRate: null,
      });
    } else if (row.entityType === "invoice") {
      const inv = toInvoiceDto(row, todayManila);
      if (inv) invoices.push(inv);
    }
  }

  invoices.sort((a, b) => b.dueDateManila.localeCompare(a.dueDateManila));
  tenants.sort((a, b) => a.fullName.localeCompare(b.fullName));

  let draftCount = 0;
  let issuedOpenCount = 0;
  let overdueCount = 0;
  let openReceivablesCentavos = ZERO_CENTAVOS;
  let billedCurrentCentavos = ZERO_CENTAVOS;

  for (const inv of invoices) {
    if (inv.status === "DRAFT") draftCount += 1;
    if (inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID") {
      issuedOpenCount += 1;
      openReceivablesCentavos = addMoney(
        openReceivablesCentavos,
        parseSafeMoney(inv.balanceAmount),
      );
      if (inv.isOverdue) overdueCount += 1;
    }
    if (
      inv.billingPeriod === currentBillingPeriod &&
      inv.status !== "DRAFT" &&
      inv.status !== "VOID"
    ) {
      billedCurrentCentavos = addMoney(
        billedCurrentCentavos,
        parseSafeMoney(inv.totalAmount),
      );
    }
  }

  return {
    policiesComplete: input.policiesMeta?.policiesComplete ?? true,
    missingPolicyFields: input.policiesMeta?.missingPolicyLabels ?? [],
    currentBillingPeriod,
    billingDayOfMonth: null,
    gracePeriodDays: null,
    prorationPolicy: null,
    depositPolicy: null,
    invoicePrefix: null,
    invoices,
    tenants,
    summary: {
      draftCount,
      issuedOpenCount,
      overdueCount,
      openReceivablesAmount: formatMoneyDecimal(openReceivablesCentavos),
      billedCurrentPeriodAmount: formatMoneyDecimal(billedCurrentCentavos),
    },
  };
}

export async function loadBillingOverviewFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<{
  overview: BillingOverviewDto;
  lastSyncedAt: string | null;
}> {
  const [projections, syncMeta, policiesMeta] = await Promise.all([
    listDecryptedProjections(db, key, ["invoice", "tenant"]),
    db.vaultMeta.get("sync"),
    db.vaultMeta.get("policies"),
  ]);
  return {
    overview: buildBillingOverviewFromRecords({
      projections,
      policiesMeta: policiesMeta?.key === "policies" ? policiesMeta : null,
    }),
    lastSyncedAt: syncMeta?.key === "sync" ? syncMeta.lastSyncedAt : null,
  };
}

export function buildNoticesOverviewFromRecords(input: {
  projections: DecryptedEntityView[];
  todayManila?: string;
}): NoticeOverviewDto {
  const todayManila = input.todayManila ?? toManilaDate(new Date());
  const { rooms: allRooms } = reconstructRooms(input.projections);
  const rooms: NoticeRoomOptionDto[] = allRooms
    .filter((r) => r.archivedAt === null)
    .map((r) => ({
      id: r.id,
      building: r.building,
      number: r.title,
      floor: r.floor,
    }));

  const tenants: NoticeTenantOptionDto[] = [];
  for (const row of input.projections) {
    if (row.entityType !== "tenant" || isRecordDeletedOrTombstone(row))
      continue;
    if (asString(row.data.archivedAt) !== null) continue;
    const fullName = asString(row.data.fullName)?.trim();
    if (!fullName) continue;
    tenants.push({
      id: asNonEmptyString(row.data.id, row.entityId),
      fullName,
    });
  }
  tenants.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const notices: NoticeDto[] = [];
  let activeCount = 0;
  let scheduledCount = 0;
  let expiredCount = 0;
  let archivedCount = 0;

  for (const row of input.projections) {
    if (row.entityType !== "notice" || row.data._tombstone === true) continue;
    const title = asString(row.data.title)?.trim();
    if (!title) continue;
    const startDateManila = asNonEmptyString(
      row.data.startDateManila,
      todayManila,
    );
    const endDateManila = asNonEmptyString(row.data.endDateManila, todayManila);
    const archivedAt = asString(row.data.archivedAt);
    const lifecycleStatus: NoticeLifecycleStatus = archivedAt
      ? "ARCHIVED"
      : endDateManila < todayManila
        ? "EXPIRED"
        : startDateManila > todayManila
          ? "SCHEDULED"
          : "ACTIVE";

    if (lifecycleStatus === "ARCHIVED") archivedCount += 1;
    else if (lifecycleStatus === "EXPIRED") expiredCount += 1;
    else if (lifecycleStatus === "SCHEDULED") scheduledCount += 1;
    else activeCount += 1;

    const rawAudience = asString(
      row.data.audience,
    ) as NoticeAudienceValue | null;
    const audience: NoticeAudienceValue =
      rawAudience === "ROOM" || rawAudience === "TENANT"
        ? rawAudience
        : "EVERYONE";

    notices.push({
      id: asNonEmptyString(row.data.id, row.entityId),
      version: Math.max(1, asNumber(row.data._version ?? row.data.version, 1)),
      audience,
      roomId: asString(row.data.roomId),
      roomNumber: asString(row.data.roomNumber),
      tenantId: asString(row.data.tenantId),
      tenantName: asString(row.data.tenantName),
      title,
      body: asNonEmptyString(row.data.body),
      startDateManila,
      endDateManila,
      startDate: asNonEmptyString(row.data.startDate, row.updatedAt),
      endDate: asNonEmptyString(row.data.endDate, row.updatedAt),
      lifecycleStatus,
      smsSentAt: asString(row.data.smsSentAt),
      smsSentCount: asNumber(row.data.smsSentCount, 0),
      archivedAt,
      createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
      updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
    });
  }

  notices.sort((a, b) => b.startDateManila.localeCompare(a.startDateManila));
  return {
    todayManila,
    smsConfigured: false,
    businessName: "",
    totals: { activeCount, scheduledCount, expiredCount, archivedCount },
    notices,
    rooms,
    tenants,
  };
}

export async function loadNoticesOverviewFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<{
  overview: NoticeOverviewDto;
  lastSyncedAt: string | null;
}> {
  const [projections, syncMeta] = await Promise.all([
    listDecryptedProjections(db, key, ["notice", "room", "bed", "tenant"]),
    db.vaultMeta.get("sync"),
  ]);
  return {
    overview: buildNoticesOverviewFromRecords({ projections }),
    lastSyncedAt: syncMeta?.key === "sync" ? syncMeta.lastSyncedAt : null,
  };
}

export function buildDashboardSnapshotFromRecords(input: {
  projections: DecryptedEntityView[];
  policiesMeta?: VaultPoliciesSnapshot | null;
  todayManila?: string;
}): DashboardSnapshotDto {
  const todayManila = input.todayManila ?? toManilaDate(new Date());
  const monthWindow = getManilaMonthWindow(todayManila);
  const prevMonthWindow = getPreviousManilaMonthWindow(todayManila);

  const { rooms: allRooms } = reconstructRooms(input.projections);
  const transients = buildTransientsOverviewFromRecords({
    projections: input.projections,
    outbox: [],
  }).overview;
  const billing = buildBillingOverviewFromRecords({
    projections: input.projections,
    policiesMeta: input.policiesMeta,
    todayManila,
  });
  const notices = buildNoticesOverviewFromRecords({
    projections: input.projections,
    todayManila,
  });

  const tenantNames = new Map<string, string>();
  for (const row of input.projections) {
    if (row.entityType === "tenant") {
      const name = asString(row.data.fullName)?.trim();
      if (name)
        tenantNames.set(asNonEmptyString(row.data.id, row.entityId), name);
    }
  }

  // Maintenance items
  const openRequests: DashboardMaintenanceItemDto[] = [];
  let maintOpenCount = 0;
  let maintUrgentCount = 0;
  let maintHoldCount = 0;
  const roomHasHold = new Set<string>();

  for (const row of input.projections) {
    if (
      row.entityType !== "maintenance_request" ||
      row.data._tombstone === true
    ) {
      continue;
    }
    if (asString(row.data.archivedAt) !== null) continue;
    const status = asString(row.data.status);
    const activeHolds = Array.isArray(row.data.activeHolds)
      ? row.data.activeHolds
      : [];
    const hasActiveHold = activeHolds.length > 0;
    const roomId = asNonEmptyString(row.data.roomId);
    if (hasActiveHold && roomId) {
      roomHasHold.add(roomId);
      maintHoldCount += activeHolds.length;
    }
    if (
      status === "OPEN" ||
      status === "IN_PROGRESS" ||
      status === "WAITING_PARTS"
    ) {
      maintOpenCount += 1;
      const priority =
        (asString(row.data.priority) as MaintenancePriorityValue) ?? "MEDIUM";
      if (priority === "URGENT") maintUrgentCount += 1;
      openRequests.push({
        id: asNonEmptyString(row.data.id, row.entityId),
        title: asNonEmptyString(row.data.title, "Maintenance request"),
        roomNumber: asNonEmptyString(row.data.roomNumber, "—"),
        building: "BOARDING",
        category:
          (asString(row.data.category) as MaintenanceCategoryValue) ?? "OTHER",
        priority,
        status,
        hasActiveHold,
        createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
      });
    }
  }

  // Room occupancy counters
  const makeOccupancyCounter = (building: RoomBuildingValue) => {
    const activeRooms = allRooms.filter(
      (r) => r.building === building && r.archivedAt === null,
    );
    let occupiedRooms = 0;
    let availableRooms = 0;
    let maintenanceRooms = 0;
    let publishedRooms = 0;
    for (const room of activeRooms) {
      if (room.isTransientPublished) publishedRooms += 1;
      const activeBedStatuses = room.beds
        .filter((b) => b.archivedAt === null)
        .map((b) => b.status);
      const status = deriveRoomUnitStatus({
        hasActiveHold: roomHasHold.has(room.id),
        hasActiveStayOrAssignment: activeBedStatuses.includes("OCCUPIED"),
        bedStatuses: activeBedStatuses,
      });
      if (status === "OCCUPIED") occupiedRooms += 1;
      else if (status === "MAINTENANCE") maintenanceRooms += 1;
      else availableRooms += 1;
    }
    return {
      totalRooms: activeRooms.length,
      occupiedRooms,
      availableRooms,
      maintenanceRooms,
      publishedRooms,
      occupancyPercent: computeOccupancyPercent(
        occupiedRooms,
        activeRooms.length,
      ),
    };
  };

  // Payments collection sums
  let collectedThisMonthCentavos = ZERO_CENTAVOS;
  let collectedPrevMonthCentavos = ZERO_CENTAVOS;
  for (const row of input.projections) {
    if (row.entityType !== "payment") continue;
    const p = toPaymentDtoFromRecord(row);
    if (!p || p.status !== "POSTED") continue;
    const amt = parseSafeMoney(p.amount);
    if (p.paidDateManila.startsWith(monthWindow.monthKey)) {
      collectedThisMonthCentavos = addMoney(collectedThisMonthCentavos, amt);
    } else if (p.paidDateManila.startsWith(prevMonthWindow.monthKey)) {
      collectedPrevMonthCentavos = addMoney(collectedPrevMonthCentavos, amt);
    }
  }

  // Due & overdue invoices
  const soonCutoff = addManilaDays(todayManila, 7);
  let dueSoonInvoiceCount = 0;
  const dueAndOverdueInvoices: DashboardDueInvoiceDto[] = [];
  for (const inv of billing.invoices) {
    if (inv.status !== "ISSUED" && inv.status !== "PARTIALLY_PAID") continue;
    if (!inv.isOverdue && inv.dueDateManila <= soonCutoff) {
      dueSoonInvoiceCount += 1;
    }
    if (inv.isOverdue || inv.dueDateManila <= soonCutoff) {
      dueAndOverdueInvoices.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        payerName:
          inv.snapshotTenantName ??
          (inv.tenantId ? tenantNames.get(inv.tenantId) : null) ??
          "Payer",
        payerKind: inv.transientGuestId ? "TRANSIENT" : "TENANT",
        dueDateManila: inv.dueDateManila,
        balanceAmount: inv.balanceAmount,
        status: inv.status,
        isOverdue: inv.isOverdue,
      });
    }
  }

  // Boarding assignments today
  const boardingMoveInsToday: DashboardBoardingMoveInDto[] = [];
  const boardingEndingSoon: DashboardEndingAssignmentDto[] = [];
  for (const row of input.projections) {
    if (
      row.entityType !== "tenant_assignment" ||
      isRecordDeletedOrTombstone(row)
    ) {
      continue;
    }
    if (asString(row.data.status) !== "ACTIVE") continue;
    const tenantId = asNonEmptyString(row.data.tenantId);
    const tenantName = tenantNames.get(tenantId) ?? "Boarder";
    const roomNumber = asNonEmptyString(row.data.roomNumber, "—");
    const startDateManila = asNonEmptyString(row.data.startDateManila);
    const endDateManila = asNonEmptyString(row.data.endDateManila);

    if (startDateManila === todayManila) {
      boardingMoveInsToday.push({
        id: asNonEmptyString(row.data.id, row.entityId),
        tenantId,
        tenantName,
        roomNumber,
        startDateManila,
        endDateManila,
      });
    }
    if (endDateManila && endDateManila <= soonCutoff) {
      let daysRemaining = 0;
      try {
        daysRemaining = diffManilaDays(todayManila, endDateManila);
      } catch {
        daysRemaining = 0;
      }
      boardingEndingSoon.push({
        id: asNonEmptyString(row.data.id, row.entityId),
        tenantId,
        tenantName,
        roomNumber,
        endDateManila,
        daysRemaining,
      });
    }
  }

  // Transients today
  const transientCheckInsToday: DashboardTransientTurnoverDto[] =
    transients.reservations
      .filter(
        (stay) =>
          stay.checkInDateManila === todayManila &&
          stay.status !== "CANCELLED" &&
          stay.status !== "NO_SHOW",
      )
      .map((stay) => ({
        id: stay.id,
        guestName: stay.guestName,
        roomNumber: stay.roomNumber,
        status: stay.status,
        checkInDateManila: stay.checkInDateManila,
        checkOutDateManila: stay.checkOutDateManila,
        nights: stay.nights,
        partySize: stay.partySize,
        totalAmount: stay.totalAmount,
      }));

  const transientCheckOutsToday: DashboardTransientTurnoverDto[] =
    transients.reservations
      .filter(
        (stay) =>
          stay.checkOutDateManila === todayManila &&
          (stay.status === "CHECKED_IN" || stay.status === "CHECKED_OUT"),
      )
      .map((stay) => ({
        id: stay.id,
        guestName: stay.guestName,
        roomNumber: stay.roomNumber,
        status: stay.status,
        checkInDateManila: stay.checkInDateManila,
        checkOutDateManila: stay.checkOutDateManila,
        nights: stay.nights,
        partySize: stay.partySize,
        totalAmount: stay.totalAmount,
      }));

  const pendingRequestsList: DashboardPendingRequestDto[] = transients.requests
    .filter((r) => r.status === "PENDING")
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      referenceCode: r.referenceCode,
      guestName: r.guestName,
      roomNumber: r.roomNumber,
      checkInDateManila: r.checkInDateManila,
      checkOutDateManila: r.checkOutDateManila,
      nights: r.nights,
      partySize: r.partySize,
      quotedTotalAmount: r.quotedTotalAmount,
      createdAt: r.createdAt,
    }));

  const activeNotices: DashboardNoticeItemDto[] = notices.notices
    .filter((n) => n.lifecycleStatus === "ACTIVE")
    .map((n) => ({
      id: n.id,
      title: n.title,
      audience: n.audience,
      targetLabel:
        n.audience === "ROOM"
          ? `Room ${n.roomNumber ?? "—"}`
          : n.audience === "TENANT"
            ? (n.tenantName ?? "Tenant")
            : "Everyone",
      startDateManila: n.startDateManila,
      endDateManila: n.endDateManila,
    }));

  return {
    snapshotAt: new Date().toISOString(),
    businessDateManila: todayManila,
    currentMonthKey: monthWindow.monthKey,
    configuration: {
      policiesConfigured: input.policiesMeta?.policiesComplete ?? true,
      stayScheduleConfigured: true,
    },
    occupancy: {
      boarding: makeOccupancyCounter("BOARDING"),
      transient: makeOccupancyCounter("TRANSIENT"),
    },
    billing: {
      openInvoiceCount: billing.summary.issuedOpenCount,
      openBalance: billing.summary.openReceivablesAmount,
      overdueInvoiceCount: billing.summary.overdueCount,
      overdueBalance: formatMoneyDecimal(
        dueAndOverdueInvoices
          .filter((inv) => inv.isOverdue)
          .reduce(
            (sum, inv) => addMoney(sum, parseSafeMoney(inv.balanceAmount)),
            ZERO_CENTAVOS,
          ),
      ),
      dueSoonInvoiceCount,
      draftInvoiceCount: billing.summary.draftCount,
      collectedThisMonth: formatMoneyDecimal(collectedThisMonthCentavos),
      previousMonthKey: prevMonthWindow.monthKey,
      collectedPreviousMonth: formatMoneyDecimal(collectedPrevMonthCentavos),
      dueAndOverdueInvoices,
    },
    staysToday: {
      pendingBookingRequests: pendingRequestsList.length,
      pendingBookingRequestsList: pendingRequestsList,
      checkInsTodayCount: transientCheckInsToday.length,
      checkOutsTodayCount: transientCheckOutsToday.length,
      boardingMoveInsTodayCount: boardingMoveInsToday.length,
      boardingEndingSoonCount: boardingEndingSoon.length,
      transientCheckInsToday,
      transientCheckOutsToday,
      boardingMoveInsToday,
      boardingEndingSoon,
    },
    maintenance: {
      openCount: maintOpenCount,
      urgentCount: maintUrgentCount,
      activeHoldCount: maintHoldCount,
      openRequests,
    },
    notices: {
      activeCount: activeNotices.length,
      activeNotices,
    },
    recentActivity: [],
  };
}

export async function loadDashboardSnapshotFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<{
  snapshot: DashboardSnapshotDto;
  lastSyncedAt: string | null;
}> {
  const [projections, syncMeta, policiesMeta] = await Promise.all([
    listDecryptedProjections(db, key, [
      "room",
      "bed",
      "tenant",
      "tenant_assignment",
      "invoice",
      "payment",
      "transient_guest",
      "transient_reservation",
      "booking_request",
      "maintenance_request",
      "notice",
    ]),
    db.vaultMeta.get("sync"),
    db.vaultMeta.get("policies"),
  ]);

  return {
    snapshot: buildDashboardSnapshotFromRecords({
      projections,
      policiesMeta: policiesMeta?.key === "policies" ? policiesMeta : null,
    }),
    lastSyncedAt: syncMeta?.key === "sync" ? syncMeta.lastSyncedAt : null,
  };
}
