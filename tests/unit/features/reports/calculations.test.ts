import { describe, expect, it } from "vitest";
import {
  buildCollectionTrendPoints,
  classifyLeaseExpiryBucket,
  computeMoneyRatioPercent,
  computePerUnitMoney,
  computeSharePercent,
} from "../../../../src/features/reports/calculations";

describe("reports pure analytics calculations", () => {
  it("computes integer share percentages safely", () => {
    expect(computeSharePercent(0, 0)).toBe(0);
    expect(computeSharePercent(1, 3)).toBe(33);
    expect(computeSharePercent(2, 3)).toBe(67);
  });

  it("computes exact BigInt centavo ratios and per-unit averages with HALF_UP rounding", () => {
    expect(computeMoneyRatioPercent("1500.00", "0.00")).toBeNull();
    expect(computeMoneyRatioPercent("2500.00", "10000.00")).toBe(25);
    expect(computeMoneyRatioPercent("-1500.00", "6000.00")).toBe(-25);

    expect(computePerUnitMoney("5000.00", 0)).toBeNull();
    expect(computePerUnitMoney("100.00", 3)).toBe("33.33");
    expect(computePerUnitMoney("100.00", 6)).toBe("16.67");
    expect(computePerUnitMoney("2800.00", 2)).toBe("1400.00");
  });

  it("classifies boarding lease expirations relative to as-of business date", () => {
    expect(classifyLeaseExpiryBucket("2026-11-10", "2026-11-16")).toBe(
      "PAST_END",
    );
    expect(classifyLeaseExpiryBucket("2026-11-16", "2026-11-16")).toBe(
      "WITHIN_30",
    );
    expect(classifyLeaseExpiryBucket("2026-12-16", "2026-11-16")).toBe(
      "WITHIN_30",
    );
    expect(classifyLeaseExpiryBucket("2027-01-15", "2026-11-16")).toBe(
      "DAYS_31_90",
    );
    expect(classifyLeaseExpiryBucket("2027-03-01", "2026-11-16")).toBe(
      "DAYS_91_PLUS",
    );
  });

  it("aggregates collections into daily, weekly, and monthly trend points", () => {
    const daily = buildCollectionTrendPoints("2026-11-01", "2026-11-03", [
      { paidDate: "2026-11-01", status: "POSTED", amount: "2000.00" },
      { paidDate: "2026-11-02", status: "REVERSED", amount: "1000.00" },
      { paidDate: "2026-11-02", status: "REVERSAL", amount: "-1000.00" },
    ]);
    expect(daily).toHaveLength(3);
    expect(daily[0]).toMatchObject({
      bucketKey: "2026-11-01",
      postedAmount: "2000.00",
      netAmount: "2000.00",
    });
    expect(daily[1]).toMatchObject({
      bucketKey: "2026-11-02",
      postedAmount: "1000.00",
      reversalAmount: "-1000.00",
      netAmount: "0.00",
    });

    const weekly = buildCollectionTrendPoints("2026-09-01", "2026-11-16", [
      { paidDate: "2026-09-03", status: "POSTED", amount: "4500.00" },
    ]);
    expect(weekly).toHaveLength(11);
    expect(weekly[0]?.netAmount).toBe("4500.00");

    const monthly = buildCollectionTrendPoints("2026-01-01", "2026-11-16", [
      { paidDate: "2026-10-15", status: "POSTED", amount: "8000.00" },
    ]);
    expect(monthly).toHaveLength(11);
    expect(monthly[9]).toMatchObject({
      bucketKey: "2026-10",
      label: "Oct 2026",
      netAmount: "8000.00",
    });
  });
});

