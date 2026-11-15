import { getBillingOverview } from "@/features/billing/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Private no-store Owner endpoint returning billing overview, policy state,
 * and invoice ledger projections.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const overview = await getBillingOverview(ownerUserId);
    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
