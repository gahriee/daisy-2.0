import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, ValidationError } from "@/lib/errors";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { getDatabase } from "@/server/db/client";
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
  input: BusinessSettingsModuleUpdateInput,
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
        offlineUnlockMaxDays: input.offlineUnlockMaxDays,
        proofMaxBytes: input.proofMaxMb * BYTES_PER_MB,
        proofMaxFilesPerRecord: input.proofMaxFilesPerRecord,
      };
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
