import { z } from "zod";
import { canonicalizeSyncJson } from "@/features/tenants/sync-contracts";
import {
  CreateTransientGuestSyncPayloadSchema,
  CreateTransientReservationSyncPayloadSchema,
  transientGuestFieldsShape,
  type TransientGuestDto,
  type TransientReservationDto,
} from "./schemas";

export const TRANSIENT_SYNC_PROTOCOL_VERSION = 1 as const;

export const TRANSIENT_SYNC_OPERATION_TYPES = [
  "transient_guest.create",
  "transient_guest.update",
  "transient_guest.archive",
  "transient_guest.restore",
  "transient_reservation.create",
  "transient_reservation.checkin",
  "transient_reservation.checkout",
] as const;

export type TransientSyncOperationType =
  (typeof TRANSIENT_SYNC_OPERATION_TYPES)[number];

const emptyObjectPayloadSchema = z.object({}).default({});

const updateGuestPayloadSchema = z
  .object(transientGuestFieldsShape)
  .superRefine((value, ctx) => {
    if (!value.phone && !value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least a phone number or email address.",
        path: ["phone"],
      });
    }
  });

const checkoutReservationPayloadSchema = z.object({
  actualCheckOutDateManila: z.string().trim().optional(),
});

export const TransientSyncOperationSchema = z.discriminatedUnion("type", [
  z.object({
    protocolVersion: z.literal(TRANSIENT_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("transient_guest.create"),
    entityId: z.string().uuid(),
    baseVersion: z.literal(0),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: CreateTransientGuestSyncPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(TRANSIENT_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("transient_guest.update"),
    entityId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: updateGuestPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(TRANSIENT_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("transient_guest.archive"),
    entityId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: emptyObjectPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(TRANSIENT_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("transient_guest.restore"),
    entityId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: emptyObjectPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(TRANSIENT_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("transient_reservation.create"),
    entityId: z.string().uuid(),
    baseVersion: z.literal(0),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: CreateTransientReservationSyncPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(TRANSIENT_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("transient_reservation.checkin"),
    entityId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: emptyObjectPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(TRANSIENT_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("transient_reservation.checkout"),
    entityId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: checkoutReservationPayloadSchema,
  }),
]);

export type TransientSyncOperation = z.infer<
  typeof TransientSyncOperationSchema
>;

export type TransientSyncOutcomeStatus =
  "applied" | "duplicate" | "conflict" | "rejected" | "blocked";

export type TransientSyncOutcomeDto = {
  opId: string;
  status: TransientSyncOutcomeStatus;
  reason: string | null;
  resultingVersion: number | null;
  guest: TransientGuestDto | null;
  reservation: TransientReservationDto | null;
};

export function computeTransientSyncFingerprint(
  op: TransientSyncOperation,
): string {
  return canonicalizeSyncJson({
    protocolVersion: op.protocolVersion,
    type: op.type,
    entityId: op.entityId,
    baseVersion: op.baseVersion,
    dependsOn: op.dependsOn,
    payload: op.payload,
  });
}
