import { createRoomPhotoIntent } from "@/features/rooms/photos";
import { CreateRoomPhotoIntentSchema } from "@/features/rooms/schemas";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";

/**
 * Registers an Owner-scoped room photo upload intent outside database transactions.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 8192);
    const parsed = CreateRoomPhotoIntentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Check the selected room image.",
      );
    }

    const intent = await createRoomPhotoIntent({
      ownerUserId,
      rawInput: parsed.data,
    });

    return jsonPrivate(intent, 201);
  } catch (error) {
    return errorToResponse(error);
  }
}
