import { revalidatePath } from "next/cache";
import { RegisterDeviceSchema } from "@/features/devices/schemas";
import { ValidationError } from "@/lib/errors";
import {
  buildDeviceCookieHeader,
  readDeviceTokenFromCookieHeader,
  registerOwnerDevice,
} from "@/server/auth/device";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 4096);
    const parsed = RegisterDeviceSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Enter a valid device name.",
      );
    }

    const existingToken = readDeviceTokenFromCookieHeader(
      request.headers.get("cookie"),
    );
    const result = await registerOwnerDevice({
      ownerUserId,
      label: parsed.data.label,
      existingToken,
    });

    const extraHeaders = result.rawToken
      ? { "Set-Cookie": buildDeviceCookieHeader(result.rawToken) }
      : undefined;

    try {
      revalidatePath("/settings/devices");
      revalidatePath("/audit");
    } catch {
      // Ignore outside Next.js request store (e.g. integration tests).
    }

    return jsonPrivate(
      {
        deviceId: result.deviceId,
        label: result.label,
        createdAt: result.createdAt,
        reused: result.reused,
      },
      result.reused ? 200 : 201,
      extraHeaders,
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
