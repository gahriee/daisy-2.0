import { z } from "zod";
import type { RoomBuildingValue } from "@/features/rooms/schemas";
import { isValidManilaDate } from "@/lib/dates";
import { ALLOCATION_SCOPES } from "@/features/transients/schemas";

export const MAINTENANCE_CATEGORIES = [
  "PLUMBING",
  "ELECTRICAL",
  "APPLIANCE",
  "STRUCTURAL",
  "PEST_CONTROL",
  "CLEANING",
  "SECURITY",
  "OTHER",
] as const;

export type MaintenanceCategoryValue = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_CATEGORY_LABELS: Record<
  MaintenanceCategoryValue,
  string
> = {
  PLUMBING: "Plumbing",
  ELECTRICAL: "Electrical",
  APPLIANCE: "Appliance",
  STRUCTURAL: "Structural",
  PEST_CONTROL: "Pest control",
  CLEANING: "Cleaning",
  SECURITY: "Security & locks",
  OTHER: "Other",
};

export const MAINTENANCE_PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
] as const;

export type MaintenancePriorityValue = (typeof MAINTENANCE_PRIORITIES)[number];

export const MAINTENANCE_PRIORITY_LABELS: Record<
  MaintenancePriorityValue,
  string
> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const MAINTENANCE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "RESOLVED",
  "CANCELLED",
] as const;

export type MaintenanceStatusValue = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatusValue, string> =
  {
    OPEN: "Open",
    IN_PROGRESS: "In progress",
    WAITING_PARTS: "Waiting parts",
    RESOLVED: "Resolved",
    CANCELLED: "Cancelled",
  };

export const MAINTENANCE_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export type MaintenanceAttachmentMimeType =
  (typeof MAINTENANCE_ATTACHMENT_ALLOWED_MIME_TYPES)[number];

const manilaDateSchema = z
  .string()
  .trim()
  .refine((val) => isValidManilaDate(val), "Select a valid calendar date.");

const optionalUuidSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => (typeof val === "string" ? val.trim() : ""))
  .refine(
    (val) => val === "" || z.string().uuid().safeParse(val).success,
    "Select a valid item.",
  )
  .transform((val) => (val ? val : null));

const optionalShortText = (max: number, message: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) => (typeof val === "string" ? val.trim() : ""))
    .refine((val) => val.length <= max, message)
    .transform((val) => (val ? val : null));

const uniqueIntentIdsSchema = z
  .array(z.string().uuid("Select valid uploaded photos."))
  .max(10, "Maximum of 10 attachments per maintenance update.")
  .default([])
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Duplicate attachment reference.",
  );

export const maintenanceRequestFieldsShape = {
  roomId: z.string().uuid("Select a valid room."),
  bedId: optionalUuidSchema,
  title: z
    .string()
    .trim()
    .min(2, "Enter a brief issue title (at least 2 characters).")
    .max(120, "Keep the issue title under 120 characters."),
  description: z
    .string()
    .trim()
    .min(1, "Describe the maintenance issue.")
    .max(2000, "Keep the description under 2000 characters."),
  category: z.enum(MAINTENANCE_CATEGORIES, {
    message: "Select a maintenance category.",
  }),
  priority: z
    .enum(MAINTENANCE_PRIORITIES, {
      message: "Select a priority level.",
    })
    .default("MEDIUM"),
  attachmentIntentIds: uniqueIntentIdsSchema,
};

export const CreateMaintenanceSyncPayloadSchema = z.object(
  maintenanceRequestFieldsShape,
);

export const CreateMaintenanceRequestSchema = z.object({
  id: z.string().uuid().optional(),
  ...maintenanceRequestFieldsShape,
});

export const addMaintenanceUpdateFieldsShape = {
  expectedVersion: z.coerce.number().int().min(1),
  statusTo: z
    .union([z.enum(MAINTENANCE_STATUSES), z.literal(""), z.null()])
    .optional()
    .transform((val) => (val === "" || val == null ? null : val)),
  note: z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) => (typeof val === "string" ? val.trim() : ""))
    .refine(
      (val) => val.length <= 1500,
      "Keep the update note under 1500 characters.",
    ),
  attachmentIntentIds: uniqueIntentIdsSchema,
};

function enforceUpdateContent(
  value: { statusTo: MaintenanceStatusValue | null; note: string },
  ctx: z.RefinementCtx,
) {
  if (!value.statusTo && value.note.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a progress note or choose a new status.",
      path: ["note"],
    });
  }
}

export const AddMaintenanceUpdateSyncPayloadSchema = z
  .object({
    updateId: z.string().uuid().optional(),
    ...addMaintenanceUpdateFieldsShape,
  })
  .superRefine(enforceUpdateContent);

export const AddMaintenanceUpdateSchema = z
  .object({
    requestId: z.string().uuid("Select a valid maintenance request."),
    updateId: z.string().uuid().optional(),
    ...addMaintenanceUpdateFieldsShape,
  })
  .superRefine(enforceUpdateContent);

export const ArchiveRestoreMaintenanceSchema = z.object({
  requestId: z.string().uuid("Select a valid maintenance request."),
  expectedVersion: z.coerce.number().int().min(1),
});

export const PlaceMaintenanceHoldSchema = z
  .object({
    requestId: z.string().uuid("Select a valid maintenance request."),
    expectedVersion: z.coerce.number().int().min(1),
    scope: z.enum(ALLOCATION_SCOPES, {
      message: "Select whether the hold covers a single bed or the whole room.",
    }),
    bedId: optionalUuidSchema,
    startDateManila: manilaDateSchema,
    endDateManila: manilaDateSchema,
    notes: optionalShortText(500, "Keep hold notes under 500 characters."),
  })
  .superRefine((val, ctx) => {
    if (val.endDateManila <= val.startDateManila) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hold end date must be after the start date.",
        path: ["endDateManila"],
      });
    }
    if (val.scope === "BED" && !val.bedId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a specific bed for a per-bed maintenance hold.",
        path: ["bedId"],
      });
    }
    if (val.scope === "WHOLE_ROOM" && val.bedId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Leave bed unselected for a whole-room maintenance hold.",
        path: ["bedId"],
      });
    }
  });

export const ReleaseMaintenanceHoldSchema = z.object({
  requestId: z.string().uuid("Select a valid maintenance request."),
  expectedVersion: z.coerce.number().int().min(1),
  action: z.enum(["COMPLETE", "CANCEL"]).default("COMPLETE"),
  endDateManila: manilaDateSchema.optional(),
});

export const CreateMaintenanceAttachmentIntentSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1, "Provide the file name.")
      .max(180, "Keep the file name under 180 characters."),
    mimeType: z.enum(MAINTENANCE_ATTACHMENT_ALLOWED_MIME_TYPES, {
      message: "Upload a JPG, PNG, WebP, HEIC image or PDF document.",
    }),
    byteSize: z.coerce
      .number()
      .int("File size must be a whole number of bytes.")
      .min(1, "Selected file is empty.")
      .max(25 * 1024 * 1024, "Attachment cannot exceed 25 MB."),
    sha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-f0-9]{64}$/, "Provide a valid 64-character SHA-256 digest."),
    opId: z.string().uuid("Provide a valid sync operation ID.").optional(),
    clientFileId: z.string().trim().min(1).max(120).optional(),
    maintenanceRequestId: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if ((val.opId && !val.clientFileId) || (!val.opId && val.clientFileId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Queued attachment intents require both opId and clientFileId.",
        path: ["opId"],
      });
    }
  });

export type CreateMaintenanceRequestInput = z.input<
  typeof CreateMaintenanceRequestSchema
>;
export type AddMaintenanceUpdateInput = z.input<
  typeof AddMaintenanceUpdateSchema
>;
export type ArchiveRestoreMaintenanceInput = z.input<
  typeof ArchiveRestoreMaintenanceSchema
>;
export type PlaceMaintenanceHoldInput = z.input<
  typeof PlaceMaintenanceHoldSchema
>;
export type ReleaseMaintenanceHoldInput = z.input<
  typeof ReleaseMaintenanceHoldSchema
>;
export type CreateMaintenanceAttachmentIntentInput = z.input<
  typeof CreateMaintenanceAttachmentIntentSchema
>;

export type MaintenanceAttachmentDto = {
  id: string;
  maintenanceUpdateId: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  downloadPath: string;
  createdAt: string;
};

export type MaintenanceAttachmentIntentDto = {
  intentId: string;
  objectKey: string;
  status: "PENDING_UPLOAD" | "ATTACHED" | "CANCELLED";
  uploadMode: "relay" | "presigned";
  uploadUrl: string;
  expiresAt: string;
  reused: boolean;
};

export type MaintenanceUpdateDto = {
  id: string;
  statusFrom: MaintenanceStatusValue | null;
  statusTo: MaintenanceStatusValue | null;
  note: string;
  createdByActorType: string;
  createdAt: string;
};

export type MaintenanceHoldDto = {
  id: string;
  roomId: string;
  roomNumber: string;
  bedId: string;
  bedNumber: string;
  allocationGroupId: string | null;
  scope: "BED" | "WHOLE_ROOM";
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDateManila: string;
  endDateManila: string;
  startDate: string;
  endDate: string;
  notes: string | null;
};

export type MaintenanceRequestDto = {
  id: string;
  version: number;
  roomId: string;
  roomNumber: string;
  bedId: string | null;
  bedNumber: string | null;
  title: string;
  description: string;
  category: MaintenanceCategoryValue;
  priority: MaintenancePriorityValue;
  status: MaintenanceStatusValue;
  resolvedAt: string | null;
  cancelledAt: string | null;
  archivedAt: string | null;
  createdByActorType: string;
  createdAt: string;
  updatedAt: string;
  updates: MaintenanceUpdateDto[];
  attachments: MaintenanceAttachmentDto[];
  activeHolds: MaintenanceHoldDto[];
};

export type MaintenanceRoomOptionDto = {
  id: string;
  building: RoomBuildingValue;
  number: string;
  floor: string | null;
  beds: Array<{
    id: string;
    number: string;
    status: string;
  }>;
};

export type MaintenanceOverviewDto = {
  proofMaxMb: number;
  proofMaxFilesPerRecord: number;
  totals: {
    openCount: number;
    inProgressCount: number;
    waitingPartsCount: number;
    urgentOpenCount: number;
    activeHoldsCount: number;
  };
  requests: MaintenanceRequestDto[];
  rooms: MaintenanceRoomOptionDto[];
};

export type MaintenanceCreateContextDto = {
  proofMaxMb: number;
  proofMaxFilesPerRecord: number;
  rooms: MaintenanceRoomOptionDto[];
};

export type MaintenanceDetailDto = {
  proofMaxMb: number;
  proofMaxFilesPerRecord: number;
  request: MaintenanceRequestDto;
};
