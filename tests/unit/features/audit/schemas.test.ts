import { describe, expect, it } from "vitest";
import { AuditFilterSchema } from "../../../../src/features/audit/schemas";

describe("audit filter schemas", () => {
  it("normalizes blank search query and defaults area to all", () => {
    const parsed = AuditFilterSchema.parse({
      query: "   ",
      action: "",
      fromDate: "",
      toDate: "",
    });
    expect(parsed.area).toBe("all");
    expect(parsed.query).toBeUndefined();
    expect(parsed.action).toBeUndefined();
    expect(parsed.fromDate).toBeUndefined();
    expect(parsed.toDate).toBeUndefined();
    expect(parsed.limit).toBe(50);
  });

  it("accepts valid Asia/Manila dates and multi-field query strings", () => {
    const parsed = AuditFilterSchema.parse({
      area: "settings",
      query: "settings.updated",
      fromDate: "2026-11-01",
      toDate: "2026-11-13",
      limit: "25",
    });
    expect(parsed.area).toBe("settings");
    expect(parsed.query).toBe("settings.updated");
    expect(parsed.limit).toBe(25);
  });

  it("rejects impossible calendar dates and inverted date ranges", () => {
    expect(
      AuditFilterSchema.safeParse({ fromDate: "2026-02-29" }).success,
    ).toBe(false);
    expect(
      AuditFilterSchema.safeParse({
        fromDate: "2026-11-14",
        toDate: "2026-11-13",
      }).success,
    ).toBe(false);
  });
});
