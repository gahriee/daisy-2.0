import { getDashboardSnapshot } from "@/features/dashboard/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Bounded, Owner-scoped consistent operational snapshot for Dashboard refresh.
 * Read-only: produces zero audit or notification records.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const snapshot = await getDashboardSnapshot(ownerUserId);
    return jsonPrivate(snapshot);
  } catch (error) {
    return errorToResponse(error);
  }
}

