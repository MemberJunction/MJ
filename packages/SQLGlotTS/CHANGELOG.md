# @memberjunction/sqlglot-ts

## 6.1.1

## 6.1.0

### Minor Changes

- 9864d86: Fix three PostgreSQL conversion defects, each of which produced a file the converter reported as clean and PostgreSQL then rejected at apply time.

  **1. BIT literals in `UPDATE … SET` and `WHERE`.** The split path already coerced BIT literals inside `INSERT … VALUES` (by ordinal position); it did not coerce them in `UPDATE "T" SET "Flag" = 1` or `WHERE "Flag" = 1` (by column name). Those are different syntactic sites needing different rewriters, and the rule-based path applies both while the split path applied only the first — so a CodeGen `UPDATE` against a core-metadata table failed with `operator does not exist: boolean = integer`. `assemblePgSQL` now applies `convertBooleanLiteralComparisons` alongside `castBooleanInsertValues`. Rewriting is still by known-boolean column name, so `"Sequence" = 1` on a non-boolean column is untouched.

  **2. A comma inside a CodeGen comment shifted every subsequent column.** `splitTopLevelValues` tracked quoted strings and nested parens but not SQL comments. CodeGen interleaves explanatory comments between values and one of them contains a comma — _"Apply-time sequence, not the literal CodeGen emitted (MJ#4202)"_ — so the split counted a phantom value and every later column landed one ordinal early. Observed as `column "Scale" is of type integer but expression is of type boolean`: the flag intended for `AllowsNull` was written into `Scale`. The splitter now skips `/* … */` and `-- …` bodies (copying them through untouched) when looking for separators. This was latent in the INSERT coercion shipped previously; this release's content is simply the first to carry a comma in that position.

  **3. `CREATE INDEX` after FK-bearing DML.** PostgreSQL refuses to index a table carrying pending trigger events — `cannot CREATE INDEX "Entity" because it has pending trigger events` — which a migration hits whenever it seeds FK-bearing rows and then indexes the _referenced_ table. SQL Server has no such restriction, so the T-SQL original is legal and the breakage exists only after conversion. The AST dialect now emits `SET CONSTRAINTS ALL IMMEDIATE;` ahead of a guarded `CREATE INDEX`, matching the statement-level form the committed ledger already uses for this purpose (`V202608042204__APIKey_Scope_RowFilterID.pg.sql`). It is emitted **only** when the guarded body actually creates an index, and it is semantically free — the deferred checks run now rather than at `COMMIT`, so anything that would have failed still fails, just earlier and attached to a clearer statement. Placement matters: issuing it _inside_ the `DO` block does not clear events queued by earlier statements, which was verified live before the statement-level form was adopted.

  Covered by 3 new `MigrationConverter` tests and 2 new `mj_postgres` dialect tests, including negative cases that pin the narrowness of each rewrite.

### Patch Changes

- ac0275b: Seed the BIT/BOOLEAN registry from the live catalog when baking PostgreSQL migrations. The registry was collected only from the migration set's own baseline, which declares the app's tables and never MJ core's — so an Open App migration seeding `__mj.EntityField` had no type information for `AllowsNull` / `IsVirtual` / `IsPrimaryKey`, emitted bare `0`/`1`, and failed with `column "AllowsNull" is of type boolean but expression is of type integer`, halting the whole bake chain. `--bake-codegen` already requires a live connection, so `information_schema` is now read for the core and app schemas and merged in via the new `MJPostgresTranspiler.addExtraBitColumns()`. Also corrects the registry's type: entries are `[table, column]` pairs (`BitColumnRef`), not the `string[]` the signature claimed — a `"Table.Column"` string would have serialized fine and matched nothing.

## 6.1.0-edge.7

### Minor Changes

- 9864d86: Fix three PostgreSQL conversion defects, each of which produced a file the converter reported as clean and PostgreSQL then rejected at apply time.

  **1. BIT literals in `UPDATE … SET` and `WHERE`.** The split path already coerced BIT literals inside `INSERT … VALUES` (by ordinal position); it did not coerce them in `UPDATE "T" SET "Flag" = 1` or `WHERE "Flag" = 1` (by column name). Those are different syntactic sites needing different rewriters, and the rule-based path applies both while the split path applied only the first — so a CodeGen `UPDATE` against a core-metadata table failed with `operator does not exist: boolean = integer`. `assemblePgSQL` now applies `convertBooleanLiteralComparisons` alongside `castBooleanInsertValues`. Rewriting is still by known-boolean column name, so `"Sequence" = 1` on a non-boolean column is untouched.

  **2. A comma inside a CodeGen comment shifted every subsequent column.** `splitTopLevelValues` tracked quoted strings and nested parens but not SQL comments. CodeGen interleaves explanatory comments between values and one of them contains a comma — _"Apply-time sequence, not the literal CodeGen emitted (MJ#4202)"_ — so the split counted a phantom value and every later column landed one ordinal early. Observed as `column "Scale" is of type integer but expression is of type boolean`: the flag intended for `AllowsNull` was written into `Scale`. The splitter now skips `/* … */` and `-- …` bodies (copying them through untouched) when looking for separators. This was latent in the INSERT coercion shipped previously; this release's content is simply the first to carry a comma in that position.

  **3. `CREATE INDEX` after FK-bearing DML.** PostgreSQL refuses to index a table carrying pending trigger events — `cannot CREATE INDEX "Entity" because it has pending trigger events` — which a migration hits whenever it seeds FK-bearing rows and then indexes the _referenced_ table. SQL Server has no such restriction, so the T-SQL original is legal and the breakage exists only after conversion. The AST dialect now emits `SET CONSTRAINTS ALL IMMEDIATE;` ahead of a guarded `CREATE INDEX`, matching the statement-level form the committed ledger already uses for this purpose (`V202608042204__APIKey_Scope_RowFilterID.pg.sql`). It is emitted **only** when the guarded body actually creates an index, and it is semantically free — the deferred checks run now rather than at `COMMIT`, so anything that would have failed still fails, just earlier and attached to a clearer statement. Placement matters: issuing it _inside_ the `DO` block does not clear events queued by earlier statements, which was verified live before the statement-level form was adopted.

  Covered by 3 new `MigrationConverter` tests and 2 new `mj_postgres` dialect tests, including negative cases that pin the narrowness of each rewrite.

## 6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- ac0275b: Seed the BIT/BOOLEAN registry from the live catalog when baking PostgreSQL migrations. The registry was collected only from the migration set's own baseline, which declares the app's tables and never MJ core's — so an Open App migration seeding `__mj.EntityField` had no type information for `AllowsNull` / `IsVirtual` / `IsPrimaryKey`, emitted bare `0`/`1`, and failed with `column "AllowsNull" is of type boolean but expression is of type integer`, halting the whole bake chain. `--bake-codegen` already requires a live connection, so `information_schema` is now read for the core and app schemas and merged in via the new `MJPostgresTranspiler.addExtraBitColumns()`. Also corrects the registry's type: entries are `[table, column]` pairs (`BitColumnRef`), not the `string[]` the signature claimed — a `"Table.Column"` string would have serialized fine and matched nothing.

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

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
