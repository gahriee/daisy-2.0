import { getTransientsOverview } from "@/features/transients/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Private no-store Owner endpoint returning transient booking requests, stays,
 * guests, and room publishing settings.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const overview = await getTransientsOverview(ownerUserId);
    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
