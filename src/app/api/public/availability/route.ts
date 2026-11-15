import {
  consumePublicBookingRateLimit,
  derivePublicClientBucketKey,
  getDefaultPublicStayDates,
  getPublicPublishedAvailability,
  resolvePublicOwnerUserId,
} from "@/features/transients/public-service";
import { RateLimitedError } from "@/lib/errors";
import { errorToResponse } from "@/server/http/route-helpers";

/**
 * Public `no-store` live availability endpoint returning only Owner-published
 * transient rooms and aggregate unit counts for the requested Asia/Manila stay.
 */
export async function GET(request: Request) {
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
    const url = new URL(request.url);
    const defaults = getDefaultPublicStayDates();
    const checkInDateManila =
      url.searchParams.get("checkIn") ?? defaults.checkInDateManila;
    const checkOutDateManila =
      url.searchParams.get("checkOut") ?? defaults.checkOutDateManila;
    const guestsRaw = url.searchParams.get("guests") ?? "1";

    const dto = await getPublicPublishedAvailability(ownerUserId, {
      checkInDateManila,
      checkOutDateManila,
      guests: Number(guestsRaw),
    });

    return Response.json(dto, {
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

