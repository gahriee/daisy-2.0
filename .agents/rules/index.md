# Daisy Agent Rules

These rules apply to Daisy, a single-Owner boarding house and transient management system. It is one Next.js App Router application with React, strict TypeScript, Zod, Prisma and PostgreSQL, managed Better Auth, an offline-first encrypted PWA built on IndexedDB, and private object storage for photos.

Read every rule at session start as required by the root `AGENTS.md`, and recheck the relevant rules when work touches their scope. Read `docs/architecture/architecture.md` for the target design. References to future services or folders describe placement when needed, not a requirement to scaffold them now.

| Rule | Topic | Scope |
| --- | --- | --- |
| [1-coding-standards.md](1-coding-standards.md) | Next.js, React, TypeScript, validation, money and dates | Application and tests |
| [2-safety-constraints.md](2-safety-constraints.md) | Secrets, Owner and device authority, personal data, files and data integrity | Whole workspace |
| [3-file-boundaries.md](3-file-boundaries.md) | Routes, features, server services, offline modules and shared code | Source and documentation layout |
| [4-command-policy.md](4-command-policy.md) | Shell commands, dependencies, database and deployment changes | Local tools and external actions |
| [5-style-conventions.md](5-style-conventions.md) | Mobile-first interface, tokens, forms, status language and accessibility | UI and styles |
| [6-review-expectations.md](6-review-expectations.md) | Correctness, security, offline safety and review evidence | Changes and reviews |
| [7-verification-commands.md](7-verification-commands.md) | Scripts, targeted tests and result reporting | Verification and documentation |
| [8-nextjs-backend-standards.md](8-nextjs-backend-standards.md) | Route and service contracts, transactions, allocation, billing, limits and migrations | Server operations and database workflows |
| [9-offline-and-sync-standards.md](9-offline-and-sync-standards.md) | Service worker, encrypted local storage, outbox, sync protocol, conflicts and attachments | Offline runtime and sync |

Follow current human instructions and applicable higher-priority execution policies. Apply these rules together with `AGENTS.md`, and flag a material contradiction instead of silently replacing one requirement with another. These files do not authorize unrelated refactors, database resets, credential changes, deployments, publishing or external communications.
