import { createMaintenanceAttachmentIntent } from "@/features/maintenance/attachments";
import { CreateMaintenanceAttachmentIntentSchema } from "@/features/maintenance/schemas";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";

/**
 * Mints or reuses an Owner-scoped maintenance attachment upload intent outside
 * any database transaction.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 8192);
    const parsed = CreateMaintenanceAttachmentIntentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Check the selected attachment.",
      );
    }

    const intent = await createMaintenanceAttachmentIntent({
      ownerUserId,
      rawInput: parsed.data,
    });

    return jsonPrivate(intent, intent.reused ? 200 : 201);
  } catch (error) {
    return errorToResponse(error);
  }
}
