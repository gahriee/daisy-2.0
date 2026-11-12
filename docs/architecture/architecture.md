# Architecture

## 1. Overview

Daisy is a single-Owner management system for a Philippine boarding house with long-stay tenants and short-stay transient guests. One business has one Owner account and any number of registered devices. Daisy manages tenants, transient guests, rooms and beds, allocations, invoices, payments and proofs, maintenance, notices, reports and audit records. Tenants and guests are managed records. They have no sign-in and there are no staff accounts.

The application is one Next.js App Router deployment. Server pages, Server Actions and Route Handlers call server-only domain services. Browser-safe contracts are separate from server-only code. An installed device can reopen and operate core screens without a network connection, and it synchronizes through a durable outbox. PostgreSQL holds the authoritative state, change feed and audit records. Private object storage holds proof and maintenance photos.

### Business invariants

- Keep money exact. PostgreSQL stores decimals and DTOs carry decimal strings. Shared pure functions may estimate totals offline, and services always recompute authoritative totals.
- Payments are immutable entries with allocated amounts. Corrections are linked reversals. Posted invoices are adjusted or voided through audited workflows and are never edited in place.
- A bed or room can have at most one active allocation for any instant. Tenant assignments, transient reservations and maintenance holds share one allocation engine, and PostgreSQL enforces the rule.
- Store instants in UTC and calculate business dates in Asia/Manila. Device clocks are informational and never decide ordering or authority.
- Official invoice and receipt numbers are assigned by the server and are unique. Billing generation is idempotent by tenant and billing period.
- Every domain mutation commits its state, audit record, change-feed entry and idempotency result together.
- Nothing is shown as confirmed before server acknowledgement. An offline check-in, reservation or payment is pending until the server accepts it.

## 2. Runtime and data boundaries

### Application and database

Next.js handles routing, rendering and HTTP APIs. Server Actions serve online-only forms. Route Handlers serve sync, uploads, exports, auth and authenticated scheduled jobs. Both call the same server-only services, and no intent travels through both a Server Action and the outbox. Prisma uses a PostgreSQL driver adapter through one shared server-only client. Development reloads reuse a pool only while the connection configuration and generated client stay compatible. Database connections use UTC, and user-facing business dates use Asia/Manila.

Reads use fresh request authority and return bounded, allowlisted projections. Registers and reports use private, no-store responses, and results that span several queries use one consistent snapshot. Writes validate input and trusted origin, authorize under the relevant lock, and commit state, feed entries and audit together. Mutable records use integer versions. Retries use stable operation IDs, and a key reused with a different payload is rejected. External I/O stays outside database transactions. Database-backed limits use an atomic upsert with database time and separate read, write, upload and export workloads.

Services enforce Owner scope, validation, business rules and transactions. Layout and session redirects are conveniences, not authorization.

### Offline delivery and local persistence

An installed, provisioned device must reopen, reload and navigate core screens with no network. First sign-in, device registration and the initial snapshot require a connection.

The operational shell is client-rendered and shares feature components with online pages. Offline operation never depends on fresh React Server Component responses or Server Actions. A dedicated public bootstrap document and its static assets are precached by a service worker, which serves the document for supported failed navigations without a network redirect or authenticated layout. Only this public shell and static assets are cached. Authenticated HTML, RSC payloads, API responses, exports and private files are network-only and never enter Cache Storage. Worker registration starts after provisioning, activation is deferred during edits and sync, and upgrades preserve the outbox and support local schema migrations. Background execution is not promised. Foreground sync is the baseline and Background Sync is optional.

Encrypted IndexedDB stores server snapshots, pending projections, the outbox, attachment blobs and metadata. Read models overlay pending intent on confirmed state. Every offline-capable write takes one path, including while online: client intent, local repository, atomic encrypted outbox and projection commit, sync transport, authenticated service, server transaction.

| Capability | Offline behavior |
| --- | --- |
| Tenant profiles, balances, rooms and beds, occupancy, reservations, open invoices, maintenance, notices, dashboard | Read the last downloaded snapshot with freshness and pending indicators |
| Add or edit tenant, record payment, capture proof photo, log or update maintenance | Durable queued intent, pending until accepted |
| Create reservation, transient check-in and check-out | Tentative queued intent. The server validates allocation and state transition on reconnect |
| Generate, adjust or void invoices, edit or reverse posted payments | Online only |
| Inventory and rate changes, boarder assignments, move-in and move-out | Online only |
| Reports, exports, audit, settings and security, notice delivery | Online only |

An offline availability view cannot guarantee availability on another device. No official receipt and no booking or check-in is shown as confirmed before acknowledgement.

### Sync protocol

Each operation carries `protocolVersion`, `opId`, `deviceId`, `localSequence`, `type`, `entityId`, `baseVersion`, `dependsOn`, `payload` and `occurredAt`. IDs and payloads are immutable after submission, and a changed resolution is a new operation. Syncable entities use client-generated UUIDs, integer versions and tombstones. One sync leader per device processes dependencies, with cross-tab coordination and a durable lease fallback. Server idempotency stays mandatory regardless.

`POST /api/sync/push` authenticates the Owner and the registered device, checks origin, limits and schemas, and accepts up to 50 operations and 1 MB per request. Each operation is its own transaction and returns applied, duplicate, conflict, rejected or blocked with a typed reason and resulting version. A compound operation represents a workflow that needs all-or-nothing behavior. A unique Owner and `opId` key plus a canonical request fingerprint make concurrent retries commit once, return the recorded outcome for matching duplicates and reject changed payloads. A lost acknowledgement leaves the operation pending until a matching replay is acknowledged, and the ID is never reassigned to retry. Multiple edits to one record use explicit dependencies. After a predecessor is acknowledged, dependent edits bind to its resulting version before first submission. A failed predecessor blocks its dependents while independent work continues. Transport failures back off with jitter and respect `Retry-After`. Validation and conflict outcomes require attention instead of automatic retry.

The processor locks the active device row for share, initializes the Owner's `SyncHead` with an atomic upsert, then locks that head before reading idempotency outcomes or applying changes. Revocation waits for in-flight authorized transactions and later transactions fail. Domain state, identifier-only audit, the complete-record feed entry, a transactional sequence number and the operation result commit together. Every online, sync and scheduled mutation follows this publication protocol, because a bare database sequence can let a lower number commit after a higher one was read.

`GET /api/sync/pull` returns committed changes after a signed, Owner-scoped opaque cursor, paginated to 100 changes with tombstones and a bounded watermark. Bootstrap reconstructs a fixed snapshot from immutable full-record change history at a captured watermark, so large snapshots never depend on independently paginated live reads. Archive emits a tombstone with its record and restore republishes the active record. The client applies a page and advances its cursor in one IndexedDB transaction, then rebases projections without discarding pending intent. Eligible pending operations are pushed before pulling. History and outcomes have no cleanup initially, and any future retention requires an explicit rebootstrap protocol before deletion. Cursor signing uses a purpose-separated HMAC derived from the application secret, so secret rotation requires a new bootstrap. Expired cursors force rebootstrap that preserves the outbox and attachments and reconciles outcomes by `opId`. New protocol versions and local migrations either preserve pending work or block the upgrade with recovery instructions.

Conflicts are explicit record-level comparisons of integer versions, with no silent field merge. Append-only payments still validate the current invoice and allocation state, and check-in and check-out still require valid booking state and availability. Deleted records, voided invoices and overlapping reservations move intent to Needs attention while preserving the local draft and the authorized server state. "Keep mine" creates a new validated operation based on current state and cannot bypass availability or financial rules. Discard removes only the chosen local intent and reconciles its dependents.

### Database environments and operations

- Development and test use separate databases. Integration tests require a dedicated opt-in test connection and never run against production data.
- Production uses a pooled runtime connection with limited credentials. Migrations use a separate direct connection. Apply reviewed incremental migrations only, preserve applied history and never reset routinely. Managed auth tables are never altered by application migrations.
- The database holds structured records only. Photos and exported files live in private object storage. Because the database tier is small, the change history grows monotonically and storage is monitored against its limit.
- Recovery combines provider restore history, a scheduled encrypted logical backup in a separate private bucket, and authorized Owner exports. Restore is verified on a disposable database. Server backups cannot restore operations that were never uploaded from a device.

## 3. Identity and Owner authority

Daisy uses managed Better Auth with email and password and password recovery. Credentials and sessions stay in the provider-owned auth schema. A configured Owner user ID binds access to exactly one approved identity, and there is no public sign-up. MFA is deferred by the Owner for the initial scope. Every protected page, endpoint and service operation verifies a fresh provider session, matching user and session identity and expiry. Navigation is advisory.

| Authority | Scope |
| --- | --- |
| Owner session | Full business authority. All server reads and writes require it |
| Registered device | Authorizes sync, uploads and offline provisioning for this browser. It confers no business authority without an Owner session |
| Offline unlock | Decrypts local data on a provisioned device. It never authorizes server access and cannot renew itself offline |
| Scheduled job | Runs idempotent maintenance such as billing generation and upload cleanup, authenticated by a shared secret and scoped to the Owner |

### Device registration and revocation

Registration creates the single application Owner record and a device record with security audit in one transaction. The device credential is a random 256-bit secret whose hash alone is stored server-side. A browser adapter keeps the token in an HttpOnly, SameSite=Strict session cookie, Secure on HTTPS, and returns only the device ID. A valid active credential is reused. Device listing is Owner-scoped and returns a server-validated current device ID. Revocation is idempotent under concurrent calls, blocks that device on its next request and does not end the Owner's sign-in session. Registration is not fully idempotent across cookie loss or concurrent first registrations, so the Owner can revoke surplus devices. Device and security events stay outside the domain feed.

### Offline unlock and key custody

Local personal data, projections, drafts and blobs are encrypted with AES-GCM under a key derived from a reviewed passphrase scheme. The key lives in memory only and the app locks after inactivity. A short PIN alone is inadequate for copied-storage protection. Offline unlock is allowed for a configurable period since the last validated online sign-in, initially seven days, and sync cannot renew that trust without a valid server session. Authentication expiry pauses sync and preserves pending operations for reauthentication. Wrong unlock attempts and HTTP 401 never wipe local work. Explicit discard or logout asks for confirmation, and with no pending work logout clears private local data and keys. Revocation takes effect on reconnect, and immediate remote wipe of an offline device is impossible. An offline clock is untrusted.

### Request and response security

Auth Route Handlers expose only sign-in, sign-out, session and password-recovery operations through the managed SDK proxy. Auth JSON omits raw tokens, preserves secure HttpOnly cookies and is private and no-store. Public auth pages use no-store, no-referrer and security headers, carry no personal data in initial HTML and clear recovery token state after acknowledgement. Same-origin checks use the configured application origin and ignore forwarded headers. Production CSP forbids eval. Incoming request logging is disabled to avoid recording recovery URLs, and structured logs are redacted. Browser modules never import Prisma, server services or secret-bearing configuration.

## 4. Modules

Module services live under `src/features/<feature>/` and define exact contracts, validation and operational limits. Rooms, beds and allocations are the shared dependency of tenants, transients and maintenance. Invoices depend on tenant assignments, payments settle invoices, and reports read all of them.

### 4.1 Settings, audit and dashboard

Settings hold business profile, billing day rules, proration policy, deposit policy, overpayment policy, document prefixes, standard check-in and check-out times, offline unlock period and proof limits. No financial policy has an implicit default. Settings writes are authorized, versioned and audited.

Audit records are identifier-only and carry no personal content. Audit reads use a safe metadata projection with area, action and date filters. Successful report CSV exports record the actor and safe context before returning the attachment, and export events remain audit-only. Device and security events are separate from the domain feed.

The dashboard shows occupancy, due and overdue invoices, today's check-ins and check-outs, open maintenance and recent activity. Online reads use one consistent snapshot. Offline reads use the last snapshot with a freshness indicator. Unavailable figures remain distinct from zero.

### 4.2 Tenants, rooms and allocations

- **Tenants.** Profiles require a full name and carry optional phone, email, address, emergency contact and notes, with integer versions and archive timestamps. There is no permanent delete, no stored occupancy field and no editable balance. Balances derive from invoices and payments. Archive and restore are audited, and archived tenants stay readable.
- **Rooms and beds.** Rooms define number, optional floor, type (single, double, dormitory, suite, deluxe), capacity, base monthly rate and optional transient daily rate. Beds define number, optional label, monthly and daily rates and availability status. Archival is soft, and a room or bed with active or upcoming allocations cannot be archived until they are released or concluded. Inventory and rate changes are online only.
- **Resource allocations.** One allocation engine covers `tenant_assignment`, `transient_reservation` and `maintenance_hold`. Intervals are half-open `[startDate, endDate)`. PostgreSQL enforces exclusivity with the `btree_gist` extension: `EXCLUDE USING gist ("bedId" WITH =, tstzrange("startDate", "endDate", '[)') WITH &&) WHERE ("status" = 'active')`. Abutting intervals, such as a check-out and check-in at the same instant, do not conflict, and any overlap is rejected with a conflict error. Whole-room bookings claim all relevant beds or follow an equivalent room-level protocol that individual bed allocations also respect. Resource sets are locked in a consistent order, and inventory changes must respect existing bookings.
- **Tenant assignments.** An assignment records tenant, room, bed, linked allocation, start and end dates, actual move-out date, monthly rate, security deposit, status (active, completed, cancelled) and notes. A partial unique index allows at most one active assignment per tenant. Database checks require non-negative rates and deposits and a start before the end. Assigning atomically creates the allocation, and an immediate start moves the bed from available to occupied. Move-out completes the assignment, records the actual date, truncates the allocation to that date, or cancels it if the tenancy never began, and restores the bed to available when no other allocation overlaps. Assignment and move-in or move-out are online only.

### 4.3 Billing and invoicing

Invoices and their items cover rent, deposit, utilities and adjustments for a tenant and billing period. Generation is idempotent by tenant and period and runs from a scheduled job or an Owner action. Invoice status moves through draft, issued, partially paid, paid and void. Overdue state is derived from the Asia/Manila business date and is not stored. Issuance assigns the unique official number under the sync head lock. Snapshots preserve tenant, room, bed and rate context at issuance. Adjustments are linked records, and voiding retains history and releases payment allocations only through the payment reversal workflow. Proration, deposit application and utility charging follow the Owner-configured policies. Generate, adjust and void are online only, while open invoices are readable offline.

### 4.4 Payments, proofs and collections

Payments are immutable entries with allocation lines against invoices. Services validate invoice state, overpayment policy and allocation totals in the same transaction and keep allocations within each invoice's net balance. Reversal is a linked opposite entry that restores invoice balances, and posted payments are never edited. Receipt numbers are server-assigned after acknowledgement. A payment recorded offline is a durable pending intent with no official receipt until accepted. Edit and reverse are online only.

Proof photos are compressed on the device, encrypted while queued and bounded by size and quota. If local persistence fails the app never shows success. Sync obtains an upload intent tied to Owner, device and `opId`, uploads to private object storage under a stable key, and verifies completion and content before applying the payment operation. Retries reuse the upload, expired URLs are renewed and interrupted uploads keep their local blobs. Orphan cleanup protects active intents. Downloads use short-lived signed URLs and are never cached by the worker. Proof access requires an Owner session, and original-file export is an explicit action.

### 4.5 Transients and reservations

Transient guests are managed records with name, contact details and notes. Reservations carry guest, bed or room, stay interval, daily rate and status (tentative, confirmed, checked in, checked out, cancelled, no show). Stay intervals convert to half-open allocation instants using the configured check-in and check-out times in Asia/Manila. Offline creation, check-in and check-out are tentative intents. On reconnect the server validates the transition and the allocation, and unavailable or overlapping requests move to Needs attention without overwriting server state. Rate tiers follow Owner configuration. Charges for a stay create an invoice through the normal billing workflow. Cancellation and no-show release the allocation.

### 4.6 Reporting

Reports are online only and read posted invoices, payments, allocations and maintenance records in a repeatable-read snapshot. They include occupancy, rent roll, receivables aging, collections by period and method, transient revenue and maintenance summaries. Historical reports preserve reversal dates and snapshot values. Exports are bounded authorized reads that produce CSV, record an audit event and are private and no-store. Every report states its as-of Asia/Manila date.

### 4.7 Maintenance, notices and notifications

Maintenance requests link to a room or bed, with category, priority, status and append-only updates. Logging and updating work offline as queued intents, and photos use the attachment protocol in 4.4. An Owner can place a maintenance hold, which creates an allocation that blocks the bed through the same exclusion constraint. Active allocations conflict with a hold and the conflict is reported to the Owner.

Notices are Owner-managed records, targeted to everyone, a room or a tenant, with start and end dates. External email and SMS delivery is out of scope. Notifications are projected at read time from an explicit allowlist of change and audit events, such as overdue invoices, lease or stay endings and Needs attention items, with read state kept per Owner.

The interface shows connection state separately from sync status, with pending counts, last sync time and a Needs attention list. "Saved on this device" and "Synced" have distinct meanings. Sync now and recovery never lose drafts. Stale balances and availability carry freshness warnings. The mobile baseline is 360 px, with accessible labels and focus, 44 px touch targets and semantic status colors.

## 5. Dependencies Installed

The package manifest and committed lockfile hold versions and scripts. Select compatible versions during scaffolding.

| Scope | Core dependencies |
| --- | --- |
| Application | Next.js App Router, React, strict TypeScript, Tailwind CSS and Zod |
| Persistence | PostgreSQL on Neon Free, Prisma Client, Prisma CLI and a PostgreSQL driver adapter |
| Identity | Managed Better Auth through Neon, with email and password and recovery |
| Offline | Dexie over IndexedDB, Web Crypto for AES-GCM, a reviewed service worker library or small custom worker |
| Files | Cloudflare R2 through its S3-compatible API with signed upload and download URLs |
| Hosting and jobs | Cloudflare Workers through the OpenNext adapter, with Cron Triggers for scheduled jobs |
| Verification | Vitest, real PostgreSQL integration tests and Playwright for end-to-end and offline checks |
| Tooling | pnpm with a frozen lockfile |

### Free-tier budget

| Resource | Free allowance | Design response |
| --- | --- | --- |
| Neon database | 1 GB per project, compute suspends when idle | Structured data only, cold-start tolerant clients, storage monitored |
| R2 object storage | 10 GB, 1 million writes and 10 million reads per month, no egress fees | Compress proofs on device, cap files per record, no thumbnails server-side |
| Workers | 100,000 requests per day | Client-rendered offline shell keeps server work to APIs and sync |
| Vercel Hobby | Personal, non-commercial use only | Not used, because the business is commercial |

Allowances change. Verify the database storage limit, Workers CPU time on real routes, driver adapter compatibility, scheduler availability and the free-tier inclusion of managed auth before selecting plans. The fallbacks are a paid Workers plan or a paid Vercel plan for hosting and a paid Neon plan for database history and storage.

## 6. Directory Structure

```text
.agents/rules/                 Project conventions
docs/architecture/             Design and decisions
prisma/
  schema.prisma                Server data model
  migrations/                  Incremental migrations and reviewed SQL constraints
public/
  icons/                       Installation assets
  offline-shell.html           Public, non-personal bootstrap document
src/
  app/                         Thin routes, manifest, layouts and API handlers
  features/<feature>/
    schemas.ts, types.ts       Browser-safe schemas and DTOs
    sync-contracts.ts          Browser-safe operation definitions
    actions.ts                 Online-only Server Actions
    service.ts, queries.ts     Server-only domain logic and reads
    sync-handler.ts            Server-only operation adapter
  components/
    features/<feature>/        Feature components
    common/                    Shared composites
    layout/                    Mobile and desktop shell
  server/                      Auth, db, security, audit, storage, sync, jobs
  offline/                     db, repository, crypto, outbox, transport, sync, hooks
  lib/                         Pure money, date and error helpers
  hooks/                       Shared client hooks
  config/                      Separate public and server configuration
  sw.ts                        Worker source, output served at /sw.js
tests/
  unit/                        Money, operations and state machines
  integration/                 Transactions, idempotency, availability and feed races
  e2e/                         Offline reload, reconnect and installation checks
package.json                   Scripts
```

Do not mix shared operation schemas and server handlers in one module. Test concurrent replay, lost acknowledgements, repeated edits, dependency failures, session expiry, tombstones, expired cursors, quota failure, encrypted blob recovery and upgrades. Verify that cached content holds no personal data, and test real Android and iOS installation and airplane-mode foreground sync before release.
