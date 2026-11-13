import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ForbiddenError, NotFoundError, RateLimitedError } from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import { consumeAuthLimit } from "@/server/security/auth-security";
import {
  ensureOwnerRecord,
  type DatabaseExecutor,
} from "@/server/db/owner-record";

export const DEVICE_COOKIE_NAME = "daisy_device";
const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type DeviceSummary = {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
};

export type RegisterDeviceResult = {
  deviceId: string;
  label: string;
  createdAt: string;
  reused: boolean;
  rawToken: string | undefined;
};

export function hashDeviceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function readDeviceTokenFromCookieHeader(
  cookieHeader: string | null,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== DEVICE_COOKIE_NAME) continue;
    const value = part.slice(idx + 1).trim();
    if (!value) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function buildDeviceCookieHeader(rawToken: string): string {
  const isHttps =
    process.env.APP_ORIGIN?.startsWith("https://") ||
    process.env.NODE_ENV === "production";
  const parts = [
    `${DEVICE_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${DEVICE_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Registers a device for the Owner (creating the Owner record + Device + SecurityEvent
 * atomically), or reuses an already-active device matching the supplied browser token.
 */
export async function registerOwnerDevice(input: {
  ownerUserId: string;
  label: string;
  existingToken?: string | undefined;
}): Promise<RegisterDeviceResult> {
  const db = getDatabase();

  if (input.existingToken) {
    const existingHash = hashDeviceToken(input.existingToken);
    const active = await db.device.findFirst({
      where: {
        ownerUserId: input.ownerUserId,
        tokenHash: existingHash,
        revokedAt: null,
      },
      select: { id: true, label: true, createdAt: true },
    });
    if (active) {
      await db.device.update({
        where: { id: active.id },
        data: { lastSeenAt: new Date() },
        select: { id: true },
      });
      return {
        deviceId: active.id,
        label: active.label,
        createdAt: active.createdAt.toISOString(),
        reused: true,
        rawToken: undefined,
      };
    }
  }

  const retry = await consumeAuthLimit(input.ownerUserId, "device-register");
  if (retry > 0) {
    throw new RateLimitedError(
      retry,
      "Too many device registrations. Try again shortly.",
    );
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashDeviceToken(rawToken);
  const operationId = randomUUID();

  const created = await db.$transaction(async (tx) => {
    await ensureOwnerRecord(tx, input.ownerUserId);
    const device = await tx.device.create({
      data: {
        ownerUserId: input.ownerUserId,
        label: input.label,
        tokenHash,
        lastSeenAt: new Date(),
      },
      select: { id: true, label: true, createdAt: true },
    });
    await tx.securityEvent.create({
      data: {
        ownerUserId: input.ownerUserId,
        operationId,
        action: "DEVICE_REGISTERED",
      },
      select: { id: true },
    });
    return device;
  });

  return {
    deviceId: created.id,
    label: created.label,
    createdAt: created.createdAt.toISOString(),
    reused: false,
    rawToken,
  };
}

export async function listOwnerDevices(
  ownerUserId: string,
  currentToken?: string | undefined,
): Promise<DeviceSummary[]> {
  const currentHash = currentToken ? hashDeviceToken(currentToken) : undefined;
  const rows = await getDatabase().device.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      label: true,
      tokenHash: true,
      createdAt: true,
      lastSeenAt: true,
      revokedAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    isCurrent: Boolean(
      currentHash && row.tokenHash === currentHash && row.revokedAt === null,
    ),
  }));
}

/**
 * Idempotently revokes a device owned by the authenticated Owner without ending
 * the Owner's sign-in session. Concurrent calls succeed safely.
 */
export async function revokeOwnerDevice(input: {
  ownerUserId: string;
  deviceId: string;
}): Promise<{ deviceId: string; revoked: true; alreadyRevoked: boolean }> {
  const db = getDatabase();
  const operationId = randomUUID();

  return db.$transaction(async (tx) => {
    const updated = await tx.device.updateMany({
      where: {
        id: input.deviceId,
        ownerUserId: input.ownerUserId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (updated.count > 0) {
      await tx.securityEvent.create({
        data: {
          ownerUserId: input.ownerUserId,
          operationId,
          action: "DEVICE_REVOKED",
        },
        select: { id: true },
      });
      return { deviceId: input.deviceId, revoked: true, alreadyRevoked: false };
    }

    const existing = await tx.device.findFirst({
      where: { id: input.deviceId, ownerUserId: input.ownerUserId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Device not found.");
    }
    return { deviceId: input.deviceId, revoked: true, alreadyRevoked: true };
  });
}

/**
 * Locks the active device row FOR SHARE inside a sync/upload transaction so
 * concurrent revocation waits for in-flight work and blocks later requests.
 */
export async function lockActiveDeviceForShare(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawToken: string | undefined,
): Promise<{ id: string; label: string }> {
  if (!rawToken) {
    throw new ForbiddenError("Register this device before syncing.");
  }
  const tokenHash = hashDeviceToken(rawToken);
  const rows = await tx.$queryRaw<
    Array<{ id: string; label: string; revokedAt: Date | null }>
  >`
    SELECT "id"::text AS "id", "label", "revokedAt"
    FROM "Device"
    WHERE "ownerUserId" = ${ownerUserId} AND "tokenHash" = ${tokenHash}
    FOR SHARE
  `;
  const device = rows[0];
  if (!device || device.revokedAt !== null) {
    throw new ForbiddenError("This device is unregistered or revoked.");
  }
  return { id: device.id, label: device.label };
}
