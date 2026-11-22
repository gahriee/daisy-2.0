"use server";

import { revalidatePath } from "next/cache";
import { formatManilaDate, toManilaDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import type { CreateNoticeInput, UpdateNoticeInput } from "./schemas";
import {
  archiveNotice,
  createNotice,
  restoreNotice,
  sendNoticeSms,
  updateNotice,
} from "./service";

export type NoticeActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string; noticeId?: string }
  | { status: "error"; message: string; fieldErrors: Record<string, string> };

function handleNoticeActionError(
  error: unknown,
  fallback: string,
): NoticeActionResult {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  if (error instanceof Error && error.message) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  return { status: "error", message: fallback, fieldErrors: {} };
}

function revalidateNoticePaths() {
  revalidatePath("/notices");
  revalidatePath("/audit");
}

function readOptionalString(
  formData: FormData,
  key: string,
): string | null | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNoticeFieldsFromForm(
  formData: FormData,
  mode: "create" | "update",
) {
  const audience = String(
    formData.get("audience") ?? "EVERYONE",
  ) as CreateNoticeInput["audience"];
  const roomId = readOptionalString(formData, "roomId");
  const tenantId = readOptionalString(formData, "tenantId");
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const startDateManila = String(formData.get("startDateManila") ?? "");
  const endDateManila = String(formData.get("endDateManila") ?? "");

  const base: CreateNoticeInput = {
    audience,
    ...(roomId !== undefined ? { roomId } : {}),
    ...(tenantId !== undefined ? { tenantId } : {}),
    title,
    body,
    startDateManila,
    endDateManila,
  };

  if (mode === "update") {
    const updateInput: UpdateNoticeInput = {
      ...base,
      noticeId: String(formData.get("noticeId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion") ?? 0),
    };
    return updateInput;
  }

  return base;
}

/**
 * Server Action creating a tenant/room/property-wide notice online-only.
 */
export async function createNoticeAction(
  _prevState: NoticeActionResult,
  formData: FormData,
): Promise<NoticeActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const input = parseNoticeFieldsFromForm(
      formData,
      "create",
    ) as CreateNoticeInput;
    const saved = await createNotice(ownerUserId, input);
    const todayManila = toManilaDate(new Date());
    let message: string;
    if (saved.startDateManila > todayManila) {
      message = `Notice scheduled. It will be texted automatically on ${formatManilaDate(saved.startDateManila)}.`;
    } else {
      try {
        const summary = await sendNoticeSms(ownerUserId, {
          noticeId: saved.id,
        });
        message = formatNoticeSmsSummaryMessage(summary, true);
      } catch (smsError) {
        const reason =
          smsError instanceof AppError
            ? smsError.message
            : "Could not send text right now.";
        message = `Notice saved, but text was not sent: ${reason}`;
      }
    }
    revalidateNoticePaths();
    return {
      status: "saved",
      message,
      noticeId: saved.id,
    };
  } catch (error) {
    return handleNoticeActionError(error, "Unable to publish notice.");
  }
}

/**
 * Server Action updating an active/scheduled notice with optimistic locking.
 */
export async function updateNoticeAction(
  _prevState: NoticeActionResult,
  formData: FormData,
): Promise<NoticeActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const input = parseNoticeFieldsFromForm(
      formData,
      "update",
    ) as UpdateNoticeInput;
    const saved = await updateNotice(ownerUserId, input);
    revalidateNoticePaths();
    return {
      status: "saved",
      message: "Notice updated.",
      noticeId: saved.id,
    };
  } catch (error) {
    return handleNoticeActionError(error, "Unable to update notice.");
  }
}

/**
 * Server Action soft-archiving a notice.
 */
export async function archiveNoticeAction(input: {
  noticeId: string;
  expectedVersion: number;
}): Promise<NoticeActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const saved = await archiveNotice(ownerUserId, input);
    revalidateNoticePaths();
    return {
      status: "saved",
      message: "Notice archived.",
      noticeId: saved.id,
    };
  } catch (error) {
    return handleNoticeActionError(error, "Unable to archive notice.");
  }
}

function formatNoticeSmsSummaryMessage(
  summary: {
    sentCount: number;
    failedCount: number;
    skippedNoPhoneCount: number;
  },
  afterSave = false,
): string {
  const prefix = afterSave ? "Notice saved and texted" : "Text sent";
  if (summary.sentCount === 0 && summary.failedCount === 0) {
    return afterSave
      ? "Notice saved, but none of the selected tenants have a valid mobile number on file."
      : "No text sent — none of the selected tenants have a valid mobile number on file.";
  }
  const parts: string[] = [];
  if (summary.sentCount > 0) {
    parts.push(
      `${prefix} to ${summary.sentCount} ${summary.sentCount === 1 ? "tenant" : "tenants"}`,
    );
  }
  if (summary.failedCount > 0) {
    parts.push(`${summary.failedCount} failed`);
  }
  if (summary.skippedNoPhoneCount > 0) {
    parts.push(`${summary.skippedNoPhoneCount} without a mobile number`);
  }
  return `${parts.join(" · ")}.`;
}

/**
 * Server Action texting an unarchived notice to its audience via Semaphore.
 */
export async function sendNoticeSmsAction(input: {
  noticeId: string;
}): Promise<NoticeActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const summary = await sendNoticeSms(ownerUserId, input);
    revalidateNoticePaths();
    if (summary.sentCount === 0 && summary.failedCount > 0) {
      return {
        status: "error",
        message:
          "Semaphore could not deliver the text right now. Check your Semaphore account and credits.",
        fieldErrors: {},
      };
    }
    return {
      status: "saved",
      message: formatNoticeSmsSummaryMessage(summary),
      noticeId: summary.noticeId,
    };
  } catch (error) {
    return handleNoticeActionError(
      error,
      "Could not send text notice right now.",
    );
  }
}

/**
 * Server Action restoring an archived notice.
 */
export async function restoreNoticeAction(input: {
  noticeId: string;
  expectedVersion: number;
}): Promise<NoticeActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const saved = await restoreNotice(ownerUserId, input);
    revalidateNoticePaths();
    return {
      status: "saved",
      message: "Notice restored.",
      noticeId: saved.id,
    };
  } catch (error) {
    return handleNoticeActionError(error, "Unable to restore notice.");
  }
}
