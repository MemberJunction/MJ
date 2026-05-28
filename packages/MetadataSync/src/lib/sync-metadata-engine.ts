/**
 * @fileoverview Upfront preloading + lookup/file caching for `mj sync push`.
 *
 * `SyncMetadataEngine` extends `BaseEngine` to piggy-back on its batched
 * `RunViews` loader and `BaseEntity` event-bus subscription. The push flow
 * uses it in three ways:
 *
 *   1. **Preload** — `Config()` scans every JSON file under each entity
 *      directory once, collects the set of entity names touched (including
 *      nested `relatedEntities`), and asks `BaseEngine.Load` to issue one
 *      unfiltered `RunView` per entity. We load *all* rows of each touched
 *      entity, not just the PKs mentioned in files — for two reasons:
 *
 *        (a) `mj sync` is for METADATA. The entities involved (Actions,
 *            Prompts, Agents, Templates, etc.) are inherently bounded —
 *            hundreds to low tens of thousands of rows per tenant, not
 *            millions. Loading everything is faster than computing and
 *            shipping a giant `WHERE IN (...)` clause.
 *        (b) `@lookup:` resolution often targets records that aren't in
 *            the local files (e.g. a category referenced by name). A
 *            full preload means those lookups hit the cache too.
 *
 *      The loaded `BaseEntity` instances live on dynamic properties named
 *      via {@link getPropertyNameForEntity}; lookups during the sync phase
 *      consult those arrays instead of round-tripping the DB.
 *
 *   2. **Event-driven mutation** — `BaseEngine` already wires up the global
 *      `BaseEntity` event bus. Because our configs carry no Filter/OrderBy,
 *      the base class's default `canUseImmediateMutation` path handles
 *      save/delete/remote-invalidate events automatically.
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

/** Concurrency cap for parallel file reads during preload. */
const FILE_READ_CONCURRENCY = 16;

/**
 * Emit a warning when any single preloaded entity comes back with more rows
 * than this. `mj sync` is for metadata — entities in this benchmark band
 * (Actions, Prompts, Templates, etc.) are bounded by design. Loading 100k+
 * rows of one entity into RAM is a signal that something is being synced
 * that shouldn't be (or the metadata set has grown beyond the tool's intent).
 */
const LARGE_ENTITY_WARN_THRESHOLD = 100_000;

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

  /** Non-fatal warnings collected during preload (malformed shapes, oversized entities). Drained by the caller after `Config()`. */
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
   * which fans the per-entity unfiltered views out over a single `RunViews`
   * batch under the hood. Then check each loaded slot for size and emit
   * warnings if anything came back larger than the metadata-scale threshold.
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
    const configs = await this.buildDynamicConfigs();
    const providerToUse = provider || this.ProviderToUse;

    if (configs.length > 0) {
      await this.Load(configs, providerToUse, forceRefresh, contextUser);
      this.warnOnOversizedSlots(configs);
    }
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
   * key in entity-cache dedup/removal lookups. UUID-typed components are
   * lower-cased to bridge SQL Server (upper) vs PG (lower).
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

  /**
   * Walk every entity referenced by metadata files (including nested
   * `relatedEntities`) and build one unfiltered `BaseEngine` config per
   * entity. Each config triggers a single `SELECT * FROM vw<Entity>`
   * (capped by `IgnoreMaxRows: true` in BaseEngine), pre-populating the
   * per-entity slot the sync path will read from.
   */
  private async buildDynamicConfigs(): Promise<Partial<BaseEnginePropertyConfig>[]> {
    const entitiesFound: Set<string> = new Set();

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

      await this.processFilesInParallel(files, entityConfig.entity, entitiesFound);
    }

    const configs: Partial<BaseEnginePropertyConfig>[] = [];
    for (const entityName of entitiesFound) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (!entityInfo) continue;

      this.markEntityAsPreloaded(entityName);
      configs.push({
        PropertyName: this.getPropertyNameForEntity(entityName),
        EntityName: entityName,
        Type: 'entity',
        ResultType: 'entity_object',
        // No Filter — load all rows. Metadata entities are bounded by design;
        // the few thousand-row tables we touch are faster to bulk-load than
        // to fence with a giant WHERE clause. See the module docstring for
        // the full reasoning.
        AutoRefresh: true
      });
    }

    return configs;
  }

  /**
   * After `BaseEngine.Load` finishes, walk the configs and check whether any
   * single preloaded entity exceeded the metadata-scale threshold. Emit a
   * warning so the operator knows their sync is loading something it
   * probably shouldn't be.
   */
  private warnOnOversizedSlots(configs: Partial<BaseEnginePropertyConfig>[]): void {
    for (const config of configs) {
      if (!config.PropertyName || !config.EntityName) continue;
      const list = (this as unknown as Record<string, unknown>)[config.PropertyName];
      if (!Array.isArray(list)) continue;
      if (list.length > LARGE_ENTITY_WARN_THRESHOLD) {
        this.warnings.push(
          `Preloaded ${list.length.toLocaleString()} rows of '${config.EntityName}'. mj sync is intended for metadata-scale entities (hundreds to low tens of thousands); this is large enough that you may want to confirm this entity belongs in a sync workflow.`
        );
      }
    }
  }

  /**
   * Recursively walk records collecting every entity name they (or their
   * `relatedEntities`) reference. We don't collect primary keys because
   * preload is unfiltered — knowing the entity is enough.
   *
   * Malformed `relatedEntities` shapes (non-array values) produce a warning
   * pointing at the offending file rather than silently being skipped.
   */
  private collectEntitiesRecursive(
    records: Array<Record<string, unknown>>,
    entityName: string,
    entitiesFound: Set<string>,
    filePath: string
  ): void {
    entitiesFound.add(entityName);

    for (const record of records) {
      const deleteRecord = record.deleteRecord as { delete?: boolean } | undefined;
      if (deleteRecord?.delete === true) {
        continue;
      }

      const relatedEntities = record.relatedEntities as Record<string, unknown> | undefined;
      if (!relatedEntities) continue;

      for (const [relatedEntityName, relatedRecords] of Object.entries(relatedEntities)) {
        if (Array.isArray(relatedRecords)) {
          this.collectEntitiesRecursive(
            relatedRecords as Array<Record<string, unknown>>,
            relatedEntityName,
            entitiesFound,
            filePath
          );
        } else {
          this.warnings.push(
            `Skipped preload for relatedEntities['${relatedEntityName}'] in ${filePath}: expected an array, got ${typeof relatedRecords}.`
          );
        }
      }
    }
  }

  /**
   * Process file reads in bounded-parallel batches. `fs.readJson` is I/O-bound;
   * doing this sequentially was the dominant cost on metadata trees with
   * thousands of small files.
   */
  private async processFilesInParallel(
    files: string[],
    entityName: string,
    entitiesFound: Set<string>
  ): Promise<void> {
    for (let i = 0; i < files.length; i += FILE_READ_CONCURRENCY) {
      const batch = files.slice(i, i + FILE_READ_CONCURRENCY);
      const parsed = await Promise.all(batch.map(filePath => this.readAndPreprocessFile(filePath)));
      for (const { filePath, rawData, fileData } of parsed) {
        this.cacheFile(filePath, rawData, fileData);
        const records = Array.isArray(fileData) ? fileData : [fileData];
        this.collectEntitiesRecursive(records as Array<Record<string, unknown>>, entityName, entitiesFound, filePath);
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
