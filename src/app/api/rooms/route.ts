import { NextRequest } from "next/server";
import {
  ROOM_BUILDINGS,
  type RoomBuildingValue,
} from "@/features/rooms/schemas";
import { listInventoryOverview } from "@/features/rooms/service";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

/**
 * Private no-store Owner endpoint returning rooms, beds, and derived occupancy counts.
 */
export async function GET(request: NextRequest) {
  try {
    const ownerUserId = await requireOwnerUserId();
    const rawBuilding = request.nextUrl.searchParams.get("building");
    let building: RoomBuildingValue | undefined;
    if (rawBuilding !== null && rawBuilding !== "") {
      if (!ROOM_BUILDINGS.includes(rawBuilding as RoomBuildingValue)) {
        throw new ValidationError(
          "Select BOARDING or TRANSIENT for the building filter.",
        );
      }
      building = rawBuilding as RoomBuildingValue;
    }
    const overview = await listInventoryOverview(
      ownerUserId,
      building ? { building } : undefined,
    );
    return jsonPrivate(overview);
  } catch (error) {
    return errorToResponse(error);
  }
}
