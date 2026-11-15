import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import { lockActiveDeviceForShare } from "@/server/auth/device";
import { getDatabase } from "@/server/db/client";
import type { DatabaseExecutor } from "@/server/db/owner-record";
import { allocateSyncSequence } from "@/server/sync/publish";
import { verifyUploadedMaintenanceAttachments } from "./attachments";
import type { MaintenanceRequestDto } from "./schemas";
import {
  addMaintenanceUpdateInTx,
  archiveMaintenanceRequestInTx,
  createMaintenanceRequestInTx,
  restoreMaintenanceRequestInTx,
} from "./service";
import {
  computeMaintenanceSyncFingerprint,
  MaintenanceSyncOperationSchema,
  type MaintenanceSyncOutcomeDto,
} from "./sync-contracts";

/**
 * Replays an offline-queued maintenance operation under active-device share
 * lock + Owner SyncHead lock. Verifies uploaded S3 attachment intents outside the
 * DB transaction and converts version/archived conflicts to `"conflict"` (`Needs
 * attention`).
 */
export async function applyMaintenanceSyncOperation(input: {
  ownerUserId: string;
  deviceToken: string;
  rawOperation: unknown;
}): Promise<MaintenanceSyncOutcomeDto> {
  const parsed = MaintenanceSyncOperationSchema.safeParse(input.rawOperation);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid maintenance sync operation.",
    );
  }
  const op = parsed.data;
  const canonical = computeMaintenanceSyncFingerprint(op);
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  const db = getDatabase();

  const intentIds =
    op.type === "maintenance.create" || op.type === "maintenance.update"
      ? op.payload.attachmentIntentIds
      : [];

  const existingOutcomePreview =
    intentIds.length > 0
      ? await db.syncOperationOutcome.findUnique({
          where: {
            ownerUserId_opId: {
              ownerUserId: input.ownerUserId,
              opId: op.opId,
            },
          },
          select: { opId: true },
        })
      : null;

  let existingAttachmentCount = 0;
  if (
    !existingOutcomePreview &&
    op.type === "maintenance.update" &&
    intentIds.length > 0
  ) {
    existingAttachmentCount = await db.maintenanceAttachment.count({
      where: {
        ownerUserId: input.ownerUserId,
        maintenanceRequestId: op.entityId,
      },
    });
  }

  const verifiedAttachments = existingOutcomePreview
    ? []
    : await verifyUploadedMaintenanceAttachments(
        input.ownerUserId,
        intentIds,
        existingAttachmentCount,
      );

  return db.$transaction(
    async (tx: DatabaseExecutor): Promise<MaintenanceSyncOutcomeDto> => {
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
          responsePayload: true,
        },
      });

      if (existingOutcome) {
        if (existingOutcome.fingerprint !== fingerprint) {
          throw new ConflictError(
            "Operation ID was reused with a different payload.",
          );
        }
        const savedPayload = existingOutcome.responsePayload as {
          request?: MaintenanceRequestDto;
        } | null;
        return {
          opId: op.opId,
          status: "duplicate",
          reason: existingOutcome.reason,
          resultingVersion: existingOutcome.resultingVersion,
          request: savedPayload?.request ?? null,
        };
      }

      if (op.dependsOn.length > 0) {
        const predecessors = await tx.syncOperationOutcome.findMany({
          where: {
            ownerUserId: input.ownerUserId,
            opId: { in: op.dependsOn },
          },
          select: { opId: true, status: true },
        });
        const byOpId = new Map(predecessors.map((row) => [row.opId, row]));
        for (const depOpId of op.dependsOn) {
          const pred = byOpId.get(depOpId);
          if (!pred) {
            throw new PreconditionError(
              "Dependent maintenance operation is waiting on an earlier queued change.",
            );
          }
          if (
            pred.status === "conflict" ||
            pred.status === "rejected" ||
            pred.status === "blocked"
          ) {
            const blocked: MaintenanceSyncOutcomeDto = {
              opId: op.opId,
              status: "blocked",
              reason: "Previous maintenance change requires attention first.",
              resultingVersion: null,
              request: null,
            };
            await tx.syncOperationOutcome.create({
              data: {
                ownerUserId: input.ownerUserId,
                opId: op.opId,
                deviceId: device.id,
                protocolVersion: op.protocolVersion,
                operationType: op.type,
                entityId: op.entityId,
                fingerprint,
                status: blocked.status,
                reason: blocked.reason,
                resultingVersion: null,
                responsePayload: Prisma.JsonNull,
              },
              select: { opId: true },
            });
            return blocked;
          }
        }
      }

      let outcome: MaintenanceSyncOutcomeDto;
      try {
        let request: MaintenanceRequestDto;
        const actor = {
          actorType: "sync_device" as const,
          actorId: device.id,
          operationId: op.opId,
        };

        if (op.type === "maintenance.create") {
          request = await createMaintenanceRequestInTx(
            tx,
            input.ownerUserId,
            { ...op.payload, id: op.entityId },
            { actor, verifiedAttachments },
          );
        } else if (op.type === "maintenance.update") {
          request = await addMaintenanceUpdateInTx(
            tx,
            input.ownerUserId,
            {
              requestId: op.entityId,
              expectedVersion: op.baseVersion,
              statusTo: op.payload.statusTo,
              note: op.payload.note,
              attachmentIntentIds: op.payload.attachmentIntentIds,
            },
            { actor, verifiedAttachments },
          );
        } else if (op.type === "maintenance.archive") {
          request = await archiveMaintenanceRequestInTx(
            tx,
            input.ownerUserId,
            { requestId: op.entityId, expectedVersion: op.baseVersion },
            actor,
          );
        } else {
          request = await restoreMaintenanceRequestInTx(
            tx,
            input.ownerUserId,
            { requestId: op.entityId, expectedVersion: op.baseVersion },
            actor,
          );
        }

        outcome = {
          opId: op.opId,
          status: "applied",
          reason: null,
          resultingVersion: request.version,
          request,
        };
      } catch (error) {
        if (error instanceof ConflictError) {
          outcome = {
            opId: op.opId,
            status: "conflict",
            reason: error.message,
            resultingVersion: null,
            request: null,
          };
        } else if (
          error instanceof ValidationError ||
          error instanceof PreconditionError ||
          error instanceof NotFoundError
        ) {
          outcome = {
            opId: op.opId,
            status: "rejected",
            reason: error.message,
            resultingVersion: null,
            request: null,
          };
        } else {
          throw error;
        }
      }

      await tx.syncOperationOutcome.create({
        data: {
          ownerUserId: input.ownerUserId,
          opId: op.opId,
          deviceId: device.id,
          protocolVersion: op.protocolVersion,
          operationType: op.type,
          entityId: op.entityId,
          fingerprint,
          status: outcome.status,
          reason: outcome.reason,
          resultingVersion: outcome.resultingVersion,
          responsePayload: outcome.request
            ? ({ request: outcome.request } as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
        select: { opId: true },
      });

      return outcome;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}
