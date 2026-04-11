# Entity-Level Cache Control + Memory Management

## Problem Statement

MemberJunction's server-side caching (`LocalCacheManager`) currently has three critical gaps:

1. **No opt-out mechanism.** `TrustServerCacheCompletely = true` causes ALL entities to participate in caching infrastructure — even transactional tables with millions of rows that change constantly. Every `BaseEntity.Save()` triggers a fingerprint scan across all cached entries for that entity, even if nothing is cached for it.

2. **No memory management.** Cached results are stored in an unbounded `Map` with no LRU eviction, no memory budget, and no size tracking. A server running for weeks accumulates every query result ever cached.

3. **No granular control.** The only knobs are `TrustServerCacheCompletely` (global server behavior) and `CacheLocal` (per-query opt-in). There's no entity-level "should this entity participate in caching at all" flag.

## Design

### 1. `AllowCaching` Entity Flag

**New column:** `Entity.AllowCaching BIT NOT NULL DEFAULT 0`

When `AllowCaching = false` (the default for new entities), the **entire cache code path is short-circuited** for that entity. This means:

- No `PreRunView` cache check (no fingerprint generation, no Map lookup)
- No auto-cache storage after query execution
- No `HandleBaseEntityEvent` fingerprint scan on save/delete
- No client-side IndexedDB cache check/store
- Zero overhead on the hot save and query paths

When `AllowCaching = true`, the current caching behavior applies: `TrustServerCacheCompletely` controls server-side trust (defaults to `true` when caching is enabled), BaseEntity events maintain cache freshness, auto-cache stores small unfiltered results.

**Migration defaults:**
- All `__mj` schema entities: `AllowCaching = 1` (metadata is read-heavy, write-rarely)
- All non-`__mj` entities: `AllowCaching = 0` (safe default for transactional data)
- CodeGen sets the default based on schema for newly created entities
- Admins can opt-in specific entities (e.g., large but static reference tables like geo data)

**Short-circuit locations:**

| Location | File | What it skips |
|---|---|---|
| `ProviderBase.RunView()` | providerBase.ts | Skip `PreRunView` cache check |
| `ProviderBase.shouldAutoCache()` | providerBase.ts | Return false immediately |
| `LocalCacheManager.HandleBaseEntityEvent()` | localCacheManager.ts | Skip fingerprint scan for non-cached entities |
| `LocalCacheManager.HandleRemoteInvalidateEvent()` | localCacheManager.ts | Skip processing |
| `GraphQLDataProvider` (client) | graphQLDataProvider.ts | Skip IndexedDB cache check/store |

The `AllowCaching` flag is available on `EntityInfo` (loaded at startup with all other entity metadata), so the check is an O(1) property access — no DB query needed.

### 2. Cache Entry Interface + LRU Tracking

Define a proper interface for cache entries that includes LRU metadata:

```typescript
interface CacheEntry {
    /** The cached RunView fingerprint (cache key) */
    Fingerprint: string;
    /** Entity name for reverse-index lookups */
    EntityName: string;
    /** The cached result rows */
    Results: Record<string, unknown>[];
    /** Aggregate results, if any */
    AggregateResults?: unknown[];
    /** Total row count (may differ from Results.length if paginated) */
    TotalRowCount: number;
    /** Max __mj_UpdatedAt from the cached results (for freshness checking) */
    MaxUpdatedAt: string;
    /** When this entry was first stored */
    CreatedAt: number;
    /** When this entry was last accessed (read or updated). Used for LRU eviction. */
    LastAccessedAt: number;
    /** Estimated memory size in bytes. Computed at storage time. */
    EstimatedSizeBytes: number;
}
```

`LocalCacheManager` stores `CacheEntry` objects instead of the current untyped structure. The `LastAccessedAt` timestamp is updated on every cache hit (`GetRunViewResult`). `EstimatedSizeBytes` is computed once at storage time.

### 3. LRU Eviction

When storing a new cache entry would exceed the memory budget, evict the least-recently-accessed entries until the budget is satisfied.

**Eviction algorithm:**
1. On `SetRunViewResult`: compute `EstimatedSizeBytes` for the new entry
2. If `totalCachedBytes + newEntrySize > MaxMemoryBytes`: collect all entries sorted by `LastAccessedAt` ascending, evict from oldest until under budget
3. Store the new entry

**Size estimation:** `JSON.stringify(results).length * 2` (2 bytes per UTF-16 char in JS). Rough but sufficient for budgeting — we don't need byte-exact accounting, just order-of-magnitude awareness.

**Per-entity entry cap:** `MaxEntriesPerEntity` prevents a single entity from dominating the cache. When exceeded, the oldest entries for that entity are evicted first (before checking the global budget).

### 4. Configuration via `mj.config.cjs`

```javascript
module.exports = {
    cacheSettings: {
        /** 
         * Maximum total estimated memory for all server-side cached results.
         * When exceeded, LRU eviction removes least-recently-accessed entries.
         * Default: 100MB. Set to 0 to disable memory-based eviction.
         */
        maxMemoryMB: 100,

        /**
         * Maximum number of cached query fingerprints per entity.
         * Prevents a single entity from dominating the cache.
         * Default: 50. Set to 0 for unlimited.
         */
        maxEntriesPerEntity: 50,

        /**
         * Default TTL (time-to-live) in seconds for cached results.
         * After this time, cached results are considered stale and evicted
         * on next access. 0 = no TTL (rely on event-based invalidation only).
         * Default: 0 (no TTL — event-based invalidation is the primary mechanism).
         */
        defaultTTLSeconds: 0,

        /**
         * Interval in seconds for the periodic eviction sweep.
         * Catches entries that should have been evicted but weren't
         * due to no new stores triggering eviction. 0 = disabled.
         * Default: 300 (5 minutes).
         */
        evictionSweepIntervalSeconds: 300,

        /**
         * Enable verbose cache logging (hits, misses, evictions, memory stats).
         * Default: false.
         */
        verboseLogging: false
    }
};
```

### 5. Implementation Plan

#### Phase 1: `AllowCaching` flag (high value, low risk)

1. **Migration:** Add `AllowCaching BIT NOT NULL DEFAULT 0` to Entity table
2. **Seed data:** Set `AllowCaching = 1` for all `__mj` schema entities
3. **CodeGen:** Set default based on schema (`__mj` = 1, others = 0)
4. **EntityInfo:** Expose `AllowCaching` property (will happen automatically via CodeGen)
5. **Short-circuit checks:** Wire `AllowCaching` into:
   - `ProviderBase.RunView()` — treat `AllowCaching = false` like `BypassCache = true`
   - `ProviderBase.shouldAutoCache()` — return false
   - `LocalCacheManager.HandleBaseEntityEvent()` — skip if entity has `AllowCaching = false`
   - `LocalCacheManager.HandleRemoteInvalidateEvent()` — skip
6. **Client-side:** `GraphQLDataProvider` respects `AllowCaching` from entity metadata

#### Phase 2: Cache entry interface + LRU (important, medium risk)

1. **Define `CacheEntry` interface** with LRU metadata fields
2. **Migrate `LocalCacheManager` internal storage** from untyped Maps to `CacheEntry`
3. **Update `GetRunViewResult`** to touch `LastAccessedAt` on hit
4. **Update `SetRunViewResult`** to compute `EstimatedSizeBytes` and check budgets
5. **Implement LRU eviction** — sort by `LastAccessedAt`, evict until under budget
6. **Implement per-entity cap** via `MaxEntriesPerEntity`
7. **Add periodic sweep timer** — `setInterval` at configured frequency

#### Phase 3: Configuration (polish)

1. **Read `cacheSettings` from `mj.config.cjs`** during `LocalCacheManager.Initialize()`
2. **Apply defaults** for any missing settings
3. **Add cache stats API** — `LocalCacheManager.GetStats()` returning total entries, total estimated memory, per-entity counts, hit/miss ratios
4. **Expose stats** via GraphQL query for admin dashboards

### 6. Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| `AllowCaching` default = 0 for non-`__mj` | Low — conservative default, no existing behavior changes for `__mj` entities | Admins can opt-in entities that benefit from caching |
| Short-circuit checks | Low — adding early returns, no logic changes to existing paths | Feature flag: `AllowCaching` must be explicitly `false` to skip |
| LRU eviction | Medium — modifies hot cache paths | Thorough unit testing of eviction logic, configurable budget with generous default |
| Memory estimation | Low — approximation, not exact | Over-estimate is safer than under-estimate; `* 2` factor provides buffer |
| Config integration | Low — read-only at startup | Defaults match current behavior (no eviction = unlimited cache) |

### 7. Expected Impact

| Scenario | Before | After |
|---|---|---|
| 50M-row Orders table | Cache infrastructure processes every save event | Zero overhead — `AllowCaching=false` |
| 234-row Countries table | Cached, works great | Same — `AllowCaching=true` |
| High-write transactional entity | Every save scans all fingerprints | Skip scan entirely |
| Server running for weeks | Unbounded memory growth | LRU eviction under 100MB budget |
| New entity created by user | Automatically participates in caching | Defaults to no caching; opt-in if desired |
