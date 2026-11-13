---
version: 1
slug: "src-app-auth-reset-password-page-tsx"
primary_target: "src/app/auth/reset-password/page.tsx"
related_targets: ["src/components/features/auth/reset-password-form.tsx"]
---

# Owner password recovery

Mode: Operate. Primary target: /auth/reset-password.

## Direction contract

THESIS: Restore access to the existing Owner without registration or exposing recovery secrets.
OWN-WORLD: Existing Garden Ledger forest/linen, Geist, 8px controls; no new tokens or decorative assets.
STORY: Request an email code, enter it with a matching new password, acknowledge completion. Pending, rejected, throttled and unknown outcomes stay distinct.
FIRST VIEWPORT: A narrow phone-first column contains a Daisy home link, task heading, short explanation and one labeled email input above Send reset code. Later steps replace the email control with code/password fields.
FORM: Familiar single-column native form, code-first, directly extending approved primitives. No visual-world change.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification boundary

Source-only reviewer confirmed all three material fixes resolved: POST fallback, unknown-outcome recovery and independent email quotas. No browser, screenshot, UI tests or device verification per Owner preference. No raster assets. Backend tests use an explicitly opted-in isolated schema-only branch with mocked external Auth and fixture cleanup. Production activation pending approval.
