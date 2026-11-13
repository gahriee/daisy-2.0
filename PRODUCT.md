# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Daisy serves one Owner managing a Philippine boarding house and transient stays,
primarily from a phone with weak connectivity. Tenants and guests are records,
not signed-in users. Visitors use the public transient booking surface only.

## Product Purpose

Keep occupancy, balances, payments, maintenance and stay requests understandable
and traceable, with core Owner workflows usable on a provisioned offline device.

## Operating Context

The Owner manages rooms and beds, tenants, transient guests, allocations,
invoices, payments and proofs, maintenance, notices, reports and audit records.
Dates follow Asia/Manila and amounts are Philippine pesos with exact decimals.

## Capabilities and Constraints

The [architecture](docs/architecture/architecture.md) defines target behavior and
offline scope. The current checkout is a foundation, not a completed operational
system. Authentication, Neon PostgreSQL and private storage foundations exist;
Owner email-code password recovery is implemented at `/auth/reset-password`; the security migration and provider settings are active on the selected production branch. Live email delivery remains to be verified by the Owner. Business workflows, login UI and offline delivery remain planned. No staff accounts or
public sign-up. Public requests require Owner approval before confirmation.

## Brand Commitments

The name is Daisy. The Owner selected Garden Ledger: forest and linen, with
existing Geist typography. Visual tokens and component conventions live in
[DESIGN.md](DESIGN.md), grounded in the global stylesheet.

## Product Principles

- Preserve drafts and make recovery explicit.
- Distinguish local pending work from server-confirmed state.
- Keep financial and occupancy history traceable.
- Show unavailable or stale information honestly instead of implying zero.

## Accessibility & Inclusion

Support a 360 px mobile baseline, 44 px controls, keyboard navigation, visible
focus, associated form labels and errors, reduced motion and forced colors.
Status always includes text rather than relying only on color.
