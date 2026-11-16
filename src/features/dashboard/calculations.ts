import type { BedStatusValue } from "@/features/rooms/schemas";
import { parseManilaDate } from "@/lib/dates";
import {
  formatMoneyDecimal,
  parseMoneyDecimal,
  subtractMoney,
} from "@/lib/money";

export type RoomUnitOperationalStatus =
  "OCCUPIED" | "MAINTENANCE" | "AVAILABLE";

/**
 * Computes integer occupancy percentage, returning null when there are no active
 * rooms so unavailable percentages remain distinct from 0%.
 */
export function computeOccupancyPercent(
  occupiedRooms: number,
  totalRooms: number,
): number | null {
  if (totalRooms <= 0) {
    return null;
  }
  const clamped = Math.max(0, Math.min(occupiedRooms, totalRooms));
  return Math.round((clamped / totalRooms) * 100);
}

/**
 * Returns the Asia/Manila YYYY-MM key and half-open [start, nextMonthStart)
 * business date boundaries for a given YYYY-MM-DD business date.
 */
export function getManilaMonthWindow(manilaDate: string): {
  monthKey: string;
  startDateManila: string;
  nextMonthStartDateManila: string;
} {
  const { year, month } = parseManilaDate(manilaDate);
  const yearStr = year.toString().padStart(4, "0");
  const monthStr = month.toString().padStart(2, "0");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    monthKey: `${yearStr}-${monthStr}`,
    startDateManila: `${yearStr}-${monthStr}-01`,
    nextMonthStartDateManila: `${nextYear.toString().padStart(4, "0")}-${nextMonth
      .toString()
      .padStart(2, "0")}-01`,
  };
}

/**
 * Returns the Asia/Manila YYYY-MM key and half-open [start, nextMonthStart)
 * business date boundaries for the calendar month preceding `manilaDate`.
 */
export function getPreviousManilaMonthWindow(manilaDate: string): {
  monthKey: string;
  startDateManila: string;
  nextMonthStartDateManila: string;
} {
  const { year, month } = parseManilaDate(manilaDate);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYearStr = prevYear.toString().padStart(4, "0");
  const prevMonthStr = prevMonth.toString().padStart(2, "0");
  const currentYearStr = year.toString().padStart(4, "0");
  const currentMonthStr = month.toString().padStart(2, "0");

  return {
    monthKey: `${prevYearStr}-${prevMonthStr}`,
    startDateManila: `${prevYearStr}-${prevMonthStr}-01`,
    nextMonthStartDateManila: `${currentYearStr}-${currentMonthStr}-01`,
  };
}

/**
 * Computes non-overdue open receivables (`openBalance - overdueBalance`, clamped >= 0)
 * in exact BigInt centavos for comparison charts.
 */
export function computeOpenCurrentBalance(
  openBalance: string,
  overdueBalance: string,
): string {
  const diff = subtractMoney(
    parseMoneyDecimal(openBalance),
    parseMoneyDecimal(overdueBalance),
  );
  return formatMoneyDecimal(diff > BigInt(0) ? diff : BigInt(0));
}

/**
 * Derives a room's live operational status from active allocations covering the
 * snapshot instant and fallback bed status flags, matching rooms/service.ts.
 */
export function deriveRoomUnitStatus(params: {
  hasActiveHold: boolean;
  hasActiveStayOrAssignment: boolean;
  bedStatuses: readonly BedStatusValue[];
}): RoomUnitOperationalStatus {
  if (params.hasActiveHold) {
    return "MAINTENANCE";
  }
  if (params.hasActiveStayOrAssignment) {
    return "OCCUPIED";
  }
  if (params.bedStatuses.some((status) => status === "MAINTENANCE")) {
    return "MAINTENANCE";
  }
  return "AVAILABLE";
}
