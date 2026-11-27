"use server";

import { revalidatePath } from "next/cache";
import { parseRoomPhotosManifestJsonField } from "@/features/rooms/schemas";
import {
  formatStayTime,
  getScopeLabel,
} from "@/features/transients/public-booking-view";
import { AppError, ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import { getDatabase } from "@/server/db/client";
import { sendBookingApprovedEmailSafe } from "@/server/mail/booking-mailer";
import {
  approveBookingRequest,
  archiveTransientReservation,
  cancelTransientReservation,
  checkInTransientReservation,
  checkOutTransientReservation,
  createTransientGuest,
  createTransientReservation,
  createTransientStayInvoice,
  markNoShowTransientReservation,
  rejectBookingRequest,
  restoreTransientReservation,
  updateRoomTransientPublish,
  updateTransientPolicyNote,
  withdrawBookingRequest,
} from "./service";

export type TransientActionResult =
  | { status: "idle" }
  | { status: "saved"; message: string; entityId?: string }
  | { status: "error"; message: string; fieldErrors: Record<string, string> };

function readStr(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function handleActionError(
  error: unknown,
  fallback: string,
): TransientActionResult {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  if (error instanceof Error && error.message) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  return { status: "error", message: fallback, fieldErrors: {} };
}

function revalidateTransientPaths(requestId?: string, roomId?: string) {
  revalidatePath("/transients");
  revalidatePath("/transients", "layout");
  revalidatePath("/transients/stays");
  revalidatePath("/transients/requests");
  revalidatePath("/transients/rooms");
  if (requestId) {
    revalidatePath(`/transients/requests/${requestId}`);
  }
  if (roomId) {
    revalidatePath(`/transients/rooms/${roomId}`);
    revalidatePath(`/rooms/${roomId}`);
  }
  revalidatePath("/rooms");
  revalidatePath("/billing");
  revalidatePath("/payments");
  revalidatePath("/notifications");
  revalidatePath("/audit");
  revalidatePath("/book");
  revalidatePath("/");
}

export async function createTransientGuestAction(
  _prev: TransientActionResult,
  formData: FormData,
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const guest = await createTransientGuest(ownerUserId, {
      fullName: readStr(formData, "fullName"),
      phone: readStr(formData, "phone"),
      email: readStr(formData, "email"),
      notes: readStr(formData, "notes"),
    });
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: guest.id,
      message: `Added transient guest ${guest.fullName}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not add transient guest right now.");
  }
}

export async function createTransientReservationAction(
  _prev: TransientActionResult,
  formData: FormData,
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const bedId = readStr(formData, "bedId");
    const dailyRateOverride = readStr(formData, "dailyRateOverride");
    const stay = await createTransientReservation(ownerUserId, {
      guestId: readStr(formData, "guestId"),
      roomId: readStr(formData, "roomId"),
      bedId: bedId || null,
      scope: readStr(formData, "scope") as "BED" | "WHOLE_ROOM",
      checkInDateManila: readStr(formData, "checkInDateManila"),
      checkOutDateManila: readStr(formData, "checkOutDateManila"),
      partySize: Number(readStr(formData, "partySize") || "1"),
      dailyRateOverride: dailyRateOverride || null,
      notes: readStr(formData, "notes"),
      issueInvoiceImmediately: true,
    });
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: stay.id,
      message: `Created confirmed stay and issued invoice for ${stay.guestName}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not create stay right now.");
  }
}

export async function checkInTransientAction(rawInput: {
  reservationId: string;
  expectedVersion: number;
}): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await checkInTransientReservation(ownerUserId, rawInput);
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: dto.id,
      message: `Checked in ${dto.guestName}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not check in guest right now.");
  }
}

export async function checkOutTransientAction(rawInput: {
  reservationId: string;
  expectedVersion: number;
  actualCheckOutDateManila?: string;
}): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await checkOutTransientReservation(ownerUserId, rawInput);
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: dto.id,
      message: `Checked out ${dto.guestName} and released bed allocation.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not check out guest right now.");
  }
}

export async function cancelTransientAction(
  _prev: TransientActionResult,
  formData: FormData,
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await cancelTransientReservation(ownerUserId, {
      reservationId: readStr(formData, "reservationId"),
      expectedVersion: Number(readStr(formData, "expectedVersion")),
      reason: readStr(formData, "reason"),
    });
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: dto.id,
      message: `Cancelled stay for ${dto.guestName}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not cancel stay right now.");
  }
}

export async function markNoShowTransientAction(rawInput: {
  reservationId: string;
  expectedVersion: number;
}): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await markNoShowTransientReservation(ownerUserId, {
      reservationId: rawInput.reservationId,
      expectedVersion: rawInput.expectedVersion,
      reason: "Guest did not arrive.",
    });
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: dto.id,
      message: `Marked ${dto.guestName} as no-show and released bed.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not update stay status right now.");
  }
}

export async function createTransientStayInvoiceAction(rawInput: {
  reservationId: string;
  dueDateManila?: string;
  issueImmediately?: boolean;
}): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const inv = await createTransientStayInvoice(ownerUserId, {
      reservationId: rawInput.reservationId,
      ...(rawInput.dueDateManila
        ? { dueDateManila: rawInput.dueDateManila }
        : {}),
      issueImmediately: rawInput.issueImmediately ?? true,
    });
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: inv.id,
      message: inv.invoiceNumber
        ? `Issued stay invoice ${inv.invoiceNumber} (PHP ${inv.totalAmount}).`
        : "Created draft stay invoice.",
    };
  } catch (error) {
    return handleActionError(error, "Could not bill stay right now.");
  }
}

export async function updateRoomTransientPublishAction(
  _prev: TransientActionResult,
  formData: FormData,
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dailyRate = readStr(formData, "transientDailyRate");
    let photos;
    try {
      photos = parseRoomPhotosManifestJsonField(formData);
    } catch (error) {
      throw new ValidationError(
        error instanceof Error
          ? error.message
          : "Room photo selection could not be parsed.",
      );
    }
    const result = await updateRoomTransientPublish(ownerUserId, {
      roomId: readStr(formData, "roomId"),
      expectedVersion: Number(readStr(formData, "expectedVersion")),
      isTransientPublished: formData.get("isTransientPublished") === "on",
      transientTitle: readStr(formData, "transientTitle"),
      transientDescription: readStr(formData, "transientDescription"),
      transientScope: readStr(formData, "transientScope") as
        "BED" | "WHOLE_ROOM" | "",
      ...(dailyRate ? { transientDailyRate: dailyRate } : {}),
      ...(photos !== undefined ? { photos } : {}),
    });
    revalidateTransientPaths(undefined, result.roomId);
    return {
      status: "saved",
      entityId: result.roomId,
      message: result.isTransientPublished
        ? "Room published to /book."
        : "Room hidden from /book.",
    };
  } catch (error) {
    return handleActionError(
      error,
      "Could not update public listing right now.",
    );
  }
}

export async function updateTransientPolicyNoteAction(
  _prev: TransientActionResult,
  formData: FormData,
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    await updateTransientPolicyNote(ownerUserId, {
      transientPolicyNote: readStr(formData, "transientPolicyNote"),
    });
    revalidateTransientPaths();
    return {
      status: "saved",
      message: "Updated public stay policy note.",
    };
  } catch (error) {
    return handleActionError(error, "Could not save policy note right now.");
  }
}

export async function approveBookingRequestAction(
  _prev: TransientActionResult,
  formData: FormData,
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const requestId = readStr(formData, "requestId");
    const confirmedDailyRate = readStr(formData, "confirmedDailyRate");
    const result = await approveBookingRequest(ownerUserId, {
      requestId,
      expectedVersion: Number(readStr(formData, "expectedVersion")),
      bedId: readStr(formData, "bedId") || null,
      existingGuestId: readStr(formData, "existingGuestId") || null,
      ...(confirmedDailyRate ? { confirmedDailyRate } : {}),
      confirmRateChange: formData.get("confirmRateChange") === "on",
      notes: readStr(formData, "notes"),
      issueInvoiceImmediately: true,
    });
    revalidateTransientPaths(requestId);

    // Send guest confirmation email outside the database transaction (Rule 8.6)
    let emailNotice = "";
    const guestEmail =
      result.request.guestEmail ?? result.reservation.guestEmail;
    if (guestEmail) {
      const db = getDatabase();
      const [settings, roomInfo] = await Promise.all([
        db.businessSettings.findUnique({
          where: { ownerUserId },
          select: {
            businessName: true,
            businessAddress: true,
            businessLatitude: true,
            businessLongitude: true,
            businessPhone: true,
            checkInTimeManila: true,
            checkOutTimeManila: true,
          },
        }),
        db.room.findFirst({
          where: { id: result.reservation.roomId, ownerUserId },
          select: {
            title: true,
            photos: {
              where: { role: "PREVIEW" },
              select: { id: true },
              take: 1,
            },
          },
        }),
      ]);

      const appOrigin =
        process.env.APP_ORIGIN?.trim().replace(/\/+$/, "") ||
        "http://localhost:3000";
      const previewPhotoId = roomInfo?.photos?.[0]?.id ?? null;
      const roomPhotoUrl =
        previewPhotoId && /^https:\/\//i.test(appOrigin)
          ? `${appOrigin}/api/public/room-photos/${previewPhotoId}`
          : null;
      const emailOutcome = await sendBookingApprovedEmailSafe(
        {
          toEmail: guestEmail,
          guestName: result.reservation.guestName,
          referenceCode: result.request.referenceCode,
          propertyName: settings?.businessName || "Daisy Residences",
          propertyAddress: settings?.businessAddress ?? null,
          propertyLatitude: settings?.businessLatitude ?? null,
          propertyLongitude: settings?.businessLongitude ?? null,
          contactPhone: settings?.businessPhone ?? null,
          roomTitle: roomInfo?.title ?? result.reservation.roomNumber,
          scopeLabel: getScopeLabel(result.reservation.scope),
          roomPhotoUrl,
          checkInDateManila: result.reservation.checkInDateManila,
          checkOutDateManila: result.reservation.checkOutDateManila,
          checkInTimeLabel: formatStayTime(settings?.checkInTimeManila ?? ""),
          checkOutTimeLabel: formatStayTime(settings?.checkOutTimeManila ?? ""),
          nights: result.reservation.nights,
          partySize: result.reservation.partySize,
          dailyRate: result.reservation.dailyRate,
          totalAmount: result.reservation.totalAmount,
          trackUrl: `${appOrigin}/book#track`,
        },
        { ownerUserId },
      );

      if (emailOutcome.status === "sent") {
        emailNotice = " Confirmation email sent to the guest.";
      } else if (emailOutcome.status === "skipped") {
        emailNotice = " Email delivery is not configured yet.";
      } else {
        emailNotice = " Confirmation email could not be sent right now.";
      }
    }

    return {
      status: "saved",
      entityId: result.reservation.id,
      message: `Approved ${result.request.referenceCode} and booked ${result.reservation.guestName}.${emailNotice}`,
    };
  } catch (error) {
    return handleActionError(error, "Could not approve request right now.");
  }
}

export async function rejectBookingRequestAction(
  _prev: TransientActionResult,
  formData: FormData,
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const requestId = readStr(formData, "requestId");
    const dto = await rejectBookingRequest(ownerUserId, {
      requestId,
      expectedVersion: Number(readStr(formData, "expectedVersion")),
      reason: readStr(formData, "reason"),
    });
    revalidateTransientPaths(requestId);
    return {
      status: "saved",
      entityId: dto.id,
      message: `Rejected ${dto.referenceCode}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not reject request right now.");
  }
}

export async function withdrawBookingRequestAction(rawInput: {
  requestId: string;
  expectedVersion: number;
  reason?: string;
}): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await withdrawBookingRequest(ownerUserId, rawInput);
    revalidateTransientPaths(rawInput.requestId);
    return {
      status: "saved",
      entityId: dto.id,
      message: `Withdrew ${dto.referenceCode}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not withdraw request right now.");
  }
}

export async function bulkApproveBookingRequestsAction(
  items: Array<{ requestId: string; expectedVersion: number }>,
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    if (items.length === 0) {
      return {
        status: "error",
        message: "Select at least one pending booking to approve.",
        fieldErrors: {},
      };
    }

    const db = getDatabase();
    let approvedCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const result = await approveBookingRequest(ownerUserId, {
          requestId: item.requestId,
          expectedVersion: item.expectedVersion,
          bedId: null,
          existingGuestId: null,
          confirmRateChange: true,
          notes: null,
          issueInvoiceImmediately: true,
        });
        approvedCount += 1;
        revalidateTransientPaths(item.requestId);

        const guestEmail =
          result.request.guestEmail ?? result.reservation.guestEmail;
        if (guestEmail) {
          const [settings, roomInfo] = await Promise.all([
            db.businessSettings.findUnique({
              where: { ownerUserId },
              select: {
                businessName: true,
                businessAddress: true,
                businessLatitude: true,
                businessLongitude: true,
                businessPhone: true,
                checkInTimeManila: true,
                checkOutTimeManila: true,
              },
            }),
            db.room.findFirst({
              where: { id: result.reservation.roomId, ownerUserId },
              select: {
                title: true,
                photos: {
                  where: { role: "PREVIEW" },
                  select: { id: true },
                  take: 1,
                },
              },
            }),
          ]);

          const appOrigin =
            process.env.APP_ORIGIN?.trim().replace(/\/+$/, "") ||
            "http://localhost:3000";
          const previewPhotoId = roomInfo?.photos?.[0]?.id ?? null;
          const roomPhotoUrl =
            previewPhotoId && /^https:\/\//i.test(appOrigin)
              ? `${appOrigin}/api/public/room-photos/${previewPhotoId}`
              : null;
          await sendBookingApprovedEmailSafe(
            {
              toEmail: guestEmail,
              guestName: result.reservation.guestName,
              referenceCode: result.request.referenceCode,
              propertyName: settings?.businessName || "Daisy Residences",
              propertyAddress: settings?.businessAddress ?? null,
              propertyLatitude: settings?.businessLatitude ?? null,
              propertyLongitude: settings?.businessLongitude ?? null,
              contactPhone: settings?.businessPhone ?? null,
              roomTitle: roomInfo?.title ?? result.reservation.roomNumber,
              scopeLabel: getScopeLabel(result.reservation.scope),
              roomPhotoUrl,
              checkInDateManila: result.reservation.checkInDateManila,
              checkOutDateManila: result.reservation.checkOutDateManila,
              checkInTimeLabel: formatStayTime(
                settings?.checkInTimeManila ?? "",
              ),
              checkOutTimeLabel: formatStayTime(
                settings?.checkOutTimeManila ?? "",
              ),
              nights: result.reservation.nights,
              partySize: result.reservation.partySize,
              dailyRate: result.reservation.dailyRate,
              totalAmount: result.reservation.totalAmount,
              trackUrl: `${appOrigin}/book#track`,
            },
            { ownerUserId },
          );
        }
      } catch (err) {
        errors.push(
          err instanceof Error ? err.message : "Could not approve booking.",
        );
      }
    }

    if (approvedCount === 0) {
      return {
        status: "error",
        message: errors[0] ?? "Could not approve the selected bookings.",
        fieldErrors: {},
      };
    }

    const baseMsg = `Approved ${approvedCount} ${approvedCount === 1 ? "booking" : "bookings"}.`;
    return {
      status: "saved",
      message:
        errors.length > 0
          ? `${baseMsg} ${errors.length} could not be approved (${errors[0]}).`
          : baseMsg,
    };
  } catch (error) {
    return handleActionError(
      error,
      "Could not approve selected bookings right now.",
    );
  }
}

export async function archiveTransientReservationAction(rawInput: {
  reservationId: string;
  expectedVersion: number;
}): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await archiveTransientReservation(ownerUserId, rawInput);
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: dto.id,
      message: `Archived stay for ${dto.guestName}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not archive stay right now.");
  }
}

export async function restoreTransientReservationAction(rawInput: {
  reservationId: string;
  expectedVersion: number;
}): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const dto = await restoreTransientReservation(ownerUserId, rawInput);
    revalidateTransientPaths();
    return {
      status: "saved",
      entityId: dto.id,
      message: `Restored stay for ${dto.guestName}.`,
    };
  } catch (error) {
    return handleActionError(error, "Could not restore stay right now.");
  }
}

export async function bulkArchiveTransientReservationsAction(
  items: Array<{ reservationId: string; expectedVersion: number }>,
  mode: "archive" | "restore",
): Promise<TransientActionResult> {
  try {
    const ownerUserId = await requireOwnerUserId();
    if (items.length === 0) {
      return {
        status: "error",
        message: `Select at least one stay to ${mode}.`,
        fieldErrors: {},
      };
    }

    let successCount = 0;
    const errors: string[] = [];
    for (const item of items) {
      try {
        if (mode === "archive") {
          await archiveTransientReservation(ownerUserId, item);
        } else {
          await restoreTransientReservation(ownerUserId, item);
        }
        successCount += 1;
      } catch (err) {
        errors.push(
          err instanceof Error ? err.message : `Could not ${mode} stay.`,
        );
      }
    }
    if (successCount > 0) {
      revalidateTransientPaths();
    }
    if (successCount === 0) {
      return {
        status: "error",
        message: errors[0] ?? `Could not ${mode} the selected stays.`,
        fieldErrors: {},
      };
    }
    const verb = mode === "archive" ? "Archived" : "Restored";
    const baseMsg = `${verb} ${successCount} ${successCount === 1 ? "stay" : "stays"}.`;
    return {
      status: "saved",
      message:
        errors.length > 0
          ? `${baseMsg} ${errors.length} skipped (${errors[0]}).`
          : baseMsg,
    };
  } catch (error) {
    return handleActionError(error, `Could not ${mode} selected stays.`);
  }
}
