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
12. [Cross-Server Synchronization (Redis)](#cross-server-synchronization-redis)
13. [Server-to-Browser Synchronization (GraphQL Subscriptions)](#server-to-browser-synchronization-graphql-subscriptions)
14. [Deployment Topologies](#deployment-topologies)
15. [PubSubManager](#pubsubmanager)
16. [Cache Statistics and Monitoring](#cache-statistics-and-monitoring)
17. [Configuration Reference](#configuration-reference)
18. [Troubleshooting](#troubleshooting)

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
EntityName|Filter|OrderBy|ResultType|MaxRows|StartRow|AggregateHash|ConnectionPrefix
```

**Examples:**
```
Users|Status='Active'|Name ASC|simple|100|0|_|localhost_4000
AI Models|_|_|entity_object|-1|0|_|localhost_4000
Users|_|_|simple|50|100|a1b2c3d4|prod-db
```

Key rules:
- Empty values are represented as `_` for readability
- The aggregate hash uses a djb2 hash function when aggregate expressions are present (otherwise `_`)
- Connection prefix enables multi-connection cache isolation (different servers/databases)
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
Users|Active=1|Name ASC|simple|100|0|_|prod-server
Users|Active=1|Name ASC|simple|100|0|_|dev-server
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
        E2["'ai models'"] --> F2["AI Models|_|_|entity_object|...<br/>AI Models|Vendor='OpenAI'|Name|..."]
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
        ResultType: 'entity_object',
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

LocalCacheManager delegates actual storage to an `ILocalStorageProvider` implementation. The interface is simple but powerful:

```typescript
interface ILocalStorageProvider {
    GetItem(key: string, category?: string): Promise<string | null>;
    SetItem(key: string, value: string, category?: string): Promise<void>;
    Remove(key: string, category?: string): Promise<void>;
    ClearCategory?(category: string): Promise<void>;
    GetCategoryKeys?(category: string): Promise<string[]>;
}
```

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

- **Database name**: `MJ_Metadata`, **Version**: 3
- **Dedicated object stores** for known categories: `mj:default`, `mj:Metadata`, `mj:RunViewCache`, `mj:RunQueryCache`, `mj:DatasetCache`
- Unknown categories: prefixed keys stored in the default store
- Automatic upgrade handling (v3 removes legacy `Metadata_KVPairs` store)
- Graceful fallback to in-memory if IndexedDB fails (e.g., private browsing mode in some browsers)
- **Key format**: `[mj]:[category]:[key]`

### BrowserLocalStorageProvider

**Location**: `packages/GraphQLDataProvider/src/storage-providers.ts`

- Uses browser `localStorage` API
- **Key format**: `[mj]:[category]:[key]`
- Falls back to in-memory if localStorage is unavailable
- Limited by browser storage quotas (~5-10 MB)
- Use IndexedDB provider for better capacity and performance

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
    "CacheKey": "AI Models|_|_|entity_object|-1|0|_",
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
}
```

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
  3. Engine doesn't override `AdditionalLoading` (no post-processing dependencies)
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

## Further Reading

- [`packages/MJCore/README.md`](../packages/MJCore/readme.md) — Core framework overview
- [`packages/RedisProvider/README.md`](../packages/RedisProvider/README.md) — Redis provider setup
- [`packages/GraphQLDataProvider/README.md`](../packages/GraphQLDataProvider/README.md) — Client-side data provider
- [`packages/MJServer/README.md`](../packages/MJServer/README.md) — Server configuration
- [`guides/DASHBOARD_BEST_PRACTICES.md`](DASHBOARD_BEST_PRACTICES.md) — Dashboard patterns including engine caching
