import { z } from "zod";
import type { RoomBuildingValue } from "@/features/rooms/schemas";
import { isValidManilaDate } from "@/lib/dates";

export const NOTICE_AUDIENCES = ["EVERYONE", "ROOM", "TENANT"] as const;
export type NoticeAudienceValue = (typeof NOTICE_AUDIENCES)[number];

export const NOTICE_AUDIENCE_LABELS: Record<NoticeAudienceValue, string> = {
  EVERYONE: "Everyone",
  ROOM: "Specific room",
  TENANT: "Specific tenant",
};

export const NOTICE_LIFECYCLE_STATUSES = [
  "ACTIVE",
  "SCHEDULED",
  "EXPIRED",
  "ARCHIVED",
] as const;
export type NoticeLifecycleStatus = (typeof NOTICE_LIFECYCLE_STATUSES)[number];

export const NOTICE_LIFECYCLE_LABELS: Record<NoticeLifecycleStatus, string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};

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
    "Select a valid record.",
  )
  .transform((val) => (val ? val : null));

const baseNoticeFields = z.object({
  audience: z.enum(NOTICE_AUDIENCES, {
    message: "Select who should receive this notice.",
  }),
  roomId: optionalUuidSchema,
  tenantId: optionalUuidSchema,
  title: z
    .string()
    .trim()
    .min(2, "Enter a notice title (at least 2 characters).")
    .max(140, "Keep the notice title under 140 characters."),
  body: z
    .string()
    .trim()
    .min(1, "Enter the notice details.")
    .max(3000, "Keep the notice message under 3,000 characters."),
  startDateManila: manilaDateSchema,
  endDateManila: manilaDateSchema,
});

function validateNoticeTargetAndDates(
  val: z.infer<typeof baseNoticeFields>,
  ctx: z.RefinementCtx,
) {
  if (val.endDateManila < val.startDateManila) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date must be on or after the start date.",
      path: ["endDateManila"],
    });
  }

  if (val.audience === "EVERYONE") {
    if (val.roomId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Leave room empty for an everyone notice.",
        path: ["roomId"],
      });
    }
    if (val.tenantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Leave tenant empty for an everyone notice.",
        path: ["tenantId"],
      });
    }
  } else if (val.audience === "ROOM") {
    if (!val.roomId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select the room this notice applies to.",
        path: ["roomId"],
      });
    }
    if (val.tenantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A room notice cannot also target a single tenant.",
        path: ["tenantId"],
      });
    }
  } else if (val.audience === "TENANT") {
    if (!val.tenantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select the tenant this notice applies to.",
        path: ["tenantId"],
      });
    }
    if (val.roomId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A tenant notice cannot also target a room.",
        path: ["roomId"],
      });
    }
  }
}

export const CreateNoticeSchema = baseNoticeFields.superRefine(
  validateNoticeTargetAndDates,
);

export const UpdateNoticeSchema = baseNoticeFields
  .extend({
    noticeId: z.string().uuid("Select a valid notice."),
    expectedVersion: z.coerce.number().int().min(1),
  })
  .superRefine(validateNoticeTargetAndDates);

export const ArchiveRestoreNoticeSchema = z.object({
  noticeId: z.string().uuid("Select a valid notice."),
  expectedVersion: z.coerce.number().int().min(1),
});

export type CreateNoticeInput = z.input<typeof CreateNoticeSchema>;
export type UpdateNoticeInput = z.input<typeof UpdateNoticeSchema>;
export type ArchiveRestoreNoticeInput = z.input<
  typeof ArchiveRestoreNoticeSchema
>;

export type NoticeDto = {
  id: string;
  version: number;
  audience: NoticeAudienceValue;
  roomId: string | null;
  roomNumber: string | null;
  tenantId: string | null;
  tenantName: string | null;
  title: string;
  body: string;
  startDateManila: string;
  endDateManila: string;
  startDate: string;
  endDate: string;
  lifecycleStatus: NoticeLifecycleStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoticeRoomOptionDto = {
  id: string;
  building: RoomBuildingValue;
  number: string;
  floor: string | null;
};

export type NoticeTenantOptionDto = {
  id: string;
  fullName: string;
};

export type NoticeOverviewDto = {
  todayManila: string;
  totals: {
    activeCount: number;
    scheduledCount: number;
    expiredCount: number;
    archivedCount: number;
  };
  notices: NoticeDto[];
  rooms: NoticeRoomOptionDto[];
  tenants: NoticeTenantOptionDto[];
};
