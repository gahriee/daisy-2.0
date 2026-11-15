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
  border: "#e4e4e4"
  control-border: "#b8b8b8"
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
    fontFamily: "Geist, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4286
    letterSpacing: "normal"
  badge:
    fontFamily: "Geist, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3333
    letterSpacing: "normal"
rounded:
  control: "4px"
  panel: "6px"
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
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.control-border}"
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

**Design Direction: "Rausch and charcoal" (Airbnb brand tokens + Taste Skill `geist`)**

Soft neutral stone surfaces, crisp white panels and Rausch crimson actions give
Daisy a warm, legible editorial character. Geist keeps labels and operational
copy crisp and direct. The approved system uses light surfaces; it does not
automatically substitute a dark palette.

**Key Characteristics:**
- Soft stone neutral canvas (`#f7f7f7`) and crisp white working surfaces.
- WCAG AA Rausch crimson (`#e00b41`) primary actions and soft Rausch blush (`#ffe8ee`) emphasis.
- Quiet hairline borders (`#e4e4e4`), charcoal ink (`#222222`) and generous control targets.

The implemented authority is [the global stylesheet](src/app/globals.css) and
[the UI primitives](src/components/ui). This document records their reusable
conventions. Product truth remains in [PRODUCT.md](PRODUCT.md).

## Colors

Primary Rausch crimson (`#e00b41`, 4.89:1 on white) identifies an action, with a
deeper hover state (`#bd0836`) and white text. Soft Rausch blush (`#ffe8ee`) is
a supporting accent, including text selection, rather than the default button
fill. Foreground is warm charcoal ink (`#222222`); muted gray copy (`#6a6a6a`)
remains readable on white, stone and muted surfaces. The soft neutral control
border (`#b8b8b8`) distinguishes editable controls and secondary buttons from
quiet panel dividers (`#e4e4e4`).

Success, warning, burnt-brick danger (`#c13515`, separated from Rausch crimson)
and information each pair a foreground with a tinted surface. Badge and Alert
select these semantic pairs; the brand accent never decides operational status.

**The Text Carries Status Rule.** Color supplements a clear status label.
Pending intent must never be presented as a confirmed business result.

## Typography

Geist is provided by the root layout. Inputs retain body-sized text to
support mobile entry, while labels and buttons use an operational medium voice
(`500`). Geist Mono is available for genuine code and measurement, not
decorative headings. Money, counts and dates use tabular numerals at the feature
layer; primitives enforce tabular numerals on numeric-friendly badges without
formatting business values.

Headings wrap with balanced lines. No dedicated display font or display scale
has been introduced by this primitive set.

## Layout

Use the spacing scale in frontmatter. Fields group labels, help, controls and
errors with tight form rhythm (`gap-1.5`). Interactive buttons, tabs,
disclosures and checkboxes retain a minimum `44 px` target (`Checkbox` supplies
that target in both axes through its wrapping label while retaining a native
checkbox), while form inputs and selectors default to compact `40 px` mobile /
`36 px` desktop height and `Textarea` starts at `80 px` (`min-h-20`) while
remaining vertically resizable.

Support a 360 px viewport without horizontal page overflow. `Sidebar` (`256 px`
persistent rail on `lg+` and slide-over drawer on mobile) paired with `Topbar`
(`64 px` opaque hairline bar) establishes a centered workspace canvas
in `src/components/layout/` (`max-w-7xl` with responsive outer margins from
`16 px` on mobile to `40–56 px` on desktop), while primitives shrink cleanly
within page grids.

## Elevation & Depth

Surfaces remain flat at rest. `Card` defaults to a hairline border and crisp
white fill (`24 px` mobile / `28 px` wider screens) with no resting shadow;
explicit `interactive` cards lift `2 px` on fine-pointer hover with a quiet
border step and hover-only ambient shadow. Alerts pair tonal fills with subtle
hairline borders instead of heavy accent stripes.

## Shapes

Controls and checkboxes share a crisp `4 px` radius (`--control-radius`), while
panels, cards, tables and alerts use a subtle `6 px` radius (`--panel-radius`).
Keyboard focus shows immediately: a two-pixel outline on links/buttons and a
crisp `1 px` border highlight (`--primary`) on focused or active text inputs and
selects without outer rings, shadows, or hover border shifts. Native Select and
Checkbox retain keyboard and platform selection behavior; reduced motion
suppresses transform motion while preserving state color shifts, and
forced-color mode restores native checkbox appearance and system highlights.

## Components

- **Button:** tonal software language (`primary`, `secondary`, `ghost`, `danger`)
  and `md` (`44 px`) / `sm` (`36 px`) sizes, defaulting to `type="button"`, plus
  shared `buttonClasses` for button-styled `<Link>` actions. Secondary uses a
  crisp white surface with a `1 px` `control-border` outline (`#b8b8b8`) that
  steps to a soft stone tint on hover; page-header, panel, and dialog confirm
  destructive actions (such as `Reverse payment`, `Void invoice`,
  `Confirm reversal`, `Mark withdrawn`, `Reject request`, `Archive tenant`,
  `Archive room`, request `Archive`, and `Cancel hold`) use `danger` (`#c13515`
  `--danger` fill with `#ffffff` `--primary-foreground` text, stepping to
  `--danger-hover` `#a32b10`), while row/card action buttons and table `Actions`
  menu controls avoid red backgrounds and pair `secondary` framing with
  `text-danger` instead, reserving plain `secondary` for benign `Cancel`
  dismissals. Buttons use flat color transitions with no scale or translation
  transforms. Loading retains the action label with a spinner and `aria-busy`.
- **Input, Textarea and Select:** shared `1 px` base border (`control-border`),
  zero hover styling, zero shadows, and `1 px` border color transitions on focus,
  active, and `aria-invalid` danger states. All form inputs and selectors default
  to compact search-and-filter density (`40 px` mobile / `36 px` `sm:` desktop
  single-line height, `16 px` mobile / `14 px` desktop text, and `min-h-20`
  vertical-resize `Textarea`) across standalone forms, dedicated pages, dialogs,
  and toolbars, and distinguish read-only and disabled states. `Select` renders
  an accessible `combobox`/`listbox` with a rotating `14 px` chevron and portal
  options panel (supporting `<option>`/`<optgroup>`, type-ahead search, keyboard
  arrows/`Escape`, `compact` inline density for pagination, `--surface-muted`
  active highlight, and `--accent/70` selected pill with a `--primary`
  checkmark).
- **Field:** requires a stable unique ID and label with compact `content-start`
  rhythm (`gap-1.5`, `13 px` label -> control -> `12 px` helper description below
  -> error), keeping multi-column rows horizontally aligned even when helper
  copy or validation messages appear. Uses a compact primary `*` cue with
  screen-reader text for required controls and renders a `!` status pill beside
  field errors while passing accessibility props to child controls.
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
- **MetricCard:** KPI summary card built on `Card` (`min-h-[152px]`) pairing a
  label and unboxed top-right icon with a vertically centered `tabular-nums`
  value and concise factual description below.
- **Dialog vs. dedicated pages:** accessible modal surface (`role="dialog"`,
  `aria-modal="true"`) with `Escape` and backdrop dismissal (suppressible via
  `dismissDisabled` during pending saves), initial focus and return-focus
  restoration, `FormDensityProvider` (`filter` density for compact modal
  controls), and a `rounded-panel` hairline header/body layout sized cleanly for
  `360 px` and desktop viewports. Reserve modals strictly for concise, focused
  confirmations, previews, or compact lookups/forms; never render complex
  multi-section workflows, file/gallery editors, or dynamic repeating-row forms
  (such as invoice line items or payment invoice allocations) inside a modal—use
  a dedicated sub-page (`/rooms/new`, `/rooms/[roomId]`,
  `/transients/listings/[roomId]`, `/billing/new`, `/billing/[invoiceId]`,
  `/payments/new`, `/payments/[paymentId]`, `/maintenance/new`,
  `/maintenance/[requestId]`) paired with `CompactFormScope` and `Topbar`
  breadcrumbs instead.
- **ConfirmDialog:** shared confirmation modal
  (`src/components/ui/confirm-dialog.tsx`) built on `Dialog` that gates every
  immediate state-changing action across row menus, mobile cards, header buttons,
  card controls, note deletions, maintenance holds, booking decisions, device
  revocation, notification mark-read, and sign-out before executing mutations.
  Pairs a `secondary` Cancel control with a loading-guarded `primary` or
  destructive `danger` (`--danger` fill + white text) Confirm button, inline
  `details` / `warningMessage` / `errorMessage` feedback, and parent
  `dismissDisabled` locking when nested inside another modal.
- **Separator:** crisp `1 px` `horizontal` rule or `vertical` divider using the
  quiet border token.
- **Skeleton:** static, muted hairline placeholder hidden from assistive
  technology (`aria-hidden="true"`). Consuming regions supply visible status.
- **Sidebar and Topbar:** sticky `256 px` white navigation rail (`Sidebar`,
  `lg:sticky lg:top-0 lg:h-svh`) with primary links (`Dashboard`,
  `Rooms & beds`, `Tenants`, `Transients`, `Billing`, `Payments`, `Maintenance`,
  `Notices`, `Audit log`, `Settings`) without a Design system nav entry, a
  bottom-mounted desktop rail collapse toggle (`76 px` icon rail paired with
  live `Asia/Manila` date and time), and a full-width mobile slide-over drawer
  (`Escape` and backdrop dismiss). Desktop rail collapse and individual
  `SidebarNavDisclosure` expanded/collapsed states (`Rooms & beds`, `Settings`)
  persist across refreshes via `localStorage`.
  `SidebarNavDisclosure` renders a full-row clickable collapsible trigger over a
  `44 px` touch target with a `2 px` Rausch active rail and indented sub-links.
  The `64 px` sticky opaque `Topbar` pairs section breadcrumbs
  (`Settings > [module]`, `Rooms > [subpage]`, `Tenants > [tenant]`,
  `Transients > [subpage]`, `Billing > [invoice]`, `Payments > [payment]`,
  `Maintenance > [request]`) with real Owner notification alerts and the Owner
  profile & name menu (containing Settings shortcuts and sign-out).
- **Tabs (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`):** WAI-ARIA `tablist`
  supporting arrow/Home/End keyboard switching, `44 px` touch targets, tabular
  badge counts, and `underline` (2 px Rausch active bar) or `segmented` (stone
  track with elevated white active surface) variants.
- **Table (`Table`, `TableCardHeader`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`):**
  hairline-bordered horizontal scroll container preserving 360 px viewports with
  a consistent `TableCardHeader` bar (title on the left, tabular item/record
  count and optional header actions on the right) across both module workspaces
  and detail-view ledgers (`Line items`, `Linked adjustments`,
  `Invoice allocations`, `Attached proofs`, `Attachments`, `Updates`, `Notes`,
  `Assignment history`, `Signed contracts`, `Invoices`, `Payments`,
  `Public booking room publishing`, `Transient guests`), rendering stacked
  mobile cards (`md:hidden`) paired with `hidden md:block` desktop tables,
  quiet row hover states, opt-in `numeric` `tabular-nums` alignment, sortable
  column headers (`aria-sort` + full-header `min-h-11` sort button with muted
  opposing arrows when inactive, primary `--primary` direction arrow and label
  when active, and leading indicator placement on `numeric` headers), attached
  `TablePagination` footer (`0–0 of 0` count, `Rows per page` selector
  defaulting to `25`, chevron controls, and active-page `--accent/70` pill
  highlight centered below `md` and split left/right from `md` up), and
  `RowActionMenu` shared across both desktop `<Table>` cells and `md:hidden`
  mobile table cards (`•••` portal dropdown matching compact `36 px` field
  height whenever two or more actions apply—never inline multi-button strips on
  table rows or cards—or a direct single `secondary` control when only one action
  applies, rendering `tone: "danger"` menu items and fallbacks with `text-danger`
  and neutral `--surface-muted` hover instead of red background fills).
- **SearchFilter (`SearchFilterBar`, `SearchFilterInput`):**
  compact dynamic find toolbar (`40 px` mobile / `36 px` `sm:` desktop height,
  `p-3.5 sm:p-4`) without submit buttons or duplicate table count badges,
  pairing labeled `Find ...` / `Find a ...` inputs (inline clear trigger),
  compact `filter` `Select`/`Input` controls, and inline `Clear` recovery
  (never tab or pill-button filters).
- **EmptyState & empty-table vectors (`EmptyState`, `TableEmptyState`, `EmptyStateIllustration`):**
  quiet solid-surface hairline panel with always-centered artwork/icon, factual
  copy, and recovery actions—no dashed outlines or floating gradient orbs.
  Every empty data table or zero-match filter result (both standalone workspace
  directories and embedded detail/sub-table cards beneath `TableCardHeader`)
  renders centered recolored unDraw vectors ([document-search.svg](public/illustrations/document-search.svg),
  [sweet-home.svg](public/illustrations/sweet-home.svg),
  [adjust-settings.svg](public/illustrations/adjust-settings.svg)) paired with
  centered title, description, and recovery actions—using borderless embedded
  `TableEmptyState` inside existing table cards—while active headers, forms,
  and populated tables stay vector-free.
- **Brand mark (`DaisyMark`, `DaisyBrand` & `/brand/*.png`, `/brand/*.svg`):** crisp 5-petal
  architectural stencil framing an open circular courtyard (`32×32` vector mark
  and `#e00b41` rounded app icon `icon.svg`). `DaisyBrand` exposes `show`
  (`icon`, `wordmark`, `lockup`) and `tone` (`light`, `dark`, `monochrome`),
  mirrored by static raster `.png` and vector `.svg` exports in `public/brand/`
  and previewed in `/design-system`. Avoid clip-art petals, gradients, shadows, or dots.
- **Public booking & transients workspace (`/book`, `/transients`, `/transients/requests/[requestId]`):**
  `/book` renders outside the Owner sidebar on the warm stone light ground with a
  clean sticky header, date/party availability filter, published room cards
  featuring an optional card preview cover (`previewImageUrl`, omitted when
  unset), `View photos (N)` gallery modal with captions, Prev/Next buttons,
  arrow-key navigation, and thumbnail strip, estimated `tabular-nums` PHP
  totals, privacy-consent modal, and explicit retry-same-key offline error
  recovery (`document-search.svg` when no rooms are published). On dedicated
  `/rooms/new`, `/rooms/[roomId]`, and `/transients/listings/[roomId]` pages,
  `Room type` options show names without inline `(₱.../mo)` pricing,
  monthly/daily rates appear in a read-only summary sourced from the selected
  room type, and Owners manage 1 preview image plus up to 8 captioned gallery
  shots. `/transients` pairs KPI summary cards, `SearchFilter` with `Select`
  filters for requests and stays, room publishing & policy panels, and 360 px
  mobile card lists + desktop tables, while `/transients/requests/[requestId]`
  renders independent Owner rate-change review and bed/guest assignment before
  approval.
- **Tenants directory & separate notes (`/tenants`, `/tenants/[tenantId]`):**
  `/tenants` opens separate timestamped `TenantNote` management from the row
  `•••` menu and mobile card actions (`Notes` / `Notes (N)`) via `TenantNotesDialog`
  (add, newest-first timestamped list, and per-note delete while preserving drafts
  on validation/archive errors), and `/tenants/[tenantId]` renders a dedicated
  `Notes` card and modal trigger; Add tenant, Edit tenant, Assign room, and
  Move out dialogs omit flat `Notes` fields, and user-facing workspace labels omit
  explicit `Manila` / `Asia/Manila` timezone strings for local PH readability.
- **Maintenance & notices workspaces (`/maintenance`, `/maintenance/new`, `/maintenance/[requestId]`, `/notices`):**
  both overview screens pair 4 KPI `MetricCard`s, `SearchFilterBar` with
  `Select` filters (no tab/pill chips), `document-search.svg` empty states,
  360 px mobile card lists, and desktop tables. Complex multi-section creation
  and lifecycle views live on dedicated sub-pages (`/maintenance/new` and
  `/maintenance/[requestId]`) with attachment upload progress UI, append-only
  update timelines, and inline hold controls/conflict feedback, while `/notices`
  manages `EVERYONE`, `ROOM`, and `TENANT` date-ranged notices cleanly.
- **Recovery forms and Sign-in gates:** share a 7:5 asymmetric light split
  with a warm-stone panel (`#f7f7f7`, hidden below `lg` so `360 px` mobile
  starts directly on the form) displaying an unDraw vector illustration
  ([sweet-home.svg](public/illustrations/sweet-home.svg) recolored to Daisy's
  Rausch, charcoal, stone, and surface tokens) and one short statement—no
  repeated brand logo on the right panel and no top-right dashboard link when
  unauthenticated. Password controls embed an input-matched (`40 px` mobile /
  `36 px` desktop) accessible visibility toggle (`aria-pressed`) inside the right
  input edge. Both preserve drafts on error, collapse empty live regions
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
- Don't join multiple data fields on one line with middots (`·`); stack separate fields vertically on their own lines using crisp `gap-0.5` stacks.
- Don't use tab or chip/pill buttons as `SearchFilter` filters; always use labeled `Select` controls.
- Don't add shadows, rings or hover styles to text inputs, or scale/translate transforms to buttons.
- Don't remove a loading action's label or rely on a spinner alone.
- Don't mix dynamic repeating rows, complex photo uploaders, or multi-section workflows into modal dialogs; promote them to dedicated App Router pages.
- Don't describe source checks as rendered or real-device verification.
