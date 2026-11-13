import { z } from "zod";
import { isValidManilaDate } from "@/lib/dates";
import { normalizeNonNegativeMoneyDecimal } from "@/lib/money";

export const TENANT_ASSIGNMENT_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

export type TenantAssignmentStatusValue =
  (typeof TENANT_ASSIGNMENT_STATUSES)[number];

export const TENANT_ASSIGNMENT_STATUS_LABELS: Record<
  TenantAssignmentStatusValue,
  string
> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const optionalShortText = (max: number, message: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) => (typeof val === "string" ? val.trim() : ""))
    .refine((val) => val.length <= max, message)
    .transform((val) => (val ? val : null));

const optionalEmailSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => (typeof val === "string" ? val.trim() : ""))
  .refine(
    (val) => val === "" || z.string().email().max(160).safeParse(val).success,
    "Enter a valid email address or leave blank.",
  )
  .transform((val) => (val ? val : null));

const requiredMoneySchema = z
  .string()
  .trim()
  .min(1, "Enter a peso amount.")
  .refine((val) => {
    try {
      normalizeNonNegativeMoneyDecimal(val);
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid non-negative peso amount (up to 2 decimals).")
  .transform((val) => normalizeNonNegativeMoneyDecimal(val));

const manilaDateSchema = z
  .string()
  .trim()
  .refine((val) => isValidManilaDate(val), "Select a valid calendar date.");

const tenantProfileFields = {
  fullName: z
    .string()
    .trim()
    .min(1, "Enter the tenant's full name.")
    .max(120, "Keep tenant name under 120 characters."),
  phone: optionalShortText(40, "Keep phone number under 40 characters."),
  email: optionalEmailSchema,
  address: optionalShortText(240, "Keep address under 240 characters."),
  emergencyContact: optionalShortText(
    160,
    "Keep emergency contact under 160 characters.",
  ),
  notes: optionalShortText(500, "Keep notes under 500 characters."),
};

export const CreateTenantSchema = z.object({
  id: z.string().uuid("Invalid tenant identifier.").optional(),
  ...tenantProfileFields,
});

export const UpdateTenantSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  expectedVersion: z.coerce.number().int().min(1),
  ...tenantProfileFields,
});

export const ArchiveRestoreTenantSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  expectedVersion: z.coerce.number().int().min(1),
});

export const CreateTenantAssignmentSchema = z
  .object({
    tenantId: z.string().uuid("Select a valid tenant."),
    bedId: z.string().uuid("Select an available bed."),
    startDateManila: manilaDateSchema,
    endDateManila: manilaDateSchema,
    monthlyRate: requiredMoneySchema,
    securityDeposit: requiredMoneySchema,
    notes: optionalShortText(400, "Keep notes under 400 characters."),
  })
  .refine((value) => value.endDateManila > value.startDateManila, {
    message: "Planned end date must be after move-in date.",
    path: ["endDateManila"],
  });

export const MoveOutTenantAssignmentSchema = z
  .object({
    assignmentId: z.string().uuid("Select a valid assignment."),
    expectedVersion: z.coerce.number().int().min(1),
    mode: z.enum(["complete", "cancel"]),
    actualMoveOutDateManila: z
      .union([z.string(), z.null()])
      .optional()
      .transform((val) => (typeof val === "string" ? val.trim() : "")),
    notes: optionalShortText(400, "Keep notes under 400 characters."),
  })
  .refine(
    (value) =>
      value.mode === "cancel" ||
      isValidManilaDate(value.actualMoveOutDateManila),
    {
      message: "Select a valid move-out date.",
      path: ["actualMoveOutDateManila"],
    },
  );

export type CreateTenantInput = z.input<typeof CreateTenantSchema>;
export type UpdateTenantInput = z.input<typeof UpdateTenantSchema>;
export type CreateTenantAssignmentInput = z.input<
  typeof CreateTenantAssignmentSchema
>;
export type MoveOutTenantAssignmentInput = z.input<
  typeof MoveOutTenantAssignmentSchema
>;

export type TenantDto = {
  id: string;
  version: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContact: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TenantAssignmentDto = {
  id: string;
  tenantId: string;
  roomId: string;
  roomNumber: string;
  bedId: string;
  bedNumber: string;
  bedLabel: string | null;
  allocationId: string;
  startDate: string;
  endDate: string;
  startDateManila: string;
  endDateManila: string;
  actualMoveOutDate: string | null;
  actualMoveOutDateManila: string | null;
  monthlyRate: string;
  securityDeposit: string;
  status: TenantAssignmentStatusValue;
  version: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TenantListItemDto = TenantDto & {
  activeAssignment: TenantAssignmentDto | null;
  /** Read-only derived balance from invoices & payments (no editable balance column). */
  derivedBalance: string;
};

export type AssignableBedOptionDto = {
  bedId: string;
  roomId: string;
  roomNumber: string;
  roomFloor: string | null;
  bedNumber: string;
  bedLabel: string | null;
  monthlyRate: string;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED";
};

export type TenantsOverviewDto = {
  tenants: TenantListItemDto[];
  assignableBeds: AssignableBedOptionDto[];
};

export type TenantDetailDto = {
  tenant: TenantDto;
  activeAssignment: TenantAssignmentDto | null;
  assignments: TenantAssignmentDto[];
  derivedBalance: string;
  assignableBeds: AssignableBedOptionDto[];
};
