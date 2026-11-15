import { getMaintenanceOverview } from "@/features/maintenance/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Private no-store Owner endpoint returning maintenance requests, status totals,
 * and room/bed hold options.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const overview = await getMaintenanceOverview(ownerUserId);
    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
