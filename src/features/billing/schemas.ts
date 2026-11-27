import { z } from "zod";
import { isValidManilaDate } from "@/lib/dates";
import {
  normalizeNonNegativeMoneyDecimal,
  parseMoneyDecimal,
} from "@/lib/money";
import type {
  DepositPolicyValue,
  ProrationPolicyValue,
} from "@/features/settings/schemas";

export const INVOICE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "VOID",
] as const;

export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatusValue, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  VOID: "Void",
};

export const INVOICE_ITEM_TYPES = [
  "RENT",
  "DEPOSIT",
  "UTILITY",
  "ADJUSTMENT",
  "OTHER",
] as const;

export type InvoiceItemTypeValue = (typeof INVOICE_ITEM_TYPES)[number];

export const INVOICE_ITEM_TYPE_LABELS: Record<InvoiceItemTypeValue, string> = {
  RENT: "Rent",
  DEPOSIT: "Security deposit",
  UTILITY: "Utility",
  ADJUSTMENT: "Adjustment",
  OTHER: "Other",
};

export const INVOICE_ADJUSTMENT_TYPES = ["CREDIT", "CHARGE"] as const;

export type InvoiceAdjustmentTypeValue =
  (typeof INVOICE_ADJUSTMENT_TYPES)[number];

export const INVOICE_ADJUSTMENT_TYPE_LABELS: Record<
  InvoiceAdjustmentTypeValue,
  string
> = {
  CREDIT: "Credit (reduces total)",
  CHARGE: "Charge (adds to total)",
};

export const BILLING_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const BillingPeriodSchema = z
  .string()
  .trim()
  .regex(BILLING_PERIOD_PATTERN, "Use YYYY-MM format (for example 2026-11).");

const manilaDateSchema = z
  .string()
  .trim()
  .refine((val) => isValidManilaDate(val), "Select a valid calendar date.");

const nonNegativeMoneySchema = z
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

const positiveMoneySchema = nonNegativeMoneySchema.refine(
  (val) => parseMoneyDecimal(val) > BigInt(0),
  "Amount must be greater than zero.",
);

const positiveQuantitySchema = z
  .string()
  .trim()
  .min(1, "Enter a quantity.")
  .refine((val) => {
    if (!/^\d+$/.test(val)) return false;
    return parseMoneyDecimal(val) > BigInt(0);
  }, "Enter a positive whole number.")
  .transform((val) => normalizeNonNegativeMoneyDecimal(val));

const optionalShortText = (max: number, message: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) => (typeof val === "string" ? val.trim() : ""))
    .refine((val) => val.length <= max, message)
    .transform((val) => (val ? val : null));

export const GeneratePeriodInvoicesSchema = z.object({
  billingPeriod: BillingPeriodSchema,
  issueImmediately: z.boolean().default(false),
});

export const InvoiceItemInputSchema = z.object({
  itemType: z.enum(INVOICE_ITEM_TYPES),
  description: z
    .string()
    .trim()
    .min(1, "Enter a line description.")
    .max(200, "Keep line description under 200 characters."),
  quantity: positiveQuantitySchema.default("1"),
  unitAmount: nonNegativeMoneySchema,
});

export const CreateManualInvoiceSchema = z
  .object({
    tenantId: z
      .string()
      .uuid("Select a valid tenant.")
      .nullable()
      .optional()
      .transform((val) => val ?? null),
    transientGuestId: z
      .string()
      .uuid("Select a valid transient guest.")
      .nullable()
      .optional()
      .transform((val) => val ?? null),
    billingPeriod: z
      .union([z.string(), z.null()])
      .optional()
      .transform((val) => (typeof val === "string" ? val.trim() : ""))
      .refine(
        (val) => val === "" || BILLING_PERIOD_PATTERN.test(val),
        "Use YYYY-MM format or leave blank.",
      )
      .transform((val) => (val ? val : null)),
    periodStartManila: manilaDateSchema.optional(),
    periodEndManila: manilaDateSchema.optional(),
    dueDateManila: manilaDateSchema,
    issueImmediately: z.boolean().default(false),
    notes: optionalShortText(500, "Keep notes under 500 characters."),
    items: z
      .array(InvoiceItemInputSchema)
      .min(1, "Add at least one invoice line item.")
      .max(30, "Keep invoices to 30 line items or fewer."),
  })
  .superRefine((value, ctx) => {
    const hasTenant = Boolean(value.tenantId);
    const hasGuest = Boolean(value.transientGuestId);
    if (hasTenant === hasGuest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a boarder or transient guest.",
        path: ["tenantId"],
      });
    }
    if (
      value.periodStartManila &&
      value.periodEndManila &&
      value.periodEndManila <= value.periodStartManila
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Period end date must be after period start date.",
        path: ["periodEndManila"],
      });
    }
  });

export const IssueInvoiceSchema = z.object({
  invoiceId: z.string().uuid("Select a valid invoice."),
  expectedVersion: z.coerce.number().int().min(1),
});

export const AddInvoiceAdjustmentSchema = z.object({
  invoiceId: z.string().uuid("Select a valid invoice."),
  expectedVersion: z.coerce.number().int().min(1),
  type: z.enum(INVOICE_ADJUSTMENT_TYPES),
  amount: positiveMoneySchema,
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason for this adjustment.")
    .max(300, "Keep the reason under 300 characters."),
});

export const VoidInvoiceSchema = z.object({
  invoiceId: z.string().uuid("Select a valid invoice."),
  expectedVersion: z.coerce.number().int().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason for voiding this invoice.")
    .max(300, "Keep the reason under 300 characters."),
});

export type GeneratePeriodInvoicesInput = z.input<
  typeof GeneratePeriodInvoicesSchema
>;
export type CreateManualInvoiceInput = z.input<
  typeof CreateManualInvoiceSchema
>;
export type IssueInvoiceInput = z.input<typeof IssueInvoiceSchema>;
export type AddInvoiceAdjustmentInput = z.input<
  typeof AddInvoiceAdjustmentSchema
>;
export type VoidInvoiceInput = z.input<typeof VoidInvoiceSchema>;

export type InvoiceItemDto = {
  id: string;
  itemType: InvoiceItemTypeValue;
  description: string;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
  sortOrder: number;
};

export type InvoiceAdjustmentDto = {
  id: string;
  type: InvoiceAdjustmentTypeValue;
  amount: string;
  reason: string;
  createdByActorType: string;
  createdAt: string;
};

export type InvoiceDto = {
  id: string;
  tenantId: string | null;
  transientGuestId: string | null;
  transientReservationId: string | null;
  assignmentId: string | null;
  version: number;
  invoiceNumber: string | null;
  billingPeriod: string | null;
  periodStartManila: string;
  periodEndManila: string;
  dueDateManila: string;
  status: InvoiceStatusValue;
  /** Derived strictly from Asia/Manila business date for unpaid issued invoices. */
  isOverdue: boolean;
  subtotalAmount: string;
  adjustmentAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  snapshotTenantName: string | null;
  snapshotRoomNumber: string | null;
  snapshotBedNumber: string | null;
  snapshotMonthlyRate: string | null;
  snapshotProrationPolicy: ProrationPolicyValue | null;
  snapshotDepositPolicy: DepositPolicyValue | null;
  notes: string | null;
  voidReason: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItemDto[];
  adjustments: InvoiceAdjustmentDto[];
};

export type BillingTenantOptionDto = {
  id: string;
  fullName: string;
  roomNumber: string | null;
  bedNumber: string | null;
  monthlyRate: string | null;
};

export type BillingTransientGuestOptionDto = {
  id: string;
  fullName: string;
  phone: string | null;
  roomNumber: string | null;
};

export type BillingSummaryDto = {
  draftCount: number;
  issuedOpenCount: number;
  overdueCount: number;
  openReceivablesAmount: string;
  billedCurrentPeriodAmount: string;
};

export type BillingOverviewDto = {
  policiesComplete: boolean;
  missingPolicyFields: string[];
  currentBillingPeriod: string;
  billingDayOfMonth: number | null;
  gracePeriodDays: number | null;
  prorationPolicy: ProrationPolicyValue | null;
  depositPolicy: DepositPolicyValue | null;
  invoicePrefix: string | null;
  invoices: InvoiceDto[];
  tenants: BillingTenantOptionDto[];
  summary: BillingSummaryDto;
};

export type GeneratePeriodInvoicesSummary = {
  billingPeriod: string;
  createdCount: number;
  issuedCount: number;
  skippedExistingCount: number;
  skippedZeroAmountCount: number;
};
