import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import {
  TestingExecutionService, TestingDialogService, TestStatusBadgeComponent, ScoreIndicatorComponent, CostDisplayComponent,
} from '@memberjunction/ng-testing';
import { MJPageBodyComponent, MJPageHeaderComponent, MJPageLayoutComponent, MJRefreshButtonComponent } from '@memberjunction/ng-ui-components';
import { KPICardComponent } from '../../AI/components/widgets/kpi-card.component';
import { TestEngineBase } from '@memberjunction/testing-engine-base';
import { TestingDashboardTabComponent } from './testing-dashboard-tab.component';
import { TestingInstrumentationService, type SuiteHierarchyNode, type TestRunSummary, type TestingDashboardKPIs } from '../services/testing-instrumentation.service';

const KPIS: TestingDashboardKPIs = {
  TotalTestsActive: 0, PassRateThisMonth: 0, TotalCostThisMonth: 0, AverageDuration: 0, TestsPendingReview: 0,
  TotalTestRuns: 0, FailedTests: 0, SkippedTests: 0, PassRateTrend: 0,
};

const suite = (id: string, name: string, testCount: number, runCount: number, passRate: number): SuiteHierarchyNode => ({
  id, name, parentID: null, level: 0, children: [], testCount, RunCount: runCount, passRate, totalCost: 0, averageScore: 0,
});

const run = (id: string, testName: string, status: TestRunSummary['status'], score: number): TestRunSummary => ({
  id, testId: `t-${id}`, testName, suiteName: '', testType: '', status, score, duration: 1000, cost: 0,
  runDateTime: new Date('2026-10-15T01:00:00Z'), targetType: '', targetLogID: '',
});

async function renderOverview(suites: SuiteHierarchyNode[], runs: TestRunSummary[]) {
  vi.spyOn(TestEngineBase.Instance, 'Config').mockResolvedValue(undefined);
  const instrumentation = {
    isLoading$: new BehaviorSubject(false), kpis$: of(KPIS), testRuns$: of(runs), suiteHierarchy$: of(suites),
    refresh: () => undefined,
  };
  // The child widgets are the real display components; loading and empty states are stubs.
  const f = renderComponentFixture(TestingDashboardTabComponent, {
    imports: [
      CommonModule, MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJRefreshButtonComponent,
      StubLoadingComponent, StubEmptyStateComponent,
    ],
    declarations: [TestingDashboardTabComponent, KPICardComponent, TestStatusBadgeComponent, ScoreIndicatorComponent, CostDisplayComponent],
    providers: [
      { provide: TestingInstrumentationService, useValue: instrumentation },
      { provide: TestingExecutionService, useValue: { ActiveRuns$: of([]) } },
      { provide: TestingDialogService, useValue: {} },
    ],
  });
  await f.whenStable();
  f.detectChanges();
  return f;
}

describe('Testing Overview — Suite Health and Alerts', () => {
  it('shows "No runs" instead of a 0% pass rate for a suite with no runs in the period, and lists it last', async () => {
    const f = await renderOverview([
      suite('s-none', 'Integration Tests — Live Model', 16, 0, 0),
      suite('s-gates', 'Predictive Studio Gates', 6, 33, 76),
      suite('s-red', 'Failing Suite', 2, 4, 0),
    ], []);
    const rows = queryAll(f, '.suite-health-row').map((r) => ({
      name: r.querySelector('.suite-health-name')?.textContent?.trim(),
      pct: r.querySelector('.suite-health-pct')?.textContent?.trim() ?? null,
      none: r.querySelector('.suite-health-none')?.textContent?.trim() ?? null,
    }));
    expect(rows).toEqual([
      { name: 'Failing Suite', pct: '0%', none: null },
      { name: 'Predictive Studio Gates', pct: '76%', none: null },
      { name: 'Integration Tests — Live Model', pct: null, none: 'No runs' },
    ]);
  });

  it('raises no low-score alert for a Skipped run, but still does for a scored Failed run', async () => {
    const f = await renderOverview([], [
      run('r1', 'IT52', 'Skipped', 0),
      run('r2', 'IT113', 'Skipped', 0),
      run('r3', 'IT7', 'Failed', 0.2),
    ]);
    const alerts = queryAll(f, '.alert-row .alert-name').map((n) => n.textContent?.trim());
    expect(alerts).toEqual(['IT7']);
  });
});
