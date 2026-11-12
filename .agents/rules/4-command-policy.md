# 4. Command Execution Policy

## 4.1 Working directory and routine commands

- Run application commands from the repository root using the execution tool's working-directory parameter. Do not rely on a previous shell's directory or change system environment settings to fix a project-local issue.
- Prefer `rg` for source searches. Keep read-only inspection separate from mutations when the target is uncertain.
- Use the scripts that exist in `package.json`. Rule 7 records the verification commands, and it and the root documentation must be updated when scripts change.
- Use pnpm and the committed lockfile. Install dependencies within the requested feature scope, with compatible versions and the correct dependency or devDependency category. Use `pnpm install --frozen-lockfile` to restore a checkout. Do not use `--force` or peer-dependency overrides to conceal a conflict.
- Prefer non-interactive commands. Do not pass guessed confirmation flags to unrelated tools or auto-confirm a destructive prompt. Stop for essential missing input instead of leaving a command hanging.
- On Windows, start background helpers with hidden windows, track processes started for the task, and stop or restart only those.

## 4.2 Filesystem and Git changes

- Inspect existing changes before editing. Preserve the user's work, and never reset, clean, stash away or overwrite unrelated modifications.
- Use explicit paths for removals and moves. Never recursively delete the repository, source, documentation or database storage as a convenience.
- If a recursive operation is genuinely needed, first verify that its resolved target stays inside the intended directory.
- Do not commit, push, publish, deploy or contact others unless the current user instruction or an explicitly invoked workflow authorizes it.

## 4.3 Database commands

- Generation and validation are distinct from database changes. A connection check issues a read-only query and does not prove migrations or runtime permissions are correct.
- Runtime uses the pooled connection URL. Migrations and CLI operations use the direct connection URL when provided. Verify the intended environment and database before applying anything, and report only host and database name, never credentials.
- Prefer additive, reviewed migrations and preserve applied migration history. Never edit a migration that has been applied.
- Do not run `prisma migrate reset`, `db push --force-reset`, `db push --accept-data-loss`, drop databases or tables, delete branches that hold data, or remove migration history without explicit authorization for that specific data-loss operation. A request to initialize or repair a connection does not authorize a wipe.
- Never invent Prisma's destructive-operation consent text or bypass its safeguards. When required, obtain the user's actual consent immediately before the command.
- Do not create a second database when the requested one exists. Do not alter passwords, role privileges, TLS verification or authentication rules to avoid requesting credentials.
- Integration tests run only against the dedicated test database or branch selected by an explicit opt-in setting. They must never run against production data.
- Never modify the provider-owned auth schema through application migrations.

## 4.4 Hosting, storage and scheduled jobs

- Deployment, secret changes, bucket creation or changes, cron schedule changes and DNS or domain changes are external actions. They require explicit authorization for the specific action and environment.
- Do not delete or overwrite objects in the private storage buckets, and do not change bucket access policy, as routine cleanup. Orphan cleanup runs only through the reviewed job that protects active intents.
- Verify free-tier allowances and platform limits against the current provider documentation before relying on them, and record meaningful decisions in the architecture document.

## 4.5 Secrets and tool permissions

- Never embed secrets in command arguments, output, shell history or generated reports when they can be read from the ignored environment.
- Use proper shell quoting and avoid interpolation that could execute backticks, `$()` or credential values. Prefer structured tool inputs or literal temporary files for multiline content.
- Respect sandbox and approval boundaries and use the supported escalation mechanism when necessary. Authorization for this project does not extend to other projects.
