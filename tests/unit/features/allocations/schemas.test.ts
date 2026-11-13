import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AllocationIntervalInputSchema } from "@/features/allocations/schemas";

describe("allocation interval schemas", () => {
  it("requires endDate strictly after startDate and bedId for BED scope", () => {
    const start = new Date("2026-12-01T00:00:00.000Z");
    const same = new Date("2026-12-01T00:00:00.000Z");
    const end = new Date("2026-12-10T00:00:00.000Z");

    expect(
      AllocationIntervalInputSchema.safeParse({
        roomId: randomUUID(),
        bedId: randomUUID(),
        scope: "BED",
        type: "TENANT_ASSIGNMENT",
        startDate: start,
        endDate: same,
      }).success,
    ).toBe(false);

    expect(
      AllocationIntervalInputSchema.safeParse({
        roomId: randomUUID(),
        scope: "BED",
        type: "TENANT_ASSIGNMENT",
        startDate: start,
        endDate: end,
      }).success,
    ).toBe(false);

    expect(
      AllocationIntervalInputSchema.safeParse({
        roomId: randomUUID(),
        scope: "WHOLE_ROOM",
        type: "TRANSIENT_RESERVATION",
        startDate: start,
        endDate: end,
      }).success,
    ).toBe(true);
  });
});
