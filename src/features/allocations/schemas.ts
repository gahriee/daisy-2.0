import { z } from "zod";

export const ALLOCATION_TYPES = [
  "TENANT_ASSIGNMENT",
  "TRANSIENT_RESERVATION",
  "MAINTENANCE_HOLD",
] as const;

export const ALLOCATION_SCOPES = ["BED", "WHOLE_ROOM"] as const;

export const ALLOCATION_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

export type AllocationTypeValue = (typeof ALLOCATION_TYPES)[number];
export type AllocationScopeValue = (typeof ALLOCATION_SCOPES)[number];
export type AllocationStatusValue = (typeof ALLOCATION_STATUSES)[number];

export const ALLOCATION_TYPE_LABELS: Record<AllocationTypeValue, string> = {
  TENANT_ASSIGNMENT: "Tenant stay",
  TRANSIENT_RESERVATION: "Transient stay",
  MAINTENANCE_HOLD: "Maintenance hold",
};

export const ALLOCATION_SCOPE_LABELS: Record<AllocationScopeValue, string> = {
  BED: "Single bed",
  WHOLE_ROOM: "Whole room",
};

export const ALLOCATION_STATUS_LABELS: Record<AllocationStatusValue, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const AllocationIntervalInputSchema = z
  .object({
    roomId: z.string().uuid("Select a valid room."),
    bedId: z.string().uuid("Select a valid bed.").optional(),
    scope: z.enum(ALLOCATION_SCOPES).default("BED"),
    type: z.enum(ALLOCATION_TYPES),
    startDate: z.date(),
    endDate: z.date(),
    notes: z
      .string()
      .trim()
      .max(400, "Keep notes under 400 characters.")
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .refine((value) => value.endDate.getTime() > value.startDate.getTime(), {
    message: "End date must be after start date.",
    path: ["endDate"],
  })
  .refine((value) => value.scope === "WHOLE_ROOM" || Boolean(value.bedId), {
    message: "Single-bed allocations require a bed ID.",
    path: ["bedId"],
  });

export type AllocationDto = {
  id: string;
  roomId: string;
  bedId: string;
  allocationGroupId: string | null;
  scope: AllocationScopeValue;
  type: AllocationTypeValue;
  status: AllocationStatusValue;
  startDate: string;
  endDate: string;
  startDateManila: string;
  endDateManila: string;
  version: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
