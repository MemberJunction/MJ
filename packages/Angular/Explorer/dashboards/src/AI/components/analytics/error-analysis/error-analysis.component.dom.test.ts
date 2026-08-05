import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams } from '@memberjunction/core';
import { MJAccordionPanelComponent, MJAccordionTitleDirective, MJAccordionBodyDirective } from '@memberjunction/ng-ui-components';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsErrorAnalysisComponent } from './error-analysis.component';

/**
 * DOM coverage for <app-analytics-error-analysis> — the error breakdown view: three summary cards
 * (Total Errors / Error Rate / Most Common) plus one collapsed accordion panel per failed
 * source+prompt+model group. It runs two `RunViews` queries through `this.ProviderToUse` — failed
 * runs (Success = 0) and the total count for the rate. The real `mj-accordion-panel` (+ title/body
 * directives) is imported so groups render their (collapsed) title with source + error badge. Empty
 * failed set → the "No Errors Found" success empty state. `mj-loading` / `mj-empty-state` stubbed.
 */

const FAILED = [
  { ID: 'e1', Prompt: 'Summarize', PromptID: 'p1', Model: 'GPT-4o', ModelID: 'm1', ErrorMessage: 'Timeout', RunAt: '2026-01-05T09:00:00Z', ExecutionTimeMS: 3000 },
  { ID: 'e2', Prompt: 'Summarize', PromptID: 'p1', Model: 'GPT-4o', ModelID: 'm1', ErrorMessage: 'Rate limited', RunAt: '2026-01-05T09:05:00Z', ExecutionTimeMS: 100 },
  { ID: 'e3', Prompt: 'Classify', PromptID: 'p2', Model: 'Claude', ModelID: 'm2', ErrorMessage: 'Bad request', RunAt: '2026-01-05T10:00:00Z', ExecutionTimeMS: 200 },
];
const TOTAL = Array.from({ length: 20 }, (_v, i) => ({ ID: `t${i}` }));

// First RunViews query filters "Success = 0" (failed runs); second is the total-count query (Fields ['ID']).
const rowsFn = (p: RunViewParams): unknown[] => {
  if (typeof p.ExtraFilter === 'string' && p.ExtraFilter.includes('Success = 0')) return FAILED;
  return TOTAL;
};

async function render(rows: (p: RunViewParams) => unknown[]): Promise<ComponentFixture<AnalyticsErrorAnalysisComponent>> {
  TestBed.configureTestingModule({
    declarations: [AnalyticsErrorAnalysisComponent],
    imports: [StubLoadingComponent, StubEmptyStateComponent, MJAccordionPanelComponent, MJAccordionTitleDirective, MJAccordionBodyDirective],
  });
  const fixture = TestBed.createComponent(AnalyticsErrorAnalysisComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: rows }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsErrorAnalysisComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('renders the three summary cards', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(() => []);
    const labels = queryAll(fixture, '.summary-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(['Total Errors', 'Error Rate', 'Most Common']);
  });

  it('shows the success empty state when there are no errors', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(() => []);
    expect(query(fixture, '.stub-empty')?.textContent).toContain('No Errors Found');
    expect(query(fixture, 'mj-accordion-panel')).toBeNull();
  });

  it('reflects the total error count in the summary value', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsFn);
    expect(query(fixture, '.summary-value')?.textContent?.trim()).toBe('3');
  });

  it('renders one accordion panel per error group', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsFn);
    // Two distinct source groups: Summarize+GPT-4o and Classify+Claude.
    expect(queryAll(fixture, 'mj-accordion-panel').length).toBe(2);
    const badges = queryAll(fixture, '.mj-accordion-badge--error').map((e) => e.textContent?.trim());
    // The two-error group and the one-error group.
    expect(badges).toEqual(expect.arrayContaining(['2', '1']));
  });
});
