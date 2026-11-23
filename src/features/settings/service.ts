import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, ValidationError } from "@/lib/errors";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { getDatabase } from "@/server/db/client";
import {
  encryptAppSecret,
  maskSecretLast4,
} from "@/server/security/secret-box";
import { writeAuditEntry } from "@/server/sync/publish";
import {
  BusinessSettingsModuleUpdateSchema,
  BusinessSettingsUpdateSchema,
  hasCompleteFinancialPolicies,
  hasCompleteStaySchedule,
  type BusinessSettingsDto,
  type BusinessSettingsModuleUpdateInput,
  type BusinessSettingsUpdateInput,
  type SettingsModule,
} from "./schemas";

const BYTES_PER_MB = 1024 * 1024;

const SETTINGS_SELECT = {
  id: true,
  version: true,
  businessName: true,
  businessPhone: true,
  businessAddress: true,
  tin: true,
  billingDayOfMonth: true,
  gracePeriodDays: true,
  prorationPolicy: true,
  depositPolicy: true,
  overpaymentPolicy: true,
  invoicePrefix: true,
  receiptPrefix: true,
  checkInTimeManila: true,
  checkOutTimeManila: true,
  transientPolicyNote: true,
  smsOverdueEnabled: true,
  smsOverdueFrequencyDays: true,
  smsOverdueSendTimeManila: true,
  smsApiKeyEncrypted: true,
  smsApiKeyLast4: true,
  smsSenderName: true,
  smsOverdueTemplate: true,
  offlineUnlockMaxDays: true,
  proofMaxBytes: true,
  proofMaxFilesPerRecord: true,
  updatedAt: true,
} as const;

const INITIAL_CREATE_DEFAULTS: Omit<
  Prisma.BusinessSettingsUncheckedCreateInput,
  "id" | "ownerUserId" | "version" | "createdAt" | "updatedAt"
> = {
  businessName: "",
  businessPhone: null,
  businessAddress: null,
  tin: null,
  billingDayOfMonth: null,
  gracePeriodDays: null,
  prorationPolicy: null,
  depositPolicy: null,
  overpaymentPolicy: null,
  invoicePrefix: null,
  receiptPrefix: null,
  checkInTimeManila: null,
  checkOutTimeManila: null,
  transientPolicyNote: null,
  smsOverdueEnabled: false,
  smsOverdueFrequencyDays: 1,
  smsOverdueSendTimeManila: "09:00",
  smsApiKeyEncrypted: null,
  smsApiKeyLast4: null,
  smsSenderName: null,
  smsOverdueTemplate: null,
  offlineUnlockMaxDays: 7,
  proofMaxBytes: 5 * BYTES_PER_MB,
  proofMaxFilesPerRecord: 5,
};

function toSettingsDto(row: {
  id: string;
  version: number;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  tin: string | null;
  billingDayOfMonth: number | null;
  gracePeriodDays: number | null;
  prorationPolicy: BusinessSettingsDto["prorationPolicy"];
  depositPolicy: BusinessSettingsDto["depositPolicy"];
  overpaymentPolicy: BusinessSettingsDto["overpaymentPolicy"];
  invoicePrefix: string | null;
  receiptPrefix: string | null;
  checkInTimeManila: string | null;
  checkOutTimeManila: string | null;
  transientPolicyNote: string | null;
  smsOverdueEnabled: boolean;
  smsOverdueFrequencyDays: number;
  smsOverdueSendTimeManila: string;
  smsApiKeyEncrypted: string | null;
  smsApiKeyLast4: string | null;
  smsSenderName: string | null;
  smsOverdueTemplate: string | null;
  offlineUnlockMaxDays: number;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
  updatedAt: Date;
}): BusinessSettingsDto {
  return {
    id: row.id,
    version: row.version,
    businessName: row.businessName,
    businessPhone: row.businessPhone,
    businessAddress: row.businessAddress,
    tin: row.tin,
    billingDayOfMonth: row.billingDayOfMonth,
    gracePeriodDays: row.gracePeriodDays,
    prorationPolicy: row.prorationPolicy,
    depositPolicy: row.depositPolicy,
    overpaymentPolicy: row.overpaymentPolicy,
    invoicePrefix: row.invoicePrefix,
    receiptPrefix: row.receiptPrefix,
    checkInTimeManila: row.checkInTimeManila,
    checkOutTimeManila: row.checkOutTimeManila,
    transientPolicyNote: row.transientPolicyNote,
    smsOverdueEnabled: row.smsOverdueEnabled,
    smsOverdueFrequencyDays: row.smsOverdueFrequencyDays,
    smsOverdueSendTimeManila: row.smsOverdueSendTimeManila,
    smsApiKeyConfigured: Boolean(row.smsApiKeyEncrypted),
    smsApiKeyLast4: row.smsApiKeyEncrypted ? row.smsApiKeyLast4 : null,
    smsSenderName: row.smsSenderName,
    smsOverdueTemplate: row.smsOverdueTemplate,
    offlineUnlockMaxDays: row.offlineUnlockMaxDays,
    proofMaxBytes: row.proofMaxBytes,
    proofMaxFilesPerRecord: row.proofMaxFilesPerRecord,
    updatedAt: row.updatedAt.toISOString(),
    policiesComplete: hasCompleteFinancialPolicies(row),
    stayScheduleComplete: hasCompleteStaySchedule(row),
  };
}

export async function getBusinessSettings(
  ownerUserId: string,
): Promise<BusinessSettingsDto> {
  const row = await getDatabase().businessSettings.findUnique({
    where: { ownerUserId },
    select: SETTINGS_SELECT,
  });

  if (!row) {
    return {
      id: null,
      version: 0,
      businessName: "",
      businessPhone: null,
      businessAddress: null,
      tin: null,
      billingDayOfMonth: null,
      gracePeriodDays: null,
      prorationPolicy: null,
      depositPolicy: null,
      overpaymentPolicy: null,
      invoicePrefix: null,
      receiptPrefix: null,
      checkInTimeManila: null,
      checkOutTimeManila: null,
      transientPolicyNote: null,
      smsOverdueEnabled: false,
      smsOverdueFrequencyDays: 1,
      smsOverdueSendTimeManila: "09:00",
      smsApiKeyConfigured: false,
      smsApiKeyLast4: null,
      smsSenderName: null,
      smsOverdueTemplate: null,
      offlineUnlockMaxDays: 7,
      proofMaxBytes: 5 * BYTES_PER_MB,
      proofMaxFilesPerRecord: 5,
      updatedAt: null,
      policiesComplete: false,
      stayScheduleComplete: false,
    };
  }

  return toSettingsDto(row);
}

type PersistedSettingsWriteData = Partial<typeof INITIAL_CREATE_DEFAULTS>;

function buildModuleWriteData(
  input: z.output<typeof BusinessSettingsModuleUpdateSchema>,
): PersistedSettingsWriteData {
  switch (input.module) {
    case "profile":
      return {
        businessName: input.businessName,
        businessPhone: input.businessPhone,
        businessAddress: input.businessAddress,
        tin: input.tin,
      };
    case "policies":
      return {
        billingDayOfMonth: input.billingDayOfMonth,
        gracePeriodDays: input.gracePeriodDays,
        prorationPolicy: input.prorationPolicy,
        depositPolicy: input.depositPolicy,
        overpaymentPolicy: input.overpaymentPolicy,
        invoicePrefix: input.invoicePrefix,
        receiptPrefix: input.receiptPrefix,
      };
    case "operations":
      return {
        checkInTimeManila: input.checkInTimeManila,
        checkOutTimeManila: input.checkOutTimeManila,
        ...(input.transientPolicyNote !== undefined
          ? { transientPolicyNote: input.transientPolicyNote }
          : {}),
        offlineUnlockMaxDays: input.offlineUnlockMaxDays,
        proofMaxBytes: input.proofMaxMb * BYTES_PER_MB,
        proofMaxFilesPerRecord: input.proofMaxFilesPerRecord,
      };
    case "house_rules":
      return {
        transientPolicyNote: input.transientPolicyNote,
      };
    case "sms": {
      const next: PersistedSettingsWriteData = {
        smsOverdueEnabled: input.smsOverdueEnabled,
        smsOverdueFrequencyDays: input.smsOverdueFrequencyDays,
        smsOverdueSendTimeManila: input.smsOverdueSendTimeManila,
        smsSenderName: input.smsSenderName,
        smsOverdueTemplate: input.smsOverdueTemplate,
      };
      if (input.clearSmsApiKey) {
        next.smsApiKeyEncrypted = null;
        next.smsApiKeyLast4 = null;
      } else if (input.smsApiKey) {
        next.smsApiKeyEncrypted = encryptAppSecret(input.smsApiKey);
        next.smsApiKeyLast4 = maskSecretLast4(input.smsApiKey);
      }
      return next;
    }
  }
}

async function persistSettingsChange(
  ownerUserId: string,
  expectedVersion: number,
  data: PersistedSettingsWriteData,
  auditModule?: SettingsModule,
): Promise<BusinessSettingsDto> {
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await ensureOwnerRecord(tx, ownerUserId);

      let saved;
      if (expectedVersion === 0) {
        saved = await tx.businessSettings.create({
          data: {
            ownerUserId,
            version: 1,
            ...INITIAL_CREATE_DEFAULTS,
            ...data,
          },
          select: SETTINGS_SELECT,
        });
      } else {
        const updated = await tx.businessSettings.updateMany({
          where: {
            ownerUserId,
            version: expectedVersion,
          },
          data: {
            version: { increment: 1 },
            ...data,
          },
        });

        if (updated.count === 0) {
          throw new ConflictError(
            "Settings were updated elsewhere. Reload the latest values before saving.",
          );
        }

        saved = await tx.businessSettings.findUniqueOrThrow({
          where: { ownerUserId },
          select: SETTINGS_SELECT,
        });
      }

      const dto = toSettingsDto(saved);
      await writeAuditEntry(tx, {
        ownerUserId,
        area: "settings",
        action: "settings.updated",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "business_settings",
        entityId: saved.id,
        metadata: {
          ...(auditModule ? { module: auditModule } : {}),
          version: saved.version,
          policiesComplete: dto.policiesComplete,
        },
      });

      return dto;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError(
        "Settings were created concurrently. Reload the page and save again.",
      );
    }
    throw error;
  }
}

/**
 * Updates or creates a single Settings module independently without validating
 * or overwriting columns owned by the other Settings modules.
 */
export async function updateBusinessSettingsModule(
  ownerUserId: string,
  rawInput: BusinessSettingsModuleUpdateInput,
): Promise<BusinessSettingsDto> {
  const parsed = BusinessSettingsModuleUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check settings values and try again.",
    );
  }
  const input = parsed.data;
  if (input.module === "sms" && input.smsOverdueEnabled) {
    const existing = await getDatabase().businessSettings.findUnique({
      where: { ownerUserId },
      select: { smsApiKeyEncrypted: true },
    });
    const willHaveApiKey =
      !input.clearSmsApiKey &&
      (Boolean(input.smsApiKey) || Boolean(existing?.smsApiKeyEncrypted));
    if (!willHaveApiKey) {
      throw new ValidationError(
        "Enter your Semaphore API key before enabling automatic overdue SMS reminders.",
      );
    }
  }
  return persistSettingsChange(
    ownerUserId,
    input.expectedVersion,
    buildModuleWriteData(input),
    input.module,
  );
}

/**
 * Updates or creates BusinessSettings atomically with an integer-version
 * precondition and writes an identifier-only audit record in the transaction.
 */
export async function updateBusinessSettings(
  ownerUserId: string,
  rawInput: BusinessSettingsUpdateInput,
): Promise<BusinessSettingsDto> {
  const parsed = BusinessSettingsUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check settings values and try again.",
    );
  }
  const input = parsed.data;
  return persistSettingsChange(ownerUserId, input.expectedVersion, {
    businessName: input.businessName,
    businessPhone: input.businessPhone,
    businessAddress: input.businessAddress,
    tin: input.tin,
    billingDayOfMonth: input.billingDayOfMonth,
    gracePeriodDays: input.gracePeriodDays,
    prorationPolicy: input.prorationPolicy,
    depositPolicy: input.depositPolicy,
    overpaymentPolicy: input.overpaymentPolicy,
    invoicePrefix: input.invoicePrefix,
    receiptPrefix: input.receiptPrefix,
    checkInTimeManila: input.checkInTimeManila,
    checkOutTimeManila: input.checkOutTimeManila,
    offlineUnlockMaxDays: input.offlineUnlockMaxDays,
    proofMaxBytes: input.proofMaxMb * BYTES_PER_MB,
    proofMaxFilesPerRecord: input.proofMaxFilesPerRecord,
  });
}
