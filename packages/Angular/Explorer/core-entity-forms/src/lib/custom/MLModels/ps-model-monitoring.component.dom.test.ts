import { afterEach, describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CreateFakeProvider, renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { PredictiveStudioRunModelMonitoringOperation, type MJMLModelEntity, type MJMLMonitoringResultEntity } from '@memberjunction/core-entities';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import { PSModelMonitoringComponent } from './ps-model-monitoring.component';
import { GatedReads, SettleReads } from './ps-gated-reads.dom-fixture';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/** The row members the tab reads (the JSON columns through their typed accessors). */
type PeriodDouble = Pick<
  MJMLMonitoringResultEntity,
  'ID' | 'Period' | 'State' | 'JoinedRows' | 'PrimaryValue' | 'PrimaryLower' | 'PrimaryUpper' | 'CalibrationObject' | 'DriftAlarmsObject' | 'TriggersFiredObject' | 'ChallengerResultObject' | 'RollbackCheckObject' | 'ErrorMessage'
>;

/** Fixture overrides: the JSON columns' values, as the monitoring job stores them. */
interface PeriodOver {
  TriggersFired?: MJMLMonitoringResultEntity['TriggersFiredObject'];
  RollbackCheck?: MJMLMonitoringResultEntity['RollbackCheckObject'];
  ChallengerResult?: MJMLMonitoringResultEntity['ChallengerResultObject'];
  DriftAlarms?: MJMLMonitoringResultEntity['DriftAlarmsObject'];
}

/** A drift alarm on `input` as procedure M stores it. */
const Alarm = (input: string): MJMLMonitoringResultEntity['DriftAlarmsObject'][number] => ({ input, kind: 'mean', z: 3.2, p: 0.001, pAdjusted: 0.004, q: 0.01, look: 2, flagged: true });

/** The period `i` months after January 2026, evaluated, with a score and its bounds. */
function P(i: number, over: PeriodOver = {}): PeriodDouble {
  return {
    ID: `MR-${i}`,
    Period: new Date(Date.UTC(2026, i, 1)),
    State: 'evaluated',
    JoinedRows: 200,
    PrimaryValue: 0.4 + i * 0.01,
    PrimaryLower: 0.38 + i * 0.01,
    PrimaryUpper: 0.42 + i * 0.01,
    CalibrationObject: { method: 'platt', slope: 0.98, intercept: 0.01, reliability: [] },
    DriftAlarmsObject: over.DriftAlarms || [],
    TriggersFiredObject: over.TriggersFired || [],
    ChallengerResultObject: over.ChallengerResult || null,
    RollbackCheckObject: over.RollbackCheck || null,
    ErrorMessage: null,
  };
}
const rollbackRecord = { ID: 'PR-ROLLBACK-1' };
const RolledBack = (record: { ID: string }): MJMLMonitoringResultEntity['RollbackCheckObject'] => ({
  kind: 'rolled-back', predecessorModelId: 'M-0', sharedRowIds: 180, comparisons: [{ level: 0.95, lower: 0.012, upper: 0.031 }, { level: 0.95, lower: 0.015, upper: 0.034 }], recordId: record.ID,
});

/** A Registry Check job run whose `Details` records `findings` (and, optionally, step (g)'s record). */
interface RegistryRunDouble { ID: string; StartedAt: Date; Details: string }

async function RenderMonitoring(opts: { periods: PeriodDouble[]; registryRuns?: RegistryRunDouble[]; failRegistryRuns?: string }) {
  const rowsOf = (p: RunViewParams): unknown[] => (p.EntityName === 'MJ: ML Monitoring Results' ? opts.periods : p.EntityName === 'MJ: Scheduled Job Runs' ? opts.registryRuns || [] : []);
  const provider = CreateFakeProvider({ runViewResults: rowsOf });
  const failure = opts.failRegistryRuns;
  if (failure !== undefined) {
    const failed = (p: RunViewParams): RunViewResult => p.EntityName === 'MJ: Scheduled Job Runs'
      ? { Success: false, ErrorMessage: failure, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0 }
      : { Success: true, ErrorMessage: '', Results: rowsOf(p), RowCount: rowsOf(p).length, TotalRowCount: rowsOf(p).length, ExecutionTime: 0 };
    Object.assign(provider, { RunViews: async (all: RunViewParams[]): Promise<RunViewResult[]> => all.map(failed) });
  }
  const f = renderComponentFixture(PSModelMonitoringComponent, { inputs: { Provider: provider } });
  f.componentInstance.Model = { ID: 'M-1' } as unknown as MJMLModelEntity;
  await f.componentInstance.Reload();
  f.detectChanges();
  return f;
}
type Fixture = Awaited<ReturnType<typeof RenderMonitoring>>;
const Count = (f: Fixture, testId: string): number => queryAll(f, `[data-testid="${testId}"]`).length;
const Text = (f: Fixture, testId: string): string => query(f, `[data-testid="${testId}"]`)?.textContent || '';
const Link = (f: Fixture, testId: string, i: number): string => queryAll(f, `[data-testid="${testId}"]`)[i]?.getAttribute('data-record-id') || '';

describe('PSModelMonitoringComponent (DOM)', () => {
  it('the monitoring tab renders one point per evaluated period with its bounds and marks the fired trigger', async () => {
    const f = await RenderMonitoring({ periods: [P(0), P(1), P(2), P(3, { TriggersFired: [{ kind: 'outcome-degradation', reason: 'below band' }] })] });
    expect(Count(f, 'ps-monitoring-point')).toBe(4);
    expect(Text(f, 'ps-monitoring-trigger')).toContain('below band');
    expect(queryAll(f, '[data-testid="ps-monitoring-point"]').map((p) => p.classList.contains('fired'))).toEqual([false, false, false, true]);
  });

  it('a rollback the job made links its publish record and shows the paired comparison', async () => {
    const f = await RenderMonitoring({ periods: [P(5, { RollbackCheck: RolledBack(rollbackRecord) })] });
    expect(Link(f, 'ps-monitoring-rollback', 0)).toContain(rollbackRecord.ID);
    expect(Text(f, 'ps-monitoring-rollback-check')).toContain('rolled-back');
    expect(Text(f, 'ps-monitoring-rollback-check')).toContain('[0.015, 0.034]');
  });

  it('a predecessor that may not be restored says why, and a check with the rule off shows nothing', async () => {
    const f = await RenderMonitoring({ periods: [P(5, { RollbackCheck: { kind: 'not-eligible', predecessorModelId: 'M-0', reason: 'the predecessor model has been deleted' } }), P(6, { RollbackCheck: { kind: 'off' } })] });
    expect(Count(f, 'ps-monitoring-rollback-check')).toBe(1);
    expect(Text(f, 'ps-monitoring-rollback-check')).toContain('the predecessor model has been deleted');
  });

  it('a challenger the gate published links its publish record; no challenger shows nothing', async () => {
    const f = await RenderMonitoring({ periods: [
      P(4, { ChallengerResult: { outcome: 'none', trainingRunId: null, recordId: null, reason: null, mirror: null } }),
      P(5, { ChallengerResult: { outcome: 'published', trainingRunId: 'TR-9', recordId: 'PR-CH-1', reason: null, mirror: { challengerModelId: 'M-9', paired: 120, agreement: 0.91, meanScoreDelta: -0.02, failures: 0 } } }),
    ] });
    expect(Count(f, 'ps-monitoring-challenger')).toBe(1);
    expect(Link(f, 'ps-monitoring-challenger-record', 0)).toBe('PR-CH-1');
    expect(Text(f, 'ps-monitoring-challenger')).toContain('published');
  });

  it('a failed read of the registry check runs is logged with its reason and shown as an error, never as no findings', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await RenderMonitoring({ periods: [P(0)], failRegistryRuns: 'the job runs read was refused' });
    expect(Text(f, 'ps-monitoring-error')).toContain('the job runs read was refused');
    expect(logged.mock.calls.flat().map(String).some((m) => m.includes('the job runs read was refused'))).toBe(true);
    logged.mockRestore();
  });

  it('a period is labelled by its UTC first day in every time zone (a period starting Jan 1 never reads Dec 31)', async () => {
    const f = await RenderMonitoring({ periods: [P(0)] });
    expect(Text(f, 'ps-monitoring-period')).toContain('Jan 1, 2026');
  });

  it('a period whose label window is open is listed but not plotted', async () => {
    const open: PeriodDouble = { ...P(6), State: 'window-open', JoinedRows: 0, PrimaryValue: null, PrimaryLower: null, PrimaryUpper: null };
    const f = await RenderMonitoring({ periods: [P(5), open] });
    expect([Count(f, 'ps-monitoring-point'), Count(f, 'ps-monitoring-period')]).toEqual([1, 2]);
  });

  it('names the input of a drift alarm', async () => {
    const f = await RenderMonitoring({ periods: [P(2, { DriftAlarms: [Alarm('EngagementZ')] })] });
    expect(Text(f, 'ps-monitoring-drift')).toContain('EngagementZ');
  });

  it('lists the registry check\'s findings about the model with the action the job took, and step (g)\'s', async () => {
    const run: RegistryRunDouble = {
      ID: 'RUN-1', StartedAt: new Date(Date.UTC(2026, 10, 19, 12)),
      Details: JSON.stringify({
        Findings: [
          { Finding: 'c', SubjectID: 'm-1', Detail: 'the stored artifact loads missing', Action: 'archived by the lifecycle gate', Outcome: 'remediated' },
          { Finding: 'd', SubjectID: 'M-2', Detail: 'another model', Action: 'scoring Action re-synced', Outcome: 'remediated' },
        ],
        PreChangeModels: {
          Reverified: { Visited: 1, Adopted: ['M-1'], Demoted: [], Evaluated: [], Retry: [] },
          Artifacts: { Visited: 0, Changed: 0, Verified: [], LegacyLocal: [], Missing: [], HashMismatch: [], Retry: [] },
          Schedules: { Disabled: [], ScoringActionsDisabled: [] }, ReEvaluation: { Trained: 0, Findings: [] }, DisabledProcessIDs: [],
        },
      }),
    };
    const f = await RenderMonitoring({ periods: [], registryRuns: [run] });
    const texts = queryAll(f, '[data-testid="ps-monitoring-finding"]').map((e) => e.textContent || '');
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('re-verified on its stored gate record');
    expect(texts[0]).toContain('kept Published with an adopt record');
    expect(texts[1]).toContain('the stored artifact loads missing');
    expect(texts[1]).toContain('archived by the lifecycle gate');
  });

  describe('Check now', () => {
    afterEach(() => vi.restoreAllMocks());

    it('runs PredictiveStudio.RunModelMonitoring for the model and reloads on success', async () => {
      const execute = vi.spyOn(PredictiveStudioRunModelMonitoringOperation.prototype, 'Execute').mockResolvedValue({ Success: true });
      const f = await RenderMonitoring({ periods: [P(0)] });
      const reload = vi.spyOn(f.componentInstance, 'Reload');
      await f.componentInstance.CheckNow();
      f.detectChanges();
      expect(execute.mock.calls[0][0]).toEqual({ modelId: 'M-1' });
      expect([reload.mock.calls.length, Count(f, 'ps-monitoring-check-error')]).toEqual([1, 0]);
    });

    it('a failed check shows why and does not reload', async () => {
      vi.spyOn(PredictiveStudioRunModelMonitoringOperation.prototype, 'Execute').mockResolvedValue({ Success: false, ErrorMessage: 'the model has no open monitoring job' });
      const f = await RenderMonitoring({ periods: [P(0)] });
      const reload = vi.spyOn(f.componentInstance, 'Reload');
      await f.componentInstance.CheckNow();
      f.detectChanges();
      expect(reload).not.toHaveBeenCalled();
      expect(Text(f, 'ps-monitoring-check-error')).toContain('the model has no open monitoring job');
    });
  });
});

describe('a model change while its rows load (M7-3)', () => {
  it('shows the current model\'s monitored periods when an earlier model\'s read finishes last', async () => {
    const reads = new GatedReads((modelId, p) => (p.EntityName === 'MJ: ML Monitoring Results' ? (modelId === 'M-A' ? [P(0), P(1), P(2)] : [P(0)]) : []));
    const f = renderComponentFixture(PSModelMonitoringComponent, { inputs: { Provider: reads.Provider() } });
    f.componentRef.setInput('Model', { ID: 'M-A' });
    f.detectChanges();
    f.componentRef.setInput('Model', { ID: 'M-B' });
    f.detectChanges();
    await SettleReads();
    reads.Release('M-B');
    await SettleReads();
    reads.Release('M-A');
    await SettleReads();
    f.detectChanges();
    expect(queryAll(f, '[data-testid="ps-monitoring-period"]').length).toBe(1);
  });
});
