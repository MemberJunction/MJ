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
| `InternalRunView()` | Shared view execution engine: view resolution, permissions, field selection, WHERE clause, ORDER BY, OFFSET *or* keyset (`AfterKey`) pagination, aggregates, audit logging. When a view requires multiple SQL statements (e.g., rows + total row count + aggregates), executes them in a single `ExecuteSQLBatch` call to collapse round-trips on providers that support multi-result-set batching (such as SQL Server) |
| `InternalRunViews()` | Parallel wrapper for multiple InternalRunView calls |
| `getRunTimeViewFieldString()` | Builds dialect-neutral field list string for view queries |
| `getRunTimeViewFieldArray()` | Resolves EntityFieldInfo list from params/view/entity |
| `createViewUserSearchSQL()` | Builds full-text search and LIKE-based user search SQL |
| `BuildPaginationSQL()` | Abstract: platform-specific OFFSET/FETCH or LIMIT/OFFSET |
| `BuildKeysetSeekClause()` | Validates entity + `RunViewParams.AfterKey` and returns the `<pk> > value` (or `<`) seek predicate. Throws `AfterKeyNotSupportedError` on incompatible entities. See [KEYSET_PAGINATION_GUIDE.md](../../guides/KEYSET_PAGINATION_GUIDE.md). |
| `formatKeysetSeekValue()` | Type-aware SQL literal escaping for the seek value (UUID validation, numeric/date/string handling, SQL-injection defense). |
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
| `resolveQuery()` | Resolves query from RunQueryParams (by ID or Name+CategoryPath) via QueryEngine |
| `resolveCategoryPath()` | Resolves hierarchical category path to CategoryID |
| `InternalRunQuery()` | Runs a saved query (or routes ad hoc `SQL` to `ExecuteAdhocQuery`): render, authorize the rendered statement, optional materialized read, paging, field-level security column filtering. See [Running Queries](#running-queries) |
| `InternalExecuteQueryFromSpec()` | Runs a transient query spec (SQL, parameter definitions, inline dependencies) through the same render pipeline and safety gate |
| `ExecuteAdhocQuery()` | Runs caller-supplied SQL; it must be a single read statement |
| `processQueryParameters()` | Renders a saved query with `RenderPipeline.Run` for this provider's platform (or an external data source's dialect) |
| `ValidateRenderedQueryForExecution()` | Authorizes the rendered statement for the user, including field-level security; reports whether denied columns must be dropped from a `*` |
| `DescribeStatement()` | Asks the database to describe a statement's result columns without returning rows. Base implementation reports a failure; SQL Server and PostgreSQL override it |
| `buildMaterializedReadQuery()` | Static, pure builder for a read from a materialized snapshot, with every filter value bound as a parameter |
| `QueryUnavailableMessage()` / `RequestedQueryLabel()` | Static: the single refusal message used both for a query that does not exist and for one the caller may not run |
| `BuildParameterPlaceholder()` | Virtual: PG-style $1/$2 by default; SQL Server overrides to @p0/@p1 |
| `getColumnsForDatasetItem()` | Validates and quotes column names for dataset item queries |

## Transactions

Depth 1 is a physical `BEGIN`. Depth 2+ is a dialect savepoint on that same transaction (`SAVE TRANSACTION` on SQL Server, `SAVEPOINT mj_sp_n` on PostgreSQL). Nested `BeginTransaction` with no physical TX is **corruption**, not recovery — the provider throws and resets rather than opening a second physical TX that would commit inner work after the outer writes were aborted.

**Implementer contract** (SQL Server and PostgreSQL already satisfy this):

- `HasPhysicalTransaction`, `BeginPhysicalTransaction`, `CommitPhysicalTransaction`, `RollbackPhysicalTransaction` are abstract and mandatory.
- `HasPhysicalTransaction` must be truthful.
- `BeginPhysicalTransaction` must publish the driver object **after** the driver begin resolves.
- Those hooks must **not** call public `BeginTransaction` / `CommitTransaction` / `RollbackTransaction` — the mutex is not reentrant.
- `AbandonPhysicalTransaction` unpublishes even when driver rollback rejects (`EABORT`).
- `AfterPhysicalCommit` (SQL Server deferred AI tasks) runs **after** depth is 0 and **outside** the mutex.

**Failure semantics.** A server abort of the ambient TX (mssql `ENOTBEGUN`/`EABORT`, pg `25P01`) is not recoverable. The physical handle is abandoned and the provider stays **doomed until the outermost frame settles**: nested `BeginTransaction` throws `DoomedTransactionError` without opening a new physical TX, nested `Commit` pops a frame, outermost `Commit` throws `DoomedTransactionError`, outermost `Rollback` resolves. While doomed, **every statement without an explicit `connectionSource` — reads included — throws `DoomedTransactionError`**, so a plain `Save()` returns false instead of autocommitting on the pool. `ResetTransactionState()` is the fixture/ops escape hatch — do not poke private fields.

**`TransactionDepth` vs `IsInTransaction` vs SQL Server `isTransactionActive`:**

| Accessor | Meaning |
|---|---|
| `TransactionDepth` | Nesting depth. 0 = no TX. Public on `DatabaseProviderBase`. Accounting join-TX reads this (camelCase `transactionDepth` alias for one release). |
| `IsInTransaction` | SQL Server **leaves this false** so `RunMaybeSerial` can fan out. PostgreSQL returns whether a client is held. Do not use this to decide whether to join. |
| `isTransactionActive` (SQL Server) | `_transactionState$` — true while a begun handle is published. |

Concurrent nested scopes on one provider instance are unsupported. MJServer uses per-request providers.

## Usage

Platform-specific providers should extend `GenericDatabaseProvider` instead of `DatabaseProviderBase`:

```typescript
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';

export class MyDatabaseProvider extends GenericDatabaseProvider {
    // Implement remaining abstract methods from DatabaseProviderBase
    // Override EnqueueAfterSaveAIAction if you need transaction-aware deferral
    // Override PostProcessRows if you need platform-specific row processing (call super first)
    // Override DescribeStatement if your database can describe a statement's result columns
}
```

## Running Queries

Every query path in this package (saved queries, ad hoc SQL, transient specs used by `TestQuerySQL`, data contexts and materialized reads) turns query text into the SQL that runs through one entry point, `RenderPipeline.Run`. The query language itself (template tags, filters, `Context` tokens, composition syntax and save-time rules) is specified in **[MJ Query Language](../../guides/MJ_QUERY_LANGUAGE.md)**. This section covers what the provider does with it.

### The render pipeline

`RenderPipeline.Run(sql, ctx)` runs these steps in a fixed order:

1. SQL comments are removed, so a template tag inside a comment does nothing.
2. A template must pass the MJ Query language check; a template with errors is refused.
3. **Render, then compose.** The outer query is rendered once with the caller's values. Each composition it reaches, `{{query:"Category/Path/Name(Arg=Value)"}}`, becomes one *instance*: the composed query plus its arguments, evaluated in the outer query's scope. Each instance is then rendered on its own, with only its own arguments and its own parameter definitions, recursively (up to 10 levels; cycles are refused). The rendered pieces are assembled into one statement, each instance as a CTE. The assembled SQL is never rendered again, so a value that happens to look like a template tag stays a plain value.
4. **Safety gate** (below).
5. **Row cap or paging** (below), applied last because a template can decide whether the statement has an `ORDER BY`.

What this means for query authors:

- **Arguments are explicit, like a function call.** A composed query's parameter that is not passed has no value, even when the outer query has a parameter with the same name. Write `(Region=Region)` to pass it on.
- **A composed query's required parameters are checked.** Leaving one out is a parameter error, not a silently dropped filter.
- **A branch not taken emits nothing.** A composition inside an `{% if %}` that renders false produces no CTE.
- **Two uses of the same query with the same arguments share one CTE**; different arguments give separate CTEs.
- **Lookup is by category path and name.** There is no name-only fallback. A path that is a whole-segment suffix of exactly one query's full path still runs, with a warning logged once, but saving such a path is refused; write the full path.
- A saved composed query must be Reusable, Approved and runnable by the user. One the user may not run is refused with the same message as one that does not exist.
- **Dialect.** Template values render for the dialect of the provider handling the request (`RenderContext.Platform`, or `DialectKey` when it differs, as for a query on an external data source). Two providers on different platforms in one process each render with their own rules.

`RenderResult` carries `FinalSQL`, `AppliedParameters`, `ContextValues` (the `Context` members the template read), `HasCompositions`, `CTEs`, `PagingResult`, `RowCap`, and a `Trace`:

| `Trace` field | Contents |
|---|---|
| `AfterComposition` | The assembled statement: every template rendered, every composition emitted as a CTE. Before row caps and paging |
| `AfterTemplates` | The same text as `AfterComposition`. Authorization checks read it, so it always includes every composed query |
| `AfterPaging` | The final SQL when paging was applied, otherwise `null` |
| `Instances` | Each composed instance, dependencies first: query, path, CTE name, evaluated arguments and its own rendered SQL |
| `CompositionDiagnostics` | Per instance: CTE name, whether its `ORDER BY` was removed, how many inner CTEs were hoisted |

```typescript
import { RenderPipeline, IsQuerySafetyError } from '@memberjunction/generic-database-provider';
import type { UserInfo } from '@memberjunction/core';

function renderPage(sql: string, user: UserInfo): string | null {
    try {
        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            ContextUser: user,
            Parameters: { Region: 'West' },
            Paging: { StartRow: 0, MaxRows: 50 },
            RequireReadStatement: true, // the caller supplied this SQL
        });
        return result.FinalSQL;
    } catch (e) {
        if (IsQuerySafetyError(e)) return null; // not a single read query
        throw e;
    }
}
```

`Paging` and `MaxRows` are mutually exclusive; passing both throws.

### The safety gate

Every rendered statement, on every path, passes `SafetyGate` before it can run. The check reads the SQL with the dialect's lexer, not a full parser, so it works on any statement the database itself would accept. The statement must be exactly one read query, starting with `SELECT` or `WITH`, and may not call functions the dialect lists as forbidden (functions that run SQL given as text or read files or other databases). It fails closed: SQL it cannot read is refused, never passed. SQL with no statement at all is refused when `RequireReadStatement` is set, which the ad hoc and test paths do.

A refusal is a `QuerySafetyError`; use `IsQuerySafetyError(e)` to recognise one (it also matches an error thrown by a second loaded copy of the module). Saving a new or edited query applies the same check, so a query that writes or calls a forbidden function cannot be saved; a refresh of an existing one reports it, and it is refused whenever it runs.

### Paging and row caps

`QueryPagingEngine` pages by editing the statement's text in place: it reads the statement's structure and changes only the clauses it must. It never regenerates SQL from a syntax tree, and it does not wrap the query, so column scopes, `ORDER BY` references and table aliases stay valid.

- **Data SQL** (`WrapWithPaging(sql, startRow, maxRows, platform)` returns `PagingWrappedSQL` with `DataSQL`, `CountSQL`, `Offset`, `PageSize`): `OFFSET … FETCH NEXT …` on SQL Server, `LIMIT … OFFSET …` on PostgreSQL, after the statement's `ORDER BY` and before clauses that must stay last, such as `OPTION (…)`. A statement with no `ORDER BY` gets a default one.
- **Count SQL** puts the query, without its `ORDER BY`, in a CTE and selects `COUNT(*) AS TotalRowCount`.
- **The query's own row cap counts.** A numeric `TOP n`, `LIMIT n` or `FETCH NEXT n` is folded into the page arithmetic, so the smaller limit wins and the total is the size of the capped result. Any other cap (`TOP … PERCENT`, `WITH TIES`, an expression) is kept, and the query is paged as a derived table.
- **Row caps without paging** (`ApplyMaxRows`) add `TOP n` on SQL Server or `LIMIT n` on PostgreSQL, keep a tighter cap already present, and fall back to a derived table only for shapes that cannot be capped in place. `RowCapOutcome` reports whether the cap holds and how (`RowCapMethod`); when it could not be applied the pipeline logs why.
- A statement ending in `FOR JSON` / `FOR XML` returns a document, not rows; asking to page it is an error.
- `ShouldPage(startRow, maxRows)` is true when `MaxRows` is set, even without a `StartRow`, so a plain cap is applied in SQL rather than by fetching everything.

### Materialized reads and named parameters

A saved query with an active materialization can be served from its snapshot table when the caller asks for it and the read would return the same rows as the live query; on any doubt the provider runs the query live. `buildMaterializedReadQuery` builds that read, with every filter value **bound as a parameter**, never written into the SQL text. The read orders by the snapshot's stable row ID, so pages do not skip or repeat rows.

Parameters are typed from the snapshot's own columns. The provider describes the snapshot table (see `DescribeStatement` below), keeps the column types until the next refresh, and binds each value as a `TypedQueryParameter` with the type of the column it is compared with. On SQL Server that is a named, declared parameter, so a `varchar` column is compared with a `varchar` value and keeps its index seek; on PostgreSQL it is a positional parameter with a cast. A value the column type cannot hold sends the read back to the live query.

Two classes describe bind parameters for `ExecuteSQL`:

| Class | Use |
|---|---|
| `TypedQueryParameter(Name, SQLType, Value)` | A parameter with an explicit database type. `TypedBindValue(value, sqlType)` converts a value to what that type binds, or returns `undefined` when it cannot |
| `NamedQueryParameter(Name, Value)` | A parameter passed by name whose type the driver infers. SQL Server binds `@p0` as `p0` and leaves the statement text alone; PostgreSQL binds by position (`$1`) |

A plain array of values (`[value1, value2]`) is the **legacy positional form**: SQL Server providers bind it by rewriting every `?` in the text, including one inside a string literal or comment. Prefer named parameters in new code:

```typescript
import { NamedQueryParameter, type GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import type { UserInfo } from '@memberjunction/core';

// SQL Server: @p0 is bound by name as p0
async function customerNames(provider: GenericDatabaseProvider, contextUser: UserInfo): Promise<string[]> {
    const rows = await provider.ExecuteSQL<{ Name: string }>(
        'SELECT Name FROM [dbo].[Customer] WHERE Region = @p0',
        [new NamedQueryParameter('p0', 'West')],
        undefined,
        contextUser,
    );
    return rows.map(r => r.Name);
}
```

### `DescribeStatement`

```typescript
public async DescribeStatement(sql: string, contextUser?: UserInfo): Promise<DescribeStatementResult>
```

Asks the database server to describe the result columns a statement would return, without returning its rows. SQL Server compiles the statement without running it; PostgreSQL runs it with no rows returned inside a transaction that is rolled back. The base class reports a failure, so a provider for a database that cannot describe statements needs no override.

The result has `Success`, `Columns` and `Diagnostics` (the server's error text on failure). Each `DescribedColumn` gives `Name`, `Ordinal`, `SQLBaseType`, `SQLFullType` (such as `nvarchar(100)`), `IsNullable` (`null` when the server does not say, as on PostgreSQL), `IsComputed`, and `Source`: the table or view column the value passes through unchanged, or `null`. Build results with `DescribeStatementSuccess` / `DescribeStatementFailure`; `BaseTypeOf('decimal(18,2)')` returns `decimal`.

It is used to record a query's output columns and types when the query is saved, to read a snapshot's column types for materialized reads, and by field-level security on `*` (below). Descriptions are cached per statement and dialect for a short time.

### Field-level security on queries

When a user is denied read access to some fields, a saved query is checked against those permissions on the **rendered** statement, so composed queries and template branches are covered:

- A query that names a field the user may not read, anywhere in the statement, is refused before it runs. The message is the same as for a query that does not exist: `Query '<what you asked for>' does not exist or you do not have permission to run it.` It echoes only the identifier the caller supplied.
- A denied field that reaches the output only through a plain `*` or `alias.*` does not refuse the query. The query runs, and that column is removed from this user's results, so the result columns can differ between users. The columns to remove come from `DescribeStatement`; if the statement cannot be described, the run is refused rather than risk returning a denied column. A query on an external data source that would need this filtering is refused.
- A query authorized by its own `MJ: Query Permissions` rows runs with the rights its author granted, and field-level security does not change it.

### Deprecated in this package

These still work and remain until 7.0. The last row is a legacy form rather than a marked deprecation:

| Deprecated | Use instead |
|---|---|
| `buildMaterializedReadQuery({ isPostgres })` | Pass `dialect` (and `columnTypes` for typed binding) |
| `buildMaterializedReadQuery` without `columnTypes` | Pass the snapshot's `columnTypes`, so values bind as `TypedQueryParameter` |
| `QueryPagingEngine.StripTopClause` / `stripTopClause` | `SqlDocument.Parse(sql, dialect).RowCaps()` from `@memberjunction/sql-parser` to find a `TOP`, and an `EditSet` to remove it |
| `QueryPagingEngine.extractOrderBy` | `QueryPagingEngine.ExtractOrderBy` |
| `ClientClauseScreen.AstContainsWriteNode` | `StrictFragmentValidator.ValidateReadOnlyStatement` from `@memberjunction/sql-parser` (its result reports `ContainsNestedWrite`) |
| Positional `?` parameter arrays | `NamedQueryParameter` or `TypedQueryParameter` lists |

## Keyset (Seek) Pagination

`InternalRunView` honors `RunViewParams.AfterKey` (a `CompositeKey`) to emit keyset-style SQL — `WHERE pk > @lastSeen ORDER BY pk LIMIT N` — instead of `OFFSET ... FETCH NEXT N`. Keyset stays O(log N) regardless of depth, making it the right tool for background jobs iterating large entities.

The same code path works on both SQL Server (uses `TOP N` via `BuildTopClause`) and PostgreSQL (uses `LIMIT N` via `BuildNonPaginatedLimitSQL`) — no per-provider override needed.

Keyset queries automatically bypass `LocalCacheManager` (both read and write) and are routed past the smart cache check in `RunViewsWithCacheCheck` because each call uses a different seek key.

Validation enforced by `BuildKeysetSeekClause`:
- Entity must have a single-column PK (composite throws `AfterKeyNotSupportedError` with `Reason: 'CompositePK'`)
- PK type must be in the orderable allowlist (everything sensible is)
- `OrderBy`, if set, must reference only the PK column
- Cannot be combined with non-zero `StartRow`

See **[KEYSET_PAGINATION_GUIDE.md](../../guides/KEYSET_PAGINATION_GUIDE.md)** for the full pattern and reference implementations.

## Single-Flight `RunView` Coalescing & Bounded Batch Concurrency

To prevent connection pool starvation and thundering-herd SQL queries when multiple concurrent requests or engines query the same uncached view simultaneously, `GenericDatabaseProvider` provides two built-in safeguards:

1. **Single-Flight In-Flight `RunView` Coalescing (`EnableInflightRunViewCoalescing`)**:
   - Concurrent `InternalRunView` calls on the same non-transactional provider (`TransactionDepth === 0`) with identical canonical fingerprints (`EntityName`/`ViewID`/`ViewName`, `ExtraFilter`, `OrderBy`, `Fields`, `UserSearchString`, `MaxRows`, `StartRow`, `ResultType`, `Aggregates`, and user role/ID scope when RLS applies) share a single database execution.
   - Each caller receives an isolated deep clone of the `Results` array and row objects (`cloneRunViewResultForCoalescedCaller`) so in-place caller mutations never bleed across requests.
   - Eligible only when `ResultType` is `'simple'` or `'count_only'` and `SaveViewResults` / `ForceAuditLog` are not set.

2. **Bounded Batch Concurrency (`MaxConcurrentViewsPerBatch = 8`)**:
   - `InternalRunViews` deduplicates identical view items within the batch and limits concurrent physical database executions to `GenericDatabaseProvider.MaxConcurrentViewsPerBatch` (default `8`), preventing large `RunViews` batches from exhausting the connection pool.

See the **[Server Scaling and Broadcast Architecture Guide](../../guides/SERVER_SCALING_AND_BROADCAST_ARCHITECTURE.md)** for full details.

## Server-Side Cache Backend

`GenericDatabaseProvider` owns the `LocalStorageProvider` property that all database providers (SQL Server, PostgreSQL) inherit. This is the cache backend used by `LocalCacheManager`, metadata persistence, and all server-side caching operations.

By default, it uses `InMemoryLocalStorageProvider` — data stored in a `Map` inside the Node.js process. For production deployments, swap it to a Redis-backed provider for shared, persistent caching across multiple MJAPI instances.

```typescript
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { Metadata } from '@memberjunction/core';
import type { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';

// During server startup:
const redis = new RedisLocalStorageProvider({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    defaultTTLSeconds: 300,
});
(Metadata.Provider as GenericDatabaseProvider).SetLocalStorageProvider(redis);
```

| Method | Description |
|--------|-------------|
| `LocalStorageProvider` (getter) | Returns the active `ILocalStorageProvider`, lazily creating an `InMemoryLocalStorageProvider` if none has been set |
| `SetLocalStorageProvider(provider)` | Replaces the active provider at runtime (e.g., to swap in Redis after configuration is loaded) |

See the [`@memberjunction/redis-provider` README](../RedisProvider/) for full configuration options, cloud provider examples (Azure Managed Redis, AWS ElastiCache), and production recommendations.

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

## Full-Text Search

This package implements the `createViewUserSearchSQL()` method which generates platform-specific full-text search SQL. When `entity.FullTextSearchEnabled` is true, it calls the CodeGen-generated search function. Otherwise, it falls back to `LIKE` on fields with `IncludeInUserSearchAPI`. See the **[Full-Text Search Guide](../MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md)** for the complete architecture.

## Dependencies

- `@memberjunction/core` — Base class and entity types
- `@memberjunction/core-entities` — `MJUserViewEntityExtended`, `ViewInfo` for view WHERE clause rendering
- `@memberjunction/actions` / `@memberjunction/actions-base` — Entity action engine
- `@memberjunction/aiengine` — AI action execution
- `@memberjunction/encryption` — Field-level encryption/decryption
- `@memberjunction/global` — Global object store, `ensureRegExps` for pattern filtering
- `@memberjunction/queue` — Task queue for after-save AI actions
- `@memberjunction/sql-parser` — Lexer, structural reader and edits used by the safety gate, composition assembly and paging
- `@memberjunction/sql-dialect` — Per-platform quoting, parameter placeholders and forbidden-function lists
- `@memberjunction/query-processor` — Template rendering and parameter validation for queries
- `sql-formatter` — SQL pretty-printing for log output
- `uuid` — Session ID generation
