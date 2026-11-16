# Session Summary: Dashboard, Reports & CSV Exports, Sync Transport, Offline Vault/SW, and Cleanup Job

- **Date:** 11-16-26 (Asia/Manila)
- **Sequence:** 1
- **Agent:** gemini
- **Session ID:** 47d062bc-61b1-42e6-9f75-51ea60035d67
- **Topic:** dashboard-reports-sync-transport-offline-vault-and-cleanup

## Executive Summary

Completed Steps 7–11 of Daisy's core application build: the live **Dashboard** (`/`), fixed `PrismaNeon` pool reuse across Webpack chunks/HMR (`src/server/db/client.ts`), **Reports & CSV Exports** (`/reports`, `/api/reports`, `/api/reports/export`), **Sync Transport Endpoints** (`/api/sync/bootstrap`, `/api/sync/push`, `/api/sync/pull`), the **Dexie Encrypted Offline Vault, Sync Engine & PII-Free Service Worker Shell** (`src/offline/*`, `src/sw.ts`, `public/sw.js`, `/offline`), and the **Scheduled Maintenance & Orphan Storage Cleanup Job** (`POST /api/jobs/maintenance/cleanup`).

## Key Architectural & Technical Decisions

- **Live Operational Dashboard (`/`, `GET /api/dashboard`):** Aggregated all Owner-scoped KPIs, occupancy rates (returning `null` / `"—"` when zero active rooms), net monthly collections (`POSTED`, `REVERSED`, `REVERSAL`), due/overdue invoices, check-ins/outs, maintenance, notices, and identifier-only activity inside one `RepeatableRead` transaction returning strictly `private, no-store` / `no-referrer` with zero audit writes.
- **Cross-Chunk `PrismaNeon` Pool Stability (`src/server/db/client.ts`):** Fixed `Cannot use a pool after calling end on the pool` by preferring `globalThis.daisyDatabase` in non-production, validating cached clients structurally across split Webpack server chunks, and guarding `$disconnect` with `disconnected?: boolean`.
- **Reports & Bounded CSV Exports (`/reports`, `GET /api/reports/export`):** Implemented six historical/as-of reports (`RepeatableRead`, `<= 366` days, `take <= 500`) reconstructing historical receivables aging via timestamped adjustments and `Payment.paidAt`, RFC 4180 formula-escaped CSV downloads (`30/600s` DB-backed `SecurityRateLimit`), and identifier-only `report.exported` `AuditLog` entries.
- **Sync Transport Protocol (`/api/sync/{bootstrap,push,pull}`):** Added HMAC-SHA256 opaque cursors (`SYNC_CURSOR_SECRET`, `daisy:sync-cursor:v1`, `410 RebootstrapRequiredError` on tamper/expiry/ahead-of-head), `RepeatableRead` fixed-watermark `DISTINCT ON` UUID keyset bootstrap, and sequential `SyncHead` / `Device FOR SHARE`-locked push execution (`1 MB`, `1–50` ops, `120/60s` throttling, `"retry"` on missing dependencies, `"blocked"` propagation).
- **Encrypted Offline Vault, Outbox & Service Worker (`src/offline/`, `/offline`, `public/sw.js`):** Implemented PBKDF2-SHA256 (`310,000` iter) + AES-256-GCM key custody (`VaultKeyCustody` with 15-min auto-lock and `offlineUnlockMaxDays` clock validation), atomic Dexie outbox/attachment/projection commits with quota rollback, `navigator.locks` single-leader push-before-pull engine with `410` recovery, React 19 `useSyncExternalStore` `OfflineStatusBar` + `OfflineVaultWorkspace`, and strict cache boundary keeping `/api/*`, `/auth/*`, `/book`, `/settings`, `/audit`, `/reports`, and RSC headers `network-only`.
- **Scheduled Cleanup & Shared Cron Auth (`POST /api/jobs/maintenance/cleanup`):** Extracted shared constant-time `verifyCronSecret` (`src/server/jobs/auth.ts`), added idempotent `deletePrivateObject` (`src/server/storage/client.ts`), and cleaned up expired unattached `PENDING_UPLOAD` intents (> `24h`) and expired `SecurityRateLimit` rows while protecting active/attached intents and leaving `ChangeFeed` / `SyncOperationOutcome` intact.

## Cumulative File Changes

- (modified - lib) - `package.json`, `pnpm-lock.yaml` - Added `fake-indexeddb` devDependency for Dexie unit testing.
- (new) - `src/features/dashboard/{schemas,calculations,service}.ts`, `src/app/api/dashboard/route.ts`, `src/components/features/dashboard/dashboard-workspace.tsx` - Dashboard snapshot contracts, pure calculations, API route, and responsive workspace.
- (new) - `src/features/reports/{schemas,csv,service}.ts`, `src/app/api/reports/{route,export/route}.ts`, `src/app/reports/page.tsx`, `src/components/features/reports/reports-workspace.tsx` - Reporting service, formula-safe CSV export, and 6-tab reports UI.
- (new) - `src/features/sync/contracts.ts`, `src/server/sync/{cursor,service}.ts`, `src/app/api/sync/{bootstrap,push,pull}/route.ts` - Sync protocol contracts, opaque cursor signing, and transport Route Handlers.
- (new) - `src/offline/{crypto,db,attachments,sync-engine,client,sw-policy}.ts`, `src/sw.ts`, `public/sw.js`, `src/app/manifest.ts`, `src/app/offline/page.tsx`, `src/components/features/offline/{offline-status-bar,offline-vault-workspace}.tsx` - Client AES-GCM custody, Dexie vault, sync engine, Service Worker, PWA manifest, and `/offline` shell.
- (new) - `src/server/jobs/{auth,cleanup}.ts`, `src/app/api/jobs/maintenance/cleanup/route.ts` - Shared cron secret verifier and orphan storage cleanup job.
- (modified) - `src/app/page.tsx`, `src/server/db/client.ts`, `src/server/storage/client.ts`, `src/lib/errors.ts`, `src/app/api/jobs/billing/generate/route.ts`, `src/components/layout/workspace-shell.tsx`, `next.config.ts`, `.env.example`, `docs/architecture/architecture.md` - Wired `/` Dashboard, cross-chunk DB pooling fix, S3 delete, `RebootstrapRequiredError`, `OfflineStatusBar` & nav links, SW headers, and `SYNC_CURSOR_SECRET`.
- (new / modified) - `tests/unit/**`, `tests/integration/**`, `docs/test/**` - Added Dashboard, Reports, Sync, Offline, and Cleanup unit & integration suites plus mirrored test logs.

