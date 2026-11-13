import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, ValidationError } from "@/lib/errors";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { getDatabase } from "@/server/db/client";
import { writeAuditEntry } from "@/server/sync/publish";
import {
  BusinessSettingsUpdateSchema,
  hasCompleteFinancialPolicies,
  type BusinessSettingsDto,
  type BusinessSettingsUpdateInput,
} from "./schemas";

const BYTES_PER_MB = 1024 * 1024;

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
  };
}

export async function getBusinessSettings(
  ownerUserId: string,
): Promise<BusinessSettingsDto> {
  const row = await getDatabase().businessSettings.findUnique({
    where: { ownerUserId },
    select: {
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
    },
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
    };
  }

  return toSettingsDto(row);
}

/**
 * Updates or creates BusinessSettings with an atomic integer-version precondition
 * and writes an identifier-only audit record in the same database transaction.
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
  const proofMaxBytes = input.proofMaxMb * BYTES_PER_MB;
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await ensureOwnerRecord(tx, ownerUserId);

      let saved;
      if (input.expectedVersion === 0) {
        saved = await tx.businessSettings.create({
          data: {
            ownerUserId,
            version: 1,
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
            proofMaxBytes,
            proofMaxFilesPerRecord: input.proofMaxFilesPerRecord,
          },
          select: {
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
          },
        });
      } else {
        const updated = await tx.businessSettings.updateMany({
          where: {
            ownerUserId,
            version: input.expectedVersion,
          },
          data: {
            version: { increment: 1 },
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
            proofMaxBytes,
            proofMaxFilesPerRecord: input.proofMaxFilesPerRecord,
          },
        });

        if (updated.count === 0) {
          throw new ConflictError(
            "Settings were updated elsewhere. Reload the latest values before saving.",
          );
        }

        saved = await tx.businessSettings.findUniqueOrThrow({
          where: { ownerUserId },
          select: {
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
          },
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
