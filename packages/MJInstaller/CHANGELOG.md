# @memberjunction/installer

## 6.1.0-edge.3

### Patch Changes

- 07cb22e: Fix `$`-sequence corruption in `String.prototype.replace` calls carrying runtime data (#3171).

  `replace(search, replacement)` treats `$$`, `$&`, `` $` ``, `$'` and `$1`–`$99` as metacharacters when `replacement` is a **string**. Every site below passed runtime data there, so a `$` in that data was silently executed rather than inserted. The `$&`/`` $` ``/`$'` forms are worse than value corruption: they splice surrounding text _into_ the value. All are fixed by passing a replacement **function**, whose return value is used literally.
  - **`@memberjunction/installer` — corrupted secrets (highest impact).** Re-running `mj install` syncs the root `.env` into MJAPI's. A DB password containing `$&` had the _stale_ MJAPI password spliced into it; ``$` `` spliced in the preceding `.env` line. The result was a wrong secret written to disk with no error, surfacing later as "MJAPI can't connect". Only the replace branch was affected — fresh installs (append branch, string concatenation) were always correct, which is why this survived. Also fixes the `newUserSetup` block (embeds user name/email) and the `mjRepoVersion` and Explorer `environment.ts` patchers.
  - **`@memberjunction/core` — rewritten RLS predicates.** `RowLevelSecurityFilterInfo.MarkupFilterText` substitutes user properties, magic-link scope and `{{Acting*}}` tokens into row-level-security filters. A `$` in any of them rewrote the predicate — the exact outcome the neighbouring `'`-escaping exists to prevent. This feeds `GetEffectiveRowFilterWhereClause`, used across RunView reads, Create and Update. Also fixes organic-key `Custom` normalization, which builds a SQL `WHERE` from a data value.
  - **`@memberjunction/generic-database-provider`, `@memberjunction/postgresql-dataprovider`** — end-user search terms substituted into `UserSearchParamFormatAPI` predicates, plus view-template inner SQL and PG identifier quoting. Also `QueryCompositionEngine.renameSQLIdentifier`, which rewrites CTE identifiers in composed queries: the search side was regex-escaped but the replacement side was not, so a `$` in a deconflicted CTE name (SQL Server bracketed and PG quoted identifiers both permit one) was expanded into the executed SQL.
  - **`@memberjunction/ai-prompts`, `@memberjunction/computer-use`, `@memberjunction/ai-vector-sync`, `@memberjunction/aiengine`, `@memberjunction/ai-agents`** — assistant prefill text (routinely contains `$$` for LaTeX or currency), computer-use goals/URLs/step summaries, embedding-document field values, and entity field values, all interpolated into prompts and templates.
  - **`@memberjunction/metadata-sync`** — parameter values in the debug SQL log.
  - **`@memberjunction/testing-engine`** — test input/expected/actual values into the LLM-judge prompt, and parameter values into `SQLValidatorOracle`'s generated SQL.
  - **`@memberjunction/sql-converter`** — the configured schema name substituted into emitted PostgreSQL view SQL, in both `ViewRule` and its previously-missed twin in `InsertRule`. The schema is now escaped on the _search_ side too: a `$` in it acted as an end-anchor, so the pattern matched nothing and the conversion silently emitted no rewrite.
  - **`@memberjunction/sql-parser`** — `restoreAliases` swaps generated aliases back to the caller's original bracketed identifiers. Two of its three branches used `split`/`join` and were already safe; the third expanded `$`-sequences, so `[a$'b]` spliced surrounding SQL into an identifier. The aliasing path fires precisely _because_ an identifier contains a non-word character, so the input that triggers aliasing is the input that corrupted the restore. Reached from the public `ToSQL()`.
  - **`@memberjunction/sqlserver-dataprovider`** — batch execution rewrites `@name` placeholders to `@q<N>_name`; the parameter name went into the `RegExp` unescaped, so a `$` in it prevented the rewrite entirely and mssql failed with "Must declare the scalar variable". Sibling of the PostgreSQL `escapeRegExp` fix below.
  - **`@memberjunction/react-linter`** — component data substituted into diagnostic messages.
  - **`@memberjunction/actions-bizapps-social`, `@memberjunction/ai-cli`** — hardened a numeric-only site; documented the AICLI JSON highlighter's `$1` back-references as intentional.

  Also fixes a **test-tooling safety defect** found while verifying the above on a clean database: `@memberjunction/testing-cli` loaded `.env` with `dotenv.config({ override: true })`, so a variable already set in the environment was overwritten. `DB_DATABASE=MJ_scratch mj test …` was silently discarded and the suite ran — **including mutation tests** — against whatever `.env` pointed at. That made the "one database per agent" rule unenforceable by environment variable and diverged from every other `mj` command (`migrate`, `codegen`, `sync push` all honour the environment). `override` is now dotenv's default `false`, so `.env` still fills in anything unset but an explicit value wins. Guarded by a unit test. **Note the inverse hazard when upgrading:** any environment that exports `DB_*` globally — a Docker image, a CI container, a stale `export` in a shell profile — now wins over `.env`, where `.env` used to be authoritative. If a `mj test` run suddenly targets an unexpected database, check the exported environment first; the CLI prints `config.dbDatabase: <name>` at startup.

  And an adjacent defect found while testing the above: `PostgreSQLDataProvider.quoteFieldNamesInToken` interpolated a field name into a `RegExp` **without escaping regex metacharacters**, so a column named `a.b` matched (and wrongly quoted) unrelated text like `axb`, and a column containing `$` was never matched at all — which had also made the replacement-side fix on that line unreachable. Field names are now escaped before interpolation.

  Also adds `.github/scripts/check-dynamic-replace.mjs`, a CI gate that flags `.replace()`/`.replaceAll()` whose replacement is neither a string literal nor a function. No existing lint rule covered this — the React `string-replace-all-occurrences` rule only ever inspects the _search_ argument. The gate is line-aware (only lines a change touches), since ~100 pre-existing sites remain and a bare identifier holding a function reference is indistinguishable from one holding a string; `--all` is available for auditing. Regression tests now push `$$`, `$&`, `` $` ``, `$'` and `$1` through each fixed path.

  Also fixes a **silently inert security check** found while verifying the above. `BaseTestDriver.Provider` fell back to `new Metadata() as unknown as IMetadataProvider`. `Metadata` is a facade that proxies a hand-maintained subset of members to the global provider, not a provider itself, and the cast is the only reason the compiler accepted it. Members it does not proxy read `undefined` — `RowLevelSecurityFilters` among them. The integration suite's `discoverTokenFilter` reads exactly that property to find a `{{UserID}}`-scoped filter, so it always found none: the `rls-isolation` RLS1/RLS2 token-substitution checks skipped-as-pass **on every database**, while the bundle reported green. There were 13 filters present, 5 of them `{{UserID}}`-scoped. The fallback now returns the global provider, which is what the getter's own doc comment always promised, and both checks now execute. A new `rls-isolation` check (RLS11) additionally pushes `$$`, `$&`, `` $` ``, `$'` and `$1` through a substituted user property and executes the resulting predicate, so the RLS half of this fix has live coverage rather than unit coverage alone.

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

## 5.49.0

## 5.48.0

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

## 5.43.0

### Patch Changes

- a95ef89: fix(open-app): `mj app` runtime-load + lifecycle correctness, plus installer/Explorer fixes

  The next-applicable subset of the OpenApp lifecycle audit — runtime-load and install/upgrade/remove correctness — across four packages:
  - **`@memberjunction/open-app-engine`.** Makes an installed Open App actually take effect and the lifecycle reversible/repeatable: installed server packages load at boot from `dynamicPackages.server[]` (and their generated GraphQL resolvers enter the live schema), and installed client packages are recorded in `dynamicPackages.client[]`; install status + reinstall correctness (npm-install failure leaves the app `Disabled` not falsely `Active`; an `Error`-state app is reinstallable; rollback drops only a schema we created; migrations baseline so a `V1` migration is never skipped); atomic upgrade dependency rewrite; and remove data-safety (DB-first ordering, co-tenant shared-schema guard, and metadata cleanup committed in one transaction on PostgreSQL). Also removes an app's **own `Application` row on uninstall** — an app's metadata-sync migration registers an `Application` (fixed UUID) grouping its entities; removal previously left it orphaned, so a reinstall's migration re-`INSERT`ed the same UUID and failed on `PK_Application_ID`. Removal now deletes an Application **wholly owned** by the removed schema (best-effort, after the atomic metadata commit; an Application that also groups other apps' entities, or one with user-added dependents, is left intact and reused). +unit tests.
  - **`@memberjunction/cli`.** The Open App client load mechanism now lives in distributed packages instead of bespoke MJExplorer files. `mj codegen manifest` gains `--open-app-client-bootstrap`: after generating the class-registrations manifest, it appends a managed, idempotent block of side-effect imports — one per installed Open App client package recorded in `dynamicPackages.client[]` — so the apps' `@RegisterClass` decorators run when the client bundle loads. The block is rebuilt on every run, so it tracks install/remove/enable/disable (each of which edits `dynamicPackages.client`). This lets MJExplorer drop its hand-written `ensure-open-app-bootstrap.mjs` script, the separate generated bootstrap file, and the extra `app.module.ts` import — keeping the app paper-thin (changes there don't auto-distribute like npm packages). +unit tests for the pure block transform.
  - **`@memberjunction/installer`.** The configure phase wrote a real `.env` (DB credentials, API keys) but emitted no `.gitignore`, so a freshly scaffolded project could commit secrets via `git init && git add .`. It now guarantees a `.gitignore` ignoring `.env`/`.env.*` (keeping `.env.example`); idempotent — appends only missing entries, never rewriting user lines.
  - **`@memberjunction/ng-explorer-app`.** Fixes an MJExplorer login crash where `MJNotificationService.Instance` was read before DI constructed the singleton (surfaced by magic-link's instant, no-redirect login) — the service is now injected into `MJExplorerAppComponent` so it's constructed before `handleLogin` runs.

## 5.42.0

### Minor Changes

- d4c12e5: Add MJ Claude Pack: a curated bundle of `CLAUDE.md` guidance, slash commands, and skills that ships with every MemberJunction install for users of Claude Code.

  New CLI commands:
  - `mj install:claude` — installs the pack into the current directory, preserving any user content above and below the managed CLAUDE.md markers. Supports `--from <path>` for offline installs and `--dry-run` to preview.
  - `mj update:claude` — refreshes the pack to the latest version published with the MJ major you're on. Supports `--check`, `--refresh-commands`, and `--refresh-skills` for selective updates.

  `mj doctor` gains a `claude-pack` check group (5 checks: managed-block presence, VERSION file, MANIFEST integrity, managed-file hash drift, SessionStart hook wired). "No pack installed" surfaces as info, not warn — the pack is optional.

  New public API:
  - `@memberjunction/installer` exports `FileSystemAdapter.ReadBytes()` for binary file reads (used by the pack doctor's hash checks).

  The pack is shipped via three paths: (1) auto-included in `mj install` and `mj bundle` via the `DistributionAssembler` sparse-checkout (replaces the legacy bootstrap-ZIP injection retired by PR #2725; opt out with `--no-claude-pack`), (2) installed onto an existing project via `mj install:claude` against a remote fetch from `raw.githubusercontent.com`, (3) refreshed via the SessionStart hook helper that nags when a newer version is available.

  **Two post-M10 follow-ups from end-to-end testing against a real distribution install:**
  - `mj install:claude` / `mj update:claude` now detect the MJ major (and full semver) by walking `apps/*/package.json` and `packages/*/package.json` when the root `package.json` is a workspace shell with no direct `@memberjunction/*` deps. Distribution-style installs put @mj deps under `apps/MJAPI` and `apps/MJExplorer`, so the previous root-only detection required every distribution-install user to pass `--major <N>` manually. Source-style monorepo checkouts and simple consumer projects are unaffected (they hit the root-level path first, exactly as before).
  - The `InstallResult` (and `--json` output, §7.5) now has a `notes: string[]` field alongside `warnings`. "Pack is up to date" and "Update available: v… → v…" report as `notes` (informational); `warnings` is reserved for states the caller may want to act on (no local pack, customized file would be overwritten, malformed managed block). Both arrays are always present, so downstream JSON consumers can iterate without optional-chaining.

- ded7a20: Install-pipeline + codegen-lib bug fixes surfaced during E2E testing.

  **Installer (`@memberjunction/installer`):**
  - **ConfigurePhase** — checkpoint resume no longer corrupts `.env` on restart. The resume path now reads-then-merges instead of re-writing empty defaults, so a partially-completed install can pick up where it left off without losing user-entered credentials.
  - **ConfigurePhase** — `syncEnvFieldsFromRoot()` now propagates `PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USERNAME` / `PG_PASSWORD` in addition to the SQL-Server-style `DB_*` keys, so a PostgreSQL install whose root `.env` uses PG-prefixed env vars keeps the MJAPI `.env` in sync on re-run.
  - **ConfigurePhase / DependencyPhase** — `tagToNpmVersion()` does strict semver validation and falls back to `latest` for non-semver tags, so branch refs like `feature/some-branch` no longer get passed to `npm install --tag` (npm interprets those as GitHub shorthand and ssh-clones).
  - **DatabaseProvisionPhase** — `mj-db-setup.sql` skips `CREATE LOGIN`, `CREATE USER`, `ALTER ROLE`, and `GRANT EXECUTE` when the configured DB user is a SQL Server built-in sysadmin (`sa`). `isBuiltInSysadmin()` guard added with 5 unit tests.
  - **MigratePhase** — migration timeout is now configurable via the `MJ_INSTALL_MIGRATE_TIMEOUT_MIN` env var, with an accurate error message on timeout.
  - **PreflightPhase + DatabaseProvisionPhase** — both phases now honor the actual `.env` target path during connectivity preflight, reading `PG_HOST` / `PG_PORT` first then falling back to `DB_HOST` / `DB_PORT`. Matches `codegen-lib`'s `DEFAULT_CODEGEN_CONFIG` precedence so a PG `.env` doesn't yield a false-negative "missing credentials" warning.
  - **models/InstallConfig** — accept user-facing `AuthProviderValues` key shapes (`ClientID` / `TenantID` for entra, `Domain` / `ClientID` for auth0) and add a legacy-alias compat layer so existing camelCase `install.config.json` files (`dbUrl` / `codeGenLogin` / `msalWebClientId` / etc.) keep working alongside the new PascalCase shape.

  **CodeGen-lib (`@memberjunction/codegen-lib`):**
  - **`Config/db-connection.ts`** — mssql config is now built lazily inside `MSSQLConnection()` instead of destructured at module load. The previous behavior captured empty defaults before `initializeConfig()` populated them, producing `"config.server property is required"` at codegen time. The exported mutable `sqlConfig` `let` was refactored into a `getSqlConfig()` accessor function (no exposed mutable storage). JSDoc explicitly clarifies the file is SQL-Server-only.
  - **`Config/config.ts`** — schema-validation failures in `initializeConfig()` now surface via `LogError`. A visible error beats a silent empty `configInfo` plus a downstream `"config.server"` crash.
  - **`runCodeGen.ts`** — single consumer updated to use the new `getSqlConfig()` accessor instead of importing `sqlConfig` directly.

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

### Patch Changes

- cd4f6e7: Remote distribution fetch for `mj install`, plus a new `mj bundle` command.
  - `mj install` (distribution mode) now blobless-sparse-checks-out the source at the resolved tag and assembles the distribution layout on demand, replacing the committed bootstrap zip.
  - New `mj bundle` builds a self-contained distribution zip for offline/air-gapped installs. `--with-migrations` ships both the SQL Server (`migrations/`) and PostgreSQL (`migrations-pg/`) trees by default; `--db-platform sqlserver|postgresql` narrows to one.
  - `mj migrate` fetches only the migration slice it needs. It first reads the database's current version from the Skyway history table and chooses accordingly: a **fresh** database gets `baseline + tail`, while an **existing** database is upgraded with the versioned migrations _after_ its current version (no baseline) — fixing a gap where upgrading a database that sits below a newer baseline silently skipped the intermediate migrations. The detected version is shown in the CLI output.
  - `mj migrate` also runs a TLS-aware connection preflight (also available standalone via `--check-connection`) that surfaces an actionable hint — e.g. set `DB_TRUST_SERVER_CERTIFICATE=1` for a self-signed cert — instead of a cryptic mid-migration error.
  - The installer-generated MJExplorer environment files are emitted `as const` so union fields keep their literal types.

## 5.38.0

## 5.37.0

## 5.36.0

## 5.35.0

## 5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

## 5.28.0

## 5.27.1

## 5.27.0

## 5.26.0

## 5.25.0

### Patch Changes

- f322a53: Add dual-mode installer supporting both distribution and monorepo installation methods.

## 5.24.0

## 5.23.0

### Patch Changes

- b589bef: Switch installer from distribution bootstrap ZIP to full monorepo source download. The installer now downloads the complete MemberJunction repository via GitHub's codeload CDN (not rate-limited) instead of the smaller bootstrap distribution ZIP.

## 5.22.0

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

## 5.17.0

## 5.16.0

## 5.15.0

## 5.14.0

## 5.13.0

## 5.12.0

### Patch Changes

- 714e42d: Add diagnostic report generation to `mj doctor` command. `--report` generates a basic diagnostic report (`mj-diagnostic-report.md`) with environment info, install state, and check results. `--report_extended` adds sanitized configuration file snapshots and service startup log capture (`mj-diagnostic-report-extended.md`). Passwords and secrets are automatically redacted. Also fixes process cleanup after service log capture and corrects key file detection for distribution installs.

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Patch Changes

- 1d3dec4: Add new headless, event-driven installer engine for MemberJunction. Features 9-phase install pipeline (preflight, scaffold, configure, database, platform compat, dependencies, migrate, codegen, smoke test), checkpoint/resume via state file, non-interactive CI/Docker mode (`--yes` + `--config`), `mj doctor` diagnostics, `--fast` optimistic mode, known-issue patching system, stdout-based service readiness detection, cross-platform Windows compatibility fixes, and 425 unit tests across 20 Vitest test files.
