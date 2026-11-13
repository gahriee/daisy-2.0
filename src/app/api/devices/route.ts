import {
  listOwnerDevices,
  readDeviceTokenFromCookieHeader,
} from "@/server/auth/device";
import { requireOwnerUserId } from "@/server/auth/owner";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";

export async function GET(request: Request): Promise<Response> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const currentToken = readDeviceTokenFromCookieHeader(
      request.headers.get("cookie"),
    );
    const devices = await listOwnerDevices(ownerUserId, currentToken);
    return jsonPrivate({ devices });
  } catch (error) {
    return errorToResponse(error);
  }
}
