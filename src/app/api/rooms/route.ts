import { listInventoryOverview } from "@/features/rooms/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Private no-store Owner endpoint returning rooms, beds, and derived occupancy counts.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const overview = await listInventoryOverview(ownerUserId);
    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
