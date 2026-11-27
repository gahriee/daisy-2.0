"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import { notifyOwnerPushSafe } from "@/server/notifications/web-push";
import type {
  AddMaintenanceUpdateInput,
  CreateMaintenanceRequestInput,
  PlaceMaintenanceHoldInput,
  ReleaseMaintenanceHoldInput,
} from "./schemas";
import {
  addMaintenanceUpdate,
  archiveMaintenanceRequest,
  createMaintenanceRequest,
  placeMaintenanceHold,
  releaseMaintenanceHold,
  restoreMaintenanceRequest,
} from "./service";

export type MaintenanceActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string; requestId?: string }
  | { status: "error"; message: string; fieldErrors: Record<string, string> };

function handleActionError(
  error: unknown,
  fallback: string,
): MaintenanceActionResult {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  if (error instanceof Error && error.message) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  return { status: "error", message: fallback, fieldErrors: {} };
}

function revalidateMaintenancePaths(requestId?: string) {
  revalidatePath("/maintenance", "layout");
  revalidatePath("/maintenance");
  if (requestId) {
    revalidatePath(`/maintenance/${requestId}`);
  }
  revalidatePath("/rooms", "layout");
  revalidatePath("/rooms");
  revalidatePath("/tenants");
  revalidatePath("/transients");
  revalidatePath("/transients", "layout");
  revalidatePath("/transients/stays");
  revalidatePath("/transients/rooms");
  revalidatePath("/notifications");
  revalidatePath("/audit");
  revalidatePath("/book");
  revalidatePath("/");
}

export async function createMaintenanceRequestAction(
  rawInput: CreateMaintenanceRequestInput,
): Promise<MaintenanceActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await createMaintenanceRequest(ownerUserId, rawInput);
    revalidateMaintenancePaths(dto.id);
    if (dto.priority === "URGENT") {
      void notifyOwnerPushSafe(ownerUserId, {
        title: "Urgent maintenance logged",
        body: `Room ${dto.roomNumber} needs urgent attention.`,
        url: `/maintenance/${dto.id}`,
        tag: `maintenance-${dto.id}`,
      });
    }
    return {
      status: "saved",
      requestId: dto.id,
      message: `Logged maintenance request for Room ${dto.roomNumber}.`,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Could not log maintenance request right now.",
    );
  }
}

export async function addMaintenanceUpdateAction(
  rawInput: AddMaintenanceUpdateInput,
): Promise<MaintenanceActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await addMaintenanceUpdate(ownerUserId, rawInput);
    revalidateMaintenancePaths(dto.id);
    return {
      status: "saved",
      requestId: dto.id,
      message: "Added maintenance update.",
    };
  } catch (error) {
    return handleActionError(error, "Could not update maintenance request.");
  }
}

export async function placeMaintenanceHoldAction(
  rawInput: PlaceMaintenanceHoldInput,
): Promise<MaintenanceActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await placeMaintenanceHold(ownerUserId, rawInput);
    revalidateMaintenancePaths(dto.id);
    return {
      status: "saved",
      requestId: dto.id,
      message: `Placed maintenance hold on Room ${dto.roomNumber}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not place maintenance hold.");
  }
}

export async function releaseMaintenanceHoldAction(
  rawInput: ReleaseMaintenanceHoldInput,
): Promise<MaintenanceActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await releaseMaintenanceHold(ownerUserId, rawInput);
    revalidateMaintenancePaths(dto.id);
    return {
      status: "saved",
      requestId: dto.id,
      message: `Released active maintenance hold on Room ${dto.roomNumber}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not release maintenance hold.");
  }
}

export async function archiveMaintenanceRequestAction(rawInput: {
  requestId: string;
  expectedVersion: number;
}): Promise<MaintenanceActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await archiveMaintenanceRequest(ownerUserId, rawInput);
    revalidateMaintenancePaths(dto.id);
    return {
      status: "saved",
      requestId: dto.id,
      message: "Archived maintenance request.",
    };
  } catch (error) {
    return handleActionError(error, "Could not archive maintenance request.");
  }
}

export async function restoreMaintenanceRequestAction(rawInput: {
  requestId: string;
  expectedVersion: number;
}): Promise<MaintenanceActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await restoreMaintenanceRequest(ownerUserId, rawInput);
    revalidateMaintenancePaths(dto.id);
    return {
      status: "saved",
      requestId: dto.id,
      message: "Restored maintenance request.",
    };
  } catch (error) {
    return handleActionError(error, "Could not restore maintenance request.");
  }
}

export async function bulkArchiveMaintenanceRequestsAction(
  items: Array<{ requestId: string; expectedVersion: number }>,
  mode: "archive" | "restore",
): Promise<MaintenanceActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    if (!Array.isArray(items) || items.length === 0) {
      return {
        status: "error",
        message: "Select at least one maintenance request first.",
        fieldErrors: {},
      };
    }

    let successCount = 0;
    let failedCount = 0;
    let firstError: string | null = null;

    for (const item of items) {
      try {
        if (mode === "archive") {
          await archiveMaintenanceRequest(ownerUserId, item);
        } else {
          await restoreMaintenanceRequest(ownerUserId, item);
        }
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        if (!firstError) {
          const mapped = handleActionError(
            error,
            mode === "archive"
              ? "Could not archive selected maintenance request."
              : "Could not restore selected maintenance request.",
          );
          if (mapped.status === "error") {
            firstError = mapped.message;
          }
        }
      }
    }

    if (successCount > 0) {
      revalidateMaintenancePaths();
    }

    if (successCount === 0) {
      return {
        status: "error",
        message:
          firstError ??
          (mode === "archive"
            ? "Could not archive the selected maintenance requests."
            : "Could not restore the selected maintenance requests."),
        fieldErrors: {},
      };
    }

    const verb = mode === "archive" ? "Archived" : "Restored";
    const noun = successCount === 1 ? "request" : "requests";
    const suffix =
      failedCount > 0
        ? ` (${failedCount} skipped${firstError ? `: ${firstError}` : ""}).`
        : ".";
    return {
      status: "saved",
      message: `${verb} ${successCount} ${noun}${suffix}`,
    };
  } catch (error) {
    return handleActionError(
      error,
      mode === "archive"
        ? "Could not archive selected maintenance requests right now."
        : "Could not restore selected maintenance requests right now.",
    );
  }
}
