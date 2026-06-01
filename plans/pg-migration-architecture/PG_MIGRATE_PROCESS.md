# `/pg-migrate` Pipeline — Process Reference & Phase 4 Troubleshooting

Comprehensive reference for the `/pg-migrate` Claude Code skill. Covers what each phase does, how the orchestrator (local Claude) and CC-in-Docker collaborate, what artifacts each phase produces, and — most importantly — the **Phase 4 browser-install workaround** that recurs whenever the Playwright installer hangs on `__dirlock` contention inside the workbench container.

> **Skill source:** `.claude/commands/pg-migrate.md` (the actual prompt the user invokes via `/pg-migrate`).
> **Slash command:** `/pg-migrate` (no arguments — orchestrator infers the target version from the latest migration file in `migrations/v5/`).

---

## TL;DR

`/pg-migrate` converts new SQL Server v5 migrations to PostgreSQL using the rule-based SQLConverter, validates them against a fresh PG database via Skyway, runs schema parity checks vs a fresh SQL Server build, exercises the full app stack (MJAPI + MJExplorer + Auth0 login + CRUD + audit-tracking) headlessly inside Docker, and produces a comprehensive parity report. All heavy work runs inside the `claude-dev` workbench container via a nested CC instance with `--dangerously-skip-permissions`; the host-side orchestrator only manages Docker, dispatches task prompts, polls for completion, and syncs results back to the host repo.

The pipeline is idempotent — re-running only processes migrations still missing PG counterparts and re-validates the rest. Phases 3, 4, and 4b always run even when no new conversions are needed.

---

## Pipeline Topology

```
+-----------------------------------------------------------------------+
|  Host (local Claude Code)                                             |
|  -----------------------                                              |
|  - Manages docker compose lifecycle (workbench up/down)               |
|  - Discovers missing migrations (Phase 1, host-side file diff)        |
|  - Dispatches per-phase task prompts to CC in Docker                  |
|  - Polls /tmp/result-phaseN.txt for __DONE__ marker                   |
|  - Reads phaseN-result.json + phaseN-summary.txt from container       |
|  - Phase 5: docker cp results back, write PG_MIGRATION_REPORT.md      |
|  - NEVER edits .pg.sql files, NEVER touches SQL or DBs directly       |
+-------------------------+---------------------------------------------+
                          | docker exec / docker cp
                          v
+-----------------------------------------------------------------------+
|  claude-dev container                                                 |
|  --------------------                                                 |
|  - Receives each phase task as a fully self-contained prompt          |
|  - Runs `mj sql-convert` to convert .sql -> .pg.sql                   |
|  - Fixes SQLConverter rules when conversion produces TODO comments    |
|  - Applies migrations to PG via Skyway (`mj migrate`)                 |
|  - Drives MJAPI + MJExplorer + Playwright tests                       |
|  - Writes phaseN-result.json + phaseN-summary.txt to /tmp             |
|  - Emits `PIPELINE_DONE` then `__DONE__` to signal completion         |
+-------------------------+---------------------------------------------+
                          | TCP / shared volumes
                          v
       +------------------+------------------+------------------+
       |  sql-claude      |  postgres-claude |  MJAPI :4000     |
       |  SQL Server 2022 |  PostgreSQL 17   |  + MJExplorer    |
       |  port 1433       |  port 5432       |  :4200 (in-ctr)  |
       +------------------+------------------+------------------+
```

The orchestrator and CC-in-Docker have **no shared memory** between phases. Every dispatched task prompt is fully self-contained — file paths, exact commands, expected outcomes, target database name. The orchestrator substitutes `{{PG_DB_NAME}}` (e.g. `MJ_PG_5_37_0`) and `{{MISSING_FILES_LIST}}` before sending.

---

## Versioned Database Naming

All PostgreSQL databases follow `MJ_PG_X_Y_Z`. The version comes from the latest migration filename's `v<major>.<minor>` tag — e.g. `V202605241136__v5.37.x__Metadata_Sync.sql` produces `MJ_PG_5_37_0`. The orchestrator derives `PG_DB_NAME` from the highest-sorted migration filename across both `migrations/v5/*.sql` and `migrations-pg/v5/*.pg.sql` / `*.pg-only.sql`.

Other databases used by the pipeline:

| Database              | Purpose                                                                                 | Lifecycle                     |
|----------------------|------------------------------------------------------------------------------------------|-------------------------------|
| `MJ_PG_<X>_<Y>_0`     | Primary versioned PG DB used by Phases 3/4/4b for parity, smoke, and CRUD tests          | Dropped and recreated each run|
| `MJ_PG_Migrate_Test`  | Scratch PG DB used by Phase 2 for per-migration validation                               | Dropped and recreated each run|
| `MJ_SQL_Compare`      | Fresh SQL Server build used by Phase 3 for schema parity comparison                      | Dropped and recreated each run|

---

## Phase-by-Phase Walkthrough

### Phase 0 — Environment Setup

Brings up the workbench (`docker compose --profile postgres up -d --build`), waits for both SQL Server and PostgreSQL to be healthy, syncs the repo inside Docker on a dedicated branch `pg-migrate/<source-branch>` (keeps the host branch clean), verifies CC-in-Docker is authenticated (`claude --dangerously-skip-permissions -p` returns `AUTH_OK`), and builds the required packages (`@memberjunction/sql-converter`, `@memberjunction/cli`, `@memberjunction/sqlglot-ts`, `@memberjunction/sql-dialect`) via Turbo.

Hard gates that stop the pipeline:
- Docker daemon not running
- CC-in-Docker not authenticated — user must run `docker exec -it claude-dev claude` and complete OAuth, then re-run `/pg-migrate`
- Either DB container fails health check
- Build fails

If `/workspace/MJ` already exists in the container, the entrypoint just fetches `origin` and hard-resets to the host's current SHA before checking out the `pg-migrate/...` work branch.

### Phase 1 — Discovery (host-side)

A one-line `comm -23` against sorted filenames in `migrations/v5/` and `migrations-pg/v5/` produces the list of SQL Server migrations with no PG counterpart. Two intentional exclusions:

1. **Pre-baseline migrations** — `V202602131500__v5.0.x__Entity_Name_Normalization_And_ClassName_Prefix_Fix.sql` and `V202602141421__v5.0.x__Add_AllowMultipleSubtypes_to_Entity.sql` pre-date the PG baseline and must NEVER be converted. They're filtered out before the list is passed to Phase 2. On SQL Server these were applied to existing databases before the baseline was created and are recorded in `flyway_schema_history`, so the resolver sees them as applied. On PG they were never applied — PG support starts at the baseline. Creating `.pg.sql` files for them causes out-of-order classification errors on every PG migrate.

2. **`.pg-only.sql` files** — these are PG-specific patches with no SQL Server source (e.g. `PlatformVariants` columns added only to PG). They're preserved as-is, never regenerated.

> **Memory note:** The orchestrator runs with project memory that records these pre-baseline exclusions and the recurring Phase 4 workaround. Memory entries are per-user (in `~/.claude/projects/.../memory/`), not checked into the repo. This doc captures the same rules as repo-level reference so they survive across users and machines.

If zero new migrations are missing, the orchestrator skips Phase 2 and goes straight to Phase 3 — but **Phases 3, 4, and 4b always run** regardless, because they revalidate the full migration stack end-to-end.

### Phase 2 — Conversion + Validation (delegated to CC-in-Docker)

For each missing migration, CC-in-Docker:

1. **Converts** via `npx mj sql-convert <file>.sql --from tsql --to postgres --output ...pg.sql --schema __mj --verbose`. The converter is rule-based (`packages/SQLConverter/src/rules/`) — each rule handles one T-SQL construct (CREATE FUNCTION, ALTER TABLE, INSERT VALUES, IF EXISTS, EXEC sp_addextendedproperty, DECLARE/SET/EXEC blocks, etc.) and emits PG-equivalent SQL.

2. **Inspects** the output for `-- TODO:` comments. **Any TODO is a hard fail** — it means a SQL pattern wasn't recognized and was silently commented out instead of converted. CC must locate the rule producing the TODO, fix it (or write a new rule), rebuild the SQLConverter, re-run unit tests, and re-convert. Never accept TODO comments.

3. **Tests** by dropping `MJ_PG_Migrate_Test`, recreating it, bootstrapping the `cdp_*` roles that GRANT statements target (Skyway doesn't create roles automatically), then running ALL `migrations-pg/v5/B*.pg.sql + V*.pg.sql + V*.pg-only.sql` files in order via `npx mj migrate --verbose`. This exercises the same Skyway code path real installs use, including placeholder substitution and history tracking.

4. **Fixes the toolchain on failure** — never edits the converted output. After up to 3 attempts on the same pattern, marks the file as `MANUAL_REVIEW_NEEDED` and continues. Toolchain changes (new rules, fixed regexes, new statement-type classifications) live under `packages/SQLConverter/src/rules/` and are copied back to the host in Phase 5.

5. **Records** per-file `{name, status, attempts, error, toolchainFixes[]}` in `/tmp/phase2-result.json` plus a human-readable `/tmp/phase2-summary.txt`.

After all files: CC verifies zero TODO comments remain (`grep -c "TODO:" migrations-pg/v5/*.pg.sql`). The orchestrator independently re-runs this check after reading the result file. **Phase 3 cannot start until zero TODOs is confirmed.**

### Phase 3 — Schema Parity Comparison

Both DBs are built from scratch via Skyway (`mj migrate`):

- `MJ_SQL_Compare` — fresh SQL Server, all `migrations/v5/V*.sql` applied
- `MJ_PG_<X>_<Y>_0` — fresh PostgreSQL, all `migrations-pg/v5/B*.pg.sql + V*.pg.sql + V*.pg-only.sql` applied

CC then runs `INFORMATION_SCHEMA` queries on both sides and compares table count, view count, routine count, foreign-key count, per-table column counts, and identifies tables/views present on only one side. Results saved to `/tmp/phase3-result.json` + `/tmp/phase3-summary.txt`.

Expected legitimate differences:
- **Routines:** PG has +N because each function overload registers as a separate `ROUTINE` (SS uses default-parameter sprocs that register as one)
- **Column mismatches:** the 3 well-known `PlatformVariants` columns (`Query`, `RowLevelSecurityFilter`, `UserView`) added by `V202602151201__v5.0.x__Add_PlatformVariants_Columns.pg-only.sql`

Any other mismatch indicates a real bug.

### Phase 4 — Full-Stack Smoke Tests

Validates the **complete application stack** against PG:

#### Tier 1 — API (5 tests via GraphQL/curl)
- `API_INTROSPECTION` — endpoint reachable (introspection disabled in production is expected)
- `API_ENTITY_METADATA` — `AllMJEntities` returns the expected entity count
- `API_RUN_VIEW` — `RunDynamicView({EntityName:'MJ: Actions'})` returns >0 rows
- `API_LIST_ENTITIES` — full entity list
- `API_MULTI_VIEW` — multiple entity types (Users, Entities, Applications, AI Models)

> Note the **`MJ:` prefix** on entity names — v5 PG migrations use the `MJ:` prefix for core entities (`MJ: Users`, not `Users`). Older entities don't.

#### Tier 2 — Browser (7 tests via Playwright + Auth0)
- `BROWSER_LOAD` / `BROWSER_LOGIN` / `BROWSER_DATA_EXPLORER` / `BROWSER_ENTITY_LIST` / `BROWSER_OPEN_RECORD` / `BROWSER_ADMIN` / `BROWSER_CONSOLE`

**No SKIP statuses allowed** — every test must result in PASS or FAIL. The orchestrator rejects any phase 4 result with SKIPs and re-dispatches with explicit instructions to complete them.

Credentials are `da-robot-tester@bluecypress.io` / `!!SoDamnSecureItHurt$`. CC reads them from the workbench `.env` (`TEST_AUTH0_*` keys). The Auth0 tenant must be `bluecypress-dev.us.auth0.com` and Explorer must run with `--configuration=development` to swap `environment.ts` → `environment.development.ts` (which has the dev Auth0 config).

#### See: [Phase 4 Browser-Install Workaround](#phase-4-browser-install-workaround) — this is where the recurring problem lives.

### Phase 4b — Deep CRUD Workflow

Always runs after Phase 4. Phase 4 validates rendering; Phase 4b validates **data mutation, audit-tracking, and round-trip correctness**.

9 sequential tests:
1. `CRUD_LOGIN`
2. `CRUD_NAVIGATE_TO_ACTIONS`
3. `CRUD_OPEN_ACTION_RECORD`
4. `CRUD_NAVIGATE_TO_CATEGORY`
5. `CRUD_EDIT_CATEGORY_NAME` — append `" - PG Test"` to an ActionCategory.Name and save
6. `CRUD_VERIFY_NAME_CHANGED` — DB query confirms the new value
7. `CRUD_CHECK_RECORD_CHANGES` — Record Changes panel shows the change with old/new values
8. `CRUD_REVERT_NAME` — restore the original, leaving no test garbage
9. `CRUD_CONSOLE_CHECK` — no critical JS errors

The save exercises the **full stack**: JWT → GraphQL resolver → `BaseEntity.Save()` → `spUpdateActionCategory` stored procedure → PG UPDATE → RecordChange auto-tracking. SQL queries verify the writes landed and `__mj_UpdatedAt` is recent. The orchestrator validates `recordChangeDetected: true` and `categoryEdited.reverted: true` before proceeding.

When the UI selector for the Name input can't be found (a known flake — Angular form layouts vary), CC may fall back to calling the `UpdateMJActionCategory` GraphQL mutation directly with the JWT it captured. This exercises the same server-side code path and is considered a valid workaround.

### Phase 5 — Report + File Sync (host-side)

The orchestrator:

1. `docker cp` only the **new** `.pg.sql` files and the **changed** SQLConverter rule files back to the host. Never overwrites pre-existing `.pg.sql` files unless they were converted this run.
2. Writes the comprehensive report to `migrations-pg/PG_MIGRATION_REPORT.md` (overwrites the previous version — the report is per-run, not cumulative).
3. Prints a concise chat summary with passes, failures, schema parity verdict, and the path to the full report.
4. **Does not commit, does not push.** The user reviews and explicitly asks to commit/PR.

---

## Wide-Entity CRUD Sprocs (JSON-arg Workaround)

When `/pg-migrate` encounters a CRUD sproc with **more than 100 parameters**, the converter cannot emit it as a typed-argument PG function — PostgreSQL caps `FUNC_MAX_ARGS` at 100 (SQL Server allows 2100). The MemberJunction tolerant-signature pattern pairs every nullable column with a `<col>_Clear` companion, which doubles parameter count and pushes wide entities like `MJ: AI Agents` and `MJ: AI Prompt Runs` past the limit:

|                          | Args | Notes                                               |
|--------------------------|-----:|-----------------------------------------------------|
| `spCreateAIAgent`        | 101  | Wide enough to clip the limit by one                |
| `spUpdateAIAgent`        | 101  | Same                                                |
| `spCreateAIPromptRun`    | 154  | Comfortably over                                    |
| `spUpdateAIPromptRun`    | 154  | Same                                                |

The MJ runtime already invokes these procs in **single-JSONB-argument shape** — `proc(p_data JSONB)` with key-presence semantics (key absent → leave unchanged, `key=null` → clear, `key=value` → set). `PostgreSQLCodeGenProvider` and `crudSprocFieldRules.useJsonArgShape()` emit the same shape natively. The pipeline's job is to make the converter agree on PG.

### What the converter does

Three SQLConverter rules collaborate:

1. **`ProcedureToFunctionRule.ts`** — when a `CREATE PROCEDURE` would exceed 100 parameters, it **SKIPs the typed-arg definition** (it would be invalid PG SQL anyway) and emits a comment breadcrumb pointing at the pg-only patch that supplies the JSON-arg definition.
2. **`WideJsonArgProcs.ts`** (skill-added during v5.38 run) — small lookup module: `isWideJsonArgProc(name)` + `buildWideProcJsonArg(name, paramPairs)`. The known set is hardcoded: `spCreateAIAgent`, `spUpdateAIAgent`, `spCreateAIPromptRun`, `spUpdateAIPromptRun`. Add new entries here when a future entity grows wide.
3. **`ExecBlockRule.ts` / call-site rewriter** — when the converter emits a call site like `EXEC spUpdateAIAgent @A := v, @A_Clear := 1, ...`, the wide-proc helper rewrites it to `PERFORM spUpdateAIAgent(jsonb_build_object('A', v, 'A__clear', TRUE, ...))`. There's a second-order cap: `jsonb_build_object` itself takes pairs of varargs and would also hit the 100-arg limit, so the rewriter **chunks > 50 pairs across multiple `jsonb_build_object` calls combined with `||`**.

### The pg-only patch

`migrations-pg/v5/V202605241138__v5.38.x__Wide_CRUD_Sprocs_JSON_Arg_Shape.pg-only.sql` carries the four wide-proc JSON-arg function bodies verbatim — lifted from CodeGen output (`V202605071645__v5.33.x__Force_Regen_All_CRUD_Sprocs_JSON_Arg_Shape`). It's versioned **one minute after the v5.37 baseline** (`B202605241137`) so Skyway runs it immediately after baseline load, before any v5.38 V-migration that calls these procs. `CREATE OR REPLACE` makes it a harmless no-op on databases that already received the v5.33 patch.

### Symptoms a new wide proc has appeared

When `mj migrate` (Phase 2 step 3) fails with errors like:

- `function spCreateXxx does not exist`
- `function spUpdateXxx does not match expected signature`
- `cannot pass more than 100 arguments to a function`

…and the entity in question has many nullable columns (visible as paired `<col>` / `<col>_Clear` parameters in the source T-SQL), you've discovered a new wide entity. Confirm by counting parameters in the T-SQL `CREATE PROCEDURE`:

```bash
grep -c '^\s*@' migrations/v5/V<timestamp>__v5.X.x__<file>.sql
```

If the count exceeds ~95, it's almost certainly going to clip the limit when `_Clear` companions are added.

### Recovery (the sequence that worked on v5.38)

1. **Add the proc name to `WideJsonArgProcs.ts`** — extend the known-set tuple. Rebuild SQLConverter (`cd packages/SQLConverter && npm run build`). Run the unit tests (`npm run test`) — they should still pass.

2. **Re-convert the affected migration**. The `ProcedureToFunctionRule` will now SKIP the typed-arg definition and the call-site rewriter will emit JSONB calls.

3. **Author (or extend) the pg-only patch** — copy the JSON-arg function body for the new wide proc from CodeGen output. If a `Wide_CRUD_Sprocs_JSON_Arg_Shape.pg-only.sql` already exists for the current minor, append the new function body there. Otherwise create a new pg-only file versioned one minute after the most recent baseline (the same pattern as `V202605241138`).

4. **Re-run Phase 2** for that migration. It should now apply cleanly. The wide proc exists via the pg-only patch; the migration's call sites resolve to it.

5. **Re-run Phase 3 parity**. The routine count will rise by 1 on PG (the new JSON-arg function). This is an expected legitimate difference and should be documented in the Phase 3 report's "Expected differences" list.

### Why the patch lives in `migrations-pg/v5/`, not in the converter

The function body for a JSON-arg sproc encodes business logic (which fields to upsert, validation, RecordChange triggering) that's CodeGen output, not converter logic. Embedding 4 × ~400-line PL/pgSQL bodies inside a TypeScript converter rule would be both an enormous one-off and brittle to changes in CodeGen. Instead the converter does the **classification + call-site rewriting** (mechanical), and the **definitions are CodeGen artifacts** committed as a pg-only patch. The two concerns evolve independently: a new wide entity needs an addition to `WideJsonArgProcs.ts` *and* an addition to the pg-only patch.

### Related context

- **The runtime side** — see `packages/GenericDatabaseProvider/src/crudSprocFieldRules.ts` for `useJsonArgShape()` and `packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts` for the PG codegen path. Both pre-date the converter rule and define the canonical shape.
- **Architectural rationale** — see [`SELF_HEAL_MIGRATION_CHANGES.md`](SELF_HEAL_MIGRATION_CHANGES.md) §`FUNC_MAX_ARGS` for the theory of JSON-arg shape vs. typed-arg shape and the broad-rule `_Clear` companion semantics.
- **Operational rule** — the wide-proc set grows over time as new entities cross 100 params. There's no automatic detection for "this is now wide" beyond the param count. Anyone adding new fields to a near-100-arg entity should check before merging the T-SQL migration.

---

## Phase 4 Browser-Install Workaround

This is the most frequent failure mode of `/pg-migrate`. If it happens, do this — don't rediscover the workaround.

### Symptoms

- `npx playwright install chromium` (or `playwright-cli install-browser chrome-for-testing`) sits at 99% CPU or `epoll_wait` for 15-20+ minutes.
- `/root/.cache/ms-playwright/chromium-*/chrome-linux/chrome` IS present on disk (full ~428 MB extracted) — extraction actually finished.
- `/root/.cache/ms-playwright/__dirlock/` exists but is empty (no lock file).
- `/proc/<PID>/net/tcp` shows ESTABLISHED connections (`st=01`) to Anthropic (`10.104.79.160:443`) or playwright CDN with **`tr 02`** retransmit flags and increasingly large retransmit counters (`tm->when` in `0x1000+` range = thousands of attempts).
- Multiple `playwright-cli install-browser` retries stack up under the parent CC; cache size doesn't change but processes keep spawning.

The dirlock + installer process is what's hung. The browser binary itself is fine the moment extraction completes.

### Diagnostic

```bash
# Are CC and the playwright installer still running?
docker exec claude-dev bash -c "ps -ef | grep -E '(claude --dangerously|playwright|oopBrowserDownload)' | grep -v grep"

# Is the Chromium binary actually present?
docker exec claude-dev bash -c "ls -la /root/.cache/ms-playwright/chromium*/chrome-linux/chrome 2>/dev/null"

# What is the CC process actually doing? Look for retransmit pattern.
docker exec claude-dev bash -c "cat /proc/<PID>/net/tcp | awk 'NR==1 || (\$4==\"01\" && \$6 ~ /^02:/)' | head -10"
#   tr=02  -> retransmit timer active
#   tm->when in hex; 0x1000+ means thousands of retransmit attempts (effectively dead socket)
```

The classic signature: **`st 01` (ESTABLISHED) + `tr 02` (retransmit) + huge `tm->when`** to Anthropic IPs means CC's outbound API socket is dead but the kernel hasn't given up yet.

### Workaround (the sequence that worked on v5.36 and v5.37)

> **NEVER kill processes without explicit user approval.** Each termination is a separate decision — a prior "yes, kill it" does NOT carry forward to the next time something looks similar. When the user authorizes the specific kill, proceed.

#### Step 1: Kill hung installer processes (with user approval)

```bash
docker exec claude-dev bash -c "kill <pid_of_oopBrowserDownload> <pid_of_playwright-cli_install> 2>/dev/null; sleep 2"
# Or, broader: pkill -f 'playwright-cli|oopBrowserDownload' (still requires user approval each time)
```

If CC itself (`claude --dangerously-skip-permissions -p`) is also hung on retransmits, kill it too. The host-side poll loop watching for `__DONE__` will keep waiting harmlessly until you re-dispatch.

#### Step 2: Reap dirlock + stale extractions

```bash
docker exec claude-dev bash -c "
  rm -rf /root/.cache/ms-playwright/chromium-1208 \
         /root/.cache/ms-playwright/chromium-1224 \
         /root/.cache/ms-playwright/__dirlock"
```

Substitute the actual `chromium-*` directory numbers — they vary by playwright version.

#### Step 3: Re-run install with explicit cache path

```bash
docker exec claude-dev bash -c "
  PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright \
  npx playwright install chromium chromium-headless-shell 2>&1 | tail -20"
```

This typically completes cleanly in ~7 minutes the second time. Run it as a host-side background task with notification when done so you can detect immediately if it stalls again.

If you only need headless, install just `chromium-headless-shell`. But the v5.36/v5.37 runs both showed that **full `chromium`** handles Auth0's interactive multi-step login more reliably than `headless-shell`. Install both; choose at script time.

#### Step 4: Skip the CLI wrapper — use `playwright-core` directly

The decisive step. The Playwright CLI (`playwright-cli`) hardcodes `chrome-for-testing` and refuses `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` overrides — it will try to reinstall regardless. Going through `playwright-core` directly with an explicit `executablePath` sidesteps the wrapper layer entirely.

Update the Phase 4 task prompt to include explicit guidance:

```text
## CRITICAL: BROWSER IS ALREADY INSTALLED — DO NOT RE-INSTALL

Playwright Chromium binaries are ALREADY installed at:
- Full Chrome:      /root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome
- Headless shell:   /root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-linux/headless_shell

DO NOT run `npx playwright install`, `npx playwright-cli install-browser`, or any installer.

Write your browser tests as a single node script using `playwright-core` directly:

  import { chromium } from 'playwright-core';
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
```

Substitute the actual installed Chromium version path. The launched browser uses the binary on disk directly — no CLI, no installer, no dirlock involvement.

#### Step 5: Redispatch Phase 4

Once Chromium is verified on disk and the prompt has the playwright-core guidance, redispatch the Phase 4 task. CC will run the test script directly.

### Why this works

The browser binary is fine the moment extraction finishes; the lock/install bookkeeping is what's broken. Launching via `playwright-core` with `executablePath` skips the wrapper layer that's stuck on dirlock contention.

The TCP retransmits to Anthropic that block CC's API calls are a separate but adjacent problem — once a hung child process holds up CC's tool-use loop, CC eventually times out, retries with a fresh subprocess, and that subprocess hits the same dirlock. The retry loop never converges. Killing the installer + Anthropic-pinned CC together breaks the cycle.

### Related operational rules (recorded in orchestrator memory, summarized here)

These rules live in the orchestrator's project memory and shape how it handles the workaround. They aren't part of the repo (memory is per-user, in `~/.claude/projects/.../memory/`), but the substance is:

- **Phase 4 browser-install recipe** — the v5.36 run hit the same bug and resolved it via steps 1-5 above. The recipe is identical and proven on two consecutive monthly upgrade runs (v5.36 → v5.37).
- **TCP retransmit hang signature** — `st 01` + `tr 02` + large `tm->when` to Anthropic IPs is the canonical diagnostic. Use `/proc/<PID>/net/tcp` for the read-out.
- **Never terminate without per-instance approval** — even if a kill was approved 5 minutes ago for an apparently identical situation. Ask each time.

---

## Common Failure Modes & Recovery

| Symptom                                                         | Likely cause                                                                                  | Fix                                                                                                                                              |
|-----------------------------------------------------------------|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `AUTH_OK` not returned by CC-in-Docker                          | Auth token missing or expired                                                                | `docker exec -it claude-dev claude` -> OAuth login -> re-run `/pg-migrate`                                                                       |
| Phase 0 build fails                                             | Stale `node_modules` after dependency bump                                                   | `docker exec claude-dev bash -c "cd /workspace/MJ && npm install"` then re-run build                                                              |
| Phase 2 emits `-- TODO:` comments                               | SQLConverter rule missing for a T-SQL pattern                                                | CC writes/extends rule under `packages/SQLConverter/src/rules/`, rebuilds, re-converts. Pipeline blocks at this gate until zero TODOs.            |
| Phase 2 migration fails on PG with FK violation                 | Conversion correct but seed data missing                                                     | Often pre-existing — document in report's "Known migration errors" section. Don't block.                                                          |
| Phase 3 column mismatches on table not in `PlatformVariants` set| Real conversion bug                                                                          | Inspect the generated `.pg.sql` for the affected table, locate the responsible rule, fix the rule, re-convert that one file.                      |
| Phase 4 browser install hangs                                   | playwright CLI `__dirlock` contention                                                        | **[Phase 4 Browser-Install Workaround](#phase-4-browser-install-workaround)** above.                                                              |
| Phase 4 `BROWSER_LOGIN` fails                                   | (a) Auth0 form filling missed a Continue button (b) Browser crashed (c) Wrong env config     | CC usually retries on its own. If persistent, switch from `headless_shell` to full `chromium` and verify Explorer was started with `--configuration=development`. |
| Phase 4 status = `SKIP` for any test                            | CC bailed instead of completing                                                              | Orchestrator validation rejects the result automatically and redispatches with explicit "SKIP is not allowed" emphasis.                            |
| Phase 4b `CRUD_EDIT_CATEGORY_NAME` fails — Name input not found | UI selector miss                                                                             | Fallback: call `UpdateMJActionCategory` GraphQL mutation directly with the captured JWT. Same server-side code path.                              |
| Phase 4b `recordChangeDetected: false`                          | RecordChange trigger missing or broken on PG                                                 | Investigate the trigger function for the entity. This is a real bug, not a test flake.                                                            |
| Phase 5 file sync produces nested directories                   | Used `docker cp dir/ host/dir/` instead of `docker cp dir host/`                             | Copy individual files instead of directories (the skill prompts CC to do this).                                                                   |

---

## Quality Gates (must hold to ship)

1. **Zero `-- TODO:` comments** in any `migrations-pg/v5/*.pg.sql` file (orchestrator validates after Phase 2).
2. **Migrations apply cleanly** to a fresh PG database via Skyway (no errors).
3. **Schema parity** — Tables, Views, FKs all match SS. Routine count diverges by design (PG overloads). Column mismatches only in the documented `PlatformVariants` set.
4. **Phase 4 — 12/12 PASS** with `loginSucceeded: true` and zero SKIPs.
5. **Phase 4b — 9/9 PASS** with `recordChangeDetected: true` and `categoryEdited.reverted: true`.
6. **SQLConverter unit tests pass** after any rule fix (run by CC before declaring Phase 2 done).

If any gate fails, `/pg-migrate` documents the failure in the report's "Action Items" section and stops short of declaring success. User reviews and decides whether to ship the partial result or iterate.

---

## Idempotency & Re-Runs

`/pg-migrate` is safe to re-run. Each run:

- Computes the missing-migration list fresh from the working tree — already-converted migrations are skipped in Phase 2.
- Drops and recreates `MJ_PG_Migrate_Test`, `MJ_PG_<X>_<Y>_0`, and `MJ_SQL_Compare` from scratch every time. Prior databases are not reused.
- Overwrites `migrations-pg/PG_MIGRATION_REPORT.md` with the latest run's results.
- Adds new toolchain commits to the `pg-migrate/<source-branch>` work branch inside Docker (the host branch is untouched until Phase 5 copies files back).

To start completely fresh: tear down the workbench (`docker compose down`) and run `/pg-migrate` again — Phase 0 will rebuild the container and re-clone the repo.

---

## Reference Docs

- [`ARCHITECTURE_PLAN.md`](ARCHITECTURE_PLAN.md) — the PG migration architecture overall (provider, baseline, sproc strategy).
- [`DEV_ON_PG_GUIDE.md`](DEV_ON_PG_GUIDE.md) — how to run MJ on PG day-to-day (for developers, not the migration pipeline).
- [`PG_MIGRATION_TESTING_GUIDE.md`](PG_MIGRATION_TESTING_GUIDE.md) — the test surface (unit, integration, parity) — what's gated and what's known-skipped.
- [`PG_MANUAL_FIXES_CATALOG.md`](PG_MANUAL_FIXES_CATALOG.md) — every manual fix ever applied + its automation status.
- [`SELF_HEAL_MIGRATION_CHANGES.md`](SELF_HEAL_MIGRATION_CHANGES.md) — converter self-healing for known patterns.
- [`ADVANCED_GENERATION_PG_BUGS.md`](ADVANCED_GENERATION_PG_BUGS.md) — bugs found while running advanced CodeGen on PG.
- [`../../migrations/CLAUDE.md`](../../migrations/CLAUDE.md) — migration authoring rules (T-SQL side).
- [`../../migrations-pg/README.md`](../../migrations-pg/README.md) — top-level guide for the PG migrations directory.
- [`../../migrations-pg/MIGRATION_DECISION_TREE.md`](../../migrations-pg/MIGRATION_DECISION_TREE.md) — decision tree for handling PG migration changes.
- [`../../migrations-pg/PG_TESTING_AUDIT.md`](../../migrations-pg/PG_TESTING_AUDIT.md) — audit of PG-side testing coverage.
