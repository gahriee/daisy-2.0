import { describe, expect, it } from "vitest";
import {
  addManilaDays,
  diffManilaDays,
  isOverdueManila,
  isValidManilaDate,
  isValidTimeHHmm,
  manilaDateTimeToUtc,
  parseManilaDate,
  toManilaDate,
} from "../../../src/lib/dates";

describe("Asia/Manila business date helpers", () => {
  it("converts UTC instants across Manila midnight boundaries", () => {
    expect(toManilaDate(new Date("2026-11-13T15:59:59.999Z"))).toBe(
      "2026-11-13",
    );
    expect(toManilaDate(new Date("2026-11-13T16:00:00.000Z"))).toBe(
      "2026-11-14",
    );
  });

  it("converts Manila date and HH:mm wall time to UTC instants", () => {
    const checkIn = manilaDateTimeToUtc("2026-11-13", "14:00");
    expect(checkIn.toISOString()).toBe("2026-11-13T06:00:00.000Z");

    const earlyMorning = manilaDateTimeToUtc("2026-11-14", "02:30");
    expect(earlyMorning.toISOString()).toBe("2026-11-13T18:30:00.000Z");
  });

  it("validates calendar dates and times strictly", () => {
    expect(isValidManilaDate("2024-02-29")).toBe(true);
    expect(isValidManilaDate("2026-02-29")).toBe(false);
    expect(isValidManilaDate("2026-04-31")).toBe(false);
    expect(() => parseManilaDate("11-13-2026")).toThrow(RangeError);
    expect(isValidTimeHHmm("00:00")).toBe(true);
    expect(isValidTimeHHmm("23:59")).toBe(true);
    expect(isValidTimeHHmm("24:00")).toBe(false);
  });

  it("adds, diffs, and derives overdue state in Asia/Manila", () => {
    expect(addManilaDays("2026-11-30", 2)).toBe("2026-12-02");
    expect(diffManilaDays("2026-11-13", "2026-11-18")).toBe(5);
    expect(
      isOverdueManila("2026-11-13", new Date("2026-11-13T15:59:59Z")),
    ).toBe(false);
    expect(
      isOverdueManila("2026-11-13", new Date("2026-11-13T16:00:00Z")),
    ).toBe(true);
  });
});
