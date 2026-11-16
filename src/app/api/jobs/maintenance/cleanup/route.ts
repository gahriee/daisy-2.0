import { ServiceUnavailableError } from "@/lib/errors";
import {
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";
import { verifyCronSecret } from "@/server/jobs/auth";
import { runMaintenanceCleanupJob } from "@/server/jobs/cleanup";

/**
 * Authenticated, idempotent scheduled job endpoint to clean expired orphan
 * upload intents (beyond grace period while protecting active/attached items)
 * and expired ephemeral rate-limit buckets.
 */
export async function POST(request: Request) {
  try {
    verifyCronSecret(request);
    const ownerUserId = process.env.OWNER_USER_ID?.trim();
    if (!ownerUserId) {
      throw new ServiceUnavailableError("Owner identity is not configured.");
    }

    let rawBody: unknown = {};
    const contentLength = request.headers.get("content-length");
    if (request.headers.get("content-type") && contentLength !== "0") {
      rawBody = await readBoundedJson(request, 2048);
    }

    const summary = await runMaintenanceCleanupJob(ownerUserId, rawBody);
    return jsonPrivate({ ok: true, summary });
  } catch (error) {
    return errorToResponse(error);
  }
}

