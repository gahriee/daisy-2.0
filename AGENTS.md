# Daisy — Agent Guidelines & Protocols

Single-Owner boarding house and transient management system (tenants, guests, rooms and beds, allocations, billing, payments and proofs, maintenance, notices, reports). Offline-first PWA. Stack: Next.js, Prisma, PostgreSQL, Dexie.

---

## 1. Agent Session & Documentation Lifecycle Protocols

All AI agents interacting with this repository MUST strictly adhere to the following lifecycle.

### 1.1 Start of Session / First Turn

1. **Read Architecture First:** If you are new to the session or workspace, you MUST read [`docs/architecture/architecture.md`](docs/architecture/architecture.md) before performing any task.
2. **Review Related Memory:** Per prompt, check [`docs/memory/`](docs/memory/) for recent session summaries or relevant active logs (`MM-DD-YY-SEQUENCE-AGENT.md`, including other agents) to maintain continuous context.
3. **Read the Rules:** Read every file in [`.agents/rules/`](.agents/rules/) (see Section 6).

### 1.2 Per-Prompt Memory Logging (MANDATORY)

- **For EVERY standard coding/feature prompt in a session**, create or append to an active uncompacted memory log:
  - **Location:** `docs/memory/MM-DD-YY-SEQUENCE-AGENT.md` (e.g., `docs/memory/11-12-26-1-claude.md`). AGENT is the lowercase provider name: `chatgpt` for ChatGPT/Codex, `gemini` for Gemini, `claude` for Claude. Keep a stable name throughout the session. Dates use Asia/Manila.
  - **Concurrent ownership:** Each independently running session owns a different file, even when two sessions use the same provider. Never append to, compact, rename or delete another session's active file. Read other logs for context without writing to them. Record Agent and a unique Session ID once in the file header, and number prompts within that file only.
  - **Allocate safely:** Scan all active and compacted filenames for the current Manila date and choose the next unused numeric sequence. Reserve the full filename using exclusive creation (`open(..., 'x')` / O_EXCL / CreateNew), never an existence check followed by an ordinary overwrite. On collision, rescan and retry with a larger sequence.
  - **Resume deliberately:** Append only after the header's Agent and Session ID identify this session's own log. Do not infer ownership from the date, provider or modification time. If ownership is uncertain, reserve a new file. Keep the reserved filename through midnight or context compaction.
  - **Detailed protocol and template:** Follow [`docs/memory/README.md`](docs/memory/README.md) and [`docs/memory/TEMPLATE.md`](docs/memory/TEMPLATE.md).
  - **Contents:**
    - `## Prompt [Number]: [Title]`
    - `**Timestamp:** YYYY-MM-DD HH:MM:SS (UTC+8)`
    - `### Prompt Goals`
    - `### Key Decisions & Rationale`
    - `### Files Created / Modified / Deleted`
- **Exclusion Rule:** Do **NOT** log prompts that are purely informational questions, explanations, design discussions, clarifications, agent workflow executions, or operational slash commands (e.g., `/git-push`, `/end-session`). Memory logging is reserved for actionable prompts involving code changes, feature implementations, bug fixes, refactoring, and architectural decisions.

### 1.3 Session Compaction (`/end-session`)

- When the user runs `/end-session` (or triggers [`.agents/workflows/end-session.md`](.agents/workflows/end-session.md)):
  1. Synthesize only this session's owned log, after checking Agent and Session ID.
  2. Create its permanent summary `docs/memory/MM-DD-YY-SEQUENCE-AGENT-TITLE.md` with the same date, sequence and agent. Reserve it exclusively and never overwrite an existing target. Include Agent and Session ID in its header.
  3. Verify that the summary preserves the owned log's content before removing only that raw file. Never compact or clean up another active agent's file.

### 1.4 Test Result Documentation (MANDATORY)

- Whenever automated or manual tests are executed (feature development, bug fixes, refactoring, API or sync work):
  1. **Mirror the test structure:** The path is `docs/test/<layer>/<domain>/<feature-name>.md`, matching `tests/<layer>/<domain>/<feature-name>.test.ts`. Examples:
     - `tests/integration/sync/push-idempotency.test.ts` → `docs/test/integration/sync/push-idempotency.md`
     - `tests/integration/allocations/bed-overlap.test.ts` → `docs/test/integration/allocations/bed-overlap.md`
     - `tests/unit/lib/money/proration.test.ts` → `docs/test/unit/lib/money/proration.md`
  2. **Never dump results into a flat folder** or a single shared file.
  3. **Do NOT create a new file if one already exists.** Check the mirrored path first. If it exists, update its status, last run, environment, command, results and test cases, and add a row to Run History. Create a document only when none exists.
  4. Follow [`docs/test/TEMPLATE.md`](docs/test/TEMPLATE.md).
  5. Record the execution timestamp, runtime environment, commands, summary metrics (total/passed/failed/skipped/duration) and the test cases with their verified criteria. Retain failed runs with the fix or blocker.
  6. If a test file is renamed, moved or deleted, rename, move or delete its result document to match.

### 1.5 Documentation ownership and size

- Update the existing canonical section in place. Fold new durable guidance into its current rule and remove superseded wording in the same change. Keep dated decisions and verification history in the memory and test records.
- Use this file for agent policy, [DESIGN.md](DESIGN.md) for reusable UI standards, [PRODUCT.md](PRODUCT.md) for the audience and product scope, and [README.md](README.md) for onboarding and essential commands. Use [architecture](docs/architecture/architecture.md) for implementation detail and the directory tree, and [package.json](package.json) for the complete script list. Link to the authoritative source for shared material.
- Update architecture for major feature, core dependency, data model, hosting, offline or sync protocol changes. Update README when those changes affect capabilities or setup. Update Sections 2 and 3 here only when their high-level map or command guidance changes. Keep architecture trees folder-only.
- Review the diff and line counts of any edited document before handoff. Keep AGENTS at 180 lines or fewer, DESIGN at 650 including frontmatter, README at 120, PRODUCT at 100 and architecture.md at 325. If required material would exceed a budget, consolidate it or link to an existing canonical reference. Ask before raising a budget. Avoid dated feature sections, copied directory trees and exhaustive command lists.

### 1.6 Database environments and required updates

- **Targets:** Development uses its own database through `DATABASE_URL` in ignored `.env.local`. Automated integration tests use a separate database or branch selected only by an explicit opt-in `TEST_DATABASE_URL`. Production uses secrets configured on the hosting platform. Migrations and CLI operations use the matching direct connection URL when provided. Never inherit a production URL into a development or test command.
- **Tests:** Integration tests never run against production and refuse a target that is not the opted-in test database. Every run removes its own fixture records before handoff, including after a failed or interrupted run. Prefer rollback-only transactions. For tests that commit, track run-owned identities, clean up in teardown or a finally step, and verify that no run-owned data remains. Record any cleanup failure in the mirrored test result.
- **Migrations:** Validate locally and on the test database first. Apply committed incremental migrations to production only after the Owner explicitly authorizes that specific change, then verify with the status and connection check scripts. There is no standing production authorization. Resets, data loss, fixture suites and arbitrary business writes in production are never authorized implicitly.
- **Provider-owned auth schema:** Never modify it through application migrations.
- **Seeds:** Seed only documented, idempotent records. Preserve the Owner account, real business data and applied migration history. A new environment needs an explicit bootstrap of the Owner identity or a reviewed seed.
- **Unavailable access:** If credentials, access or prerequisites are unavailable, complete the unaffected implementation, record the exact pending migrations and the blocker in memory, and report the synchronization as pending. Do not claim it ran or substitute another database.
- **Free-tier limits:** Database storage and object storage are small. Consider the effect of change history growth and photos before adding data. Do not add retention or cleanup of change history without the rebootstrap protocol in rule 9.
- **Git and deployment:** Keep pushes and deployments explicit. Never push to a remote or deploy automatically.

---

## 2. Project Structure

- `src/app/` contains routes and API handlers. `src/features/<feature>/` contains contracts, validation, services and sync adapters. `src/components/` contains feature UI and shared primitives. `src/server/` contains auth, database, security, audit, storage, sync and job infrastructure.
- `src/offline/` contains the local database, repository, crypto, outbox, transport and sync engine. It must never import server code. `src/sw.ts` is the service worker.
- `prisma/` contains the schema and migrations. `tests/` and `docs/test/` mirror verification by layer and domain.
- See the [architecture directory map](docs/architecture/architecture.md#6-directory-structure) and [file boundaries](.agents/rules/3-file-boundaries.md) for placement.

## 3. Available Workspace Scripts

Use [package.json](package.json) for script definitions, [README.md](README.md) for common workflows and [verification commands](.agents/rules/7-verification-commands.md) to choose minimal targeted checks. Follow Section 1.6 for database targets. Format changed files with Prettier (`pnpm exec prettier --write <paths>` or `pnpm format`) and verify before handoff.

## 4. Automated Testing Protocols

### 4.1 Test Folder Organization (NO Flat Test Dumps)

Never place all test files into a single root directory. Tests MUST mirror the domain and folder structure of the code being tested:

- **Unit Tests:** `tests/unit/<layer>/<domain>/<target>.test.ts` (e.g. `tests/unit/lib/money/proration.test.ts`, `tests/unit/offline/outbox/replay.test.ts`).
- **Integration Tests:** `tests/integration/<domain>/<feature>.test.ts` (e.g. `tests/integration/sync/push-idempotency.test.ts`). Route Handlers and Server Actions are exercised here against the test database.
- **End-to-end checks:** `tests/e2e/<domain>/<scenario>.spec.ts` for installation and offline checks. Run only on explicit user request.

Automated testing is restricted to backend APIs, database integrations, services, business logic and offline modules. Do NOT create or maintain UI component tests, visual regression snapshots or DOM accessibility audits.

### 4.2 Mandatory Execution on Modification

- Execute ONLY the targeted test file(s) covering the changed path and direct callers (for example `pnpm test:unit tests/unit/...` or `pnpm test:integration tests/integration/<domain>/<file>.test.ts`) for every Route Handler, Server Action, Prisma schema or migration, service, sync handler, offline module, hook or non-UI utility creation or edit. Do NOT run the full `pnpm test:integration` suite routinely unless shared core infrastructure (`src/server/auth/`, `src/server/db/`, `src/server/sync/`, `src/features/allocations/`, or core shared schema models) changed or the user explicitly requests a full run.
- Ensure every assertion passes in the targeted run before concluding, and never re-run already-passing suites after doc-only edits. Do not report a skipped or unexecuted check as passing.
- Record every run in `docs/test/` as required by Section 1.4.

---

## 5. Automated Skill Use

### UI and device verification ownership (user preference)

- Focus on implementation and relevant code and backend checks. The user verifies the rendered UI, interactions, installation and offline behavior on real devices.
- Do not open or control browsers, emulators or desktop apps, capture screenshots, start visual preview servers or run browser walkthroughs to verify UI unless the user explicitly requests it. Do not start a development server solely for visual review.
- Review source, supplied screenshots and design references as needed. Execute only the essential checks matched to the change per rule 7 (targeted ESLint/Prettier and `pnpm typecheck` when TS changes, plus targeted unit or integration files for changed logic). Run `pnpm build` only when routes, layouts, Next config, proxy/middleware, global CSS or bundle boundaries change — skip it for routine component UI, service or doc edits. Do not repeat passing checks without a relevant code change or failure.
- Every development handoff includes a short, task-specific user verification checklist with the screen or route, setup, steps and expected results. Cover the changed success path, validation and recovery, a 360 px mobile width, keyboard behavior and any offline step such as airplane-mode reload, reconnect and Needs attention outcomes. Usually 3 to 7 items are enough. Keep code-check results separate from checks awaiting the user.
- Complete the implementation and provide the checklist without waiting for user verification. Never claim an unperformed UI or device check passed.
- This preference overrides skill or workflow defaults that require visual inspection, screenshots or browser use. Invoking a design skill alone is not a request for agent-performed verification.

### Skill selection and UI conventions

- **Taste context & UI workflow:** Keep `PRODUCT.md`, `DESIGN.md` and `.taste-skill/` aligned with [the global stylesheet](src/app/globals.css) and shared primitives. When building, redesigning or reviewing UI or design tokens, load `design-taste-frontend` before coding, deal new palettes or pairings via `start.mjs deal` / `start.mjs css` (recorded in `.taste-skill/history.json`), and preserve Section 5 verification rules (use static `copy-lint.mjs` on authored static or built HTML where applicable; do not install `.agents/hooks.json` Stop hooks or launch unrequested browser checks).
- **Vector illustrations:** Whenever the user requests a vector illustration, get an appropriate SVG from [unDraw](https://undraw.co/illustrations), download it into `public/illustrations/`, and edit the SVG file colors to match Daisy's semantic palette instead of hand-coding custom scene vectors.
- For UI conventions, read [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md) and [style rules](.agents/rules/5-style-conventions.md). Reuse shared primitives and semantic tokens. Consult architecture and source for runtime detail.
- Search project and installed skills before acting. Prefer the project copy when both exist and load every relevant skill. If a task requires a skill and none is available, ask whether to proceed with standard conventions or install one, and record the decision when Section 1.2 applies.

## 6. Rules

- The [rules index](.agents/rules/index.md) catalogs rules 1–9: coding standards, safety constraints, file boundaries, command policy, style conventions, review expectations, verification commands, Next.js and Prisma backend standards, and offline and sync standards.
- **Always adhere to every rule in [`.agents/rules/`](.agents/rules/).** Read them at the start of each session (Section 1.1) and recheck them when a task touches a related area.
- **Wire every new feature into Audit and Notifications.** Define the material events, write identifier-only audit entries with the authorized operation, and add allowlisted notification projections with explicit Owner-facing destinations. Keep routine activity audit-only when an alert serves no purpose. Verify event creation and Owner scoping with backend tests. Read-only features document whether they have any events to record or notify.
- **Wire every new syncable feature into the sync protocol.** Decide its offline capability (readable, queued, tentative or online only) against the architecture's offline table, add browser-safe operation contracts and a sync handler, publish through the change feed with the sync head lock, and test replay, conflict and tombstone behavior. Update the offline table when the scope changes.
- If a rule conflicts with this file, the stricter requirement applies, and the conflict must be flagged to the user. The UI and device verification policy in Section 5 takes precedence over older requirements for agent-performed visual checks.
