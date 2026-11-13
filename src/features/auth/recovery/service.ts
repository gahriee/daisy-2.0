import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuth } from "@/server/auth/server";
import {
  consumeRecoveryLimit,
  matchesOwnerEmail,
  recordRecoveryEvent,
} from "@/server/security/recovery-store";
import { projectRecoveryNotification } from "./notifications";
import { requestCodeSchema, resetPasswordSchema } from "./schemas";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
export async function recoverPassword(
  request: Request,
  action: "send" | "reset",
): Promise<Response> {
  const respond = (
    body: unknown,
    status: number,
    extra: Record<string, string> = {},
  ) =>
    Response.json(body, { status, headers: { ...privateHeaders, ...extra } });
  if (
    !process.env.APP_ORIGIN ||
    request.headers.get("origin") !== process.env.APP_ORIGIN
  )
    return respond({ error: "Forbidden" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return respond({ error: "Send JSON" }, 415);
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId)
    return respond(
      { error: "Recovery is not configured. Contact the Owner." },
      503,
    );
  let body: unknown;
  try {
    // Bound the stream itself; Content-Length is untrusted.
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "Enter the required details." }, 400);
    let text = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return respond({ error: "Request too large" }, 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    body = JSON.parse(text + decoder.decode());
  } catch {
    return respond({ error: "Enter the required details." }, 400);
  }
  const parsed = (
    action === "send" ? requestCodeSchema : resetPasswordSchema
  ).safeParse(body);
  if (!parsed.success)
    return respond(
      {
        error:
          action === "send"
            ? "Enter a valid email address."
            : "Enter a valid email, code and a password of 12–128 characters.",
      },
      400,
    );
  let resetSubmitted = false;
  try {
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!secret || secret.length < 32)
      return respond(
        { error: "Recovery is not configured. Contact the Owner." },
        503,
      );
    const publicRetry = await consumeRecoveryLimit(ownerId, "probe");
    if (publicRetry)
      return respond({ error: "Too many attempts. Try again later." }, 429, {
        "Retry-After": String(publicRetry),
      });
    // Per-address HMAC counters avoid both account enumeration and unrelated-email lockouts.
    const identity = createHmac("sha256", secret)
      .update(`daisy:recovery-limit:${parsed.data.email}`)
      .digest("hex");
    const retry = await consumeRecoveryLimit(ownerId, action, identity);
    if (retry)
      return respond({ error: "Too many attempts. Try again later." }, 429, {
        "Retry-After": String(retry),
      });
    const matches = await matchesOwnerEmail(ownerId, parsed.data.email);
    if (!matches)
      return action === "send"
        ? respond({ success: true }, 202)
        : respond(
            { error: "The code is invalid or expired. Request a new code." },
            400,
          );
    const operationId = randomUUID();
    // The durable attempt precedes external Auth I/O; never put secrets in audit.
    await recordRecoveryEvent(
      ownerId,
      operationId,
      action === "send" ? "RESET_REQUESTED" : "RESET_ATTEMPTED",
    );
    const endpoint =
      action === "send"
        ? "forget-password/email-otp"
        : "email-otp/reset-password";
    resetSubmitted = action === "reset";
    const upstream = await getAuth()
      .handler()
      .POST(
        new Request(new URL(`/api/auth/${endpoint}`, process.env.APP_ORIGIN), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            origin: process.env.APP_ORIGIN,
          },
          body: JSON.stringify(parsed.data),
        }),
        { params: Promise.resolve({ path: endpoint.split("/") }) },
      );
    if (!upstream.ok) {
      resetSubmitted = false;
      await recordRecoveryEvent(ownerId, operationId, "RESET_REJECTED");
      if (upstream.status === 429)
        return respond({ error: "Too many attempts. Try again later." }, 429, {
          "Retry-After": "60",
        });
      if (upstream.status >= 500)
        return respond(
          { error: "Recovery is temporarily unavailable. Try again shortly." },
          503,
        );
      // Sending always uses a generic acknowledgement to avoid account enumeration.
      return action === "send"
        ? respond({ success: true }, 202)
        : respond(
            { error: "The code is invalid or expired. Request a new code." },
            400,
          );
    }
    if (action === "send") return respond({ success: true }, 202);
    const acknowledged = z
      .object({ success: z.literal(true) })
      .safeParse(await upstream.json().catch(() => null));
    if (!acknowledged.success)
      return respond(
        {
          error:
            "Your password may have changed. Try signing in before requesting another reset.",
        },
        503,
      );
    try {
      const event = await recordRecoveryEvent(
        ownerId,
        operationId,
        "RESET_COMPLETED",
      );
      return respond(
        {
          success: true,
          notification: projectRecoveryNotification(event, ownerId),
        },
        200,
      );
    } catch {
      return respond(
        {
          error:
            "Your password may have changed. Try signing in before requesting another reset.",
        },
        503,
      );
    }
  } catch {
    return respond(
      {
        error: resetSubmitted
          ? "Your password may have changed. Try signing in before requesting another reset."
          : "Recovery is temporarily unavailable. Try again shortly.",
      },
      503,
    );
  }
}
