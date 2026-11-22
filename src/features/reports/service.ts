import "server-only";
import { Prisma } from "@/generated/prisma/client";
import {
  computeOccupancyPercent,
  deriveRoomUnitStatus,
} from "@/features/dashboard/calculations";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_PRIORITY_LABELS,
  type MaintenanceCategoryValue,
  type MaintenancePriorityValue,
} from "@/features/maintenance/schemas";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethodValue,
} from "@/features/payments/schemas";
import {
  ROOM_BUILDINGS,
  ROOM_BUILDING_LABELS,
  type RoomBuildingValue,
} from "@/features/rooms/schemas";
import {
  TRANSIENT_RESERVATION_STATUSES,
  TRANSIENT_RESERVATION_STATUS_LABELS,
  type TransientReservationStatusValue,
} from "@/features/transients/schemas";
import {
  addManilaDays,
  diffManilaDays,
  manilaDateTimeToUtc,
  toManilaDate,
} from "@/lib/dates";
import { RateLimitedError, ValidationError } from "@/lib/errors";
import {
  addMoney,
  formatMoneyDecimal,
  parseMoneyDecimal,
  subtractMoney,
} from "@/lib/money";
import { getDatabase } from "@/server/db/client";
import { writeAuditEntry } from "@/server/sync/publish";
import {
  buildCollectionTrendPoints,
  classifyLeaseExpiryBucket,
  computeMoneyRatioPercent,
  computePerUnitMoney,
  computeSharePercent,
  formatOneDecimalAverage,
  LEASE_EXPIRY_BUCKET_LABELS,
  LEASE_EXPIRY_BUCKETS,
  type LeaseExpiryBucketValue,
} from "./calculations";
import { buildReportCsv } from "./csv";
import { buildReportExcel } from "./export-excel";
import { buildReportPdf } from "./export-pdf";
import { buildReportWord } from "./export-word";
import {
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  REPORT_EXPORT_CONTENT_TYPES,
  ReportExportQuerySchema,
  resolveReportFilters,
  type AgingBucketValue,
  type CollectionsMethodSummaryDto,
  type CollectionsRowDto,
  type CollectionsScopeSummaryDto,
  type MaintenanceBuildingSummaryDto,
  type MaintenanceCategorySummaryDto,
  type MaintenancePrioritySummaryDto,
  type MaintenanceReportRowDto,
  type OccupancyBuildingComparisonDto,
  type OccupancyRoomRowDto,
  type OccupancyRoomTypeComparisonDto,
  type ReceivablesAgingBucketDto,
  type ReceivablesAgingRowDto,
  type ReceivablesScopeComparisonDto,
  type RentRollExpiryBucketDto,
  type RentRollRoomTypeSummaryDto,
  type RentRollRowDto,
  type ReportExportFormat,
  type ReportsOverviewDto,
  type ReportTypeValue,
  type ResolvedReportFilters,
  type TransientRevenueRowDto,
  type TransientRoomTypeSummaryDto,
  type TransientStatusSummaryDto,
} from "./schemas";
import {
  buildReportExportFilename,
  buildSharedReportDocument,
} from "./template";

const ZERO = BigInt(0);
const REPORT_EXPORT_MAX_PER_WINDOW = 30;
const REPORT_EXPORT_WINDOW_SECONDS = 600;
const OPEN_MAINTENANCE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PARTS",
] as const;

type ReportTx = Prisma.TransactionClient;

function getAgingBucket(daysPastDue: number): AgingBucketValue {
  if (daysPastDue <= 0) return "CURRENT";
  if (daysPastDue <= 30) return "1_30";
  if (daysPastDue <= 60) return "31_60";
  if (daysPastDue <= 90) return "61_90";
  return "91_PLUS";
}

async function consumeReportExportLimit(ownerUserId: string): Promise<number> {
  const db = getDatabase();
  const prefix = `reports:${ownerUserId}:`;
  const key = `${prefix}export`;

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
        CURRENT_TIMESTAMP + (${REPORT_EXPORT_WINDOW_SECONDS} * interval '1 second')
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "SecurityRateLimit"."count" + 1
        END,
        "resetsAt" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${REPORT_EXPORT_WINDOW_SECONDS} * interval '1 second')
          ELSE "SecurityRateLimit"."resetsAt"
        END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetsAt" - CURRENT_TIMESTAMP))))::int AS retry
    `;
  });

  const row = rows[0];
  if (!row) {
    throw new Error("Report export rate limit unavailable");
  }
  return row.count > REPORT_EXPORT_MAX_PER_WINDOW ? row.retry : 0;
}

async function computeReportsOverviewInTx(
  tx: ReportTx,
  ownerUserId: string,
  filters: ResolvedReportFilters,
  nowUtc: Date,
): Promise<ReportsOverviewDto> {
  const asOfStartUtc = manilaDateTimeToUtc(filters.asOfDate, "00:00");
  const asOfEndExclusiveUtc = manilaDateTimeToUtc(
    addManilaDays(filters.asOfDate, 1),
    "00:00",
  );
  const periodStartUtc = manilaDateTimeToUtc(filters.fromDate, "00:00");
  const periodEndExclusiveUtc = manilaDateTimeToUtc(
    addManilaDays(filters.toDate, 1),
    "00:00",
  );
  const buildingFilter =
    filters.building === "all" ? undefined : filters.building;

  const [
    rooms,
    activeAllocations,
    assignments,
    invoices,
    paymentsInWindow,
    transientReservations,
    maintenanceRequests,
  ] = await Promise.all([
    tx.room.findMany({
      where: {
        ownerUserId,
        archivedAt: null,
        ...(buildingFilter ? { building: buildingFilter } : {}),
      },
      orderBy: [{ building: "asc" }, { floor: "asc" }, { number: "asc" }],
      take: filters.limit,
      select: {
        id: true,
        number: true,
        building: true,
        floor: true,
        roomTypeId: true,
        capacity: true,
        baseMonthlyRate: true,
        transientDailyRate: true,
        isTransientPublished: true,
        transientTitle: true,
        roomType: {
          select: {
            name: true,
            monthlyRate: true,
            dailyRate: true,
          },
        },
        beds: {
          where: { archivedAt: null },
          select: {
            id: true,
            status: true,
          },
        },
      },
    }),
    tx.allocation.findMany({
      where: {
        ownerUserId,
        status: "ACTIVE",
        startDate: { lt: asOfEndExclusiveUtc },
        endDate: { gt: asOfStartUtc },
        room: {
          archivedAt: null,
          ...(buildingFilter ? { building: buildingFilter } : {}),
        },
      },
      select: {
        roomId: true,
        bedId: true,
        scope: true,
        type: true,
      },
    }),
    buildingFilter === "TRANSIENT"
      ? Promise.resolve([])
      : tx.tenantAssignment.findMany({
          where: {
            ownerUserId,
            status: { not: "CANCELLED" },
            startDate: { lt: asOfEndExclusiveUtc },
            OR: [
              {
                actualMoveOutDate: null,
                OR: [{ status: "ACTIVE" }, { endDate: { gte: asOfStartUtc } }],
              },
              { actualMoveOutDate: { gt: asOfStartUtc } },
            ],
          },
          orderBy: [{ room: { number: "asc" } }, { bed: { number: "asc" } }],
          take: filters.limit,
          select: {
            id: true,
            tenantId: true,
            roomId: true,
            startDate: true,
            endDate: true,
            status: true,
            monthlyRate: true,
            securityDeposit: true,
            tenant: {
              select: {
                fullName: true,
              },
            },
            room: {
              select: {
                number: true,
                transientTitle: true,
                roomTypeId: true,
                roomType: { select: { name: true } },
              },
            },
            bed: {
              select: {
                number: true,
              },
            },
          },
        }),
    tx.invoice.findMany({
      where: {
        ownerUserId,
        status: { not: "DRAFT" },
        issuedAt: { not: null, lt: asOfEndExclusiveUtc },
        OR: [{ voidedAt: null }, { voidedAt: { gte: asOfEndExclusiveUtc } }],
        ...(buildingFilter === "BOARDING"
          ? { tenantId: { not: null } }
          : buildingFilter === "TRANSIENT"
            ? { transientGuestId: { not: null } }
            : {}),
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: filters.limit,
      select: {
        id: true,
        invoiceNumber: true,
        tenantId: true,
        transientGuestId: true,
        dueDate: true,
        issuedAt: true,
        subtotalAmount: true,
        snapshotTenantName: true,
        tenant: {
          select: {
            fullName: true,
          },
        },
        transientGuest: {
          select: {
            fullName: true,
          },
        },
        adjustments: {
          where: { createdAt: { lt: asOfEndExclusiveUtc } },
          select: {
            type: true,
            amount: true,
          },
        },
        paymentAllocations: {
          where: {
            payment: {
              paidAt: { lt: asOfEndExclusiveUtc },
            },
          },
          select: {
            amount: true,
          },
        },
      },
    }),
    tx.payment.findMany({
      where: {
        ownerUserId,
        paidAt: {
          gte: periodStartUtc,
          lt: periodEndExclusiveUtc,
        },
        ...(buildingFilter === "BOARDING"
          ? { tenantId: { not: null } }
          : buildingFilter === "TRANSIENT"
            ? { transientGuestId: { not: null } }
            : {}),
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: filters.limit,
      select: {
        id: true,
        receiptNumber: true,
        status: true,
        method: true,
        amount: true,
        unallocatedAmount: true,
        paidAt: true,
        reversalReason: true,
        tenantId: true,
        transientGuestId: true,
        snapshotTenantName: true,
        tenant: {
          select: {
            fullName: true,
          },
        },
        transientGuest: {
          select: {
            fullName: true,
          },
        },
      },
    }),
    buildingFilter === "BOARDING"
      ? Promise.resolve([])
      : tx.transientReservation.findMany({
          where: {
            ownerUserId,
            checkInDateManila: {
              gte: filters.fromDate,
              lte: filters.toDate,
            },
          },
          orderBy: [{ checkInDateManila: "desc" }, { createdAt: "desc" }],
          take: filters.limit,
          select: {
            id: true,
            guestId: true,
            checkInDateManila: true,
            checkOutDateManila: true,
            nights: true,
            dailyRate: true,
            totalAmount: true,
            status: true,
            guest: {
              select: {
                fullName: true,
              },
            },
            room: {
              select: {
                number: true,
                transientTitle: true,
                roomTypeId: true,
                roomType: { select: { name: true } },
              },
            },
            invoices: {
              where: { status: { not: "VOID" } },
              select: {
                totalAmount: true,
                paidAmount: true,
              },
            },
          },
        }),
    tx.maintenanceRequest.findMany({
      where: {
        ownerUserId,
        archivedAt: null,
        ...(buildingFilter ? { room: { building: buildingFilter } } : {}),
        OR: [
          {
            createdAt: {
              gte: periodStartUtc,
              lt: periodEndExclusiveUtc,
            },
          },
          { status: { in: [...OPEN_MAINTENANCE_STATUSES] } },
          {
            resolvedAt: {
              gte: periodStartUtc,
              lt: periodEndExclusiveUtc,
            },
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }],
      take: filters.limit,
      select: {
        id: true,
        title: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        room: {
          select: {
            number: true,
            transientTitle: true,
            building: true,
            roomType: { select: { name: true } },
          },
        },
        holdAllocations: {
          where: { status: "ACTIVE" },
          select: { id: true },
        },
      },
    }),
  ]);

  // 1. Occupancy report
  const allocationsByRoom = new Map<
    string,
    Array<{ bedId: string; scope: string; type: string }>
  >();
  for (const alloc of activeAllocations) {
    const bucket = allocationsByRoom.get(alloc.roomId) ?? [];
    bucket.push({ bedId: alloc.bedId, scope: alloc.scope, type: alloc.type });
    allocationsByRoom.set(alloc.roomId, bucket);
  }

  let occupiedRooms = 0;
  let availableRooms = 0;
  let maintenanceRooms = 0;
  let boardingRoomsTotal = 0;
  let boardingOccupiedRooms = 0;
  let transientRoomsTotal = 0;
  let transientOccupiedRooms = 0;
  let totalBeds = 0;
  let occupiedBedsTotal = 0;
  let availableBedsTotal = 0;
  let maintenanceBedsTotal = 0;

  type BuildingOccAcc = {
    totalRooms: number;
    occupiedRooms: number;
    availableRooms: number;
    maintenanceRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    maintenanceBeds: number;
    potentialMonthly: bigint;
    occupiedMonthly: bigint;
    potentialDaily: bigint;
    occupiedDaily: bigint;
  };
  const buildingOccMap = new Map<RoomBuildingValue, BuildingOccAcc>();
  for (const b of ROOM_BUILDINGS) {
    buildingOccMap.set(b, {
      totalRooms: 0,
      occupiedRooms: 0,
      availableRooms: 0,
      maintenanceRooms: 0,
      totalBeds: 0,
      occupiedBeds: 0,
      availableBeds: 0,
      maintenanceBeds: 0,
      potentialMonthly: ZERO,
      occupiedMonthly: ZERO,
      potentialDaily: ZERO,
      occupiedDaily: ZERO,
    });
  }

  type RoomTypeOccAcc = {
    roomTypeId: string;
    roomTypeName: string;
    building: RoomBuildingValue;
    totalRooms: number;
    occupiedRooms: number;
    availableRooms: number;
    maintenanceRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    monthlySum: bigint;
    monthlyCount: number;
    dailySum: bigint;
    dailyCount: number;
  };
  const roomTypeOccMap = new Map<string, RoomTypeOccAcc>();

  const occupancyRows: OccupancyRoomRowDto[] = rooms.map((room) => {
    const roomAllocs = allocationsByRoom.get(room.id) ?? [];
    const activeNonHoldAllocs = roomAllocs.filter(
      (a) => a.type !== "MAINTENANCE_HOLD",
    );
    const holdBedIds = new Set(
      roomAllocs
        .filter((a) => a.type === "MAINTENANCE_HOLD")
        .map((a) => a.bedId),
    );
    const hasWholeRoomHold = roomAllocs.some(
      (a) => a.type === "MAINTENANCE_HOLD" && a.scope === "WHOLE_ROOM",
    );
    const occupiedBedIds = new Set(activeNonHoldAllocs.map((a) => a.bedId));
    const hasWholeRoomStay = activeNonHoldAllocs.some(
      (a) => a.scope === "WHOLE_ROOM",
    );

    const status = deriveRoomUnitStatus({
      hasActiveHold: holdBedIds.size > 0,
      hasActiveStayOrAssignment: activeNonHoldAllocs.length > 0,
      bedStatuses: room.beds.map((bed) => bed.status),
    });

    if (status === "OCCUPIED") occupiedRooms += 1;
    else if (status === "MAINTENANCE") maintenanceRooms += 1;
    else availableRooms += 1;

    if (room.building === "BOARDING") {
      boardingRoomsTotal += 1;
      if (status === "OCCUPIED") boardingOccupiedRooms += 1;
    } else {
      transientRoomsTotal += 1;
      if (status === "OCCUPIED") transientOccupiedRooms += 1;
    }

    const bedCount = room.beds.length;
    let occBeds = 0;
    let maintBeds = 0;
    let availBeds = 0;
    if (hasWholeRoomHold) {
      maintBeds = bedCount;
    } else if (hasWholeRoomStay) {
      occBeds = bedCount;
    } else {
      for (const bed of room.beds) {
        if (bed.status === "MAINTENANCE" || holdBedIds.has(bed.id)) {
          maintBeds += 1;
        } else if (occupiedBedIds.has(bed.id)) {
          occBeds += 1;
        } else {
          availBeds += 1;
        }
      }
    }

    totalBeds += bedCount;
    occupiedBedsTotal += occBeds;
    availableBedsTotal += availBeds;
    maintenanceBedsTotal += maintBeds;

    const monthlyDecimal =
      room.baseMonthlyRate?.toString() ??
      room.roomType.monthlyRate?.toString() ??
      "0.00";
    const dailyDecimal =
      room.transientDailyRate?.toString() ??
      room.roomType.dailyRate?.toString() ??
      null;

    const monthlyCentavos = parseMoneyDecimal(monthlyDecimal);
    const dailyCentavos = dailyDecimal ? parseMoneyDecimal(dailyDecimal) : ZERO;

    const bAcc = buildingOccMap.get(room.building)!;
    bAcc.totalRooms += 1;
    if (status === "OCCUPIED") bAcc.occupiedRooms += 1;
    else if (status === "MAINTENANCE") bAcc.maintenanceRooms += 1;
    else bAcc.availableRooms += 1;
    bAcc.totalBeds += bedCount;
    bAcc.occupiedBeds += occBeds;
    bAcc.availableBeds += availBeds;
    bAcc.maintenanceBeds += maintBeds;
    if (room.building === "BOARDING") {
      bAcc.potentialMonthly = addMoney(bAcc.potentialMonthly, monthlyCentavos);
      if (status === "OCCUPIED") {
        bAcc.occupiedMonthly = addMoney(bAcc.occupiedMonthly, monthlyCentavos);
      }
    } else if (dailyDecimal) {
      bAcc.potentialDaily = addMoney(bAcc.potentialDaily, dailyCentavos);
      if (status === "OCCUPIED") {
        bAcc.occupiedDaily = addMoney(bAcc.occupiedDaily, dailyCentavos);
      }
    }

    const existingRtAcc = roomTypeOccMap.get(room.roomTypeId);
    const rtAcc: RoomTypeOccAcc = existingRtAcc ?? {
      roomTypeId: room.roomTypeId,
      roomTypeName: room.roomType.name,
      building: room.building,
      totalRooms: 0,
      occupiedRooms: 0,
      availableRooms: 0,
      maintenanceRooms: 0,
      totalBeds: 0,
      occupiedBeds: 0,
      monthlySum: ZERO,
      monthlyCount: 0,
      dailySum: ZERO,
      dailyCount: 0,
    };
    rtAcc.totalRooms += 1;
    if (status === "OCCUPIED") rtAcc.occupiedRooms += 1;
    else if (status === "MAINTENANCE") rtAcc.maintenanceRooms += 1;
    else rtAcc.availableRooms += 1;
    rtAcc.totalBeds += bedCount;
    rtAcc.occupiedBeds += occBeds;
    if (room.building === "BOARDING") {
      rtAcc.monthlySum = addMoney(rtAcc.monthlySum, monthlyCentavos);
      rtAcc.monthlyCount += 1;
    } else if (dailyDecimal) {
      rtAcc.dailySum = addMoney(rtAcc.dailySum, dailyCentavos);
      rtAcc.dailyCount += 1;
    }
    roomTypeOccMap.set(room.roomTypeId, rtAcc);

    return {
      roomId: room.id,
      roomCode: room.number,
      roomName: room.transientTitle ?? room.roomType.name,
      building: room.building,
      floor: room.floor ?? "—",
      isTransientPublished: room.isTransientPublished,
      capacityBeds: room.capacity,
      occupiedBeds: occBeds,
      availableBeds: availBeds,
      maintenanceBeds: maintBeds,
      activeAllocationCount: activeNonHoldAllocs.length,
      status,
      monthlyRate: formatMoneyDecimal(monthlyCentavos),
      transientDailyRate: dailyDecimal
        ? formatMoneyDecimal(dailyCentavos)
        : null,
    };
  });

  const occupancyByBuilding: OccupancyBuildingComparisonDto[] =
    ROOM_BUILDINGS.filter(
      (b) => buildingFilter === undefined || buildingFilter === b,
    ).map((b) => {
      const acc = buildingOccMap.get(b)!;
      return {
        building: b,
        buildingLabel: ROOM_BUILDING_LABELS[b],
        totalRooms: acc.totalRooms,
        occupiedRooms: acc.occupiedRooms,
        availableRooms: acc.availableRooms,
        maintenanceRooms: acc.maintenanceRooms,
        totalBeds: acc.totalBeds,
        occupiedBeds: acc.occupiedBeds,
        availableBeds: acc.availableBeds,
        maintenanceBeds: acc.maintenanceBeds,
        occupancyRatePercent: computeOccupancyPercent(
          acc.occupiedRooms,
          acc.totalRooms,
        ),
        potentialMonthlyRevenue: formatMoneyDecimal(acc.potentialMonthly),
        occupiedMonthlyRevenue: formatMoneyDecimal(acc.occupiedMonthly),
        potentialDailyRateTotal: formatMoneyDecimal(acc.potentialDaily),
        occupiedDailyRateTotal: formatMoneyDecimal(acc.occupiedDaily),
      };
    });

  const occupancyByRoomType: OccupancyRoomTypeComparisonDto[] = Array.from(
    roomTypeOccMap.values(),
  )
    .sort(
      (a, b) =>
        a.building.localeCompare(b.building) ||
        a.roomTypeName.localeCompare(b.roomTypeName),
    )
    .map((acc) => ({
      roomTypeId: acc.roomTypeId,
      roomTypeName: acc.roomTypeName,
      building: acc.building,
      buildingLabel: ROOM_BUILDING_LABELS[acc.building],
      totalRooms: acc.totalRooms,
      occupiedRooms: acc.occupiedRooms,
      availableRooms: acc.availableRooms,
      maintenanceRooms: acc.maintenanceRooms,
      occupancyRatePercent: computeOccupancyPercent(
        acc.occupiedRooms,
        acc.totalRooms,
      ),
      totalBeds: acc.totalBeds,
      occupiedBeds: acc.occupiedBeds,
      avgMonthlyRate: computePerUnitMoney(
        formatMoneyDecimal(acc.monthlySum),
        acc.monthlyCount,
      ),
      avgDailyRate: computePerUnitMoney(
        formatMoneyDecimal(acc.dailySum),
        acc.dailyCount,
      ),
    }));

  // 2. Receivables aging as of asOfDate (shared open balance map with Rent Roll)
  const openBalanceByTenantId = new Map<string, bigint>();
  const bucketMap = new Map<
    AgingBucketValue,
    { count: number; totalCentavos: bigint }
  >();
  for (const bucket of AGING_BUCKETS) {
    bucketMap.set(bucket, { count: 0, totalCentavos: ZERO });
  }

  const agingScopeMap = new Map<
    "BOARDING" | "TRANSIENT",
    {
      openCount: number;
      overdueCount: number;
      outstanding: bigint;
      overdue: bigint;
    }
  >([
    [
      "BOARDING",
      { openCount: 0, overdueCount: 0, outstanding: ZERO, overdue: ZERO },
    ],
    [
      "TRANSIENT",
      { openCount: 0, overdueCount: 0, outstanding: ZERO, overdue: ZERO },
    ],
  ]);

  let totalOutstandingCentavos = ZERO;
  let overdueInvoicesCount = 0;
  let overdueAmountCentavos = ZERO;
  const agingRows: ReceivablesAgingRowDto[] = [];

  for (const invoice of invoices) {
    const subtotalCentavos = parseMoneyDecimal(
      invoice.subtotalAmount.toString(),
    );
    let adjustmentNetCentavos = ZERO;
    for (const adj of invoice.adjustments) {
      const adjCentavos = parseMoneyDecimal(adj.amount.toString());
      adjustmentNetCentavos =
        adj.type === "CHARGE"
          ? addMoney(adjustmentNetCentavos, adjCentavos)
          : subtractMoney(adjustmentNetCentavos, adjCentavos);
    }
    const rawTotalCentavos = addMoney(subtotalCentavos, adjustmentNetCentavos);
    const totalCentavos = rawTotalCentavos < ZERO ? ZERO : rawTotalCentavos;

    let paidAsOfCentavos = ZERO;
    for (const alloc of invoice.paymentAllocations) {
      paidAsOfCentavos = addMoney(
        paidAsOfCentavos,
        parseMoneyDecimal(alloc.amount.toString()),
      );
    }
    if (paidAsOfCentavos < ZERO) paidAsOfCentavos = ZERO;

    const balanceDueCentavos = subtractMoney(totalCentavos, paidAsOfCentavos);
    if (balanceDueCentavos <= ZERO) {
      continue;
    }

    if (invoice.tenantId) {
      openBalanceByTenantId.set(
        invoice.tenantId,
        addMoney(
          openBalanceByTenantId.get(invoice.tenantId) ?? ZERO,
          balanceDueCentavos,
        ),
      );
    }

    const dueDateManila = toManilaDate(invoice.dueDate);
    const issuedDateManila = toManilaDate(invoice.issuedAt ?? invoice.dueDate);
    const rawDaysPastDue = diffManilaDays(dueDateManila, filters.asOfDate);
    const daysPastDue = rawDaysPastDue > 0 ? rawDaysPastDue : 0;
    const bucket = getAgingBucket(rawDaysPastDue);
    const scope: "BOARDING" | "TRANSIENT" = invoice.tenantId
      ? "BOARDING"
      : "TRANSIENT";

    totalOutstandingCentavos = addMoney(
      totalOutstandingCentavos,
      balanceDueCentavos,
    );
    if (bucket !== "CURRENT") {
      overdueInvoicesCount += 1;
      overdueAmountCentavos = addMoney(
        overdueAmountCentavos,
        balanceDueCentavos,
      );
    }

    const scopeAcc = agingScopeMap.get(scope)!;
    scopeAcc.openCount += 1;
    scopeAcc.outstanding = addMoney(scopeAcc.outstanding, balanceDueCentavos);
    if (bucket !== "CURRENT") {
      scopeAcc.overdueCount += 1;
      scopeAcc.overdue = addMoney(scopeAcc.overdue, balanceDueCentavos);
    }

    const agg = bucketMap.get(bucket)!;
    agg.count += 1;
    agg.totalCentavos = addMoney(agg.totalCentavos, balanceDueCentavos);

    const partyName =
      invoice.tenant?.fullName ??
      invoice.transientGuest?.fullName ??
      invoice.snapshotTenantName ??
      "Account";

    agingRows.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? "Draft",
      scope,
      partyName,
      issuedDate: issuedDateManila,
      dueDate: dueDateManila,
      daysPastDue,
      bucket,
      totalAmount: formatMoneyDecimal(totalCentavos),
      paidAsOfAmount: formatMoneyDecimal(paidAsOfCentavos),
      balanceDue: formatMoneyDecimal(balanceDueCentavos),
    });
  }

  const agingBuckets: ReceivablesAgingBucketDto[] = AGING_BUCKETS.map(
    (bucket) => {
      const entry = bucketMap.get(bucket)!;
      return {
        bucket,
        label: AGING_BUCKET_LABELS[bucket],
        count: entry.count,
        outstandingAmount: formatMoneyDecimal(entry.totalCentavos),
      };
    },
  );

  const agingByScope: ReceivablesScopeComparisonDto[] = (
    ["BOARDING", "TRANSIENT"] as const
  )
    .filter((s) => buildingFilter === undefined || buildingFilter === s)
    .map((scope) => {
      const acc = agingScopeMap.get(scope)!;
      return {
        scope,
        scopeLabel: ROOM_BUILDING_LABELS[scope],
        openInvoicesCount: acc.openCount,
        overdueInvoicesCount: acc.overdueCount,
        outstandingAmount: formatMoneyDecimal(acc.outstanding),
        overdueAmount: formatMoneyDecimal(acc.overdue),
      };
    });

  // 3. Rent roll
  let totalMonthlyRentCentavos = ZERO;
  let totalSecurityDepositsCentavos = ZERO;
  const seenRentRollTenantIds = new Set<string>();
  let totalRentRollOpenBalanceCentavos = ZERO;

  const rentRollRtMap = new Map<
    string,
    {
      roomTypeId: string;
      roomTypeName: string;
      activeAssignments: number;
      monthlyRent: bigint;
      deposits: bigint;
      openBalance: bigint;
      seenTenants: Set<string>;
    }
  >();

  const expiryMap = new Map<
    LeaseExpiryBucketValue,
    { count: number; monthlyRentAtRisk: bigint }
  >();
  for (const b of LEASE_EXPIRY_BUCKETS) {
    expiryMap.set(b, { count: 0, monthlyRentAtRisk: ZERO });
  }

  const rentRollRows: RentRollRowDto[] = assignments.map((assignment) => {
    const monthlyRateCentavos = parseMoneyDecimal(
      assignment.monthlyRate.toString(),
    );
    const depositCentavos = parseMoneyDecimal(
      assignment.securityDeposit.toString(),
    );
    totalMonthlyRentCentavos = addMoney(
      totalMonthlyRentCentavos,
      monthlyRateCentavos,
    );
    totalSecurityDepositsCentavos = addMoney(
      totalSecurityDepositsCentavos,
      depositCentavos,
    );
    const tenantOpenCentavos =
      openBalanceByTenantId.get(assignment.tenantId) ?? ZERO;
    if (!seenRentRollTenantIds.has(assignment.tenantId)) {
      seenRentRollTenantIds.add(assignment.tenantId);
      totalRentRollOpenBalanceCentavos = addMoney(
        totalRentRollOpenBalanceCentavos,
        tenantOpenCentavos,
      );
    }

    const rtKey = assignment.room.roomTypeId;
    const rtEntry = rentRollRtMap.get(rtKey) ?? {
      roomTypeId: rtKey,
      roomTypeName: assignment.room.roomType.name,
      activeAssignments: 0,
      monthlyRent: ZERO,
      deposits: ZERO,
      openBalance: ZERO,
      seenTenants: new Set<string>(),
    };
    rtEntry.activeAssignments += 1;
    rtEntry.monthlyRent = addMoney(rtEntry.monthlyRent, monthlyRateCentavos);
    rtEntry.deposits = addMoney(rtEntry.deposits, depositCentavos);
    if (!rtEntry.seenTenants.has(assignment.tenantId)) {
      rtEntry.seenTenants.add(assignment.tenantId);
      rtEntry.openBalance = addMoney(rtEntry.openBalance, tenantOpenCentavos);
    }
    rentRollRtMap.set(rtKey, rtEntry);

    const endDateManila = toManilaDate(assignment.endDate);
    const expiryBucket = classifyLeaseExpiryBucket(
      endDateManila,
      filters.asOfDate,
    );
    const expAcc = expiryMap.get(expiryBucket)!;
    expAcc.count += 1;
    expAcc.monthlyRentAtRisk = addMoney(
      expAcc.monthlyRentAtRisk,
      monthlyRateCentavos,
    );

    return {
      assignmentId: assignment.id,
      tenantId: assignment.tenantId,
      tenantName: assignment.tenant.fullName,
      roomId: assignment.roomId,
      roomCode: assignment.room.number,
      roomName: assignment.room.transientTitle ?? assignment.room.roomType.name,
      bedCode: assignment.bed.number,
      startDate: toManilaDate(assignment.startDate),
      endDate: endDateManila,
      status: assignment.status,
      monthlyRate: formatMoneyDecimal(monthlyRateCentavos),
      securityDeposit: formatMoneyDecimal(depositCentavos),
      openInvoiceBalance: formatMoneyDecimal(tenantOpenCentavos),
    };
  });

  const rentRollByRoomType: RentRollRoomTypeSummaryDto[] = Array.from(
    rentRollRtMap.values(),
  )
    .sort((a, b) => a.roomTypeName.localeCompare(b.roomTypeName))
    .map((entry) => ({
      roomTypeId: entry.roomTypeId,
      roomTypeName: entry.roomTypeName,
      activeAssignments: entry.activeAssignments,
      sharePercent: computeSharePercent(
        entry.activeAssignments,
        rentRollRows.length,
      ),
      totalMonthlyRent: formatMoneyDecimal(entry.monthlyRent),
      totalSecurityDeposits: formatMoneyDecimal(entry.deposits),
      totalOpenBalance: formatMoneyDecimal(entry.openBalance),
    }));

  const rentRollExpiries: RentRollExpiryBucketDto[] = LEASE_EXPIRY_BUCKETS.map(
    (bucket) => {
      const entry = expiryMap.get(bucket)!;
      return {
        bucket,
        label: LEASE_EXPIRY_BUCKET_LABELS[bucket],
        count: entry.count,
        monthlyRentAtRisk: formatMoneyDecimal(entry.monthlyRentAtRisk),
      };
    },
  );

  // 4. Collections by period & method
  let postedCount = 0;
  let reversedCount = 0;
  let reversalCount = 0;
  let grossPostedCentavos = ZERO;
  let totalReversalsCentavos = ZERO;
  let netCollectedCentavos = ZERO;
  let unallocatedCreditCentavos = ZERO;

  const methodAggMap = new Map<
    PaymentMethodValue,
    { entryCount: number; posted: bigint; reversal: bigint; net: bigint }
  >();
  for (const method of PAYMENT_METHODS) {
    methodAggMap.set(method, {
      entryCount: 0,
      posted: ZERO,
      reversal: ZERO,
      net: ZERO,
    });
  }

  const scopeCollectionMap = new Map<
    "BOARDING" | "TRANSIENT",
    { entryCount: number; posted: bigint; reversal: bigint; net: bigint }
  >([
    ["BOARDING", { entryCount: 0, posted: ZERO, reversal: ZERO, net: ZERO }],
    ["TRANSIENT", { entryCount: 0, posted: ZERO, reversal: ZERO, net: ZERO }],
  ]);

  const collectionRows: CollectionsRowDto[] = paymentsInWindow.map(
    (payment) => {
      const amountCentavos = parseMoneyDecimal(payment.amount.toString());
      const unallocatedCentavos = parseMoneyDecimal(
        payment.unallocatedAmount.toString(),
      );
      const scope: "BOARDING" | "TRANSIENT" = payment.tenantId
        ? "BOARDING"
        : "TRANSIENT";

      const methodAgg = methodAggMap.get(payment.method)!;
      methodAgg.entryCount += 1;
      methodAgg.net = addMoney(methodAgg.net, amountCentavos);

      const scopeAgg = scopeCollectionMap.get(scope)!;
      scopeAgg.entryCount += 1;
      scopeAgg.net = addMoney(scopeAgg.net, amountCentavos);

      netCollectedCentavos = addMoney(netCollectedCentavos, amountCentavos);
      if (payment.status === "POSTED" && unallocatedCentavos > ZERO) {
        unallocatedCreditCentavos = addMoney(
          unallocatedCreditCentavos,
          unallocatedCentavos,
        );
      }

      if (payment.status === "REVERSAL") {
        reversalCount += 1;
        totalReversalsCentavos = addMoney(
          totalReversalsCentavos,
          amountCentavos,
        );
        methodAgg.reversal = addMoney(methodAgg.reversal, amountCentavos);
        scopeAgg.reversal = addMoney(scopeAgg.reversal, amountCentavos);
      } else {
        if (payment.status === "POSTED") postedCount += 1;
        else reversedCount += 1;
        grossPostedCentavos = addMoney(grossPostedCentavos, amountCentavos);
        methodAgg.posted = addMoney(methodAgg.posted, amountCentavos);
        scopeAgg.posted = addMoney(scopeAgg.posted, amountCentavos);
      }

      const partyName =
        payment.tenant?.fullName ??
        payment.transientGuest?.fullName ??
        payment.snapshotTenantName ??
        "Account";

      return {
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber,
        paidDate: toManilaDate(payment.paidAt),
        paidAt: payment.paidAt.toISOString(),
        status: payment.status,
        method: payment.method,
        scope,
        partyName,
        amount: formatMoneyDecimal(amountCentavos),
        unallocatedAmount: formatMoneyDecimal(unallocatedCentavos),
        reversalReason: payment.reversalReason,
      };
    },
  );

  const collectionsByMethod: CollectionsMethodSummaryDto[] =
    PAYMENT_METHODS.map((method) => {
      const agg = methodAggMap.get(method)!;
      return {
        method,
        methodLabel: PAYMENT_METHOD_LABELS[method],
        entryCount: agg.entryCount,
        postedAmount: formatMoneyDecimal(agg.posted),
        reversalAmount: formatMoneyDecimal(agg.reversal),
        netAmount: formatMoneyDecimal(agg.net),
      };
    });

  const collectionsByScope: CollectionsScopeSummaryDto[] = (
    ["BOARDING", "TRANSIENT"] as const
  )
    .filter((s) => buildingFilter === undefined || buildingFilter === s)
    .map((scope) => {
      const agg = scopeCollectionMap.get(scope)!;
      return {
        scope,
        scopeLabel: ROOM_BUILDING_LABELS[scope],
        entryCount: agg.entryCount,
        postedAmount: formatMoneyDecimal(agg.posted),
        reversalAmount: formatMoneyDecimal(agg.reversal),
        netAmount: formatMoneyDecimal(agg.net),
      };
    });

  const collectionsDailyTrend = buildCollectionTrendPoints(
    filters.fromDate,
    filters.toDate,
    collectionRows.map((row) => ({
      paidDate: row.paidDate,
      status: row.status,
      amount: row.amount,
    })),
  );

  // 5. Transient revenue
  let activeOrCompletedCount = 0;
  let cancelledCount = 0;
  let noShowCount = 0;
  let totalTransientNights = 0;
  let grossStayRevenueCentavos = ZERO;
  let totalTransientInvoicedCentavos = ZERO;
  let totalTransientCollectedCentavos = ZERO;

  const transientStatusMap = new Map<
    TransientReservationStatusValue,
    {
      staysCount: number;
      totalNights: number;
      stayAmount: bigint;
      invoiced: bigint;
      collected: bigint;
    }
  >();
  for (const status of TRANSIENT_RESERVATION_STATUSES) {
    transientStatusMap.set(status, {
      staysCount: 0,
      totalNights: 0,
      stayAmount: ZERO,
      invoiced: ZERO,
      collected: ZERO,
    });
  }

  const transientRtMap = new Map<
    string,
    {
      roomTypeId: string;
      roomTypeName: string;
      staysCount: number;
      activeOrCompletedCount: number;
      cancelledOrNoShowCount: number;
      totalNights: number;
      grossStayRevenue: bigint;
      invoicedAmount: bigint;
      collectedAmount: bigint;
    }
  >();

  const transientRows: TransientRevenueRowDto[] = transientReservations.map(
    (stay) => {
      const dailyRateCentavos = parseMoneyDecimal(stay.dailyRate.toString());
      const stayTotalCentavos = parseMoneyDecimal(stay.totalAmount.toString());

      let invoicedCentavos = ZERO;
      let collectedCentavos = ZERO;
      for (const inv of stay.invoices) {
        invoicedCentavos = addMoney(
          invoicedCentavos,
          parseMoneyDecimal(inv.totalAmount.toString()),
        );
        collectedCentavos = addMoney(
          collectedCentavos,
          parseMoneyDecimal(inv.paidAmount.toString()),
        );
      }

      if (stay.status === "CANCELLED") {
        cancelledCount += 1;
      } else if (stay.status === "NO_SHOW") {
        noShowCount += 1;
      } else {
        activeOrCompletedCount += 1;
        totalTransientNights += stay.nights;
        grossStayRevenueCentavos = addMoney(
          grossStayRevenueCentavos,
          stayTotalCentavos,
        );
      }

      totalTransientInvoicedCentavos = addMoney(
        totalTransientInvoicedCentavos,
        invoicedCentavos,
      );
      totalTransientCollectedCentavos = addMoney(
        totalTransientCollectedCentavos,
        collectedCentavos,
      );

      const stAgg = transientStatusMap.get(stay.status)!;
      stAgg.staysCount += 1;
      stAgg.totalNights += stay.nights;
      stAgg.stayAmount = addMoney(stAgg.stayAmount, stayTotalCentavos);
      stAgg.invoiced = addMoney(stAgg.invoiced, invoicedCentavos);
      stAgg.collected = addMoney(stAgg.collected, collectedCentavos);

      const rtId = stay.room.roomTypeId;
      const rtAgg = transientRtMap.get(rtId) ?? {
        roomTypeId: rtId,
        roomTypeName: stay.room.roomType.name,
        staysCount: 0,
        activeOrCompletedCount: 0,
        cancelledOrNoShowCount: 0,
        totalNights: 0,
        grossStayRevenue: ZERO,
        invoicedAmount: ZERO,
        collectedAmount: ZERO,
      };
      rtAgg.staysCount += 1;
      if (stay.status === "CANCELLED" || stay.status === "NO_SHOW") {
        rtAgg.cancelledOrNoShowCount += 1;
      } else {
        rtAgg.activeOrCompletedCount += 1;
        rtAgg.totalNights += stay.nights;
        rtAgg.grossStayRevenue = addMoney(
          rtAgg.grossStayRevenue,
          stayTotalCentavos,
        );
      }
      rtAgg.invoicedAmount = addMoney(rtAgg.invoicedAmount, invoicedCentavos);
      rtAgg.collectedAmount = addMoney(
        rtAgg.collectedAmount,
        collectedCentavos,
      );
      transientRtMap.set(rtId, rtAgg);

      return {
        reservationId: stay.id,
        guestId: stay.guestId,
        guestName: stay.guest.fullName,
        roomCode: stay.room.number,
        roomName: stay.room.transientTitle ?? stay.room.roomType.name,
        checkInDate: stay.checkInDateManila,
        checkOutDate: stay.checkOutDateManila,
        nights: stay.nights,
        status: stay.status,
        dailyRate: formatMoneyDecimal(dailyRateCentavos),
        totalAmount: formatMoneyDecimal(stayTotalCentavos),
        invoicedAmount: formatMoneyDecimal(invoicedCentavos),
        collectedAmount: formatMoneyDecimal(collectedCentavos),
      };
    },
  );

  const transientByStatus: TransientStatusSummaryDto[] =
    TRANSIENT_RESERVATION_STATUSES.map((status) => {
      const agg = transientStatusMap.get(status)!;
      return {
        status,
        statusLabel: TRANSIENT_RESERVATION_STATUS_LABELS[status],
        staysCount: agg.staysCount,
        totalNights: agg.totalNights,
        stayAmount: formatMoneyDecimal(agg.stayAmount),
        invoicedAmount: formatMoneyDecimal(agg.invoiced),
        collectedAmount: formatMoneyDecimal(agg.collected),
      };
    });

  const transientByRoomType: TransientRoomTypeSummaryDto[] = Array.from(
    transientRtMap.values(),
  )
    .sort((a, b) => a.roomTypeName.localeCompare(b.roomTypeName))
    .map((agg) => ({
      roomTypeId: agg.roomTypeId,
      roomTypeName: agg.roomTypeName,
      staysCount: agg.staysCount,
      activeOrCompletedCount: agg.activeOrCompletedCount,
      cancelledOrNoShowCount: agg.cancelledOrNoShowCount,
      totalNights: agg.totalNights,
      grossStayRevenue: formatMoneyDecimal(agg.grossStayRevenue),
      invoicedAmount: formatMoneyDecimal(agg.invoicedAmount),
      collectedAmount: formatMoneyDecimal(agg.collectedAmount),
    }));

  // 6. Maintenance summary
  let maintOpenCount = 0;
  let maintUrgentOpenCount = 0;
  let maintActiveHoldCount = 0;
  let maintResolvedInWindow = 0;
  let maintCancelledInWindow = 0;
  let resolvedDurationDaysSum = 0;
  let resolvedDurationCount = 0;

  const maintCategoryMap = new Map<
    MaintenanceCategoryValue,
    { total: number; open: number; activeHolds: number; resolved: number }
  >();
  for (const cat of MAINTENANCE_CATEGORIES) {
    maintCategoryMap.set(cat, {
      total: 0,
      open: 0,
      activeHolds: 0,
      resolved: 0,
    });
  }

  const maintPriorityMap = new Map<
    MaintenancePriorityValue,
    { total: number; open: number; activeHolds: number; resolved: number }
  >();
  for (const prio of MAINTENANCE_PRIORITIES) {
    maintPriorityMap.set(prio, {
      total: 0,
      open: 0,
      activeHolds: 0,
      resolved: 0,
    });
  }

  const maintBuildingMap = new Map<
    RoomBuildingValue,
    { total: number; open: number; activeHolds: number; resolved: number }
  >();
  for (const b of ROOM_BUILDINGS) {
    maintBuildingMap.set(b, {
      total: 0,
      open: 0,
      activeHolds: 0,
      resolved: 0,
    });
  }

  const maintenanceRows: MaintenanceReportRowDto[] = maintenanceRequests.map(
    (req) => {
      const isOpen =
        req.status === "OPEN" ||
        req.status === "IN_PROGRESS" ||
        req.status === "WAITING_PARTS";
      const blocksOccupancy = req.holdAllocations.length > 0;
      const reportedDate = toManilaDate(req.createdAt);
      const resolvedDate = req.resolvedAt ? toManilaDate(req.resolvedAt) : null;

      if (isOpen) {
        maintOpenCount += 1;
        if (req.priority === "URGENT") maintUrgentOpenCount += 1;
        if (blocksOccupancy) maintActiveHoldCount += 1;
      }
      if (
        req.status === "RESOLVED" &&
        resolvedDate !== null &&
        resolvedDate >= filters.fromDate &&
        resolvedDate <= filters.toDate
      ) {
        maintResolvedInWindow += 1;
        resolvedDurationDaysSum += Math.max(
          0,
          diffManilaDays(reportedDate, resolvedDate),
        );
        resolvedDurationCount += 1;
      }
      if (req.status === "CANCELLED") {
        maintCancelledInWindow += 1;
      }

      const catAgg = maintCategoryMap.get(req.category)!;
      catAgg.total += 1;
      if (isOpen) {
        catAgg.open += 1;
        if (blocksOccupancy) catAgg.activeHolds += 1;
      }
      if (req.status === "RESOLVED") catAgg.resolved += 1;

      const prioAgg = maintPriorityMap.get(req.priority)!;
      prioAgg.total += 1;
      if (isOpen) {
        prioAgg.open += 1;
        if (blocksOccupancy) prioAgg.activeHolds += 1;
      }
      if (req.status === "RESOLVED") prioAgg.resolved += 1;

      const bldgAgg = maintBuildingMap.get(req.room.building)!;
      bldgAgg.total += 1;
      if (isOpen) {
        bldgAgg.open += 1;
        if (blocksOccupancy) bldgAgg.activeHolds += 1;
      }
      if (req.status === "RESOLVED") bldgAgg.resolved += 1;

      return {
        requestId: req.id,
        roomCode: req.room.number,
        roomName: req.room.transientTitle ?? req.room.roomType.name,
        building: req.room.building,
        title: req.title,
        category: req.category,
        priority: req.priority,
        status: req.status,
        blocksOccupancy,
        reportedDate,
        resolvedDate,
      };
    },
  );

  const maintenanceByCategory: MaintenanceCategorySummaryDto[] =
    MAINTENANCE_CATEGORIES.map((category) => {
      const agg = maintCategoryMap.get(category)!;
      return {
        category,
        categoryLabel: MAINTENANCE_CATEGORY_LABELS[category],
        totalCount: agg.total,
        openCount: agg.open,
        activeHoldCount: agg.activeHolds,
        resolvedCount: agg.resolved,
      };
    });

  const maintenanceByPriority: MaintenancePrioritySummaryDto[] =
    MAINTENANCE_PRIORITIES.map((priority) => {
      const agg = maintPriorityMap.get(priority)!;
      return {
        priority,
        priorityLabel: MAINTENANCE_PRIORITY_LABELS[priority],
        totalCount: agg.total,
        openCount: agg.open,
        activeHoldCount: agg.activeHolds,
        resolvedCount: agg.resolved,
      };
    });

  const maintenanceByBuilding: MaintenanceBuildingSummaryDto[] =
    ROOM_BUILDINGS.filter(
      (b) => buildingFilter === undefined || buildingFilter === b,
    ).map((building) => {
      const agg = maintBuildingMap.get(building)!;
      return {
        building,
        buildingLabel: ROOM_BUILDING_LABELS[building],
        totalCount: agg.total,
        openCount: agg.open,
        activeHoldCount: agg.activeHolds,
        resolvedCount: agg.resolved,
      };
    });

  const totalMonthlyRentStr = formatMoneyDecimal(totalMonthlyRentCentavos);
  const totalOpenBalanceStr = formatMoneyDecimal(
    totalRentRollOpenBalanceCentavos,
  );
  const grossPostedStr = formatMoneyDecimal(grossPostedCentavos);
  const absReversalStr = formatMoneyDecimal(
    totalReversalsCentavos < ZERO
      ? -totalReversalsCentavos
      : totalReversalsCentavos,
  );
  const grossStayRevenueStr = formatMoneyDecimal(grossStayRevenueCentavos);
  const totalTransientCollectedStr = formatMoneyDecimal(
    totalTransientCollectedCentavos,
  );

  return {
    filters: {
      asOfDate: filters.asOfDate,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      building: filters.building,
    },
    generatedAt: nowUtc.toISOString(),
    occupancy: {
      summary: {
        totalRooms: rooms.length,
        occupiedRooms,
        availableRooms,
        maintenanceRooms,
        boardingRooms: boardingRoomsTotal,
        transientRooms: transientRoomsTotal,
        totalBeds,
        occupiedBeds: occupiedBedsTotal,
        availableBeds: availableBedsTotal,
        maintenanceBeds: maintenanceBedsTotal,
        occupancyRatePercent: computeOccupancyPercent(
          occupiedRooms,
          rooms.length,
        ),
        boardingOccupancyRatePercent: computeOccupancyPercent(
          boardingOccupiedRooms,
          boardingRoomsTotal,
        ),
        transientOccupancyRatePercent: computeOccupancyPercent(
          transientOccupiedRooms,
          transientRoomsTotal,
        ),
      },
      byBuilding: occupancyByBuilding,
      byRoomType: occupancyByRoomType,
      rows: occupancyRows,
    },
    rentRoll: {
      summary: {
        activeAssignments: rentRollRows.length,
        totalMonthlyRent: totalMonthlyRentStr,
        totalSecurityDeposits: formatMoneyDecimal(
          totalSecurityDepositsCentavos,
        ),
        totalOpenBalance: totalOpenBalanceStr,
        averageMonthlyRent: computePerUnitMoney(
          totalMonthlyRentStr,
          rentRollRows.length,
        ),
        openBalanceToRentPercent: computeMoneyRatioPercent(
          totalOpenBalanceStr,
          totalMonthlyRentStr,
        ),
      },
      byRoomType: rentRollByRoomType,
      leaseExpiries: rentRollExpiries,
      rows: rentRollRows,
    },
    receivablesAging: {
      summary: {
        openInvoicesCount: agingRows.length,
        overdueInvoicesCount,
        totalOutstanding: formatMoneyDecimal(totalOutstandingCentavos),
        overdueAmount: formatMoneyDecimal(overdueAmountCentavos),
        currentAmount: agingBuckets[0]!.outstandingAmount,
        bucket1To30Amount: agingBuckets[1]!.outstandingAmount,
        bucket31To60Amount: agingBuckets[2]!.outstandingAmount,
        bucket61To90Amount: agingBuckets[3]!.outstandingAmount,
        bucket91PlusAmount: agingBuckets[4]!.outstandingAmount,
      },
      buckets: agingBuckets,
      byScope: agingByScope,
      rows: agingRows,
    },
    collections: {
      summary: {
        entryCount: collectionRows.length,
        postedCount,
        reversedCount,
        reversalCount,
        grossPostedAmount: grossPostedStr,
        totalReversalsAmount: formatMoneyDecimal(totalReversalsCentavos),
        netCollectedAmount: formatMoneyDecimal(netCollectedCentavos),
        unallocatedCreditTotal: formatMoneyDecimal(unallocatedCreditCentavos),
        reversalRatePercent: computeMoneyRatioPercent(
          absReversalStr,
          grossPostedStr,
        ),
      },
      byMethod: collectionsByMethod,
      byScope: collectionsByScope,
      dailyTrend: collectionsDailyTrend,
      rows: collectionRows,
    },
    transientRevenue: {
      summary: {
        staysCount: transientRows.length,
        activeOrCompletedCount,
        cancelledCount,
        noShowCount,
        totalNights: totalTransientNights,
        grossStayRevenue: grossStayRevenueStr,
        invoicedAmount: formatMoneyDecimal(totalTransientInvoicedCentavos),
        collectedAmount: totalTransientCollectedStr,
        averageDailyRate: computePerUnitMoney(
          grossStayRevenueStr,
          totalTransientNights,
        ),
        averageNightsPerStay: formatOneDecimalAverage(
          totalTransientNights,
          activeOrCompletedCount,
        ),
        collectionRatePercent: computeMoneyRatioPercent(
          totalTransientCollectedStr,
          grossStayRevenueStr,
        ),
      },
      byStatus: transientByStatus,
      byRoomType: transientByRoomType,
      rows: transientRows,
    },
    maintenance: {
      summary: {
        totalInWindow: maintenanceRows.length,
        openCount: maintOpenCount,
        urgentOpenCount: maintUrgentOpenCount,
        activeHoldCount: maintActiveHoldCount,
        resolvedInWindow: maintResolvedInWindow,
        cancelledInWindow: maintCancelledInWindow,
        resolutionRatePercent:
          maintenanceRows.length > 0
            ? computeSharePercent(maintResolvedInWindow, maintenanceRows.length)
            : null,
        avgResolutionDays: formatOneDecimalAverage(
          resolvedDurationDaysSum,
          resolvedDurationCount,
        ),
      },
      byCategory: maintenanceByCategory,
      byPriority: maintenanceByPriority,
      byBuilding: maintenanceByBuilding,
      rows: maintenanceRows,
    },
  };
}

/**
 * Computes all six Owner-scoped operational reports inside a single repeatable-read
 * PostgreSQL snapshot. Read-only: writes zero audit or notification records.
 */
export async function getReportsOverview(
  ownerUserId: string,
  rawFilters: Record<string, unknown> = {},
  nowUtc: Date = new Date(),
): Promise<ReportsOverviewDto> {
  let filters: ResolvedReportFilters;
  try {
    filters = resolveReportFilters(rawFilters, nowUtc);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : "Check report filter values.",
    );
  }

  return getDatabase().$transaction(
    (tx) => computeReportsOverviewInTx(tx, ownerUserId, filters, nowUtc),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5000,
      timeout: 15000,
    },
  );
}

/**
 * Generates a bounded report export in CSV, Excel (`.xlsx`), Word (`.docx`), or
 * PDF (`.pdf`) using Daisy's shared report template, enforces the DB-backed export
 * rate limit, and records an identifier-only `report.exported` audit entry.
 */
export async function exportReport(
  ownerUserId: string,
  rawReportType: unknown,
  rawFormat: unknown = "csv",
  rawFilters: Record<string, unknown> = {},
  nowUtc: Date = new Date(),
): Promise<{
  reportType: ReportTypeValue;
  format: ReportExportFormat;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  rowCount: number;
  auditLogId: string;
}> {
  const parsedQuery = ReportExportQuerySchema.safeParse({
    reportType: rawReportType,
    format: rawFormat,
  });
  if (!parsedQuery.success) {
    throw new ValidationError(
      parsedQuery.error.issues[0]?.message ??
        "Select a valid report and export format.",
    );
  }

  let filters: ResolvedReportFilters;
  try {
    filters = resolveReportFilters(rawFilters, nowUtc);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : "Check report filter values.",
    );
  }

  const retryAfter = await consumeReportExportLimit(ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many report exports requested. Wait a moment and try again.",
    );
  }

  const { reportType, format } = parsedQuery.data;

  const { overview, doc, auditLogId } = await getDatabase().$transaction(
    async (tx) => {
      const [overviewResult, businessSettings] = await Promise.all([
        computeReportsOverviewInTx(tx, ownerUserId, filters, nowUtc),
        tx.businessSettings.findUnique({
          where: { ownerUserId },
          select: {
            businessName: true,
            businessAddress: true,
            businessPhone: true,
            tin: true,
          },
        }),
      ]);

      const reportDoc = buildSharedReportDocument(
        reportType,
        overviewResult,
        businessSettings ?? undefined,
      );

      const auditEntry = await writeAuditEntry(tx, {
        ownerUserId,
        area: "reports",
        action: "report.exported",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "report",
        entityId: reportType,
        metadata: {
          reportType,
          format,
          asOfDate: overviewResult.filters.asOfDate,
          fromDate: overviewResult.filters.fromDate,
          toDate: overviewResult.filters.toDate,
          building: overviewResult.filters.building,
          rowCount: reportDoc.rowCount,
        },
      });

      return {
        overview: overviewResult,
        doc: reportDoc,
        auditLogId: auditEntry.id,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5000,
      timeout: 15000,
    },
  );

  let bytes: Uint8Array;
  switch (format) {
    case "xlsx":
      bytes = await buildReportExcel(doc);
      break;
    case "docx":
      bytes = await buildReportWord(doc);
      break;
    case "pdf":
      bytes = await buildReportPdf(doc);
      break;
    case "csv":
      bytes = new TextEncoder().encode(buildReportCsv(reportType, overview));
      break;
  }

  return {
    reportType,
    format,
    filename: buildReportExportFilename(reportType, overview.filters, format),
    contentType: REPORT_EXPORT_CONTENT_TYPES[format],
    bytes,
    rowCount: doc.rowCount,
    auditLogId,
  };
}

/**
 * Generates a bounded CSV export for one report, enforces the database-backed
 * rate limit, and writes an identifier-only `report.exported` audit entry before
 * returning the attachment content.
 */
export async function exportReportCsv(
  ownerUserId: string,
  rawReportType: unknown,
  rawFilters: Record<string, unknown> = {},
  nowUtc: Date = new Date(),
): Promise<{
  reportType: ReportTypeValue;
  filename: string;
  csv: string;
  rowCount: number;
  auditLogId: string;
}> {
  const result = await exportReport(
    ownerUserId,
    rawReportType,
    "csv",
    rawFilters,
    nowUtc,
  );
  return {
    reportType: result.reportType,
    filename: result.filename,
    csv: new TextDecoder().decode(result.bytes),
    rowCount: result.rowCount,
    auditLogId: result.auditLogId,
  };
}
