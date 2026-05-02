# Baseline Migration Builder + Comparator — Plan

Status: **Proposal — awaiting review**. No implementation code yet.

## Goal

Provide a deterministic, provable way to collapse the existing stack of versioned migrations (V-files) into a single baseline migration (B-file) and verify byte-equivalent end-state.

The approach is intentionally **MJ-only** (no skyway changes). Skyway already understands `B`-prefixed baseline files; we just need to *generate* one and *prove* it matches the V-stack end-state.

## Approach

> Take the END-STATE of an already-migrated database, introspect every object via the generic database provider abstraction, and emit a canonical, deterministic SQL script. Then prove equivalence by applying that script to a fresh database and comparing object-by-object against the original.

This is more robust than parsing or replaying SQL: we work with what the database actually contains, not what we think the SQL says.

## Components

### 1. New CLI commands (oclif)

Live under `packages/MJCLI/src/commands/baseline/`:

- `mj baseline build` — connects to a live DB, introspects, emits `B{ver}__{desc}.sql`.
- `mj baseline compare` — diffs two live DBs object-by-object.
- `mj baseline roundtrip` — convenience wrapper: build → apply to fresh DB → compare → report.

#### `mj baseline build`

Flags:
- `--connection <name>` — named connection from `mj.config.cjs` (DB containing the applied V-stack)
- `--out <path>` — output `.sql` path (default: `./migrations/v{N+1}/B{ver}__Baseline.sql`)
- `--baseline-version <ver>` — baseline version stamp
- `--baseline-description <text>` — human description
- `--include-data <comma-list of tables>` — opt-in seed data (default: none)
- `--exclude-schemas <comma-list>` — schemas to skip (default: `flyway_schema_history` table only)
- `--object-types <comma-list>` — `tables,views,procs,functions,triggers,sequences,indexes,fks,checks,defaults` (default: all)
- `--dry-run` — show counts and emit to stdout, don't write file

#### `mj baseline compare`

Flags:
- `--left <connection>` and `--right <connection>` — DBs to compare
- `--scope <comma-list>` — subset of object types
- `--row-compare none|counts|hash|full` — default `hash` (CHECKSUM_AGG on MSSQL, md5(string_agg) on PG)
- `--ignore <regex>` — skip matching object names (default: `^flyway_schema_history$`)
- `--out <path>` — write JSON + Markdown reports
- `--fail-on-diff` — exit non-zero on any difference

#### `mj baseline roundtrip`

Flags:
- `--source <connection>` — DB with V-stack already applied (or `--migrations <path>` to apply fresh)
- `--scratch-suffix <text>` — used to name temp DBs (default: `_baseline_test`)
- `--keep-dbs` — don't drop scratch DBs after run
- `--out <dir>` — directory for baseline file + reports
- All `compare` flags pass through

### 2. Shared core

Under `packages/MJCLI/src/baseline/`:

- `types.ts` — `SchemaSnapshot`, `ObjectDef`, `ColumnDef`, `IndexDef`, `ForeignKeyDef`, `RoutineDef`, `ViewDef`, `TriggerDef`, `SequenceDef`, `DiffReport`, `ObjectDiff`
- `introspector.ts` — entrypoint; dispatches to dialect impl
- `introspector-mssql.ts` — `sys.*` + `INFORMATION_SCHEMA`; uses `OBJECT_DEFINITION()` for SP/view/function/trigger bodies (byte-faithful)
- `introspector-postgres.ts` — `pg_catalog` + `information_schema`; uses `pg_get_viewdef()` / `pg_get_functiondef()` / `pg_get_triggerdef()`
- `emitter.ts` — `SchemaSnapshot → SQL string`; canonical formatting, stable ordering, dependency-aware (sequences → tables → indexes → defaults → checks → FKs → views → functions → procs → triggers)
- `comparator.ts` — `(SchemaSnapshot, SchemaSnapshot) → DiffReport`
- `data-hasher.ts` — dialect-specific deterministic row hashing
- `report.ts` — JSON + Markdown rendering

### 3. Progress UX (oclif + ora)

`ora-classic` already in deps. Each command shows live status spinners with phase counts:
```
✔ Connecting to MJ_BL_Stack ........................... ok (240ms)
✔ Introspecting schemas (3) ........................... 3 schemas
⠧ Introspecting tables (147) ........................   89/147
  Introspecting indexes ............................    pending
  Introspecting routines ...........................    pending
  Hashing table data (rows) ........................    pending
  Emitting SQL .....................................    pending
```
Per-phase elapsed time, total counts, and color-coded summary (green ok / red diff). Verbose mode (`--verbose`) prints per-object lines. Quiet mode (`--quiet`) prints final JSON only. CI mode (auto-detected via `CI=true` or `--no-tty`) uses plain line output instead of spinners.

### 4. Workbench script

`docker/workbench/baseline-roundtrip.sh` — bash wrapper that:
1. Validates target DB service is up (`sql-claude` or `postgres-claude`)
2. Drops + creates `MJ_BL_Stack` and `MJ_BL_New`
3. `mj migrate` against `MJ_BL_Stack` with the configured V-stack
4. `mj baseline build --connection MJ_BL_Stack --out /tmp/B__candidate.sql`
5. Applies `B__candidate.sql` to `MJ_BL_New` (sqlcmd / psql)
6. `mj baseline compare --left MJ_BL_Stack --right MJ_BL_New --fail-on-diff`
7. Tees the report to `/workspace/MJ/.workbench/baseline-compare-<ts>.{json,md}`

Wired into `Dockerfile` (binary install) + `.zshrc` (alias) + welcome banner.

### 5. Claude Code slash command

`.claude/commands/create-new-baseline-migration.md` — drives the entire flow from outside the workbench:

1. Local CC reads workbench state, ensures it's up (`docker compose up -d` if needed)
2. Local CC `docker compose exec` into the workbench
3. Inside workbench, runs `baseline-roundtrip.sh` with appropriate args (dialect inferred from arg or `mj.config.cjs`)
4. Streams output back to local CC; on success, prints location of generated baseline + diff report; on diff, surfaces the failing objects and asks user to inspect
5. Optional `--commit` flag: if green, drops the baseline file into `migrations/v{N+1}/` and stages it

The slash command also sets up its own work plan (TodoWrite) so a long-running roundtrip is observable.

### 6. Tests

- Unit (vitest): emitter determinism (snapshot → identical bytes across runs/machines); comparator (synthetic snapshots with known diffs); data-hasher determinism
- Integration: `baseline-roundtrip.sh` against existing MJ V-stack on both MSSQL and PG; must exit 0

## Open questions for review

1. **Default baseline filename / location.** Use `migrations/v{next}/B{date}__Baseline.sql` (matches existing repo convention with `Baseline_v3.0_OPTIMIZATION_REPORT.md`)?
2. **Seed data inclusion.** Default off; opt-in via `--include-data`. Confirm.
3. **PG dialect priority.** Build both dialects in parallel, or MSSQL first, PG follow-up? Recommendation: both in parallel — the abstraction is the whole point.
4. **Skyway version.** Stay on `@memberjunction/skyway-*@^0.6.0`. No version bump needed since we're not changing skyway.

## Out of scope (for now)

- Generating *partial* baselines (only some schemas).
- Cross-dialect baseline (e.g. generating a PG baseline from a MSSQL DB). Each dialect builds its own.
- Editing existing migrations.
- Replacing `migrations/` history; the V-stack stays where it is. The new B-file is added alongside; once verified, future fresh installs use the B-file and skip applied V-files (skyway's existing behavior).

## Branch & PR

- Branch: `claude/add-baseline-migration-builder-slWZ9` (this branch)
- Base: `next`
- Linked work: none (single-repo). Skyway stays at current version.
