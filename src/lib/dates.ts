const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ManilaDateComponents = {
  year: number;
  month: number;
  day: number;
};

/**
 * Validates a calendar date string (YYYY-MM-DD) and returns its components.
 */
export function parseManilaDate(date: string): ManilaDateComponents {
  const match = DATE_PATTERN.exec(date.trim());
  if (!match) {
    throw new RangeError("Invalid YYYY-MM-DD date string.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError("Invalid calendar date.");
  }
  return { year, month, day };
}

export function isValidManilaDate(date: string): boolean {
  try {
    parseManilaDate(date);
    return true;
  } catch {
    return false;
  }
}

export function isValidTimeHHmm(time: string): boolean {
  return TIME_PATTERN.test(time.trim());
}

/**
 * Converts a UTC instant to its Asia/Manila YYYY-MM-DD business date.
 */
export function toManilaDate(instant: Date): string {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MS);
  const year = shifted.getUTCFullYear().toString().padStart(4, "0");
  const month = (shifted.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = shifted.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Converts an Asia/Manila business date and HH:mm wall time to a UTC instant.
 */
export function manilaDateTimeToUtc(date: string, timeHHmm: string): Date {
  const { year, month, day } = parseManilaDate(date);
  const timeMatch = TIME_PATTERN.exec(timeHHmm.trim());
  if (!timeMatch) {
    throw new RangeError("Invalid HH:mm time string.");
  }
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0, 0) - MANILA_OFFSET_MS,
  );
}

export function addManilaDays(date: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError("Day offset must be an integer.");
  }
  const { year, month, day } = parseManilaDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const outYear = shifted.getUTCFullYear().toString().padStart(4, "0");
  const outMonth = (shifted.getUTCMonth() + 1).toString().padStart(2, "0");
  const outDay = shifted.getUTCDate().toString().padStart(2, "0");
  return `${outYear}-${outMonth}-${outDay}`;
}

export function diffManilaDays(startDate: string, endDate: string): number {
  const start = parseManilaDate(startDate);
  const end = parseManilaDate(endDate);
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / MS_PER_DAY);
}

/**
 * Derives overdue state strictly from the Asia/Manila business date (never stored).
 */
export function isOverdueManila(
  dueDate: string,
  nowUtc: Date = new Date(),
): boolean {
  parseManilaDate(dueDate);
  return toManilaDate(nowUtc) > dueDate;
}

const manilaDateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const manilaDateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatManilaDate(date: string): string {
  const instant = manilaDateTimeToUtc(date, "12:00");
  return manilaDateFormatter.format(instant);
}

export function formatManilaDateTime(instant: Date): string {
  return manilaDateTimeFormatter.format(instant);
}
