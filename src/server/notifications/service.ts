import "server-only";
import type { OwnerNotification } from "@/features/notifications/schemas";
import {
  MAINTENANCE_CATEGORY_LABELS,
  type MaintenanceCategoryValue,
} from "@/features/maintenance/schemas";
import {
  addManilaDays,
  formatManilaDate,
  manilaDateTimeToUtc,
  toManilaDate,
} from "@/lib/dates";
import {
  formatPhpCurrency,
  parseMoneyDecimal,
  subtractMoney,
} from "@/lib/money";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { getDatabase } from "@/server/db/client";

export type { OwnerNotification };

/**
 * Projects Owner-scoped notifications at read time from an explicit allowlist of
 * security/audit events and explicit configuration states, joined with read state.
 */
export async function listOwnerNotifications(
  ownerUserId: string,
): Promise<OwnerNotification[]> {
  const db = getDatabase();
  const todayManila = toManilaDate(new Date());
  const todayStartUtc = manilaDateTimeToUtc(todayManila, "00:00");
  const windowEndManila = addManilaDays(todayManila, 7);
  const endingCutoffUtc = manilaDateTimeToUtc(
    addManilaDays(windowEndManila, 1),
    "00:00",
  );

  const [
    completedResets,
    settings,
    endingAssignments,
    overdueInvoices,
    pendingBookingRequests,
    urgentMaintenance,
    readRows,
    dismissedRows,
  ] = await Promise.all([
    db.securityEvent.findMany({
      where: { ownerUserId, action: "RESET_COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true },
    }),
    db.businessSettings.findUnique({
      where: { ownerUserId },
      select: {
        billingDayOfMonth: true,
        gracePeriodDays: true,
        prorationPolicy: true,
        depositPolicy: true,
        overpaymentPolicy: true,
        invoicePrefix: true,
        receiptPrefix: true,
        checkInTimeManila: true,
        checkOutTimeManila: true,
        updatedAt: true,
      },
    }),
    db.tenantAssignment.findMany({
      where: {
        ownerUserId,
        status: "ACTIVE",
        endDate: { lt: endingCutoffUtc },
      },
      orderBy: { endDate: "asc" },
      take: 25,
      select: {
        id: true,
        tenantId: true,
        endDate: true,
        updatedAt: true,
        room: { select: { number: true } },
        bed: { select: { number: true } },
      },
    }),
    db.invoice.findMany({
      where: {
        ownerUserId,
        status: { in: ["ISSUED", "PARTIALLY_PAID"] },
        dueDate: { lt: todayStartUtc },
      },
      orderBy: { dueDate: "asc" },
      take: 25,
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        updatedAt: true,
      },
    }),
    db.bookingRequest.findMany({
      where: { ownerUserId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        referenceCode: true,
        scope: true,
        checkInDateManila: true,
        checkOutDateManila: true,
        createdAt: true,
        room: { select: { number: true } },
      },
    }),
    db.maintenanceRequest.findMany({
      where: {
        ownerUserId,
        archivedAt: null,
        priority: "URGENT",
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        category: true,
        createdAt: true,
        room: { select: { number: true } },
        bed: { select: { number: true } },
      },
    }),
    db.notificationRead.findMany({
      where: { ownerUserId },
      select: { notificationKey: true, readAt: true },
    }),
    db.notificationDismissal.findMany({
      where: { ownerUserId },
      select: { notificationKey: true },
    }),
  ]);

  const dismissedKeys = new Set(
    dismissedRows.map((row) => row.notificationKey),
  );
  const readMap = new Map(
    readRows.map((row) => [row.notificationKey, row.readAt.toISOString()]),
  );

  const items: OwnerNotification[] = [];

  const policiesIncomplete =
    !settings ||
    settings.billingDayOfMonth === null ||
    settings.gracePeriodDays === null ||
    settings.prorationPolicy === null ||
    settings.depositPolicy === null ||
    settings.overpaymentPolicy === null ||
    !settings.invoicePrefix ||
    !settings.receiptPrefix;

  if (policiesIncomplete) {
    const key = "settings:financial-policy-incomplete";
    const readAt = readMap.get(key) ?? null;
    items.push({
      key,
      title: "Configure billing & policies",
      message:
        "Billing day, grace period, proration, deposit, overpayment, and document prefixes must be configured before invoicing or payments.",
      destination: "/settings/policies",
      tone: "warning",
      createdAt: (settings?.updatedAt ?? new Date()).toISOString(),
      read: readAt !== null,
      readAt,
    });
  }

  const stayScheduleIncomplete =
    !settings || !settings.checkInTimeManila || !settings.checkOutTimeManila;

  if (stayScheduleIncomplete) {
    const key = "settings:stay-schedule-incomplete";
    const readAt = readMap.get(key) ?? null;
    items.push({
      key,
      title: "Configure stay check-in & check-out times",
      message:
        "Standard check-in and check-out times are required for transient stays and turnovers.",
      destination: "/settings/operations",
      tone: "warning",
      createdAt: (settings?.updatedAt ?? new Date()).toISOString(),
      read: readAt !== null,
      readAt,
    });
  }

  for (const assignment of endingAssignments) {
    const endManila = toManilaDate(assignment.endDate);
    const key = `assignment:ending:${assignment.id}:${endManila}`;
    const readAt = readMap.get(key) ?? null;
    const pastEnd = endManila < todayManila;
    items.push({
      key,
      title: pastEnd
        ? "Assignment past scheduled end date"
        : "Tenant stay ending soon",
      message: `Room ${assignment.room.number} (Bed ${assignment.bed.number})\nScheduled to end ${formatManilaDate(endManila)}.`,
      destination: `/tenants/${assignment.tenantId}`,
      tone: pastEnd ? "warning" : "info",
      createdAt: assignment.updatedAt.toISOString(),
      read: readAt !== null,
      readAt,
    });
  }

  for (const invoice of overdueInvoices) {
    const dueManila = toManilaDate(invoice.dueDate);
    const balanceCentavos = subtractMoney(
      parseMoneyDecimal(invoice.totalAmount.toString()),
      parseMoneyDecimal(invoice.paidAmount.toString()),
    );
    const key = `invoice:overdue:${invoice.id}:${dueManila}`;
    const readAt = readMap.get(key) ?? null;
    items.push({
      key,
      title: "Overdue invoice",
      message: `${invoice.invoiceNumber ?? "Invoice"} (${formatPhpCurrency(balanceCentavos)}) was due ${formatManilaDate(dueManila)}.`,
      destination: `/billing?invoiceId=${invoice.id}`,
      tone: "warning",
      createdAt: invoice.updatedAt.toISOString(),
      read: readAt !== null,
      readAt,
    });
  }

  for (const request of pendingBookingRequests) {
    const key = `booking_request:pending:${request.id}`;
    const readAt = readMap.get(key) ?? null;
    items.push({
      key,
      title: "New booking request",
      message: `Room ${request.room.number} (${
        request.scope === "WHOLE_ROOM" ? "Whole room" : "Per bed"
      })\n${formatManilaDate(request.checkInDateManila)} to ${formatManilaDate(
        request.checkOutDateManila,
      )} (${request.referenceCode})`,
      destination: `/transients/requests/${request.id}`,
      tone: "info",
      createdAt: request.createdAt.toISOString(),
      read: readAt !== null,
      readAt,
    });
  }

  for (const item of urgentMaintenance) {
    const key = `maintenance:urgent:${item.id}`;
    const readAt = readMap.get(key) ?? null;
    const categoryLabel =
      MAINTENANCE_CATEGORY_LABELS[item.category as MaintenanceCategoryValue] ??
      "Maintenance";
    const location = item.bed
      ? `Room ${item.room.number} (Bed ${item.bed.number})`
      : `Room ${item.room.number}`;
    items.push({
      key,
      title: "Urgent maintenance",
      message: `${location} (${categoryLabel}) requires attention.`,
      destination: `/maintenance?requestId=${item.id}`,
      tone: "warning",
      createdAt: item.createdAt.toISOString(),
      read: readAt !== null,
      readAt,
    });
  }

  for (const event of completedResets) {
    const key = `sec:${event.id}`;
    const readAt = readMap.get(key) ?? null;
    items.push({
      key,
      title: "Your password was updated",
      message: "Completed via verified email code recovery.",
      destination: "/auth/reset-password",
      tone: "success",
      createdAt: event.createdAt.toISOString(),
      read: readAt !== null,
      readAt,
    });
  }

  return items.filter((item) => !dismissedKeys.has(item.key));
}

export async function markOwnerNotificationsRead(
  ownerUserId: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const db = getDatabase();
  const uniqueKeys = [...new Set(keys)].slice(0, 50);

  await db.$transaction(async (tx) => {
    await ensureOwnerRecord(tx, ownerUserId);
    for (const notificationKey of uniqueKeys) {
      await tx.notificationRead.upsert({
        where: {
          ownerUserId_notificationKey: { ownerUserId, notificationKey },
        },
        update: {},
        create: { ownerUserId, notificationKey },
      });
    }
  });
}

export async function markOwnerNotificationsUnread(
  ownerUserId: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const db = getDatabase();
  const uniqueKeys = [...new Set(keys)].slice(0, 50);

  await db.notificationRead.deleteMany({
    where: {
      ownerUserId,
      notificationKey: { in: uniqueKeys },
    },
  });
}

export async function deleteOwnerNotifications(
  ownerUserId: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const db = getDatabase();
  const uniqueKeys = [...new Set(keys)].slice(0, 50);

  await db.$transaction(async (tx) => {
    await ensureOwnerRecord(tx, ownerUserId);
    for (const notificationKey of uniqueKeys) {
      await tx.notificationDismissal.upsert({
        where: {
          ownerUserId_notificationKey: { ownerUserId, notificationKey },
        },
        update: {},
        create: { ownerUserId, notificationKey },
      });
    }
    await tx.notificationRead.deleteMany({
      where: {
        ownerUserId,
        notificationKey: { in: uniqueKeys },
      },
    });
  });
}
