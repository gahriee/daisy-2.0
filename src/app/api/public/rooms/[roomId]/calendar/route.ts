import {
  PUBLIC_CALENDAR_DEFAULT_DAYS,
  consumePublicBookingRateLimit,
  derivePublicClientBucketKey,
  getPublicPublishedRoomUnavailableDates,
  resolvePublicOwnerUserId,
} from "@/features/transients/public-service";
import { NotFoundError, RateLimitedError } from "@/lib/errors";
import { errorToResponse } from "@/server/http/route-helpers";

/**
 * Public `no-store` endpoint returning ONLY bounded unavailable `YYYY-MM-DD`
 * Asia/Manila nights for a published transient room so the interactive booking
 * calendar can disable occupied dates without exposing any private details.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const clientKey = derivePublicClientBucketKey(request.headers);
    const limit = await consumePublicBookingRateLimit({
      bucket: "availability",
      clientKey,
    });
    if (!limit.allowed) {
      throw new RateLimitedError(
        limit.retryAfterSeconds,
        "Too many availability lookups. Please wait a moment and try again.",
      );
    }

    const ownerUserId = resolvePublicOwnerUserId();
    const { roomId } = await context.params;
    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from")?.trim() || undefined;
    const daysRaw = url.searchParams.get("days");
    const days =
      daysRaw !== null && daysRaw.trim() !== ""
        ? Number(daysRaw)
        : PUBLIC_CALENDAR_DEFAULT_DAYS;

    const calendar = await getPublicPublishedRoomUnavailableDates(
      ownerUserId,
      roomId,
      {
        fromDateManila: fromParam,
        days,
      },
    );
    if (!calendar) {
      throw new NotFoundError("Room availability calendar not found.");
    }

    return Response.json(calendar, {
      status: 200,
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
