import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams } from '@memberjunction/core';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsUsagePatternsComponent } from './usage-patterns.component';

/**
 * DOM coverage for <app-analytics-usage-patterns> — the time-of-day heatmap view. It loads prompt
 * runs through `RunView.FromMetadataProvider(this.ProviderToUse)`, so a `createFakeProvider` supplies
 * canned `MJ: AI Prompt Runs` rows via the `[Provider]` input. `TotalRuns === 0` gates the empty
 * state; a non-empty run set renders the heatmap grid (7×24), the day-distribution + peak panels, and
 * the hourly-throughput chart. `mj-loading` / `mj-empty-state` are stubbed. Change detection is driven
 * explicitly (`detectChanges(false)`) because `loadData()` toggles `IsLoading` across an await.
 */

const RUNS = [
  { RunAt: '2026-01-05T09:15:00Z' }, // Monday
  { RunAt: '2026-01-05T09:40:00Z' },
  { RunAt: '2026-01-06T14:05:00Z' }, // Tuesday
];

async function render(rows: unknown[] = RUNS): Promise<ComponentFixture<AnalyticsUsagePatternsComponent>> {
  TestBed.configureTestingModule({
    declarations: [AnalyticsUsagePatternsComponent],
    imports: [StubLoadingComponent, StubEmptyStateComponent],
  });
  const fixture = TestBed.createComponent(AnalyticsUsagePatternsComponent);
  const provider = createFakeProvider({ runViewResults: (_p: RunViewParams) => rows });
  fixture.componentRef.setInput('Provider', provider);
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsUsagePatternsComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('shows the empty state when there are no runs', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([]);
    expect(query(fixture, '.stub-empty')?.textContent).toContain('No Data Available');
    expect(query(fixture, '.heatmap-grid')).toBeNull();
  });

  it('renders the heatmap grid with an hour label per hour once data loads', async () => {
    installProvider({ runViewResults: RUNS });
    const fixture = await render();
    expect(query(fixture, '.heatmap-grid')).not.toBeNull();
    expect(queryAll(fixture, '.heatmap-hour-label').length).toBe(24);
    expect(queryAll(fixture, '.heatmap-cell').length).toBe(7 * 24);
  });

  it('renders a day-distribution row for each of the seven days', async () => {
    installProvider({ runViewResults: RUNS });
    const fixture = await render();
    expect(queryAll(fixture, '.day-bar-row').length).toBe(7);
  });

  it('renders 24 hourly-throughput bars and the peak-summary cards', async () => {
    installProvider({ runViewResults: RUNS });
    const fixture = await render();
    expect(queryAll(fixture, '.hourly-bar-col').length).toBe(24);
    expect(queryAll(fixture, '.peak-card').length).toBeGreaterThan(0);
  });

  it('emits TimeRangeChange from OnTimeRangeChange', async () => {
    installProvider({ runViewResults: RUNS });
    const fixture = await render();
    const emitted = capture(fixture.componentInstance.TimeRangeChange);
    fixture.componentInstance.OnTimeRangeChange('7d');
    expect(emitted).toEqual(['7d']);
    expect(fixture.componentInstance.TimeRange).toBe('7d');
  });
});
