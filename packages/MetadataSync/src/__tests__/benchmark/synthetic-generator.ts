/**
 * @fileoverview Synthetic data generator for MetadataSync benchmark tests
 *
 * Generates deterministic, realistic MJ-style datasets at configurable scale
 * for measuring sync performance characteristics (query counts, batch context
 * scanning, memory usage).
 */

import type { RecordData } from '../../lib/sync-engine';
import type { FlattenedRecord } from '../../lib/record-dependency-analyzer';
import type { EntityConfig, RelatedEntityConfig } from '../../config';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GeneratorConfig {
  /** Number of records to generate */
  recordCount: number;
  /** Number of @lookup fields per record */
  lookupsPerRecord: number;
  /** Number of related entity types per record */
  relatedEntityTypes: number;
  /** Number of related records per parent per type */
  relatedRecordsPerType: number;
  /** Number of dependency levels (for push testing) */
  dependencyLevels: number;
  /** Fraction of lookups that should hit batch context (0-1) */
  batchContextHitRate: number;
}

export interface SyntheticDataset {
  /** Generated records with their lookup references */
  records: FlattenedRecord[];
  /** Entity configs for pull testing */
  entityConfigs: Map<string, EntityConfig>;
  /** Pre-populated batch context entries */
  batchContextSeed: Map<string, any>;
  /** Expected query counts for validation */
  expectedMetrics: {
    lookupQueries: number;
    relatedEntityQueries: number;
    totalQueries: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_NAMES = [
  'MJ: AI Prompts',
  'MJ: AI Models',
  'MJ: AI Prompt Categories',
  'MJ: AI Actions',
  'MJ: AI Action Params',
  'Users',
  'MJ: Entities',
  'MJ: Entity Fields',
  'MJ: Dashboards',
  'MJ: Reports',
] as const;

const FIELD_NAMES = [
  'Name',
  'Description',
  'Status',
  'TypeID',
  'CategoryID',
  'ModelID',
  'PromptID',
  'OwnerID',
  'ParentID',
  'TemplateID',
] as const;

// ---------------------------------------------------------------------------
// Deterministic PRNG (xorshift32) — avoids Math.random() for repeatability
// ---------------------------------------------------------------------------

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0 || 1;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    let s = this.state;
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    this.state = s;
    return (s >>> 0) / 0x100000000;
  }

  /** Returns an int in [min, max) */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /** Pick one element from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length)];
  }
}

// ---------------------------------------------------------------------------
// GUID helper — deterministic hex string generation
// ---------------------------------------------------------------------------

function deterministicGuid(rng: SeededRandom): string {
  const hex = (n: number): string => {
    let out = '';
    for (let i = 0; i < n; i++) {
      out += rng.int(0, 16).toString(16);
    }
    return out;
  };
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${rng.pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generate a complete synthetic dataset according to the supplied config.
 *
 * All randomness is seeded so results are fully deterministic across runs.
 */
export function generateDataset(config: GeneratorConfig, seed = 42): SyntheticDataset {
  const rng = new SeededRandom(seed);

  const records: FlattenedRecord[] = [];
  const entityConfigs = new Map<string, EntityConfig>();
  const batchContextSeed = new Map<string, any>();

  // Track all generated IDs so lookups can reference real records
  const allIds: string[] = [];
  const idsByEntity = new Map<string, string[]>();

  // ----- Phase 1: Allocate IDs per dependency level -----
  const recordsPerLevel = Math.max(
    1,
    Math.ceil(config.recordCount / config.dependencyLevels),
  );

  const levels: Array<Array<{ id: string; entityName: string }>> = [];

  for (let lvl = 0; lvl < config.dependencyLevels; lvl++) {
    const levelRecords: Array<{ id: string; entityName: string }> = [];
    const count = lvl < config.dependencyLevels - 1
      ? recordsPerLevel
      : config.recordCount - records.length - (config.dependencyLevels - lvl - 1) * 0; // remainder
    const actualCount = Math.min(
      count > 0 ? count : recordsPerLevel,
      config.recordCount - allIds.length,
    );
    if (actualCount <= 0) break;

    for (let i = 0; i < actualCount; i++) {
      const id = deterministicGuid(rng);
      const entityName = rng.pick(ENTITY_NAMES);
      allIds.push(id);
      if (!idsByEntity.has(entityName)) idsByEntity.set(entityName, []);
      idsByEntity.get(entityName)!.push(id);
      levelRecords.push({ id, entityName });
    }
    levels.push(levelRecords);
  }

  // ----- Phase 2: Build FlattenedRecords with lookup references -----
  let lookupQueriesExpected = 0;
  let batchHits = 0;

  for (let lvl = 0; lvl < levels.length; lvl++) {
    for (const { id, entityName } of levels[lvl]) {
      const fields: Record<string, any> = {
        Name: `${entityName.replace('MJ: ', '')} ${allIds.indexOf(id)}`,
        Description: `Synthetic record ${id}`,
      };

      const deps = new Set<string>();

      // Add lookup fields — reference records from *previous* levels so deps are always satisfiable
      for (let lk = 0; lk < config.lookupsPerRecord; lk++) {
        const fieldName = FIELD_NAMES[lk % FIELD_NAMES.length];
        if (lvl === 0) {
          // Level 0 records have no prior deps; use inline values
          fields[fieldName] = deterministicGuid(rng);
        } else {
          // Reference a record from a prior level
          const priorLevel = levels[rng.int(0, lvl)];
          const target = rng.pick(priorLevel);
          fields[fieldName] = `@lookup:${target.entityName}.ID=${target.id}`;
          deps.add(target.id);

          // Decide whether this will hit batch context or require a query
          if (rng.next() < config.batchContextHitRate) {
            batchHits++;
          } else {
            lookupQueriesExpected++;
          }
        }
      }

      // Build related entities for pull-testing
      const relatedEntities: Record<string, RecordData[]> = {};
      let relatedEntityQueries = 0;

      for (let rt = 0; rt < config.relatedEntityTypes; rt++) {
        const relatedEntityName = ENTITY_NAMES[(ENTITY_NAMES.indexOf(entityName as typeof ENTITY_NAMES[number]) + rt + 1) % ENTITY_NAMES.length];
        const relatedRecords: RecordData[] = [];
        for (let rr = 0; rr < config.relatedRecordsPerType; rr++) {
          relatedRecords.push({
            primaryKey: { ID: deterministicGuid(rng) },
            fields: {
              Name: `Related ${relatedEntityName} ${rr}`,
              ParentID: id,
            },
          });
        }
        relatedEntities[relatedEntityName] = relatedRecords;
        // In the naive implementation each parent x type issues a query
        relatedEntityQueries++;
      }

      const recordData: RecordData = {
        primaryKey: { ID: id },
        fields,
        relatedEntities: config.relatedEntityTypes > 0 ? relatedEntities : undefined,
        sync: {
          lastModified: '2025-01-01T00:00:00.000Z',
          checksum: 'synthetic',
        },
      };

      const flattenedRecord: FlattenedRecord = {
        record: recordData,
        entityName,
        depth: lvl,
        path: `synthetic/${entityName}/${id}.json`,
        dependencies: deps,
        id,
        originalIndex: records.length,
      };

      records.push(flattenedRecord);
    }
  }

  // ----- Phase 3: Seed batch context entries for records that should be "found" -----
  let seededCount = 0;
  for (const rec of records) {
    if (seededCount >= Math.floor(allIds.length * config.batchContextHitRate)) break;
    const mockEntity = createMockBaseEntity(rec.entityName, rec.record);
    batchContextSeed.set(rec.id, mockEntity);
    seededCount++;
  }

  // ----- Phase 4: Build entity configs for each entity name -----
  for (const entityName of idsByEntity.keys()) {
    const relatedEntitiesConfig: Record<string, RelatedEntityConfig> = {};
    for (let rt = 0; rt < config.relatedEntityTypes; rt++) {
      const relatedName = ENTITY_NAMES[(ENTITY_NAMES.indexOf(entityName as typeof ENTITY_NAMES[number]) + rt + 1) % ENTITY_NAMES.length];
      relatedEntitiesConfig[relatedName] = {
        entity: relatedName,
        foreignKey: 'ParentID',
        filter: '',
      };
    }

    entityConfigs.set(entityName, {
      entity: entityName,
      filePattern: '*.json',
      pull: {
        relatedEntities: config.relatedEntityTypes > 0 ? relatedEntitiesConfig : undefined,
        lookupFields: {},
      },
    });
  }

  // ----- Phase 5: Compute expected metrics -----
  const relatedEntityQueriesTotal =
    config.recordCount * config.relatedEntityTypes; // naive: 1 query per parent per type

  const totalQueries = lookupQueriesExpected + relatedEntityQueriesTotal;

  return {
    records,
    entityConfigs,
    batchContextSeed,
    expectedMetrics: {
      lookupQueries: lookupQueriesExpected,
      relatedEntityQueries: relatedEntityQueriesTotal,
      totalQueries,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock BaseEntity helper (used for seeding batch context)
// ---------------------------------------------------------------------------

/**
 * Creates a minimal object that behaves like a MJ BaseEntity for batch context
 * and lookup resolution purposes.
 */
export function createMockBaseEntity(
  entityName: string,
  recordData: RecordData,
): any {
  const allFields: Record<string, any> = {
    ...recordData.primaryKey,
    ...recordData.fields,
  };

  return {
    EntityInfo: {
      Name: entityName,
      PrimaryKeys: Object.keys(recordData.primaryKey ?? {}).map((k) => ({
        Name: k,
        NeedsQuotes: true,
      })),
      Fields: Object.keys(allFields).map((k) => ({
        Name: k,
        NeedsQuotes: typeof allFields[k] === 'string',
      })),
    },
    Get(fieldName: string): any {
      return allFields[fieldName];
    },
    Set(fieldName: string, value: any): void {
      allFields[fieldName] = value;
    },
    GetAll(): Record<string, any> {
      return { ...allFields };
    },
    async Save(): Promise<boolean> {
      return true;
    },
    NewRecord(): void {
      // no-op for mocks
    },
  };
}

// ---------------------------------------------------------------------------
// Batch context population helpers — generate a standalone Map<string, entity>
// for isolated batch-context scanning benchmarks
// ---------------------------------------------------------------------------

/**
 * Build a batch context Map of the given size, filled with mock entities.
 * Each key is a unique GUID and each value looks like a BaseEntity.
 */
export function buildBatchContext(
  size: number,
  seed = 99,
): Map<string, any> {
  const rng = new SeededRandom(seed);
  const ctx = new Map<string, any>();

  for (let i = 0; i < size; i++) {
    const id = deterministicGuid(rng);
    const entityName = rng.pick(ENTITY_NAMES);

    const record: RecordData = {
      primaryKey: { ID: id },
      fields: {
        Name: `${entityName.replace('MJ: ', '')} ${i}`,
        Description: `Context entity ${i}`,
      },
    };

    ctx.set(id, createMockBaseEntity(entityName, record));
  }

  return ctx;
}
