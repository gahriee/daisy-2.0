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

const requiredTimeSchema = z
  .string()
  .trim()
  .refine((val) => isValidTimeHHmm(val), "Use 24-hour HH:MM format.");

const optionalShortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep under ${max} characters.`)
    .transform((val) => (val === "" ? null : val))
    .nullable();

const optionalLongText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep under ${max} characters.`)
    .transform((val) => (val === "" ? null : val))
    .nullable();

export const SETTINGS_MODULES = ["property", "house_rules"] as const;
export type SettingsModule = (typeof SETTINGS_MODULES)[number];

const latitudeSchema = z
  .number()
  .min(-90, "Latitude must be between -90 and 90.")
  .max(90, "Latitude must be between -90 and 90.")
  .nullable();

const longitudeSchema = z
  .number()
  .min(-180, "Longitude must be between -180 and 180.")
  .max(180, "Longitude must be between -180 and 180.")
  .nullable();

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

export const PropertySettingsUpdateSchema = z.object({
  module: z.literal("property"),
  expectedVersion: z.number().int().min(0),
  businessName: z
    .string()
    .trim()
    .min(1, "Enter your boarding house name.")
    .max(120, "Keep business name under 120 characters."),
  businessPhone: optionalShortText(40),
  businessAddress: optionalShortText(240),
  businessLatitude: latitudeSchema.optional().default(null),
  businessLongitude: longitudeSchema.optional().default(null),
  tin: optionalShortText(40),
  checkInTimeManila: requiredTimeSchema,
  checkOutTimeManila: requiredTimeSchema,
  smsOverdueEnabled: z.boolean(),
  smsOverdueSendTimeManila: requiredTimeSchema,
});

export const HouseRulesSettingsUpdateSchema = z.object({
  module: z.literal("house_rules"),
  expectedVersion: z.number().int().min(0),
  transientPolicyNote: optionalLongText(2000),
});

export const BusinessSettingsModuleUpdateSchema = z.discriminatedUnion(
  "module",
  [PropertySettingsUpdateSchema, HouseRulesSettingsUpdateSchema],
);

export type BusinessSettingsModuleUpdateInput = z.input<
  typeof BusinessSettingsModuleUpdateSchema
>;

export type BusinessSettingsDto = {
  id: string | null;
  version: number;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  businessLatitude: number | null;
  businessLongitude: number | null;
  tin: string | null;
  billingDayOfMonth: number;
  gracePeriodDays: number;
  prorationPolicy: ProrationPolicyValue;
  depositPolicy: DepositPolicyValue;
  overpaymentPolicy: OverpaymentPolicyValue;
  invoicePrefix: string;
  receiptPrefix: string;
  checkInTimeManila: string;
  checkOutTimeManila: string;
  transientPolicyNote: string | null;
  offlineUnlockMaxDays: number;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
  smsConfigured: boolean;
  smsOverdueEnabled: boolean;
  smsOverdueFrequencyDays: number;
  smsOverdueSendTimeManila: string;
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
