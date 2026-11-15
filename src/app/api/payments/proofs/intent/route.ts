import { createProofUploadIntent } from "@/features/payments/proofs";
import { CreateProofUploadIntentSchema } from "@/features/payments/schemas";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";

/**
 * Mints or reuses an Owner-scoped proof upload intent and short-lived presigned
 * upload target outside any database write transaction.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 8192);
    const parsed = CreateProofUploadIntentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Check the selected proof file.",
      );
    }

    const intent = await createProofUploadIntent({
      ownerUserId,
      rawInput: parsed.data,
    });

    return jsonPrivate(intent, intent.reused ? 200 : 201);
  } catch (error) {
    return errorToResponse(error);
  }
}
