---
name: Daisy — Garden Ledger
description: Forest actions, linen surfaces and quiet, readable controls for daily operations.
colors:
  primary: "#245747"
  primary-hover: "#1b4538"
  primary-foreground: "#ffffff"
  accent: "#e6ce8c"
  accent-foreground: "#59471c"
  background: "#f7f6f0"
  foreground: "#202c27"
  surface: "#ffffff"
  surface-muted: "#eeefe7"
  muted-foreground: "#59665e"
  border: "#c6cdc2"
  control-border: "#78877c"
  success: "#286344"
  success-surface: "#eaf4ec"
  warning: "#79530e"
  warning-surface: "#fff3d1"
  danger: "#a13932"
  danger-hover: "#852d28"
  danger-surface: "#fbedeb"
  info: "#275a76"
  info-surface: "#eaf3f8"
  focus: "#245747"
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
  control: "8px"
  panel: "8px"
spacing:
  unit: "4px"
  related: "8px"
  control-inline: "12px"
  action-inline: "16px"
  panel: "20px"
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
    padding: "8px 12px"
    typography: "{typography.body}"
  badge-neutral:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
    typography: "{typography.badge}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "20px"
  alert-info:
    backgroundColor: "{colors.info-surface}"
    textColor: "{colors.info}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

## Overview

**Creative North Star: "Garden Ledger"**

Warm paper-like surfaces and forest actions give Daisy a grounded, orderly
character. Geist keeps labels and operational copy direct. The approved system
uses light surfaces; it does not automatically substitute a dark palette.

**Key Characteristics:**
- Linen canvas and white working surfaces.
- Forest primary actions and restrained gold emphasis.
- Quiet borders, compact labels and generous control targets.

The implemented authority is [the global stylesheet](src/app/globals.css) and
[the UI primitives](src/components/ui). This document records their reusable
conventions. Product truth remains in [PRODUCT.md](PRODUCT.md).

## Colors

Primary forest identifies an action, with a deeper hover state and white text.
Gold is a supporting accent, including text selection, rather than the default
button fill. Foreground is green-tinted ink; muted copy remains readable on
white and linen. The stronger control border distinguishes editable controls
from the softer borders around panels.

Success, warning, danger and information each pair a foreground with a tinted
surface. Badge and Alert select these semantic pairs; the brand accent never
decides operational status.

**The Text Carries Status Rule.** Color supplements a clear status label.
Pending intent must never be presented as a confirmed business result.

## Typography

Geist is provided by the root layout. Inputs retain body-sized text to support
mobile entry, while labels and buttons use a smaller operational voice. Buttons
use semibold weight. Geist Mono is available for genuine code and measurement,
not decorative headings. Money, counts and dates use tabular numerals at the
feature layer; primitives do not format business values.

Headings wrap with balanced lines. No dedicated display font or display scale
has been introduced by this primitive set.

## Layout

Use the spacing scale in frontmatter. Fields group labels, help, controls and
errors with the related spacing token. Controls have a minimum 44 px target;
Checkbox supplies that target in both axes through its wrapping label while retaining a
native checkbox. Textarea starts at 112 px high and remains vertically resizable.

Support a 360 px viewport without horizontal page overflow. Controls and panels
allow their content to shrink; page-level grids and responsive arrangements are
the responsibility of the consuming screen. No navigation or app shell is
established by these primitives.

## Elevation & Depth

Surfaces are flat. Card uses a thin border and white fill, with no shadow.
Alerts use tonal surfaces without a heavy accent stripe. The system does not
introduce decorative shadows, glass or gradients.

## Shapes

Controls, badges, alerts and panels share gently curved corners from the
approved radius tokens. Focus is a two-pixel outline with a three-pixel offset.
Native Select and Checkbox retain their browser interaction models. Reduced
motion shortens transitions and animations; forced-color focus uses the system
highlight color.

## Components

- **Button:** primary, secondary, ghost and danger variants. Defaults to
  `type="button"`; submission is explicit. Loading disables the control, marks
  it busy and retains the action label with an inline spinner. Disabled buttons
  are dimmed and show an unavailable cursor.
- **Input, Textarea and Select:** white controls with the stronger boundary;
  invalid state uses the danger border. Disabled controls use a muted surface.
  Input and Textarea also distinguish read-only state.
- **Field:** requires a stable unique ID and label. Its render callback supplies
  the control ID, required state, error state and descriptive associations;
  spread these onto the supplied Input, Textarea or Select. Error text belongs
  beside the control. Consuming forms own validation and error focus.
- **Checkbox:** a native checkbox inside a clickable label; supply meaningful
  label content. Do not nest its label inside another label.
- **Badge:** neutral, success, warning, danger and info tones. It is descriptive
  text, not an interactive chip or a live region.
- **Alert:** info, success, warning and danger tones; uses a polite status role
  by default. Reserve an explicit alert role for urgent interruptions.
- **Card:** a simple panel, without data access, permissions or navigation.
- **Separator:** a semantic horizontal rule using the quiet border token.
- **Skeleton:** static, muted and hidden from assistive technology. The
  consuming region supplies its own visible loading label and busy state.
- **Recovery forms:** compose the existing Field, Input, Button and Alert
  primitives in one narrow column. Keep stable polite feedback and urgent-error
  regions; move focus to a field error, the next code field or the completion
  message as the state changes. Disable submission and other transitions while
  a request is pending. Associate confirmation and code errors with their
  controls. Use an explicit completion state only after server acknowledgement;
  an interrupted response explains uncertainty and gives a safe next step.
  On completion, clear sensitive form state. Treat connection requirements and
  retry timing as visible guidance rather than silent disabled actions.

Import primitives directly. They forward native props and React 19 refs; use
the shared `cn` helper so consumer classes override conflicting recipe utilities.

## Do's and Don'ts

- Do use semantic tokens rather than copying palette values into screens.
- Do keep controls labeled and preserve visible keyboard focus.
- Do keep pending, stale, error and confirmed states distinct in words.
- Do use flat panels and tonal status surfaces.
- Don't add business rules, database calls or authorization to primitives.
- Don't use color alone to identify status or error.
- Don't remove a loading action's label or rely on a spinner alone.
- Don't describe source checks as rendered or real-device verification.
