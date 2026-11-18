# Session Summary: Public Booking Storefront, Sub-Pages & Plain-Language Rewrite

- **Date:** 11-17-26 (Asia/Manila)
- **Sequence:** 2
- **Agent:** gemini
- **Session ID:** 45f486c2-a062-4454-88ba-59b8b515a8df
- **Topic:** public-booking-storefront-and-plain-language

## Executive Summary

Compacted session spanning 8 prompts that rebuilt `/book` into an edge-to-edge public storefront with dedicated `/book/[roomId]` and `/book/[roomId]/request` pages, extended `BookingRequest` with structured guest details via an additive migration, added a self-hosted bedroom hero and simplified search toolbar, and rewrote UI copy across the workspace in plain, senior-friendly language.

## Key Architectural & Technical Decisions

1. **Edge-to-Edge `/book` Storefront & Dedicated Sub-Pages:**
   - Redesigned `/book` and introduced dedicated `/book/[roomId]` (`public-room-detail-client.tsx`) and `/book/[roomId]/request` (`public-booking-request-client.tsx`) routes backed by `PublicBookingHeader`, `PublicBookingFooter`, `PublicBookingBackLink`, and `GuestCountStepperRow` (`src/components/features/transients/public-booking-chrome.tsx`) plus pure helpers in `src/features/transients/public-booking-view.ts`.
   - Removed the temporary modal flow (`public-booking-dialogs.tsx`, created in Prompt 1 and deleted in Prompt 2).
   - Scoped `next.config.ts` CSP (`img-src 'self' data:`) to `/book/:path*` and configured guest-facing `metadata` in `src/app/book/page.tsx`.

2. **Guest Demographics & Adult/Child Breakdown (`BookingRequest` Migration):**
   - Added additive nullable columns (`guestAge`, `guestSex`, `guestAddress`, `adultsCount`, `childrenCount`) and `CHECK` constraints to `BookingRequest` via `prisma/migrations/20261117210500_booking_request_guest_details/migration.sql` (applied to `dev` and `test-integration`; `production` untouched) and bumped `PRISMA_CLIENT_SCHEMA_TAG` in `src/server/db/client.ts`.
   - Updated `SubmitPublicBookingRequestSchema`, `BookingRequestDto`, `PublicBookingAckDto`, canonical idempotency fingerprinting, `getPublicPublishedRoomAvailability`, `approveBookingRequest` (`Age / Sex / Address` summary mapped to `TransientGuest.notes`), `booking-request-detail.tsx`, and `src/offline/snapshot-selectors-extra.ts`, keeping `AuditLog` PII-free (recording only `adultsCount` / `childrenCount`).
   - Verified with `169/169` unit tests across `43` files and targeted integration suite `tests/integration/transients/transients-and-public-booking.test.ts` (`5/5` passed in `139.05 s`).

3. **Navigation, Toolbar, Self-Hosted Hero & Form Polish:**
   - Removed `Owner sign in` links and header `backHref` buttons (`PublicBookingHeader` optionally displays `Front desk: <phone>`) and placed `PublicBookingBackLink` directly above `<h1>`.
   - Merged and then removed catalog filters (`Room type`, `Show`, `Sort by`) while preserving `filterAndSortPublicRooms(..., { sortBy: "RECOMMENDED" })`.
   - Centered the `When` / `Who` / `Search` pill floating `sm:-mt-14` below a self-hosted stand-in bedroom hero (`public/images/hero/stay-hero-{500,960,1280}.jpg`, attributed `Room photo: Tim Collins (CC BY-SA 3.0)`).
   - Built a balanced 12-column request form grid (`Full name 6`, `Age 2`, `Male`/`Female` `radiogroup` `4`, `Address 12`, `Contact no. 6`, `Email (optional) 6`, `Note for the host (optional) 12`) and renamed guest-facing `"owner"` references to `"host"`.

4. **Plain-Language UI Copy Rewrite:**
   - Replaced developer, accounting, and technical jargon across offline (`Offline copy`, `offline password`, `saved records`, `waiting to save`, `Update now`, `Up to date`, `Trusted devices`, `Add device`, `Remove access`), settings/audit/shell/auth (`Activity history`, `Property Manager`, `partial-month rent rule`, `extra tenant credit`, `Who`, `What changed`, `Record`), billing, payments, reports, tenants, transients, maintenance, and dashboard components.
   - Verified with Node JSX/string scan, `prettier`, `eslint` (`0` errors), `pnpm typecheck`, `pnpm test:unit`, and `git diff --check`.

## Cumulative File Changes

*(Replaced `docs/memory/11-17-26-2-gemini.md` upon compaction; `public-booking-dialogs.tsx` was created temporarily in Prompt 1 and deleted in Prompt 2.)*

- (new) - `src/features/transients/public-booking-view.ts`
- (new) - `src/components/features/transients/public-booking-chrome.tsx`
- (new) - `src/components/features/transients/public-room-detail-client.tsx`
- (new) - `src/components/features/transients/public-booking-request-client.tsx`
- (new) - `src/app/book/[roomId]/page.tsx`
- (new) - `src/app/book/[roomId]/request/page.tsx`
- (new) - `prisma/migrations/20261117210500_booking_request_guest_details/migration.sql`
- (new) - `public/images/hero/stay-hero-500.jpg`
- (new) - `public/images/hero/stay-hero-960.jpg`
- (new) - `public/images/hero/stay-hero-1280.jpg`
- (new) - `tests/unit/features/transients/public-booking-view.test.ts`
- (new) - `docs/test/unit/features/transients/public-booking-view.md`
- (modified) - `prisma/schema.prisma`
- (modified) - `next.config.ts`
- (modified) - `src/server/db/client.ts`
- (modified) - `src/server/auth/workspace-profile.ts`
- (modified) - `src/app/layout.tsx`
- (modified) - `src/app/manifest.ts`
- (modified) - `src/app/audit/page.tsx`
- (modified) - `src/app/design-system/page.tsx`
- (modified) - `src/app/book/page.tsx`
- (modified) - `src/features/transients/schemas.ts`
- (modified) - `src/features/transients/service.ts`
- (modified) - `src/features/transients/public-service.ts`
- (modified) - `src/features/audit/schemas.ts`
- (modified) - `src/features/settings/schemas.ts`
- (modified) - `src/offline/snapshot-selectors-extra.ts`
- (modified) - `src/components/layout/workspace-shell.tsx`
- (modified) - `src/components/features/auth/reset-password-form.tsx`
- (modified) - `src/components/features/auth/sign-in-panel.tsx`
- (modified) - `src/components/features/notifications/notifications-workspace.tsx`
- (modified) - `src/components/features/audit/audit-log-explorer.tsx`
- (modified) - `src/components/features/dashboard/dashboard-workspace.tsx`
- (modified) - `src/components/features/offline/offline-status-bar.tsx`
- (modified) - `src/components/features/offline/offline-vault-unlock.tsx`
- (modified) - `src/components/features/offline/offline-sync-dialog.tsx`
- (modified) - `src/components/features/offline/offline-vault-workspace.tsx`
- (modified) - `src/components/features/offline/offline-route-fallback.tsx`
- (modified) - `src/components/features/settings/settings-workspace.tsx`
- (modified) - `src/components/features/settings/business-settings-form.tsx`
- (modified) - `src/components/features/settings/device-management-panel.tsx`
- (modified) - `src/components/features/billing/billing-dialogs.tsx`
- (modified) - `src/components/features/billing/billing-workspace.tsx`
- (modified) - `src/components/features/billing/invoice-detail-view.tsx`
- (modified) - `src/components/features/payments/payment-dialogs.tsx`
- (modified) - `src/components/features/payments/payment-detail-view.tsx`
- (modified) - `src/components/features/payments/payments-workspace.tsx`
- (modified) - `src/components/features/payments/payment-create-form.tsx`
- (modified) - `src/components/features/reports/report-finance-tabs.tsx`
- (modified) - `src/components/features/reports/report-operations-tabs.tsx`
- (modified) - `src/components/features/reports/reports-workspace.tsx`
- (modified) - `src/components/features/tenants/tenants-workspace.tsx`
- (modified) - `src/components/features/tenants/tenant-dialogs.tsx`
- (modified) - `src/components/features/tenants/tenant-contract-detail.tsx`
- (modified) - `src/components/features/transients/transients-workspace.tsx`
- (modified) - `src/components/features/transients/transient-dialogs.tsx`
- (modified) - `src/components/features/transients/booking-request-detail.tsx`
- (modified) - `src/components/features/transients/public-booking-client.tsx`
- (modified) - `src/components/features/maintenance/maintenance-workspace.tsx`
- (modified) - `src/components/features/maintenance/maintenance-create-form.tsx`
- (modified) - `src/components/features/maintenance/maintenance-detail-view.tsx`
- (modified) - `tests/unit/features/transients/schemas.test.ts`
- (modified) - `tests/unit/offline/sw-policy.test.ts`
- (modified) - `tests/integration/transients/transients-and-public-booking.test.ts`
- (modified) - `DESIGN.md`
- (modified) - `docs/architecture/architecture.md`
- (modified) - `docs/test/unit/features/transients/schemas.md`
- (modified) - `docs/test/unit/offline/sw-policy.md`
- (modified) - `docs/test/integration/transients/transients-and-public-booking.md`
- (deleted) - `src/components/features/transients/public-booking-dialogs.tsx`
