import { z } from "zod";
import { canonicalizeSyncJson } from "@/features/tenants/sync-contracts";
import {
  AddMaintenanceUpdateSyncPayloadSchema,
  CreateMaintenanceSyncPayloadSchema,
  type MaintenanceRequestDto,
} from "./schemas";

export const MAINTENANCE_SYNC_PROTOCOL_VERSION = 1 as const;

export const MAINTENANCE_SYNC_OPERATION_TYPES = [
  "maintenance.create",
  "maintenance.update",
  "maintenance.archive",
  "maintenance.restore",
] as const;

export type MaintenanceSyncOperationType =
  (typeof MAINTENANCE_SYNC_OPERATION_TYPES)[number];

const emptyObjectPayloadSchema = z.object({}).default({});

export const MaintenanceSyncOperationSchema = z.discriminatedUnion("type", [
  z.object({
    protocolVersion: z.literal(MAINTENANCE_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("maintenance.create"),
    entityId: z.string().uuid(),
    baseVersion: z.literal(0),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: CreateMaintenanceSyncPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(MAINTENANCE_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("maintenance.update"),
    entityId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: AddMaintenanceUpdateSyncPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(MAINTENANCE_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("maintenance.archive"),
    entityId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: emptyObjectPayloadSchema,
  }),
  z.object({
    protocolVersion: z.literal(MAINTENANCE_SYNC_PROTOCOL_VERSION),
    opId: z.string().uuid(),
    deviceId: z.string().uuid(),
    localSequence: z.number().int().min(1),
    type: z.literal("maintenance.restore"),
    entityId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    dependsOn: z.array(z.string().uuid()).default([]),
    occurredAt: z.string().datetime(),
    payload: emptyObjectPayloadSchema,
  }),
]);

export type MaintenanceSyncOperation = z.infer<
  typeof MaintenanceSyncOperationSchema
>;

export type MaintenanceSyncOutcomeStatus =
  "applied" | "duplicate" | "conflict" | "rejected" | "blocked";

export type MaintenanceSyncOutcomeDto = {
  opId: string;
  status: MaintenanceSyncOutcomeStatus;
  reason: string | null;
  resultingVersion: number | null;
  request: MaintenanceRequestDto | null;
};

export function computeMaintenanceSyncFingerprint(
  op: MaintenanceSyncOperation,
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
