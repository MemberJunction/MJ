/**
 * @fileoverview Upfront preloading + lookup/file caching for `mj sync push`.
 *
 * `SyncMetadataEngine` extends `BaseEngine` to piggy-back on its batched
 * `RunViews` loader and `BaseEntity` event-bus subscription. The push flow
 * uses it in three ways:
 *
 *   1. **Preload** — `Config()` scans every JSON file under each entity
 *      directory once, collects the primary keys, groups them by entity,
 *      and asks `BaseEngine.Load` to issue one filtered `RunView` per
 *      entity. The loaded `BaseEntity` instances live on dynamic properties
 *      named via {@link getPropertyNameForEntity}; lookups during the sync
 *      phase consult those arrays instead of round-tripping the DB.
 *
 *   2. **Event-driven mutation** — `BaseEngine` already wires up the global
 *      `BaseEntity` event bus; saves/deletes fired during the push update
 *      our cached arrays in place. See {@link canUseImmediateMutation} for
 *      why bypassing the default filter/orderby guard is safe here.
 *
 *   3. **Lookup + file caches** — Resolved `@lookup` keys are memoized in
 *      {@link lookupCache} and parsed file contents are memoized in
 *      {@link fileDataCache}, so validation and sync passes don't re-read
 *      or re-parse the same file twice.
 *
 * @module sync-metadata-engine
 */
import {
  BaseEngine,
  BaseEnginePropertyConfig,
  BaseEntity,
  EntityInfo,
  EntityFieldInfo,
  IMetadataProvider,
  UserInfo
} from '@memberjunction/core';
import { IsUuidSQLType } from '@memberjunction/sql-dialect';
import fastGlob from 'fast-glob';
import fs from 'fs-extra';
import { JsonPreprocessor } from './json-preprocessor';
import { loadEntityConfig } from '../config';
import { SyncEngine } from './sync-engine';

/** Prefix used to namespace the dynamic per-entity cache properties on the engine instance. */
const CACHED_ENTITY_PROP_PREFIX = 'cached_';

/** Max number of PK predicates per `RunView` filter — large filters hurt the query planner and can hit SQL Server's expression limit. */
const MAX_PKS_PER_BULK_FILTER = 500;

/** Concurrency cap for parallel file reads during preload. */
const FILE_READ_CONCURRENCY = 16;

/** Cached file contents produced by the preload scan. */
export interface CachedFile {
  /** The on-disk JSON, exactly as parsed (preserves `@file:` / `@include` directives). */
  rawData: unknown;
  /** The fully-resolved JSON after `@include` preprocessing. Same reference as `rawData` when the file has no `@include`s. */
  fileData: unknown;
}

/**
 * Coordinates upfront batch-preloading of `BaseEntity` instances and in-memory
 * caches for `mj sync push`. See module docstring for the full picture.
 */
export class SyncMetadataEngine extends BaseEngine<SyncMetadataEngine> {
  private syncEngine!: SyncEngine;
  private entityDirs: string[] = [];
  private preloadedEntityNames: Set<string> = new Set();
  private lookupCache: Map<string, string> = new Map();
  private fileDataCache: Map<string, CachedFile> = new Map();

  /** Reverse index used to scope lookup invalidation on delete: entity name → set of lookup keys touching that entity. */
  private lookupKeysByEntity: Map<string, Set<string>> = new Map();

  /** Reverse index from lookup key → resolved PK, used to drop only the lookups that pointed at a deleted record. */
  private lookupValuesByKey: Map<string, string> = new Map();

  public initializeEngine(syncEngine: SyncEngine): void {
    this.syncEngine = syncEngine;
  }

  public setEntityDirs(dirs: string[]): void {
    this.entityDirs = dirs;
  }

  /**
   * Property name on this engine instance under which cached `BaseEntity[]`
   * arrays for the given entity are stored. `BaseEngine.applyImmediateMutation`
   * reads/writes these slots directly, so we use a deterministic naming scheme.
   */
  public getPropertyNameForEntity(entityName: string): string {
    return `${CACHED_ENTITY_PROP_PREFIX}${entityName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  /**
   * Build the dynamic configuration list and trigger `BaseEngine.Load` —
   * which fans the per-entity filtered views out over a single `RunViews`
   * batch under the hood.
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
   * Allow in-place cache mutation even though our configs carry a `Filter`.
   *
   * The base class returns `false` whenever a config has a Filter or OrderBy
   * because the saved entity might no longer match (filter) or might need to
   * re-sort (orderby). Our filters are always `(ID='pk1') OR (ID='pk2') ...`
   * built from the PKs we preloaded — which means:
   *
   *  - `update` events: the PK is unchanged, so the entity still matches the
   *    filter; splicing in place is safe.
   *  - `delete` events: same PK; safe.
   *  - `create` events: the new PK was *not* in the preload list, so the
   *    filter would reject it on a re-fetch. We deliberately accept this:
   *    the cache is best-effort for the duration of the sync, and we want
   *    newly-created records visible to subsequent lookups in the same run.
   *
   * We don't override behavior for any non-preload configs (defensive — the
   * class doesn't load any today but a future subclass might).
   */
  protected override canUseImmediateMutation(
    config: BaseEnginePropertyConfig,
    _skipAdditionalLoadingCheck: boolean = false
  ): boolean {
    if (config.PropertyName?.startsWith(CACHED_ENTITY_PROP_PREFIX)) {
      return true;
    }
    return super.canUseImmediateMutation(config, _skipAdditionalLoadingCheck);
  }

  public markEntityAsPreloaded(entityName: string): void {
    this.preloadedEntityNames.add(entityName);
  }

  public isEntityPreloaded(entityName: string): boolean {
    return this.preloadedEntityNames.has(entityName);
  }

  public getCachedEntities(entityName: string): BaseEntity[] {
    const propName = this.getPropertyNameForEntity(entityName);
    const list = (this as unknown as Record<string, unknown>)[propName];
    return Array.isArray(list) ? (list as BaseEntity[]) : [];
  }

  public getCachedFile(filePath: string): CachedFile | undefined {
    return this.fileDataCache.get(filePath);
  }

  public cacheFile(filePath: string, rawData: unknown, fileData: unknown): void {
    this.fileDataCache.set(filePath, { rawData, fileData });
  }

  /**
   * Invalidate the cached file content for a path. Call this immediately
   * before (or after) any code path that writes back to a metadata JSON
   * file during the sync, so a subsequent reader gets fresh contents.
   */
  public invalidateCachedFile(filePath: string): void {
    this.fileDataCache.delete(filePath);
  }

  public addEntityToCache(entityName: string, entity: BaseEntity): void {
    const propName = this.getPropertyNameForEntity(entityName);
    const slot = (this as unknown as Record<string, unknown>);
    if (!Array.isArray(slot[propName])) {
      slot[propName] = [];
    }
    const list = slot[propName] as BaseEntity[];
    const index = list.findIndex(e => e === entity || e.PrimaryKey.Equals(entity.PrimaryKey));
    if (index >= 0) {
      list[index] = entity;
    } else {
      list.push(entity);
    }
  }

  public removeEntityFromCache(entityName: string, primaryKey: Record<string, unknown>): void {
    const propName = this.getPropertyNameForEntity(entityName);
    const list = (this as unknown as Record<string, unknown>)[propName] as BaseEntity[] | undefined;
    if (list) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (entityInfo) {
        const pkStr = this.serializePrimaryKey(entityInfo, primaryKey);
        const index = list.findIndex(e => this.serializePrimaryKey(entityInfo, e.GetAll()) === pkStr);
        if (index >= 0) {
          list.splice(index, 1);
        }
      }
    }
    this.invalidateLookupsForEntity(entityName);
  }

  public getCachedLookup(key: string): string | undefined {
    return this.lookupCache.get(key);
  }

  public setCachedLookup(key: string, id: string, entityName?: string): void {
    this.lookupCache.set(key, id);
    this.lookupValuesByKey.set(key, id);
    if (entityName) {
      const normalized = entityName.toLowerCase();
      let bucket = this.lookupKeysByEntity.get(normalized);
      if (!bucket) {
        bucket = new Set<string>();
        this.lookupKeysByEntity.set(normalized, bucket);
      }
      bucket.add(key);
    }
  }

  public clearLookupCache(): void {
    this.lookupCache.clear();
    this.lookupKeysByEntity.clear();
    this.lookupValuesByKey.clear();
  }

  /**
   * Invalidate only the lookup entries that touch a given entity. Avoids
   * the perf cliff of clearing the whole lookup cache on every delete.
   *
   * Note: if `setCachedLookup` was called without an `entityName`, those
   * entries aren't in the reverse index and won't be cleared here. The
   * `resolveLookup` integration always passes the entity name, so this
   * is only a concern for callers that bypass that path.
   */
  public invalidateLookupsForEntity(entityName: string): void {
    const normalized = entityName.toLowerCase();
    const bucket = this.lookupKeysByEntity.get(normalized);
    if (!bucket) return;
    for (const key of bucket) {
      this.lookupCache.delete(key);
      this.lookupValuesByKey.delete(key);
    }
    this.lookupKeysByEntity.delete(normalized);
  }

  /**
   * Canonical string representation of a record's primary key, used as the
   * key in dedup sets, file caches, and entity-cache lookups. UUID-typed
   * components are lower-cased to bridge SQL Server (upper) vs PG (lower).
   */
  public serializePrimaryKey(entityInfo: EntityInfo, primaryKey: Record<string, unknown>): string {
    const parts = entityInfo.PrimaryKeys.map((pk: EntityFieldInfo) => {
      const val = primaryKey[pk.Name];
      let valStr = val !== undefined && val !== null ? String(val) : '';
      const pkType = pk.Type ?? '';
      const normalizedType = pkType.trim().toLowerCase();
      if (IsUuidSQLType(pkType) || normalizedType === 'uniqueidentifier' || normalizedType === 'uuid') {
        valStr = valStr.toLowerCase().trim();
      }
      return `${pk.Name.toLowerCase()}=${valStr}`;
    });
    parts.sort();
    return parts.join('|');
  }

  public getUniquePrimaryKeys(
    entityInfo: EntityInfo,
    pks: Array<Record<string, unknown>>
  ): Array<Record<string, unknown>> {
    const seen = new Set<string>();
    const unique: Array<Record<string, unknown>> = [];
    for (const pk of pks) {
      const serialized = this.serializePrimaryKey(entityInfo, pk);
      if (!seen.has(serialized)) {
        seen.add(serialized);
        unique.push(pk);
      }
    }
    return unique;
  }

  /**
   * Build a SQL `WHERE` fragment matching every PK in `uniquePks`. The
   * caller is responsible for chunking — see {@link MAX_PKS_PER_BULK_FILTER}
   * and {@link buildBulkFilterChunks}.
   */
  public buildBulkFilter(entityInfo: EntityInfo, uniquePks: Array<Record<string, unknown>>): string {
    const filterParts: string[] = [];
    for (const pk of uniquePks) {
      const pkParts: string[] = [];
      for (const pkField of entityInfo.PrimaryKeys) {
        const val = pk[pkField.Name];
        const quotes = pkField.NeedsQuotes ? "'" : '';
        const escapedVal = pkField.NeedsQuotes && typeof val === 'string' ? val.replace(/'/g, "''") : val;
        pkParts.push(`${pkField.Name} = ${quotes}${escapedVal}${quotes}`);
      }
      filterParts.push(`(${pkParts.join(' AND ')})`);
    }
    return filterParts.join(' OR ');
  }

  /**
   * Split `uniquePks` into filter strings of at most {@link MAX_PKS_PER_BULK_FILTER}
   * predicates each. Avoids enormous OR clauses that confuse the query planner
   * or push past SQL Server's expression-tree limit.
   */
  public buildBulkFilterChunks(
    entityInfo: EntityInfo,
    uniquePks: Array<Record<string, unknown>>,
    chunkSize: number = MAX_PKS_PER_BULK_FILTER
  ): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < uniquePks.length; i += chunkSize) {
      const slice = uniquePks.slice(i, i + chunkSize);
      chunks.push(this.buildBulkFilter(entityInfo, slice));
    }
    return chunks;
  }

  private extractPrimaryKeysRecursive(
    records: Array<Record<string, unknown>>,
    entityName: string,
    keysByEntity: Map<string, Array<Record<string, unknown>>>
  ): void {
    let list = keysByEntity.get(entityName);
    if (!list) {
      list = [];
      keysByEntity.set(entityName, list);
    }

    for (const record of records) {
      const deleteRecord = record.deleteRecord as { delete?: boolean } | undefined;
      if (deleteRecord?.delete === true) {
        continue;
      }

      const primaryKey = record.primaryKey as Record<string, unknown> | undefined;
      if (primaryKey && Object.keys(primaryKey).length > 0) {
        list.push(primaryKey);
      }

      const relatedEntities = record.relatedEntities as Record<string, Array<Record<string, unknown>>> | undefined;
      if (relatedEntities) {
        for (const [relatedEntityName, relatedRecords] of Object.entries(relatedEntities)) {
          this.extractPrimaryKeysRecursive(relatedRecords, relatedEntityName, keysByEntity);
        }
      }
    }
  }

  /**
   * Reads every JSON file under each configured entity dir (in parallel,
   * concurrency-capped), caches the parsed + `@include`-resolved content,
   * collects primary keys (including nested `relatedEntities`), and assembles
   * the `BaseEngine` configs that drive the bulk preload.
   */
  private async buildDynamicConfigs(): Promise<Partial<BaseEnginePropertyConfig>[]> {
    const keysByEntity: Map<string, Array<Record<string, unknown>>> = new Map();
    const configs: Partial<BaseEnginePropertyConfig>[] = [];

    for (const entityDir of this.entityDirs) {
      const entityConfig = await loadEntityConfig(entityDir);
      if (!entityConfig) continue;

      const pattern = entityConfig.filePattern || '*.json';
      const files = await fastGlob(pattern, {
        cwd: entityDir,
        absolute: true,
        onlyFiles: true,
        dot: true,
        ignore: ['**/node_modules/**', '**/.mj-*.json']
      });

      await this.processFilesInParallel(files, entityConfig.entity, keysByEntity);
    }

    for (const [entityName, pks] of keysByEntity.entries()) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (!entityInfo || pks.length === 0) continue;

      const uniquePks = this.getUniquePrimaryKeys(entityInfo, pks);
      if (uniquePks.length === 0) continue;

      this.markEntityAsPreloaded(entityName);

      // BaseEngine writes each load into a single property slot, so we use
      // one config per entity. {@link buildBulkFilterChunks} exists for
      // callers that need to chunk manually (e.g. > MAX_PKS_PER_BULK_FILTER
      // PKs in a single entity); the realistic sync workload stays under
      // that limit today so we issue one filter here.
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

  /**
   * Process file reads in bounded-parallel batches. `fs.readJson` is I/O-bound;
   * doing this sequentially was the dominant cost on metadata trees with
   * thousands of small files.
   */
  private async processFilesInParallel(
    files: string[],
    entityName: string,
    keysByEntity: Map<string, Array<Record<string, unknown>>>
  ): Promise<void> {
    for (let i = 0; i < files.length; i += FILE_READ_CONCURRENCY) {
      const batch = files.slice(i, i + FILE_READ_CONCURRENCY);
      const parsed = await Promise.all(batch.map(filePath => this.readAndPreprocessFile(filePath)));
      for (const { filePath, rawData, fileData } of parsed) {
        this.cacheFile(filePath, rawData, fileData);
        const records = Array.isArray(fileData) ? fileData : [fileData];
        this.extractPrimaryKeysRecursive(records as Array<Record<string, unknown>>, entityName, keysByEntity);
      }
    }
  }

  private async readAndPreprocessFile(
    filePath: string
  ): Promise<{ filePath: string; rawData: unknown; fileData: unknown }> {
    const rawData = await fs.readJson(filePath);
    let fileData: unknown = rawData;

    const jsonString = JSON.stringify(rawData);
    const hasIncludes = jsonString.includes('"@include"') || jsonString.includes('"@include.');

    if (hasIncludes) {
      const preprocessor = new JsonPreprocessor();
      fileData = await preprocessor.processFile(filePath);
    }

    return { filePath, rawData, fileData };
  }
}
