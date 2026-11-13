import "server-only";
import { getDatabase } from "@/server/db/client";
import type { SecurityAction } from "@/generated/prisma/client";

export async function consumeRecoveryLimit(
  ownerId: string,
  workload: "send" | "reset" | "probe",
  identity = "shared",
): Promise<number> {
  const db = getDatabase();
  const prefix = `recovery:${ownerId}:`;
  const key = `${prefix}${workload}:${identity}`;
  const maximum = workload === "probe" ? 60 : workload === "send" ? 3 : 10;
  const seconds = workload === "probe" ? 60 : 900;
  const rows = await db.$transaction(async (tx) => {
    // Expired counters are not history; bounded cleanup prevents address-hash growth.
    await tx.$executeRaw`DELETE FROM "SecurityRateLimit" WHERE starts_with("key", ${prefix}) AND "resetsAt" <= CURRENT_TIMESTAMP`;
    return tx.$queryRaw<Array<{ count: number; retry: number }>>`
    INSERT INTO "SecurityRateLimit" ("key", "count", "resetsAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP + (${seconds} * interval '1 second'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP THEN 1 ELSE "SecurityRateLimit"."count" + 1 END,
      "resetsAt" = CASE WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + (${seconds} * interval '1 second') ELSE "SecurityRateLimit"."resetsAt" END
    RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetsAt" - CURRENT_TIMESTAMP))))::int AS retry
  `;
  });
  const row = rows[0];
  if (!row) throw new Error("Rate limit unavailable");
  return row.count > maximum ? row.retry : 0;
}

export async function matchesOwnerEmail(
  ownerId: string,
  email: string,
): Promise<boolean> {
  // Read-only provider lookup. No provider schema changes or account writes.
  const rows = await getDatabase().$queryRaw<Array<{ matches: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM neon_auth."user" WHERE id::text = ${ownerId} AND lower(email) = ${email}) AS matches
  `;
  return rows[0]?.matches === true;
}

export async function recordRecoveryEvent(
  ownerUserId: string,
  operationId: string,
  action: SecurityAction,
) {
  return getDatabase().securityEvent.create({
    data: { ownerUserId, operationId, action },
    select: { id: true, ownerUserId: true, action: true },
  });
}
