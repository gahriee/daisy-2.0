import { getReportsOverview } from "@/features/reports/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Bounded, Owner-scoped consistent snapshot across all six operational reports.
 * Read-only: produces zero audit or notification records.
 */
export async function GET(request: Request) {
  try {
    const ownerUserId = await requireOwnerUserId();
    const { searchParams } = new URL(request.url);

    const overview = await getReportsOverview(ownerUserId, {
      asOfDate: searchParams.get("asOfDate") ?? undefined,
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
      building: searchParams.get("building") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
