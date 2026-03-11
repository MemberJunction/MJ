# MemberJunction Performance Optimization Plan

> **Status**: COMPLETE (Phase 1 implemented, Phase 2 deferred to future PRs)
> **Branch**: `claude/optimize-load-performance-tQ7SS`
> **Implemented**: 2026-03-08 / 2026-03-09
> **PR**: #2088

## Executive Summary

After deep analysis of the MemberJunction architecture across client startup, server resolvers, metadata loading, RunView execution, Angular component rendering, and caching layers, this document identified concrete optimization opportunities.

The architecture already had solid foundations: batch dataset loading for metadata, telemetry with duplicate detection, LocalCacheManager with LRU/LFU eviction, smart cache checks with differential updates, fire-and-forget engine pre-warming, and HTTP compression (gzip level 6 on all GraphQL responses >1KB). The optimizations below built on these foundations.

---

## What Was Implemented

### Phase 1: Core Infrastructure (ALL COMPLETE)

| Item | Description | Status | Commit |
|------|-------------|--------|--------|
| 1.1 | Request Deduplication in ProviderBase | DONE | `8195df6` |
| 1.2 | Linger Window (in-memory memo) | DONE | `8195df6` |
| 1.3 | Map-Backed Entity Lookups | SKIPPED | Decision: not worth it at ~500 entities |
| 1.4 | Debounce Metadata Refresh Checks | DONE | `faa5324` + `871b26d` (tests) |
| 1.5 | ComponentCache LRU Eviction | DONE | `68943ad` |
| -- | Server-Side Cache Trust Optimization | DONE | `faa5324` |
| -- | Fix Circular JSON Serialization in Cache | DONE | `faa5324` |
| -- | IntegrationDataService Engine Cache Migration | DONE | `8195df6` |
| -- | Caching Guide Documentation | DONE | `8cc5af2` |

### Additional Optimizations (from parallel CC thread)

Two server-side cache improvements were made by another CC thread in the same branch:

1. **TrustLocalCacheCompletely** (`databaseProviderBase.ts`, `providerBase.ts`): Server-side providers now return cached RunView results immediately with zero DB queries. Client-side still uses smart cache validation. Controlled by `TrustLocalCacheCompletely` property (default `false`, overridden to `true` in `DatabaseProviderBase`).

2. **Fix circular JSON in PostRunView/PostRunViews** (`providerBase.ts`): Cache now stores plain objects BEFORE entity transformation. BaseEntity objects contain RxJS Subjects with circular subscriber references that broke `JSON.stringify`, silently preventing all `CacheLocal: true` engine configs from actually caching.

---

## Implementation Details

### 1.1 + 1.2: Request Deduplication with Linger Window

**Implemented as a unified dedup+linger layer** rather than separate dedup and memo cache layers (simpler mental model, same effect).

**How it works**:
- `RunViews()` wraps `ExecuteRunViewsPipeline()` with fingerprint-based dedup
- Concurrent identical calls share a single execution via `_inflightViews` Map
- After resolution, results stay cached for `DedupLingerMs` (default 5s) for instant replay of near-sequential identical calls
- Each caller gets a shallow copy (`{ ...result, Results: [...result.Results] }`) — shared row object references but independent array instances
- `SaveViewResults: true` bypasses dedup (has side effects: creates UserViewRun records)
- `LogStatusEx` with `verboseOnly: true` emitted on linger hits and in-flight hits

**Key config**:
```typescript
public static DedupLingerMs: number = 5000; // Set to 0 to disable linger
```

**Files modified**: `packages/MJCore/src/generic/providerBase.ts`
**Tests**: `packages/MJCore/src/__tests__/providerBase.dedup.test.ts` (14 tests)

### 1.3: Map-Backed Entity Lookups — SKIPPED

Decision made during implementation: with ~500 entities, O(n) `.find()` calls are negligible. The Map overhead (memory + rebuild on every metadata update) wasn't justified.

### 1.4: Debounce Metadata Refresh Checks

**How it works**:
- `CheckToSeeIfRefreshNeeded()` now checks `_lastRefreshCheckAt` against `MinRefreshCheckIntervalMs`
- Prevents redundant `RefreshRemoteMetadataTimestamps()` network calls when multiple engines call `Config()` during startup
- Forced `Refresh()` bypasses debounce via `_refresh` flag short-circuiting the `||` in `Config()`

**Key config**:
```typescript
public static MinRefreshCheckIntervalMs: number = 30000; // Set to 0 to disable
```

**Files modified**: `packages/MJCore/src/generic/providerBase.ts`
**Tests**: `packages/MJCore/src/__tests__/providerBase.refreshDebounce.test.ts` (7 tests)

### 1.5: ComponentCache LRU Eviction

**How it works**:
- `MaxDetachedComponents` (default 20) limits detached (not visible) cached components
- When exceeded, least-recently-used detached components are evicted via `EvictIfNeeded()`
- Called after `markAsDetached()` (when a tab is closed)
- Set to 0 to disable eviction (legacy behavior)

**Key config**:
```typescript
public static MaxDetachedComponents: number = 20; // Set to 0 to disable
```

**Files modified**: `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/component-cache-manager.ts`

### Server-Side Cache Trust

**How it works**:
- New `TrustLocalCacheCompletely` property on `ProviderBase` (default `false`)
- `DatabaseProviderBase` overrides to `true` — server-side cached RunView results return instantly, zero DB queries
- Client-side (`GraphQLDataProvider`) keeps smart cache validation behavior
- Cache is kept accurate server-side via BaseEntity save/delete events + Redis pub/sub

**Files modified**: `packages/MJCore/src/generic/providerBase.ts`, `packages/MJCore/src/generic/databaseProviderBase.ts`

### Fix Circular JSON Serialization

**Problem**: `PostRunView`/`PostRunViews` was caching BaseEntity objects that contain RxJS Subjects with circular subscriber references. `JSON.stringify` failed silently, preventing all `CacheLocal: true` engine configs from actually caching.

**Fix**: Cache stores plain objects BEFORE entity transformation. Entity transformation happens after caching.

**Files modified**: `packages/MJCore/src/generic/providerBase.ts`

### IntegrationDataService Engine Cache Migration

Replaced ~8 redundant RunView calls in `IntegrationDataService` with `IntegrationEngineBase` cached data. Methods like `LoadEntityMaps`, `LoadFieldMaps`, `LoadSourceTypes`, etc. now use engine cache instead of issuing individual RunView calls.

**Files modified**:
- `packages/Angular/Explorer/dashboards/src/Integration/services/integration-data.service.ts`
- `packages/Angular/Explorer/dashboards/src/Integration/components/connections/connections.component.ts`
- `packages/Angular/Explorer/dashboards/src/Integration/components/mapping-workspace/mapping-workspace.component.ts`
- `packages/Angular/Explorer/dashboards/src/__tests__/integration-data-service.test.ts`

---

## Test Results

- **MJCore**: 696/696 passing (28 test files)
- **Dashboards**: 34/34 passing (3 test files)
- **New test files**: 2 (dedup: 14 tests, refresh debounce: 7 tests)

---

## Phase 2: Data Loading Efficiency (DEFERRED)

These items are codebase-wide audits better suited for separate, incremental PRs:

### 2.1 Audit and Convert RunView ResultType to `simple`
Many RunView calls use `entity_object` when data is read-only. Switching to `ResultType: 'simple'` with explicit `Fields` reduces memory, GC pressure, and transfer size. ~100+ calls to audit across the codebase.

### 2.2 Convert Promise.all(RunView...) to RunViews() Batch
Many components use `Promise.all([rv.RunView(...), rv.RunView(...)])` instead of the batch `rv.RunViews([...])` API. Batch sends a single GraphQL request. ~50+ instances to convert.

### 2.3 Null Field Elision in GraphQL Responses
Strip null/undefined fields from GraphQL RunView responses to reduce payload 30-50% for sparse entities. Small server-side change in `ResolverBase.ts`.

---

## All Files Changed in This Branch

### Core Infrastructure
| File | Changes |
|------|---------|
| `packages/MJCore/src/generic/providerBase.ts` | Dedup+linger layer, refresh debounce, server-side cache trust, circular JSON fix |
| `packages/MJCore/src/generic/databaseProviderBase.ts` | `TrustLocalCacheCompletely = true` override |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/component-cache-manager.ts` | LRU eviction for detached components |

### IntegrationDataService Optimization
| File | Changes |
|------|---------|
| `packages/Angular/Explorer/dashboards/src/Integration/services/integration-data.service.ts` | Replaced ~8 RunView calls with engine cache |
| `packages/Angular/Explorer/dashboards/src/Integration/components/connections/connections.component.ts` | Type updates for engine entity types |
| `packages/Angular/Explorer/dashboards/src/Integration/components/mapping-workspace/mapping-workspace.component.ts` | Type updates for engine entity types |

### Tests
| File | Changes |
|------|---------|
| `packages/MJCore/src/__tests__/providerBase.dedup.test.ts` | 14 tests for dedup+linger |
| `packages/MJCore/src/__tests__/providerBase.refreshDebounce.test.ts` | 7 tests for refresh debounce |
| `packages/Angular/Explorer/dashboards/src/__tests__/integration-data-service.test.ts` | Updated mocks for new entity types |

### Documentation
| File | Changes |
|------|---------|
| `guides/CACHING_AND_PUBSUB_GUIDE.md` | Server-side vs client-side cache trust behavior |
| `guides/complete/PERFORMANCE_OPTIMIZATION_PLAN.md` | This file (moved from `guides/`) |

### Other
| File | Changes |
|------|---------|
| `CLAUDE.md` | Git guardrails |
| `packages/Angular/Explorer/dashboards/src/DashboardBrowser/dashboard-browser-resource.component.ts` | Console cleanup |
| `packages/Angular/Generic/conversations/src/lib/components/message/agent-response-form.component.ts` | Console cleanup |

---

## Future Considerations (Not In Scope)

These items were identified during analysis but deferred:

- **OnPush Change Detection Migration**: Only ~13 Angular components use OnPush. Systematic migration would reduce change detection cycles 60-80%.
- **Engine Startup Data Consolidation**: Batch all engine data needs into 1-2 RunViews calls instead of ~15-20 separate calls.
- **Incremental Metadata Updates**: Only load entities/fields changed since last timestamp.
- **Lazy Entity Field Loading**: Load entity field details on-demand instead of all upfront.
- **GraphQL Subscription-Based Cache Invalidation**: Push invalidation events via WebSocket instead of polling.
- **Same-Entity Query Merging (DataLoader pattern)**: Merge queries against the same entity into UNION ALL.
- **`@for` trackBy Audit**: Ensure all Angular `@for` loops have proper `track` expressions.
- **SharedService BaseSingleton Migration**: Uses manual `static _instance` instead of `BaseSingleton`.
