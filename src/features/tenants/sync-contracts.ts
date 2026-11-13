import { z } from "zod";
import { CreateTenantSchema, UpdateTenantSchema } from "./schemas";

export const TENANT_SYNC_PROTOCOL_VERSION = 1 as const;

export const TENANT_SYNC_OPERATION_TYPES = [
  "tenant.create",
  "tenant.update",
  "tenant.archive",
  "tenant.restore",
] as const;

export type TenantSyncOperationType =
  (typeof TENANT_SYNC_OPERATION_TYPES)[number];

const baseEnvelopeSchema = z.object({
  protocolVersion: z.literal(TENANT_SYNC_PROTOCOL_VERSION),
  opId: z.string().uuid(),
  deviceId: z.string().uuid(),
  localSequence: z.number().int().min(1),
  entityId: z.string().uuid(),
  dependsOn: z.array(z.string().uuid()).default([]),
  occurredAt: z.string().datetime(),
});

const createPayloadSchema = CreateTenantSchema.omit({ id: true });
const updatePayloadSchema = UpdateTenantSchema.omit({
  tenantId: true,
  expectedVersion: true,
});

export const TenantSyncOperationSchema = z.discriminatedUnion("type", [
  baseEnvelopeSchema.extend({
    type: z.literal("tenant.create"),
    baseVersion: z.literal(0),
    payload: createPayloadSchema,
  }),
  baseEnvelopeSchema.extend({
    type: z.literal("tenant.update"),
    baseVersion: z.number().int().min(1),
    payload: updatePayloadSchema,
  }),
  baseEnvelopeSchema.extend({
    type: z.literal("tenant.archive"),
    baseVersion: z.number().int().min(1),
    payload: z.object({}).strict(),
  }),
  baseEnvelopeSchema.extend({
    type: z.literal("tenant.restore"),
    baseVersion: z.number().int().min(1),
    payload: z.object({}).strict(),
  }),
]);

export type TenantSyncOperation = z.infer<typeof TenantSyncOperationSchema>;

export type TenantSyncOutcomeStatus =
  "applied" | "duplicate" | "conflict" | "rejected" | "blocked";

export type TenantSyncOutcomeDto = {
  opId: string;
  status: TenantSyncOutcomeStatus;
  reason: string | null;
  resultingVersion: number | null;
};

/**
 * Produces deterministic canonical JSON for request fingerprinting so duplicate
 * operation IDs are verified against the exact submitted payload.
 */
export function canonicalizeSyncJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeSyncJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeSyncJson(v)}`)
    .join(",")}}`;
}
