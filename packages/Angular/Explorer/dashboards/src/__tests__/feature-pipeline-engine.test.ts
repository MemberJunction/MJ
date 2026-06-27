import { describe, it, expect } from 'vitest';
import type { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import {
  FeaturePipelineEngine,
  FEATURE_PIPELINE_CATEGORY_NAME,
} from '../KnowledgeHub/components/feature-pipelines/feature-pipeline.engine';

/**
 * Tests for the Knowledge Hub FeaturePipelineEngine's pure projection layer
 * (Predictive Studio SP6). A Feature Pipeline is a categorized MJ: Record Processes
 * row; the engine projects each one (+ its most recent MJ: Process Runs header)
 * into the summary the KH UI cards bind to. We exercise the static, provider-free
 * `BuildSummaries` with in-memory entity doubles — the same approach the
 * predictive-studio-engine test uses for its pure reducer.
 */

interface RPDouble {
  ID: string;
  Name: string;
  Description: string | null;
  Status: 'Active' | 'Disabled' | 'Draft';
  WorkType: 'Action' | 'Agent' | 'FieldRules' | 'Infer';
  EntityID: string;
  Entity: string;
  OutputMapping: string | null;
  OnDemandEnabled: boolean;
  ScheduleEnabled: boolean;
}

interface RunDouble {
  ID: string;
  RecordProcessID: string | null;
  Status: 'Cancelled' | 'Completed' | 'Failed' | 'Paused' | 'Pending' | 'Running';
  StartTime: Date | null;
  EndTime: Date | null;
  __mj_CreatedAt: Date;
  ProcessedItems: number;
  SuccessCount: number;
  ErrorCount: number;
}

function rp(overrides: Partial<RPDouble> = {}): MJRecordProcessEntity {
  const base: RPDouble = {
    ID: 'RP-1',
    Name: 'Member Engagement Summary',
    Description: 'LLM summary of member activity.',
    Status: 'Active',
    WorkType: 'Infer',
    EntityID: 'ENT-MEMBERS',
    Entity: 'Members',
    OutputMapping: JSON.stringify({ field: 'EngagementScore' }),
    OnDemandEnabled: true,
    ScheduleEnabled: false,
    ...overrides,
  };
  return base as unknown as MJRecordProcessEntity;
}

function run(overrides: Partial<RunDouble> = {}): MJProcessRunEntity {
  const base: RunDouble = {
    ID: 'PR-1',
    RecordProcessID: 'RP-1',
    Status: 'Completed',
    StartTime: new Date('2026-06-20T10:00:00Z'),
    EndTime: new Date('2026-06-20T10:05:00Z'),
    __mj_CreatedAt: new Date('2026-06-20T10:00:00Z'),
    ProcessedItems: 100,
    SuccessCount: 98,
    ErrorCount: 2,
    ...overrides,
  };
  return base as unknown as MJProcessRunEntity;
}

describe('FeaturePipelineEngine.BuildSummaries (KH)', () => {
  it('projects identity, target entity, and parsed output attribute', () => {
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], []);
    expect(s.ID).toBe('RP-1');
    expect(s.TargetEntity).toBe('Members');
    expect(s.OutputAttribute).toBe('EngagementScore');
    expect(s.LastRunStatus).toBe('Never');
  });

  it('selects the most recent run regardless of input order', () => {
    const older = run({ ID: 'PR-OLD', StartTime: new Date('2026-06-01T00:00:00Z'), __mj_CreatedAt: new Date('2026-06-01T00:00:00Z') });
    const newer = run({ ID: 'PR-NEW', Status: 'Failed', StartTime: new Date('2026-06-25T00:00:00Z'), __mj_CreatedAt: new Date('2026-06-25T00:00:00Z') });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [older, newer]);
    expect(s.LastRunProcessRunID).toBe('PR-NEW');
    expect(s.LastRunStatus).toBe('Failed');
  });

  it('ignores runs from other Record Processes and NULL-process runs', () => {
    const own = run({ ID: 'PR-OWN', RecordProcessID: 'RP-1' });
    const other = run({ ID: 'PR-OTHER', RecordProcessID: 'RP-2' });
    const engineRun = run({ ID: 'PR-NULL', RecordProcessID: null });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [other, engineRun, own]);
    expect(s.LastRunProcessRunID).toBe('PR-OWN');
  });

  it('parses array + object OutputMapping shapes and tolerates malformed JSON', () => {
    expect(FeaturePipelineEngine.BuildSummaries([rp({ OutputMapping: JSON.stringify({ fields: ['A', 'B'] }) })], [])[0].OutputAttribute).toBe('A, B');
    expect(FeaturePipelineEngine.BuildSummaries([rp({ OutputMapping: JSON.stringify({ fields: { X: 1, Y: 2 } }) })], [])[0].OutputAttribute).toBe('X, Y');
    expect(FeaturePipelineEngine.BuildSummaries([rp({ OutputMapping: '{bad json' })], [])[0].OutputAttribute).toBeNull();
    expect(FeaturePipelineEngine.BuildSummaries([rp({ OutputMapping: null })], [])[0].OutputAttribute).toBeNull();
  });

  it('exposes the seeded category name', () => {
    expect(FEATURE_PIPELINE_CATEGORY_NAME).toBe('Feature Pipeline');
  });
});
