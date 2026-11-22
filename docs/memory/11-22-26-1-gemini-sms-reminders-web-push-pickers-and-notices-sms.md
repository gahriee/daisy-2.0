# Session Summary: SMS Reminders, Web Push, Custom Pickers & Notices SMS

- **Date:** 11-22-26
- **Sequence:** 1
- **Agent:** gemini
- **Session ID:** 29959e32-c5f1-4ca4-add5-2ded46220ef6
- **Topic:** Semaphore Overdue SMS & Notices Delivery, PWA Web Push, Custom Date/Time Pickers, Stays Consolidation & Navigation Polish

## Executive Summary

Implemented end-to-end Semaphore SMS delivery for both overdue boarding house rent reminders (scheduled and manual) and tenant notices/announcements (immediate and scheduled), added zero-dependency RFC 8291 / VAPID Web Push notifications with iOS Safari PWA readiness, introduced custom Rausch-and-charcoal `DatePicker` / `TimePicker` / `DateTimePicker` primitives across all date and time forms, consolidated transient stays and guests into `/transients/stays` with a read-only reservation detail modal, enforced plain non-technical frontend copy across docs and UI, and resolved mobile navigation and notification dropdown issues.

## Key Architectural & Technical Decisions

- **Transients consolidation (`/transients/stays`):** Merged `/transients/guests` into `/transients/stays` (redirecting `/transients/guests` to `/transients/stays`), then replaced the separate `Guests` tab with a `View` row action opening `TransientReservationDetailDialog` for full guest, stay, room, and billing inspection online and offline.
- **Semaphore Overdue SMS notifier (`20261122021500_overdue_sms_notifier`, `20261122034000_sms_schedule_frequency`):** Added AES-256-GCM encrypted API key storage (`secret-box.ts`), Semaphore API v4 client (`semaphore.ts`), PH mobile normalization, template rendering and segment estimation, configurable repeat frequency (`1–30` days) and daily send time (`smsOverdueSendTimeManila`), `*/30 * * * *` cron dispatch (`/api/jobs/billing/overdue-sms`), rate-limited manual `/billing` sends and `/settings/sms` sample test sends, `ConfirmDialog`-gated `Disconnect Semaphore`, and identifier-only audit logs. Applied migrations to `dev`; `test-integration` pending valid credentials; `production` untouched pending explicit Owner authorization.
- **Always-SMS Notices (`20261122051500_notice_sms_delivery`):** Connected `/notices` to the Owner's Semaphore account with audience resolution (`EVERYONE`, `ROOM`, `TENANT`), immediate SMS delivery for today/past send dates, automatic scheduled delivery via the existing 30-minute cron for future dates, delivery tracking (`smsSentAt`, `smsSentCount`), live preview/credit readout, `Resend via SMS`, and one-tap copy. Applied migration to `dev`; `production` untouched.
- **PWA Web Push & iPhone Safari install (`20261122040500_push_subscriptions`):** Built Workers-compatible RFC 8291 (`aes128gcm`) + RFC 8292 (`ES256` VAPID) Web Push in `src/server/notifications/web-push.ts` with `PushSubscription` storage, `/api/notifications/push{,/test}`, SW `push` / `notificationclick` handlers (`daisy-shell-v3`), iOS `appleWebApp` metadata, `PhoneNotificationsCard` on `/notifications`, and PII-free push triggers for booking requests, urgent maintenance, billing generation, overdue SMS, and scheduled notices.
- **Custom Date & Time Pickers (`date-picker.tsx`, `time-picker.tsx`):** Replaced native browser date/time popups across 12 feature modules (Audit, Billing, Maintenance, Notices, Payments, Reports, Settings, Tenants, Transients, and public `/book`) with click-anywhere Rausch-and-charcoal portal pickers supporting keyboard dismissal and `FormData`.
- **Plain-language policy & UI/mobile polish:** Codified plain non-technical frontend copy in `.agents/rules/5-style-conventions.md`, `DESIGN.md`, and `PRODUCT.md`; deduplicated profile dropdown vs. sidebar Settings navigation; fixed mobile notification dropdown viewport overflow (`fixed inset-x-3` on `< sm`); simplified notification cards and bulk action buttons; and added dev-only `allowedDevOrigins` in `next.config.ts` for mobile HTTPS tunnel / LAN testing.

## Cumulative File Changes

- (new) - `prisma/migrations/20261122021500_overdue_sms_notifier/migration.sql` - Additive `BusinessSettings` SMS columns and `OverdueSmsLog` table
- (new) - `prisma/migrations/20261122034000_sms_schedule_frequency/migration.sql` - Additive SMS repeat frequency and send time columns
- (new) - `prisma/migrations/20261122040500_push_subscriptions/migration.sql` - Additive `PushSubscription` table
- (new) - `prisma/migrations/20261122051500_notice_sms_delivery/migration.sql` - Additive `smsSentAt` and `smsSentCount` columns on `Notice`
- (new) - `src/server/security/secret-box.ts` - Purpose-separated AES-256-GCM encryption for stored API secrets
- (new) - `src/server/sms/semaphore.ts` - Server-only Semaphore API v4 HTTP client
- (new) - `src/features/sms/schemas.ts`, `service.ts`, `actions.ts` - Overdue SMS schemas, rendering, delivery service, and Server Actions
- (new) - `src/app/api/jobs/billing/overdue-sms/route.ts` - `CRON_SECRET`-authenticated overdue SMS & scheduled notices cron route
- (new) - `src/app/settings/sms/page.tsx` - Dedicated `/settings/sms` route
- (new) - `src/components/ui/time-picker.tsx`, `src/components/ui/date-picker.tsx` - Reusable Rausch-and-charcoal `TimePicker`, `DatePicker`, and `DateTimePicker` primitives
- (new) - `src/features/notifications/push-schemas.ts`, `src/server/notifications/web-push.ts` - Web Push schemas and RFC 8291/8292 sender
- (new) - `src/app/api/notifications/push/route.ts`, `src/app/api/notifications/push/test/route.ts` - Owner push subscription & test alert routes
- (new) - `src/components/features/notifications/phone-notifications-card.tsx` - Plain-language phone & browser alerts UI
- (new) - `scripts/generate-vapid.ts` - Local VAPID keypair generator
- (new) - `tests/unit/features/sms/schemas.test.ts`, `tests/integration/sms/overdue-sms-notifier.test.ts`, `tests/unit/server/notifications/web-push.test.ts` - Unit and integration tests for SMS and Web Push
- (new) - `docs/test/unit/features/sms/schemas.md`, `docs/test/integration/sms/overdue-sms-notifier.md`, `docs/test/unit/server/notifications/web-push.md` - Mirrored test result documentation
- (modified) - `prisma/schema.prisma`, `.env.example`, `next.config.ts`, `wrangler.jsonc`, `src/server/jobs/cloudflare-cron.ts` - Schema models, env docs, dev tunnel origins, and 30-minute cron wiring
- (modified) - `src/app/layout.tsx`, `src/app/manifest.ts`, `src/offline/sw-policy.ts`, `src/sw.ts`, `public/sw.js` - iOS PWA metadata and SW push/click handlers
- (modified) - `src/features/settings/schemas.ts`, `service.ts`, `actions.ts`, `src/app/settings/page.tsx`, `src/app/settings/_lib/settings-page.tsx`, `src/components/features/settings/settings-workspace.tsx`, `business-settings-form.tsx` - Wired `/settings/sms`, schedule controls, sample text, Disconnect Semaphore, and `TimePicker`
- (modified) - `src/features/notices/schemas.ts`, `service.ts`, `actions.ts`, `src/offline/snapshot-selectors-extra.ts`, `src/components/features/notices/notices-workspace.tsx`, `notice-dialogs.tsx` - Always-SMS immediate and scheduled notice delivery via Semaphore
- (modified) - `src/components/features/billing/billing-workspace.tsx`, `invoice-create-form.tsx` - Manual overdue SMS sends and `DatePicker`
- (modified) - `src/components/features/notifications/notification-card.tsx`, `notifications-workspace.tsx` - Mounted `PhoneNotificationsCard`, simplified cards and bulk labels
- (modified) - `src/components/layout/workspace-shell.tsx` - Deduplicated Settings/profile navigation and fixed mobile notification dropdown overflow
- (modified) - `src/app/transients/guests/page.tsx`, `src/app/transients/_lib/transient-section-page.tsx`, `src/features/transients/actions.ts`, `src/components/features/transients/transients-workspace.tsx`, `transient-dialogs.tsx`, `public-booking-client.tsx`, `public-booking-request-client.tsx`, `public-room-detail-client.tsx`, `src/components/features/offline/offline-route-fallback.tsx` - Consolidated `/transients/stays`, added `TransientReservationDetailDialog`, and applied `DatePicker`
- (modified) - `src/components/features/audit/audit-log-explorer.tsx`, `src/components/features/maintenance/maintenance-detail-view.tsx`, `src/components/features/payments/payment-create-form.tsx`, `src/components/features/reports/reports-workspace.tsx`, `src/components/features/tenants/tenant-contract-form.tsx`, `tenant-dialogs.tsx` - Applied custom `DatePicker`
- (modified) - `src/app/api/public/booking-requests/route.ts`, `src/features/maintenance/actions.ts`, `src/app/api/jobs/billing/generate/route.ts` - Wired PII-free Web Push triggers
- (modified) - `.agents/rules/5-style-conventions.md`, `DESIGN.md`, `PRODUCT.md`, `docs/architecture/architecture.md`, `tests/unit/features/notices/schemas.test.ts`, `tests/unit/server/jobs/cloudflare-cron.test.ts`, `docs/test/unit/server/jobs/cloudflare-cron.md` - Plain-language rules, design/architecture updates, and updated tests

