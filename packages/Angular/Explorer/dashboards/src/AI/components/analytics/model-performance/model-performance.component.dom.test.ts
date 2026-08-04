import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams } from '@memberjunction/core';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsModelPerformanceComponent } from './model-performance.component';

/**
 * DOM coverage for <app-analytics-model-performance> — the model leaderboard table. It calls
 * `AIEngineBase.Instance.EnsureLoaded()` in ngOnInit (resolves harmlessly against the fake GLOBAL
 * provider), then loads `MJ: AI Prompt Runs` through `this.ProviderToUse` and groups them by model
 * into ranked rows. A `createFakeProvider` supplies the run rows via `[Provider]`; an empty set
 * renders the "No model data" empty row, and a two-model set renders two ranked leaderboard rows.
 * `mj-loading` stubbed. Explicit `detectChanges(false)` because `LoadData()` toggles `IsLoading`.
 */

const RUNS = [
  { ModelID: 'm1', Model: 'GPT-4o', Vendor: 'OpenAI', Success: true, ExecutionTimeMS: 1200, TokensUsed: 1000, Cost: 0.02 },
  { ModelID: 'm1', Model: 'GPT-4o', Vendor: 'OpenAI', Success: true, ExecutionTimeMS: 900, TokensUsed: 800, Cost: 0.015 },
  { ModelID: 'm2', Model: 'Claude', Vendor: 'Anthropic', Success: false, ExecutionTimeMS: 2000, TokensUsed: 1500, Cost: 0.03 },
];

async function render(rows: unknown[]): Promise<ComponentFixture<AnalyticsModelPerformanceComponent>> {
  TestBed.configureTestingModule({ declarations: [AnalyticsModelPerformanceComponent], imports: [StubLoadingComponent] });
  const fixture = TestBed.createComponent(AnalyticsModelPerformanceComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: (_p: RunViewParams) => rows }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 20));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsModelPerformanceComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('renders the leaderboard table with all column headers', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([]);
    expect(query(fixture, '.leaderboard-table')).not.toBeNull();
    const headers = queryAll(fixture, '.leaderboard-table thead th').map((h) => h.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(['Rank', 'Model', 'Vendor', 'Runs', 'Total Cost']));
  });

  it('shows the empty row when there are no runs', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([]);
    expect(query(fixture, '.empty-row')?.textContent).toContain('No model data for selected period');
    expect(queryAll(fixture, 'tbody tr').length).toBe(1);
  });

  it('renders one ranked leaderboard row per model', async () => {
    installProvider({ runViewResults: RUNS });
    const fixture = await render(RUNS);
    expect(query(fixture, '.empty-row')).toBeNull();
    expect(queryAll(fixture, 'tbody tr .rank-badge').length).toBe(2);
    const modelNames = queryAll(fixture, '.model-name').map((e) => e.textContent?.trim());
    expect(modelNames).toEqual(expect.arrayContaining(['GPT-4o', 'Claude']));
  });

  it('ranks rows 1..N in the badge column', async () => {
    installProvider({ runViewResults: RUNS });
    const fixture = await render(RUNS);
    const ranks = queryAll(fixture, '.rank-badge').map((e) => e.textContent?.trim());
    expect(ranks).toEqual(['1', '2']);
  });

  it('shows the empty row when the vendor filter matches no runs', async () => {
    installProvider({ runViewResults: RUNS });
    const fixture = await render(RUNS);
    fixture.componentInstance.SelectedVendor = 'nonexistent-vendor';
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(query(fixture, '.empty-row')?.textContent).toContain('No model data for selected period');
  });
});
