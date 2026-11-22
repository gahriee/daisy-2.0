import { describe, expect, it } from "vitest";
import {
  SYNC_PAGE_MAX_RECORDS,
  SYNC_PUSH_MAX_OPS,
  SyncBootstrapRequestSchema,
  SyncPullQuerySchema,
  SyncPushRequestSchema,
} from "../../../../src/features/sync/contracts";

describe("sync transport schemas", () => {
  it("enforces push batch bounds of 1 to 50 operations", () => {
    expect(SyncPushRequestSchema.safeParse({ operations: [] }).success).toBe(
      false,
    );
    expect(
      SyncPushRequestSchema.safeParse({
        operations: Array.from({ length: SYNC_PUSH_MAX_OPS }, () => ({})),
      }).success,
    ).toBe(true);
    expect(
      SyncPushRequestSchema.safeParse({
        operations: Array.from({ length: SYNC_PUSH_MAX_OPS + 1 }, () => ({})),
      }).success,
    ).toBe(false);
  });

  it("enforces pull cursor presence and 100-record page bounds", () => {
    expect(SyncPullQuerySchema.safeParse({}).success).toBe(false);
    expect(
      SyncPullQuerySchema.safeParse({ cursor: "abc", limit: 101 }).success,
    ).toBe(false);
    const parsedPull = SyncPullQuerySchema.parse({ cursor: "abc" });
    expect(parsedPull.limit).toBe(SYNC_PAGE_MAX_RECORDS);

    expect(
      SyncBootstrapRequestSchema.safeParse({ limit: SYNC_PAGE_MAX_RECORDS })
        .success,
    ).toBe(true);
    expect(
      SyncBootstrapRequestSchema.safeParse({
        limit: SYNC_PAGE_MAX_RECORDS + 1,
      }).success,
    ).toBe(false);
  });
});
