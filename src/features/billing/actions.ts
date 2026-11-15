"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  AddInvoiceAdjustmentSchema,
  CreateManualInvoiceSchema,
  GeneratePeriodInvoicesSchema,
  IssueInvoiceSchema,
  VoidInvoiceSchema,
  type CreateManualInvoiceInput,
} from "./schemas";
import {
  addInvoiceAdjustment,
  createManualInvoice,
  generatePeriodInvoices,
  issueDraftInvoice,
  voidInvoice,
} from "./service";

export type BillingActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string; invoiceId?: string }
  | {
      status: "error";
      message: string;
      fieldErrors: Record<string, string>;
    };

function readStr(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val : "";
}

function mapZodErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function handleActionError(
  error: unknown,
  fallback: string,
): BillingActionResult {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  return { status: "error", message: fallback, fieldErrors: {} };
}

function revalidateBillingPaths(
  tenantId?: string | null,
  transientGuestId?: string | null,
  invoiceId?: string | null,
) {
  revalidatePath("/billing");
  revalidatePath("/billing", "layout");
  if (invoiceId) {
    revalidatePath(`/billing/${invoiceId}`);
  }
  revalidatePath("/payments");
  revalidatePath("/payments/new");
  revalidatePath("/tenants");
  if (tenantId) {
    revalidatePath(`/tenants/${tenantId}`);
  }
  if (transientGuestId || !tenantId) {
    revalidatePath("/transients");
  }
  revalidatePath("/audit");
  revalidatePath("/");
}

export async function generatePeriodInvoicesAction(
  _prev: BillingActionResult,
  formData: FormData,
): Promise<BillingActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = GeneratePeriodInvoicesSchema.safeParse({
      billingPeriod: readStr(formData, "billingPeriod"),
      issueImmediately: formData.get("issueImmediately") === "on",
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the billing period before generating.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const summary = await generatePeriodInvoices(ownerUserId, parsed.data);
    revalidateBillingPaths();

    if (summary.createdCount === 0) {
      return {
        status: "saved",
        message: `No new invoices needed for ${summary.billingPeriod} (${summary.skippedExistingCount} already exist).`,
      };
    }

    return {
      status: "saved",
      message: `Generated ${summary.createdCount} ${
        summary.createdCount === 1 ? "invoice" : "invoices"
      } for ${summary.billingPeriod}${
        summary.issuedCount > 0 ? ` (${summary.issuedCount} issued)` : ""
      }.`,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Could not generate period invoices right now.",
    );
  }
}

export async function createManualInvoiceAction(
  rawInput: CreateManualInvoiceInput,
): Promise<BillingActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = CreateManualInvoiceSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ??
          "Review the invoice fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const created = await createManualInvoice(ownerUserId, parsed.data);
    revalidateBillingPaths(
      created.tenantId,
      created.transientGuestId,
      created.id,
    );
    return {
      status: "saved",
      message: created.invoiceNumber
        ? `Invoice ${created.invoiceNumber} created and issued.`
        : "Draft invoice created.",
      invoiceId: created.id,
    };
  } catch (error) {
    return handleActionError(error, "Could not create invoice right now.");
  }
}

export async function issueDraftInvoiceAction(rawInput: {
  invoiceId: string;
  expectedVersion: number;
}): Promise<BillingActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = IssueInvoiceSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid invoice issue request.",
        fieldErrors: {},
      };
    }

    const issued = await issueDraftInvoice(ownerUserId, parsed.data);
    revalidateBillingPaths(issued.tenantId, issued.transientGuestId, issued.id);
    return {
      status: "saved",
      message: `Issued invoice ${issued.invoiceNumber ?? ""}.`.trim(),
      invoiceId: issued.id,
    };
  } catch (error) {
    return handleActionError(error, "Could not issue invoice right now.");
  }
}

export async function addInvoiceAdjustmentAction(
  _prev: BillingActionResult,
  formData: FormData,
): Promise<BillingActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = AddInvoiceAdjustmentSchema.safeParse({
      invoiceId: readStr(formData, "invoiceId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      type: readStr(formData, "type"),
      amount: readStr(formData, "amount"),
      reason: readStr(formData, "reason"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the adjustment details before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const updated = await addInvoiceAdjustment(ownerUserId, parsed.data);
    revalidateBillingPaths(
      updated.tenantId,
      updated.transientGuestId,
      updated.id,
    );
    return {
      status: "saved",
      message: "Invoice adjustment recorded.",
      invoiceId: updated.id,
    };
  } catch (error) {
    return handleActionError(error, "Could not record adjustment right now.");
  }
}

export async function voidInvoiceAction(
  _prev: BillingActionResult,
  formData: FormData,
): Promise<BillingActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = VoidInvoiceSchema.safeParse({
      invoiceId: readStr(formData, "invoiceId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      reason: readStr(formData, "reason"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Enter a reason before voiding this invoice.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const voided = await voidInvoice(ownerUserId, parsed.data);
    revalidateBillingPaths(voided.tenantId, voided.transientGuestId, voided.id);
    return {
      status: "saved",
      message: "Invoice voided.",
      invoiceId: voided.id,
    };
  } catch (error) {
    return handleActionError(error, "Could not void invoice right now.");
  }
}
