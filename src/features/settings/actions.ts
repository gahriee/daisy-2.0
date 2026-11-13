"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  BusinessSettingsUpdateSchema,
  type BusinessSettingsDto,
} from "./schemas";
import { updateBusinessSettings } from "./service";

export type SaveSettingsActionState =
  | { status: "idle" }
  | {
      status: "saved";
      message: string;
      settings: BusinessSettingsDto;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: Record<string, string>;
    };

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readNullableString(formData: FormData, key: string): string | null {
  const trimmed = readString(formData, key).trim();
  return trimmed === "" ? null : trimmed;
}

function readNullableInt(formData: FormData, key: string): number | null {
  const trimmed = readString(formData, key).trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readRequiredInt(formData: FormData, key: string): number {
  const trimmed = readString(formData, key).trim();
  if (trimmed === "") return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function saveBusinessSettingsAction(
  _prevState: SaveSettingsActionState,
  formData: FormData,
): Promise<SaveSettingsActionState> {
  try {
    const ownerUserId = await requireOwnerUserId();

    const raw = {
      expectedVersion: readRequiredInt(formData, "expectedVersion"),
      businessName: readString(formData, "businessName"),
      businessPhone: readNullableString(formData, "businessPhone"),
      businessAddress: readNullableString(formData, "businessAddress"),
      tin: readNullableString(formData, "tin"),
      billingDayOfMonth: readNullableInt(formData, "billingDayOfMonth"),
      gracePeriodDays: readNullableInt(formData, "gracePeriodDays"),
      prorationPolicy: readNullableString(formData, "prorationPolicy"),
      depositPolicy: readNullableString(formData, "depositPolicy"),
      overpaymentPolicy: readNullableString(formData, "overpaymentPolicy"),
      invoicePrefix: readNullableString(formData, "invoicePrefix"),
      receiptPrefix: readNullableString(formData, "receiptPrefix"),
      checkInTimeManila: readNullableString(formData, "checkInTimeManila"),
      checkOutTimeManila: readNullableString(formData, "checkOutTimeManila"),
      offlineUnlockMaxDays: readRequiredInt(formData, "offlineUnlockMaxDays"),
      proofMaxMb: readRequiredInt(formData, "proofMaxMb"),
      proofMaxFilesPerRecord: readRequiredInt(
        formData,
        "proofMaxFilesPerRecord",
      ),
    };

    const parsed = BusinessSettingsUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors,
      };
    }

    const updated = await updateBusinessSettings(ownerUserId, parsed.data);
    revalidatePath("/settings");
    revalidatePath("/audit");

    return {
      status: "saved",
      message: updated.policiesComplete
        ? "Settings saved and financial policies configured."
        : "Settings saved. Configure the remaining policies before invoicing or reservations.",
      settings: updated,
    };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: {},
      };
    }
    return {
      status: "error",
      message: "Could not save settings right now. Try again.",
      fieldErrors: {},
    };
  }
}
