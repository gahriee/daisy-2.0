# Session Summary: Camera Scanner, Shared Dropbox, SMTP Mailer, MapLibre Pin & Email Icons

- **Date:** 11-23-26
- **Sequence:** 1
- **Agent:** gemini
- **Session ID:** 9987c373-4b68-457f-8d54-bfe893589b6c
- **Topic:** Contract camera scanner, shared attachment dropbox, Nodemailer SMTP settings, MapLibre PH map pin & Grab deep links, and inline CID email icons

## Executive Summary

Built a live camera capture and animated scan-mode review modal for signed tenant contracts, unified all five attachment upload surfaces onto a shared drag-and-drop `AttachmentDropbox` primitive, migrated booking confirmation emails from Resend to Owner-configurable Nodemailer SMTP (`/settings/email`), replaced Leaflet with Philippines-locked MapLibre GL JS (Esri keyless Street/Satellite/Hybrid tiles, 3D tilt, two-way address autocomplete, and Grab Green **Book Grab** links), and embedded Daisy's 5-petal brand icon and Grab car icon as inline CID `@2x` PNG attachments so Gmail renders them reliably. Also fixed double-hyphen invoice/receipt prefixes in `prisma/seed.ts`.

## Key Architectural & Technical Decisions

- **Contract Camera Scanner & Shared Dropbox:** Created `ContractCameraScanDialog` (portaled `Dialog` with `getUserMedia` rear viewfinder + file-capture fallback, `Original`/`Magic white`/`B&W scan` modes, 90° rotation, and reduced-motion-safe CSS sweep animations) and `AttachmentDropbox` (flicker-free drag-depth tracking, compact mode, secondary action slot) across contracts, payment proofs, maintenance requests/updates, and room photos.
- **Nodemailer SMTP & `/settings/email`:** Replaced Resend with Nodemailer SMTP (`src/server/mail/booking-mailer.ts`), adding additive `BusinessSettings` SMTP columns (`prisma/migrations/20261123060000_smtp_email_settings/migration.sql`) with AES-256-GCM encrypted password storage, Gmail preset, disconnect confirmation, and live test email action.
- **MapLibre GL JS, Two-Way Geocoding & Grab Integration:** Added nullable `businessLatitude` and `businessLongitude` columns (`prisma/migrations/20261123070000_business_location_pin/migration.sql`). Migrated map picker/preview to `maplibre-gl` with keyless Esri ArcGIS Online Street/Satellite/Hybrid tiles, `maxBounds` and marker drag clamping strictly to the Philippines, two-way Photon/Nominatim PH autocomplete and reverse geocoding, hidden raw lat/lng coordinates, and `buildGrabBookingUrl` + `GrabBookingLinkButton` (`#00b14f`). Updated CSP and `Referrer-Policy` (`strict-origin-when-cross-origin`) in `next.config.ts`.
- **Inline CID Email Icons:** Embedded `@2x` PNG buffers for Daisy's 5-petal icon (`cid:daisy-icon@daisy`) and the Grab car icon (`cid:grab-icon@daisy`) via Nodemailer CID attachments so email clients (including Gmail) render icons without stripping `<svg>`.

## Cumulative File Changes

- (new) - `src/components/features/tenants/contract-camera-scan-dialog.tsx` - Live camera capture & animated scan-mode review modal
- (new) - `src/components/ui/attachment-dropbox.tsx` - Shared drag-and-drop attachment dropbox primitive
- (new) - `src/components/ui/property-map-pin.tsx` - MapLibre GL JS Philippines-locked pin picker, read-only map preview, address autocomplete input, and `GrabBookingLinkButton`
- (new) - `src/app/(workspace)/settings/email/page.tsx` - Dedicated `/settings/email` route
- (new) - `src/components/features/settings/email-settings-panel.tsx` - Owner Gmail/SMTP settings & test-email UI
- (new) - `prisma/migrations/20261123060000_smtp_email_settings/migration.sql` - Additive SMTP columns on `BusinessSettings`
- (new) - `prisma/migrations/20261123070000_business_location_pin/migration.sql` - Additive `businessLatitude` and `businessLongitude` columns on `BusinessSettings`
- (new) - `docs/presentation/Daisy-System-Presentation-Flow.docx`, `docs/presentation/Daisy-System-Presentation-Flow-Owner.docx` - Presentation flow, Taglish script, and inline demo data
- (modified) - `package.json`, `pnpm-lock.yaml`, `.env.example`, `prisma/schema.prisma`, `prisma/seed.ts`, `next.config.ts`, `src/app/globals.css` - Added Nodemailer and MapLibre dependencies, schema fields, seed prefix fix, CSP/Referrer-Policy updates, and scanner animation keyframes
- (modified) - `src/server/mail/booking-mailer.ts`, `tests/unit/server/mail/booking-mailer.test.ts`, `docs/test/unit/server/mail/booking-mailer.md` - Nodemailer SMTP transport, pinned directions & Grab buttons, and inline CID PNG icons with unit test coverage
- (modified) - `src/features/settings/schemas.ts`, `src/features/settings/service.ts`, `src/features/settings/actions.ts`, `src/components/features/settings/business-settings-form.tsx`, `src/components/features/settings/settings-workspace.tsx`, `src/components/layout/workspace-shell.tsx` - Email settings module, navigation, and two-way address/map pin persistence
- (modified) - `src/features/transients/schemas.ts`, `src/features/transients/public-service.ts`, `src/features/transients/public-booking-view.ts`, `src/features/transients/actions.ts`, `src/app/book/page.tsx`, `tests/unit/features/transients/public-booking-view.test.ts` - Pinned coordinates, `buildMapDirectionsUrl`, `buildGrabBookingUrl`, and mailer wiring
- (modified) - `src/components/features/transients/public-room-detail-client.tsx`, `src/components/features/transients/public-booking-sections.tsx`, `src/components/features/transients/public-booking-chrome.tsx`, `src/components/features/transients/public-booking-tracker.tsx`, `src/components/features/transients/public-booking-client.tsx` - Map preview, Get directions, and Grab green booking links across `/book`
- (modified) - `src/components/features/tenants/tenant-contract-form.tsx`, `src/components/features/payments/payment-create-form.tsx`, `src/components/features/maintenance/maintenance-shared.ts`, `src/components/features/maintenance/maintenance-create-form.tsx`, `src/components/features/maintenance/maintenance-detail-view.tsx`, `src/components/features/rooms/room-photos-editor.tsx` - Adopted shared `AttachmentDropbox` across all upload surfaces
- (new - lib) - `nodemailer`, `@types/nodemailer`, `maplibre-gl`, `@maplibre/maplibre-gl-geocoder` - SMTP email delivery and interactive WebGL map pin/geocoding

