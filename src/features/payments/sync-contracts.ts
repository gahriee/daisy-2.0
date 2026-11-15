import { z } from "zod";
import { canonicalizeSyncJson } from "@/features/tenants/sync-contracts";
import { RecordPaymentSyncPayloadSchema, type PaymentDto } from "./schemas";

export const PAYMENT_SYNC_PROTOCOL_VERSION = 1 as const;

export const PAYMENT_SYNC_OPERATION_TYPES = ["payment.record"] as const;

export type PaymentSyncOperationType =
  (typeof PAYMENT_SYNC_OPERATION_TYPES)[number];

const recordPayloadSchema = RecordPaymentSyncPayloadSchema;

export const PaymentSyncOperationSchema = z.discriminatedUnion("type", [
  z.object({
    protocolVersion: z.literal(PAYMENT_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("payment.record"),
    entityId: z.string().uuid(),
    baseVersion: z.literal(0),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: recordPayloadSchema,
  }),
]);

export type PaymentSyncOperation = z.infer<typeof PaymentSyncOperationSchema>;

export type PaymentSyncOutcomeStatus =
  "applied" | "duplicate" | "conflict" | "rejected" | "blocked";

export type PaymentSyncOutcomeDto = {
  opId: string;
  status: PaymentSyncOutcomeStatus;
  reason: string | null;
  resultingVersion: number | null;
  payment: PaymentDto | null;
};

export function computePaymentSyncFingerprint(
  op: PaymentSyncOperation,
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
