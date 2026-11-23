import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildBookingApprovedEmailContent,
  sendBookingApprovedEmailSafe,
  type BookingApprovedEmailInput,
} from "../../../../src/server/mail/booking-mailer";

function makeInput(
  overrides: Partial<BookingApprovedEmailInput> = {},
): BookingApprovedEmailInput {
  return {
    toEmail: "guest@example.com",
    guestName: "Juan Dela Cruz",
    referenceCode: "REQ-ABCDEF123456",
    propertyName: "Daisy Residences",
    propertyAddress: "Session Road, Baguio City",
    contactPhone: "0917 123 4567",
    roomTitle: "Room 203 — Balcony Suite",
    scopeLabel: "Private room",
    checkInDateManila: "2026-11-23",
    checkOutDateManila: "2026-11-25",
    checkInTimeLabel: "2:00 PM",
    checkOutTimeLabel: "12:00 PM",
    nights: 2,
    partySize: 2,
    dailyRate: "1350.00",
    totalAmount: "2700.00",
    trackUrl: "https://daisy.example/book#track",
    ...overrides,
  };
}

describe("booking approval mailer", () => {
  it("builds HTML and plain-text confirmation content with reference, dates, total, and track link", () => {
    const email = buildBookingApprovedEmailContent(makeInput());
    expect(email.subject).toBe(
      "Booking confirmed (REQ-ABCDEF123456) — Daisy Residences",
    );
    expect(email.text).toContain("REQ-ABCDEF123456");
    expect(email.text).toContain("Room 203 — Balcony Suite");
    expect(email.text).toContain("2 nights");
    expect(email.text).toContain("https://daisy.example/book#track");
    expect(email.html).toContain("Booking confirmed");
    expect(email.html).toContain("REQ-ABCDEF123456");
    expect(email.html).toContain("Track booking status");
  });

  it("skips cleanly when email provider credentials are not configured", async () => {
    const fetcher = vi.fn();
    const result = await sendBookingApprovedEmailSafe(makeInput(), {
      apiKey: "",
      fromEmail: "",
      fetcher,
    });
    expect(result.status).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends via Resend HTTP API and handles provider failures without throwing", async () => {
    const okFetcher = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const sent = await sendBookingApprovedEmailSafe(makeInput(), {
      apiKey: "re_test_key",
      fromEmail: "Daisy <bookings@daisy.example>",
      fetcher: okFetcher,
    });
    expect(sent).toEqual({ status: "sent", messageId: "email_123" });
    expect(okFetcher).toHaveBeenCalledTimes(1);

    const failFetcher = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
      });
    });
    const failed = await sendBookingApprovedEmailSafe(makeInput(), {
      apiKey: "re_bad_key",
      fromEmail: "Daisy <bookings@daisy.example>",
      fetcher: failFetcher,
    });
    expect(failed.status).toBe("failed");
  });
});
