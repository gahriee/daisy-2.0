import "server-only";
import {
  addManilaDays,
  formatManilaDate,
  manilaDateTimeToUtc,
  toManilaDate,
} from "@/lib/dates";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { getDatabase } from "@/server/db/client";

export type OwnerNotification = {
  key: string;
  title: string;
  message: string;
  destination: string;
  tone: "info" | "warning" | "success";
  createdAt: string;
  read: boolean;
  readAt: string | null;
};

/**
 * Projects Owner-scoped notifications at read time from an explicit allowlist of
 * security/audit events and explicit configuration states, joined with read state.
 */
export async function listOwnerNotifications(
  ownerUserId: string,
): Promise<OwnerNotification[]> {
  const db = getDatabase();
  const todayManila = toManilaDate(new Date());
  const windowEndManila = addManilaDays(todayManila, 7);
  const endingCutoffUtc = manilaDateTimeToUtc(
    addManilaDays(windowEndManila, 1),
    "00:00",
  );

  const [completedResets, settings, endingAssignments, readRows] =
    await Promise.all([
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
      db.notificationRead.findMany({
        where: { ownerUserId },
        select: { notificationKey: true, readAt: true },
      }),
    ]);

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
    !settings.receiptPrefix ||
    !settings.checkInTimeManila ||
    !settings.checkOutTimeManila;

  if (policiesIncomplete) {
    const key = "settings:financial-policy-incomplete";
    const readAt = readMap.get(key) ?? null;
    items.push({
      key,
      title: "Configure business policies",
      message:
        "Billing day, proration, deposit, overpayment, prefixes, and stay times must be configured before invoicing or reservations.",
      destination: "/settings",
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
      message: `Room ${assignment.room.number} · Bed ${assignment.bed.number} scheduled to end ${formatManilaDate(endManila)}.`,
      destination: `/tenants/${assignment.tenantId}`,
      tone: pastEnd ? "warning" : "info",
      createdAt: assignment.updatedAt.toISOString(),
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

  return items;
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
