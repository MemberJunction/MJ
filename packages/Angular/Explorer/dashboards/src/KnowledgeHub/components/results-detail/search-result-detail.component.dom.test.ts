import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import type { SearchResultItem } from '@memberjunction/ng-search';
import { SearchResultDetailComponent } from './search-result-detail.component';

/**
 * DOM coverage for <app-search-result-detail> — a Result-gated detail view (header with title,
 * entity, record id) with a full-page breadcrumb (hidden in side-panel mode) and a Back button.
 * Only injects ChangeDetectorRef (no service). mj-empty-state is imported; mj-loading is stubbed.
 * Single synchronous render.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() text = '';
  @Input() showText = true;
  @Input() size = '';
}

const RESULT = {
  Title: 'Q3 Report', EntityName: 'Documents', RecordID: 'rec-42', Score: 0.9,
  Snippet: 'A snippet', SourceIcon: 'fa-solid fa-file', SourceType: 'database', Tags: [],
} as unknown as SearchResultItem;

const render = (Result: SearchResultItem | null, SidePanelMode = false) =>
  renderComponentFixture(SearchResultDetailComponent, {
    imports: [MJEmptyStateComponent, LoadingStub],
    declarations: [SearchResultDetailComponent],
    inputs: { Result, SidePanelMode },
  });

describe('SearchResultDetailComponent (DOM)', () => {
  it('renders nothing when there is no result', () => {
    expect(query(render(null), '.detail-page')).toBeNull();
  });

  it('renders the result title, entity, and record id', () => {
    const fixture = render(RESULT);
    expect(text(fixture, '.detail-title')).toBe('Q3 Report');
    expect(fixture.nativeElement.textContent).toContain('Documents');
    expect(fixture.nativeElement.textContent).toContain('rec-42');
  });

  it('shows the back breadcrumb in full-page mode', () => {
    expect(query(render(RESULT, false), '.breadcrumb-back')).not.toBeNull();
  });

  it('hides the back breadcrumb in side-panel mode', () => {
    expect(query(render(RESULT, true), '.breadcrumb-back')).toBeNull();
  });

  it('emits BackClicked when the back breadcrumb is clicked', () => {
    const fixture = render(RESULT, false);
    const back = capture(fixture.componentInstance.BackClicked);
    (query(fixture, '.breadcrumb-back') as HTMLElement).click();
    expect(back.length).toBe(1);
  });
});
