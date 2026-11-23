# Session Summary: Dashboard Links, Room Guest Capacity & Production DB Rollout

- **Date:** 11-23-26
- **Sequence:** 2
- **Agent:** gemini
- **Session ID:** 127c2021-bdaa-4f21-b6c4-a8fa2f0cbbab
- **Topic:** Dashboard card header link alignment, per-room guest capacity UI, and production database migration & seed

## Executive Summary

Aligned the dashboard's **Today's bookings & stays** and **Overdue & due invoices** header actions to `<ActionLink>` so all dashboard card headers share one consistent link design, exposed the existing `Room.capacity` column as a visible numeric field (**Max guests** / **Max occupants**) in `RoomForm` and surfaced guest limits in `RoomsWorkspace`, and executed explicitly authorized production Prisma migrations (`20261123060000_smtp_email_settings`, `20261123070000_business_location_pin`) and idempotent seeding on Neon production.

## Key Architectural & Technical Decisions

- **Dashboard Card Header Consistency:** Replaced `<Link className={buttonClasses({ variant: "secondary", size: "sm" })}>` for `Transients` and `Billing` in `TableCardHeader` `actions` with `<ActionLink>` to match `Analytics →`, `Reports →`, and the lower summary cards while keeping row-level `Open`/`Inspect` buttons as secondary buttons.
- **Per-Room Guest Capacity (`Room.capacity`):** Recommended and implemented guest capacity per room rather than per room type because `Room.capacity` already exists in PostgreSQL, is validated (`1–50`) and persisted end-to-end, directly powers `/book` availability and `"Up to X guests"` display, and supports different guest capacities among rooms sharing the same room type with zero schema migration.
- **Production Database Rollout:** Loaded `.env.prod` into the process environment (leaving `.env.local` untouched) targeting `ep-frosty-recipe-b33arw48.c-4.ap-southeast-1.aws.neon.tech` / `neondb`, verified pre-deploy `pnpm db:check`, applied all 19 migrations via `pnpm db:deploy`, ran `pnpm db:seed` (`seeded: true`, `storagePhotosEnabled: true`), and verified post-deploy `prisma migrate status` and `pnpm db:check`.

## Cumulative File Changes

- (modified) - `src/components/features/dashboard/dashboard-workspace.tsx` - Switched `Transients` and `Billing` table card header actions to `<ActionLink>`
- (modified) - `src/components/features/rooms/room-form.tsx` - Replaced hidden `capacity` input with editable numeric `Max guests` / `Max occupants` field and live Summary display
- (modified) - `src/components/features/rooms/rooms-workspace.tsx` - Displayed `Up to X guest(s)` in transient room directory mobile cards and desktop table

