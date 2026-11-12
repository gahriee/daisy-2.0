# 3. File and Component Boundaries

## 3.1 This workspace

- The repository root is the Next.js application, and application code lives under `src/`. Do not introduce a separate `frontend/` and `backend/` split.
- Read `docs/architecture/architecture.md` before adding folders. Add directories only when a feature needs them, and update the architecture, README and relevant `AGENTS.md` structure in the same task.
- Keep executable application logic out of `docs/`.

## 3.2 Placement

| Location | Responsibility |
| --- | --- |
| `src/app/` | Thin routes, layouts, manifest and Route Handlers |
| `src/features/<feature>/` | Feature contracts, validation, server services and sync adapters |
| `src/components/features/<feature>/` | Feature screens, editors and local presentation helpers |
| `src/components/` | Reusable, domain-independent primitives |
| `src/components/common/` | Shared composites with proven reuse |
| `src/components/layout/` | Mobile and desktop shell |
| `src/server/` | Auth, database, security, audit, storage, sync and job infrastructure |
| `src/offline/` | Local database, repository, crypto, outbox, transport, sync engine and hooks |
| `src/lib/` | Pure helpers for money, dates and errors |
| `src/hooks/` | Shared client hooks |
| `src/config/` | Public and server configuration, kept separate |
| `src/sw.ts` | Service worker source, with output served at `/sw.js` |
| `public/` | Icons and the public bootstrap document |
| `prisma/` | Schema and incremental migrations |
| `tests/` | Automated checks by layer |

- Inside each feature, keep `schemas.ts` and `types.ts` browser-safe, `sync-contracts.ts` browser-safe, `actions.ts` for online-only Server Actions, `service.ts` and `queries.ts` server-only, and `sync-handler.ts` as the server-only operation adapter. Never combine shared operation schemas and server handlers in one module.
- UI primitives may own interaction state such as password visibility. They must not query data, check business permissions, calculate totals or start mutations.
- Extract a shared composite only when real reuse exists. Keep domain-specific views under their feature.
- Do not accumulate feature files directly in a shared folder. Group by feature, such as tenants, rooms, allocations, billing, payments, transients, maintenance, notices and reports.
- Move existing source intact when reorganizing. Update every alias and import, documentation link and affected test together.
- Keep pages and large screens understandable through meaningful sections, state coordination and data services. File length is a signal to review responsibilities, not a reason for arbitrary wrappers.

## 3.3 Server, client and offline dependencies

- Prisma, storage clients, auth internals and secret-bearing configuration are server-only. Browser modules and `src/offline/` must not import them, directly or through barrels.
- `src/offline/` must not import server services. It talks to the server only through typed transport clients and browser-safe contracts.
- Keep client helpers for REST endpoints, such as an assignment client, in the feature's browser-safe area and free of Prisma and Node built-ins.
- Server Components may call server services directly. Do not add an HTTP round trip to the application's own API solely to reach its database.
- Do not force a `page-client.tsx` for every route. Use a route-local client coordinator only where interaction orchestration or offline reads justify it.
- Offline-capable features read through repository hooks. Online-only features may use Server Components and Server Actions. Do not mix the two paths for one operation.
- For external integrations, centralize authentication, request handling, validation and error translation in typed server services.

## 3.4 Styles, generated files and tests

- Use Tailwind utilities. Theme tokens and base element policies belong in the global stylesheet, and shared control recipes belong beside the primitives. Do not use page CSS modules.
- Do not edit `.next/`, generated Prisma output, build output or `node_modules/`. Change the source or configuration and regenerate.
- Follow the test layout: `tests/unit/`, `tests/integration/` and `tests/e2e/`, organized by layer and feature.
- Keep raw runner output in ignored artifact directories.
