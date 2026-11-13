import "server-only";
import { AppError, ForbiddenError, ValidationError } from "@/lib/errors";

export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
} as const;

export function assertSameOrigin(request: Request): void {
  const expected = process.env.APP_ORIGIN;
  if (!expected || request.headers.get("origin") !== expected) {
    throw new ForbiddenError();
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes = 4096,
): Promise<unknown> {
  const contentType = request.headers.get("content-type");
  if (
    !contentType ||
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    throw new AppError("validation_error", 415, "Send JSON.");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new ValidationError("Request body is required.");
  }
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new AppError("validation_error", 413, "Request too large.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new ValidationError("Malformed JSON request body.");
  }
}

export function jsonPrivate(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers(PRIVATE_RESPONSE_HEADERS);
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.append(key, value);
    }
  }
  return Response.json(body, { status, headers });
}

export function errorToResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const headers = new Headers(PRIVATE_RESPONSE_HEADERS);
    if (error.retryAfterSeconds !== undefined) {
      headers.set("Retry-After", String(error.retryAfterSeconds));
    }
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers },
    );
  }
  return jsonPrivate({ error: "Service unavailable." }, 503);
}
