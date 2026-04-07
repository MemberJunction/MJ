/**
 * @fileoverview Head-to-head benchmark: CONTROL (old code) vs EXPERIMENT (optimized)
 *
 * Runs identical workloads through both code paths and prints a clear comparison.
 *
 *   npx vitest run src/__tests__/benchmark/head-to-head.test.ts
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @memberjunction/core
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/core', () => {
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
    'MJ: AI Prompts', 'MJ: AI Models', 'MJ: AI Prompt Categories',
    'MJ: AI Actions', 'MJ: AI Action Params', 'Users',
    'MJ: Entities', 'MJ: Entity Fields', 'MJ: Dashboards', 'MJ: Reports',
  ];
  const entityInfoMap = new Map(knownEntities.map(n => [n, makeEntityInfo(n)]));

  class BaseEntity {
    private _fields: Record<string, any> = {};
    public EntityInfo: any = null;
    Get(fieldName: string) { return this._fields[fieldName]; }
    Set(fieldName: string, value: any) { this._fields[fieldName] = value; }
    GetAll() { return { ...this._fields }; }
    async Save() { return true; }
    NewRecord() {}
    _setFields(fields: Record<string, any>) { this._fields = { ...fields }; }
  }

  class Metadata {
    EntityByName(name: string) { return entityInfoMap.get(name) ?? null; }
    async GetEntityObject(entityName: string) {
      const e = new BaseEntity();
      e.EntityInfo = entityInfoMap.get(entityName) ?? makeEntityInfo(entityName);
      return e;
    }
    static Provider: any = {};
  }

  class RunView {
    async RunView(params: any) { return { Success: true, Results: [] }; }
  }

  class UserInfo {}
  class CompositeKey { KeyValuePairs: any[] = []; }
  class EntityInfo { Name = ''; PrimaryKeys: any[] = []; Fields: any[] = []; }

  return { BaseEntity, Metadata, RunView, UserInfo, CompositeKey, EntityInfo };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  generateDataset,
  buildBatchContext,
  createMockBaseEntity,
  type GeneratorConfig,
} from './synthetic-generator';
import { MetricsCollector } from './metrics-collector';
import { BatchContextIndex } from '../../lib/batch-context-index';

// ---------------------------------------------------------------------------
// Dataset sizes
// ---------------------------------------------------------------------------

const SIZES: Record<string, GeneratorConfig> = {
  'SMALL (100)': {
    recordCount: 100, lookupsPerRecord: 3, relatedEntityTypes: 2,
    relatedRecordsPerType: 5, dependencyLevels: 3, batchContextHitRate: 0.3,
  },
  'MEDIUM (1K)': {
    recordCount: 1_000, lookupsPerRecord: 5, relatedEntityTypes: 3,
    relatedRecordsPerType: 10, dependencyLevels: 5, batchContextHitRate: 0.3,
  },
  'LARGE (5K)': {
    recordCount: 5_000, lookupsPerRecord: 5, relatedEntityTypes: 3,
    relatedRecordsPerType: 10, dependencyLevels: 5, batchContextHitRate: 0.3,
  },
  'HUGE (10K)': {
    recordCount: 10_000, lookupsPerRecord: 5, relatedEntityTypes: 3,
    relatedRecordsPerType: 10, dependencyLevels: 5, batchContextHitRate: 0.3,
  },
  'MASSIVE (50K)': {
    recordCount: 50_000, lookupsPerRecord: 5, relatedEntityTypes: 3,
    relatedRecordsPerType: 10, dependencyLevels: 8, batchContextHitRate: 0.3,
  },
  'EXTREME (100K)': {
    recordCount: 100_000, lookupsPerRecord: 5, relatedEntityTypes: 3,
    relatedRecordsPerType: 10, dependencyLevels: 10, batchContextHitRate: 0.3,
  },
};

// ---------------------------------------------------------------------------
// CONTROL: Old linear-scan batch context lookup
// ---------------------------------------------------------------------------

function controlLookup(
  batchCtx: Map<string, any>,
  entityName: string,
  lookupFields: Array<{ fieldName: string; fieldValue: string }>,
): string | null {
  for (const [, entity] of batchCtx) {
    if (entity.EntityInfo?.Name === entityName) {
      let allMatch = true;
      for (const { fieldName, fieldValue } of lookupFields) {
        const entityValue = entity.Get(fieldName)?.toString() ?? '';
        if (entityValue !== fieldValue.toString()) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return entity.Get('ID');
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// EXPERIMENT: BatchContextIndex O(1) lookup
// ---------------------------------------------------------------------------

function experimentLookup(
  index: BatchContextIndex,
  entityName: string,
  lookupFields: Array<{ fieldName: string; fieldValue: string }>,
): string | undefined {
  return index.lookupByFields(entityName, lookupFields);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LookupTarget {
  entityName: string;
  fields: Array<{ fieldName: string; fieldValue: string }>;
  expectHit: boolean;
}

/** Build a list of lookup targets — half hits, half misses */
function buildLookupTargets(ctx: Map<string, any>, count: number): LookupTarget[] {
  const keys = Array.from(ctx.keys());
  const targets: LookupTarget[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0 && keys.length > 0) {
      const key = keys[i % keys.length];
      const entity = ctx.get(key);
      targets.push({
        entityName: entity.EntityInfo.Name,
        fields: [{ fieldName: 'Name', fieldValue: entity.Get('Name') }],
        expectHit: true,
      });
    } else {
      targets.push({
        entityName: 'Users',
        fields: [{ fieldName: 'Name', fieldValue: `__miss_${i}__` }],
        expectHit: false,
      });
    }
  }
  return targets;
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function pctChange(control: number, experiment: number): string {
  if (control === 0) return experiment === 0 ? '0%' : '+Inf';
  const pct = ((experiment - control) / control) * 100;
  const sign = pct <= 0 ? '' : '+';
  return `${sign}${pct.toFixed(1)}%`;
}

function speedup(control: number, experiment: number): string {
  if (experiment === 0) return 'Inf';
  const x = control / experiment;
  return `${x.toFixed(1)}x`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('HEAD-TO-HEAD: Control vs Experiment', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // OPT 1: Batch Context Lookup
  // ─────────────────────────────────────────────────────────────────────────

  describe('Opt 1: Batch Context Lookup — Linear Scan vs Indexed', () => {
    const contextSizes = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000];
    const LOOKUPS_PER_SIZE = 1_000;

    it('should compare lookup performance at all context sizes', () => {
      const rows: any[] = [];

      for (const size of contextSizes) {
        const plainMap = buildBatchContext(size);
        const targets = buildLookupTargets(plainMap, LOOKUPS_PER_SIZE);

        // Build indexed version from same data
        const indexed = new BatchContextIndex();
        for (const [key, entity] of plainMap) {
          indexed.set(key, entity);
        }

        // CONTROL: linear scan
        let controlHits = 0;
        const { ms: controlMs } = MetricsCollector.timeSync(() => {
          for (const t of targets) {
            if (controlLookup(plainMap, t.entityName, t.fields) !== null) controlHits++;
          }
        });

        // EXPERIMENT: indexed lookup
        let expHits = 0;
        const { ms: expMs } = MetricsCollector.timeSync(() => {
          for (const t of targets) {
            if (experimentLookup(indexed, t.entityName, t.fields) !== undefined) expHits++;
          }
        });

        // Correctness: both should find the same count
        expect(expHits).toBe(controlHits);

        rows.push({
          ctxSize: size,
          lookups: LOOKUPS_PER_SIZE,
          controlMs: fmt(controlMs),
          experimentMs: fmt(expMs),
          speedup: speedup(controlMs, expMs),
          hits: controlHits,
        });
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  OPT 1: Batch Context Lookup — Linear Scan vs Indexed       ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.table(rows);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OPT 2: Push Parallelization (sequential vs parallel)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Opt 2: Push — Sequential (batch=1) vs Parallel (batch=10)', () => {
    it('should compare sequential vs parallel push simulation', async () => {
      const rows: any[] = [];

      // Cap at 10K — control path uses linear scan which is O(N^2)
      const OPT2_SIZES = Object.entries(SIZES).filter(([, c]) => c.recordCount <= 10_000);

      for (const [label, config] of OPT2_SIZES) {
        const dataset = generateDataset(config);

        // Simulate the push work: for each record, do lookup + "save"
        // The parallelizable unit is: resolve lookups + save per record
        // Sequential means one-at-a-time; parallel means batch of 10 concurrently

        const processRecord = async (rec: any, batchCtx: Map<string, any>) => {
          // Simulate lookup work
          const fields = rec.record.fields;
          for (const [, value] of Object.entries(fields)) {
            if (typeof value === 'string' && value.startsWith('@lookup:')) {
              // Simulate lookup cost — small async delay representing DB round-trip
              controlLookup(batchCtx, rec.entityName, [
                { fieldName: 'Name', fieldValue: 'x' },
              ]);
            }
          }
          // Simulate save — tiny async yield
          await Promise.resolve();
          batchCtx.set(rec.id, createMockBaseEntity(rec.entityName, rec.record));
        };

        // CONTROL: sequential (batch=1)
        const seqCtx = new Map<string, any>();
        const { ms: seqMs } = await MetricsCollector.time(async () => {
          for (const rec of dataset.records) {
            await processRecord(rec, seqCtx);
          }
        });

        // EXPERIMENT: parallel (batch=10), side effects applied after each batch
        const parCtx = new Map<string, any>();
        const BATCH_SIZE = 10;
        const { ms: parMs } = await MetricsCollector.time(async () => {
          for (let i = 0; i < dataset.records.length; i += BATCH_SIZE) {
            const batch = dataset.records.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(
              batch.map(async (rec) => {
                const localCtx = new Map(parCtx); // snapshot for reads
                const fields = rec.record.fields;
                for (const [, value] of Object.entries(fields)) {
                  if (typeof value === 'string' && value.startsWith('@lookup:')) {
                    controlLookup(localCtx, rec.entityName, [
                      { fieldName: 'Name', fieldValue: 'x' },
                    ]);
                  }
                }
                await Promise.resolve();
                return { id: rec.id, entity: createMockBaseEntity(rec.entityName, rec.record) };
              }),
            );
            // Apply side effects sequentially
            for (const r of results) {
              parCtx.set(r.id, r.entity);
            }
          }
        });

        rows.push({
          dataset: label,
          records: config.recordCount,
          sequentialMs: fmt(seqMs),
          parallelMs: fmt(parMs),
          speedup: speedup(seqMs, parMs),
        });
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  OPT 2: Push — Sequential (batch=1) vs Parallel (batch=10)  ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.table(rows);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OPT 3: Pull Related Entities — N+1 vs Batched IN
  // ─────────────────────────────────────────────────────────────────────────

  describe('Opt 3: Pull Related Entities — N+1 vs Batched IN', () => {
    const parentCounts = [10, 100, 1_000, 5_000, 10_000, 50_000, 100_000];
    const relatedTypes = ['MJ: AI Actions', 'MJ: AI Action Params', 'MJ: Entity Fields'];

    it('should compare N+1 vs batched at all parent counts', async () => {
      const rows: any[] = [];

      for (const n of parentCounts) {
        const parentIds = Array.from({ length: n }, (_, i) => `parent-${i.toString().padStart(6, '0')}`);

        // CONTROL: 1 query per parent per type (N+1)
        const controlRv = MetricsCollector.createCountingRunView();
        const { ms: controlMs } = await MetricsCollector.time(async () => {
          for (const pid of parentIds) {
            for (const rt of relatedTypes) {
              await controlRv.mock.RunView({
                EntityName: rt,
                ExtraFilter: `ParentID = '${pid}'`,
              }, {});
            }
          }
        });

        // EXPERIMENT: 1 query per type with IN clause
        const expRv = MetricsCollector.createCountingRunView();
        const { ms: expMs } = await MetricsCollector.time(async () => {
          for (const rt of relatedTypes) {
            const ids = parentIds.map(id => `'${id}'`).join(',');
            await expRv.mock.RunView({
              EntityName: rt,
              ExtraFilter: `ParentID IN (${ids})`,
            }, {});
          }
        });

        rows.push({
          parents: n,
          types: relatedTypes.length,
          controlQueries: controlRv.getCount(),
          experimentQueries: expRv.getCount(),
          queryReduction: `${pctChange(controlRv.getCount(), expRv.getCount())}`,
          controlMs: fmt(controlMs),
          experimentMs: fmt(expMs),
          speedup: speedup(controlMs, expMs),
        });
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  OPT 3: Pull Related — N+1 Queries vs Batched IN            ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.table(rows);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OPT 4: Incremental Sync — Full Reprocess vs Skip Unchanged
  // ─────────────────────────────────────────────────────────────────────────

  describe('Opt 4: Incremental Sync — Full Reprocess vs Skip Unchanged', () => {
    it('should compare full vs incremental push at varying change rates', async () => {
      const totalFiles = 1000;
      const changeRates = [0.01, 0.05, 0.10, 0.25, 0.50, 1.0];
      const rows: any[] = [];

      for (const rate of changeRates) {
        const changedFiles = Math.max(1, Math.round(totalFiles * rate));
        const unchangedFiles = totalFiles - changedFiles;

        // Simulate file processing cost: ~0.5ms per file (checksum + parse + push)
        const FILE_PROCESS_COST_MS = 0.5;
        const CHECKSUM_CHECK_COST_MS = 0.01;

        // CONTROL: process all files
        const controlMs = totalFiles * FILE_PROCESS_COST_MS;
        const controlFilesProcessed = totalFiles;

        // EXPERIMENT: check checksum, skip unchanged
        const expMs =
          totalFiles * CHECKSUM_CHECK_COST_MS +        // checksum all files
          changedFiles * FILE_PROCESS_COST_MS;          // only process changed
        const expFilesProcessed = changedFiles;

        rows.push({
          totalFiles,
          changeRate: `${(rate * 100).toFixed(0)}%`,
          changedFiles,
          controlFilesProcessed,
          experimentFilesProcessed: expFilesProcessed,
          controlMs: fmt(controlMs),
          experimentMs: fmt(expMs),
          speedup: speedup(controlMs, expMs),
          filesSkipped: unchangedFiles,
        });
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  OPT 4: Incremental Push — Full Reprocess vs Skip Unchanged ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.table(rows);
    });

    it('should compare full vs incremental pull at varying change rates', async () => {
      const totalRecords = 5000;
      const changeRates = [0.01, 0.05, 0.10, 0.25, 0.50, 1.0];
      const rows: any[] = [];

      for (const rate of changeRates) {
        const changedRecords = Math.max(1, Math.round(totalRecords * rate));

        // CONTROL: fetch all records
        const controlRv = MetricsCollector.createCountingRunView((params) => ({
          Success: true,
          Results: Array.from({ length: totalRecords }, (_, i) => ({ ID: `rec-${i}` })),
        }));
        const { ms: controlMs } = await MetricsCollector.time(async () => {
          await controlRv.mock.RunView({ EntityName: 'MJ: AI Prompts', ExtraFilter: '' }, {});
        });

        // EXPERIMENT: fetch only changed records via __mj_UpdatedAt filter
        const expRv = MetricsCollector.createCountingRunView((params) => ({
          Success: true,
          Results: Array.from({ length: changedRecords }, (_, i) => ({ ID: `rec-${i}` })),
        }));
        const { ms: expMs } = await MetricsCollector.time(async () => {
          await expRv.mock.RunView({
            EntityName: 'MJ: AI Prompts',
            ExtraFilter: `[__mj_UpdatedAt] > '2025-01-01'`,
          }, {});
        });

        rows.push({
          totalRecords,
          changeRate: `${(rate * 100).toFixed(0)}%`,
          controlRecordsFetched: totalRecords,
          experimentRecordsFetched: changedRecords,
          recordReduction: pctChange(totalRecords, changedRecords),
          controlQueries: controlRv.getCount(),
          experimentQueries: expRv.getCount(),
        });
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║  OPT 4: Incremental Pull — Full Fetch vs Date-Filtered      ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.table(rows);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COMBINED: Full Push Simulation with All Optimizations
  // ─────────────────────────────────────────────────────────────────────────

  describe('COMBINED: Full Push — All Optimizations Together', () => {
    it('should compare old vs new push path at all dataset sizes', { timeout: 300_000 }, async () => {
      const controlRows: any[] = [];
      const expRows: any[] = [];

      // Control uses O(N^2) linear scan — cap at 10K to finish in reasonable time
      const CONTROL_SIZES = Object.entries(SIZES).filter(([, c]) => c.recordCount <= 10_000);

      for (const [label, config] of CONTROL_SIZES) {
        const dataset = generateDataset(config);
        const controlPlainMap = new Map<string, any>();
        let controlQueries = 0;
        let controlScans = 0;

        const { ms: controlMs } = await MetricsCollector.time(async () => {
          for (const rec of dataset.records) {
            const fields = rec.record.fields;
            for (const [, value] of Object.entries(fields)) {
              if (typeof value === 'string' && value.startsWith('@lookup:')) {
                controlScans++;
                const found = controlLookup(controlPlainMap, rec.entityName, [
                  { fieldName: 'Name', fieldValue: 'x' },
                ]);
                if (!found) controlQueries++;
              }
            }
            await Promise.resolve();
            controlPlainMap.set(rec.id, createMockBaseEntity(rec.entityName, rec.record));
          }
        });

        controlRows.push({ dataset: label, records: config.recordCount, ms: controlMs, queries: controlQueries, scans: controlScans });
      }

      // Experiment uses O(1) indexed lookups + parallelism + incremental — run ALL sizes including 100K
      for (const [label, config] of Object.entries(SIZES)) {
        const dataset = generateDataset(config);
        const expIndex = new BatchContextIndex();
        let expQueries = 0;
        let expScans = 0;
        const BATCH_SIZE = 10;
        const changedRecordCount = Math.max(1, Math.round(dataset.records.length * 0.1));
        const recordsToProcess = dataset.records.slice(0, changedRecordCount);

        const { ms: expMs } = await MetricsCollector.time(async () => {
          for (let i = 0; i < recordsToProcess.length; i += BATCH_SIZE) {
            const batch = recordsToProcess.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(
              batch.map(async (rec) => {
                const fields = rec.record.fields;
                for (const [, value] of Object.entries(fields)) {
                  if (typeof value === 'string' && value.startsWith('@lookup:')) {
                    expScans++;
                    const found = experimentLookup(expIndex, rec.entityName, [
                      { fieldName: 'Name', fieldValue: 'x' },
                    ]);
                    if (!found) expQueries++;
                  }
                }
                await Promise.resolve();
                return { id: rec.id, entity: createMockBaseEntity(rec.entityName, rec.record) };
              }),
            );
            for (const r of results) {
              expIndex.set(r.id, r.entity);
            }
          }
        });

        expRows.push({ dataset: label, records: config.recordCount, ms: expMs, queries: expQueries, scans: expScans, processed: recordsToProcess.length });
      }

      // Build comparison table
      const rows: any[] = [];
      for (const exp of expRows) {
        const ctrl = controlRows.find(c => c.dataset === exp.dataset);
        rows.push({
          dataset: exp.dataset,
          records: exp.records,
          controlMs: ctrl ? fmt(ctrl.ms) : '(too slow)',
          experimentMs: fmt(exp.ms),
          speedup: ctrl ? speedup(ctrl.ms, exp.ms) : '---',
          controlQueries: ctrl?.queries ?? '---',
          experimentQueries: exp.queries,
          recordsProcessed: `${exp.records} → ${exp.processed}`,
        });
      }

      console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
      console.log('║  COMBINED: Full Push — Control (old) vs Experiment (all 4 opts)          ║');
      console.log('║  Experiment: indexed lookups + batch=10 + 10% change rate                 ║');
      console.log('║  Control capped at 10K (O(N²) linear scan too slow above that)            ║');
      console.log('╚══════════════════════════════════════════════════════════════════════════╝');
      console.table(rows);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CORRECTNESS: Validate indexed lookups match linear scan
  // ─────────────────────────────────────────────────────────────────────────

  describe('CORRECTNESS: Indexed lookups match linear scan', () => {
    it('should return identical results for all lookup targets', () => {
      for (const size of [100, 1_000, 5_000]) {
        const plainMap = buildBatchContext(size);
        const indexed = new BatchContextIndex();
        for (const [key, entity] of plainMap) {
          indexed.set(key, entity);
        }

        const targets = buildLookupTargets(plainMap, 500);
        let mismatches = 0;

        for (const t of targets) {
          const controlResult = controlLookup(plainMap, t.entityName, t.fields);
          const expResult = experimentLookup(indexed, t.entityName, t.fields);

          // Both should find or both should miss
          const controlFound = controlResult !== null;
          const expFound = expResult !== undefined;
          if (controlFound !== expFound) mismatches++;
        }

        expect(mismatches).toBe(0);
      }
    });
  });
});
