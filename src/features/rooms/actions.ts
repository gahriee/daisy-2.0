"use server";

import { revalidatePath } from "next/cache";
import { AppError, ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  ArchiveRestoreBedSchema,
  ArchiveRestoreRoomSchema,
  CreateBedSchema,
  CreateRoomSchema,
  parseRoomPhotosManifestJsonField,
  UpdateBedSchema,
  UpdateRoomSchema,
  type RoomPhotoManifestInput,
} from "./schemas";
import {
  archiveBed,
  archiveRoom,
  createBed,
  createRoom,
  restoreBed,
  restoreRoom,
  syncRoomUnitBed,
  updateBed,
  updateRoom,
} from "./service";

export type InventoryActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string; roomId?: string }
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

function revalidateInventoryPaths(roomId?: string) {
  revalidatePath("/rooms");
  revalidatePath("/rooms", "layout");
  revalidatePath("/transients/rooms");
  revalidatePath("/transients/rooms", "layout");
  if (roomId) {
    revalidatePath(`/rooms/${roomId}`);
    revalidatePath(`/transients/rooms/${roomId}`);
  }
  revalidatePath("/transients");
  revalidatePath("/transients", "layout");
  revalidatePath("/transients/stays");
  revalidatePath("/book");
  revalidatePath("/tenants");
  revalidatePath("/reports");
  revalidatePath("/notifications");
  revalidatePath("/audit");
  revalidatePath("/");
}

function readRoomPhotosSafe(
  formData: FormData,
): RoomPhotoManifestInput | undefined {
  try {
    return parseRoomPhotosManifestJsonField(formData);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error
        ? error.message
        : "Room photo selection could not be parsed.",
    );
  }
}

export async function createRoomAction(
  _prev: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const photos = readRoomPhotosSafe(formData);
    const hasBaseMonthly = formData.has("baseMonthlyRate");
    const hasDailyRate = formData.has("transientDailyRate");
    const building = readStr(formData, "building") || "BOARDING";
    const parsed = CreateRoomSchema.safeParse({
      building,
      title: readStr(formData, "title"),
      floor: readStr(formData, "floor"),
      capacity: readStr(formData, "capacity") || "1",
      ...(hasBaseMonthly
        ? { baseMonthlyRate: readStr(formData, "baseMonthlyRate") }
        : {}),
      ...(hasDailyRate
        ? { transientDailyRate: readStr(formData, "transientDailyRate") }
        : {}),
      summary: readStr(formData, "summary"),
      isTransientPublished: formData.get("isTransientPublished") === "on",
      ...(photos !== undefined ? { photos } : {}),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const room = await createRoom(ownerUserId, parsed.data);
    await syncRoomUnitBed(ownerUserId, room.id);
    revalidateInventoryPaths(room.id);
    return { status: "saved", message: "Room added.", roomId: room.id };
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
    const photos = readRoomPhotosSafe(formData);
    const hasBuilding = formData.has("building");
    const hasBaseMonthly = formData.has("baseMonthlyRate");
    const hasDailyRate = formData.has("transientDailyRate");
    const hasPublicListingFields = formData.has("hasPublicListingFields");
    const parsed = UpdateRoomSchema.safeParse({
      roomId: readStr(formData, "roomId"),
      expectedVersion: readStr(formData, "expectedVersion"),
      ...(hasBuilding ? { building: readStr(formData, "building") } : {}),
      title: readStr(formData, "title"),
      floor: readStr(formData, "floor"),
      capacity: readStr(formData, "capacity") || "1",
      ...(hasBaseMonthly
        ? { baseMonthlyRate: readStr(formData, "baseMonthlyRate") }
        : {}),
      ...(hasDailyRate
        ? { transientDailyRate: readStr(formData, "transientDailyRate") }
        : {}),
      summary: readStr(formData, "summary"),
      ...(hasPublicListingFields || formData.has("isTransientPublished")
        ? {
            isTransientPublished: formData.get("isTransientPublished") === "on",
          }
        : {}),
      ...(photos !== undefined ? { photos } : {}),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Review the highlighted fields before saving.",
        fieldErrors: mapZodErrors(parsed.error.issues),
      };
    }

    const room = await updateRoom(ownerUserId, parsed.data);
    await syncRoomUnitBed(ownerUserId, room.id);
    revalidateInventoryPaths(room.id);
    return { status: "saved", message: "Room updated.", roomId: room.id };
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
    const archived = await archiveRoom(ownerUserId, parsed.data);
    revalidateInventoryPaths(archived.id);
    return { status: "saved", message: "Room archived.", roomId: archived.id };
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
    const room = await restoreRoom(ownerUserId, parsed.data);
    await syncRoomUnitBed(ownerUserId, room.id);
    revalidateInventoryPaths(room.id);
    return { status: "saved", message: "Room restored.", roomId: room.id };
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
