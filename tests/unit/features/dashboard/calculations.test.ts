import { describe, expect, it } from "vitest";
import {
  computeOccupancyPercent,
  computeOpenCurrentBalance,
  deriveRoomUnitStatus,
  getManilaMonthWindow,
  getPreviousManilaMonthWindow,
} from "../../../../src/features/dashboard/calculations";

describe("dashboard pure calculations", () => {
  it("returns null occupancy percent when there are zero active rooms", () => {
    expect(computeOccupancyPercent(0, 0)).toBeNull();
    expect(computeOccupancyPercent(2, 0)).toBeNull();
  });

  it("computes clamped rounded occupancy percentage for active rooms", () => {
    expect(computeOccupancyPercent(0, 4)).toBe(0);
    expect(computeOccupancyPercent(1, 3)).toBe(33);
    expect(computeOccupancyPercent(2, 3)).toBe(67);
    expect(computeOccupancyPercent(5, 4)).toBe(100);
  });

  it("computes half-open Asia/Manila month window including year rollover", () => {
    expect(getManilaMonthWindow("2026-11-16")).toEqual({
      monthKey: "2026-11",
      startDateManila: "2026-11-01",
      nextMonthStartDateManila: "2026-12-01",
    });
    expect(getManilaMonthWindow("2026-12-31")).toEqual({
      monthKey: "2026-12",
      startDateManila: "2026-12-01",
      nextMonthStartDateManila: "2027-01-01",
    });
  });

  it("derives room operational status prioritizing holds over active occupancy and fallback bed status", () => {
    expect(
      deriveRoomUnitStatus({
        hasActiveHold: true,
        hasActiveStayOrAssignment: true,
        bedStatuses: ["AVAILABLE"],
      }),
    ).toBe("MAINTENANCE");

    expect(
      deriveRoomUnitStatus({
        hasActiveHold: false,
        hasActiveStayOrAssignment: true,
        bedStatuses: ["AVAILABLE"],
      }),
    ).toBe("OCCUPIED");

    expect(
      deriveRoomUnitStatus({
        hasActiveHold: false,
        hasActiveStayOrAssignment: false,
        bedStatuses: ["MAINTENANCE"],
      }),
    ).toBe("MAINTENANCE");

    expect(
      deriveRoomUnitStatus({
        hasActiveHold: false,
        hasActiveStayOrAssignment: false,
        bedStatuses: ["AVAILABLE"],
      }),
    ).toBe("AVAILABLE");
  });

  it("computes previous Asia/Manila calendar month window across January rollover", () => {
    expect(getPreviousManilaMonthWindow("2026-11-16")).toEqual({
      monthKey: "2026-10",
      startDateManila: "2026-10-01",
      nextMonthStartDateManila: "2026-11-01",
    });
    expect(getPreviousManilaMonthWindow("2026-01-05")).toEqual({
      monthKey: "2025-12",
      startDateManila: "2025-12-01",
      nextMonthStartDateManila: "2026-01-01",
    });
  });

  it("computes non-overdue open receivables in exact centavos clamped at zero", () => {
    expect(computeOpenCurrentBalance("6000.00", "2500.50")).toBe("3499.50");
    expect(computeOpenCurrentBalance("1000.00", "1500.00")).toBe("0.00");
  });
});
