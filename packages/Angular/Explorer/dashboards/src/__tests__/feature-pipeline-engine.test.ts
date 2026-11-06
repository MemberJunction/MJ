import { describe, it, expect } from 'vitest';
import type { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import type { FeaturePipelineRunResult } from '@memberjunction/feature-pipelines';
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
  WorkType: MJRecordProcessEntity['WorkType'];
  EntityID: string;
  Entity: string;
  OutputMapping: string | null;
  Configuration?: string | null;
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
  DryRun?: boolean;
  ResultSummary?: string | null;
  ErrorMessage?: string | null;
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
    Configuration: null,
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

  it('derives PipelineType defaulting to LLM or reading from Configuration', () => {
    const [sDefault] = FeaturePipelineEngine.BuildSummaries([rp()], []);
    expect(sDefault.PipelineType).toBe('LLM');

    const [sDecision] = FeaturePipelineEngine.BuildSummaries([rp({ Configuration: JSON.stringify({ PipelineType: 'Decision' }) })], []);
    expect(sDecision.PipelineType).toBe('Decision');

    const [sMalformed] = FeaturePipelineEngine.BuildSummaries([rp({ Configuration: '{invalid json' })], []);
    expect(sMalformed.PipelineType).toBe('LLM');
  });

  it('gives the built-in type names in their canonical case, so the Decision badge styles any spelling', () => {
    const summaries = FeaturePipelineEngine.BuildSummaries(
      [
        rp({ Configuration: JSON.stringify({ PipelineType: ' decision ' }) }),
        rp({ Configuration: JSON.stringify({ PipelineType: 'llm' }) }),
        rp({ Configuration: JSON.stringify({ PipelineType: 'MyCustomType' }) }),
        rp({ Configuration: JSON.stringify({ PipelineType: 42 }) }),
      ],
      []
    );
    expect(summaries.map((s) => s.PipelineType)).toEqual(['Decision', 'LLM', 'MyCustomType', 'LLM']);
  });
});

/** The ResultSummary a Feature Pipeline run persists (the counts the card reads). */
function resultSummary(counts: Partial<FeaturePipelineRunResult> = {}): string {
  const result: FeaturePipelineRunResult = {
    RecordProcessID: 'RP-1',
    Pin: null,
    Attempted: 5,
    Upserted: 0,
    Unchanged: 0,
    Previewed: 0,
    RejectedInvalid: 0,
    Failed: 0,
    Skipped: 0,
    HumanValuesPreserved: 0,
    BelowConfidence: 0,
    Status: 'completed',
    ...counts,
  };
  return JSON.stringify(result);
}

describe('FeaturePipelineEngine.BuildSummaries — last-run outcome', () => {
  const realRun = run({
    ID: 'PR-REAL',
    StartTime: new Date('2026-06-20T10:00:00Z'),
    ResultSummary: resultSummary({ Attempted: 10, Upserted: 6, Unchanged: 3, Failed: 1 }),
    ProcessedItems: 10,
    SuccessCount: 9,
    ErrorCount: 1,
  });

  it('reports a run by what it wrote, left unchanged and failed, of the records it processed', () => {
    expect(FeaturePipelineEngine.BuildSummaries([rp()], [realRun])[0].LastRunOutcomeText).toBe('6 written, 3 unchanged, 1 failed of 10');
  });

  it('counts records skipped on their watermark as up to date', () => {
    const skippedAll = run({ ID: 'PR-SKIP', ProcessedItems: 5, SuccessCount: 0, ErrorCount: 0, ResultSummary: resultSummary({ Attempted: 0, Skipped: 5 }) });

    expect(FeaturePipelineEngine.BuildSummaries([rp()], [skippedAll])[0].LastRunOutcomeText).toBe('5 of 5 up to date (5 unchanged)');
  });

  it('never calls a failed run up to date, and carries its error message', () => {
    const refused = run({
      ID: 'PR-REFUSED', Status: 'Failed', ProcessedItems: 3, SuccessCount: 0, ErrorCount: 0,
      ErrorMessage: 'Feature Pipeline version v6 is not activated',
      ResultSummary: resultSummary({ Attempted: 0, Skipped: 3, Status: 'failed' }),
    });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [refused]);

    expect(s.LastRunOutcomeText).toBe('3 unchanged of 3');
    expect(s.LastRunErrorMessage).toBe('Feature Pipeline version v6 is not activated');
  });

  it('has no error message for a completed run, even one whose row holds a message', () => {
    const completedWithNote = run({ ID: 'PR-NOTE', Status: 'Completed', ErrorMessage: 'Auto-paused: budget exceeded', ResultSummary: resultSummary() });

    expect(FeaturePipelineEngine.BuildSummaries([rp()], [completedWithNote])[0].LastRunErrorMessage).toBeNull();
  });

  it('takes the last run from real runs only: a dry run is never the last run', () => {
    const newerDryRun = run({ ID: 'PR-DRY', StartTime: new Date('2026-06-25T10:00:00Z'), DryRun: true, ResultSummary: resultSummary({ Previewed: 5 }) });

    expect(FeaturePipelineEngine.BuildSummaries([rp()], [newerDryRun, realRun])[0].LastRunProcessRunID).toBe('PR-REAL');
    expect(FeaturePipelineEngine.BuildSummaries([rp()], [newerDryRun])[0].LastRunStatus).toBe('Never');
  });

  it('has no outcome text for a run without a result summary', () => {
    const legacy = run({ ID: 'PR-LEGACY', ResultSummary: null, ProcessedItems: 100, SuccessCount: 98, ErrorCount: 2 });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [legacy]);

    expect(s.LastRunOutcomeText).toBeNull();
    expect(s.LastRunProcessed).toBe(100);
  });
});
