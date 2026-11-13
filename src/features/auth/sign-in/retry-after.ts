/**
 * Parses an HTTP Retry-After header (delay-seconds or HTTP-date) into positive
 * whole seconds, or returns null when missing, zero, non-finite, or elapsed.
 */
export function parseRetryAfterSeconds(
  value: string | null,
  nowMs: number = Date.now(),
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
  }

  const parsedDateMs = Date.parse(trimmed);
  if (!Number.isFinite(parsedDateMs)) return null;
  const remainingSeconds = Math.ceil((parsedDateMs - nowMs) / 1000);
  return Number.isSafeInteger(remainingSeconds) && remainingSeconds > 0
    ? remainingSeconds
    : null;
}

/**
 * Formats a positive Retry-After duration into readable seconds or minutes
 * without using contradictory "shortly" phrasing for long lockouts.
 */
export function formatRetryWaitMessage(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return "Wait a moment before trying again.";
  }
  const wholeSeconds = Math.ceil(seconds);
  if (wholeSeconds < 60) {
    return `Wait ${wholeSeconds} ${wholeSeconds === 1 ? "second" : "seconds"} before trying again.`;
  }
  const minutes = Math.ceil(wholeSeconds / 60);
  return `Wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} before trying again.`;
}
