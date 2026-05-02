# Baseline Migration Builder + Comparator — Plan

Status: **Proposal — awaiting final go-ahead to implement**. No implementation code yet.

## Goal

Provide a deterministic, provable way to collapse the existing stack of versioned migrations (V-files) into a single baseline migration (B-file) and verify byte-equivalent end-state — **including every row of every table**.

The approach is intentionally **MJ-only** (no skyway changes). Skyway already understands `B`-prefixed baseline files; we just need to *generate* one and *prove* it matches the V-stack end-state.

## Approach

> Take the END-STATE of an already-migrated database, introspect every object via the generic database provider abstraction, dump every row of every table, and emit a canonical, deterministic SQL script. Then prove equivalence by applying that script to a fresh database and comparing object-by-object **and row-by-row** against the original.

Working with what the database actually contains (not what we think the SQL says) is the whole point — it's deterministic and provable.

### Dialects

- **MSSQL is the source-of-truth dialect.** Single introspector + single T-SQL emitter.
- **PostgreSQL** baseline is produced by running the generated MSSQL baseline through the existing **`/pg-migrate`** flow (which uses `@memberjunction/sql-converter` and the established translation pipeline).
- The PG baseline is then verified by applying it to a fresh PG DB and comparing against a fresh PG DB built from `migrations-pg/v{N}/` (the PG-native V-stack) — same shape as the MSSQL verification, just on the PG side.

## Output filename format

```
B{YYYYMMDDHHMM}__v{Major}.{Minor}.X__Baseline.sql
```

Example: `B202605021947__v3.1.X__Baseline.sql`

- `YYYYMMDDHHMM` — UTC generation timestamp.
- `v{Major}.{Minor}.X` — `Major.Minor` is the baseline version stamp passed via `--baseline-version`; the patch component is the **literal letter `X`** because patch versions never carry migrations.
- `__Baseline.sql` — literal description suffix.

The PG counterpart (after `/pg-migrate` conversion) gets the same stem in `migrations-pg/v{N}/`.

## Components

### 1. New CLI commands (oclif)

Live under `packages/MJCLI/src/commands/baseline/`:

- `mj baseline build` — connects to a live MSSQL DB, introspects + dumps all data, emits the T-SQL `B{ts}__v{ver}__Baseline.sql`.
- `mj baseline compare` — diffs two live DBs object-by-object **and row-by-row**.
- `mj baseline roundtrip` — convenience wrapper: build → apply to fresh DB → compare → report. For `--dialect postgres`, runs `/pg-migrate` conversion before the apply step and compares against `migrations-pg/v{N}/`.

#### `mj baseline build`

Flags:
- `--connection <name>` — named connection from `mj.config.cjs` (MSSQL DB containing the applied V-stack)
- `--out <dir>` — output directory (default: `./migrations/v{next}/`); filename auto-generated per format above
- `--baseline-version <Major.Minor>` — required, e.g. `3.1` (yields `v3.1.X`)
- `--exclude-data <comma-list>` — opt-out of data dump for specific tables (default: only `flyway_schema_history`)
- `--exclude-schemas <comma-list>` — schemas to skip
- `--object-types <comma-list>` — `tables,views,procs,functions,triggers,sequences,indexes,fks,checks,defaults` (default: all)
- `--batch-size <n>` — INSERT batching for data dump (default: 1000 rows per `INSERT ... VALUES (...), (...)`)
- `--dry-run` — show counts and emit to stdout; don't write file

**Data dump rules (default = every row of every table):**
- Stable ordering: ORDER BY primary key (or all columns if no PK) so the output is byte-identical across runs.
- Identity handling: `SET IDENTITY_INSERT <table> ON` around inserts to identity tables; `DBCC CHECKIDENT` to reset seeds at end.
- Computed columns: skipped in INSERT lists.
- BLOB/binary: emitted as `0x...` literals.
- Datetime/datetimeoffset: emitted with full precision and explicit format strings.

#### `mj baseline compare`

Flags:
- `--left <connection>` and `--right <connection>` — DBs to compare
- `--scope <comma-list>` — subset of object types
- `--row-compare full|hash|counts|none` — **default `full`** (row-by-row, super critical, every row verified). `hash` available as faster fallback.
- `--row-hash-algo sha256|md5|checksum_agg` — when `--row-compare hash`; default `sha256` (HASHBYTES on MSSQL).
- `--ignore <regex>` — skip matching object names (default: `^flyway_schema_history$`)
- `--out <dir>` — write JSON + Markdown reports
- `--fail-on-diff` — exit non-zero on any difference

**`full` mode:** ORDER BY PK (or all cols), stream rows from both sides, compare value-by-value, report first N (default 100) mismatching rows per table with column-level diff. Memory-bounded by streaming.

**`hash` mode:** per-table SHA-256 over the canonicalized row stream. Faster, still cryptographically deterministic, but only tells you "different" not "where."

#### `mj baseline roundtrip`

Flags:
- `--dialect <mssql|postgres>` — required
- `--source <connection>` — DB with V-stack already applied (or `--migrations <path>` to apply fresh first)
- `--scratch-suffix <text>` — used to name temp DBs (default: `_baseline_test`)
- `--keep-dbs` — don't drop scratch DBs after run
- `--out <dir>` — directory for baseline file + reports
- All `compare` flags pass through

For `--dialect postgres`: builds T-SQL baseline against MSSQL source, runs `/pg-migrate` conversion, applies converted baseline to fresh PG DB, compares against PG V-stack DB built from `migrations-pg/v{N}/`.

### 2. Shared core

Under `packages/MJCLI/src/baseline/`:

- `types.ts` — `SchemaSnapshot`, `ObjectDef`, `ColumnDef`, `IndexDef`, `ForeignKeyDef`, `RoutineDef`, `ViewDef`, `TriggerDef`, `SequenceDef`, `TableDataDump`, `DiffReport`, `ObjectDiff`, `RowDiff`
- `introspector.ts` — single MSSQL introspector using `sys.*` + `INFORMATION_SCHEMA`; uses `OBJECT_DEFINITION()` for SP/view/function/trigger bodies (byte-faithful)
- `data-dumper.ts` — streams every row of every table into deterministic INSERT batches; honors batch size, ordering rules, identity/computed/BLOB rules
- `emitter.ts` — `SchemaSnapshot + DataDumps → T-SQL string`; canonical formatting, stable ordering, dependency-aware (sequences → tables → indexes → defaults → checks → identity-on → data → identity-off → views → functions → procs → triggers → FKs)
- `comparator.ts` — `(SchemaSnapshot+Data, SchemaSnapshot+Data) → DiffReport`; structural + row-by-row in `full` mode (works on both MSSQL and PG via the generic provider)
- `report.ts` — JSON + Markdown rendering

For PG, no separate introspector/emitter — `/pg-migrate` does the conversion. The comparator runs natively against PG via the generic provider for the verification step.

### 3. Progress UX (oclif + ora)

`ora-classic` already in deps. Each command shows live status spinners with phase counts:
```
✔ Connecting to MJ_BL_Stack ........................... ok (240ms)
✔ Introspecting schemas (3) ........................... 3 schemas
✔ Introspecting tables (147) .......................... 147 tables
✔ Introspecting indexes ............................... 312 indexes
✔ Introspecting routines .............................. 89 procs / 24 functions / 11 views
⠧ Dumping table data .................................   table 47/147 (rows: 12.3M / ~38M)
  Emitting SQL .....................................    pending
```
Per-phase elapsed time, total counts, color-coded summary (green ok / red diff). `--verbose` prints per-object lines. `--quiet` prints final JSON only. CI mode (auto-detected via `CI=true` or `--no-tty`) uses plain line output instead of spinners.

For long-running data dumps and `full` row compares: progress is per-table with row-count / row-rate, plus an ETA.

### 4. Workbench script

`docker/workbench/baseline-roundtrip.sh` — bash wrapper that:
1. Validates target DB service is up (`sql-claude` or `postgres-claude`)
2. Drops + creates `MJ_BL_Stack` and `MJ_BL_New`
3. `mj migrate` against `MJ_BL_Stack` with the configured V-stack
4. `mj baseline build --connection MJ_BL_Stack --out /tmp/baseline/`
5. (PG only) runs `/pg-migrate` conversion to produce the PG version of the baseline
6. Applies the baseline file to `MJ_BL_New`
7. `mj baseline compare --left MJ_BL_Stack --right MJ_BL_New --row-compare full --fail-on-diff`
8. Tees the report to `/workspace/MJ/.workbench/baseline-compare-<ts>.{json,md}`

Wired into `Dockerfile` (binary install) + `.zshrc` (alias) + welcome banner.

### 5. Claude Code slash command

`.claude/commands/create-new-baseline-migration.md` — drives the entire flow from outside the workbench:

1. Local CC ensures workbench is up (`docker compose up -d` if needed)
2. Local CC `docker compose exec`s into the workbench
3. Inside workbench, runs `baseline-roundtrip.sh` with appropriate args
4. Streams output back to local CC; on success, prints location of generated baseline + diff report; on diff, surfaces the failing objects/rows
5. Optional `--commit` flag: if green, copies the baseline file into `migrations/v{N+1}/` (and `migrations-pg/v{N+1}/` for the PG variant) and stages

The slash command also sets up its own work plan (TodoWrite) so a long-running roundtrip is observable.

### 6. Tests

- Unit (vitest): emitter determinism (snapshot → identical bytes across runs/machines); comparator (synthetic snapshots with known structural + row-level diffs); data-dumper determinism (same DB → identical INSERT bytes)
- Integration: `baseline-roundtrip.sh` against existing MJ V-stack on **both** MSSQL and PG; must exit 0 with `--row-compare full`

## Resolved decisions

- **Filename format:** `B{YYYYMMDDHHMM}__v{Major}.{Minor}.X__Baseline.sql` — literal `X` for patch (patch versions don't carry migrations).
- **PG strategy:** generate MSSQL T-SQL baseline → `/pg-migrate` to produce PG version → verify against `migrations-pg/v{N}/` V-stack just like MSSQL. No separate PG introspector.
- **Data dump:** all rows, all columns, every table by default. This is shippable metadata, not transactional/log data — file size is fine. (Running this against a populated prod DB would be silly; that's not the use case.)
- **Default row-compare:** `full` (row-by-row, super critical verified).
- **Default package boundary:** inside `packages/MJCLI/src/baseline/`.
- **Skyway:** unchanged at `^0.6.0`.

## Out of scope (for now)

- Generating *partial* baselines (only some schemas)
- Editing existing migrations
- Replacing `migrations/` history; the V-stack stays where it is

## Branch & PR

- Branch: `claude/add-baseline-migration-builder-slWZ9` (this branch)
- Base: `next`
- Linked work: none (single-repo).
