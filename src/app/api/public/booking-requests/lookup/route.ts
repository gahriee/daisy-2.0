import {
  consumePublicBookingRateLimit,
  derivePublicClientBucketKey,
  lookupPublicBookingRequestStatus,
  resolvePublicOwnerUserId,
} from "@/features/transients/public-service";
import type { LookupPublicBookingRequestInput } from "@/features/transients/schemas";
import { RateLimitedError } from "@/lib/errors";
import {
  assertSameOrigin,
  errorToResponse,
  readBoundedJson,
} from "@/server/http/route-helpers";

/**
 * Public same-origin POST endpoint to look up a booking request's live status
 * using BOTH reference code and submitted email address. Enforces Origin check,
 * bounded 2 KB payload, PostgreSQL-backed rate limit, and `no-store` headers.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await readBoundedJson(
      request,
      2048,
    )) as LookupPublicBookingRequestInput;

    const clientKey = derivePublicClientBucketKey(request.headers);
    const limit = await consumePublicBookingRateLimit({
      bucket: "lookup",
      clientKey,
    });
    if (!limit.allowed) {
      throw new RateLimitedError(
        limit.retryAfterSeconds,
        "Too many booking lookups right now. Please wait a moment and try again.",
      );
    }

    const ownerUserId = resolvePublicOwnerUserId();
    const statusDto = await lookupPublicBookingRequestStatus(ownerUserId, body);

    return Response.json(statusDto, {
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
