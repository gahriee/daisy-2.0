import "server-only";
import { randomUUID } from "node:crypto";
import type { SecurityAction } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";

export type AuthRateLimitWorkload = "login" | "login-probe" | "device-register";

const LIMIT_CONFIG: Record<
  AuthRateLimitWorkload,
  { maximum: number; seconds: number }
> = {
  "login-probe": { maximum: 60, seconds: 60 },
  login: { maximum: 10, seconds: 900 },
  "device-register": { maximum: 15, seconds: 900 },
};

/**
 * Consumes one unit of a database-backed auth rate limit using database time.
 * Returns 0 when permitted, or positive Retry-After seconds when throttled.
 */
export async function consumeAuthLimit(
  ownerId: string,
  workload: AuthRateLimitWorkload,
): Promise<number> {
  const db = getDatabase();
  const prefix = `auth:${ownerId}:`;
  const key = `${prefix}${workload}`;
  const { maximum, seconds } = LIMIT_CONFIG[workload];

  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "SecurityRateLimit"
      WHERE starts_with("key", ${prefix}) AND "resetsAt" <= CURRENT_TIMESTAMP
    `;
    return tx.$queryRaw<Array<{ count: number; retry: number }>>`
      INSERT INTO "SecurityRateLimit" ("key", "count", "resetsAt")
      VALUES (${key}, 1, CURRENT_TIMESTAMP + (${seconds} * interval '1 second'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "SecurityRateLimit"."count" + 1
        END,
        "resetsAt" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${seconds} * interval '1 second')
          ELSE "SecurityRateLimit"."resetsAt"
        END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetsAt" - CURRENT_TIMESTAMP))))::int AS retry
    `;
  });

  const row = rows[0];
  if (!row) throw new Error("Rate limit unavailable");
  return row.count > maximum ? row.retry : 0;
}

/**
 * Records an identifier-only authentication or device security event.
 */
export async function recordAuthSecurityEvent(
  ownerUserId: string,
  action: SecurityAction,
  operationId: string = randomUUID(),
): Promise<void> {
  await getDatabase().securityEvent.create({
    data: { ownerUserId, operationId, action },
    select: { id: true },
  });
}

/**
 * Best-effort wrapper for post-proxy login/logout security audit so upstream
 * cookie handling never drops an already-completed sign-in/out response.
 */
export async function safeRecordAuthSecurityEvent(
  ownerUserId: string,
  action: SecurityAction,
  operationId: string = randomUUID(),
): Promise<void> {
  try {
    await recordAuthSecurityEvent(ownerUserId, action, operationId);
  } catch {
    // Deliberately non-fatal after upstream provider response; never log credentials.
  }
}
