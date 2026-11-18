# Session Summary: Web Scroll Ergonomics, Notifications Workspace, Sync Modal & Passphrase UX

- **Date:** 11-17-26 (Asia/Manila)
- **Sequence:** 1
- **Agent:** gemini
- **Session ID:** 5fddf803-cde9-4e7a-b2b3-639b6510d0b5
- **Topic:** web-scroll-notifications-sync-modal-and-passphrase-ux

## Executive Summary

Compacted session covering 5 prompts focused on desktop/mobile web scroll ergonomics, the dedicated `/notifications` workspace and dismissal persistence, the workspace `OfflineSyncDialog` modal, and a flattened, browser-password-manager-friendly offline passphrase setup flow.

## Key Architectural & Technical Decisions

1. **Web Scroll Ergonomics & Cross-Browser Scrollbars:**
   - Added scrollbar tokens in `src/app/globals.css`: `--scrollbar-size` (`0.6875rem` / `11 px`), `--scrollbar-size-compact` (`0.5625rem` / `9 px`), `--scrollbar-thumb` (`color-mix` on `--control-border`), `--scrollbar-thumb-hover`, `--scrollbar-thumb-active`, and `--scrollbar-track` (`transparent`), scoped to `@media (pointer: fine)` with `@supports not selector(::-webkit-scrollbar)` fallback and `@media (forced-colors: active)` reset.
   - Set `scroll-padding-top: 5rem` (`80 px`, clearing the `64 px` `Topbar`), `scroll-padding-bottom: 1.5rem`, reduced-motion-safe `scroll-behavior: smooth`, `overscroll-x-contain` on `Table` and `TabsList`, `overscroll-contain` on `SidebarContent` and `Dialog`, and ref-counted `document.body` scroll lock (`data-daisy-scroll-locks`) on `Dialog`.

2. **Notification Cards, Topbar Cap & `/notifications` Route:**
   - Extracted browser-safe `src/features/notifications/schemas.ts` (`OwnerNotification`, `NotificationTone`, `NotificationCategory`, `getNotificationCategory`, `sortOwnerNotifications`, `chunkNotificationKeys` in 50-key batches, `NOTIFICATIONS_UPDATED_EVENT`) and re-exported from `src/server/notifications/service.ts`.
   - Built `NotificationCard` (`src/components/features/notifications/notification-card.tsx`) with neutral `#ffffff` unread styling (`border-control-border/80`, `Unread` badge, tonal icon tile, no hover effects) and `#f7f7f7` read states.
   - Capped the Topbar popover (`src/components/layout/workspace-shell.tsx`) at 5 cards with a `44 px` `See all` footer link to `/notifications`.
   - Added the Owner-protected `/notifications` page (`src/app/notifications/page.tsx`, `NotificationsWorkspace`) and added `"/notifications"` to `NEVER_CACHE_PREFIXES` in `src/offline/sw-policy.ts` and `public/sw.js`.

3. **Notification Bulk Actions & `NotificationDismissal` Persistence:**
   - Added a standard workspace `<header>` on `/notifications`, `44 px` bulk `Checkbox` selection (`Select all on page`, `Select all N`, `Mark as read`, `Mark as unread`, `Delete`, `Clear`), `RowActionMenu`, and `ConfirmDialog` gating.
   - Added `NotificationDismissal` (`ownerUserId`, `notificationKey`, `dismissedAt`) in `prisma/schema.prisma` with additive migration `prisma/migrations/20261117010000_notification_dismissals/migration.sql` (applied to `dev` and `test-integration`; `production` left untouched at `20261113060000_recovery_security`).
   - Implemented `markOwnerNotificationsUnread`, `deleteOwnerNotifications`, and `POST /api/notifications/{unread,delete}/route.ts`, verified in `tests/integration/settings/settings-and-devices.test.ts`.

4. **Workspace `OfflineSyncDialog` & Flat Passphrase UX:**
   - Converted `OfflineStatusBar` (`src/components/features/offline/offline-status-bar.tsx`) into a `44 px` trigger opening `OfflineSyncDialog` (`offline-sync-dialog.tsx`) via `DAISY_OPEN_SYNC_MODAL_EVENT` / `openOfflineSyncModal()` (`src/offline/workspace-bridge.ts`). Removed `/offline` from `Sidebar` while retaining `src/app/offline/page.tsx` as a route fallback.
   - Flattened `OfflineSyncDialog` and `OfflineVaultWorkspace` (zero nested borders: borderless `<dl>`, `divide-y` `Needs attention` rows, and separated notification toolbar).
   - Added CSPRNG `generateVaultPassphrase()` (`4x5` unambiguous characters in `src/offline/crypto.ts`) and a `<form method="post">` with `autoComplete="username"` (`Daisy Offline Vault`) + `new-password` / `current-password` for browser/iOS Keychain saving, `Copy`, and `Generate new`.

## Cumulative File Changes

*(Replaced `docs/memory/11-17-26-1-gemini.md` upon compaction.)*

- (new) - `src/features/notifications/schemas.ts`
- (new) - `src/components/features/notifications/notification-card.tsx`
- (new) - `src/components/features/notifications/notifications-workspace.tsx`
- (new) - `src/app/notifications/page.tsx`
- (new) - `prisma/migrations/20261117010000_notification_dismissals/migration.sql`
- (new) - `src/app/api/notifications/unread/route.ts`
- (new) - `src/app/api/notifications/delete/route.ts`
- (new) - `src/components/features/offline/offline-sync-dialog.tsx`
- (new) - `tests/unit/features/notifications/schemas.test.ts`
- (new) - `docs/test/unit/features/notifications/schemas.md`
- (modified) - `src/app/globals.css`
- (modified) - `src/components/ui/table.tsx`
- (modified) - `src/components/ui/tabs.tsx`
- (modified) - `src/components/ui/sidebar.tsx`
- (modified) - `src/components/ui/dialog.tsx`
- (modified) - `src/components/layout/workspace-shell.tsx`
- (modified) - `prisma/schema.prisma`
- (modified) - `src/server/notifications/service.ts`
- (modified) - `src/app/api/notifications/read/route.ts`
- (modified) - `src/offline/sw-policy.ts`
- (modified) - `src/offline/workspace-bridge.ts`
- (modified) - `src/offline/crypto.ts`
- (modified) - `public/sw.js`
- (modified) - `src/components/features/offline/offline-status-bar.tsx`
- (modified) - `src/components/features/offline/offline-vault-unlock.tsx`
- (modified) - `src/components/features/offline/offline-vault-workspace.tsx`
- (modified) - `tests/unit/offline/sw-policy.test.ts`
- (modified) - `tests/unit/offline/crypto.test.ts`
- (modified) - `tests/integration/settings/settings-and-devices.test.ts`
- (modified) - `docs/test/unit/offline/sw-policy.md`
- (modified) - `docs/test/unit/offline/crypto.md`
- (modified) - `docs/test/integration/settings/settings-and-devices.md`
- (modified) - `DESIGN.md`
- (modified) - `docs/architecture/architecture.md`
