import { readDeviceTokenFromCookieHeader } from "@/server/auth/device";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";
import { bootstrapSyncSnapshot } from "@/server/sync/service";

/**
 * Reconstructs a fixed-watermark Owner snapshot from immutable `ChangeFeed`
 * history (<= 100 records per page) and issues a signed opaque `syncCursor` once
 * complete. Read-only snapshot transport protected by Owner + active device auth.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const deviceToken = readDeviceTokenFromCookieHeader(
      request.headers.get("cookie"),
    );

    const hasBody =
      (request.headers.get("content-type") ?? "")
        .toLowerCase()
        .includes("application/json") &&
      request.headers.get("content-length") !== "0";
    const rawBody = hasBody ? await readBoundedJson(request, 16_384) : {};

    const page = await bootstrapSyncSnapshot({
      ownerUserId,
      deviceToken,
      rawBody,
    });
    return jsonPrivate(page);
  } catch (error) {
    return errorToResponse(error);
  }
}
