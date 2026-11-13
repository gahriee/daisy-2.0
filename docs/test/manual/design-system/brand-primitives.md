# Garden Ledger tokens and primitives

- Status: source/build verification PASS; rendered UI and device verification PENDING Owner.
- Last run: 2026-11-13 13:50:15 (UTC+8)
- Environment: Windows, Node 26.13.1, pnpm 10.28.2, Next.js 16.4.6, Vitest 5.1.0.
- Scope: global tokens, eleven primitives in src/components/ui and public /design-system reference. No business, auth or storage mutations.

## Executed checks

| Command/check | Results | Duration/metrics |
| --- | --- | --- |
| pnpm test:unit | PASS | 25 passed, 0 failed/skipped, 7 files; 561 ms |
| pnpm lint | PASS | No findings |
| pnpm typecheck | PASS | Route generation and strict TypeScript |
| npm run build (initial) | PASS | compile 2.9s, types 4.1s, 6 static pages in 728ms |
| npm run build (after checkbox fix) | PASS | compile 1.798s, types 2.6s, 6 static pages in 746ms |
| Static WCAG contrast calculation from CSS hex tokens | PASS | 13 pairs; text minimum 5.20:1, essential control borders minimum 3.49:1 |
| Impeccable doctor --json | PASS | findings=[], product/design resolved, rule registry available |
| git diff --check | PASS | One trailing README blank line corrected |

Contrast pair results: foreground/background 13.37; muted/surface 6.02;
muted/muted-surface 5.20; white/primary 8.30; white/danger 6.67;
accent foreground/accent 5.79; success/status surface 6.30;
warning/status surface 6.21; danger/status surface 5.85;
info/status surface 6.64; control boundary/white 3.78;
control boundary/linen 3.49; focus/linen 7.67. This is token math,
not a DOM accessibility audit or rendered contrast measurement.

## Source review

Impeccable source reviewer requested min-w-11 on the Checkbox label to complement
min-h-11. Applied in one batch; reviewer confirmed the finding resolved with a
source-scoped ship disposition. Documenter aligned DESIGN.md and sidecar.
Initial context launcher failed cache initialization; direct project context was
used and approved engine-cache access later enabled doctor. No source skill files
were modified. No browser, screenshot, preview server or UI component tests ran.

## Awaiting Owner verification

1. Open /design-system at 360px; verify reflow, readable colors and no page overflow.
2. Tab through controls; verify focus remains visible and disabled/loading controls are skipped.
3. Click Try validation with an empty/invalid email; native validation should block it. A valid email returns to the reference without persisting data; the separate error specimen intentionally stays labeled as an example.
4. Toggle the checkbox by its label and Space; use arrow keys with the native select. Try reduced-motion/forced-colors settings and confirm control focus remains usable.

Offline installation/sync is still planned and was not introduced by these primitives.

## Run History

| Run (UTC+8) | Result |
| --- | --- |
| 2026-11-13 13:50:15 | PASS source/build; user rendering/device checks pending |
