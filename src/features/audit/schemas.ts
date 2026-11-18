import { z } from "zod";
import { isValidManilaDate } from "@/lib/dates";

export const AUDIT_AREAS = [
  "all",
  "settings",
  "tenants",
  "rooms",
  "allocations",
  "billing",
  "payments",
  "transients",
  "maintenance",
  "notices",
  "reports",
] as const;

export type AuditAreaFilter = (typeof AUDIT_AREAS)[number];

export const AUDIT_AREA_LABELS: Record<AuditAreaFilter, string> = {
  all: "All areas",
  settings: "Settings",
  tenants: "Tenants",
  rooms: "Rooms",
  allocations: "Room stays",
  billing: "Billing",
  payments: "Payments",
  transients: "Short stays",
  maintenance: "Maintenance",
  notices: "Notices",
  reports: "Reports",
};

const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || isValidManilaDate(value),
    "Use YYYY-MM-DD format.",
  );

export const AuditFilterSchema = z
  .object({
    area: z.enum(AUDIT_AREAS).default("all"),
    query: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((value) => (value ? value : undefined)),
    action: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((value) => (value ? value : undefined)),
    fromDate: optionalDateSchema,
    toDate: optionalDateSchema,
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .refine(
    (value) =>
      !value.fromDate || !value.toDate || value.fromDate <= value.toDate,
    {
      message: "From date cannot be later than To date.",
      path: ["fromDate"],
    },
  );

export type AuditFilterInput = z.input<typeof AuditFilterSchema>;

export type AuditLogEntryDto = {
  id: string;
  area: string;
  action: string;
  actorType: string;
  actorId: string;
  entityType: string;
  entityId: string;
  sequence: string | null;
  createdAt: string;
};
