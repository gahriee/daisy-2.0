import { revalidatePath } from "next/cache";
import { SYNC_PUSH_MAX_BYTES } from "@/features/sync/contracts";
import { readDeviceTokenFromCookieHeader } from "@/server/auth/device";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";
import { pushSyncOperations } from "@/server/sync/service";

/**
 * Accepts 1–50 offline-queued operations (<= 1 MB), executes each in its own
 * transaction under device row share lock + SyncHead lock, and returns typed
 * per-operation outcomes.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const deviceToken = readDeviceTokenFromCookieHeader(
      request.headers.get("cookie"),
    );
    const rawBody = await readBoundedJson(request, SYNC_PUSH_MAX_BYTES);

    const result = await pushSyncOperations({
      ownerUserId,
      deviceToken,
      rawBody,
    });
    if (result.outcomes.some((outcome) => outcome.status === "applied")) {
      try {
        revalidatePath("/", "layout");
      } catch {
        // Ignore when invoked outside a Next.js request store (e.g. integration tests).
      }
    }
    return jsonPrivate(result);
  } catch (error) {
    return errorToResponse(error);
  }
}
