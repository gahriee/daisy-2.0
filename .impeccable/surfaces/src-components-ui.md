---
version: 1
slug: "src-components-ui"
primary_target: "src/components/ui"
related_targets: ["src/app/design-system/page.tsx","src/app/globals.css"]
---

# UI foundation and component reference

Mode: Read for /design-system; primitives support the Owner's Operate workflows.
Scope: src/components/ui, global tokens and /design-system. No business mutations or records.

## Direction contract

THESIS: A practical reference for composing Daisy screens, with native controls and legible state examples. Keep the reference organized by component purpose.

OWN-WORLD: Owner-approved Garden Ledger: forest #245747, linen #f7f6f0, white surfaces, muted gold, Geist and 8px corners. A restrained light palette supports phone use; status colors carry explicit text.

STORY: The reader identifies the brand tokens, inspects controls and feedback states, then tries keyboard input and native validation. Nothing persists or affects occupancy, billing or accounts.

FIRST VIEWPORT: A left-aligned title and short purpose line precede three labeled palette samples. The content is bounded, with wrapping rows and mobile-first stacked controls. Validation action lives with the form examples.

FORM: A linear component reference, chosen directly for this narrow approved task; no composition lottery. seed: none (user-pinned direction).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification boundary

Repository policy assigns rendered UI/device checks to the user. Review and verdict are source-only, with types, lint, production build, pure class-composition tests and numerical token contrast checks. No screenshots, DOM audits, UI tests, browser walkthrough or preview server. No raster assets.
