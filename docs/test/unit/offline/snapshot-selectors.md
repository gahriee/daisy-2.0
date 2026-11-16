# Offline snapshot selectors and vault overlays

- Status: PASS
- Last run: 2026-11-16 21:20:06 (UTC+8)
- Runtime: Windows, Vitest 5.1.0, fake-indexeddb 6.2.8, Next.js 16.4.6 (`pnpm build` verified)
- Command: `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` (Vitest ran full unit suite + targeted files)
- Result: 6 passed here (225 ms); suite 155 passed, 0 failed, 0 skipped across 40 files, 2.77 s.
- Target file: [tests/unit/offline/snapshot-selectors.test.ts](tests/unit/offline/snapshot-selectors.test.ts) -> [src/offline/snapshot-selectors.ts](src/offline/snapshot-selectors.ts), [src/offline/snapshot-selectors-extra.ts](src/offline/snapshot-selectors-extra.ts)

## Verified criteria

- Reconstructs `TenantsOverviewDto` from decrypted IndexedDB snapshots/projections, including active assignments, tenant notes, boarding-only `assignableBeds`, and exact `BigInt` derived balances minus unallocated payment credits.
- Reconstructs `PaymentsOverviewDto`, open invoices (`isOverdue` strictly derived from `dueDateManila`), payer open/unallocated credit balances, and `MaintenanceOverviewDto` / `MaintenanceDetailDto` (requests, rooms/beds, priority/status/hold counters) from decrypted vault rows + cached policy metadata.
- Reconstructs `TransientsOverviewDto`, `RoomsOverviewDto`, `BillingOverviewDto`, `NoticesOverviewDto`, and `DashboardSnapshot` (KPIs, room availability, billing period status, due/overdue items, notices, recent payments, maintenance holds, and dashboard charts) using exact `BigInt` arithmetic and Manila date helpers (`diffManilaDays`).
- Indexes active outbox rows (`buildSyncBadgeMap`) across tenants, payments, maintenance tickets, and transient guests/reservations, prioritizing `Needs attention` outcomes (`conflict`, `rejected`, `blocked`) over normal `pending` edits.
- Overlays pending local tenant/payment/maintenance/transient drafts cleanly onto online server overviews while retaining authoritative server rows alongside conflict badges when an item needs attention.
- Verifies round-trip Dexie loading via `loadTenantsOverviewFromVault`, `loadPaymentsOverviewFromVault`, `loadMaintenanceOverviewFromVault`, `loadMaintenanceDetailFromVault`, `loadTransientsOverviewFromVault`, `loadRoomsOverviewFromVault`, `loadBillingOverviewFromVault`, `loadNoticesOverviewFromVault`, and `loadDashboardSnapshotFromVault`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 21:20:06 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 6 passed (suite: 155/155 across 40 files) | 225 ms (2.77 s suite) |
| 2026-11-16 20:59:31 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 5 passed (suite: 153/153 across 40 files) | 226 ms (2.51 s suite) |
| 2026-11-16 19:33:41 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 3 passed (suite: 150/150 across 40 files) | 207 ms (4.51 s suite) |

