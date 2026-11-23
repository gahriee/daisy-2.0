# Session Summary: Range Calendar, Scrollytelling, Mailer, Booking Tracker, and House Rules

- **Date:** 11-22-26
- **Sequence:** 8
- **Agent:** gemini
- **Session ID:** cc7d671d-72cf-4c76-8e06-ebc600fe98bc
- **Topic:** Interactive stay range calendars, `/book` scrollytelling & visual FX, fast photo caching, booking approval mailer & `#track` lookup, and drag-and-drop House Rules management

## Executive Summary

Delivered a comprehensive upgrade across the public `/book` storefront and Owner transient workspace: elevated warm-charcoal card shadows, an interactive dual-month availability range calendar shared across `/book`, `/book/[roomId]`, `/book/[roomId]/request`, and the Owner **Book short stay** modal (with room-specific occupied date blocking and instant background recalculation), Scrollytelling 2.0 + zero-dependency SVG/WebGL/3D visual FX + a floral cursive `"daisy"` tablet-tap loader, fast ETag-cached public room photos, a Workers-compatible Resend booking approval mailer with required guest email and dual-factor `#track` status lookup, and a dedicated `/transients/house-rules` rule-per-row drag-and-drop configuration page wired live to `/book#house-rules`.

## Key Architectural & Technical Decisions

- **Interactive Availability Range Calendar (`public-stay-date-range-picker.tsx`):** Built half-open `[checkIn, checkOut)` availability helpers (`computeUnavailableNightDates`, `findFirstUnavailableNightAfter`, `isRangeBlockedByUnavailableDates`), a bounded PII-free `GET /api/public/rooms/[roomId]/calendar` endpoint, and reusable `PublicStayDateRangeCalendar` / `PublicStayDateRangePicker` / `StayDateRangePicker` components. Wired automatic background recalculation on `/book`, `/book/[roomId]`, and `/book/[roomId]/request`, hid booked rooms on `/book` for chosen dates, and applied `StayDateRangePicker` to the Owner **Book short stay** dialog using local active reservations (works online & offline).
- **Scrollytelling 2.0, Visual FX & Floral Loader:** Created `ScrollStoryProgress`, `ScrollReveal`, `useSectionScrollProgress`, `WebGLAmbientField`, `SelfDrawingLine`, `MorphingAura`, and `Tilt3DCard` with `prefers-reduced-motion` guards. Pinned `StayAnywhereShowcase` (`lg:h-[220vh]`) until `Direct -> Transparent -> Confirmed` complete, updated `PublicBookingLoader` to self-drawing primary Rausch cursive `"daisy"` with 7 natural daisies above the circular aura and in-screen `BOOK -> 5 stars`, and added per-rule scroll reveal (`HouseRuleRow`) on `/book#house-rules`.
- **Public Room Photo Performance:** Switched `/api/public/room-photos/[photoId]` to `public, max-age=300, stale-while-revalidate=600` with `ETag` / `304 Not Modified`, plus priority loading and background preloading for hero deck and gallery slides.
- **Booking Approval Mailer & Dual-Factor Tracking:** Implemented zero-dependency Resend HTTP mailer (`src/server/mail/booking-mailer.ts`) invoked safely outside the approval transaction, made `guestEmail` required on booking requests, and added rate-limited same-origin `POST /api/public/booking-requests/lookup` + `PublicBookingTracker` (`#track`) requiring both reference code and email.
- **Dedicated Transient House Rules Configuration (`/transients/house-rules`):** Reused `BusinessSettings.transientPolicyNote` via a dedicated `"house_rules"` Settings module (`HouseRulesSettingsUpdateSchema`, `serializeHouseRulesList`) with no implicit default-rule fallback. Moved the page under **Transient → Stays & requests** with a rule-per-row `HouseRulesEditor` supporting **Add rule**, inline edits, drag-and-drop reordering matching `RoomPhotosEditor`, Up/Down buttons, and live `/book#house-rules` revalidation. Seeded the 6 rules from `HOUSE_20RULES.docx` idempotently in `prisma/seed.ts` (applied to local `dev`).
- **Top Navigation & Hero Bar Polish:** Restacked and centered the `/book` hero booking bar (2×2 fields above a full-width **Book now** CTA) and switched the `/book` header to `flex` with `whitespace-nowrap` links/phone pill so items never wrap onto a second line.

## Cumulative File Changes

- (new) - src/app/api/public/rooms/[roomId]/calendar/route.ts - Rate-limited `no-store` public room availability calendar endpoint
- (new) - src/app/api/public/booking-requests/lookup/route.ts - Rate-limited same-origin `POST` dual-factor booking status lookup endpoint
- (new) - src/app/(workspace)/transients/house-rules/page.tsx - Dedicated Owner House Rules page under Transient workspace
- (new) - src/server/mail/booking-mailer.ts - Workers-compatible Resend HTTP booking approval mailer and templates
- (new) - src/components/features/transients/public-stay-date-range-picker.tsx - Shared `PublicStayDateRangeCalendar`, `PublicStayDateRangePicker`, and `StayDateRangePicker`
- (new) - src/components/features/transients/public-booking-scrollytelling.tsx - `ScrollStoryProgress`, `ScrollReveal`, and `useSectionScrollProgress`
- (new) - src/components/features/transients/public-booking-visual-fx.tsx - `WebGLAmbientField`, `SelfDrawingLine`, `MorphingAura`, and `Tilt3DCard`
- (new) - src/components/features/transients/public-booking-tracker.tsx - Interactive `#track` booking status lookup card
- (new) - src/components/features/settings/house-rules-editor.tsx - Rule-per-row drag-and-drop House Rules editor with Add rule bar
- (new) - tests/unit/server/mail/booking-mailer.test.ts - Unit tests for booking approval mailer
- (new) - docs/test/unit/server/mail/booking-mailer.md - Mirrored unit test result doc
- (modified) - src/app/globals.css - Added scrollytelling, self-drawing path, morphing aura, animated gradient CTA, and floral cursive loader keyframes
- (modified) - src/app/api/public/room-photos/[photoId]/route.ts - Added `max-age=300`, `stale-while-revalidate=600`, and `ETag`/`304` caching
- (modified) - src/app/book/[roomId]/page.tsx - Preloaded 120-day unavailable calendar dates
- (modified) - src/app/book/[roomId]/request/page.tsx - Preloaded 120-day unavailable calendar dates
- (modified) - src/components/features/transients/public-booking-chrome.tsx - Added shared multi-layered warm-charcoal elevation shadow tokens
- (modified) - src/components/features/transients/public-booking-client.tsx - Single-line nav, centered 2×2 hero bar + range calendar, booked-room filtering, photo preloading, 3D tilt deck, `#track`, and `#house-rules`
- (modified) - src/components/features/transients/public-booking-sections.tsx - Elevated cards, chapter nav, pinned `StayAnywhereShowcase`, `HouseRulesSection` with per-rule scroll reveal (`HouseRuleRow`), and WebGL footer
- (modified) - src/components/features/transients/public-booking-loader.tsx - Floral cursive `"daisy"` above circular aura + tablet tap animation
- (modified) - src/components/features/transients/public-room-detail-client.tsx - Range calendar with instant recalculation, photo preloading, and numbered House rules
- (modified) - src/components/features/transients/public-booking-request-client.tsx - Range calendar with instant recalculation, required guest email, and tracking CTA
- (modified) - src/components/features/transients/transient-dialogs.tsx - Applied `StayDateRangePicker` with local room-scoped unavailable dates to Owner Book short stay modal
- (modified) - src/components/features/transients/transients-workspace.tsx - Passed `overview.reservations` into `CreateTransientReservationDialog`
- (modified) - src/components/features/settings/business-settings-form.tsx - Scoped form sections cleanly after moving House Rules to dedicated page
- (modified) - src/components/features/settings/settings-workspace.tsx - Added `house_rules` section wiring
- (modified) - src/components/layout/workspace-shell.tsx - Added `/transients/house-rules` to Transient sidebar navigation and topbar titles
- (modified) - src/features/rooms/photos.ts - Returned `updatedAt` for public photo `ETag`
- (modified) - src/features/settings/schemas.ts - Added `"house_rules"` module, `HouseRulesSettingsUpdateSchema`, `DEFAULT_HOUSE_RULES`, `parseHouseRulesList` (no implicit fallback), and `serializeHouseRulesList`
- (modified) - src/features/settings/service.ts - Handled `"house_rules"` module and `transientPolicyNote: null` default
- (modified) - src/features/settings/actions.ts - Handled `"house_rules"` save action with `/book` and `/transients/house-rules` revalidation
- (modified) - src/features/transients/schemas.ts - Required `guestEmail`, added `LookupPublicBookingRequestSchema` and `PublicBookingStatusDto`
- (modified) - src/features/transients/public-service.ts - Added bounded room calendar query, dual-factor lookup, and clean `transientPolicyNote` pass-through
- (modified) - src/features/transients/actions.ts - Triggered `sendBookingApprovedEmailSafe` post-commit on booking approval
- (modified) - prisma/seed.ts - Seeded the 6 House Rules from `HOUSE_20RULES.docx` idempotently
- (modified) - .env.example - Documented `RESEND_API_KEY` and `MAIL_FROM`
- (modified) - docs/architecture/architecture.md - Updated public photo caching, approval mailer, required guest email, and dual-factor status lookup
- (modified) - tests/unit/features/transients/public-booking-view.test.ts - Added range calendar and turnover unit tests
- (modified) - tests/unit/features/transients/schemas.test.ts - Updated required email and lookup schema unit tests
- (modified) - tests/unit/features/settings/schemas.test.ts - Added house rules parsing, serialization, and `"house_rules"` module tests
- (modified) - tests/integration/transients/transients-and-public-booking.test.ts - Supplied valid `guestEmail` on public request fixtures
- (modified) - docs/test/unit/features/transients/public-booking-view.md - Recorded updated unit test run
- (modified) - docs/test/unit/features/transients/schemas.md - Recorded updated unit test run
- (modified) - docs/test/unit/features/settings/schemas.md - Recorded updated unit test run
