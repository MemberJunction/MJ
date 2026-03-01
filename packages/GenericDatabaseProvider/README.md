# @memberjunction/generic-database-provider

Intermediate abstract base class for MemberJunction database providers. Sits between the lightweight `DatabaseProviderBase` (in `@memberjunction/core`) and platform-specific providers (`SQLServerDataProvider`, `PostgreSQLDataProvider`).

## Why This Package Exists

`DatabaseProviderBase` in MJCore cannot depend on heavy packages like `@memberjunction/actions`, `@memberjunction/aiengine`, `@memberjunction/encryption`, or `@memberjunction/core-entities`. However, the entity action hooks, AI action processing, field-level encryption, and view WHERE clause rendering logic is shared between SQL Server and PostgreSQL providers.

This package provides a single implementation of that shared logic, eliminating code duplication while keeping MJCore lightweight.

## Inheritance Chain

```
DatabaseProviderBase (@memberjunction/core — no heavy deps, abstract)
  └── GenericDatabaseProvider (this package — ActionEngine, AIEngine, EncryptionEngine)
      ├── SQLServerDataProvider (@memberjunction/sqlserver-dataprovider)
      └── PostgreSQLDataProvider (@memberjunction/postgresql-dataprovider)
```

## What It Provides

| Method | Description |
|--------|-------------|
| `HandleEntityActions()` | Discovers and runs active entity actions for save/delete/validate via `EntityActionEngineServer` |
| `HandleEntityAIActions()` | Runs AI-triggered entity actions (before save blocks, after save fires and forgets) |
| `GetEntityAIActions()` | Filters `AIEngine.EntityAIActions` for the given entity and timing |
| `EnqueueAfterSaveAIAction()` | Virtual hook for after-save AI task enqueueing (overridden by SQL Server for transaction deferral) |
| `OnValidateBeforeSave()` | Runs validation entity actions and returns error messages |
| `OnBeforeSaveExecute()` | Runs before-save entity actions and AI actions |
| `OnAfterSaveExecute()` | Fires after-save entity/AI actions (no await) |
| `OnBeforeDeleteExecute()` | Runs before-delete entity actions and AI actions |
| `OnAfterDeleteExecute()` | Fires after-delete entity/AI actions (no await) |
| `PostProcessRows()` | Platform-specific datetime adjustment (via `AdjustDatetimeFields` hook) + field-level decryption using `EncryptionEngine` |
| `AdjustDatetimeFields()` | Virtual hook for platform-specific datetime corrections (no-op default; SQL Server overrides for DATETIMEOFFSET) |
| `ExecuteSQLBatch()` | Executes multiple SQL queries; default runs in parallel via `Promise.all(ExecuteSQL(...))`, SQL Server overrides for true multi-result-set batching |
| `GetDatasetStatusByName()` | Retrieves dataset item status (max date + row count) using `ExecuteSQLBatch` |
| `CreateSqlLogger()` | Creates a SQL logging session that captures all SQL operations to a file |
| `GetActiveSqlLoggingSessions()` | Lists all active SQL logging sessions |
| `GetSqlLoggingSessionById()` | Retrieves a specific logging session by ID |
| `DisposeAllSqlLoggingSessions()` | Disposes all active logging sessions (used on shutdown) |
| `LogSQLStatement()` | Static method to log SQL from external sources (e.g., transaction groups) |
| `RenderViewWhereClause()` | Resolves `{%UserView "id"%}` templates in saved view WHERE clauses |
| `InternalRunView()` | Shared view execution engine: view resolution, permissions, field selection, WHERE clause, ORDER BY, pagination, aggregates, audit logging |
| `InternalRunViews()` | Parallel wrapper for multiple InternalRunView calls |
| `getRunTimeViewFieldString()` | Builds dialect-neutral field list string for view queries |
| `getRunTimeViewFieldArray()` | Resolves EntityFieldInfo list from params/view/entity |
| `createViewUserSearchSQL()` | Builds full-text search and LIKE-based user search SQL |
| `BuildPaginationSQL()` | Abstract: platform-specific OFFSET/FETCH or LIMIT/OFFSET |
| `BuildTopClause()` | Virtual: SQL Server TOP N, PG returns empty (default) |
| `BuildNonPaginatedLimitSQL()` | Virtual: PG LIMIT N for non-paginated row limits (default: empty) |
| `TransformExternalSQLClause()` | Virtual: PG overrides to quote mixed-case identifiers (default: no-op) |
| `executeSQLForUserViewRunLogging()` | Virtual: SQL Server overrides for view run audit logging (default: null) |
| `Load()` | Loads a single entity record by composite key with dialect-neutral quoting, char field trimming, relationship loading, and PostProcessRows |
| `GetDatasetByName()` | Retrieves a dataset by name, executes item queries with dialect-neutral SQL, applies PostProcessRows |
| `RunViewsWithCacheCheck()` | Smart cache validation for batch RunViews: compares MAX(__mj_UpdatedAt)/COUNT(*), supports differential updates |
| `RunQueriesWithCacheCheck()` | Smart cache validation for batch RunQueries using CacheValidationSQL |
| `isCacheCurrent()` | Compares client cache status with server status (date + row count) |
| `buildWhereClauseForCacheCheck()` | Virtual: builds WHERE from ExtraFilter, UserSearch, and RLS |
| `getBatchedServerCacheStatus()` | Virtual: batched server-side cache status check (default: parallel individual queries; SQL Server overrides for ExecuteSQLBatch) |
| `getBatchedQueryCacheStatus()` | Virtual: batched query cache status check (default: parallel individual queries; SQL Server overrides for ExecuteSQLBatch) |
| `runFullQueryAndReturn()` | Wraps InternalRunView with maxUpdatedAt extraction |
| `runDifferentialQueryAndReturn()` | Returns only changed rows since client's cached state, with hidden-delete detection |
| `getDeletedRecordIDsSince()` | Virtual: queries RecordChange table for deletions since a timestamp |
| `getUpdatedRowsSince()` | Virtual: queries entity view for rows updated since a timestamp |
| `resolveQueryInfo()` | Resolves QueryInfo from RunQueryParams (by ID or Name+CategoryPath) |
| `findQueryInEngine()` | Searches QueryEngine for a fresh query entity |
| `refreshQueryInfoFromEntity()` | Creates fresh QueryInfo from entity and patches ProviderBase cache |
| `resolveCategoryPath()` | Resolves hierarchical category path to CategoryID |
| `BuildParameterPlaceholder()` | Virtual: PG-style $1/$2 by default; SQL Server overrides to @p0/@p1 |
| `getColumnsForDatasetItem()` | Validates and quotes column names for dataset item queries |

## Usage

Platform-specific providers should extend `GenericDatabaseProvider` instead of `DatabaseProviderBase`:

```typescript
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';

export class MyDatabaseProvider extends GenericDatabaseProvider {
    // Implement remaining abstract methods from DatabaseProviderBase
    // Override EnqueueAfterSaveAIAction if you need transaction-aware deferral
    // Override PostProcessRows if you need platform-specific row processing (call super first)
}
```

## SQL Logging

The SQL logging subsystem lives in GenericDatabaseProvider so it is available to all platform-specific providers (SQL Server, PostgreSQL, etc.). Sessions capture executed SQL statements to files with filtering, formatting, and Flyway migration support.

```typescript
import { Metadata } from '@memberjunction/core';
import type { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';

const provider = Metadata.Provider as GenericDatabaseProvider;

// Create a logging session
const session = await provider.CreateSqlLogger('./logs/operations.sql', {
    statementTypes: 'mutations',
    prettyPrint: true,
    filterPatterns: [/spCreateAIPromptRun/i],
    filterType: 'exclude',
});

try {
    // All SQL operations are automatically captured
    await provider.ExecuteSQL('INSERT INTO ...');
} finally {
    await session.dispose();
}
```

Key types exported from this package:

| Export | Type | Description |
|--------|------|-------------|
| `SqlLoggingOptions` | Interface | Configuration options for SQL logging sessions |
| `SqlLoggingSession` | Interface | Public interface for an active logging session |
| `SqlLoggingSessionImpl` | Class | Internal session implementation (file I/O, formatting, filtering) |

## Switching Database Platforms (Developer Note)

When developing against both SQL Server and PostgreSQL on the same URL/port, **clear your browser cache** after switching backends. The client-side `GraphQLDataProvider` caches entity metadata and query results in the browser. UUID casing differs between platforms (SQL Server: uppercase, PostgreSQL: lowercase), so stale cached data from one platform will cause subtle mismatches on the other. Clear browser cache or use an incognito window whenever you switch the backend database.

## Dependencies

- `@memberjunction/core` — Base class and entity types
- `@memberjunction/core-entities` — `MJUserViewEntityExtended`, `ViewInfo` for view WHERE clause rendering
- `@memberjunction/actions` / `@memberjunction/actions-base` — Entity action engine
- `@memberjunction/aiengine` — AI action execution
- `@memberjunction/encryption` — Field-level encryption/decryption
- `@memberjunction/global` — Global object store, `ensureRegExps` for pattern filtering
- `@memberjunction/queue` — Task queue for after-save AI actions
- `sql-formatter` — SQL pretty-printing for log output
- `uuid` — Session ID generation
