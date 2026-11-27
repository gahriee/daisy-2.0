import "server-only";
import {
  addManilaDays,
  diffManilaDays,
  manilaDateTimeToUtc,
  toManilaDate,
} from "@/lib/dates";
import {
  addMoney,
  formatMoneyDecimal,
  parseMoneyDecimal,
  subtractMoney,
} from "@/lib/money";
import { getDatabase } from "@/server/db/client";
import {
  computeOccupancyPercent,
  deriveRoomUnitStatus,
  getManilaMonthWindow,
  getPreviousManilaMonthWindow,
} from "./calculations";
import type {
  DashboardBuildingOccupancyDto,
  DashboardDueInvoiceDto,
  DashboardSnapshotDto,
  DashboardTransientTurnoverDto,
} from "./schemas";

const ZERO = BigInt(0);
const OPEN_MAINTENANCE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PARTS",
] as const;

type RoomOccupancyInput = {
  id: string;
  building: "BOARDING" | "TRANSIENT";
  isTransientPublished: boolean;
  beds: Array<{
    status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED";
  }>;
};

function summarizeBuildingOccupancy(
  rooms: RoomOccupancyInput[],
  allocationsByRoom: Map<string, Array<{ type: string }>>,
): DashboardBuildingOccupancyDto {
  let occupiedRooms = 0;
  let availableRooms = 0;
  let maintenanceRooms = 0;
  let publishedRooms = 0;

  for (const room of rooms) {
    if (room.isTransientPublished) {
      publishedRooms += 1;
    }
    const allocs = allocationsByRoom.get(room.id) ?? [];
    const status = deriveRoomUnitStatus({
      hasActiveHold: allocs.some((a) => a.type === "MAINTENANCE_HOLD"),
      hasActiveStayOrAssignment: allocs.some(
        (a) =>
          a.type === "TENANT_ASSIGNMENT" || a.type === "TRANSIENT_RESERVATION",
      ),
      bedStatuses: room.beds.map((bed) => bed.status),
    });

    if (status === "MAINTENANCE") {
      maintenanceRooms += 1;
    } else if (status === "OCCUPIED") {
      occupiedRooms += 1;
    } else {
      availableRooms += 1;
    }
  }

  return {
    totalRooms: rooms.length,
    occupiedRooms,
    availableRooms,
    maintenanceRooms,
    publishedRooms,
    occupancyPercent: computeOccupancyPercent(occupiedRooms, rooms.length),
  };
}

/**
 * Reads a bounded, Owner-scoped operational snapshot for the Dashboard inside
 * a single RepeatableRead transaction so occupancy, billing, stays, maintenance,
 * notices, and recent activity reflect one consistent point in time.
 * Read-only: produces zero audit or notification records.
 */
export async function getDashboardSnapshot(
  ownerUserId: string,
  options?: { asOfUtc?: Date },
): Promise<DashboardSnapshotDto> {
  const db = getDatabase();
  const snapshotUtc = options?.asOfUtc ?? new Date();
  const todayManila = toManilaDate(snapshotUtc);
  const todayStartUtc = manilaDateTimeToUtc(todayManila, "00:00");
  const tomorrowStartUtc = manilaDateTimeToUtc(
    addManilaDays(todayManila, 1),
    "00:00",
  );
  const dueSoonCutoffUtc = manilaDateTimeToUtc(
    addManilaDays(todayManila, 7),
    "00:00",
  );
  const endingCutoffUtc = manilaDateTimeToUtc(
    addManilaDays(todayManila, 8),
    "00:00",
  );
  const monthWindow = getManilaMonthWindow(todayManila);
  const prevMonthWindow = getPreviousManilaMonthWindow(todayManila);
  const prevMonthStartUtc = manilaDateTimeToUtc(
    prevMonthWindow.startDateManila,
    "00:00",
  );
  const monthStartUtc = manilaDateTimeToUtc(
    monthWindow.startDateManila,
    "00:00",
  );
  const nextMonthStartUtc = manilaDateTimeToUtc(
    monthWindow.nextMonthStartDateManila,
    "00:00",
  );

  return db.$transaction(
    async (tx) => {
      const [
        activeRooms,
        coveringAllocations,
        openInvoices,
        draftInvoiceCount,
        monthPayments,
        prevMonthPayments,
        pendingBookingRequests,
        pendingRequestRows,
        checkInsTodayCount,
        transientCheckInsRows,
        checkOutsTodayCount,
        transientCheckOutsRows,
        boardingMoveInsTodayCount,
        boardingMoveInsRows,
        boardingEndingSoonCount,
        boardingEndingSoonRows,
        openMaintenanceCount,
        urgentMaintenanceCount,
        activeHoldCount,
        openMaintenanceRows,
        activeNoticeCount,
        activeNoticeRows,
        recentAuditRows,
      ] = await Promise.all([
        tx.room.findMany({
          where: { ownerUserId, archivedAt: null },
          select: {
            id: true,
            building: true,
            isTransientPublished: true,
            beds: {
              where: { archivedAt: null },
              select: { status: true },
            },
          },
        }),
        tx.allocation.findMany({
          where: {
            ownerUserId,
            status: "ACTIVE",
            startDate: { lte: snapshotUtc },
            endDate: { gt: snapshotUtc },
          },
          select: {
            roomId: true,
            type: true,
          },
        }),
        tx.invoice.findMany({
          where: {
            ownerUserId,
            status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            invoiceNumber: true,
            tenantId: true,
            transientGuestId: true,
            snapshotTenantName: true,
            dueDate: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            tenant: { select: { fullName: true } },
            transientGuest: { select: { fullName: true } },
          },
        }),
        tx.invoice.count({
          where: { ownerUserId, status: "DRAFT" },
        }),
        tx.payment.findMany({
          where: {
            ownerUserId,
            status: { in: ["POSTED", "REVERSED", "REVERSAL"] },
            paidAt: { gte: monthStartUtc, lt: nextMonthStartUtc },
          },
          select: { amount: true },
        }),
        tx.payment.findMany({
          where: {
            ownerUserId,
            status: { in: ["POSTED", "REVERSED", "REVERSAL"] },
            paidAt: { gte: prevMonthStartUtc, lt: monthStartUtc },
          },
          select: { amount: true },
        }),
        tx.bookingRequest.count({
          where: { ownerUserId, status: "PENDING" },
        }),
        tx.bookingRequest.findMany({
          where: { ownerUserId, status: "PENDING" },
          orderBy: [{ checkInDateManila: "asc" }, { createdAt: "asc" }],
          take: 5,
          select: {
            id: true,
            referenceCode: true,
            guestName: true,
            checkInDateManila: true,
            checkOutDateManila: true,
            nights: true,
            partySize: true,
            quotedTotalAmount: true,
            createdAt: true,
            room: { select: { number: true } },
          },
        }),
        tx.transientReservation.count({
          where: {
            ownerUserId,
            checkInDateManila: todayManila,
            status: { in: ["TENTATIVE", "CONFIRMED", "CHECKED_IN"] },
          },
        }),
        tx.transientReservation.findMany({
          where: {
            ownerUserId,
            checkInDateManila: todayManila,
            status: { in: ["TENTATIVE", "CONFIRMED", "CHECKED_IN"] },
          },
          orderBy: [{ createdAt: "asc" }],
          take: 10,
          select: {
            id: true,
            status: true,
            checkInDateManila: true,
            checkOutDateManila: true,
            nights: true,
            partySize: true,
            totalAmount: true,
            guest: { select: { fullName: true } },
            room: { select: { number: true } },
          },
        }),
        tx.transientReservation.count({
          where: {
            ownerUserId,
            checkOutDateManila: todayManila,
            status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
          },
        }),
        tx.transientReservation.findMany({
          where: {
            ownerUserId,
            checkOutDateManila: todayManila,
            status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
          },
          orderBy: [{ createdAt: "asc" }],
          take: 10,
          select: {
            id: true,
            status: true,
            checkInDateManila: true,
            checkOutDateManila: true,
            nights: true,
            partySize: true,
            totalAmount: true,
            guest: { select: { fullName: true } },
            room: { select: { number: true } },
          },
        }),
        tx.tenantAssignment.count({
          where: {
            ownerUserId,
            status: "ACTIVE",
            startDate: { gte: todayStartUtc, lt: tomorrowStartUtc },
          },
        }),
        tx.tenantAssignment.findMany({
          where: {
            ownerUserId,
            status: "ACTIVE",
            startDate: { gte: todayStartUtc, lt: tomorrowStartUtc },
          },
          orderBy: [{ startDate: "asc" }],
          take: 10,
          select: {
            id: true,
            tenantId: true,
            startDate: true,
            endDate: true,
            tenant: { select: { fullName: true } },
            room: { select: { number: true } },
          },
        }),
        tx.tenantAssignment.count({
          where: {
            ownerUserId,
            status: "ACTIVE",
            endDate: { lt: endingCutoffUtc },
          },
        }),
        tx.tenantAssignment.findMany({
          where: {
            ownerUserId,
            status: "ACTIVE",
            endDate: { lt: endingCutoffUtc },
          },
          orderBy: [{ endDate: "asc" }],
          take: 10,
          select: {
            id: true,
            tenantId: true,
            endDate: true,
            tenant: { select: { fullName: true } },
            room: { select: { number: true } },
          },
        }),
        tx.maintenanceRequest.count({
          where: {
            ownerUserId,
            archivedAt: null,
            status: { in: [...OPEN_MAINTENANCE_STATUSES] },
          },
        }),
        tx.maintenanceRequest.count({
          where: {
            ownerUserId,
            archivedAt: null,
            priority: "URGENT",
            status: { in: [...OPEN_MAINTENANCE_STATUSES] },
          },
        }),
        tx.allocation.count({
          where: {
            ownerUserId,
            status: "ACTIVE",
            type: "MAINTENANCE_HOLD",
            endDate: { gt: snapshotUtc },
          },
        }),
        tx.maintenanceRequest.findMany({
          where: {
            ownerUserId,
            archivedAt: null,
            status: { in: [...OPEN_MAINTENANCE_STATUSES] },
          },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 10,
          select: {
            id: true,
            title: true,
            category: true,
            priority: true,
            status: true,
            createdAt: true,
            room: { select: { number: true, building: true } },
            holdAllocations: {
              where: {
                status: "ACTIVE",
                endDate: { gt: snapshotUtc },
              },
              take: 1,
              select: { id: true },
            },
          },
        }),
        tx.notice.count({
          where: {
            ownerUserId,
            archivedAt: null,
            startDateManila: { lte: todayManila },
            endDateManila: { gte: todayManila },
          },
        }),
        tx.notice.findMany({
          where: {
            ownerUserId,
            archivedAt: null,
            startDateManila: { lte: todayManila },
            endDateManila: { gte: todayManila },
          },
          orderBy: [{ startDateManila: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            title: true,
            audience: true,
            startDateManila: true,
            endDateManila: true,
            room: { select: { number: true } },
            tenant: { select: { fullName: true } },
          },
        }),
        tx.auditLog.findMany({
          where: { ownerUserId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 12,
          select: {
            id: true,
            area: true,
            action: true,
            actorType: true,
            entityType: true,
            entityId: true,
            createdAt: true,
          },
        }),
      ]);

      const allocationsByRoom = new Map<string, Array<{ type: string }>>();
      for (const alloc of coveringAllocations) {
        const list = allocationsByRoom.get(alloc.roomId) ?? [];
        list.push({ type: alloc.type });
        allocationsByRoom.set(alloc.roomId, list);
      }

      const boardingRooms = activeRooms.filter(
        (room) => room.building === "BOARDING",
      );
      const transientRooms = activeRooms.filter(
        (room) => room.building === "TRANSIENT",
      );

      let openBalanceCentavos = ZERO;
      let overdueInvoiceCount = 0;
      let overdueBalanceCentavos = ZERO;
      let dueSoonInvoiceCount = 0;
      const dueAndOverdueInvoices: DashboardDueInvoiceDto[] = [];

      for (const inv of openInvoices) {
        const totalCentavos = parseMoneyDecimal(inv.totalAmount.toString());
        const paidCentavos = parseMoneyDecimal(inv.paidAmount.toString());
        const rawBalance = subtractMoney(totalCentavos, paidCentavos);
        const balanceCentavos = rawBalance > ZERO ? rawBalance : ZERO;
        const dueDateManila = toManilaDate(inv.dueDate);
        const isOverdue = dueDateManila < todayManila;
        const isDueSoon =
          inv.dueDate >= todayStartUtc && inv.dueDate < dueSoonCutoffUtc;

        openBalanceCentavos = addMoney(openBalanceCentavos, balanceCentavos);
        if (isOverdue) {
          overdueInvoiceCount += 1;
          overdueBalanceCentavos = addMoney(
            overdueBalanceCentavos,
            balanceCentavos,
          );
        } else if (isDueSoon) {
          dueSoonInvoiceCount += 1;
        }

        if (dueAndOverdueInvoices.length < 10) {
          dueAndOverdueInvoices.push({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            payerName:
              inv.snapshotTenantName ??
              inv.tenant?.fullName ??
              inv.transientGuest?.fullName ??
              "Guest",
            payerKind: inv.transientGuestId ? "TRANSIENT" : "TENANT",
            dueDateManila,
            balanceAmount: formatMoneyDecimal(balanceCentavos),
            status:
              inv.status === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "ISSUED",
            isOverdue,
          });
        }
      }

      let collectedCentavos = ZERO;
      for (const payment of monthPayments) {
        collectedCentavos = addMoney(
          collectedCentavos,
          parseMoneyDecimal(payment.amount.toString()),
        );
      }

      let collectedPreviousCentavos = ZERO;
      for (const payment of prevMonthPayments) {
        collectedPreviousCentavos = addMoney(
          collectedPreviousCentavos,
          parseMoneyDecimal(payment.amount.toString()),
        );
      }

      const toTurnoverDto = (
        row: (typeof transientCheckInsRows)[number],
      ): DashboardTransientTurnoverDto => ({
        id: row.id,
        guestName: row.guest.fullName,
        roomNumber: row.room.number,
        status: row.status,
        checkInDateManila: row.checkInDateManila,
        checkOutDateManila: row.checkOutDateManila,
        nights: row.nights,
        partySize: row.partySize,
        totalAmount: formatMoneyDecimal(
          parseMoneyDecimal(row.totalAmount.toString()),
        ),
      });

      return {
        snapshotAt: snapshotUtc.toISOString(),
        businessDateManila: todayManila,
        currentMonthKey: monthWindow.monthKey,
        configuration: {
          policiesConfigured: true,
          stayScheduleConfigured: true,
        },
        occupancy: {
          boarding: summarizeBuildingOccupancy(
            boardingRooms,
            allocationsByRoom,
          ),
          transient: summarizeBuildingOccupancy(
            transientRooms,
            allocationsByRoom,
          ),
        },
        billing: {
          openInvoiceCount: openInvoices.length,
          openBalance: formatMoneyDecimal(openBalanceCentavos),
          overdueInvoiceCount,
          overdueBalance: formatMoneyDecimal(overdueBalanceCentavos),
          dueSoonInvoiceCount,
          draftInvoiceCount,
          collectedThisMonth: formatMoneyDecimal(collectedCentavos),
          previousMonthKey: prevMonthWindow.monthKey,
          collectedPreviousMonth: formatMoneyDecimal(collectedPreviousCentavos),
          dueAndOverdueInvoices,
        },
        staysToday: {
          pendingBookingRequests,
          pendingBookingRequestsList: pendingRequestRows.map((row) => ({
            id: row.id,
            referenceCode: row.referenceCode,
            guestName: row.guestName,
            roomNumber: row.room.number,
            checkInDateManila: row.checkInDateManila,
            checkOutDateManila: row.checkOutDateManila,
            nights: row.nights,
            partySize: row.partySize,
            quotedTotalAmount: formatMoneyDecimal(
              parseMoneyDecimal(row.quotedTotalAmount.toString()),
            ),
            createdAt: row.createdAt.toISOString(),
          })),
          checkInsTodayCount,
          checkOutsTodayCount,
          boardingMoveInsTodayCount,
          boardingEndingSoonCount,
          transientCheckInsToday: transientCheckInsRows.map(toTurnoverDto),
          transientCheckOutsToday: transientCheckOutsRows.map(toTurnoverDto),
          boardingMoveInsToday: boardingMoveInsRows.map((row) => ({
            id: row.id,
            tenantId: row.tenantId,
            tenantName: row.tenant.fullName,
            roomNumber: row.room.number,
            startDateManila: toManilaDate(row.startDate),
            endDateManila: toManilaDate(row.endDate),
          })),
          boardingEndingSoon: boardingEndingSoonRows.map((row) => {
            const endDateManila = toManilaDate(row.endDate);
            return {
              id: row.id,
              tenantId: row.tenantId,
              tenantName: row.tenant.fullName,
              roomNumber: row.room.number,
              endDateManila,
              daysRemaining: diffManilaDays(todayManila, endDateManila),
            };
          }),
        },
        maintenance: {
          openCount: openMaintenanceCount,
          urgentCount: urgentMaintenanceCount,
          activeHoldCount,
          openRequests: openMaintenanceRows.map((row) => ({
            id: row.id,
            title: row.title,
            roomNumber: row.room.number,
            building: row.room.building,
            category: row.category,
            priority: row.priority,
            status:
              row.status === "IN_PROGRESS" || row.status === "WAITING_PARTS"
                ? row.status
                : "OPEN",
            hasActiveHold: row.holdAllocations.length > 0,
            createdAt: row.createdAt.toISOString(),
          })),
        },
        notices: {
          activeCount: activeNoticeCount,
          activeNotices: activeNoticeRows.map((row) => ({
            id: row.id,
            title: row.title,
            audience: row.audience,
            targetLabel:
              row.audience === "ROOM"
                ? row.room
                  ? `Room ${row.room.number}`
                  : "Room"
                : row.audience === "TENANT"
                  ? (row.tenant?.fullName ?? "Tenant")
                  : "Everyone",
            startDateManila: row.startDateManila,
            endDateManila: row.endDateManila,
          })),
        },
        recentActivity: recentAuditRows.map((row) => ({
          id: row.id,
          area: row.area,
          action: row.action,
          actorType: row.actorType,
          entityType: row.entityType,
          entityId: row.entityId,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
