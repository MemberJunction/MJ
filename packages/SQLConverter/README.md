# @memberjunction/sql-converter

## Overview

A production-grade SQL dialect conversion pipeline that converts SQL Server (T-SQL) to PostgreSQL. The pipeline uses a rule-based architecture where each SQL statement type is handled by a specialized conversion rule, producing deterministic, executable PostgreSQL output.

**Current status:** 0 errors across the v5.0 baseline (273 stored procedures) + 6 incremental migrations. 465 unit tests passing.

### Key Features

- Rule-based conversion with 11 specialized rules
- Statement classification (27 distinct types)
- Context-aware conversion (CREATE TABLE column types inform INSERT boolean casting)
- Ordered output grouping (Tables -> FKs -> Views -> Functions -> Triggers -> Data -> Grants -> Comments)
- Global post-processing with 25+ transformations
- Database verification and cross-database audit
- LLM fallback for unhandled patterns

## Architecture

```mermaid
flowchart TD
    A[SQL Server File] --> B[Preprocess<br/>Flyway placeholders]
    B --> C[Split on GO<br/>Batch separator]
    C --> D[SubSplitter<br/>Compound batches]
    D --> E[StatementClassifier<br/>27 statement types]
    E --> F{Statement Type}
    F -->|SKIP_*| G[Skip / Discard]
    F -->|Convertible| H[Match Rules<br/>by AppliesTo]
    H --> I[PreProcess Phase]
    I --> J{BypassSqlglot?}
    J -->|Yes| K[Rule handles<br/>full conversion]
    J -->|No| L[sqlglot transpile]
    L --> M[PostProcess Phase]
    K --> N[Route to<br/>OutputGroup]
    M --> N
    N --> O[Assemble Groups<br/>in dependency order]
    O --> P[PostProcessor<br/>Global cleanup]
    P --> Q[PostgreSQL Output]
```

## Quick Start

### Installation

```bash
npm install @memberjunction/sql-converter
```

### CLI Usage

```bash
npx mj sql-convert --source migrations/v5/Baseline.sql --output migrations/pg/Baseline_PG.sql
```

### Programmatic Usage

```typescript
import { convertFile, getTSQLToPostgresRules } from '@memberjunction/sql-converter';

const result = convertFile({
  Source: 'path/to/input.sql',
  SourceIsFile: true,
  OutputFile: 'path/to/output.sql',
  Rules: getTSQLToPostgresRules(),
  OnProgress: (msg) => console.log(msg),
});

console.log(`Converted ${result.Stats.Converted} of ${result.Stats.TotalBatches} batches`);
```

## Pipeline Deep Dive

```mermaid
sequenceDiagram
    participant F as File Input
    participant P as Preprocessor
    participant S as Splitter
    participant SS as SubSplitter
    participant C as Classifier
    participant R as Rules Engine
    participant G as Output Groups
    participant PP as PostProcessor
    participant O as Output

    F->>P: Raw SQL (replace ${flyway:defaultSchema} with __mj)
    P->>S: Processed SQL
    S->>SS: GO-separated batches
    SS->>C: Sub-split individual statements

    loop For each statement
        C->>R: StatementType + SQL
        alt SKIP type
            R-->>G: Discard
        else Has matching rule
            R->>R: PreProcess (if defined)
            alt BypassSqlglot = true
                R->>R: PostProcess(original, original, context)
            else BypassSqlglot = false
                R->>R: sqlglot transpile
                R->>R: PostProcess(transpiled, original, context)
            end
            R->>G: Route to appropriate group
        end
    end

    G->>PP: Assembled output (Tables, FKs, Views, ...)
    PP->>O: Final PostgreSQL SQL
```

## Rule System

### How Rules Work

Each rule implements `IConversionRule`:

```typescript
interface IConversionRule {
  Name: string;                  // Display name
  AppliesTo: StatementType[];    // Which statement types
  Priority: number;              // Lower = runs first
  BypassSqlglot?: boolean;       // Skip sqlglot transpilation
  PreProcess?(sql: string, context: ConversionContext): string;
  PostProcess?(sql: string, originalSQL: string, context: ConversionContext): string;
}
```

### Rule Priority Chain

```mermaid
flowchart LR
    A["CreateTableRule<br/>Priority 10"] --> B["ViewRule<br/>Priority 20"]
    B --> C["ProcedureToFunctionRule<br/>Priority 30"]
    C --> D["FunctionRule<br/>Priority 35"]
    D --> E["TriggerRule<br/>Priority 40"]
    E --> F["InsertRule<br/>Priority 50"]
    F --> G["ConditionalDDLRule<br/>Priority 55"]
    G --> H["AlterTableRule<br/>Priority 60"]
    H --> I["CreateIndexRule<br/>Priority 70"]
    I --> J["GrantRule<br/>Priority 80"]
    J --> K["ExtendedPropertyRule<br/>Priority 90"]
```

### ConversionContext

State accumulated across the pipeline:

```typescript
interface ConversionContext {
  SourceDialect: string;        // 'tsql'
  TargetDialect: string;        // 'postgres'
  Schema: string;               // '__mj'
  TableColumns: Map<string, Map<string, string>>;  // table -> column -> PG type
  HandWrittenFunctions: Map<string, string>;        // function name -> PG replacement
  CreatedFunctions: Set<string>;   // successfully converted functions
  CreatedViews: Set<string>;       // successfully converted views
}
```

```mermaid
flowchart LR
    CT["CreateTableRule<br/>Populates TableColumns"] --> IR["InsertRule<br/>Reads TableColumns<br/>for boolean casting"]
    P["ProcedureToFunctionRule<br/>Populates CreatedFunctions"] --> GR["GrantRule<br/>Reads CreatedFunctions<br/>to skip invalid grants"]
    V["ViewRule<br/>Populates CreatedViews"] --> GR
```

## Rule-by-Rule Documentation

### 1. CreateTableRule (Priority 10)

**Applies to:** `CREATE_TABLE` | **Bypasses sqlglot:** Yes

Converts SQL Server CREATE TABLE statements to PostgreSQL DDL.

**Conversions:**
- Bracket identifiers `[schema].[table]` to `schema."table"`
- SQL Server types to PG types (see Type Mapping table below)
- `IDENTITY(1,1)` to `GENERATED BY DEFAULT AS IDENTITY`
- `DEFAULT (NEWSEQUENTIALID())` to `DEFAULT gen_random_uuid()`
- `DEFAULT (GETUTCDATE())` to `DEFAULT NOW()`
- `DEFAULT ((0))` for BIT to `DEFAULT FALSE`
- `DEFAULT ((1))` for BIT to `DEFAULT TRUE`
- Removes CLUSTERED/NONCLUSTERED, ON [PRIMARY], COLLATE
- Quotes PascalCase column names
- Tracks column types in `ConversionContext.TableColumns`

**Example:**

```sql
-- Input (T-SQL)
CREATE TABLE [__mj].[Users] (
  [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
  [Name] [nvarchar](100) NOT NULL,
  [IsActive] [bit] NOT NULL DEFAULT ((1)),
  CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED ([ID])
)

-- Output (PostgreSQL)
CREATE TABLE __mj."Users" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "Name" VARCHAR(100) NOT NULL,
  "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PK_Users" PRIMARY KEY ("ID")
);
```

### 2. ViewRule (Priority 20)

**Applies to:** `CREATE_VIEW` | **Bypasses sqlglot:** Yes

Converts CREATE VIEW statements with full expression conversion.

**Conversions:**
- `CREATE [OR ALTER] VIEW` to `CREATE OR REPLACE VIEW`
- `CROSS APPLY` to `CROSS JOIN LATERAL`
- `OUTER APPLY` to `LEFT JOIN LATERAL`
- Adds `ON TRUE` for LEFT JOIN LATERAL without ON clause
- Wraps LATERAL function calls: `func(args) AS alias` to `(SELECT * FROM func(args)) AS alias`
- STRING_AGG WITHIN GROUP rewriting
- All expression helpers (date functions, CHARINDEX, STUFF, etc.)
- Column reference quoting: `alias.PascalCol` to `alias."PascalCol"`
- Skips views referencing sys.* tables or flyway

### 3. ProcedureToFunctionRule (Priority 30)

**Applies to:** `CREATE_PROCEDURE` | **Bypasses sqlglot:** Yes

Converts SQL Server stored procedures to PostgreSQL functions.

**Conversions:**
- Parses parameters (name, type, default, OUTPUT flag)
- Maps SQL Server types to PG types for parameters
- Replaces `@var` with `p_var` in function body
- `@@ROWCOUNT` to `_v_row_count`, `@@ERROR` to `0`
- `WHILE BEGIN...END` to `WHILE...LOOP...END LOOP`
- `IF BEGIN...END` to `IF...THEN...END IF`
- `SET @var =` to `p_var :=`
- Extracts DECLARE statements into PG DECLARE block
- `INSERTED` to `NEW`, `DELETED` to `OLD`
- Determines return type (VOID, TABLE row type, SETOF)
- Wraps in `CREATE OR REPLACE FUNCTION ... $$ LANGUAGE plpgsql;`
- Skips procedures with sys.* references, temp tables, STRING_SPLIT

### 4. FunctionRule (Priority 35)

**Applies to:** `CREATE_FUNCTION` | **Bypasses sqlglot:** Yes

Converts SQL Server functions (scalar and table-valued) to PostgreSQL.

**Features:**
- Checks for hand-written function replacements first (7 built-in: StripToAlphanumeric, GetProgrammaticName, ToTitleCase, ToProperCase, ExtractVersionComponents, parseEmail, parseDomain, fnInitials)
- Inline table-valued functions to `RETURNS TABLE(...) AS $$ ... $$ LANGUAGE sql;`
- Scalar functions to `RETURNS type AS $$ ... $$ LANGUAGE plpgsql;`
- WITH recursive CTE detection to `WITH RECURSIVE`
- DECLARE extraction, WHILE/IF conversion, type mapping

### 5. TriggerRule (Priority 40)

**Applies to:** `CREATE_TRIGGER` | **Bypasses sqlglot:** Yes

Converts SQL Server triggers to PostgreSQL trigger functions.

**Pattern:**

```sql
-- Input
CREATE TRIGGER trgAfterUpdate ON [__mj].[Users]
AFTER UPDATE AS ...

-- Output
CREATE OR REPLACE FUNCTION __mj."trgAfterUpdate_func"() RETURNS TRIGGER AS $$
BEGIN ... END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trgAfterUpdate" AFTER UPDATE ON __mj."Users"
FOR EACH ROW EXECUTE FUNCTION __mj."trgAfterUpdate_func"();
```

- Special handling for UpdatedAt triggers (common pattern)
- Skips triggers using TRIGGER_NESTLEVEL() or UPDATE()
- `INSERTED` to `NEW`, `DELETED` to `OLD`

### 6. InsertRule (Priority 50)

**Applies to:** `INSERT`, `UPDATE`, `DELETE` | **Bypasses sqlglot:** Yes

Converts DML statements with expression helpers.

**Order of operations (important for correctness):**
1. Convert identifiers
2. Remove N prefix
3. Remove COLLATE
4. Convert common functions (BEFORE quoting to avoid quoting function names like LEN)
5. String concatenation (`+` to `||`)
6. CHARINDEX, STUFF, CONVERT, IIF, CAST types
7. Quote PascalCase identifiers
8. Ensure semicolon

### 7. ConditionalDDLRule (Priority 55)

**Applies to:** `CONDITIONAL_DDL` | **Bypasses sqlglot:** Yes

Converts IF NOT EXISTS conditional DDL patterns.

**Two patterns:**
1. **Conditional Index:** `IF NOT EXISTS (SELECT ... sys.indexes ...) CREATE INDEX` to `CREATE INDEX IF NOT EXISTS`
2. **DO $$ Block:** `IF NOT EXISTS (...) BEGIN ... END` to `DO $$ BEGIN IF NOT EXISTS (...) THEN ... END IF; END $$;`

**Features:**
- Type conversions (NVARCHAR to VARCHAR, BIT to BOOLEAN, etc.)
- INFORMATION_SCHEMA casing (PG requires lowercase)
- PascalCase identifier quoting (skips string literals to avoid corrupting UUIDs)

### 8. AlterTableRule (Priority 60)

**Applies to:** `FK_CONSTRAINT`, `PK_CONSTRAINT`, `CHECK_CONSTRAINT`, `UNIQUE_CONSTRAINT`, `ENABLE_CONSTRAINT`, `ALTER_TABLE` | **Bypasses sqlglot:** Yes

Converts ALTER TABLE statements and constraint definitions.

**Conversions:**
- Identifier conversion, COLLATE removal
- Type conversions for defaults and columns
- `GETUTCDATE()` to `NOW()`, `NEWSEQUENTIALID()` to `gen_random_uuid()`
- Removes CLUSTERED/NONCLUSTERED, ASC/DESC in constraints, ON [PRIMARY]
- FK constraints: adds `DEFERRABLE INITIALLY DEFERRED`
- CHECK constraints: adds `NOT VALID`
- `WITH CHECK CHECK CONSTRAINT` to comment (no-op in PG)

### 9. CreateIndexRule (Priority 70)

**Applies to:** `CREATE_INDEX` | **Bypasses sqlglot:** Yes

Converts CREATE INDEX statements.

**Conversions:**
- Removes CLUSTERED/NONCLUSTERED
- Removes `WITH (PAD_INDEX = ...)` option blocks
- Removes ON [filegroup]
- Removes INCLUDE columns (simplified)
- Fixes boolean values: `=(1)` to `=TRUE`, `=(0)` to `=FALSE`

### 10. GrantRule (Priority 80)

**Applies to:** `GRANT`, `REVOKE` | **Bypasses sqlglot:** Yes

Converts GRANT and REVOKE statements.

**Features:**
- Adds `FUNCTION` keyword for EXECUTE grants (PG requirement)
- Skips grants on functions not in `CreatedFunctions` set
- Skips grants on views (vw*) not in `CreatedViews` set
- Removes N prefix from strings

### 11. ExtendedPropertyRule (Priority 90)

**Applies to:** `EXTENDED_PROPERTY` | **Bypasses sqlglot:** Yes

Converts `sp_addextendedproperty` calls to PostgreSQL COMMENT statements.

**Supports:**
- Named parameters (`@name=`, `@value=`, etc.)
- Positional parameters
- TABLE to `COMMENT ON TABLE`
- VIEW to `COMMENT ON VIEW`
- COLUMN to `COMMENT ON COLUMN`
- PROCEDURE/FUNCTION to commented out (PG needs signature)

## Statement Classification

The `StatementClassifier` uses pattern matching to assign one of 27 types:

| Type | Examples |
|------|----------|
| `CREATE_TABLE` | `CREATE TABLE [schema].[name] (...)` |
| `CREATE_VIEW` | `CREATE VIEW`, `CREATE OR ALTER VIEW` |
| `CREATE_PROCEDURE` | `CREATE PROC[EDURE]` (unless references sys.*) |
| `CREATE_FUNCTION` | `CREATE FUNCTION` |
| `CREATE_TRIGGER` | `CREATE TRIGGER` |
| `CREATE_INDEX` | `CREATE [UNIQUE] [NONCLUSTERED] INDEX` |
| `ALTER_TABLE` | `ALTER TABLE ADD COLUMN`, `ALTER TABLE ALTER COLUMN` |
| `FK_CONSTRAINT` | `ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY` |
| `PK_CONSTRAINT` | `ALTER TABLE ADD CONSTRAINT ... PRIMARY KEY` |
| `CHECK_CONSTRAINT` | `ALTER TABLE ADD CONSTRAINT ... CHECK` |
| `UNIQUE_CONSTRAINT` | `ALTER TABLE ADD CONSTRAINT ... UNIQUE` |
| `ENABLE_CONSTRAINT` | `ALTER TABLE WITH CHECK CHECK CONSTRAINT` |
| `INSERT` / `UPDATE` / `DELETE` | DML statements |
| `GRANT` / `DENY` / `REVOKE` | DCL statements |
| `CONDITIONAL_DDL` | `IF NOT EXISTS (...) BEGIN ... END` |
| `EXTENDED_PROPERTY` | `sp_addextendedproperty` |
| `COMMENT_ONLY` | Pure comment blocks |
| `SKIP_SESSION` | `SET NUMERIC_ROUNDABORT`, `SET ANSI_PADDING`, etc. |
| `SKIP_ERROR` | `IF @@ERROR` |
| `SKIP_SQLSERVER` | SQL Server-specific code |
| `SKIP_NOCHECK` | `WITH NOCHECK` |
| `SKIP_PRINT` | `PRINT` statements |
| `UNKNOWN` | Unclassified statements |

## Output Grouping

Converted statements are grouped in dependency order:

```mermaid
flowchart TD
    A[DDL: Tables, PKs, Indexes] --> B[Helper Functions fn*]
    B --> C[Views]
    C --> D[Stored Procedures sp*]
    D --> E[Triggers]
    E --> F[Data: INSERT/UPDATE/DELETE]
    F --> G[FK & CHECK Constraints]
    G --> H[Grants]
    H --> I[Comments]
    I --> J[Other / Errors]
```

## Type Mapping Reference

| SQL Server | PostgreSQL | Notes |
|-----------|-----------|-------|
| `UNIQUEIDENTIFIER` | `UUID` | |
| `BIT` | `BOOLEAN` | |
| `INT` | `INTEGER` | |
| `BIGINT` | `BIGINT` | Unchanged |
| `SMALLINT` | `SMALLINT` | Unchanged |
| `TINYINT` | `SMALLINT` | PG has no TINYINT |
| `FLOAT` | `DOUBLE PRECISION` | |
| `REAL` | `REAL` | Unchanged |
| `MONEY` | `NUMERIC(19,4)` | |
| `SMALLMONEY` | `NUMERIC(10,4)` | |
| `DECIMAL(p,s)` | `NUMERIC(p,s)` | |
| `NVARCHAR(n)` | `VARCHAR(n)` | |
| `NVARCHAR(MAX)` | `TEXT` | |
| `VARCHAR(MAX)` | `TEXT` | |
| `NCHAR(n)` | `CHAR(n)` | |
| `NTEXT` | `TEXT` | |
| `DATETIME` | `TIMESTAMPTZ` | |
| `DATETIME2` | `TIMESTAMPTZ` | |
| `DATETIMEOFFSET` | `TIMESTAMPTZ` | |
| `SMALLDATETIME` | `TIMESTAMPTZ` | |
| `IMAGE` | `BYTEA` | |
| `VARBINARY(n/MAX)` | `BYTEA` | |
| `XML` | `XML` | Unchanged |
| `SQL_VARIANT` | `TEXT` | |
| `HIERARCHYID` | `TEXT` | |
| `IDENTITY(1,1)` | `GENERATED BY DEFAULT AS IDENTITY` | Column attribute |

## Function Mapping Reference

| T-SQL Function | PostgreSQL Equivalent |
|---------------|----------------------|
| `ISNULL(a, b)` | `COALESCE(a, b)` |
| `GETUTCDATE()` | `NOW()` |
| `GETDATE()` | `NOW()` |
| `SYSDATETIMEOFFSET()` | `NOW()` |
| `NEWID()` | `gen_random_uuid()` |
| `NEWSEQUENTIALID()` | `gen_random_uuid()` |
| `LEN(s)` | `LENGTH(s)` |
| `SCOPE_IDENTITY()` | `lastval()` |
| `SUSER_SNAME()` | `current_user` |
| `CHARINDEX(sub, str)` | `POSITION(sub IN str)` |
| `STUFF(s, start, len, repl)` | `OVERLAY(s PLACING repl FROM start FOR len)` |
| `DATEADD(unit, n, date)` | `(date + n * INTERVAL '1 unit')` |
| `DATEDIFF(day, start, end)` | `EXTRACT(DAY FROM (end::TIMESTAMPTZ - start::TIMESTAMPTZ))` |
| `DATEPART(unit, date)` | `EXTRACT(field FROM date)` |
| `CONVERT(type, expr)` | `CAST(expr AS mapped_type)` |
| `IIF(cond, t, f)` | `CASE WHEN cond THEN t ELSE f END` |
| `SELECT TOP N` | `SELECT ... LIMIT N` |
| `'a' + 'b'` (string concat) | `'a' \|\| 'b'` |
| `N'text'` | `'text'` (prefix removed) |
| `RAISERROR(msg, n, n)` | `RAISE EXCEPTION msg` |

## ExpressionHelpers

Shared expression-level converters used across multiple rules:

- **`convertIdentifiers`** -- `[schema].[name]` to `schema."name"`
- **`convertDateFunctions`** -- DATEADD, DATEDIFF, DATEPART with full unit mapping
- **`convertCharIndex`** -- 2-arg and 3-arg CHARINDEX
- **`convertStuff`** -- STUFF to OVERLAY
- **`convertStringConcat`** -- `+` to `||` for string contexts
- **`convertIIF`** -- Nested IIF with paren-aware argument splitting
- **`convertTopToLimit`** -- SELECT TOP N to LIMIT N
- **`convertCastTypes`** -- CAST AS type mappings
- **`convertConvertFunction`** -- CONVERT(type, expr) to CAST
- **`removeNPrefix`** -- N'text' to 'text'
- **`removeCollate`** -- Remove COLLATE clauses
- **`convertCommonFunctions`** -- ISNULL, GETUTCDATE, NEWID, LEN, etc.
- **`quotePascalCaseIdentifiers`** -- Quote PascalCase identifiers while preserving strings and comments

## PostProcessor

Global cleanup pass applied to the complete output. Key transformations:

1. **Bracket cleanup** -- Remove remaining `[brackets]` (preserve PG array access)
2. **Session control removal** -- SET NOEXEC, SET NUMERIC_ROUNDABORT, SET XACT_ABORT
3. **RAISERROR** to `RAISE EXCEPTION`
4. **Type name unquoting** -- `"UUID"` to UUID, `"BOOLEAN"` to BOOLEAN, etc.
5. **Remaining type conversions** -- nvarchar to VARCHAR, uniqueidentifier to UUID
6. **Boolean fixes** -- `=(1)` to `=TRUE`, `=(0)` to `=FALSE`
7. **session_replication_role** -- `'DEFAULT'` to `'origin'`
8. **PL/pgSQL fixes** -- `END\n$$` to `END;\n$$`, empty BEGIN blocks
9. **FK clause ordering** -- DEFERRABLE after ON DELETE/UPDATE
10. **LIKE character classes** -- SQL Server patterns to PG regex
11. **CHECK constraint fixes** -- `len()` to `LENGTH()`, `isjson()` to JSON validation
12. **INFORMATION_SCHEMA** -- Force lowercase
13. **Schema-qualified identifiers** -- Quote unquoted PascalCase after `__mj.`
14. **ISNULL to COALESCE** -- Final pass
15. **IF OBJECT_ID DROP** to `DROP ... IF EXISTS`
16. **GRANT EXEC** to `GRANT EXECUTE` with DO $$ wrapper
17. **CREATE INDEX** to `CREATE INDEX IF NOT EXISTS`
18. **Long index names** -- Truncate to 63 chars with MD5 hash suffix
19. **Backslash line fix** -- Fix lines starting with `\` in INSERT string literals
20. **Excessive blank lines** -- Collapse 4+ blank lines to 3

## Extensibility Architecture

The converter is built on three extensible subsystems that enable support for new source/target dialect combinations beyond T-SQL → PostgreSQL.

### RuleRegistry

Central registry for SQL conversion rules. Supports multiple source→target dialect combinations with case-insensitive dialect lookup and automatic priority sorting.

```typescript
import { RuleRegistry } from '@memberjunction/sql-converter';

// Register rules for a dialect pair
RuleRegistry.RegisterAll(myRules);

// Retrieve sorted rules for a dialect pair
const rules = RuleRegistry.GetRules('tsql', 'postgres');

// Check available combinations
const combos = RuleRegistry.GetRegisteredCombinations();
// [{ Source: 'tsql', Target: 'postgres' }]

// Check if rules exist for a combination
RuleRegistry.HasRules('tsql', 'mysql'); // false
```

| Method | Description |
|--------|-------------|
| `Register(rule)` | Register a single rule for its declared `SourceDialect`/`TargetDialect` |
| `RegisterAll(rules)` | Register multiple rules at once |
| `GetRules(source, target)` | Get sorted rules (by priority ascending) for a dialect pair |
| `GetRegisteredCombinations()` | List all registered `{Source, Target}` pairs |
| `HasRules(source, target)` | Check if rules exist for a combination |
| `Clear()` | Clear all rules (for testing) |

Rules self-register via `SourceDialect` and `TargetDialect` properties on `IConversionRule`. The registry uses case-insensitive matching and returns rules sorted by `Priority` (ascending).

### TypeResolver

Centralized SQL type resolution that delegates to `@memberjunction/sql-dialect`'s `DataTypeMap` with MJ-specific overrides. All type mapping in the converter goes through this module so knowledge lives in one place.

```typescript
import { resolveType, parseTypeString } from '@memberjunction/sql-converter';

// Parse a SQL type string into components
const parsed = parseTypeString('NVARCHAR(255)');
// { BaseName: 'NVARCHAR', Length: 255 }

// Resolve a T-SQL type to PostgreSQL
resolveType('UNIQUEIDENTIFIER');    // 'UUID'
resolveType('NVARCHAR(MAX)');       // 'TEXT'
resolveType('DECIMAL(18,2)');       // 'NUMERIC(18,2)'
resolveType('DATETIME');            // 'TIMESTAMPTZ' (MJ override)

// Resolve for inline CAST/CONVERT expressions
resolveInlineType('DATETIME2(7)');  // 'TIMESTAMPTZ'
```

**MJ-specific overrides** (applied before the dialect TypeMap):
- `DATETIME`, `DATETIME2`, `SMALLDATETIME` → `TIMESTAMPTZ` (MJ stores everything with timezone)
- `NTEXT` → `TEXT`
- `SQL_VARIANT`, `HIERARCHYID` → `TEXT`

To add support for a new target dialect, add a new branch in the internal `getTypeMap()` function that constructs the dialect's TypeMap.

### DialectHeaderBuilder

Pluggable interface for generating dialect-specific output file headers. Each target dialect can register a header builder that produces the preamble needed for the converted SQL file.

```typescript
import { registerHeaderBuilder, getHeaderBuilder, DialectHeaderBuilder } from '@memberjunction/sql-converter';

// Built-in: PostgreSQL header builder (auto-registered)
const pgBuilder = getHeaderBuilder('postgres');
const header = pgBuilder?.BuildHeader('__mj');
// Generates: CREATE EXTENSION, CREATE SCHEMA, SET search_path, implicit int->bool cast

// Register a custom builder for a new dialect
class MySQLHeaderBuilder implements DialectHeaderBuilder {
  readonly TargetDialect = 'mysql';
  BuildHeader(schema: string): string {
    return `SET NAMES utf8mb4;\nCREATE SCHEMA IF NOT EXISTS \`${schema}\`;\nUSE \`${schema}\`;\n`;
  }
}
registerHeaderBuilder(new MySQLHeaderBuilder());
```

The built-in `PostgreSQLHeaderBuilder` generates:
- `CREATE EXTENSION` for pgcrypto and uuid-ossp
- Schema creation and `SET search_path`
- `SET standard_conforming_strings = on`
- Implicit `INTEGER → BOOLEAN` cast upgrade (for SQL Server BIT compatibility)

## Extending the Pipeline

### Adding a New Rule (Existing Dialect Pair)

1. Create a new file in `src/rules/`:

```typescript
import type { IConversionRule, ConversionContext, StatementType } from './types.js';

export class MyNewRule implements IConversionRule {
  Name = 'MyNewRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['SOME_TYPE'];
  Priority = 65;  // Between existing rules
  BypassSqlglot = true;

  PostProcess(sql: string, originalSQL: string, context: ConversionContext): string {
    // Your conversion logic here
    return convertedSQL;
  }
}
```

2. Register it in `TSQLToPostgresRules.ts`:

```typescript
import { MyNewRule } from './MyNewRule.js';

export function getTSQLToPostgresRules(): IConversionRule[] {
  return [
    // ... existing rules
    new MyNewRule(),  // Insert at correct priority position
  ];
}
```

3. Add tests in `src/__tests__/MyNewRule.test.ts`

### Adding Rules for a New Dialect Direction

To support a new conversion direction (e.g., T-SQL → MySQL):

1. **Create rules** implementing `IConversionRule` with `SourceDialect = 'tsql'` and `TargetDialect = 'mysql'`
2. **Register rules** with `RuleRegistry.RegisterAll(myMySQLRules)`
3. **Add a TypeMap** branch in `TypeResolver.getTypeMap()` for the new target dialect
4. **Register a DialectHeaderBuilder** for the new target via `registerHeaderBuilder()`
5. **Create a convenience function** like `getTSQLToMySQLRules()` for easy consumption

### Adding New Type Mappings

Update type mappings in:
- `TypeResolver` -- centralized type resolution (preferred for new dialects)
- `CreateTableRule` -- for CREATE TABLE column types
- `ExpressionHelpers.convertCastTypes()` -- for CAST expressions
- `ExpressionHelpers.convertConvertFunction()` -- for CONVERT() function
- `PostProcessor.postProcess()` -- for final cleanup pass

## Verification & Cross-Database Audit

### Database Verification

```typescript
import { ConversionPipeline } from '@memberjunction/sql-converter';

const result = await new ConversionPipeline().Run({
  source: 'input.sql',
  sourceIsFile: true,
  sourceDialect: 'tsql',
  targetDialect: 'postgres',
  verify: true,
  targetConnection: 'postgresql://user:pass@localhost:5432/testdb',
});
```

### Audit Command

```bash
npx mj sql-audit --source-connection "mssql://..." --target-connection "postgresql://..." --schema __mj
```

Compares source and target databases:
- Missing objects (tables, views, functions, triggers, indexes)
- Row count mismatches

## Testing

### Running Tests

```bash
# All tests
cd packages/SQLConverter && npm run test

# Watch mode
cd packages/SQLConverter && npm run test:watch
```

### Test Organization

```
src/__tests__/
  StatementClassifier.test.ts    # 60+ tests
  SubSplitter.test.ts            # 13 tests
  ExpressionHelpers.test.ts      # 100+ tests
  BatchConverter.test.ts         # 22 tests
  PostProcessor.test.ts          # 50+ tests
  SQLFileSplitter.test.ts        # 24 tests
  DatabaseAuditor.test.ts        # 12 tests
  CreateTableRule.test.ts        # 31 tests
  ViewRule.test.ts               # 15 tests
  ProcedureToFunctionRule.test.ts # 48 tests
  FunctionRule.test.ts           # 20+ tests
  TriggerRule.test.ts            # 13 tests
  InsertRule.test.ts             # 20 tests
  AlterTableRule.test.ts         # 13 tests
  ConditionalDDLRule.test.ts     # 20+ tests
  CreateIndexRule.test.ts        # 15+ tests
  GrantRule.test.ts              # 15+ tests
  ExtendedPropertyRule.test.ts   # 8 tests
  TSQLToPostgresRules.test.ts    # 10+ tests
  ConversionPipeline.test.ts     # 14 tests
  integration.test.ts            # Full pipeline against real PG
```

### Adding Test Cases

Follow the established pattern:

```typescript
import { describe, it, expect } from 'vitest';
import { MyRule } from '../rules/MyRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new MyRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('MyRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('MyRule');
      expect(rule.Priority).toBe(65);
    });
  });

  describe('feature area', () => {
    it('should convert X to Y', () => {
      const result = convert('INPUT SQL');
      expect(result).toContain('EXPECTED OUTPUT');
    });
  });
});
```

## Dependencies

- **`@memberjunction/sqlglot-ts`** -- Python sqlglot wrapper for transpilation fallback
- **`pg`** (dev) -- PostgreSQL client for integration tests
- **`vitest`** (dev) -- Test framework

## License

ISC
