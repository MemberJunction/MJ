# Plan: Differential Cache Updates for BaseEngine

> **Status**: Planning
> **Created**: 2026-01-10
> **Context**: Improving cache efficiency for `BaseEngine` and `LocalCacheManager`

## Overview

Currently, when a cache entry becomes stale (based on `maxUpdatedAt` or `rowCount` validation), the system fetches the **entire dataset** from the server. This is inefficient for large datasets where only a few rows have changed.

This document outlines a plan to implement **differential cache updates** - fetching only the rows that have changed since the last cache update, and properly handling deleted rows.

---

## 1. Current Caching Architecture

### How Caching Works Today

#### LocalCacheManager (RunView/RunQuery)
- Stores cached results with metadata:
  - `maxUpdatedAt`: Latest `__mj_UpdatedAt` timestamp from cached results
  - `rowCount`: Number of rows in cached result
- Cache validation compares server's current `maxUpdatedAt`/`rowCount` with cached values
- If different → **full refresh** (entire dataset fetched again)

#### BaseEngine (Entity Caching)
- Uses `BaseEnginePropertyConfig.CacheLocal: true` for local storage
- Loads all entities via `RunView` with `ResultType: 'entity_object'`
- No differential update mechanism - full load on refresh

### Problems with Full Refresh
1. **Bandwidth Waste**: Large datasets re-downloaded for small changes
2. **Performance**: Slow refresh for tables with thousands of rows
3. **User Experience**: Long waits for cache updates
4. **Server Load**: Unnecessary database queries for unchanged data

---

## 2. Proposed Solution: Differential Updates

### 2.1 Server-Side Support Required

The server must support a "delta query" mode that returns:
1. **Updated/New Rows**: Records where `__mj_UpdatedAt > cachedMaxUpdatedAt`
2. **Deleted Row IDs**: Primary keys of rows that existed in cache but no longer exist

#### Option A: Server-Side Deleted Row Tracking (Recommended)

Add a `__mj_DeletedAt` soft-delete column or a separate `EntityDeletions` audit table:

```sql
-- Option: EntityDeletions table (centralized)
CREATE TABLE __mj.EntityDeletions (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    RecordID NVARCHAR(MAX) NOT NULL,  -- Could be composite key
    DeletedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    DeletedByUserID UNIQUEIDENTIFIER
);

-- Index for efficient differential queries
CREATE INDEX IX_EntityDeletions_Entity_DeletedAt
ON __mj.EntityDeletions (EntityID, DeletedAt);
```

#### Option B: Client-Side Deletion Detection

Client sends list of cached IDs to server, server returns which ones no longer exist.
- **Pros**: No schema changes
- **Cons**: Expensive for large caches, doesn't scale

### 2.2 GraphQL API Changes

New query type for differential updates:

```graphql
type DifferentialUpdateResult {
  updatedRows: [GenericEntity!]!
  deletedIDs: [String!]!
  newMaxUpdatedAt: DateTime!
  hasMore: Boolean!
}

query GetDifferentialUpdate(
  entityName: String!
  sinceTimestamp: DateTime!
  cachedRowCount: Int
  extraFilter: String
  limit: Int = 1000
) : DifferentialUpdateResult
```

### 2.3 LocalCacheManager Enhancements

```typescript
// New interface for differential results
interface DifferentialUpdateResult<T> {
  updatedRows: T[];
  deletedIDs: string[];
  newMaxUpdatedAt: string;
  hasMore: boolean;
}

// New method in LocalCacheManager
public async GetDifferentialUpdate<T>(
  fingerprint: string,
  fetchDelta: () => Promise<DifferentialUpdateResult<T>>
): Promise<{ results: T[]; maxUpdatedAt: string; rowCount: number } | null> {

  const cached = await this.GetRunViewResult(fingerprint);
  if (!cached) {
    // No cache - caller should do full load
    return null;
  }

  // Fetch only changes since cache was created
  const delta = await fetchDelta();

  // Apply updates
  const resultMap = new Map(cached.results.map(r => [this.getRowId(r), r]));

  // Remove deleted rows
  for (const id of delta.deletedIDs) {
    resultMap.delete(id);
  }

  // Apply updated/new rows
  for (const row of delta.updatedRows) {
    resultMap.set(this.getRowId(row), row);
  }

  const mergedResults = Array.from(resultMap.values());

  // Update cache with merged results
  await this.SetRunViewResult(
    fingerprint,
    { EntityName: '...' }, // Need original params
    mergedResults,
    delta.newMaxUpdatedAt,
    mergedResults.length
  );

  return {
    results: mergedResults,
    maxUpdatedAt: delta.newMaxUpdatedAt,
    rowCount: mergedResults.length
  };
}
```

### 2.4 BaseEngine Enhancements

```typescript
// Add to BaseEnginePropertyConfig
export interface BaseEnginePropertyConfig {
  // ... existing properties

  /** Enable differential updates for this property */
  SupportsDifferentialUpdate?: boolean;

  /** Primary key field name(s) for merging differential updates */
  PrimaryKeyFields?: string[];
}

// New protected method in BaseEngine
protected async LoadWithDifferentialUpdate<T extends BaseEntity>(
  config: Partial<BaseEnginePropertyConfig>,
  provider?: IMetadataProvider,
  contextUser?: UserInfo
): Promise<T[]> {

  const cacheManager = LocalCacheManager.Instance;
  const fingerprint = cacheManager.GenerateRunViewFingerprint({
    EntityName: config.EntityName!,
    ExtraFilter: config.Filter,
    OrderBy: config.OrderBy
  });

  // Check if we have cached data
  const cached = await cacheManager.GetRunViewResult(fingerprint);

  if (!cached) {
    // No cache - do full load
    return this.doFullLoad(config, provider, contextUser);
  }

  // Try differential update
  const delta = await this.fetchDelta(
    config.EntityName!,
    cached.maxUpdatedAt,
    cached.rowCount,
    config.Filter,
    contextUser
  );

  if (delta.requiresFullRefresh) {
    // Too many changes, or server doesn't support differential
    return this.doFullLoad(config, provider, contextUser);
  }

  // Merge delta into cached results
  return this.mergeDelta(cached.results as T[], delta);
}
```

---

## 3. Handling Deleted Rows

### Challenge
When a row is deleted from the database, we need to know to remove it from the cache. Without explicit tracking, we can't distinguish between:
- "This row was deleted"
- "This row wasn't included because it doesn't match the filter"

### Solutions

#### Solution 1: Server-Side Deletion Audit Table (Recommended)

**Implementation**:
1. Create `__mj.EntityDeletions` table (see SQL above)
2. Modify delete triggers/stored procedures to log deletions
3. Differential query includes: `WHERE DeletedAt > @sinceTimestamp`

**Pros**:
- Accurate deletion tracking
- No client-side ID comparison needed
- Works with any filter criteria

**Cons**:
- Requires database schema changes
- Storage overhead for deletion records
- Need retention policy for old deletion records

#### Solution 2: Row Count + Timestamp Validation

**Implementation**:
1. If `rowCount` decreased and `maxUpdatedAt` changed → assume deletions
2. Client sends cached IDs to server for validation (batch API)

**Pros**:
- No schema changes
- Simple to implement

**Cons**:
- Inaccurate if adds and deletes happen simultaneously
- ID comparison doesn't scale for large datasets

#### Solution 3: Soft Deletes with `__mj_DeletedAt`

**Implementation**:
1. Add `__mj_DeletedAt DATETIME NULL` column to entities
2. Instead of DELETE, set `__mj_DeletedAt = GETUTCDATE()`
3. All queries include `WHERE __mj_DeletedAt IS NULL`
4. Differential query can find deleted rows: `WHERE __mj_DeletedAt > @sinceTimestamp`

**Pros**:
- Row-level deletion tracking
- Enables "undelete" functionality
- Works with existing MJ timestamp pattern

**Cons**:
- Major schema change affecting all entities
- All existing queries need modification
- Data never truly deleted (compliance concerns)

---

## 4. Implementation Phases

### Phase 1: Infrastructure (Server-Side)

1. **Create EntityDeletions table** in `__mj` schema
2. **Modify base delete stored procedures** to log deletions
3. **Add GraphQL resolver** for `GetDifferentialUpdate`
4. **Add cleanup job** for old deletion records (configurable retention)

### Phase 2: LocalCacheManager Updates

1. **Add differential update methods** to LocalCacheManager
2. **Implement delta merge logic** with proper ID handling
3. **Add fallback** to full refresh when differential fails
4. **Update cache metadata** to track original query params

### Phase 3: BaseEngine Integration

1. **Add SupportsDifferentialUpdate** config option
2. **Implement LoadWithDifferentialUpdate** method
3. **Update UserViewEngine** to use differential updates
4. **Add performance metrics** for cache hit/delta rates

### Phase 4: Angular Integration

1. **Update provider classes** to use differential endpoints
2. **Add UI indicators** for cache freshness
3. **Add manual refresh button** that forces full reload

---

## 5. Performance Considerations

### When Differential Is Faster
- Large datasets (>1000 rows) with few changes
- Frequent cache checks (< 1 minute intervals)
- Slow network connections

### When Full Refresh Is Better
- Small datasets (<100 rows)
- Many changes since last update (>20% of rows)
- Initial load or cache miss

### Threshold Heuristics
```typescript
const shouldUseDifferential = (
  cachedRowCount: number,
  estimatedChanges: number
): boolean => {
  // Use differential if:
  // - Cached dataset is large enough
  // - Estimated changes are small relative to total
  return cachedRowCount > 100 && estimatedChanges < cachedRowCount * 0.2;
};
```

---

## 6. Questions for Decision

1. **Schema Changes**: Should we add soft-delete columns to all entities, or use a centralized deletion audit table?

2. **Retention Policy**: How long should deletion records be kept? (7 days? 30 days?)

3. **Granularity**: Should differential updates be per-entity or per-query (considering filters)?

4. **Client ID Validation**: For entities without server-side deletion tracking, should we implement client-side ID comparison as a fallback?

5. **BaseEngine Priority**: Which engines should get differential support first? (UserViewEngine, EntityEngine, etc.)

---

## 7. Related Files

| File | Description |
|------|-------------|
| `packages/MJCore/src/generic/localCacheManager.ts` | Current cache implementation |
| `packages/MJCore/src/generic/baseEngine.ts` | Base engine with cache support |
| `packages/MJCoreEntities/src/engines/UserViewEngine.ts` | Example engine using CacheLocal |
| `packages/MJServer/src/generic/ProviderBase.ts` | Server-side data provider |
| `packages/MJAPI/src/graphql/` | GraphQL resolvers |

---

## 8. References

- [LocalCacheManager Implementation](../packages/MJCore/src/generic/localCacheManager.ts)
- [BaseEngine CacheLocal Documentation](../packages/MJCore/src/generic/baseEngine.ts)
- [MJ Timestamp Columns Pattern](https://docs.memberjunction.org)
