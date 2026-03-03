# @memberjunction/postgresql-dataprovider

## Overview

Full-featured PostgreSQL data provider for MemberJunction. This package implements `DatabaseProviderBase` from `@memberjunction/core` to provide a complete PostgreSQL backend for MemberJunction applications. It also includes a CodeGen provider for generating PostgreSQL-native database objects (views, PL/pgSQL functions, triggers, indexes, full-text search, and more).

Key capabilities:

- Connection pooling via `pg.Pool` with configurable min/max connections
- Transaction support with BEGIN/COMMIT/ROLLBACK and variable dependencies between items
- Parameterized queries using PostgreSQL `$1, $2, ...` positional parameters
- Full CRUD operations through generated PL/pgSQL functions
- CodeGen provider that produces PostgreSQL-native DDL from MemberJunction metadata
- Type conversion for booleans, dates, UUIDs, numbers, and binary data

## Architecture

### Class Hierarchy

```
DatabaseProviderBase (@memberjunction/core)
    └── PostgreSQLDataProvider
            ├── PGConnectionManager (connection pooling)
            ├── PGQueryParameterProcessor (type conversion)
            └── PostgreSQLTransactionGroup (transaction support)

CodeGenDatabaseProvider (@memberjunction/codegen-lib)
    └── PostgreSQLCodeGenProvider (DDL generation)
            └── PostgreSQLCodeGenConnection (query execution)
```

### Source Files

| File | Purpose |
|------|---------|
| `PostgreSQLDataProvider.ts` | Main provider: CRUD, queries, view execution, dataset handling, caching |
| `pgConnectionManager.ts` | Connection pool lifecycle with `pg.Pool`, shared pool support |
| `queryParameterProcessor.ts` | Boolean, date, UUID, number, and binary type conversion |
| `types.ts` | `PostgreSQLProviderConfigData` and `PostgreSQLProviderConfigOptions` interfaces |
| `PostgreSQLTransactionGroup.ts` | BEGIN/COMMIT/ROLLBACK with variable dependencies between transaction items |
| `codegen/PostgreSQLCodeGenProvider.ts` | CodeGen: views, CRUD functions, triggers, indexes, FTS, permissions |
| `codegen/PostgreSQLCodeGenConnection.ts` | Translates `@ParamName` notation to `$N` positional parameters |

## Configuration

### Connection Configuration

```typescript
interface PGConnectionConfig {
    Host: string;
    Port?: number;                    // Default: 5432
    Database: string;
    User: string;
    Password: string;
    SSL?: boolean | pg.ConnectionConfig['ssl'];
    MaxConnections?: number;          // Default: 20
    MinConnections?: number;          // Default: 2
    IdleTimeoutMillis?: number;       // Default: 30000
    ConnectionTimeoutMillis?: number; // Default: 30000
    MJCoreSchemaName?: string;        // Default: '__mj'
}
```

### Provider Configuration

The `PostgreSQLProviderConfigData` class wraps the connection config and adds MemberJunction-specific options:

```typescript
const configData = new PostgreSQLProviderConfigData(
    connectionConfig,         // PGConnectionConfig
    '__mj',                   // MJCoreSchemaName (default: '__mj')
    0,                        // CheckRefreshIntervalSeconds (0 = disabled)
    ['public', '__mj'],       // includeSchemas (optional)
    [],                       // excludeSchemas (optional)
    true                      // ignoreExistingMetadata (default: true)
);
```

### Environment Variables

For CodeGen shell execution (psql):

- `PGHOST` -- PostgreSQL server host
- `PGPORT` -- PostgreSQL server port
- `PGDATABASE` -- Database name
- `PGUSER` -- Username
- `PGPASSWORD` -- Password (or use `.pgpass` file)

## Usage

### Basic Setup

```typescript
import { PostgreSQLDataProvider } from '@memberjunction/postgresql-dataprovider';

const provider = new PostgreSQLDataProvider();
await provider.Config(new PostgreSQLProviderConfigData(
    {
        Host: 'localhost',
        Port: 5432,
        Database: 'memberjunction',
        User: 'mj_user',
        Password: 'secret',
        MJCoreSchemaName: '__mj'
    },
    '__mj'
));
```

### Running Queries

```typescript
// Execute raw SQL with positional parameters
const result = await provider.ExecuteSQL<MyType>(
    'SELECT * FROM __mj."User" WHERE "ID" = $1',
    [$userId]
);

// Run views (MJ pattern)
const results = await provider.InternalRunView<UserEntity>({
    EntityName: 'Users',
    ExtraFilter: "Status='Active'",
    OrderBy: 'Name',
    MaxRows: 100
});
```

### Transactions

```typescript
const txGroup = await provider.CreateTransactionGroup();
// Add operations to the transaction group...
await txGroup.Submit(); // Executes all items in a single BEGIN/COMMIT block
```

The `PostgreSQLTransactionGroup` supports variable dependencies between transaction items, allowing later items to reference values produced by earlier items in the same transaction.

### Connection Pool Sharing

The `PGConnectionManager` supports shared pools for scenarios where multiple provider instances need to share a single connection pool (e.g., per-request providers):

```typescript
// Primary provider creates the pool
const primary = new PGConnectionManager();
await primary.Initialize(config);

// Per-request providers share the pool (won't close it on Close())
const perRequest = new PGConnectionManager();
perRequest.InitializeWithExistingPool(primary.Pool, config);
```

## CodeGen Provider

### What It Generates

The `PostgreSQLCodeGenProvider` generates PostgreSQL-native database objects during the MemberJunction code generation process:

- **Base Views** -- `CREATE OR REPLACE VIEW` with joins and soft-delete filtering
- **CRUD Functions** -- PL/pgSQL functions (not stored procedures) with `RETURNING` clause
- **Timestamp Triggers** -- PL/pgSQL trigger functions for automatic `__mj_UpdatedAt` maintenance
- **Foreign Key Indexes** -- `CREATE INDEX IF NOT EXISTS` with 63-character name limit enforcement
- **Full-Text Search** -- tsvector columns, GIN indexes, PL/pgSQL trigger for auto-update, and search functions
- **Cascade Deletes** -- Recursive delete/update-to-NULL operations for related records
- **Permissions** -- GRANT statements per entity role
- **Drop Guards** -- `DROP ... IF EXISTS ... CASCADE` statements before object creation

### Key PostgreSQL-Specific Patterns

- Uses PL/pgSQL `CREATE OR REPLACE FUNCTION` instead of SQL Server stored procedures
- Functions return query results via `RETURNS TABLE(...)` or `RETURNS SETOF`
- Uses dollar-quoted strings (`$$...$$`) for function bodies
- Implements `LATERAL` joins instead of SQL Server's `OUTER APPLY`
- Full-text search uses `tsvector`/`tsquery` with GIN indexes (not `CONTAINSTABLE`)
- Index names are truncated to 63 characters to respect the PostgreSQL identifier limit
- Boolean columns use native `true`/`false` instead of SQL Server's `1`/`0`
- Uses `LIMIT`/`OFFSET` for pagination instead of `TOP`/`OFFSET-FETCH`
- Identifier quoting uses `"double quotes"` instead of SQL Server's `[brackets]`

### Registration

The CodeGen provider is registered via the MemberJunction class factory:

```typescript
@RegisterClass(CodeGenDatabaseProvider, 'PostgreSQLCodeGenProvider')
export class PostgreSQLCodeGenProvider extends CodeGenDatabaseProvider { ... }
```

## Relationship to Other Packages

### @memberjunction/sql-dialect

- Provides `PostgreSQLDialect` for identifier quoting, pagination syntax, and type mapping
- Used by both `PostgreSQLDataProvider` and `PostgreSQLCodeGenProvider`
- Zero-dependency abstraction layer shared across all database-specific code

### @memberjunction/codegen-lib

- Provides `CodeGenDatabaseProvider` abstract base class with ~55 methods
- `PostgreSQLCodeGenProvider` implements all abstract methods with PostgreSQL-native SQL
- The CodeGen orchestration layer calls these methods to generate DDL during code generation runs

### @memberjunction/core

- Provides `DatabaseProviderBase` abstract class defining the full MJ data provider contract
- `PostgreSQLDataProvider` implements CRUD, view execution, dataset operations, and metadata access

### @memberjunction/global

- Provides `@RegisterClass` for class factory registration
- `PostgreSQLCodeGenProvider` registers itself so the CodeGen system can discover it at runtime

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/core` | Base provider interfaces and entity framework |
| `@memberjunction/codegen-lib` | CodeGen base class and orchestration types |
| `@memberjunction/sql-dialect` | SQL dialect abstraction (quoting, pagination, types) |
| `@memberjunction/global` | Class registration via `@RegisterClass` |
| `pg` | PostgreSQL Node.js driver (connection pooling, queries) |

## Testing

```bash
cd packages/PostgreSQLDataProvider
npm run test          # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Tests use Vitest with mocked database connections (no live database required).

## Platform Key

The provider identifies itself with `PlatformKey: 'postgresql'`, which is used throughout MemberJunction to select the correct SQL dialect, CodeGen templates, and runtime behavior for PostgreSQL deployments.
