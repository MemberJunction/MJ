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
import { GetDialect, IsUuidSQLType, SQLDialect } from '@memberjunction/sql-dialect';
import { resolveDbPlatformFromEnv } from '@memberjunction/generic-database-provider';
import fastGlob from 'fast-glob';
import fs from 'fs-extra';
import { JsonPreprocessor } from './json-preprocessor';
import { loadEntityConfig } from '../config';
import { SyncEngine } from './sync-engine';

/** Prefix used to namespace the dynamic per-entity cache properties on the engine instance. */
const CACHED_ENTITY_PROP_PREFIX = 'cached_';

/**
 * Soft cap on PKs we'll pack into a single preload filter. Above this we skip
 * preload for that entity entirely (cache is best-effort; the per-record path
 * still works). The realistic sync workload stays well under this; the cap
 * exists to keep us off SQL Server's expression-tree limit and the planner's
 * worst-case OR-explosion paths.
 */
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

  /** Non-fatal warnings collected during preload (malformed shapes, skipped entities). Drained by the caller after `Config()`. */
  private warnings: string[] = [];

  public initializeEngine(syncEngine: SyncEngine): void {
    this.syncEngine = syncEngine;
  }

  public setEntityDirs(dirs: string[]): void {
    this.entityDirs = dirs;
  }

  /** Returns and clears the warnings collected during the last preload run. */
  public drainWarnings(): string[] {
    const out = this.warnings;
    this.warnings = [];
    return out;
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
    skipAdditionalLoadingCheck: boolean = false
  ): boolean {
    if (config.PropertyName?.startsWith(CACHED_ENTITY_PROP_PREFIX)) {
      return true;
    }
    return super.canUseImmediateMutation(config, skipAdditionalLoadingCheck);
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
    // `PrimaryKey.Equals` requires the entity to have a populated composite
    // key; if either side is missing one we fall back to reference equality
    // only (the entity might not be saved yet, in which case no dedup is
    // possible anyway).
    const incomingKey = entity.PrimaryKey;
    const index = list.findIndex(e => {
      if (e === entity) return true;
      const existingKey = e.PrimaryKey;
      if (!incomingKey || !existingKey) return false;
      return existingKey.Equals(incomingKey);
    });
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
   * Build a SQL `WHERE` fragment matching every PK in `uniquePks`.
   *
   * String/UUID/date values are quoted via the active dialect's
   * `QuoteStringLiteral` (centralizes the `''` doubling rule). Numeric and
   * boolean PKs are shape-validated before being inlined so a malformed
   * metadata file can't smuggle arbitrary SQL through an unquoted PK slot.
   *
   * Throws on a non-numeric value for a non-quoted PK type. Callers in this
   * file catch and skip preload for that entity — the per-record path still
   * works.
   */
  public buildBulkFilter(entityInfo: EntityInfo, uniquePks: Array<Record<string, unknown>>): string {
    const dialect = GetDialect(resolveDbPlatformFromEnv() ?? 'sqlserver');
    const filterParts: string[] = [];
    for (const pk of uniquePks) {
      const pkParts: string[] = [];
      for (const pkField of entityInfo.PrimaryKeys) {
        const literal = this.formatPKLiteral(pkField, pk[pkField.Name], dialect);
        pkParts.push(`${pkField.Name} = ${literal}`);
      }
      filterParts.push(`(${pkParts.join(' AND ')})`);
    }
    return filterParts.join(' OR ');
  }

  /**
   * Format a single PK field value as a SQL literal. NeedsQuotes drives the
   * branch — quoted types go through the dialect's escape; unquoted types
   * must shape-check as numeric/boolean.
   */
  private formatPKLiteral(pkField: EntityFieldInfo, val: unknown, dialect: SQLDialect): string {
    if (pkField.NeedsQuotes) {
      const strVal = val !== undefined && val !== null ? String(val) : '';
      return dialect.QuoteStringLiteral(strVal);
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      return String(val);
    }
    if (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val)) {
      return val;
    }
    if (typeof val === 'boolean') {
      return val ? '1' : '0';
    }
    throw new Error(
      `Invalid primary key value for ${pkField.Name} (type ${pkField.Type}): expected numeric/boolean, got ${typeof val} (${JSON.stringify(val)})`
    );
  }

  private extractPrimaryKeysRecursive(
    records: Array<Record<string, unknown>>,
    entityName: string,
    keysByEntity: Map<string, Array<Record<string, unknown>>>,
    filePath: string
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

      const relatedEntities = record.relatedEntities as Record<string, unknown> | undefined;
      if (relatedEntities) {
        for (const [relatedEntityName, relatedRecords] of Object.entries(relatedEntities)) {
          if (Array.isArray(relatedRecords)) {
            this.extractPrimaryKeysRecursive(
              relatedRecords as Array<Record<string, unknown>>,
              relatedEntityName,
              keysByEntity,
              filePath
            );
          } else {
            // Malformed shape: relatedEntities[X] must be an array. Validation
            // will catch this eventually, but if preload runs first the user
            // gets confusing cache-miss behavior instead of a pointer to the
            // bad file. Surface it now.
            this.warnings.push(
              `Skipped preload for relatedEntities['${relatedEntityName}'] in ${filePath}: expected an array, got ${typeof relatedRecords}.`
            );
          }
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

      // BaseEngine writes each load into a single property slot, so we use
      // one config per entity. Above the threshold we skip preload for this
      // entity (no config pushed, not marked preloaded) — the per-record
      // path in SyncEngine will resolve lookups/loads against the DB the
      // old way. Slower than preload, but correct, and avoids submitting a
      // pathologically large OR clause.
      if (uniquePks.length > MAX_PKS_PER_BULK_FILTER) {
        this.warnings.push(
          `Skipped preload for '${entityName}': ${uniquePks.length} primary keys exceeds threshold of ${MAX_PKS_PER_BULK_FILTER}. Falling back to per-record lookups for this entity.`
        );
        continue;
      }

      let filter: string;
      try {
        filter = this.buildBulkFilter(entityInfo, uniquePks);
      } catch (err) {
        // A malformed PK in any one record poisons the whole filter — skip
        // preload for the entity and let the per-record path surface the
        // real error against the offending record.
        this.warnings.push(
          `Skipped preload for '${entityName}': ${err instanceof Error ? err.message : String(err)}. Falling back to per-record lookups.`
        );
        continue;
      }

      this.markEntityAsPreloaded(entityName);
      const propName = this.getPropertyNameForEntity(entityName);
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
        this.extractPrimaryKeysRecursive(records as Array<Record<string, unknown>>, entityName, keysByEntity, filePath);
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
