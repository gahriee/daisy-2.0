import { describe, expect, it } from "vitest";
import {
  computeBillingDueDateManila,
  computeLineItemTotalCentavos,
  computePeriodInvoiceDraft,
  computeProratedRentCentavos,
  formatOfficialInvoiceNumber,
  getMonthBoundsManila,
} from "../../../../src/features/billing/calculations";

describe("billing calculations", () => {
  it("computes Asia/Manila month bounds and billing due dates cleanly", () => {
    expect(getMonthBoundsManila("2026-11")).toEqual({
      billingPeriod: "2026-11",
      year: 2026,
      month: 11,
      monthStartManila: "2026-11-01",
      monthEndExclusiveManila: "2026-12-01",
      daysInMonth: 30,
    });
    expect(getMonthBoundsManila("2024-02").daysInMonth).toBe(29);
    expect(computeBillingDueDateManila("2026-11", 25, 10)).toBe("2026-12-05");
  });

  it("applies each configured proration policy with exact BigInt centavos", () => {
    const monthlyRate = BigInt(450000); // ₱4,500.00

    expect(
      computeProratedRentCentavos({
        monthlyRateCentavos: monthlyRate,
        activeDays: 10,
        daysInMonth: 30,
        prorationPolicy: "DAILY_EXACT",
      }),
    ).toBe(BigInt(150000));

    expect(
      computeProratedRentCentavos({
        monthlyRateCentavos: monthlyRate,
        activeDays: 15,
        daysInMonth: 31,
        prorationPolicy: "DAILY_30",
      }),
    ).toBe(BigInt(225000));

    expect(
      computeProratedRentCentavos({
        monthlyRateCentavos: monthlyRate,
        activeDays: 12,
        daysInMonth: 30,
        prorationPolicy: "HALF_MONTH",
      }),
    ).toBe(BigInt(225000));

    expect(
      computeProratedRentCentavos({
        monthlyRateCentavos: monthlyRate,
        activeDays: 20,
        daysInMonth: 30,
        prorationPolicy: "HALF_MONTH",
      }),
    ).toBe(BigInt(450000));

    expect(
      computeProratedRentCentavos({
        monthlyRateCentavos: monthlyRate,
        activeDays: 5,
        daysInMonth: 30,
        prorationPolicy: "NONE",
      }),
    ).toBe(BigInt(450000));
  });

  it("computes fractional line item totals with HALF_UP rounding", () => {
    expect(computeLineItemTotalCentavos("14.50", "12.50")).toBe(BigInt(18125));
  });

  it("builds period drafts with initial security deposit and final-month credit rules", () => {
    const moveInDraft = computePeriodInvoiceDraft({
      billingPeriod: "2026-11",
      billingDayOfMonth: 5,
      gracePeriodDays: 5,
      prorationPolicy: "DAILY_EXACT",
      depositPolicy: "APPLY_TO_LAST_MONTH",
      assignment: {
        startDateManila: "2026-11-16",
        endDateManila: "2027-02-01",
        actualMoveOutDateManila: null,
        monthlyRate: "6000.00",
        securityDeposit: "6000.00",
      },
      depositAlreadyBilled: false,
      depositAlreadyApplied: false,
    });

    expect(moveInDraft).not.toBeNull();
    expect(moveInDraft?.items).toHaveLength(2);
    expect(moveInDraft?.subtotalAmount).toBe("9000.00"); // 15/30 * 6000 + 6000 deposit
    expect(moveInDraft?.adjustmentAmount).toBe("0.00");
    expect(moveInDraft?.totalAmount).toBe("9000.00");
    expect(moveInDraft?.dueDateManila).toBe("2026-11-10");

    const finalMonthDraft = computePeriodInvoiceDraft({
      billingPeriod: "2027-01",
      billingDayOfMonth: 5,
      gracePeriodDays: 5,
      prorationPolicy: "DAILY_EXACT",
      depositPolicy: "APPLY_TO_LAST_MONTH",
      assignment: {
        startDateManila: "2026-11-16",
        endDateManila: "2027-02-01",
        actualMoveOutDateManila: null,
        monthlyRate: "6000.00",
        securityDeposit: "4000.00",
      },
      depositAlreadyBilled: true,
      depositAlreadyApplied: false,
    });

    expect(finalMonthDraft?.subtotalAmount).toBe("6000.00");
    expect(finalMonthDraft?.adjustmentAmount).toBe("-4000.00");
    expect(finalMonthDraft?.totalAmount).toBe("2000.00");
    expect(finalMonthDraft?.depositCreditAdjustment?.reason).toContain(
      "final month rent",
    );
  });

  it("formats official invoice numbers cleanly", () => {
    expect(formatOfficialInvoiceNumber("inv", 2026, BigInt(42))).toBe(
      "INV-2026-000042",
    );
  });
});
