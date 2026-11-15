import { z } from "zod";
import { getPublicRoomPhotoBytes } from "@/features/rooms/photos";
import { resolvePublicOwnerUserId } from "@/features/transients/public-service";
import { ValidationError } from "@/lib/errors";
import { errorToResponse } from "@/server/http/route-helpers";

const PhotoIdSchema = z.string().uuid("Invalid public room photo identifier.");

/**
 * Public `no-store` same-origin image proxy for published transient room cards
 * and galleries, strictly returning 404 for unpublished or archived rooms.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ photoId: string }> },
): Promise<Response> {
  try {
    const ownerUserId = resolvePublicOwnerUserId();
    const { photoId } = await context.params;
    const parsedId = PhotoIdSchema.safeParse(photoId);
    if (!parsedId.success) {
      throw new ValidationError("Invalid public room photo identifier.");
    }

    const file = await getPublicRoomPhotoBytes(ownerUserId, parsedId.data);
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

