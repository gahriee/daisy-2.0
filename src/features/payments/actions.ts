"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  ApplyTenantCreditSchema,
  RecordPaymentSchema,
  ReversePaymentSchema,
} from "./schemas";
import { applyTenantCredit, recordPayment, reversePayment } from "./service";

export type PaymentActionResult =
  | { status: "idle" }
  | {
      status: "saved";
      message: string;
      paymentId?: string;
      receiptNumber?: string | null;
    }
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
): PaymentActionResult {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  return { status: "error", message: fallback, fieldErrors: {} };
}

function revalidatePaymentPaths(
  tenantId?: string | null,
  transientGuestId?: string | null,
  paymentId?: string | null,
) {
  revalidatePath("/payments");
  revalidatePath("/payments", "layout");
  revalidatePath("/payments/new");
  if (paymentId) {
    revalidatePath(`/payments/${paymentId}`);
  }
  revalidatePath("/billing");
  revalidatePath("/billing", "layout");
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

export async function recordPaymentAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const rawAllocations = readStr(formData, "allocationsJson");
    const rawProofIds = readStr(formData, "proofIntentIdsJson");

    let allocations: unknown = [];
    let proofIntentIds: unknown = [];
    try {
      allocations = rawAllocations ? JSON.parse(rawAllocations) : [];
      proofIntentIds = rawProofIds ? JSON.parse(rawProofIds) : [];
    } catch {
      return {
        status: "error",
        message: "Payment allocation or proof data could not be parsed.",
        fieldErrors: {},
      };
    }

    const paidDateManila = readStr(formData, "paidDateManila");
    const tenantIdRaw = readStr(formData, "tenantId");
    const transientGuestIdRaw = readStr(formData, "transientGuestId");
    const parsed = RecordPaymentSchema.safeParse({
      ...(tenantIdRaw ? { tenantId: tenantIdRaw } : {}),
      ...(transientGuestIdRaw ? { transientGuestId: transientGuestIdRaw } : {}),
      amount: readStr(formData, "amount"),
      method: readStr(formData, "method"),
      ...(paidDateManila ? { paidDateManila } : {}),
      referenceNo: readStr(formData, "referenceNo"),
      notes: readStr(formData, "notes"),
      allocations,
      proofIntentIds,
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted payment fields.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const dto = await recordPayment(ownerUserId, parsed.data);
    revalidatePaymentPaths(dto.tenantId, dto.transientGuestId, dto.id);

    return {
      status: "saved",
      paymentId: dto.id,
      receiptNumber: dto.receiptNumber,
      message: dto.receiptNumber
        ? `Posted payment ${dto.receiptNumber} (PHP ${dto.amount}).`
        : `Posted payment (PHP ${dto.amount}).`,
    };
  } catch (error) {
    return handleActionError(error, "Could not record payment right now.");
  }
}

export async function reversePaymentAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ReversePaymentSchema.safeParse({
      paymentId: readStr(formData, "paymentId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      reason: readStr(formData, "reason"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Provide a reason for reversing this payment.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const result = await reversePayment(ownerUserId, parsed.data);
    revalidatePaymentPaths(
      result.reversedPayment.tenantId,
      result.reversedPayment.transientGuestId,
      result.reversedPayment.id,
    );

    return {
      status: "saved",
      paymentId: result.reversalEntry.id,
      message: `Reversed receipt ${result.reversedPayment.receiptNumber ?? result.reversedPayment.id}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not reverse payment right now.");
  }
}

export async function applyTenantCreditAction(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const invoiceId = readStr(formData, "invoiceId");
    const parsed = ApplyTenantCreditSchema.safeParse({
      tenantId: readStr(formData, "tenantId"),
      ...(invoiceId ? { invoiceId } : {}),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Select a boarder before applying credit.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const res = await applyTenantCredit(ownerUserId, parsed.data);
    revalidatePaymentPaths(parsed.data.tenantId);

    if (res.updatedInvoiceCount === 0) {
      return {
        status: "saved",
        message: "No open invoices or available unallocated credit to apply.",
      };
    }

    return {
      status: "saved",
      message: `Applied PHP ${res.appliedAmount} unallocated credit across ${res.updatedInvoiceCount} ${res.updatedInvoiceCount === 1 ? "invoice" : "invoices"}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not apply credit right now.");
  }
}
