---
name: Daisy — Rausch and charcoal
description: Rausch crimson actions, soft stone neutral surfaces and crisp charcoal ink controls for daily operations.
colors:
  primary: "#e00b41"
  primary-hover: "#bd0836"
  primary-foreground: "#ffffff"
  accent: "#ffe8ee"
  accent-foreground: "#8f0629"
  background: "#f7f7f7"
  foreground: "#222222"
  surface: "#ffffff"
  surface-muted: "#ebebeb"
  muted-foreground: "#6a6a6a"
  border: "#dddddd"
  control-border: "#767676"
  success: "#1f6440"
  success-surface: "#eaf5ee"
  success-border: "#b8dac4"
  warning: "#7a5209"
  warning-surface: "#fff4d6"
  warning-border: "#ead28e"
  danger: "#c13515"
  danger-hover: "#a32b10"
  danger-surface: "#fdefeb"
  danger-border: "#eec5ba"
  info: "#23597a"
  info-surface: "#ecf4fa"
  info-border: "#b8d4e5"
  focus: "#e00b41"
typography:
  body:
    fontFamily: "Host Grotesk, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Host Grotesk, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4286
    letterSpacing: "normal"
  badge:
    fontFamily: "Host Grotesk, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3333
    letterSpacing: "normal"
rounded:
  control: "8px"
  panel: "12px"
spacing:
  unit: "4px"
  related: "8px"
  control-inline: "14px"
  action-inline: "16px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    typography: "{typography.body}"
  badge-neutral:
    backgroundColor: "{colors.surface-muted}"
    borderColor: "{colors.border}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "2px 10px"
    typography: "{typography.badge}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "24px"
  alert-info:
    backgroundColor: "{colors.info-surface}"
    borderColor: "{colors.info-border}"
    textColor: "{colors.info}"
    rounded: "{rounded.panel}"
    padding: "14px 16px 14px 40px"
---

## Overview

**Design Direction: "Rausch and charcoal" (Airbnb brand tokens + Taste Skill `host`)**

Soft neutral stone surfaces, crisp white panels and Rausch crimson actions give
Daisy a warm, legible editorial character. Host Grotesk keeps labels and
operational copy direct. The approved system uses light surfaces; it does not
automatically substitute a dark palette.

**Key Characteristics:**
- Soft stone neutral canvas (`#f7f7f7`) and crisp white working surfaces.
- WCAG AA Rausch crimson (`#e00b41`) primary actions and soft Rausch blush (`#ffe8ee`) emphasis.
- Quiet hairline borders (`#dddddd`), charcoal ink (`#222222`) and generous control targets.

The implemented authority is [the global stylesheet](src/app/globals.css) and
[the UI primitives](src/components/ui). This document records their reusable
conventions. Product truth remains in [PRODUCT.md](PRODUCT.md).

## Colors

Primary Rausch crimson (`#e00b41`, 4.89:1 on white) identifies an action, with a
deeper hover state (`#bd0836`) and white text. Soft Rausch blush (`#ffe8ee`) is
a supporting accent, including text selection, rather than the default button
fill. Foreground is warm charcoal ink (`#222222`); muted gray copy (`#6a6a6a`)
remains readable on white, stone and muted surfaces. The stronger medium-gray
control border (`#767676`) distinguishes editable controls from softer panel dividers.

Success, warning, burnt-brick danger (`#c13515`, separated from Rausch crimson)
and information each pair a foreground with a tinted surface. Badge and Alert
select these semantic pairs; the brand accent never decides operational status.

**The Text Carries Status Rule.** Color supplements a clear status label.
Pending intent must never be presented as a confirmed business result.

## Typography

Host Grotesk is provided by the root layout. Inputs retain body-sized text to
support mobile entry, while labels and buttons use an operational medium voice
(`500`). JetBrains Mono is available for genuine code and measurement, not
decorative headings. Money, counts and dates use tabular numerals at the feature
layer; primitives enforce tabular numerals on numeric-friendly badges without
formatting business values.

Headings wrap with balanced lines. No dedicated display font or display scale
has been introduced by this primitive set.

## Layout

Use the spacing scale in frontmatter. Fields group labels, help, controls and
errors with the related spacing token. Controls have a minimum 44 px target;
Checkbox supplies that target in both axes through its wrapping label while retaining a
native checkbox. Textarea starts at 112 px high and remains vertically resizable.

Support a 360 px viewport without horizontal page overflow. `Sidebar` (`256 px`
persistent rail on `lg+` and slide-over drawer on mobile) paired with `Topbar`
(`64 px` opaque hairline bar) establishes the workspace shell in
`src/components/layout/`, while primitives shrink cleanly within page grids.

## Elevation & Depth

Surfaces remain flat at rest. `Card` defaults to a hairline border and crisp
white fill (`24 px` mobile / `28 px` wider screens) with no resting shadow;
explicit `interactive` cards lift `2 px` on fine-pointer hover with a quiet
border step and hover-only ambient shadow. Alerts pair tonal fills with subtle
hairline borders instead of heavy accent stripes.

## Shapes

Controls share an `8 px` radius (`6 px` checkbox corners), while panels, cards
and alerts use a nested `12 px` radius. Keyboard focus shows immediately: a
two-pixel outline on links/buttons and a pixel-compensated two-pixel border
highlight (`--primary`) on focused or active text inputs and selects without
outer rings, shadows, or hover border shifts. Native Select and Checkbox retain
keyboard and platform selection behavior; reduced motion suppresses transform
motion while preserving state color shifts, and forced-color mode restores
native checkbox appearance and system highlights.

## Components

- **Button:** tonal software language (`primary`, `secondary`, `ghost`, `danger`)
  and `md` (`44 px`) / `sm` (`36 px`) sizes, defaulting to `type="button"`, plus
  shared `buttonClasses` for button-styled `<Link>` actions. Secondary uses a
  soft gray tonal fill without an outline that steps toward ink on hover;
  buttons use flat color transitions with no scale or translation transforms.
  Loading retains the action label with a spinner and `aria-busy`.
- **Input, Textarea and Select:** shared base border, zero hover styling, zero
  shadows, and pixel-compensated `2 px` border transitions on focus, active, and
  `aria-invalid` danger states. `Select` hides OS chrome in favor of a crisp
  trailing chevron over native options. `Input` and `Textarea` distinguish
  read-only and disabled states.
- **Field:** requires a stable unique ID and label. Uses a compact primary `*`
  cue with screen-reader text for required controls and renders a `!` status
  pill beside field errors while passing accessibility props to child controls.
- **Checkbox:** custom animated hairline SVG tick (`150 ms`) layered cleanly
  over a native `<input type="checkbox">` inside a `44 px` wrapping touch
  target. Do not nest its label inside another label.
- **Badge:** neutral, success, warning, danger and info tones with hairline
  borders and `tabular-nums`, without status dots. Neutral badges remain crisp
  on both white and muted surfaces.
- **Alert:** info, success, warning and danger tones with subtle tone-matched
  borders and a fixed left-rail geometric glyph so custom child layouts stay
  aligned. Uses `role="status"` by default.
- **Card:** `default` (white hairline), `tonal` (`surface-muted`), and `open`
  variants, plus opt-in `interactive` hover lift, with no data access or routing.
- **Separator:** crisp `1 px` `horizontal` rule or `vertical` divider using the
  quiet border token.
- **Skeleton:** static, muted hairline placeholder hidden from assistive
  technology (`aria-hidden="true"`). Consuming regions supply visible status.
- **Sidebar and Topbar:** persistent `256 px` white navigation rail (`Sidebar`)
  with mobile slide-over drawer (`Escape` and backdrop dismiss) aligned to a
  `64 px` sticky opaque `Topbar` by matching `1 px` hairline dividers. Active
  links mark selection with a crisp `2 px` Rausch left rail over `surface-muted`
  inside `44 px` touch targets; section labels use sentence-case `13 px` medium
  text without tracked capitals.
- **EmptyState:** quiet solid-surface hairline panel with a `40 px` square
  icon frame (`surface-muted`), factual copy, and primary/secondary actions—no
  dashed outlines, floating gradient orbs, or invented placeholder metrics.
- **Brand mark (`DaisyMark`, `DaisyBrand` & `/brand/*.png`, `/brand/*.svg`):** crisp 5-petal
  architectural stencil framing an open circular courtyard (`32×32` vector mark
  and `#e00b41` rounded app icon `icon.svg`). `DaisyBrand` exposes `show`
  (`icon`, `wordmark`, `lockup`) and `tone` (`light`, `dark`, `monochrome`),
  mirrored by static raster `.png` and vector `.svg` exports in `public/brand/`
  and previewed in `/design-system`. Avoid clip-art petals, gradients, shadows, or dots.
- **Recovery forms and Sign-in gates:** share a 7:5 asymmetric light split
  (`AuthShell`) pairing an unboxed `400 px` form pane on crisp white (`#ffffff`)
  with a warm-stone panel (`#f7f7f7`, hidden below `lg` so `360 px` mobile
  starts directly on the form) displaying an unDraw vector illustration
  ([sweet-home.svg](public/illustrations/sweet-home.svg) recolored to Daisy's
  Rausch, charcoal, stone, and surface tokens) and one short statement—no
  repeated brand logo on the right panel and no top-right dashboard link when
  unauthenticated. Password controls embed a `44 px` accessible visibility
  toggle (`aria-pressed`) inside the right input edge. Both preserve drafts on
  error, collapse empty live regions (`empty:hidden`), surface inline offline
  warnings and finite `Retry-After` guidance (`tabular-nums`), move focus cleanly
  between feedback and first invalid controls, and clear credential state on
  completion or sign-out.

Import primitives directly. They forward native props and React 19 refs; use
the shared `cn` helper so consumer classes override conflicting recipe utilities.

## Do's and Don'ts

- Do use semantic tokens rather than copying palette values into screens.
- Do keep controls labeled and style text inputs with borders only on focus and active states.
- Do source requested vector illustrations from unDraw and recolor them to match semantic tokens.
- Do keep pending, stale, error and confirmed states distinct in words.
- Do use flat panels and tonal status surfaces.
- Don't add business rules, database calls or authorization to primitives.
- Don't use color alone to identify status or error.
- Don't add decorative indicator dots to badges or status pills; let tonal fill, border and text carry status.
- Don't add shadows, rings or hover styles to text inputs, or scale/translate transforms to buttons.
- Don't remove a loading action's label or rely on a spinner alone.
- Don't describe source checks as rendered or real-device verification.
