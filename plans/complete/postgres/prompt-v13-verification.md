# Task: Full Verification — Determinism + Deep Cross-Database Comparison

## YOUR MISSION
Run the complete SQL Server → PostgreSQL conversion pipeline end-to-end, apply the output to a fresh PostgreSQL database, and then perform an exhaustive cross-database comparison between PG and SQL Server to verify 100% correctness. Report every single variance found.

## CRITICAL RULES
1. **Work on branch `postgres-5-0-implementation`** — do NOT create a new branch
2. **DO NOT modify any conversion rule source files** — this is a READ-ONLY verification task
3. **If you find variances, DOCUMENT them** — do not attempt to fix them
4. **Commit a verification report** at the end
5. **Git push** when done: `git push origin postgres-5-0-implementation`

## CONNECTION STRINGS
- **PostgreSQL**: `postgres://mj_admin:Claude2Pg99@postgres-claude:5432/` (create new DB `MJ_Workbench_PG_v4`)
- **SQL Server**: `sa:Claude2Sql99@sql-claude:1433/MJ_Workbench`
- Use `/opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P "Claude2Sql99" -d MJ_Workbench -C` for SQL Server queries
- Use `PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d mj_workbench_pg_v4` for PG queries

## PHASE 1: Determinism + Correctness (Fresh Conversion)

### Step 1.1: Save Reference Output
```bash
cp /workspace/MJ/migrations/pg/B202602151200__v5.0__Baseline_PG.sql /workspace/MJ/migrations/pg/B202602151200__v5.0__Baseline_PG_REFERENCE.sql
```

### Step 1.2: Re-run Full Conversion Pipeline
Build the SQLConverter package and re-run the baseline conversion:
```bash
cd /workspace/MJ/packages/SQLConverter && npm run build
```
Then run the conversion programmatically:
```javascript
const { convertFile } = require('./dist/rules/BatchConverter.js');
const { getTSQLToPostgresRules } = require('./dist/rules/index.js');
const result = convertFile({
  Source: '/workspace/MJ/migrations/v5/B202602151200__v5.0__Baseline.sql',
  SourceIsFile: true,
  OutputFile: '/workspace/MJ/migrations/pg/B202602151200__v5.0__Baseline_PG.sql',
  Rules: getTSQLToPostgresRules(),
  IncludeHeader: true,
});
console.log('Batches:', result.Stats.TotalBatches, 'Converted:', result.Stats.Converted, 'Errors:', result.Stats.Errors);
```

### Step 1.3: Verify Determinism
```bash
diff /workspace/MJ/migrations/pg/B202602151200__v5.0__Baseline_PG_REFERENCE.sql /workspace/MJ/migrations/pg/B202602151200__v5.0__Baseline_PG.sql
```
The diff MUST be empty. If there are differences, document them.

### Step 1.4: Create Fresh PG Database and Apply
```bash
PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d postgres -c "DROP DATABASE IF EXISTS mj_workbench_pg_v4;"
PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d postgres -c "CREATE DATABASE mj_workbench_pg_v4;"
```

Apply the baseline:
```bash
PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d mj_workbench_pg_v4 -f /workspace/MJ/migrations/pg/B202602151200__v5.0__Baseline_PG.sql 2>&1 | grep "ERROR:" | wc -l
```
Must be 0 errors.

Then apply ALL 6 incremental migrations in order:
1. V202602131500__v5.0.x__Entity_Name_Normalization_And_ClassName_Prefix_Fix_PG.sql
2. V202602141421__v5.0.x__Add_AllowMultipleSubtypes_to_Entity_PG.sql
3. V202602161825__v5.0.x__Metadata_Sync_PG.sql
4. V202602170015__v5.1__Regenerate_Delete_Stored_Procs_PG.sql
5. V202602171600__v5.0.x__Add_PlatformVariants_Columns_PG.sql
6. V202602171919__v5.1.x__Open_App_Tracking_Tables_PG.sql

Each must have 0 errors.

Report: Total errors across baseline + all incrementals.

## PHASE 2: Exhaustive Cross-Database Comparison

Compare SQL Server (`MJ_Workbench` on sql-claude) vs PostgreSQL (`mj_workbench_pg_v4` on postgres-claude).

### Step 2.1: Table-Level Comparison
1. Get list of ALL tables in `__mj` schema from both databases
2. Compare: identify tables present in SQL Server but missing from PG, and vice versa
3. For EVERY table present in both:
   - Compare column count
   - Compare column names (case-sensitive)
   - Compare column types (with correct mapping: uniqueidentifier→uuid, bit→boolean, nvarchar→varchar, etc.)
   - Compare nullability
   - Compare default values where meaningful
4. Output a report showing:
   - Total tables compared
   - Tables with mismatches (list each mismatch)
   - Tables that match perfectly

### Step 2.2: Row Count Comparison
1. For EVERY table in `__mj` schema that exists in both databases:
   - Get row count from SQL Server
   - Get row count from PG
   - Compare
2. Output a report:
   - Total tables compared
   - Tables with matching row counts
   - Tables with DIFFERENT row counts (list each with both counts)

### Step 2.3: Row-Level Data Comparison
For tables that have data (row count > 0), do a thorough spot check:
1. Pick the **top 20 tables by row count** (the most important ones)
2. For each table:
   - SELECT all rows ordered by primary key
   - Compare the first 10 rows column by column between SQL Server and PG
   - Report any value differences (accounting for type differences like bit→boolean display)
3. Additionally, for these critical tables, do a **full hash comparison**:
   - In SQL Server: `SELECT CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM __mj.TableName`
   - In PG: `SELECT md5(string_agg(t::text, ',' ORDER BY "ID")) FROM __mj."TableName" t`
   - (The hashes won't match due to different algorithms, but use this to verify row ordering)
4. Output: List of any data discrepancies found

### Step 2.4: View Comparison
1. List ALL views in `__mj` schema from both databases
2. Identify views in SQL Server but missing from PG (expected: sys.* catalog views will be missing)
3. For every view that EXISTS in both:
   - Run `SELECT count(*) FROM view` on both
   - Compare counts
   - For the first 5 views, compare column names
4. Output: view count comparison, any mismatches

### Step 2.5: Function/Stored Procedure Mapping
1. Get ALL stored procedures from SQL Server `__mj` schema
2. Get ALL functions from PG `__mj` schema
3. For each SQL Server stored procedure:
   - Check if a corresponding PG function exists (same name)
   - Compare parameter count and types
4. Report:
   - Total SP count (SQL Server) vs function count (PG)
   - SPs with matching PG functions
   - SPs WITHOUT matching PG functions (list each)
   - Extra PG functions (trigger functions, etc.)

### Step 2.6: Trigger Comparison
1. List all triggers in SQL Server `__mj` schema
2. List all triggers in PG `__mj` schema
3. Compare:
   - Triggers present in both
   - Triggers missing from PG
   - Extra triggers in PG
   - For matching triggers: verify they're on the same table

### Step 2.7: Index Comparison
1. List all non-clustered indexes in SQL Server `__mj` schema
2. List all indexes in PG `__mj` schema
3. Compare:
   - Index count
   - For each SQL Server index, check if PG has a corresponding index on the same table/columns
   - Report missing indexes

## PHASE 3: Generate Verification Report

Create a comprehensive markdown report at:
`/workspace/MJ/packages/SQLConverter/VERIFICATION_REPORT.md`

Structure:
```markdown
# SQL Converter Verification Report
Generated: [date]

## Summary
- Determinism: PASS/FAIL
- Baseline errors: X
- Incremental errors: X
- Tables matched: X/Y
- Row counts matched: X/Y
- Data verified: X tables
- Functions mapped: X/Y
- Views matched: X/Y
- Triggers matched: X/Y

## Phase 1: Determinism & Correctness
[details]

## Phase 2: Cross-Database Comparison

### 2.1 Table Schema Comparison
[table-by-table results]

### 2.2 Row Count Comparison
[all tables with counts]

### 2.3 Data Comparison
[spot check results]

### 2.4 View Comparison
[results]

### 2.5 Function/SP Mapping
[results]

### 2.6 Trigger Comparison
[results]

### 2.7 Index Comparison
[results]

## Variances Found
[detailed list of every variance with explanation]

## Conclusion
[overall assessment]
```

## DELIVERABLE
1. Fresh PG database with 0-error application
2. Determinism verified (diff is empty)
3. Comprehensive verification report committed and pushed
4. Git commit: "test(sql-converter): exhaustive cross-database verification report — [PASS/FAIL]"

## IMPORTANT NOTES
- SQL Server uses `sqlcmd` with `-C` flag (trust server cert) and `-h -1` for clean output
- PG uses `psql` with `-t` for tuples-only output
- When comparing column types, account for the known mappings (uniqueidentifier→uuid, bit→boolean, nvarchar→character varying, etc.)
- The 7 missing views (vwEntityFieldsWithCheckConstraints, vwForeignKeys, vwSQLColumnsAndEntityFields, vwSQLSchemas, vwSQLTablesAndEntities, vwTablePrimaryKeys, vwTableUniqueKeys) are EXPECTED to be missing — they query sys.* catalog tables
- EntityField may have +1 row in PG due to incremental migrations
- UserRole may differ slightly if incremental data differs
- Run the data comparison in batches to avoid memory issues — don't try to SELECT * from large tables all at once

## DO NOT STOP UNTIL THE FULL REPORT IS GENERATED, COMMITTED, AND PUSHED.
