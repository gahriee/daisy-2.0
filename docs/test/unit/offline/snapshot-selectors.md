# Offline snapshot selectors and vault overlays

- Status: PASS
- Last run: 2026-11-28 03:12:38 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, fake-indexeddb 6.2.8
- Command: `pnpm exec vitest run tests/unit/offline/snapshot-selectors.test.ts tests/unit/features/notices/schemas.test.ts`
- Result: 6 passed here (65 ms); 9 passed across 2 files, 830 ms.
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
| 2026-11-28 03:12:38 | `pnpm exec vitest run tests/unit/offline/snapshot-selectors.test.ts tests/unit/features/notices/schemas.test.ts` | 6 passed (9/9 across 2 files) | 65 ms (830 ms run) |
| 2026-11-28 02:40:40 | `pnpm test:unit` | 6 passed (suite: 219/219 across 51 files) | 131 ms (4.93 s suite) |
| 2026-11-27 23:24:32 | `pnpm exec vitest run tests/unit/offline/snapshot-selectors.test.ts` | 6 passed | 850 ms |
| 2026-11-27 22:23:29 | `pnpm test:unit` | 6 passed (suite: 219/219 across 51 files) | 185 ms (3.40 s suite) |
| 2026-11-27 20:29:14 | `pnpm test:unit` | 6 passed (suite: 219/219 across 51 files) | 179 ms (3.83 s suite) |
| 2026-11-16 21:20:06 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 6 passed (suite: 155/155 across 40 files) | 225 ms (2.77 s suite) |
| 2026-11-16 20:59:31 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 5 passed (suite: 153/153 across 40 files) | 226 ms (2.51 s suite) |
| 2026-11-16 19:33:41 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 3 passed (suite: 150/150 across 40 files) | 207 ms (4.51 s suite) |

