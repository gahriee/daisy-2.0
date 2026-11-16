import type { PaymentStatusValue } from "@/features/payments/schemas";
import { addManilaDays, diffManilaDays, parseManilaDate } from "@/lib/dates";
import { addMoney, formatMoneyDecimal, parseMoneyDecimal } from "@/lib/money";

const ZERO = BigInt(0);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const LEASE_EXPIRY_BUCKETS = [
  "PAST_END",
  "WITHIN_30",
  "DAYS_31_90",
  "DAYS_91_PLUS",
] as const;

export type LeaseExpiryBucketValue = (typeof LEASE_EXPIRY_BUCKETS)[number];

export const LEASE_EXPIRY_BUCKET_LABELS: Record<
  LeaseExpiryBucketValue,
  string
> = {
  PAST_END: "Past scheduled end",
  WITHIN_30: "Ending within 30 days",
  DAYS_31_90: "31–90 days",
  DAYS_91_PLUS: "91+ days",
};

export type CollectionTrendEntryInput = {
  paidDate: string;
  status: PaymentStatusValue;
  amount: string;
};

export type CollectionTrendPoint = {
  bucketKey: string;
  label: string;
  entryCount: number;
  postedAmount: string;
  reversalAmount: string;
  netAmount: string;
};

export function formatShortManilaMonthDay(date: string): string {
  const { month, day } = parseManilaDate(date);
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}

export function formatShortManilaMonthYear(monthKey: string): string {
  const [yearPart, monthPart] = monthKey.split("-");
  const monthIdx = Number(monthPart) - 1;
  const monthName = SHORT_MONTHS[monthIdx] ?? monthPart;
  return `${monthName} ${yearPart}`;
}

/**
 * Computes integer percentage share (`0..100`), returning `0` when total is non-positive.
 */
export function computeSharePercent(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Computes an integer HALF_UP percentage for `numerator / denominator` using
 * exact BigInt centavos, returning `null` when denominator is <= 0.
 */
export function computeMoneyRatioPercent(
  numeratorDecimal: string,
  denominatorDecimal: string,
): number | null {
  const den = parseMoneyDecimal(denominatorDecimal);
  if (den <= ZERO) return null;
  const num = parseMoneyDecimal(numeratorDecimal);
  const absNum = num < ZERO ? -num : num;
  const rounded = (absNum * HUNDRED * TWO + den) / (den * TWO);
  const signed = num < ZERO ? -Number(rounded) : Number(rounded);
  return signed;
}

/**
 * Computes exact per-unit average currency string using HALF_UP centavo rounding,
 * returning `null` when `count <= 0`.
 */
export function computePerUnitMoney(
  totalDecimal: string,
  count: number,
): string | null {
  if (count <= 0) return null;
  const centavos = parseMoneyDecimal(totalDecimal);
  const negative = centavos < ZERO;
  const abs = negative ? -centavos : centavos;
  const divisor = BigInt(count);
  const rounded = (abs * TWO + divisor) / (divisor * TWO);
  if (rounded === ZERO) return "0.00";
  return formatMoneyDecimal(negative ? -rounded : rounded);
}

/**
 * Classifies a boarder lease end date relative to `asOfDateManila`.
 */
export function classifyLeaseExpiryBucket(
  endDateManila: string,
  asOfDateManila: string,
): LeaseExpiryBucketValue {
  const remaining = diffManilaDays(asOfDateManila, endDateManila);
  if (remaining < 0) return "PAST_END";
  if (remaining <= 30) return "WITHIN_30";
  if (remaining <= 90) return "DAYS_31_90";
  return "DAYS_91_PLUS";
}

export function formatOneDecimalAverage(
  total: number,
  count: number,
): string | null {
  if (count <= 0) return null;
  return (total / count).toFixed(1);
}

/**
 * Aggregates payment ledger entries over `[fromDate, toDate]` into bounded chart
 * buckets (daily for <= 31 days, 7-day weeks for <= 140 days, calendar months beyond).
 */
export function buildCollectionTrendPoints(
  fromDate: string,
  toDate: string,
  entries: readonly CollectionTrendEntryInput[],
): CollectionTrendPoint[] {
  const totalDays = diffManilaDays(fromDate, toDate) + 1;
  if (totalDays <= 0) return [];

  type BucketAcc = {
    bucketKey: string;
    label: string;
    entryCount: number;
    posted: bigint;
    reversal: bigint;
    net: bigint;
  };

  const buckets: BucketAcc[] = [];
  const bucketByKey = new Map<string, BucketAcc>();

  if (totalDays <= 31) {
    for (let i = 0; i < totalDays; i += 1) {
      const date = addManilaDays(fromDate, i);
      const bucket: BucketAcc = {
        bucketKey: date,
        label: formatShortManilaMonthDay(date),
        entryCount: 0,
        posted: ZERO,
        reversal: ZERO,
        net: ZERO,
      };
      buckets.push(bucket);
      bucketByKey.set(date, bucket);
    }

    for (const entry of entries) {
      const bucket = bucketByKey.get(entry.paidDate);
      if (!bucket) continue;
      const amount = parseMoneyDecimal(entry.amount);
      bucket.entryCount += 1;
      bucket.net = addMoney(bucket.net, amount);
      if (entry.status === "REVERSAL") {
        bucket.reversal = addMoney(bucket.reversal, amount);
      } else {
        bucket.posted = addMoney(bucket.posted, amount);
      }
    }
  } else if (totalDays <= 140) {
    const weekCount = Math.ceil(totalDays / 7);
    for (let w = 0; w < weekCount; w += 1) {
      const start = addManilaDays(fromDate, w * 7);
      const bucketKey = `W${w + 1}:${start}`;
      const bucket: BucketAcc = {
        bucketKey,
        label: formatShortManilaMonthDay(start),
        entryCount: 0,
        posted: ZERO,
        reversal: ZERO,
        net: ZERO,
      };
      buckets.push(bucket);
      bucketByKey.set(bucketKey, bucket);
    }

    for (const entry of entries) {
      const offset = diffManilaDays(fromDate, entry.paidDate);
      if (offset < 0 || offset >= totalDays) continue;
      const weekIdx = Math.floor(offset / 7);
      const bucket = buckets[weekIdx];
      if (!bucket) continue;
      const amount = parseMoneyDecimal(entry.amount);
      bucket.entryCount += 1;
      bucket.net = addMoney(bucket.net, amount);
      if (entry.status === "REVERSAL") {
        bucket.reversal = addMoney(bucket.reversal, amount);
      } else {
        bucket.posted = addMoney(bucket.posted, amount);
      }
    }
  } else {
    let cursor = parseManilaDate(fromDate);
    const end = parseManilaDate(toDate);
    while (
      cursor.year < end.year ||
      (cursor.year === end.year && cursor.month <= end.month)
    ) {
      const key = `${cursor.year.toString().padStart(4, "0")}-${cursor.month.toString().padStart(2, "0")}`;
      const bucket: BucketAcc = {
        bucketKey: key,
        label: formatShortManilaMonthYear(key),
        entryCount: 0,
        posted: ZERO,
        reversal: ZERO,
        net: ZERO,
      };
      buckets.push(bucket);
      bucketByKey.set(key, bucket);
      cursor =
        cursor.month === 12
          ? { year: cursor.year + 1, month: 1, day: 1 }
          : { year: cursor.year, month: cursor.month + 1, day: 1 };
    }

    for (const entry of entries) {
      const key = entry.paidDate.slice(0, 7);
      const bucket = bucketByKey.get(key);
      if (!bucket) continue;
      const amount = parseMoneyDecimal(entry.amount);
      bucket.entryCount += 1;
      bucket.net = addMoney(bucket.net, amount);
      if (entry.status === "REVERSAL") {
        bucket.reversal = addMoney(bucket.reversal, amount);
      } else {
        bucket.posted = addMoney(bucket.posted, amount);
      }
    }
  }

  return buckets.map((b) => ({
    bucketKey: b.bucketKey,
    label: b.label,
    entryCount: b.entryCount,
    postedAmount: formatMoneyDecimal(b.posted),
    reversalAmount: formatMoneyDecimal(b.reversal),
    netAmount: formatMoneyDecimal(b.net),
  }));
}
