# 6. Review Expectations and Quality Gates

Review the final change against the relevant items below. Scale the evidence to the change. Documentation-only work does not require running the application suite. Do not turn this checklist into unrelated implementation work.

## 6.1 Correctness and types

- The requested outcome works end to end, with meaningful empty, pending, stale and failure behavior where relevant.
- External inputs are validated, missing values are handled, and money uses exact representations with explicit rounding.
- Shared boundaries are typed without unexplained `any`, unsafe casts or suppressed compiler failures. Changed source passes the applicable type and lint checks.
- Invoices, payments, allocations and numbering preserve history, transaction boundaries and retry behavior when those areas change.
- Dates and billing periods use Asia/Manila business dates, and stored instants are UTC.

## 6.2 Architecture and authorization

- Routes, primitives, feature presentation, server services and offline modules have clear responsibilities. Secret-bearing dependencies stay on the server and out of `src/offline/`.
- Authentication and authorization are enforced by server operations, not only by hidden UI. Reads, writes, relations, reports, exports and downloads are scoped to the Owner, and sync and uploads also verify an active device.
- Do not claim authorization or features that are not implemented. Daisy has no staff, tenant or guest sign-in.
- New dependencies and directories serve the requested feature. Generated files and unrelated user changes remain untouched.

## 6.3 Offline and sync safety

- An offline-capable write has one path through the repository and outbox, with a stable operation ID and no second route through a Server Action.
- Operation IDs and submitted payloads are immutable. A changed resolution is a new operation.
- Idempotent replay, lost acknowledgements, conflicts, blocked dependents and retryable failures are handled. No new ID is assigned merely to retry.
- Pending intent is never shown as confirmed, and no official receipt or confirmed booking appears before acknowledgement.
- Local personal data, drafts and blobs are encrypted. The service worker caches only the public shell and static assets.
- Local schema and protocol changes preserve pending work or block the upgrade with recovery instructions.

## 6.4 UI and accessibility

- Existing primitives, semantic tokens and the mobile baseline are preserved. Controls have accessible names, valid labels, keyboard behavior and visible focus.
- Contrast, reduced motion, forced colors and 360 px reflow are considered for changed UI. Status is never conveyed by color alone.
- Failure recovery preserves user input, and loading states prevent accidental duplicate actions.
- Review UI source and give the user a concise verification checklist for the changed widths, states and interactions. Do not operate browsers or devices for visual verification unless the user asks, and do not present unrun UI checks as passed.

## 6.5 Service behavior and performance

- For changed services, decide whether caching, concurrency protection, idempotency or rate limiting is needed. Document meaningful decisions, and do not add infrastructure for an unrelated static change.
- Avoid repeated queries, unbounded reads and exports, and unnecessary client bundles. Pages and sync responses stay bounded.
- Check the effect on free-tier limits, such as database storage growth from change history and object storage from photos.
- Remove accidental debug output, exposed secrets, unused imports and abandoned code.

## 6.6 Verification and documentation

- Run the relevant checks from rule 7. Fix failures or explain a concrete blocker, and never report a skipped or unexecuted check as passing.
- Report actual commands, counts and outcomes, and retain failed runs along with the fix that followed. Do not use placeholder credentials, disabled assertions or weakened authorization to manufacture a pass.
- Keep the architecture, README, `AGENTS.md` and these rules in sync when structure, dependencies, features or scripts change. Keep directory trees directory-only.
- In the final response, summarize the result and the code and backend checks. For development changes, include a task-specific checklist for the user covering expected results, setup and any real-device or offline steps. Label UI and device verification as awaiting the user unless actually performed at their request. Do not present unrelated pre-existing changes as work completed by this task.
