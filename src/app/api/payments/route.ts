import { getPaymentsOverview } from "@/features/payments/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Private no-store Owner endpoint returning payment ledger, tenant credit
 * totals, and open invoice allocation options.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const overview = await getPaymentsOverview(ownerUserId);
    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
