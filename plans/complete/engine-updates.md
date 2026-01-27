# Engine Updates: Query Caching and Startup Optimization

## Overview

This document proposes updates to the MemberJunction Engine architecture to support:
1. Query caching via smart cache refresh pattern (like RunViews)
2. Centralized startup management through `StartupManager`
3. Standardized engine data loading with local cache support

## Current State

### RunView Smart Cache Refresh (Implemented)
The `RunViewsWithCacheCheck` pattern has been implemented with the following flow:
1. Client checks local cache for fingerprint match
2. If cached, client sends cache status (maxUpdatedAt + rowCount) to server
3. Server validates: returns 'current' (use cached) or 'stale' (with fresh data)
4. Single network call combines cache validation AND data refresh

**Key Benefits:**
- Single network call vs. two calls (check + fetch)
- No data transfer when cache is current
- Automatic cache update when stale
- Works seamlessly with existing RunViews API via `CacheLocal: true` flag

**Note:** Smart caching is automatically enabled when `CacheLocal: true` is set. There is no separate `SmartCacheRefresh` flag - local caching always uses the smart refresh pattern.

### Current Engine Architecture
Engines (AIEngine, CommunicationEngine, etc.) extend `BaseEngine` which:
- Implements `IStartupSink` for startup registration
- Loads entity data during startup
- Uses RunViews for data fetching

## Key Difference: Views vs Queries

### Views (RunView/RunViews)
Views are a **constrained abstraction** over queries:
- Guaranteed to return rows from a **single entity**
- 1:1 mapping between result rows and entity records
- Entity has known fields including `__mj_UpdatedAt`
- Server can automatically compute `MAX(__mj_UpdatedAt)` and `COUNT(*)`

### Queries (RunQuery/RunQueries)
Queries are **arbitrary SQL** with no constraints:
- Can include CTEs, JOINs, GROUP BY, UNION, subqueries
- Result rows may not map to any single entity
- May aggregate data from multiple tables
- `__mj_UpdatedAt` may not exist or may be ambiguous
- **Cannot automatically determine cache validation logic**

### Why Query Caching Requires User Input

Even with AI-detected `QueryEntities` and `QueryFields`, we cannot deterministically build cache validation because:

1. **Joins change semantics** - If Orders JOIN Customers, which table's `__mj_UpdatedAt` matters?
2. **Aggregations break row identity** - `GROUP BY` results don't map to individual entity rows
3. **CTEs/Subqueries add complexity** - Multiple data sources with different freshness requirements
4. **The query author knows the semantics** - Only they can define what "stale" means for their query

## Proposed Changes

### 1. Query Entity Schema Changes

Modify the `Query` table to support smart caching:

```sql
-- Remove old cache fields (if they exist)
-- CacheEnabled, CacheTTLMinutes, CacheMaxSize are being replaced

-- Add new cache method field
ALTER TABLE __mj.Query ADD CacheMethod NVARCHAR(20) NOT NULL DEFAULT 'None'
-- Valid values: 'None', 'TTL', 'Smart'

-- Keep TTL for TTL-based caching
ALTER TABLE __mj.Query ADD CacheTTLSeconds INT NULL
-- Used when CacheMethod = 'TTL'

-- Add validation SQL for Smart caching
ALTER TABLE __mj.Query ADD CacheValidationSQL NVARCHAR(MAX) NULL
-- Used when CacheMethod = 'Smart'
-- Must return exactly two columns: MaxUpdatedAt (datetime), RowCount (int)
-- Has access to same Nunjucks parameters as the main query SQL
```

### 2. Cache Method Details

#### None (Default)
- No caching
- Every execution runs the full query
- Use for: Real-time data, frequently changing data, queries with side effects

#### TTL (Time-To-Live)
- Cache results for a fixed duration
- Simple time-based expiration
- No freshness validation
- Use for: Relatively static data, reports that don't need real-time accuracy

```typescript
// Example: Cache for 5 minutes
{
  CacheMethod: 'TTL',
  CacheTTLSeconds: 300
}
```

#### Smart
- Validate cache freshness on each request
- Uses user-defined `CacheValidationSQL` to check staleness
- Only fetches full results when data has changed
- Use for: Data that changes unpredictably, when freshness matters but performance is critical

```typescript
// Example: Smart caching with custom validation
{
  CacheMethod: 'Smart',
  CacheValidationSQL: `
    SELECT
      MAX(__mj_UpdatedAt) AS MaxUpdatedAt,
      COUNT(*) AS TotalRows
    FROM Orders
    WHERE Region = '{{ region }}'
  `
}
```

### 3. CacheValidationSQL Requirements

The `CacheValidationSQL` field must:

1. **Return exactly two columns:**
   - `MaxUpdatedAt` (datetime/datetimeoffset) - The most recent update timestamp
   - `RowCount` (int) - The number of rows that would be returned

2. **Be fast** - This runs on every cache check, so it should be optimized
   - Use indexes
   - Avoid expensive JOINs if possible
   - Consider using covering indexes

3. **Use the same parameters** - Has access to all Nunjucks parameters from the main query
   - Not all parameters need to be used
   - Only include parameters that affect the result set's freshness

4. **Return consistent results** - The validation query should reflect the same data scope as the main query

### 4. CacheValidationSQL Examples

#### Simple Single-Table Query
```sql
-- Main Query:
SELECT * FROM Users WHERE Status = '{{ status }}'

-- Validation SQL:
SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS TotalRows
FROM Users WHERE Status = '{{ status }}'
```

#### JOIN Query (User Decides Which Table Matters)
```sql
-- Main Query:
SELECT o.*, c.Name as CustomerName
FROM Orders o
JOIN Customers c ON o.CustomerID = c.ID
WHERE c.Region = '{{ region }}'

-- Validation SQL (checking Orders only - user decision):
SELECT MAX(o.__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS TotalRows
FROM Orders o
JOIN Customers c ON o.CustomerID = c.ID
WHERE c.Region = '{{ region }}'

-- OR checking both tables:
SELECT
  CASE WHEN MAX(o.__mj_UpdatedAt) > MAX(c.__mj_UpdatedAt)
       THEN MAX(o.__mj_UpdatedAt)
       ELSE MAX(c.__mj_UpdatedAt) END AS MaxUpdatedAt,
  COUNT(*) AS TotalRows
FROM Orders o
JOIN Customers c ON o.CustomerID = c.ID
WHERE c.Region = '{{ region }}'
```

#### Aggregation Query
```sql
-- Main Query:
SELECT CustomerID, COUNT(*) as OrderCount, SUM(Total) as TotalSpent
FROM Orders
WHERE OrderDate > '{{ startDate }}'
GROUP BY CustomerID

-- Validation SQL (check source table, not aggregated result):
SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS TotalRows
FROM Orders
WHERE OrderDate > '{{ startDate }}'
```

#### Query with Parameters Not Affecting Freshness
```sql
-- Main Query (orderBy param doesn't affect data freshness):
SELECT * FROM Products
WHERE CategoryID = '{{ categoryId }}'
ORDER BY {{ orderBy }}

-- Validation SQL (doesn't need orderBy param):
SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS TotalRows
FROM Products
WHERE CategoryID = '{{ categoryId }}'
```

### 5. New Types (interfaces.ts)

```typescript
export type RunQueryCacheStatus = {
    maxUpdatedAt: string;
    rowCount: number;
}

export type RunQueryWithCacheCheckParams = {
    params: RunQueryParams;
    cacheStatus?: RunQueryCacheStatus;
}

export type RunQueryCacheCheckResult<T = unknown> = {
    queryIndex: number;
    status: 'current' | 'stale' | 'error';
    results?: T[];
    maxUpdatedAt?: string;
    rowCount?: number;
    errorMessage?: string;
}

export type RunQueriesWithCacheCheckResponse<T = unknown> = {
    success: boolean;
    results: RunQueryCacheCheckResult<T>[];
    errorMessage?: string;
}
```

### 6. RunQueries Batch Support

Before implementing smart caching, implement `RunQueries` as a batch operation (like `RunViews`):

```typescript
// Single query
const result = await rq.RunQuery({ QueryID: '...' });

// Batch queries (NEW)
const results = await rq.RunQueries([
    { QueryID: '...', Parameters: { region: 'West' } },
    { QueryID: '...', Parameters: { status: 'Active' } },
    { QueryID: '...', Parameters: { year: 2024 } }
]);
```

This provides value independently of caching:
- Single network call for multiple queries
- Reduced latency
- Foundation for batch cache checking

### 7. Server-Side Implementation

#### RunQueriesWithCacheCheck Flow
1. Receive batch of queries with optional cache status for each
2. For each query with `CacheMethod: 'Smart'`:
   a. Execute `CacheValidationSQL` (with Nunjucks parameter substitution)
   b. Compare returned `MaxUpdatedAt` and `RowCount` with client's cache status
   c. If match: return `status: 'current'`
   d. If mismatch: execute main query, return `status: 'stale'` with fresh data
3. For queries with `CacheMethod: 'TTL'` or `CacheMethod: 'None'`: execute normally

### 8. Client-Side Implementation

#### LocalCacheManager Updates
- Add `GenerateRunQueryFingerprint(params)` method
- Add `GetRunQueryResult(fingerprint)` method
- Add `SetRunQueryResult(fingerprint, params, results, maxUpdatedAt, rowCount)` method

#### ProviderBase Updates
- Add `PreRunQueries` hook (like `PreRunViews`)
- Add `executeSmartQueryCacheCheck` method
- Handle `CacheLocal: true` on `RunQueryParams`

## Implementation Plan

### Phase 1: Database Schema (v2.129.x)
1. Create migration to modify Query table
   - Add `CacheMethod` column (default 'None')
   - Add `CacheTTLSeconds` column
   - Add `CacheValidationSQL` column
   - Migrate existing `CacheEnabled`/`CacheTTLMinutes` data if present
2. Run CodeGen to update entity classes

### Phase 2: RunQueries Batch Support
1. Add `RunQueries` method to `IRunQueryProvider` interface
2. Implement in `SQLServerDataProvider`
3. Add GraphQL resolver for batch queries
4. Implement in `GraphQLDataProvider`
5. Update `RunQuery` class to support batch operations

### Phase 3: Query Smart Caching
1. Add types to `interfaces.ts`
2. Add `CacheLocal` to `RunQueryParams`
3. Update `LocalCacheManager` with query caching methods
4. Implement `RunQueriesWithCacheCheck` on server
5. Implement client-side cache check flow in `ProviderBase`
6. Add GraphQL resolver for cache check

### Phase 4: Engine Integration
1. Add `LoadQueriesWithCaching` helper to `BaseEngine` (if needed)
2. Update telemetry to track query cache hits/misses

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Application                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │  AIEngine   │    │ CommEngine  │    │    Other Engines        │ │
│  └──────┬──────┘    └──────┬──────┘    └────────────┬────────────┘ │
│         │                  │                        │               │
│         └──────────────────┼────────────────────────┘               │
│                            ▼                                         │
│                  ┌─────────────────┐                                │
│                  │   BaseEngine    │                                │
│                  │ LoadEntities    │                                │
│                  │ WithCaching()   │                                │
│                  └────────┬────────┘                                │
│                           │                                          │
│         ┌─────────────────┼─────────────────┐                       │
│         ▼                 ▼                 ▼                        │
│  ┌────────────┐   ┌────────────┐    ┌────────────┐                 │
│  │  RunViews  │   │ RunQueries │    │ RunView    │                 │
│  │ WithCache  │   │ WithCache  │    │ Single     │                 │
│  │   Check    │   │   Check    │    │            │                 │
│  └─────┬──────┘   └─────┬──────┘    └─────┬──────┘                 │
│        │                │                 │                          │
│        └────────────────┼─────────────────┘                         │
│                         ▼                                            │
│              ┌──────────────────┐                                   │
│              │LocalCacheManager │                                   │
│              │ ┌──────────────┐ │                                   │
│              │ │ fingerprint  │ │                                   │
│              │ │ maxUpdatedAt │ │                                   │
│              │ │ rowCount     │ │                                   │
│              │ │ results      │ │                                   │
│              │ └──────────────┘ │                                   │
│              └────────┬─────────┘                                   │
│                       │                                              │
├───────────────────────┼─────────────────────────────────────────────┤
│                       │ Network (GraphQL)                            │
├───────────────────────┼─────────────────────────────────────────────┤
│                       ▼                                              │
│    ┌────────────────────────────────────────────┐                   │
│    │  RunViewsWithCacheCheck GraphQL Query      │                   │
│    │  RunQueriesWithCacheCheck GraphQL Query    │                   │
│    └─────────────────┬──────────────────────────┘                   │
│                      │                                               │
│                      ▼                                               │
│    ┌────────────────────────────────────────────┐                   │
│    │       SQLServerDataProvider                │                   │
│    │  ┌──────────────────────────────────────┐  │                   │
│    │  │ Views: Auto COUNT/MAX(__mj_UpdatedAt)│  │                   │
│    │  │ Queries: Execute CacheValidationSQL  │  │                   │
│    │  │ Compare with client cache status     │  │                   │
│    │  │ Return 'current' or 'stale'+data     │  │                   │
│    │  └──────────────────────────────────────┘  │                   │
│    └────────────────────────────────────────────┘                   │
│                        Server                                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Query Cache Flow (Smart Mode)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Query Smart Cache Flow                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Client wants to run query with CacheLocal: true                 │
│     │                                                                │
│     ▼                                                                │
│  2. Check LocalCacheManager for cached result                       │
│     │                                                                │
│     ├─── No cache ──► Send query to server (no cache status)        │
│     │                                                                │
│     └─── Has cache ─► Send query + cache status to server           │
│                       { maxUpdatedAt: '...', rowCount: N }          │
│                       │                                              │
│                       ▼                                              │
│  3. Server receives request                                          │
│     │                                                                │
│     ├─── CacheMethod = 'None' ──► Execute query, return results     │
│     │                                                                │
│     ├─── CacheMethod = 'TTL' ───► Check TTL expiration              │
│     │                             Execute if expired                 │
│     │                                                                │
│     └─── CacheMethod = 'Smart' ─► Execute CacheValidationSQL        │
│                                   │                                  │
│                                   ▼                                  │
│  4. Server compares validation result with client cache status      │
│     │                                                                │
│     ├─── Match ────► Return { status: 'current' }                   │
│     │                (no data transfer!)                             │
│     │                                                                │
│     └─── Mismatch ─► Execute main query                             │
│                      Return { status: 'stale', results: [...],      │
│                               maxUpdatedAt: '...', rowCount: N }    │
│                                                                      │
│  5. Client receives response                                         │
│     │                                                                │
│     ├─── 'current' ─► Use cached data                               │
│     │                                                                │
│     └─── 'stale' ───► Update cache with new data                    │
│                       Return fresh results                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Performance Expectations

### Before Smart Cache Refresh
- First load: 1 network call per query
- Subsequent loads: 1 network call per query (full data transfer)
- Total: N calls, N * data_size bytes transferred

### After Smart Cache Refresh
- First load: 1 batch call for all queries
- Subsequent loads: 1 batch call (validation SQL only when cache valid)
- Total: 1 call, minimal bytes if cache valid, full data only when stale

### Expected Improvements
- **Network calls**: N → 1 (batching)
- **Data transfer**: Up to 100% reduction when cache is current
- **Startup time**: Significant reduction for cached scenarios
- **Server load**: Validation SQL is typically much faster than full query

## Related Files

### Implemented (RunViews)
- `packages/MJCore/src/generic/interfaces.ts` - RunView cache check types
- `packages/MJCore/src/generic/localCacheManager.ts` - Cache storage with rowCount
- `packages/MJCore/src/generic/providerBase.ts` - Smart cache check flow
- `packages/MJCore/src/views/runView.ts` - CacheLocal param
- `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` - Server cache check
- `packages/MJServer/src/generic/RunViewResolver.ts` - GraphQL resolver
- `packages/GraphQLDataProvider/src/graphQLDataProvider.ts` - Client method

### To Implement (RunQueries)
- `migrations/v2/V202XXXXXXXXXX__v2.129.x_Query_Cache_Schema.sql` - Schema changes
- `packages/MJCore/src/generic/interfaces.ts` - Query cache types
- `packages/MJCore/src/queries/runQuery.ts` - CacheLocal param, RunQueries batch
- `packages/MJServer/src/generic/RunQueryResolver.ts` - Query cache check resolver
- `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` - Query cache check
- `packages/GraphQLDataProvider/src/graphQLDataProvider.ts` - Query client method

## Migration Notes

### Existing Query.CacheEnabled Field
The existing `CacheEnabled`, `CacheTTLMinutes`, and `CacheMaxSize` fields should be migrated:
- If `CacheEnabled = 1` and `CacheTTLMinutes` is set: `CacheMethod = 'TTL'`, `CacheTTLSeconds = CacheTTLMinutes * 60`
- If `CacheEnabled = 0`: `CacheMethod = 'None'`
- `CacheMaxSize` can be dropped (not needed with fingerprint-based caching)

After migration, the old columns can be removed in a subsequent release.
