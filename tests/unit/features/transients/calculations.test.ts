import { describe, expect, it } from "vitest";
import {
  computeTransientNights,
  computeTransientStayTotalCentavos,
  computeTransientStayUtcBounds,
  formatCentavos,
  resolveTransientDailyRateCentavos,
} from "../../../../src/features/transients/calculations";

describe("transients stay calculations", () => {
  it("computes Manila calendar nights accurately across month boundaries", () => {
    expect(computeTransientNights("2026-11-14", "2026-11-16")).toBe(2);
    expect(computeTransientNights("2026-11-29", "2026-12-02")).toBe(3);
    expect(computeTransientNights("2026-11-16", "2026-11-16")).toBe(0);
  });

  it("converts Manila check-in/out dates and Owner times into strict half-open UTC bounds", () => {
    const { startUtc, endUtc } = computeTransientStayUtcBounds({
      checkInDateManila: "2026-11-14",
      checkOutDateManila: "2026-11-16",
      checkInTimeHHmm: "14:00",
      checkOutTimeHHmm: "11:00",
    });

    expect(startUtc.toISOString()).toBe("2026-11-14T06:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-11-16T03:00:00.000Z");

    expect(() =>
      computeTransientStayUtcBounds({
        checkInDateManila: "2026-11-14",
        checkOutDateManila: "2026-11-14",
        checkInTimeHHmm: "14:00",
        checkOutTimeHHmm: "11:00",
      }),
    ).toThrow("Check-out timestamp must be strictly after check-in timestamp.");
  });

  it("resolves daily rate override before room-type fallback and totals centavos", () => {
    expect(
      resolveTransientDailyRateCentavos({
        roomDailyRate: "850.50",
        roomTypeDailyRate: "600.00",
      }),
    ).toBe(BigInt(85050));

    expect(
      resolveTransientDailyRateCentavos({
        roomDailyRate: null,
        roomTypeDailyRate: "600.00",
      }),
    ).toBe(BigInt(60000));

    expect(
      resolveTransientDailyRateCentavos({
        roomDailyRate: null,
        roomTypeDailyRate: null,
      }),
    ).toBe(BigInt(0));

    const total = computeTransientStayTotalCentavos(BigInt(85050), 3);
    expect(total).toBe(BigInt(255150));
    expect(formatCentavos(total)).toBe("2551.50");
    expect(computeTransientStayTotalCentavos(BigInt(85050), 0)).toBe(BigInt(0));
  });
});
