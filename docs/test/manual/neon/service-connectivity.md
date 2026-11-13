# Neon service provisioning and live checks

- Last run: 2026-11-13 11:35:15 (UTC+8)
- Runtime: Windows, Node 26.13.1, Neon CLI 9.4.0, pnpm 10.28.2, Next.js 16.4.6
- Target: explicitly authorized production branch, AWS Singapore.
- Scope: operational connectivity only; no database fixtures, migrations or business writes.

## Results and criteria

| Command | Result | Verified criteria |
| --- | --- | --- |
| npm i -g neon@latest | PASS | CLI 9.4.0 installed |
| neon init | PASS with recovery | PowerShell service list quoted; pinned pnpm installed after child command not found; existing config preserved |
| neon deploy | PASS | Auth/Postgres utilized; private assets bucket created; 11 env vars pulled |
| npm run build | PASS | Webpack compiled, TypeScript passed, 5 pages generated; 3 app routes listed |
| pnpm db:check | PASS | Live pooled database connection; GMT is UTC-equivalent |
| node --conditions=react-server --import tsx scripts/neon-check.ts | PASS | Auth anonymous session endpoint; storage upload/signed download exact content; unsigned request denied; probe deleted and absence verified |
| node scripts/app-check.mjs | PASS | Home 200; session 200; private status 401; signup 404; foreign origin 403 |
| pnpm test:unit | PASS | 24 passed, 0 failed, 0 skipped; 6 files; 505 ms |
| pnpm lint and pnpm typecheck | PASS | No lint findings; route generation and strict TypeScript pass |
| npm run check:auth | FAILED / BLOCKED | Sign-in failed; Owner exists but has no password credential in Neon Auth |

## Run History and recovered failures

- Initial init: unquoted comma list became one space-separated service; quoted list fixed it.
- Initialization installed agent integrations, then child pnpm was missing. Installed pinned pnpm and retried with agent setup skipped. Browser authorization completed.
- First Webpack build compiled in 5.6 seconds but failed types: SDK POST requires route context. Added context; next build passed (compile 1.986 seconds, TypeScript 4.5 seconds, static generation 669 ms).
- Database diagnostic initially failed; SELECT 1 succeeded. Metadata query now casts PostgreSQL name to text and accepts GMT as UTC-equivalent; final check passed in 2.54 seconds. One diagnostic one-liner had a PowerShell quoting syntax error; no query ran in that attempt.
- An automatic approval review timed out for one combined check; the permitted single retry succeeded.
- Local HTTP attempt was blocked by sandbox EACCES; outside-sandbox request timed out against sandbox server. Restarted only the task server in the same network context; all 5 HTTP checks passed in 0.69 seconds and server stopped afterward.
- Provider peer warning remains: @neon/auth 0.8.2 resolves @better-fetch/fetch 1.3.2 while Better Auth 1.7.22 asks for 1.3.3. No overrides used. Anonymous live Auth passes; positive login must be checked before release.

## Cleanup and limitations

- Storage probe deletion verified. No database business records created or removed.
- Neon CLI/plugin setup installed the Neon plugin for Codex/VS Code, and skills/MCP for detected other agents; this was the requested init default. The existing Neon MCP/skills for this app were subsequently verified without duplicate installation.
- App login UI, recovery, application security audit, database-backed limiter, business uploads and Workers deployment validation remain outside this foundation.
- UI/keyboard/mobile/offline behavior has not been manually inspected; no UI changes in this task.

- Final npm run build after dependency cleanup: PASS; compilation 2.2 s, TypeScript 2.7 s, static generation 633 ms, exit 0. Owner binding is now configured; temporary verification credentials are still awaited.


- 2026-11-13 11:39:11 (UTC+8): final lint/typecheck/diff checks passed. Owner ID configured; temporary verification email/password not present. Successful-login/logout test not run and remains pending. Server is stopped; no verification passwords were read or removed.

### Owner login attempt: 2026-11-13 13:00:24 (UTC+8)

- Command: production next start plus node scripts/auth-check.mjs.
- Result: FAIL, exit 1, 3.08 seconds total; no Owner session established, so authorized status/logout assertions were not reached.
- Read-only diagnosis: inspected auth table metadata, then queried only booleans. owner_exists=true; password_configured=false. No password/hash or personal fields were selected.
- Temporary NEON_CHECK_EMAIL and NEON_CHECK_PASSWORD fields removed by test cleanup. Task server stopped; no account or database data changed.
- Blocker: entering a value in .env.local does not establish a Neon Auth password. Owner password setup is required before a retry.
