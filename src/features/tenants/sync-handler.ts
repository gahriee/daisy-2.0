import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  ConflictError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import { lockActiveDeviceForShare } from "@/server/auth/device";
import { getDatabase } from "@/server/db/client";
import type { DatabaseExecutor } from "@/server/db/owner-record";
import { allocateSyncSequence } from "@/server/sync/publish";
import {
  archiveTenantInTx,
  createTenantInTx,
  restoreTenantInTx,
  updateTenantInTx,
} from "./service";
import {
  canonicalizeSyncJson,
  TenantSyncOperationSchema,
  type TenantSyncOperation,
  type TenantSyncOutcomeDto,
} from "./sync-contracts";

function computeOperationFingerprint(op: TenantSyncOperation): string {
  const canonical = canonicalizeSyncJson({
    protocolVersion: op.protocolVersion,
    type: op.type,
    entityId: op.entityId,
    baseVersion: op.baseVersion,
    dependsOn: op.dependsOn,
    payload: op.payload,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Executes a syncable Tenant operation (create, update, archive tombstone, restore)
 * inside one transaction under device row-share lock + SyncHead lock with strict
 * opId idempotency and version conflict tracking.
 */
export async function applyTenantSyncOperation(input: {
  ownerUserId: string;
  deviceToken: string;
  rawOperation: unknown;
  asOfUtc?: Date;
}): Promise<TenantSyncOutcomeDto> {
  const parsed = TenantSyncOperationSchema.safeParse(input.rawOperation);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid tenant sync operation.",
    );
  }
  const op = parsed.data;
  const fingerprint = computeOperationFingerprint(op);
  const db = getDatabase();

  return db.$transaction(
    async (tx: DatabaseExecutor): Promise<TenantSyncOutcomeDto> => {
      const device = await lockActiveDeviceForShare(
        tx,
        input.ownerUserId,
        input.deviceToken,
      );
      if (device.id !== op.deviceId) {
        throw new PreconditionError(
          "Operation device ID does not match the active device credential.",
        );
      }

      // Lock Owner's SyncHead before checking idempotency outcomes or writing changes.
      await allocateSyncSequence(tx, input.ownerUserId);

      const existingOutcome = await tx.syncOperationOutcome.findUnique({
        where: {
          ownerUserId_opId: {
            ownerUserId: input.ownerUserId,
            opId: op.opId,
          },
        },
        select: {
          fingerprint: true,
          status: true,
          reason: true,
          resultingVersion: true,
        },
      });

      if (existingOutcome) {
        if (existingOutcome.fingerprint !== fingerprint) {
          throw new ConflictError(
            "Operation ID was reused with a different payload.",
          );
        }
        return {
          opId: op.opId,
          status: "duplicate",
          reason: existingOutcome.reason,
          resultingVersion: existingOutcome.resultingVersion,
        };
      }

      if (op.dependsOn.length > 0) {
        const depOutcomes = await tx.syncOperationOutcome.findMany({
          where: {
            ownerUserId: input.ownerUserId,
            opId: { in: op.dependsOn },
          },
          select: { opId: true, status: true },
        });
        const failedDep = depOutcomes.find((d) => d.status !== "applied");
        if (failedDep) {
          const outcome: TenantSyncOutcomeDto = {
            opId: op.opId,
            status: "blocked",
            reason: `Blocked by predecessor operation ${failedDep.opId} (${failedDep.status}).`,
            resultingVersion: null,
          };
          await tx.syncOperationOutcome.create({
            data: {
              ownerUserId: input.ownerUserId,
              opId: op.opId,
              deviceId: op.deviceId,
              protocolVersion: op.protocolVersion,
              operationType: op.type,
              entityId: op.entityId,
              fingerprint,
              status: "blocked",
              reason: outcome.reason,
              resultingVersion: null,
            },
          });
          return outcome;
        }
        if (depOutcomes.length < op.dependsOn.length) {
          throw new PreconditionError(
            "Dependent predecessor operation has not arrived yet.",
          );
        }
      }

      let status: "applied" | "conflict" | "rejected" = "applied";
      let reason: string | null = null;
      let resultingVersion: number | null = null;
      let responsePayload: Prisma.InputJsonValue | undefined;

      try {
        const ctx = {
          actorType: "sync_device" as const,
          actorId: op.deviceId,
          operationId: op.opId,
          ...(input.asOfUtc ? { asOfUtc: input.asOfUtc } : {}),
        };

        if (op.type === "tenant.create") {
          const dto = await createTenantInTx(
            tx,
            input.ownerUserId,
            { id: op.entityId, ...op.payload },
            ctx,
          );
          resultingVersion = dto.version;
          responsePayload = dto;
        } else if (op.type === "tenant.update") {
          const dto = await updateTenantInTx(
            tx,
            input.ownerUserId,
            {
              tenantId: op.entityId,
              expectedVersion: op.baseVersion,
              ...op.payload,
            },
            ctx,
          );
          resultingVersion = dto.version;
          responsePayload = dto;
        } else if (op.type === "tenant.archive") {
          const dto = await archiveTenantInTx(
            tx,
            input.ownerUserId,
            { tenantId: op.entityId, expectedVersion: op.baseVersion },
            ctx,
          );
          resultingVersion = dto.version;
          responsePayload = dto;
        } else {
          const dto = await restoreTenantInTx(
            tx,
            input.ownerUserId,
            { tenantId: op.entityId, expectedVersion: op.baseVersion },
            ctx,
          );
          resultingVersion = dto.version;
          responsePayload = dto;
        }
      } catch (error) {
        if (error instanceof ConflictError) {
          status = "conflict";
          reason = error.message;
        } else if (
          error instanceof ValidationError ||
          error instanceof PreconditionError
        ) {
          status = "rejected";
          reason = error.message;
        } else {
          throw error;
        }
      }

      await tx.syncOperationOutcome.create({
        data: {
          ownerUserId: input.ownerUserId,
          opId: op.opId,
          deviceId: op.deviceId,
          protocolVersion: op.protocolVersion,
          operationType: op.type,
          entityId: op.entityId,
          fingerprint,
          status,
          reason,
          resultingVersion,
          ...(responsePayload !== undefined ? { responsePayload } : {}),
        },
      });

      return {
        opId: op.opId,
        status,
        reason,
        resultingVersion,
      };
    },
  );
}
