"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import { sendOverdueSmsBatch, sendOverdueSmsForInvoice } from "./service";

export type OverdueSmsActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

export async function sendOverdueSmsForInvoiceAction(input: {
  invoiceId: string;
}): Promise<OverdueSmsActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const result = await sendOverdueSmsForInvoice(ownerUserId, {
      invoiceId: input.invoiceId,
      forceResendToday: false,
    });
    revalidatePath("/billing");
    revalidatePath(`/billing/${input.invoiceId}`);
    revalidatePath("/audit");

    if (result.alreadySentToday) {
      return {
        status: "saved",
        message:
          "An overdue SMS reminder was already sent for this invoice today.",
      };
    }

    return {
      status: "saved",
      message: "Overdue SMS reminder sent.",
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: "Could not send overdue SMS right now. Try again.",
    };
  }
}

export async function sendOverdueSmsBatchAction(): Promise<OverdueSmsActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const summary = await sendOverdueSmsBatch(ownerUserId, {
      requireEnabled: false,
    });
    revalidatePath("/billing");
    revalidatePath("/audit");

    if (summary.evaluatedCount === 0) {
      return {
        status: "saved",
        message: "No overdue boarding house invoices to notify.",
      };
    }

    const parts: string[] = [];
    if (summary.sentCount > 0) {
      parts.push(
        `Sent ${summary.sentCount} overdue SMS reminder${summary.sentCount === 1 ? "" : "s"}`,
      );
    }
    if (summary.alreadySentTodayCount > 0) {
      parts.push(`${summary.alreadySentTodayCount} already sent today`);
    }
    if (summary.skippedNoPhoneCount + summary.skippedInvalidPhoneCount > 0) {
      const skipped =
        summary.skippedNoPhoneCount + summary.skippedInvalidPhoneCount;
      parts.push(`${skipped} skipped (missing or invalid mobile number)`);
    }
    if (summary.failedCount > 0) {
      parts.push(`${summary.failedCount} failed`);
    }

    if (summary.sentCount === 0 && summary.failedCount > 0) {
      return {
        status: "error",
        message: `Overdue SMS delivery failed for ${summary.failedCount} invoice(s). Ask your setup contact to check SMS delivery credits.`,
      };
    }

    return {
      status: "saved",
      message: `${parts.join(" · ")}.`,
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: "Could not send overdue SMS reminders right now. Try again.",
    };
  }
}
