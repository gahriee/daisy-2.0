import { describe, expect, it } from "vitest";
import {
  autoDistributePaymentCentavos,
  computePaymentDistribution,
  formatOfficialReceiptNumber,
  reconcileInvoicePaymentState,
} from "../../../../src/features/payments/calculations";

describe("payments BigInt calculations", () => {
  it("formats official receipt numbers consistently across trailing hyphens", () => {
    expect(formatOfficialReceiptNumber("or-", 2026, BigInt(1))).toBe(
      "OR-2026-000001",
    );
    expect(formatOfficialReceiptNumber("RCP", 2026, BigInt(42))).toBe(
      "RCP-2026-000042",
    );
  });

  it("enforces REJECT_OVERPAYMENT and CREDIT_NEXT_INVOICE distributions", () => {
    const rejected = computePaymentDistribution({
      paymentAmountCentavos: BigInt(500000),
      allocations: [
        {
          invoiceId: "inv-1",
          amountCentavos: BigInt(450000),
          openBalanceCentavos: BigInt(450000),
        },
      ],
      overpaymentPolicy: "REJECT_OVERPAYMENT",
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.kind).toBe("overpayment_rejected");
    }

    const credited = computePaymentDistribution({
      paymentAmountCentavos: BigInt(500000),
      allocations: [
        {
          invoiceId: "inv-1",
          amountCentavos: BigInt(450000),
          openBalanceCentavos: BigInt(450000),
        },
      ],
      overpaymentPolicy: "CREDIT_NEXT_INVOICE",
    });
    expect(credited).toEqual({
      ok: true,
      totalAllocatedCentavos: BigInt(450000),
      unallocatedCentavos: BigInt(50000),
    });

    const overInvoice = computePaymentDistribution({
      paymentAmountCentavos: BigInt(500000),
      allocations: [
        {
          invoiceId: "inv-1",
          amountCentavos: BigInt(500000),
          openBalanceCentavos: BigInt(450000),
        },
      ],
      overpaymentPolicy: "CREDIT_NEXT_INVOICE",
    });
    expect(overInvoice.ok).toBe(false);
    if (!overInvoice.ok) {
      expect(overInvoice.kind).toBe("allocation_exceeds_invoice");
    }
  });

  it("distributes FIFO across open invoices and reconciles payment/reversal states", () => {
    const fifo = autoDistributePaymentCentavos({
      paymentAmountCentavos: BigInt(700000),
      openInvoices: [
        { invoiceId: "inv-1", openBalanceCentavos: BigInt(400000) },
        { invoiceId: "inv-2", openBalanceCentavos: BigInt(500000) },
      ],
    });
    expect(fifo.allocations).toEqual([
      { invoiceId: "inv-1", amount: "4000.00" },
      { invoiceId: "inv-2", amount: "3000.00" },
    ]);
    expect(fifo.remainingCentavos).toBe(BigInt(0));

    const partial = reconcileInvoicePaymentState({
      totalAmountCentavos: BigInt(500000),
      currentPaidCentavos: BigInt(0),
      deltaCentavos: BigInt(300000),
      currentStatus: "ISSUED",
    });
    expect(partial).toEqual({
      nextPaidCentavos: BigInt(300000),
      nextStatus: "PARTIALLY_PAID",
    });

    const reversed = reconcileInvoicePaymentState({
      totalAmountCentavos: BigInt(500000),
      currentPaidCentavos: BigInt(300000),
      deltaCentavos: BigInt(-300000),
      currentStatus: "PARTIALLY_PAID",
    });
    expect(reversed).toEqual({
      nextPaidCentavos: BigInt(0),
      nextStatus: "ISSUED",
    });

    expect(() =>
      reconcileInvoicePaymentState({
        totalAmountCentavos: BigInt(500000),
        currentPaidCentavos: BigInt(0),
        deltaCentavos: BigInt(100000),
        currentStatus: "VOID",
      }),
    ).toThrow();
  });
});
