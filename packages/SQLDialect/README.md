# @memberjunction/sql-dialect

**No database driver dependencies.** The only runtime dependency is `@memberjunction/global`, whose class
factory lets other packages register their own dialects.

## Overview

`@memberjunction/sql-dialect` is an abstract SQL dialect layer that enables database-agnostic SQL generation across MemberJunction. It encapsulates every platform-specific SQL syntax pattern -- identifier quoting, pagination, data types, DDL generation, full-text search, and more -- into a single, testable abstraction with no database driver dependencies.

This package is used by CodeGen, data providers, the SQL parser, the RunQuery pipeline and SQL converters throughout the MemberJunction monorepo. When code needs to emit SQL that works on both SQL Server and PostgreSQL, it programs against the `SQLDialect` abstract class and lets the concrete dialect handle platform differences.

It ships six dialects:

- **Platform dialects** for the databases MJ itself runs on: `SQLServerDialect` (`'sqlserver'`) and `PostgreSQLDialect` (`'postgresql'`). These are full `SQLDialect`s, with DDL.
- **Query-only dialects** for External Data Sources, databases MJ reads but does not run on: `MySQLQueryDialect` (`'mysql'`), `OracleQueryDialect` (`'oracle'`), `SnowflakeQueryDialect` (`'snowflake'`) and `DatabricksQueryDialect` (`'databricks'`). See [Query-only dialects](#query-only-dialects).

## Architecture

### Class Hierarchy

```
QueryDialect (abstract: Key, DisplayName, Lexical, Grammar, Writer, Types, Binding)
  |-- SQLDialect (abstract: adds PlatformKey, DDL, FormatterLanguage and the method surface below)
  |     |-- SQLServerDialect
  |     |-- PostgreSQLDialect
  |-- AnsiQueryDialect (standard SQL facets)
        |-- MySQLQueryDialect
        |-- OracleQueryDialect
        |-- SnowflakeQueryDialect
        |-- DatabricksQueryDialect
```

A dialect is split into **facets**: small objects that each hold one kind of fact about the database.
`QueryDialect` is the set of facets needed to read, screen and write queries. `SQLDialect` adds the `DDL`
facet MJ needs to create and run its own schema. Every method listed under [Key Methods](#key-methods) is a
member of `SQLDialect` that delegates to one of its facets; those methods are kept for existing callers,
and new code that only needs one kind of fact can read the facet directly.

### Facets

| Facet | Interface | Holds | Where |
|---|---|---|---|
| `Lexical` | `DialectLexicalRules` | How text splits into tokens: identifier quote forms (`IdentifierQuoteForm`), string literal forms and their prefixes and escapes (`StringLiteralForm`), dollar quoting (`DollarQuoting`), Oracle-style `q'[…]'` quoting, line comment openers (`LineCommentForm`), nested or executable block comments (`BlockCommentRules`), parameter placeholder forms (`ParameterPlaceholderForm`), unquoted identifier case folding (`IdentifierCaseFolding`), and whether a server setting can turn backslash escapes on or off. | Every `QueryDialect`. A frozen plain object. |
| `Grammar` | `DialectGrammar` | Statement-level facts: the node-sql-parser grammar (`ParserGrammar`, or `null` when there is none), the default schema, row-cap forms (`RowCapForm`), ORDER BY legality in CTEs and derived tables, nested WITH, the recursive keyword, the query-hint keyword, document tail clauses (`FOR JSON`), set operators, the correlated-join form (`CorrelatedJoinForm`), write-statement keywords, functions caller SQL may not call, keywords that start a new statement without a separator (`UnseparatedStatementKeywords`), paging ORDER BY defaults, and extra column alias forms (`ColumnAliasForm`). | Every `QueryDialect`. A frozen plain object. |
| `Writer` | `DialectWriter` | Writes SQL fragments: identifier and schema quoting, string literals and their prefix, LIKE escaping, boolean and NULL literals, `LimitClause`, casts, null-coalescing, concatenation, JSON extraction, date arithmetic, the current UTC timestamp, `LowerCase` and `IIF`. | Every `QueryDialect`. Writers extend `AnsiWriter`. |
| `Types` | `DialectTypes` | The SQL type names in each category (boolean, string, fixed-width string, date, integer, float, UUID, binary, JSON, currency, interval, network). | `SQLDialect`; `null` on the shipped query-only dialects. |
| `Binding` | `DialectBinding` | How values cross to the driver: `ParameterPlaceholder`, `TypedParameter` (returns a `TypedParameterReference`), `BooleanParameterValue` and `IsConnectionError`. | `SQLDialect`; `null` on the shipped query-only dialects. |
| `DDL` | `DialectSchemaDDL` | DDL, stored-procedure calls, migrations, schema introspection, type mapping (`TypeMap`), batch splitting, savepoints and other transaction SQL. Implementations extend `BaseSchemaDDL`. | `SQLDialect` only. |

The facets of the shipped dialects are exported, so a new dialect can start from one and change only what
differs: `ANSI_LEXICAL`, `ANSI_GRAMMAR`, `SQL_SERVER_LEXICAL`, `SQL_SERVER_GRAMMAR`, `SQL_SERVER_TYPES`,
`POSTGRESQL_LEXICAL`, `POSTGRESQL_GRAMMAR`, `POSTGRESQL_TYPES`, `MYSQL_LEXICAL`, `MYSQL_GRAMMAR`,
`ORACLE_LEXICAL`, `ORACLE_GRAMMAR`, `SNOWFLAKE_LEXICAL`, `SNOWFLAKE_GRAMMAR`, `DATABRICKS_LEXICAL` and
`DATABRICKS_GRAMMAR`, plus the writer classes (`AnsiWriter`, `SQLServerWriter`, `PostgreSQLWriter`,
`MySQLWriter`, `OracleWriter`, `SnowflakeWriter`, `DatabricksWriter`), the binding classes
(`SQLServerBinding`, `PostgreSQLBinding`) and the DDL classes (`BaseSchemaDDL`, `SQLServerSchemaDDL`,
`PostgreSQLSchemaDDL`).

### `ParserDialect` and the deprecated `SQLParserDialect`

`ParserDialect` is `Pick<QueryDialect, 'Key' | 'Lexical' | 'Grammar'>`: the part of a dialect the SQL
tokenizer and parser in `@memberjunction/sql-parser` read. Any `QueryDialect` satisfies it.

`SQLParserDialect` is the older, flat interface the parser used to read (`ParserDialect` as a string,
`QuoteIdentifier`, `AllowsOrderByInCTE`, `SupportsEscapeStringLiterals`, `QueryHintKeyword`, and so on). It
is **deprecated** in favour of `ParserDialect` or `QueryDialect`. `SQLDialect` still implements it, so code
that passes a `SQLDialect` where a `SQLParserDialect` is expected keeps working; it is kept until 7.0.

### Key Interfaces

| Interface | Purpose |
|---|---|
| `DialectKey` | The key a dialect is registered and resolved under: `'sqlserver'`, `'postgresql'`, `'mysql'`, `'oracle'`, `'snowflake'`, `'databricks'`, or any other string a consumer registered. Lower case by convention. Wider than `DatabasePlatform`. |
| `DatabasePlatform` | Union type: `'sqlserver' \| 'postgresql'`. The platforms MJ itself runs on. |
| `LimitClauseResult` | `{ prefix: string; suffix: string }` -- Flexible pagination fragments. SQL Server uses `prefix` (TOP), PostgreSQL uses `suffix` (LIMIT/OFFSET). |
| `DateAddUnit` | `'MINUTE' \| 'HOUR' \| 'DAY'`, the units `DateAddExpression` accepts. |
| `SchemaIntrospectionSQL` | Catalog query templates for discovering tables, columns, constraints, foreign keys, and indexes. |
| `TriggerOptions` | Configuration for trigger DDL generation (schema, table, timing, events, body, function name, FOR EACH ROW/STATEMENT). |
| `IndexOptions` | Configuration for index DDL generation (columns, uniqueness, method, partial WHERE, INCLUDE columns). |
| `ColumnDDLOptions` / `AlterColumnOptions` | Column definitions for `AddColumnClause` and `AlterColumnDDL`. |
| `SchemaFieldType` / `ResolveTypeOptions` | Abstract column types and the options `ResolveAbstractType` maps to a concrete SQL type. |
| `DataTypeMap` | Maps source database types to target platform types. |
| `MappedType` | Describes a mapped type: `typeName`, `supportsLength`, `supportsPrecisionScale`, `defaultLength`. |

## Resolving a dialect

Callers get a dialect from a key instead of constructing one, so no package keeps its own
switch over platform names.

| Function | Returns |
|---|---|
| `GetDialect(key)` | A new full `SQLDialect` for a platform key (`'sqlserver'`, `'postgresql'`, or a full `SQLDialect` a consumer registered). **Throws** for a query-only dialect and for an unknown key: `No SQLDialect registered for "mysql". Supported platforms: sqlserver, postgresql`. |
| `GetQueryDialect(key)` | A new `QueryDialect` for any registered key, platform or query-only. **Throws** for an unknown key: `No QueryDialect registered for "teradata". Registered dialects: sqlserver, postgresql, mysql, oracle, snowflake, databricks`. |
| `IsSupportedPlatform(value)` | Whether a string is a platform key; narrows it to `DatabasePlatform`. False for the query-only keys. |
| `SupportedPlatforms()` | The platform keys: `['sqlserver', 'postgresql']`. |
| `RegisteredDialectKeys()` | Every key that resolves: the built-in ones, then any registered by a consumer. |
| `ShippedQueryOnlyDialectKeys()` | The query-only keys this package ships: `['mysql', 'oracle', 'snowflake', 'databricks']`. |

How a key resolves:

1. **Keys match exactly, case included.** `'MySQL'` is an unknown key; there are no aliases (`'mssql'`,
   `'postgres'` and `'pg'` are not recognized).
2. **Built-in keys resolve directly.** The six shipped dialects are constructed by the factory, not looked up
   in the class factory, so import order cannot make one unresolvable and a registration under a built-in key
   cannot replace it.
3. **Any other key resolves through the MJ class factory.** A package registers its dialect with
   `@RegisterClass(QueryDialect, '<key>')`, and both `GetQueryDialect` and `RegisteredDialectKeys` then see it.
   `GetDialect` serves such a registration only if the class is a full `SQLDialect`.
4. **An unknown key throws**, naming the keys that do resolve. Nothing falls back to a default dialect.

```typescript
import { GetDialect, GetQueryDialect, IsSupportedPlatform } from '@memberjunction/sql-dialect';

const platform = GetDialect('postgresql');       // PostgreSQLDialect
platform.DDL.BatchSeparator();                   // ''

const source = GetQueryDialect('snowflake');     // SnowflakeQueryDialect
source.Writer.QuoteIdentifier('Name');           // '"Name"'
source.Writer.LimitClause(10).suffix;            // 'LIMIT 10'
source.Grammar.ParserGrammar;                    // 'Snowflake'

IsSupportedPlatform('snowflake');                // false
GetDialect('snowflake');                         // throws: not a full SQLDialect
```

## Query-only dialects

A query-only dialect describes a database MJ reads through an External Data Source. It has the `Lexical`,
`Grammar` and `Writer` facets, which is enough for MJ to:

- tokenize the query text safely (strings, quoted identifiers and comments end where the database says they do);
- screen it: refuse write statements (`WriteStatementKeywords`) and functions caller SQL may not call (`CallerSQLForbiddenFunctions`);
- cap and page its rows with the database's own row-cap syntax;
- render RunQuery template filters (`sqlString`, `sqlIn`, `sqlBoolean`, `sqlIdentifier`, the LIKE filters) with the database's literal and quoting rules.

What a query-only dialect does **not** have:

- **No `DDL` facet.** `GetDialect` refuses it, so CodeGen, migrations and anything else that creates schema cannot use it.
- **No `Types` or `Binding` facet** on the shipped ones (both are `null`). A boolean query parameter therefore keeps its JavaScript boolean value instead of being converted for the driver.
- **No node-sql-parser grammar for Oracle** (`ParserGrammar` is `null`), so features that need an AST are not available there.

| | MySQL | Oracle | Snowflake | Databricks |
|---|---|---|---|---|
| Key | `'mysql'` | `'oracle'` | `'snowflake'` | `'databricks'` |
| Identifier quoting | `` `name` `` | `"name"` (no doubled-quote escape) | `"name"` | `` `name` `` |
| Unquoted identifiers | kept as written | folded to upper case | folded to upper case | kept as written |
| Strings | `'…'` and `"…"`, backslash escapes | `'…'`, `q'[…]'` alternative quoting | `'…'` with backslash escapes, `$$…$$` | `'…'` and `"…"`, backslash escapes, `r'…'` raw strings |
| Backslash escapes depend on a server setting | yes (`NO_BACKSLASH_ESCAPES`) | no | no | yes (`spark.sql.parser.escapedStringLiterals`) |
| Comments | `#`, `-- ` (needs a space), `/* */`; `/*!` and `/*+` are executable | `--`, `/* */` | `--`, `//`, `/* */` | `--`, nestable `/* */` |
| Placeholders | `?` | `:name`, `:1` | `?`, `:name`, `:1` | `:name`, `?` |
| `LimitClause(10, 20)` | `LIMIT 10 OFFSET 20` | `OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY` | `LIMIT 10 OFFSET 20` | `LIMIT 10 OFFSET 20` |
| `BooleanLiteral(true)` | `TRUE` | `1` | `TRUE` | `TRUE` |
| `IsNull(a, b)` | `COALESCE(a, b)` | `NVL(a, b)` | `NVL(a, b)` | `COALESCE(a, b)` |
| Concatenation | `CONCAT(…)` (no operator) | `\|\|` | `\|\|` | `\|\|` |
| node-sql-parser grammar | `MySQL` | none | `Snowflake` | `Hive` |
| Forbidden functions in caller SQL | `load_file`, `sleep`, `benchmark`, lock functions | none | none | `reflect`, `try_reflect`, `java_method` |

## Key Methods

These are members of `SQLDialect`. Each delegates to a facet: quoting, literals and expressions to
`Writer`, placeholders and boolean binding to `Binding`, grammar facts to `Grammar`, and DDL, return
patterns, introspection and type mapping to `DDL`.

### Identifier Quoting

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `QuoteIdentifier(name)` | Wraps a single identifier | `[name]` | `"name"` |
| `QuoteSchema(schema, object)` | Schema-qualified reference | `[schema].[object]` | `"schema"."object"` |

#### PostgreSQL auto-quoting (whole-statement)

The two methods above quote one identifier you have already identified. `postgresqlAutoQuote.ts`
solves the harder problem: taking arbitrary SQL and deciding which of its bare words are
identifiers that must be quoted to survive PostgreSQL's lowercase folding.

| Export | Description |
|---|---|
| `AutoQuotePostgreSQLIdentifiers(sql)` | Tokenizes a statement and quotes the words that are identifiers. Skips string literals, dollar-quoted bodies and comments. Idempotent. |
| `PostgreSQLQuotingKeywords` | Keywords recognized **case-sensitively, ALL-CAPS only**. A word here is safe even when it is also an MJ column name — only the ALL-CAPS spelling is exempted, so the mixed-case column form still quotes. |
| `PostgreSQLStructuralKeywords` | A small tier matched case-INsensitively, so stored `UserView.OrderBy` / `ExtraFilter` fragments written in Title Case keep working. Guarded by a test that fails if a real column ever collides. |

The ALL-CAPS rule is the load-bearing part: the set of SQL keywords and the set of MJ column names
intersect (`Name`, `Text`, `Length`, `Values`, `Rank`, …), so a case-insensitive denylist emits
those columns bare and PostgreSQL then rejects them. `TEXT` is the type; `Text` is the column.

This is **not** the only quoter — `PostgreSQLDataProvider` has a metadata-driven one that knows an
entity's field list and is used where that context exists. See the module docblock; they are not
duplicates.

### Pagination

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `LimitClause(limit, offset?)` | Returns `{ prefix, suffix }` | Without offset: `prefix: 'TOP 10'`. With offset: `suffix: 'OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY'` | `suffix: 'LIMIT 10 OFFSET 20'` |

### Literals and Expressions

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `BooleanLiteral(value)` | Platform boolean | `1` / `0` | `true` / `false` |
| `CurrentTimestampUTC()` | Current UTC time | `GETUTCDATE()` | `(NOW() AT TIME ZONE 'UTC')` |
| `NewUUID()` | Generate UUID | `NEWID()` | `gen_random_uuid()` |
| `CastToText(expr)` | Cast to text type | `CAST(expr AS NVARCHAR(MAX))` | `CAST(expr AS TEXT)` |
| `CastToUUID(expr)` | Cast to UUID type | `CAST(expr AS UNIQUEIDENTIFIER)` | `CAST(expr AS UUID)` |
| `Coalesce(expr, fallback)` | N-ary null coalescing | `COALESCE(expr, fallback)` | `COALESCE(expr, fallback)` |
| `IsNull(expr, fallback)` | Two-argument null coalescing in the platform's native spelling | `ISNULL(expr, fallback)` | `COALESCE(expr, fallback)` |
| `IIF(condition, trueVal, falseVal)` | Conditional expression | `IIF(cond, t, f)` | `CASE WHEN cond THEN t ELSE f END` |

### INSERT/UPDATE Return Patterns

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `ReturnInsertedClause(columns?)` | Get inserted values back | `OUTPUT INSERTED.*` or `OUTPUT INSERTED.[col]` | `RETURNING *` or `RETURNING "col"` |
| `AutoIncrementPKExpression()` | Auto-increment DDL | `IDENTITY(1,1)` | `GENERATED ALWAYS AS IDENTITY` |
| `UUIDPKDefault()` | Default UUID PK expression | `NEWSEQUENTIALID()` | `gen_random_uuid()` |
| `ScopeIdentityExpression()` | Last inserted identity | `SCOPE_IDENTITY()` | `lastval()` |
| `RowCountExpression()` | Rows affected | `@@ROWCOUNT` | `ROW_COUNT` (via GET DIAGNOSTICS) |

### DDL Generation

| Method | Description |
|---|---|
| `TriggerDDL(options: TriggerOptions)` | Full trigger creation DDL. SQL Server emits `CREATE TRIGGER ... AS BEGIN ... END`. PostgreSQL emits a companion `CREATE OR REPLACE FUNCTION` plus `CREATE TRIGGER ... EXECUTE FUNCTION`. |
| `IndexDDL(options: IndexOptions)` | Index creation DDL. PostgreSQL supports `USING method`, partial `WHERE`, and `IF NOT EXISTS`. SQL Server supports `INCLUDE` columns. |
| `ExistenceCheckSQL(objectType, schema, name)` | Check if a database object exists. SQL Server uses `OBJECT_ID()`. PostgreSQL uses `pg_catalog` queries. Supports TABLE, VIEW, FUNCTION, PROCEDURE, TRIGGER. |
| `CreateOrReplaceSupported(objectType)` | Whether `CREATE OR REPLACE` is available. SQL Server: always `false`. PostgreSQL: `true` for FUNCTION, VIEW, PROCEDURE. |
| `BatchSeparator()` | Statement batch separator. SQL Server: `GO`. PostgreSQL: `""` (empty string). |

### Full-Text Search

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `FullTextSearchPredicate(column, searchTerm)` | Search predicate | `CONTAINS([column], term)` | `column @@ plainto_tsquery('english', term)` |
| `FullTextIndexDDL(table, columns, catalog?)` | Index creation DDL | Fulltext catalog + fulltext index | tsvector column + GIN index + update trigger |

### String and JSON Functions

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `StringSplitFunction(value, delimiter)` | Split string to rows | `STRING_SPLIT(value, delim)` | `unnest(string_to_array(value, delim))` |
| `JsonExtract(column, path)` | Extract JSON value | `JSON_VALUE(column, 'path')` | `column->>'path'` |
| `ConcatOperator()` | String concatenation | `+` | `\|\|` |

### Parameters and Procedure Calls

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `ParameterPlaceholder(index)` | Positional parameter | `@p0`, `@p1`, ... | `$1`, `$2`, ... |
| `ProcedureCallSyntax(schema, name, params)` | Call stored procedure/function | `EXEC [schema].[name] @p0, @p1` | `SELECT * FROM schema."name"($1, $2)` |

### CTE / Recursion

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `RecursiveCTESyntax()` | Recursive CTE keyword | `WITH` | `WITH RECURSIVE` |

### Permissions and Comments

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `GrantPermission(permission, objectType, schema, object, role)` | Grant access | `GRANT ... ON [s].[o] TO [r]` | `GRANT ... ON s."o" TO "r"` |
| `CommentOnObject(objectType, schema, name, comment)` | Add description | `EXEC sp_addextendedproperty ...` | `COMMENT ON TYPE s."name" IS '...'` |

### Schema Introspection

| Method | Description |
|---|---|
| `SchemaIntrospectionQueries()` | Returns a `SchemaIntrospectionSQL` object with platform-specific catalog queries for listing tables, columns, constraints, foreign keys, indexes, and checking object existence. |

### Data Type Mapping

| Method | Description |
|---|---|
| `get TypeMap(): DataTypeMap` | Returns the dialect-specific type mapper instance. |
| `MapDataType(sourceType, length?, precision?, scale?)` | Convenience wrapper that calls `TypeMap.MapType()`. Returns a `MappedType`. |
| `MapDataTypeToString(sourceType, length?, precision?, scale?)` | Convenience wrapper that calls `TypeMap.MapTypeToString()`. Returns a formatted type string like `VARCHAR(255)` or `NUMERIC(10,2)`. |

## DataTypeMap

The `DataTypeMap` interface defines how data types are translated between database platforms:

```typescript
interface MappedType {
    typeName: string;              // Target type name (e.g., "UUID", "BOOLEAN")
    supportsLength: boolean;       // Whether the type accepts a length parameter
    supportsPrecisionScale: boolean; // Whether the type accepts precision/scale
    defaultLength?: number;        // Default length when applicable
}

interface DataTypeMap {
    MapType(sourceType: string, sourceLength?: number,
            sourcePrecision?: number, sourceScale?: number): MappedType;

    MapTypeToString(sourceType: string, sourceLength?: number,
                    sourcePrecision?: number, sourceScale?: number): string;
}
```

`SQLServerDataTypeMap` is an identity mapper (SQL Server types map to themselves). `PostgreSQLDataTypeMap` maps SQL Server types to their PostgreSQL equivalents.

### Type Mapping Reference (SQL Server to PostgreSQL)

| SQL Server Type | PostgreSQL Type | Notes |
|---|---|---|
| `UNIQUEIDENTIFIER` | `UUID` | |
| `BIT` | `BOOLEAN` | |
| `NVARCHAR(n)` | `VARCHAR(n)` | |
| `NVARCHAR(MAX)` | `TEXT` | Length = -1 or unspecified |
| `VARCHAR(MAX)` | `TEXT` | Length = -1 or unspecified |
| `NCHAR` / `CHAR` | `CHAR` | Preserves length |
| `INT` / `INTEGER` | `INTEGER` | |
| `BIGINT` | `BIGINT` | |
| `SMALLINT` | `SMALLINT` | |
| `TINYINT` | `SMALLINT` | No TINYINT in PostgreSQL |
| `DECIMAL` / `NUMERIC` | `NUMERIC` | Preserves precision/scale |
| `FLOAT(1-24)` | `REAL` | |
| `FLOAT(25-53)` | `DOUBLE PRECISION` | |
| `REAL` | `REAL` | |
| `MONEY` | `NUMERIC(19,4)` | |
| `SMALLMONEY` | `NUMERIC(10,4)` | |
| `DATE` | `DATE` | |
| `DATETIME` / `DATETIME2` | `TIMESTAMP` | |
| `DATETIMEOFFSET` | `TIMESTAMPTZ` | |
| `SMALLDATETIME` | `TIMESTAMP(0)` | |
| `TIME` | `TIME` | |
| `TEXT` / `NTEXT` | `TEXT` | |
| `IMAGE` | `BYTEA` | |
| `VARBINARY` / `BINARY` | `BYTEA` | |
| `XML` | `XML` | |

PostgreSQL-native types (`UUID`, `BOOLEAN`, `TIMESTAMPTZ`, `JSONB`, `BYTEA`, `SERIAL`, `BIGSERIAL`, `DOUBLE PRECISION`) pass through unchanged.

## Usage Examples

```typescript
import {
    SQLDialect,
    SQLServerDialect,
    PostgreSQLDialect
} from '@memberjunction/sql-dialect';

// Create a dialect instance
const dialect: SQLDialect = new PostgreSQLDialect();

// Identifier quoting
dialect.QuoteIdentifier('UserName');        // "UserName"
dialect.QuoteSchema('__mj', 'User');        // "__mj"."User"

// Pagination
const { prefix, suffix } = dialect.LimitClause(10, 20);
// prefix: '', suffix: 'LIMIT 10 OFFSET 20'

// Boolean and timestamp literals
dialect.BooleanLiteral(true);               // 'true'
dialect.CurrentTimestampUTC();              // "(NOW() AT TIME ZONE 'UTC')"

// UUID generation
dialect.NewUUID();                          // 'gen_random_uuid()'

// Data type mapping
const mapped = dialect.MapDataType('UNIQUEIDENTIFIER');
// { typeName: 'UUID', supportsLength: false, supportsPrecisionScale: false }

dialect.MapDataTypeToString('NVARCHAR', 255);
// 'VARCHAR(255)'

dialect.MapDataTypeToString('NVARCHAR', -1);
// 'TEXT'

dialect.MapDataTypeToString('DECIMAL', undefined, 10, 2);
// 'NUMERIC(10,2)'

// INSERT return clause
dialect.ReturnInsertedClause();             // 'RETURNING *'
dialect.ReturnInsertedClause(['ID', 'Name']);
// 'RETURNING "ID", "Name"'

// Conditional expression
dialect.IIF('x > 0', "'positive'", "'non-positive'");
// "CASE WHEN x > 0 THEN 'positive' ELSE 'non-positive' END"

// Procedure call
dialect.ProcedureCallSyntax('__mj', 'spCreateUser', ['$1', '$2']);
// 'SELECT * FROM __mj."spCreateUser"($1, $2)'

// Trigger DDL
const triggerSQL = dialect.TriggerDDL({
    schema: '__mj',
    tableName: 'User',
    triggerName: 'trgUpdateUser',
    timing: 'BEFORE',
    events: ['UPDATE'],
    body: 'NEW.__mj_UpdatedAt = NOW();',
    functionName: 'fn_update_user_timestamp',
    forEach: 'ROW'
});
// Generates:
//   CREATE OR REPLACE FUNCTION __mj."fn_update_user_timestamp"()
//   RETURNS TRIGGER AS $$ BEGIN ... END; $$ LANGUAGE plpgsql;
//   DROP TRIGGER IF EXISTS ... ;
//   CREATE TRIGGER "trgUpdateUser" BEFORE UPDATE ON __mj."User"
//       FOR EACH ROW EXECUTE FUNCTION __mj."fn_update_user_timestamp"();

// Index DDL
const indexSQL = dialect.IndexDDL({
    schema: '__mj',
    tableName: 'User',
    indexName: 'idx_user_email',
    columns: ['Email'],
    unique: true,
    method: 'btree'
});
// 'CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email"
//      ON __mj."User" USING btree("Email")'
```

### Polymorphic Usage

The key benefit is writing database-agnostic code that works with any dialect:

```typescript
function buildSelectQuery(dialect: SQLDialect, schema: string, table: string,
                          columns: string[], limit: number): string {
    const { prefix, suffix } = dialect.LimitClause(limit);
    const qualifiedTable = dialect.QuoteSchema(schema, table);
    const quotedCols = columns.map(c => dialect.QuoteIdentifier(c)).join(', ');

    return `SELECT ${prefix} ${quotedCols} FROM ${qualifiedTable} ${suffix}`.trim();
}

// SQL Server output:
// SELECT TOP 10 [ID], [Name] FROM [__mj].[User]

// PostgreSQL output:
// SELECT "ID", "Name" FROM "__mj"."User" LIMIT 10
```

## Adding a New Dialect

First decide which kind of dialect the database needs:

- **A query-only dialect** when MJ only reads the database through an External Data Source. It needs the
  `Lexical`, `Grammar` and `Writer` facets, and optionally `Types` and `Binding`.
- **A platform dialect** when MJ itself will run on the database. It needs every facet, including `DDL`.

### A query-only dialect

Extend `AnsiQueryDialect`, which supplies standard SQL facets, and override only what the database does
differently. Build each data facet by spreading the closest existing one (`ANSI_LEXICAL`, `MYSQL_GRAMMAR`,
and so on) and freezing the result; build the writer by extending `AnsiWriter` or another shipped writer.

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
    QueryDialect, AnsiQueryDialect, AnsiWriter, ANSI_LEXICAL, ANSI_GRAMMAR, ANSI_WRITE_STATEMENT_KEYWORDS,
    GetQueryDialect,
} from '@memberjunction/sql-dialect';
import type { DialectKey, DialectLexicalRules, DialectGrammar, DialectWriter, LimitClauseResult } from '@memberjunction/sql-dialect';

/** Lexical rules: standard SQL, plus backtick identifiers and `#` line comments. */
const ACME_LEXICAL: DialectLexicalRules = Object.freeze({
    ...ANSI_LEXICAL,
    IdentifierQuotes: Object.freeze([Object.freeze({ Open: '`', Close: '`', DoubledCloseEscape: true })]),
    LineComments: Object.freeze([
        Object.freeze({ Opener: '--', RequiresWhitespaceAfter: false }),
        Object.freeze({ Opener: '#', RequiresWhitespaceAfter: false }),
    ]),
    UnquotedIdentifierCase: 'none',
});

/** Grammar facts: standard SQL, with LIMIT row caps and two extra write keywords. */
const ACME_GRAMMAR: DialectGrammar = Object.freeze({
    ...ANSI_GRAMMAR,
    ParserGrammar: null,
    RowCapForms: Object.freeze(['limit-offset'] as const),
    WriteStatementKeywords: Object.freeze([...ANSI_WRITE_STATEMENT_KEYWORDS, 'UPSERT', 'LOAD']),
    CallerSQLForbiddenFunctions: Object.freeze(['read_file']),
});

/** Writes what differs from standard SQL; everything else comes from AnsiWriter. */
class AcmeWriter extends AnsiWriter {
    QuoteIdentifier(name: string): string {
        return `\`${name.replace(/`/g, '``')}\``;
    }

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        return { prefix: '', suffix: offset != null ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}` };
    }
}

@RegisterClass(QueryDialect, 'acme')
export class AcmeQueryDialect extends AnsiQueryDialect {
    private readonly writer: DialectWriter = Object.freeze(new AcmeWriter());

    get Key(): DialectKey { return 'acme'; }
    get DisplayName(): string { return 'Acme SQL'; }
    get Lexical(): DialectLexicalRules { return ACME_LEXICAL; }
    get Grammar(): DialectGrammar { return ACME_GRAMMAR; }
    get Writer(): DialectWriter { return this.writer; }
}

GetQueryDialect('acme').Writer.QuoteIdentifier('Name');   // '`Name`'
```

The lexical and grammar facts are what keep the RunQuery safety checks sound on that database: a wrong
string or comment rule lets text hide from the scan for write statements, so take each one from the
database's own documentation.

Registered this way, in your own package, the dialect resolves as soon as the module that declares it has
been loaded. The key must not be one of the built-in keys, which cannot be replaced.

To **ship** a query-only dialect in this package instead:

1. Add it under `src/dialects/` and export it, its writer and its facet constants from `src/index.ts`.
2. Add the class to `QUERY_ONLY_DIALECT_CLASSES` in `src/dialectFactory.ts`, so it resolves without the class
   factory. Do not register it with `@RegisterClass`.
3. Add its row to `EXPECTED_FACTS` in `src/__tests__/conformance/dialectConformance.test.ts`. The conformance
   suite runs over every key `RegisteredDialectKeys()` returns. It checks the declared facts, that the data
   facets are frozen, that a quoted identifier reads back the way the lexical rules say, that row caps use a
   form the grammar declares, and that every writer method writes without throwing.

### A platform dialect

Extend `SQLDialect` and supply every facet. The members listed under [Key Methods](#key-methods) are already
implemented by `SQLDialect` and delegate to the facets, so there are no per-method overrides to write.

| Member | Supply |
|---|---|
| `PlatformKey` | The new key. Also add it to the `DatabasePlatform` union in `sqlDialect.ts`. |
| `DisplayName`, `FormatterLanguage` | The human-readable name and the `sql-formatter` language key. |
| `Lexical`, `Grammar` | Frozen facet objects, as for a query-only dialect. |
| `Writer` | A class extending `AnsiWriter`. |
| `Types` | A frozen `DialectTypes`. Required on a `SQLDialect`. |
| `Binding` | A class implementing `DialectBinding`. Required on a `SQLDialect`. |
| `DDL` | A class extending `BaseSchemaDDL`, constructed over the dialect's writer, with a `DataTypeMap` for `TypeMap`. |

`SQLServerDialect` and `PostgreSQLDialect` are the reference implementations. Then add the class to
`PLATFORM_DIALECT_CLASSES` in `src/dialectFactory.ts`, export it from `src/index.ts`, and add its row to
`EXPECTED_FACTS` in the conformance suite. The existing `crossDialect.test.ts` provides a pattern for testing
multiple dialects against the same assertions.

The `DataTypeMap` maps SQL Server types to the new platform's types:

```typescript
import type { DataTypeMap, MappedType } from '@memberjunction/sql-dialect';

class AcmeDataTypeMap implements DataTypeMap {
    MapType(sourceType: string, sourceLength?: number,
            sourcePrecision?: number, sourceScale?: number): MappedType {
        const normalized = sourceType.toUpperCase().trim();
        switch (normalized) {
            case 'UNIQUEIDENTIFIER':
                return { typeName: 'CHAR', supportsLength: true,
                         supportsPrecisionScale: false, defaultLength: 36 };
            case 'BIT':
                return { typeName: 'BOOLEAN', supportsLength: false,
                         supportsPrecisionScale: false };
            // ... map remaining types
            default:
                return { typeName: normalized, supportsLength: false,
                         supportsPrecisionScale: false };
        }
    }

    MapTypeToString(sourceType: string, sourceLength?: number,
                    sourcePrecision?: number, sourceScale?: number): string {
        const mapped = this.MapType(sourceType, sourceLength, sourcePrecision, sourceScale);
        // Format with length/precision as needed
        return mapped.typeName;
    }
}
```

The facets also decide how row caps, paging, composed queries and the RunQuery template filters behave on
the database; see [Query rendering members](#query-rendering-members).

## Side-by-Side Dialect Comparison

| Feature | SQL Server (`SQLServerDialect`) | PostgreSQL (`PostgreSQLDialect`) |
|---|---|---|
| **Identifier quoting** | `[name]` | `"name"` |
| **Schema-qualified** | `[schema].[object]` | `"schema"."object"` |
| **Boolean literals** | `1` / `0` | `true` / `false` |
| **Current UTC time** | `GETUTCDATE()` | `(NOW() AT TIME ZONE 'UTC')` |
| **New UUID** | `NEWID()` | `gen_random_uuid()` |
| **UUID PK default** | `NEWSEQUENTIALID()` | `gen_random_uuid()` |
| **Auto-increment** | `IDENTITY(1,1)` | `GENERATED ALWAYS AS IDENTITY` |
| **Pagination (no offset)** | `SELECT TOP 10 ...` | `... LIMIT 10` |
| **Pagination (with offset)** | `OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY` | `LIMIT 10 OFFSET 20` |
| **Return inserted** | `OUTPUT INSERTED.*` | `RETURNING *` |
| **Scope identity** | `SCOPE_IDENTITY()` | `lastval()` |
| **Row count** | `@@ROWCOUNT` | `ROW_COUNT` (GET DIAGNOSTICS) |
| **Concatenation** | `+` | `\|\|` |
| **Parameters** | `@p0`, `@p1`, ... | `$1`, `$2`, ... |
| **Batch separator** | `GO` | _(none)_ |
| **Conditional** | `IIF(cond, t, f)` | `CASE WHEN cond THEN t ELSE f END` |
| **Recursive CTE** | `WITH` | `WITH RECURSIVE` |
| **Procedure call** | `EXEC [s].[name] @p0` | `SELECT * FROM s."name"($1)` |
| **CREATE OR REPLACE** | Not supported | FUNCTION, VIEW, PROCEDURE |
| **Full-text search** | `CONTAINS([col], term)` | `col @@ plainto_tsquery(...)` |
| **JSON extract** | `JSON_VALUE(col, 'path')` | `col->>'path'` |
| **String split** | `STRING_SPLIT(val, delim)` | `unnest(string_to_array(val, delim))` |
| **Cast to text** | `CAST(x AS NVARCHAR(MAX))` | `CAST(x AS TEXT)` |
| **Cast to UUID** | `CAST(x AS UNIQUEIDENTIFIER)` | `CAST(x AS UUID)` |
| **Object existence** | `IF OBJECT_ID(...) IS NOT NULL` | `SELECT EXISTS (... pg_catalog ...)` |
| **Comments/descriptions** | `sp_addextendedproperty` | `COMMENT ON ...` |
| **Grants** | `GRANT ... ON [s].[o] TO [r]` | `GRANT ... ON s."o" TO "r"` |

## Query rendering members

The RunQuery rendering pipeline (SQLParser's lexer and paging-shape analysis, the paging and
composition engines in `@memberjunction/generic-database-provider`, the template filters in
`@memberjunction/core` and the parameter processor) reads these facts rather than the platform
name, so a new dialect gets correct rendering by declaring them. Each render uses the dialect of
the request: the provider's platform, or the External Data Source's dialect for a query on one.

The `SQLDialect` members in the first column are kept for existing callers; each reads the facet
member in the second column, which is what code written against a `QueryDialect` reads.

| `SQLDialect` member | Facet member | SQL Server | PostgreSQL | Used for |
|---|---|---|---|---|
| `LimitClause(limit, offset?)` | `Writer.LimitClause` | `TOP n` / `OFFSET … FETCH` | `LIMIT … OFFSET` | Row caps and pages |
| `DefaultPagingOrderBy` | `Grammar.DefaultPagingOrderBy` | `(SELECT NULL)` | `1` | Paging a query with no ORDER BY |
| `SelectListPagingOrderBy` | `Grammar.SelectListPagingOrderBy` | `1` | `null` | Paging a set operation or `SELECT DISTINCT` with no ORDER BY |
| `PagingRequiresOrderBy` | `Grammar.PagingRequiresOrderBy` | `true` | `false` | Whether a page from a derived table needs an ORDER BY |
| `AllowsOrderByInCTE` | `Grammar.AllowsOrderByInCTE` | `false` | `true` | Stripping a composed dependency's ORDER BY |
| `RecursiveCTESyntax()` | `Grammar.RecursiveKeyword` | `WITH` | `WITH RECURSIVE` | Composing into a recursive WITH clause |
| `QueryHintKeyword` | `Grammar.QueryHintKeyword` | `OPTION` | `null` | Keeping a trailing hint clause last; lifting a dependency's hints |
| `CallerSQLForbiddenFunctions` | `Grammar.CallerSQLForbiddenFunctions` | `openrowset`, `openquery`, … | `query_to_xml*`, `ts_stat`, `pg_read_file`, `dblink*`, … | Refusing calls in caller-supplied SQL that read what a check of its tables cannot see |
| `UnseparatedStatementKeywords` | `Grammar.UnseparatedStatementKeywords` | The T-SQL statement keywords (`INSERT`, `DELETE`, `EXEC`, `DECLARE`, …) | none | Finding a second statement that has no separator before it (T-SQL runs `SELECT 1 DELETE FROM t` as two statements) |
| — | `Grammar.WriteStatementKeywords` | `INSERT`, `UPDATE`, `DELETE`, `MERGE`, … | `INSERT`, `UPDATE`, `DELETE`, `COPY`, … | Refusing a statement that writes data, changes the schema or runs code |
| `SupportsEscapeStringLiterals` | `Lexical.StringLiterals` (an `E` prefix with backslash escapes) | `false` | `true` | Lexing `E'…'` strings |
| `SupportsDollarQuotedStrings` | `Lexical.DollarQuotedStrings` | `false` (`'none'`) | `true` (`'tagged'`) | Lexing `$$…$$` strings |
| `QuoteIdentifier(name)` | `Lexical.IdentifierQuotes`, `Writer.QuoteIdentifier` | `[name]` | `"name"` | Lexing quoted identifiers; `sqlIdentifier` |
| `StringLiteralPrefix(text)` | `Writer.StringLiteralPrefix` | `N` for non-ASCII | none | `sqlString`, `sqlIn`, LIKE filters |
| `QuoteStringLiteral(value)` | `Writer.QuoteStringLiteral` | `'…'`, `''` for a quote | `'…'`, `''` for a quote | `sqlString`, `sqlIn`, LIKE filters |
| `EscapeLikePattern(text)` | `Writer.EscapeLikePattern` | `[%]`, `[_]`, `[[]` | `\%`, `\_`, `\\` | LIKE filters |
| `BooleanLiteral(value)` | `Writer.BooleanLiteral` | `1` / `0` | `true` / `false` | `sqlBoolean` |
| `BooleanParameterValue(value)` | `Binding.BooleanParameterValue` | `1` / `0` | `true` / `false` | Binding a boolean query parameter |
| `ParserDialect` | `Grammar.ParserGrammar` | `TransactSQL` | `PostgresQL` | node-sql-parser grammar, where the AST is used. The `SQLDialect` getter throws when the grammar is `null`. |

The template filters read only the `Writer` facet, so they work for a query-only dialect too. A dialect
without a `Binding` facet keeps a boolean parameter as a JavaScript boolean.

## Installation

```bash
npm install @memberjunction/sql-dialect
```

Or, in a MemberJunction workspace, add the dependency to your package's `package.json` and run `pnpm install` from the repo root.

## License

Business Source License 1.1 — see [LICENSE](../../LICENSE) for details.
