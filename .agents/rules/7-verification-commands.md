# 7. Verification Commands

Run commands from the repository root using the execution tool's working-directory setting. `package.json` is authoritative. This is a catalog of the intended scripts, not permission to install unrelated tools or mutate a database.

## 7.1 Choose minimal checks for the change

Keep verification fast and focused. Always run the **narrowest targeted check** that verifies the edited files, and **skip slow full-suite integration runs (`pnpm test:integration` without file filters) and `pnpm build` by default**.

| Change | Important checks only (fast default) |
| --- | --- |
| UI components, styling, copy, or layout edits | `pnpm exec prettier --check <paths>` + `pnpm exec eslint <paths>`, plus `pnpm typecheck` if TypeScript types/props changed. **Skip `pnpm test:integration` and `pnpm build`.** |
| Services, schemas, calculations, or utilities | Targeted unit test (`pnpm test:unit tests/unit/<path>.test.ts`) + `pnpm typecheck` + `pnpm exec eslint <paths>`. (`pnpm test:unit` runs ~2 s total if multiple unit files changed.) |
| Route Handlers, Server Actions, or domain services (DB-backed) | **Targeted** integration file(s) (`pnpm test:integration tests/integration/<domain>/<file>.test.ts`) + `pnpm typecheck` + `pnpm exec eslint <paths>`. **Do NOT run the unfiltered 13-file integration suite.** |
| Sync engine, allocations, auth, or shared DB infrastructure | Targeted unit/integration tests for affected domains first; run full `pnpm test:integration` **only** when shared auth/db/sync-head/allocation core changes or on explicit request. |
| Offline repository, outbox, crypto, or sync engine (`src/offline/`) | Targeted unit test (`pnpm test:unit tests/unit/offline/<path>.test.ts`) + `pnpm typecheck` + `pnpm exec eslint <paths>`. |
| Prisma schema or migration | `pnpm db:validate`, `pnpm db:generate`, `pnpm typecheck`, and **only the affected** domain integration test file(s) against `test-integration`. |
| Routes, layouts, `next.config.ts`, `globals.css`, service worker, or bundle boundaries | `pnpm typecheck`, `pnpm exec eslint <paths>` (or `pnpm lint`), and `pnpm build`. |
| Connection or environment change | `pnpm db:check` against the intended database without printing credentials. |
| Markdown, rules, memory, or test docs only | Inspect paths/links, run `pnpm exec prettier --check <paths>` and `git diff --check`. **Do NOT run `typecheck`, `lint`, tests, or `build`.** |

- **No redundant re-runs:** Once `typecheck`, `lint`, and targeted tests pass on the final code edit, do **NOT** re-run them after updating `docs/` or memory files—run only `prettier --check <doc-paths>` and `git diff --check`. If one test fails and you fix it, re-run **only that test file**, never the whole suite.
- Verification on real devices, including installation, airplane-mode reload, foreground sync and rendered interface checks, belongs to the user by default. Do not open browsers/emulators, capture screenshots, or start visual preview servers without an explicit request.

## 7.2 Current commands

**Fast targeted commands (default):**

```sh
pnpm exec prettier --write <changed-files>
pnpm exec eslint <changed-files>
pnpm typecheck
pnpm test:unit tests/unit/<path>.test.ts
pnpm test:integration tests/integration/<domain>/<file>.test.ts
pnpm db:validate
pnpm db:generate
git diff --check
```

**Heavy / explicit-scope commands (use only when warranted above or requested):**

```sh
pnpm format
pnpm format:check
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
pnpm cf:build
pnpm cf:preview
pnpm cf:deploy
pnpm db:check
pnpm db:seed
pnpm check:neon
pnpm check:app
pnpm check:auth
```

- `pnpm test:unit` runs pure logic, schema validation, money/date helpers, scanner, and offline module unit tests without a live database (~2 s). Target individual files during iteration with `pnpm test:unit tests/unit/<path>.test.ts`.
- `pnpm test:integration` runs against the remote PostgreSQL `test-integration` branch (~7+ min unfiltered). **Always pass explicit file path(s)** (`pnpm test:integration tests/integration/<domain>/<file>.test.ts`) covering only the changed feature and direct callers unless core shared database/auth/sync primitives changed.
- `pnpm build` compiles all production routes (`~25–30 s`). Run it only when route files, layouts, `next.config.ts`, `globals.css`/Tailwind pipeline, or SSR/client bundle boundaries change.
- `pnpm test:e2e` runs Playwright offline and installation checks. Run only on explicit request.
- Do not create visual regression snapshots or DOM accessibility audits unless asked.

Operational checks: `check:neon` probes live Auth and one temporary storage object, deletes the probe and verifies absence. `check:app` checks a running localhost production server; `check:auth` additionally needs the bound Owner and temporary local verification credentials, signs out and removes those fields. Run against production only with explicit authorization; they never authorize database fixtures or migrations.

## 7.3 Results and failure handling

- Record executed tests in mirrored `docs/test/` files **only for test suites that actually ran** (do not touch unrelated `docs/test/` files). Retain failed runs together with the fix or blocker.
- Report exact executed commands, pass counts, and any skipped heavy checks honestly (e.g., note when only targeted suites ran). Never weaken authorization or invent unrun results.
- Documentation-only inspection and formatting checks do not justify inventing a test file or result document.

## 7.4 Test coverage expectations

- Cover success, invalid input, unauthenticated or unauthorized access, and foreign-device or revoked-device cases for each changed boundary.
- For financial, allocation and sync mutations, also cover rollback, concurrent replay, lost acknowledgements, repeated edits, dependency failures, stale-version conflicts and tombstones.
- For the allocation engine, cover abutting intervals, overlap rejection, whole-room versus bed claims and archive restrictions.
- For offline modules, cover encrypted blob recovery, quota failure, expired cursors, session expiry and local schema upgrades.

## 7.5 Database environments

- Development and test use separate databases. Production changes happen only through committed incremental migrations that have been validated locally and explicitly authorized.
- After implementing a migration, validate it locally, then apply it to the authorized target with `pnpm db:deploy` and verify with `pnpm db:check`. Never switch targets to manufacture success, and never run fixture suites against production.
- Seed and reset commands are destructive operator actions. Run them only with explicit authorization for the environment, and never run a reset routinely.
