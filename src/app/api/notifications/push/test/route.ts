import { PreconditionError, RateLimitedError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import { getDatabase } from "@/server/db/client";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
} from "@/server/http/route-helpers";
import {
  getVapidConfig,
  sendOwnerPushNotification,
} from "@/server/notifications/web-push";

const TEST_PUSH_MAX = 5;
const TEST_PUSH_WINDOW_SECONDS = 600;

async function consumeTestPushLimit(ownerUserId: string): Promise<void> {
  const db = getDatabase();
  const prefix = `push-test:${ownerUserId}:`;
  const key = `${prefix}send`;

  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "SecurityRateLimit"
      WHERE starts_with("key", ${prefix}) AND "resetsAt" <= CURRENT_TIMESTAMP
    `;
    return tx.$queryRaw<Array<{ count: number; retry: number }>>`
      INSERT INTO "SecurityRateLimit" ("key", "count", "resetsAt")
      VALUES (${key}, 1, CURRENT_TIMESTAMP + (${TEST_PUSH_WINDOW_SECONDS} * interval '1 second'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "SecurityRateLimit"."count" + 1
        END,
        "resetsAt" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${TEST_PUSH_WINDOW_SECONDS} * interval '1 second')
          ELSE "SecurityRateLimit"."resetsAt"
        END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetsAt" - CURRENT_TIMESTAMP))))::int AS retry
    `;
  });

  const row = rows[0];
  if (row && row.count > TEST_PUSH_MAX) {
    throw new RateLimitedError(
      row.retry,
      "You sent several test alerts recently. Wait a few minutes and try again.",
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    if (!getVapidConfig()) {
      throw new PreconditionError(
        "Phone notifications are not enabled on this server yet.",
      );
    }

    await consumeTestPushLimit(ownerUserId);
    const result = await sendOwnerPushNotification(ownerUserId, {
      title: "Daisy alerts are active",
      body: "Phone notifications are working on this device.",
      url: "/notifications",
      tag: "daisy-test-alert",
    });

    if (result.attempted === 0) {
      throw new PreconditionError(
        "Turn on phone notifications on this device first.",
      );
    }

    return jsonPrivate({ ok: true, ...result });
  } catch (error) {
    return errorToResponse(error);
  }
}

