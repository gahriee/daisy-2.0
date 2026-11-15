import { describe, expect, it } from "vitest";
import {
  AddInvoiceAdjustmentSchema,
  CreateManualInvoiceSchema,
  GeneratePeriodInvoicesSchema,
  IssueInvoiceSchema,
  VoidInvoiceSchema,
} from "../../../../src/features/billing/schemas";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("billing Zod schemas", () => {
  it("accepts valid YYYY-MM billing periods and rejects invalid ones", () => {
    expect(
      GeneratePeriodInvoicesSchema.parse({
        billingPeriod: "2026-11",
        issueImmediately: true,
      }),
    ).toEqual({
      billingPeriod: "2026-11",
      issueImmediately: true,
    });

    expect(
      GeneratePeriodInvoicesSchema.safeParse({
        billingPeriod: "2026-13",
      }).success,
    ).toBe(false);
    expect(
      GeneratePeriodInvoicesSchema.safeParse({
        billingPeriod: "2026-11-01",
      }).success,
    ).toBe(false);
  });

  it("normalizes manual invoice line items and rejects end <= start", () => {
    const valid = CreateManualInvoiceSchema.parse({
      tenantId: VALID_UUID,
      billingPeriod: "",
      periodStartManila: "2026-11-01",
      periodEndManila: "2026-12-01",
      dueDateManila: "2026-11-10",
      items: [
        {
          itemType: "UTILITY",
          description: "Electricity sub-meter",
          quantity: "12.5",
          unitAmount: "14",
        },
      ],
    });

    expect(valid.billingPeriod).toBeNull();
    expect(valid.items[0]).toEqual({
      itemType: "UTILITY",
      description: "Electricity sub-meter",
      quantity: "12.50",
      unitAmount: "14.00",
    });

    expect(
      CreateManualInvoiceSchema.safeParse({
        tenantId: VALID_UUID,
        periodStartManila: "2026-11-10",
        periodEndManila: "2026-11-10",
        dueDateManila: "2026-11-15",
        items: [
          {
            itemType: "RENT",
            description: "Rent",
            quantity: "1",
            unitAmount: "3000",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires positive adjustment amounts and non-empty void/issue inputs", () => {
    expect(
      AddInvoiceAdjustmentSchema.safeParse({
        invoiceId: VALID_UUID,
        expectedVersion: 1,
        type: "CREDIT",
        amount: "0.00",
        reason: "Discount",
      }).success,
    ).toBe(false);

    expect(
      AddInvoiceAdjustmentSchema.parse({
        invoiceId: VALID_UUID,
        expectedVersion: 2,
        type: "CHARGE",
        amount: "250.5",
        reason: "Late utility charge",
      }).amount,
    ).toBe("250.50");

    expect(
      IssueInvoiceSchema.safeParse({
        invoiceId: VALID_UUID,
        expectedVersion: 0,
      }).success,
    ).toBe(false);

    expect(
      VoidInvoiceSchema.safeParse({
        invoiceId: VALID_UUID,
        expectedVersion: 1,
        reason: "   ",
      }).success,
    ).toBe(false);
  });
});
