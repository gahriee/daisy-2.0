import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type DatabaseExecutor = PrismaClient | Prisma.TransactionClient;

/**
 * Atomically ensures the single application Owner row exists inside a transaction or client.
 */
export async function ensureOwnerRecord(
  db: DatabaseExecutor,
  ownerUserId: string,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "Owner" ("id", "createdAt", "updatedAt")
    VALUES (${ownerUserId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING
  `;
}
