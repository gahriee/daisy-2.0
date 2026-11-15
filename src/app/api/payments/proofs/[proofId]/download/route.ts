import { z } from "zod";
import { getAuthorizedProofDownload } from "@/features/payments/proofs";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  errorToResponse,
  jsonPrivate,
  PRIVATE_RESPONSE_HEADERS,
} from "@/server/http/route-helpers";

const ProofIdSchema = z.string().uuid("Invalid payment proof identifier.");

/**
 * Owner-authorized private download endpoint for payment proof attachments.
 * Mints a 60s signed Object Storage URL and marks responses private, no-store.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ proofId: string }> },
): Promise<Response> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const { proofId } = await context.params;
    const parsedId = ProofIdSchema.safeParse(proofId);
    if (!parsedId.success) {
      throw new ValidationError("Invalid payment proof identifier.");
    }

    const download = await getAuthorizedProofDownload({
      ownerUserId,
      proofId: parsedId.data,
    });

    const url = new URL(request.url);
    if (url.searchParams.get("format") === "json") {
      return jsonPrivate({
        downloadUrl: download.url,
        fileName: download.fileName,
        mimeType: download.mimeType,
        byteSize: download.byteSize,
        expiresInSeconds: 60,
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
