/**
 * F18 — the Testing Overview's Suite Health and Alerts.
 * (1) A suite with no runs in the period has no pass rate: it reads "No runs", not "0%".
 * (2) A Skipped run is not a failure: its 0 score must not raise a "Score below 0.5" alert.
 */
import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, queryAll } from '@memberjunction/ng-test-utils';
import { TestingExecutionService, TestingDialogService } from '@memberjunction/ng-testing';
import { TestEngineBase } from '@memberjunction/testing-engine-base';
import { TestingDashboardTabComponent } from './testing-dashboard-tab.component';
import { TestingInstrumentationService, type SuiteHierarchyNode, type TestRunSummary, type TestingDashboardKPIs } from '../services/testing-instrumentation.service';

const KPIS: TestingDashboardKPIs = {
  TotalTestsActive: 0, PassRateThisMonth: 0, TotalCostThisMonth: 0, AverageDuration: 0, TestsPendingReview: 0,
  TotalTestRuns: 0, FailedTests: 0, SkippedTests: 0, PassRateTrend: 0,
};

const suite = (id: string, name: string, testCount: number, runCount: number, passRate: number, skipped = 0): SuiteHierarchyNode => ({
  id, name, parentID: null, level: 0, children: [], testCount, RunCount: runCount, SkippedCount: skipped, passRate, totalCost: 0, averageScore: 0,
});

const run = (id: string, testName: string, status: TestRunSummary['status'], score: number): TestRunSummary => ({
  id, testId: `t-${id}`, testName, suiteName: '', testType: '', status, score, duration: 1000, cost: 0,
  runDateTime: new Date('2026-10-15T01:00:00Z'), targetType: '', targetLogID: '',
});

async function renderOverview(suites: SuiteHierarchyNode[], runs: TestRunSummary[], kpis: TestingDashboardKPIs = KPIS) {
  vi.spyOn(TestEngineBase.Instance, 'Config').mockResolvedValue(undefined);
  const instrumentation = {
    isLoading$: new BehaviorSubject(false), kpis$: of(kpis), testRuns$: of(runs), suiteHierarchy$: of(suites),
    refresh: () => undefined,
  };
  // The child widgets (KPI cards, badges, empty states) are outside this check; render them inert.
  TestBed.configureTestingModule({ schemas: [CUSTOM_ELEMENTS_SCHEMA] });
  const f = renderComponentFixture(TestingDashboardTabComponent, {
    imports: [CommonModule],
    declarations: [TestingDashboardTabComponent],
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

describe('Testing Overview — Suite Health and Alerts (F18)', () => {
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

  it('QF2-Y2: says "All skipped" for a suite whose runs were all skipped, and labels its runs', async () => {
    const f = await renderOverview([suite('s-skip', 'Skipped Suite', 3, 4, 0, 4), suite('s-mix', 'Mixed', 2, 5, 50, 1)], []);
    const rows = queryAll(f, '.suite-health-row').map((r) => ({
      name: r.querySelector('.suite-health-name')?.textContent?.trim(),
      none: r.querySelector('.suite-health-none')?.textContent?.trim() ?? null,
      runs: r.querySelector('.suite-health-count')?.getAttribute('title') ?? null,
    }));
    expect(rows).toEqual([
      { name: 'Mixed', none: null, runs: '4 executed · 1 skipped' },
      { name: 'Skipped Suite', none: 'All skipped', runs: '0 executed · 4 skipped' },
    ]);
  });

  it('QF2-Y2: the Pass Rate KPI shows executed and skipped runs next to the rate', async () => {
    const f = await renderOverview([], [], { ...KPIS, TotalTestRuns: 5463, SkippedTests: 874, PassRateThisMonth: 98.7 });
    const passRate = f.componentInstance.KpiCards.find((k) => k.title === 'Pass Rate')!;
    expect(passRate.subtitle).toBe('4,589 executed · 874 skipped');
  });
});
