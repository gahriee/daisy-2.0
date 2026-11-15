import type { InvoiceStatusValue } from "@/features/billing/schemas";
import type { OverpaymentPolicyValue } from "@/features/settings/schemas";
import { addMoney, formatMoneyDecimal, subtractMoney } from "@/lib/money";

const ZERO = BigInt(0);

/**
 * Formats an Owner-scoped sequential official receipt number (e.g. `OR-2026-000001`).
 */
export function formatOfficialReceiptNumber(
  receiptPrefix: string,
  year: number,
  sequence: bigint,
): string {
  const cleanPrefix = receiptPrefix.trim().toUpperCase().replace(/-+$/, "");
  const paddedSeq = sequence.toString().padStart(6, "0");
  return `${cleanPrefix}-${year.toString().padStart(4, "0")}-${paddedSeq}`;
}

export type AllocationTargetInput = {
  invoiceId: string;
  amountCentavos: bigint;
  openBalanceCentavos: bigint;
};

export type PaymentDistributionResult =
  | {
      ok: true;
      totalAllocatedCentavos: bigint;
      unallocatedCentavos: bigint;
    }
  | {
      ok: false;
      kind:
        | "allocation_exceeds_invoice"
        | "allocations_exceed_payment"
        | "overpayment_rejected";
      message: string;
      invoiceId?: string;
    };

/**
 * Validates per-invoice allocations against the collected amount, current invoice
 * open balances, and the Owner's explicit overpayment policy using exact BigInt centavos.
 */
export function computePaymentDistribution(params: {
  paymentAmountCentavos: bigint;
  allocations: AllocationTargetInput[];
  overpaymentPolicy: OverpaymentPolicyValue;
}): PaymentDistributionResult {
  if (params.paymentAmountCentavos <= ZERO) {
    throw new RangeError("Payment amount must be greater than zero.");
  }

  let totalAllocatedCentavos = ZERO;

  for (const item of params.allocations) {
    if (item.amountCentavos <= ZERO) {
      throw new RangeError("Allocated amount must be greater than zero.");
    }
    if (item.amountCentavos > item.openBalanceCentavos) {
      return {
        ok: false,
        kind: "allocation_exceeds_invoice",
        invoiceId: item.invoiceId,
        message:
          item.openBalanceCentavos <= ZERO
            ? "Selected invoice no longer has an open balance."
            : `Allocation exceeds the remaining invoice balance of PHP ${formatMoneyDecimal(item.openBalanceCentavos)}.`,
      };
    }
    totalAllocatedCentavos = addMoney(
      totalAllocatedCentavos,
      item.amountCentavos,
    );
  }

  if (totalAllocatedCentavos > params.paymentAmountCentavos) {
    return {
      ok: false,
      kind: "allocations_exceed_payment",
      message: "Total invoice allocations cannot exceed the payment amount.",
    };
  }

  const unallocatedCentavos = subtractMoney(
    params.paymentAmountCentavos,
    totalAllocatedCentavos,
  );

  if (
    unallocatedCentavos > ZERO &&
    params.overpaymentPolicy === "REJECT_OVERPAYMENT"
  ) {
    return {
      ok: false,
      kind: "overpayment_rejected",
      message:
        params.allocations.length === 0
          ? "Select open invoices to settle, or update your overpayment policy to carry unallocated credit."
          : `Unallocated excess of PHP ${formatMoneyDecimal(unallocatedCentavos)} is rejected under your overpayment policy.`,
    };
  }

  return {
    ok: true,
    totalAllocatedCentavos,
    unallocatedCentavos,
  };
}

/**
 * Greedily distributes `paymentAmountCentavos` FIFO across ordered open invoices.
 */
export function autoDistributePaymentCentavos(params: {
  paymentAmountCentavos: bigint;
  openInvoices: Array<{ invoiceId: string; openBalanceCentavos: bigint }>;
}): {
  allocations: Array<{ invoiceId: string; amount: string }>;
  remainingCentavos: bigint;
} {
  let remaining = params.paymentAmountCentavos;
  const allocations: Array<{ invoiceId: string; amount: string }> = [];

  for (const invoice of params.openInvoices) {
    if (remaining <= ZERO) break;
    if (invoice.openBalanceCentavos <= ZERO) continue;
    const take =
      remaining <= invoice.openBalanceCentavos
        ? remaining
        : invoice.openBalanceCentavos;
    allocations.push({
      invoiceId: invoice.invoiceId,
      amount: formatMoneyDecimal(take),
    });
    remaining = subtractMoney(remaining, take);
  }

  return { allocations, remainingCentavos: remaining };
}

/**
 * Recomputes an open invoice's `paidAmount` and status after applying a signed
 * payment allocation (`+delta` on collection, `-delta` on reversal).
 */
export function reconcileInvoicePaymentState(params: {
  totalAmountCentavos: bigint;
  currentPaidCentavos: bigint;
  deltaCentavos: bigint;
  currentStatus: InvoiceStatusValue;
}): {
  nextPaidCentavos: bigint;
  nextStatus: InvoiceStatusValue;
} {
  if (params.currentStatus === "DRAFT" || params.currentStatus === "VOID") {
    throw new RangeError(
      "Cannot apply or reverse payment allocations on draft or void invoices.",
    );
  }

  const nextPaidCentavos = params.currentPaidCentavos + params.deltaCentavos;
  if (
    nextPaidCentavos < ZERO ||
    nextPaidCentavos > params.totalAmountCentavos
  ) {
    throw new RangeError(
      "Updated paid amount would violate invoice bounds [0, totalAmount].",
    );
  }

  const nextStatus: InvoiceStatusValue =
    nextPaidCentavos >= params.totalAmountCentavos
      ? "PAID"
      : nextPaidCentavos > ZERO
        ? "PARTIALLY_PAID"
        : "ISSUED";

  return { nextPaidCentavos, nextStatus };
}
