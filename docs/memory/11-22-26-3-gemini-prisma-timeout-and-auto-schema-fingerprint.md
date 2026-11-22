# Session Summary: Prisma Timeout & Automatic Schema Fingerprint

- **Date:** 11-22-26
- **Sequence:** 3
- **Agent:** gemini
- **Session ID:** 4de9b698-d8e3-4ec7-976e-59ab36fa045c
- **Topic:** Prisma Interactive Transaction Timeout Fix, Automatic Schema Fingerprint & Pre-Push Formatting

## Executive Summary

Resolved production Vercel `P2028` interactive transaction timeouts on `/` (`getDashboardSnapshot`) by configuring `PrismaClient` `transactionOptions` (`maxWait: 10_000`, `timeout: 20_000`), replaced the stale hardcoded `PRISMA_CLIENT_SCHEMA_TAG` with an automatic schema fingerprint derived from the generated Prisma Client, and updated the `/git-push` workflow to always run `pnpm format` before pushing so CI formatting checks stay green.

## Key Architectural & Technical Decisions

- **Serverless transaction timeout (`src/server/db/client.ts`):** Set `transactionOptions: { maxWait: 10_000, timeout: 20_000 }` on `PrismaClient` so 24-query `RepeatableRead` dashboard/report snapshots and Neon Free scale-to-zero cold starts do not hit Prisma's default 5,000 ms timeout under cross-region latency.
- **Automatic schema fingerprint (`src/server/db/client.ts`):** Replaced manual `PRISMA_CLIENT_SCHEMA_TAG` with `PRISMA_SCHEMA_FINGERPRINT` computed once at module load from `Prisma.ModelName` and all `*ScalarFieldEnum` exports—keeping connection pooling intact across requests and split Next.js chunks while automatically invalidating stale dev HMR clients after `pnpm db:generate`.
- **Pre-push Prettier enforcement (`.agents/workflows/git-push.md`):** Added `pnpm format` + `pnpm format:check` to the `/git-push` workflow and formatted the 35 files flagged by GitHub Actions CI.

## Cumulative File Changes

- (modified) - `src/server/db/client.ts` - Added `transactionOptions` (`maxWait: 10_000`, `timeout: 20_000`) and replaced hardcoded `PRISMA_CLIENT_SCHEMA_TAG` with automatic `PRISMA_SCHEMA_FINGERPRINT`
- (modified) - `.agents/workflows/git-push.md` - Required running `pnpm format` and `pnpm format:check` before committing and pushing
- (modified) - 35 repository files formatted with `pnpm format` to satisfy CI `Check formatting`

