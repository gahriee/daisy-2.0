"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import { getDatabase } from "@/server/db/client";
import {
  resolveOwnerSmtpConfig,
  sendTestSmtpEmailSafe,
} from "@/server/mail/booking-mailer";
import { writeAuditEntry } from "@/server/sync/publish";
import {
  BusinessSettingsModuleUpdateSchema,
  type BusinessSettingsDto,
  type SettingsModule,
} from "./schemas";
import { getBusinessSettings, updateBusinessSettingsModule } from "./service";

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

function readNullableFloat(formData: FormData, key: string): number | null {
  const trimmed = readString(formData, key).trim();
  if (trimmed === "") return null;
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
        businessLatitude: readNullableFloat(formData, "businessLatitude"),
        businessLongitude: readNullableFloat(formData, "businessLongitude"),
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
    case "house_rules":
      return {
        module: "house_rules",
        expectedVersion,
        transientPolicyNote: readNullableString(
          formData,
          "transientPolicyNote",
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
    case "email":
      return {
        module: "email",
        expectedVersion,
        smtpEnabled: formData.get("smtpEnabled") === "on",
        smtpHost: readNullableString(formData, "smtpHost") ?? "smtp.gmail.com",
        smtpPort: readNullableInt(formData, "smtpPort") ?? 587,
        smtpSecure: formData.get("smtpSecure") === "true",
        smtpUser: readNullableString(formData, "smtpUser"),
        smtpPass: readNullableString(formData, "smtpPass"),
        clearSmtpPass: formData.get("clearSmtpPass") === "on",
        smtpFromName: readNullableString(formData, "smtpFromName"),
        smtpFromEmail: readNullableString(formData, "smtpFromEmail"),
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
    case "house_rules":
      return "House rules saved and published to /book.";
    case "sms":
      return updated.smsOverdueEnabled
        ? "Overdue SMS settings saved and enabled."
        : "Overdue SMS settings saved.";
    case "email":
      return updated.smtpEnabled
        ? "Email settings saved and enabled."
        : "Email settings saved.";
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
        rawModule === "house_rules" ||
        rawModule === "sms" ||
        rawModule === "email"
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

export type TestEmailActionResult =
  { status: "sent"; message: string } | { status: "error"; message: string };

export async function sendTestEmailAction(
  recipientEmail: string,
): Promise<TestEmailActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const cleaned = recipientEmail.trim().toLowerCase();
    if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      return {
        status: "error",
        message: "Enter a valid email address to receive the test email.",
      };
    }

    const [settings, smtpConfig] = await Promise.all([
      getBusinessSettings(ownerUserId),
      resolveOwnerSmtpConfig(ownerUserId),
    ]);

    if (!smtpConfig) {
      return {
        status: "error",
        message:
          "Save and turn on your email server settings first before sending a test email.",
      };
    }

    const appOrigin =
      process.env.APP_ORIGIN?.trim().replace(/\/+$/, "") ||
      "http://localhost:3000";
    const outcome = await sendTestSmtpEmailSafe({
      toEmail: cleaned,
      propertyName: settings.businessName || "Daisy Residences",
      propertyAddress: settings.businessAddress,
      propertyLatitude: settings.businessLatitude,
      propertyLongitude: settings.businessLongitude,
      contactPhone: settings.businessPhone,
      checkInTimeLabel: settings.checkInTimeManila ?? "2:00 PM",
      checkOutTimeLabel: settings.checkOutTimeManila ?? "12:00 PM",
      trackUrl: `${appOrigin}/book#track`,
      smtpConfig,
    });

    if (outcome.status !== "sent") {
      return {
        status: "error",
        message: outcome.reason,
      };
    }

    await getDatabase().$transaction(async (tx) => {
      await writeAuditEntry(tx, {
        ownerUserId,
        area: "settings",
        action: "settings.email_test_sent",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "business_settings",
        entityId: settings.id ?? ownerUserId,
        metadata: {
          host: smtpConfig.host,
          port: smtpConfig.port,
        },
      });
    });

    return {
      status: "sent",
      message: `Test email sent to ${cleaned}. Check your inbox (and spam folder).`,
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message:
        "Could not send a test email right now. Check your SMTP details.",
    };
  }
}
