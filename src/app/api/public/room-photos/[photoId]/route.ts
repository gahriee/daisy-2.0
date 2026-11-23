import { z } from "zod";
import { getPublicRoomPhotoBytes } from "@/features/rooms/photos";
import { resolvePublicOwnerUserId } from "@/features/transients/public-service";
import { ValidationError } from "@/lib/errors";
import { errorToResponse } from "@/server/http/route-helpers";

const PhotoIdSchema = z.string().uuid("Invalid public room photo identifier.");

/**
 * Public same-origin image proxy for published transient room cards and
 * galleries, strictly returning 404 for unpublished or archived rooms.
 * Uses short-lived public caching with ETag revalidation so repeated renders
 * across hero decks, carousels, and detail pages reuse the browser cache.
 */
export async function GET(
  request: Request,
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
    const etag = `"room-photo-${parsedId.data}-${file.updatedAt.getTime()}"`;
    const cacheHeaders = {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      ETag: etag,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    };

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: cacheHeaders,
      });
    }

    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        ...cacheHeaders,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

