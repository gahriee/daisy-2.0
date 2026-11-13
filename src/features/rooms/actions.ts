"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  ArchiveRestoreBedSchema,
  ArchiveRestoreRoomSchema,
  ArchiveRestoreRoomTypeSchema,
  CreateBedSchema,
  CreateRoomSchema,
  CreateRoomTypeSchema,
  UpdateBedSchema,
  UpdateRoomSchema,
  UpdateRoomTypeSchema,
} from "./schemas";
import {
  archiveBed,
  archiveRoom,
  archiveRoomType,
  createBed,
  createRoom,
  createRoomType,
  restoreBed,
  restoreRoom,
  restoreRoomType,
  updateBed,
  updateRoom,
  updateRoomType,
} from "./service";

export type InventoryActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string }
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
): InventoryActionResult {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  return { status: "error", message: fallback, fieldErrors: {} };
}

function revalidateInventoryPaths() {
  revalidatePath("/rooms");
  revalidatePath("/rooms/types");
  revalidatePath("/tenants");
  revalidatePath("/audit");
}

export async function createRoomTypeAction(
  _prev: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = CreateRoomTypeSchema.safeParse({
      name: readStr(formData, "name"),
      monthlyRate: readStr(formData, "monthlyRate"),
      dailyRate: readStr(formData, "dailyRate"),
      description: readStr(formData, "description"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    await createRoomType(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Room type added." };
  } catch (error) {
    return handleActionError(
      error,
      "Could not add room type right now. Try again.",
    );
  }
}

export async function updateRoomTypeAction(
  _prev: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = UpdateRoomTypeSchema.safeParse({
      roomTypeId: readStr(formData, "roomTypeId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      name: readStr(formData, "name"),
      monthlyRate: readStr(formData, "monthlyRate"),
      dailyRate: readStr(formData, "dailyRate"),
      description: readStr(formData, "description"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    await updateRoomType(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Room type updated." };
  } catch (error) {
    return handleActionError(
      error,
      "Could not update room type right now. Try again.",
    );
  }
}

export async function archiveRoomTypeAction(rawInput: {
  roomTypeId: string;
  expectedVersion: number;
}): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveRestoreRoomTypeSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ??
          "Invalid room type archive request.",
        fieldErrors: {},
      };
    }
    await archiveRoomType(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Room type archived." };
  } catch (error) {
    return handleActionError(error, "Could not archive room type right now.");
  }
}

export async function restoreRoomTypeAction(rawInput: {
  roomTypeId: string;
  expectedVersion: number;
}): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveRestoreRoomTypeSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ??
          "Invalid room type restore request.",
        fieldErrors: {},
      };
    }
    await restoreRoomType(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Room type restored." };
  } catch (error) {
    return handleActionError(error, "Could not restore room type right now.");
  }
}

export async function createRoomAction(
  _prev: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = CreateRoomSchema.safeParse({
      number: readStr(formData, "number"),
      floor: readStr(formData, "floor"),
      roomTypeId: readStr(formData, "roomTypeId"),
      capacity: readStr(formData, "capacity"),
      baseMonthlyRate: readStr(formData, "baseMonthlyRate"),
      transientDailyRate: readStr(formData, "transientDailyRate"),
      notes: readStr(formData, "notes"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    await createRoom(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Room added." };
  } catch (error) {
    return handleActionError(error, "Could not add room right now. Try again.");
  }
}

export async function updateRoomAction(
  _prev: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = UpdateRoomSchema.safeParse({
      roomId: readStr(formData, "roomId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      number: readStr(formData, "number"),
      floor: readStr(formData, "floor"),
      roomTypeId: readStr(formData, "roomTypeId"),
      capacity: readStr(formData, "capacity"),
      baseMonthlyRate: readStr(formData, "baseMonthlyRate"),
      transientDailyRate: readStr(formData, "transientDailyRate"),
      notes: readStr(formData, "notes"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    await updateRoom(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Room updated." };
  } catch (error) {
    return handleActionError(
      error,
      "Could not update room right now. Try again.",
    );
  }
}

export async function archiveRoomAction(rawInput: {
  roomId: string;
  expectedVersion: number;
}): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveRestoreRoomSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid room archive request.",
        fieldErrors: {},
      };
    }
    await archiveRoom(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Room archived." };
  } catch (error) {
    return handleActionError(error, "Could not archive room right now.");
  }
}

export async function restoreRoomAction(rawInput: {
  roomId: string;
  expectedVersion: number;
}): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveRestoreRoomSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid room restore request.",
        fieldErrors: {},
      };
    }
    await restoreRoom(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Room restored." };
  } catch (error) {
    return handleActionError(error, "Could not restore room right now.");
  }
}

export async function createBedAction(
  _prev: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = CreateBedSchema.safeParse({
      roomId: readStr(formData, "roomId"),
      number: readStr(formData, "number"),
      label: readStr(formData, "label"),
      monthlyRate: readStr(formData, "monthlyRate"),
      dailyRate: readStr(formData, "dailyRate"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    await createBed(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Bed added." };
  } catch (error) {
    return handleActionError(error, "Could not add bed right now. Try again.");
  }
}

export async function updateBedAction(
  _prev: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = UpdateBedSchema.safeParse({
      bedId: readStr(formData, "bedId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      number: readStr(formData, "number"),
      label: readStr(formData, "label"),
      monthlyRate: readStr(formData, "monthlyRate"),
      dailyRate: readStr(formData, "dailyRate"),
      status: readStr(formData, "status"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    await updateBed(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Bed updated." };
  } catch (error) {
    return handleActionError(
      error,
      "Could not update bed right now. Try again.",
    );
  }
}

export async function archiveBedAction(rawInput: {
  bedId: string;
  expectedVersion: number;
}): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveRestoreBedSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid bed archive request.",
        fieldErrors: {},
      };
    }
    await archiveBed(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Bed archived." };
  } catch (error) {
    return handleActionError(error, "Could not archive bed right now.");
  }
}

export async function restoreBedAction(rawInput: {
  bedId: string;
  expectedVersion: number;
}): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const parsed = ArchiveRestoreBedSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid bed restore request.",
        fieldErrors: {},
      };
    }
    await restoreBed(ownerUserId, parsed.data);
    revalidateInventoryPaths();
    return { status: "saved", message: "Bed restored." };
  } catch (error) {
    return handleActionError(error, "Could not restore bed right now.");
  }
}
