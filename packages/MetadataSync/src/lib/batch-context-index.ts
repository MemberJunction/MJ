/**
 * @fileoverview Indexed wrapper around the batch context Map for O(1) lookups by entity name + field values.
 *
 * The sync engine's `resolveLookup()` needs to find entities in the batch context
 * by entity name and matching field values. Without an index, this requires a
 * linear scan of every entry in the Map for every lookup -- O(N) per lookup,
 * O(N^2) for a full push.
 *
 * BatchContextIndex maintains a secondary index:
 *   entityName -> compositeKey -> primaryKeyValue
 *
 * so lookups resolve in O(1) after the one-time O(F) cost of indexing each
 * entity's fields when it is added via `set()`.
 */

import { BaseEntity, Metadata } from '@memberjunction/core';

/**
 * Lightweight stand-in for BaseEntity used when a record is unchanged and
 * only needs to be present in the batch context for @parent:ID / @lookup resolution.
 * Avoids pulling a full entity from the DB just to satisfy downstream references.
 */
export interface BatchContextStub {
  EntityInfo: {
    Name: string;
    PrimaryKeys: Array<{ Name: string }>;
    Fields: Array<{ Name: string }>;
  };
  Get(field: string): unknown;
  GetAll(): Record<string, unknown>;
}

export class BatchContextIndex {
  /** Primary storage -- same shape the rest of the codebase expects. */
  private map: Map<string, BaseEntity | BatchContextStub>;

  /**
   * Secondary index: entityName -> compositeKey -> primaryKeyValue.
   *
   * Every field on an entity is indexed individually (fieldName=value) and we
   * also index every pair/triple/etc. combination that callers might query.
   * In practice the lookup always specifies a small set of fields, so we index
   * every *individual* field plus every *pair* of fields.  For the overwhelming
   * majority of lookups (single-field) this is sufficient; for multi-field
   * lookups we generate the composite key at query time and fall back to an
   * all-fields composite that was indexed at insert time.
   *
   * To keep the index lean we only store individual-field and all-fields keys
   * per entity rather than the full power set.  At query time we build the
   * composite key from whatever fields the caller provides.
   */
  private index: Map<string, Map<string, string>>;

  /** Per-entity-name list for fallback scans when composite key misses (3+ field subsets). */
  private entitiesByName: Map<string, Array<{ entity: BaseEntity | BatchContextStub; pkValue: string }>>;

  /** Cache of entity name -> primary key field name so we don't re-derive it. */
  private pkFieldCache: Map<string, string>;

  /** Metadata instance used to resolve primary key field names. */
  private metadata: Metadata;

  constructor(metadata?: Metadata) {
    this.map = new Map();
    this.index = new Map();
    this.entitiesByName = new Map();
    this.pkFieldCache = new Map();
    this.metadata = metadata ?? new Metadata(); // global-provider-ok: metadata sync operates on the configured provider only
  }

  // ---------------------------------------------------------------------------
  // Public API -- Map-compatible surface
  // ---------------------------------------------------------------------------

  /** Add an entity to the context (called after save). */
  set(key: string, entity: BaseEntity | BatchContextStub): void {
    this.map.set(key, entity);
    this.indexEntity(entity);
  }

  /** Get by direct key (existing behaviour). */
  get(key: string): BaseEntity | BatchContextStub | undefined {
    return this.map.get(key);
  }

  /** Check if a key exists. */
  has(key: string): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }

  [Symbol.iterator](): IterableIterator<[string, BaseEntity | BatchContextStub]> {
    return this.map[Symbol.iterator]();
  }

  entries(): IterableIterator<[string, BaseEntity | BatchContextStub]> {
    return this.map.entries();
  }

  /** Remove all entries and free memory. */
  clear(): void {
    this.map.clear();
    this.index.clear();
    this.entitiesByName.clear();
    this.pkFieldCache.clear();
  }

  // ---------------------------------------------------------------------------
  // Indexed lookup
  // ---------------------------------------------------------------------------

  /**
   * O(1) lookup by entity name + field/value pairs.
   *
   * Returns the primary key value if a matching entity is in the batch context,
   * or `undefined` if not found.
   */
  lookupByFields(
    entityName: string,
    lookupFields: Array<{ fieldName: string; fieldValue: string }>,
  ): string | undefined {
    const entityIndex = this.index.get(entityName);
    if (!entityIndex) {
      return undefined;
    }

    const compositeKey = this.buildCompositeKey(lookupFields);
    const indexed = entityIndex.get(compositeKey);
    if (indexed !== undefined) {
      return indexed;
    }

    // For 1-2 field lookups, the index is complete (we index all individual
    // fields and all pairwise combos). A miss here is a genuine miss.
    if (lookupFields.length <= 2) {
      return undefined;
    }

    // Fallback for 3+ field subset lookups that weren't indexed: scan only
    // entities of this type (O(K) where K = entities of this type, not O(N)).
    const candidates = this.entitiesByName.get(entityName);
    if (!candidates) {
      return undefined;
    }

    const normalizedLookups = lookupFields.map(f => ({
      originalName: f.fieldName.trim(),
      value: (f.fieldValue?.toString() || '').toLowerCase(),
    }));

    for (const { entity, pkValue } of candidates) {
      let allMatch = true;
      for (const { originalName, value } of normalizedLookups) {
        const entityValue = (entity.Get(originalName)?.toString() || '').toLowerCase();
        if (entityValue !== value) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        return pkValue;
      }
    }

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Build a deterministic composite key from an array of field name/value pairs.
   *
   * Rules (must match the normalization in the existing linear scan):
   * - Sort field pairs alphabetically by field name (case-insensitive)
   * - Normalize values via `?.toString() || ''` then lowercase
   * - Format: `fieldname=value|fieldname=value`
   */
  private buildCompositeKey(
    fields: Array<{ fieldName: string; fieldValue: string }>,
  ): string {
    return fields
      .map(f => ({
        name: f.fieldName.trim().toLowerCase(),
        value: (f.fieldValue?.toString() || '').toLowerCase(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => `${f.name}=${f.value}`)
      .join('|');
  }

  /**
   * Index every field of `entity` so future lookups against any combination
   * of those fields can resolve in O(1).
   *
   * We store:
   * 1. Each individual field as its own composite key (single element).
   * 2. A composite key of ALL fields together (covers multi-field lookups that
   *    happen to reference every field).
   *
   * For the common 1-field and 2-field lookups against subsets, we generate
   * all 2-element combinations as well. This keeps the index manageable while
   * covering the vast majority of real-world patterns.
   */
  private indexEntity(entity: BaseEntity | BatchContextStub): void {
    const entityName = entity.EntityInfo?.Name;
    if (!entityName) {
      return;
    }

    const pkValue = this.getPrimaryKeyValue(entity, entityName);
    if (pkValue === undefined) {
      return;
    }

    const pkString = pkValue?.toString() || '';

    if (!this.index.has(entityName)) {
      this.index.set(entityName, new Map());
    }
    const entityIndex = this.index.get(entityName)!;

    // Append to per-entity-name list for fallback scans
    if (!this.entitiesByName.has(entityName)) {
      this.entitiesByName.set(entityName, []);
    }
    this.entitiesByName.get(entityName)!.push({ entity, pkValue: pkString });

    // Gather all fields with their normalized name/value
    const fields: Array<{ name: string; value: string }> = [];
    const entityFields = entity.EntityInfo?.Fields;
    if (entityFields) {
      for (const fieldInfo of entityFields) {
        const rawValue = entity.Get(fieldInfo.Name);
        const normalized = (rawValue?.toString() || '').toLowerCase();
        const normalizedName = fieldInfo.Name.trim().toLowerCase();
        fields.push({ name: normalizedName, value: normalized });
      }
    }

    // 1. Index each individual field
    for (const f of fields) {
      const key = `${f.name}=${f.value}`;
      entityIndex.set(key, pkString);
    }

    // 2. Index all pairwise combinations (for 2-field lookups)
    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        const pair = [fields[i], fields[j]].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        const key = pair.map(f => `${f.name}=${f.value}`).join('|');
        entityIndex.set(key, pkString);
      }
    }

    // 3. Index the composite of ALL fields (covers N-field lookups where N > 2)
    if (fields.length > 2) {
      const sorted = [...fields].sort((a, b) => a.name.localeCompare(b.name));
      const allKey = sorted.map(f => `${f.name}=${f.value}`).join('|');
      entityIndex.set(allKey, pkString);
    }
  }

  /** Resolve the primary key value for an entity, caching the field name. */
  private getPrimaryKeyValue(
    entity: BaseEntity | BatchContextStub,
    entityName: string,
  ): unknown {
    let pkField = this.pkFieldCache.get(entityName);
    if (!pkField) {
      const entityInfo = this.metadata.EntityByName(entityName);
      if (!entityInfo || entityInfo.PrimaryKeys.length === 0) {
        return undefined;
      }
      pkField = entityInfo.PrimaryKeys[0].Name;
      this.pkFieldCache.set(entityName, pkField);
    }
    return entity.Get(pkField);
  }
}
