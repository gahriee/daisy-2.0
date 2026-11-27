import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getServerBillingPolicies,
  getServerOperationalLimits,
  getServerSmsConfig,
  getServerSmtpConfig,
} from "../../../src/config/business-config";

describe("server business env configuration", () => {
  it("provides sensible Philippine boarding house defaults when env vars are unset", () => {
    expect(getServerBillingPolicies({})).toEqual({
      billingDayOfMonth: 1,
      gracePeriodDays: 5,
      prorationPolicy: "DAILY_EXACT",
      depositPolicy: "HOLD_SEPARATE",
      overpaymentPolicy: "CREDIT_NEXT_INVOICE",
      invoicePrefix: "INV-",
      receiptPrefix: "RCP-",
    });

    expect(getServerOperationalLimits({})).toEqual({
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxBytes: 5 * 1024 * 1024,
      proofMaxFilesPerRecord: 5,
      defaultCheckInTimeManila: "14:00",
      defaultCheckOutTimeManila: "12:00",
    });

    expect(getServerSmsConfig({})).toEqual({
      configured: false,
      apiKey: null,
      senderName: null,
      overdueFrequencyDays: 1,
      overdueTemplate: null,
    });

    expect(getServerSmtpConfig({})).toBeNull();
  });

  it("parses and normalizes valid environment overrides", () => {
    expect(
      getServerBillingPolicies({
        BILLING_DAY_OF_MONTH: "5",
        BILLING_GRACE_PERIOD_DAYS: "3",
        BILLING_PRORATION_POLICY: "daily_30",
        BILLING_DEPOSIT_POLICY: "apply_on_move_out",
        BILLING_OVERPAYMENT_POLICY: "reject_overpayment",
        INVOICE_PREFIX: " inv- ",
        RECEIPT_PREFIX: " or ",
      }),
    ).toEqual({
      billingDayOfMonth: 5,
      gracePeriodDays: 3,
      prorationPolicy: "DAILY_30",
      depositPolicy: "APPLY_ON_MOVE_OUT",
      overpaymentPolicy: "REJECT_OVERPAYMENT",
      invoicePrefix: "INV-",
      receiptPrefix: "OR",
    });

    expect(
      getServerOperationalLimits({
        OFFLINE_UNLOCK_MAX_DAYS: "14",
        PROOF_MAX_MB: "8",
        PROOF_MAX_FILES_PER_RECORD: "6",
        DEFAULT_CHECK_IN_TIME: "15:00",
        DEFAULT_CHECK_OUT_TIME: "11:00",
      }),
    ).toEqual({
      offlineUnlockMaxDays: 14,
      proofMaxMb: 8,
      proofMaxBytes: 8 * 1024 * 1024,
      proofMaxFilesPerRecord: 6,
      defaultCheckInTimeManila: "15:00",
      defaultCheckOutTimeManila: "11:00",
    });

    expect(
      getServerSmsConfig({
        SEMAPHORE_API_KEY: "sem_live_key_1234",
        SEMAPHORE_SENDER_NAME: "DAISYBH",
        SEMAPHORE_OVERDUE_FREQUENCY_DAYS: "3",
        SEMAPHORE_OVERDUE_TEMPLATE:
          "Hi {{tenantName}}, balance {{balance}} is overdue.",
      }),
    ).toEqual({
      configured: true,
      apiKey: "sem_live_key_1234",
      senderName: "DAISYBH",
      overdueFrequencyDays: 3,
      overdueTemplate: "Hi {{tenantName}}, balance {{balance}} is overdue.",
    });

    expect(
      getServerSmtpConfig({
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "host@gmail.com",
        SMTP_PASS: "app-pass",
        MAIL_FROM: "bookings@daisy.ph",
        MAIL_FROM_NAME: "Daisy Residences",
      }),
    ).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: "host@gmail.com",
      pass: "app-pass",
      fromName: "Daisy Residences",
      fromEmail: "bookings@daisy.ph",
    });
  });

  it("rejects invalid non-empty environment values with clear error messages", () => {
    expect(() =>
      getServerBillingPolicies({ BILLING_DAY_OF_MONTH: "31" }),
    ).toThrow("BILLING_DAY_OF_MONTH");
    expect(() =>
      getServerBillingPolicies({ BILLING_PRORATION_POLICY: "UNKNOWN" }),
    ).toThrow("BILLING_PRORATION_POLICY");
    expect(() => getServerBillingPolicies({ INVOICE_PREFIX: "x" })).toThrow(
      "INVOICE_PREFIX",
    );
    expect(() =>
      getServerOperationalLimits({ DEFAULT_CHECK_IN_TIME: "25:99" }),
    ).toThrow("DEFAULT_CHECK_IN_TIME");
    expect(() => getServerOperationalLimits({ PROOF_MAX_MB: "50" })).toThrow(
      "PROOF_MAX_MB",
    );
    expect(() =>
      getServerSmsConfig({ SEMAPHORE_SENDER_NAME: "TOO LONG NAME" }),
    ).toThrow("SEMAPHORE_SENDER_NAME");
    expect(() =>
      getServerSmsConfig({ SEMAPHORE_OVERDUE_TEMPLATE: "TEST reminder" }),
    ).toThrow("SEMAPHORE_OVERDUE_TEMPLATE");
    expect(() =>
      getServerSmsConfig({ SEMAPHORE_OVERDUE_FREQUENCY_DAYS: "0" }),
    ).toThrow("SEMAPHORE_OVERDUE_FREQUENCY_DAYS");
  });
});
