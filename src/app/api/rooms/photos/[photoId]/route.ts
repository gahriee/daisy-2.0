import { z } from "zod";
import { getAuthorizedRoomPhotoBytes } from "@/features/rooms/photos";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  errorToResponse,
  PRIVATE_RESPONSE_HEADERS,
} from "@/server/http/route-helpers";

const PhotoIdSchema = z.string().uuid("Invalid room photo identifier.");

/**
 * Owner-authorized image proxy for room preview and gallery thumbnails inside
 * authenticated workspaces.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ photoId: string }> },
): Promise<Response> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const { photoId } = await context.params;
    const parsedId = PhotoIdSchema.safeParse(photoId);
    if (!parsedId.success) {
      throw new ValidationError("Invalid room photo identifier.");
    }

    const file = await getAuthorizedRoomPhotoBytes(ownerUserId, parsedId.data);
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        ...PRIVATE_RESPONSE_HEADERS,
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
