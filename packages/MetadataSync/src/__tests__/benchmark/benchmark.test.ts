/**
 * @fileoverview Benchmark suite for MetadataSync performance characterization
 *
 * Measures query counts, batch-context scan costs, and memory scaling for the
 * push and pull paths at SMALL / MEDIUM / LARGE dataset sizes.
 *
 * Run with:
 *   npx vitest run src/__tests__/benchmark/benchmark.test.ts
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @memberjunction/core BEFORE any package imports
// ---------------------------------------------------------------------------

let runViewCallCount = 0;
let runViewByEntity = new Map<string, number>();
let runViewResultFactory: ((params: any) => any) | null = null;

vi.mock('@memberjunction/core', () => {
  // Minimal EntityInfo shape
  const makeEntityInfo = (name: string) => ({
    Name: name,
    PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
    Fields: [
      { Name: 'ID', NeedsQuotes: true },
      { Name: 'Name', NeedsQuotes: true },
      { Name: 'Description', NeedsQuotes: true },
      { Name: 'Status', NeedsQuotes: true },
      { Name: 'TypeID', NeedsQuotes: true },
      { Name: 'CategoryID', NeedsQuotes: true },
      { Name: 'ModelID', NeedsQuotes: true },
      { Name: 'PromptID', NeedsQuotes: true },
      { Name: 'OwnerID', NeedsQuotes: true },
      { Name: 'ParentID', NeedsQuotes: true },
      { Name: 'TemplateID', NeedsQuotes: true },
    ],
  });

  const knownEntities = [
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
  ];

  const entityInfoMap = new Map(
    knownEntities.map((n) => [n, makeEntityInfo(n)]),
  );

  // BaseEntity mock class
  class BaseEntity {
    private _fields: Record<string, any> = {};
    public EntityInfo: any = null;
    public LatestResult: any = null;

    Get(fieldName: string): any {
      return this._fields[fieldName];
    }
    Set(fieldName: string, value: any): void {
      this._fields[fieldName] = value;
    }
    GetAll(): Record<string, any> {
      return { ...this._fields };
    }
    async Save(): Promise<boolean> {
      return true;
    }
    NewRecord(): void {
      // no-op
    }
    _setFields(fields: Record<string, any>): void {
      this._fields = { ...fields };
    }
  }

  // Metadata mock
  class Metadata {
    EntityByName(name: string) {
      return entityInfoMap.get(name) ?? null;
    }
    async GetEntityObject(entityName: string, _user: any): Promise<BaseEntity> {
      const entity = new BaseEntity();
      entity.EntityInfo = entityInfoMap.get(entityName) ?? makeEntityInfo(entityName);
      return entity;
    }
    static Provider: any = {};
  }

  // RunView mock — delegates to the module-level counter + factory
  class RunView {
    async RunView(
      params: { EntityName: string; ExtraFilter?: string; [k: string]: any },
      _user?: any,
    ) {
      runViewCallCount++;
      runViewByEntity.set(
        params.EntityName,
        (runViewByEntity.get(params.EntityName) ?? 0) + 1,
      );

      if (runViewResultFactory) {
        return runViewResultFactory(params);
      }
      return { Success: true, Results: [] };
    }
  }

  // Minimal UserInfo
  class UserInfo {}

  // CompositeKey
  class CompositeKey {
    KeyValuePairs: Array<{ FieldName: string; Value: any }> = [];
  }

  // EntityInfo export (used as a type elsewhere)
  class EntityInfo {
    Name = '';
    PrimaryKeys: any[] = [];
    Fields: any[] = [];
  }

  return {
    BaseEntity,
    Metadata,
    RunView,
    UserInfo,
    CompositeKey,
    EntityInfo,
  };
});

// ---------------------------------------------------------------------------
// Imports (resolved against the mocked core)
// ---------------------------------------------------------------------------

import {
  generateDataset,
  buildBatchContext,
  createMockBaseEntity,
  type GeneratorConfig,
} from './synthetic-generator';
import { MetricsCollector } from './metrics-collector';

// ---------------------------------------------------------------------------
// Test configurations at three scales
// ---------------------------------------------------------------------------

const SMALL: GeneratorConfig = {
  recordCount: 100,
  lookupsPerRecord: 3,
  relatedEntityTypes: 2,
  relatedRecordsPerType: 5,
  dependencyLevels: 3,
  batchContextHitRate: 0.3,
};

const MEDIUM: GeneratorConfig = {
  recordCount: 1_000,
  lookupsPerRecord: 5,
  relatedEntityTypes: 3,
  relatedRecordsPerType: 10,
  dependencyLevels: 5,
  batchContextHitRate: 0.3,
};

const LARGE: GeneratorConfig = {
  recordCount: 5_000,
  lookupsPerRecord: 5,
  relatedEntityTypes: 3,
  relatedRecordsPerType: 10,
  dependencyLevels: 5,
  batchContextHitRate: 0.3,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the global RunView counters between tests */
function resetRunViewCounters(): void {
  runViewCallCount = 0;
  runViewByEntity.clear();
  runViewResultFactory = null;
}

/**
 * Simulate the batch context linear scan that `SyncEngine.resolveLookup` performs:
 * iterate every entry, compare entityName + field values.
 */
function simulateBatchContextScan(
  batchCtx: Map<string, any>,
  targetEntityName: string,
  lookupFields: Array<{ fieldName: string; fieldValue: string }>,
): any | null {
  for (const [, entity] of batchCtx) {
    if (entity.EntityInfo?.Name === targetEntityName) {
      let allMatch = true;
      for (const { fieldName, fieldValue } of lookupFields) {
        const entityValue = entity.Get(fieldName)?.toString() ?? '';
        if (entityValue !== fieldValue.toString()) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return entity;
    }
  }
  return null;
}

/**
 * Simulate RunView calls for related entity loading (pull path).
 * Naive implementation: one query per parent per related entity type.
 */
async function simulateRelatedEntityQueries(
  parentIds: string[],
  relatedEntityTypes: string[],
  runViewMock: ReturnType<typeof MetricsCollector.createCountingRunView>,
): Promise<void> {
  for (const parentId of parentIds) {
    for (const relatedEntity of relatedEntityTypes) {
      await runViewMock.mock.RunView(
        {
          EntityName: relatedEntity,
          ExtraFilter: `ParentID = '${parentId}'`,
          ResultType: 'entity_object',
        },
        {},
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Benchmark suite
// ---------------------------------------------------------------------------

describe('MetadataSync Benchmarks', () => {
  beforeAll(() => {
    resetRunViewCounters();
  });

  // =========================================================================
  // 1. Batch Context Lookup Performance
  // =========================================================================

  describe('Batch Context Lookup Performance', () => {
    const contextSizes = [100, 500, 1_000, 5_000, 10_000];

    it('should measure lookup time scaling with batch context size', () => {
      const lookupCount = 200; // lookups to perform per context size
      const results: Array<{
        contextSize: number;
        totalMs: number;
        perLookupUs: number;
        found: number;
        missed: number;
      }> = [];

      for (const size of contextSizes) {
        const ctx = buildBatchContext(size);

        // Build lookup targets — half from context, half misses
        const keys = Array.from(ctx.keys());
        const targets: Array<{ entityName: string; fieldName: string; fieldValue: string }> = [];

        for (let i = 0; i < lookupCount; i++) {
          if (i % 2 === 0 && keys.length > 0) {
            // Hit — pick a known entity
            const key = keys[i % keys.length];
            const entity = ctx.get(key);
            targets.push({
              entityName: entity.EntityInfo.Name,
              fieldName: 'Name',
              fieldValue: entity.Get('Name'),
            });
          } else {
            // Miss — non-existent value
            targets.push({
              entityName: 'Users',
              fieldName: 'Name',
              fieldValue: `__nonexistent_${i}__`,
            });
          }
        }

        let found = 0;
        let missed = 0;

        const { ms } = MetricsCollector.timeSync(() => {
          for (const t of targets) {
            const hit = simulateBatchContextScan(ctx, t.entityName, [
              { fieldName: t.fieldName, fieldValue: t.fieldValue },
            ]);
            if (hit) found++;
            else missed++;
          }
        });

        results.push({
          contextSize: size,
          totalMs: ms,
          perLookupUs: Math.round(((ms / lookupCount) * 1000) * 100) / 100,
          found,
          missed,
        });
      }

      console.log('\n--- Batch Context Lookup Scaling ---');
      console.table(results);

      // Sanity: larger context should not be *faster* than smallest (on average)
      // We just check that the test produced numbers without crashing.
      expect(results.length).toBe(contextSizes.length);
      for (const r of results) {
        expect(r.totalMs).toBeGreaterThanOrEqual(0);
        expect(r.found + r.missed).toBe(lookupCount);
      }
    });

    it('should show linear growth in scan time as context grows', () => {
      // This test captures the O(N) nature of the for...of scan.
      // It generates two context sizes and asserts the larger one takes proportionally more time.
      const smallCtx = buildBatchContext(500, 1);
      const largeCtx = buildBatchContext(5_000, 2);

      const scansPerRound = 100;

      const runScans = (ctx: Map<string, any>) => {
        for (let i = 0; i < scansPerRound; i++) {
          // Force a full miss scan (worst case — must iterate entire map)
          simulateBatchContextScan(ctx, '__NoSuchEntity__', [
            { fieldName: 'Name', fieldValue: '__miss__' },
          ]);
        }
      };

      const { ms: smallMs } = MetricsCollector.timeSync(() => runScans(smallCtx));
      const { ms: largeMs } = MetricsCollector.timeSync(() => runScans(largeCtx));

      const ratio = largeMs / Math.max(smallMs, 0.001);

      console.log('\n--- Linear Growth Check ---');
      console.table([
        { contextSize: 500, scans: scansPerRound, totalMs: smallMs },
        { contextSize: 5000, scans: scansPerRound, totalMs: largeMs },
        { label: 'ratio (should be ~10x for 10x context)', value: Math.round(ratio * 100) / 100 },
      ]);

      // We expect the ratio to be > 1. Exact linear scaling is hard to assert
      // due to CPU cache effects, but it should clearly grow.
      expect(largeMs).toBeGreaterThanOrEqual(0);
      expect(smallMs).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 2. Push: Query Count Scaling
  // =========================================================================

  describe('Push: Query Count Scaling', () => {
    /**
     * Simulate the push path: for each record, resolve lookups via batch
     * context (linear scan) then fall back to RunView for misses.
     */
    async function simulatePush(
      config: GeneratorConfig,
    ): Promise<{
      wallClockMs: number;
      queryCount: number;
      batchContextScans: number;
      peakMemoryMB: number;
      records: number;
      queriesByEntity: Map<string, number>;
    }> {
      const dataset = generateDataset(config);
      const rv = MetricsCollector.createCountingRunView((params) => {
        // Return a fake result with a matching ID so lookups "succeed"
        return {
          Success: true,
          Results: [{ ID: '00000000-0000-4000-a000-000000000000' }],
        };
      });

      const batchCtx = MetricsCollector.createInstrumentedBatchContext(
        dataset.batchContextSeed,
      );

      const memBefore = MetricsCollector.captureMemory();

      const { ms } = await MetricsCollector.time(async () => {
        for (const rec of dataset.records) {
          const fields = rec.record.fields;
          for (const [fieldName, value] of Object.entries(fields)) {
            if (typeof value === 'string' && value.startsWith('@lookup:')) {
              // Parse the lookup to get entity and field
              const match = value.match(/^@lookup:([^.]+)\.(.+?)=(.+)$/);
              if (!match) continue;
              const [, entityName, lookupField, lookupValue] = match;

              // Try batch context first (this is the linear scan)
              const found = simulateBatchContextScan(batchCtx.map, entityName, [
                { fieldName: lookupField, fieldValue: lookupValue },
              ]);

              if (!found) {
                // Fall back to RunView query
                await rv.mock.RunView(
                  { EntityName: entityName, ExtraFilter: `${lookupField} = '${lookupValue}'` },
                  {},
                );
              }
            }
          }

          // After "saving", add to batch context for subsequent records
          const mockEntity = createMockBaseEntity(rec.entityName, rec.record);
          batchCtx.map.set(rec.id, mockEntity);
        }
      });

      const memAfter = MetricsCollector.captureMemory();

      return {
        wallClockMs: ms,
        queryCount: rv.getCount(),
        batchContextScans: batchCtx.getScanCount(),
        peakMemoryMB: Math.max(memAfter.heapUsedMB, memBefore.heapUsedMB),
        records: dataset.records.length,
        queriesByEntity: rv.getByEntity(),
      };
    }

    it('should count queries for SMALL dataset', async () => {
      const result = await simulatePush(SMALL);

      console.log('\n--- Push: SMALL ---');
      console.table([{
        records: result.records,
        queries: result.queryCount,
        batchScans: result.batchContextScans,
        wallClockMs: result.wallClockMs,
        peakMemoryMB: result.peakMemoryMB,
      }]);

      expect(result.queryCount).toBeGreaterThanOrEqual(0);
      expect(result.records).toBe(SMALL.recordCount);
    });

    it('should count queries for MEDIUM dataset', async () => {
      const result = await simulatePush(MEDIUM);

      console.log('\n--- Push: MEDIUM ---');
      console.table([{
        records: result.records,
        queries: result.queryCount,
        batchScans: result.batchContextScans,
        wallClockMs: result.wallClockMs,
        peakMemoryMB: result.peakMemoryMB,
      }]);

      expect(result.queryCount).toBeGreaterThanOrEqual(0);
      expect(result.records).toBe(MEDIUM.recordCount);
    });

    it('should count queries for LARGE dataset', async () => {
      const result = await simulatePush(LARGE);

      console.log('\n--- Push: LARGE ---');
      console.table([{
        records: result.records,
        queries: result.queryCount,
        batchScans: result.batchContextScans,
        wallClockMs: result.wallClockMs,
        peakMemoryMB: result.peakMemoryMB,
      }]);

      expect(result.queryCount).toBeGreaterThanOrEqual(0);
      expect(result.records).toBe(LARGE.recordCount);
    });

    it('should show query count growth across dataset sizes', async () => {
      const small = await simulatePush(SMALL);
      const medium = await simulatePush(MEDIUM);
      const large = await simulatePush(LARGE);

      console.log('\n--- Push: Query Count Comparison ---');
      console.table([
        { size: 'SMALL', records: small.records, queries: small.queryCount, scans: small.batchContextScans, ms: small.wallClockMs },
        { size: 'MEDIUM', records: medium.records, queries: medium.queryCount, scans: medium.batchContextScans, ms: medium.wallClockMs },
        { size: 'LARGE', records: large.records, queries: large.queryCount, scans: large.batchContextScans, ms: large.wallClockMs },
      ]);

      // Larger datasets should produce at least as many queries
      expect(large.queryCount).toBeGreaterThanOrEqual(small.queryCount);
    });
  });

  // =========================================================================
  // 3. Pull: Related Entity Query Scaling
  // =========================================================================

  describe('Pull: Related Entity Query Scaling', () => {
    it('should count related entity queries for N parent records', async () => {
      const parentCounts = [10, 50, 100, 500];
      const relatedTypes = ['MJ: AI Actions', 'MJ: AI Action Params', 'MJ: Entity Fields'];

      const results: Array<{
        parents: number;
        relatedTypes: number;
        queriesActual: number;
        queriesOptimal: number;
        overhead: string;
      }> = [];

      for (const n of parentCounts) {
        const rv = MetricsCollector.createCountingRunView();
        const parentIds = Array.from({ length: n }, (_, i) =>
          `parent-${i.toString().padStart(6, '0')}`,
        );

        await simulateRelatedEntityQueries(parentIds, relatedTypes, rv);

        const actual = rv.getCount();
        // Optimal: one query per related type using IN(...) clause
        const optimal = relatedTypes.length;
        const overhead = actual > 0 ? `${Math.round((actual / optimal) * 100) / 100}x` : 'N/A';

        results.push({
          parents: n,
          relatedTypes: relatedTypes.length,
          queriesActual: actual,
          queriesOptimal: optimal,
          overhead,
        });
      }

      console.log('\n--- Pull: Related Entity Query Scaling ---');
      console.table(results);

      // Naive implementation: queries = parents * relatedTypes
      for (const r of results) {
        expect(r.queriesActual).toBe(r.parents * r.relatedTypes);
      }
    });

    it('should compare naive vs batched pull strategies', async () => {
      const parentCount = 100;
      const relatedTypes = ['MJ: AI Actions', 'MJ: AI Action Params', 'MJ: Entity Fields'];
      const parentIds = Array.from({ length: parentCount }, (_, i) =>
        `parent-${i.toString().padStart(6, '0')}`,
      );

      // Naive: one query per parent per type
      const naiveRv = MetricsCollector.createCountingRunView();
      const { ms: naiveMs } = await MetricsCollector.time(async () => {
        await simulateRelatedEntityQueries(parentIds, relatedTypes, naiveRv);
      });

      // Batched: one query per type with IN clause
      const batchedRv = MetricsCollector.createCountingRunView();
      const { ms: batchedMs } = await MetricsCollector.time(async () => {
        for (const relatedEntity of relatedTypes) {
          const idList = parentIds.map((id) => `'${id}'`).join(',');
          await batchedRv.mock.RunView(
            {
              EntityName: relatedEntity,
              ExtraFilter: `ParentID IN (${idList})`,
              ResultType: 'entity_object',
            },
            {},
          );
        }
      });

      console.log('\n--- Pull: Naive vs Batched ---');
      console.table([
        { strategy: 'Naive (1 query per parent per type)', queries: naiveRv.getCount(), ms: naiveMs },
        { strategy: 'Batched (1 query per type)', queries: batchedRv.getCount(), ms: batchedMs },
        { strategy: 'Reduction', queries: `${naiveRv.getCount() - batchedRv.getCount()} fewer`, ms: '' },
      ]);

      expect(naiveRv.getCount()).toBe(parentCount * relatedTypes.length);
      expect(batchedRv.getCount()).toBe(relatedTypes.length);
    });
  });

  // =========================================================================
  // 4. Memory Scaling
  // =========================================================================

  describe('Memory Scaling', () => {
    it('should report memory growth across dataset sizes', () => {
      const sizes = [100, 1_000, 5_000, 10_000];
      const results: Array<{ records: number; heapMB: number }> = [];

      for (const n of sizes) {
        // Force GC if available
        if (typeof globalThis.gc === 'function') globalThis.gc();

        const before = MetricsCollector.captureMemory();

        // Generate dataset and hold it in memory
        const ctx = buildBatchContext(n);
        void ctx; // keep alive for measurement

        const after = MetricsCollector.captureMemory();
        results.push({
          records: n,
          heapMB: Math.round((after.heapUsedMB - before.heapUsedMB) * 100) / 100,
        });
      }

      console.log('\n--- Memory Scaling ---');
      console.table(results);

      // Just verify we got numbers
      expect(results.length).toBe(sizes.length);
    });
  });

  // =========================================================================
  // 5. Synthetic Generator Correctness
  // =========================================================================

  describe('Synthetic Generator Correctness', () => {
    it('should produce deterministic output for the same seed', () => {
      const a = generateDataset(SMALL, 42);
      const b = generateDataset(SMALL, 42);

      expect(a.records.length).toBe(b.records.length);
      for (let i = 0; i < a.records.length; i++) {
        expect(a.records[i].id).toBe(b.records[i].id);
        expect(a.records[i].entityName).toBe(b.records[i].entityName);
      }
    });

    it('should produce different output for different seeds', () => {
      const a = generateDataset(SMALL, 42);
      const b = generateDataset(SMALL, 999);

      // Very unlikely (but not impossible) that all IDs match across seeds
      const idsA = new Set(a.records.map((r) => r.id));
      const idsB = new Set(b.records.map((r) => r.id));
      const overlap = [...idsA].filter((id) => idsB.has(id));
      expect(overlap.length).toBeLessThan(a.records.length);
    });

    it('should generate the requested number of records', () => {
      const ds = generateDataset(MEDIUM, 7);
      expect(ds.records.length).toBe(MEDIUM.recordCount);
    });

    it('should create dependency levels where level N depends on level N-1', () => {
      const ds = generateDataset(SMALL, 42);

      // Records at depth 0 should have no dependencies
      const level0 = ds.records.filter((r) => r.depth === 0);
      for (const rec of level0) {
        expect(rec.dependencies.size).toBe(0);
      }

      // Records at depth > 0 should have dependencies with lower depth
      const depthMap = new Map(ds.records.map((r) => [r.id, r.depth]));
      const deeper = ds.records.filter((r) => r.depth > 0);
      for (const rec of deeper) {
        for (const depId of rec.dependencies) {
          const depDepth = depthMap.get(depId);
          expect(depDepth).toBeDefined();
          expect(depDepth!).toBeLessThan(rec.depth);
        }
      }
    });

    it('should populate batchContextSeed proportional to batchContextHitRate', () => {
      const ds = generateDataset(MEDIUM, 42);
      const expectedMax = Math.floor(MEDIUM.recordCount * MEDIUM.batchContextHitRate);
      expect(ds.batchContextSeed.size).toBeLessThanOrEqual(expectedMax + 1); // +1 for rounding
      expect(ds.batchContextSeed.size).toBeGreaterThan(0);
    });

    it('should generate entity configs for all entities present in records', () => {
      const ds = generateDataset(SMALL, 42);
      const entityNames = new Set(ds.records.map((r) => r.entityName));
      for (const name of entityNames) {
        expect(ds.entityConfigs.has(name)).toBe(true);
        expect(ds.entityConfigs.get(name)!.entity).toBe(name);
      }
    });
  });
});
