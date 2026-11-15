import { z } from "zod";
import { uploadProofIntentContent } from "@/features/payments/proofs";
import { AppError, ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
} from "@/server/http/route-helpers";

const IntentIdSchema = z.string().uuid("Invalid proof upload intent ID.");
const MAX_UPLOAD_BODY_BYTES = 20 * 1024 * 1024;

async function readBoundedBinaryBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) {
    throw new ValidationError("Upload body is required.");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError(
        "validation_error",
        413,
        "Uploaded proof file exceeds the maximum allowed size.",
      );
    }
    chunks.push(step.value);
  }

  if (total === 0) {
    throw new ValidationError("Uploaded proof file cannot be empty.");
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

/**
 * Authenticated same-origin upload relay for browser proof files into Neon
 * private storage, bounded to configured limits and verified via SHA-256.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ intentId: string }> },
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const { intentId } = await context.params;
    const parsedId = IntentIdSchema.safeParse(intentId);
    if (!parsedId.success) {
      throw new ValidationError("Invalid proof upload intent identifier.");
    }

    const bodyBytes = await readBoundedBinaryBody(
      request,
      MAX_UPLOAD_BODY_BYTES,
    );
    const result = await uploadProofIntentContent({
      ownerUserId,
      intentId: parsedId.data,
      contentType: request.headers.get("content-type"),
      bodyBytes,
    });

    return jsonPrivate(result, 200);
  } catch (error) {
    return errorToResponse(error);
  }
}
