import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildBookingApprovedEmailContent,
  buildBookingPendingEmailContent,
  resolveEnvSmtpConfig,
  sendBookingApprovedEmailSafe,
  sendBookingPendingEmailSafe,
  sendTestSmtpEmailSafe,
  type BookingApprovedEmailInput,
  type BookingPendingEmailInput,
  type SmtpTransportConfig,
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

function makePendingInput(
  overrides: Partial<BookingPendingEmailInput> = {},
): BookingPendingEmailInput {
  return {
    toEmail: "guest@example.com",
    guestName: "Juan Dela Cruz",
    referenceCode: "REQ-PENDING12345",
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
    estimatedTotalAmount: "2700.00",
    trackUrl: "https://daisy.example/book#track",
    ...overrides,
  };
}

function makeSmtpConfig(
  overrides: Partial<SmtpTransportConfig> = {},
): SmtpTransportConfig {
  return {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    user: "owner@gmail.com",
    pass: "abcd efgh ijkl mnop",
    fromName: "Daisy Residences",
    fromEmail: "owner@gmail.com",
    ...overrides,
  };
}

describe("booking approval mailer (Nodemailer SMTP)", () => {
  it("builds HTML and plain-text confirmation content as a check-in pass without a track status button", () => {
    const email = buildBookingApprovedEmailContent(
      makeInput({
        propertyLatitude: 10.7202,
        propertyLongitude: 122.5621,
        roomPhotoUrl: "https://daisy.example/api/public/room-photos/photo-1",
      }),
    );
    expect(email.subject).toBe(
      "Booking confirmed (REQ-ABCDEF123456) — Daisy Residences",
    );
    expect(email.text).toContain("REQ-ABCDEF123456");
    expect(email.text).toContain("Room 203 — Balcony Suite");
    expect(email.text).toContain("2 nights");
    expect(email.text).not.toContain("Track your booking status");
    expect(email.text).toContain(
      "https://www.google.com/maps/dir/?api=1&destination=10.720200%2C122.562100",
    );
    expect(email.text).toContain("Book Grab: https://grab.onelink.me/");
    expect(email.html).toContain("Your reservation is confirmed");
    expect(email.html).toContain("Check-in pass");
    expect(email.html).toContain("Getting here");
    expect(email.html).toContain("REQ-ABCDEF123456");
    expect(email.html).not.toContain("Track booking status");
    expect(email.html).toContain("Get directions");
    expect(email.html).toContain("Book Grab");
    expect(email.html).toContain('src="cid:daisy-icon@daisy"');
    expect(email.html).toContain('src="cid:grab-icon@daisy"');
    expect(email.html).not.toContain("&#128663;");
    expect(email.html).toContain("destination=10.720200%2C122.562100");
    expect(email.html).toContain(
      "https://daisy.example/api/public/room-photos/photo-1",
    );

    // Ensure 24-hour HH:mm stay times are formatted into 12-hour AM/PM labels
    const militaryTimeEmail = buildBookingApprovedEmailContent(
      makeInput({
        checkInTimeLabel: "14:00",
        checkOutTimeLabel: "12:00",
      }),
    );
    expect(militaryTimeEmail.html).toContain("After 2:00 PM");
    expect(militaryTimeEmail.html).toContain("Before 12:00 PM");
    expect(militaryTimeEmail.html).not.toContain("After 14:00");
    expect(militaryTimeEmail.text).toContain("(after 2:00 PM)");
    expect(militaryTimeEmail.text).toContain("(before 12:00 PM)");

    // Ensure raw coordinates are never rendered as visible address fallback copy
    const pinOnlyEmail = buildBookingApprovedEmailContent(
      makeInput({
        propertyAddress: null,
        propertyLatitude: 10.7202,
        propertyLongitude: 122.5621,
      }),
    );
    expect(pinOnlyEmail.html).not.toContain("10.72020, 122.56210");
    expect(pinOnlyEmail.html).toContain("Get directions");
    expect(pinOnlyEmail.html).toContain("Book Grab");
  });

  it("skips cleanly when SMTP settings are not configured", async () => {
    const transportFactory = vi.fn();
    const result = await sendBookingApprovedEmailSafe(makeInput(), {
      smtpConfig: null,
      transportFactory,
    });
    expect(result.status).toBe("skipped");
    expect(transportFactory).not.toHaveBeenCalled();
  });

  it("sends via Nodemailer SMTP transport and handles failures without throwing", async () => {
    const sendMailOk = vi.fn(async () => ({
      messageId: "<msg-123@gmail.com>",
    }));
    const closeOk = vi.fn();
    const okFactory = vi.fn(() => ({ sendMail: sendMailOk, close: closeOk }));

    const sent = await sendBookingApprovedEmailSafe(makeInput(), {
      smtpConfig: makeSmtpConfig(),
      transportFactory: okFactory,
    });
    expect(sent).toEqual({ status: "sent", messageId: "<msg-123@gmail.com>" });
    expect(okFactory).toHaveBeenCalledTimes(1);
    expect(sendMailOk).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Daisy Residences" <owner@gmail.com>',
        to: "guest@example.com",
        subject: "Booking confirmed (REQ-ABCDEF123456) — Daisy Residences",
      }),
    );
    expect(closeOk).toHaveBeenCalledTimes(1);

    const sendMailFail = vi.fn(async () => {
      throw new Error(
        "Invalid login: 535-5.7.8 Username and Password not accepted",
      );
    });
    const closeFail = vi.fn();
    const failFactory = vi.fn(() => ({
      sendMail: sendMailFail,
      close: closeFail,
    }));

    const failed = await sendBookingApprovedEmailSafe(makeInput(), {
      smtpConfig: makeSmtpConfig(),
      transportFactory: failFactory,
    });
    expect(failed.status).toBe("failed");
    expect(closeFail).toHaveBeenCalledTimes(1);
  });

  it("resolves fallback SMTP config from environment variables", () => {
    expect(resolveEnvSmtpConfig({})).toBeNull();
    expect(
      resolveEnvSmtpConfig({
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "host@gmail.com",
        SMTP_PASS: "app-pass",
      }),
    ).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: "host@gmail.com",
      pass: "app-pass",
      fromName: null,
      fromEmail: "host@gmail.com",
    });
  });

  it("sends a verification test email for both booking confirmation and pending request templates", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "<test-1@gmail.com>" }));
    const approvedResult = await sendTestSmtpEmailSafe({
      toEmail: "owner@gmail.com",
      propertyName: "Daisy Residences",
      smtpConfig: makeSmtpConfig(),
      transportFactory: () => ({ sendMail }),
    });
    expect(approvedResult).toEqual({
      status: "sent",
      messageId: "<test-1@gmail.com>",
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@gmail.com",
        subject: "[Test] Booking confirmed (REQ-SAMPLE0001) — Daisy Residences",
        html: expect.stringContaining("Test email preview"),
      }),
    );

    const sendPendingMail = vi.fn(async () => ({
      messageId: "<test-pending-1@gmail.com>",
    }));
    const pendingResult = await sendTestSmtpEmailSafe({
      toEmail: "owner@gmail.com",
      template: "pending",
      propertyName: "Daisy Residences",
      smtpConfig: makeSmtpConfig(),
      transportFactory: () => ({ sendMail: sendPendingMail }),
    });
    expect(pendingResult).toEqual({
      status: "sent",
      messageId: "<test-pending-1@gmail.com>",
    });
    expect(sendPendingMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@gmail.com",
        subject:
          "[Test] Booking request received (REQ-SAMPLE0001) — Daisy Residences",
        text: expect.stringContaining(
          "Sample booking request received preview",
        ),
        html: expect.stringContaining("Pending review"),
        attachments: [
          expect.objectContaining({
            cid: "daisy-icon@daisy",
            contentDisposition: "inline",
          }),
        ],
      }),
    );
  });

  it("builds HTML and plain-text pending-request email content with status tracking and next steps", () => {
    const email = buildBookingPendingEmailContent(makePendingInput());
    expect(email.subject).toBe(
      "Booking request received (REQ-PENDING12345) — Daisy Residences",
    );
    expect(email.text).toContain("REQ-PENDING12345");
    expect(email.text).toContain("not a confirmed booking yet");
    expect(email.text).toContain("What happens next:");
    expect(email.text).toContain("Estimated total:");
    expect(email.text).not.toContain("Confirmed total");
    expect(email.text).toContain("https://daisy.example/book#track");
    expect(email.html).toContain("Pending review");
    expect(email.html).toContain("We received your booking request");
    expect(email.html).toContain("not a confirmed booking yet");
    expect(email.html).toContain("Requested stay");
    expect(email.html).toContain("What happens next");
    expect(email.html).toContain("Estimated total");
    expect(email.html).not.toContain("Confirmed total");
    expect(email.html).not.toContain("Your reservation is confirmed");
    expect(email.html).not.toContain("Book Grab");
    expect(email.html).not.toContain("Getting here");
    expect(email.html).toContain("REQ-PENDING12345");
    expect(email.html).toContain("Track booking status");
    expect(email.html).toContain('src="cid:daisy-icon@daisy"');
    expect(email.html).not.toContain('src="cid:grab-icon@daisy"');
  });

  it("sends pending-request emails via SMTP, skips when unconfigured, and fails safely", async () => {
    const skipFactory = vi.fn();
    const skipped = await sendBookingPendingEmailSafe(makePendingInput(), {
      smtpConfig: null,
      transportFactory: skipFactory,
    });
    expect(skipped.status).toBe("skipped");
    expect(skipFactory).not.toHaveBeenCalled();

    const sendMailOk = vi.fn(async () => ({
      messageId: "<pending-123@gmail.com>",
    }));
    const closeOk = vi.fn();
    const sent = await sendBookingPendingEmailSafe(makePendingInput(), {
      smtpConfig: makeSmtpConfig(),
      transportFactory: () => ({ sendMail: sendMailOk, close: closeOk }),
    });
    expect(sent).toEqual({
      status: "sent",
      messageId: "<pending-123@gmail.com>",
    });
    expect(sendMailOk).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "guest@example.com",
        subject:
          "Booking request received (REQ-PENDING12345) — Daisy Residences",
        attachments: [
          expect.objectContaining({
            cid: "daisy-icon@daisy",
            contentDisposition: "inline",
          }),
        ],
      }),
    );
    expect(closeOk).toHaveBeenCalledTimes(1);

    const closeFail = vi.fn();
    const failed = await sendBookingPendingEmailSafe(makePendingInput(), {
      smtpConfig: makeSmtpConfig(),
      transportFactory: () => ({
        sendMail: async () => {
          throw new Error("SMTP timeout");
        },
        close: closeFail,
      }),
    });
    expect(failed.status).toBe("failed");
    expect(closeFail).toHaveBeenCalledTimes(1);
  });
});
