import { dispatchScheduledNoticeSms } from "@/features/notices/service";
import { sendOverdueSmsBatch } from "@/features/sms/service";
import { ServiceUnavailableError } from "@/lib/errors";
import { errorToResponse, jsonPrivate } from "@/server/http/route-helpers";
import { verifyCronSecret } from "@/server/jobs/auth";
import { notifyOwnerPushSafe } from "@/server/notifications/web-push";

/**
 * Authenticated, idempotent scheduled job endpoint for daily boarding house
 * overdue SMS reminders via Semaphore. Runs at most once per overdue invoice
 * per Asia/Manila day and no-ops cleanly when disabled in Settings.
 */
export async function POST(request: Request) {
  try {
    verifyCronSecret(request);
    const ownerUserId = process.env.OWNER_USER_ID?.trim();
    if (!ownerUserId) {
      throw new ServiceUnavailableError("Owner identity is not configured.");
    }

    const summary = await sendOverdueSmsBatch(ownerUserId, {
      actor: {
        actorType: "scheduled_job",
        actorId: "cron:billing-overdue-sms",
      },
      requireEnabled: true,
      skipRateLimit: true,
    });

    if (summary.sentCount > 0) {
      await notifyOwnerPushSafe(ownerUserId, {
        title: "Overdue rent reminders sent",
        body: `Sent ${summary.sentCount} overdue rent SMS ${summary.sentCount === 1 ? "reminder" : "reminders"} today.`,
        url: "/billing",
        tag: `overdue-sms-${summary.notifiedDateManila}`,
      });
    }

    const noticeSummary = await dispatchScheduledNoticeSms(ownerUserId);

    if (noticeSummary.sentNoticesCount > 0) {
      await notifyOwnerPushSafe(ownerUserId, {
        title: "Scheduled notices sent",
        body: `Texted ${noticeSummary.sentNoticesCount} scheduled ${noticeSummary.sentNoticesCount === 1 ? "notice" : "notices"} to ${noticeSummary.totalRecipientsSent} ${noticeSummary.totalRecipientsSent === 1 ? "tenant" : "tenants"}.`,
        url: "/notices",
        tag: `scheduled-notices-${summary.notifiedDateManila}`,
      });
    }

    return jsonPrivate({ ok: true, summary, noticeSummary });
  } catch (error) {
    return errorToResponse(error);
  }
}
