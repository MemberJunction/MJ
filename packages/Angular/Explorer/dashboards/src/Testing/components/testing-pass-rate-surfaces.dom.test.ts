/**
 * QF2-Y2 — the Runs stats, Explorer cards and Analytics trends/versions rate executed runs only (Skipped runs are
 * neither passes nor failures) and show skipped runs separately next to a run count. The rate logic is exercised
 * on the component prototypes (no render needed); the shared helper is unit-tested in testing-pass-rate.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { TestingRunsComponent } from './testing-runs.component';
import { TestingExplorerComponent } from './testing-explorer.component';
import { TestingAnalyticsComponent } from './testing-analytics.component';
import type { TestRunWithFeedbackSummary, TestTrendData, VersionMetrics } from '../services/testing-instrumentation.service';

interface RunsInternals {
  computeStats(runs: TestRunWithFeedbackSummary[]): { totalRuns: number; passRate: number; SkippedRuns: number };
}
interface ExplorerInternals {
  allSuiteTests: Array<{ SuiteID: string; TestID: string; Sequence: number }>;
  allTests: Array<{ ID: string; Name: string; TypeID: string }>;
  AllTestTypes: Array<{ ID: string; Name: string }>;
  AllSuites: Array<{ ID: string; Name: string }>;
  testRunStats: Array<{ ID: string; TestID: string; Status: string; Score: number; CostUSD: number; StartedAt: string; CompletedAt: string | null }>;
  buildSingleSuiteCard(suite: { ID: string; Name: string; Description: string; Status: string; Tags: string | null }): { PassRate: number };
  buildSingleTestCard(test: { ID: string; Name: string; Description: string; Status: string; TypeID: string; Tags: string | null; EstimatedDurationSeconds: number | null; EstimatedCostUSD: number | null }): { PassRate: number; TotalRuns: number; SkippedRuns: number };
}
interface AnalyticsInternals {
  PassRate(t: TestTrendData): number;
  averagePassRate(trends: TestTrendData[]): number;
  buildVersionRows(metrics: VersionMetrics[]): Array<{ totalTests: number; passRate: number; SkippedTests: number }>;
}

const runStatus = (id: string, status: TestRunWithFeedbackSummary['status']) =>
  ({ id, status, duration: 1000, cost: 0 } as TestRunWithFeedbackSummary);
const trend = (totalRuns: number, passed: number, skipped: number): TestTrendData =>
  ({ timestamp: new Date(), totalRuns, passed, failed: totalRuns - passed - skipped, skipped, errors: 0, averageScore: 0, totalCost: 0, averageDuration: 0 });

describe('QF2-Y2 pass rates on the Testing surfaces', () => {
  it('Runs stats: rate over executed runs, skipped counted separately', () => {
    const c = Object.create(TestingRunsComponent.prototype) as RunsInternals;
    const stats = c.computeStats([runStatus('a', 'Passed'), runStatus('b', 'Failed'), runStatus('c', 'Skipped'), runStatus('d', 'Skipped')]);
    expect(stats).toMatchObject({ totalRuns: 4, passRate: 50, SkippedRuns: 2 });
  });

  it('Explorer cards: suite and test pass rates over executed runs, test card counts skipped', () => {
    const c = Object.create(TestingExplorerComponent.prototype) as ExplorerInternals;
    c.allSuiteTests = [{ SuiteID: 'S', TestID: 'T', Sequence: 1 }];
    c.allTests = [{ ID: 'T', Name: 'Test T', TypeID: 'TT' }];
    c.AllTestTypes = [];
    c.AllSuites = [{ ID: 'S', Name: 'Suite' }];
    const r = (id: string, Status: string) => ({ ID: id, TestID: 'T', Status, Score: 0, CostUSD: 0, StartedAt: '2026-10-15T00:00:00Z', CompletedAt: null });
    c.testRunStats = [r('1', 'Passed'), r('2', 'Skipped'), r('3', 'Failed'), r('4', 'Skipped')];
    expect(c.buildSingleSuiteCard({ ID: 'S', Name: 'Suite', Description: '', Status: 'Active', Tags: null }).PassRate).toBe(50);
    expect(c.buildSingleTestCard({ ID: 'T', Name: 'Test T', Description: '', Status: 'Active', TypeID: 'TT', Tags: null, EstimatedDurationSeconds: null, EstimatedCostUSD: null }))
      .toMatchObject({ PassRate: 50, TotalRuns: 4, SkippedRuns: 2 });
  });

  it('Analytics: trend pass rate, the trend direction average and version rows rate executed runs', () => {
    const c = Object.create(TestingAnalyticsComponent.prototype) as AnalyticsInternals;
    expect(c.PassRate(trend(10, 4, 2))).toBe(50);
    expect(c.averagePassRate([trend(10, 4, 2), trend(4, 0, 4)])).toBe(50); // the all-skipped bucket has no rate
    const v = { version: 'v', gitCommit: 'abcdef1', agentVersion: '1', runDate: new Date(), totalTests: 10, SkippedTests: 2, passRate: 75, averageScore: 0, totalCost: 0, averageDuration: 0, newFailures: 0, newPasses: 0 } as VersionMetrics;
    expect(c.buildVersionRows([v])[0]).toMatchObject({ totalTests: 10, SkippedTests: 2, passRate: 75 });
  });
});
