import { z } from "zod";
import { normalizeNonNegativeMoneyDecimal } from "@/lib/money";

export const BED_STATUSES = [
  "AVAILABLE",
  "OCCUPIED",
  "MAINTENANCE",
  "ARCHIVED",
] as const;

export const ROOM_BUILDINGS = ["BOARDING", "TRANSIENT"] as const;
export type RoomBuildingValue = (typeof ROOM_BUILDINGS)[number];

export const ROOM_BUILDING_LABELS: Record<RoomBuildingValue, string> = {
  BOARDING: "Boarding House",
  TRANSIENT: "Transient Building",
};

export const EDITABLE_BED_STATUSES = ["AVAILABLE", "MAINTENANCE"] as const;

export const ROOM_PHOTO_ROLES = ["PREVIEW", "GALLERY"] as const;
export type RoomPhotoRole = (typeof ROOM_PHOTO_ROLES)[number];

export const ROOM_PHOTO_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type RoomPhotoAllowedMimeType =
  (typeof ROOM_PHOTO_ALLOWED_MIME_TYPES)[number];

export const ROOM_PHOTO_MAX_CAPTION_LENGTH = 160;
export const ROOM_PHOTO_OUTPUT_WIDTH = 1200;
export const ROOM_PHOTO_OUTPUT_HEIGHT = 900;
export const ROOM_PHOTO_ASPECT_RATIO =
  ROOM_PHOTO_OUTPUT_WIDTH / ROOM_PHOTO_OUTPUT_HEIGHT;

export type BedStatusValue = (typeof BED_STATUSES)[number];
export type EditableBedStatusValue = (typeof EDITABLE_BED_STATUSES)[number];

export const BED_STATUS_LABELS: Record<BedStatusValue, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  MAINTENANCE: "Maintenance",
  ARCHIVED: "Archived",
};

const optionalMoneySchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => (typeof val === "string" ? val.trim() : ""))
  .refine((val) => {
    if (!val) return true;
    try {
      normalizeNonNegativeMoneyDecimal(val);
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid non-negative peso amount (up to 2 decimals).")
  .transform((val) => (val ? normalizeNonNegativeMoneyDecimal(val) : null));

const optionalShortText = (max: number, message: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) => (typeof val === "string" ? val.trim() : ""))
    .refine((val) => val.length <= max, message)
    .transform((val) => (val ? val : null));

const sharedRoomFieldsSchema = {
  title: z
    .string()
    .trim()
    .min(1, "Enter a room title.")
    .max(120, "Keep room title under 120 characters."),
  floor: optionalShortText(40, "Keep floor label under 40 characters."),
  capacity: z.coerce
    .number()
    .int("Capacity must be a whole number.")
    .min(1, "Room capacity must be at least 1 bed.")
    .max(50, "Room capacity cannot exceed 50 beds."),
  transientDailyRate: optionalMoneySchema,
  summary: optionalShortText(600, "Keep summary under 600 characters."),
};

export const CreateRoomPhotoIntentSchema = z.object({
  roomId: z.string().uuid("Select a valid room.").nullable().optional(),
  fileName: z
    .string()
    .trim()
    .min(1, "Select an image file.")
    .max(180, "Keep the file name under 180 characters."),
  mimeType: z.enum(ROOM_PHOTO_ALLOWED_MIME_TYPES, {
    message: "Upload a JPEG, PNG, or WebP image.",
  }),
  byteSize: z.coerce
    .number()
    .int("File size must be a whole number.")
    .min(1, "Selected image cannot be empty.")
    .max(25 * 1024 * 1024, "Selected image exceeds the maximum upload size."),
  sha256: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-f0-9]{64}$/, "Image integrity checksum must be valid."),
});

export const RoomPhotoManifestItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    photoId: z.string().uuid("Select a valid saved photo."),
    caption: optionalShortText(
      ROOM_PHOTO_MAX_CAPTION_LENGTH,
      `Keep photo captions under ${ROOM_PHOTO_MAX_CAPTION_LENGTH} characters.`,
    ),
  }),
  z.object({
    kind: z.literal("intent"),
    intentId: z.string().uuid("Select a valid uploaded photo."),
    caption: optionalShortText(
      ROOM_PHOTO_MAX_CAPTION_LENGTH,
      `Keep photo captions under ${ROOM_PHOTO_MAX_CAPTION_LENGTH} characters.`,
    ),
  }),
]);

export const RoomPhotoManifestSchema = z.object({
  preview: RoomPhotoManifestItemSchema.nullable(),
  gallery: z.array(RoomPhotoManifestItemSchema),
});

function hasNonEmptyRoomPhotos(
  photos: z.input<typeof RoomPhotoManifestSchema> | undefined,
): boolean {
  if (!photos) return false;
  return photos.preview !== null || photos.gallery.length > 0;
}

function enforceRoomBuildingRates(
  val: {
    building?: RoomBuildingValue | undefined;
    baseMonthlyRate: string | null;
    transientDailyRate: string | null;
    isTransientPublished?: boolean | undefined;
    photos?: z.input<typeof RoomPhotoManifestSchema> | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (val.building === "BOARDING") {
    if (!val.baseMonthlyRate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a monthly rate for this room.",
        path: ["baseMonthlyRate"],
      });
    }
    if (val.transientDailyRate !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Boarding House rooms cannot set a transient daily rate.",
        path: ["transientDailyRate"],
      });
    }
    if (val.isTransientPublished === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Boarding House rooms cannot be published on /book.",
        path: ["isTransientPublished"],
      });
    }
    if (hasNonEmptyRoomPhotos(val.photos)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Boarding House rooms do not support public room photos.",
        path: ["photos"],
      });
    }
  } else if (val.building === "TRANSIENT") {
    if (!val.transientDailyRate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a daily rate for this transient room.",
        path: ["transientDailyRate"],
      });
    }
    if (val.baseMonthlyRate !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Transient Building rooms cannot set a monthly boarding rate.",
        path: ["baseMonthlyRate"],
      });
    }
  } else if (!val.baseMonthlyRate && !val.transientDailyRate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a rate for this room.",
      path: ["baseMonthlyRate"],
    });
  }
}

export const CreateRoomSchema = z
  .object({
    building: z.enum(ROOM_BUILDINGS).default("BOARDING"),
    ...sharedRoomFieldsSchema,
    baseMonthlyRate: optionalMoneySchema,
    isTransientPublished: z.boolean().default(false),
    photos: RoomPhotoManifestSchema.optional(),
  })
  .superRefine(enforceRoomBuildingRates);

export const UpdateRoomSchema = z
  .object({
    roomId: z.string().uuid("Select a valid room."),
    expectedVersion: z.coerce.number().int().min(1),
    building: z.enum(ROOM_BUILDINGS).optional(),
    ...sharedRoomFieldsSchema,
    baseMonthlyRate: optionalMoneySchema,
    isTransientPublished: z.boolean().optional(),
    photos: RoomPhotoManifestSchema.optional(),
  })
  .superRefine(enforceRoomBuildingRates);

export const ArchiveRestoreRoomSchema = z.object({
  roomId: z.string().uuid("Select a valid room."),
  expectedVersion: z.coerce.number().int().min(1),
});

const bedFieldsSchema = {
  number: z
    .string()
    .trim()
    .min(1, "Enter a bed number or code.")
    .max(30, "Keep bed number under 30 characters."),
  label: optionalShortText(60, "Keep bed label under 60 characters."),
  monthlyRate: optionalMoneySchema,
  dailyRate: optionalMoneySchema,
};

function enforceBedRatePresence(
  val: { monthlyRate: string | null; dailyRate: string | null },
  ctx: z.RefinementCtx,
) {
  if (!val.monthlyRate && !val.dailyRate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a rate for this bed.",
      path: ["monthlyRate"],
    });
  }
}

export const CreateBedSchema = z
  .object({
    roomId: z.string().uuid("Select a valid room."),
    ...bedFieldsSchema,
  })
  .superRefine(enforceBedRatePresence);

export const UpdateBedSchema = z
  .object({
    bedId: z.string().uuid("Select a valid bed."),
    expectedVersion: z.coerce.number().int().min(1),
    ...bedFieldsSchema,
    status: z.enum(EDITABLE_BED_STATUSES, {
      message: "Choose Available or Maintenance.",
    }),
  })
  .superRefine(enforceBedRatePresence);

export const ArchiveRestoreBedSchema = z.object({
  bedId: z.string().uuid("Select a valid bed."),
  expectedVersion: z.coerce.number().int().min(1),
});

export type CreateRoomInput = z.input<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.input<typeof UpdateRoomSchema>;
export type CreateRoomPhotoIntentInput = z.input<
  typeof CreateRoomPhotoIntentSchema
>;
export type RoomPhotoManifestInput = z.input<typeof RoomPhotoManifestSchema>;
export type RoomPhotoManifestItem = z.infer<typeof RoomPhotoManifestItemSchema>;
export type CreateBedInput = z.input<typeof CreateBedSchema>;
export type UpdateBedInput = z.input<typeof UpdateBedSchema>;

/**
 * Safely parses an optional JSON-encoded room photo manifest field from
 * multipart or FormData submissions without duplicating parsing across actions.
 */
export function parseRoomPhotosManifestJsonField(
  formData: FormData,
): RoomPhotoManifestInput | undefined {
  if (!formData.has("roomPhotosJson")) return undefined;
  const raw = formData.get("roomPhotosJson");
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("Room photo selection could not be parsed.");
  }
  const parsed = RoomPhotoManifestSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Check the selected room photos.",
    );
  }
  return parsed.data;
}

export type RoomPhotoIntentDto = {
  intentId: string;
  objectKey: string;
  status: "PENDING_UPLOAD" | "ATTACHED" | "EXPIRED" | "ORPHAN_PURGED";
  uploadMode: "relay";
  uploadUrl: string;
  expiresAt: string;
};

export type RoomPhotoDto = {
  id: string;
  roomId: string;
  role: RoomPhotoRole;
  caption: string | null;
  sortOrder: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  url: string;
};

export type BedDto = {
  id: string;
  roomId: string;
  version: number;
  number: string;
  label: string | null;
  monthlyRate: string | null;
  dailyRate: string | null;
  status: BedStatusValue;
  activeAllocationCount: number;
  currentStaySummary: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoomDto = {
  id: string;
  version: number;
  building: RoomBuildingValue;
  title: string;
  floor: string | null;
  capacity: number;
  baseMonthlyRate: string | null;
  transientDailyRate: string | null;
  isTransientPublished: boolean;
  summary: string | null;
  previewPhoto: RoomPhotoDto | null;
  galleryPhotos: RoomPhotoDto[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoomWithBedsDto = RoomDto & {
  activeAllocationCount: number;
  beds: BedDto[];
};

export type InventorySummaryDto = {
  totalRooms: number;
  activeRooms: number;
  totalActiveBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  maintenanceBeds: number;
};

export type InventoryOverviewDto = {
  building?: RoomBuildingValue;
  summary: InventorySummaryDto;
  rooms: RoomWithBedsDto[];
};
