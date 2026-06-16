# MemberJunction Caching & Real-Time Synchronization Guide

This guide covers the complete caching, pub/sub, and real-time data synchronization architecture in MemberJunction. It explains how data stays fresh across multiple servers and connected browser clients, with or without Redis.

**Related packages**: `@memberjunction/core` (LocalCacheManager, BaseEngine), `@memberjunction/redis-provider`, `@memberjunction/graphql-dataprovider`, `@memberjunction/server` (MJServer)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [LocalCacheManager](#localcachemanager)
3. [Fingerprint System](#fingerprint-system)
4. [Cache Registry](#cache-registry)
5. [Differential Updates](#differential-updates)
6. [Single-Entity Operations](#single-entity-operations)
7. [Universal Cache Invalidation](#universal-cache-invalidation)
8. [Eviction Policies](#eviction-policies)
9. [Storage Providers](#storage-providers)
10. [BaseEngine Integration](#baseengine-integration)
11. [Smart Cache Validation (RunViewsWithCacheCheck)](#smart-cache-validation-runviewswithcachecheck)
12. [Client-Side Fast-Start & Pre-Validation](#client-side-fast-start--pre-validation)
13. [Server-Side Opportunistic Cache (All RunView/RunViews Calls)](#server-side-opportunistic-cache-all-runviewrunviews-calls)
14. [Cross-Server Synchronization (Redis)](#cross-server-synchronization-redis)
15. [Server-to-Browser Synchronization (GraphQL Subscriptions)](#server-to-browser-synchronization-graphql-subscriptions)
16. [Deployment Topologies](#deployment-topologies)
17. [PubSubManager](#pubsubmanager)
18. [Cache Statistics and Monitoring](#cache-statistics-and-monitoring)
19. [Configuration Reference](#configuration-reference)
20. [Troubleshooting](#troubleshooting)
21. [Server-Side Dataset Caching](#server-side-dataset-caching)

---

## Architecture Overview

MemberJunction's caching system operates at three tiers, each serving a different latency and persistence need:

```mermaid
graph TB
    subgraph "Browser Layer"
        BE[BaseEngine<br/>In-Memory Arrays]
        LCM_B[LocalCacheManager<br/>IndexedDB / localStorage]
        GQL_SUB[GraphQL Subscription<br/>WebSocket]
    end

    subgraph "Server Layer (MJAPI)"
        LCM_S[LocalCacheManager<br/>Redis or In-Memory]
        RES[ResolverBase<br/>Entity Save/Delete]
        PSM[PubSubManager<br/>GraphQL Pub/Sub]
    end

    subgraph "Data Layer"
        DB[(SQL Server /<br/>PostgreSQL)]
        REDIS[(Redis)]
    end

    BE -->|RunView with CacheLocal| LCM_B
    LCM_B -->|Smart Cache Check| LCM_S
    LCM_S -->|Cache Miss| DB

    RES -->|Entity Save| DB
    RES -->|MJGlobal Event| LCM_S
    LCM_S -->|Pub/Sub| REDIS
    REDIS -->|Pub/Sub| LCM_S

    LCM_S -->|Cache Change| PSM
    PSM -->|WebSocket| GQL_SUB
    GQL_SUB -->|MJGlobal Event| BE
```

### The Three Caching Tiers

| Tier | Location | Storage | Lifetime | Purpose |
|------|----------|---------|----------|---------|
| **L1** | Browser in-memory | BaseEngine arrays | Session | Instant access, reactive UI |
| **L2** | Browser persistent | IndexedDB / localStorage | Cross-session | Survive page refresh, reduce server load |
| **L3** | Server | Redis or in-memory | Process lifetime (or Redis TTL) | Shared across requests, cross-server sync |

### Server-Side vs Client-Side Cache Behavior

A critical architectural distinction: **server-side providers trust the cache completely, while client-side providers validate before trusting.**

| Environment | Provider | Cache Hit Behavior | Why |
|-------------|----------|-------------------|-----|
| **Server (MJAPI)** | `SQLServerDataProvider` / `PostgreSQLDataProvider` | Return cached data immediately, **zero DB queries** | Cache is kept perfectly in sync via BaseEntity save/delete events + Redis pub/sub |
| **Client (Browser)** | `GraphQLDataProvider` | Lightweight smart cache check against server before returning | Browser cache doesn't have the same event-driven sync guarantees |

This is controlled by the `TrustLocalCacheCompletely` property on `ProviderBase`:
- **Default (`false`)**: Client-side behavior — uses smart cache check (see [Smart Cache Validation](#smart-cache-validation-runviewswithcachecheck))
- **Overridden to `true` in `DatabaseProviderBase`**: Server-side behavior — cache hits return instantly

This means that on the server, once data is loaded into the cache (Redis or in-memory), subsequent `RunView` calls for the same query fingerprint are served entirely from cache with no database interaction whatsoever. The cache stays accurate because:

1. All entity mutations flow through `BaseEntity.Save()` / `BaseEntity.Delete()`
2. These fire `MJGlobal` events that `LocalCacheManager` catches
3. `LocalCacheManager` updates or invalidates affected cached query results in-place
4. In multi-server deployments, Redis pub/sub propagates changes to all MJAPI nodes

### End-to-End Data Flow

When a user saves an entity in their browser, the following chain executes:

```mermaid
sequenceDiagram
    participant BA as Browser A (saver)
    participant SA as MJAPI-A
    participant DB as Database
    participant Redis
    participant SB as MJAPI-B
    participant BB as Browser B
    participant BC as Browser C (on Server A)

    BA->>SA: entity.Save() via GraphQL mutation
    SA->>DB: UPDATE/INSERT
    DB-->>SA: Success

    par Local events (instant)
        SA->>SA: MJGlobal BaseEntity event
        SA->>SA: LocalCacheManager upsert
        SA->>SA: ResolverBase publishes CACHE_INVALIDATION<br/>(with originSessionId)
    and Redis pub/sub (cross-server)
        SA->>Redis: PUBLISH mj:__pubsub__
    end

    par Browser notifications (include RecordData for saves)
        SA-->>BA: WebSocket CACHE_INVALIDATION<br/>originSessionId matches → SKIP
        SA-->>BC: WebSocket CACHE_INVALIDATION + RecordData<br/>originSessionId differs → PROCESS
    end

    Redis->>SB: SUBSCRIBE receives
    SB->>SB: OnCacheChanged → CACHE_INVALIDATION publish (no originSessionId)
    SB-->>BB: WebSocket CACHE_INVALIDATION + RecordData → PROCESS

    Note over BC: Apply RecordData directly to<br/>BaseEngine arrays + LocalCacheManager<br/>(zero server round-trip)
    Note over BB: Apply RecordData directly to<br/>BaseEngine arrays + LocalCacheManager<br/>(zero server round-trip)
```

---

## LocalCacheManager

`LocalCacheManager` is a singleton (extending `BaseSingleton`) that provides unified caching for `RunView`, `RunQuery`, and `Dataset` results. It runs on both browser and server, using pluggable storage providers.

**Location**: `packages/MJCore/src/generic/localCacheManager.ts`

### Initialization

```typescript
import { LocalCacheManager } from '@memberjunction/core';

// Initialize with a storage provider
await LocalCacheManager.Instance.Initialize(storageProvider, {
    enabled: true,
    maxSizeBytes: 50 * 1024 * 1024,  // 50 MB
    maxEntries: 1000,
    defaultTTLMs: 5 * 60 * 1000,      // 5 minutes
    evictionPolicy: 'lru',
});
```

`Initialize()` is idempotent — subsequent calls return the same promise. It loads the persisted registry from the storage provider on first call.

### Cache Entry Types

The system supports three cache entry types, each stored in its own category namespace:

| Type | Category | Description |
|------|----------|-------------|
| `dataset` | `DatasetCache` | Cached Dataset results |
| `runview` | `RunViewCache` | Cached RunView results (entity queries) |
| `runquery` | `RunQueryCache` | Cached RunQuery results (raw SQL/named queries) |

### Core API

```typescript
// RunView cache
SetRunViewResult(fingerprint, params, results, maxUpdatedAt, aggregateResults?): Promise<void>
GetRunViewResult(fingerprint): Promise<CachedRunViewResult | null>
InvalidateRunViewResult(fingerprint): Promise<void>

// RunQuery cache
SetRunQueryResult(fingerprint, queryName, results, maxUpdatedAt, rowCount?, queryId?, ttlMs?): Promise<void>
GetRunQueryResult(fingerprint): Promise<CachedRunQueryResult | null>
InvalidateRunQueryResult(fingerprint): Promise<void>

// Entity-level invalidation (invalidates ALL matching RunView results)
InvalidateEntityCaches(entityName): Promise<void>

// Query-level invalidation (invalidates ALL matching RunQuery results)
InvalidateQueryCaches(queryName): Promise<void>

// Differential updates
ApplyDifferentialUpdate(fingerprint, params, updatedRows, deletedRecordIDs,
    primaryKeyFieldName, newMaxUpdatedAt, serverRowCount?, aggregateResults?): Promise<CachedRunViewResult | null>

// Single-entity operations (use CompositeKey for primary key matching)
UpsertSingleEntity(fingerprint, entityData, key: CompositeKey, newMaxUpdatedAt): Promise<boolean>
RemoveSingleEntity(fingerprint, key: CompositeKey, newMaxUpdatedAt): Promise<boolean>

// Storage provider hot-swap
SetStorageProvider(newProvider: ILocalStorageProvider): Promise<void>

// Fingerprint generation
GenerateRunViewFingerprint(params: RunViewParams, connectionPrefix?: string): string
GenerateRunQueryFingerprint(queryNameOrSQL, params?, connectionPrefix?): string

// Statistics
GetStats(): CacheStats
GetHitRate(): number
GetAllEntries(): CacheEntryInfo[]
GetEntriesByType(type: CacheEntryType): CacheEntryInfo[]
GetRunViewCacheStatus(fingerprint): { maxUpdatedAt, rowCount } | null
GetRunQueryCacheStatus(fingerprint): { maxUpdatedAt, rowCount } | null
```

---

## Fingerprint System

Every cached result is identified by a **fingerprint** — a deterministic, human-readable string generated from the query parameters. Fingerprints enable efficient cache lookups and debugging.

### RunView Fingerprints

**Format:**
```
EntityName|Filter|OrderBy|MaxRows|StartRow|AggregateHash[|ConnectionPrefix]
```

> **Note:** `ResultType` is intentionally excluded from the fingerprint. The cache always stores plain JSON objects regardless of whether the caller requested `'simple'` or `'entity_object'`. Transformation to BaseEntity objects happens post-cache at consumption time via `TransformSimpleObjectToEntityObject()`. This ensures that an engine loading with `ResultType: 'entity_object'` and a GraphQL resolver requesting `ResultType: 'simple'` share the same cached data.

**Examples:**
```
Users|Status='Active'|Name ASC|100|0|_|localhost_4000
AI Models|_|_|-1|0|_|localhost_4000
Users|_|_|50|100|a1b2c3d4|prod-db
```

Key rules:
- Empty values are represented as `_` for readability
- The aggregate hash uses a djb2 hash function when aggregate expressions are present (otherwise `_`)
- Connection prefix is appended only when provided — enables multi-connection cache isolation
- Pipe-delimited for easy parsing and debugging

### Aggregate Hashing

When `RunViewParams` includes aggregate expressions, they're hashed deterministically:

```typescript
// Aggregates are sorted before hashing for consistency
const aggString = aggregates
    .map(a => `${a.expression}:${a.alias || ''}`)
    .sort()
    .join(';');

// DJB2 hash algorithm
let hash = 5381;
for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);  // hash * 33 + char
}
return (hash >>> 0).toString(16);  // Unsigned 32-bit hex string
```

This means `SUM(Amount):total;COUNT(*):cnt` always produces the same hash regardless of the order the aggregates are defined.

### RunQuery Fingerprints

Similar pattern but keyed on query name/SQL and query parameters instead of entity/filter.

### Connection Isolation

The `connectionPrefix` parameter ensures cache isolation when the same browser or server connects to multiple backends:

```
Users|Active=1|Name ASC|100|0|_|prod-server
Users|Active=1|Name ASC|100|0|_|dev-server
```

These are treated as completely separate cache entries even though the query is identical.

---

## Cache Registry

The registry is a persistent metadata index (`Map<string, CacheEntryInfo>`) that tracks all cached items without loading the actual data into memory.

### Registry Entry Structure

```typescript
interface CacheEntryInfo {
    key: string;                    // Storage key (same as fingerprint)
    type: 'dataset' | 'runview' | 'runquery';
    name: string;                   // Entity/Query/Dataset name
    fingerprint?: string;           // For reverse lookups
    params?: Record<string, unknown>; // Original query parameters
    cachedAt: number;               // Cache timestamp (ms since epoch)
    lastAccessedAt: number;         // Last read timestamp (for LRU)
    accessCount: number;            // Hit count (for LFU)
    sizeBytes: number;              // Approximate size in bytes
    maxUpdatedAt?: string;          // Latest __mj_UpdatedAt from data
    rowCount?: number;              // Number of cached rows (always derived)
    expiresAt?: number;             // TTL expiry timestamp (ms since epoch)
}
```

### Persistence

The registry is persisted to the storage provider under key `__MJ_CACHE_REGISTRY__` in the `Metadata` category. Writes are **debounced to 1 second** to avoid thrashing on rapid operations:

```typescript
private debouncedPersistRegistry(): void {
    if (this._persistTimeout) clearTimeout(this._persistTimeout);
    this._persistTimeout = setTimeout(() => {
        this.persistRegistry();
    }, 1000);
}
```

On startup, `Initialize()` loads the registry from storage and rebuilds the entity-to-fingerprint reverse index.

### Entity-to-Fingerprint Reverse Index

The reverse index maps entity names (lowercase, trimmed) to Sets of fingerprint strings. This powers instant invalidation — when an entity changes, all cached RunView results for that entity are found in O(1):

```mermaid
graph LR
    subgraph "Reverse Index"
        E1["'users'"] --> F1["Users|Status='Active'|Name ASC|...<br/>Users|Role='Admin'|LastLogin DESC|..."]
        E2["'ai models'"] --> F2["AI Models|_|_|-1|0|_<br/>AI Models|Vendor='OpenAI'|Name|..."]
    end
```

The index is rebuilt from the registry on startup and maintained during Set/Invalidate/Evict operations.

### Important: Derived rowCount

`rowCount` in the registry is **always derived from `results.length`**, never persisted independently. This prevents stale data bugs where the count and actual data could diverge. On every read, `rowCount` is computed fresh from the stored results array.

---

## Differential Updates

The differential update system enables efficient cache updates by merging only changed records into the existing cache, rather than replacing the entire dataset.

### ApplyDifferentialUpdate Algorithm

```mermaid
flowchart TD
    A[Receive updatedRows + deletedRecordIDs] --> B[Load existing cache by fingerprint]
    B --> C{Cache found?}
    C -->|No| Z[Return null]
    C -->|Yes| D[Build primary key Map from cached results]
    D --> E[Apply deletions: remove by parsed composite key]
    E --> F[Apply updates/inserts: merge into Map]
    F --> G[Convert Map back to array]
    G --> H[Persist with new maxUpdatedAt]
    H --> I[Update registry with derived rowCount]
    I --> J[Return merged CachedRunViewResult]
```

### Composite Primary Key Support

MemberJunction entities can have composite primary keys. The differential update system handles these using a concatenated key format:

**Format**: `Field1|Value1||Field2|Value2`
- Fields are separated by `||` (double pipe)
- Field name and value are separated by `|` (single pipe)
- Values containing `|` are handled via re-joining after split

```typescript
// Parsing composite keys
private extractValueFromConcatenatedKey(
    concatenatedKey: string,    // "OrderID|123||ProductID|456"
    primaryKeyFieldName: string // "OrderID"
): string | null {
    const fieldPairs = concatenatedKey.split('||');
    for (const pair of fieldPairs) {
        const parts = pair.split('|');
        if (parts.length >= 2) {
            const fieldName = parts[0];
            const value = parts.slice(1).join('|'); // Handle | in values
            if (fieldName === primaryKeyFieldName) return value;
        }
    }
    return null; // Fallback for simple keys
}
```

### Safety: Composite PK Fallback

For entities with composite primary keys, the system falls back to full invalidation rather than attempting in-place upsert when it can't reliably match records. This prevents data corruption from incorrect key matching.

### Example: Differential Update Flow

```typescript
// Initial cache: 10 records
await cacheManager.SetRunViewResult(fp, params, rows10, '2026-01-01T00:00:00Z');

// Server reports 3 changed rows and 1 deletion
const result = await cacheManager.ApplyDifferentialUpdate(
    fp,
    params,
    changedRows,        // 2 updated + 1 new = 3 rows
    ['ID|deleted-id'],  // 1 deletion
    'ID',               // Primary key field
    '2026-01-02T00:00:00Z'  // New maxUpdatedAt
);
// Result: 10 - 1 + 1 = 10 rows (1 deleted, 2 updated, 1 inserted)
// maxUpdatedAt: '2026-01-02T00:00:00Z'
```

---

## Single-Entity Operations

For immediate, fine-grained cache updates when a single entity is saved or deleted (no round-trip to server). Both methods use `CompositeKey` for primary key matching, fully supporting entities with any number of primary key fields.

### UpsertSingleEntity

Adds or replaces a single record in a cached RunView result:

```typescript
import { CompositeKey, KeyValuePair } from '@memberjunction/core';

// Single-field primary key
const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', entity.ID)]);
const success = await LocalCacheManager.Instance.UpsertSingleEntity(
    fingerprint,
    entity.GetAll(),           // Plain object from BaseEntity
    key,                       // CompositeKey identifying the record
    entity.__mj_UpdatedAt      // New maxUpdatedAt
);

// Composite primary key (e.g., junction table)
const compositeKey = CompositeKey.FromKeyValuePairs([
    new KeyValuePair('UserID', 'u1'),
    new KeyValuePair('RoleID', 'r2'),
]);
await LocalCacheManager.Instance.UpsertSingleEntity(
    fingerprint, entityData, compositeKey, updatedAt
);
// Returns false if fingerprint not found in cache
```

Algorithm:
1. Load cached results by fingerprint
2. Build a `Map<string, unknown>` keyed by `CompositeKey.ToConcatenatedString()` for O(1) lookups
3. Upsert: set the key → entity data in the map
4. Persist updated array back to storage
5. Update registry `rowCount` (derived from array length)

### RemoveSingleEntity

Removes a single record from a cached RunView result:

```typescript
const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'some-uuid')]);
const success = await LocalCacheManager.Instance.RemoveSingleEntity(
    fingerprint,
    key,                       // CompositeKey identifying the record to remove
    new Date().toISOString()   // New maxUpdatedAt
);
// Returns true even if entity wasn't in cache (no-op is OK)
```

---

## Universal Cache Invalidation

When an entity is saved or deleted, ALL cached RunView results containing that entity must be invalidated or updated. This is powered by the entity-to-fingerprint reverse index.

### InvalidateEntityCaches

```typescript
await LocalCacheManager.Instance.InvalidateEntityCaches('Users');
```

This:
1. Normalizes the entity name (lowercase, trim)
2. Looks up the reverse index for all fingerprints associated with that entity
3. Removes each cached result from storage
4. Removes each entry from the registry
5. Removes fingerprints from the reverse index
6. Persists the updated registry

### BaseEntity Event Integration

BaseEngine subscribes to MJGlobal events and triggers cache operations automatically:

```mermaid
flowchart TD
    A[BaseEntity.Save completes] -->|MJGlobal ComponentEvent| B[BaseEngine.HandleIndividualEvent]
    B --> C{Event matches<br/>engine config?}
    C -->|No| Z[Ignore]
    C -->|Yes| D{Can use immediate mutation?}
    D -->|"Yes: No Filter, No OrderBy,<br/>No AdditionalLoading override"| E[Synchronous array mutation]
    D -->|No| F[Debounced full refresh]

    E --> G[Update in-memory array<br/>push/splice/replace]
    G --> H[NotifyDataChange via DataChange$]
    G --> I{CacheLocal enabled?}
    I -->|Yes| J[syncLocalCacheForConfig]
    J --> K[UpsertSingleEntity or RemoveSingleEntity<br/>using CompositeKey]

    F -->|1.5s debounce| L[LoadSingleConfig from server]
    L --> M[RunView → updates cache naturally]
    L --> H
```

**Note**: LocalCacheManager also independently subscribes to MJGlobal events (including `remote-invalidate`) and updates its own caches. The `syncLocalCacheForConfig` path is only for local save/delete events where BaseEngine handles the immediate mutation — remote events are handled by LocalCacheManager's own `HandleRemoteInvalidateEvent`.

### syncLocalCacheForConfig (BaseEngine)

When immediate mutation is used and `CacheLocal` is enabled, BaseEngine synchronizes the change to LocalCacheManager using `CompositeKey`:

```typescript
protected async syncLocalCacheForConfig(
    config: BaseEnginePropertyConfig,
    event: BaseEntityEvent
): Promise<void> {
    if (!LocalCacheManager.Instance.IsInitialized) return;

    const entity = event.baseEntity;
    const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint({
        EntityName: config.EntityName,
        ExtraFilter: config.Filter || '',
        OrderBy: config.OrderBy || '',
        MaxRows: -1, StartRow: 0,
    }, connectionPrefix);

    // Uses entity.PrimaryKey (CompositeKey) — works with any number of PK fields
    const key = entity.PrimaryKey;
    const updatedAt = entity.Get('__mj_UpdatedAt') || new Date().toISOString();

    if (event.type === 'delete') {
        await LocalCacheManager.Instance.RemoveSingleEntity(fingerprint, key, updatedAt);
    } else {
        await LocalCacheManager.Instance.UpsertSingleEntity(
            fingerprint, entity.GetAll(), key, updatedAt);
    }
}
```

---

## Eviction Policies

When the cache exceeds `maxSizeBytes` or `maxEntries`, entries are evicted to make room.

### Size Estimation (sampled, not exact)

Entry `sizeBytes` is an **approximate** figure used only for eviction accounting — it is never
exact and never affects correctness. Rather than `JSON.stringify` the entire result array on every
cache write (which previously ran an O(rows × fields) serialization on the per-save/delete hot
path), `estimateResultsSize()` samples a few random rows and scales:

- sample count = `clamp(ceil(rowCount × 0.10), 3, 10)` distinct **random** row indexes
- average `JSON.stringify(row).length` across the sample, multiply by `rowCount`, ×2 for UTF-16
- `rowCount === 0` → 0; `rowCount ≤ 3` → measure every row (no sampling)

Random (not first-N) sampling avoids systematic skew when rows are heterogeneous (e.g. a nullable
large JSON/text column whose head rows happen to be null or oversized). Single-row cache mutations
(`UpsertSingleEntity`/`RemoveSingleEntity`) likewise avoid per-row `CompositeKey` allocation by
keying their internal dedup Map with a cheap delimiter-joined PK string.

### Eviction Trigger

```typescript
// Before every Set operation:
private async evictIfNeeded(neededBytes: number): Promise<void> {
    const stats = this.GetStats();
    const wouldExceedSize = (stats.totalSizeBytes + neededBytes) > this._config.maxSizeBytes;
    const wouldExceedCount = stats.totalEntries >= this._config.maxEntries;

    if (!wouldExceedSize && !wouldExceedCount) return;

    // Free at least 10% of max to avoid evicting on every write
    const targetFreeBytes = Math.max(neededBytes, this._config.maxSizeBytes * 0.1);
    const targetFreeCount = Math.max(1, Math.floor(this._config.maxEntries * 0.1));

    await this.evict(targetFreeBytes, targetFreeCount);
}
```

### Supported Policies

| Policy | Sort Order | Best For |
|--------|-----------|----------|
| `lru` (default) | Oldest `lastAccessedAt` first | General purpose — evicts data nobody is using |
| `lfu` | Lowest `accessCount` first | Hot/cold data patterns — keeps frequently-used data |
| `fifo` | Oldest `cachedAt` first | Uniform access patterns — simple age-based expiry |

### Reverse Index Cleanup

When entries are evicted, the reverse index is also cleaned up to prevent memory leaks from stale mappings:

```typescript
// During eviction:
this._entityIndex.get(normalizedName)?.delete(fingerprint);
// If the Set is now empty, remove the entity key entirely
if (this._entityIndex.get(normalizedName)?.size === 0) {
    this._entityIndex.delete(normalizedName);
}
```

---

## Storage Providers

LocalCacheManager delegates actual storage to an `ILocalStorageProvider` implementation. The interface is **generic-typed** — `T` flows from caller through to the retrieved value:

```typescript
interface ILocalStorageProvider {
    GetItem<T = unknown>(key: string, category?: string): Promise<T | null>;
    GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>>;
    SetItem<T>(key: string, value: T, category?: string): Promise<void>;
    Remove(key: string, category?: string): Promise<void>;
    ClearCategory?(category: string): Promise<void>;
    GetCategoryKeys?(category: string): Promise<string[]>;
}
```

### Native object storage vs. JSON serialization

Each implementation handles serialization for its medium internally — callers see the same object-typed interface regardless of backend:

| Provider | Storage format | Type fidelity |
|---|---|---|
| `BrowserIndexedDBStorageProvider` | **Native objects via structured clone** | Preserves `Date`, `Map`, `Set`, typed arrays, nested objects |
| `BrowserLocalStorageProvider` | JSON-serialized internally | `Date` → ISO string; `Map`/`Set` → plain objects |
| `RedisLocalStorageProvider` | JSON-serialized internally | Same JSON limitations as localStorage |
| `InMemoryLocalStorageProvider` | Native references (no copy) | Full identity preserved |

**Why this matters**: IndexedDB's structured clone is implemented in browser-native C++ — significantly faster than JS-level `JSON.parse`/`JSON.stringify`. For cache-heavy workloads (engine warm load, dashboard refreshes) this is a measurable win. The previous string-based interface forced a sandwich of `JSON.stringify` (write) + `JSON.parse` (read) that we no longer pay for IDB-backed cache hits.

```typescript
// Generic typing flows end-to-end — no manual JSON.parse, no casting
interface CachedRunViewData { results: unknown[]; maxUpdatedAt: string; }

await provider.SetItem<CachedRunViewData>(fp, { results, maxUpdatedAt }, 'RunViewCache');
const cached = await provider.GetItem<CachedRunViewData>(fp, 'RunViewCache');
// cached: CachedRunViewData | null
```

**Class instances lose their prototype on retrieval** across all providers. Store the underlying data shape (e.g. via `entity.GetAll()` for `BaseEntity`) — methods aren't preserved by structured clone or JSON.

### Batched reads (`GetItems`)

Hot paths that need many cached entries at once — most notably the smart-cache-check warm-load path that reads ~85 fingerprints per coalesced engine bundle — use `GetItems<T>(keys, category?)` to batch reads through the backend's native batching primitive:

| Provider | Backing primitive | Cost saved |
|---|---|---|
| `BrowserIndexedDBStorageProvider` | Single read transaction with N parallel `get()` calls | ~3–10ms per per-key transaction overhead × N keys → one transaction's commit cost |
| `RedisLocalStorageProvider` | Single `MGET` command | (N – 1) network round-trips |
| `BrowserLocalStorageProvider` / `InMemoryLocalStorageProvider` | Tight loop | Negligible (synchronous backends) |

`LocalCacheManager` exposes a typed wrapper, `GetRunViewResults(fingerprints: string[])`, that delegates to `GetItems` and threads the cache hit/miss accounting through. The smart-cache-check flow uses it in two passes:

1. **Pre-network pass** in `prepareSmartCacheCheckParams`: read all per-fingerprint cache statuses in one batch to build the GraphQL request payload
2. **Post-network pass** in `executeSmartCacheCheck`: read all 'current' fingerprints' actual cached data in one batch, distribute to per-param processors

Before this, both passes did per-fingerprint reads inside `Promise.all` — looked parallel, but IDB serializes transactions on the same object store and Redis paid full RTT per `GET`. For an 8-engine warm-load bundle of ~85 fingerprints this dropped from ~170 IDB transactions / network round-trips to 2.

The deserialization cost on retrieval is also avoided per pass — the batched implementation deserializes (or structured-clones) once per backend call instead of N times.

### Category Namespaces

Categories organize cache data and enable bulk operations:

| Category | Contents |
|----------|----------|
| `RunViewCache` | Cached entity query results |
| `RunQueryCache` | Cached raw SQL/named query results |
| `DatasetCache` | Cached dataset results |
| `Metadata` | Registry and internal state |
| `default` | Uncategorized data |

### Available Providers

```mermaid
graph TD
    ILocalStorageProvider --> InMemory[InMemoryLocalStorageProvider]
    ILocalStorageProvider --> BrowserLS[BrowserLocalStorageProvider]
    ILocalStorageProvider --> BrowserIDB[BrowserIndexedDBStorageProvider]
    ILocalStorageProvider --> RedisLSP[RedisLocalStorageProvider]

    InMemory -->|"Server default<br/>(no Redis)"| ServerSide
    BrowserIDB -->|"Browser default<br/>(recommended)"| ClientSide
    BrowserLS -->|"Browser fallback<br/>(if IndexedDB unavailable)"| ClientSide
    RedisLSP -->|"Server with Redis<br/>(shared cache + pub/sub)"| ServerSide
```

### InMemoryLocalStorageProvider

**Location**: `packages/MJCore/src/generic/InMemoryLocalStorageProvider.ts`

- Simple `Map<category, Map<key, value>>` structure
- No persistence across process restarts
- Used as server default when Redis is not configured
- Also used as the initial provider before Redis connects (then hot-swapped)

### BrowserIndexedDBStorageProvider

**Location**: `packages/GraphQLDataProvider/src/storage-providers.ts`

- **Database name**: `MJ_Metadata`
- **DB version**: auto-derived from package version as `major * 1000 + minor` (e.g. `5.30.x` → `5030`, `5.31.x` → `5031`, `6.0.x` → `6000`). See "Version-bumped wipe" below.
- **Native object storage** via IndexedDB's structured clone algorithm — `Date`, `Map`, `Set`, typed arrays, and nested objects are preserved. No JSON.parse/JSON.stringify on the hot path.
- **Dedicated object stores** for known categories: `mj:default`, `mj:Metadata`, `mj:RunViewCache`, `mj:RunQueryCache`, `mj:DatasetCache`
- Unknown categories: prefixed keys stored in the default store
- **Cross-tab handling**: when another tab triggers a DB upgrade, the local connection's `onversionchange` fires and we close gracefully so the upgrade isn't blocked
- **This is what `GraphQLDataProvider.LocalStorageProvider` resolves to** in browser environments. The `LocalStorageProvider` / `_localStorageProvider` / `localStorageRootKey` names are historical — the actual backend is IndexedDB.

#### Version-bumped wipe (zero-config schema migrations)

Bumping any minor version of `@memberjunction/graphql-dataprovider` automatically increments the IDB `DB_VERSION`, which fires `onupgradeneeded` on the next page load. The handler drops every object store (cached data may be from any prior schema/format) and recreates them fresh — caches repopulate on first use after the upgrade.

This is intentional design:

- **Patch releases share the DB version** (5.30.0, 5.30.1, 5.30.2 all use DB version `5030`) — frequent patch deploys don't trigger cold-cache loads
- **Minor releases get a clean cache** — sidesteps the entire "did this PR change cache format?" review burden
- **Cost**: one slow page load per user per minor (~1s back to the cold-load path) — negligible for monthly LTS cadence
- **Emergency override**: bump `MANUAL_CACHE_REVISION` in `storage-providers.ts` to force a wipe within a single minor release

The version number is generated at build time by `packages/GraphQLDataProvider/scripts/generate-version.mjs` (a `prebuild`/`pretest` script that reads `package.json` and writes `src/version.generated.ts`). No human action required when bumping versions through the normal changeset flow.

#### Framework Metadata Blob: gzip-Compressed

The framework metadata payload (`AllMetadata` — typically 6–10 MB of JSON) is gzip-compressed before being written to the `Metadata` object store. `SaveLocalMetadataToStorage` uses the native `CompressionStream('gzip')` API; the compressed bytes are base64-encoded for storage. `LoadLocalMetadataFromStorage` reverses the process via `DecompressionStream('gzip')`.

The format used for the current write is recorded in a separate key (`localStorageFormatKey` — values: `'gzip'` or `'json'`) so the read path can dispatch to the right deserializer. An uncompressed fallback path runs when `CompressionStream` is unavailable.

**Why compress?** The dominant cost of loading the metadata cache is `JSON.parse` on the main thread. Parsing ~1 MB is dramatically faster than parsing ~10 MB, and it's synchronous — directly affecting TTI on warm load. Secondary benefits: faster IndexedDB reads, better headroom on storage-constrained devices.

After load, `_localMetadata` is held in memory on the provider instance for the session lifetime. Decompress + parse + `MetadataFromSimpleObject` only runs once per cold load (and again if `backgroundValidateAndRefresh` swaps in fresh data) — never per metadata access.

### BrowserLocalStorageProvider

**Location**: `packages/GraphQLDataProvider/src/storage-providers.ts`

- Uses browser `localStorage` API
- **Key format**: `[mj]:[category]:[key]`
- Falls back to in-memory if localStorage is unavailable
- Limited by browser storage quotas (~5-10 MB)
- **Not used by `GraphQLDataProvider` by default** — `LocalStorageProvider` resolves to `BrowserIndexedDBStorageProvider` whenever `indexedDB` is defined. Available for opt-in scenarios.

### RedisLocalStorageProvider

**Location**: `packages/RedisProvider/`

- **Redis key structure**: `mj:<category>:<key>`
- **Pub/sub channel**: `mj:__pubsub__`
- Cross-process shared cache (all MJAPI instances share the same data)
- Built-in pub/sub for cache invalidation notifications
- Self-message filtering via `MJGlobal.Instance.ProcessUUID`
- `OnCacheChanged` callback for reacting to remote cache changes
- Configurable logging for debugging pub/sub flow

**Pub/sub message format:**
```json
{
    "CacheKey": "AI Models|_|_|-1|0|_",
    "Action": "set",
    "Category": "RunViewCache",
    "SourceServerId": "b931917f-...",
    "Timestamp": "2026-03-08T01:36:49.433Z"
}
```

### Storage Provider Hot-Swap

During server startup, engines load and cache data **before** Redis connects. The `SetStorageProvider()` method solves this initialization order problem:

```mermaid
sequenceDiagram
    participant Engines as Engine Loading
    participant LCM as LocalCacheManager
    participant Mem as InMemoryProvider
    participant Redis as RedisProvider

    Note over Engines,LCM: Server Startup Phase 1
    Engines->>LCM: Initialize(InMemoryProvider)
    Engines->>LCM: Cache 64 entries to memory

    Note over LCM,Redis: Server Startup Phase 2
    Redis->>Redis: Connect to Redis server
    LCM->>LCM: SetStorageProvider(RedisProvider)
    LCM->>Mem: Read all 64 entries
    LCM->>Redis: Write all 64 entries
    Note over LCM: "Migrated 64/64 entries"
```

`SetStorageProvider()` migrates all existing cache entries (by iterating the registry) from the old provider to the new one. The registry is also persisted to the new provider. Any entries that fail to migrate are logged but don't block the swap.

---

## BaseEngine Integration

All MemberJunction engine singletons (AIEngineBase, DashboardEngine, UserInfoEngine, etc.) extend `BaseEngine<T>`, which provides automatic data loading, caching, and real-time refresh.

### Reactive UI consumption — `ObserveProperty` (the API to know about)

Engines expose every array property as a lazy RxJS observable. **This is the canonical way to keep an Angular UI in sync with cached entities** — no manual reload loops, no `loadX()` calls after every mutation, no race conditions with BaseEntity events.

```typescript
// From inside the engine — declare a Configs entry (BaseEngine wires the events):
public async Config(forceRefresh = false, contextUser?, provider?) {
    await this.Load([
        { Type: 'entity', EntityName: 'MJ: My Things',
          PropertyName: '_things',
          CacheLocal: true },
    ], provider, forceRefresh, contextUser);
}
public get Things(): MyThingEntity[] { return this._things ?? []; }
public get Things$(): Observable<MyThingEntity[]> {
    return this.ObserveProperty<MyThingEntity>('_things');
}

// From a consumer (Angular component, service, anywhere):
await MyEngine.Instance.Config(false, user, provider);  // lazy — no-op if loaded
MyEngine.Instance.Things$.subscribe(things => {
    // Fires immediately with the current array (BehaviorSubject semantics),
    // and again on every save / delete / remote-invalidate.
    this.things = things;
    this.cdr.markForCheck();
});
```

Behind the scenes:

- `ObserveProperty(propertyName)` is **lazy-created on first call** — engines whose properties are never observed pay zero runtime cost for the observable.
- `BehaviorSubject` semantics: subscribers receive the current array immediately on subscribe, then re-receive the same array reference on every mutation.
- The mutation triggers come from BaseEngine's built-in BaseEntity event handler — `DebounceIndividualBaseEntityEvent` → `ProcessEntityEvent` → either an in-place array mutation (when no `Filter`/`OrderBy`/`AdditionalLoading` are set, so MJ can safely splice) or a full refresh (when a filter is set so MJ can't determine whether the saved row still belongs). Either way, `emitPropertyChange(propertyName)` fires and the observable re-emits.
- `DataChange$: Observable<EngineDataChangeEvent>` is the engine-wide complement — emits one event per refresh with the config + new data.

**When to build a new engine vs. reuse an existing service**:

- ✅ **Build an engine** when (a) the entity set is small (a few hundred rows max, or filter-narrowable to that), (b) more than one surface needs the same data, and (c) you want UIs / runtime resolvers to auto-update when the data changes. Examples in the repo: `ConversationEngine`, `InteractiveFormsEngine`, `UserInfoEngine`, `KnowledgeHubMetadataEngine`, `ComponentMetadataEngine`.
- ❌ **Don't bulk-load** if the entity has a huge column (e.g., NVARCHAR(MAX) JSON, vector embeddings) AND no good filter exists to narrow the set — you'd poison `LocalCacheManager`'s memory budget. See `ComponentMetadataEngine`'s comment about deliberately omitting `MJ: Components` for that reason; `InteractiveFormsEngine` solves it by filtering to `Type='Form'` so only the form-role rows (small dataset) get cached.
- ❌ **Don't add an engine for one-off ad-hoc queries** — that's what `RunView`/`RunViews` is for. Engines are for entities consumed in many places.

### Engine Configuration

Each engine declares its data needs as `BaseEnginePropertyConfig` entries:

```typescript
export class BaseEnginePropertyConfig extends BaseInfo {
    EntityName?: string;           // Entity to load
    Filter?: string;               // Optional WHERE filter
    OrderBy?: string;              // Optional ORDER BY
    PropertyName!: string;         // Property name on engine class to populate
    AutoRefresh?: boolean;         // React to entity save/delete events
    DebounceTime?: number;         // Override debounce (default 1.5s)
    CacheLocal?: boolean;          // Use LocalCacheManager
    CacheLocalTTL?: number;        // Per-config TTL override (ms)
    ResultType?: 'simple' | 'entity_object'; // See note below — undefined → engine default
}
```

#### ResultType and EngineDefaultResultType

The `ResultType` per-config and the engine-wide `EngineDefaultResultType` getter together control whether `BaseEngine.LoadSingleEntityConfig` / `LoadMultipleEntityConfigs` request `'entity_object'` (full BaseEntity instances — slower, supports `.Save()`/`.Delete()`/dirty-tracking) or `'simple'` (plain JS objects — much faster, read-only).

Resolution order when `config.ResultType` is left undefined:

1. The engine subclass's `EngineDefaultResultType` getter (override per engine for a blanket policy)
2. The base getter, which returns `'entity_object'`

In other words, the effective default is `'entity_object'` — leaving `ResultType` undefined preserves the historical behavior. Engines that load purely read-only configuration data (where no caller will mutate the rows via `.Save()` / `.Delete()`) can override `EngineDefaultResultType` to skip BaseEntity construction across all their configs:

```typescript
export class MyReadOnlyEngine extends BaseEngine<MyReadOnlyEngine> {
    protected override get EngineDefaultResultType(): 'simple' | 'entity_object' {
        return 'simple'; // every config loads plain objects unless individually overridden
    }
    // ...
}
```

**Read-only contract for `'simple'`**: configs using `'simple'` should be considered read-only. The immediate-mutation path (`applyImmediateMutation`) operates on `BaseEntity[]` arrays — pushing or replacing with a real BaseEntity instance into a plain-object array would create a heterogeneous array. `canUseImmediateMutation` enforces this at runtime by returning `false` when the effective `ResultType` resolves to `'simple'`, forcing a full refresh on save/delete events instead. See [Immediate Mutation vs Debounced Refresh](#immediate-mutation-vs-debounced-refresh) below.

### Loading Flow with CacheLocal

The loading flow differs between server-side and client-side because of `TrustLocalCacheCompletely`:

#### Server-Side (MJAPI) — Cache Trusted Completely

On the server, cached data is returned immediately with **zero database queries**. The cache is guaranteed accurate by BaseEntity event-driven invalidation and Redis pub/sub.

```mermaid
sequenceDiagram
    participant Caller as Server Code / Engine
    participant PB as ProviderBase
    participant LCM as LocalCacheManager
    participant DB as Database

    Caller->>PB: RunView({CacheLocal: true, ...})
    PB->>LCM: GetRunViewResult(fingerprint)

    alt Cache Hit
        LCM-->>PB: Cached results (plain objects)
        PB->>PB: TransformSimpleObjectToEntityObject()
        PB-->>Caller: Instant response — zero DB queries
    else Cache Miss (first load)
        PB->>DB: Execute SQL query
        DB-->>PB: Raw results
        PB->>LCM: SetRunViewResult (cache plain objects)
        PB->>PB: TransformSimpleObjectToEntityObject()
        PB-->>Caller: Fresh results (now cached for next time)
    end
```

#### Client-Side (Browser) — Smart Cache Validation

In the browser, cached data is validated against the server via a lightweight check before being trusted:

```mermaid
sequenceDiagram
    participant UI as Angular Component
    participant Engine as BaseEngine
    participant LCM as LocalCacheManager
    participant Server as MJAPI (GraphQL)
    participant DB as Database

    UI->>Engine: engine.Config(false, user)
    Engine->>LCM: GetRunViewResult(fingerprint)

    alt Cache Hit (within TTL)
        Engine->>Server: RunViewsWithCacheCheck<br/>{maxUpdatedAt, rowCount}
        Server->>DB: SELECT MAX(__mj_UpdatedAt), COUNT(*)

        alt Data unchanged
            Server-->>Engine: status: 'current'
            Engine-->>UI: Use cache as-is
        else Data changed (differential)
            Server-->>Engine: status: 'differential' + delta
            Engine->>LCM: ApplyDifferentialUpdate
            Engine-->>UI: Merged results
        else Full refresh needed
            Server-->>Engine: status: 'stale' + full results
            Engine->>LCM: SetRunViewResult
            Engine-->>UI: Fresh results
        end
    else Cache Miss
        Engine->>Server: RunViews (full query)
        Server->>DB: SELECT * ...
        Server-->>Engine: Full results
        Engine->>LCM: SetRunViewResult
        Engine-->>UI: Fresh results
    end
```

#### Why Server-Side Can Trust the Cache

The server-side cache is kept in perfect sync through this chain:

1. **All writes go through BaseEntity** — `Save()` and `Delete()` fire MJGlobal events
2. **LocalCacheManager subscribes** to all BaseEntity events and updates/invalidates affected cached queries
3. **Redis pub/sub** (when configured) propagates changes across all MJAPI nodes
4. **No external writes bypass this** — in normal MJ operation, all DB mutations flow through BaseEntity

This eliminates the need for the lightweight `MAX(__mj_UpdatedAt)` + `COUNT(*)` validation query that client-side providers use. The result is that server-side engine loads (which happen frequently during MJAPI startup and on-demand) are served from cache with zero database overhead after the initial load.

#### Cache Serialization Order

The cache stores **plain JSON objects**, not BaseEntity instances. This is critical because BaseEntity objects contain RxJS `Subject` instances with circular subscriber references that cannot be serialized with `JSON.stringify`.

The processing order in `PostRunView` / `PostRunViews` is:
1. **Cache plain objects** via `LocalCacheManager.SetRunViewResult()` — before any transformation
2. **Transform to entity objects** via `TransformSimpleObjectToEntityObject()` — only if `ResultType === 'entity_object'`
3. **Run post-hooks** via `RunPostRunViewHooks()`

On cache read, `TransformSimpleObjectToEntityObject()` is called to restore BaseEntity instances from the cached plain objects when `ResultType === 'entity_object'`.

### Real-Time Array Updates (Event Handling)

When a `BaseEntity` is saved or deleted anywhere, BaseEngine reacts via MJGlobal events:

```typescript
// BaseEngine subscribes during LoadConfigs
this._eventListener = MJGlobal.Instance.GetEventListener(false);
this._eventListener.subscribe(async (event) => {
    if (event.event === MJEventType.ComponentEvent
        && event.eventCode === BaseEntity.BaseEventCode) {
        await this.HandleIndividualBaseEntityEvent(event.args);
    }
});
```

#### Immediate Mutation vs Debounced Refresh

**Immediate mutation** (synchronous, no server round-trip):
- Conditions checked by `canUseImmediateMutation(config)`:
  1. Config has no `Filter` (can't verify new/updated records match the filter)
  2. Config has no `OrderBy` (can't maintain sort order without full data)
  3. Effective `ResultType` is not `'simple'` (the in-memory array holds plain JS objects; pushing a BaseEntity instance from the event would create a heterogeneous array)
  4. Engine doesn't override `AdditionalLoading` (no post-processing dependencies)
- On `save` + `create`: push new entity to array
- On `save` + `update`: replace entity in array by primary key match
- On `delete`: splice entity from array by primary key match
- Syncs change to LocalCacheManager via `UpsertSingleEntity` / `RemoveSingleEntity`

**`skipAdditionalLoadingCheck` parameter**: Callers that invoke `AdditionalLoading()` themselves after applying mutations can pass `canUseImmediateMutation(config, true)` to skip the override check. This is used by `applyRemoteRecordData` which applies all config mutations first, then calls `AdditionalLoading()` once at the end.

**Debounced refresh** (server round-trip, 1.5s debounce):
- Used when immediate mutation isn't safe (filtered/sorted data, post-processing)
- Uses RxJS `Subject` per entity name with `debounceTime` operator
- Re-fetches from server via `LoadSingleConfig`

### DataChange$ Observable

After any array mutation (immediate or debounced), BaseEngine emits through `DataChange$`:

```typescript
// Components can subscribe for reactive updates
engine.DataChange$.subscribe(change => {
    if (change.configName === 'myConfig') {
        this.refreshGrid();
    }
});
```

### Remote Invalidation Handler

When a `remote-invalidate` event arrives (from another server via GraphQL subscription), the engine applies changes directly to its in-memory arrays — **no server round-trip needed** when the event includes record data:

```mermaid
flowchart TD
    A[remote-invalidate event arrives] --> B{action?}
    B -->|save + recordData| C[applyRemoteRecordData]
    B -->|delete + primaryKeyValues| D[applyRemoteDelete]
    B -->|missing data| E[Fallback: LoadSingleConfig]

    C --> F{canUseImmediateMutation?<br/>skipAdditionalLoadingCheck=true}
    F -->|Yes| G[Create BaseEntity from JSON<br/>LoadFromData]
    F -->|No: Filter/OrderBy| E
    G --> H[Find by PrimaryKey → replace<br/>or append to array]
    H --> I[AdditionalLoading + NotifyDataChange]

    D --> J[Parse CompositeKey from JSON]
    J --> K[Find by PrimaryKey.Equals → splice]
    K --> I

    E --> L[RunView from server<br/>updates cache naturally]
    L --> I
```

#### applyRemoteRecordData

For `save` events with record data, the engine creates a BaseEntity instance from the JSON, then upserts it into matching config arrays. This avoids a server round-trip entirely:

```typescript
// Event payload includes full record data as JSON
const payload = event.payload as RemoteInvalidatePayload;
// payload.recordData = '{"ID":"abc","Name":"Updated Name",...}'

// Engine creates entity, loads JSON, and mutates arrays directly
const entity = await md.GetEntityObject(entityName, contextUser);
entity.LoadFromData(JSON.parse(payload.recordData));

// Uses canUseImmediateMutation(config, true) — skips AdditionalLoading check
// because applyRemoteRecordData calls AdditionalLoading() itself after all mutations
```

#### applyRemoteDelete

For `delete` events, the engine parses the primary key values and removes matching records:

```typescript
// payload.primaryKeyValues = '[{"FieldName":"ID","Value":"abc"}]'
const targetKey = CompositeKey.FromKeyValuePairs(
    rawPairs.map(kv => new KeyValuePair(kv.FieldName, kv.Value))
);
// Finds record by entity.PrimaryKey.Equals(targetKey) and splices it out
```

#### Fallback Path

If direct apply fails (parse error, filtered config, etc.), the engine falls back to `LoadSingleConfig` which fetches fresh data from the server.

### On-Demand Engine Loading (Opting Out of Startup)

Most engines register with `@RegisterForStartup()` and load during the parallel startup batch managed by `StartupManager`. For engines whose data is large and only useful in narrow paths, that's wasted work — the dataset gets fetched, parsed, and cached even when nothing in the session will ever query it.

**`GeoDataEngine` is the canonical on-demand example**: country/state-province reference data plus pre-parsed polygon geometry for point-in-polygon resolution. The dataset is ~3,000+ rows with `BoundaryGeoJSON` blobs, and parsing the polygons takes ~3–4 s synchronously on the main thread. Most tenants never use map choropleth or geocoding.

The pattern:

1. **Drop `@RegisterForStartup`** from the engine. It will not auto-load.
2. **Document the caller contract** in the class JSDoc: callers must `await GeoDataEngine.Instance.Config(...)` before invoking sync lookup methods.
3. **Optionally short-circuit `Config()`** based on metadata. `GeoDataEngine.Config` checks whether any `EntityInfo.SupportsGeoCoding` is `true` and returns early if not — making the call near-free for tenants where no entity opts into geocoding, even when callers invoke it repeatedly.
4. **Update each caller** to await `Config()` once at its async entry point. `BaseEngine.Load` already dedups via `_loadingSubject` — concurrent callers share a single in-flight load, and post-load calls return immediately.

```typescript
// In GeoDataEngine.Config:
const entities = (provider ?? Metadata.Provider)?.Entities;
if (entities && !entities.some(e => e.SupportsGeoCoding)) {
    LogStatus('GeoDataEngine: no entities have SupportsGeoCoding=1 — skipping load');
    return;
}
// ... otherwise call super.Load(configs, ...)

// At the caller — gate the sync API behind one await:
public async SyncIfChanged(entity: BaseEntity, contextUser: UserInfo): Promise<GeocodeResult | null> {
    if (resolvedMappings.length === 0) return null;
    await GeoDataEngine.Instance.Config(false, contextUser); // idempotent + deduped
    // ... now safe to use GeoDataEngine.Instance.ResolveCountry() etc.
}
```

**Sync lookup methods stay sync** in this pattern — they're called *after* the awaited `Config()` returns. The empty-state behavior (maps not populated, all lookups return `undefined`) is the correct shape when no entity in the tenant has opted into the engine's domain — callers already handle the not-found case, so the empty engine is safe to leave in place.

When to use this pattern instead of startup loading:
- Dataset is large and most sessions don't need it
- Loading has a measurable main-thread cost (parsing, indexing, geometry building)
- A metadata flag (`SupportsGeoCoding`, `SupportsAuditLog`, etc.) cleanly indicates whether any caller will need it

When startup loading is still right:
- Dataset is small and lookups happen everywhere (e.g. `AIEngineBase`, `UserInfoEngine`)
- The first lookup happens in a hot path that can't easily await an async load (e.g. a synchronous render loop with no setup hook)

### Check the Registry Before You Query (MJ Convention)

The flip side of engines caching eagerly: **other code should reuse those caches instead of re-querying.** In any process that bootstraps via `StartupManager` (MJAPI, MJCLI commands, mj-sync), every `@RegisterForStartup` engine has already loaded its entities into memory before your code runs. A consumer that issues its own unfiltered `RunView` for one of those entities doubles the DB round trips and the RAM, and trips the `REDUNDANT DATA LOADING` warning from `BaseEngineRegistry`'s load tracking.

`BaseEngineRegistry` (in `@memberjunction/core`) provides the reverse lookup:

```typescript
import { BaseEngineRegistry } from '@memberjunction/core';

// "Best cache or null" — the common one-liner
const rows = BaseEngineRegistry.Instance.TryGetCachedRecords<UserInfo>('Users', { unfilteredOnly: true });
if (rows) { /* serve from memory */ } else { /* RunView fallback */ }

// Full matches — when you need to vet the donor's config before trusting it
const matches = BaseEngineRegistry.Instance.FindCachedEntity('MJ: AI Prompts', { unfilteredOnly: true });
```

`FindCachedEntity` returns, per loaded engine that caches the entity: the engine instance, the full `BaseEnginePropertyConfig` that produced the cache, and a **live reference** to the cached array (unfiltered full-set caches sort first).

**Vetting a donor.** Treat a match as the authoritative full set only when all of these hold:

1. **`unfilteredOnly: true`** — a `Filter` means a subset, useless as a full cache.
2. **No `OrderBy`** on the config — ordered configs fail `canUseImmediateMutation` (see [Immediate Mutation vs Debounced Refresh](#immediate-mutation-vs-debounced-refresh)), so the donor responds to entity events with a full refresh that **reassigns** the array property. If your usage outlives a single tick, resolve the array per-access via donor engine + `config.PropertyName` rather than capturing the reference.
3. **`ResultType` is not `'simple'`** (and `records[0] instanceof BaseEntity` when rows exist) — required if you'll call `.Get()` / `.PrimaryKey` / `.Save()` on the rows.
4. **Not yourself** — guard `match.engine === this` so an engine's own slot from a prior run can't masquerade as a donor.

**The returned array is the donor's live array — read it, don't mutate it.** For unfiltered/unordered/`entity_object` configs the donor's BaseEntity event subscription keeps the array current on save/delete automatically (see [Real-Time Array Updates](#real-time-array-updates-event-handling)), so a live reference stays fresh for free. Writing into a donor's array requires understanding both sides' dedup semantics — `SyncMetadataEngine` in `@memberjunction/metadata-sync` is the correctly-engineered exception and the reference implementation: its `delegateEntityIfCached()` partitions a dynamic entity set into "delegate to a donor" vs. "self-load", resolves donor arrays per-access, and PK-dedups its writes against the donor's event handler.

**Why this is a convention, not a one-off optimization**: donors are discovered dynamically at runtime. Consumers get faster automatically as new engines ship — no version coupling, no hardcoded donor lists. When no engine caches the entity, the lookup returns empty and the consumer falls back to its own `RunView`/`Load`, so adoption is always graceful.

The same convention is summarized in the repo root [CLAUDE.md](../CLAUDE.md) under "Check the Registry Before You Query".

### LocalCacheManager Independent Event Handling

LocalCacheManager subscribes to the **same** `remote-invalidate` MJGlobal events independently from BaseEngine. It handles its own RunView cache updates without coordination:

```mermaid
flowchart LR
    A[GraphQL Subscription<br/>remote-invalidate] -->|MJGlobal event| B[BaseEngine<br/>in-memory arrays]
    A -->|MJGlobal event| C[LocalCacheManager<br/>RunView caches]
```

- **Save with recordData**: Looks up entity PK fields from `Metadata`, builds `CompositeKey` from the record data, and calls `UpsertSingleEntity` on all matching unfiltered fingerprints. Filtered fingerprints are invalidated.
- **Delete with primaryKeyValues**: Parses the `CompositeKey` from JSON and calls `RemoveSingleEntity` on all matching fingerprints.
- **Missing data or error**: Falls back to `InvalidateRunViewResult` for each fingerprint.

This separation means engines don't need to worry about cache sync — LocalCacheManager is self-contained.

---

## Smart Cache Validation (RunViewsWithCacheCheck)

> **Important**: Smart cache validation is used **only by client-side providers** (e.g., `GraphQLDataProvider` in the browser). Server-side providers (`SQLServerDataProvider`, `PostgreSQLDataProvider`) skip this entirely and trust the cache completely — see [Server-Side vs Client-Side Cache Behavior](#server-side-vs-client-side-cache-behavior) above.

When `CacheLocal` is enabled on a **client-side provider**, MemberJunction uses a **smart cache check** protocol to minimize data transfer between client and server.

```mermaid
sequenceDiagram
    participant Client as Browser
    participant Server as MJAPI
    participant DB as Database

    Client->>Server: RunViewsWithCacheCheck<br/>{params, cacheStatus: {maxUpdatedAt, rowCount}}

    Server->>DB: SELECT MAX(__mj_UpdatedAt), COUNT(*)<br/>WHERE [same filter]

    alt maxUpdatedAt matches AND rowCount matches
        Server-->>Client: status: 'current'
        Note over Client: Use cached data.<br/>Zero data transfer.
    else rowCount changed significantly
        Server->>DB: SELECT * WHERE [same filter]
        Server-->>Client: status: 'stale', results: [full data]
        Note over Client: Replace cache entirely.
    else Only some rows changed (maxUpdatedAt differs, rowCount close)
        Server->>DB: SELECT * WHERE __mj_UpdatedAt > cachedMaxUpdatedAt
        Server-->>Client: status: 'differential'<br/>{updatedRows, deletedRecordIDs}
        Note over Client: Merge changes into cache.
    end
```

### How the Server Decides

1. **`current`**: Server's `MAX(__mj_UpdatedAt)` matches client's `maxUpdatedAt` AND `COUNT(*)` matches client's `rowCount` → nothing changed
2. **`differential`**: Timestamps differ but row count is close → fetch only rows updated after `maxUpdatedAt`, plus check for deletions
3. **`stale`**: Row count changed significantly or no valid cache status → full refresh

### Benefits

| Response Type | Data Transfer | Use Case |
|---------------|---------------|----------|
| `current` | **Zero** (just status) | Data hasn't changed since last load |
| `differential` | **Minimal** (only changed rows) | A few records were updated |
| `stale` | **Full dataset** | Many changes or first load |

For engines that load metadata tables with hundreds of rows that rarely change, the `current` response dramatically reduces server load and network traffic.

### Server-Side Pre-Check for RunViewsWithCacheCheck

When a `RunViewsWithCacheCheck` request arrives at the server, the server checks its own `LocalCacheManager` **before** hitting the database — even for the lightweight `MAX/COUNT` validation query. This is a four-phase pipeline:

```mermaid
flowchart TD
    A["Client sends RunViewsWithCacheCheck<br/>(N items, some with cacheStatus)"] --> B["Phase 1: Items WITH cacheStatus<br/>Check server LocalCacheManager"]

    B --> C{Server cache hit?}
    C -->|"Hit + maxUpdatedAt/rowCount match"| D["Return status: 'current'<br/>Zero DB queries"]
    C -->|"Hit but stale"| E["Serve from server cache<br/>(client will get fresh data)"]
    C -->|Miss| F["Phase 2: DB validation<br/>(only for server cache misses)"]

    F --> G["SELECT MAX, COUNT<br/>Compare with client cacheStatus"]

    A --> H["Phase 3: Items WITHOUT cacheStatus<br/>(empty client cache)"]
    H --> I{Server cache hit?}
    I -->|Hit| J["Serve from server cache<br/>Zero DB queries"]
    I -->|Miss| K["Phase 4: Full DB query<br/>Store result in server cache"]
```

This means:
- **Second client connecting** with an empty cache gets all data from server cache — zero DB queries
- **Returning client** with valid cache gets `status: 'current'` — zero DB queries and zero data transfer
- Only genuinely new queries (never seen before) hit the database

---

## Client-Side Fast-Start & Pre-Validation

Smart cache validation eliminates almost all data transfer on warm loads, but it still costs one round-trip per `RunViews` call. During app startup, dozens of engines fire in parallel — each making its own `RunViewsWithCacheCheck` request — which adds up to noticeable TTI on the warm path. **Fast-start** is a deterministic optimization that lets engines trust their local IndexedDB caches *without* per-view smart-cache-check round-trips, gated by a single pre-validation step before engines run.

### The Two-Tier Cache for Client-Side Startup

A client-side provider holds two distinct caches in browser storage:

| Cache | What | Backend | Purpose |
|---|---|---|---|
| **Framework metadata** | `AllMetadata` (entity definitions, fields, applications, etc.) | IndexedDB (gzip-compressed) | Powers `Metadata.Provider.Entities`, `entity.Fields`, etc. — needed before any engine can resolve a view |
| **Engine view results** | Per-`RunView` row sets, keyed by fingerprint | IndexedDB (uncompressed) | What each engine's `CacheLocal: true` config consumes |

Both are loaded at the start of `provider.Config()`. The framework metadata cache is a single-blob round-trip; the engine view caches are loaded lazily by each engine's `RunViews` call. **Fast-start is the policy that decides whether to trust those engine view caches without a server round-trip during the initial load.**

### The Fast-Start Window

Fast-start is controlled by two flags on `ProviderBase`:

```typescript
public static FastStartupMode: boolean = true;       // master switch
private static _fastStartupConsumed = false;          // closes the window after startup
```

While the window is open (`FastStartupMode === true && !_fastStartupConsumed`), `PreRunViews` short-circuits the smart-cache-check path: if **all** params have an entry in `LocalCacheManager`, the cached results are returned without contacting the server. If any param is missing, fast-start falls through to the normal smart-cache-check path for that batch.

The window is closed by `ProviderBase.ConsumeFastStartupMode()`, which `StartupManager.Startup()` calls after every registered engine has reported in. After that point, all subsequent `RunViews` calls go through normal smart-cache-check.

### Pre-Validation: Making Fast-Start Deterministic

Trusting the cache without server validation is only safe if we know nothing has changed since this client last loaded. That's what `preValidateAndRefresh` does — one batched timestamp round-trip *before* engines fire:

```mermaid
sequenceDiagram
    participant App as setupGraphQLClient
    participant Provider as GraphQLDataProvider
    participant Server as MJAPI
    participant SM as StartupManager
    participant Engines as Registered Engines

    App->>Provider: Config(config)
    Provider->>Provider: LoadLocalMetadataFromStorage<br/>(IndexedDB → decompress → parse)
    Provider-->>App: Metadata loaded from cache

    App->>Provider: preValidateAndRefresh()
    Provider->>Server: GetLatestMetadataUpdates<br/>(timestamp + rowCount per entity)
    Server-->>Provider: Latest timestamps

    alt Local timestamps current
        Provider-->>App: Fast-start engaged ⚡
    else Local timestamps stale
        Provider->>Server: GetAllMetadata (full refresh)
        Server-->>Provider: Fresh metadata
        Provider->>Provider: ConsumeFastStartupMode()<br/>(disable fast-start)
        Provider-->>App: Engines will smart-cache-check
    end

    App->>SM: Startup()
    SM->>Engines: Config() in parallel
    Note over Engines: If fast-start engaged: trust IndexedDB caches<br/>If disabled: smart-cache-check per RunViews
    SM->>Provider: ConsumeFastStartupMode() after all engines complete
```

**Cost on the warm-current path**: one batched timestamp fetch (~50–200 ms depending on RTT). Far less than the savings from skipping per-view smart-cache-checks across dozens of engines.

**Cost on the warm-stale path**: pre-validation triggers a full metadata refresh (`GetAllMetadata`) and disables fast-start, so engines fall through to smart-cache-check. This is slower than the cached-current path but eliminates any window in which stale data could be served to the UI.

**On pre-validation failure** (network error, server unreachable): fast-start is disabled defensively — engines fall through to smart-cache-check rather than trusting potentially-stale local caches against an unknown server state.

### The Metadata Cache: gzip on IndexedDB

The framework metadata blob is large — 6–10 MB of JSON for a typical tenant. `SaveLocalMetadataToStorage` compresses it via the native `CompressionStream('gzip')` API before writing to IndexedDB; the compressed blob is base64-encoded for storage and decompressed via `DecompressionStream('gzip')` on read. Compression takes ~50–150 ms on a modern desktop, decompression ~30–80 ms.

**Why compress?** The savings come primarily from `JSON.parse` time on cold/warm load. Parsing a ~1 MB string is dramatically faster than parsing the raw 10 MB string — and `JSON.parse` is a synchronous main-thread operation, so this directly affects TTI. Secondary benefits include faster IndexedDB reads and better headroom on storage-constrained devices (iOS Safari, mobile).

A fallback path serializes uncompressed (`'json'`) when `CompressionStream` is unavailable. The format is recorded in a separate IndexedDB key (`localStorageFormatKey`) so the load path can pick the right deserialization branch.

> **Naming note**: The provider interface and storage keys use names like `LocalStorageProvider`, `_localStorageProvider`, and `localStorageRootKey`. **The actual backend in browsers is IndexedDB**, not browser localStorage — see `BrowserIndexedDBStorageProvider` in `GraphQLDataProvider`. The naming predates the IndexedDB switch and is kept for backwards compatibility.

Every metadata access reads from the in-memory `_localMetadata` object (held on the provider instance for the session lifetime), so decompress/parse only run once per cold load — not per access.

### Per-Item Failure Tolerance in Metadata Deserialization

`MetadataFromSimpleObject` deserializes the cached metadata into typed `EntityInfo` / `ApplicationInfo` / etc. instances. A single corrupt or shape-incompatible row (from an old cache after a schema change, for example) used to throw and void the entire local cache. The deserializer now catches per-item errors, logs them, and continues — partial metadata is preferred over no metadata, since the next `backgroundValidateAndRefresh` will repair it.

### Tying It Together: setupGraphQLClient

```typescript
export async function setupGraphQLClient(config: GraphQLProviderConfigData): Promise<GraphQLDataProvider> {
    const provider = new GraphQLDataProvider();
    SetProvider(provider);

    await provider.Config(config);                  // loads IndexedDB metadata cache

    await provider.preValidateAndRefresh();         // one timestamp round-trip;
                                                    // refreshes + disables fast-start if stale

    MJGlobal.Instance.RaiseEvent({ event: MJEventType.LoggedIn, ... });
    await StartupManager.Instance.Startup();        // engines fire in parallel — fast-start
                                                    // engaged or not based on pre-validation

    return provider;
}
```

`StartupManager.Startup` calls `ProviderBase.ConsumeFastStartupMode()` itself once every engine has reported in, closing the window.

### When Fast-Start Helps vs. Doesn't

| Scenario | Behavior | Outcome |
|---|---|---|
| Cold load (no IndexedDB cache) | All engines hit cache misses | Fast-start can't engage — normal smart-cache-check populates caches |
| Warm load, framework metadata current | Pre-validation succeeds, fast-start engaged | Engines trust caches, ~zero round-trips during startup |
| Warm load, framework metadata stale | Pre-validation refreshes + disables fast-start | Engines smart-cache-check per view, picking up any stale entries |
| Pre-validation fails (network error) | Fast-start disabled defensively | Engines smart-cache-check; if those also fail, normal error handling kicks in |

---

## Server-Side Opportunistic Cache (All RunView/RunViews Calls)

Beyond the explicit `CacheLocal` and `RunViewsWithCacheCheck` paths, the server **opportunistically checks** its `LocalCacheManager` for **every** `RunView`/`RunViews` call — even when `CacheLocal` is not set by the caller.

### How It Works

On the server (`TrustLocalCacheCompletely = true`), `PreRunView` and `PreRunViews` check the cache for a matching fingerprint regardless of the `CacheLocal` flag. If the data exists in cache (put there by engines, `RunViewsWithCacheCheck`, or auto-cache), it's returned immediately with zero DB queries.

```mermaid
flowchart TD
    A["GraphQL RunViewsQuery arrives<br/>(no CacheLocal flag)"] --> BA{"BypassCache?"}
    BA -->|Yes| H["Execute DB query<br/>(skip all caching)"]
    BA -->|No| B["ProviderBase.PreRunView"]
    B --> C{"TrustLocalCacheCompletely<br/>AND cache initialized?"}
    C -->|No| D["Skip cache check<br/>(client-side behavior)"]
    C -->|Yes| E["Generate fingerprint<br/>Check LocalCacheManager"]
    E --> F{Cache hit?}
    F -->|Yes| G["Return cached data<br/>Zero DB queries ✅"]
    F -->|No| H
    H --> I{"shouldAutoCache?<br/>(small + unfiltered<br/>+ NOT BypassCache)"}
    I -->|Yes| J["Store in cache<br/>for future hits 📦"]
    I -->|No| K["Return without caching"]
```

### Important Distinction: Read vs Write

| Operation | Condition | Behavior |
|-----------|-----------|----------|
| **Cache Read** (check before DB) | `TrustLocalCacheCompletely` is true | Always checks — if data is there, serve it |
| **Cache Write** (store after DB) | `CacheLocal` is explicitly set, OR auto-cache criteria met | Selective — only stores when intent is clear or data is safe to cache |

This asymmetry is intentional:
- **Reading** from cache is always safe — if data is there, it's guaranteed fresh by BaseEntity event invalidation
- **Writing** to cache must be selective to avoid memory bloat from large ad-hoc queries (e.g., 10K customer rows browsed in a grid)

### Auto-Cache for Small Reference Data

When a `RunView` result meets all of the following criteria, it's automatically stored in the server cache even without an explicit `CacheLocal` flag:

| Criterion | Why |
|-----------|-----|
| `TrustLocalCacheCompletely` is true | Server-side only |
| Result is successful | Don't cache errors |
| Row count ≤ `ServerAutoCacheMaxRows` (default: 250) | Small reference/lookup data |
| No `ExtraFilter` | Unfiltered queries are safe for in-place upsert |
| No `OrderBy` | Unsorted queries don't need sort-order maintenance |

```typescript
// Configurable threshold (on ProviderBase)
ProviderBase.ServerAutoCacheMaxRows = 250;  // default
```

**Why unfiltered + unsorted only?**

When a BaseEntity is saved or deleted, `LocalCacheManager` must update all cached fingerprints for that entity. For **unfiltered** caches, it can safely do an in-place upsert or removal — the record always belongs in the result set. For **filtered** caches, it cannot evaluate arbitrary SQL predicates (which may include subqueries, functions, JOINs, etc.), so it must conservatively **invalidate** the entire cached result. Similarly, **sorted** caches would need SQL-compatible sort evaluation to maintain correct order.

```mermaid
flowchart TD
    A["BaseEntity.Save() fires event"] --> B["LocalCacheManager receives event"]
    B --> C["Find all cached fingerprints<br/>for this entity"]
    C --> D{isFilteredFingerprint?}
    D -->|"No (filter = '_' or empty)"| E["UpsertSingleEntity<br/>In-place update ✅"]
    D -->|"Yes (has ExtraFilter)"| F["InvalidateRunViewResult<br/>Blow away cache entry 🗑️"]
    F --> G["Next request repopulates<br/>from database"]
```

By limiting auto-cache to unfiltered+unsorted results, we guarantee that **every auto-cached entry can be maintained in-place** without ever serving stale data.

### Examples of What Gets Auto-Cached

| Query | Rows | Auto-Cached? | Why |
|-------|------|-------------|-----|
| `RunView('Roles')` | 15 | Yes | Small, no filter, no sort |
| `RunView('Entity Fields')` | 200 | Yes | Under threshold, no filter |
| `RunView('Users', filter: "Status='Active'")` | 50 | No | Has ExtraFilter |
| `RunView('Customers')` | 5,000 | No | Exceeds threshold |
| `RunView('AI Models', orderBy: 'Name')` | 12 | No | Has OrderBy |

### BypassCache: Per-Query Cache Override

The `BypassCache` parameter on `RunViewParams` provides a per-query escape hatch that skips **all** server-side caching — both the `PreRunView` cache check (read) and the post-query auto-cache storage (write). The query always hits the database and the result is never stored in cache.

```typescript
// Always hits the database, even if cached results exist for this fingerprint
const result = await rv.RunView({
    EntityName: 'Members',
    ExtraFilter: 'State IS NOT NULL',
    BypassCache: true,
    IgnoreMaxRows: true
});
```

**When to use `BypassCache`:**

| Scenario | Why |
|----------|-----|
| Maintenance/audit actions | Need to find records inserted via direct SQL that bypassed `BaseEntity.Save()` and its cache invalidation events |
| Scheduled geocoding | Must detect records missing from `RecordGeoCode` that were bulk-imported outside the normal save pipeline |
| Data validation jobs | Need ground-truth DB state, not potentially stale cached data |
| One-time migration scripts | Temporary queries that shouldn't pollute the cache |

**How it differs from `CacheLocal`:**

| Parameter | Controls | Default | Purpose |
|-----------|----------|---------|---------|
| `CacheLocal` | Opt-IN to caching | `false` | "I want this query's results cached for faster subsequent calls" |
| `BypassCache` | Opt-OUT of all caching | `false` | "I need true DB state regardless of what's in cache" |

Both can coexist — `BypassCache: true` takes precedence and skips all caching even if `CacheLocal: true` is also set.

---

## Cross-Server Synchronization (Redis)

In multi-server deployments, Redis pub/sub ensures all MJAPI instances have consistent cache state.

```mermaid
sequenceDiagram
    participant ExA as MJExplorer-A
    participant SrvA as MJAPI-A
    participant Redis as Redis
    participant SrvB as MJAPI-B
    participant ExB as MJExplorer-B

    ExA->>SrvA: entity.Save()
    SrvA->>SrvA: LocalCacheManager updates cache
    SrvA->>Redis: PUBLISH mj:__pubsub__<br/>{CacheKey, Action:'set', SourceServerId:'A'}

    Note over SrvA: Self-message filter:<br/>Server-A ignores its own pub/sub

    Redis->>SrvB: SUBSCRIBE receives message
    SrvB->>SrvB: Filters: SourceServerId != myUUID ✓
    SrvB->>SrvB: OnCacheChanged callback fires
    SrvB->>SrvB: LocalCacheManager.DispatchCacheChange()
    SrvB->>SrvB: Invalidates/updates cached data
```

### Self-Message Filtering

Each MJAPI instance has a unique `ProcessUUID` (from `MJGlobal.Instance.ProcessUUID`). When publishing to Redis, the server includes its ProcessUUID as `SourceServerId`. When receiving pub/sub messages, the handler skips messages where `SourceServerId` matches the local ProcessUUID:

```typescript
// In Redis subscriber callback
if (message.SourceServerId === MJGlobal.Instance.ProcessUUID) {
    return; // Skip our own messages
}
```

### DispatchCacheChange / OnCacheChanged

The Redis provider exposes an `OnCacheChanged` callback that fires when remote changes are received:

```typescript
// Wired in MJServer index.ts
redisProvider.OnCacheChanged = (event) => {
    const entityName = event.CacheKey?.split('|')[0];
    if (entityName) {
        // Publish to GraphQL subscribers (for browser notification)
        PubSubManager.Instance.Publish(CACHE_INVALIDATION_TOPIC, {
            entityName,
            action: event.Action || 'save',
            sourceServerId: event.SourceServerId || 'unknown',
            originSessionId: null, // Remote events have no session
            timestamp: new Date(),
        });
    }
};
```

---

## Server-to-Browser Synchronization (GraphQL Subscriptions)

The final piece: pushing cache invalidation events from MJAPI servers to connected browser clients via GraphQL WebSocket subscriptions.

### The CACHE_INVALIDATION Subscription

**Server side** (`CacheInvalidationResolver.ts`):

```graphql
type Subscription {
    cacheInvalidation: CacheInvalidationNotification!
}

type CacheInvalidationNotification {
    EntityName: String!
    PrimaryKeyValues: String       # JSON array of {FieldName, Value} pairs (CompositeKey)
    Action: String!                # 'save' or 'delete'
    SourceServerID: String!        # ProcessUUID of originating server
    OriginSessionID: String        # Session of the user who made the change (nullable)
    Timestamp: Timestamp!
    RecordData: String             # Full entity data as JSON (save events only)
}
```

This is a **broadcast subscription** — no filtering by session. Every connected browser receives every event. Filtering happens client-side.

**RecordData**: For `save` events, the server includes the full entity record as JSON (`entity.GetAll()`). This allows browsers to update their in-memory arrays and caches directly — **no server round-trip needed**. For `delete` events, `RecordData` is omitted (only the primary key values are needed to remove the record).

### Two Publish Paths

| Path | Trigger | OriginSessionID | Scenario |
|------|---------|-----------------|----------|
| **Local** | ResolverBase after save/delete | Set to `userPayload.sessionId` | Single-server + multi-server |
| **Remote** | Redis OnCacheChanged callback | `null` | Multi-server only |

### Session-Based Deduplication

The originating browser already knows about its own save via the local MJGlobal event. To prevent a redundant server-side re-fetch:

```typescript
// In GraphQLDataProvider.SubscribeToCacheInvalidation()
next: (data) => {
    const event = data?.cacheInvalidation;
    if (!event) return;

    // Skip events from our own session
    if (event.OriginSessionID && event.OriginSessionID === this.sessionId) {
        console.log(`Skipping self-originated cache invalidation for "${event.EntityName}"`);
        return;
    }

    // Raise MJGlobal event for both BaseEngine and LocalCacheManager to handle
    const baseEntityEvent: BaseEntityEvent = {
        type: 'remote-invalidate',
        entityName: event.EntityName,
        baseEntity: null,
        payload: {
            primaryKeyValues: event.PrimaryKeyValues,
            action: event.Action,            // 'save' or 'delete'
            sourceServerId: event.SourceServerID,
            timestamp: event.Timestamp,
            recordData: event.RecordData,    // Full entity JSON for saves (undefined for deletes)
        },
    };
    MJGlobal.Instance.RaiseEvent({
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        args: baseEntityEvent,
        component: this,
    });
}
```

### Client-Side Wiring

The subscription is automatically established during MJExplorer initialization:

```
Auth → initializeGraphQL() → setupGraphQLClient()
                            → SubscribeToCacheInvalidation()
```

### BaseEntityEvent Extended Type

The `remote-invalidate` event type was added to `BaseEntityEvent` to support cross-server invalidation:

```typescript
type: 'new_record' | 'save' | 'delete' | 'load_complete' | 'transaction_ready'
    | 'save_started' | 'delete_started' | 'load_started'
    | 'remote-invalidate'  // Cross-server cache invalidation
    | 'other';

baseEntity: BaseEntity | null;  // null for remote-invalidate (no local entity)
entityName?: string;            // Entity name (used when baseEntity is null)
payload?: RemoteInvalidatePayload;  // Included for remote-invalidate events
```

The `RemoteInvalidatePayload` interface:

```typescript
export interface RemoteInvalidatePayload {
    primaryKeyValues: string | null;  // JSON array of {FieldName, Value} pairs
    action: 'save' | 'delete';       // What happened to the entity
    sourceServerId: string;           // Which server originated the change
    timestamp: string;                // When the change occurred
    recordData?: string;              // Full entity JSON (save events only)
}
```

### Reactive Dashboard Pattern

Angular components can subscribe to MJGlobal events to react in real-time when data changes on other browsers/servers:

```typescript
@Component({ ... })
export class ModelManagementComponent implements OnDestroy {
    private destroy$ = new Subject<void>();

    ngOnInit() {
        // Subscribe to cache invalidation events
        MJGlobal.Instance.GetEventListener(false).pipe(
            takeUntil(this.destroy$),
            filter(e => e.event === MJEventType.ComponentEvent
                     && e.eventCode === BaseEntity.BaseEventCode),
            filter(e => {
                const entityEvent = e.args as BaseEntityEvent;
                return entityEvent.type === 'remote-invalidate'
                    && entityEvent.entityName === 'MJ: AI Models';
            }),
            // Small delay to let BaseEngine finish its array mutation
            delay(500),
        ).subscribe(() => {
            // Re-read from engine's in-memory arrays (already updated)
            this.Models = AIEngineBase.Instance.Models;
            this.cdr.detectChanges();
        });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
```

This pattern gives **instant UI updates** with zero network calls — the engine's arrays are already mutated by the time the component reads them.

---

## Deployment Topologies

### What Works With and Without Redis

| Feature | No Redis | With Redis |
|---------|----------|------------|
| **L1 cache** (BaseEngine in-memory arrays) | Yes | Yes |
| **L2 cache** (IndexedDB/localStorage in browser) | Yes | Yes |
| **L3 cache** (server-side persistent cache) | In-memory only (lost on restart) | Persistent across restarts |
| **Same-browser instant updates** (local MJGlobal events) | Yes | Yes |
| **Cross-browser updates** (same server, GraphQL subscription) | Yes | Yes |
| **Cross-server updates** (multiple MJAPI instances) | **No** | Yes |
| **Zero round-trip remote updates** (RecordData in subscription) | Yes | Yes |
| **Session deduplication** (originating browser skips own events) | Yes | Yes |

**Key takeaway**: Redis is only required for **multi-server coordination**. A single MJAPI instance gets real-time cross-browser push updates, session deduplication, zero-round-trip cache updates, and composite key support — all without Redis.

### Single Server, No Redis (Default)

```mermaid
graph TD
    subgraph "Browser A (saves)"
        BA_Engine[BaseEngine] -->|Local MJGlobal| BA_Engine
    end

    subgraph "Browser B (other user)"
        BB_Engine[BaseEngine]
    end

    subgraph "MJAPI"
        Server[ResolverBase]
        Server -->|"CACHE_INVALIDATION + RecordData<br/>GraphQL WS"| BB_Engine
        Server -->|"CACHE_INVALIDATION<br/>WS + skip (same session)"| BA_Engine
    end
```

- Browser A updates instantly via local MJGlobal events (no network call)
- Browser B receives `CACHE_INVALIDATION` with `RecordData` via WebSocket
- Browser B's BaseEngine applies the record data directly to arrays — **zero server round-trip**
- Browser B's LocalCacheManager updates its RunView caches independently
- No Redis required — works out of the box
- Server uses InMemoryLocalStorageProvider (cache lost on restart)

### Single Server, With Redis

Same as above, plus:
- Redis provides persistent L3 cache that survives server restarts
- Cache data shared across worker processes (if using cluster mode)
- Foundation for future scale-out to multiple servers
- To enable: set `REDIS_URL` in `.env` (e.g., `REDIS_URL=redis://localhost:6379`)

### Multi-Server, With Redis

```mermaid
graph TD
    subgraph "Browser A → MJAPI-A"
        BA[Browser A] --> SA[MJAPI-A]
        BC[Browser C] --> SA
    end

    subgraph "Browser B → MJAPI-B"
        BB[Browser B] --> SB[MJAPI-B]
    end

    SA <-->|Redis Pub/Sub| Redis[(Redis)]
    SB <-->|Redis Pub/Sub| Redis

    SA -->|"GraphQL WS + RecordData"| BA
    SA -->|"GraphQL WS + RecordData"| BC
    SB -->|"GraphQL WS + RecordData"| BB
```

- Browser A saves → MJAPI-A handles locally + publishes to Redis
- MJAPI-B receives via Redis → publishes CACHE_INVALIDATION (with RecordData) to Browser B
- Browser B applies changes directly — **no round-trip back to MJAPI-B**
- MJAPI-A publishes CACHE_INVALIDATION to Browser C (same server, different user)
- Browser A skips the notification (OriginSessionID match)

### Load-Balanced Multi-Server

```mermaid
graph TD
    LB[Load Balancer] --> SA[MJAPI-A]
    LB --> SB[MJAPI-B]
    LB --> SC[MJAPI-C]

    SA <--> Redis[(Redis)]
    SB <--> Redis
    SC <--> Redis

    SA -->|WebSocket| Browsers_A[Connected Browsers]
    SB -->|WebSocket| Browsers_B[Connected Browsers]
    SC -->|WebSocket| Browsers_C[Connected Browsers]
```

All servers share cache state via Redis. All browsers get real-time updates via their server's WebSocket. The system is horizontally scalable — add more MJAPI instances behind the load balancer as traffic grows. Record data flows through Redis pub/sub → GraphQL subscription → direct array mutation — no extra round-trips at any tier.

**Important**: WebSocket connections are sticky (a browser stays connected to the same MJAPI instance for the duration of its session). The load balancer should be configured for WebSocket support (e.g., HAProxy with `option http-server-close`).

---

## PubSubManager

`PubSubManager` is a server-side singleton that holds a reference to the type-graphql `PubSubEngine`, allowing any code (not just resolvers) to publish GraphQL subscription events.

### Why It Exists

The standard type-graphql pattern injects `@PubSub() pubSub: PubSubEngine` into resolver methods. But cache invalidation events originate from:
- Redis pub/sub callbacks (outside resolver context)
- MJGlobal event handlers (outside resolver context)
- ResolverBase after save/delete (has access but uses PubSubManager for consistency)

### Usage

```typescript
import { PubSubManager, CACHE_INVALIDATION_TOPIC } from '@memberjunction/server';

// Publish from anywhere in server code
PubSubManager.Instance.Publish(CACHE_INVALIDATION_TOPIC, {
    entityName: 'Users',
    action: 'save',
    sourceServerId: MJGlobal.Instance.ProcessUUID,
    originSessionId: null,  // null for remote events, sessionId for local
    timestamp: new Date(),
});
```

### Server Startup Wiring

```typescript
// In MJServer index.ts
import { PubSub } from 'graphql-subscriptions';

const pubSub = new PubSub();
PubSubManager.Instance.SetPubSubEngine(pubSub);

// Pass to type-graphql schema builder
const schema = buildSchemaSync({
    resolvers: [...],
    pubSub,
    validate: false,
});
```

---

## Cache Statistics and Monitoring

LocalCacheManager provides comprehensive statistics for monitoring and debugging.

### GetStats()

```typescript
const stats = LocalCacheManager.Instance.GetStats();
// Returns:
{
    totalEntries: number;       // Total cached items
    totalSizeBytes: number;     // Total cache size
    byType: {
        runview: { count: number; sizeBytes: number };
        runquery: { count: number; sizeBytes: number };
        dataset: { count: number; sizeBytes: number };
    };
    oldestEntry: number;        // Timestamp of oldest entry
    newestEntry: number;        // Timestamp of newest entry
    hits: number;               // Total cache hits
    misses: number;             // Total cache misses
}
```

### GetHitRate()

```typescript
const hitRate = LocalCacheManager.Instance.GetHitRate();
// Returns percentage (0-100) of cache hits vs total lookups
```

### GetAllEntries()

```typescript
const entries = LocalCacheManager.Instance.GetAllEntries();
// Returns array of CacheEntryInfo for all cached items
// Useful for building cache management dashboards
```

### Per-Entry Status

```typescript
// Check cache status for a specific RunView fingerprint
const status = LocalCacheManager.Instance.GetRunViewCacheStatus(fingerprint);
// Returns: { maxUpdatedAt: string, rowCount: number } | null
```

---

## Configuration Reference

### LocalCacheManager Defaults

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Master switch for caching |
| `maxSizeBytes` | 50 MB | Maximum cache size before eviction |
| `maxEntries` | 1,000 | Maximum number of cached results |
| `defaultTTLMs` | 300,000 (5 min) | Time-to-live for cached entries |
| `evictionPolicy` | `'lru'` | Eviction strategy: `lru`, `lfu`, or `fifo` |

### ProviderBase Server-Side Cache

| Setting | Default | Description |
|---------|---------|-------------|
| `ServerAutoCacheMaxRows` | 250 | Max row count for auto-caching unfiltered RunView results (0 = disabled) |
| `DedupLingerMs` | 5,000 ms | How long resolved RunViews results stay available for instant replay |

### ProviderBase Client-Side Fast-Start

| Setting | Default | Description |
|---------|---------|-------------|
| `FastStartupMode` (static) | `true` | Master switch for the fast-start window. When false, engines always go through smart-cache-check on warm loads. |
| `MinRefreshCheckIntervalMs` (static) | varies | Minimum gap between successive `CheckToSeeIfRefreshNeeded` calls — prevents the pre-validation timestamp fetch from being fired repeatedly within a short window. |

### Redis Configuration

Set `REDIS_URL` environment variable on MJAPI:
```bash
REDIS_URL=redis://localhost:6379
# or with auth:
REDIS_URL=redis://user:password@redis-host:6379
```

### BaseEngine Timing

| Setting | Default | Description |
|---------|---------|-------------|
| `EntityEventDebounceTime` | 1,500 ms | Debounce for filtered/sorted config refresh |
| `CacheLocalTTL` | 300,000 ms (5 min) | Per-config TTL override |

### BaseEngine ResultType

| Setting | Default | Description |
|---------|---------|-------------|
| `BaseEnginePropertyConfig.ResultType` | `undefined` | Per-config override. `undefined` resolves to `EngineDefaultResultType` (engine-wide). |
| `EngineDefaultResultType` (getter) | `'entity_object'` | Engine-wide default. Override in subclasses returning `'simple'` for read-only engines to skip BaseEntity construction. |

### GraphQL WebSocket

| Setting | Default | Description |
|---------|---------|-------------|
| Keep-alive | 30 seconds | Ping interval |
| Retry attempts | 3 | WebSocket reconnection attempts |
| Client max age | 30 minutes | WebSocket client recreation interval |
| Subscription idle timeout | 10 minutes | Cleanup after no activity |

---

## Troubleshooting

### Cache Not Updating After Save

1. **Check if `AutoRefresh` is enabled** on the BaseEngine config
2. **Check if entity name matches** — names are case-insensitive but must match exactly
3. **Check debounce timing** — debounced refreshes have a 1.5s delay
4. **Check if `CacheLocal` is enabled** — without it, no LocalCacheManager involvement
5. **Check immediate mutation conditions** — if Filter/OrderBy is set, uses debounced path

### Redis Pub/Sub Not Working

1. **Verify Redis connection**: Check MJAPI logs for `"Redis cache provider connected"`
2. **Check DBSIZE**: `redis-cli DBSIZE` should be > 0 after engines load
3. **Check storage provider migration**: Look for `"Migrated N/N entries to new storage provider"` in logs
4. **Verify pub/sub subscribers**: `redis-cli PUBSUB NUMSUB mj:__pubsub__` should show subscriber count
5. **Check self-message filtering**: Verify different MJAPI instances have different ProcessUUIDs

### GraphQL Subscription Not Receiving Events

1. **Check subscription established**: Browser console should show `"Cache invalidation subscription active"`
2. **Check WebSocket connection**: Look for WebSocket errors in browser console
3. **Verify PubSubManager wired**: Server logs should show PubSubEngine configured
4. **Check session dedup**: If you're testing from the same browser that made the change, events are intentionally skipped (log: `"Skipping self-originated cache invalidation"`)

### Initialization Order Issues

If `DBSIZE = 0` after server startup, the storage provider hot-swap may have failed:
1. Engines load before Redis connects → data goes to in-memory
2. `SetStorageProvider()` should migrate entries → check for `"Migrated"` log
3. If missing, verify `SetStorageProvider` is called after Redis connects in `index.ts`

### "Converting circular structure to JSON" Errors During Startup

This was a known bug (now fixed) caused by `PostRunView`/`PostRunViews` calling `TransformSimpleObjectToEntityObject()` **before** caching. BaseEntity objects contain RxJS `Subject` instances (`_eventSubject`) with circular subscriber references that break `JSON.stringify`.

**Fix**: Cache storage now happens *before* entity transformation. The cache stores plain JSON-serializable objects, and `TransformSimpleObjectToEntityObject` is called on cache read when `ResultType === 'entity_object'`.

If you see these errors, ensure you're on the latest version of `@memberjunction/core`. The ordering in `PostRunView` and `PostRunViews` must be:
1. Cache plain objects via `LocalCacheManager.SetRunViewResult()`
2. Transform to entity objects via `TransformSimpleObjectToEntityObject()`
3. Run post-hooks via `RunPostRunViewHooks()`

### Differential Update Issues

1. **Composite PK entities**: Check that primary key format matches `Field1|Value1||Field2|Value2`
2. **maxUpdatedAt mismatch**: Ensure `__mj_UpdatedAt` columns are present and populated
3. **rowCount drift**: rowCount is always derived from `results.length` — if it seems wrong, the actual data array may be corrupted (clear cache)

### Browser Cache Debugging

Open browser DevTools:
```javascript
// Check IndexedDB contents
const db = await indexedDB.open('MJ_Metadata', 3);
// Navigate to: Application > IndexedDB > MJ_Metadata

// Check cache stats from console
LocalCacheManager.Instance.GetStats()
LocalCacheManager.Instance.GetHitRate()
LocalCacheManager.Instance.GetAllEntries()
```

---

## Server-Side Dataset Caching

Datasets (`GetDatasetByName` and `GetDatasetStatusByName`) are a batch-loading mechanism used heavily at startup — the `MJ_Metadata` dataset alone loads ~22 entity types. Without caching, **every client connection** re-executes all of those SQL queries even though the data hasn't changed.

### How It Works

The dataset caching layer in `GenericDatabaseProvider` integrates with `LocalCacheManager` to avoid redundant database queries. It uses the same fingerprint system as RunView, so cache entries are shared between both paths.

#### GetDatasetByName — Cache-Aware Resolution

When a dataset is requested, each dataset item is resolved individually:

1. **Phase 1 — Cache Check**: For each dataset item, generate a `LocalCacheManager` fingerprint using the item's entity name and combined filter (WhereClause + ItemFilter). Check cache for a hit.
2. **Phase 2 — SQL for Misses Only**: Build and execute SQL (`SELECT columns FROM baseView WHERE filter`) only for items that had cache misses. Items with cache hits skip SQL entirely.
3. **Phase 3 — Write-Through**: After SQL execution, store results in `LocalCacheManager` via `SetRunViewResult` so future requests find them cached.
4. **Merge**: Results are assembled in original item order regardless of hit/miss status.

```
First client connect (after server bootstrap):
  Dataset items: 22 → Cache hits: 22, SQL queries: 0, elapsed: <1ms

Server cold start (no cache):
  Dataset items: 22 → Cache hits: 0, SQL queries: 22 (batched), elapsed: ~400ms
  Next request: Cache hits: 22, SQL queries: 0, elapsed: <1ms
```

#### GetDatasetStatusByName — Cache-Derived Status

Status checks (`MAX(dateField)` and `COUNT(*)` per item) are also cache-aware:

1. **Cache Hit**: Derive `LatestUpdateDate` and `TotalRowCount` directly from the in-memory cached rows — sub-millisecond.
2. **Cache Miss**: Fall back to the traditional SQL status query.

This eliminates the "status round-trip" that previously preceded every dataset fetch.

#### Fingerprint Compatibility

Dataset items generate fingerprints identical to RunView queries:

```typescript
const fingerprint = cache.GenerateRunViewFingerprint(
    { EntityName: entityName, ExtraFilter: effectiveFilter } as RunViewParams,
    this.InstanceConnectionString
);
```

This means:
- **RunView populates dataset cache**: If a RunView call loads `Entities` with the same filter, a subsequent dataset request finds it cached.
- **Dataset populates RunView cache**: After the dataset loads `Entities`, any RunView call with the same filter gets a cache hit.
- **Entity event invalidation**: When an entity record changes, `LocalCacheManager` invalidates entries for that entity — both RunView and dataset cache entries are cleared together.

### Why This Matters

| Metric | Before | After (warm cache) |
|--------|--------|---------------------|
| DB queries per client connect | ~44 (22 data + 22 status) | 0 |
| Dataset response time | ~400-500ms | <1ms |
| DB load at 100 concurrent users | 4,400 queries | 0 queries |

The server bootstrap (first boot) still hits the database to populate the cache, but every subsequent client connection — including the dozens that happen during peak usage — gets assembled entirely from memory.

### Logging

Both methods emit `LogStatusEx` messages with elapsed time and hit/miss counts:

```
GetDatasetByName: MJ_Metadata - 22 items, 22 cache hits, 0 misses, elapsed: 0.3ms
GetDatasetStatusByName: MJ_Metadata - 22 items, 22 cache hits, 0 misses, elapsed: 0.1ms
```

These log entries use standard MJ logging and appear in the server console during startup and client connections.

### Conditions

Dataset caching is active when:
- `LocalCacheManager.Instance` is available
- `TrustLocalCacheCompletely` is `true` (server-side default)

On the client side (`TrustLocalCacheCompletely = false`), dataset requests pass through to the server without local cache checks.

---

## Further Reading

- [`packages/MJCore/README.md`](../packages/MJCore/readme.md) — Core framework overview
- [`packages/RedisProvider/README.md`](../packages/RedisProvider/README.md) — Redis provider setup
- [`packages/GraphQLDataProvider/README.md`](../packages/GraphQLDataProvider/README.md) — Client-side data provider
- [`packages/MJServer/README.md`](../packages/MJServer/README.md) — Server configuration
- [`guides/DASHBOARD_BEST_PRACTICES.md`](DASHBOARD_BEST_PRACTICES.md) — Dashboard patterns including engine caching
