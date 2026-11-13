import { listTenantsOverview } from "@/features/tenants/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Private no-store Owner endpoint returning tenant profiles, active assignments,
 * and assignable bed options.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const overview = await listTenantsOverview(ownerUserId);
    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
