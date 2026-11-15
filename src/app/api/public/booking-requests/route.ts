import {
  consumePublicBookingRateLimit,
  derivePublicClientBucketKey,
  resolvePublicOwnerUserId,
  submitPublicBookingRequest,
} from "@/features/transients/public-service";
import type { SubmitPublicBookingRequestInput } from "@/features/transients/schemas";
import { RateLimitedError } from "@/lib/errors";
import {
  assertSameOrigin,
  errorToResponse,
  readBoundedJson,
} from "@/server/http/route-helpers";

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
    const ack = await submitPublicBookingRequest(ownerUserId, body);

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

