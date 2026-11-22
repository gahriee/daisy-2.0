import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PushSubscribeSchema } from "../../../../src/features/notifications/push-schemas";

vi.mock("server-only", () => ({}));

import {
  buildVapidAuthorizationHeader,
  encryptWebPushPayload,
  generateVapidKeyPair,
  sendWebPushMessage,
} from "../../../../src/server/notifications/web-push";

describe("PWA Web Push (RFC 8291 + VAPID ES256) and subscription schemas", () => {
  it("validates PushSubscribeSchema HTTPS endpoints and keys", () => {
    expect(
      PushSubscribeSchema.safeParse({
        endpoint: "https://web.push.apple.com/QABCD123456",
        keys: {
          p256dh: "B".repeat(87),
          auth: "A".repeat(22),
        },
        deviceLabel: "iPhone",
      }).success,
    ).toBe(true);

    expect(
      PushSubscribeSchema.safeParse({
        endpoint: "http://insecure.example/push",
        keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
      }).success,
    ).toBe(false);
  });

  it("generates P-256 VAPID keys, signs ES256 VAPID Authorization headers, and encrypts RFC 8291 payloads", async () => {
    const vapidKeys = generateVapidKeyPair();
    expect(Buffer.from(vapidKeys.publicKey, "base64url").length).toBe(65);
    expect(Buffer.from(vapidKeys.privateKey, "base64url").length).toBe(32);

    const authHeader = buildVapidAuthorizationHeader({
      endpoint: "https://fcm.googleapis.com/fcm/send/example-token",
      vapid: {
        ...vapidKeys,
        subject: "mailto:owner@example.com",
      },
      nowSec: 1_700_000_000,
    });
    expect(authHeader).toMatch(
      /^vapid t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+, k=/,
    );

    const subscriberEcdh = createECDH("prime256v1");
    subscriberEcdh.generateKeys();
    const userPublicKeyB64Url = subscriberEcdh
      .getPublicKey()
      .toString("base64url");
    const userAuthB64Url = randomBytes(16).toString("base64url");

    const encrypted = encryptWebPushPayload({
      plaintext: JSON.stringify({
        title: "New booking request",
        body: "Tap to review.",
        url: "/transients/requests",
      }),
      userPublicKeyB64Url,
      userAuthB64Url,
    });
    // Header is 16 (salt) + 4 (rs) + 1 (idlen=65) + 65 (pubkey) = 86 bytes + ciphertext + 16-byte GCM tag
    expect(encrypted.length).toBeGreaterThan(86 + 16);
    expect(encrypted[20]).toBe(65);

    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 410 }));

    const okRes = await sendWebPushMessage({
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/token-1",
        p256dh: userPublicKeyB64Url,
        auth: userAuthB64Url,
      },
      payload: {
        title: "Daisy alert",
        body: "Test alert",
        url: "/notifications",
      },
      vapid: { ...vapidKeys, subject: "mailto:owner@example.com" },
      fetcher,
    });
    expect(okRes).toEqual({ ok: true, status: 201, expired: false });

    const expiredRes = await sendWebPushMessage({
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/token-gone",
        p256dh: userPublicKeyB64Url,
        auth: userAuthB64Url,
      },
      payload: {
        title: "Daisy alert",
        body: "Test alert",
        url: "/notifications",
      },
      vapid: { ...vapidKeys, subject: "mailto:owner@example.com" },
      fetcher,
    });
    expect(expiredRes).toEqual({ ok: false, status: 410, expired: true });
  });
});
