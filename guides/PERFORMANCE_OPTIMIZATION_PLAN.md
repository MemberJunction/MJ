# MemberJunction Performance Optimization Plan

## Executive Summary

After deep analysis of the MemberJunction architecture across client startup, server resolvers, metadata loading, RunView execution, Angular component rendering, and caching layers, this document identifies concrete optimization opportunities organized by impact and effort.

The architecture already has solid foundations: batch dataset loading for metadata, telemetry with duplicate detection, LocalCacheManager with LRU/LFU eviction, smart cache checks with differential updates, and fire-and-forget engine pre-warming. The optimizations below build on these foundations.

---

## Architecture Overview (Current State)

### Startup Sequence (Critical Path)
```
Auth Init → GraphQL Client Setup → GetAllMetadata (dataset) → StartupManager.Startup()
  → SharedService.RefreshData() → Navigate to App

Background (fire-and-forget):
  → AIEngineBase.Config() → ArtifactMetadataEngine.Config()
  → DashboardEngine.Config() → EntityCommunicationsEngine.Config()
```

### Caching Layers (Current)
1. **In-memory** (`ProviderBase._localMetadata`) - metadata singleton
2. **LocalCacheManager** - RunView/RunQuery/Dataset results in IndexedDB (50MB, 1000 entries, 5min TTL)
3. **Smart Cache Check** - client sends fingerprint+timestamp, server returns differential updates
4. **Apollo Server** - bounded LRU cache for GraphQL responses
5. **Auth Cache** - LRU cache for 50k tokens, 1hr TTL
6. **UserCache** - in-memory user info cache

---

## TIER 1: High Impact, Low-Medium Effort

### 1.1 Eliminate Duplicate RunView Calls at Source

**Problem**: Telemetry already detects duplicates like `Application Entities` being called 2x with identical filters. The detection exists but prevention does not.

**Root Cause Analysis**:
- `StartupManager.Instance.Startup()` is called multiple times (idempotent but still triggers engines)
- `SharedService.RefreshData()` calls `StartupManager.Instance.Startup()` again (line 181)
- Multiple engine `Config(false)` calls may overlap during startup
- Components independently call RunView for data their parent already loaded

**Solution: Request Deduplication in ProviderBase**

Add an in-flight request deduplication layer in `ProviderBase.RunView()`:

```typescript
// In ProviderBase
private _inflightRequests: Map<string, Promise<RunViewResult>> = new Map();

public async RunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
    const fingerprint = this.generateFingerprint(params);

    // If an identical request is already in-flight, return the same promise
    const inflight = this._inflightRequests.get(fingerprint);
    if (inflight) {
        return inflight as Promise<RunViewResult<T>>;
    }

    const promise = this._executeRunView<T>(params, contextUser);
    this._inflightRequests.set(fingerprint, promise);

    try {
        return await promise;
    } finally {
        this._inflightRequests.delete(fingerprint);
    }
}
```

**Files to modify**:
- `/packages/MJCore/src/generic/providerBase.ts` - Add dedup layer around RunView/RunViews
- Uses the same fingerprint logic already in TelemetryManager

**Impact**: Eliminates ALL duplicate concurrent RunView calls system-wide with zero changes to callers.

---

### 1.2 RunView Result Memoization for Short-Lived Reads

**Problem**: Within a single page load or component initialization, the same RunView is often called multiple times across components that render simultaneously. LocalCacheManager requires IndexedDB (async) and explicit `CacheLocal: true`.

**Solution: Synchronous In-Memory Result Cache with Auto-Expiry**

```typescript
// In ProviderBase - lightweight synchronous cache
private _resultMemo: Map<string, { result: RunViewResult; timestamp: number }> = new Map();
private static MEMO_TTL_MS = 5000; // 5 seconds - just for dedup within page loads

protected checkMemo(fingerprint: string): RunViewResult | undefined {
    const entry = this._resultMemo.get(fingerprint);
    if (entry && (Date.now() - entry.timestamp) < ProviderBase.MEMO_TTL_MS) {
        return entry.result;
    }
    if (entry) this._resultMemo.delete(fingerprint);
    return undefined;
}
```

**Files to modify**:
- `/packages/MJCore/src/generic/providerBase.ts` - Add memo cache in PreRunView

**Impact**: Near-zero latency for repeated reads within 5s. Works even without `CacheLocal: true`.

---

### 1.3 Convert Individual RunView Calls to RunViews Batch

**Problem**: Many components load multiple related datasets using separate `RunView()` calls wrapped in `Promise.all()` instead of using the batch `RunViews()` API.

**Examples found**:
- `action-form.component.ts` lines 212-350: 6 separate RunView calls in Promise.all
- Various dialog components: 2-3 separate RunView calls each
- Engine classes loading multiple entity types

**Solution**: Refactor to use `RunViews()` batch API:

```typescript
// BEFORE: 6 separate RunView calls
await Promise.all([
    this.loadActionParams(),      // Each does its own RunView
    this.loadResultCodes(),
    this.loadRecentExecutions(),
    this.loadActionLibraries(),
    this.loadExecutionStats()
]);

// AFTER: Single batched call
const rv = new RunView();
const [params, codes, executions, libraries, stats] = await rv.RunViews([
    { EntityName: 'Action Params', ExtraFilter: `ActionID='${id}'`, ResultType: 'entity_object' },
    { EntityName: 'Action Result Codes', ExtraFilter: `ActionID='${id}'`, ResultType: 'entity_object' },
    { EntityName: 'Action Execution Logs', ExtraFilter: `ActionID='${id}'`, MaxRows: 10, OrderBy: 'StartedAt DESC', ResultType: 'entity_object' },
    { EntityName: 'Action Libraries', ExtraFilter: `ActionID='${id}'`, ResultType: 'entity_object' },
    { EntityName: 'Action Execution Logs', ExtraFilter: `ActionID='${id}'`, ResultType: 'entity_object' }
]);
```

**Files to audit and refactor**:
- `/packages/Angular/Explorer/core-entity-forms/src/lib/custom/Actions/action-form.component.ts`
- `/packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/ai-agent-form.component.ts`
- `/packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIPrompts/` components
- All engine `Config()` methods that do multiple RunView calls

**Impact**: Reduces network round trips. Server-side `RunViewsGenericInternal` already optimizes batch calls (user lookup once, set-based entity validation).

---

### 1.4 Use `ResultType: 'simple'` + `Fields` for Read-Only Data

**Problem**: Many RunView calls use default `entity_object` ResultType when data is only displayed, never mutated. `entity_object` creates full BaseEntity instances with getters/setters, validation, dirty tracking - significant overhead.

**Solution**: Audit all RunView calls and switch read-only ones to `simple`:

```typescript
// BEFORE: Full entity objects for display-only data
const result = await rv.RunView<ActionExecutionLogEntity>({
    EntityName: 'Action Execution Logs',
    ExtraFilter: `ActionID='${id}'`,
    ResultType: 'entity_object'  // Creates heavy objects
});
// Only used for display in a grid

// AFTER: Lightweight plain objects
const result = await rv.RunView<{ ID: string; StartedAt: Date; Status: string; Duration: number }>({
    EntityName: 'Action Execution Logs',
    ExtraFilter: `ActionID='${id}'`,
    Fields: ['ID', 'StartedAt', 'Status', 'Duration', 'ResultCode'],
    ResultType: 'simple'  // Plain JS objects, much faster
});
```

**Key rule**: `Fields` parameter is IGNORED with `entity_object` (ProviderBase overrides it). Only effective with `simple`.

**Impact**: Reduces memory allocation, GC pressure, and transfer size for read-only views.

---

### 1.5 Server-Side Redis Caching for RunView Results

**Problem**: Every RunView hits the database even for data that rarely changes (entity metadata, lookup tables, reference data).

**Solution**: Redis cache layer in the GenericDatabaseProvider, keyed by query fingerprint.

```
Client RunView → GraphQL Resolver → GenericDatabaseProvider
                                        → Check Redis (fingerprint key)
                                        → If hit: return cached
                                        → If miss: SQL query → cache in Redis → return
```

**Cache invalidation strategies**:
1. **TTL-based**: 30s-5min depending on entity change frequency
2. **Entity-aware**: Track `__mj_UpdatedAt` max per entity, invalidate when it changes
3. **Write-through**: On Save/Delete, invalidate related cache entries
4. **Tiered TTL**: Static reference data (roles, entity metadata) = long TTL; transactional data = short TTL

**Files to modify**:
- `/packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` - Add Redis check before SQL execution
- `/packages/MJServer/src/index.ts` - Redis connection setup
- New package: `@memberjunction/redis-cache` for shared Redis utilities

**Impact**: Dramatic reduction in database load for repeated queries. Most impactful for multi-user scenarios.

---

## TIER 2: High Impact, Medium-High Effort

### 2.1 Metadata Loading Optimization

**Problem**: The `MJ_Metadata` dataset loads ALL entity metadata in a single large payload (estimated 5-10MB for typical installations with 200-500 entities, 3000-5000 fields).

**Current flow** (`providerBase.ts:1659`):
```
GetAllMetadata() → GetDatasetByName('MJ_Metadata') → Parse all → PostProcess → Store
```

**Optimizations**:

#### A. Compressed Metadata Transfer
Add gzip/brotli compression for the metadata dataset response. The JSON is highly compressible (repeated field names, similar structures).

**Files**:
- `/packages/MJServer/src/index.ts` line 12 already has `compression()` middleware, but verify it applies to GraphQL responses
- Check that the Apollo middleware chain doesn't bypass compression

#### B. Incremental Metadata Updates
The system already has `GetDatasetStatusByName` for timestamp checking. Extend this to support partial/incremental metadata updates:

```
First load: Full MJ_Metadata dataset
Subsequent loads: Only entities/fields changed since lastUpdateTimestamp
```

**Files**:
- `/packages/MJCore/src/generic/providerBase.ts` - Add incremental merge logic
- `/packages/MJServer/src/resolvers/DatasetResolver.ts` - Add incremental dataset endpoint

#### C. Lazy Entity Field Loading
Most users interact with 10-20 entities during a session, not all 200-500. Load entity field details on-demand:

```
Startup: Load entity names, IDs, basic metadata (lightweight)
On first access: Load full field details for that entity
```

**Complexity**: High - requires changes to EntityInfo access patterns throughout the codebase.

---

### 2.2 GraphQL Response Optimization

**Problem**: GraphQL responses include all requested fields even when many are null or empty. For entities with 50+ fields, this is wasteful.

**Optimizations**:

#### A. Null Field Elision
Strip null/undefined fields from GraphQL responses before sending:

```typescript
// In RunViewResolver, before returning results
results = results.map(r => Object.fromEntries(
    Object.entries(r).filter(([_, v]) => v != null)
));
```

**Impact**: Can reduce payload 30-50% for sparse entities.

#### B. Field Selection Propagation
When client specifies `Fields: ['ID', 'Name']`, ensure the SQL query only SELECTs those columns (already works for `simple` ResultType, verify for edge cases).

---

### 2.3 Angular Change Detection Optimization

**Problem**: Most form components use default change detection strategy. Only ~13 components use `OnPush`.

**Solution**: Systematically migrate high-frequency components to `OnPush`:

**Priority components for OnPush migration**:
1. Grid/list components that render many rows
2. Dashboard components with periodic data refresh
3. Navigation shell components that re-render on every detection cycle
4. Dialog components that don't need continuous checking

**Pattern**:
```typescript
@Component({
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyComponent {
    private cdr = inject(ChangeDetectorRef);

    async loadData() {
        this.data = await rv.RunView(...);
        this.cdr.markForCheck(); // Explicit change notification
    }
}
```

**Impact**: Reduces Angular change detection cycles by 60-80% for migrated components.

---

### 2.4 Component Cache Auto-Eviction

**Problem**: The `ComponentCacheManager` caches tab components indefinitely. Memory grows with each opened tab, never auto-clears.

**File**: `/packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/component-cache-manager.ts`

**Solution**: Add LRU eviction with configurable limits:

```typescript
// Evict least-recently-used components when cache exceeds threshold
private evictIfNeeded(): void {
    const MAX_CACHED = 20; // Configurable
    if (this._cache.size > MAX_CACHED) {
        // Sort by lastAccessedAt, evict oldest unattached components
        const evictable = [...this._cache.entries()]
            .filter(([_, meta]) => !meta.isAttached)
            .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

        while (this._cache.size > MAX_CACHED && evictable.length > 0) {
            const [key] = evictable.shift()!;
            this.destroyComponent(key);
        }
    }
}
```

**Impact**: Prevents memory leaks in long-running sessions.

---

## TIER 3: Medium Impact, Strategic Improvements

### 3.1 Engine Data Loading Consolidation

**Problem**: Multiple engines load data independently during startup, potentially causing overlapping queries. The telemetry detects "EngineOverlap" patterns.

**Current**: Each engine calls its own set of RunViews during `Config()`:
- AIEngineBase loads: AI Models, AI Agents, AI Prompts, AI Vendors, etc.
- DashboardEngine loads: Dashboards, Dashboard Items, etc.
- ResourcePermissionEngine loads: Resource Types, Permissions

**Solution**: Create a `StartupDataLoader` that batches all engine data needs into fewer RunViews calls:

```typescript
class StartupDataLoader {
    static async LoadAllEngineData(): Promise<Map<string, RunViewResult>> {
        const rv = new RunView();
        const allParams: RunViewParams[] = [
            // AI Engine needs
            { EntityName: 'AI Models', ResultType: 'entity_object' },
            { EntityName: 'AI Agents', ResultType: 'entity_object' },
            // Dashboard Engine needs
            { EntityName: 'Dashboards', ResultType: 'entity_object' },
            // Resource Engine needs
            { EntityName: 'MJ: Resource Types', ResultType: 'entity_object' },
            // ... all engine data in one batch
        ];

        const results = await rv.RunViews(allParams);
        // Distribute results to engines
    }
}
```

**Impact**: Reduces startup database calls from ~15-20 to 1-2 batch calls.

---

### 3.2 Selective Engine Pre-Warming

**Problem**: All 4 engines pre-warm on every login, regardless of which features the user actually uses.

**Solution**: User-behavior-based pre-warming:

```typescript
private static async preWarmEngines(): void {
    // Always pre-warm: lightweight and universally needed
    ResourcePermissionEngine.Instance.Config(false);

    // Conditional pre-warming based on user's app configuration
    const userApps = Metadata.CurrentUser.UserApplications;

    if (userApps.some(a => a.Application?.Name?.includes('AI') || a.Application?.Name?.includes('Conversation'))) {
        AIEngineBase.Instance.Config(false);
    }
    if (userApps.some(a => /* has dashboard nav items */)) {
        DashboardEngine.Instance.Config(false);
    }
    // ... etc
}
```

**Impact**: Reduces unnecessary startup queries for users who don't use certain features.

---

### 3.3 GraphQL Subscription for Real-Time Cache Invalidation

**Problem**: The smart cache check polls for updates. For collaborative scenarios, this means stale data until the next check.

**Solution**: Use GraphQL subscriptions (WebSocket already configured) to push invalidation events:

```graphql
subscription OnEntityDataChanged($entityNames: [String!]) {
    entityDataChanged(entityNames: $entityNames) {
        entityName
        operation  # INSERT, UPDATE, DELETE
        recordId
        updatedAt
    }
}
```

**Impact**: Near-real-time cache invalidation without polling overhead.

---

### 3.4 Server-Side Query Batching with DataLoader Pattern

**Problem**: When RunViews batch is processed server-side, each view still generates a separate SQL query.

**Solution**: For queries against the same entity with different filters, merge into a single query with UNION ALL or use a DataLoader pattern:

```sql
-- Instead of 3 separate queries:
-- SELECT * FROM Users WHERE DepartmentID = 'abc'
-- SELECT * FROM Users WHERE DepartmentID = 'def'
-- SELECT * FROM Users WHERE DepartmentID = 'ghi'

-- Single merged query:
SELECT *, 'abc' as _batch_key FROM Users WHERE DepartmentID = 'abc'
UNION ALL
SELECT *, 'def' as _batch_key FROM Users WHERE DepartmentID = 'def'
UNION ALL
SELECT *, 'ghi' as _batch_key FROM Users WHERE DepartmentID = 'ghi'
```

**Impact**: Reduces database round trips for same-entity batch queries.

---

### 3.5 IndexedDB Read Optimization

**Problem**: `LocalCacheManager` uses IndexedDB which is async and can be slow for many small reads during initialization.

**Solution**: Add a synchronous in-memory shadow of the IndexedDB cache:

```typescript
class LocalCacheManager {
    // Sync shadow loaded from IndexedDB on init
    private _memoryCache: Map<string, CachedRunViewData> = new Map();

    async Initialize() {
        // Load all cache entries from IndexedDB into memory
        const allEntries = await this._storageProvider.getAll('mj:RunViewCache');
        for (const entry of allEntries) {
            this._memoryCache.set(entry.key, entry.value);
        }
    }

    // Sync read from memory
    GetRunViewResultSync(fingerprint: string): CachedRunViewResult | undefined {
        return this._memoryCache.get(fingerprint);
    }

    // Async write to both
    async StoreRunViewResult(fingerprint: string, data: CachedRunViewData) {
        this._memoryCache.set(fingerprint, data);
        await this._storageProvider.set('mj:RunViewCache', fingerprint, data);
    }
}
```

**Impact**: Eliminates IndexedDB latency for cache hits during page navigation.

---

## TIER 4: Lower Effort Quick Wins

### 4.1 Fix SharedService Singleton Pattern

**Problem**: `SharedService` uses manual `static _instance` pattern instead of `BaseSingleton`. Per CLAUDE.md, this can break under code duplication.

**File**: `/packages/Angular/Explorer/shared/src/lib/shared.service.ts` lines 18-19

**Solution**: Migrate to `BaseSingleton<SharedService>`.

---

### 4.2 Add `trackBy` to All `@for` Loops

**Problem**: Missing `track` in `@for` loops causes Angular to re-render entire lists on any change.

**Solution**: Audit all templates and ensure `track item.ID` (or appropriate key) is present.

---

### 4.3 Debounce Metadata Refresh Checks

**Problem**: `CheckToSeeIfRefreshNeeded()` makes a network call every time. During startup, this can be called multiple times.

**Solution**: Add a minimum interval between refresh checks:

```typescript
private _lastRefreshCheck: number = 0;
private static MIN_REFRESH_INTERVAL_MS = 30000; // 30 seconds

public async CheckToSeeIfRefreshNeeded(): Promise<boolean> {
    const now = Date.now();
    if (now - this._lastRefreshCheck < ProviderBase.MIN_REFRESH_INTERVAL_MS) {
        return false; // Too soon to check again
    }
    this._lastRefreshCheck = now;
    // ... existing logic
}
```

---

### 4.4 Optimize Entity Name Lookups

**Problem**: Entity lookups use `this.Entities.find(e => e.Name.trim().toLowerCase() === ...)` which is O(n) on every call.

**Solution**: Build a Map on metadata load:

```typescript
private _entityNameMap: Map<string, EntityInfo> = new Map();

protected UpdateLocalMetadata(metadata: AllMetadata) {
    this._localMetadata = metadata;
    // Build lookup map
    this._entityNameMap.clear();
    for (const e of metadata.AllEntities) {
        this._entityNameMap.set(e.Name.trim().toLowerCase(), e);
    }
}

// O(1) lookup
public GetEntityByName(name: string): EntityInfo | undefined {
    return this._entityNameMap.get(name.trim().toLowerCase());
}
```

**Files**: `/packages/MJCore/src/generic/providerBase.ts`

**Impact**: Eliminates O(n) scans in hot paths. With 500 entities, this is meaningful.

---

### 4.5 Reduce PreRunView Overhead

**Problem**: PreRunView does string-based entity lookup, telemetry generation, and cache checks. For batch operations, some of this is redundant.

**Current timing** (logged when >50ms):
```
[PERF-PRE] PreRunView EntityName: Xms
  (telemetry=Xms, entityCheck=Xms, entityLookup=Xms, cache=Xms)
```

**Solution**: Already partly addressed by entity name Map (4.4). Additionally:
- Skip `EntityStatusCheck` for entities already validated in the same batch
- Cache entity status results for the session duration

---

## Implementation Priority Matrix

| # | Optimization | Impact | Effort | Dependencies |
|---|-------------|--------|--------|-------------|
| 1.1 | Request Deduplication | **HIGH** | Low | None |
| 1.2 | In-Memory Memo Cache | **HIGH** | Low | None |
| 1.4 | ResultType: simple audit | **HIGH** | Low | None |
| 4.4 | Entity Name Map | **MED** | Low | None |
| 4.3 | Debounce Refresh Checks | **MED** | Low | None |
| 1.3 | Batch RunView Refactor | **HIGH** | Medium | None |
| 1.5 | Redis Server Cache | **HIGH** | Medium | Redis infra |
| 2.3 | OnPush Migration | **HIGH** | Medium | Per-component |
| 2.4 | Component Cache Eviction | **MED** | Low | None |
| 3.1 | Engine Data Consolidation | **HIGH** | High | Engine refactor |
| 2.1 | Metadata Compression | **MED** | Low | Verify middleware |
| 2.2 | Null Field Elision | **MED** | Low | None |
| 3.2 | Selective Pre-Warming | **MED** | Medium | User analytics |
| 3.5 | IndexedDB Shadow Cache | **MED** | Medium | None |
| 3.3 | GraphQL Subscriptions | **MED** | High | WebSocket infra |
| 3.4 | Query Merging | **MED** | High | SQL generation |
| 2.1B | Incremental Metadata | **HIGH** | High | Dataset refactor |
| 2.1C | Lazy Field Loading | **HIGH** | Very High | Architecture change |

## Recommended Implementation Order

### Phase 1: Quick Wins (1-2 weeks)
1. **1.1** Request Deduplication in ProviderBase
2. **1.2** In-Memory Memo Cache
3. **4.4** Entity Name Map lookups
4. **4.3** Debounce metadata refresh checks
5. **2.4** Component cache auto-eviction

### Phase 2: Data Loading Efficiency (2-3 weeks)
6. **1.4** Audit and convert to `ResultType: 'simple'` where appropriate
7. **1.3** Convert Promise.all(RunView...) to RunViews() batch
8. **2.1A** Verify/enable metadata compression
9. **2.2** Null field elision in GraphQL responses

### Phase 3: Server-Side Caching (2-3 weeks)
10. **1.5** Redis caching layer (already in progress)
11. **3.1** Engine startup data consolidation

### Phase 4: Angular Performance (ongoing)
12. **2.3** OnPush change detection migration (incremental, per-component)
13. **4.2** trackBy audit for @for loops

### Phase 5: Advanced (future)
14. **2.1B** Incremental metadata updates
15. **3.3** GraphQL subscription-based cache invalidation
16. **3.4** Same-entity query merging

---

## Metrics to Track

To measure optimization impact, track these metrics via the existing TelemetryManager:

1. **Time to Interactive (TTI)**: From auth callback to first app render
2. **Metadata Load Time**: `GetAllMetadata()` duration (already logged)
3. **Duplicate RunView Count**: `TelemetryManager.GetDuplicates()` per session
4. **Cache Hit Rate**: LocalCacheManager hits/(hits+misses) ratio
5. **Total RunView Count**: Per session, to track reduction
6. **P95 RunView Latency**: Via telemetry event timing
7. **Memory Usage**: Component cache size over time
8. **Bundle Size**: Angular build output size

The System Diagnostics dashboard already displays patterns via `tm.GetPatterns({ minCount: 1, sortBy: 'count' })` at line 1728 of `system-diagnostics.component.ts`.
