# Task: Add CatalogViewRule + Fix Trigger Prefix Bug

## YOUR MISSION
Add a new deterministic conversion rule (`CatalogViewRule`) that converts 7 MemberJunction metadata wrapper views from SQL Server `sys.*` catalog queries to PostgreSQL `pg_catalog`/`information_schema` equivalents. Also fix the TriggerRule to handle the `tr_` prefix (not just `trg` prefix). Then re-run the full pipeline, apply to a fresh PG database, and verify.

## CRITICAL RULES
1. **Work on branch `postgres-5-0-implementation`** — do NOT create a new branch
2. **Commit after each major milestone** with descriptive messages
3. **Run `npm run test` after changes** — all tests must pass (existing 586 + new ones)
4. **Git push** when done: `git push origin postgres-5-0-implementation`

## CONNECTION STRINGS
- **PostgreSQL**: `PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d mj_workbench_clean`
- **SQL Server**: `/opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P "Claude2Sql99" -d MJ_Workbench_Clean -C`

## PART 1: CatalogViewRule

### What It Does
The SQL Server baseline contains 7 views in `__mj` schema that wrap SQL Server system catalog tables (`sys.tables`, `sys.columns`, etc.) to provide metadata about the database schema. These views are used by MemberJunction's CodeGen system. The current converter skips them because it can't mechanically convert `sys.*` references. Your job is to create hand-written PostgreSQL equivalents.

### The 7 Views to Convert

Each view below needs a PostgreSQL equivalent that returns the **same columns with the same names** (or as close as possible), using `pg_catalog` and `information_schema` instead of `sys.*`.

#### 1. `vwSQLTablesAndEntities`
**Purpose**: Lists all tables/views with their corresponding MJ Entity metadata.
**SQL Server source** (queries `sys.all_objects`, `sys.schemas`, `sys.extended_properties`):
```sql
CREATE VIEW [__mj].[vwSQLTablesAndEntities]
AS
SELECT
    e.ID EntityID,
    e.Name EntityName,
    e.VirtualEntity,
    t.name TableName,
    s.name SchemaName,
    t.*,
    v.object_id view_object_id,
    v.name ViewName,
    EP_Table.value AS TableDescription,
    EP_View.value AS ViewDescription,
    COALESCE(EP_View.value, EP_Table.value) AS EntityDescription
FROM
    sys.all_objects t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
LEFT OUTER JOIN [__mj].Entity e ON t.name = e.BaseTable AND s.name = e.SchemaName
LEFT OUTER JOIN sys.all_objects v ON e.BaseView = v.name AND v.type = 'V' AND v.schema_id = s.schema_id
LEFT OUTER JOIN sys.schemas s_v ON v.schema_id = s_v.schema_id
LEFT OUTER JOIN sys.extended_properties EP_Table
    ON EP_Table.major_id = t.object_id AND EP_Table.minor_id = 0 AND EP_Table.name = 'MS_Description'
LEFT OUTER JOIN sys.extended_properties EP_View
    ON EP_View.major_id = v.object_id AND EP_View.minor_id = 0 AND EP_View.name = 'MS_Description'
WHERE
    (s_v.name = e.SchemaName OR s_v.name IS NULL) AND
    ( t.TYPE = 'U' OR (t.Type='V' AND e.VirtualEntity=1))
```
**PG equivalent approach**: Use `pg_catalog.pg_class` (relkind IN ('r','v')), `pg_catalog.pg_namespace`, `pg_catalog.pg_description`, joined to `__mj."Entity"`. The `t.*` expansion is tricky — you should select specific commonly-used columns from pg_class instead (like `oid as object_id`, `relname as name`, `relnamespace as schema_id`, `relkind as type`). The key output columns are: EntityID, EntityName, VirtualEntity, TableName, SchemaName, ViewName, TableDescription, ViewDescription, EntityDescription, object_id, view_object_id, name, schema_id, type.

#### 2. `vwForeignKeys`
**Purpose**: Lists all foreign key relationships.
**SQL Server source** (queries `sys.foreign_key_columns`, `sys.objects`, `sys.tables`, `sys.columns`, `sys.schemas`):
```sql
CREATE VIEW [__mj].[vwForeignKeys]
AS
SELECT
    obj.name AS FK_NAME,
    sch.name AS [schema_name],
    tab1.name AS [table],
    col1.name AS [column],
    sch2.name AS [referenced_schema],
    tab2.name AS [referenced_table],
    col2.name AS [referenced_column]
FROM sys.foreign_key_columns fkc
INNER JOIN sys.objects obj ON obj.object_id = fkc.constraint_object_id
INNER JOIN sys.tables tab1 ON tab1.object_id = fkc.parent_object_id
INNER JOIN sys.schemas sch ON tab1.schema_id = sch.schema_id
INNER JOIN sys.columns col1 ON col1.column_id = parent_column_id AND col1.object_id = tab1.object_id
INNER JOIN sys.tables tab2 ON tab2.object_id = fkc.referenced_object_id
INNER JOIN sys.columns col2 ON col2.column_id = referenced_column_id AND col2.object_id = tab2.object_id
INNER JOIN sys.schemas sch2 ON tab2.schema_id = sch2.schema_id
```
**PG equivalent approach**: Use `information_schema.referential_constraints` + `information_schema.key_column_usage`, or use `pg_catalog.pg_constraint` (contype='f') with `pg_catalog.pg_attribute`. Output columns: FK_NAME, schema_name, table, column, referenced_schema, referenced_table, referenced_column.

#### 3. `vwTablePrimaryKeys`
**Purpose**: Lists primary key columns for all tables.
```sql
CREATE VIEW [__mj].[vwTablePrimaryKeys] AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.indexes i ON t.object_id = i.object_id
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
WHERE i.is_primary_key = 1;
```
**PG equivalent approach**: Use `pg_catalog.pg_index` (indisprimary=true) + `pg_catalog.pg_attribute` + `pg_catalog.pg_class` + `pg_catalog.pg_namespace`. Or use `information_schema.table_constraints` (constraint_type='PRIMARY KEY') + `information_schema.key_column_usage`.

#### 4. `vwTableUniqueKeys`
**Purpose**: Lists unique constraint columns (excluding primary keys).
```sql
CREATE VIEW [__mj].[vwTableUniqueKeys] AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.indexes i ON t.object_id = i.object_id
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
WHERE i.is_unique = 1 AND i.is_primary_key = 0;
```
**PG equivalent**: Same approach as PrimaryKeys but with `indisunique=true AND indisprimary=false`.

#### 5. `vwSQLSchemas`
**Purpose**: Lists database schemas with descriptions.
```sql
CREATE VIEW [__mj].[vwSQLSchemas]
AS
SELECT
    s.schema_id AS SchemaID,
    s.name AS SchemaName,
    CAST(EP.value AS NVARCHAR(MAX)) AS SchemaDescription
FROM sys.schemas s
LEFT OUTER JOIN sys.extended_properties EP
    ON EP.major_id = s.schema_id AND EP.minor_id = 0 AND EP.class = 3 AND EP.name = 'MS_Description'
LEFT OUTER JOIN sys.database_principals dp ON s.principal_id = dp.principal_id
WHERE s.schema_id > 4
    AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
    AND (dp.type IS NULL OR dp.type <> 'R')
    AND (dp.is_fixed_role IS NULL OR dp.is_fixed_role = 0)
```
**PG equivalent**: Use `pg_catalog.pg_namespace` + `pg_catalog.pg_description` (objoid=oid, classoid='pg_namespace'::regclass). Filter out system schemas (pg_*, information_schema).

#### 6. `vwSQLColumnsAndEntityFields`
**Purpose**: Comprehensive column metadata joined with MJ EntityField records.
This is the most complex view. It uses a CTE on `sys.all_columns`, joins to `vwSQLTablesAndEntities`, `sys.types`, `sys.computed_columns`, `sys.default_constraints`, `sys.extended_properties`, and `__mj.EntityField`.
**PG equivalent approach**: Use `information_schema.columns` for most metadata, `pg_catalog.pg_attrdef` for defaults, `pg_catalog.pg_description` for comments. Join to `__mj."Entity"` and `__mj."EntityField"`. Key output columns: EntityID, Entity, SchemaName, TableName, EntityFieldID, EntityFieldSequence, EntityFieldName, Sequence, FieldName, Type, Length, Precision, Scale, AllowsNull, AutoIncrement, IsVirtual, DefaultValue, Description.

#### 7. `vwEntityFieldsWithCheckConstraints`
**Purpose**: Links check constraints to EntityField records.
Uses `sys.check_constraints`, `sys.objects`, `sys.schemas`, `sys.columns`, joined to `__mj.Entity`, `__mj.EntityField`, `__mj.vwGeneratedCodes`.
**PG equivalent**: Use `pg_catalog.pg_constraint` (contype='c') + `information_schema.check_constraints`. Output: EntityID, EntityName, EntityFieldID, EntityFieldName, SchemaName, TableName, ColumnName, ConstraintName, ConstraintDefinition, plus GeneratedCode fields.

### SKIP: `vwFlywayVersionHistoryParsed`
This view queries `flyway_schema_history` which is SQL Server-specific (PG uses its own migration tracking). **Comment it out** with an explanation, or skip it in the converter.

### Implementation Strategy

Create `packages/SQLConverter/src/rules/CatalogViewRule.ts`:

```typescript
export class CatalogViewRule implements IConversionRule {
    Name = 'CatalogViewRule';
    AppliesTo = ['CREATE_VIEW'];
    Priority = 15; // Run BEFORE the general ViewRule (priority 20)
    BypassSqlglot = true; // We provide the full PG SQL ourselves

    // Map of SQL Server view name → hand-written PG CREATE VIEW statement
    private readonly catalogViews: Map<string, string> = new Map([
        ['vwSQLTablesAndEntities', `CREATE OR REPLACE VIEW __mj."vwSQLTablesAndEntities" AS ...`],
        ['vwForeignKeys', `CREATE OR REPLACE VIEW __mj."vwForeignKeys" AS ...`],
        // etc.
    ]);

    PostProcess(sql: string, originalSQL: string, context: ConversionContext): string {
        // Check if this CREATE VIEW matches one of our catalog views
        for (const [viewName, pgSQL] of this.catalogViews) {
            if (originalSQL.includes(viewName)) {
                return pgSQL;
            }
        }
        return sql; // Not a catalog view, pass through
    }
}
```

**CRITICAL**: The PostgreSQL view definitions MUST:
1. Return the same column names as the SQL Server versions
2. Use proper PG quoting for identifiers
3. Handle the `__mj` schema correctly
4. Work against the actual PG database structure

**VERIFY** each PG view works by running it against the `mj_workbench_clean` PostgreSQL database.

## PART 2: Fix TriggerRule for `tr_` Prefix

The TriggerRule currently only handles triggers with the `trg` prefix (CodeGen-generated triggers). The `tr_APIScope_UpdateFullPath` trigger uses a `tr_` prefix (hand-written trigger).

### Investigation
1. Read `packages/SQLConverter/src/rules/TriggerRule.ts`
2. Find where it filters/matches trigger names
3. Fix it to handle ANY trigger name pattern, not just `trg*`

### The Trigger to Convert
```sql
CREATE TRIGGER [__mj].[tr_APIScope_UpdateFullPath]
ON [__mj].[APIScope]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF TRIGGER_NESTLEVEL() > 1 RETURN;
    IF UPDATE(Name) OR UPDATE(ParentID) OR NOT EXISTS (SELECT 1 FROM deleted)
    BEGIN
        ;WITH ScopePaths AS (
            SELECT ID, Name, ParentID,
                CAST(Name AS NVARCHAR(500)) AS ComputedPath
            FROM __mj.APIScope WHERE ParentID IS NULL
            UNION ALL
            SELECT s.ID, s.Name, s.ParentID,
                CAST(sp.ComputedPath + ':' + s.Name AS NVARCHAR(500)) AS ComputedPath
            FROM __mj.APIScope s
            INNER JOIN ScopePaths sp ON s.ParentID = sp.ID
        )
        UPDATE s SET FullPath = sp.ComputedPath
        FROM __mj.APIScope s
        INNER JOIN ScopePaths sp ON s.ID = sp.ID
        WHERE s.FullPath != sp.ComputedPath OR s.FullPath IS NULL;
    END
END
```

**PG equivalent** needs:
1. `TRIGGER_NESTLEVEL()` → use `pg_trigger_depth()`
2. `UPDATE(Name)` → check `NEW.Name IS DISTINCT FROM OLD.Name` (only in UPDATE triggers, not INSERT)
3. `deleted` pseudo-table → `OLD` (only available in UPDATE/DELETE)
4. `NOT EXISTS (SELECT 1 FROM deleted)` → this checks if it's an INSERT (no deleted rows) — use `TG_OP = 'INSERT'`
5. String concatenation `+` → `||`
6. `CAST(... AS NVARCHAR(500))` → `CAST(... AS VARCHAR(500))`
7. Recursive CTE works the same in PG (WITH RECURSIVE)

The PG version should be a trigger function + trigger:
```sql
CREATE OR REPLACE FUNCTION __mj."tr_APIScope_UpdateFullPath_fn"()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' OR NEW."Name" IS DISTINCT FROM OLD."Name" OR NEW."ParentID" IS DISTINCT FROM OLD."ParentID" THEN
        WITH RECURSIVE "ScopePaths" AS (
            SELECT "ID", "Name", "ParentID",
                CAST("Name" AS VARCHAR(500)) AS "ComputedPath"
            FROM __mj."APIScope" WHERE "ParentID" IS NULL
            UNION ALL
            SELECT s."ID", s."Name", s."ParentID",
                CAST(sp."ComputedPath" || ':' || s."Name" AS VARCHAR(500)) AS "ComputedPath"
            FROM __mj."APIScope" s
            INNER JOIN "ScopePaths" sp ON s."ParentID" = sp."ID"
        )
        UPDATE __mj."APIScope" s SET "FullPath" = sp."ComputedPath"
        FROM "ScopePaths" sp WHERE s."ID" = sp."ID"
        AND (s."FullPath" != sp."ComputedPath" OR s."FullPath" IS NULL);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tr_APIScope_UpdateFullPath"
AFTER INSERT OR UPDATE ON __mj."APIScope"
FOR EACH ROW
EXECUTE FUNCTION __mj."tr_APIScope_UpdateFullPath_fn"();
```

## PART 3: Re-run Pipeline and Verify

1. Build SQLConverter: `cd /workspace/MJ/packages/SQLConverter && npm run build`
2. Run all tests: `npm run test` — must pass (586 existing + new)
3. Re-run conversion:
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
4. Create fresh PG database:
```bash
PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d postgres -c "DROP DATABASE IF EXISTS mj_workbench_clean;"
PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d postgres -c "CREATE DATABASE mj_workbench_clean;"
```
5. Apply baseline:
```bash
PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d mj_workbench_clean -f /workspace/MJ/migrations/pg/B202602151200__v5.0__Baseline_PG.sql 2>&1 | grep "ERROR:" | wc -l
```
Must be 0 errors.

6. Apply 4 post-baseline incrementals (NOT V202602131500 or V202602141421):
```bash
for f in \
  V202602161825__v5.0.x__Metadata_Sync_PG.sql \
  V202602170015__v5.1__Regenerate_Delete_Stored_Procs_PG.sql \
  V202602171600__v5.0.x__Add_PlatformVariants_Columns_PG.sql \
  V202602171919__v5.1.x__Open_App_Tracking_Tables_PG.sql; do
  ERRS=$(PGPASSWORD='Claude2Pg99' psql -h postgres-claude -U mj_admin -d mj_workbench_clean -f "/workspace/MJ/migrations/pg/$f" 2>&1 | grep "ERROR:" | wc -l)
  echo "$f: $ERRS errors"
done
```
All must be 0 errors.

7. Compare against SQL Server `MJ_Workbench_Clean`:
```bash
# Run /tmp/compare.sh which is already set up
bash /tmp/compare.sh
```

**Target**: 276/276 tables match, 276/276 row counts match, views 278 vs 278 (or 285 vs 278 with 7 matching + vwFlywayVersionHistoryParsed skipped), triggers 275 vs 275.

## PART 4: Tests

Add tests for the new CatalogViewRule in `packages/SQLConverter/src/__tests__/CatalogViewRule.test.ts`:
- Test that each of the 7 views is recognized and converted
- Test that non-catalog views pass through unchanged
- Test that the PG output contains expected pg_catalog references
- Test that vwFlywayVersionHistoryParsed is handled (skipped/commented)

Add tests for the trigger fix:
- Test that `tr_` prefix triggers are converted (not just `trg` prefix)
- Test the specific `tr_APIScope_UpdateFullPath` conversion

**Target: All existing 586 tests pass + new tests pass.**

## PART 5: Commit and Push

Commits:
1. "feat(sql-converter): add CatalogViewRule for sys.* metadata view conversion"
2. "fix(sql-converter): handle tr_ prefix triggers in TriggerRule"
3. "test(sql-converter): add tests for CatalogViewRule and trigger prefix fix"
4. "feat(sql-converter): re-run baseline conversion with catalog views and trigger fix"

Then: `git push origin postgres-5-0-implementation`

## IMPORTANT NOTES
- The PG views MUST return the same column names as the SQL Server versions — CodeGen depends on these names
- Test each PG view by running `SELECT * FROM __mj."viewName" LIMIT 5` against the actual PG database
- The `vwSQLColumnsAndEntityFields` view is the most complex — take special care with the CTE and type mappings
- `sys.extended_properties` maps to `pg_catalog.pg_description` (via `obj_description()` and `col_description()`)
- Some columns from `sys.all_objects` (like `object_id`, `type`, `schema_id`) have PG equivalents in `pg_class` (`oid`, `relkind`, `relnamespace`)
- PG identifiers are case-sensitive and must be quoted: `"TableName"`, `"SchemaName"`, etc.

## DO NOT STOP UNTIL ALL 5 PARTS ARE COMPLETE.
