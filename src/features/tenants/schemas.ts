import { z } from "zod";
import type { InvoiceDto } from "@/features/billing/schemas";
import type { PaymentDto } from "@/features/payments/schemas";
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
  notes: optionalShortText(500, "Keep notes under 500 characters.").optional(),
});

export const ArchiveRestoreTenantSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  expectedVersion: z.coerce.number().int().min(1),
});

export const CreateTenantNoteSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  content: z
    .string()
    .trim()
    .min(1, "Enter a note before saving.")
    .max(1000, "Keep each note under 1000 characters."),
});

export const DeleteTenantNoteSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  noteId: z.string().uuid("Select a valid note."),
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
export type CreateTenantNoteInput = z.input<typeof CreateTenantNoteSchema>;
export type DeleteTenantNoteInput = z.input<typeof DeleteTenantNoteSchema>;
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

export type TenantNoteDto = {
  id: string;
  tenantId: string;
  content: string;
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
  tenantNotes: TenantNoteDto[];
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

export const CONTRACT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type ContractAllowedMimeType =
  (typeof CONTRACT_ALLOWED_MIME_TYPES)[number];

export const CONTRACT_SCAN_MODES = [
  "ORIGINAL",
  "MAGIC_WHITE",
  "BW_SCAN",
] as const;

export type ContractScanModeValue = (typeof CONTRACT_SCAN_MODES)[number];

export const CONTRACT_SCAN_MODE_LABELS: Record<ContractScanModeValue, string> =
  {
    MAGIC_WHITE: "Magic white",
    BW_SCAN: "B&W scan",
    ORIGINAL: "Original",
  };

export const CONTRACT_MAX_PAGES = 20;
export const CONTRACT_MAX_FILE_BYTES = 15 * 1024 * 1024;

const optionalUuidSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => (typeof val === "string" ? val.trim() : ""))
  .refine(
    (val) => val === "" || z.string().uuid().safeParse(val).success,
    "Select a valid record.",
  )
  .transform((val) => (val ? val : null));

const optionalManilaDateSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => (typeof val === "string" ? val.trim() : ""))
  .refine(
    (val) => val === "" || isValidManilaDate(val),
    "Select a valid signed calendar date.",
  )
  .transform((val) => (val ? val : null));

export const CreateTenantContractIntentSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  fileName: z
    .string()
    .trim()
    .min(1, "Select a scanned image or PDF file.")
    .max(180, "Keep contract file name under 180 characters."),
  mimeType: z.enum(CONTRACT_ALLOWED_MIME_TYPES, {
    message: "Upload a JPEG, PNG, WebP image, or PDF document.",
  }),
  byteSize: z.coerce
    .number()
    .int()
    .positive("Contract file cannot be empty.")
    .max(CONTRACT_MAX_FILE_BYTES, "Keep each contract page file under 15 MB."),
  sha256: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-f0-9]{64}$/, "Valid SHA-256 digest is required."),
});

export const ContractPageSubmissionSchema = z.object({
  intentId: z.string().uuid("Each contract page must be uploaded first."),
  filterMode: z.enum(CONTRACT_SCAN_MODES).default("MAGIC_WHITE"),
  label: optionalShortText(60, "Keep page labels under 60 characters."),
});

export const CreateTenantContractSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  assignmentId: optionalUuidSchema,
  title: z
    .string()
    .trim()
    .min(2, "Enter a contract title.")
    .max(120, "Keep contract title under 120 characters."),
  signedDateManila: optionalManilaDateSchema,
  notes: optionalShortText(500, "Keep contract notes under 500 characters."),
  pages: z
    .array(ContractPageSubmissionSchema)
    .min(1, "Attach at least one signed contract page or PDF.")
    .max(
      CONTRACT_MAX_PAGES,
      `Attach at most ${CONTRACT_MAX_PAGES} pages per signed contract.`,
    )
    .refine(
      (pages) =>
        new Set(pages.map((page) => page.intentId)).size === pages.length,
      "Each uploaded page intent can only be used once per contract.",
    ),
});

export const ArchiveTenantContractSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  contractId: z.string().uuid("Select a valid signed contract."),
  expectedVersion: z.coerce.number().int().min(1),
});

export type CreateTenantContractIntentInput = z.input<
  typeof CreateTenantContractIntentSchema
>;
export type CreateTenantContractInput = z.input<
  typeof CreateTenantContractSchema
>;
export type ArchiveTenantContractInput = z.input<
  typeof ArchiveTenantContractSchema
>;

export type TenantContractIntentDto = {
  intentId: string;
  objectKey: string;
  status: "PENDING_UPLOAD" | "ATTACHED" | "EXPIRED";
  uploadUrl: string;
  expiresAt: string;
};

export type TenantContractPageDto = {
  id: string;
  contractId: string;
  pageOrder: number;
  filterMode: ContractScanModeValue;
  label: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  url: string;
  createdAt: string;
};

export type TenantContractDto = {
  id: string;
  tenantId: string;
  assignmentId: string | null;
  assignmentRoomNumber: string | null;
  version: number;
  title: string;
  signedDateManila: string | null;
  notes: string | null;
  pageCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pages: TenantContractPageDto[];
};

export type TenantsOverviewDto = {
  tenants: TenantListItemDto[];
  assignableBeds: AssignableBedOptionDto[];
};

export type TenantDetailDto = {
  tenant: TenantDto;
  activeAssignment: TenantAssignmentDto | null;
  assignments: TenantAssignmentDto[];
  tenantNotes: TenantNoteDto[];
  contracts: TenantContractDto[];
  derivedBalance: string;
  unallocatedCredit: string;
  assignableBeds: AssignableBedOptionDto[];
  invoices: InvoiceDto[];
  payments: PaymentDto[];
};
