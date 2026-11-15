import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getCurrentManilaBillingPeriod } from "@/features/billing/calculations";
import { BillingPeriodSchema } from "@/features/billing/schemas";
import { generatePeriodInvoices } from "@/features/billing/service";
import {
  ServiceUnavailableError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";
import {
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";

const ScheduledBillingBodySchema = z.object({
  billingPeriod: BillingPeriodSchema.optional(),
  issueImmediately: z.boolean().default(true),
});

function verifyCronSecret(request: Request): void {
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
  const expectedDigest = createHash("sha256").update(expectedSecret).digest();
  const providedDigest = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(expectedDigest, providedDigest)) {
    throw new UnauthenticatedError("Invalid scheduled job credential.");
  }
}

/**
 * Authenticated, idempotent scheduled job endpoint for monthly billing generation.
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

    const parsed = ScheduledBillingBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid scheduled billing payload.",
      );
    }

    const billingPeriod =
      parsed.data.billingPeriod ?? getCurrentManilaBillingPeriod();
    const summary = await generatePeriodInvoices(
      ownerUserId,
      {
        billingPeriod,
        issueImmediately: parsed.data.issueImmediately,
      },
      {
        actorType: "scheduled_job",
        actorId: "cron:billing-generate",
      },
    );

    return jsonPrivate({ ok: true, summary });
  } catch (error) {
    return errorToResponse(error);
  }
}
