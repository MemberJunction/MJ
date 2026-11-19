import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CreateFakeProvider, renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { MJMLModelEntity, MJMLMonitoringResultEntity } from '@memberjunction/core-entities';
import { PSModelMonitoringComponent } from './ps-model-monitoring.component';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/** The row members the tab reads (the JSON columns as stored text). */
type PeriodDouble = Pick<
  MJMLMonitoringResultEntity,
  'ID' | 'Period' | 'State' | 'JoinedRows' | 'PrimaryValue' | 'PrimaryLower' | 'PrimaryUpper' | 'Calibration' | 'DriftAlarms' | 'TriggersFired' | 'ChallengerResult' | 'RollbackCheck' | 'ErrorMessage'
>;

/** Fixture overrides: the JSON columns as their values, stored as JSON text. */
interface PeriodOver {
  TriggersFired?: { kind: string; reason: string }[];
  RollbackCheck?: Record<string, string | number | boolean>;
  DriftAlarms?: { input: string }[];
}

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
    Calibration: JSON.stringify({ method: 'platt', slope: 0.98, intercept: 0.01, reliability: [] }),
    DriftAlarms: JSON.stringify(over.DriftAlarms || []),
    TriggersFired: JSON.stringify(over.TriggersFired || []),
    ChallengerResult: null,
    RollbackCheck: over.RollbackCheck ? JSON.stringify(over.RollbackCheck) : null,
    ErrorMessage: null,
  };
}
const rollbackRecord = { ID: 'PR-ROLLBACK-1' };
const Fired = (record: { ID: string }): Record<string, string | number | boolean> => ({ kind: 'fired', previousModelId: 'M-0', consecutive: 2, publishRecordId: record.ID });

async function RenderMonitoring(opts: { periods: PeriodDouble[] }) {
  const provider = CreateFakeProvider({ runViewResults: (p) => (p.EntityName === 'MJ: ML Monitoring Results' ? opts.periods : []) });
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

  it('a rollback the job made links its publish record', async () => {
    const f = await RenderMonitoring({ periods: [P(5, { RollbackCheck: Fired(rollbackRecord) })] });
    expect(Link(f, 'ps-monitoring-rollback', 0)).toContain(rollbackRecord.ID);
  });

  it('a period whose label window is open is listed but not plotted', async () => {
    const open: PeriodDouble = { ...P(6), State: 'window-open', JoinedRows: 0, PrimaryValue: null, PrimaryLower: null, PrimaryUpper: null };
    const f = await RenderMonitoring({ periods: [P(5), open] });
    expect([Count(f, 'ps-monitoring-point'), Count(f, 'ps-monitoring-period')]).toEqual([1, 2]);
  });

  it('names the input of a drift alarm', async () => {
    const f = await RenderMonitoring({ periods: [P(2, { DriftAlarms: [{ input: 'EngagementZ' }] })] });
    expect(Text(f, 'ps-monitoring-drift')).toContain('EngagementZ');
  });
});
