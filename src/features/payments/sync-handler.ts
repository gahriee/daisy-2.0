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
import { verifyProofIntentsOutsideTx } from "./proofs";
import { recordPaymentInTx } from "./service";
import type { PaymentDto } from "./schemas";
import {
  computePaymentSyncFingerprint,
  PaymentSyncOperationSchema,
  type PaymentSyncOutcomeDto,
} from "./sync-contracts";

/**
 * Processes an offline-queued `payment.record` operation under active-device row
 * share lock + Owner SyncHead lock with strict opId idempotency and external
 * proof verification completed BEFORE opening the transaction.
 */
export async function applyPaymentSyncOperation(input: {
  ownerUserId: string;
  deviceToken: string;
  rawOperation: unknown;
}): Promise<PaymentSyncOutcomeDto> {
  const parsed = PaymentSyncOperationSchema.safeParse(input.rawOperation);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid payment sync operation.",
    );
  }
  const op = parsed.data;
  const canonical = computePaymentSyncFingerprint(op);
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  const db = getDatabase();

  // Check if this opId already settled before hitting storage for already-failed/duplicate ops.
  const preExistingOutcome = await db.syncOperationOutcome.findUnique({
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

  if (preExistingOutcome) {
    // Still serialize device check + SyncHead in transaction cleanly below.
  }

  // Verify proof upload intents in S3 strictly OUTSIDE the transaction when needed.
  const verifiedProofs = preExistingOutcome
    ? new Map()
    : await verifyProofIntentsOutsideTx(
        input.ownerUserId,
        op.payload.proofIntentIds,
        { paymentId: op.entityId },
      );

  return db.$transaction(
    async (tx: DatabaseExecutor): Promise<PaymentSyncOutcomeDto> => {
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
        return {
          opId: op.opId,
          status: "duplicate",
          reason: existingOutcome.reason,
          resultingVersion: existingOutcome.resultingVersion,
          payment:
            (existingOutcome.responsePayload as PaymentDto | null) ?? null,
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
          const outcome: PaymentSyncOutcomeDto = {
            opId: op.opId,
            status: "blocked",
            reason: `Blocked by predecessor operation ${failedDep.opId} (${failedDep.status}).`,
            resultingVersion: null,
            payment: null,
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
      let paymentDto: PaymentDto | null = null;

      try {
        paymentDto = await recordPaymentInTx(
          tx,
          input.ownerUserId,
          {
            id: op.entityId,
            ...op.payload,
            paidAt: op.payload.paidAt ?? op.occurredAt,
          },
          verifiedProofs,
          {
            actorType: "sync_device",
            actorId: op.deviceId,
            operationId: op.opId,
          },
        );
        resultingVersion = paymentDto.version;
      } catch (error) {
        if (error instanceof ConflictError) {
          status = "conflict";
          reason = error.message;
        } else if (
          error instanceof ValidationError ||
          error instanceof PreconditionError ||
          error instanceof NotFoundError
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
          ...(paymentDto
            ? {
                responsePayload: paymentDto as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      return {
        opId: op.opId,
        status,
        reason,
        resultingVersion,
        payment: paymentDto,
      };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}
