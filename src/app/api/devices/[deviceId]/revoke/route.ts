import { DeviceIdSchema } from "@/features/devices/schemas";
import { ValidationError } from "@/lib/errors";
import { revokeOwnerDevice } from "@/server/auth/device";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
} from "@/server/http/route-helpers";

export async function POST(
  request: Request,
  context: { params: Promise<{ deviceId: string }> },
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const { deviceId } = await context.params;
    const parsed = DeviceIdSchema.safeParse(deviceId);
    if (!parsed.success) {
      throw new ValidationError("Invalid device identifier.");
    }

    const result = await revokeOwnerDevice({
      ownerUserId,
      deviceId: parsed.data,
    });
    return jsonPrivate(result);
  } catch (error) {
    return errorToResponse(error);
  }
}
