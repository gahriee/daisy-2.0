import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

import {
  RebootstrapRequiredError,
  ServiceUnavailableError,
} from "../../../../src/lib/errors";
import {
  deriveSyncCursorKey,
  signSyncCursor,
  verifySyncCursor,
} from "../../../../src/server/sync/cursor";

describe("signed opaque sync cursors", () => {
  const env = {
    SYNC_CURSOR_SECRET: "unit-test-sync-cursor-secret-0123456789",
  };
  const ownerUserId = "owner-1";
  const deviceId = randomUUID();
  const now = 1_763_200_000_000;

  it("signs and verifies pull and bootstrap cursors bound to owner and device", () => {
    const pullToken = signSyncCursor(
      {
        v: 1,
        kind: "pull",
        ownerUserId,
        deviceId,
        seq: "42",
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      env,
    );

    const verifiedPull = verifySyncCursor(
      pullToken,
      { kind: "pull", ownerUserId, deviceId, nowMs: now + 1000 },
      env,
    );
    expect(verifiedPull.seq).toBe("42");

    const entityId = randomUUID();
    const bootstrapToken = signSyncCursor(
      {
        v: 1,
        kind: "bootstrap",
        ownerUserId,
        deviceId,
        watermark: "99",
        afterEntityType: "tenant",
        afterEntityId: entityId,
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      env,
    );

    const verifiedBootstrap = verifySyncCursor(
      bootstrapToken,
      { kind: "bootstrap", ownerUserId, deviceId, nowMs: now + 1000 },
      env,
    );
    expect(verifiedBootstrap.watermark).toBe("99");
    expect(verifiedBootstrap.afterEntityId).toBe(entityId);
  });

  it("rejects tampered tokens, wrong owner/device/kind, expired TTL, and rotated secrets with 410 RebootstrapRequiredError", () => {
    const token = signSyncCursor(
      {
        v: 1,
        kind: "pull",
        ownerUserId,
        deviceId,
        seq: "12",
        issuedAt: now,
        expiresAt: now + 5000,
      },
      env,
    );

    // Tampered signature character
    const parts = token.split(".");
    const flippedSig = (parts[1]![0] === "A" ? "B" : "A") + parts[1]!.slice(1);
    expect(() =>
      verifySyncCursor(
        `${parts[0]}.${flippedSig}`,
        { kind: "pull", ownerUserId, deviceId, nowMs: now },
        env,
      ),
    ).toThrow(RebootstrapRequiredError);

    // Wrong kind
    expect(() =>
      verifySyncCursor(
        token,
        { kind: "bootstrap", ownerUserId, deviceId, nowMs: now },
        env,
      ),
    ).toThrow(RebootstrapRequiredError);

    // Wrong owner or device
    expect(() =>
      verifySyncCursor(
        token,
        { kind: "pull", ownerUserId: "other-owner", deviceId, nowMs: now },
        env,
      ),
    ).toThrow(RebootstrapRequiredError);
    expect(() =>
      verifySyncCursor(
        token,
        { kind: "pull", ownerUserId, deviceId: randomUUID(), nowMs: now },
        env,
      ),
    ).toThrow(RebootstrapRequiredError);

    // Expired TTL
    expect(() =>
      verifySyncCursor(
        token,
        { kind: "pull", ownerUserId, deviceId, nowMs: now + 5001 },
        env,
      ),
    ).toThrow(RebootstrapRequiredError);

    // Secret rotation invalidates old cursors
    expect(() =>
      verifySyncCursor(
        token,
        { kind: "pull", ownerUserId, deviceId, nowMs: now },
        { SYNC_CURSOR_SECRET: "rotated-secret-value-0123456789" },
      ),
    ).toThrow(RebootstrapRequiredError);
  });

  it("fails closed with 503 ServiceUnavailableError when signing secret is missing", () => {
    expect(() => deriveSyncCursorKey({})).toThrow(ServiceUnavailableError);
  });
});
