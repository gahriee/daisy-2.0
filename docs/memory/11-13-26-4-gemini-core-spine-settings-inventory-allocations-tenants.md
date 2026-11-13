# Session Summary: Core Spine, Settings, Audit, Inventory, Allocations, and Tenants
**Date:** 11-13-26
**Sequence:** 4
**Agent:** gemini
**Session ID:** f9de687b-af8c-4d27-934b-abfa83aed430
**Topic:** Isolated Neon Branches, Step 1 Core Spine (/settings, /audit, Auth Hardening, SyncHead), Sticky Collapsible Sidebar & Topbar, Step 2 RoomTypes, Rooms/Beds, btree_gist Allocations, Tenants & Assignments, and `/rooms/types` Route

## Executive Summary
Moved development and integration test execution off production onto isolated Neon branches (`dev` and expiring schema-only `test-integration`), implemented Step 1 (money/date helpers, core authority/settings/device/sync/audit schema, login rate limiting, `SyncHead` publication lock, `NotificationRead`, `/settings`, `/audit`), redesigned the workspace shell (`Sidebar` icon-rail collapse, disclosure sub-navigation, `Topbar` breadcrumbs/alerts/Owner menu, `MetricCard`, centered `EmptyState`, dynamic `SearchFilterBar`, `Table`, `Tabs`, `Dialog`, recolored unDraw vectors), and delivered Step 2 (Owner-configurable `RoomType` presets with default pricing, `Room`/`Bed` soft-archival inventory, PostgreSQL `btree_gist` `Allocation` exclusion engine with sorted `FOR UPDATE` locking, syncable `Tenant` CRUD + `applyTenantSyncOperation`, online-only `TenantAssignment` move-in/out/cancellation, `/rooms`, `/rooms/types`, `/tenants`, `/tenants/[tenantId]`, and verified unit + PostgreSQL integration suites).

## Key Architectural & Technical Decisions

* **Isolated Database Branches & HMR Cache Invalidations (Prompts 1–2, 14–15, 20):**
  * Checked out `dev` (`br-rough-night-b3uph0d4`) and created schema-only `test-integration` (`br-broad-river-b30q4qrw`) in `.env.test.local` (`TEST_DATABASE_URL`); applied incremental migrations `20261113102310_core_authority_settings_sync_spine`, `20261113135000_inventory_allocations_tenants`, and `20261113150000_room_types_with_pricing` only to `dev` and `test-integration`. `production` remains untouched at `20261113060000_recovery_security`.
  * Extracted pure `ensureOwnerRecord` (`src/server/db/owner-record.ts`) to avoid `next/headers` ESM conflicts in Vitest, used explicit `BigInt(...)` calls for ES2017 targets, and introduced `PRISMA_CLIENT_SCHEMA_TAG` (`"20261113150000_room_types_with_pricing"`) in `src/server/db/client.ts` so long-running `next dev` processes disconnect and replace stale `globalThis.daisyDatabase` singletons after schema migrations.
  * Updated `src/server/db/pg-errors.ts` (`extractPgError`, `isPgConstraintError`) to unwrap `meta.driverAdapterError.cause` for Prisma 7 Neon WebSocket errors (`23505`, `23P01`) before short-circuiting on Prisma codes.
* **Step 1 Core Spine, Settings, Devices & Audit (Prompts 2–3):**
  * Kept financial policies (`prorationMethod`, `depositPolicy`, `overpaymentCreditPolicy`, `dailyCutoffManila`) `null` until explicitly saved under `expectedVersion`.
  * Enforced DB-backed login rate-limiting (`consumeAuthLimit`) and identifier-only `SecurityEvent` logging in `/api/auth/[...path]`; issued 256-bit `HttpOnly; SameSite=Strict` `daisy_device` cookies with `lockActiveDeviceForShare`; serialized monotonic `SyncHead` sequences under `SELECT ... FOR UPDATE`; exposed bounded `GET /api/audit` + `/audit` and `GET /api/notifications` (`NotificationRead`).
  * Built atomic cross-tab Settings submission (`section hidden={...}` inside one versioned `<form>`) driven by sidebar `?tab=` links without duplicating in-page tabs or showing version numbers in UI copy.
* **Workspace Shell, Primitives & Editorial Polish (Prompts 3–13, 16–19):**
  * Built fluid `<main>` layout (`WorkspaceShell`) with sticky collapsible `Sidebar` (`256 px` <-> `76 px` persisted via `useSyncExternalStore` without effect-triggered `setState`), footer-aligned collapse control + client-mounted `ManilaDateTime`, `TopbarBreadcrumb` (`Section > Subpage`), notification popover, Owner profile menu, borderless large-icon centered `MetricCard`, centered `EmptyState`, `Select` filters, `size="md"` `Refresh` buttons with icons, empty-only unDraw vectors, and zero top-right header summary badges.
* **Step 2 Inventory, Allocations, Tenants & Separate `/rooms/types` Workflow (Prompts 14, 20–21):**
  * Replaced hardcoded `RoomType` enum with Owner-scoped `RoomType` table (`monthlyRate`, optional `dailyRate`, `description`, `version`, `archivedAt`, partial unique active case-insensitive index `"RoomType_ownerUserId_name_active_key"`, non-negative `CHECK` constraints); `createRoom` automatically inherits `monthlyRate` (and optional `dailyRate`) from the selected active `RoomType`.
  * Protected `/rooms` and `/rooms/types` with Owner-only dynamic rendering (`instant = false`, `await connection()`), `Cache-Control: private, no-store` (`GET /api/rooms`, `GET /api/tenants`), sorted `FOR UPDATE` locking in `lockAllocationResources`, half-open `[startDate, endDate)` PostgreSQL `btree_gist` exclusion constraint (`Allocation_active_bed_interval_excl`), allocation-blocked soft archival with `ChangeFeed` tombstones, syncable `Tenant` CRUD + `applyTenantSyncOperation` (`SyncOperationOutcome` idempotency/conflict/blocked states), online-only max-1 active `TenantAssignment` per tenant with atomic `Bed.status` transitions, and identifier-only `AuditLog` + ending-soon assignment notifications (`/tenants/<tenantId>`).
  * Created dedicated `/rooms/types` route (`RoomTypesWorkspace`) featuring an inline creation panel paired with searchable/filterable saved room types and `EditRoomTypeDialog`, replaced flat `/rooms` sidebar link with expandable `Rooms & beds` `SidebarNavDisclosure` (`Rooms & beds` `/rooms` + `Room types` `/rooms/types`) and `Rooms & beds > Room types` topbar breadcrumb, removed header quick links, and split `tests/integration/rooms/inventory-and-archival.test.ts` into two focused integration tests running within Vitest's `20 000 ms` timeout (`7/7` integration files, `31/31` tests PASS; `17/17` unit files, `67/67` tests PASS; `pnpm build` `21/21` routes PASS).

## Cumulative File Changes

### Created
* `prisma/migrations/20261113102310_core_authority_settings_sync_spine/migration.sql` - Core authority, settings, device, sync head, change feed, audit, and notification tables with `CHECK` constraints
* `prisma/migrations/20261113135000_inventory_allocations_tenants/migration.sql` - `Room`, `Bed`, `Allocation` (`btree_gist` exclusion), `Tenant`, and `TenantAssignment` constraints
* `prisma/migrations/20261113150000_room_types_with_pricing/migration.sql` - `RoomType` table with pricing constraints, legacy enum backfill, and `Room.roomTypeId` foreign key
* `public/illustrations/{adjust-settings.svg,document-search.svg}` - Recolored unDraw illustrations matching Rausch & charcoal semantic tokens
* `src/lib/{money.ts,dates.ts,errors.ts}` - Exact centavo `BigInt`, `Asia/Manila` date boundaries, and typed `AppError` classes
* `src/server/db/{owner-record.ts,pg-errors.ts}` - Pure `ensureOwnerRecord` helper and Prisma/Neon PostgreSQL SQLSTATE extraction
* `src/server/auth/{device.ts,workspace-profile.ts}` - Device cookie registration/revocation/row-share lock and Topbar Owner profile loader
* `src/server/security/auth-security.ts`, `src/server/sync/publish.ts`, `src/server/notifications/service.ts`, `src/server/http/route-helpers.ts` - DB login rate limits, `SyncHead` publication lock + audit/feed helpers, notification projections, and private route guards
* `src/features/settings/{schemas.ts,service.ts,actions.ts}`, `src/features/devices/schemas.ts`, `src/features/audit/{schemas.ts,service.ts}` - Settings, devices, and bounded audit services
* `src/features/allocations/{schemas.ts,service.ts}` - Unified allocation interval validation, sorted locking, and completion/cancellation transactions
* `src/features/rooms/{schemas.ts,service.ts,actions.ts}` - `RoomType`, `Room`, and `Bed` contracts, rate inheritance, soft archival, and Server Actions
* `src/features/tenants/{schemas.ts,sync-contracts.ts,service.ts,sync-handler.ts,actions.ts}` - Syncable `Tenant` CRUD/replay handler and online-only `TenantAssignment` lifecycle
* `src/app/api/audit/route.ts`, `src/app/api/devices/{route.ts,register/route.ts,[deviceId]/revoke/route.ts}`, `src/app/api/notifications/{route.ts,read/route.ts}`, `src/app/api/rooms/route.ts`, `src/app/api/tenants/route.ts` - Owner-protected API route handlers
* `src/app/settings/page.tsx`, `src/app/audit/page.tsx`, `src/app/rooms/page.tsx`, `src/app/rooms/types/page.tsx`, `src/app/tenants/page.tsx`, `src/app/tenants/[tenantId]/page.tsx` - Owner App Router workspace pages
* `src/components/ui/{dialog.tsx,metric-card.tsx,search-filter.tsx,table.tsx,tabs.tsx}` - Reusable UI primitives (`Dialog`, `MetricCard`, `SearchFilterBar`/`SearchFilterInput`/`SearchFilterChips`, `Table`, `Tabs`)
* `src/components/layout/page-hero-banner.tsx` - Hairline banner component (superseded on Settings/Audit by compact operational headers)
* `src/components/features/audit/audit-log-explorer.tsx`, `src/components/features/settings/{settings-workspace.tsx,business-settings-form.tsx,device-management-panel.tsx}` - Audit log explorer and versioned Settings/Devices workspaces
* `src/components/features/rooms/{room-dialogs.tsx,rooms-workspace.tsx,room-types-workspace.tsx}`, `src/components/features/tenants/{tenant-dialogs.tsx,tenants-workspace.tsx,tenant-detail-workspace.tsx}` - Rooms, Room types, Tenants, and Assignment workspaces
* `tests/unit/lib/{money.test.ts,dates.test.ts}`, `tests/unit/features/settings/schemas.test.ts`, `tests/unit/features/audit/schemas.test.ts`, `tests/unit/features/allocations/schemas.test.ts`, `tests/unit/features/rooms/schemas.test.ts`, `tests/unit/features/tenants/schemas.test.ts` and mirrored `docs/test/unit/...` reports
* `tests/integration/settings/settings-and-devices.test.ts`, `tests/integration/sync/publish-head.test.ts`, `tests/integration/audit/audit-route.test.ts`, `tests/integration/allocations/allocation-engine.test.ts`, `tests/integration/rooms/inventory-and-archival.test.ts`, `tests/integration/tenants/tenants-and-assignments.test.ts` and mirrored `docs/test/integration/...` reports

### Modified
* `prisma/schema.prisma`, `src/server/db/client.ts` - Added Step 1 & Step 2 models/enums (`RoomType`, `Room`, `Bed`, `Allocation`, `Tenant`, `TenantAssignment`) and `PRISMA_CLIENT_SCHEMA_TAG` HMR guard
* `src/lib/money.ts` - Added `normalizeNonNegativeMoneyDecimal`
* `src/server/auth/owner.ts`, `src/app/api/auth/[...path]/route.ts`, `src/app/page.tsx`, `src/app/audit/page.tsx`, `src/app/settings/page.tsx` - Auth hardening, Owner profile wiring, and server page updates
* `src/components/layout/{daisy-brand.tsx,workspace-shell.tsx}`, `src/components/ui/{empty-state.tsx,field.tsx,sidebar.tsx}` - Centered collapsed mark, expandable `Rooms & beds` and `Settings` disclosures, Topbar breadcrumbs/notifications/Owner menu, fluid `<main>`, centered `EmptyState`, and `Field` prop types
* `tests/unit/server/auth/proxy.test.ts`, `docs/test/unit/server/auth/proxy.md`, `docs/test/unit/server/db/client.md`, `docs/test/integration/auth/password-recovery.md`, `docs/test/manual/neon/service-connectivity.md` - Expanded tests and updated verification logs
* `AGENTS.md`, `DESIGN.md`, `README.md`, `docs/architecture/architecture.md` - Documented branch targets, UI primitives, expandable sidebar nav, `/rooms`, `/rooms/types`, `/tenants`, and schema status

