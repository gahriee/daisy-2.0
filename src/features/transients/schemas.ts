import { z } from "zod";
import {
  RoomPhotoManifestSchema,
  type RoomPhotoDto,
} from "@/features/rooms/schemas";
import { isValidManilaDate } from "@/lib/dates";
import {
  normalizeNonNegativeMoneyDecimal,
  parseMoneyDecimal,
} from "@/lib/money";

export const TRANSIENT_RESERVATION_STATUSES = [
  "TENTATIVE",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type TransientReservationStatusValue =
  (typeof TRANSIENT_RESERVATION_STATUSES)[number];

export const TRANSIENT_RESERVATION_STATUS_LABELS: Record<
  TransientReservationStatusValue,
  string
> = {
  TENTATIVE: "Tentative (offline)",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

export const BOOKING_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export type BookingRequestStatusValue =
  (typeof BOOKING_REQUEST_STATUSES)[number];

export const BOOKING_REQUEST_STATUS_LABELS: Record<
  BookingRequestStatusValue,
  string
> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const ALLOCATION_SCOPES = ["BED", "WHOLE_ROOM"] as const;
export type AllocationScopeValue = (typeof ALLOCATION_SCOPES)[number];

export const ALLOCATION_SCOPE_LABELS: Record<AllocationScopeValue, string> = {
  BED: "Per bed",
  WHOLE_ROOM: "Whole room",
};

const manilaDateSchema = z
  .string()
  .trim()
  .refine((val) => isValidManilaDate(val), "Select a valid calendar date.");

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
  .transform((val) => (typeof val === "string" ? val.trim().toLowerCase() : ""))
  .refine(
    (val) =>
      val === "" ||
      (val.length <= 160 && z.string().email().safeParse(val).success),
    "Enter a valid email address.",
  )
  .transform((val) => (val ? val : null));

const optionalUuidSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => (typeof val === "string" ? val.trim() : ""))
  .refine(
    (val) => val === "" || z.string().uuid().safeParse(val).success,
    "Select a valid item.",
  )
  .transform((val) => (val ? val : null));

const positiveMoneySchema = z
  .string()
  .trim()
  .min(1, "Enter a daily rate in PHP.")
  .refine((val) => {
    try {
      const normalized = normalizeNonNegativeMoneyDecimal(val);
      return parseMoneyDecimal(normalized) > BigInt(0);
    } catch {
      return false;
    }
  }, "Enter a positive peso amount (up to 2 decimals).")
  .transform((val) => normalizeNonNegativeMoneyDecimal(val));

const optionalPositiveMoneySchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => (typeof val === "string" ? val.trim() : ""))
  .refine((val) => {
    if (!val) return true;
    try {
      const normalized = normalizeNonNegativeMoneyDecimal(val);
      return parseMoneyDecimal(normalized) > BigInt(0);
    } catch {
      return false;
    }
  }, "Enter a positive peso amount (up to 2 decimals).")
  .transform((val) => (val ? normalizeNonNegativeMoneyDecimal(val) : null));

export const transientGuestFieldsShape = {
  fullName: z
    .string()
    .trim()
    .min(2, "Enter the guest full name.")
    .max(120, "Keep guest name under 120 characters."),
  phone: optionalShortText(40, "Keep phone number under 40 characters."),
  email: optionalEmailSchema,
  notes: optionalShortText(500, "Keep guest notes under 500 characters."),
};

function enforceGuestContactPresence(
  value: { phone: string | null; email: string | null },
  ctx: z.RefinementCtx,
) {
  if (!value.phone && !value.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide at least a phone number or email address.",
      path: ["phone"],
    });
  }
}

export const CreateTransientGuestSyncPayloadSchema = z
  .object(transientGuestFieldsShape)
  .superRefine(enforceGuestContactPresence);

export const CreateTransientGuestSchema = z
  .object({
    id: z.string().uuid().optional(),
    ...transientGuestFieldsShape,
  })
  .superRefine(enforceGuestContactPresence);

export const UpdateTransientGuestSchema = z
  .object({
    guestId: z.string().uuid("Select a valid transient guest."),
    expectedVersion: z.coerce.number().int().min(1),
    ...transientGuestFieldsShape,
  })
  .superRefine(enforceGuestContactPresence);

export const ArchiveTransientGuestSchema = z.object({
  guestId: z.string().uuid("Select a valid transient guest."),
  expectedVersion: z.coerce.number().int().min(1),
});

export const UpdateRoomTransientPublishSchema = z.object({
  roomId: z.string().uuid("Select a valid room."),
  expectedVersion: z.coerce.number().int().min(1),
  isTransientPublished: z.boolean(),
  transientTitle: optionalShortText(
    120,
    "Keep the public room title under 120 characters.",
  ),
  transientDescription: optionalShortText(
    600,
    "Keep the public room description under 600 characters.",
  ),
  transientScope: z
    .union([z.enum(ALLOCATION_SCOPES), z.literal(""), z.null()])
    .optional()
    .transform((val) => (val === "" || val == null ? null : val)),
  transientDailyRate: optionalPositiveMoneySchema,
  photos: RoomPhotoManifestSchema.optional(),
});

export const UpdateTransientPolicyNoteSchema = z.object({
  transientPolicyNote: optionalShortText(
    1000,
    "Keep the transient policy note under 1000 characters.",
  ),
});

export const transientReservationFieldsShape = {
  guestId: z.string().uuid("Select a valid transient guest."),
  roomId: z.string().uuid("Select a valid room."),
  bedId: optionalUuidSchema,
  scope: z.enum(ALLOCATION_SCOPES),
  checkInDateManila: manilaDateSchema,
  checkOutDateManila: manilaDateSchema,
  partySize: z.coerce
    .number()
    .int()
    .min(1, "At least 1 guest is required.")
    .max(20, "Party size cannot exceed 20 guests."),
  dailyRateOverride: optionalPositiveMoneySchema,
  notes: optionalShortText(500, "Keep stay notes under 500 characters."),
  tentative: z.boolean().default(false),
  issueInvoiceImmediately: z.boolean().default(false),
};

function enforceTransientReservationConstraints(
  value: {
    scope: AllocationScopeValue;
    bedId: string | null;
    checkInDateManila: string;
    checkOutDateManila: string;
  },
  ctx: z.RefinementCtx,
) {
  if (value.checkOutDateManila <= value.checkInDateManila) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Check-out date must be after check-in date.",
      path: ["checkOutDateManila"],
    });
  }
  if (value.scope === "BED" && !value.bedId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select a specific bed for a per-bed stay.",
      path: ["bedId"],
    });
  }
  if (value.scope === "WHOLE_ROOM" && value.bedId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Leave bed unselected for a whole-room stay.",
      path: ["bedId"],
    });
  }
}

export const CreateTransientReservationSyncPayloadSchema = z
  .object(transientReservationFieldsShape)
  .superRefine(enforceTransientReservationConstraints);

export const CreateTransientReservationSchema = z
  .object({
    id: z.string().uuid().optional(),
    ...transientReservationFieldsShape,
  })
  .superRefine(enforceTransientReservationConstraints);

export const CheckInTransientReservationSchema = z.object({
  reservationId: z.string().uuid("Select a valid stay."),
  expectedVersion: z.coerce.number().int().min(1),
});

export const CheckOutTransientReservationSchema = z.object({
  reservationId: z.string().uuid("Select a valid stay."),
  expectedVersion: z.coerce.number().int().min(1),
  actualCheckOutDateManila: manilaDateSchema.optional(),
});

export const CancelTransientReservationSchema = z.object({
  reservationId: z.string().uuid("Select a valid stay."),
  expectedVersion: z.coerce.number().int().min(1),
  reason: optionalShortText(
    300,
    "Keep cancellation reason under 300 characters.",
  ),
});

export const CreateTransientStayInvoiceSchema = z.object({
  reservationId: z.string().uuid("Select a valid stay."),
  dueDateManila: manilaDateSchema.optional(),
  issueImmediately: z.boolean().default(true),
  notes: optionalShortText(500, "Keep invoice notes under 500 characters."),
});

export const PublicAvailabilityQuerySchema = z
  .object({
    checkInDateManila: manilaDateSchema,
    checkOutDateManila: manilaDateSchema,
    guests: z.coerce
      .number()
      .int("Enter a whole guest count.")
      .min(1, "Enter at least 1 guest.")
      .max(20, "Maximum inquiry size is 20 guests.")
      .default(1),
  })
  .refine((val) => val.checkOutDateManila > val.checkInDateManila, {
    message: "Check-out date must be after check-in date.",
    path: ["checkOutDateManila"],
  });

export const SubmitPublicBookingRequestSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(16, "Missing idempotency token.")
      .max(120, "Invalid idempotency token.")
      .regex(/^[A-Za-z0-9_-]+$/, "Invalid idempotency token."),
    roomId: z.string().uuid("Select a room option."),
    scope: z.enum(ALLOCATION_SCOPES),
    checkInDateManila: manilaDateSchema,
    checkOutDateManila: manilaDateSchema,
    partySize: z.coerce
      .number()
      .int("Enter a whole guest count.")
      .min(1, "At least 1 guest is required.")
      .max(20, "Party size cannot exceed 20 guests."),
    guestName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120, "Keep your name under 120 characters."),
    guestPhone: optionalShortText(40, "Keep phone number under 40 characters."),
    guestEmail: optionalEmailSchema,
    notes: optionalShortText(500, "Keep your note under 500 characters."),
    privacyConsentAccepted: z.literal(true, {
      message:
        "Acknowledge the privacy notice before submitting your booking request.",
    }),
  })
  .superRefine((val, ctx) => {
    if (val.checkOutDateManila <= val.checkInDateManila) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-out date must be after check-in date.",
        path: ["checkOutDateManila"],
      });
    }
    if (!val.guestPhone && !val.guestEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a phone number or email address so we can reply.",
        path: ["guestPhone"],
      });
    }
  });

export const ApproveBookingRequestSchema = z.object({
  requestId: z.string().uuid("Select a valid booking request."),
  expectedVersion: z.coerce.number().int().min(1),
  bedId: optionalUuidSchema,
  existingGuestId: optionalUuidSchema,
  confirmedDailyRate: positiveMoneySchema.optional(),
  confirmRateChange: z.boolean().default(false),
  notes: optionalShortText(500, "Keep notes under 500 characters."),
  issueInvoiceImmediately: z.boolean().default(false),
});

export const RejectBookingRequestSchema = z.object({
  requestId: z.string().uuid("Select a valid booking request."),
  expectedVersion: z.coerce.number().int().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason for rejecting this request.")
    .max(300, "Keep rejection reason under 300 characters."),
});

export const WithdrawBookingRequestSchema = z.object({
  requestId: z.string().uuid("Select a valid booking request."),
  expectedVersion: z.coerce.number().int().min(1),
  reason: optionalShortText(300, "Keep reason under 300 characters."),
});

export type CreateTransientGuestInput = z.input<
  typeof CreateTransientGuestSchema
>;
export type UpdateTransientGuestInput = z.input<
  typeof UpdateTransientGuestSchema
>;
export type ArchiveTransientGuestInput = z.input<
  typeof ArchiveTransientGuestSchema
>;
export type UpdateRoomTransientPublishInput = z.input<
  typeof UpdateRoomTransientPublishSchema
>;
export type UpdateTransientPolicyNoteInput = z.input<
  typeof UpdateTransientPolicyNoteSchema
>;
export type CreateTransientReservationInput = z.input<
  typeof CreateTransientReservationSchema
>;
export type CheckInTransientReservationInput = z.input<
  typeof CheckInTransientReservationSchema
>;
export type CheckOutTransientReservationInput = z.input<
  typeof CheckOutTransientReservationSchema
>;
export type CancelTransientReservationInput = z.input<
  typeof CancelTransientReservationSchema
>;
export type CreateTransientStayInvoiceInput = z.input<
  typeof CreateTransientStayInvoiceSchema
>;
export type PublicAvailabilityQueryInput = z.input<
  typeof PublicAvailabilityQuerySchema
>;
export type SubmitPublicBookingRequestInput = z.input<
  typeof SubmitPublicBookingRequestSchema
>;
export type ApproveBookingRequestInput = z.input<
  typeof ApproveBookingRequestSchema
>;
export type RejectBookingRequestInput = z.input<
  typeof RejectBookingRequestSchema
>;
export type WithdrawBookingRequestInput = z.input<
  typeof WithdrawBookingRequestSchema
>;

export type TransientGuestDto = {
  id: string;
  version: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransientReservationDto = {
  id: string;
  version: number;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  bedId: string | null;
  bedNumber: string | null;
  scope: AllocationScopeValue;
  checkInDateManila: string;
  checkOutDateManila: string;
  startDate: string;
  endDate: string;
  nights: number;
  partySize: number;
  dailyRate: string;
  totalAmount: string;
  status: TransientReservationStatusValue;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  cancellationReason: string | null;
  activeInvoiceId: string | null;
  activeInvoiceNumber: string | null;
  activeInvoiceStatus: string | null;
  activeInvoiceTotal: string | null;
  activeInvoiceBalance: string | null;
  createdByActorType: string;
  createdAt: string;
  updatedAt: string;
};

export type BookingRequestDto = {
  id: string;
  version: number;
  referenceCode: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  scope: AllocationScopeValue;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  notes: string | null;
  checkInDateManila: string;
  checkOutDateManila: string;
  nights: number;
  partySize: number;
  quotedDailyRate: string;
  quotedTotalAmount: string;
  currentDailyRate: string | null;
  rateChangedSinceSubmit: boolean;
  privacyConsentAccepted: boolean;
  status: BookingRequestStatusValue;
  rejectionReason: string | null;
  reviewedAt: string | null;
  approvedGuestId: string | null;
  approvedReservationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransientBedOptionDto = {
  id: string;
  number: string;
  status: string;
  archivedAt: string | null;
};

export type TransientRoomOptionDto = {
  id: string;
  version: number;
  number: string;
  floor: string | null;
  roomTypeName: string;
  capacity: number;
  resolvedDailyRate: string | null;
  isTransientPublished: boolean;
  transientTitle: string | null;
  transientDescription: string | null;
  transientScope: AllocationScopeValue | null;
  transientDailyRate: string | null;
  previewPhoto: RoomPhotoDto | null;
  galleryPhotos: RoomPhotoDto[];
  beds: TransientBedOptionDto[];
};

export type BookingRequestDetailDto = {
  request: BookingRequestDto;
  room: TransientRoomOptionDto;
  availableBedsForDates: TransientBedOptionDto[];
  wholeRoomAvailableForDates: boolean;
  matchingGuests: TransientGuestDto[];
  checkInTimeManila: string;
  checkOutTimeManila: string;
};

export type TransientsOverviewDto = {
  checkInTimeManila: string;
  checkOutTimeManila: string;
  transientPolicyNote: string | null;
  totals: {
    pendingRequests: number;
    tentativeReservations: number;
    confirmedReservations: number;
    checkedInReservations: number;
    publishedRooms: number;
  };
  requests: BookingRequestDto[];
  reservations: TransientReservationDto[];
  guests: TransientGuestDto[];
  rooms: TransientRoomOptionDto[];
};

export type PublicPublishedRoomDto = {
  roomId: string;
  title: string;
  description: string | null;
  roomTypeName: string;
  scope: AllocationScopeValue;
  capacity: number;
  availableUnitsForRange: number;
  isAvailableForRequestedStay: boolean;
  dailyRate: string;
  indicativeTotalAmount: string;
  previewImageUrl: string | null;
  galleryImages: Array<{
    id: string;
    url: string;
    caption: string | null;
  }>;
};

export type PublicAvailabilityDto = {
  propertyName: string;
  propertyAddress: string | null;
  contactPhone: string | null;
  checkInTimeManila: string;
  checkOutTimeManila: string;
  transientPolicyNote: string | null;
  checkInDateManila: string;
  checkOutDateManila: string;
  nights: number;
  guests: number;
  rooms: PublicPublishedRoomDto[];
};

export type PublicBookingAckDto = {
  id: string;
  referenceCode: string;
  status: BookingRequestStatusValue;
  roomTitle: string;
  scope: AllocationScopeValue;
  checkInDateManila: string;
  checkOutDateManila: string;
  nights: number;
  partySize: number;
  quotedDailyRate: string;
  quotedTotalAmount: string;
  submittedAt: string;
};
