import { describe, expect, it } from "vitest";
import {
  BusinessSettingsUpdateSchema,
  hasCompleteFinancialPolicies,
} from "../../../../src/features/settings/schemas";

describe("business settings schemas", () => {
  it("accepts partial setup while reporting financial policies incomplete", () => {
    const parsed = BusinessSettingsUpdateSchema.parse({
      expectedVersion: 0,
      businessName: "  Daisy Residences  ",
      businessPhone: "",
      businessAddress: "",
      tin: "",
      billingDayOfMonth: null,
      gracePeriodDays: null,
      prorationPolicy: null,
      depositPolicy: null,
      overpaymentPolicy: null,
      invoicePrefix: null,
      receiptPrefix: null,
      checkInTimeManila: null,
      checkOutTimeManila: null,
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxFilesPerRecord: 5,
    });

    expect(parsed.businessName).toBe("Daisy Residences");
    expect(parsed.businessPhone).toBeNull();
    expect(hasCompleteFinancialPolicies(parsed)).toBe(false);
  });

  it("normalizes prefixes and confirms complete policy sets", () => {
    const parsed = BusinessSettingsUpdateSchema.parse({
      expectedVersion: 1,
      businessName: "Daisy Boarding House",
      businessPhone: "+63 917 000 0000",
      businessAddress: "123 Sampaguita St.",
      tin: null,
      billingDayOfMonth: 5,
      gracePeriodDays: 3,
      prorationPolicy: "DAILY_EXACT",
      depositPolicy: "HOLD_SEPARATE",
      overpaymentPolicy: "CREDIT_NEXT_INVOICE",
      invoicePrefix: "inv-",
      receiptPrefix: "rcp-",
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxFilesPerRecord: 5,
    });

    expect(parsed.invoicePrefix).toBe("INV-");
    expect(parsed.receiptPrefix).toBe("RCP-");
    expect(hasCompleteFinancialPolicies(parsed)).toBe(true);
  });

  it("rejects out-of-range billing days and invalid times", () => {
    const badDay = BusinessSettingsUpdateSchema.safeParse({
      expectedVersion: 0,
      businessName: "Daisy",
      businessPhone: null,
      businessAddress: null,
      tin: null,
      billingDayOfMonth: 31,
      gracePeriodDays: 3,
      prorationPolicy: null,
      depositPolicy: null,
      overpaymentPolicy: null,
      invoicePrefix: null,
      receiptPrefix: null,
      checkInTimeManila: "25:00",
      checkOutTimeManila: "12:00",
      offlineUnlockMaxDays: 7,
      proofMaxMb: 5,
      proofMaxFilesPerRecord: 5,
    });
    expect(badDay.success).toBe(false);
  });
});
