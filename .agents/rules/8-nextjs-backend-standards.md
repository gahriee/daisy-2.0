# 8. Next.js Backend and Prisma Standards

Apply together with rules 1 to 7 and 9.

## 8.1 Foundational context and version discipline

- This is one full-stack Next.js application. Use `src/app/api/` for Route Handlers and `src/features/<feature>/` and `src/server/` for reusable server services. Do not introduce a separate backend application or an ORM model-method layer over Prisma.
- `package.json`, the lockfile and the architecture document are authoritative for versions. Verify version-specific APIs against the documentation bundled with the installed Next.js package and the installed Prisma guidance. Do not upgrade dependencies incidentally or run a floating latest CLI.
- Inspect installed versions without exposing environment values, for example `pnpm ls next react prisma @prisma/client better-auth --depth=0`.
- Confirm that server code runs on the chosen host. Check driver adapter, CPU time, and Node API compatibility before adding a dependency that assumes a full Node.js server.

## 8.2 Documentation, tools and skill selection

- Search project skills first, then the environment catalog. Use the applicable Next.js, React, TypeScript, Prisma, PostgreSQL and testing skills before work in those areas.
- Before schema changes, inspect `prisma/schema.prisma`, committed migrations and the relevant live metadata. Read the PostgreSQL schema and migration skill before authoring database objects or SQL.
- Reuse the shared Prisma client and the existing auth, validation and throttling helpers. Read the current implementation before assuming a helper exists.
- Use read-only diagnostics for inspection. Do not create business records with ad hoc scripts as verification when an isolated integration test can exercise the workflow.

## 8.3 Route, service and response boundaries

- Route Handlers and Server Actions coordinate. They establish trusted request context, authenticate, authorize, validate, call the domain operation and return a deliberate result. Server Actions need the same checks as HTTP endpoints.
- Server Actions serve online-only forms. Route Handlers serve sync, uploads, exports, auth and authenticated scheduled jobs. Both call the same server-only services.
- Validate runtime input at the boundary with Zod: body, form data, URL and query parameters, headers and uploaded content. Allowlist fields, bound input size, and never pass a raw body to a Prisma write.
- Derive authority from the verified Owner session and, where required, the active device. Client-supplied IDs identify resources and never grant access.
- Put reusable queries, state transitions, calculations and multi-record workflows in server-only services with intent names such as `assignTenantToBed` or `recordPayment`. Do not duplicate business rules across handlers. A simple page-specific protected read may stay in its Server Component.
- Return only allowlisted fields using Prisma `select` and deliberate response shapes. Convert decimals and dates explicitly for their transport contract instead of casting raw models.
- Preserve existing API paths and response contracts. Add versioning only for an agreed compatibility requirement. Sync endpoints carry an explicit protocol version.
- Keep status handling consistent and distinguishable: validation failure, unauthenticated, denied, missing, state conflict, allocation conflict and throttling. Do not expose database errors, stack traces or credentials.
- Authenticated responses are private and no-store.
- Server Components call services directly and do not make an HTTP round trip to the application's own API.

## 8.4 Backend testing standards

- Test changed behavior through the right non-UI layer: unit tests for logic, integration tests for services, handlers and database behavior. Do not create UI component tests.
- Cover success, invalid input, unauthenticated or denied access, and revoked or unknown device cases. For financial, allocation and sync mutations, also cover rollback, retries, duplicate requests and stale-state conflicts.
- Use the isolated test database. Never redirect fixtures to production.
- Run targeted tests for the changed feature and its callers, and broaden only when shared behavior justifies it. Follow rule 7 for commands and reporting.

## 8.5 Static checks and formatting

- Follow the existing TypeScript and ESLint style, and use `pnpm typecheck` and `pnpm lint` for application changes. Use a production build when rendering or build behavior changes.
- Do not add a formatter, change formatting policy, disable rules or suppress types merely to pass a check.
- Keep changes limited to the task, preserve unrelated working-tree edits and never hand-edit generated output.

## 8.6 Concurrency, transactions and financial integrity

- For competing edits, use an atomic integer-version precondition scoped to the Owner. Do not write a check-then-write sequence that lets both competing writes succeed.
- Return an actionable conflict (HTTP 409 for an endpoint, a `conflict` result for sync) when a stale write fails. Preserve the user's draft and expose only the authorized current state needed to resolve it.
- Commit domain state, identifier-only audit, the change-feed entry and the idempotency result in one short transaction, and pass the transaction client to every participating helper.
- Every syncable mutation, whether online, sync or scheduled, follows the publication protocol. Lock the Owner's sync head row, allocate the feed number under that lock and commit head, feed and domain changes together. A bare database sequence is unsafe because a lower number can commit after a higher one was read.
- Use database constraints, atomic updates and explicit row locking where correctness depends on them. A transaction alone does not make every read-modify-write safe. Parameterize raw SQL and retry only recognized transient conflicts, with bounds.
- Allocate invoice and receipt numbers atomically on the server, scoped to the Owner. Never derive the next number from an unprotected count or maximum.
- Protect retryable operations with unique operation IDs or natural unique constraints. A repeated key with a different payload is a conflict and never silently reuses a different request.
- Keep email, storage calls, image processing and other external I/O outside database transactions, and coordinate external effects with a reliable retry design.
- Money uses decimals with explicit rounding. Billing generation is idempotent by tenant and billing period. Payments are immutable and corrected only by linked reversals. Invoice adjustments and voids retain history.

## 8.7 Allocations and inventory

- All bed and room use goes through the unified allocation engine. Tenant assignments, transient reservations and maintenance holds never keep their own availability logic.
- The database exclusion constraint on active half-open intervals is the final guard. Application checks improve error messages and never replace it. Map the exclusion violation to a clear allocation conflict.
- Whole-room claims take every relevant bed, or follow an equivalent room-level protocol that bed allocations also respect. Lock resource sets in a consistent order to avoid deadlocks.
- Archiving rooms and beds is soft and blocked by active or upcoming allocations. Inventory and rate changes must respect existing bookings.
- Move-out and cancellation truncate or cancel the linked allocation and restore bed status in the same transaction.
- Keep state derived from allocations, such as bed occupancy, consistent with them in the same transaction. Do not store editable balances or occupancy counts.

## 8.8 Required module analysis: caching, concurrency and rate limiting

For backend module creation or material refactoring, evaluate all three areas and record meaningful decisions in the architecture document or the task's memory entry. A documented reason not to add infrastructure is a valid outcome.

| Area | Required analysis and implementation when applicable |
| --- | --- |
| Caching and invalidation | Keep request-bound session and authority uncached. Authenticated responses are private and no-store. For any authorized future cache, specify scope, serializable data, expiry and invalidation after writes, and never share personal or financial data across users |
| Concurrency and idempotency | Can retries, sync replays, scheduled jobs or multiple devices compete? Define the atomic precondition, transaction boundary, constraints, duplicate behavior and conflict recovery needed to prevent lost edits and duplicate financial or allocation records |
| Rate limiting | Can authentication, uploads, exports, sync or reports be abused? Reuse the database-backed limiter with database time. Define identity and scope, limits, retry feedback and HTTP 429 with Retry-After. Never trust arbitrary forwarded IP headers or a process-local counter as shared enforcement |

Keep this analysis proportional. A static presentation change does not need new caches, locks or limiters.

## 8.9 Migration policy: preserve applied history and existing data

- Change `prisma/schema.prisma` and create a new incremental migration for schema changes. Never rewrite an applied migration to avoid an incremental change.
- Review generated SQL for destructive operations, owner scoping, backfills, locks and compatibility before applying it. Prefer additive and phased changes when data must survive.
- Hand-written SQL constraints, such as the allocation exclusion constraint, partial unique indexes and check constraints, live in reviewed migrations. They require the `btree_gist` extension where applicable, and they get integration tests that prove the constraint rejects the invalid case.
- Use the project CLI. Create development migrations for review before applying, and do not accept a reset when drift is detected. Verify the target database before applying any migration.
- Never alter provider-owned auth tables. Application migrations leave them untouched.
- Regenerate the Prisma client explicitly when needed and update validation, services, fixtures, sync contracts and tests together.
- Do not reset or recreate databases, rewrite migration history or use force-reset or data-loss flags as routine steps. Destructive operations need the specific authorization and safeguards in rule 4.
- Change history has no cleanup initially. Do not add retention or deletion of change history or operation outcomes without first designing the rebootstrap protocol in rule 9.
- Run the schema validation, generation and targeted tests required by rule 7, and report the actual outcomes. This rule does not itself authorize a migration or database mutation.
