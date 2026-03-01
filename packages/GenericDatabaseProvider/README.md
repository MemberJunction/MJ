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
| `PostProcessRows()` | Decrypts encrypted fields using `EncryptionEngine` |
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

## Dependencies

- `@memberjunction/core` — Base class and entity types
- `@memberjunction/core-entities` — `MJUserViewEntityExtended`, `ViewInfo` for view WHERE clause rendering
- `@memberjunction/actions` / `@memberjunction/actions-base` — Entity action engine
- `@memberjunction/aiengine` — AI action execution
- `@memberjunction/encryption` — Field-level encryption/decryption
- `@memberjunction/queue` — Task queue for after-save AI actions
