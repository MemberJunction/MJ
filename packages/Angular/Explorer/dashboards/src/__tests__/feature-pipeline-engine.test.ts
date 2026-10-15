import { describe, it, expect } from 'vitest';
import type { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import type { FeaturePipelineRunResult } from '@memberjunction/record-set-processor-base';
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
    ParameterFidelity: null,
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

describe('FeaturePipelineEngine.BuildSummaries — dry runs and written counts', () => {
  const realRun = run({
    ID: 'PR-REAL',
    StartTime: new Date('2026-06-20T10:00:00Z'),
    DryRun: false,
    ResultSummary: resultSummary({ Attempted: 10, Upserted: 6, Unchanged: 3, Failed: 1 }),
    ProcessedItems: 10,
    SuccessCount: 9,
    ErrorCount: 1,
  });
  const newerDryRun = run({
    ID: 'PR-DRY',
    StartTime: new Date('2026-06-25T10:00:00Z'),
    DryRun: true,
    ResultSummary: resultSummary({ Attempted: 5, Previewed: 5 }),
    ProcessedItems: 5,
    SuccessCount: 5,
    ErrorCount: 0,
  });

  it('reports a real run by what it wrote, left unchanged and failed, of the records it processed', () => {
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [realRun]);

    expect(s.LastRunProcessRunID).toBe('PR-REAL');
    expect(s.LastRunResult?.Upserted).toBe(6);
    expect(s.LastRunOutcome).toEqual({ Written: 6, Unchanged: 3, Failed: 1, Total: 10 });
    expect(s.LastRunOutcomeText).toBe('6 written, 3 unchanged, 1 failed of 10');
    expect(s.LatestDryRun).toBeNull();
  });

  it('counts records skipped on their watermark as up to date (F12: not "0 of 0 up to date")', () => {
    const skippedAll = run({
      ID: 'PR-SKIP', ProcessedItems: 5, SuccessCount: 0, ErrorCount: 0,
      ResultSummary: resultSummary({ Attempted: 0, Skipped: 5 }),
    });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [skippedAll]);

    expect(s.LastRunOutcome).toEqual({ Written: 0, Unchanged: 5, Failed: 0, Total: 5 });
    expect(s.LastRunOutcomeText).toBe('5 of 5 up to date (5 unchanged)');
  });

  it('reads a mixed run as written and unchanged of the records processed', () => {
    const mixed = run({
      ID: 'PR-MIXED', ProcessedItems: 2, SuccessCount: 1, ErrorCount: 0,
      ResultSummary: resultSummary({ Attempted: 1, Upserted: 1, Skipped: 1 }),
    });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [mixed]);

    expect(s.LastRunOutcomeText).toBe('1 written, 1 unchanged of 2');
  });

  it('never calls a failed run up to date, and carries its error message', () => {
    const refused = run({
      ID: 'PR-REFUSED', Status: 'Failed', ProcessedItems: 0, SuccessCount: 0, ErrorCount: 0,
      ErrorMessage: 'Feature Pipeline version v6 is not activated',
      ResultSummary: resultSummary({ Attempted: 0, Status: 'failed' }),
    });
    const skippedThenFailed = run({
      ID: 'PR-FAILED', Status: 'Failed', ProcessedItems: 3, SuccessCount: 0, ErrorCount: 0, StartTime: new Date('2026-06-21T00:00:00Z'),
      ResultSummary: resultSummary({ Attempted: 0, Skipped: 3, Status: 'failed' }),
    });

    const [r] = FeaturePipelineEngine.BuildSummaries([rp()], [refused]);
    expect(r.LastRunOutcomeText).toBe('no records processed');
    expect(r.LastRunErrorMessage).toBe('Feature Pipeline version v6 is not activated');

    const [f] = FeaturePipelineEngine.BuildSummaries([rp()], [skippedThenFailed]);
    expect(f.LastRunOutcomeText).toBe('3 unchanged of 3');
  });

  it('has no error message for a completed run, even one whose row holds a message', () => {
    const completedWithNote = run({ ID: 'PR-NOTE', Status: 'Completed', ErrorMessage: 'Auto-paused: budget exceeded', ResultSummary: resultSummary() });
    expect(FeaturePipelineEngine.BuildSummaries([rp()], [realRun])[0].LastRunErrorMessage).toBeNull();
    expect(FeaturePipelineEngine.BuildSummaries([rp()], [completedWithNote])[0].LastRunErrorMessage).toBeNull();
  });

  it('dates the last run by the newest real run and carries a newer dry run as its own note', () => {
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [newerDryRun, realRun]);

    expect(s.LastRunProcessRunID).toBe('PR-REAL');
    expect(s.LastRunAt).toEqual(new Date('2026-06-20T10:00:00Z'));
    expect(s.LatestDryRun).toEqual({
      ProcessRunID: 'PR-DRY',
      RunAt: new Date('2026-06-25T10:00:00Z'),
      Previewed: 5,
      Attempted: 5,
      Errors: 0,
    });
  });

  it('drops a dry run older than the newest real run', () => {
    const olderDryRun = run({ ID: 'PR-OLD-DRY', StartTime: new Date('2026-06-10T10:00:00Z'), DryRun: true, ResultSummary: resultSummary({ Previewed: 5 }) });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [olderDryRun, realRun]);

    expect(s.LatestDryRun).toBeNull();
    expect(s.LastRunProcessRunID).toBe('PR-REAL');
  });

  it('shows a pipeline that has only been dry-run as never run, with the dry run as its note', () => {
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [newerDryRun]);

    expect(s.LastRunStatus).toBe('Never');
    expect(s.LastRunAt).toBeNull();
    expect(s.LastRunProcessRunID).toBeNull();
    expect(s.LatestDryRun?.Previewed).toBe(5);
  });

  it('takes a dry run\'s counts from the run row when it has no result summary', () => {
    const legacyDry = run({ ID: 'PR-LEGACY-DRY', DryRun: true, ResultSummary: null, ProcessedItems: 7, SuccessCount: 6, ErrorCount: 1 });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [legacyDry]);

    expect(s.LatestDryRun).toMatchObject({ Previewed: 6, Attempted: 7, Errors: 1 });
  });

  it('falls back to the run row counts for a run without a result summary', () => {
    const legacy = run({ ID: 'PR-LEGACY', DryRun: false, ResultSummary: null, ProcessedItems: 100, SuccessCount: 98, ErrorCount: 2 });
    const [s] = FeaturePipelineEngine.BuildSummaries([rp()], [legacy]);

    expect(s.LastRunResult).toBeNull();
    expect(s.LastRunOutcome).toBeNull();
    expect(s.LastRunOutcomeText).toBeNull();
    expect(s.LastRunProcessed).toBe(100);
    expect(s.LastRunSuccess).toBe(98);
  });

  it('treats a result summary that is not a Feature Pipeline result as a legacy run', () => {
    const odd = run({ ID: 'PR-ODD', ResultSummary: '{"unrelated":true}' });
    const bad = run({ ID: 'PR-BAD', ResultSummary: '{not json', StartTime: new Date('2026-06-21T00:00:00Z') });

    expect(FeaturePipelineEngine.BuildSummaries([rp()], [odd])[0].LastRunResult).toBeNull();
    for (const missing of ['Attempted', 'Upserted', 'Unchanged', 'Previewed']) {
      const counts: Record<string, number> = { Attempted: 5, Upserted: 1, Unchanged: 1, Previewed: 0 };
      delete counts[missing];
      const partial = run({ ID: 'PR-PARTIAL', ResultSummary: JSON.stringify(counts) });
      expect(FeaturePipelineEngine.BuildSummaries([rp()], [partial])[0].LastRunResult, `without ${missing}`).toBeNull();
    }
    expect(FeaturePipelineEngine.BuildSummaries([rp()], [bad])[0].LastRunResult).toBeNull();
  });
});
