# Phase 14: Production-Grade TS Conversion Pipeline

## YOUR MISSION
Build a production-grade SQL Server → PostgreSQL conversion pipeline entirely in TypeScript. The existing Python script (`scripts/pg_convert_v5_baseline.py`, 1,692 lines, 46 functions) proved the conversion is possible — your job is to port that intelligence into the `@memberjunction/sql-converter` TS package so that any developer can run:

```bash
mj sql-convert migrations/v5/SomeFile.sql --from tsql --to postgres --verify --target-db "postgres://mj_admin:Claude2Pg99@postgres-claude:5432/MJ_Workbench_PG_v3"
```

...and get a perfect, verified PostgreSQL migration file.

## CRITICAL RULES
1. **Work on branch `postgres-5-0-implementation`** — do NOT create a new branch
2. **Commit after EVERY phase** with descriptive messages, then `git push origin postgres-5-0-implementation`
3. **Use the fresh PG database `MJ_Workbench_PG_v3`** (clean, has only `__mj` schema)
4. **Use SQL Server at `sql-claude:1433`** (database `MJ_Workbench`, user `sa`, password from .env) as reference
5. **Do NOT use `any` types in TypeScript** — strong typing throughout
6. **Run `npm run test` in each package after changes** — all tests must pass
7. **The Python script is your reference** — read it thoroughly. Every function there maps to a TS rule you need to create. The script is at `scripts/pg_convert_v5_baseline.py`

## EXISTING PACKAGES (already on this branch)

### @memberjunction/sqlglot-ts (`packages/SQLGlotTS/`)
- TS HTTP client that spawns a Python FastAPI microservice wrapping sqlglot
- Methods: `transpile()`, `transpileStatements()`, `parse()`, `health()`
- Already built and working — the Python server process may still be running on an ephemeral port
- **DO NOT modify this package** unless absolutely necessary

### @memberjunction/sql-converter (`packages/SQLConverter/`)
- `ConversionPipeline` — orchestrates: read → split → transpile → verify → output
- `SQLFileSplitter` — splits on GO/semicolons, respects strings/comments/BEGIN-END
- `types.ts` — interfaces: `ILLMFallback`, `IDatabaseVerifier`, `IDatabaseAuditor`, `StatementResult`
- **THIS IS YOUR MAIN WORKSPACE** — enhance this package with the conversion rules

### CLI Commands (`packages/MJCLI/src/commands/`)
- `mj sql-convert` — already wired to ConversionPipeline
- `mj sql-audit` — already wired to DatabaseAuditRunner

## PHASE 1: Clean Slate Setup (15 min)

1. Verify branch is `postgres-5-0-implementation`, pull latest
2. Verify fresh PG database: `psql -U mj_admin -h postgres-claude -d MJ_Workbench_PG_v3 -c "SELECT current_database();"`
3. Build sqlglot-ts: `cd packages/SQLGlotTS && npm run build`
4. Build sql-converter: `cd packages/SQLConverter && npm run build`
5. Run existing tests: `cd packages/SQLConverter && npm run test`
6. Read the Python script thoroughly: `scripts/pg_convert_v5_baseline.py` (ALL 1,692 lines)
7. Commit: "chore: phase 14.1 — clean slate verified"

## PHASE 2: Build the Conversion Rule System (2-3 hours)

### 2a. Add Rule Interface and Registry

In `packages/SQLConverter/src/`, create:

**`rules/types.ts`** — The rule interface:
```typescript
export interface ConversionContext {
  SourceDialect: string;
  TargetDialect: string;
  Schema: string; // e.g. '__mj'
  /** Accumulated type info from CREATE TABLEs for boolean casting in INSERTs */
  TableColumns: Map<string, Map<string, string>>; // table → (column → pgType)
}

export interface IConversionRule {
  Name: string;
  /** Statement types this rule applies to (e.g. 'CREATE_TABLE', 'INSERT', 'PROCEDURE') */
  AppliesTo: string[];
  /** Transform SQL BEFORE sqlglot transpilation */
  PreProcess?(sql: string, context: ConversionContext): string;
  /** Transform SQL AFTER sqlglot transpilation (or instead of it for types sqlglot can't handle) */
  PostProcess?(sql: string, originalSQL: string, context: ConversionContext): string;
  /** If true, this rule handles conversion entirely — skip sqlglot for this statement */
  BypassSqlglot?: boolean;
}
```

**`rules/StatementClassifier.ts`** — Port `classify_batch()` from Python:
Classify each statement into: `CREATE_TABLE`, `CREATE_VIEW`, `CREATE_INDEX`, `PROCEDURE`, `FUNCTION`, `TRIGGER`, `INSERT`, `UPDATE`, `DELETE`, `ALTER_TABLE_FK`, `ALTER_TABLE_CHECK`, `ALTER_TABLE_NOCHECK`, `GRANT`, `EXTENDED_PROPERTY`, `SET`, `PRINT`, `UNKNOWN`

**`rules/TSQLToPostgresRules.ts`** — Registry that bundles all rules for TSQL→Postgres

### 2b. Port Each Converter from Python → TS

Study the Python script function by function. Create one TS rule class per converter. The critical ones (in priority order):

1. **TypeMappingRule** — Port `map_type()`: UNIQUEIDENTIFIER→UUID, BIT→BOOLEAN, NVARCHAR(n)→VARCHAR(n), NVARCHAR(MAX)→TEXT, DATETIME→TIMESTAMP, DATETIMEOFFSET→TIMESTAMPTZ, FLOAT→DOUBLE PRECISION, TINYINT→SMALLINT, IMAGE→BYTEA, MONEY→NUMERIC(19,4), etc.

2. **CreateTableRule** — Port `convert_create_table()`: Column definitions, constraints, defaults (GETUTCDATE→NOW(), NEWID→gen_random_uuid(), NEWSEQUENTIALID→gen_random_uuid()), computed columns, identity columns→GENERATED ALWAYS AS IDENTITY

3. **ProcedureToFunctionRule** — Port `convert_procedure()`, `convert_proc_params()`, `convert_proc_body()`: This is the HARDEST rule. Stored procedures become functions with RETURNS TABLE or RETURNS void. Handle: parameter conversion (@Name TYPE → Name TYPE), body conversion (DECLARE, SET, IF/ELSE, WHILE, BEGIN/END, temp tables #table → temp tables, @@ROWCOUNT → ROW_COUNT, RAISERROR → RAISE EXCEPTION, OUTPUT INSERTED → RETURNING, SCOPE_IDENTITY → lastval()), etc. The Python script has `convert_proc_body()` which is ~200 lines — port every pattern.

4. **TriggerRule** — Port `convert_trigger()`: CREATE TRIGGER → CREATE OR REPLACE FUNCTION + CREATE TRIGGER. Handle INSERTED/DELETED → NEW/OLD, AFTER/INSTEAD OF triggers.

5. **InsertRule** — Port `convert_insert()`: Boolean casting (0→false, 1→true in BIT columns — needs TableColumns context from CREATE TABLE processing), N'string'→'string' (careful not to corrupt words ending in N), string concatenation +→||

6. **ViewRule** — Port `convert_create_view()`: OUTER APPLY → LEFT JOIN LATERAL, TOP → LIMIT, ISNULL → COALESCE, CAST patterns

7. **FunctionRule** — Port `convert_function()`, `convert_inline_tvf()`, `convert_scalar_function()`: Inline table-valued functions, scalar functions

8. **AlterTableRule** — Port `convert_alter_table()`: FK constraints, CHECK constraints, NOCHECK → (skip or comment)

9. **CreateIndexRule** — Port `convert_create_index()`: INCLUDE → covering index or comment, CLUSTERED → (PG has no clustered)

10. **GrantRule** — Port `convert_grant()`: Schema translation

11. **ExtendedPropertyRule** — Port `convert_extended_property()` → COMMENT ON TABLE/COLUMN

12. **ExpressionConverterRule** — Port all expression helpers: `convert_date_functions()` (DATEADD→interval, DATEDIFF→EXTRACT/age, DATEPART→EXTRACT), `convert_charindex()` (CHARINDEX→POSITION), `convert_stuff()` (STUFF→OVERLAY), `convert_string_concat()` (+→||), `convert_top_to_limit()` (TOP n→LIMIT n), `convert_if_blocks()` (IF→DO/IF in function bodies)

### 2c. Integrate Rules into ConversionPipeline

Modify `ConversionPipeline.Run()` to:
1. Accept a `rules: IConversionRule[]` parameter (or auto-detect from dialect pair)
2. For each statement:
   a. Classify it using `StatementClassifier`
   b. Run matching PreProcess rules
   c. If any matching rule has `BypassSqlglot=true`, use that rule's PostProcess instead of sqlglot
   d. Otherwise, call sqlglot then run PostProcess rules
   e. Update ConversionContext (e.g., track table columns for INSERT boolean casting)

**Commit**: "feat(sql-converter): add conversion rule system with 12 TSQL→Postgres rules"

## PHASE 3: Unit Tests with Mock Data (1-2 hours)

Write comprehensive tests in `packages/SQLConverter/src/__tests__/`:

### Test files to create:
- `StatementClassifier.test.ts` — 20+ tests classifying every statement type
- `TypeMappingRule.test.ts` — 25+ tests for every type mapping
- `CreateTableRule.test.ts` — 15+ tests including constraints, defaults, identity
- `ProcedureToFunctionRule.test.ts` — 30+ tests (simple CRUD proc, complex proc with cursors, temp tables, OUTPUT INSERTED, error handling)
- `TriggerRule.test.ts` — 10+ tests
- `InsertRule.test.ts` — 20+ tests (boolean casting, N' prefix, string concat, NULL handling)
- `ViewRule.test.ts` — 15+ tests (OUTER APPLY, TOP, CTE, ISNULL)
- `ExpressionConverterRule.test.ts` — 20+ tests (DATEADD, CHARINDEX, STUFF, etc.)
- `ConversionPipeline.integration.test.ts` — 15+ tests running full pipeline on small inputs

### Ground truth from the Python script
The Python script went through 32 iterations fixing bugs. Key edge cases to test:
- N' prefix stripping must not corrupt words: `N'Name'` → `'Name'` but `JOIN` stays `JOIN` (lookbehind for non-alpha)
- Boolean casting in INSERT: must know column types from CREATE TABLE context
- `>=(0)` in CHECK constraints must not become `>= false`
- OUTER APPLY with complex subqueries → LEFT JOIN LATERAL
- Recursive CTEs need WITH RECURSIVE keyword
- sp_addextendedproperty with @level2type → COMMENT ON COLUMN
- String concat `+` in INSERT values must not affect `+` in numeric expressions
- Dollar-sign quoting in PG function bodies ($$...$$)

**Target: 200+ test cases, all passing.**

**Commit**: "test(sql-converter): add 200+ unit tests for TSQL→Postgres conversion rules"

## PHASE 4: Small-Scale Integration Test (30-60 min)

1. Implement `PostgresVerifier` class (implements `IDatabaseVerifier`):
   - Connects to PG database
   - Wraps each statement in a transaction
   - If CREATE/ALTER/INSERT succeeds → commit (we want cumulative state)
   - If fails → rollback that statement, return error
2. Extract ~100 diverse statements from `migrations/v5/B202602151200__v5.0__Baseline.sql`:
   - 10 CREATE TABLE statements (simple + complex)
   - 5 ALTER TABLE FK constraints
   - 5 ALTER TABLE CHECK constraints
   - 10 CREATE VIEW statements (simple + OUTER APPLY)
   - 10 stored procedures (simple CRUD + complex)
   - 5 triggers
   - 20 INSERT statements (with boolean values)
   - 10 GRANT statements
   - 5 sp_addextendedproperty
   - 10 CREATE INDEX
   - 10 misc (expressions, functions)
3. Save as `packages/SQLConverter/test-data/sample-100.sql`
4. Run: pipeline with verify=true against MJ_Workbench_PG_v3
5. Fix any failures
6. **All 100 must pass**

**Commit**: "test(sql-converter): 100-statement integration test passing against PostgreSQL"

## PHASE 5: Full Baseline Conversion (1-2 hours)

1. Reset PG database: `DROP SCHEMA __mj CASCADE; CREATE SCHEMA __mj;`
2. Run the full conversion:
   ```bash
   cd packages/MJCLI && npx ts-node src/index.ts sql-convert \
     ../../migrations/v5/B202602151200__v5.0__Baseline.sql \
     --from tsql --to postgres \
     --output ../../migrations/pg/B202602151200__v5.0__Baseline_PG.sql \
     --verbose
   ```
   Or use the pipeline programmatically from a test script.
3. Apply to PG: `psql -U mj_admin -h postgres-claude -d MJ_Workbench_PG_v3 -f migrations/pg/B202602151200__v5.0__Baseline_PG.sql`
4. If errors: fix rules, re-run. Iterate until zero errors.
5. **Target: ZERO psql errors on clean PG database**

**Commit**: "feat(sql-converter): full v5.0 baseline conversion — zero errors"

## PHASE 6: Cross-Database Verification (30-60 min)

Compare SQL Server (MJ_Workbench on sql-claude:1433) vs PostgreSQL (MJ_Workbench_PG_v3 on postgres-claude:5432):

### Automated audit
Run `mj sql-audit` or write a verification script that checks:
1. **Table count**: Both should have 273 tables in __mj schema (274 minus flyway_schema_history)
2. **View count**: Both should have 282 views
3. **Function count**: PG will have more (trigger functions + CRUD functions), but CRUD function count should match stored procedure count
4. **Row counts**: Every table with data should have matching row count

### Manual spot checks (do at least 20)
1. Pick 5 tables, compare column names, types, nullable, defaults
2. Pick 5 stored procedures / PG functions, compare parameter signatures
3. Pick 5 views, verify they return data (SELECT * FROM view LIMIT 5)
4. Pick 5 triggers, verify they exist on correct tables
5. Query specific records: SELECT * FROM __mj."AIModel" LIMIT 3 (compare with SQL Server)

Document all spot check results.

**Commit**: "test(sql-converter): cross-database verification — all checks passing"

## PHASE 7: Incremental Migration Support (30 min)

1. Convert all v5.x incremental migrations through the TS pipeline:
   - V202602131500__v5.0.x__Entity_Name_Normalization_And_ClassName_Prefix_Fix.sql
   - V202602141421__v5.0.x__Add_AllowMultipleSubtypes_to_Entity.sql
   - V202602161825__v5.0.x__Metadata_Sync.sql
   - V202602170015__v5.1__Regenerate_Delete_Stored_Procs.sql
   - V202602171600__v5.0.x__Add_PlatformVariants_Columns.sql
   - V202602171919__v5.1.x__Open_App_Tracking_Tables.sql
2. Apply each to PG in order
3. Verify no errors
4. Re-run audit to confirm counts still match

**Final commit**: "feat(sql-converter): incremental migration support verified"

## CONNECTION STRINGS

- **PostgreSQL**: `postgres://mj_admin:Claude2Pg99@postgres-claude:5432/MJ_Workbench_PG_v3`
- **SQL Server**: Check `.env` in /workspace/MJ for SA_PASSWORD. Connection: `mssql://sa:${SA_PASSWORD}@sql-claude:1433/MJ_Workbench`

## IMPORTANT NOTES

- The Python sqlglot server may already be running (PID 32198). Check with `curl http://127.0.0.1:<port>/health`. If not, `SqlGlotClient.start()` will spawn a new one.
- The v5.0 baseline is at `migrations/v5/B202602151200__v5.0__Baseline.sql` — it is 151K lines, 36MB. Read it in chunks if needed.
- When porting Python regex patterns to TS, remember JS regex differences: no lookbehind in older Node, use `(?<=...)` only if Node 18+ (which we have).
- For the ConversionContext.TableColumns tracking: as the pipeline processes CREATE TABLE statements, it should extract column→type mappings and store them. Later INSERT rules use this to know which columns are BOOLEAN for 0/1→false/true casting.
- The existing `SQLFileSplitter` already handles GO splitting. You may need to enhance it for sub-splitting compound batches (the Python `sub_split_compound_batch()` function).

## DO NOT STOP UNTIL ALL 7 PHASES ARE COMPLETE WITH ZERO ERRORS.
