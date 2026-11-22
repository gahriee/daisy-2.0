import { z } from "zod";

export const DEFAULT_OVERDUE_SMS_TEMPLATE =
  "Hi {{tenantName}}, your {{billingPeriod}} rent bill ({{invoiceNumber}}) for Room {{roomNumber}} with balance {{balance}} was due on {{dueDate}} ({{daysOverdue}} day(s) overdue). Please settle at your earliest convenience. - {{businessName}}";

export const OVERDUE_SMS_TEMPLATE_VARIABLES = [
  {
    token: "{{tenantName}}",
    label: "Tenant name",
    sample: "Maria Santos",
  },
  {
    token: "{{roomNumber}}",
    label: "Room number",
    sample: "201",
  },
  {
    token: "{{invoiceNumber}}",
    label: "Invoice number",
    sample: "INV-2026-000012",
  },
  {
    token: "{{billingPeriod}}",
    label: "Billing period",
    sample: "Nov 2026",
  },
  {
    token: "{{dueDate}}",
    label: "Due date",
    sample: "Nov 6, 2026",
  },
  {
    token: "{{balance}}",
    label: "Remaining balance",
    sample: "PHP 4,500.00",
  },
  {
    token: "{{daysOverdue}}",
    label: "Days overdue",
    sample: "3",
  },
  {
    token: "{{businessName}}",
    label: "Property name",
    sample: "Daisy Residences",
  },
] as const;

export type OverdueSmsTemplateVars = {
  tenantName: string;
  roomNumber: string;
  invoiceNumber: string;
  billingPeriod: string;
  dueDate: string;
  balance: string;
  daysOverdue: number;
  businessName: string;
};

/**
 * Normalizes a Philippine mobile phone number to Semaphore's standard
 * 11-digit `09XXXXXXXXX` format. Returns `null` when the number is empty or
 * not a valid Philippine mobile number.
 */
export function normalizePhilippineMobileNumber(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s\-().+]/g, "");
  if (/^09\d{9}$/.test(digits)) {
    return digits;
  }
  if (/^639\d{9}$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }
  if (/^9\d{9}$/.test(digits)) {
    return `0${digits}`;
  }
  return null;
}

/**
 * Renders the Owner's overdue SMS message template with safe single-pass
 * token substitution and collapses excess whitespace.
 */
export function renderOverdueSmsTemplate(
  template: string | null | undefined,
  vars: OverdueSmsTemplateVars,
): string {
  const source = template?.trim() || DEFAULT_OVERDUE_SMS_TEMPLATE;
  const replacements: Record<string, string> = {
    "{{tenantName}}": vars.tenantName,
    "{{roomNumber}}": vars.roomNumber,
    "{{invoiceNumber}}": vars.invoiceNumber,
    "{{billingPeriod}}": vars.billingPeriod,
    "{{dueDate}}": vars.dueDate,
    "{{balance}}": vars.balance,
    "{{daysOverdue}}": String(Math.max(1, Math.trunc(vars.daysOverdue))),
    "{{businessName}}": vars.businessName,
  };

  return source
    .replace(
      /\{\{(?:tenantName|roomNumber|invoiceNumber|billingPeriod|dueDate|balance|daysOverdue|businessName)\}\}/g,
      (token) => replacements[token] ?? token,
    )
    .replace(/\r\n/g, "\n")
    .trim();
}

/**
 * Estimates SMS credit segments per Semaphore's 160-character ASCII rule
 * (and 70-character Unicode fallback when non-ASCII characters are present).
 */
export function estimateSmsSegments(message: string): {
  length: number;
  segments: number;
  encoding: "GSM" | "UNICODE";
} {
  const length = message.length;
  const isAscii = /^[\x20-\x7E\r\n]*$/.test(message);
  if (length === 0) {
    return { length: 0, segments: 0, encoding: isAscii ? "GSM" : "UNICODE" };
  }
  const perSegment = isAscii ? 160 : 70;
  return {
    length,
    segments: Math.ceil(length / perSegment),
    encoding: isAscii ? "GSM" : "UNICODE",
  };
}

export const SendSingleOverdueSmsSchema = z.object({
  invoiceId: z.string().uuid("Select a valid invoice."),
  forceResendToday: z.boolean().default(false),
});

export type SendSingleOverdueSmsInput = z.infer<
  typeof SendSingleOverdueSmsSchema
>;

export const SendTestOverdueSmsSchema = z.object({
  phone: z.string().trim().min(1, "Enter a mobile number to text."),
  messageTemplate: z
    .string()
    .trim()
    .max(480, "Keep the reminder message under 480 characters.")
    .refine(
      (val) => val === "" || !/^test\b/i.test(val),
      'Do not start the message with "TEST" because Semaphore does not deliver test messages.',
    )
    .nullable()
    .optional(),
  senderName: z
    .string()
    .trim()
    .max(11, "Sender name must be 11 characters or fewer.")
    .refine(
      (val) => val === "" || /^[A-Za-z0-9]+$/.test(val),
      "Use letters and numbers only for sender name (no spaces).",
    )
    .nullable()
    .optional(),
});

export type SendTestOverdueSmsInput = z.infer<typeof SendTestOverdueSmsSchema>;

export type OverdueSmsBatchSummary = {
  notifiedDateManila: string;
  evaluatedCount: number;
  sentCount: number;
  alreadySentTodayCount: number;
  skippedNoPhoneCount: number;
  skippedInvalidPhoneCount: number;
  failedCount: number;
};
