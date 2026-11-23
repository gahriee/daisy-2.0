import { z } from "zod";
import { isValidTimeHHmm } from "@/lib/dates";

export const PRORATION_POLICIES = [
  "DAILY_EXACT",
  "DAILY_30",
  "HALF_MONTH",
  "NONE",
] as const;

export const DEPOSIT_POLICIES = [
  "HOLD_SEPARATE",
  "APPLY_ON_MOVE_OUT",
  "APPLY_TO_LAST_MONTH",
] as const;

export const OVERPAYMENT_POLICIES = [
  "REJECT_OVERPAYMENT",
  "CREDIT_NEXT_INVOICE",
] as const;

export type ProrationPolicyValue = (typeof PRORATION_POLICIES)[number];
export type DepositPolicyValue = (typeof DEPOSIT_POLICIES)[number];
export type OverpaymentPolicyValue = (typeof OVERPAYMENT_POLICIES)[number];

export const PRORATION_POLICY_LABELS: Record<ProrationPolicyValue, string> = {
  DAILY_EXACT: "Charge per day (exact days in month)",
  DAILY_30: "Charge per day (30-day month)",
  HALF_MONTH: "Half-month rate (15 days or less)",
  NONE: "Full month charge (no partial rate)",
};

export const DEPOSIT_POLICY_LABELS: Record<DepositPolicyValue, string> = {
  HOLD_SEPARATE: "Hold separately (refund after move-out)",
  APPLY_ON_MOVE_OUT: "Apply to final balance on move-out",
  APPLY_TO_LAST_MONTH: "Apply to final month rent",
};

export const OVERPAYMENT_POLICY_LABELS: Record<OverpaymentPolicyValue, string> =
  {
    REJECT_OVERPAYMENT: "Do not accept more than amount due",
    CREDIT_NEXT_INVOICE: "Keep extra payment as tenant credit",
  };

const prefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,12}$/, "Use 2–12 letters, numbers, or hyphens.")
  .nullable();

const timeSchema = z
  .string()
  .trim()
  .refine((val) => isValidTimeHHmm(val), "Use 24-hour HH:MM format.")
  .nullable();

const optionalShortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep under ${max} characters.`)
    .transform((val) => (val === "" ? null : val))
    .nullable();

export const SETTINGS_MODULES = [
  "profile",
  "policies",
  "operations",
  "house_rules",
  "sms",
] as const;
export type SettingsModule = (typeof SETTINGS_MODULES)[number];

const profileFields = {
  businessName: z
    .string()
    .trim()
    .min(1, "Enter your boarding house name.")
    .max(120, "Keep business name under 120 characters."),
  businessPhone: optionalShortText(40),
  businessAddress: optionalShortText(240),
  tin: optionalShortText(40),
};

const policiesFields = {
  billingDayOfMonth: z
    .number()
    .int("Choose a whole day from 1 to 28.")
    .min(1, "Billing day must be between 1 and 28.")
    .max(28, "Billing day must be between 1 and 28.")
    .nullable(),
  gracePeriodDays: z
    .number()
    .int("Enter a whole number of days.")
    .min(0, "Grace days cannot be negative.")
    .max(60, "Grace days cannot exceed 60.")
    .nullable(),
  prorationPolicy: z.enum(PRORATION_POLICIES).nullable(),
  depositPolicy: z.enum(DEPOSIT_POLICIES).nullable(),
  overpaymentPolicy: z.enum(OVERPAYMENT_POLICIES).nullable(),
  invoicePrefix: prefixSchema,
  receiptPrefix: prefixSchema,
};

export const DEFAULT_HOUSE_RULES = [
  "1. No curfew. Just bring key in going out in order not to disturb others.",
  "2. Always keep the entire house clean at all times.",
  "3. Observe proper disposal of garbage.",
  "4. Pay rental fee on time.",
  "5. Avoid alcoholic drinks and illegal drugs inside the premises.",
  "6. Observe silence during rest time/hours (10pm to 7am).",
].join("\n");

/**
 * Parses newline-delimited house rules text into clean rule statements,
 * stripping optional leading numbering or bullet characters. Returns an empty
 * list when unset or blank.
 */
export function parseHouseRulesList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:\d+[.)]\s*|[-*•]\s*)/, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

/**
 * Serializes an ordered list of rule strings into numbered newline-delimited
 * text persisted in `BusinessSettings.transientPolicyNote`.
 */
export function serializeHouseRulesList(
  rules: ReadonlyArray<string>,
): string | null {
  const cleaned = rules
    .map((rule) =>
      rule
        .trim()
        .replace(/^(?:\d+[.)]\s*|[-*•]\s*)/, "")
        .trim(),
    )
    .filter((rule) => rule.length > 0);
  if (cleaned.length === 0) return null;
  return cleaned.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
}

const optionalLongText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep under ${max} characters.`)
    .transform((val) => (val === "" ? null : val))
    .nullable();

const operationsFields = {
  checkInTimeManila: timeSchema,
  checkOutTimeManila: timeSchema,
  transientPolicyNote: optionalLongText(2000).optional(),
  offlineUnlockMaxDays: z
    .number()
    .int()
    .min(1, "Unlock window must be at least 1 day.")
    .max(30, "Unlock window cannot exceed 30 days."),
  proofMaxMb: z
    .number()
    .int()
    .min(1, "Proof size limit must be at least 1 MB.")
    .max(20, "Proof size limit cannot exceed 20 MB."),
  proofMaxFilesPerRecord: z
    .number()
    .int()
    .min(1, "Allow at least 1 proof file per record.")
    .max(20, "Limit proof files per record to 20 or fewer."),
};

export const ProfileSettingsUpdateSchema = z.object({
  module: z.literal("profile"),
  expectedVersion: z.number().int().min(0),
  ...profileFields,
});

export const PoliciesSettingsUpdateSchema = z.object({
  module: z.literal("policies"),
  expectedVersion: z.number().int().min(0),
  ...policiesFields,
});

export const OperationsSettingsUpdateSchema = z.object({
  module: z.literal("operations"),
  expectedVersion: z.number().int().min(0),
  ...operationsFields,
});

export const HouseRulesSettingsUpdateSchema = z.object({
  module: z.literal("house_rules"),
  expectedVersion: z.number().int().min(0),
  transientPolicyNote: optionalLongText(2000),
});

const smsSenderNameSchema = z
  .string()
  .trim()
  .max(11, "Semaphore sender name must be 11 characters or fewer.")
  .refine(
    (val) => val === "" || /^[A-Za-z0-9]+$/.test(val),
    "Use letters and numbers only for Semaphore sender name (no spaces).",
  )
  .transform((val) => (val === "" ? null : val))
  .nullable();

const smsOverdueTemplateSchema = z
  .string()
  .trim()
  .max(480, "Keep the SMS message template under 480 characters.")
  .refine(
    (val) => val === "" || !/^test\b/i.test(val),
    'Do not start the message with "TEST" (Semaphore ignores messages beginning with TEST).',
  )
  .transform((val) => (val === "" ? null : val))
  .nullable();

const smsApiKeyInputSchema = z
  .string()
  .trim()
  .max(256, "API key looks too long.")
  .transform((val) => (val === "" ? null : val))
  .nullable()
  .optional();

const requiredTimeSchema = z
  .string()
  .trim()
  .refine((val) => isValidTimeHHmm(val), "Use 24-hour HH:MM format.");

export const SmsSettingsUpdateSchema = z.object({
  module: z.literal("sms"),
  expectedVersion: z.number().int().min(0),
  smsOverdueEnabled: z.boolean(),
  smsOverdueFrequencyDays: z
    .number()
    .int("Enter a whole number of days.")
    .min(1, "Repeat frequency must be at least 1 day.")
    .max(30, "Repeat frequency cannot exceed 30 days."),
  smsOverdueSendTimeManila: requiredTimeSchema,
  smsApiKey: smsApiKeyInputSchema,
  clearSmsApiKey: z.boolean().default(false),
  smsSenderName: smsSenderNameSchema,
  smsOverdueTemplate: smsOverdueTemplateSchema,
});

export const BusinessSettingsModuleUpdateSchema = z.discriminatedUnion(
  "module",
  [
    ProfileSettingsUpdateSchema,
    PoliciesSettingsUpdateSchema,
    OperationsSettingsUpdateSchema,
    HouseRulesSettingsUpdateSchema,
    SmsSettingsUpdateSchema,
  ],
);

export type BusinessSettingsModuleUpdateInput = z.input<
  typeof BusinessSettingsModuleUpdateSchema
>;

export const BusinessSettingsUpdateSchema = z.object({
  expectedVersion: z.number().int().min(0),
  ...profileFields,
  ...policiesFields,
  ...operationsFields,
});

export type BusinessSettingsUpdateInput = z.input<
  typeof BusinessSettingsUpdateSchema
>;

export type BusinessSettingsDto = {
  id: string | null;
  version: number;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  tin: string | null;
  billingDayOfMonth: number | null;
  gracePeriodDays: number | null;
  prorationPolicy: ProrationPolicyValue | null;
  depositPolicy: DepositPolicyValue | null;
  overpaymentPolicy: OverpaymentPolicyValue | null;
  invoicePrefix: string | null;
  receiptPrefix: string | null;
  checkInTimeManila: string | null;
  checkOutTimeManila: string | null;
  transientPolicyNote: string | null;
  offlineUnlockMaxDays: number;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
  smsOverdueEnabled: boolean;
  smsOverdueFrequencyDays: number;
  smsOverdueSendTimeManila: string;
  smsApiKeyConfigured: boolean;
  smsApiKeyLast4: string | null;
  smsSenderName: string | null;
  smsOverdueTemplate: string | null;
  updatedAt: string | null;
  policiesComplete: boolean;
  stayScheduleComplete: boolean;
};

export function hasCompleteFinancialPolicies(settings: {
  billingDayOfMonth: number | null;
  gracePeriodDays: number | null;
  prorationPolicy: ProrationPolicyValue | null;
  depositPolicy: DepositPolicyValue | null;
  overpaymentPolicy: OverpaymentPolicyValue | null;
  invoicePrefix: string | null;
  receiptPrefix: string | null;
}): boolean {
  return (
    settings.billingDayOfMonth !== null &&
    settings.gracePeriodDays !== null &&
    settings.prorationPolicy !== null &&
    settings.depositPolicy !== null &&
    settings.overpaymentPolicy !== null &&
    Boolean(settings.invoicePrefix) &&
    Boolean(settings.receiptPrefix)
  );
}

export function hasCompleteStaySchedule(settings: {
  checkInTimeManila: string | null;
  checkOutTimeManila: string | null;
}): boolean {
  return (
    Boolean(settings.checkInTimeManila) && Boolean(settings.checkOutTimeManila)
  );
}
