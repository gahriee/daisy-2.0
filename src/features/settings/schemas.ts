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

export const SETTINGS_MODULES = ["profile", "policies", "operations"] as const;
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

const operationsFields = {
  checkInTimeManila: timeSchema,
  checkOutTimeManila: timeSchema,
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

export const BusinessSettingsModuleUpdateSchema = z.discriminatedUnion(
  "module",
  [
    ProfileSettingsUpdateSchema,
    PoliciesSettingsUpdateSchema,
    OperationsSettingsUpdateSchema,
  ],
);

export type BusinessSettingsModuleUpdateInput = z.infer<
  typeof BusinessSettingsModuleUpdateSchema
>;

export const BusinessSettingsUpdateSchema = z.object({
  expectedVersion: z.number().int().min(0),
  ...profileFields,
  ...policiesFields,
  ...operationsFields,
});

export type BusinessSettingsUpdateInput = z.infer<
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
  offlineUnlockMaxDays: number;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
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
