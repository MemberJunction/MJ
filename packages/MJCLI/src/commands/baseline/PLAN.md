# Baseline Migration Builder + Comparator — Plan

**Status:** **Implemented** ✓ — awaiting first live-integration run inside the workbench.

This file is now the design record for what was built. See file links below.

## Goal

Provide a deterministic, provable way to collapse the existing stack of versioned migrations (V-files) into a single baseline migration (B-file) and verify byte-equivalent end-state — **including every row of every table**.

The implementation is **MJ-only** (no skyway changes). Skyway already understands `B`-prefixed baseline files; we generate one and prove it matches the V-stack end-state.

## Approach

> Take the END-STATE of an already-migrated database, introspect every object, dump every row of every table, and emit a canonical, deterministic SQL script. Then prove equivalence by applying that script to a fresh database and comparing object-by-object **and row-by-row** against the original.

## Output filename format

```
B{YYYYMMDDHHMM}__v{Major}.{Minor}.X__Baseline.sql
```

Example: `B202605021947__v3.1.X__Baseline.sql`. The literal `X` is the patch
component because patches don't carry migrations. See `util.ts → baselineFilename()`.

## Components — built

### 1. CLI commands (oclif)

- [`mj baseline build`](./build.ts) — connect to live MSSQL DB, introspect + dump rows, emit T-SQL.
- [`mj baseline compare`](./compare.ts) — diff two live DBs object-by-object and row-by-row.
- [`mj baseline roundtrip`](./roundtrip.ts) — build → apply → compare in one shot.

### 2. Core library (`packages/MJCLI/src/baseline/`)

- `types.ts` — shared `SchemaSnapshot`, `TableDataDump`, `DiffReport`, etc.
- `util.ts` — canonical formatting (quoting, T-SQL literals, deterministic sort, filename stamp, deep equality).
- `connection.ts` — thin `mssql` + `pg` wrapper with row streaming.
- `introspector-mssql.ts` — `sys.*` + `INFORMATION_SCHEMA`; `OBJECT_DEFINITION()` for routine bodies.
- `introspector-postgres.ts` — `pg_catalog` + `information_schema`; `pg_get_*def()` for bodies.
- `data-dumper.ts` — every-row-every-column, ORDER BY PK (fallback all cols), streamed.
- `emitter.ts` — canonical T-SQL output, dependency-ordered (sequences → tables → indexes → defaults → checks → identity-bookended data → views → functions → procs → triggers → FKs).
- `comparator.ts` — structural + row-by-row diff with `full|hash|counts|none` modes.
- `report.ts` — JSON + Markdown rendering.
- `cli-helpers.ts` — connection from MJ config + TTY detection.
- `index.ts` — public re-exports.

### 3. Progress UX

`ora-classic` spinners (already in MJCLI deps); auto-fall-back to plain log lines under `CI=true` or non-TTY. Per-phase status, color-coded summary, per-table row counters during data dumps.

### 4. Workbench script

[`docker/workbench/baseline-roundtrip.sh`](../../../../docker/workbench/baseline-roundtrip.sh) — six-phase end-to-end runner. Wired into `Dockerfile` + `.zshrc` (alias `mjbaseline`, `mjbaseline-mssql`, `mjbaseline-pg`) + welcome banner.

### 5. Slash command

[`.claude/commands/create-new-baseline-migration.md`](../../../../.claude/commands/create-new-baseline-migration.md) — drives the workbench from outside. Real implementation, not a stub.

### 6. Tests

- [`baseline.util.test.ts`](../../__tests__/baseline.util.test.ts) — quoting, ordering, filename, T-SQL literal formatting, deep equality.
- [`baseline.emitter.test.ts`](../../__tests__/baseline.emitter.test.ts) — emitter determinism, dependency order, identity bookends, escape handling.
- [`baseline.comparator.test.ts`](../../__tests__/baseline.comparator.test.ts) — structural diffs (missing tables, column type changes, view bodies, FK actions), row-by-row diffs (`full`, `counts`), ignore patterns.

Live integration (a real MSSQL roundtrip against the actual MJ V-stack) is gated on the first workbench run — the next step after this PR merges, or a manual verification by the reviewer.

## Resolved decisions

- Filename: `B{YYYYMMDDHHMM}__v{Major}.{Minor}.X__Baseline.sql` (literal X).
- PG strategy: T-SQL baseline → `/pg-migrate` (`mj migrate convert`) → apply to PG → compare against `migrations-pg/v{N}/` V-stack.
- Data dump: all rows, all columns, every table by default. Excludes `flyway_schema_history`.
- Default row-compare: `full`.
- Package boundary: `packages/MJCLI/src/baseline/` (extract later if reuse needed).
- Skyway: unchanged at `^0.6.0`. Direct `mssql` and `pg` deps added to MJCLI for raw introspection.

## Out of scope

- Partial baselines (subset of schemas).
- Editing existing migrations.
- Replacing `migrations/` history; the V-stack stays where it is.

## Branch & PR

- Branch: `claude/add-baseline-migration-builder-slWZ9`
- Base: `next`
- Skyway: no changes.
