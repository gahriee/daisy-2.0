# Garden Ledger tokens and primitives

- Status: source/build verification PASS; rendered UI and device verification PENDING Owner.
- Last run: 2026-11-13 17:26:35 (UTC+8)
- Environment: Windows, Node 24.20.0, pnpm 10.28.2, Next.js 16.4.6, Vitest 5.1.0.
- Scope: global tokens, primitives in src/components/ui, custom DaisyMark/DaisyWordmark/DaisyBrand variants, 11 SVG exports in public/brand/, 7:5 asymmetric AuthShell with architectural geometric vectors, session-gated Dashboard (/), and session-gated Auth (/auth/*). No business or storage mutations.

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
| 2026-11-13 16:40:30 | PASS Rausch and charcoal (Airbnb brand token) source/build/copy-lint; user rendering/device checks pending |
| 2026-11-13 16:43:20 | PASS Badge dot removal and DESIGN.md Don'ts update; user rendering/device checks pending |
| 2026-11-13 16:50:09 | PASS Sidebar/Topbar/EmptyState primitives, empty Dashboard, and Auth redesign; user rendering/device checks pending |
| 2026-11-13 17:06:00 | PASS Custom DaisyMark/icon.svg and 50/50 split AuthShell redesign; user rendering/device checks pending |
| 2026-11-13 17:11:21 | PASS Original 7:5 asymmetric light-architectural AuthShell redesign; user rendering/device checks pending |
| 2026-11-13 17:14:56 | PASS Plain-language auth copy & one-sentence right-panel AuthShell polish; user rendering/device checks pending |
| 2026-11-13 17:19:07 | PASS Auth right-panel house-board preview & session routing between / and /auth/*; user rendering/device checks pending |
| 2026-11-13 17:23:17 | PASS Architectural vector geometry artwork on auth right panel; user rendering/device checks pending |
| 2026-11-13 17:26:35 | PASS Brand marks kit (icon/wordmark/lockup x light/dark/monochrome + public/brand SVGs); user rendering/device checks pending |

### Airbnb brand color token verification (2026-11-13 16:40:30 UTC+8)
- Environment: Windows, Node 24.20.0, pnpm 12.18.0, Next.js 16.4.6, Vitest 5.1.0.
- Updated global palette in `src/app/globals.css`, interactive `Card` hover shadow ink in `src/components/ui/card.tsx`, `/design-system` palette swatches in `src/app/design-system/page.tsx`, `.taste-skill/history.json`, and synced `DESIGN.md`, `PRODUCT.md`, `README.md`.
- Taste `start.mjs brand --page software --bg "#f7f7f7" --ink "#222222" --accent "#e00b41" --surface "#ffffff" --muted "#6a6a6a" --type host --radius soft --quiet`: PASS (exit 0; violet check and contrast baseline verified).
- Static WCAG 2.1 contrast calculation from CSS hex tokens (`globals.css`): `foreground/surface` 15.91:1, `foreground/background` 14.85:1, `foreground/surface-muted` 13.35:1, `muted-foreground/surface` 5.41:1, `muted-foreground/background` 5.05:1, `muted-foreground/surface-muted` 4.54:1, `primary/white` (`#e00b41`) 4.89:1, `primary/background` 4.57:1, `primary-hover/white` 6.46:1, `accent-foreground/accent` 8.10:1, `control-border/surface` 4.54:1, `control-border/background` 4.24:1, `danger/white` (`#c13515`) 5.54:1, `danger/danger-surface` 5.07:1, `success/success-surface` 6.36:1, `warning/warning-surface` 6.31:1, `info/info-surface` 6.79:1 (note: raw `#ff385c` measured 3.52:1 on white and was replaced with accessible Rausch `#e00b41` while keeping burnt brick `#c13515` visually separate for danger). This is token math, not a rendered DOM accessibility audit.
- `pnpm prettier --check` (modified files), `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 562 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.6 s, TypeScript 3.8 s, 8/8 static pages in 1344 ms).
- Taste static `copy-lint.mjs .next/server/app/design-system.html`: PASS (0 FAIL, 0 WARN, 164 words). Browser/device inspection deferred to Owner checklist.

### Badge dot removal verification (2026-11-13 16:43:20 UTC+8)
- Removed `dot` prop and rendered indicator dot element from `src/components/ui/badge.tsx` and added badge-dot prohibition to `DESIGN.md` `Do's and Don'ts`.
- `pnpm prettier --check src/components/ui/badge.tsx DESIGN.md`, `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 491 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.4 s, TypeScript 4.0 s, 8/8 static pages in 1435 ms). Browser/device inspection deferred to Owner checklist.

### Workspace shell, empty dashboard, and auth redesign verification (2026-11-13 16:50:09 UTC+8)
- Added custom UI primitives `Sidebar`, `Topbar`, and `EmptyState` in `src/components/ui/`, shared `DaisyBrand` and `WorkspaceShell` in `src/components/layout/`, replaced `src/app/page.tsx` with the empty Dashboard, wrapped `/design-system` in `WorkspaceShell`, and rebuilt `/auth/sign-in` and `/auth/reset-password` using `AuthShell` without the side status view.
- `pnpm prettier --check` (all 15 added/edited files), `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 484 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 5.0 s, TypeScript 4.0 s, 8/8 static pages in 1172 ms).
- Taste static `copy-lint.mjs`: `.next/server/app/index.html` PASS (0 FAIL, 0 WARN, 120 words); `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 201 words). Browser/device inspection deferred to Owner checklist.

### Custom Daisy mark and 50/50 split auth redesign verification (2026-11-13 17:06:00 UTC+8)
- Created `src/components/layout/daisy-mark.tsx` (geometric 5-petal courtyard stencil) and `src/app/icon.svg` (`#e00b41` Rausch rounded square + white 5-petal stencil), removed starter `src/app/favicon.ico`, updated `src/components/layout/daisy-brand.tsx` (`variant="default" | "inverted"`), redesigned `src/components/features/auth/auth-shell.tsx` into a 50/50 desktop split shell (`bg-foreground` editorial field + crisp white form pane + 360 px mobile header bar), updated `src/components/features/auth/sign-in-panel.tsx`, `src/components/features/auth/reset-password-form.tsx`, and `src/app/auth/reset-password/page.tsx` to an unboxed form surface, and updated `DESIGN.md` (`249/650` lines).
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 631 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 4.2 s, TypeScript 6.0 s, 8/8 static pages in 1365 ms, `/icon.svg` emitted).
- Taste static `copy-lint.mjs`: `.next/server/app/index.html` PASS (0 FAIL, 0 WARN, 120 words); `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 201 words). Browser/device inspection deferred to Owner checklist.

### Asymmetric 7:5 light-architectural auth redesign verification (2026-11-13 17:11:21 UTC+8)
- Redesigned `AuthShell` (`src/components/features/auth/auth-shell.tsx`) into a 7:5 desktop split placing the unboxed white entry pane on the left (`lg:col-span-7`) and a warm-stone (`bg-background`) 3-row operational ledger reference sheet featuring `DaisyMark` on the right (`lg:col-span-5`, `hidden lg:flex` so `360 px` mobile starts directly on the form), avoiding any dark-half split layout or copy cloning from the user's reference screenshot.
- Updated `src/components/features/auth/sign-in-panel.tsx`, `src/components/features/auth/reset-password-form.tsx`, `src/app/auth/reset-password/page.tsx`, and `DESIGN.md` (`250/650` lines).
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 498 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.5 s, TypeScript 3.9 s, 8/8 static pages in 1416 ms, `/icon.svg` emitted).
- Taste static `copy-lint.mjs`: `.next/server/app/index.html` PASS (0 FAIL, 0 WARN, 120 words); `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 201 words). Browser/device inspection deferred to Owner checklist.

### Plain-language auth copy and one-sentence right-panel verification (2026-11-13 17:14:56 UTC+8)
- Removed technical/jargon terms (`Owner access`, `Owner portal`, `Inventory`/`Ledger`/`Access` spec table, `Account recovery`, `Single-Owner access`, `Owner email`) across `AuthShell`, `SignInPanel`, `ResetPasswordForm`, and `src/app/auth/reset-password/page.tsx`.
- Simplified the right warm-stone panel in `src/components/features/auth/auth-shell.tsx` to `DaisyMark` paired with a single editorial statement (`"Every room, boarder, and guest stay kept clear in one place."` on sign-in; `"Set a new password and get back to your rooms and guests."` on recovery).
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 703 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.5 s, TypeScript 3.8 s, 8/8 static pages in 1868 ms, `/icon.svg` emitted).
- Taste static `copy-lint.mjs`: `.next/server/app/index.html` PASS (0 FAIL, 0 WARN, 120 words); `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 201 words). Browser/device inspection deferred to Owner checklist.

### Auth right-panel house-board preview & session routing verification (2026-11-13 17:19:07 UTC+8)
- Removed `DaisyMark` from the right warm-stone panel of `AuthShell` (`src/components/features/auth/auth-shell.tsx`) and added an honest `"Sample view"` preview stack (`Rooms & stays` 3-row card with `Badge` states + `Repairs` / `Reminders` 2-up note cards) underneath the single editorial sentence so the right panel reads balanced without duplicate branding or technical jargon.
- Made `backHref`/`backLabel` optional in `AuthShell` and removed the `"Dashboard"` button from `/auth/sign-in`; pointed `DaisyBrand` in `AuthShell` to `/auth/sign-in`.
- Wired bidirectional session routing: `src/app/page.tsx` (`export const instant = false`) redirects unauthenticated visitors to `/auth/sign-in`; `src/app/auth/sign-in/page.tsx` and `src/app/auth/reset-password/page.tsx` redirect authenticated Owner sessions to `/`; `SignInPanel` triggers `router.replace("/")` + `router.refresh()` upon sign-in or detected session; `WorkspaceShell` replaces `SidebarFooter` sign-in/reset links with a real `Sign out` button calling `POST /api/auth/sign-out` and redirecting to `/auth/sign-in`. Updated `DESIGN.md` (`252/650` lines).
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 531 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.9 s, TypeScript 3.7 s, 8/8 static pages in 1317 ms; `/` built as dynamic `ƒ /`).
- Taste static `copy-lint.mjs`: `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 196 words). Browser/device inspection deferred to Owner checklist.

### Auth right-panel architectural vector artwork verification (2026-11-13 17:23:17 UTC+8)
- Replaced the sample house-board UI cards inside the right stone panel of `src/components/features/auth/auth-shell.tsx` with pure crisp geometric vector artwork using Daisy's semantic tokens (`--surface`, `--surface-muted`, `--border`, `--primary`, `--foreground`, `--background`): subtle background perimeter rings, an architectural baseline & compass axis, a Rausch quarter-circle sector intersecting a concentric dashed arc, a charcoal doorway arch threshold cutout, a muted circle framing a key line icon, and a white tile framing a fine gable house icon, anchored cleanly above the bottom hairline rule and single statement.
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 519 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.3 s, TypeScript 4.6 s, 8/8 static pages in 1464 ms).
- Taste static `copy-lint.mjs`: `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 196 words). Browser/device inspection deferred to Owner checklist.

### Brand marks variant kit verification (2026-11-13 17:26:35 UTC+8)
- Updated `src/components/layout/daisy-brand.tsx` (`DaisyWordmark` + `DaisyBrand` supporting `show="lockup" | "icon" | "wordmark"`, `tone="light" | "dark" | "monochrome"`, and `asLink={false}` while preserving `variant="default" | "inverted"`).
- Generated 11 standalone static vector SVGs in `public/brand/` (`daisy-icon-{light,dark,mono,mono-white}.svg`, `daisy-wordmark-{light,dark,mono}.svg`, `daisy-lockup-{light,dark,mono,mono-white}.svg`).
- Added the `Brand marks` specimen grid to `src/app/design-system/page.tsx` and documented it in `DESIGN.md` (`254/650` lines).
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 541 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.7 s, TypeScript 4.5 s, 8/8 static pages in 1439 ms).
- Taste static `copy-lint.mjs`: `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 280 words). Browser/device inspection deferred to Owner checklist.

### Brand PNG raster asset kit verification (2026-11-13 17:32:02 UTC+8)
- Generated 9 raster `.png` assets in `public/brand/` (`daisy-icon-{light,dark,mono}.png` at `1024x1024`; `daisy-wordmark-{light,dark,mono}.png` and `daisy-lockup-{light,dark,mono}.png` at `1376x768`) from visually inspected `image-generator` outputs, verified valid PNG magic headers (`89 50 4E 47 0D 0A 1A 0A`) across all 9 files.
- Updated `src/app/design-system/page.tsx` and `DESIGN.md` (`254/650` lines) to reference both `/brand/*.png` and `/brand/*.svg`.
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 548 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.0 s, TypeScript 3.9 s, 8/8 static pages in 1423 ms; `ƒ /` dynamic).
- Taste static `copy-lint.mjs`: `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 282 words). Browser/device inspection deferred to Owner checklist.

### Auth right-panel unDraw vector replacement verification (2026-11-13 17:39:00 UTC+8)
- Downloaded `sweet-home_b054.svg` from `https://cdn.undraw.co/illustration/sweet-home_b054.svg`, recolored and XML-formatted into `public/illustrations/sweet-home.svg` (`8718` bytes, `viewBox="0 0 960 748.803"`, palette `#e00b41` + `fill-opacity="0.13"` blush disc, `#222222`, `#ffffff`, `#ebebeb`, `#dddddd`, and warm skin tone `#ed9da0`).
- Updated `src/components/features/auth/auth-shell.tsx` to render `/illustrations/sweet-home.svg` via `<Image unoptimized>` inside the desktop right stone panel (`lg:col-span-5`) above the bottom statement, removing the inline placeholder geometric lines/dots/circles. Updated `DESIGN.md` (`255/650` lines).
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 464 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 4.4 s, TypeScript 3.4 s, 8/8 static pages in 1330 ms; `ƒ /`, `ƒ /auth/sign-in`, `○ /auth/reset-password`, `○ /design-system`). Browser/device inspection deferred to Owner checklist.

### Border-only inputs, transform-free buttons, and unDraw policy verification (2026-11-13 17:45:51 UTC+8)
- Updated `AGENTS.md` (`128/180` lines) under Section 5 to require sourcing requested vector illustrations from `https://undraw.co/illustrations` into `public/illustrations/` and editing their colors to match Daisy's tokens.
- Updated `src/components/ui/control-styles.ts`, `input.tsx`, `textarea.tsx`, and `select.tsx`: removed all `ring-*` / `box-shadow` styles, outlines, and hover border changes; switched focus and active states to pixel-compensated `2 px` border transitions (`pl` / `py` compensation preserves caller `pr-12` on password fields); updated `read-only` to ignore pointer active/hover while keeping `2 px` charcoal border on `focus-visible`.
- Updated `src/components/ui/button.tsx` to export shared `buttonClasses` without any `scale` or `translate` transforms, and refactored button-styled `<Link>` elements in `src/app/page.tsx`, `src/components/features/auth/reset-password-form.tsx`, `src/components/features/auth/sign-in-panel.tsx`, and `src/components/layout/workspace-shell.tsx` to use `buttonClasses`. Updated `DESIGN.md` (`260/650` lines).
- `pnpm format` & `pnpm format:check`: PASS (`All matched files use Prettier code style!`).
- `pnpm typecheck`, `pnpm lint`: PASS.
- `pnpm test:unit`: PASS (44 passed, 0 failed/skipped across 10 files, 531 ms).
- `pnpm build` (`next build --webpack`): PASS (compiled 3.8 s, TypeScript 4.3 s, 8/8 static pages in 1686 ms).
- Taste static `copy-lint.mjs`: `.next/server/app/design-system.html` PASS (0 FAIL, 0 WARN, 282 words). Browser/device inspection deferred to Owner checklist.
