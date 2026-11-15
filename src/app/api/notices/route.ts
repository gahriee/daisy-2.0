import { getNoticesOverview } from "@/features/notices/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Private no-store Owner endpoint returning property/room/tenant notices and
 * active audience selection options.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const overview = await getNoticesOverview(ownerUserId);
    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
