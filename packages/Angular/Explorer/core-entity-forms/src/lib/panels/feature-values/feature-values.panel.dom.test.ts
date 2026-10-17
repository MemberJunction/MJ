import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunView, type BaseEntity, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { query, queryAll } from '@memberjunction/ng-test-utils';
import { FeatureValuesPanel } from './feature-values.panel';
import type { FeatureValueRow } from './feature-values.logic';

/**
 * DOM coverage for <mj-feature-values-panel>: one RunView per load, nothing rendered for zero
 * rows or an unsaved record, latest card per pipeline+feature, and expand-to-history.
 * `<mj-collapsible-panel>` is replaced by a content-projecting stub.
 */
@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
  @Input() SectionKey = '';
  @Input() SectionName = '';
  @Input() Icon = '';
  @Input() Order: number | null = null;
  @Input() Form: unknown;
  @Input() FormContext: unknown;
  @Input() BadgeCount: number | null = null;
}

const fv = (over: Partial<FeatureValueRow>): FeatureValueRow => ({
  ID: 'r', RecordProcessID: 'p1', RecordProcess: 'Churn Features', FeatureName: 'tenure',
  ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null,
  Source: 'Computed', Confidence: null, PipelineVersion: 2, ComputedAt: '2026-02-01T00:00:00Z',
  Reasoning: null, ProcessRunID: null, ...over,
});

function stubRunView(rows: FeatureValueRow[]): RunViewParams[] {
  const calls: RunViewParams[] = [];
  vi.spyOn(RunView.prototype, 'RunView').mockImplementation((async (params: RunViewParams) => {
    calls.push(params);
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' } as RunViewResult;
  }) as typeof RunView.prototype.RunView);
  return calls;
}

async function render(record: Record<string, unknown>): Promise<ComponentFixture<FeatureValuesPanel>> {
  TestBed.configureTestingModule({ imports: [CollapsiblePanelStub], declarations: [FeatureValuesPanel] });
  const fixture = TestBed.createComponent(FeatureValuesPanel);
  fixture.componentRef.setInput('Record', record as unknown as BaseEntity);
  fixture.componentRef.setInput('FormComponent', { ProviderToUse: { CurrentUser: { ID: 'user-1' } } });
  fixture.detectChanges(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges(false);
  return fixture;
}

const saved = { IsSaved: true, EntityInfo: { ID: 'ent-1' }, PrimaryKey: { ToCompactURLSegment: () => "rec'1" } };

afterEach(() => vi.restoreAllMocks());

describe('FeatureValuesPanel (DOM)', () => {
  it('queries Feature Values once with an escaped entity/record filter', async () => {
    const calls = stubRunView([]);
    await render(saved);
    expect(calls).toHaveLength(1);
    expect(calls[0].EntityName).toBe('MJ: Feature Values');
    expect(calls[0].ExtraFilter).toBe("EntityID='ent-1' AND RecordID='rec''1'");
    expect(calls[0].OrderBy).toBe('ComputedAt DESC');
    expect(calls[0].MaxRows).toBe(500);
    expect(calls[0].ResultType).toBe('simple');
  });

  it('uses the compact composite key segment for a two-column key', async () => {
    const calls = stubRunView([]);
    await render({ IsSaved: true, EntityInfo: { ID: 'ent-1' }, PrimaryKey: { ToCompactURLSegment: () => 'OrderID|11||LineNo|3' } });
    expect(calls[0].ExtraFilter).toBe("EntityID='ent-1' AND RecordID='OrderID|11||LineNo|3'");
  });

  it('Refresh button runs a second RunView', async () => {
    const calls = stubRunView([fv({ ValueNumeric: 1 })]);
    const fixture = await render(saved);
    (query(fixture, '.fvp-refresh') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(2);
  });

  it('OnRecordRefreshed reloads', async () => {
    const calls = stubRunView([]);
    const fixture = await render(saved);
    fixture.componentInstance.OnRecordRefreshed();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(2);
  });

  it('renders nothing for zero rows', async () => {
    stubRunView([]);
    const fixture = await render(saved);
    expect(query(fixture, 'table')).toBeNull();
    expect(fixture.componentInstance.Loaded).toBe(true);
  });

  it('skips the query and renders nothing for an unsaved record', async () => {
    const calls = stubRunView([fv({ ValueNumeric: 1 })]);
    const fixture = await render({ ...saved, IsSaved: false });
    expect(calls).toHaveLength(0);
    expect(query(fixture, 'table')).toBeNull();
  });

  it('renders one card per pipeline+feature with the latest value', async () => {
    stubRunView([
      fv({ ID: 'a', ValueNumeric: 14, ComputedAt: '2026-02-01T00:00:00Z' }),
      fv({ ID: 'b', ValueNumeric: 10, ComputedAt: '2026-01-01T00:00:00Z' }),
      fv({ ID: 'c', FeatureName: 'plan', ValueText: 'pro' }),
    ]);
    const fixture = await render(saved);
    expect(queryAll(fixture, '.fvp-row')).toHaveLength(2);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('14');
    expect(text).toContain('pro');
  });

  it('expands to show reasoning and older values', async () => {
    stubRunView([
      fv({ ID: 'a', ValueNumeric: 14, Reasoning: 'because', ComputedAt: '2026-02-01T00:00:00Z' }),
      fv({ ID: 'b', ValueNumeric: 10, ComputedAt: '2026-01-01T00:00:00Z' }),
    ]);
    const fixture = await render(saved);
    expect(query(fixture, '.fvp-detail')).toBeNull();
    (query(fixture, '.fvp-toggle') as HTMLButtonElement).click();
    fixture.detectChanges(false);
    expect(query(fixture, '.fvp-detail')).not.toBeNull();
    expect(query(fixture, '.fvp-reasoning')?.textContent).toContain('because');
    const items = queryAll(fixture, '.fvp-history-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('10');
  });
});
