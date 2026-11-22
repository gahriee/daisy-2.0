# Session Summary: Active Filter Defaults, Route Skeletons, Alert Alignment, and CountPill UI

- **Date:** 11-22-26
- **Sequence:** 4
- **Agent:** gemini
- **Session ID:** 7d947734-b835-40ac-8973-6ab1e7c22cf6
- **Topic:** Active filter defaults, persistent workspace layout with skeleton loading, Alert icon alignment, and CountPill / no-middot UI standardization

## Executive Summary

Completed four UI and navigation architecture improvements across Daisy:
1. Removed the **Unarchived** filter option from Notices and Maintenance and standardized all applicable modules (Notices, Maintenance, Settings — Trusted Devices, alongside already-compliant Rooms, Room Types, and Tenants) to default to **Active**.
2. Fixed vertical alignment of the geometric status icon inside the shared `Alert` primitive so alerts with right-side action buttons stay optically centered.
3. Introduced a zero-dependency Tailwind skeleton loading system and moved Owner workspace routes into `src/app/(workspace)/` under a shared persistent `WorkspaceShell` layout so navigating between modules keeps the sidebar and topbar mounted while displaying layout-matched skeletons inside `<main>`, plus client-side skeletons for Reports, Audit, Public Booking availability, and Topbar notifications.
4. Added a shared `CountPill` primitive and `RowActionItem.badge` support, replaced parenthesized count labels (e.g., `Notes (1)`) and middot-joined (`[text] · [text]`) metadata across applicable modules, and documented the standard in `DESIGN.md` and `.agents/rules/5-style-conventions.md`.

## Key Architectural & Technical Decisions

* **Active Filter Standardization:** Removed `CURRENT` (`Unarchived (active, scheduled, expired)`) from Notices (`notices-workspace.tsx`) and `ACTIVE_QUEUE` (`Active & recent (unarchived)`) from Maintenance (`maintenance-workspace.tsx`), defaulting Notices to `ACTIVE`, Maintenance to `ACTIVE` (unarchived `OPEN`, `IN_PROGRESS`, or `WAITING_PARTS` matching its KPI card), and Trusted Devices (`device-management-panel.tsx`) to `active`.
* **Alert Icon Centering:** Replaced fixed `top-4` positioning in `src/components/ui/alert.tsx` with `top-1/2 -translate-y-1/2` so icons center cleanly with single-line copy and taller right-side action buttons.
* **Persistent WorkspaceShell & Route Skeletons:** Created `src/app/(workspace)/layout.tsx` wrapping all Owner routes while retaining independent per-page `connection()` + `isOwner()` authorization checks per Rule 2.2. Added pathname-based title resolution and `WorkspacePageTitle` context override inside `WorkspaceShell`, enhanced `Skeleton` with `animate-pulse motion-reduce:animate-none`, created `src/components/common/page-skeletons.tsx`, added 33 `loading.tsx` files across `(workspace)` and `/book`, and wired client-side skeletons into Reports, Audit, Public Booking, and Topbar notifications.
* **CountPill & No-Parenthesis / No-Middot Formatting:** Exported `CountPill` from `src/components/ui/badge.tsx` and added `badge?: string | number | undefined` to `RowActionItem` (`row-action-menu.tsx`). Replaced parenthesized counts and middot-joined text across Tenants, Billing, Notifications, Offline Sync, Rooms, Notices, Transients, Public Booking, and Audit Log, and recorded the durable rule in `DESIGN.md` (476 lines) and `.agents/rules/5-style-conventions.md`.

## Cumulative File Changes

* (modified) - `src/components/ui/alert.tsx` - Vertically centered alert status icon (`top-1/2 -translate-y-1/2`).
* (modified) - `src/components/ui/skeleton.tsx` - Added `animate-pulse motion-reduce:animate-none` animation.
* (modified) - `src/components/ui/badge.tsx` - Exported `CountPill` component.
* (modified) - `src/components/ui/row-action-menu.tsx` - Added optional `badge` prop rendered with right-aligned `CountPill`.
* (new) - `src/components/common/page-skeletons.tsx` - Reusable layout-matched skeleton templates for all route types and dynamic panels.
* (modified) - `src/components/layout/workspace-shell.tsx` - Added `resolveWorkspaceTitle`, `WorkspacePageTitle` context override, and notification popover loading skeletons.
* (new) - `src/app/(workspace)/layout.tsx` - Persistent authenticated `WorkspaceShell` layout for Owner workspace routes.
* (moved & modified) - `src/app/(workspace)/**/page.tsx`, `src/app/(workspace)/settings/_lib/settings-page.tsx`, `src/app/(workspace)/transients/_lib/transient-section-page.tsx` - Moved into `(workspace)` route group, removed duplicate `WorkspaceShell` wrappers, and kept per-page `isOwner()` checks.
* (new) - 33 `loading.tsx` files across `src/app/(workspace)/**` and `src/app/book/**` - Route-level skeleton loading boundaries.
* (modified) - `src/components/features/notices/notices-workspace.tsx`, `src/components/features/notices/notice-dialogs.tsx` - Defaulted status filter to `ACTIVE`, removed unarchived option, and cleaned SMS estimate/preview copy.
* (modified) - `src/components/features/maintenance/maintenance-workspace.tsx` - Replaced `ACTIVE_QUEUE` (unarchived) with `ACTIVE` default filter.
* (modified) - `src/components/features/settings/device-management-panel.tsx` - Defaulted device status filter to `active` with `Show all devices` fallback.
* (modified) - `src/components/features/tenants/tenants-workspace.tsx`, `src/components/features/tenants/tenant-dialogs.tsx` - Replaced `Notes (N)` and `Recorded notes (N)` with `CountPill` / `RowActionItem.badge`.
* (modified) - `src/components/features/billing/billing-workspace.tsx` - Replaced `Send overdue SMS (N)` with `CountPill`.
* (modified) - `src/components/features/notifications/notifications-workspace.tsx` - Replaced `Select all on page (N)` with `CountPill`.
* (modified) - `src/components/features/offline/offline-sync-dialog.tsx` - Replaced `Needs attention (N)` with warning `CountPill`.
* (modified) - `src/components/features/reports/reports-workspace.tsx` - Wired `ReportsContentSkeleton` during report loading transitions.
* (modified) - `src/components/features/audit/audit-log-explorer.tsx` - Wired `TableCardSkeleton` during filter fetches and removed middot separator from activity labels.
* (modified) - `src/components/features/rooms/room-photos-editor.tsx`, `src/components/features/rooms/room-photo-cropper-dialog.tsx` - Replaced `Room shots (N)` with `CountPill` and removed middots/parentheses from photo metadata and cropper badges.
* (modified) - `src/components/features/transients/transients-workspace.tsx`, `src/components/features/transients/public-booking-client.tsx`, `src/components/features/transients/public-room-detail-client.tsx` - Wired `PublicBookingCardsSkeleton`, replaced `All room photos (N)` with `CountPill`, and stacked stay confirmation details cleanly.
* (modified) - `DESIGN.md`, `.agents/rules/5-style-conventions.md` - Documented `CountPill`, `RowActionItem.badge`, and prohibited parenthesized counts and middot-joined text.

