import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { ServiceUnavailableError, UnauthenticatedError } from "@/lib/errors";

/**
 * Verifies bearer authentication for scheduled job Route Handlers against
 * `CRON_SECRET` using constant-time SHA-256 digest comparison.
 */
export function verifyCronSecret(request: Request): void {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    throw new ServiceUnavailableError(
      "Scheduled job authentication is not configured.",
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthenticatedError("Missing scheduled job bearer token.");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new UnauthenticatedError("Missing scheduled job bearer token.");
  }

  const expectedDigest = createHash("sha256").update(expectedSecret).digest();
  const providedDigest = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(expectedDigest, providedDigest)) {
    throw new UnauthenticatedError("Invalid scheduled job credential.");
  }
}

