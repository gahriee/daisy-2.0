import { describe, expect, it } from "vitest";
import {
  chunkNotificationKeys,
  getNotificationCategory,
  sortOwnerNotifications,
  type OwnerNotification,
} from "../../../../src/features/notifications/schemas";

describe("Notification helpers", () => {
  it("maps notification key prefixes to categories", () => {
    expect(
      getNotificationCategory("settings:financial-policy-incomplete"),
    ).toBe("settings");
    expect(getNotificationCategory("assignment:ending:a1:2026-11-20")).toBe(
      "assignment",
    );
    expect(getNotificationCategory("invoice:overdue:inv1:2026-11-13")).toBe(
      "invoice",
    );
    expect(getNotificationCategory("booking_request:pending:req1")).toBe(
      "booking_request",
    );
    expect(getNotificationCategory("maintenance:urgent:m1")).toBe(
      "maintenance",
    );
    expect(getNotificationCategory("sec:evt1")).toBe("security");
  });

  it("sorts unread notifications first and orders newest first within each group", () => {
    const items: OwnerNotification[] = [
      {
        key: "sec:old-read",
        title: "Read older",
        message: "Older read item",
        destination: "/auth/reset-password",
        tone: "success",
        createdAt: "2026-11-10T08:00:00.000Z",
        read: true,
        readAt: "2026-11-10T09:00:00.000Z",
      },
      {
        key: "invoice:overdue:1",
        title: "Unread older",
        message: "Unread older item",
        destination: "/billing?invoiceId=1",
        tone: "warning",
        createdAt: "2026-11-13T08:00:00.000Z",
        read: false,
        readAt: null,
      },
      {
        key: "booking_request:pending:2",
        title: "Unread newer",
        message: "Unread newer item",
        destination: "/transients/requests/2",
        tone: "info",
        createdAt: "2026-11-16T08:00:00.000Z",
        read: false,
        readAt: null,
      },
      {
        key: "maintenance:urgent:3",
        title: "Read newer",
        message: "Read newer item",
        destination: "/maintenance?requestId=3",
        tone: "warning",
        createdAt: "2026-11-15T08:00:00.000Z",
        read: true,
        readAt: "2026-11-15T10:00:00.000Z",
      },
    ];

    const sorted = sortOwnerNotifications(items);
    expect(sorted.map((item) => item.key)).toEqual([
      "booking_request:pending:2",
      "invoice:overdue:1",
      "maintenance:urgent:3",
      "sec:old-read",
    ]);
  });

  it("deduplicates and chunks notification keys up to 50 per batch", () => {
    const keys = Array.from({ length: 55 }, (_, i) => `k-${i}`);
    keys.push("k-0", "  ", "");
    const batches = chunkNotificationKeys(keys, 50);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(50);
    expect(batches[1]).toHaveLength(5);
  });
});
