import { describe, it, expect } from 'vitest';
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
  WorkType: 'Action' | 'Agent' | 'FieldRules' | 'Infer';
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
