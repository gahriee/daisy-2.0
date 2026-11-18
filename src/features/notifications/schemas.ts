import { z } from "zod";

export const NOTIFICATIONS_UPDATED_EVENT = "daisy:notifications-updated";

export const NotificationKeysBatchSchema = z.object({
  keys: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
});

export type NotificationTone = "info" | "warning" | "success";

export type NotificationCategory =
  | "settings"
  | "assignment"
  | "invoice"
  | "booking_request"
  | "maintenance"
  | "security";

export type OwnerNotification = {
  key: string;
  title: string;
  message: string;
  destination: string;
  tone: NotificationTone;
  createdAt: string;
  read: boolean;
  readAt: string | null;
};

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  string
> = {
  settings: "Settings",
  assignment: "Tenancy",
  invoice: "Billing",
  booking_request: "Booking request",
  maintenance: "Maintenance",
  security: "Security",
};

export const NOTIFICATION_TONE_LABELS: Record<NotificationTone, string> = {
  warning: "Action required",
  info: "Information",
  success: "Update",
};

export function getNotificationCategory(key: string): NotificationCategory {
  if (key.startsWith("settings:")) return "settings";
  if (key.startsWith("assignment:")) return "assignment";
  if (key.startsWith("invoice:")) return "invoice";
  if (key.startsWith("booking_request:")) return "booking_request";
  if (key.startsWith("maintenance:")) return "maintenance";
  return "security";
}

/**
 * Sorts unread notifications ahead of read ones, then orders newest first.
 */
export function sortOwnerNotifications(
  items: readonly OwnerNotification[],
): OwnerNotification[] {
  return [...items].sort((a, b) => {
    if (a.read !== b.read) {
      return a.read ? 1 : -1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Splits notification keys into bounded chunks matching `POST /api/notifications/read`.
 */
export function chunkNotificationKeys(
  keys: readonly string[],
  chunkSize = 50,
): string[][] {
  const unique = [...new Set(keys.filter((k) => k.trim().length > 0))];
  const size = Math.max(1, Math.min(50, Math.trunc(chunkSize)));
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    batches.push(unique.slice(i, i + size));
  }
  return batches;
}
