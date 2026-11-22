import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import { deletePrivateObject } from "@/server/storage/client";
import { writeAuditEntry } from "@/server/sync/publish";

const MAX_INTENTS_PER_TABLE = 100;
const RATE_LIMIT_GRACE_MS = 60 * 60 * 1000; // 1 hour

export const MaintenanceCleanupBodySchema = z.object({
  graceHours: z.coerce.number().int().min(1).max(720).default(24),
  dryRun: z.boolean().default(false),
});

export type MaintenanceCleanupSummary = {
  dryRun: boolean;
  graceHours: number;
  intentCutoffIso: string;
  claimedIntents: {
    roomPhotos: number;
    tenantContracts: number;
    paymentProofs: number;
    maintenanceAttachments: number;
    total: number;
  };
  deletedRateLimits: number;
  storageObjectsDeleted: number;
  storageDeleteErrors: number;
};

/**
 * Safely cancels expired, unattached `PENDING_UPLOAD` storage intents beyond
 * `graceHours` (protecting all active/attached intents per Rules 4.4 & 9.7),
 * prunes expired `SecurityRateLimit` rows, deletes orphaned S3 objects outside
 * the database transaction, and preserves all ChangeFeed/SyncOperationOutcome history.
 */
export async function runMaintenanceCleanupJob(
  ownerUserId: string,
  rawOptions: unknown = {},
  nowUtc: Date = new Date(),
): Promise<MaintenanceCleanupSummary> {
  const parsed = MaintenanceCleanupBodySchema.safeParse(rawOptions ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid cleanup job parameters.",
    );
  }

  const { graceHours, dryRun } = parsed.data;
  const intentCutoffUtc = new Date(
    nowUtc.getTime() - graceHours * 60 * 60 * 1000,
  );
  const rateCutoffUtc = new Date(nowUtc.getTime() - RATE_LIMIT_GRACE_MS);
  const db = getDatabase();

  const claimed = await db.$transaction(
    async (tx) => {
      const [roomIntents, contractIntents, proofIntents, maintIntents] =
        await Promise.all([
          tx.roomPhotoIntent.findMany({
            where: {
              ownerUserId,
              status: "PENDING_UPLOAD",
              expiresAt: { lt: intentCutoffUtc },
              photo: { is: null },
            },
            orderBy: { expiresAt: "asc" },
            take: MAX_INTENTS_PER_TABLE,
            select: { id: true, objectKey: true },
          }),
          tx.tenantContractIntent.findMany({
            where: {
              ownerUserId,
              status: "PENDING_UPLOAD",
              expiresAt: { lt: intentCutoffUtc },
              page: { is: null },
            },
            orderBy: { expiresAt: "asc" },
            take: MAX_INTENTS_PER_TABLE,
            select: { id: true, objectKey: true },
          }),
          tx.paymentProofIntent.findMany({
            where: {
              ownerUserId,
              status: "PENDING_UPLOAD",
              expiresAt: { lt: intentCutoffUtc },
              proof: { is: null },
            },
            orderBy: { expiresAt: "asc" },
            take: MAX_INTENTS_PER_TABLE,
            select: { id: true, objectKey: true },
          }),
          tx.maintenanceAttachmentIntent.findMany({
            where: {
              ownerUserId,
              status: "PENDING_UPLOAD",
              expiresAt: { lt: intentCutoffUtc },
              attachment: { is: null },
            },
            orderBy: { expiresAt: "asc" },
            take: MAX_INTENTS_PER_TABLE,
            select: { id: true, objectKey: true },
          }),
        ]);

      let roomPhotos = roomIntents.length;
      let tenantContracts = contractIntents.length;
      let paymentProofs = proofIntents.length;
      let maintenanceAttachments = maintIntents.length;
      let deletedRateLimits = 0;

      if (!dryRun) {
        const [roomUpd, contractUpd, proofUpd, maintUpd, rateDel] =
          await Promise.all([
            roomIntents.length > 0
              ? tx.roomPhotoIntent.updateMany({
                  where: {
                    ownerUserId,
                    id: { in: roomIntents.map((r) => r.id) },
                    status: "PENDING_UPLOAD",
                  },
                  data: { status: "CANCELLED" },
                })
              : Promise.resolve({ count: 0 }),
            contractIntents.length > 0
              ? tx.tenantContractIntent.updateMany({
                  where: {
                    ownerUserId,
                    id: { in: contractIntents.map((r) => r.id) },
                    status: "PENDING_UPLOAD",
                  },
                  data: { status: "CANCELLED" },
                })
              : Promise.resolve({ count: 0 }),
            proofIntents.length > 0
              ? tx.paymentProofIntent.updateMany({
                  where: {
                    ownerUserId,
                    id: { in: proofIntents.map((r) => r.id) },
                    status: "PENDING_UPLOAD",
                  },
                  data: { status: "CANCELLED" },
                })
              : Promise.resolve({ count: 0 }),
            maintIntents.length > 0
              ? tx.maintenanceAttachmentIntent.updateMany({
                  where: {
                    ownerUserId,
                    id: { in: maintIntents.map((r) => r.id) },
                    status: "PENDING_UPLOAD",
                  },
                  data: { status: "CANCELLED" },
                })
              : Promise.resolve({ count: 0 }),
            tx.securityRateLimit.deleteMany({
              where: { resetsAt: { lt: rateCutoffUtc } },
            }),
          ]);

        roomPhotos = roomUpd.count;
        tenantContracts = contractUpd.count;
        paymentProofs = proofUpd.count;
        maintenanceAttachments = maintUpd.count;
        deletedRateLimits = rateDel.count;

        const totalClaimed =
          roomPhotos + tenantContracts + paymentProofs + maintenanceAttachments;

        if (totalClaimed > 0 || deletedRateLimits > 0) {
          await writeAuditEntry(tx, {
            ownerUserId,
            area: "maintenance",
            action: "maintenance.cleanup_completed",
            actorType: "scheduled_job",
            actorId: "cron:maintenance-cleanup",
            entityType: "maintenance_cleanup",
            entityId: "scheduled",
            metadata: {
              graceHours,
              roomPhotos,
              tenantContracts,
              paymentProofs,
              maintenanceAttachments,
              deletedRateLimits,
            },
          });
        }
      } else {
        deletedRateLimits = await tx.securityRateLimit.count({
          where: { resetsAt: { lt: rateCutoffUtc } },
        });
      }

      return {
        roomPhotos,
        tenantContracts,
        paymentProofs,
        maintenanceAttachments,
        deletedRateLimits,
        objectKeys: [
          ...roomIntents.map((r) => r.objectKey),
          ...contractIntents.map((r) => r.objectKey),
          ...proofIntents.map((r) => r.objectKey),
          ...maintIntents.map((r) => r.objectKey),
        ],
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5000,
      timeout: 15000,
    },
  );

  let storageObjectsDeleted = 0;
  let storageDeleteErrors = 0;

  if (!dryRun && claimed.objectKeys.length > 0) {
    for (const objectKey of claimed.objectKeys) {
      try {
        const deleted = await deletePrivateObject(objectKey);
        if (deleted) {
          storageObjectsDeleted += 1;
        }
      } catch {
        storageDeleteErrors += 1;
      }
    }
  }

  return {
    dryRun,
    graceHours,
    intentCutoffIso: intentCutoffUtc.toISOString(),
    claimedIntents: {
      roomPhotos: claimed.roomPhotos,
      tenantContracts: claimed.tenantContracts,
      paymentProofs: claimed.paymentProofs,
      maintenanceAttachments: claimed.maintenanceAttachments,
      total:
        claimed.roomPhotos +
        claimed.tenantContracts +
        claimed.paymentProofs +
        claimed.maintenanceAttachments,
    },
    deletedRateLimits: claimed.deletedRateLimits,
    storageObjectsDeleted,
    storageDeleteErrors,
  };
}
