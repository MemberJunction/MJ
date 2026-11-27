import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import type { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';

import { FeaturePipelineEngine } from '../feature-pipeline-engine';
import { FEATURE_PIPELINE_CATEGORY_NAME } from '../types';

/**
 * Unit tests for FeaturePipelineEngine's pure projection layer (SP6). NO live DB
 * and NO BaseEngine load — we exercise the static, side-effect-free
 * `BuildSummaries` over in-memory entity doubles, mirroring the package's existing
 * seam-injection test style. This proves the discovery contract the Model
 * Development Agent + Knowledge Hub UI rely on: which categorized Record Processes
 * are feature pipelines, the target entity + written attribute, and last-run /
 * freshness derived from the most recent Process Run header.
 *
 * The doubles below only expose the strongly-typed members the engine reads; a
 * single deliberate `as unknown as` cast at the boundary hands them to the engine
 * as the real entity types.
 */

// ---------------------------------------------------------------------------
// In-memory entity doubles
// ---------------------------------------------------------------------------

interface RecordProcessDouble {
  ID: string;
  Name: string;
  Description: string | null;
  Status: 'Active' | 'Disabled' | 'Draft';
  WorkType: MJRecordProcessEntity['WorkType'];
  EntityID: string;
  Entity: string;
  Category: string | null;
  OutputMapping: string | null;
  OnDemandEnabled: boolean;
  ScheduleEnabled: boolean;
}

interface ProcessRunDouble {
  ID: string;
  RecordProcessID: string | null;
  Status: 'Cancelled' | 'Completed' | 'Failed' | 'Paused' | 'Pending' | 'Running';
  StartTime: Date | null;
  EndTime: Date | null;
  __mj_CreatedAt: Date;
  ProcessedItems: number;
  SuccessCount: number;
  ErrorCount: number;
  SkippedCount: number;
}

function recordProcess(overrides: Partial<RecordProcessDouble> = {}): MJRecordProcessEntity {
  const base: RecordProcessDouble = {
    ID: 'RP-1',
    Name: 'Member Engagement Summary',
    Description: 'LLM summary of member activity, embedded into a feature.',
    Status: 'Active',
    WorkType: 'Infer',
    EntityID: 'ENT-MEMBERS',
    Entity: 'Members',
    Category: FEATURE_PIPELINE_CATEGORY_NAME,
    OutputMapping: JSON.stringify({ field: 'EngagementScore' }),
    OnDemandEnabled: true,
    ScheduleEnabled: false,
    ...overrides,
  };
  return base as unknown as MJRecordProcessEntity;
}

function processRun(overrides: Partial<ProcessRunDouble> = {}): MJProcessRunEntity {
  const base: ProcessRunDouble = {
    ID: 'PR-1',
    RecordProcessID: 'RP-1',
    Status: 'Completed',
    StartTime: new Date('2026-06-20T10:00:00Z'),
    EndTime: new Date('2026-06-20T10:05:00Z'),
    __mj_CreatedAt: new Date('2026-06-20T10:00:00Z'),
    ProcessedItems: 100,
    SuccessCount: 98,
    ErrorCount: 2,
    SkippedCount: 0,
    ...overrides,
  };
  return base as unknown as MJProcessRunEntity;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeaturePipelineEngine.BuildSummaries', () => {
  it('projects identity, target entity, and parsed output attribute', () => {
    const [summary] = FeaturePipelineEngine.BuildSummaries([recordProcess()], []);

    expect(summary.ID).toBe('RP-1');
    expect(summary.Name).toBe('Member Engagement Summary');
    expect(summary.TargetEntityID).toBe('ENT-MEMBERS');
    expect(summary.TargetEntity).toBe('Members');
    expect(summary.WorkType).toBe('Infer');
    expect(summary.OutputAttribute).toBe('EngagementScore');
    expect(summary.OnDemandEnabled).toBe(true);
  });

  it('reports "Never" with null run metrics when a pipeline has no runs', () => {
    const [summary] = FeaturePipelineEngine.BuildSummaries([recordProcess()], []);

    expect(summary.LastRunStatus).toBe('Never');
    expect(summary.LastRunAt).toBeNull();
    expect(summary.LastRunProcessRunID).toBeNull();
    expect(summary.LastRunProcessed).toBeNull();
  });

  it('selects the most recent run regardless of input array order', () => {
    const older = processRun({
      ID: 'PR-OLD',
      StartTime: new Date('2026-06-01T00:00:00Z'),
      __mj_CreatedAt: new Date('2026-06-01T00:00:00Z'),
    });
    const newer = processRun({
      ID: 'PR-NEW',
      Status: 'Failed',
      StartTime: new Date('2026-06-25T00:00:00Z'),
      __mj_CreatedAt: new Date('2026-06-25T00:00:00Z'),
      ProcessedItems: 50,
      SuccessCount: 40,
      ErrorCount: 10,
    });

    // Intentionally pass oldest-first to prove the builder re-derives newest.
    const [summary] = FeaturePipelineEngine.BuildSummaries([recordProcess()], [older, newer]);

    expect(summary.LastRunProcessRunID).toBe('PR-NEW');
    expect(summary.LastRunStatus).toBe('Failed');
    expect(summary.LastRunProcessed).toBe(50);
    expect(summary.LastRunErrors).toBe(10);
    expect(summary.LastRunAt).toEqual(new Date('2026-06-25T00:00:00Z'));
  });

  it('ignores runs belonging to other Record Processes (and NULL-RecordProcess runs)', () => {
    const ownRun = processRun({ ID: 'PR-OWN', RecordProcessID: 'RP-1' });
    const otherRun = processRun({ ID: 'PR-OTHER', RecordProcessID: 'RP-2' });
    const engineRun = processRun({ ID: 'PR-NULL', RecordProcessID: null });

    const [summary] = FeaturePipelineEngine.BuildSummaries(
      [recordProcess()],
      [otherRun, engineRun, ownRun],
    );

    expect(summary.LastRunProcessRunID).toBe('PR-OWN');
  });

  it('collapses Running / Pending / Paused into "Running" and maps Cancelled', () => {
    const runningSummary = FeaturePipelineEngine.BuildSummaries(
      [recordProcess()],
      [processRun({ Status: 'Pending' })],
    )[0];
    expect(runningSummary.LastRunStatus).toBe('Running');

    const cancelledSummary = FeaturePipelineEngine.BuildSummaries(
      [recordProcess()],
      [processRun({ Status: 'Cancelled' })],
    )[0];
    expect(cancelledSummary.LastRunStatus).toBe('Cancelled');
  });
});

describe('FeaturePipelineEngine OutputMapping parsing', () => {
  it('parses a fields-array mapping into a comma-joined attribute string', () => {
    const rp = recordProcess({ OutputMapping: JSON.stringify({ fields: ['Sentiment', 'Summary'] }) });
    const [summary] = FeaturePipelineEngine.BuildSummaries([rp], []);
    expect(summary.OutputAttribute).toBe('Sentiment, Summary');
  });

  it('parses a fields-object mapping by its keys', () => {
    const rp = recordProcess({ OutputMapping: JSON.stringify({ fields: { Score: 'x', Tier: 'y' } }) });
    const [summary] = FeaturePipelineEngine.BuildSummaries([rp], []);
    expect(summary.OutputAttribute).toBe('Score, Tier');
  });

  it('returns null for malformed JSON or unrecognized shapes (never throws)', () => {
    const malformed = recordProcess({ OutputMapping: '{ not valid json' });
    expect(FeaturePipelineEngine.BuildSummaries([malformed], [])[0].OutputAttribute).toBeNull();

    const empty = recordProcess({ OutputMapping: null });
    expect(FeaturePipelineEngine.BuildSummaries([empty], [])[0].OutputAttribute).toBeNull();

    const unrecognized = recordProcess({ OutputMapping: JSON.stringify({ somethingElse: true }) });
    expect(FeaturePipelineEngine.BuildSummaries([unrecognized], [])[0].OutputAttribute).toBeNull();
  });
});

describe('FeaturePipelineEngine category constant', () => {
  it('exposes the seeded category name used to match Record Processes', () => {
    expect(FEATURE_PIPELINE_CATEGORY_NAME).toBe('Feature Pipeline');
  });
});

describe('FeaturePipelineEngine.Config — the provider it loads on', () => {
  /** The protected BaseEngine loader, as a spy target (test boundary). */
  type Loader = { Load: (configs: unknown[], provider: IMetadataProvider, forceRefresh: boolean, contextUser: unknown) => Promise<void> };

  it("loads on the caller's provider, and on the engine's own provider when the caller passes none", async () => {
    const engine = FeaturePipelineEngine.Instance;
    const load = vi.spyOn(engine as unknown as Loader, 'Load').mockResolvedValue(undefined);
    const global = { tag: 'global', EntityByName: processRunsEntity } as unknown as IMetadataProvider;
    const globalGetter = vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(global);
    const caller = { tag: 'caller', EntityByName: processRunsEntity } as unknown as IMetadataProvider;
    await engine.Config(true, undefined, caller);
    await engine.Config(true, undefined);
    // The engine is not bound to a provider (Load is stubbed), so its own provider is the global one.
    expect(load.mock.calls.map((c) => c[1])).toEqual([caller, global]);
    load.mockRestore();
    globalGetter.mockRestore();
  });
});

/** The `MJ: Process Runs` entity info the cap's filter is built from (schema and base view). */
function processRunsEntity(name: string): { SchemaName: string; BaseView: string } | undefined {
  return name === 'MJ: Process Runs' ? { SchemaName: '__mj', BaseView: 'vwProcessRuns' } : undefined;
}

/**
 * PR 5 milestone B3 — attack 6 (DD-9, F-DOC-10): the engine's Process Run cache holds at most
 * {@link FeaturePipelineEngine.MAX_RUNS_PER_PIPELINE} = 50 runs per pipeline (the newest), read with one ranked filter,
 * and the class comment says so. A runtime check on a database with 60 runs of one pipeline is in B3's §11 entry.
 */
describe('FeaturePipelineEngine — the Process Run cache is capped per pipeline (attack 6, DD-9)', () => {
  type Loader = { Load: (configs: { EntityName?: string; Filter?: string; PropertyName?: string }[], provider: IMetadataProvider, forceRefresh: boolean, contextUser: unknown) => Promise<void> };

  it('caps the cache at 50 runs per pipeline', () => {
    expect(FeaturePipelineEngine.MAX_RUNS_PER_PIPELINE).toBe(50);
  });

  it('loads MJ: Process Runs through a filter that keeps the newest 50 per Record Process', async () => {
    const engine = FeaturePipelineEngine.Instance;
    const load = vi.spyOn(engine as unknown as Loader, 'Load').mockResolvedValue(undefined);
    const provider = { tag: 'capped', EntityByName: processRunsEntity } as unknown as IMetadataProvider;
    await engine.Config(true, undefined, provider);
    const runs = load.mock.calls[0][0].find((c) => c.EntityName === 'MJ: Process Runs');
    load.mockRestore();
    expect(runs?.Filter).toBeDefined();
    const filter = String(runs?.Filter);
    expect(filter).toContain('[__mj].[vwProcessRuns]');
    expect(filter).toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY RecordProcessID ORDER BY __mj_CreatedAt DESC/);
    expect(filter).toContain('<= 50');
  });

  it('the class comment says the cache is capped (no "all Process Runs" claim)', () => {
    const source = readFileSync(join(__dirname, '..', 'feature-pipeline-engine.ts'), 'utf8');
    expect(source).toMatch(/newest 50 .*Process Runs.* per pipeline|MAX_RUNS_PER_PIPELINE/);
    expect(source).not.toMatch(/Runs are capped to the most recent rows \(the audit headers/);
  });
});
