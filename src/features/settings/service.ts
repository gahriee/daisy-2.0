import "server-only";
import { z } from "zod";
import {
  getServerBillingPolicies,
  getServerOperationalLimits,
  getServerSmsConfig,
} from "@/config/business-config";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, ValidationError } from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { writeAuditEntry } from "@/server/sync/publish";
import {
  BusinessSettingsModuleUpdateSchema,
  type BusinessSettingsDto,
  type BusinessSettingsModuleUpdateInput,
  type SettingsModule,
} from "./schemas";

const SETTINGS_SELECT = {
  id: true,
  version: true,
  businessName: true,
  businessPhone: true,
  businessAddress: true,
  businessLatitude: true,
  businessLongitude: true,
  tin: true,
  checkInTimeManila: true,
  checkOutTimeManila: true,
  transientPolicyNote: true,
  smsOverdueEnabled: true,
  smsOverdueSendTimeManila: true,
  updatedAt: true,
} as const;

type PersistedOwnerSettingsRow = {
  id: string;
  version: number;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  businessLatitude: number | null;
  businessLongitude: number | null;
  tin: string | null;
  checkInTimeManila: string | null;
  checkOutTimeManila: string | null;
  transientPolicyNote: string | null;
  smsOverdueEnabled: boolean;
  smsOverdueSendTimeManila: string;
  updatedAt: Date;
};

type PersistedSettingsWriteData = Partial<
  Omit<
    Prisma.BusinessSettingsUncheckedCreateInput,
    "id" | "ownerUserId" | "version" | "createdAt" | "updatedAt"
  >
>;

function toSettingsDto(
  row: PersistedOwnerSettingsRow | null,
): BusinessSettingsDto {
  const policies = getServerBillingPolicies();
  const limits = getServerOperationalLimits();
  const sms = getServerSmsConfig();

  const checkInTimeManila =
    row?.checkInTimeManila ?? limits.defaultCheckInTimeManila;
  const checkOutTimeManila =
    row?.checkOutTimeManila ?? limits.defaultCheckOutTimeManila;

  return {
    id: row?.id ?? null,
    version: row?.version ?? 0,
    businessName: row?.businessName ?? "",
    businessPhone: row?.businessPhone ?? null,
    businessAddress: row?.businessAddress ?? null,
    businessLatitude: row?.businessLatitude ?? null,
    businessLongitude: row?.businessLongitude ?? null,
    tin: row?.tin ?? null,
    billingDayOfMonth: policies.billingDayOfMonth,
    gracePeriodDays: policies.gracePeriodDays,
    prorationPolicy: policies.prorationPolicy,
    depositPolicy: policies.depositPolicy,
    overpaymentPolicy: policies.overpaymentPolicy,
    invoicePrefix: policies.invoicePrefix,
    receiptPrefix: policies.receiptPrefix,
    checkInTimeManila,
    checkOutTimeManila,
    transientPolicyNote: row?.transientPolicyNote ?? null,
    offlineUnlockMaxDays: limits.offlineUnlockMaxDays,
    proofMaxBytes: limits.proofMaxBytes,
    proofMaxFilesPerRecord: limits.proofMaxFilesPerRecord,
    smsConfigured: sms.configured,
    smsOverdueEnabled: row?.smsOverdueEnabled ?? false,
    smsOverdueFrequencyDays: sms.overdueFrequencyDays,
    smsOverdueSendTimeManila: row?.smsOverdueSendTimeManila ?? "09:00",
    updatedAt: row ? row.updatedAt.toISOString() : null,
    policiesComplete: true,
    stayScheduleComplete: true,
  };
}

export async function getBusinessSettings(
  ownerUserId: string,
): Promise<BusinessSettingsDto> {
  const row = await getDatabase().businessSettings.findUnique({
    where: { ownerUserId },
    select: SETTINGS_SELECT,
  });

  return toSettingsDto(row);
}

function buildModuleWriteData(
  input: z.output<typeof BusinessSettingsModuleUpdateSchema>,
): PersistedSettingsWriteData {
  switch (input.module) {
    case "property":
      return {
        businessName: input.businessName,
        businessPhone: input.businessPhone,
        businessAddress: input.businessAddress,
        businessLatitude:
          input.businessLatitude !== null && input.businessLongitude !== null
            ? input.businessLatitude
            : null,
        businessLongitude:
          input.businessLatitude !== null && input.businessLongitude !== null
            ? input.businessLongitude
            : null,
        tin: input.tin,
        checkInTimeManila: input.checkInTimeManila,
        checkOutTimeManila: input.checkOutTimeManila,
        smsOverdueEnabled: input.smsOverdueEnabled,
        smsOverdueSendTimeManila: input.smsOverdueSendTimeManila,
      };
    case "house_rules":
      return {
        transientPolicyNote: input.transientPolicyNote,
      };
  }
}

async function persistSettingsChange(
  ownerUserId: string,
  expectedVersion: number,
  data: PersistedSettingsWriteData,
  auditModule: SettingsModule,
): Promise<BusinessSettingsDto> {
  const db = getDatabase();
  const limits = getServerOperationalLimits();

  try {
    return await db.$transaction(async (tx) => {
      await ensureOwnerRecord(tx, ownerUserId);

      let saved: PersistedOwnerSettingsRow;
      if (expectedVersion === 0) {
        saved = await tx.businessSettings.create({
          data: {
            ownerUserId,
            version: 1,
            businessName: "",
            businessPhone: null,
            businessAddress: null,
            businessLatitude: null,
            businessLongitude: null,
            tin: null,
            checkInTimeManila: limits.defaultCheckInTimeManila,
            checkOutTimeManila: limits.defaultCheckOutTimeManila,
            transientPolicyNote: null,
            smsOverdueEnabled: false,
            smsOverdueSendTimeManila: "09:00",
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
          module: auditModule,
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
 * Updates Owner-editable settings (`property` or `house_rules`) atomically
 * with an integer-version precondition and identifier-only audit entry.
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
  if (input.module === "property" && input.smsOverdueEnabled) {
    if (!getServerSmsConfig().configured) {
      throw new ValidationError(
        "Automatic texting is not connected yet. Ask your setup contact to turn on SMS delivery first.",
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
