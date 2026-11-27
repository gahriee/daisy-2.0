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

function readRequiredInt(formData: FormData, key: string): number {
  const trimmed = readString(formData, key).trim();
  if (trimmed === "") return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readNullableFloat(formData: FormData, key: string): number | null {
  const trimmed = readString(formData, key).trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildModuleRawInput(formData: FormData, settingsModule: string) {
  const expectedVersion = readRequiredInt(formData, "expectedVersion");

  switch (settingsModule) {
    case "property":
      return {
        module: "property",
        expectedVersion,
        businessName: readString(formData, "businessName"),
        businessPhone: readNullableString(formData, "businessPhone"),
        businessAddress: readNullableString(formData, "businessAddress"),
        businessLatitude: readNullableFloat(formData, "businessLatitude"),
        businessLongitude: readNullableFloat(formData, "businessLongitude"),
        tin: readNullableString(formData, "tin"),
        checkInTimeManila: readString(formData, "checkInTimeManila"),
        checkOutTimeManila: readString(formData, "checkOutTimeManila"),
        smsOverdueEnabled: formData.get("smsOverdueEnabled") === "on",
        smsOverdueSendTimeManila:
          readString(formData, "smsOverdueSendTimeManila") || "09:00",
      };
    case "house_rules":
      return {
        module: "house_rules",
        expectedVersion,
        transientPolicyNote: readNullableString(
          formData,
          "transientPolicyNote",
        ),
      };
    default:
      return { module: settingsModule, expectedVersion };
  }
}

function formatSavedMessage(settingsModule: SettingsModule): string {
  switch (settingsModule) {
    case "property":
      return "Property and stay settings saved.";
    case "house_rules":
      return "House rules saved and published to /book.";
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
        ...(rawModule === "property" || rawModule === "house_rules"
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
    revalidatePath("/transients/house-rules");
    revalidatePath("/billing");
    revalidatePath("/audit");
    revalidatePath("/book");
    revalidatePath("/book", "layout");

    return {
      status: "saved",
      module: parsed.data.module,
      message: formatSavedMessage(parsed.data.module),
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
