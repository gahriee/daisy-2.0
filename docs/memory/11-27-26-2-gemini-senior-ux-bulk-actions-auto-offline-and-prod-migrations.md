# Session Summary: Senior-Friendly UX, Bulk Actions, Schema Simplifications, Auto Offline Sync, and Prod Migrations
- **Date:** 11-27-26
- **Sequence:** 2
- **Agent:** gemini
- **Session ID:** 905c8d81-28eb-428c-b65b-4ed0f7cb7131
- **Topic:** Room title/summary unification, public `/book` cleanup, stays/tenants/maintenance/notices simplifications & bulk actions, billing/payments filters & column pickers, trusted-device passwordless offline sync, removal of Reports, notification polish, and production migrations.

## Executive Summary
Streamlined Daisy across almost every workspace for senior-citizen friendliness and operational simplicity:
1. **Rooms & Public `/book`:** Unified `Room.title` and `Room.summary` in PostgreSQL (`20261127211500_room_title_and_summary`), removed redundant public title/summary inputs, removed Room type / Room setup labels and duplicate thumbnail strip on `/book`, renamed sidebar `Rooms` → `Boarding Rooms`, and unified Room status filtering under `All rooms`.
2. **Transients & Tenants:** Flattened Transient sidebar navigation, merged Pending bookings + Active guests onto `/transients/stays`, removed `TENTATIVE` status and added `TransientReservation.archivedAt` (`20261127222000_remove_tentative_and_archive_stays`), automated stay invoice issuance, removed Bill stay / No-show actions, added `Cancelled` stay filter, added bulk approve/archive checkboxes on stays and tenants, defaulted `/tenants` to `All records`, and moved Assignment history into Tenant Overview.
3. **Billing & Payments:** Supported both active boarders and active transient guests on `/billing/new` (`Name - room title`, single `Due date`, whole-number `Quantity`), removed `Check` payment method, auto-summed payment totals from selected open invoices (showing line items) with `Amount without invoice (PHP)` for advance payments, reduced `/billing` and `/payments` tables to 6 default columns, added collapsible 4-column disaggregated Filters + `TableColumnPicker`, and kept search bar scopes distinct from dedicated filter dropdowns.
4. **Maintenance & Notices:** Removed `WAITING_PARTS` and `CANCELLED` from `MaintenanceStatus` and dropped `MaintenanceRequest.cancelledAt` (`20261128023500_simplify_maintenance_status`), defaulted `/maintenance` to `All requests`, added bulk archive checkboxes, replaced `Manage` with `...` `RowActionMenu` (including next-status transitions), and reduced desktop table columns from 8 to 6. Restricted SMS notices to boarding house tenants (`building: "BOARDING"`), made scheduling optional (instant send by default), simplified notice statuses to `Sent`, `Scheduled`, `Archived` (`All notices` default), and added bulk archive checkboxes.
5. **Reports Removal & Notifications Polish:** Removed the entire Reports feature (routes, APIs, UI, exporters, tests, sidebar/dashboard links, and SW prefix) and updated `/notifications` cards to use a soft blush `Unread` badge and an unboxed lower-right `ActionLink` (`Open record →`).
6. **Passwordless Auto Offline Sync on Trusted Devices:** Added non-extractable WebCrypto AES-256-GCM trusted-device key custody in IndexedDB gated strictly on active Trusted Device status and `offlineUnlockMaxDays`, enabling automatic passwordless offline unlock and foreground sync on load, reconnect, and periodic cadence.
7. **Production Database:** Applied all pending migrations (`20261127222000_remove_tentative_and_archive_stays`, `20261128023500_simplify_maintenance_status`) to production with Owner authorization.

## Key Architectural & Technical Decisions
* **Database Migrations:**
  * `20261127211500_room_title_and_summary` — Consolidated `number`/`notes`/`transientTitle`/`transientDescription` into `Room.title` and `Room.summary` with unique active title index.
  * `20261127222000_remove_tentative_and_archive_stays` — Promoted `TENTATIVE` → `CONFIRMED`, removed `TENTATIVE` from `TransientReservationStatus`, and added `TransientReservation.archivedAt`.
  * `20261128023500_simplify_maintenance_status` — Mapped `WAITING_PARTS` → `IN_PROGRESS` and `CANCELLED` → `RESOLVED` + `archivedAt`, recreated `MaintenanceStatus` (`OPEN`, `IN_PROGRESS`, `RESOLVED`), updated `MaintenanceRequest_status_timestamps_check`, and dropped `cancelledAt`.
* **Consistent Bulk Archive Pattern:** Added `bulkArchiveTenantsAction`, `bulkApproveBookingRequestsAction`, `bulkArchiveTransientReservationsAction`, `bulkArchiveMaintenanceRequestsAction`, and `bulkArchiveNoticesAction`, reusing existing single-record service functions to preserve Owner scoping, active-stay/hold guards, audit entries, and sync feed tombstones.
* **Reusable Filter & Column Controls:** Added `src/components/ui/table-column-picker.tsx` (`FilterToggleButton` + `TableColumnPicker`) for light disaggregated filtering and opt-in columns on `/billing` and `/payments`.
* **Trusted-Device Passwordless Offline Sync:** Stored a non-extractable AES-256-GCM `CryptoKey` in IndexedDB `vaultMeta` (`mode: "trusted_device"`), strictly verified `d.isCurrent && !d.revokedAt` via `/api/devices`, cleared `deviceId` on revocation, enforced `offlineUnlockMaxDays` offline, and preserved legacy passphrase fallback only if old unsynced password-encrypted drafts exist. (Flagged intentional tradeoff against Rule 9.3 passphrase-only custody.)
* **Notice Status Derivation:** Verified `model Notice` has no DB status enum column (`SENT`, `SCHEDULED`, `ARCHIVED` are derived in TypeScript from `archivedAt` and `startDateManila`).
* **Reports Removal:** Deleted all `/reports` and `/api/reports` routes, UI, services, exporters, tests, and test docs; repointed Dashboard chart links to `/rooms` and `/billing`.

## Cumulative File Changes
* (new) - `prisma/migrations/20261127211500_room_title_and_summary/migration.sql` - Room title & summary schema consolidation
* (new) - `prisma/migrations/20261127222000_remove_tentative_and_archive_stays/migration.sql` - Remove `TENTATIVE` and add `TransientReservation.archivedAt`
* (new) - `prisma/migrations/20261128023500_simplify_maintenance_status/migration.sql` - Simplify `MaintenanceStatus` enum and drop `cancelledAt`
* (new) - `src/components/ui/table-column-picker.tsx` - Reusable `FilterToggleButton` and `TableColumnPicker` popover
* (modified) - `prisma/schema.prisma`, `prisma/seed.ts`, `docs/architecture/architecture.md` - Schema updates across rooms, transients, and maintenance
* (modified) - `src/features/{rooms,tenants,transients,billing,payments,maintenance,notices,dashboard}/*` - Domain schemas, services, actions, and sync handlers for unified rooms, bulk archive/approve, automated stay invoicing, active-stay billing recipients, open-invoice payment allocations, simplified maintenance/notice lifecycles, and removed `/reports` revalidations
* (modified) - `src/components/features/{rooms,tenants,transients,billing,payments,maintenance,notices,dashboard,notifications,offline}/*`, `src/components/layout/workspace-shell.tsx`, `src/components/common/page-skeletons.tsx`, `src/app/**` - Senior-friendly UI simplifications, bulk checkboxes, column reductions, soft `Unread` badge + lower-right `ActionLink`, and passwordless trusted-device offline UX
* (modified) - `src/offline/{crypto,db,client,workspace-bridge,snapshot-selectors,snapshot-selectors-extra,sw-policy}.ts`, `public/sw.js` - Trusted-device non-extractable key custody, auto-sync, schema/selector alignment, and `/reports` removal
* (modified) - `tests/unit/**`, `tests/integration/**`, `docs/test/**` - Updated unit/integration tests and mirrored test result docs across rooms, billing, payments, transients, maintenance, notices, and offline crypto/navigation/sw-policy
* (deleted) - `src/app/(workspace)/reports/**`, `src/app/api/reports/**`, `src/components/features/reports/**`, `src/features/reports/**`, `tests/integration/reports/**`, `tests/unit/features/reports/**`, `docs/test/integration/reports/**`, `docs/test/unit/features/reports/**` - Removed Reports feature entirely

