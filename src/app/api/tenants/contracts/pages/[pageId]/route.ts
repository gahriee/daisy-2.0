import { z } from "zod";
import { getAuthorizedTenantContractPageBytes } from "@/features/tenants/contracts";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  errorToResponse,
  PRIVATE_RESPONSE_HEADERS,
} from "@/server/http/route-helpers";

const PageIdSchema = z.string().uuid("Invalid contract page identifier.");

/**
 * Owner-authorized file proxy for private signed tenant contract pages & PDFs.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ pageId: string }> },
): Promise<Response> {
  try {
    const ownerUserId = await requireOwnerUserId();
    const { pageId } = await context.params;
    const parsedId = PageIdSchema.safeParse(pageId);
    if (!parsedId.success) {
      throw new ValidationError("Invalid contract page identifier.");
    }

    const file = await getAuthorizedTenantContractPageBytes(
      ownerUserId,
      parsedId.data,
    );
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
