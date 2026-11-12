# 9. Offline and Sync Standards

Offline-first behavior is Daisy's highest-risk area. Apply these rules to any change in `src/offline/`, the service worker, sync endpoints, sync handlers, attachments or the change feed. They work together with rules 2 and 8.

## 9.1 Offline scope

- The documented offline capability table in the architecture is the baseline. Do not move an online-only workflow offline without explicit conflict rules, tests and an updated architecture.
- Offline-readable: tenants, balances, rooms and beds, occupancy, reservations, open invoices, maintenance, notices and the dashboard, shown from the last snapshot with freshness indicators.
- Offline-queued, pending until accepted: add or edit tenant, record payment with proof, log or update maintenance. Reservation, check-in and check-out are tentative and the server validates them on reconnect.
- Online only: generating, adjusting or voiding invoices, editing or reversing posted payments, inventory and rate changes, assignments and moves, reports, exports, audit, settings and security.
- First sign-in, device registration and the initial snapshot require a connection.

## 9.2 Application shell and service worker

- Build a dedicated public bootstrap document and its static assets. The service worker precaches them and serves the document for supported failed navigations. It must work at the requested URL without a network redirect or an authenticated layout.
- Cache only the public shell and static assets. Authenticated HTML, RSC payloads, API and Server Action responses, exports and private files are network-only and never enter Cache Storage.
- Register the worker after provisioning. Defer activation during edits and sync, and make upgrades preserve the outbox and support local schema migration.
- Never promise background execution. Foreground sync is the baseline, and Background Sync is optional and must never require the decrypted key in the worker.
- Verify that cached content carries no personal data. Verify installation and airplane-mode behavior on real Android and iOS devices before release, as a user checklist.

## 9.3 Local persistence and key custody

- Encrypted IndexedDB holds snapshots, pending projections, the outbox, attachment blobs and metadata. Use AES-GCM with reviewed passphrase-based derivation, and keep keys in memory only.
- Auto-lock on inactivity. A short PIN alone is not adequate protection.
- Offline unlock is allowed for a configurable period since the last validated online sign-in. Sync cannot renew it without a valid server session, and an offline clock never establishes authority.
- Commit the outbox entry and the projection atomically in one IndexedDB transaction. If persistence fails, do not display success.
- Apply a pull page and advance its cursor in one IndexedDB transaction. Update confirmed snapshots, then rebase projections without discarding pending intent.
- Request persistent storage and monitor quota. Surface limits, encourage frequent sync, and never claim persistence is guaranteed. Remember that eviction can lose unsynced work.

## 9.4 Operation protocol

- Every operation includes `protocolVersion`, `opId`, `deviceId`, `localSequence`, `type`, `entityId`, `baseVersion`, `dependsOn`, `payload` and `occurredAt`.
- IDs and payloads are immutable after submission. A changed resolution is a new operation. Never assign a new ID simply to retry.
- Multiple local edits to one record use explicit dependencies. After the predecessor is acknowledged, bind dependents to its resulting server version before their first submission.
- A failed predecessor blocks its dependents, and independent work continues. Back off with jitter on transport failures and respect `Retry-After`. Validation and conflict outcomes need attention and never retry automatically forever.
- One sync leader per device processes the queue, with cross-tab coordination and a durable lease fallback. Server idempotency is mandatory regardless of client leadership.
- Push eligible pending operations before pulling.
- Push is limited to 50 operations and about 1 MB per request. Pull and bootstrap pages return at most 100 records.
- Treat new protocol versions and local schema migrations as breaking by default. Preserve pending work or block the upgrade with clear recovery instructions.

## 9.5 Server processing

- Each operation is its own transaction through the shared service. A compound operation is used only where a workflow needs all-or-nothing behavior.
- A unique Owner and `opId` key plus a canonical request fingerprint make concurrent retries commit once, return the recorded outcome for matching duplicates and reject changed payloads.
- Return per-operation outcomes: applied, duplicate, conflict, rejected or blocked, with typed reasons and resulting versions. A missing dependency stays retryable with no terminal result. A failed dependency is recorded as blocked.
- Lock the active device row for share, initialize the sync head atomically, then lock that Owner's head before reading idempotency outcomes or applying changes. Revocation must wait for in-flight authorized transactions, and later transactions fail.
- Commit domain state, audit, feed entry, sequence number and operation result together. Transport and transient database failures remain retryable with the original IDs.
- Pull returns committed changes after a signed, Owner-scoped opaque cursor, with tombstones and a bounded watermark.
- Bootstrap reconstructs a fixed snapshot from immutable full-record change history at a captured watermark, rather than paging live current rows independently. Archived records stay included.
- Never silently skip missing history. An expired cursor requires rebootstrap, which preserves the outbox and attachments and reconciles outcomes by `opId`. Cursor signing uses a purpose-separated secret, so rotation requires a new bootstrap.
- Change history and operation outcomes have no cleanup initially. Adding retention requires an explicit rebootstrap protocol first, because deleting history can strand devices.

## 9.6 Conflicts

- Mutable records use atomic integer-version comparison. Use explicit record-level conflicts and never merge fields silently.
- Append-only payments still validate current invoice and allocation state. Check-in and check-out still require valid reservation state and availability.
- Deleted records, voided invoices and overlapping reservations move the intent to Needs attention, preserving the local draft and the authorized server state.
- "Keep mine" creates a new validated operation based on current state. It cannot bypass availability or financial rules. Discard removes only the chosen local intent and reconciles its dependents.
- An offline availability view cannot guarantee availability on another device. Never show a booking, check-in or official receipt as confirmed before server acknowledgement.

## 9.7 Attachments

- Compress photos where appropriate, encrypt queued blobs and bound their size, count and quota. A failure to persist must never show success.
- Sync obtains an upload intent tied to the Owner, device and `opId`, uploads under a stable key, then verifies completion and content before applying the owning operation.
- Retries reuse the upload. Renew expired URLs. Interrupted uploads retain local blobs. Orphan cleanup must protect active intents.
- Authenticated downloads are never cached by the worker.

## 9.8 Testing and release checks

- Unit and integration tests cover concurrent replay, lost acknowledgements, repeated edits, dependency failures, session expiry, tombstones, expired cursors, quota failure, encrypted blob recovery and upgrades. Use an in-memory IndexedDB for offline module tests.
- Real-device checks, including installation, offline reload, reconnect and foreground sync, are listed in the user's verification checklist and are not performed by the agent unless requested.
