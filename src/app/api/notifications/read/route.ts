import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";
import { markOwnerNotificationsRead } from "@/server/notifications/service";

const MarkReadSchema = z.object({
  keys: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 4096);
    const parsed = MarkReadSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        "Select at least one notification to mark read.",
      );
    }
    await markOwnerNotificationsRead(ownerUserId, parsed.data.keys);
    return jsonPrivate({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
