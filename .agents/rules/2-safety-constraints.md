# 2. Safety and Security Constraints

## 2.1 Credentials and server boundaries

- Keep credentials in ignored local environment files or the hosting platform's secret store. `.env.example` contains only empty or clearly non-secret examples.
- Never print, commit or place connection strings, object storage keys, signing secrets or cron secrets in documentation, screenshots, logs, test artifacts or command arguments. For diagnostics, report only the necessary host and database name and whether a credential is configured.
- `NEXT_PUBLIC_` variables are public browser configuration. Never use that prefix for database credentials, session or cursor secrets, storage keys or the Owner user ID.
- Protect database, authentication, storage and signing modules with `server-only`. Browser and offline code must not import them directly or through a mixed server and client barrel.
- Preserve the existing development and production databases. Do not recreate them, reset passwords or weaken authentication or TLS to make a connection test pass. Never modify the provider-owned auth schema.

## 2.2 Owner and device authority

- Daisy has exactly one approved Owner identity. Public sign-up must stay disabled. Verify a fresh provider session with matching user and session identity and expiry on every protected page, endpoint, Server Action, download, export and sync request.
- Sync, upload and offline provisioning additionally require an active registered device credential. A device credential never confers business authority without an Owner session, and an Owner session never replaces device checks for sync.
- Device credentials are random 256-bit secrets. Store only their hash server-side. Revocation is idempotent and takes effect on the next request. It does not end the Owner's sign-in session.
- Scheduled jobs authenticate with a shared secret, are scoped to the Owner, and are idempotent. Do not expose job endpoints without that authentication.
- Do not add tenant or staff sign-in, shared links to private data, or public read endpoints unless the architecture is updated first.
- Layout redirects and visible navigation are conveniences. Services and handlers must enforce authority independently.

## 2.3 Input, output and personal data

- Validate every mutation on the server even when the browser validates it. Parameterize SQL and never interpolate untrusted values into raw SQL or shell commands.
- Return safe, actionable errors. Keep database errors, stack traces and internal paths out of responses.
- Tenant and guest records hold personal data such as names, phone numbers, emails, addresses, emergency contacts and notes. Collect and return the minimum needed, keep it out of logs, URLs, analytics and public pages, and keep audit payloads identifier-only. Do not store identity document images unless the Owner decides it is required.
- Payment proofs and maintenance photos are private. Never expose them through a public bucket, a guessable key or a long-lived URL.
- Do not render untrusted HTML. A fixed developer-authored theme script is different from user-controlled content.
- Deploy with security headers, secure HttpOnly cookies, SameSite protection and a CSP that forbids eval, and check them against the real shell, fonts and scripts rather than copying a policy blindly. Disable incoming request logging on auth and recovery routes.
- Same-origin checks use the configured application origin and never forwarded headers.

## 2.4 Local data and offline security

- Local personal data, projections, drafts, outbox entries and attachment blobs must be encrypted at rest with reviewed key derivation. Keep the decrypted key in memory only, and never write it to storage, a cookie, the service worker or logs.
- The service worker caches only the public bootstrap document and static assets. Authenticated HTML, RSC payloads, API responses, Server Action responses, exports and private files are network-only. Verify that cached content contains no personal data.
- Wrong unlock attempts and HTTP 401 never wipe local work. Destructive discard or logout requires confirmation and warns when unsynced work exists.
- Offline unlock never renews itself and never authorizes server access. An offline clock is untrusted.
- Request persistent storage and monitor quota, but never claim it is guaranteed. Surface quota failure instead of reporting success.

## 2.5 Uploads and files

- Validate type by signature, size, count, ownership and intended use before accepting a file. Compress and bound photos before queueing.
- Uploads use an authorized intent bound to the Owner, device and operation ID, stable keys and server-side content verification before the owning record is applied. Orphan cleanup must not delete files that an active intent may still use.
- Downloads use short-lived signed URLs after an authorization check. A file URL or guessed key must never bypass authorization.

## 2.6 Data integrity and concurrency

- Use transactions and database constraints for multi-record writes. Audit every material change with actor, action, entity identifiers and time, and never put secret or personal content in the payload.
- Detect stale edits with integer-version preconditions. Preserve the user's draft and local intent when reporting a conflict.
- Make every retryable operation idempotent, including sync pushes, scheduled billing generation, uploads and payment recording. Duplicate submissions must not create duplicate invoices, payments or allocations.
- Evaluate caching, concurrency and rate limiting when designing a service. Authenticated reads are private and uncached by default, and shared caches must never hold personal or financial data.
- Rate-limit authentication, upload, export, sync and expensive endpoints using the database-backed limiter with database time. Do not rely on a process-local counter or an unvalidated forwarded IP.
- Database schema and migration work follows the PostgreSQL skill and rule 4. Never rewrite applied migrations or destroy data as routine cleanup.
