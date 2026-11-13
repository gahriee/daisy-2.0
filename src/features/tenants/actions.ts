"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  ArchiveRestoreTenantSchema,
  CreateTenantAssignmentSchema,
  CreateTenantSchema,
  MoveOutTenantAssignmentSchema,
  UpdateTenantSchema,
} from "./schemas";
import {
  archiveTenant,
  assignTenantToBed,
  createTenant,
  moveOutTenantAssignment,
  restoreTenant,
  updateTenant,
} from "./service";

export type TenantActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string; tenantId?: string }
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
): TenantActionResult {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  return { status: "error", message: fallback, fieldErrors: {} };
}

function revalidateTenantPaths(tenantId?: string) {
  revalidatePath("/tenants");
  if (tenantId) {
    revalidatePath(`/tenants/${tenantId}`);
  }
  revalidatePath("/rooms");
  revalidatePath("/audit");
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
      notes: readStr(formData, "notes"),
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
      notes: readStr(formData, "notes"),
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
      notes: readStr(formData, "notes"),
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
      message: `Assigned Room ${assignment.roomNumber} · Bed ${assignment.bedNumber}.`,
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
      notes: readStr(formData, "notes"),
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
