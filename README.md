# Daisy

Single-Owner boarding house and transient management system (tenants, rooms/beds, allocations, billing, payments and proofs, maintenance, notices, reports, public `/book` requests, and offline-first PWA vault/outbox).

The selected stack uses Next.js (Webpack), React, TypeScript, Tailwind CSS, Prisma, ApexCharts, and Dexie, with Neon for PostgreSQL, managed Better Auth, and private Object Storage (`neon.ts`). Hosting targets Cloudflare Workers via `@opennextjs/cloudflare` (`open-next.config.ts`, `wrangler.jsonc`, `worker/index.ts`).

## Setup

Use Node 26.13.1 (`.node-version`) and pnpm 12.18.0 (`packageManager`; `pnpm-workspace.yaml` sets `nodeLinker: hoisted` so Next.js standalone tracing and `@opennextjs/cloudflare` bundle `@aws-sdk/client-s3` subpath exports cleanly).

```sh
pnpm install --frozen-lockfile
pnpm db:generate
```

Copy `.env.example` to `.env.local`. In Neon select a development branch, put its
pooled connection in `DATABASE_URL` and its direct connection in `DIRECT_URL` (or `DATABASE_URL_UNPOOLED`).
Use production credentials locally only for an explicitly authorized operation;
local development targets the non-production `dev` branch and `TEST_DATABASE_URL`
is a separate opt-in test connection (`test-integration` schema-only branch). Keep secrets in ignored files.

```sh
pnpm db:validate
pnpm db:check
pnpm db:seed
pnpm dev
```

The connection check is read-only and reports host, database and UTC status.
Prisma CLI loads `.env.local` and prefers `DIRECT_URL`, then Neon's
`DATABASE_URL_UNPOOLED`; runtime uses pooled
`DATABASE_URL` through the Neon adapter. Generation and validation need no credentials. Migrations are active on `dev` and `test-integration`; regenerate Prisma Client after schema changes. Open http://localhost:3000 after starting dev.

Neon CLI `neon deploy` provisions the services declared in `neon.ts` and pulls
branch credentials into `.env.local`. Deployment requires explicit authorization.
Auth uses `NEON_AUTH_BASE_URL`, a private `NEON_AUTH_COOKIE_SECRET` of at least
32 characters, `APP_ORIGIN` and the existing Owner's Auth user ID in `OWNER_USER_ID`.
The PostgreSQL role `neondb_owner` is not that user ID. Public sign-up is blocked
by the app proxy. Until Owner setup is complete, private endpoints deny access.
Storage uses the branch's `AWS_*` variables listed in `.env.example`.

## Verification

Use `pnpm format` (or `pnpm exec prettier --write <paths>`) after editing code and verify cleanly before handoff. Project VS Code settings enable format-on-save with Prettier.

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
```

For fast targeted iteration, filter ESLint/Vitest to changed files (`pnpm test:integration tests/integration/<domain>/<file>.test.ts`) and run `pnpm build` only when routes, layouts, CSS, or config change (see `.agents/rules/7-verification-commands.md`).

Build and dev use Webpack/PostCSS because Turbopack's CSS worker failed on Windows. For Cloudflare Workers packaging, preview, and authorized deployment:

```sh
pnpm cf:build
pnpm cf:preview
pnpm cf:deploy # explicit Owner deploy authorization required
```

For explicitly authorized service checks:

```sh
npm run check:neon
npm run start -- --hostname 127.0.0.1 --port 3000
# In another terminal:
npm run check:app
npm run check:auth
```

`check:neon` checks anonymous Auth availability and uploads/downloads one temporary
non-business storage probe, then deletes it and verifies absence. It makes no
database writes. `check:app` checks HTTP and anonymous denial. `check:auth` requires
temporary `NEON_CHECK_EMAIL` and `NEON_CHECK_PASSWORD` in `.env.local`; it verifies
Owner login, authorized service checks and logout, then removes those two fields.
No business fixtures or integration suites may run on production.

See [package.json](package.json) for scripts and [architecture](docs/architecture/architecture.md)
for the target design. UI/device verification belongs to the Owner.
No push, deployment, migration or seed runs automatically.

The Rausch and charcoal design system is documented in [DESIGN.md](DESIGN.md), with
product scope in [PRODUCT.md](PRODUCT.md). Shared native primitives live in
src/components/ui; /design-system is a public, non-business component reference.

Owner sign-in is available at `/auth/sign-in`, and password recovery is available at `/auth/reset-password`: request an emailed code,
then enter the code and a matching 12–128 character password. Use the existing
Owner account's real, accessible email. Codes work with Neon's shared development
sender; configure custom SMTP before production launch. No recovery secrets go
into URLs or offline storage. Only the configured Owner can be reset.

Recovery uses `20261113060000_recovery_security` (two app-owned security tables,
an audit action enum and index). It is applied to the selected production branch;
email/password Auth is enabled, public signup disabled and sessions revoked on reset.
Future production changes still require specific Owner authorization. Provider-owned
auth tables are not changed by this migration.

`pnpm test:integration` requires a separate `TEST_DATABASE_URL` in ignored
`.env.test.local` or the environment; it rejects the runtime database. The
recovery suite uses real PostgreSQL with mocked Auth/email delivery and removes
its run-owned records. Live email delivery/password changes require Owner testing.
