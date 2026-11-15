import { createTenantContractIntent } from "@/features/tenants/contracts";
import { CreateTenantContractIntentSchema } from "@/features/tenants/schemas";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";

/**
 * Registers an Owner-scoped upload intent for a single signed contract page or PDF.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 8192);
    const parsed = CreateTenantContractIntentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Check the selected contract file.",
      );
    }

    const intent = await createTenantContractIntent({
      ownerUserId,
      rawInput: parsed.data,
    });
    return jsonPrivate(intent, 201);
  } catch (error) {
    return errorToResponse(error);
  }
}
