import { randomUUID } from "node:crypto";
import {
  PushSubscribeSchema,
  PushUnsubscribeSchema,
  type PushStatusResponse,
} from "@/features/notifications/push-schemas";
import { ValidationError } from "@/lib/errors";
import { requireOwnerUserId } from "@/server/auth/owner";
import { getDatabase } from "@/server/db/client";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import {
  assertSameOrigin,
  errorToResponse,
  jsonPrivate,
  readBoundedJson,
} from "@/server/http/route-helpers";
import { getVapidConfig } from "@/server/notifications/web-push";
import { writeAuditEntry } from "@/server/sync/publish";

/**
 * Returns Web Push readiness, public VAPID key, and registered endpoints for
 * the authenticated Owner.
 */
export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const vapid = getVapidConfig();
    const rows = await getDatabase().pushSubscription.findMany({
      where: { ownerUserId },
      select: { endpoint: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    const body: PushStatusResponse = {
      configured: Boolean(vapid),
      publicKey: vapid?.publicKey ?? null,
      subscriptionCount: rows.length,
      subscribedEndpoints: rows.map((row) => row.endpoint),
    };
    return jsonPrivate(body);
  } catch (error) {
    return errorToResponse(error);
  }
}

/**
 * Registers or refreshes a browser Web Push subscription for the Owner.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 8 * 1024);
    const parsed = PushSubscribeSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid push subscription payload.",
      );
    }

    const { endpoint, keys, deviceLabel } = parsed.data;
    const db = getDatabase();
    const saved = await db.$transaction(async (tx) => {
      await ensureOwnerRecord(tx, ownerUserId);
      const existing = await tx.pushSubscription.findUnique({
        where: { endpoint },
        select: { id: true, ownerUserId: true },
      });

      const sub = existing
        ? await tx.pushSubscription.update({
            where: { endpoint },
            data: {
              ownerUserId,
              p256dh: keys.p256dh,
              auth: keys.auth,
              deviceLabel: deviceLabel ?? null,
            },
            select: { id: true },
          })
        : await tx.pushSubscription.create({
            data: {
              id: randomUUID(),
              ownerUserId,
              endpoint,
              p256dh: keys.p256dh,
              auth: keys.auth,
              deviceLabel: deviceLabel ?? null,
            },
            select: { id: true },
          });

      await writeAuditEntry(tx, {
        ownerUserId,
        area: "notifications",
        action: "notifications.push_subscribed",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "push_subscription",
        entityId: sub.id,
        metadata: {},
      });

      return sub;
    });

    return jsonPrivate({ ok: true, id: saved.id });
  } catch (error) {
    return errorToResponse(error);
  }
}

/**
 * Removes a browser Web Push subscription for the Owner.
 */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerUserId = await requireOwnerUserId();
    const raw = await readBoundedJson(request, 4 * 1024);
    const parsed = PushUnsubscribeSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid push endpoint.",
      );
    }

    const db = getDatabase();
    await db.$transaction(async (tx) => {
      const existing = await tx.pushSubscription.findFirst({
        where: { ownerUserId, endpoint: parsed.data.endpoint },
        select: { id: true },
      });
      if (!existing) return;

      await tx.pushSubscription.delete({ where: { id: existing.id } });
      await writeAuditEntry(tx, {
        ownerUserId,
        area: "notifications",
        action: "notifications.push_unsubscribed",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "push_subscription",
        entityId: existing.id,
        metadata: {},
      });
    });

    return jsonPrivate({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}

