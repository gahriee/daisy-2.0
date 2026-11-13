import { listAuditLogs } from "@/features/audit/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Bounded, read-only Owner audit endpoint powering dynamic filter updates.
 * Produces zero audit or notification records.
 */
export async function GET(request: Request) {
  try {
    const ownerUserId = await requireOwnerUserId();
    const { searchParams } = new URL(request.url);

    const result = await listAuditLogs(ownerUserId, {
      area: (searchParams.get("area") ?? undefined) as never,
      query: searchParams.get("query") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    return jsonPrivate(result);
  } catch (error) {
    return errorToResponse(error);
  }
}
