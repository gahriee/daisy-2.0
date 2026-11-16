import { describe, expect, it } from "vitest";
import {
  REPORT_MAX_PERIOD_DAYS,
  ReportExportQuerySchema,
  resolveReportFilters,
} from "../../../../src/features/reports/schemas";

describe("resolveReportFilters", () => {
  const fixedNow = new Date("2026-11-16T02:00:00.000Z"); // 2026-11-16 10:00 Asia/Manila

  it("resolves default as-of date and month-to-date window in Asia/Manila", () => {
    const resolved = resolveReportFilters({}, fixedNow);
    expect(resolved).toEqual({
      asOfDate: "2026-11-16",
      fromDate: "2026-11-01",
      toDate: "2026-11-16",
      building: "all",
      limit: 500,
    });
  });

  it("anchors default period start/end to custom asOfDate when supplied alone", () => {
    const resolved = resolveReportFilters({ asOfDate: "2026-10-20" }, fixedNow);
    expect(resolved.asOfDate).toBe("2026-10-20");
    expect(resolved.fromDate).toBe("2026-10-01");
    expect(resolved.toDate).toBe("2026-10-20");
  });

  it("rejects reversed period dates and windows exceeding max span", () => {
    expect(() =>
      resolveReportFilters(
        { fromDate: "2026-11-20", toDate: "2026-11-10" },
        fixedNow,
      ),
    ).toThrow(/after end date/i);

    expect(() =>
      resolveReportFilters(
        { fromDate: "2025-01-01", toDate: "2026-02-01" },
        fixedNow,
      ),
    ).toThrow(new RegExp(`${REPORT_MAX_PERIOD_DAYS} days`));
  });

  it("rejects invalid calendar dates and unknown export report types", () => {
    expect(() =>
      resolveReportFilters({ asOfDate: "2026-02-30" }, fixedNow),
    ).toThrow(/YYYY-MM-DD/);

    expect(
      ReportExportQuerySchema.safeParse({ reportType: "unknown-report" })
        .success,
    ).toBe(false);
  });
});
