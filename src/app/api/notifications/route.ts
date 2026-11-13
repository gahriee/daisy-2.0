import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";
import { listOwnerNotifications } from "@/server/notifications/service";

export async function GET(): Promise<Response> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const notifications = await listOwnerNotifications(ownerUserId);
    return jsonPrivate({ notifications });
  } catch (error) {
    return errorToResponse(error);
  }
}
