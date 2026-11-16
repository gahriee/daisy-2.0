import { z } from "zod";
import {
  MAINTENANCE_SYNC_OPERATION_TYPES,
  type MaintenanceSyncOperationType,
} from "@/features/maintenance/sync-contracts";
import {
  PAYMENT_SYNC_OPERATION_TYPES,
  type PaymentSyncOperationType,
} from "@/features/payments/sync-contracts";
import {
  TENANT_SYNC_OPERATION_TYPES,
  type TenantSyncOperationType,
} from "@/features/tenants/sync-contracts";
import {
  TRANSIENT_SYNC_OPERATION_TYPES,
  type TransientSyncOperationType,
} from "@/features/transients/sync-contracts";

export const SYNC_PROTOCOL_VERSION = 1 as const;
export const SYNC_PUSH_MAX_OPS = 50;
export const SYNC_PUSH_MAX_BYTES = 1_048_576; // 1 MB
export const SYNC_PAGE_MAX_RECORDS = 100;

export const ALL_SYNC_OPERATION_TYPES = [
  ...TENANT_SYNC_OPERATION_TYPES,
  ...TRANSIENT_SYNC_OPERATION_TYPES,
  ...PAYMENT_SYNC_OPERATION_TYPES,
  ...MAINTENANCE_SYNC_OPERATION_TYPES,
] as const;

export type AnySyncOperationType =
  | TenantSyncOperationType
  | TransientSyncOperationType
  | PaymentSyncOperationType
  | MaintenanceSyncOperationType;

export const SyncBaseEnvelopeSchema = z.object({
  protocolVersion: z.number().int(),
  opId: z.string().uuid(),
  deviceId: z.string().uuid(),
  localSequence: z.number().int().min(1),
  type: z.string().min(1),
  entityId: z.string().uuid(),
  baseVersion: z.number().int().min(0),
  dependsOn: z.array(z.string().uuid()).optional().default([]),
  payload: z.unknown(),
  occurredAt: z.string(),
});

export const SyncPushRequestSchema = z.object({
  operations: z
    .array(z.unknown())
    .min(1, "Include at least one operation in the sync push batch.")
    .max(
      SYNC_PUSH_MAX_OPS,
      `A single sync push batch cannot exceed ${SYNC_PUSH_MAX_OPS} operations.`,
    ),
});

export const SyncBootstrapRequestSchema = z
  .object({
    cursor: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(SYNC_PAGE_MAX_RECORDS).optional(),
  })
  .default({});

export const SyncPullQuerySchema = z.object({
  cursor: z
    .string({ error: "Provide an active sync cursor." })
    .trim()
    .min(1, "Provide an active sync cursor."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SYNC_PAGE_MAX_RECORDS)
    .optional()
    .default(SYNC_PAGE_MAX_RECORDS),
});

export type SyncChangeOperation = "upsert" | "tombstone";

export type SyncChangeRecordDto = {
  sequence: string;
  entityType: string;
  entityId: string;
  version: number;
  operation: SyncChangeOperation;
  payload: unknown;
  occurredAt: string;
};

export type SyncBootstrapPageDto = {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  watermark: string;
  records: SyncChangeRecordDto[];
  hasMore: boolean;
  cursor: string | null;
  syncCursor: string | null;
};

export type SyncPullPageDto = {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  headSequence: string;
  changes: SyncChangeRecordDto[];
  hasMore: boolean;
  nextCursor: string;
};

export type SyncOutcomeStatus =
  "applied" | "duplicate" | "conflict" | "rejected" | "blocked" | "retry";

export type SyncPushOperationOutcomeDto = {
  opId: string;
  status: SyncOutcomeStatus;
  reason: string | null;
  resultingVersion: number | null;
  retryable: boolean;
  entity?: unknown;
};

export type SyncPushResponseDto = {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  outcomes: SyncPushOperationOutcomeDto[];
};
