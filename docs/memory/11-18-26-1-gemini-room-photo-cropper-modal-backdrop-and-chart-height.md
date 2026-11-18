# Session Summary: Room Photo 4:3 Cropper, Modal Backdrop Lock & Dashboard Chart Height Fix

- **Date:** 11-18-26 (Asia/Manila)
- **Sequence:** 1
- **Agent:** gemini
- **Session ID:** 018f99d7-30ad-4481-9d1b-dc8b2d514eb3
- **Topic:** room-photo-cropper-modal-backdrop-and-chart-height

## Executive Summary

Compacted session spanning 3 coding prompts covering removal of Boarding House room photo uploaders, unlimited Transient room galleries with an on-demand 4:3 (`1200 × 900` px) `react-easy-crop` workflow matching `/book` frames, disabling accidental backdrop-click dismissal across dialogs, and fixing an intermittent ~240 px vertical chart offset on the Dashboard.

## Key Architectural & Technical Decisions

1. **Boarding House Photo Exclusion, Unlimited Transient Gallery & 4:3 Cropper:**
   - Omitted the `Room photos` section and `<RoomPhotosEditor />` when `!isTransient` in `room-form.tsx`, and rejected non-empty `BOARDING` photo payloads/intents in `CreateRoomSchema` / `UpdateRoomSchema` (`src/features/rooms/schemas.ts`), `updateRoom` (`src/features/rooms/service.ts`), and `createRoomPhotoIntent` (`src/features/rooms/photos.ts`).
   - Removed the `ROOM_PHOTO_MAX_GALLERY_ITEMS` (`8`) cap, raised `PHOTO_UPLOAD_RATE_LIMIT` from `30/600s` to `400/600s`, and batched `headPrivateObject` checks (`8` per batch).
   - Installed `react-easy-crop@6.2.5`, added pure crop geometry/filename helpers and a Canvas 2D JPEG exporter in `src/lib/room-photo-crop.ts`, built `RoomPhotoCropperDialog` loaded dynamically via `next/dynamic(..., { ssr: false })` with `44 px` zoom, rotate, skip, re-crop, and retry queue controls, and aligned `/book` and `/book/[roomId]` containers to `aspect-[4/3]` (`1200 × 900`).
   - Verified with `prettier`, `eslint` (`0` errors, `5` pre-existing `@next/next/no-img-element` warnings), `pnpm typecheck`, `pnpm test:unit` (`172/172` across `44` files, `2.57 s`), `tests/integration/rooms/inventory-and-archival.test.ts` (`4/4` in `45.52 s`), and `tests/integration/transients/transients-and-public-booking.test.ts` (`5/5` in `130.82 s`).

2. **Modal Backdrop-Click Lock & Pending Dismiss Guards:**
   - Added `closeOnBackdrop?: boolean` defaulting to `false` on `Dialog` (`src/components/ui/dialog.tsx`) so modals (`RoomPhotoCropperDialog`, `ConfirmDialog`, billing/notice/payment/room/tenant/transient form dialogs, `OfflineVaultUnlockDialog`, `OfflineSyncDialog`) protect crops, form drafts, and confirmations from accidental background clicks while keeping `Escape`, `×`, `Cancel`/`Close`, and non-modal outside-click dismissal on mobile `Sidebar` and popovers.
   - Added `dismissDisabled={pending}` across `src/components/features/transients/transient-dialogs.tsx` (with `disabled={pending}` on `Cancel` / `Keep stay`) and `ReversePaymentDialog` (`src/components/features/payments/payment-dialogs.tsx`), and updated `DESIGN.md`.
   - Verified with `prettier --check`, `eslint` (`0` errors), `pnpm typecheck`, and `git diff --check`.

3. **Dashboard Chart Height & Resize Offset Fix:**
   - Updated `ApexChart` (`src/components/ui/chart.tsx`) to default `chart.parentHeightOffset: 0` (preventing the `+15 px` `240 -> 255 px` post-mount jump and `ResizeObserver` feedback loop), track `renderedConfigRef` vs `latestConfigRef` (skipping redundant post-render `updateOptions`), clear leaked `150 ms` `w.globals.resizeTimer` timeouts before `try { existing.destroy(); }`, and call `target.replaceChildren()` + `target.style.minHeight = ""` before mount and in cleanup so interrupted renders cannot orphan a transparent `240 px` `.apexcharts-canvas`.
   - Verified with `prettier --check`, `eslint` (`0` errors), `pnpm typecheck`, and `git diff --check`.

## Cumulative File Changes

*(Replaced `docs/memory/11-18-26-1-gemini.md` upon compaction.)*

- (new - lib) - `react-easy-crop@6.2.5` - Touch- and keyboard-accessible 4:3 cropper UI loaded on demand with `ssr: false` (`package.json`, `pnpm-lock.yaml`).
- (new) - `src/lib/room-photo-crop.ts`
- (new) - `src/components/features/rooms/room-photo-cropper-dialog.tsx`
- (new) - `tests/unit/lib/room-photo-crop.test.ts`
- (new) - `docs/test/unit/lib/room-photo-crop.md`
- (modified) - `src/features/rooms/schemas.ts`
- (modified) - `src/features/rooms/photos.ts`
- (modified) - `src/features/rooms/service.ts`
- (modified) - `src/components/features/rooms/room-form.tsx`
- (modified) - `src/components/features/rooms/room-photos-editor.tsx`
- (modified) - `src/components/features/transients/transient-listing-form.tsx`
- (modified) - `src/components/features/transients/public-booking-client.tsx`
- (modified) - `src/components/features/transients/public-room-detail-client.tsx`
- (modified) - `src/components/ui/dialog.tsx`
- (modified) - `src/components/ui/chart.tsx`
- (modified) - `src/components/features/transients/transient-dialogs.tsx`
- (modified) - `src/components/features/payments/payment-dialogs.tsx`
- (modified) - `tests/unit/features/rooms/schemas.test.ts`
- (modified) - `tests/integration/rooms/inventory-and-archival.test.ts`
- (modified) - `docs/test/unit/features/rooms/schemas.md`
- (modified) - `docs/test/integration/rooms/inventory-and-archival.md`
- (modified) - `docs/test/integration/transients/transients-and-public-booking.md`
- (modified) - `DESIGN.md`
- (modified) - `docs/architecture/architecture.md`
