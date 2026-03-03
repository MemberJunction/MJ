# SQL Converter Toolchain Fix Session — Continuation Brief

## Overarching Vision

MemberJunction is being extended to support **multiple database backends in parallel** — not a port away from SQL Server, but additional support for PostgreSQL (and eventually MySQL and other databases). The SQL Converter toolchain (`@memberjunction/sql-converter`) is the critical infrastructure that automatically converts SQL Server migration files to PostgreSQL equivalents. The goal is a **zero-manual-intervention** pipeline: fix the tools, reconvert, verify — never hand-edit output scripts.

## Cardinal Rule

**NEVER manually fix the converted output scripts. ALWAYS fix the converter toolchain, reconvert, and verify.** The whole point is that the tool must produce correct output automatically. If the output is wrong, the tool has a bug that needs fixing.

## Branch & Package

- **Branch**: `postgres-5-0-implementation`
- **Package**: `packages/SQLConverter/` (`@memberjunction/sql-converter@5.3.1`)
- **Build**: `cd packages/SQLConverter && npm run build`
- **Test**: `cd packages/SQLConverter && npm run test` (676 tests, all passing)
- **Convert command**: `npx --no mj sql-convert "migrations/v5/FILE.sql" --from tsql --to postgres -o "migrations/pg/v5/FILE.pg.sql"`
- **Source migrations**: `migrations/v5/*.sql` (15 files)
- **Output migrations**: `migrations/pg/v5/*.pg.sql` (15 files)

## Architecture Summary

The SQL Converter is a rule-based pipeline:
1. **Split** input on `GO` statements → batches
2. **Sub-split** compound batches (SubSplitter)
3. **Classify** each batch by type (StatementClassifier → StatementType)
4. **Convert** using matched rules (13 rules registered in TSQLToPostgresRules)
5. **Group** output by category (Tables, Views, SPs, Data, FKs, Grants, Comments)
6. **Post-process** the final output (PostProcessor — bracket removal, cleanup)

Key files:
- `rules/BatchConverter.ts` — Main orchestrator
- `rules/StatementClassifier.ts` — Routes batches to StatementType
- `rules/ExpressionHelpers.ts` — Shared expression-level conversions
- `rules/PostProcessor.ts` — Final output cleanup
- `rules/TypeResolver.ts` — T-SQL → PG type resolution
- `rules/DialectHeaderBuilder.ts` — File header generation
- `rules/*.Rule.ts` — Individual conversion rules (13 total)

## What Was Completed This Session

### Issues Fixed (all in toolchain code, not output)

1. **PostProcessor bracket corruption** (`PostProcessor.ts`): Bracket-to-quote replacement (`[name]` → `"name"`) was corrupting regex patterns like `[A-Za-z0-9]` inside `$$`-quoted function bodies. Fixed with `replaceBracketsOutsideDollarBlocks()` that skips dollar-quoted blocks and string literals.

2. **StatementClassifier EXEC_BLOCK type** (`StatementClassifier.ts`): DECLARE/SET/EXEC blocks (metadata sync files) were being blanket-classified as `SKIP_SQLSERVER`. Added nuanced detection: if a DECLARE block contains EXEC calls to schema procedures, classify as `EXEC_BLOCK` instead.

3. **StatementClassifier extended property variants** (`StatementClassifier.ts`): Added `sp_updateextendedproperty` and `sp_dropextendedproperty` alongside existing `sp_addextendedproperty` detection.

4. **New ExecBlockRule** (`ExecBlockRule.ts`): Full new rule (~530 lines) that converts DECLARE/SET/EXEC metadata sync blocks to PostgreSQL DO $$ blocks with DECLARE/BEGIN/PERFORM. Handles multiple blocks per file, string-literal-aware splitting, value conversion (N-prefix, CAST types, string concat), and EXEC → PERFORM with named parameters.

5. **ConditionalDDLRule filtered index** (`ConditionalDDLRule.ts`): Fixed regex to capture optional WHERE clause for filtered indexes. Also fixed to handle BEGIN/END wrapper around CREATE INDEX inside conditional DDL.

6. **ExpressionHelpers string concat** (`ExpressionHelpers.ts`): Moved structural string-concat patterns (`) + CAST(`, `) + REPLACE(`, etc.) to apply to ALL code segments regardless of string adjacency. Added patterns for `) + "QuotedCol"` and `"QuotedCol" + function()`.

7. **ProcedureToFunctionRule view skip** (`ProcedureToFunctionRule.ts`): Removed logic that skipped procedures referencing views not yet in `CreatedViews` set. PostgreSQL functions can reference views that are created later (resolved at call time, not definition time).

8. **DialectHeaderBuilder** (`DialectHeaderBuilder.ts`): Changed header text from "MemberJunction v5.0 PostgreSQL Baseline" to "MemberJunction PostgreSQL Migration" — all files get the same header which is idempotent.

9. **ExecBlockRule trailing comments** (`ExecBlockRule.ts`): Fixed `parseExec()` to strip trailing comments after the semicolon-terminated EXEC statement. Added `lineEndsSemicolon()` helper. This prevents `-- End of SQL Logging Session` comments from being merged into the PERFORM parameter list.

### Tests Updated

- `TSQLToPostgresRules.test.ts` — Updated from 12 to 13 rules, added priority 52, added ExecBlockRule type check and EXEC_BLOCK coverage test
- `BatchConverter.test.ts` — Updated header assertion text

### Registration

- `ExecBlockRule` registered in `TSQLToPostgresRules.ts` at Priority 52
- `ExecBlockRule` exported from `rules/index.ts`
- `EXEC_BLOCK` added to `StatementType` union in `types.ts`
- `EXEC_BLOCK` added to `DATA_TYPES` set in `BatchConverter.ts`

## Where We Left Off — WHAT NEEDS TO HAPPEN NEXT

The toolchain is built and all 676 tests pass. The next steps are:

### Step 1: Reconvert All 15 Migration Files

Run this loop to reconvert everything:
```bash
cd /path/to/MJ
for f in migrations/v5/*.sql; do
  base=$(basename "$f" .sql)
  echo "Converting: $base"
  npx --no mj sql-convert "$f" --from tsql --to postgres -o "migrations/pg/v5/${base}.pg.sql"
  echo "---"
done
```

### Step 2: Verify the Critical Fixes

After reconversion, verify these specific issues are fixed:

1. **Metadata Sync files no longer empty**: Check `V202602161825__v5.0.x__Metadata_Sync.pg.sql` has DO $$ blocks with PERFORM calls (was previously empty/skipped)

2. **No stale @ID variables**: `grep '@ID' migrations/pg/v5/V202602161825__v5.0.x__Metadata_Sync.pg.sql` should return nothing (previously had `@ID_f2234c67` in last PERFORM call)

3. **String concat uses ||**: Check `V202602190836__v5.2.x__Schema_Based_ClassName_Prefix.pg.sql` around vwEntities view — `GetClassNameSchemaPrefix() +` should now be `GetClassNameSchemaPrefix() ||`

4. **ConditionalDDL index uses PG syntax**: Check `V202602190836` — the `sys.indexes` / `OBJECT_ID()` conditional should now be `CREATE INDEX IF NOT EXISTS` (not a DO $$ block with SQL Server system catalog references)

5. **No skipped procedures**: `grep 'SKIPPED.*Procedure' migrations/pg/v5/V202602211553__v5.3.x__Missing_Metadata.pg.sql` should return nothing (spCreateEntity and spUpdateEntity were previously skipped)

### Step 3: Run Statement-by-Statement Audit

Spin up parallel sub-agents (one per file group) to compare SQL Server source vs PG output. Look for:
- Remaining `+` operators that should be `||` (string concat)
- Any `[bracket]` identifiers outside string literals and $$-quoted blocks
- SQL Server types still present (NVARCHAR, UNIQUEIDENTIFIER, BIT, DATETIME)
- Missing statements (compare statement counts)
- `@` prefixed variables in PG output
- `sys.` references outside of skipped blocks

### Step 4: Fix Any New Issues Found

Follow the same pattern: fix the toolchain code, rebuild, retest, reconvert, verify. Never manually fix output.

## Known Acceptable Limitations

These are NOT bugs — they are by design:

1. **Bare EXEC calls** like `EXEC spRecompileAllViews` are SQL Server maintenance operations with no PG equivalent. Classified as `SKIP_SQLSERVER` — correct behavior.

2. **V202602191500 (Fix_Entity_Name_References_In_JSON_Config)**: This file contains a temp stored procedure with CURSOR/dynamic SQL/sp_executesql pattern. The converter correctly skips this complex SQL Server-specific logic. This migration would need a PG-specific equivalent written by hand (it's a one-time data fixup, not structural DDL).

3. **V202602170015 (Regenerate_Delete_Stored_Procs)**: Large CodeGen output file. Converts fine but the header is generic.

4. **String data inside SET values**: The metadata sync files contain SQL query text as string values (e.g., `SET @SQL = N'SELECT TOP 1...'`). The converter correctly preserves this content as-is — it's data, not structural SQL. The stored queries themselves may need separate PG versions.

5. **Empty sections in output**: Tables, Views, FK Constraints, Grants, Comments sections may be empty for files that don't contain those statement types. This is correct — the section headers are always emitted for consistency.

## File Inventory — What Was Modified

### New Files
- `packages/SQLConverter/src/rules/ExecBlockRule.ts` — Full new rule for DECLARE/SET/EXEC blocks

### Modified Source Files
- `packages/SQLConverter/src/rules/PostProcessor.ts` — Dollar-quote-aware bracket replacement
- `packages/SQLConverter/src/rules/StatementClassifier.ts` — EXEC_BLOCK classification, extended property variants
- `packages/SQLConverter/src/rules/types.ts` — Added EXEC_BLOCK to StatementType
- `packages/SQLConverter/src/rules/ExpressionHelpers.ts` — String concat patterns for all segments
- `packages/SQLConverter/src/rules/ConditionalDDLRule.ts` — Filtered index WHERE clause, BEGIN/END wrapper
- `packages/SQLConverter/src/rules/ProcedureToFunctionRule.ts` — Removed view-existence skip
- `packages/SQLConverter/src/rules/BatchConverter.ts` — EXEC_BLOCK routing
- `packages/SQLConverter/src/rules/TSQLToPostgresRules.ts` — ExecBlockRule registration
- `packages/SQLConverter/src/rules/index.ts` — ExecBlockRule export
- `packages/SQLConverter/src/rules/DialectHeaderBuilder.ts` — Generic header text

### Modified Test Files
- `packages/SQLConverter/src/__tests__/TSQLToPostgresRules.test.ts` — 13 rules, priority 52
- `packages/SQLConverter/src/__tests__/BatchConverter.test.ts` — Header assertion

### Output Files (need reconversion)
- All 15 files in `migrations/pg/v5/*.pg.sql`

## Full Conversion Loop Command

```bash
cd /path/to/MJ
# Build the converter
cd packages/SQLConverter && npm run build && npm run test && cd ../..

# Convert all files
for f in migrations/v5/*.sql; do
  base=$(basename "$f" .sql)
  echo "Converting: $base"
  npx --no mj sql-convert "$f" --from tsql --to postgres -o "migrations/pg/v5/${base}.pg.sql"
done

# Quick verification checks
echo "=== Checking for stale @ID variables ==="
grep -rn '@ID' migrations/pg/v5/*Metadata_Sync*.pg.sql || echo "PASS: No stale @ID"

echo "=== Checking for skipped procedures ==="
grep -rn 'SKIPPED.*Procedure' migrations/pg/v5/*.pg.sql || echo "PASS: No skipped procedures"

echo "=== Checking string concat in Schema_Based_ClassName ==="
grep -n 'GetClassNameSchemaPrefix.*+' migrations/pg/v5/V202602190836*.pg.sql || echo "PASS: No + concat"

echo "=== Checking for sys.indexes ==="
grep -n 'sys\.indexes' migrations/pg/v5/*.pg.sql || echo "PASS: No sys.indexes"
```
