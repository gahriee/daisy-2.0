import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  AllocationConflictError,
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import { lockActiveDeviceForShare } from "@/server/auth/device";
import { getDatabase } from "@/server/db/client";
import type { DatabaseExecutor } from "@/server/db/owner-record";
import { allocateSyncSequence } from "@/server/sync/publish";
import type { TransientGuestDto, TransientReservationDto } from "./schemas";
import {
  archiveTransientGuestInTx,
  checkInTransientReservationInTx,
  checkOutTransientReservationInTx,
  createTransientGuestInTx,
  createTransientReservationInTx,
  restoreTransientGuestInTx,
  updateTransientGuestInTx,
} from "./service";
import {
  computeTransientSyncFingerprint,
  TransientSyncOperationSchema,
  type TransientSyncOutcomeDto,
} from "./sync-contracts";

/**
 * Replays an offline-queued transient guest or tentative reservation operation
 * under active-device share lock + Owner SyncHead lock. Overlapping rooms/beds
 * or stale baseVersion fail honestly as `"conflict"` so the Owner sees "Needs
 * attention" and resolves manually.
 */
export async function applyTransientSyncOperation(input: {
  ownerUserId: string;
  deviceToken: string;
  rawOperation: unknown;
}): Promise<TransientSyncOutcomeDto> {
  const parsed = TransientSyncOperationSchema.safeParse(input.rawOperation);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid transient sync operation.",
    );
  }
  const op = parsed.data;
  const canonical = computeTransientSyncFingerprint(op);
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  const db = getDatabase();

  return db.$transaction(
    async (tx: DatabaseExecutor): Promise<TransientSyncOutcomeDto> => {
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
          guest?: TransientGuestDto | null;
          reservation?: TransientReservationDto | null;
        } | null;
        return {
          opId: op.opId,
          status: "duplicate",
          reason: existingOutcome.reason,
          resultingVersion: existingOutcome.resultingVersion,
          guest: savedPayload?.guest ?? null,
          reservation: savedPayload?.reservation ?? null,
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
          const outcome: TransientSyncOutcomeDto = {
            opId: op.opId,
            status: "blocked",
            reason: `Blocked by predecessor operation ${failedDep.opId} (${failedDep.status}).`,
            resultingVersion: null,
            guest: null,
            reservation: null,
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
      let guestDto: TransientGuestDto | null = null;
      let reservationDto: TransientReservationDto | null = null;

      const actor = {
        actorType: "sync_device" as const,
        actorId: op.deviceId,
        operationId: op.opId,
      };

      try {
        switch (op.type) {
          case "transient_guest.create": {
            guestDto = await createTransientGuestInTx(
              tx,
              input.ownerUserId,
              { id: op.entityId, ...op.payload },
              actor,
            );
            resultingVersion = guestDto.version;
            break;
          }
          case "transient_guest.update": {
            guestDto = await updateTransientGuestInTx(
              tx,
              input.ownerUserId,
              {
                guestId: op.entityId,
                expectedVersion: op.baseVersion,
                ...op.payload,
              },
              actor,
            );
            resultingVersion = guestDto.version;
            break;
          }
          case "transient_guest.archive": {
            guestDto = await archiveTransientGuestInTx(
              tx,
              input.ownerUserId,
              { guestId: op.entityId, expectedVersion: op.baseVersion },
              actor,
            );
            resultingVersion = guestDto.version;
            break;
          }
          case "transient_guest.restore": {
            guestDto = await restoreTransientGuestInTx(
              tx,
              input.ownerUserId,
              { guestId: op.entityId, expectedVersion: op.baseVersion },
              actor,
            );
            resultingVersion = guestDto.version;
            break;
          }
          case "transient_reservation.create": {
            reservationDto = await createTransientReservationInTx(
              tx,
              input.ownerUserId,
              {
                id: op.entityId,
                ...op.payload,
              },
              actor,
            );
            resultingVersion = reservationDto.version;
            break;
          }
          case "transient_reservation.checkin": {
            reservationDto = await checkInTransientReservationInTx(
              tx,
              input.ownerUserId,
              { reservationId: op.entityId, expectedVersion: op.baseVersion },
              actor,
            );
            resultingVersion = reservationDto.version;
            break;
          }
          case "transient_reservation.checkout": {
            reservationDto = await checkOutTransientReservationInTx(
              tx,
              input.ownerUserId,
              {
                reservationId: op.entityId,
                expectedVersion: op.baseVersion,
                ...(op.payload.actualCheckOutDateManila
                  ? {
                      actualCheckOutDateManila:
                        op.payload.actualCheckOutDateManila,
                    }
                  : {}),
              },
              actor,
            );
            resultingVersion = reservationDto.version;
            break;
          }
        }
      } catch (error) {
        if (
          error instanceof ConflictError ||
          error instanceof AllocationConflictError
        ) {
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

      const responsePayload =
        guestDto || reservationDto
          ? { guest: guestDto, reservation: reservationDto }
          : undefined;

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
          ...(responsePayload
            ? {
                responsePayload:
                  responsePayload as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      return {
        opId: op.opId,
        status,
        reason,
        resultingVersion,
        guest: guestDto,
        reservation: reservationDto,
      };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}
