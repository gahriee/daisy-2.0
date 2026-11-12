# 7. Verification Commands

Run commands from the repository root using the execution tool's working-directory setting. `package.json` is authoritative. This is a catalog of the intended scripts, not permission to install unrelated tools or mutate a database. Scripts are defined during scaffolding, so confirm a script exists before relying on it and update this rule when scripts change.

## 7.1 Choose checks for the change

| Change | Relevant verification |
| --- | --- |
| TypeScript or application logic | `pnpm typecheck`, `pnpm lint`, targeted unit tests. Production build when compilation is affected |
| Route Handlers, Server Actions or sync endpoints | Targeted integration test that calls the handler against the test database, plus `pnpm typecheck` and `pnpm lint` |
| Services, calculations and utilities | `pnpm test:unit` or a targeted unit file, plus `pnpm typecheck` |
| Sync handlers, idempotency, allocation or numbering | Targeted integration tests against real PostgreSQL covering retries, concurrency and conflicts |
| Offline repository, outbox, crypto or sync engine | Targeted unit tests using an in-memory IndexedDB implementation, covering persistence, replay and upgrade paths |
| Prisma schema or migration | `pnpm db:validate`, `pnpm db:generate` and targeted integration tests against an authorized test database |
| Connection or environment change | `pnpm db:check` against the intended database, inspecting metadata without printing credentials |
| Service worker or installation | Build check and the user's manual device checklist. Playwright only on explicit request |
| Markdown or rules only | Inspect paths, links and command names, and run `git diff --check`. No application build or database test is required for prose edits |

Edits to routes, actions, schema, migrations, services, sync handlers and business logic require a relevant executed test. Add a meaningful test when no suitable coverage exists. Do not rerun unrelated suites once the relevant checks pass.

Verification on real devices, including installation, airplane-mode reload, foreground sync and rendered interface checks, belongs to the user by default. Do not open or control browsers or devices, capture screenshots or start visual preview servers without an explicit request. Report code and backend results separately from pending user checks.

## 7.2 Current commands

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:unit
pnpm test:integration
pnpm db:validate
pnpm db:generate
pnpm db:check
git diff --check
```

- `pnpm test` runs the Vitest unit suite, which covers pure logic, schema validation, money and date helpers, state machines and offline modules without a live database.
- Target a single file with `pnpm vitest run tests/unit/<path>.test.ts`, substituting the changed test path.
- `pnpm test:integration` runs against a real PostgreSQL test database or branch. It requires a dedicated opt-in connection setting and refuses to run against production. It covers transactions, idempotency, allocation conflicts, feed ordering and race behavior.
- `pnpm db:validate` and `pnpm db:generate` validate the schema and regenerate client types without needing credentials. `db:check` is a read-only connection check. `db:migrate` and `db:deploy` are workflow commands that follow rule 4 and the task scope.
- `pnpm test:e2e` runs Playwright offline and installation checks. Run it only on explicit request, and keep it out of routine verification.
- Do not create visual regression snapshots or DOM accessibility audits unless the user asks for them.

## 7.3 Results and failure handling

- Record every executed check with the command, runtime, counts, duration and the criteria verified. Retain failed runs together with the fix or blocker that followed.
- Report the final applicable passing result and any remaining limitation. Never use placeholder credentials, disabled assertions or weakened authorization to manufacture a pass.
- Documentation-only inspection and whitespace checks do not justify inventing a test file or result document.

## 7.4 Test coverage expectations

- Cover success, invalid input, unauthenticated or unauthorized access, and foreign-device or revoked-device cases for each changed boundary.
- For financial, allocation and sync mutations, also cover rollback, concurrent replay, lost acknowledgements, repeated edits, dependency failures, stale-version conflicts and tombstones.
- For the allocation engine, cover abutting intervals, overlap rejection, whole-room versus bed claims and archive restrictions.
- For offline modules, cover encrypted blob recovery, quota failure, expired cursors, session expiry and local schema upgrades.

## 7.5 Database environments

- Development and test use separate databases. Production changes happen only through committed incremental migrations that have been validated locally and explicitly authorized.
- After implementing a migration, validate it locally, then apply it to the authorized target with `pnpm db:deploy` and verify the connection with `pnpm db:check`. Never switch targets to manufacture success, and never run fixture suites against production.
- Seed and reset commands are destructive operator actions. Run them only with explicit authorization for the environment, and never run a reset routinely.
