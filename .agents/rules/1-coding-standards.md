# 1. Coding Standards

## 1.1 Stack and source of truth

- Daisy is one Next.js App Router application at the repository root. It uses React, strict TypeScript, Zod, Tailwind CSS, Prisma, PostgreSQL and Dexie. Use pnpm with the committed lockfile.
- `package.json`, the lockfile and `docs/architecture/architecture.md` are authoritative for versions and design. Do not upgrade packages as an incidental part of a feature.
- Always format authored code with the project-local Prettier configuration (`pnpm exec prettier --write <paths>` or `pnpm format`) and verify changed files cleanly before handoff; never hand-format around the formatter. Generated output, secrets and documentation follow `.prettierignore`.
- Use the documentation bundled with the installed Next.js package for framework behavior. Read the relevant installed or project skills as directed by `AGENTS.md`.
- The runtime may be a Workers-style edge environment rather than a full Node.js server. Before using a Node-only API in server code, confirm it works on the chosen host.

## 1.2 React and App Router

- Keep route `page.tsx` files as thin coordinators. Prefer Server Components for online-only screens and use `async` only when awaiting work.
- Offline-capable screens are client-rendered components that read from the local repository. They must never depend on fresh React Server Component responses or Server Actions, and they share feature components with the online pages.
- Place `"use client"` at the smallest useful interactive boundary. Do not create a route-local client coordinator for a static page.
- Pass typed, serializable data across server and client boundaries. Convert Prisma-specific values, such as decimals and dates, into deliberate transport representations.
- Use native forms and elements through the shared UI primitives. Buttons default to non-submitting, and form submission uses `type="submit"`.
- React 19 supports `ref` as a prop. Use that pattern in new primitives and avoid `forwardRef` wrappers without a compatibility reason.
- Show pending and error states for every mutation. Never display an unconfirmed payment, booking, check-in or invoice action as final. Optimistic display is limited to clearly labelled pending state.
- Load heavy client tools, such as image croppers, charts and export engines, on demand. Use `ssr: false` only for browser-only code inside a client boundary.

## 1.3 TypeScript and validation

- Preserve strict checking. Prefer `unknown`, narrowing and explicit domain types to `any`, broad casts, non-null assertions or suppressed errors.
- Validate external input at its boundary with Zod: form data, route and search parameters, request bodies, sync operations, uploaded files, integration responses and environment variables. TypeScript annotations alone do not validate runtime data.
- Shared schemas and DTOs live in browser-safe modules that never import server code. Server handlers import them, and browser code never imports handlers.
- Give services, sync handlers, mutation boundaries and money calculations explicit parameter and return types.
- Use discriminated unions for multi-state results such as sync outcomes (applied, duplicate, conflict, rejected, blocked), reservation and invoice states, and allocation results. Handle unsupported states explicitly. Never convert a failure into success or an empty total.

## 1.4 Data access, money and dates

- Keep database operations in server-only services and use the shared Prisma client. Do not construct a connection pool per request or import the client into browser code.
- Every query, update, delete, count and relation check is scoped to the Owner. An ID from a form, URL or sync payload identifies a requested resource and is never proof of access.
- Money is exact. PostgreSQL stores decimals and DTOs carry decimal strings. Never use binary floating-point arithmetic for amounts. Make currency, rounding and proration rules explicit.
- Store instants in UTC and compute business dates, billing periods and overdue state in Asia/Manila. Never derive authority or ordering from a device clock.
- Allocation intervals are half-open `[start, end)`. Do not implement availability by comparing dates in application code alone, because the database constraint is the final guard.
- Use transactions for operations that must commit together. Unique constraints and idempotency are required wherever retries, scheduled jobs or sync replays could create duplicates.
- Preserve history. Payments are immutable and corrections are linked reversals. Issued invoices are adjusted or voided through audited workflows, and tenants, rooms and beds are archived, never hard-deleted.
- Do not invent ad-hoc billing, proration, deposit, utility or overpayment rules inside feature handlers. Read authoritative policy values through `src/config/business-config.ts`.

## 1.5 Authority and user feedback

- Authority comes from the verified Owner session and, for sync and uploads, an active registered device. Reuse the authoritative helper for both. Do not create role dictionaries, staff accounts or tenant sign-in without an agreed architecture change.
- Gate UI actions for clarity and independently authorize every server operation. Explain unavailable actions in accessible text. A mouse-only tooltip around a disabled button is not an explanation.
- Distinguish connection state from sync state, and "Saved on this device" from "Synced", in code, copy and tests.

## 1.6 Syncable entities

- Syncable records use client-generated UUIDs, integer versions and tombstones for deletion. Archive emits a tombstone with its record and restore republishes the active record.
- A mutation takes one path only. Offline-capable writes go through the local repository and outbox. Online-only writes use Server Actions or Route Handlers. Never send one intent through both.
- Follow rule 9 for the operation shape, local persistence and conflict handling.
