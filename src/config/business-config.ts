import "server-only";
import { z } from "zod";
import {
  DEPOSIT_POLICIES,
  OVERPAYMENT_POLICIES,
  PRORATION_POLICIES,
  type DepositPolicyValue,
  type OverpaymentPolicyValue,
  type ProrationPolicyValue,
} from "@/features/settings/schemas";
import { isValidTimeHHmm } from "@/lib/dates";

const BYTES_PER_MB = 1024 * 1024;

export type EnvRecord = Record<string, string | undefined>;

export type ServerBillingPolicies = {
  billingDayOfMonth: number;
  gracePeriodDays: number;
  prorationPolicy: ProrationPolicyValue;
  depositPolicy: DepositPolicyValue;
  overpaymentPolicy: OverpaymentPolicyValue;
  invoicePrefix: string;
  receiptPrefix: string;
};

export type ServerOperationalLimits = {
  offlineUnlockMaxDays: number;
  proofMaxMb: number;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
  defaultCheckInTimeManila: string;
  defaultCheckOutTimeManila: string;
};

export type ServerSmsConfig = {
  configured: boolean;
  apiKey: string | null;
  senderName: string | null;
  overdueFrequencyDays: number;
  overdueTemplate: string | null;
};

export type ServerSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string | null;
  fromEmail: string;
};

const billingDaySchema = z.coerce
  .number()
  .int()
  .min(1, "BILLING_DAY_OF_MONTH must be an integer between 1 and 28.")
  .max(28, "BILLING_DAY_OF_MONTH must be an integer between 1 and 28.");

const graceDaysSchema = z.coerce
  .number()
  .int()
  .min(0, "BILLING_GRACE_PERIOD_DAYS must be an integer between 0 and 60.")
  .max(60, "BILLING_GRACE_PERIOD_DAYS must be an integer between 0 and 60.");

const prorationSchema = z.enum(PRORATION_POLICIES);
const depositSchema = z.enum(DEPOSIT_POLICIES);
const overpaymentSchema = z.enum(OVERPAYMENT_POLICIES);

const prefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9-]{2,12}$/,
    "Document prefix must be 2–12 uppercase letters, numbers, or hyphens.",
  );

const offlineUnlockDaysSchema = z.coerce
  .number()
  .int()
  .min(1, "OFFLINE_UNLOCK_MAX_DAYS must be an integer between 1 and 30.")
  .max(30, "OFFLINE_UNLOCK_MAX_DAYS must be an integer between 1 and 30.");

const proofMaxMbSchema = z.coerce
  .number()
  .int()
  .min(1, "PROOF_MAX_MB must be an integer between 1 and 20.")
  .max(20, "PROOF_MAX_MB must be an integer between 1 and 20.");

const proofMaxFilesSchema = z.coerce
  .number()
  .int()
  .min(1, "PROOF_MAX_FILES_PER_RECORD must be an integer between 1 and 20.")
  .max(20, "PROOF_MAX_FILES_PER_RECORD must be an integer between 1 and 20.");

const timeHHmmSchema = z
  .string()
  .trim()
  .refine((val) => isValidTimeHHmm(val), "Time must use 24-hour HH:MM format.");

const smsSenderNameSchema = z
  .string()
  .trim()
  .max(11, "SEMAPHORE_SENDER_NAME must be 11 characters or fewer.")
  .refine(
    (val) => /^[A-Za-z0-9]+$/.test(val),
    "SEMAPHORE_SENDER_NAME must use letters and numbers only (no spaces).",
  );

const smsFrequencyDaysSchema = z.coerce
  .number()
  .int()
  .min(
    1,
    "SEMAPHORE_OVERDUE_FREQUENCY_DAYS must be an integer between 1 and 30.",
  )
  .max(
    30,
    "SEMAPHORE_OVERDUE_FREQUENCY_DAYS must be an integer between 1 and 30.",
  );

const smsTemplateSchema = z
  .string()
  .trim()
  .max(480, "SEMAPHORE_OVERDUE_TEMPLATE must be 480 characters or fewer.")
  .refine(
    (val) => !/^test\b/i.test(val),
    'SEMAPHORE_OVERDUE_TEMPLATE must not start with "TEST".',
  );

function readTrimmedEnv(env: EnvRecord, key: string): string | null {
  const raw = env[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function parseEnvOrDefault<T>(
  env: EnvRecord,
  key: string,
  schema: z.ZodType<T>,
  defaultValue: T,
  normalize?: (raw: string) => string,
): T {
  const raw = readTrimmedEnv(env, key);
  if (raw === null) return defaultValue;
  const candidate = normalize ? normalize(raw) : raw;
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "Invalid value.";
    throw new Error(`Invalid environment configuration for ${key}: ${detail}`);
  }
  return parsed.data;
}

/**
 * Resolves authoritative billing, deposit, overpayment, and document-prefix
 * policies from server environment variables with documented defaults.
 */
export function getServerBillingPolicies(
  env: EnvRecord = process.env,
): ServerBillingPolicies {
  return {
    billingDayOfMonth: parseEnvOrDefault(
      env,
      "BILLING_DAY_OF_MONTH",
      billingDaySchema,
      1,
    ),
    gracePeriodDays: parseEnvOrDefault(
      env,
      "BILLING_GRACE_PERIOD_DAYS",
      graceDaysSchema,
      5,
    ),
    prorationPolicy: parseEnvOrDefault(
      env,
      "BILLING_PRORATION_POLICY",
      prorationSchema,
      "DAILY_EXACT",
      (raw) => raw.toUpperCase(),
    ),
    depositPolicy: parseEnvOrDefault(
      env,
      "BILLING_DEPOSIT_POLICY",
      depositSchema,
      "HOLD_SEPARATE",
      (raw) => raw.toUpperCase(),
    ),
    overpaymentPolicy: parseEnvOrDefault(
      env,
      "BILLING_OVERPAYMENT_POLICY",
      overpaymentSchema,
      "CREDIT_NEXT_INVOICE",
      (raw) => raw.toUpperCase(),
    ),
    invoicePrefix: parseEnvOrDefault(
      env,
      "INVOICE_PREFIX",
      prefixSchema,
      "INV-",
    ),
    receiptPrefix: parseEnvOrDefault(
      env,
      "RECEIPT_PREFIX",
      prefixSchema,
      "RCP-",
    ),
  };
}

/**
 * Resolves offline unlock limits, upload limits, and default stay check-in/out
 * times from server environment variables with documented defaults.
 */
export function getServerOperationalLimits(
  env: EnvRecord = process.env,
): ServerOperationalLimits {
  const proofMaxMb = parseEnvOrDefault(
    env,
    "PROOF_MAX_MB",
    proofMaxMbSchema,
    5,
  );
  return {
    offlineUnlockMaxDays: parseEnvOrDefault(
      env,
      "OFFLINE_UNLOCK_MAX_DAYS",
      offlineUnlockDaysSchema,
      7,
    ),
    proofMaxMb,
    proofMaxBytes: proofMaxMb * BYTES_PER_MB,
    proofMaxFilesPerRecord: parseEnvOrDefault(
      env,
      "PROOF_MAX_FILES_PER_RECORD",
      proofMaxFilesSchema,
      5,
    ),
    defaultCheckInTimeManila: parseEnvOrDefault(
      env,
      "DEFAULT_CHECK_IN_TIME",
      timeHHmmSchema,
      "14:00",
    ),
    defaultCheckOutTimeManila: parseEnvOrDefault(
      env,
      "DEFAULT_CHECK_OUT_TIME",
      timeHHmmSchema,
      "12:00",
    ),
  };
}

/**
 * Resolves Semaphore SMS credentials, sender name, repeat frequency, and
 * overdue message template strictly from server environment variables.
 */
export function getServerSmsConfig(
  env: EnvRecord = process.env,
): ServerSmsConfig {
  const apiKey = readTrimmedEnv(env, "SEMAPHORE_API_KEY");
  const senderName = parseEnvOrDefault<string | null>(
    env,
    "SEMAPHORE_SENDER_NAME",
    smsSenderNameSchema,
    null,
  );
  const overdueFrequencyDays = parseEnvOrDefault(
    env,
    "SEMAPHORE_OVERDUE_FREQUENCY_DAYS",
    smsFrequencyDaysSchema,
    1,
  );
  const overdueTemplate = parseEnvOrDefault<string | null>(
    env,
    "SEMAPHORE_OVERDUE_TEMPLATE",
    smsTemplateSchema,
    null,
  );

  return {
    configured: apiKey !== null,
    apiKey,
    senderName,
    overdueFrequencyDays,
    overdueTemplate,
  };
}

/**
 * Resolves SMTP delivery configuration strictly from server environment
 * variables. Returns null when required SMTP credentials are absent or invalid.
 */
export function getServerSmtpConfig(
  env: EnvRecord = process.env,
): ServerSmtpConfig | null {
  const host = readTrimmedEnv(env, "SMTP_HOST") ?? "";
  const user = readTrimmedEnv(env, "SMTP_USER") ?? "";
  const pass = readTrimmedEnv(env, "SMTP_PASS") ?? "";
  const rawPort = readTrimmedEnv(env, "SMTP_PORT") ?? "";
  const port = rawPort ? Number(rawPort) : 587;
  const secure =
    (readTrimmedEnv(env, "SMTP_SECURE") ?? "").toLowerCase() === "true" ||
    port === 465;
  const fromEmail = readTrimmedEnv(env, "MAIL_FROM") || user;
  const fromName = readTrimmedEnv(env, "MAIL_FROM_NAME");

  if (
    !host ||
    !user ||
    !pass ||
    !fromEmail ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromName,
    fromEmail,
  };
}
