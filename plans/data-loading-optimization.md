# MemberJunction Data Loading Optimization Plan

## Overview

This document outlines a comprehensive optimization strategy for MemberJunction's data loading architecture. The goal is to reduce redundant data loading, minimize network round trips, leverage intelligent caching, and simplify the developer experience when working with BaseEngine subclasses.

## Current State Analysis

### BaseEngine Architecture

The `BaseEngine<T>` class ([baseEngine.ts:86](packages/MJCore/src/generic/baseEngine.ts#L86)) provides:

- **Singleton pattern** via `BaseSingleton<T>`
- **Declarative configuration** via `BaseEnginePropertyConfig` specifying entities/datasets to load
- **Automatic batching** via `LoadMultipleEntityConfigs()` using `RunViews()` for parallel execution
- **Auto-refresh** via MJGlobal event listening with debouncing (default 5 seconds)
- **Expiration timers** for automatic cache invalidation
- **Provider-aware** multi-instance support

### Current Pain Points

1. **No cross-engine coordination** - Each engine loads independently, even when requesting identical data
2. **No request coalescing** - Parallel engine initializations make separate network requests
3. **No persistent caching for engines** - Unlike Metadata (which uses IndexedDB), engines reload on every page refresh
4. **Repetitive boilerplate** - Every usage requires `await Engine.Instance.Config(false, contextUser)`
5. **No visibility** - No way to see what engines exist, their memory footprint, or loading status

### Metadata Architecture (Reference)

The `Metadata` class uses a highly optimized pattern we should learn from:

- Pre-defined `MJ_Metadata` dataset loaded in single round trip
- IndexedDB caching with timestamp-based staleness detection
- ~500ms bootstrap time for core data
- Uses `*Info` classes (EntityInfo, EntityFieldInfo, etc.) rather than BaseEntity subclasses
- This is intentional - MJCore cannot depend on MJCoreEntities

---

## Optimization Components

### 1. BaseEngineRegistry

A central singleton that tracks all BaseEngine instances in the application.

#### Purpose

- Provide visibility into all active engines
- Enable cross-engine data sharing
- Track memory usage and loading statistics
- Support automatic startup loading via decorators

#### Interface

```typescript
interface EngineRegistration {
  engineClass: new () => BaseEngine<any>;
  instance: BaseEngine<any>;
  loadedAt: Date;
  lastAccessedAt: Date;
  loadOnStartup: boolean;
  startupPriority: number;  // Lower = earlier, default 100
}

interface EngineMemoryStats {
  engineName: string;
  className: string;
  entityConfigs: number;
  datasetConfigs: number;
  totalRecords: number;
  estimatedSizeBytes: number;
  loadedAt: Date;
  lastAccessedAt: Date;
}

interface RegistryStats {
  engines: EngineMemoryStats[];
  totalEngines: number;
  totalRecords: number;
  totalEstimatedBytes: number;
  oldestLoad: Date;
  newestLoad: Date;
}

class BaseEngineRegistry extends BaseSingleton<BaseEngineRegistry> {
  // Registration
  Register(engine: BaseEngine<any>): void;
  Unregister(engine: BaseEngine<any>): void;

  // Discovery
  GetAllEngines(): EngineRegistration[];
  GetEngine<T extends BaseEngine<any>>(engineClass: new () => T): T | null;
  GetEngineByName(name: string): BaseEngine<any> | null;

  // Statistics
  GetMemoryStats(): RegistryStats;
  GetEngineStats(engine: BaseEngine<any>): EngineMemoryStats;

  // Startup Loading
  GetStartupEngines(): EngineRegistration[];
  async LoadStartupEngines(contextUser: UserInfo): Promise<void>;

  // Logging/Instrumentation
  EnablePeriodicLogging(intervalMs: number): void;
  DisablePeriodicLogging(): void;
  DumpStatsToConsole(): void;
}
```

#### Registration Decorator

```typescript
/**
 * Decorator to mark an engine for automatic loading at application startup.
 * @param priority - Lower numbers load first. Default is 100.
 */
function LoadOnStartup(priority: number = 100) {
  return function <T extends new (...args: any[]) => BaseEngine<any>>(constructor: T) {
    BaseEngineRegistry.Instance.RegisterForStartup(constructor, priority);
    return constructor;
  };
}

// Usage
@LoadOnStartup(10)  // High priority, loads early
class EncryptionEngine extends BaseEngine<EncryptionEngine> {
  // ...
}

@LoadOnStartup()  // Default priority 100
class TemplateEngine extends BaseEngine<TemplateEngine> {
  // ...
}
```

#### Memory Estimation

```typescript
function EstimateObjectSize(obj: any): number {
  // Rough estimation based on JSON serialization
  // More accurate than nothing, less overhead than deep traversal
  try {
    const json = JSON.stringify(obj);
    return json.length * 2;  // UTF-16 characters = 2 bytes each
  } catch {
    return 0;
  }
}
```

---

### 2. DataPool

A central coordination layer for all entity data requests, sitting between BaseEngine and RunView.

#### Purpose

- Deduplicate in-flight requests for the same entity/filter combination
- Enable cross-engine data sharing
- Coordinate request pooling/batching
- Manage the tiered cache (memory + IndexedDB)

#### Interface

```typescript
interface DataPoolRequest {
  entityName: string;
  filter?: string;
  orderBy?: string;
  resultType: 'entity_object' | 'simple';
}

interface DataPoolCacheEntry {
  data: BaseEntity[] | any[];
  loadedAt: Date;
  lastAccessedAt: Date;
  entityUpdatedAt: Date;  // MAX(__mj_UpdatedAt) at time of load
  estimatedSizeBytes: number;
}

interface DataPoolConfig {
  enablePooling: boolean;
  poolingWindowMs: number;        // Default 50ms
  poolingMaxExtensionMs: number;  // Default 250ms
  enableLocalCache: boolean;
  enableCrossEngineSharing: boolean;
}

class DataPool extends BaseSingleton<DataPool> {
  // Configuration
  Configure(config: Partial<DataPoolConfig>): void;

  // Primary API - used by BaseEngine
  async Request(
    params: DataPoolRequest | DataPoolRequest[],
    contextUser: UserInfo,
    options?: {
      forceRefresh?: boolean;
      skipPooling?: boolean;
      skipCache?: boolean;
    }
  ): Promise<BaseEntity[][]>;

  // Cache Management
  async InvalidateEntity(entityName: string, filter?: string): Promise<void>;
  async InvalidateAll(): Promise<void>;
  async GetCacheStats(): Promise<{
    memoryEntries: number;
    indexedDbEntries: number;
    totalEstimatedBytes: number;
  }>;

  // Internal - exposed for testing/debugging
  GetPendingRequests(): Map<string, Promise<any>>;
  GetPooledRequests(): DataPoolRequest[];
}
```

#### Cache Key Strategy

```typescript
function BuildCacheKey(request: DataPoolRequest): string {
  // Normalize filter and orderBy for consistent keys
  const normalizedFilter = request.filter?.trim().toLowerCase() || '';
  const normalizedOrderBy = request.orderBy?.trim().toLowerCase() || '';

  return `entity:${request.entityName}|filter:${normalizedFilter}|order:${normalizedOrderBy}`;
}
```

#### Pooling Algorithm (Capped Debounce)

```typescript
class RequestPooler {
  private _queue: DataPoolRequest[] = [];
  private _timer: NodeJS.Timeout | null = null;
  private _windowStartTime: number = 0;
  private _resolvers: Array<{resolve: Function, reject: Function}> = [];

  private _windowMs: number = 50;
  private _maxExtensionMs: number = 250;

  async QueueRequest(request: DataPoolRequest): Promise<BaseEntity[]> {
    return new Promise((resolve, reject) => {
      this._queue.push(request);
      this._resolvers.push({ resolve, reject });

      const now = Date.now();

      if (!this._timer) {
        // First request - start the window
        this._windowStartTime = now;
        this._timer = setTimeout(() => this.FlushQueue(), this._windowMs);
      } else {
        // Subsequent request - extend window if within cap
        const elapsed = now - this._windowStartTime;
        const remaining = this._maxExtensionMs - elapsed;

        if (remaining > 0) {
          // Can still extend
          clearTimeout(this._timer);
          const extensionTime = Math.min(this._windowMs, remaining);
          this._timer = setTimeout(() => this.FlushQueue(), extensionTime);
        }
        // If remaining <= 0, timer will fire soon anyway
      }
    });
  }

  private async FlushQueue(): Promise<void> {
    this._timer = null;

    const requests = [...this._queue];
    const resolvers = [...this._resolvers];
    this._queue = [];
    this._resolvers = [];
    this._windowStartTime = 0;

    try {
      // Deduplicate requests
      const uniqueRequests = this.DeduplicateRequests(requests);

      // Execute as single RunViews call
      const results = await this.ExecuteBatch(uniqueRequests);

      // Map results back to original requests
      this.DistributeResults(requests, uniqueRequests, results, resolvers);
    } catch (error) {
      resolvers.forEach(r => r.reject(error));
    }
  }

  private DeduplicateRequests(requests: DataPoolRequest[]): DataPoolRequest[] {
    const seen = new Map<string, DataPoolRequest>();
    for (const req of requests) {
      const key = BuildCacheKey(req);
      if (!seen.has(key)) {
        seen.set(key, req);
      }
    }
    return Array.from(seen.values());
  }
}
```

---

### 3. Cross-Engine Data Sharing

When one engine has already loaded an entity, other engines should reuse that data.

#### Implementation in DataPool

```typescript
class DataPool {
  private _sharedCache: Map<string, DataPoolCacheEntry> = new Map();

  async Request(params: DataPoolRequest, contextUser: UserInfo, options?: RequestOptions): Promise<BaseEntity[]> {
    const cacheKey = BuildCacheKey(params);

    // 1. Check shared memory cache (cross-engine)
    if (!options?.forceRefresh && !options?.skipCache) {
      const cached = this._sharedCache.get(cacheKey);
      if (cached && !this.IsStale(cached)) {
        cached.lastAccessedAt = new Date();
        return cached.data as BaseEntity[];
      }
    }

    // 2. Check IndexedDB cache
    if (!options?.forceRefresh && !options?.skipCache) {
      const indexedDbData = await this.CheckIndexedDbCache(cacheKey);
      if (indexedDbData && !await this.IsIndexedDbStale(indexedDbData, params.entityName)) {
        // Promote to memory cache
        this._sharedCache.set(cacheKey, indexedDbData);
        return indexedDbData.data as BaseEntity[];
      }
    }

    // 3. Check for in-flight request
    if (this._inFlightRequests.has(cacheKey)) {
      return this._inFlightRequests.get(cacheKey);
    }

    // 4. Pool or execute immediately
    if (options?.skipPooling) {
      return this.ExecuteImmediate(params, contextUser);
    } else {
      return this._pooler.QueueRequest(params);
    }
  }
}
```

#### Staleness Detection

```typescript
async IsEntityStale(entityName: string, cachedUpdatedAt: Date): Promise<boolean> {
  // Query MAX(__mj_UpdatedAt) from the entity
  const rv = new RunView();
  const result = await rv.RunView({
    EntityName: entityName,
    Fields: ['__mj_UpdatedAt'],
    OrderBy: '__mj_UpdatedAt DESC',
    MaxRows: 1,
    ResultType: 'simple'
  });

  if (result.Success && result.Results.length > 0) {
    const serverUpdatedAt = new Date(result.Results[0].__mj_UpdatedAt);
    return serverUpdatedAt > cachedUpdatedAt;
  }

  return true;  // Assume stale if we can't determine
}
```

**Optimization:** Instead of checking each entity individually, batch staleness checks:

```typescript
async CheckMultipleEntitiesStale(
  checks: Array<{entityName: string, cachedUpdatedAt: Date}>
): Promise<Map<string, boolean>> {
  // Single RunViews call to get MAX(__mj_UpdatedAt) for all entities
  const rv = new RunView();
  const viewParams = checks.map(c => ({
    EntityName: c.entityName,
    Fields: ['__mj_UpdatedAt'],
    OrderBy: '__mj_UpdatedAt DESC',
    MaxRows: 1,
    ResultType: 'simple'
  }));

  const results = await rv.RunViews(viewParams);

  const staleMap = new Map<string, boolean>();
  checks.forEach((check, i) => {
    const result = results[i];
    if (result.Success && result.Results.length > 0) {
      const serverUpdatedAt = new Date(result.Results[0].__mj_UpdatedAt);
      staleMap.set(check.entityName, serverUpdatedAt > check.cachedUpdatedAt);
    } else {
      staleMap.set(check.entityName, true);
    }
  });

  return staleMap;
}
```

---

### 4. Persistent Caching (Dynamic Datasets)

Automatically cache engine data in IndexedDB, treating each engine's entity configs as a "virtual dataset."

#### Concept

Every BaseEngine's entity configs automatically become a cacheable unit:
- Stored in IndexedDB as a group
- On subsequent loads, check `__mj_UpdatedAt` for each entity
- Only fetch entities that actually changed
- Merge fresh data with cached data

#### IndexedDB Schema

```typescript
interface EngineCache {
  engineClassName: string;
  configs: Array<{
    propertyName: string;
    entityName: string;
    filter?: string;
    orderBy?: string;
    data: any[];
    entityUpdatedAt: Date;  // MAX(__mj_UpdatedAt) at cache time
    cachedAt: Date;
  }>;
  version: string;  // Engine version for cache invalidation
}

// IndexedDB store: "mj_engine_cache"
// Key: engineClassName
```

#### BaseEngine Integration

```typescript
abstract class BaseEngine<T> extends BaseSingleton<T> {
  // New property to enable/disable local caching
  protected get EnableLocalCache(): boolean {
    return true;  // Default enabled
  }

  // New property for cache refresh strategy
  protected get CacheRefreshStrategy(): 'always' | 'session' | 'staleness-check' {
    return 'staleness-check';  // Default: check __mj_UpdatedAt
  }

  protected async LoadConfigs(configs: Partial<BaseEnginePropertyConfig>[], contextUser: UserInfo): Promise<void> {
    this._metadataConfigs = configs.map(c => this.UpgradeObjectToConfig(c));

    const entityConfigs = this._metadataConfigs.filter(c => c.Type === 'entity');
    const datasetConfigs = this._metadataConfigs.filter(c => c.Type === 'dataset');

    if (this.EnableLocalCache && this.IsClientSide()) {
      // Try to load from cache first
      await this.LoadFromCacheWithStalenessCheck(entityConfigs, contextUser);
    } else {
      // Original behavior - load directly
      await Promise.all([
        ...datasetConfigs.map(c => this.LoadSingleDatasetConfig(c, contextUser)),
        this.LoadMultipleEntityConfigs(entityConfigs, contextUser)
      ]);
    }
  }

  private async LoadFromCacheWithStalenessCheck(
    configs: BaseEnginePropertyConfig[],
    contextUser: UserInfo
  ): Promise<void> {
    const cached = await this.GetCachedEngineData();

    if (!cached) {
      // No cache - load everything fresh
      await this.LoadMultipleEntityConfigs(configs, contextUser);
      await this.SaveToCache(configs);
      return;
    }

    if (this.CacheRefreshStrategy === 'session') {
      // Use cache as-is for this session
      this.ApplyCachedData(cached, configs);
      return;
    }

    if (this.CacheRefreshStrategy === 'staleness-check') {
      // Check which entities are stale
      const staleChecks = configs.map(c => ({
        entityName: c.EntityName,
        cachedUpdatedAt: cached.configs.find(cc => cc.entityName === c.EntityName)?.entityUpdatedAt || new Date(0)
      }));

      const staleMap = await DataPool.Instance.CheckMultipleEntitiesStale(staleChecks);

      const staleConfigs = configs.filter(c => staleMap.get(c.EntityName) === true);
      const freshConfigs = configs.filter(c => staleMap.get(c.EntityName) === false);

      // Apply cached data for fresh configs
      this.ApplyCachedData(cached, freshConfigs);

      // Load stale configs from server
      if (staleConfigs.length > 0) {
        await this.LoadMultipleEntityConfigs(staleConfigs, contextUser);
      }

      // Update cache
      await this.SaveToCache(configs);
    }
  }
}
```

---

### 5. ConfigEx Method

New configuration method with object-based parameters for better extensibility.

#### Interface

```typescript
interface EngineConfigOptions {
  forceRefresh?: boolean;
  contextUser?: UserInfo;
  provider?: IMetadataProvider;

  // New options
  poolingWindowMs?: number;        // Override default 50ms
  poolingMaxExtensionMs?: number;  // Override default 250ms
  skipPooling?: boolean;           // Disable pooling for this load
  skipLocalCache?: boolean;        // Disable IndexedDB cache for this load
  cacheRefreshStrategy?: 'always' | 'session' | 'staleness-check';
}

abstract class BaseEngine<T> {
  // Existing method - unchanged for backward compatibility
  public abstract Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>;

  // New method with extensible options
  public async ConfigEx(options: EngineConfigOptions = {}): Promise<void> {
    // Map to internal implementation
    const {
      forceRefresh = false,
      contextUser,
      provider,
      poolingWindowMs,
      poolingMaxExtensionMs,
      skipPooling,
      skipLocalCache,
      cacheRefreshStrategy
    } = options;

    // Store options for use during load
    this._configOptions = options;

    // Configure DataPool if custom pooling settings
    if (poolingWindowMs !== undefined || poolingMaxExtensionMs !== undefined) {
      DataPool.Instance.ConfigureForRequest({
        windowMs: poolingWindowMs,
        maxExtensionMs: poolingMaxExtensionMs
      });
    }

    // Delegate to existing Config implementation
    await this.Config(forceRefresh, contextUser, provider);
  }
}
```

---

### 6. Automatic Startup Loading

Eliminate the need for `await Engine.Instance.Config()` throughout the codebase.

#### Application Bootstrap Integration

```typescript
// In application initialization (after auth)
async function InitializeApplication(contextUser: UserInfo): Promise<void> {
  // Load metadata first (existing)
  await Metadata.Provider.Config(configData);

  // NEW: Load all registered startup engines
  await BaseEngineRegistry.Instance.LoadStartupEngines(contextUser);

  // Application is now ready
}
```

#### Registry Startup Loading

```typescript
class BaseEngineRegistry {
  private _startupRegistrations: Array<{
    engineClass: new () => BaseEngine<any>;
    priority: number;
  }> = [];

  RegisterForStartup(engineClass: new () => BaseEngine<any>, priority: number): void {
    this._startupRegistrations.push({ engineClass, priority });
    // Sort by priority
    this._startupRegistrations.sort((a, b) => a.priority - b.priority);
  }

  async LoadStartupEngines(contextUser: UserInfo): Promise<void> {
    // Group by priority for parallel loading within same priority
    const priorityGroups = this.GroupByPriority(this._startupRegistrations);

    for (const group of priorityGroups) {
      // Load all engines in this priority group in parallel
      await Promise.all(
        group.map(async registration => {
          const instance = registration.engineClass.Instance;
          await instance.ConfigEx({ contextUser });
          this.Register(instance);
        })
      );
    }
  }

  private GroupByPriority(registrations: Array<{engineClass: any, priority: number}>): Array<Array<{engineClass: any, priority: number}>> {
    const groups = new Map<number, Array<{engineClass: any, priority: number}>>();
    for (const reg of registrations) {
      if (!groups.has(reg.priority)) {
        groups.set(reg.priority, []);
      }
      groups.get(reg.priority).push(reg);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, group]) => group);
  }
}
```

#### Downstream Code Simplification

Before:
```typescript
async function DoSomething(contextUser: UserInfo) {
  await TemplateEngine.Instance.Config(false, contextUser);
  const templates = TemplateEngine.Instance.Templates;
  // ...
}
```

After (if engine is marked `@LoadOnStartup`):
```typescript
function DoSomething() {
  // No await needed - guaranteed loaded at startup
  const templates = TemplateEngine.Instance.Templates;
  // ...
}
```

---

### 7. Metadata Loading Analysis

Deep analysis of the existing `MJ_Metadata` dataset and `Metadata` class for additional optimization opportunities.

#### Current State

The Metadata class ([metadata.ts](packages/MJCore/src/generic/metadata.ts)) uses:
- `MJ_Metadata` dataset defined in database
- IndexedDB caching via `LocalStorageProvider`
- Timestamp-based staleness detection
- ~500ms bootstrap time (already well-optimized)

#### Analysis Tasks

1. **Profile the 500ms** - Where does time go?
   - Network latency
   - JSON parsing
   - Object instantiation (*Info classes)
   - IndexedDB read/write

2. **Dataset composition review** - What's in MJ_Metadata?
   - Entities, EntityFields, EntityPermissions, EntityRelationships
   - Applications, ApplicationEntities, ApplicationSettings
   - Roles, Authorizations, AuditLogTypes
   - Queries, QueryFields, QueryCategories, QueryPermissions
   - Libraries, ExplorerNavigationItems

3. **Selective loading opportunities**
   - Not all apps need all metadata
   - Could we support "metadata profiles"?

4. **Incremental refresh potential**
   - Currently all-or-nothing refresh
   - Could track per-entity timestamps for delta sync

#### Recommendations (To Be Validated)

- **Pre-defined Static Datasets** - Create additional datasets via MetadataSync:
  - `MJ_Encryption` - Encryption keys, providers, configurations
  - `MJ_AI_Config` - AI models, vendors, prompts, configurations
  - `MJ_Actions` - Action definitions, parameters, categories
  - `MJ_Templates` - Templates, template contents, template params

- **Lazy metadata sections** - Some metadata (like QueryPermissions) could load on-demand

---

## Implementation Details

### File Locations

| Component | Location |
|-----------|----------|
| BaseEngineRegistry | `packages/MJCore/src/generic/baseEngineRegistry.ts` |
| DataPool | `packages/MJCore/src/generic/dataPool.ts` |
| LoadOnStartup decorator | `packages/MJCore/src/generic/decorators.ts` |
| IndexedDB cache utilities | `packages/MJCore/src/generic/engineCache.ts` |
| BaseEngine modifications | `packages/MJCore/src/generic/baseEngine.ts` |

### New Exports from MJCore

```typescript
// packages/MJCore/src/index.ts additions
export { BaseEngineRegistry, EngineRegistration, EngineMemoryStats, RegistryStats } from './generic/baseEngineRegistry';
export { DataPool, DataPoolConfig, DataPoolRequest } from './generic/dataPool';
export { LoadOnStartup } from './generic/decorators';
```

### BaseEnginePropertyConfig Additions

```typescript
export class BaseEnginePropertyConfig extends BaseInfo {
  // Existing properties...

  /**
   * If true, this config participates in request pooling. Default true.
   */
  AllowPooling?: boolean = true;

  /**
   * If true, results are cached in IndexedDB (client-side only). Default true.
   */
  EnableLocalCache?: boolean = true;

  /**
   * How to determine if cached data is stale.
   * - 'always': Always fetch fresh data
   * - 'session': Use cache for entire session, refresh on next session
   * - 'staleness-check': Check __mj_UpdatedAt to determine if refresh needed
   */
  CacheRefreshStrategy?: 'always' | 'session' | 'staleness-check' = 'staleness-check';
}
```

### Error Handling

```typescript
// Graceful degradation when IndexedDB unavailable
class DataPool {
  private _indexedDbAvailable: boolean = true;

  private async InitializeIndexedDb(): Promise<void> {
    try {
      // Test IndexedDB availability
      const testDb = await indexedDB.open('mj_test', 1);
      testDb.close();
      indexedDB.deleteDatabase('mj_test');
    } catch (error) {
      console.warn('IndexedDB not available, falling back to memory-only caching');
      this._indexedDbAvailable = false;
    }
  }
}
```

### Client vs Server Detection

```typescript
abstract class BaseEngine<T> {
  protected IsClientSide(): boolean {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  }

  protected IsServerSide(): boolean {
    return !this.IsClientSide();
  }
}
```

---

## Testing Strategy

### Unit Tests

1. **BaseEngineRegistry**
   - Registration/unregistration
   - Memory stats calculation
   - Startup engine ordering

2. **DataPool**
   - Request deduplication
   - Pooling window behavior (including max extension cap)
   - Cache hit/miss scenarios
   - Cross-engine sharing

3. **IndexedDB Caching**
   - Save/load round-trip
   - Staleness detection
   - Graceful degradation when unavailable

### Integration Tests

1. **Multi-engine startup**
   - Verify engines load in priority order
   - Verify parallel loading within same priority
   - Verify data sharing between engines

2. **Network efficiency**
   - Count actual RunViews calls
   - Verify deduplication works
   - Verify pooling batches correctly

### Performance Benchmarks

1. **Before/after comparison**
   - Measure total network requests during app startup
   - Measure time to "all engines loaded"
   - Measure memory footprint

2. **Cache effectiveness**
   - Measure cache hit rates
   - Measure time saved by cache hits
   - Measure IndexedDB overhead

---

## Universal Startup Loading Pattern (ILoadOnStartup)

While the BaseEngineRegistry addresses engine-specific startup loading, we can generalize this pattern to work with **any singleton class** across the entire MemberJunction ecosystem. This provides a unified approach to initialization and eliminates the tree-shake prevention hacks scattered throughout the codebase.

### The Problem: Tree-Shake Prevention Hacks

Currently, many packages contain code like this solely to prevent bundlers from removing unused classes:

```typescript
// In various public-api.ts files throughout the codebase
export function Load_EncryptionEngine() { }
export function Load_TemplateEngine() { }
export function Load_SomeAction() { }
export function Load_SomeProvider() { }
// ... dozens more

// Then in module initialization somewhere
Load_EncryptionEngine();
Load_TemplateEngine();
// etc.
```

These empty functions exist only to create a reference that prevents tree-shaking. It's boilerplate that clutters the codebase and is easy to forget when adding new classes.

### The Solution: ILoadOnStartup Interface + @LoadOnStartup Decorator

Create a universal pattern in `@memberjunction/global` that:
1. Provides a standard interface for any class that needs startup initialization
2. Uses a decorator that both registers the class AND prevents tree-shaking
3. Centralizes all startup loading in one place

#### Interface Definition

```typescript
// In @memberjunction/global

/**
 * Interface for any singleton class that needs initialization at application startup.
 * Implementing classes must follow the singleton pattern with a static Instance property.
 */
interface ILoadOnStartup {
  /**
   * Called during application bootstrap to initialize the singleton.
   * @param contextUser - The authenticated user context (required for server-side, optional for client-side)
   */
  Load(contextUser?: UserInfo): Promise<void>;
}
```

#### Decorator Definition

```typescript
// In @memberjunction/global

interface LoadOnStartupOptions {
  /**
   * Loading priority. Lower numbers load first.
   * Classes with same priority load in parallel.
   * Default: 100
   */
  priority?: number;

  /**
   * What happens if Load() fails.
   * - 'fatal': Stop startup, throw error, process should terminate
   * - 'error': Log error, continue loading other classes (default)
   * - 'warn': Log warning, continue (for optional functionality)
   * - 'silent': Swallow error completely
   */
  severity?: 'fatal' | 'error' | 'warn' | 'silent';

  /**
   * Human-readable description for logging/debugging
   */
  description?: string;
}

/**
 * Decorator to mark a singleton class for automatic loading at application startup.
 *
 * The decorated class must:
 * 1. Implement ILoadOnStartup interface
 * 2. Have a static 'Instance' property (singleton pattern)
 *
 * This decorator also prevents tree-shaking by creating a runtime reference
 * to the class during module initialization.
 */
function LoadOnStartup(options?: LoadOnStartupOptions) {
  return function<T extends {
    new(...args: any[]): ILoadOnStartup;
    Instance: ILoadOnStartup;  // Enforce singleton pattern
  }>(constructor: T) {
    // Validate singleton pattern
    if (!('Instance' in constructor)) {
      throw new Error(
        `@LoadOnStartup requires singleton pattern. ${constructor.name} must have a static 'Instance' property.`
      );
    }

    // Register with MJGlobal - this creates the side effect that prevents tree-shaking
    MJGlobal.Instance.RegisterForStartup({
      constructor,
      getInstance: () => constructor.Instance,
      options: options || {}
    });

    return constructor;
  };
}
```

#### MJGlobal Additions

```typescript
// Additions to MJGlobal class

interface StartupRegistration {
  constructor: new (...args: any[]) => ILoadOnStartup;
  getInstance: () => ILoadOnStartup;
  options: LoadOnStartupOptions;
  loadedAt?: Date;
  loadDurationMs?: number;
}

interface LoadResult {
  className: string;
  success: boolean;
  error?: Error;
  severity?: LoadOnStartupOptions['severity'];
  durationMs: number;
}

interface LoadAllResult {
  success: boolean;
  results: LoadResult[];
  totalDurationMs: number;
  fatalError?: Error;
}

class MJGlobal {
  private _startupRegistrations: StartupRegistration[] = [];

  /**
   * Register a class for startup loading. Called by @LoadOnStartup decorator.
   */
  RegisterForStartup(registration: Omit<StartupRegistration, 'loadedAt' | 'loadDurationMs'>): void {
    this._startupRegistrations.push(registration as StartupRegistration);
  }

  /**
   * Get all registered startup classes, sorted by priority.
   */
  GetStartupRegistrations(): StartupRegistration[] {
    return [...this._startupRegistrations].sort((a, b) => {
      const priorityA = this.ResolvePriority(a.options);
      const priorityB = this.ResolvePriority(b.options);
      return priorityA - priorityB;
    });
  }

  /**
   * Load all registered startup classes in priority order.
   * Classes with the same priority are loaded in parallel.
   *
   * @param contextUser - The authenticated user context
   * @returns Results of all load operations
   */
  async LoadAll(contextUser?: UserInfo): Promise<LoadAllResult> {
    const startTime = Date.now();
    const registrations = this.GetStartupRegistrations();
    const groups = this.GroupByPriority(registrations);
    const results: LoadResult[] = [];

    for (const group of groups) {
      const groupResults = await Promise.all(
        group.map(async (reg): Promise<LoadResult> => {
          const loadStart = Date.now();
          try {
            const instance = reg.getInstance();
            await instance.Load(contextUser);

            reg.loadedAt = new Date();
            reg.loadDurationMs = Date.now() - loadStart;

            return {
              className: reg.constructor.name,
              success: true,
              durationMs: reg.loadDurationMs
            };
          } catch (error) {
            const durationMs = Date.now() - loadStart;
            return {
              className: reg.constructor.name,
              success: false,
              error: error as Error,
              severity: reg.options.severity || 'error',
              durationMs
            };
          }
        })
      );

      results.push(...groupResults);

      // Check for fatal errors - stop immediately
      const fatal = groupResults.find(r => !r.success && r.severity === 'fatal');
      if (fatal) {
        return {
          success: false,
          results,
          totalDurationMs: Date.now() - startTime,
          fatalError: fatal.error
        };
      }

      // Log non-fatal errors
      for (const result of groupResults) {
        if (!result.success) {
          if (result.severity === 'error') {
            console.error(`[MJGlobal] Error loading ${result.className}:`, result.error);
          } else if (result.severity === 'warn') {
            console.warn(`[MJGlobal] Warning loading ${result.className}:`, result.error);
          }
          // 'silent' - do nothing
        }
      }
    }

    return {
      success: results.every(r => r.success || r.severity !== 'fatal'),
      results,
      totalDurationMs: Date.now() - startTime
    };
  }

  private ResolvePriority(options: LoadOnStartupOptions): number {
    return options.priority ?? 100; // Default priority
  }

  private GroupByPriority(registrations: StartupRegistration[]): StartupRegistration[][] {
    const groups = new Map<number, StartupRegistration[]>();

    for (const reg of registrations) {
      const priority = this.ResolvePriority(reg.options);
      if (!groups.has(priority)) {
        groups.set(priority, []);
      }
      groups.get(priority)!.push(reg);
    }

    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, group]) => group);
  }
}
```

### Usage Examples

#### Engine Classes

```typescript
// Before
@RegisterClass(BaseEngine, 'EncryptionEngine')
export class EncryptionEngine extends BaseEngine<EncryptionEngine> {
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
    // ... existing implementation
  }
}

// After - implements ILoadOnStartup, decorated with @LoadOnStartup
@LoadOnStartup({ priority: 10, severity: 'fatal', description: 'Encryption services' })
@RegisterClass(BaseEngine, 'EncryptionEngine')
export class EncryptionEngine extends BaseEngine<EncryptionEngine> implements ILoadOnStartup {
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
    // ... existing implementation
  }

  // ILoadOnStartup implementation - just delegates to Config
  public async Load(contextUser?: UserInfo): Promise<void> {
    await this.Config(false, contextUser);
  }
}
```

#### Action Classes

```typescript
@LoadOnStartup({ priority: 100, description: 'File storage actions' })
@RegisterClass(BaseAction, 'FileStorageAction')
export class FileStorageAction extends BaseAction implements ILoadOnStartup {
  static get Instance(): FileStorageAction {
    return MJGlobal.Instance.GetInstance<FileStorageAction>(FileStorageAction.name);
  }

  public async Load(contextUser?: UserInfo): Promise<void> {
    // Any initialization needed
  }
}
```

#### Provider Classes

```typescript
@LoadOnStartup({ priority: 5, severity: 'fatal', description: 'GraphQL data provider' })
export class GraphQLDataProvider extends ProviderBase implements ILoadOnStartup {
  private static _instance: GraphQLDataProvider;

  static get Instance(): GraphQLDataProvider {
    if (!this._instance) {
      this._instance = new GraphQLDataProvider();
    }
    return this._instance;
  }

  public async Load(contextUser?: UserInfo): Promise<void> {
    // Initialize connection, load config, etc.
  }
}
```

### Application Bootstrap Integration

Every MJ application (API, UI, CLI) calls this after authentication:

```typescript
// In API startup
async function bootstrapAPI(contextUser: UserInfo): Promise<void> {
  // 1. Load core metadata (existing)
  await Metadata.Provider.Config(configData);

  // 2. Load all registered startup classes (NEW)
  const result = await MJGlobal.Instance.LoadAll(contextUser);

  if (!result.success) {
    console.error('Startup failed:', result.fatalError);
    process.exit(1);
  }

  console.log(`Loaded ${result.results.length} classes in ${result.totalDurationMs}ms`);

  // 3. Application is ready
}

// In Angular app initialization
async function bootstrapAngularApp(contextUser: UserInfo): Promise<void> {
  await Metadata.Provider.Config(configData);

  const result = await MJGlobal.Instance.LoadAll(contextUser);

  if (!result.success) {
    // Show error UI
    throw new Error(`Application failed to initialize: ${result.fatalError?.message}`);
  }
}

// In CLI tool
async function bootstrapCLI(contextUser: UserInfo): Promise<void> {
  await Metadata.Provider.Config(configData);
  await MJGlobal.Instance.LoadAll(contextUser);
}
```

### Tree-Shake Prevention: How It Works

The key insight is that the `@LoadOnStartup` decorator executes at **module load time** and creates a **side effect** (registering with MJGlobal). Bundlers like Webpack and Rollup see this side effect and preserve the class.

```typescript
// When this file is imported, the decorator executes immediately
@LoadOnStartup({ priority: 50 })  // <-- This line runs at import time
class TemplateEngine { }

// The decorator internally does:
MJGlobal.Instance.RegisterForStartup({ ... });  // <-- Side effect!
```

**Important caveat:** The file containing the decorated class must still be imported somewhere in the bundle. The decorator prevents the *class* from being removed once the file is included, but doesn't magically include unimported files.

**The improvement:** Instead of N tree-shake prevention functions per package:

```typescript
// BEFORE: One function per class (clutters codebase)
export function Load_EncryptionEngine() { }
export function Load_KeyManager() { }
export function Load_EncryptionProvider() { }
// Then call them all somewhere...
```

We now need just one import per package:

```typescript
// AFTER: Package's index.ts exports decorated classes normally
export { EncryptionEngine } from './EncryptionEngine';
export { KeyManager } from './KeyManager';
export { EncryptionProvider } from './EncryptionProvider';

// App just imports the package - decorators handle registration
import '@memberjunction/encryption';  // All @LoadOnStartup classes are now registered
```

### Relationship to BaseEngineRegistry

The `BaseEngineRegistry` (described earlier in this document) becomes a **specialized view** of the MJGlobal startup registrations, filtered to only show `BaseEngine` subclasses:

```typescript
class BaseEngineRegistry extends BaseSingleton<BaseEngineRegistry> {
  GetAllEngines(): EngineRegistration[] {
    // Filter MJGlobal registrations to only BaseEngine types
    return MJGlobal.Instance.GetStartupRegistrations()
      .filter(reg => reg.getInstance() instanceof BaseEngine)
      .map(reg => ({
        engineClass: reg.constructor,
        instance: reg.getInstance() as BaseEngine<any>,
        loadedAt: reg.loadedAt,
        // ... etc
      }));
  }

  GetMemoryStats(): RegistryStats {
    // Engine-specific stats
  }
}
```

This keeps the engine-specific functionality (memory stats, data sharing, etc.) while leveraging the universal startup infrastructure.

### File Locations

| Component | Location |
|-----------|----------|
| ILoadOnStartup interface | `packages/MJGlobal/src/interfaces.ts` |
| @LoadOnStartup decorator | `packages/MJGlobal/src/decorators.ts` |
| LoadOnStartupOptions | `packages/MJGlobal/src/decorators.ts` |
| MJGlobal.RegisterForStartup | `packages/MJGlobal/src/MJGlobal.ts` |
| MJGlobal.LoadAll | `packages/MJGlobal/src/MJGlobal.ts` |

### Migration Strategy

1. **Add infrastructure** - ILoadOnStartup, decorator, MJGlobal methods
2. **Update core classes** - Add @LoadOnStartup to engines, core providers
3. **Update app bootstraps** - Add `MJGlobal.Instance.LoadAll()` call
4. **Gradually remove tree-shake hacks** - As classes get @LoadOnStartup, remove their `Load_*` functions
5. **Update documentation** - New pattern for singleton initialization

---

## Future Considerations (Not In Scope)

These items are documented for future reference but not part of this implementation:

### Lazy Loading Support

Allow properties to load on first access rather than at Config time. Deferred due to extensive downstream code changes required (sync property access pattern is deeply embedded).

### Predictive Pre-fetching

Hint-based prefetch where loading one entity triggers prefetch of related entities. Interesting for performance but adds complexity.

### Server-Side Caching

Implement Redis or in-memory cache for MJAPI. Less critical since server is close to database, but could help with multi-tenant scenarios.

### Tiered Memory Management

Active eviction of least-recently-used data from memory. Current analysis suggests memory isn't a major concern, but the Registry's memory stats will help validate this over time.

### Differential Metadata Sync

Delta updates for metadata instead of full refresh. Would require new server endpoint and more complex client logic.

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Network requests at startup | ~15-20 (varies by app) | ~3-5 |
| Time to all engines loaded | ~2-3 seconds | <1 second |
| Redundant entity loads | Common | Zero |
| Developer boilerplate | `await Engine.Config()` everywhere | Minimal (startup engines) |
| Cache hit rate (warm start) | 0% (no engine caching) | >80% |

---

## Appendix: Configuration Reference

### DataPool Global Configuration

```typescript
// Typically called once at application initialization
DataPool.Instance.Configure({
  enablePooling: true,           // Enable request pooling
  poolingWindowMs: 50,           // Initial pooling window
  poolingMaxExtensionMs: 250,    // Maximum extension before forced flush
  enableLocalCache: true,        // Enable IndexedDB caching
  enableCrossEngineSharing: true // Enable memory sharing between engines
});
```

### Per-Engine Configuration

```typescript
@LoadOnStartup(10)
class MyEngine extends BaseEngine<MyEngine> {
  protected get EnableLocalCache(): boolean {
    return true;  // Override to disable for this engine
  }

  protected get CacheRefreshStrategy(): 'always' | 'session' | 'staleness-check' {
    return 'staleness-check';  // Override refresh behavior
  }
}
```

### Per-Load Configuration

```typescript
await MyEngine.Instance.ConfigEx({
  forceRefresh: true,           // Bypass all caches
  skipPooling: true,            // Execute immediately, don't pool
  skipLocalCache: true,         // Don't use IndexedDB for this load
  poolingWindowMs: 100,         // Custom pooling window for this load
  contextUser: user
});
```
