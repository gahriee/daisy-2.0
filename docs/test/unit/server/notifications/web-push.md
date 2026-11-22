# Web Push notifications (VAPID & RFC 8291)

- Status: PASS
- Last run: 2026-11-22 04:10:05 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/server/notifications/web-push.test.ts tests/unit/offline/sw-policy.test.ts`
- Result: 2 passed here (50 ms); suite 183 passed, 0 failed, 0 skipped across 47 files, 2.89 s.
- Target file: [tests/unit/server/notifications/web-push.test.ts](../../../../../tests/unit/server/notifications/web-push.test.ts) -> [src/server/notifications/web-push.ts](../../../../../src/server/notifications/web-push.ts), [src/features/notifications/push-schemas.ts](../../../../../src/features/notifications/push-schemas.ts)

## Verified criteria

- `PushSubscribeSchema` accepts valid HTTPS push endpoints with base64url `p256dh`/`auth` keys and rejects non-HTTPS endpoints.
- `generateVapidKeyPair`, `encryptWebPushPayload` (RFC 8291 `aes128gcm`), `buildVapidAuthorizationHeader` (RFC 8292 `ES256` JWT), and `sendWebPushMessage` handle `201 Created` delivery and `410 Gone` expired-subscription signaling.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-22 04:10:05 | `pnpm test:unit tests/unit/server/notifications/web-push.test.ts tests/unit/offline/sw-policy.test.ts` | 2 passed (suite: 183/183 across 47 files) | 50 ms (2.89 s suite) |

