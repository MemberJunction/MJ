import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { RunViewParams } from '@memberjunction/core';
import { ClassifyItemDrilldownComponent } from './classify-item-drilldown.component';

/**
 * DOM coverage for <classify-item-drilldown> — the read-only content-item audit view. Module-declared
 * (standalone:false), extends BaseAngularComponent. With no `ItemID` it renders the mj-empty-state
 * "no item selected" prompt (a stubbed element). Setting `ItemID` runs two RunViews (item + tags) via
 * ProviderToUse — a fake provider returns canned rows keyed by EntityName. `(OpenRecordRequested)`
 * bubbles up when Open Record is clicked. Async load needs the non-strict re-render + microtask dance.
 */

@Component({ selector: 'mj-empty-state', standalone: true, template: '<ng-content></ng-content>' })
class StubEmptyState {
  @Input() Icon = '';
  @Input() Title = '';
  @Input() Message = '';
}
@Component({ selector: 'mj-loading', standalone: true, template: '' })
class StubLoading {
  @Input() text = '';
  @Input() size = '';
}

const ITEM_ROW = {
  ID: 'item-1',
  Name: 'Quarterly Report',
  Description: 'A report',
  ContentSource: 'Website',
  ContentSourceID: 'src-1',
  URL: 'https://example.com/doc',
  Text: 'Some preview text.',
  TaggingStatus: 'Complete',
  __mj_CreatedAt: '2026-01-01T00:00:00Z',
  LastTaggedAt: '2026-02-01T00:00:00Z',
};
const TAG_ROWS = [
  { ID: 't1', Tag: 'finance', Weight: 0.9, Reasoning: 'mentions revenue', AIPromptRunID: 'run-1', __mj_CreatedAt: '2026-01-02' },
  { ID: 't2', Tag: 'q3', Weight: 0.5, Reasoning: null, AIPromptRunID: null, __mj_CreatedAt: '2026-01-02' },
];

const provider = () =>
  createFakeProvider({
    runViewResults: (params: RunViewParams): Record<string, unknown>[] => (params.EntityName === 'MJ: Content Item Tags' ? TAG_ROWS : [ITEM_ROW]),
  });

const renderEmpty = () =>
  renderComponentFixture(ClassifyItemDrilldownComponent, {
    declarations: [ClassifyItemDrilldownComponent],
    imports: [StubEmptyState, StubLoading],
    inputs: { Provider: provider() },
  });

// Render then set ItemID (triggers async load) and settle the microtask + non-strict re-render.
const renderLoaded = async () => {
  const fixture = renderComponentFixture(ClassifyItemDrilldownComponent, {
    declarations: [ClassifyItemDrilldownComponent],
    imports: [StubEmptyState, StubLoading],
    inputs: { Provider: provider() },
  });
  fixture.componentRef.setInput('ItemID', 'item-1');
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges(false);
  return fixture;
};

describe('ClassifyItemDrilldownComponent (DOM)', () => {
  it('renders the empty-state prompt when no item is selected', () => {
    const fixture = renderEmpty();
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(query(fixture, '.cid-wrap')).toBeNull();
  });

  it('renders the item name + source once an item is loaded', async () => {
    const fixture = await renderLoaded();
    expect(query(fixture, '.cid-wrap')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Quarterly Report');
    expect(fixture.nativeElement.textContent).toContain('Website');
  });

  it('renders the URL link and one tag card per loaded tag', async () => {
    const fixture = await renderLoaded();
    const link = query(fixture, '.cid-field-link') as HTMLAnchorElement;
    expect(link?.getAttribute('href')).toBe('https://example.com/doc');
    expect(queryAll(fixture, '.cid-tag-card').length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Tags (2)');
  });

  it('emits OpenRecordRequested for the item when Open Record is clicked', async () => {
    const fixture = await renderLoaded();
    const opened = capture(fixture.componentInstance.OpenRecordRequested);
    (queryAll(fixture, 'button').find((b) => b.textContent?.includes('Open Record')) as HTMLElement).click();
    expect(opened).toEqual([{ entityName: 'MJ: Content Items', recordID: 'item-1' }]);
  });

  it('emits OpenRecordRequested for the prompt run behind a tag with an AIPromptRunID', async () => {
    const fixture = await renderLoaded();
    const opened = capture(fixture.componentInstance.OpenRecordRequested);
    (query(fixture, '.cid-provenance-link') as HTMLElement).click();
    expect(opened).toEqual([{ entityName: 'MJ: AI Prompt Runs', recordID: 'run-1' }]);
  });
});
