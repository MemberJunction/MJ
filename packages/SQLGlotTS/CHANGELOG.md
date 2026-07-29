# @memberjunction/sqlglot-ts

## 5.50.0

### Patch Changes

- ae992d2: fix(migrate-convert): stop `mj migrate convert` silently dropping statements and emitting empty PG migrations while reporting success (#3252)

  The split-and-regenerate converter could emit empty or broken `.pg.sql` migrations while printing `unhandled stmts: 0` and exiting 0. Three independent root causes are fixed at the dialect, classifier, and bake-path layers:
  - **RC1 — block-less `IF NOT EXISTS(...) CREATE INDEX ...;`** (the v5.49 FK-index shape) fell through to sqlglot, parsed as `exp.IfBlock`, and emitted a bare `;` with no gap reported. The `IF-EXISTS` envelope now captures a block-less guard's single governed statement (so `sys.indexes`/`columns`/`tables` guards translate to the same `DO $$ … pg_indexes … END IF $$` as the `BEGIN…END` form), an `exp.If`/`exp.IfBlock` guard plus an EMPTY-EMISSION postcondition report any node that renders to nothing instead of dropping it, and an inline named `DEFAULT` constraint (`CONSTRAINT [DF_x] DEFAULT (75)` — invalid PG) has its name stripped.
  - **RC2 — a hand-written trigger classified as a CodeGen object and silently dropped** (the file reported a clean `converted` with empty T-SQL). The bare `trg` alternative was removed from the CodeGen-name convention (ledger-verified safe), and an unbannered file now requires a `vw*`/`sp*`/`fn*` object before flipping into statement-mode, so a lone trigger/index can't route a hand-authored file into the drop path.
  - **RC3 — the `--bake-codegen` path applied gappy SQL to the working DB and crashed with zero artifacts.** Forward-mode baking now gates on conversion gaps before touching the working DB, the CLI halts at the first bake-mode gap with a guaranteed non-zero exit, forces a `.needs-hand` artifact for any gap, writes an artifact (never a bare error) on any failure, and rejects `--allow-gaps` together with `--bake-codegen`.

  Adds a soft statement-accounting reconciliation: the dialect self-checks `parsed == emitted + unhandled + dropped` (surfacing an `ACCOUNTING-LEAK` gap, never raising), and each conversion carries a coarse source→output reconciliation that flags substantive T-SQL producing empty output. Validated by a full-ledger sweep over all 201 v5 migrations: zero crashes, zero accounting leaks, zero bare-`;` bodies, zero reconciliation false-positives.

## 5.49.0

## 5.48.0

## 5.47.0

### Patch Changes

- 073842c: Fix `spawn E2BIG` in PostgreSQL migration conversion. The cross-file BIT-column

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

## 5.43.0

## 5.42.0

### Patch Changes

- 8f7260b: Add inline CodeGen baking for PostgreSQL migrations (`mj migrate convert --bake-codegen` and `mj migrate rebake`) plus a one-time PG CodeGen cutover migration and a repeatable `EntityField.AllowsNull` self-heal, enabling codegen-free PostgreSQL deploys (`mj migrate` + `mj sync push`, no `mj codegen`).
- eea5b15: Split-and-regenerate PostgreSQL migration pipeline: regenerate the machine-generated bulk of each migration and transpile only hand-authored DDL via AST-based SQLGlot dialect transforms, replacing the brittle regex-based pg-migrate path. Adds statement-level classification for unbannered baselines and end-to-end AST transforms covering the remaining DDL edge cases.

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

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

## 5.24.0

## 5.23.0

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

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes
