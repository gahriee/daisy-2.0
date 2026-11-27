import { diffManilaDays, manilaDateTimeToUtc } from "@/lib/dates";
import { formatMoneyDecimal, parseMoneyDecimal } from "@/lib/money";

const ZERO = BigInt(0);

/**
 * Computes transient stay nights strictly on Asia/Manila business dates.
 * Minimum 1 night; throws or returns <= 0 if invalid ordering.
 */
export function computeTransientNights(
  checkInDateManila: string,
  checkOutDateManila: string,
): number {
  return diffManilaDays(checkInDateManila, checkOutDateManila);
}

/**
 * Converts Manila check-in / check-out dates and Owner Settings stay times
 * (`defaultCheckInTime`, `defaultCheckOutTime`) into exact UTC instant bounds
 * for unified `Allocation` half-open interval locks `[startDate, endDate)`.
 */
export function computeTransientStayUtcBounds(input: {
  checkInDateManila: string;
  checkOutDateManila: string;
  checkInTimeHHmm: string;
  checkOutTimeHHmm: string;
}): { startUtc: Date; endUtc: Date } {
  const startUtc = manilaDateTimeToUtc(
    input.checkInDateManila,
    input.checkInTimeHHmm,
  );
  const endUtc = manilaDateTimeToUtc(
    input.checkOutDateManila,
    input.checkOutTimeHHmm,
  );
  if (endUtc.getTime() <= startUtc.getTime()) {
    throw new Error(
      "Check-out timestamp must be strictly after check-in timestamp.",
    );
  }
  return { startUtc, endUtc };
}

/**
 * Resolves effective nightly rate in integer centavos directly from the room's
 * configured daily rate. Returns ZERO when unconfigured.
 */
export function resolveTransientDailyRateCentavos(input: {
  roomDailyRate: { toString(): string } | string | null | undefined;
}): bigint {
  if (
    input.roomDailyRate != null &&
    String(input.roomDailyRate).trim() !== ""
  ) {
    return parseMoneyDecimal(String(input.roomDailyRate));
  }
  return ZERO;
}

/**
 * Computes exact total indicative or booked amount in centavos for `nights`.
 */
export function computeTransientStayTotalCentavos(
  dailyRateCentavos: bigint,
  nights: number,
): bigint {
  if (!Number.isInteger(nights) || nights <= 0 || dailyRateCentavos < ZERO) {
    return ZERO;
  }
  return dailyRateCentavos * BigInt(nights);
}

export function formatCentavos(centavos: bigint): string {
  return formatMoneyDecimal(centavos);
}
