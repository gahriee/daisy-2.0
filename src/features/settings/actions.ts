"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  BusinessSettingsModuleUpdateSchema,
  type BusinessSettingsDto,
  type SettingsModule,
} from "./schemas";
import { updateBusinessSettingsModule } from "./service";

export type SaveSettingsActionState =
  | { status: "idle" }
  | {
      status: "saved";
      module: SettingsModule;
      message: string;
      settings: BusinessSettingsDto;
    }
  | {
      status: "error";
      module?: SettingsModule;
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

function buildModuleRawInput(formData: FormData, settingsModule: string) {
  const expectedVersion = readRequiredInt(formData, "expectedVersion");

  switch (settingsModule) {
    case "profile":
      return {
        module: "profile",
        expectedVersion,
        businessName: readString(formData, "businessName"),
        businessPhone: readNullableString(formData, "businessPhone"),
        businessAddress: readNullableString(formData, "businessAddress"),
        tin: readNullableString(formData, "tin"),
      };
    case "policies":
      return {
        module: "policies",
        expectedVersion,
        billingDayOfMonth: readNullableInt(formData, "billingDayOfMonth"),
        gracePeriodDays: readNullableInt(formData, "gracePeriodDays"),
        prorationPolicy: readNullableString(formData, "prorationPolicy"),
        depositPolicy: readNullableString(formData, "depositPolicy"),
        overpaymentPolicy: readNullableString(formData, "overpaymentPolicy"),
        invoicePrefix: readNullableString(formData, "invoicePrefix"),
        receiptPrefix: readNullableString(formData, "receiptPrefix"),
      };
    case "operations":
      return {
        module: "operations",
        expectedVersion,
        checkInTimeManila: readNullableString(formData, "checkInTimeManila"),
        checkOutTimeManila: readNullableString(formData, "checkOutTimeManila"),
        offlineUnlockMaxDays: readRequiredInt(formData, "offlineUnlockMaxDays"),
        proofMaxMb: readRequiredInt(formData, "proofMaxMb"),
        proofMaxFilesPerRecord: readRequiredInt(
          formData,
          "proofMaxFilesPerRecord",
        ),
      };
    case "sms":
      return {
        module: "sms",
        expectedVersion,
        smsOverdueEnabled: formData.get("smsOverdueEnabled") === "on",
        smsOverdueFrequencyDays: readRequiredInt(
          formData,
          "smsOverdueFrequencyDays",
        ),
        smsOverdueSendTimeManila: readString(
          formData,
          "smsOverdueSendTimeManila",
        ),
        smsApiKey: readNullableString(formData, "smsApiKey"),
        clearSmsApiKey: formData.get("clearSmsApiKey") === "on",
        smsSenderName: readNullableString(formData, "smsSenderName"),
        smsOverdueTemplate: readNullableString(formData, "smsOverdueTemplate"),
      };
    default:
      return { module: settingsModule, expectedVersion };
  }
}

function formatSavedMessage(
  settingsModule: SettingsModule,
  updated: BusinessSettingsDto,
): string {
  switch (settingsModule) {
    case "profile":
      return "Property profile saved.";
    case "policies":
      return updated.policiesComplete
        ? "Billing & policies saved and configured."
        : "Billing & policies saved. Configure the remaining policy fields before invoicing or payments.";
    case "operations":
      return updated.stayScheduleComplete
        ? "Stays & limits saved and configured."
        : "Stays & limits saved. Set standard check-in and check-out times to complete stay schedule setup.";
    case "sms":
      return updated.smsOverdueEnabled
        ? "Overdue SMS settings saved and enabled."
        : "Overdue SMS settings saved.";
  }
}

export async function saveBusinessSettingsAction(
  _prevState: SaveSettingsActionState,
  formData: FormData,
): Promise<SaveSettingsActionState> {
  const rawModule = readString(formData, "module");
  try {
    const ownerUserId = await requireOwnerUserId();
    const raw = buildModuleRawInput(formData, rawModule);
    const parsed = BusinessSettingsModuleUpdateSchema.safeParse(raw);

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
        ...(rawModule === "profile" ||
        rawModule === "policies" ||
        rawModule === "operations" ||
        rawModule === "sms"
          ? { module: rawModule }
          : {}),
        message: "Review the highlighted fields before saving.",
        fieldErrors,
      };
    }

    const updated = await updateBusinessSettingsModule(
      ownerUserId,
      parsed.data,
    );
    revalidatePath("/", "layout");
    revalidatePath("/settings", "layout");
    revalidatePath("/billing");
    revalidatePath("/audit");

    return {
      status: "saved",
      module: parsed.data.module,
      message: formatSavedMessage(parsed.data.module, updated),
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
