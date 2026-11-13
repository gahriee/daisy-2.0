import { getAuth } from "@/server/auth/server";
import { isOwner } from "@/server/auth/owner";
import { recoverPassword } from "@/features/auth/recovery/service";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).pathname !== "/api/auth/get-session") {
    return Response.json({ error: "Not found" }, { status: 404, headers });
  }
  try {
    return Response.json({ authenticated: await isOwner() }, { headers });
  } catch {
    return Response.json(
      { error: "Authentication unavailable" },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/recovery/request")
    return recoverPassword(request, "send");
  if (path === "/api/auth/recovery/reset")
    return recoverPassword(request, "reset");
  if (!["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(path)) {
    return Response.json({ error: "Not found" }, { status: 404, headers });
  }
  if (
    !process.env.APP_ORIGIN ||
    request.headers.get("origin") !== process.env.APP_ORIGIN
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403, headers });
  }
  if (!process.env.OWNER_USER_ID) {
    return Response.json(
      { error: "Owner setup required" },
      { status: 503, headers },
    );
  }
  try {
    let forwardRequest = request;
    if (path === "/api/auth/sign-out") {
      // Upstream Better Auth rejects empty non-JSON POST /sign-out requests with 415.
      const forwardHeaders = new Headers(request.headers);
      forwardHeaders.set("Content-Type", "application/json");
      const rawBody = await request.text().catch(() => "");
      forwardRequest = new Request(request.url, {
        method: "POST",
        headers: forwardHeaders,
        body: rawBody.trim() ? rawBody : "{}",
      });
    }
    const upstream = await getAuth()
      .handler()
      .POST(forwardRequest, {
        params: Promise.resolve({
          path: path.replace("/api/auth/", "").split("/"),
        }),
      });
    // Preserve secure SDK cookies, while omitting tokens and provider response bodies.
    const output = new Headers(headers);
    for (const cookie of upstream.headers.getSetCookie())
      output.append("Set-Cookie", cookie);
    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter) output.set("Retry-After", retryAfter);
      return Response.json(
        { error: "Too many attempts. Try again shortly." },
        { status: 429, headers: output },
      );
    }
    if (upstream.status >= 500) {
      return Response.json(
        { error: "Authentication unavailable" },
        { status: 503, headers: output },
      );
    }
    return Response.json(
      { success: upstream.ok },
      { status: upstream.ok ? 200 : 401, headers: output },
    );
  } catch {
    return Response.json(
      { error: "Authentication unavailable" },
      { status: 503, headers },
    );
  }
}
