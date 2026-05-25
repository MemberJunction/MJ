# Implementation Proposal: High-Performance MetadataSync Push

This proposal details the architectural changes to optimize the `MetadataSync` push operation based on upfront batched bulk loading of `BaseEntity` instances, dynamic lookup caching, and file I/O caching.

> **Status note (post-review):** the proposal below describes the original
> design. The shipped implementation diverges in a few details surfaced by
> code review — see "Implementation deltas from this proposal" at the
> bottom of the file. Treat the canonical reference for current behavior
> as the source under `packages/MetadataSync/src/lib/sync-metadata-engine.ts`.

---

## Architectural Overview

The proposed design transitions the synchronization flow from a **sequential query-per-record model** to a **batched upfront bulk-loading model**. It leverages the fact that `BaseEntity` in MemberJunction has been optimized for low memory overhead and lazy hydration.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          1. START PUSH COMMAND                         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. UPFRONT FILE SCAN & CACHING                                          │
│    - Read and parse all JSON files across all target directories        │
│    - Cache parsed content to eliminate double read/parsing I/O         │
│    - Collect all primary keys from all files/records                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. BATCHED BULK PRELOAD (RunViews)                                      │
│    - Group collected primary keys by Entity Type                        │
│    - Batch all queries into a single database round-trip via RunViews   │
│    - Cache loaded BaseEntity instances in a global Map                  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. TRANSACTION BEGIN                                                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. SYNC PROCESSING (Phase 1 & 2)                                        │
│    - loadEntity() -> Returns BaseEntity from cache (O(1), 0 DB queries) │
│    - resolveLookup()                                                    │
│      - Miss? Scans cached BaseEntity list in-memory (O(K), 0 DB queries)│
│      - Still Miss? Runs point DB query & adds to cache for reuse         │
│    - entity.Save() -> Mutates in-place (mutations instantly visible)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Details

### 1. The `SyncMetadataEngine` Subclass (Extending `BaseEngine`)
We will create a new class `SyncMetadataEngine` extending `BaseEngine<SyncMetadataEngine>`. This class will manage the cache configurations and store the preloaded/cached arrays of `BaseEntity` objects:

```typescript
// sync-metadata-engine.ts
import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { SyncEngine } from './sync-engine';

export class SyncMetadataEngine extends BaseEngine<SyncMetadataEngine> {
  private syncEngine: SyncEngine;
  private entityDirs: string[] = [];
  private preloadedEntityNames: Set<string> = new Set();
  private lookupCache: Map<string, string> = new Map();
  private fileDataCache: Map<string, { rawData: any; fileData: any }> = new Map();

  constructor(syncEngine: SyncEngine) {
    super();
    this.syncEngine = syncEngine;
  }

  public setEntityDirs(dirs: string[]): void {
    this.entityDirs = dirs;
  }

  public getPropertyNameForEntity(entityName: string): string {
    return `cached_${entityName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  /**
   * Orchestrates the dynamic configuration build and loading of existing records.
   * Leverages BaseEngine's built-in RunViews batching under the hood.
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
    const configs = await this.buildDynamicConfigs();
    const providerToUse = provider || this.ProviderToUse;
    
    if (configs.length > 0) {
      await this.Load(configs, providerToUse, forceRefresh, contextUser);
    }
    return true;
  }

  /**
   * Overridden to bypass the default filters/orderby check.
   * During sync, we want to allow immediate mutations for our cached views
   * so they are updated in memory without hitting the database again.
   */
  protected override canUseImmediateMutation(config: BaseEnginePropertyConfig, skipAdditionalLoadingCheck: boolean = false): boolean {
    return true; 
  }

  public markEntityAsPreloaded(entityName: string): void {
    this.preloadedEntityNames.add(entityName);
  }

  public isEntityPreloaded(entityName: string): boolean {
    return this.preloadedEntityNames.has(entityName);
  }

  public getCachedEntities(entityName: string): BaseEntity[] {
    const propName = this.getPropertyNameForEntity(entityName);
    return (this as any)[propName] || [];
  }

  public getCachedFile(filePath: string): { rawData: any; fileData: any } | undefined {
    return this.fileDataCache.get(filePath);
  }

  public cacheFile(filePath: string, rawData: any, fileData: any): void {
    this.fileDataCache.set(filePath, { rawData, fileData });
  }

  public addEntityToCache(entityName: string, entity: BaseEntity): void {
    const propName = this.getPropertyNameForEntity(entityName);
    if (!(this as any)[propName]) {
      (this as any)[propName] = [];
    }
    const list = (this as any)[propName] as BaseEntity[];
    const index = list.findIndex(e => e === entity || e.PrimaryKey.Equals(entity.PrimaryKey));
    if (index >= 0) {
      list[index] = entity;
    } else {
      list.push(entity);
    }
  }

  public removeEntityFromCache(entityName: string, primaryKey: Record<string, any>): void {
    const propName = this.getPropertyNameForEntity(entityName);
    const list = (this as any)[propName] as BaseEntity[];
    if (list) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (entityInfo) {
        const pkStr = this.syncEngine.serializePrimaryKey(entityInfo, primaryKey);
        const index = list.findIndex(e => this.syncEngine.serializePrimaryKey(entityInfo, e.GetAll()) === pkStr);
        if (index >= 0) {
          list.splice(index, 1);
        }
      }
    }
    this.lookupCache.clear();
  }

  public getCachedLookup(key: string): string | undefined {
    return this.lookupCache.get(key);
  }

  public setCachedLookup(key: string, id: string): void {
    this.lookupCache.set(key, id);
  }

  public clearLookupCache(): void {
    this.lookupCache.clear();
  }

  /**
   * Scans files, caches content to avoid double I/O, collects primary keys,
   * and prepares configurations for bulk-loading.
   */
  private async buildDynamicConfigs(): Promise<Partial<BaseEnginePropertyConfig>[]> {
    const keysByEntity: Map<string, Array<Record<string, any>>> = new Map();
    const configs: Partial<BaseEnginePropertyConfig>[] = [];

    // 1. Scan and cache files
    for (const entityDir of this.entityDirs) {
      const entityConfig = await loadEntityConfig(entityDir);
      if (!entityConfig) continue;

      const files = await fastGlob(entityConfig.filePattern || '*.json', { cwd: entityDir, absolute: true });
      for (const filePath of files) {
        const rawData = await fs.readJson(filePath);
        let fileData = rawData;

        if (JSON.stringify(rawData).includes('"@include"')) {
          const preprocessor = new JsonPreprocessor();
          fileData = await preprocessor.processFile(filePath);
        }

        this.cacheFile(filePath, rawData, fileData);

        const records = Array.isArray(fileData) ? fileData : [fileData];
        this.extractPrimaryKeysRecursive(records, entityConfig.entity, keysByEntity);
      }
    }

    // 2. Build configurations
    for (const [entityName, pks] of keysByEntity.entries()) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (!entityInfo || pks.length === 0) continue;

      const uniquePks = this.getUniquePrimaryKeys(entityInfo, pks);
      if (uniquePks.length === 0) continue;

      this.markEntityAsPreloaded(entityName);

      const propName = this.getPropertyNameForEntity(entityName);
      const filter = this.buildBulkFilter(entityInfo, uniquePks);

      configs.push({
        PropertyName: propName,
        EntityName: entityName,
        Type: 'entity',
        ResultType: 'entity_object',
        Filter: filter,
        AutoRefresh: true
      });
    }

    return configs;
  }
}
```

### 2. Batched Upfront Preloading (PushService.ts)
At the start of the `push()` operation, we configure the engine and trigger the load:

```typescript
// PushService.ts
public async preloadEntitiesAndFiles(entityDirs: string[], options: PushOptions): Promise<void> {
  const provider = Metadata.Provider;
  this.syncMetadataEngine.setEntityDirs(entityDirs);
  
  // Triggers dynamic configuration building and batched loading via RunViews
  await this.syncMetadataEngine.Config(true, this.contextUser, provider);
}
```

### 3. Cache Integration in SyncEngine

#### loadEntity Optimization
Consult `SyncMetadataEngine`'s array property for the entity:
```typescript
// sync-engine.ts
async loadEntity(entityName: string, primaryKey: Record<string, any>): Promise<BaseEntity | null> {
  const entityInfo = this.getEntityInfo(entityName);
  if (!entityInfo) throw new Error(`Entity not found: ${entityName}`);
  
  if (this.syncMetadataEngine.isEntityPreloaded(entityName)) {
    const cachedEntities = this.syncMetadataEngine.getCachedEntities(entityName);
    const pkStr = this.serializePrimaryKey(entityInfo, primaryKey);
    const cached = cachedEntities.find(e => this.serializePrimaryKey(entityInfo, e.GetAll()) === pkStr);
    return cached || null; // O(1)/O(K) in-memory check, 0 DB queries
  }
  
  // Fallback path (on-demand loading for lookups / uncached entities)
  const loadedEntity = await this.queryLoadFromDb(entityName, primaryKey);
  if (loadedEntity) {
    this.syncMetadataEngine.addEntityToCache(entityName, loadedEntity);
  }
  return loadedEntity;
}
```

#### resolveLookup Optimization
Use the lookup cache and scan the in-memory `BaseEngine` arrays:
```typescript
// sync-engine.ts
async resolveLookup(...): Promise<string> {
  const lookupCacheKey = this.buildLookupCacheKey(entityName, lookupFields);
  
  // 1. Lookup Cache Hit
  const cachedId = this.syncMetadataEngine.getCachedLookup(lookupCacheKey);
  if (cachedId) return cachedId;

  // 2. Scan in-memory BaseEngine array (if preloaded)
  if (this.syncMetadataEngine.isEntityPreloaded(entityName)) {
    const cachedEntities = this.syncMetadataEngine.getCachedEntities(entityName);
    for (const cachedEntity of cachedEntities) {
      if (this.matchesLookupFields(cachedEntity, lookupFields)) {
        const pkField = entityInfo.PrimaryKeys[0].Name;
        const id = cachedEntity.Get(pkField);
        this.syncMetadataEngine.setCachedLookup(lookupCacheKey, id);
        return id;
      }
    }
  }

  // 3. Fallback: points query to DB
  const resolvedId = await this.queryLookupFromDb(...);
  if (resolvedId) {
    this.syncMetadataEngine.setCachedLookup(lookupCacheKey, resolvedId);
  }
  return resolvedId;
}
```

#### Event-Driven Mutation Sync
* Because `BaseEngine` subscribes to the global event bus (`AutoRefresh: true`), it automatically captures `save` and `delete` events fired during `push()` (Phase 1 & 2).
* Because we override `canUseImmediateMutation` to return `true`, `BaseEngine` executes the array operations synchronously in-memory without invoking full-refresh database queries.
* New records and updates will automatically clone and sync. For deletions, we hook in a manual invalidation wrapper in `PushService`:
  ```typescript
  // PushService.ts
  if (deleteResult) {
    this.syncMetadataEngine.removeEntityFromCache(entityName, record.primaryKey);
  }
  ```

---

## Estimated Performance Impact

Using `BaseEngine` to drive `MetadataSync`'s caching:
* **Database round-trips**: Reduced significantly on typical sync workflows by replacing per-record existence checks with one filtered `RunView` per entity. Realized gains depend on the size and shape of the metadata tree being synced; the largest wins are on trees with many records of the same entity.
* **Code complexity**: Lowered by reusing the framework's `BaseEntity` event bus and built-in `RunViews` batching instead of a bespoke cache.
* **Reliability**: Caches stay synchronized across saves and deletes via the standardized `BaseEntity` event listener; the file cache is invalidated on write so subsequent passes see fresh content.

---

## Implementation deltas from this proposal

Code review surfaced a few corrections that landed in the shipped code but
are not reflected in the diagrams above. Read the production source for
canonical behavior; the highlights:

* **`canUseImmediateMutation` is scoped, not blanket.** The override only
  returns `true` for configs whose `PropertyName` starts with the
  `cached_` prefix this engine owns. Non-preload configs (none today, but
  a future subclass might add some) defer to `BaseEngine`'s default
  filter/orderby guard. Inline docs explain why the override is safe for
  our specific filter shape (`(ID='pk1') OR …`).
* **Lookup invalidation is scoped per entity.** `removeEntityFromCache`
  no longer clears the entire lookup cache; an entity → key reverse index
  drops only the lookups touching that entity. `setCachedLookup` accepts
  an optional `entityName` so callers register their entries in the
  index.
* **Lookup cache key is URI-encoded** to prevent collisions when field
  values contain `=` / `&` / `|`.
* **Falsy-PK cache hits work.** Callers use `cachedId !== undefined`
  rather than truthy checks, so legitimately-falsy PKs (empty string,
  `'0'`) are served from cache instead of forcing a re-query.
* **`serializePrimaryKey` guards `pk.Type`.** Undefined `Type` no longer
  blows up on `trim()`.
* **File cache is invalidated on write.** Every code path that writes
  back to a metadata JSON file (immediate and deferred) drops the cached
  snapshot via `invalidateCachedFile()`.
* **Preload file reads run in parallel** (concurrency cap = 16) instead
  of sequentially.
* **Provider plumbing.** `Config()` receives the provider from
  `SyncEngine.getProvider()` instead of reaching for the global
  `Metadata.Provider` directly — same effective provider in this
  single-process CLI, but keeps the wiring self-consistent.
* **Public helpers, stricter types.** `serializePrimaryKey`,
  `getUniquePrimaryKeys`, `buildBulkFilter`, and the new
  `buildBulkFilterChunks` accept `EntityInfo` and `Record<string, unknown>`
  instead of `any`. The dynamic per-entity cache slot is read/written
  through a narrow `Record<string, unknown>` cast (matching
  `BaseEngine`'s own pattern) instead of `(this as any)[propName]`.
