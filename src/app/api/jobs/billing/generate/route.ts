import { z } from "zod";
import { getCurrentManilaBillingPeriod } from "@/features/billing/calculations";
import { BillingPeriodSchema } from "@/features/billing/schemas";
import { generatePeriodInvoices } from "@/features/billing/service";
import { ServiceUnavailableError, ValidationError } from "@/lib/errors";
import {
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";
import { verifyCronSecret } from "@/server/jobs/auth";
import { notifyOwnerPushSafe } from "@/server/notifications/web-push";

const ScheduledBillingBodySchema = z.object({
  billingPeriod: BillingPeriodSchema.optional(),
  issueImmediately: z.boolean().default(true),
});

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

    if (summary.createdCount > 0) {
      await notifyOwnerPushSafe(ownerUserId, {
        title: "Monthly bills ready",
        body: `Created ${summary.createdCount} rent ${summary.createdCount === 1 ? "bill" : "bills"} for ${billingPeriod}.`,
        url: "/billing",
        tag: `billing-generate-${billingPeriod}`,
      });
    }

    return jsonPrivate({ ok: true, summary });
  } catch (error) {
    return errorToResponse(error);
  }
}
