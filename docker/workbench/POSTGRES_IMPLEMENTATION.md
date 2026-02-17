# PostgreSQL Implementation - Instructions for Docker Claude Code Agent

## Your Mission

You are a Claude Code agent running inside the MemberJunction Docker workbench. Your task is to implement PostgreSQL support for MemberJunction following the detailed plan at `/workspace/MJ/plans/multi-database-platform-support.md`.

**Read that plan file thoroughly before starting any work.**

## Environment

You have access to TWO databases:

### SQL Server (existing MJ installation)
- **Host**: `sql-claude`
- **Port**: `1433`
- **User**: `sa`
- **Password**: `Claude2Sql99`
- **Database**: `MJ_Workbench`
- **CLI**: `sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -d MJ_Workbench`

### PostgreSQL (empty, for your work)
- **Host**: `postgres-claude`
- **Port**: `5432`
- **User**: `mj_admin`
- **Password**: `Claude2Pg99`
- **Database**: `MJ_Workbench_PG`
- **Schema**: `__mj` (created by init scripts)
- **CLI**: `PGPASSWORD=Claude2Pg99 psql -h postgres-claude -U mj_admin -d MJ_Workbench_PG`

Use the shell aliases `sqlmj`, `pgcli`, `pgq`, `pgtables`, `pgcount` etc. for quick access.

## Step 0: Setup

```bash
cd /workspace/MJ
git checkout next
git pull origin next
git checkout -b postgres-implementation
git push -u origin postgres-implementation
```

## Step 1: Bootstrap SQL Server (Reference Database)

First, get the SQL Server database fully set up so you have a reference:

```bash
db-bootstrap
```

This creates `MJ_Workbench` on SQL Server and runs all Flyway migrations including the v4.0 baseline. After this completes, you can query SQL Server to understand the complete schema:

```bash
# Count tables, views, procedures, functions
sqlq "SELECT COUNT(*) AS tables FROM sys.tables WHERE schema_id = SCHEMA_ID('__mj')"
sqlq "SELECT COUNT(*) AS views FROM sys.views WHERE schema_id = SCHEMA_ID('__mj')"
sqlq "SELECT COUNT(*) AS procs FROM sys.procedures WHERE schema_id = SCHEMA_ID('__mj')"
```

This SQL Server database is your **ground truth reference** throughout this project.

## Step 2: Convert the Baseline Migration to PostgreSQL

This is the biggest deliverable. The v4.0 baseline is at:
```
/workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql
```

This is a ~138,000 line T-SQL script. You need to create an equivalent PostgreSQL script at:
```
/workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql
```

### Conversion Rules

1. **Schema**: Keep `__mj` schema (already created by pg-init)
2. **Tables**: Convert all `CREATE TABLE` statements
   - `UNIQUEIDENTIFIER` → `UUID`
   - `NVARCHAR(n)` → `VARCHAR(n)`
   - `NVARCHAR(MAX)` → `TEXT`
   - `INT` → `INTEGER`
   - `BIT` → `BOOLEAN`
   - `DATETIMEOFFSET` → `TIMESTAMPTZ`
   - `DATETIME2` / `DATETIME` → `TIMESTAMP`
   - `FLOAT(53)` → `DOUBLE PRECISION`
   - `MONEY` → `NUMERIC(19,4)`
   - `TINYINT` → `SMALLINT`
   - `IMAGE` → `BYTEA`
   - `VARBINARY(MAX)` → `BYTEA`
   - `NEWSEQUENTIALID()` → `gen_random_uuid()`
   - `GETUTCDATE()` / `GETDATE()` → `NOW() AT TIME ZONE 'UTC'`
   - `IDENTITY(1,1)` → `GENERATED ALWAYS AS IDENTITY`
   - Square brackets `[name]` → double quotes `"name"` (only when needed; PG lowercases unquoted identifiers)
   - Keep PascalCase table names with quotes: `__mj."User"` (to match entity names)

3. **Views**: Convert all `CREATE VIEW` statements
   - `ISNULL()` → `COALESCE()`
   - `IIF(cond, true, false)` → `CASE WHEN cond THEN true ELSE false END`
   - `OUTER APPLY` → `LEFT JOIN LATERAL ... ON true`
   - `SELECT TOP 1` → `LIMIT 1` at end
   - Square bracket identifiers → double-quote identifiers
   - Remove `GO` batch separators
   - Use `CREATE OR REPLACE VIEW`

4. **Stored Procedures → Functions**: Convert all `CREATE PROCEDURE` to `CREATE FUNCTION`
   - `spCreate*` → `fn_create_*` returning `SETOF view_name`
   - `spUpdate*` → `fn_update_*` returning `SETOF view_name`
   - `spDelete*` → `fn_delete_*` returning `void` or integer
   - Use `LANGUAGE plpgsql`
   - `@Param NVARCHAR(100)` → `p_param VARCHAR(100)`
   - `SCOPE_IDENTITY()` → `RETURNING "ID" INTO new_id`
   - `OUTPUT INSERTED.*` → `RETURN QUERY SELECT * FROM view WHERE "ID" = new_id`
   - `SET NOCOUNT ON` → remove (not needed in PG)
   - `@@ROWCOUNT` → `FOUND` or `GET DIAGNOSTICS row_count = ROW_COUNT`
   - T-SQL `BEGIN TRY / END TRY / BEGIN CATCH / END CATCH` → PG `BEGIN / EXCEPTION WHEN OTHERS THEN / END`

5. **Triggers**: Convert all triggers
   - PG triggers need a companion function: `CREATE FUNCTION fn_trg_*() RETURNS TRIGGER`
   - Use `BEFORE UPDATE` (more efficient than SQL Server's `AFTER UPDATE`)
   - `GETUTCDATE()` → `NOW() AT TIME ZONE 'UTC'`
   - Set `NEW.__mj_UpdatedAt` and `RETURN NEW`

6. **Indexes**: Convert all `CREATE INDEX` statements
   - Remove `IF NOT EXISTS (SELECT 1 FROM sys.indexes ...)` guards
   - Use `CREATE INDEX IF NOT EXISTS`
   - Remove square brackets

7. **Permissions**: Convert `GRANT` statements
   - `GRANT SELECT ON [schema].[view] TO [role]` → `GRANT SELECT ON __mj."view" TO role`
   - PG role names are lowercase and unquoted by default

8. **Functions (TVFs)**: Convert inline table-valued functions
   - `CREATE FUNCTION ... RETURNS TABLE` → `CREATE FUNCTION ... RETURNS TABLE(columns) AS $$ ... $$ LANGUAGE sql`
   - Recursive CTEs work the same in PG (use `WITH RECURSIVE` keyword)

9. **Remove/Skip**:
   - `GO` batch separators (not needed in PG)
   - `SET NOCOUNT ON`, `SET XACT_ABORT ON`, `SET NOEXEC ON`
   - `IF @@ERROR <> 0 SET NOEXEC ON`
   - `EXEC sp_addextendedproperty` → Convert to `COMMENT ON TABLE/COLUMN`
   - `EXEC sp_refreshview` → Not needed in PG (CREATE OR REPLACE handles this)
   - Full-text catalog/index creation → Replace with tsvector/GIN approach

### Approach

Given the size (~138K lines), work systematically:

1. **First pass**: Extract and convert all `CREATE TABLE` statements with their constraints, in dependency order (FKs reference other tables)
2. **Second pass**: Convert all `CREATE VIEW` statements
3. **Third pass**: Convert CRUD stored procedures → functions
4. **Fourth pass**: Convert triggers
5. **Fifth pass**: Convert indexes
6. **Sixth pass**: Convert permissions
7. **Seventh pass**: Convert utility functions (recursive TVFs, etc.)
8. **Eighth pass**: Convert seed data (`INSERT` statements)

After each pass, run the generated SQL against PostgreSQL to validate:
```bash
PGPASSWORD=Claude2Pg99 psql -h postgres-claude -U mj_admin -d MJ_Workbench_PG \
    -f /workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql \
    -v ON_ERROR_STOP=1
```

### Validation

After the full baseline runs, compare the schema:

```bash
# SQL Server table count
sqlq "SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('__mj')"

# PostgreSQL table count
pgq "SELECT COUNT(*) FROM pg_tables WHERE schemaname = '__mj';"

# SQL Server view count
sqlq "SELECT COUNT(*) FROM sys.views WHERE schema_id = SCHEMA_ID('__mj')"

# PostgreSQL view count
pgq "SELECT COUNT(*) FROM pg_views WHERE schemaname = '__mj';"

# Compare specific table structures
sqlq "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '__mj' AND TABLE_NAME = 'Entity' ORDER BY ORDINAL_POSITION"
pgq "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = '__mj' AND table_name = 'Entity' ORDER BY ordinal_position;"
```

The goal: **identical table/view/function counts and matching column structures** between SQL Server and PostgreSQL.

## Step 3: Incremental Migrations

After the baseline, convert the incremental v4 migrations:
```
migrations/v4/V202602010015__v4.0.x__Version_Label_System.sql
migrations/v4/V202602021200__v4.0.x__OAuth_Token_Use_CredentialEngine.sql
...etc
```

Place these at:
```
migrations-postgres/V202602010015__v4.0.x__Version_Label_System.sql
migrations-postgres/V202602021200__v4.0.x__OAuth_Token_Use_CredentialEngine.sql
```

## Step 4: Repeatable Migration

Convert `migrations/R__RefreshMetadata.sql` to its PostgreSQL equivalent. The SQL Server version calls system stored procedures; the PG version calls equivalent functions.

## Step 5: Provider Architecture (After Migrations Are Solid)

Once the PostgreSQL database has a complete and validated schema matching SQL Server:

1. Create `@memberjunction/sql-dialect` package (Phase 1 of the plan)
2. Create `@memberjunction/postgresql-dataprovider` package (Phase 2)
3. Refactor `SQLServerDataProvider` to use the dialect abstraction
4. Implement `PostgreSQLDataProvider` with `pg` driver

## Step 6: CodeGen (After Providers Work)

Refactor CodeGen to use the provider architecture (Phase 3 of the plan). Test by:
1. Adding a test table to PostgreSQL
2. Running CodeGen against PG → verify it generates correct functions/views/triggers
3. Running CodeGen against SQL Server → verify existing behavior unchanged
4. Compare CodeGen output for both platforms

## Commit Strategy

Make frequent, well-described commits as you complete each piece:
- `feat(postgres): add baseline migration - tables`
- `feat(postgres): add baseline migration - views`
- `feat(postgres): add baseline migration - CRUD functions`
- `feat(postgres): add baseline migration - triggers and indexes`
- `feat(postgres): validate baseline against PostgreSQL`
- etc.

Push regularly. This is a long-running project - don't lose work.

## Important Notes

- **The SQL Server database is your reference** - query it whenever you need to understand schema details
- **Test incrementally** - don't write 100K lines and then try to run it all. Build up piece by piece.
- **The plan file has all the architectural details** - read `/workspace/MJ/plans/multi-database-platform-support.md` carefully
- **Use PascalCase table names with quotes** in PG to match MJ entity names (e.g., `__mj."Entity"`, `__mj."EntityField"`)
- **Functions use snake_case** in PG: `fn_create_entity`, `fn_update_entity`, `fn_delete_entity`
- **Views use snake_case with vw_ prefix**: `__mj.vw_entities`, `__mj.vw_entity_fields`
