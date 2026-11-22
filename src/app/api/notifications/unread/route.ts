import { NotificationKeysBatchSchema } from "@/features/notifications/schemas";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";
import { markOwnerNotificationsUnread } from "@/server/notifications/service";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 4096);
    const parsed = NotificationKeysBatchSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        "Select at least one notification to mark unread.",
      );
    }
    await markOwnerNotificationsUnread(ownerUserId, parsed.data.keys);
    return jsonPrivate({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
