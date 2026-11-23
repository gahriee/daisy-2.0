import {
  formatStayTime,
  getScopeLabel,
} from "@/features/transients/public-booking-view";
import {
  consumePublicBookingRateLimit,
  derivePublicClientBucketKey,
  resolvePublicOwnerUserId,
  submitPublicBookingRequestWithMeta,
} from "@/features/transients/public-service";
import type { SubmitPublicBookingRequestInput } from "@/features/transients/schemas";
import { RateLimitedError } from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import {
  assertSameOrigin,
  errorToResponse,
  readBoundedJson,
} from "@/server/http/route-helpers";
import { sendBookingPendingEmailSafe } from "@/server/mail/booking-mailer";
import { notifyOwnerPushSafe } from "@/server/notifications/web-push";

function resolvePublicAppOrigin(request: Request): string {
  const configured = process.env.APP_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  try {
    return new URL(request.url).origin.replace(/\/+$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * Public same-origin POST endpoint for transient booking requests. Enforces
 * Origin check, bounded 8 KB JSON payload, PostgreSQL-backed rate limit,
 * idempotency replay safety, and identifier-only AuditLog entries.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await readBoundedJson(
      request,
      8192,
    )) as SubmitPublicBookingRequestInput;

    const clientKey = derivePublicClientBucketKey(request.headers);
    const limit = await consumePublicBookingRateLimit({
      bucket: "submit",
      clientKey,
    });
    if (!limit.allowed) {
      throw new RateLimitedError(
        limit.retryAfterSeconds,
        "Too many booking requests from this connection. Please try again later.",
      );
    }

    const ownerUserId = resolvePublicOwnerUserId();
    const { ack, isDuplicate, roomId } =
      await submitPublicBookingRequestWithMeta(ownerUserId, body);

    if (!isDuplicate) {
      const appOrigin = resolvePublicAppOrigin(request);
      const sendPendingEmail = async () => {
        if (!ack.guestEmail) return;
        const db = getDatabase();
        const [settings, roomPhoto] = await Promise.all([
          db.businessSettings.findUnique({
            where: { ownerUserId },
            select: {
              businessName: true,
              businessAddress: true,
              businessPhone: true,
              checkInTimeManila: true,
              checkOutTimeManila: true,
            },
          }),
          db.roomPhoto.findFirst({
            where: { roomId, ownerUserId, role: "PREVIEW" },
            select: { id: true },
          }),
        ]);
        const roomPhotoUrl =
          roomPhoto?.id && /^https:\/\//i.test(appOrigin)
            ? `${appOrigin}/api/public/room-photos/${roomPhoto.id}`
            : null;
        await sendBookingPendingEmailSafe(
          {
            toEmail: ack.guestEmail,
            guestName: ack.guestName,
            referenceCode: ack.referenceCode,
            propertyName: settings?.businessName || "Daisy Residences",
            propertyAddress: settings?.businessAddress ?? null,
            contactPhone: settings?.businessPhone ?? null,
            roomTitle: ack.roomTitle,
            scopeLabel: getScopeLabel(ack.scope),
            roomPhotoUrl,
            checkInDateManila: ack.checkInDateManila,
            checkOutDateManila: ack.checkOutDateManila,
            checkInTimeLabel: formatStayTime(settings?.checkInTimeManila ?? ""),
            checkOutTimeLabel: formatStayTime(
              settings?.checkOutTimeManila ?? "",
            ),
            nights: ack.nights,
            partySize: ack.partySize,
            dailyRate: ack.quotedDailyRate,
            estimatedTotalAmount: ack.quotedTotalAmount,
            trackUrl: `${appOrigin}/book#track`,
          },
          { ownerUserId },
        );
      };

      await Promise.allSettled([
        notifyOwnerPushSafe(ownerUserId, {
          title: "New booking request",
          body: `Request ${ack.referenceCode} is waiting for your review.`,
          url: "/transients/requests",
          tag: `booking-request-${ack.referenceCode}`,
        }),
        sendPendingEmail(),
      ]);
    }

    return Response.json(ack, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

