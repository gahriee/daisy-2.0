import { z } from "zod";
import { normalizeNonNegativeMoneyDecimal } from "@/lib/money";

export const BED_STATUSES = [
  "AVAILABLE",
  "OCCUPIED",
  "MAINTENANCE",
  "ARCHIVED",
] as const;

export const EDITABLE_BED_STATUSES = ["AVAILABLE", "MAINTENANCE"] as const;

export type BedStatusValue = (typeof BED_STATUSES)[number];
export type EditableBedStatusValue = (typeof EDITABLE_BED_STATUSES)[number];

export const BED_STATUS_LABELS: Record<BedStatusValue, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  MAINTENANCE: "Maintenance",
  ARCHIVED: "Archived",
};

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

const roomTypeFieldsSchema = {
  name: z
    .string()
    .trim()
    .min(1, "Enter a room type name.")
    .max(60, "Keep room type name under 60 characters."),
  monthlyRate: requiredMoneySchema,
  dailyRate: optionalMoneySchema,
  description: optionalShortText(
    240,
    "Keep room type description under 240 characters.",
  ),
};

export const CreateRoomTypeSchema = z.object(roomTypeFieldsSchema);

export const UpdateRoomTypeSchema = z.object({
  roomTypeId: z.string().uuid("Select a valid room type."),
  expectedVersion: z.coerce.number().int().min(1),
  ...roomTypeFieldsSchema,
});

export const ArchiveRestoreRoomTypeSchema = z.object({
  roomTypeId: z.string().uuid("Select a valid room type."),
  expectedVersion: z.coerce.number().int().min(1),
});

const sharedRoomFieldsSchema = {
  number: z
    .string()
    .trim()
    .min(1, "Enter a room number or code.")
    .max(40, "Keep room number under 40 characters."),
  floor: optionalShortText(40, "Keep floor label under 40 characters."),
  roomTypeId: z.string().uuid("Select a valid room type."),
  capacity: z.coerce
    .number()
    .int("Capacity must be a whole number.")
    .min(1, "Room capacity must be at least 1 bed.")
    .max(50, "Room capacity cannot exceed 50 beds."),
  transientDailyRate: optionalMoneySchema,
  notes: optionalShortText(400, "Keep notes under 400 characters."),
};

export const CreateRoomSchema = z.object({
  ...sharedRoomFieldsSchema,
  baseMonthlyRate: optionalMoneySchema,
});

export const UpdateRoomSchema = z.object({
  roomId: z.string().uuid("Select a valid room."),
  expectedVersion: z.coerce.number().int().min(1),
  ...sharedRoomFieldsSchema,
  baseMonthlyRate: requiredMoneySchema,
});

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
  monthlyRate: requiredMoneySchema,
  dailyRate: optionalMoneySchema,
};

export const CreateBedSchema = z.object({
  roomId: z.string().uuid("Select a valid room."),
  ...bedFieldsSchema,
});

export const UpdateBedSchema = z.object({
  bedId: z.string().uuid("Select a valid bed."),
  expectedVersion: z.coerce.number().int().min(1),
  ...bedFieldsSchema,
  status: z.enum(EDITABLE_BED_STATUSES, {
    message: "Choose Available or Maintenance.",
  }),
});

export const ArchiveRestoreBedSchema = z.object({
  bedId: z.string().uuid("Select a valid bed."),
  expectedVersion: z.coerce.number().int().min(1),
});

export type CreateRoomTypeInput = z.input<typeof CreateRoomTypeSchema>;
export type UpdateRoomTypeInput = z.input<typeof UpdateRoomTypeSchema>;
export type CreateRoomInput = z.input<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.input<typeof UpdateRoomSchema>;
export type CreateBedInput = z.input<typeof CreateBedSchema>;
export type UpdateBedInput = z.input<typeof UpdateBedSchema>;

export type RoomTypeDto = {
  id: string;
  version: number;
  name: string;
  monthlyRate: string;
  dailyRate: string | null;
  description: string | null;
  activeRoomCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BedDto = {
  id: string;
  roomId: string;
  version: number;
  number: string;
  label: string | null;
  monthlyRate: string;
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
  number: string;
  floor: string | null;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeArchived: boolean;
  capacity: number;
  baseMonthlyRate: string;
  transientDailyRate: string | null;
  notes: string | null;
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
  summary: InventorySummaryDto;
  roomTypes: RoomTypeDto[];
  rooms: RoomWithBedsDto[];
};
