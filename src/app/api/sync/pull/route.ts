import { readDeviceTokenFromCookieHeader } from "@/server/auth/device";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";
import { pullSyncChanges } from "@/server/sync/service";

/**
 * Returns committed `ChangeFeed` deltas strictly after the verified opaque pull
 * cursor up to the captured `SyncHead` watermark (<= 100 entries per page).
 * Rejects tampered, expired, rotated, or history-gapped cursors with 410.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const deviceToken = readDeviceTokenFromCookieHeader(
      request.headers.get("cookie"),
    );
    const { searchParams } = new URL(request.url);

    const page = await pullSyncChanges({
      ownerUserId,
      deviceToken,
      rawQuery: {
        cursor: searchParams.get("cursor") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
      },
    });
    return jsonPrivate(page);
  } catch (error) {
    return errorToResponse(error);
  }
}

