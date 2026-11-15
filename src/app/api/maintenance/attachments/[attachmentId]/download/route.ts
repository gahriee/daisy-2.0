import { z } from "zod";
import { getAuthorizedMaintenanceAttachmentDownload } from "@/features/maintenance/attachments";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  errorToResponse,
  jsonPrivate,
  PRIVATE_RESPONSE_HEADERS,
} from "@/server/http/route-helpers";

const AttachmentIdSchema = z
  .string()
  .uuid("Invalid maintenance attachment identifier.");

/**
 * Owner-authorized private download endpoint for maintenance attachments.
 * Mints a 60s signed Object Storage URL and marks responses private, no-store.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const { attachmentId } = await context.params;
    const parsedId = AttachmentIdSchema.safeParse(attachmentId);
    if (!parsedId.success) {
      throw new ValidationError("Invalid maintenance attachment identifier.");
    }

    const download = await getAuthorizedMaintenanceAttachmentDownload(
      ownerUserId,
      parsedId.data,
    );

    const url = new URL(request.url);
    if (url.searchParams.get("format") === "json") {
      return jsonPrivate({
        downloadUrl: download.url,
        fileName: download.fileName,
        mimeType: download.mimeType,
        expiresInSeconds: download.expiresInSeconds,
      });
    }

    return new Response(null, {
      status: 307,
      headers: {
        ...PRIVATE_RESPONSE_HEADERS,
        Location: download.url,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
