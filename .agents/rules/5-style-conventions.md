# 5. Style Conventions and Design System

## 5.1 Design authority and reuse

- Read `PRODUCT.md` and `DESIGN.md` if they exist, and the nearby canonical components, before changing UI. If no design reference exists yet, record new tokens and conventions in `DESIGN.md` as they are introduced.
- Use semantic custom properties from the global stylesheet or their Tailwind theme aliases. Do not hard-code color, spacing or radius values in feature components. Keep status colors distinct from any decorative accent.
- Use tabular numerals for money, room and bed numbers, and counts. Format currency as Philippine pesos with two decimals, and format dates in Asia/Manila.
- Prefer direct imports of existing primitives over parallel lookalike controls. Use one class-merging helper for conditional utilities and consumer overrides. Use Tailwind for all primitives and pages.
- The owner operates mostly on a phone, often with weak connectivity. Design for that first and enhance for desktop.

## 5.2 Mobile and touch baseline

- The mobile baseline is 360 px width. Preserve reflow down to that width, with no horizontal page scroll. Wide tables scroll inside their own container or become cards.
- Touch targets are at least 44 px. Keep primary actions reachable and adequately spaced.
- Prefer inputs that suit mobile entry. Use meaningful `type`, `inputMode` and `autoComplete`, such as numeric entry for amounts and telephone entry for phone numbers.
- Respect reduced-motion and forced-color preferences.

## 5.3 Forms, states and accessibility

- Use actual buttons for actions and actual links for navigation. Give icon-only controls accessible names and hide decorative icons from assistive technology.
- Use one `Field` pattern to connect a visible label, help and error with a control. Placeholders supplement labels and never replace them.
- Validate on submission and show errors beside the relevant field with `aria-invalid` and descriptions. Focus the first invalid control and keep drafts when a mutation fails.
- Provide disabled, read-only, loading, success, error, empty, stale and pending states where the feature needs them. Explain unavailable actions in accessible text.
- Keep keyboard focus clearly visible on every interactive control. Do not suppress the focus indicator.
- Announce non-urgent updates through a stable polite status region. Reserve alerts for urgent errors.
- Preserve 4.5:1 text contrast and 3:1 contrast for large text and essential controls. Status always has words or another meaningful cue besides color.
- Dialogs are for tasks that justify protected focus, with predictable cancellation and preserved drafts.

## 5.4 Offline and sync language

- Show connection state separately from sync state, with pending counts, the last sync time and a Needs attention list. A Sync now action must never discard drafts.
- "Saved on this device" and "Synced" are different states with different words. Use "Pending" for queued work and never "Confirmed", "Issued" or "Checked in" until the server has acknowledged it.
- Stale snapshots, balances and availability show a freshness indicator. Online-only actions explain that they need a connection instead of failing silently.
- Never show an official receipt number for a payment that is still pending.

## 5.5 Composition and copy

- Use 4 px spacing increments and reuse existing section, toolbar, form and card rhythms. Introduce shared composites only when real repeated behavior needs them.
- Keep forms focused on the task and do not mirror every database column into the interface.
- Write concrete actions such as "Record payment" or "Assign bed". Error text says what needs correction.
- Label sample data and local-only demonstrations honestly. Never imply that an invoice was issued, a payment recorded or a stay confirmed when it was only previewed or queued.
- Always use plain, non-technical everyday language across every user-facing frontend screen, label, button, helper text, preview, toast, and error message. Write for a non-technical boarding house manager rather than a developer: avoid technical or implementation jargon (such as "gateway", "encrypted at rest", "rendered", "GSM/UNICODE", "placeholder token", "payload", "endpoint", "schema", "outbox", "HTTP status", or raw `{{variable}}` code labels on buttons). Only keep an external provider's own label when the user must match it in that service (such as "Semaphore API key"), paired with plain-language guidance. Keep implementation details in developer references rather than in ordinary workflows.
