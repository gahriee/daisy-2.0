"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  ArchiveRestoreTenantSchema,
  ArchiveTenantContractSchema,
  CreateTenantAssignmentSchema,
  CreateTenantContractSchema,
  CreateTenantNoteSchema,
  CreateTenantSchema,
  DeleteTenantNoteSchema,
  MoveOutTenantAssignmentSchema,
  UpdateTenantSchema,
  type TenantContractDto,
  type TenantNoteDto,
} from "./schemas";
import { archiveTenantContract, createTenantContract } from "./contracts";
import {
  archiveTenant,
  assignTenantToBed,
  createTenant,
  createTenantNote,
  deleteTenantNote,
  moveOutTenantAssignment,
  restoreTenant,
  updateTenant,
} from "./service";

type ActionErrorResult = {
  status: "error";
  message: string;
  fieldErrors: Record<string, string>;
};

export type TenantActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string; tenantId?: string }
  | ActionErrorResult;

export type TenantNoteActionResult =
  | { status: "idle" }
  | {
      status: "saved";
      message: string;
      note?: TenantNoteDto;
      deletedNoteId?: string;
    }
  | ActionErrorResult;

export type TenantContractActionResult =
  | { status: "idle" }
  | {
      status: "saved";
      message: string;
      contract?: TenantContractDto;
    }
  | ActionErrorResult;

function readStr(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val : "";
}

function mapZodErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function handleActionError(
  error: unknown,
  fallback: string,
): ActionErrorResult {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  return { status: "error", message: fallback, fieldErrors: {} };
}

function revalidateTenantPaths(tenantId?: string) {
  revalidatePath("/tenants");
  revalidatePath("/tenants", "layout");
  if (tenantId) {
    revalidatePath(`/tenants/${tenantId}`);
    revalidatePath(`/tenants/${tenantId}/contracts/new`);
  }
  revalidatePath("/rooms");
  revalidatePath("/billing");
  revalidatePath("/payments");
  revalidatePath("/notifications");
  revalidatePath("/audit");
  revalidatePath("/");
}

export async function createTenantAction(
  _prev: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const rawId = readStr(formData, "id").trim();
    const parsed = CreateTenantSchema.safeParse({
      ...(rawId ? { id: rawId } : {}),
      fullName: readStr(formData, "fullName"),
      phone: readStr(formData, "phone"),
      email: readStr(formData, "email"),
      address: readStr(formData, "address"),
      emergencyContact: readStr(formData, "emergencyContact"),
      ...(formData.has("notes") ? { notes: readStr(formData, "notes") } : {}),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const created = await createTenant(ownerUserId, parsed.data);
    revalidateTenantPaths(created.id);
    return { status: "saved", message: "Tenant added.", tenantId: created.id };
  } catch (error) {
    return handleActionError(
      error,
      "Could not add tenant right now. Try again.",
    );
  }
}

export async function updateTenantAction(
  _prev: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = UpdateTenantSchema.safeParse({
      tenantId: readStr(formData, "tenantId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      fullName: readStr(formData, "fullName"),
      phone: readStr(formData, "phone"),
      email: readStr(formData, "email"),
      address: readStr(formData, "address"),
      emergencyContact: readStr(formData, "emergencyContact"),
      ...(formData.has("notes") ? { notes: readStr(formData, "notes") } : {}),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const updated = await updateTenant(ownerUserId, parsed.data);
    revalidateTenantPaths(updated.id);
    return {
      status: "saved",
      message: "Tenant profile updated.",
      tenantId: updated.id,
    };
  } catch (error) {
    return handleActionError(error, "Could not update tenant right now.");
  }
}

export async function archiveTenantAction(rawInput: {
  tenantId: string;
  expectedVersion: number;
}): Promise<TenantActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveRestoreTenantSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid tenant archive request.",
        fieldErrors: {},
      };
    }
    const archived = await archiveTenant(ownerUserId, parsed.data);
    revalidateTenantPaths(archived.id);
    return {
      status: "saved",
      message: "Tenant archived.",
      tenantId: archived.id,
    };
  } catch (error) {
    return handleActionError(error, "Could not archive tenant right now.");
  }
}

export async function restoreTenantAction(rawInput: {
  tenantId: string;
  expectedVersion: number;
}): Promise<TenantActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveRestoreTenantSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid tenant restore request.",
        fieldErrors: {},
      };
    }
    const restored = await restoreTenant(ownerUserId, parsed.data);
    revalidateTenantPaths(restored.id);
    return {
      status: "saved",
      message: "Tenant restored.",
      tenantId: restored.id,
    };
  } catch (error) {
    return handleActionError(error, "Could not restore tenant right now.");
  }
}

export async function bulkArchiveTenantsAction(
  items: Array<{ tenantId: string; expectedVersion: number }>,
  mode: "archive" | "restore",
): Promise<TenantActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    if (!Array.isArray(items) || items.length === 0) {
      return {
        status: "error",
        message: "Select at least one tenant first.",
        fieldErrors: {},
      };
    }

    let successCount = 0;
    let failedCount = 0;
    let firstError: string | null = null;

    for (const rawItem of items) {
      const parsed = ArchiveRestoreTenantSchema.safeParse(rawItem);
      if (!parsed.success) {
        failedCount += 1;
        firstError ??=
          parsed.error.issues[0]?.message ?? "Invalid tenant selection.";
        continue;
      }
      try {
        if (mode === "archive") {
          await archiveTenant(ownerUserId, parsed.data);
        } else {
          await restoreTenant(ownerUserId, parsed.data);
        }
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        if (!firstError) {
          const mapped = handleActionError(
            error,
            mode === "archive"
              ? "Could not archive selected tenant."
              : "Could not restore selected tenant.",
          );
          if (mapped.status === "error") {
            firstError = mapped.message;
          }
        }
      }
    }

    if (successCount > 0) {
      revalidateTenantPaths();
    }

    if (successCount === 0) {
      return {
        status: "error",
        message:
          firstError ??
          (mode === "archive"
            ? "Could not archive the selected tenants."
            : "Could not restore the selected tenants."),
        fieldErrors: {},
      };
    }

    const verb = mode === "archive" ? "Archived" : "Restored";
    const noun = successCount === 1 ? "tenant" : "tenants";
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
        ? "Could not archive selected tenants right now."
        : "Could not restore selected tenants right now.",
    );
  }
}

export async function assignTenantToBedAction(
  _prev: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = CreateTenantAssignmentSchema.safeParse({
      tenantId: readStr(formData, "tenantId"),
      bedId: readStr(formData, "bedId"),
      startDateManila: readStr(formData, "startDateManila"),
      endDateManila: readStr(formData, "endDateManila"),
      monthlyRate: readStr(formData, "monthlyRate"),
      securityDeposit: readStr(formData, "securityDeposit"),
      ...(formData.has("notes") ? { notes: readStr(formData, "notes") } : {}),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before assigning.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const assignment = await assignTenantToBed(ownerUserId, parsed.data);
    revalidateTenantPaths(assignment.tenantId);
    return {
      status: "saved",
      message: `Assigned Room ${assignment.roomNumber} (Bed ${assignment.bedNumber}).`,
      tenantId: assignment.tenantId,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Could not assign bed right now. Try again.",
    );
  }
}

export async function moveOutTenantAssignmentAction(
  _prev: TenantActionResult,
  formData: FormData,
): Promise<TenantActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = MoveOutTenantAssignmentSchema.safeParse({
      assignmentId: readStr(formData, "assignmentId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      mode: readStr(formData, "mode"),
      actualMoveOutDateManila: readStr(formData, "actualMoveOutDateManila"),
      ...(formData.has("notes") ? { notes: readStr(formData, "notes") } : {}),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the move-out details before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const updated = await moveOutTenantAssignment(ownerUserId, parsed.data);
    revalidateTenantPaths(updated.tenantId);
    return {
      status: "saved",
      message:
        updated.status === "CANCELLED"
          ? "Assignment cancelled and bed released."
          : "Move-out recorded and bed restored to available.",
      tenantId: updated.tenantId,
    };
  } catch (error) {
    return handleActionError(error, "Could not record move-out right now.");
  }
}

export async function createTenantNoteAction(
  _prev: TenantNoteActionResult,
  formData: FormData,
): Promise<TenantNoteActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = CreateTenantNoteSchema.safeParse({
      tenantId: readStr(formData, "tenantId"),
      content: readStr(formData, "content"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const note = await createTenantNote(ownerUserId, parsed.data);
    revalidateTenantPaths(note.tenantId);
    return {
      status: "saved",
      message: "Note added.",
      note,
    };
  } catch (error) {
    return handleActionError(error, "Could not add note right now. Try again.");
  }
}

export async function deleteTenantNoteAction(rawInput: {
  tenantId: string;
  noteId: string;
}): Promise<TenantNoteActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = DeleteTenantNoteSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message: parsed.error.issues[0]?.message ?? "Select a valid note.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const deleted = await deleteTenantNote(ownerUserId, parsed.data);
    revalidateTenantPaths(deleted.tenantId);
    return {
      status: "saved",
      message: "Note deleted.",
      deletedNoteId: deleted.deletedNoteId,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Could not delete note right now. Try again.",
    );
  }
}

export async function createTenantContractAction(
  _prev: TenantContractActionResult,
  formData: FormData,
): Promise<TenantContractActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const pagesRaw = readStr(formData, "pagesJson");
    let pages: unknown = [];
    if (pagesRaw.trim()) {
      try {
        pages = JSON.parse(pagesRaw);
      } catch {
        return {
          status: "error",
          message: "Uploaded contract pages metadata is invalid.",
          fieldErrors: { pages: "Re-attach your scanned contract pages." },
        };
      }
    }

    const parsed = CreateTenantContractSchema.safeParse({
      tenantId: readStr(formData, "tenantId"),
      assignmentId: readStr(formData, "assignmentId") || null,
      title: readStr(formData, "title"),
      signedDateManila: readStr(formData, "signedDateManila") || null,
      notes: readStr(formData, "notes"),
      pages,
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted contract fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const contract = await createTenantContract(ownerUserId, parsed.data);
    revalidateTenantPaths(contract.tenantId);
    revalidatePath(`/tenants/${contract.tenantId}/contracts/${contract.id}`);
    return {
      status: "saved",
      message: "Signed contract saved.",
      contract,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Could not save signed contract right now. Try again.",
    );
  }
}

export async function archiveTenantContractAction(rawInput: {
  tenantId: string;
  contractId: string;
  expectedVersion: number;
}): Promise<TenantContractActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveTenantContractSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message: parsed.error.issues[0]?.message ?? "Select a valid contract.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const contract = await archiveTenantContract(ownerUserId, parsed.data);
    revalidateTenantPaths(contract.tenantId);
    revalidatePath(`/tenants/${contract.tenantId}/contracts/${contract.id}`);
    return {
      status: "saved",
      message: "Signed contract archived.",
      contract,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Could not archive signed contract right now. Try again.",
    );
  }
}
