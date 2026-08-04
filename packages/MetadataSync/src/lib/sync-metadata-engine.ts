/**
 * @fileoverview Upfront preloading + lookup/file caching for `mj sync push`.
 *
 * `SyncMetadataEngine` extends `BaseEngine` to piggy-back on its batched
 * `RunViews` loader and `BaseEntity` event-bus subscription. The push flow
 * uses it in three ways:
 *
 *   1. **Preload** — `Config()` scans every JSON file under each entity
 *      directory once, collects the set of entity names touched (including
 *      nested `relatedEntities`), and populates one in-memory slot per
 *      entity. We want *all* rows of each touched entity, not just the PKs
 *      mentioned in files — for two reasons:
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
 *      Each slot is filled one of two ways:
 *
 *        - **Delegation (preferred)** — the CLI bootstrap runs
 *          `StartupManager.Startup()`, which Config()s every
 *          `@RegisterForStartup` engine (AIEngineBase, QueryEngine,
 *          IntegrationEngineBase, …) seconds before the push begins. Those
 *          engines already hold full, unfiltered `entity_object` caches of
 *          many of the entities we touch. Rather than re-querying the same
 *          rows, {@link delegateEntityIfCached} asks
 *          `BaseEngineRegistry.FindCachedEntity` for a loaded engine with an
 *          unfiltered, unordered, BaseEntity-typed cache and proxies our
 *          slot to that engine's **live array** (resolved per-access via
 *          engine + property name, so donor-side array reassignment can't
 *          strand us). Live references are safe because every accepted
 *          donor config passes `canUseImmediateMutation` — the donor's own
 *          event subscription maintains the array in place on save/delete,
 *          and our explicit {@link addEntityToCache} writes are
 *          PK-deduped on both sides.
 *
 *        - **Self-load (fallback)** — entities no loaded engine caches
 *          (Templates, Actions, Entity Fields, …) are loaded by
 *          `BaseEngine.Load` issuing one unfiltered `RunView` per entity,
 *          exactly as before.
 *
 *      Either way, the `BaseEntity` instances are reachable through
 *      {@link getCachedEntities} / {@link findCachedByPrimaryKey}; lookups
 *      during the sync phase consult those arrays instead of round-tripping
 *      the DB. Self-loaded slots live on dynamic properties named via
 *      {@link getPropertyNameForEntity}.
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
  BaseEngineRegistry,
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
 * A slot whose data is served from another loaded engine's cache instead of
 * a self-issued `RunView`. We keep the donor engine + property name (not a
 * captured array reference) so every access resolves the donor's **current**
 * array — a donor-side full refresh that reassigns the property can't leave
 * us pointing at an orphaned snapshot.
 */
interface DelegatedSlot {
  /** The donor engine instance (a loaded BaseEngine singleton). */
  engine: Record<string, unknown>;
  /** The donor's property holding the cached `BaseEntity[]` for this entity. */
  propertyName: string;
  /** Donor class name — surfaced in {@link SyncMetadataEngine.getDelegationSummary}. */
  engineClassName: string;
}

/** One delegated entity → donor engine pairing, for logging/diagnostics. */
export interface DelegationSummaryEntry {
  entityName: string;
  engineClassName: string;
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

  /**
   * Entities whose slot proxies a donor engine's live cache instead of a
   * self-loaded array. Populated by {@link delegateEntityIfCached} during
   * `Config()`; consulted first by {@link resolveSlot}.
   */
  private delegatedSlots: Map<string, DelegatedSlot> = new Map();

  /** Reverse index used to scope lookup invalidation on delete: entity name → set of lookup keys touching that entity. */
  private lookupKeysByEntity: Map<string, Set<string>> = new Map();

  /**
   * O(1) PK lookup index built after preload completes. Keyed by entity
   * name, then by `serializePrimaryKey(...)` of the entity's own PK.
   *
   * Without this, `loadEntity` falls into an `Array.find(... GetAll())`
   * scan over the entire preloaded slot, which is O(N) per record being
   * processed — i.e. O(N×K) overall. For entities like `MJ: Integration
   * Object Fields` where DB-wide row count can be 10×+ the file count,
   * that turns into billions of comparisons (38 min for the integrations
   * dir alone in real-world measurement).
   *
   * Kept in sync by {@link addEntityToCache} / {@link removeEntityFromCache}.
   * `findCachedByPrimaryKey` falls back to an array scan on Map miss so
   * we tolerate drift from `BaseEngine`'s event-driven slot mutations
   * (which mutate the array directly without going through our helpers).
   */
  private pkIndexes: Map<string, Map<string, BaseEntity>> = new Map();

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
   * Scan the metadata tree for touched entities, then fill one slot per
   * entity: delegate to an already-loaded engine's cache when
   * {@link delegateEntityIfCached} finds a suitable donor, otherwise
   * self-load via `BaseEngine.Load` (which fans the per-entity unfiltered
   * views out over a single `RunViews` batch under the hood). Finally,
   * build the PK indexes and emit size warnings over BOTH kinds of slot.
   *
   * Note: `forceRefresh` only governs the self-loaded entities. Delegated
   * data was loaded by `StartupManager` during this same process bootstrap,
   * which satisfies preload's "current as of process start" freshness
   * requirement without a second round of identical queries.
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
    const entityNames = await this.collectTouchedEntities();
    const configs = this.partitionEntities(entityNames);
    const providerToUse = provider || this.ProviderToUse;

    if (configs.length > 0) {
      await this.Load(configs, providerToUse, forceRefresh, contextUser);
    }
    if (this.preloadedEntityNames.size > 0) {
      this.buildPKIndexes(this.preloadedEntityNames);
      this.warnOnOversizedSlots(this.preloadedEntityNames);
    }
    return true;
  }

  /**
   * Build the per-entity PK → entity Map from each populated slot
   * (self-loaded and delegated alike). Runs once after `Config()` fills
   * the slots. The cost (one walk over the arrays, building Map entries)
   * is trivial compared to the per-record-lookup savings it enables
   * downstream. Delegated arrays mutate out-of-band (the donor's event
   * subscription replaces saved instances with clones) — that drift is
   * absorbed by {@link findCachedByPrimaryKey}'s scan-and-repair fallback.
   */
  private buildPKIndexes(entityNames: Iterable<string>): void {
    for (const entityName of entityNames) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (!entityInfo) continue;
      const list = this.resolveSlot(entityName);
      if (!list) continue;

      const index = new Map<string, BaseEntity>();
      for (const entity of list) {
        try {
          const pkStr = this.serializePrimaryKey(entityInfo, entity.GetAll());
          index.set(pkStr, entity);
        } catch {
          // Defensive: a malformed cached entity shouldn't break index
          // construction for the whole entity. The array scan fallback
          // will still find it if needed.
        }
      }
      this.pkIndexes.set(entityName, index);
    }
  }

  /**
   * O(1) PK lookup against the preload cache, with an array-scan
   * fallback so we tolerate drift from `BaseEngine` event-driven
   * slot mutations that don't go through our `addEntityToCache` helper.
   *
   * Returns `null` when the entity isn't preloaded or the PK isn't in
   * the cache — callers fall through to a DB load.
   */
  public findCachedByPrimaryKey(entityName: string, primaryKey: Record<string, unknown>): BaseEntity | null {
    if (!this.isEntityPreloaded(entityName)) return null;
    const entityInfo = this.syncEngine.getEntityInfo(entityName);
    if (!entityInfo) return null;

    const pkStr = this.serializePrimaryKey(entityInfo, primaryKey);
    const index = this.pkIndexes.get(entityName);
    const hit = index?.get(pkStr);
    if (hit) return hit;

    // Fallback: someone (BaseEngine event handler) might have spliced
    // a new entity into the array slot without updating the index.
    // Linear scan once, and if we find a match, repair the index so
    // subsequent hits stay O(1).
    const list = this.getCachedEntities(entityName);
    for (const entity of list) {
      try {
        if (this.serializePrimaryKey(entityInfo, entity.GetAll()) === pkStr) {
          index?.set(pkStr, entity);
          return entity;
        }
      } catch {
        // skip malformed entries
      }
    }
    return null;
  }

  public markEntityAsPreloaded(entityName: string): void {
    this.preloadedEntityNames.add(entityName);
  }

  public isEntityPreloaded(entityName: string): boolean {
    return this.preloadedEntityNames.has(entityName);
  }

  /**
   * Try to serve an entity's slot from another loaded engine's cache instead
   * of re-querying the DB. Accepts the first `BaseEngineRegistry` match that
   * holds the **complete** entity set in a live-mutation-safe shape:
   *
   * - `unfilteredOnly` — a `Filter` means a subset, useless as a full cache.
   * - no `OrderBy` — ordered configs fail `canUseImmediateMutation`, so the
   *   donor responds to entity events with a full refresh that *reassigns*
   *   the array property mid-push instead of mutating it in place.
   * - not `ResultType: 'simple'` and rows are `BaseEntity` instances — the
   *   sync phase calls `.Get()` / `.PrimaryKey` on cached rows.
   * - not ourselves — a prior run's own slot must not masquerade as a donor.
   *
   * Returns true when a donor was registered; the caller then skips the
   * self-load config for this entity.
   */
  public delegateEntityIfCached(entityName: string): boolean {
    const matches = BaseEngineRegistry.Instance.FindCachedEntity(entityName, { unfilteredOnly: true });
    for (const match of matches) {
      if (match.engine === this) continue;
      if (!match.config.PropertyName) continue;
      if (match.config.OrderBy) continue;
      if (match.config.ResultType === 'simple') continue;
      if (match.records.length > 0 && !(match.records[0] instanceof BaseEntity)) continue;

      this.delegatedSlots.set(entityName, {
        engine: match.engine as Record<string, unknown>,
        propertyName: match.config.PropertyName,
        engineClassName: match.engineClassName
      });
      return true;
    }
    return false;
  }

  /** Delegated entity → donor engine pairings from the last `Config()` run, for logging. */
  public getDelegationSummary(): DelegationSummaryEntry[] {
    return Array.from(this.delegatedSlots.entries()).map(([entityName, slot]) => ({
      entityName,
      engineClassName: slot.engineClassName
    }));
  }

  /**
   * The single resolution point for an entity's backing array: the donor
   * engine's live array when delegated (re-read per access — see
   * {@link DelegatedSlot}), our own `cached_*` slot otherwise. Returns
   * `undefined` when no slot exists yet.
   */
  private resolveSlot(entityName: string): BaseEntity[] | undefined {
    const delegated = this.delegatedSlots.get(entityName);
    if (delegated) {
      const live = delegated.engine[delegated.propertyName];
      if (Array.isArray(live)) return live as BaseEntity[];
      // Defensive: donor slot vanished — fall through to our own slot.
    }
    const propName = this.getPropertyNameForEntity(entityName);
    const list = (this as unknown as Record<string, unknown>)[propName];
    return Array.isArray(list) ? (list as BaseEntity[]) : undefined;
  }

  public getCachedEntities(entityName: string): BaseEntity[] {
    return this.resolveSlot(entityName) ?? [];
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
    // Delegated entities write into the donor's live array: PK-dedup below
    // prevents a duplicate against rows the donor already holds, and the
    // donor's own save-event handler sees our instance by reference and
    // no-ops rather than double-inserting.
    let list = this.resolveSlot(entityName);
    if (!list) {
      const propName = this.getPropertyNameForEntity(entityName);
      const slot = (this as unknown as Record<string, unknown>);
      slot[propName] = [];
      list = slot[propName] as BaseEntity[];
    }
    // `PrimaryKey.Equals` requires the entity to have a populated composite
    // key; if either side is missing one we fall back to reference equality
    // only (the entity might not be saved yet, in which case no dedup is
    // possible anyway).
    const incomingKey = entity.PrimaryKey;
    const arrayIdx = list.findIndex(e => {
      if (e === entity) return true;
      const existingKey = e.PrimaryKey;
      if (!incomingKey || !existingKey) return false;
      return existingKey.Equals(incomingKey);
    });
    if (arrayIdx >= 0) {
      list[arrayIdx] = entity;
    } else {
      list.push(entity);
    }

    // Keep the PK index in sync. Skip silently when serializePrimaryKey
    // throws — typically a half-built entity with no PK populated yet.
    try {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (entityInfo) {
        const pkStr = this.serializePrimaryKey(entityInfo, entity.GetAll());
        let index = this.pkIndexes.get(entityName);
        if (!index) {
          index = new Map<string, BaseEntity>();
          this.pkIndexes.set(entityName, index);
        }
        index.set(pkStr, entity);
      }
    } catch { /* defensive: malformed entity */ }
  }

  public removeEntityFromCache(entityName: string, primaryKey: Record<string, unknown>): void {
    // For delegated entities this splices the donor's live array; the donor's
    // delete-event handler tolerates the row already being gone.
    const list = this.resolveSlot(entityName);
    const entityInfo = this.syncEngine.getEntityInfo(entityName);
    let pkStr: string | null = null;
    if (entityInfo) {
      pkStr = this.serializePrimaryKey(entityInfo, primaryKey);
      if (list) {
        const arrayIdx = list.findIndex(e => this.serializePrimaryKey(entityInfo, e.GetAll()) === pkStr);
        if (arrayIdx >= 0) {
          list.splice(arrayIdx, 1);
        }
      }
    }
    if (pkStr !== null) {
      this.pkIndexes.get(entityName)?.delete(pkStr);
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
   * `relatedEntities`) and return the set of entity names touched by this
   * run. Also primes the file cache as a side effect of the scan.
   */
  private async collectTouchedEntities(): Promise<Set<string>> {
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

    return entitiesFound;
  }

  /**
   * Decide, per touched entity, whether the slot delegates to an
   * already-loaded engine's cache or self-loads. Returns the `BaseEngine`
   * configs for the self-load remainder; each one triggers a single
   * `SELECT * FROM vw<Entity>` (capped by `IgnoreMaxRows: true` in
   * BaseEngine), pre-populating the per-entity slot the sync path reads.
   */
  private partitionEntities(entityNames: Set<string>): Partial<BaseEnginePropertyConfig>[] {
    this.delegatedSlots.clear();

    const configs: Partial<BaseEnginePropertyConfig>[] = [];
    for (const entityName of entityNames) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (!entityInfo) continue;

      this.markEntityAsPreloaded(entityName);
      if (this.delegateEntityIfCached(entityName)) {
        continue;
      }
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
   * After the slots are filled, check whether any single preloaded entity
   * (self-loaded or delegated) exceeds the metadata-scale threshold. Emit a
   * warning so the operator knows their sync is using something it
   * probably shouldn't be.
   */
  private warnOnOversizedSlots(entityNames: Iterable<string>): void {
    for (const entityName of entityNames) {
      const list = this.resolveSlot(entityName);
      if (!list) continue;
      if (list.length > LARGE_ENTITY_WARN_THRESHOLD) {
        this.warnings.push(
          `Preloaded ${list.length.toLocaleString()} rows of '${entityName}'. mj sync is intended for metadata-scale entities (hundreds to low tens of thousands); this is large enough that you may want to confirm this entity belongs in a sync workflow.`
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
