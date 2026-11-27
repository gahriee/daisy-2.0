import "server-only";
import { getServerOperationalLimits } from "@/config/business-config";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { roomPhotoSelect, splitRoomPhotoDtos } from "@/features/rooms/photos";
import { lockAllocationResources } from "@/features/allocations/service";
import { addManilaDays, toManilaDate } from "@/lib/dates";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import { formatMoneyDecimal } from "@/lib/money";
import { getDatabase } from "@/server/db/client";
import { isPgConstraintError } from "@/server/db/pg-errors";
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
} from "@/server/sync/publish";
import {
  computeTransientNights,
  computeTransientStayTotalCentavos,
  computeTransientStayUtcBounds,
  resolveTransientDailyRateCentavos,
} from "./calculations";
import { computeUnavailableNightDates } from "./public-booking-view";
import {
  LookupPublicBookingRequestSchema,
  PublicAvailabilityQuerySchema,
  SubmitPublicBookingRequestSchema,
  type AllocationScopeValue,
  type GuestSexValue,
  type LookupPublicBookingRequestInput,
  type PublicAvailabilityDto,
  type PublicAvailabilityQueryInput,
  type PublicBookingAckDto,
  type PublicBookingStatusDto,
  type PublicPublishedRoomDto,
  type SubmitPublicBookingRequestInput,
} from "./schemas";
import { bookingRequestSelect, toBookingRequestDto } from "./service";

const ZERO = BigInt(0);

export const PUBLIC_BOOKING_RATE_LIMITS = {
  availability: { windowSeconds: 60, maxRequests: 60 },
  submit: { windowSeconds: 900, maxRequests: 10 },
  lookup: { windowSeconds: 900, maxRequests: 20 },
} as const;

export function resolvePublicOwnerUserId(): string {
  const ownerId = process.env.OWNER_USER_ID?.trim();
  if (!ownerId) {
    throw new PreconditionError(
      "Public booking is not configured on this server yet.",
    );
  }
  return ownerId;
}

/**
 * Computes an anonymous keyed HMAC digest for rate-limiting from trusted proxy
 * identity headers (`cf-connecting-ip`, `x-vercel-forwarded-for`, `x-real-ip`),
 * never trusting client-editable `x-forwarded-for` directly or storing raw IPs.
 */
export function derivePublicClientBucketKey(headers: Headers): string {
  const trustedIp =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "anonymous";
  const secret =
    process.env.SESSION_SECRET?.trim() ||
    process.env.OWNER_USER_ID?.trim() ||
    "daisy-public-booking";
  return createHmac("sha256", secret).update(trustedIp).digest("hex");
}

/**
 * Atomic PostgreSQL-backed sliding/fixed window rate limiter inside
 * `SecurityRateLimit`, safe across serverless instances and restarts.
 */
export async function consumePublicBookingRateLimit(input: {
  bucket: keyof typeof PUBLIC_BOOKING_RATE_LIMITS;
  clientKey: string;
}): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const cfg = PUBLIC_BOOKING_RATE_LIMITS[input.bucket];
  const key = `public-booking:${input.bucket}:${input.clientKey}`;
  const db = getDatabase();

  const rows = await db.$queryRaw<
    Array<{ count: number; secondsRemaining: number }>
  >`
    INSERT INTO "SecurityRateLimit" ("key", "count", "resetsAt")
    VALUES (
      ${key},
      1,
      CURRENT_TIMESTAMP + (${cfg.windowSeconds} * INTERVAL '1 second')
    )
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP THEN 1
        ELSE "SecurityRateLimit"."count" + 1
      END,
      "resetsAt" = CASE
        WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP
          THEN CURRENT_TIMESTAMP + (${cfg.windowSeconds} * INTERVAL '1 second')
        ELSE "SecurityRateLimit"."resetsAt"
      END
    RETURNING
      "count",
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetsAt" - CURRENT_TIMESTAMP)))::int) AS "secondsRemaining"
  `;

  const row = rows[0];
  if (row && row.count > cfg.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Number(row.secondsRemaining) || 1),
    };
  }
  return { allowed: true };
}

function generatePublicReferenceCode(): string {
  return `REQ-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function computeBookingRequestFingerprint(input: {
  roomId: string;
  scope: AllocationScopeValue;
  checkInDateManila: string;
  checkOutDateManila: string;
  partySize: number;
  adultsCount: number | null;
  childrenCount: number | null;
  guestName: string;
  guestAge: number | null;
  guestSex: GuestSexValue | null;
  guestAddress: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  notes: string | null;
}): string {
  const payload = JSON.stringify({
    roomId: input.roomId,
    scope: input.scope,
    checkInDateManila: input.checkInDateManila,
    checkOutDateManila: input.checkOutDateManila,
    partySize: input.partySize,
    adultsCount: input.adultsCount,
    childrenCount: input.childrenCount,
    guestName: input.guestName,
    guestAge: input.guestAge,
    guestSex: input.guestSex,
    guestAddress: input.guestAddress,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail,
    notes: input.notes,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function getDefaultPublicStayDates(): {
  checkInDateManila: string;
  checkOutDateManila: string;
} {
  const today = toManilaDate(new Date());
  return {
    checkInDateManila: addManilaDays(today, 1),
    checkOutDateManila: addManilaDays(today, 2),
  };
}

/**
 * Returns live public availability for published transient rooms ONLY, strictly
 * excluding tenant names, bed numbers, internal notes, and reservation details.
 */
export async function getPublicPublishedAvailability(
  ownerUserId: string,
  rawQuery: PublicAvailabilityQueryInput,
): Promise<PublicAvailabilityDto> {
  const parsed = PublicAvailabilityQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Check your stay dates and guest count.",
    );
  }
  const query = parsed.data;
  const nights = computeTransientNights(
    query.checkInDateManila,
    query.checkOutDateManila,
  );
  if (nights < 1) {
    throw new ValidationError("Check-out date must be after check-in date.");
  }

  const db = getDatabase();
  const [settings, roomRows] = await Promise.all([
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
        transientPolicyNote: true,
      },
    }),
    db.room.findMany({
      where: {
        ownerUserId,
        building: "TRANSIENT",
        archivedAt: null,
        isTransientPublished: true,
      },
      orderBy: [{ title: "asc" }],
      select: {
        id: true,
        title: true,
        capacity: true,
        summary: true,
        transientScope: true,
        transientDailyRate: true,
        photos: {
          orderBy: [
            { role: "asc" },
            { sortOrder: "asc" },
            { updatedAt: "asc" },
          ],
          select: roomPhotoSelect,
        },
        beds: {
          where: { archivedAt: null },
          select: { id: true, status: true },
        },
      },
    }),
  ]);

  const limits = getServerOperationalLimits();
  const checkInTimeManila =
    settings?.checkInTimeManila ?? limits.defaultCheckInTimeManila;
  const checkOutTimeManila =
    settings?.checkOutTimeManila ?? limits.defaultCheckOutTimeManila;

  if (roomRows.length === 0) {
    return {
      propertyName: settings?.businessName || "Daisy Residences",
      propertyAddress: settings?.businessAddress ?? null,
      propertyLatitude: settings?.businessLatitude ?? null,
      propertyLongitude: settings?.businessLongitude ?? null,
      contactPhone: settings?.businessPhone ?? null,
      checkInTimeManila,
      checkOutTimeManila,
      transientPolicyNote: settings?.transientPolicyNote?.trim() || null,
      checkInDateManila: query.checkInDateManila,
      checkOutDateManila: query.checkOutDateManila,
      nights,
      guests: query.guests,
      rooms: [],
    };
  }

  const { startUtc, endUtc } = computeTransientStayUtcBounds({
    checkInDateManila: query.checkInDateManila,
    checkOutDateManila: query.checkOutDateManila,
    checkInTimeHHmm: checkInTimeManila,
    checkOutTimeHHmm: checkOutTimeManila,
  });

  const publishedRoomIds = roomRows.map((r) => r.id);
  const activeOverlaps = await db.allocation.findMany({
    where: {
      ownerUserId,
      roomId: { in: publishedRoomIds },
      status: "ACTIVE",
      startDate: { lt: endUtc },
      endDate: { gt: startUtc },
    },
    select: { bedId: true },
  });
  const blockedBedIds = new Set(activeOverlaps.map((a) => a.bedId));

  const rooms: PublicPublishedRoomDto[] = [];
  for (const room of roomRows) {
    const rateCentavos = resolveTransientDailyRateCentavos({
      roomDailyRate: room.transientDailyRate,
    });
    if (rateCentavos <= ZERO) continue;

    const scope: AllocationScopeValue = room.transientScope ?? "BED";
    const freeBedsCount = room.beds.filter(
      (b) => b.status !== "MAINTENANCE" && !blockedBedIds.has(b.id),
    ).length;

    const availableUnitsForRange =
      scope === "WHOLE_ROOM"
        ? room.beds.length > 0 && freeBedsCount === room.beds.length
          ? 1
          : 0
        : freeBedsCount;

    const isAvailableForRequestedStay =
      scope === "WHOLE_ROOM"
        ? availableUnitsForRange === 1 && query.guests <= room.capacity
        : availableUnitsForRange >= 1 && query.guests <= 1;

    const { previewPhoto, galleryPhotos } = splitRoomPhotoDtos(room.photos, {
      publicRoute: true,
    });

    rooms.push({
      roomId: room.id,
      title: room.title,
      description: room.summary ?? null,
      scope,
      capacity: scope === "WHOLE_ROOM" ? room.capacity : 1,
      availableUnitsForRange,
      isAvailableForRequestedStay,
      dailyRate: formatMoneyDecimal(rateCentavos),
      indicativeTotalAmount: formatMoneyDecimal(
        computeTransientStayTotalCentavos(rateCentavos, nights),
      ),
      previewImageUrl: previewPhoto?.url ?? null,
      galleryImages: galleryPhotos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        caption: photo.caption,
      })),
    });
  }

  return {
    propertyName: settings?.businessName || "Daisy Residences",
    propertyAddress: settings?.businessAddress ?? null,
    propertyLatitude: settings?.businessLatitude ?? null,
    propertyLongitude: settings?.businessLongitude ?? null,
    contactPhone: settings?.businessPhone ?? null,
    checkInTimeManila,
    checkOutTimeManila,
    transientPolicyNote: settings?.transientPolicyNote?.trim() || null,
    checkInDateManila: query.checkInDateManila,
    checkOutDateManila: query.checkOutDateManila,
    nights,
    guests: query.guests,
    rooms,
  };
}

const PublicRoomIdSchema = z.string().uuid();

/**
 * Resolves live public availability scoped to one published transient room,
 * returning `null` for invalid UUIDs or unpublished/archived rooms.
 */
export async function getPublicPublishedRoomAvailability(
  ownerUserId: string,
  roomId: string,
  rawQuery: PublicAvailabilityQueryInput,
): Promise<{
  availability: PublicAvailabilityDto;
  room: PublicPublishedRoomDto;
} | null> {
  const parsedId = PublicRoomIdSchema.safeParse(roomId);
  if (!parsedId.success) {
    return null;
  }
  const availability = await getPublicPublishedAvailability(
    ownerUserId,
    rawQuery,
  );
  const room = availability.rooms.find((r) => r.roomId === parsedId.data);
  if (!room) {
    return null;
  }
  return { availability, room };
}

export const PUBLIC_CALENDAR_DEFAULT_DAYS = 120;
export const PUBLIC_CALENDAR_MAX_DAYS = 180;

const PublicCalendarWindowSchema = z.object({
  fromDateManila: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date.")
    .optional(),
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(PUBLIC_CALENDAR_MAX_DAYS)
    .default(PUBLIC_CALENDAR_DEFAULT_DAYS),
});

export type PublicRoomCalendarDto = {
  roomId: string;
  fromDateManila: string;
  toDateManila: string;
  unavailableDates: string[];
};

/**
 * Returns ONLY bounded unavailable `YYYY-MM-DD` Asia/Manila nights for one
 * published transient room, derived from the shared `Allocation` table.
 * Never exposes guest names, allocation IDs, or block reasons.
 */
export async function getPublicPublishedRoomUnavailableDates(
  ownerUserId: string,
  roomId: string,
  rawOptions: {
    fromDateManila?: string | undefined;
    days?: number | undefined;
  } = {},
): Promise<PublicRoomCalendarDto | null> {
  const parsedId = PublicRoomIdSchema.safeParse(roomId);
  if (!parsedId.success) {
    return null;
  }

  const parsedOptions = PublicCalendarWindowSchema.safeParse(rawOptions);
  if (!parsedOptions.success) {
    throw new ValidationError(
      parsedOptions.error.issues[0]?.message ?? "Invalid calendar date window.",
    );
  }

  const todayManila = toManilaDate(new Date());
  const requestedFrom = parsedOptions.data.fromDateManila ?? todayManila;
  const fromDateManila =
    requestedFrom < todayManila ? todayManila : requestedFrom;
  const days = parsedOptions.data.days;
  const toDateManila = addManilaDays(fromDateManila, days);

  const db = getDatabase();
  const [settings, room] = await Promise.all([
    db.businessSettings.findUnique({
      where: { ownerUserId },
      select: {
        checkInTimeManila: true,
        checkOutTimeManila: true,
      },
    }),
    db.room.findFirst({
      where: {
        id: parsedId.data,
        ownerUserId,
        building: "TRANSIENT",
        archivedAt: null,
        isTransientPublished: true,
      },
      select: {
        id: true,
        transientScope: true,
        transientDailyRate: true,
        beds: {
          where: { archivedAt: null },
          select: { id: true, status: true },
        },
      },
    }),
  ]);

  if (!room) {
    return null;
  }

  const rateCentavos = resolveTransientDailyRateCentavos({
    roomDailyRate: room.transientDailyRate,
  });
  if (rateCentavos <= ZERO) {
    return null;
  }

  const limits = getServerOperationalLimits();
  const checkInTimeManila =
    settings?.checkInTimeManila ?? limits.defaultCheckInTimeManila;
  const checkOutTimeManila =
    settings?.checkOutTimeManila ?? limits.defaultCheckOutTimeManila;

  const { startUtc, endUtc } = computeTransientStayUtcBounds({
    checkInDateManila: fromDateManila,
    checkOutDateManila: toDateManila,
    checkInTimeHHmm: checkInTimeManila,
    checkOutTimeHHmm: checkOutTimeManila,
  });

  const allocations = await db.allocation.findMany({
    where: {
      ownerUserId,
      roomId: room.id,
      status: "ACTIVE",
      startDate: { lt: endUtc },
      endDate: { gt: startUtc },
    },
    select: {
      bedId: true,
      startDate: true,
      endDate: true,
    },
  });

  const scope: AllocationScopeValue = room.transientScope ?? "BED";
  const unavailableDates = computeUnavailableNightDates({
    startDateManila: fromDateManila,
    days,
    checkInTimeHHmm: checkInTimeManila,
    checkOutTimeHHmm: checkOutTimeManila,
    scope,
    beds: room.beds,
    allocations,
  });

  return {
    roomId: room.id,
    fromDateManila,
    toDateManila,
    unavailableDates,
  };
}

export type SubmitPublicBookingResult = {
  ack: PublicBookingAckDto;
  isDuplicate: boolean;
  roomId: string;
};

/**
 * Records a public booking inquiry (`PENDING` review by Owner). Never locks beds
 * until Owner approval, enforces SHA-256 idempotency, writes identifier-only
 * `AuditLog`, and publishes the request onto the Owner's ChangeFeed.
 */
export async function submitPublicBookingRequestWithMeta(
  ownerUserId: string,
  rawInput: SubmitPublicBookingRequestInput,
): Promise<SubmitPublicBookingResult> {
  const parsed = SubmitPublicBookingRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check your booking request fields.",
    );
  }
  const input = parsed.data;
  const nights = computeTransientNights(
    input.checkInDateManila,
    input.checkOutDateManila,
  );
  if (nights < 1) {
    throw new ValidationError("Check-out date must be after check-in date.");
  }

  const fingerprint = computeBookingRequestFingerprint({
    roomId: input.roomId,
    scope: input.scope,
    checkInDateManila: input.checkInDateManila,
    checkOutDateManila: input.checkOutDateManila,
    partySize: input.partySize,
    adultsCount: input.adultsCount,
    childrenCount: input.childrenCount,
    guestName: input.guestName,
    guestAge: input.guestAge,
    guestSex: input.guestSex,
    guestAddress: input.guestAddress,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail,
    notes: input.notes,
  });

  const db = getDatabase();
  return db.$transaction(
    async (tx) => {
      const existing = await tx.bookingRequest.findUnique({
        where: {
          ownerUserId_idempotencyKey: {
            ownerUserId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: {
          id: true,
          roomId: true,
          referenceCode: true,
          requestFingerprint: true,
          status: true,
          scope: true,
          guestName: true,
          guestAge: true,
          guestSex: true,
          guestAddress: true,
          guestPhone: true,
          guestEmail: true,
          checkInDateManila: true,
          checkOutDateManila: true,
          nights: true,
          partySize: true,
          adultsCount: true,
          childrenCount: true,
          quotedDailyRate: true,
          quotedTotalAmount: true,
          createdAt: true,
          room: { select: { title: true } },
        },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new ConflictError(
            "This submission reference was already used with different booking details.",
          );
        }
        return {
          isDuplicate: true,
          roomId: existing.roomId,
          ack: {
            id: existing.id,
            referenceCode: existing.referenceCode,
            status: existing.status,
            roomTitle: existing.room.title,
            scope: existing.scope,
            checkInDateManila: existing.checkInDateManila,
            checkOutDateManila: existing.checkOutDateManila,
            nights: existing.nights,
            partySize: existing.partySize,
            adultsCount: existing.adultsCount,
            childrenCount: existing.childrenCount,
            guestName: existing.guestName,
            guestAge: existing.guestAge,
            guestSex:
              existing.guestSex === "MALE" || existing.guestSex === "FEMALE"
                ? existing.guestSex
                : null,
            guestAddress: existing.guestAddress,
            guestPhone: existing.guestPhone,
            guestEmail: existing.guestEmail,
            quotedDailyRate: formatMoneyDecimal(
              BigInt(
                Math.round(Number(existing.quotedDailyRate.toString()) * 100),
              ),
            ),
            quotedTotalAmount: formatMoneyDecimal(
              BigInt(
                Math.round(Number(existing.quotedTotalAmount.toString()) * 100),
              ),
            ),
            submittedAt: existing.createdAt.toISOString(),
          },
        };
      }

      const limits = getServerOperationalLimits();
      const settings = await tx.businessSettings.findUnique({
        where: { ownerUserId },
        select: { checkInTimeManila: true, checkOutTimeManila: true },
      });
      const checkInTimeManila =
        settings?.checkInTimeManila ?? limits.defaultCheckInTimeManila;
      const checkOutTimeManila =
        settings?.checkOutTimeManila ?? limits.defaultCheckOutTimeManila;

      await lockAllocationResources(tx, ownerUserId, [input.roomId], []);

      const room = await tx.room.findFirst({
        where: {
          id: input.roomId,
          ownerUserId,
          building: "TRANSIENT",
          archivedAt: null,
          isTransientPublished: true,
        },
        select: {
          id: true,
          title: true,
          capacity: true,
          transientScope: true,
          transientDailyRate: true,
          beds: {
            where: { archivedAt: null },
            select: { id: true, status: true },
          },
        },
      });
      if (!room) {
        throw new NotFoundError(
          "Selected option is unavailable for public booking.",
        );
      }

      const allowedScope: AllocationScopeValue = room.transientScope ?? "BED";
      if (input.scope !== allowedScope) {
        throw new ValidationError(
          `This room accepts ${allowedScope === "WHOLE_ROOM" ? "whole-room" : "per-bed"} requests only.`,
        );
      }
      if (allowedScope === "BED" && input.partySize > 1) {
        throw new ValidationError(
          "Per-bed requests accommodate 1 guest; choose a whole-room option for groups.",
        );
      }
      if (allowedScope === "WHOLE_ROOM" && input.partySize > room.capacity) {
        throw new ValidationError(
          `Party size exceeds this room's capacity (${room.capacity}).`,
        );
      }

      const rateCentavos = resolveTransientDailyRateCentavos({
        roomDailyRate: room.transientDailyRate,
      });
      if (rateCentavos <= ZERO) {
        throw new PreconditionError(
          "This room does not have a valid transient rate right now.",
        );
      }

      const { startUtc, endUtc } = computeTransientStayUtcBounds({
        checkInDateManila: input.checkInDateManila,
        checkOutDateManila: input.checkOutDateManila,
        checkInTimeHHmm: checkInTimeManila,
        checkOutTimeHHmm: checkOutTimeManila,
      });

      const activeOverlaps = await tx.allocation.findMany({
        where: {
          ownerUserId,
          roomId: room.id,
          status: "ACTIVE",
          startDate: { lt: endUtc },
          endDate: { gt: startUtc },
        },
        select: { bedId: true },
      });
      const blockedBedIds = new Set(activeOverlaps.map((a) => a.bedId));
      const freeBedsCount = room.beds.filter(
        (b) => b.status !== "MAINTENANCE" && !blockedBedIds.has(b.id),
      ).length;

      const isAvailable =
        allowedScope === "WHOLE_ROOM"
          ? room.beds.length > 0 && freeBedsCount === room.beds.length
          : freeBedsCount >= 1;
      if (!isAvailable) {
        throw new ConflictError(
          "This room is no longer available for your chosen dates.",
        );
      }

      const totalCentavos = computeTransientStayTotalCentavos(
        rateCentavos,
        nights,
      );
      const quotedDailyRateStr = formatMoneyDecimal(rateCentavos);
      const quotedTotalAmountStr = formatMoneyDecimal(totalCentavos);

      let createdId = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const refCode = generatePublicReferenceCode();
        const id = randomUUID();
        try {
          const created = await tx.bookingRequest.create({
            data: {
              id,
              ownerUserId,
              referenceCode: refCode,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: fingerprint,
              roomId: room.id,
              scope: allowedScope,
              guestName: input.guestName,
              guestAge: input.guestAge,
              guestSex: input.guestSex,
              guestAddress: input.guestAddress,
              guestPhone: input.guestPhone,
              guestEmail: input.guestEmail,
              notes: input.notes,
              checkInDateManila: input.checkInDateManila,
              checkOutDateManila: input.checkOutDateManila,
              nights,
              partySize: input.partySize,
              adultsCount: input.adultsCount,
              childrenCount: input.childrenCount,
              quotedDailyRate: quotedDailyRateStr,
              quotedTotalAmount: quotedTotalAmountStr,
              privacyConsentAccepted: true,
              status: "PENDING",
              version: 1,
            },
            select: { id: true },
          });
          createdId = created.id;
          break;
        } catch (error) {
          if (
            isPgConstraintError(
              error,
              "23505",
              "BookingRequest_referenceCode_key",
            ) &&
            attempt < 2
          ) {
            continue;
          }
          if (
            isPgConstraintError(
              error,
              "23505",
              "BookingRequest_ownerUserId_idempotencyKey_key",
            )
          ) {
            throw new ConflictError("Duplicate booking request detected.");
          }
          throw error;
        }
      }

      const saved = await tx.bookingRequest.findUniqueOrThrow({
        where: { id: createdId },
        select: bookingRequestSelect,
      });
      const dto = toBookingRequestDto(saved);
      const sequence = await allocateSyncSequence(tx, ownerUserId);

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "booking_request",
        entityId: dto.id,
        version: dto.version,
        operation: "upsert",
        payload: dto,
      });

      // Strict identifier-only audit metadata — never store visitor PII in AuditLog.
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "transients",
        action: "booking_request.submitted",
        actorType: "public_visitor",
        actorId: "public_booking",
        entityType: "booking_request",
        entityId: dto.id,
        metadata: {
          roomId: dto.roomId,
          scope: dto.scope,
          checkInDateManila: dto.checkInDateManila,
          checkOutDateManila: dto.checkOutDateManila,
          nights: dto.nights,
          partySize: dto.partySize,
          ...(dto.adultsCount !== null ? { adultsCount: dto.adultsCount } : {}),
          ...(dto.childrenCount !== null
            ? { childrenCount: dto.childrenCount }
            : {}),
        },
      });

      return {
        isDuplicate: false,
        roomId: room.id,
        ack: {
          id: dto.id,
          referenceCode: dto.referenceCode,
          status: dto.status,
          roomTitle: room.title,
          scope: dto.scope,
          checkInDateManila: dto.checkInDateManila,
          checkOutDateManila: dto.checkOutDateManila,
          nights: dto.nights,
          partySize: dto.partySize,
          adultsCount: dto.adultsCount,
          childrenCount: dto.childrenCount,
          guestName: dto.guestName,
          guestAge: dto.guestAge,
          guestSex: dto.guestSex,
          guestAddress: dto.guestAddress,
          guestPhone: dto.guestPhone,
          guestEmail: dto.guestEmail,
          quotedDailyRate: dto.quotedDailyRate,
          quotedTotalAmount: dto.quotedTotalAmount,
          submittedAt: dto.createdAt,
        },
      };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function submitPublicBookingRequest(
  ownerUserId: string,
  rawInput: SubmitPublicBookingRequestInput,
): Promise<PublicBookingAckDto> {
  const result = await submitPublicBookingRequestWithMeta(
    ownerUserId,
    rawInput,
  );
  return result.ack;
}

/**
 * Looks up the live status of a public booking request by requiring BOTH the
 * unpredictable reference code (`REQ-...`) and the submitted email address.
 * Returns only minimal stay-status fields (never full guest PII or internal notes).
 */
export async function lookupPublicBookingRequestStatus(
  ownerUserId: string,
  rawInput: LookupPublicBookingRequestInput,
): Promise<PublicBookingStatusDto> {
  const parsed = LookupPublicBookingRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Enter your booking reference number and email address.",
    );
  }
  const { referenceCode, guestEmail } = parsed.data;
  const db = getDatabase();

  const [request, settings] = await Promise.all([
    db.bookingRequest.findFirst({
      where: {
        ownerUserId,
        referenceCode,
        guestEmail: {
          equals: guestEmail,
          mode: "insensitive",
        },
      },
      select: {
        referenceCode: true,
        status: true,
        scope: true,
        checkInDateManila: true,
        checkOutDateManila: true,
        nights: true,
        partySize: true,
        adultsCount: true,
        childrenCount: true,
        quotedDailyRate: true,
        quotedTotalAmount: true,
        rejectionReason: true,
        createdAt: true,
        reviewedAt: true,
        approvedReservationId: true,
        room: {
          select: {
            title: true,
          },
        },
      },
    }),
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
  ]);

  if (!request) {
    throw new NotFoundError(
      "No booking request matched that reference number and email address.",
    );
  }

  let reservationStatus: PublicBookingStatusDto["reservationStatus"] = null;
  if (request.approvedReservationId) {
    const reservation = await db.transientReservation.findFirst({
      where: {
        id: request.approvedReservationId,
        ownerUserId,
      },
      select: { status: true },
    });
    reservationStatus = reservation?.status ?? null;
  }

  return {
    referenceCode: request.referenceCode,
    status: request.status,
    reservationStatus,
    roomTitle: request.room.title,
    scope: request.scope,
    checkInDateManila: request.checkInDateManila,
    checkOutDateManila: request.checkOutDateManila,
    checkInTimeManila:
      settings?.checkInTimeManila ??
      getServerOperationalLimits().defaultCheckInTimeManila,
    checkOutTimeManila:
      settings?.checkOutTimeManila ??
      getServerOperationalLimits().defaultCheckOutTimeManila,
    nights: request.nights,
    partySize: request.partySize,
    adultsCount: request.adultsCount,
    childrenCount: request.childrenCount,
    quotedDailyRate: formatMoneyDecimal(
      BigInt(Math.round(Number(request.quotedDailyRate.toString()) * 100)),
    ),
    quotedTotalAmount: formatMoneyDecimal(
      BigInt(Math.round(Number(request.quotedTotalAmount.toString()) * 100)),
    ),
    rejectionReason:
      request.status === "REJECTED" ? request.rejectionReason : null,
    submittedAt: request.createdAt.toISOString(),
    reviewedAt: request.reviewedAt ? request.reviewedAt.toISOString() : null,
    propertyName: settings?.businessName || "Daisy Residences",
    propertyAddress: settings?.businessAddress ?? null,
    propertyLatitude: settings?.businessLatitude ?? null,
    propertyLongitude: settings?.businessLongitude ?? null,
    contactPhone: settings?.businessPhone ?? null,
  };
}
