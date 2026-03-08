# MemberJunction Performance Optimization Plan

> **Status**: Approved for implementation (discussion 2026-03-08)
> **Last Updated**: 2026-03-08
> **Branch**: `claude/optimize-load-performance-tQ7SS`

## Executive Summary

After deep analysis of the MemberJunction architecture across client startup, server resolvers, metadata loading, RunView execution, Angular component rendering, and caching layers, this document identifies concrete optimization opportunities.

The architecture already has solid foundations: batch dataset loading for metadata, telemetry with duplicate detection, LocalCacheManager with LRU/LFU eviction, smart cache checks with differential updates, fire-and-forget engine pre-warming, and HTTP compression (gzip level 6 on all GraphQL responses >1KB). The optimizations below build on these foundations.

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
1. **In-memory** (`ProviderBase._localMetadata`) — metadata singleton
2. **LocalCacheManager** — RunView/RunQuery/Dataset results in IndexedDB (50MB, 1000 entries, 5min TTL)
3. **Smart Cache Check** — client sends fingerprint+timestamp, server returns differential updates
4. **Apollo Server** — bounded LRU cache for GraphQL responses
5. **Auth Cache** — LRU cache for 50k tokens, 1hr TTL
6. **UserCache** — in-memory user info cache
7. **HTTP Compression** — gzip level 6 via `compression()` middleware, threshold 1KB, applied globally before Apollo (confirmed: GraphQL responses are compressed)

### Existing Fingerprint System
`LocalCacheManager.GenerateRunViewFingerprint()` (`localCacheManager.ts:436-466`) already produces a human-readable fingerprint combining:
```
Entity|Filter|OrderBy|ResultType|MaxRows|StartRow|AggHash|Connection
```
Example: `Users|Active=1|Name ASC|simple|100|0|a1b2c3d4|localhost`

This fingerprint is used extensively throughout `ProviderBase` for cache operations. The dedup and memo optimizations below reuse this exact fingerprint.

---

## Phase 1: Quick Wins

### 1.1 Request Deduplication in ProviderBase

**Problem**: Telemetry detects duplicates like `Application Entities` being called 2x with identical filters during startup. Multiple code paths trigger overlapping RunView calls concurrently (engines, components, startup sequence).

**Approach**: Compare the fingerprint of each request (entity, filter, orderBy, fields, resultType, maxRows, startRow). If an in-flight promise exists with the same fingerprint, return that promise instead of firing a new request.

**Design**:
```typescript
// In ProviderBase (providerBase.ts)
private _inflightRequests: Map<string, Promise<RunViewResult>> = new Map();

// Wrap the existing RunView flow - intercept BEFORE PreRunView
public async RunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
    // Generate fingerprint using existing LocalCacheManager logic
    // Note: Must handle case where LocalCacheManager isn't initialized yet (startup)
    const fingerprint = this.GenerateDedupeFingerprint(params);

    // If an identical request is already in-flight, return the same promise
    const inflight = this._inflightRequests.get(fingerprint);
    if (inflight) {
        LogStatusEx({ message: `[PERF-DEDUP] Reusing in-flight request for ${params.EntityName}: ${fingerprint}`, verboseOnly: true });
        return inflight as Promise<RunViewResult<T>>;
    }

    // Execute the actual RunView (existing flow: PreRunView → InternalRunView → PostRunView)
    const promise = this._executeRunViewInternal<T>(params, contextUser);
    this._inflightRequests.set(fingerprint, promise as Promise<RunViewResult>);

    try {
        return await promise;
    } finally {
        this._inflightRequests.delete(fingerprint);
    }
}
```

**Fingerprint generation**: Reuse the exact same logic from `LocalCacheManager.GenerateRunViewFingerprint()`. Since `LocalCacheManager` may not be initialized during early startup, extract the fingerprint logic into a standalone utility function (or static method) that both `LocalCacheManager` and `ProviderBase` can use.

**Files to modify**:
- `/packages/MJCore/src/generic/providerBase.ts` — Add `_inflightRequests` Map, wrap `RunView()` with dedup check, extract `_executeRunViewInternal()` from current `RunView()` body
- `/packages/MJCore/src/generic/localCacheManager.ts` — Extract fingerprint generation into a static/standalone utility so it can be called without an initialized instance

**Edge cases**:
- `contextUser` differences: Two calls with different `contextUser` should NOT share results (different permissions). Include `contextUser?.ID` in the fingerprint.
- `RunViews()` batch: Apply dedup per-item within a batch — if 3 of 5 items are duplicates of in-flight requests, only execute the 2 unique ones.
- Cleanup: `finally` block ensures cleanup even on errors.

**Impact**: Eliminates ALL duplicate concurrent RunView calls system-wide with zero changes to callers.

---

### 1.2 In-Memory Memo Cache with Configurable TTL

**Problem**: Same data requested 2 seconds apart (not concurrent, so dedupe doesn't help) still triggers a full round trip. `LocalCacheManager` requires `CacheLocal: true` and IndexedDB (async).

**Approach**: Lightweight synchronous in-memory cache with configurable TTL (default 5 seconds). Buttresses the dedup layer — dedup handles concurrent identical calls, memo handles sequential identical calls within the TTL window.

**Design**:
```typescript
// In ProviderBase (providerBase.ts)

/**
 * Configurable TTL for the in-memory memo cache in milliseconds.
 * Default: 5000ms (5 seconds). Set to 0 to disable.
 * This cache works independently of CacheLocal/LocalCacheManager.
 */
public static MemoTTLMs: number = 5000;

private _resultMemo: Map<string, { result: RunViewResult; timestamp: number }> = new Map();

/**
 * Check the memo cache for a recent result with the same fingerprint.
 * Returns undefined on miss or expired entry.
 */
protected CheckMemo(fingerprint: string): RunViewResult | undefined {
    if (ProviderBase.MemoTTLMs <= 0) return undefined;

    const entry = this._resultMemo.get(fingerprint);
    if (!entry) return undefined;

    if ((Date.now() - entry.timestamp) < ProviderBase.MemoTTLMs) {
        LogStatusEx({ message: `[PERF-MEMO] Cache hit for ${fingerprint}`, verboseOnly: true });
        return entry.result;
    }

    // Expired — clean up
    this._resultMemo.delete(fingerprint);
    return undefined;
}

/**
 * Store a result in the memo cache.
 */
protected StoreMemo(fingerprint: string, result: RunViewResult): void {
    if (ProviderBase.MemoTTLMs <= 0) return;
    this._resultMemo.set(fingerprint, { result, timestamp: Date.now() });
}
```

**Integration point**: Check memo BEFORE the dedup layer (fastest possible return), store AFTER successful execution:
```
RunView() → CheckMemo → if hit: return immediately
          → Dedup check → if in-flight: await existing promise
          → Execute (PreRunView → InternalRunView → PostRunView)
          → StoreMemo → return
```

**Memory management**: Entries auto-expire via TTL check on access. Add periodic cleanup (every 60s or every 100 calls) to purge stale entries and prevent unbounded Map growth.

**Files to modify**:
- `/packages/MJCore/src/generic/providerBase.ts` — Add `_resultMemo` Map, `MemoTTLMs` static config, `CheckMemo()`/`StoreMemo()` methods, integrate into RunView flow

**Impact**: Near-zero latency for repeated reads within TTL window. Works without `CacheLocal: true`.

---

### 1.3 Map-Backed Entity Lookups in ProviderBase

**Problem**: Entity lookups throughout the codebase use `this.Entities.find(e => e.Name.trim().toLowerCase() === ...)` which is O(n) per call. With ~500 entities, this is called hundreds of times per session. Not slow per-call, but wasteful at scale.

**Approach**: Store auxiliary Maps for name→EntityInfo and ID→EntityInfo in `ProviderBase`. Expose via existing `Metadata.EntityByName()` and `Metadata.EntityByID()` methods which currently delegate to the provider's `Entities` array with `.find()`. Update the provider to use Maps internally, then gradually migrate direct `.find()` callers to use `EntityByName()`/`EntityByID()`.

**Design**:
```typescript
// In ProviderBase (providerBase.ts)

// Auxiliary lookup maps — rebuilt whenever metadata is updated
private _entityNameMap: Map<string, EntityInfo> = new Map();
private _entityIDMap: Map<string, EntityInfo> = new Map();

/**
 * Rebuild the entity lookup maps from the current metadata.
 * Called from UpdateLocalMetadata() and LoadLocalMetadataFromStorage().
 */
protected RebuildEntityMaps(): void {
    this._entityNameMap.clear();
    this._entityIDMap.clear();
    if (this._localMetadata?.AllEntities) {
        for (const e of this._localMetadata.AllEntities) {
            this._entityNameMap.set(e.Name.trim().toLowerCase(), e);
            this._entityIDMap.set(NormalizeUUID(e.ID), e);
        }
    }
}

/**
 * O(1) entity lookup by name. Falls back to array scan if map not yet built.
 */
public EntityByName(name: string): EntityInfo | undefined {
    if (!name) return undefined;
    const key = name.trim().toLowerCase();
    return this._entityNameMap.get(key)
        ?? this.Entities.find(e => e.Name.trim().toLowerCase() === key); // fallback
}

/**
 * O(1) entity lookup by ID. Falls back to array scan if map not yet built.
 */
public EntityByID(id: string): EntityInfo | undefined {
    if (!id) return undefined;
    return this._entityIDMap.get(NormalizeUUID(id))
        ?? this.Entities.find(e => UUIDsEqual(e.ID, id)); // fallback
}
```

**Integration**:
1. Call `RebuildEntityMaps()` from `UpdateLocalMetadata()` (providerBase.ts:1572) and `LoadLocalMetadataFromStorage()`
2. Update `Metadata.EntityByName()` (metadata.ts:63) and `Metadata.EntityByID()` (metadata.ts:74) to delegate to the provider's Map-backed methods
3. Convert the 8 direct `.find()` calls within `ProviderBase` itself to use `EntityByName()`/`EntityByID()`
4. Over time, migrate the ~172 `.find()` calls across 93 files to use `Metadata.EntityByName()`/`Metadata.EntityByID()` — but NOT as part of this initial change, just the hot-path ones

**Files to modify (initial)**:
- `/packages/MJCore/src/generic/providerBase.ts` — Add Maps, `RebuildEntityMaps()`, `EntityByName()`, `EntityByID()`, convert 8 internal `.find()` calls
- `/packages/MJCore/src/generic/metadata.ts` — Update `EntityByName()` (line 63) and `EntityByID()` (line 74) to delegate to provider

**Files to migrate later (separate PR)**:
- ~172 `.find()` calls across 93 files — gradual migration to `Metadata.EntityByName()`/`Metadata.EntityByID()`

**Impact**: Eliminates O(n) array scans in hot paths (RunView, PreRunView, GetEntityObject). Marginal per-call savings but adds up across hundreds of calls per session.

---

### 1.4 Debounce Metadata Refresh Checks

**Problem**: `CheckToSeeIfRefreshNeeded()` (`providerBase.ts:1921-1929`) makes a network call via `RefreshRemoteMetadataTimestamps()` every time it's invoked. During startup, `Config()` calls this (line 1554), and the server-side `RefreshIfNeeded()` is also called on a configurable interval (`CheckRefreshIntervalSeconds`).

The server-side interval is already configurable, so the main concern is **client-side** where `Config()` might be called multiple times during startup (e.g., separate connection instances).

**Design**:
```typescript
// In ProviderBase (providerBase.ts)

private _lastRefreshCheckTimestamp: number = 0;

/**
 * Minimum interval between refresh checks in milliseconds.
 * Prevents redundant network calls when Config() is called multiple times during startup.
 * Default: 30 seconds.
 */
public static MinRefreshCheckIntervalMs: number = 30000;

public async CheckToSeeIfRefreshNeeded(providerToUse?: IMetadataProvider): Promise<boolean> {
    if (!this.AllowRefresh) return false;

    const now = Date.now();
    if ((now - this._lastRefreshCheckTimestamp) < ProviderBase.MinRefreshCheckIntervalMs) {
        return false; // Too soon since last check
    }
    this._lastRefreshCheckTimestamp = now;

    await this.RefreshRemoteMetadataTimestamps(providerToUse);
    await this.LoadLocalMetadataFromStorage();
    return this.LocalMetadataObsolete();
}
```

**Files to modify**:
- `/packages/MJCore/src/generic/providerBase.ts` — Add `_lastRefreshCheckTimestamp`, `MinRefreshCheckIntervalMs`, wrap `CheckToSeeIfRefreshNeeded()`

**Impact**: Prevents redundant metadata refresh network calls during startup. Low effort, defensive improvement.

---

### 1.5 ComponentCache Auto-Eviction

**Problem**: `ComponentCacheManager` (`explorer-core/src/lib/shell/components/tabs/component-cache-manager.ts`) caches tab components indefinitely. It tracks `lastUsed` and `createdAt` timestamps but **never uses them for cleanup**. When a tab closes, the component is `markAsDetached()` but stays in memory forever. Only `clearCache()` (full wipe on component destroy) cleans up.

A user opening 50 different dashboards, entity forms, and views over an 8-hour session accumulates all 50 cached `ComponentRef` instances, each holding DOM elements, `ResourceData`, and component state.

**Design**:
```typescript
// In ComponentCacheManager

/**
 * Maximum number of detached (not currently visible) components to keep cached.
 * When exceeded, the least-recently-used detached components are evicted.
 * Default: 20. Set to 0 to disable eviction (current behavior).
 */
public static MaxCachedDetachedComponents: number = 20;

/**
 * Evict least-recently-used detached components when cache exceeds threshold.
 * Called after adding a new component to the cache.
 * Only evicts components that are detached (not currently visible in a tab).
 */
private EvictIfNeeded(): void {
    if (ComponentCacheManager.MaxCachedDetachedComponents <= 0) return;

    // Get all detached components (not currently visible)
    const detached = [...this._cache.entries()]
        .filter(([_, meta]) => !meta.isAttached)
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed); // Oldest access first

    // Evict oldest detached components until under limit
    while (detached.length > ComponentCacheManager.MaxCachedDetachedComponents) {
        const [key] = detached.shift()!;
        const meta = this._cache.get(key);
        if (meta) {
            meta.componentRef.destroy(); // Angular cleanup
            this._cache.delete(key);
        }
    }
}
```

**Integration**: Call `EvictIfNeeded()` after:
1. `cacheComponent()` — when a new component is added
2. `markAsDetached()` — when a tab is closed (component becomes eviction candidate)

**Files to modify**:
- `/packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/component-cache-manager.ts` — Add `MaxCachedDetachedComponents`, `EvictIfNeeded()`, integrate into `cacheComponent()` and `markAsDetached()`

**Impact**: Prevents memory leaks in long-running sessions. Configurable limit preserves backward compatibility (set to 0 to disable).

---

## Phase 2: Data Loading Efficiency

### 2.1 Audit and Convert RunView ResultType to `simple`

**Problem**: Many RunView calls use `entity_object` ResultType (which creates full BaseEntity instances with getters/setters, validation, dirty tracking) when data is only displayed — never mutated with `.Save()`, `.Delete()`, etc.

**Key rule**: `Fields` parameter is IGNORED with `entity_object` — `ProviderBase.PreRunView()` (line 639-644) overrides `Fields` with ALL entity fields. The `Fields` parameter only takes effect with `simple` ResultType.

**Approach**: Systematically audit all RunView calls in the codebase. For each call:
1. Trace whether the results are ever mutated (`.Save()`, `.Delete()`, `.Set()`, property assignment)
2. If read-only → switch to `ResultType: 'simple'` with explicit `Fields` listing only needed columns
3. If mutated → keep `entity_object`, remove any `Fields` param (it's ignored anyway)

**Example transformation**:
```typescript
// BEFORE: Full entity objects for display-only grid data
const result = await rv.RunView<ActionExecutionLogEntity>({
    EntityName: 'Action Execution Logs',
    ExtraFilter: `ActionID='${id}'`,
    OrderBy: 'StartedAt DESC',
    MaxRows: 10,
    ResultType: 'entity_object'
});
// Only mapped to grid rows — never saved

// AFTER: Lightweight plain objects with only needed fields
const result = await rv.RunView<{ ID: string; StartedAt: Date; Status: string; Duration: number; ResultCode: string }>({
    EntityName: 'Action Execution Logs',
    ExtraFilter: `ActionID='${id}'`,
    OrderBy: 'StartedAt DESC',
    MaxRows: 10,
    Fields: ['ID', 'StartedAt', 'Status', 'Duration', 'ResultCode'],
    ResultType: 'simple'
});
```

**Scope**: This is a codebase-wide audit. Estimated ~100+ RunView calls to review. Will be done incrementally, prioritizing:
1. High-frequency calls (grids, dashboards, lists)
2. Calls that load many columns but only display a few
3. Engine `Config()` methods that load reference data

**Files**: Codebase-wide audit — specific files identified during implementation.

**Impact**: Reduces memory allocation, GC pressure, and transfer size. The `Fields` parameter narrows the SQL `SELECT` clause, reducing database I/O and network payload.

---

### 2.2 Convert Promise.all(RunView...) to RunViews() Batch

**Problem**: Many components load multiple related datasets using separate `RunView()` calls wrapped in `Promise.all()`. Each call sends a separate GraphQL request. The batch `RunViews()` API sends all views in a **single GraphQL request**, and the server-side resolver (`RunViewsGenericInternal`) optimizes batch execution (user lookup once, set-based entity validation, parallel SQL execution).

**Example transformation**:
```typescript
// BEFORE: 3 separate GraphQL requests via Promise.all
const [params, codes, logs] = await Promise.all([
    rv.RunView({ EntityName: 'Action Params', ExtraFilter: `ActionID='${id}'`, ResultType: 'entity_object' }),
    rv.RunView({ EntityName: 'Action Result Codes', ExtraFilter: `ActionID='${id}'`, ResultType: 'entity_object' }),
    rv.RunView({ EntityName: 'Action Execution Logs', ExtraFilter: `ActionID='${id}'`, MaxRows: 10, ResultType: 'entity_object' })
]);

// AFTER: 1 GraphQL request via RunViews batch
const [params, codes, logs] = await rv.RunViews([
    { EntityName: 'Action Params', ExtraFilter: `ActionID='${id}'`, ResultType: 'entity_object' },
    { EntityName: 'Action Result Codes', ExtraFilter: `ActionID='${id}'`, ResultType: 'entity_object' },
    { EntityName: 'Action Execution Logs', ExtraFilter: `ActionID='${id}'`, MaxRows: 10, ResultType: 'entity_object' }
]);
```

**Known instances to convert**:
- `action-form.component.ts` — 6 separate RunView calls in Promise.all
- `ai-agent-form.component.ts` — multiple separate RunView calls
- `ai-prompt-form.component.ts` and related components
- Various dialog components with 2-3 separate RunView calls
- Engine `Config()` methods that do multiple independent RunView calls

**Scope**: Audit all `Promise.all` patterns that contain multiple `RunView()` calls. Will be done alongside the ResultType audit (2.1) since both touch the same call sites.

**Files**: Codebase-wide audit — specific files identified during implementation.

**Impact**: Reduces network round trips from N to 1 per batch. Server-side resolver already optimizes batch execution.

---

### 2.3 Null Field Elision in GraphQL Responses

**Problem**: GraphQL responses include all requested fields even when many are null or empty. For entities with 50+ fields where most are null, this adds significant payload.

**Design**:
```typescript
// In RunViewResolver (ResolverBase.ts), after MapFields() and before returning results
// Strip null/undefined fields to reduce payload size
if (results.Results && results.Results.length > 0) {
    results.Results = results.Results.map(r =>
        Object.fromEntries(
            Object.entries(r).filter(([_, v]) => v != null)
        )
    );
}
```

**Considerations**:
- Must verify client-side code handles missing properties (check for `undefined` rather than explicit `null`)
- Could be opt-in via a parameter if backward compatibility is a concern
- Most impactful for sparse entities (50+ fields, most null)

**Files to modify**:
- `/packages/MJServer/src/generic/ResolverBase.ts` — Add null elision in `RunViewGenericInternal()` and `RunViewsGenericInternal()`

**Impact**: 30-50% payload reduction for sparse entities. Combined with existing HTTP compression, compounds savings.

---

## Phase 3: Server-Side Caching

> **Note**: Redis caching is already in progress via separate work. This phase is documented for completeness but **not in scope for this plan**.

---

## Removed/Resolved Items

### Metadata Compression (was 2.1A)
**Status**: Already implemented. Investigation confirmed that the `compression()` middleware (gzip level 6, threshold 1KB) is installed globally at `index.ts:392` BEFORE the Apollo/GraphQL middleware. All GraphQL responses, including the large `MJ_Metadata` dataset payload, are compressed. No further action needed.

### Redis Server-Side Caching (was 1.5 / Phase 3)
**Status**: Already in progress via separate work stream. Not included in this plan's scope.

---

## Implementation Priority & Order

| Order | Item | Description | Effort | Impact |
|-------|------|-------------|--------|--------|
| 1 | 1.1 | Request Deduplication | Low | **HIGH** |
| 2 | 1.2 | In-Memory Memo Cache | Low | **HIGH** |
| 3 | 1.3 | Map-Backed Entity Lookups | Low | **MED** |
| 4 | 1.4 | Debounce Refresh Checks | Low | **MED** |
| 5 | 1.5 | ComponentCache Eviction | Low | **MED** |
| 6 | 2.1 | ResultType `simple` Audit | Medium | **HIGH** |
| 7 | 2.2 | Batch RunViews Conversion | Medium | **HIGH** |
| 8 | 2.3 | Null Field Elision | Low | **MED** |

### Phase 1 (items 1-5): Core Infrastructure
All changes are in `ProviderBase` and `ComponentCacheManager`. No changes to callers needed. Can be shipped as a single PR.

### Phase 2 (items 6-8): Data Loading Efficiency
Items 6 and 7 are a codebase-wide audit done incrementally. Item 8 is a small server-side change. Can be done as one or multiple PRs depending on scope of audit findings.

---

## Files Summary

### Phase 1 — Files to Modify
| File | Changes |
|------|---------|
| `packages/MJCore/src/generic/providerBase.ts` | Dedup layer, memo cache, entity Maps, debounce refresh |
| `packages/MJCore/src/generic/localCacheManager.ts` | Extract fingerprint generation to static/standalone utility |
| `packages/MJCore/src/generic/metadata.ts` | Delegate EntityByName/EntityByID to provider Maps |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/component-cache-manager.ts` | LRU eviction |

### Phase 2 — Files to Modify
| File | Changes |
|------|---------|
| `packages/MJServer/src/generic/ResolverBase.ts` | Null field elision |
| ~50+ files across `packages/Angular/` and `packages/` | RunView ResultType and batch audit (incremental) |

---

## Metrics to Track

Track these via the existing TelemetryManager and System Diagnostics dashboard:

1. **Dedup Hit Rate**: Count of `[PERF-DEDUP]` log entries per session
2. **Memo Hit Rate**: Count of `[PERF-MEMO]` log entries per session
3. **Duplicate RunView Count**: `TelemetryManager.GetDuplicates()` — should approach zero
4. **Total RunView Count**: Per session, to track reduction from batch conversion
5. **Cache Hit Rate**: LocalCacheManager hits/(hits+misses) ratio
6. **P95 RunView Latency**: Via telemetry event timing
7. **Memory Usage**: ComponentCache size over time (new metric to add)

The System Diagnostics dashboard already displays patterns via `tm.GetPatterns({ minCount: 1, sortBy: 'count' })` at line 1728 of `system-diagnostics.component.ts`.

---

## Future Considerations (Not In Scope)

These items were identified during analysis but deferred as lower priority or requiring larger architectural changes:

- **OnPush Change Detection Migration**: Only ~13 Angular components use OnPush. Systematic migration would reduce change detection cycles 60-80% but requires per-component work.
- **Engine Startup Data Consolidation**: Batch all engine data needs into 1-2 RunViews calls instead of ~15-20 separate calls. Requires engine architecture refactor.
- **Incremental Metadata Updates**: Only load entities/fields changed since last timestamp. Requires dataset endpoint changes.
- **Lazy Entity Field Loading**: Load entity field details on-demand instead of all upfront. Requires significant EntityInfo access pattern changes.
- **GraphQL Subscription-Based Cache Invalidation**: Push invalidation events via WebSocket instead of polling.
- **Same-Entity Query Merging (DataLoader pattern)**: Merge queries against the same entity into UNION ALL.
- **`@for` trackBy Audit**: Ensure all Angular `@for` loops have proper `track` expressions.
- **SharedService BaseSingleton Migration**: Uses manual `static _instance` instead of `BaseSingleton`.
