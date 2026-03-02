# @memberjunction/sql-dialect

**Version**: 5.2.0
**Zero runtime dependencies**

## Overview

`@memberjunction/sql-dialect` is an abstract SQL dialect layer that enables database-agnostic SQL generation across MemberJunction. It encapsulates every platform-specific SQL syntax pattern -- identifier quoting, pagination, data types, DDL generation, full-text search, and more -- into a single, testable abstraction with zero database driver dependencies.

This package is used by CodeGen, data providers, and SQL converters throughout the MemberJunction monorepo. When code needs to emit SQL that works on both SQL Server and PostgreSQL, it programs against the `SQLDialect` abstract class and lets the concrete dialect handle platform differences.

## Architecture

### Class Hierarchy

```
SQLDialect (abstract base)
  |-- SQLServerDialect
  |-- PostgreSQLDialect
```

`SQLDialect` defines approximately 30 abstract methods spanning identifier quoting, pagination, literal expressions, INSERT/UPDATE return patterns, DDL generation, full-text search, data type mapping, and schema introspection. Each concrete dialect implements every method with platform-native SQL.

### Key Interfaces

| Interface | Purpose |
|---|---|
| `LimitClauseResult` | `{ prefix: string; suffix: string }` -- Flexible pagination fragments. SQL Server uses `prefix` (TOP), PostgreSQL uses `suffix` (LIMIT/OFFSET). |
| `SchemaIntrospectionSQL` | Catalog query templates for discovering tables, columns, constraints, foreign keys, and indexes. |
| `TriggerOptions` | Configuration for trigger DDL generation (schema, table, timing, events, body, function name, FOR EACH ROW/STATEMENT). |
| `IndexOptions` | Configuration for index DDL generation (columns, uniqueness, method, partial WHERE, INCLUDE columns). |
| `DataTypeMap` | Maps source database types to target platform types. |
| `MappedType` | Describes a mapped type: `typeName`, `supportsLength`, `supportsPrecisionScale`, `defaultLength`. |
| `DatabasePlatform` | Union type: `'sqlserver' \| 'postgresql'` |

## Key Methods

### Identifier Quoting

| Method | Description | SQL Server | PostgreSQL |
|---|---|---|---|
| `QuoteIdentifier(name)` | Wraps a single identifier | `[name]` | `"name"` |
| `QuoteSchema(schema, object)` | Schema-qualified reference | `[schema].[object]` | `schema."object"` |

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
| `Coalesce(expr, fallback)` | Null coalescing (concrete) | `COALESCE(expr, fallback)` | `COALESCE(expr, fallback)` |
| `IsNull(expr, fallback)` | Alias for Coalesce | `COALESCE(expr, fallback)` | `COALESCE(expr, fallback)` |
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
dialect.QuoteSchema('__mj', 'User');        // __mj."User"

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
// SELECT "ID", "Name" FROM __mj."User" LIMIT 10
```

## Adding a New Dialect

To add support for a new database platform (e.g., MySQL):

1. **Create the type map class** implementing `DataTypeMap`:

```typescript
import { DataTypeMap, MappedType } from '@memberjunction/sql-dialect';

class MySQLDataTypeMap implements DataTypeMap {
    MapType(sourceType: string, sourceLength?: number,
            sourcePrecision?: number, sourceScale?: number): MappedType {
        const normalized = sourceType.toUpperCase().trim();
        switch (normalized) {
            case 'UNIQUEIDENTIFIER':
                return { typeName: 'CHAR', supportsLength: true,
                         supportsPrecisionScale: false, defaultLength: 36 };
            case 'BIT':
                return { typeName: 'TINYINT(1)', supportsLength: false,
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

2. **Create the dialect class** extending `SQLDialect`:

```typescript
import { SQLDialect, DataTypeMap } from '@memberjunction/sql-dialect';

export class MySQLDialect extends SQLDialect {
    get PlatformKey(): DatabasePlatform { return 'mysql' as DatabasePlatform; }
    get TypeMap(): DataTypeMap { return new MySQLDataTypeMap(); }

    QuoteIdentifier(name: string): string { return `\`${name}\``; }
    QuoteSchema(schema: string, object: string): string {
        return `\`${schema}\`.\`${object}\``;
    }
    LimitClause(limit: number, offset?: number): LimitClauseResult {
        const suffix = offset != null
            ? `LIMIT ${limit} OFFSET ${offset}`
            : `LIMIT ${limit}`;
        return { prefix: '', suffix };
    }
    BooleanLiteral(value: boolean): string { return value ? '1' : '0'; }
    // ... implement all remaining abstract methods (~25+)
}
```

3. **Update the `DatabasePlatform` type** in `sqlDialect.ts` to include the new platform key.

4. **Export from `index.ts`**:

```typescript
export { MySQLDialect } from './mysqlDialect.js';
```

5. **Add tests** in `src/__tests__/mysqlDialect.test.ts` covering every method. The existing `crossDialect.test.ts` provides a pattern for testing multiple dialects against the same assertions.

## Side-by-Side Dialect Comparison

| Feature | SQL Server (`SQLServerDialect`) | PostgreSQL (`PostgreSQLDialect`) |
|---|---|---|
| **Identifier quoting** | `[name]` | `"name"` |
| **Schema-qualified** | `[schema].[object]` | `schema."object"` |
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

## Installation

```bash
npm install @memberjunction/sql-dialect
```

Or, in a MemberJunction workspace, add the dependency to your package's `package.json` and run `npm install` from the repo root.

## License

ISC
