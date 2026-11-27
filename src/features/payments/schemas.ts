import { z } from "zod";
import { isValidManilaDate } from "@/lib/dates";
import {
  normalizeNonNegativeMoneyDecimal,
  parseMoneyDecimal,
} from "@/lib/money";
import type { OverpaymentPolicyValue } from "@/features/settings/schemas";

export const PAYMENT_METHODS = [
  "CASH",
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "CHECK",
  "OTHER",
] as const;

export const SELECTABLE_PAYMENT_METHODS = [
  "CASH",
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "OTHER",
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  CASH: "Cash",
  GCASH: "GCash",
  MAYA: "Maya",
  BANK_TRANSFER: "Bank transfer",
  CHECK: "Check",
  OTHER: "Other",
};

export const PAYMENT_STATUSES = ["POSTED", "REVERSED", "REVERSAL"] as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusValue, string> = {
  POSTED: "Posted",
  REVERSED: "Reversed",
  REVERSAL: "Reversal",
};

export const PROOF_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export type ProofMimeType = (typeof PROOF_ALLOWED_MIME_TYPES)[number];

export const PROOF_ALLOWED_ACCEPT_ATTR =
  "image/jpeg,image/png,image/webp,image/heic,application/pdf";

const positiveMoneySchema = z
  .string()
  .trim()
  .min(1, "Enter a peso amount.")
  .refine((val) => {
    try {
      return (
        parseMoneyDecimal(normalizeNonNegativeMoneyDecimal(val)) > BigInt(0)
      );
    } catch {
      return false;
    }
  }, "Amount must be greater than zero (up to 2 decimals).")
  .transform((val) => normalizeNonNegativeMoneyDecimal(val));

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

export const PaymentAllocationInputSchema = z.object({
  invoiceId: z.string().uuid("Select a valid invoice."),
  amount: positiveMoneySchema,
});

const optionalUuidField = (message: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((val) =>
      typeof val === "string" && val.trim() ? val.trim() : null,
    )
    .refine(
      (val) => val === null || z.string().uuid().safeParse(val).success,
      message,
    );

const recordPaymentFieldsShape = {
  tenantId: optionalUuidField("Select a valid tenant."),
  transientGuestId: optionalUuidField("Select a valid transient guest."),
  amount: positiveMoneySchema,
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().datetime().optional(),
  paidDateManila: manilaDateSchema.optional(),
  referenceNo: optionalShortText(
    80,
    "Keep payment reference under 80 characters.",
  ),
  notes: optionalShortText(500, "Keep payment notes under 500 characters."),
  allocations: z
    .array(PaymentAllocationInputSchema)
    .max(50, "Keep allocations to 50 invoices or fewer.")
    .default([]),
  proofIntentIds: z
    .array(z.string().uuid("Select a valid proof upload."))
    .max(20, "Limit proof attachments to 20 files or fewer.")
    .default([]),
};

function enforceUniquePaymentReferences(
  value: {
    tenantId: string | null;
    transientGuestId: string | null;
    allocations: Array<{ invoiceId: string }>;
    proofIntentIds: string[];
  },
  ctx: z.RefinementCtx,
) {
  const hasTenant = Boolean(value.tenantId);
  const hasTransient = Boolean(value.transientGuestId);
  if (hasTenant === hasTransient) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select either a boarder or a transient guest for this payment.",
      path: ["tenantId"],
    });
  }
  const seen = new Set<string>();
  for (const item of value.allocations) {
    if (seen.has(item.invoiceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Do not list the same invoice twice in one payment.",
        path: ["allocations"],
      });
      break;
    }
    seen.add(item.invoiceId);
  }
  const seenIntents = new Set<string>();
  for (const intentId of value.proofIntentIds) {
    if (seenIntents.has(intentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate proof upload reference detected.",
        path: ["proofIntentIds"],
      });
      break;
    }
    seenIntents.add(intentId);
  }
}

export const RecordPaymentSyncPayloadSchema = z
  .object(recordPaymentFieldsShape)
  .superRefine(enforceUniquePaymentReferences);

export const RecordPaymentSchema = z
  .object({
    id: z.string().uuid().optional(),
    ...recordPaymentFieldsShape,
  })
  .superRefine(enforceUniquePaymentReferences);

export const ReversePaymentSchema = z.object({
  paymentId: z.string().uuid("Select a valid payment."),
  expectedVersion: z.coerce.number().int().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason for reversing this payment.")
    .max(300, "Keep the reason under 300 characters."),
});

export const ApplyTenantCreditSchema = z.object({
  tenantId: z.string().uuid("Select a valid tenant."),
  invoiceId: z.string().uuid("Select a valid invoice.").optional(),
});

export const CreateProofUploadIntentSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1, "Provide the file name.")
      .max(180, "Keep the file name under 180 characters."),
    mimeType: z.enum(PROOF_ALLOWED_MIME_TYPES, {
      message: "Upload a JPG, PNG, WebP, HEIC image or PDF document.",
    }),
    byteSize: z
      .number()
      .int("File size must be a whole byte count.")
      .min(1, "Proof file cannot be empty.")
      .max(20 * 1024 * 1024, "Proof file cannot exceed 20 MB."),
    sha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-f0-9]{64}$/, "Provide a valid 64-character SHA-256 digest."),
    opId: z.string().uuid().optional(),
    clientFileId: z
      .string()
      .trim()
      .min(1, "Provide a stable client attachment ID.")
      .max(80, "Keep client attachment ID under 80 characters.")
      .optional(),
    deviceId: z.string().uuid().optional(),
  })
  .refine((value) => (value.opId ? Boolean(value.clientFileId) : true), {
    message: "Sync proof intents require clientFileId alongside opId.",
    path: ["clientFileId"],
  });

export type RecordPaymentInput = z.input<typeof RecordPaymentSchema>;
export type ReversePaymentInput = z.input<typeof ReversePaymentSchema>;
export type ApplyTenantCreditInput = z.input<typeof ApplyTenantCreditSchema>;
export type CreateProofUploadIntentInput = z.input<
  typeof CreateProofUploadIntentSchema
>;

export type PaymentAllocationDto = {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  billingPeriod: string | null;
  amount: string;
};

export type PaymentProofDto = {
  id: string;
  intentId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
  downloadPath: string;
};

export type PaymentDto = {
  id: string;
  payerKind: "TENANT" | "TRANSIENT";
  tenantId: string | null;
  transientGuestId: string | null;
  tenantName: string;
  version: number;
  receiptNumber: string | null;
  status: PaymentStatusValue;
  method: PaymentMethodValue;
  amount: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  paidAt: string;
  paidDateManila: string;
  referenceNo: string | null;
  notes: string | null;
  reversalReason: string | null;
  reversedPaymentId: string | null;
  reversalEntryId: string | null;
  reversedAt: string | null;
  createdByActorType: string;
  createdAt: string;
  updatedAt: string;
  allocations: PaymentAllocationDto[];
  proofs: PaymentProofDto[];
};

export type PaymentOpenInvoiceItemDto = {
  description: string;
  lineTotal: string;
};

export type PaymentOpenInvoiceOptionDto = {
  id: string;
  payerKind: "TENANT" | "TRANSIENT";
  tenantId: string | null;
  transientGuestId: string | null;
  transientReservationId: string | null;
  tenantName: string;
  invoiceNumber: string | null;
  billingPeriod: string | null;
  dueDateManila: string;
  status: "ISSUED" | "PARTIALLY_PAID";
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  isOverdue: boolean;
  items: PaymentOpenInvoiceItemDto[];
};

export type PaymentTransientOptionDto = {
  id: string;
  fullName: string;
  archivedAt: string | null;
  unallocatedCredit: string;
  openBalance: string;
  openInvoiceCount: number;
};

export type PaymentTenantOptionDto = {
  id: string;
  fullName: string;
  archivedAt: string | null;
  unallocatedCredit: string;
  openBalance: string;
  openInvoiceCount: number;
};

export type PaymentsOverviewDto = {
  policiesComplete: boolean;
  receiptPrefix: string | null;
  overpaymentPolicy: OverpaymentPolicyValue | null;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
  missingPolicyLabels: string[];
  totals: {
    collectedMonthCount: number;
    collectedMonthAmount: string;
    unallocatedCreditAmount: string;
    reversedCount: number;
    proofCount: number;
  };
  payments: PaymentDto[];
  tenants: PaymentTenantOptionDto[];
  transientGuests: PaymentTransientOptionDto[];
  openInvoices: PaymentOpenInvoiceOptionDto[];
};

export type ProofUploadIntentDto = {
  intentId: string;
  objectKey: string;
  uploadUrl: string;
  proxyUploadPath: string;
  expiresAt: string;
  maxBytes: number;
  reused: boolean;
};
