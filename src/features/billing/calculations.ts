import { addManilaDays, diffManilaDays, toManilaDate } from "@/lib/dates";
import {
  addMoney,
  formatMoneyDecimal,
  parseMoneyDecimal,
  prorateMoneyHalfUp,
  subtractMoney,
} from "@/lib/money";
import type {
  DepositPolicyValue,
  ProrationPolicyValue,
} from "@/features/settings/schemas";
import { BILLING_PERIOD_PATTERN, type InvoiceItemTypeValue } from "./schemas";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

export type MonthBoundsManila = {
  billingPeriod: string;
  year: number;
  month: number;
  monthStartManila: string;
  monthEndExclusiveManila: string;
  daysInMonth: number;
};

/**
 * Returns the current Asia/Manila billing period token (`YYYY-MM`).
 */
export function getCurrentManilaBillingPeriod(
  nowUtc: Date = new Date(),
): string {
  return toManilaDate(nowUtc).slice(0, 7);
}

/**
 * Computes the half-open Asia/Manila calendar month bounds `[monthStart, monthEndExclusive)`
 * for a validated `YYYY-MM` billing period.
 */
export function getMonthBoundsManila(billingPeriod: string): MonthBoundsManila {
  const match = BILLING_PERIOD_PATTERN.exec(billingPeriod.trim());
  if (!match) {
    throw new RangeError("Invalid billing period. Expected YYYY-MM.");
  }
  const year = Number(billingPeriod.slice(0, 4));
  const month = Number(billingPeriod.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const monthStartManila = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`;
  const monthEndExclusiveManila = `${nextYear.toString().padStart(4, "0")}-${nextMonth.toString().padStart(2, "0")}-01`;
  const daysInMonth = diffManilaDays(monthStartManila, monthEndExclusiveManila);

  return {
    billingPeriod: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`,
    year,
    month,
    monthStartManila,
    monthEndExclusiveManila,
    daysInMonth,
  };
}

/**
 * Computes the Asia/Manila invoice due date for `billingPeriod` using the Owner's
 * configured billing day (1–28) plus grace period days.
 */
export function computeBillingDueDateManila(
  billingPeriod: string,
  billingDayOfMonth: number,
  gracePeriodDays: number,
): string {
  if (
    !Number.isInteger(billingDayOfMonth) ||
    billingDayOfMonth < 1 ||
    billingDayOfMonth > 28
  ) {
    throw new RangeError("Billing day must be between 1 and 28.");
  }
  if (!Number.isInteger(gracePeriodDays) || gracePeriodDays < 0) {
    throw new RangeError("Grace period days cannot be negative.");
  }
  const { year, month } = getMonthBoundsManila(billingPeriod);
  const billingDateManila = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${billingDayOfMonth.toString().padStart(2, "0")}`;
  return addManilaDays(billingDateManila, gracePeriodDays);
}

/**
 * Computes exact centavo rent for `activeDays` inside a month of `daysInMonth`
 * according to the Owner's explicit `ProrationPolicy`.
 */
export function computeProratedRentCentavos(params: {
  monthlyRateCentavos: bigint;
  activeDays: number;
  daysInMonth: number;
  prorationPolicy: ProrationPolicyValue;
}): bigint {
  const { monthlyRateCentavos, activeDays, daysInMonth, prorationPolicy } =
    params;
  if (monthlyRateCentavos < ZERO) {
    throw new RangeError("Monthly rate cannot be negative.");
  }
  if (activeDays <= 0) {
    return ZERO;
  }
  if (activeDays >= daysInMonth || prorationPolicy === "NONE") {
    return monthlyRateCentavos;
  }

  switch (prorationPolicy) {
    case "DAILY_EXACT":
      return prorateMoneyHalfUp(
        monthlyRateCentavos,
        BigInt(activeDays),
        BigInt(daysInMonth),
      );
    case "DAILY_30": {
      const cappedDays = Math.min(activeDays, 30);
      return prorateMoneyHalfUp(
        monthlyRateCentavos,
        BigInt(cappedDays),
        BigInt(30),
      );
    }
    case "HALF_MONTH": {
      const halfThreshold = Math.ceil(daysInMonth / 2);
      if (activeDays <= halfThreshold) {
        return prorateMoneyHalfUp(monthlyRateCentavos, BigInt(1), BigInt(2));
      }
      return monthlyRateCentavos;
    }
  }
}

/**
 * Computes exact centavo line total (`unitAmount * quantity`) using HALF_UP rounding.
 */
export function computeLineItemTotalCentavos(
  unitAmountDecimal: string,
  quantityDecimal: string,
): bigint {
  const unitCentavos = parseMoneyDecimal(unitAmountDecimal);
  const qtyHundredths = parseMoneyDecimal(quantityDecimal);
  if (unitCentavos < ZERO || qtyHundredths <= ZERO) {
    throw new RangeError(
      "Unit amount must be non-negative and quantity positive.",
    );
  }
  return prorateMoneyHalfUp(unitCentavos, qtyHundredths, HUNDRED);
}

export type ComputedPeriodInvoiceDraft = {
  items: Array<{
    itemType: InvoiceItemTypeValue;
    description: string;
    quantity: string;
    unitAmount: string;
    lineTotal: string;
  }>;
  depositCreditAdjustment: {
    amount: string;
    reason: string;
  } | null;
  subtotalAmount: string;
  adjustmentAmount: string;
  totalAmount: string;
  dueDateManila: string;
  periodStartManila: string;
  periodEndManila: string;
};

/**
 * Computes a deterministic monthly invoice draft for one tenant assignment
 * strictly from Owner-configured proration, deposit, billing-day, and grace rules.
 * Returns `null` when the assignment has zero billable overlap or total <= 0
 * with no charges to bill.
 */
export function computePeriodInvoiceDraft(params: {
  billingPeriod: string;
  billingDayOfMonth: number;
  gracePeriodDays: number;
  prorationPolicy: ProrationPolicyValue;
  depositPolicy: DepositPolicyValue;
  assignment: {
    startDateManila: string;
    endDateManila: string;
    actualMoveOutDateManila: string | null;
    monthlyRate: string;
    securityDeposit: string;
  };
  depositAlreadyBilled: boolean;
  depositAlreadyApplied: boolean;
}): ComputedPeriodInvoiceDraft | null {
  const bounds = getMonthBoundsManila(params.billingPeriod);
  const effectiveEnd =
    params.assignment.actualMoveOutDateManila &&
    params.assignment.actualMoveOutDateManila < params.assignment.endDateManila
      ? params.assignment.actualMoveOutDateManila
      : params.assignment.endDateManila;

  const overlapStart =
    params.assignment.startDateManila > bounds.monthStartManila
      ? params.assignment.startDateManila
      : bounds.monthStartManila;
  const overlapEnd =
    effectiveEnd < bounds.monthEndExclusiveManila
      ? effectiveEnd
      : bounds.monthEndExclusiveManila;

  const activeDays = diffManilaDays(overlapStart, overlapEnd);
  if (activeDays <= 0) {
    return null;
  }

  const monthlyRateCentavos = parseMoneyDecimal(params.assignment.monthlyRate);
  const rentCentavos = computeProratedRentCentavos({
    monthlyRateCentavos,
    activeDays,
    daysInMonth: bounds.daysInMonth,
    prorationPolicy: params.prorationPolicy,
  });

  const items: ComputedPeriodInvoiceDraft["items"] = [];
  if (rentCentavos > ZERO) {
    const rentDecimal = formatMoneyDecimal(rentCentavos);
    const inclusiveEnd = addManilaDays(overlapEnd, -1);
    const description =
      activeDays >= bounds.daysInMonth
        ? `Monthly room rent (${bounds.billingPeriod})`
        : `Prorated room rent (${activeDays}/${bounds.daysInMonth} days, ${overlapStart} to ${inclusiveEnd})`;
    items.push({
      itemType: "RENT",
      description,
      quantity: "1.00",
      unitAmount: rentDecimal,
      lineTotal: rentDecimal,
    });
  }

  const depositCentavos = parseMoneyDecimal(params.assignment.securityDeposit);
  const startsInThisPeriod =
    params.assignment.startDateManila >= bounds.monthStartManila &&
    params.assignment.startDateManila < bounds.monthEndExclusiveManila;
  if (
    depositCentavos > ZERO &&
    !params.depositAlreadyBilled &&
    startsInThisPeriod
  ) {
    const depositDecimal = formatMoneyDecimal(depositCentavos);
    items.push({
      itemType: "DEPOSIT",
      description: "Security deposit",
      quantity: "1.00",
      unitAmount: depositDecimal,
      lineTotal: depositDecimal,
    });
  }

  if (items.length === 0) {
    return null;
  }

  let subtotalCentavos = ZERO;
  for (const item of items) {
    subtotalCentavos = addMoney(
      subtotalCentavos,
      parseMoneyDecimal(item.lineTotal),
    );
  }

  let depositCreditAdjustment: ComputedPeriodInvoiceDraft["depositCreditAdjustment"] =
    null;
  let adjustmentCentavos = ZERO;

  const endsInThisPeriod = effectiveEnd <= bounds.monthEndExclusiveManila;
  const shouldApplyOnLastMonth =
    params.depositPolicy === "APPLY_TO_LAST_MONTH" && endsInThisPeriod;
  const shouldApplyOnMoveOut =
    params.depositPolicy === "APPLY_ON_MOVE_OUT" &&
    params.assignment.actualMoveOutDateManila !== null &&
    endsInThisPeriod;

  if (
    depositCentavos > ZERO &&
    !params.depositAlreadyApplied &&
    rentCentavos > ZERO &&
    (shouldApplyOnLastMonth || shouldApplyOnMoveOut)
  ) {
    const creditCentavos =
      depositCentavos <= rentCentavos ? depositCentavos : rentCentavos;
    if (creditCentavos > ZERO) {
      depositCreditAdjustment = {
        amount: formatMoneyDecimal(creditCentavos),
        reason:
          params.depositPolicy === "APPLY_ON_MOVE_OUT"
            ? "Security deposit applied on move-out"
            : "Security deposit applied to final month rent",
      };
      adjustmentCentavos = -creditCentavos;
    }
  }

  const totalCentavos = addMoney(subtotalCentavos, adjustmentCentavos);
  if (totalCentavos < ZERO) {
    throw new RangeError("Computed invoice total cannot be negative.");
  }

  // If rent was zero and only zero-amount items existed we already returned null;
  // if total is zero solely due to deposit credit, keep the invoice so the credit application is recorded.
  const dueDateManila = computeBillingDueDateManila(
    bounds.billingPeriod,
    params.billingDayOfMonth,
    params.gracePeriodDays,
  );

  return {
    items,
    depositCreditAdjustment,
    subtotalAmount: formatMoneyDecimal(subtotalCentavos),
    adjustmentAmount: formatMoneyDecimal(adjustmentCentavos),
    totalAmount: formatMoneyDecimal(
      subtractMoney(subtotalCentavos, -adjustmentCentavos),
    ),
    dueDateManila,
    periodStartManila: bounds.monthStartManila,
    periodEndManila: bounds.monthEndExclusiveManila,
  };
}

/**
 * Formats an Owner-scoped sequential invoice number (e.g. `INV-2026-000001`).
 */
export function formatOfficialInvoiceNumber(
  invoicePrefix: string,
  year: number,
  sequence: bigint,
): string {
  const cleanPrefix = invoicePrefix.trim().toUpperCase();
  const paddedSeq = sequence.toString().padStart(6, "0");
  return `${cleanPrefix}-${year.toString().padStart(4, "0")}-${paddedSeq}`;
}

/**
 * Formats a `YYYY-MM` billing period label in Asia/Manila (e.g. `Nov 2026`).
 */
const periodLabelFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
});

export function formatBillingPeriodLabel(billingPeriod: string): string {
  const { monthStartManila } = getMonthBoundsManila(billingPeriod);
  const year = Number(monthStartManila.slice(0, 4));
  const month = Number(monthStartManila.slice(5, 7));
  const instant = new Date(Date.UTC(year, month - 1, 15, 4, 0, 0));
  return periodLabelFormatter.format(instant);
}
