import "server-only";
import { ServiceUnavailableError, ValidationError } from "@/lib/errors";

export const SEMAPHORE_MESSAGES_ENDPOINT =
  "https://api.semaphore.co/api/v4/messages";

export type SemaphoreSendResult = {
  messageId: string | null;
  status: string;
  network: string | null;
};

export type SemaphoreSendParams = {
  apiKey: string;
  recipient: string;
  message: string;
  senderName?: string | null;
  fetcher?: typeof fetch;
};

/**
 * Sends a single SMS through Semaphore API v4 (`POST /api/v4/messages`).
 * Never logs or exposes API keys, phone numbers, or message text in errors.
 */
export async function sendSemaphoreSms(
  params: SemaphoreSendParams,
): Promise<SemaphoreSendResult> {
  const apiKey = params.apiKey.trim();
  const recipient = params.recipient.trim();
  const message = params.message.trim();
  const senderName = params.senderName?.trim() || "";

  if (!apiKey) {
    throw new ValidationError("Semaphore API key is not configured.");
  }
  if (!recipient) {
    throw new ValidationError("Recipient phone number is required.");
  }
  if (!message) {
    throw new ValidationError("SMS message content cannot be empty.");
  }
  if (/^test\b/i.test(message)) {
    throw new ValidationError(
      'Semaphore ignores messages starting with "TEST". Update your SMS template.',
    );
  }

  const body = new URLSearchParams();
  body.set("apikey", apiKey);
  body.set("number", recipient);
  body.set("message", message);
  if (senderName) {
    body.set("sendername", senderName);
  }

  const fetchImpl = params.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(SEMAPHORE_MESSAGES_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ServiceUnavailableError(
      "Could not reach Semaphore SMS service right now. Try again.",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ServiceUnavailableError(
        "Semaphore rejected the configured API key or sender name. Check Settings -> Overdue SMS.",
      );
    }
    if (response.status === 429) {
      throw new ServiceUnavailableError(
        "Semaphore rate limit reached. Wait a moment and try again.",
      );
    }
    throw new ServiceUnavailableError(
      `Semaphore SMS request failed (HTTP ${response.status}).`,
    );
  }

  const firstEntry = Array.isArray(payload)
    ? (payload[0] as Record<string, unknown> | undefined)
    : payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : undefined;

  if (!firstEntry || typeof firstEntry !== "object") {
    throw new ServiceUnavailableError(
      "Semaphore returned an unexpected response format.",
    );
  }

  const rawId = firstEntry.message_id;
  const messageId =
    typeof rawId === "number" || typeof rawId === "string"
      ? String(rawId)
      : null;
  const status =
    typeof firstEntry.status === "string" ? firstEntry.status : "Pending";
  const network =
    typeof firstEntry.network === "string" ? firstEntry.network : null;

  return { messageId, status, network };
}
