import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  RebootstrapRequiredError,
  ServiceUnavailableError,
} from "@/lib/errors";

export const SYNC_PULL_CURSOR_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SYNC_BOOTSTRAP_CURSOR_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CURSOR_KEY_PURPOSE = "daisy:sync-cursor:v1";

const PullCursorPayloadSchema = z.object({
  v: z.literal(1),
  kind: z.literal("pull"),
  ownerUserId: z.string().min(1),
  deviceId: z.string().uuid(),
  seq: z.string().regex(/^\d+$/),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

const BootstrapCursorPayloadSchema = z.object({
  v: z.literal(1),
  kind: z.literal("bootstrap"),
  ownerUserId: z.string().min(1),
  deviceId: z.string().uuid(),
  watermark: z.string().regex(/^\d+$/),
  afterEntityType: z.string().min(1),
  afterEntityId: z.string().uuid(),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export const SignedSyncCursorPayloadSchema = z.discriminatedUnion("kind", [
  PullCursorPayloadSchema,
  BootstrapCursorPayloadSchema,
]);

export type PullCursorPayload = z.infer<typeof PullCursorPayloadSchema>;
export type BootstrapCursorPayload = z.infer<
  typeof BootstrapCursorPayloadSchema
>;
export type SignedSyncCursorPayload = z.infer<
  typeof SignedSyncCursorPayloadSchema
>;

/**
 * Derives the HMAC key strictly for sync cursors from `SYNC_CURSOR_SECRET`
 * (or fallback to `NEON_AUTH_COOKIE_SECRET` in local environments) via a fixed
 * purpose context so key rotation immediately invalidates prior cursors.
 */
export function deriveSyncCursorKey(
  environment: Record<string, string | undefined> = process.env,
): Buffer {
  const rawSecret =
    environment.SYNC_CURSOR_SECRET?.trim() ||
    environment.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!rawSecret) {
    throw new ServiceUnavailableError(
      "Sync cursor signing secret is not configured.",
    );
  }
  return createHmac("sha256", CURSOR_KEY_PURPOSE).update(rawSecret).digest();
}

function encodeSegment(raw: string | Buffer): string {
  return Buffer.from(raw).toString("base64url");
}

function signPayloadSegment(encodedPayload: string, key: Buffer): string {
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

/**
 * Signs a pull or bootstrap sync cursor bound to `(ownerUserId, deviceId)`.
 */
export function signSyncCursor(
  payload: SignedSyncCursorPayload,
  environment: Record<string, string | undefined> = process.env,
): string {
  const key = deriveSyncCursorKey(environment);
  const encodedPayload = encodeSegment(JSON.stringify(payload));
  const sig = signPayloadSegment(encodedPayload, key);
  return `${encodedPayload}.${sig}`;
}

/**
 * Verifies cursor integrity, Owner & Device binding, expected kind, and TTL.
 * Rejects tampered, expired, foreign, or secret-rotated tokens with HTTP 410
 * (`RebootstrapRequiredError`).
 */
export function verifySyncCursor<TKind extends "pull" | "bootstrap">(
  token: string,
  expected: {
    kind: TKind;
    ownerUserId: string;
    deviceId: string;
    nowMs?: number;
  },
  environment: Record<string, string | undefined> = process.env,
): TKind extends "pull" ? PullCursorPayload : BootstrapCursorPayload {
  const key = deriveSyncCursorKey(environment);
  const parts = token.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new RebootstrapRequiredError();
  }

  const [encodedPayload, providedSig] = parts;
  const expectedSig = signPayloadSegment(encodedPayload, key);
  const providedBuf = Buffer.from(providedSig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new RebootstrapRequiredError();
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    throw new RebootstrapRequiredError();
  }

  const parsed = SignedSyncCursorPayloadSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new RebootstrapRequiredError();
  }

  const data = parsed.data;
  const nowMs = expected.nowMs ?? Date.now();
  if (
    data.kind !== expected.kind ||
    data.ownerUserId !== expected.ownerUserId ||
    data.deviceId !== expected.deviceId ||
    nowMs > data.expiresAt
  ) {
    throw new RebootstrapRequiredError();
  }

  return data as TKind extends "pull"
    ? PullCursorPayload
    : BootstrapCursorPayload;
}
