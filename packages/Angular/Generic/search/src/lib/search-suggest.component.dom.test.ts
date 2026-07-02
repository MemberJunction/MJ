import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, hasClass, capture } from '@memberjunction/ng-test-utils';
import { SearchSuggestComponent } from './search-suggest.component';
import { SearchResultItem } from './search-types';
import { RecentSearch } from './search.service';

function makeResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    ID: 'r1',
    Title: 'Result',
    Snippet: '',
    EntityName: 'Users',
    RecordID: 'rec',
    SourceType: 'entity',
    Score: 0.6,
    ScoreBreakdown: {},
    Tags: [],
    SourceIcon: 'fa-solid fa-database',
    MatchedAt: new Date(),
    ...overrides,
  };
}

function makeRecent(queryText: string, count = 1): RecentSearch {
  return { Query: queryText, Timestamp: new Date(), ResultCount: count };
}

/**
 * DOM tests for SearchSuggestComponent — autocomplete dropdown, pure @Input/@Output.
 * Asserts the outer @if(IsOpen) gate, the recent-vs-preview section gating (driven by
 * Query length vs MinQueryLength), the "See all N results" footer, the min-query
 * empty-state copy, the highlight class binding on mouseenter, and the ResultSelected /
 * RecentSelected / SeeAllRequested / ClearRecentRequested @Output payloads.
 *
 * NOTE: this component's ngOnInit subscribes to MJGlobal's event listener (which never
 * fires under the test harness) — it is a no-op here, so no mocking is required.
 */
describe('SearchSuggestComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(SearchSuggestComponent, {
      imports: [CommonModule],
      declarations: [SearchSuggestComponent],
      inputs,
    });

  it('renders nothing when IsOpen is false', () => {
    const fixture = render({ IsOpen: false });
    expect(query(fixture, '.suggest-dropdown')).toBeNull();
  });

  it('renders the dropdown when IsOpen is true', () => {
    const fixture = render({ IsOpen: true, Query: '' });
    expect(query(fixture, '.suggest-dropdown')).not.toBeNull();
  });

  it('shows recent searches when the query is shorter than MinQueryLength', () => {
    const fixture = render({
      IsOpen: true,
      Query: '',
      MinQueryLength: 2,
      ShowRecent: true,
      RecentSearches: [makeRecent('alpha', 4), makeRecent('beta', 2)],
    });
    expect(query(fixture, '.suggest-section-header')).not.toBeNull();
    expect(queryAll(fixture, '.suggest-recent-item').length).toBe(2);
    expect(text(fixture, '.suggest-recent-item .suggest-item-text')).toBe('alpha');
  });

  it('shows the min-query empty state when there are no recents and the query is too short', () => {
    const fixture = render({ IsOpen: true, Query: '', MinQueryLength: 2, RecentSearches: [] });
    expect(text(fixture, '.suggest-empty')).toContain('Type at least 2 characters');
  });

  it('renders preview results (sorted by score) when the query is long enough', () => {
    const fixture = render({
      IsOpen: true,
      Query: 'graph',
      MinQueryLength: 2,
      IsLoading: false,
      PreviewResults: [makeResult({ ID: 'low', Title: 'Low', Score: 0.2 }), makeResult({ ID: 'high', Title: 'High', Score: 0.9 })],
      TotalCount: 2,
    });
    const items = queryAll(fixture, '.suggest-result-item');
    expect(items.length).toBe(2);
    // Highest score should render first.
    expect(items[0].querySelector('.suggest-result-title')?.textContent?.trim()).toBe('High');
  });

  it('shows the "See all N results" footer when there are total results for the query', () => {
    const fixture = render({
      IsOpen: true,
      Query: 'graph',
      MinQueryLength: 2,
      IsLoading: false,
      PreviewResults: [makeResult()],
      TotalCount: 42,
    });
    expect(text(fixture, '.suggest-see-all')).toContain('See all 42 results');
  });

  it('applies the highlighted class to a recent item on mouseenter', () => {
    const fixture = render({
      IsOpen: true,
      Query: '',
      MinQueryLength: 2,
      ShowRecent: true,
      RecentSearches: [makeRecent('alpha')],
    });
    const item = query(fixture, '.suggest-recent-item') as HTMLElement;
    item.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(hasClass(fixture, '.suggest-recent-item', 'suggest-item-highlighted')).toBe(true);
  });

  it('emits RecentSelected with the query when a recent item is mousedown-clicked', () => {
    const fixture = render({
      IsOpen: true,
      Query: '',
      MinQueryLength: 2,
      ShowRecent: true,
      RecentSearches: [makeRecent('alpha')],
    });
    const selected = capture(fixture.componentInstance.RecentSelected);
    (query(fixture, '.suggest-recent-item') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(selected).toEqual(['alpha']);
  });

  it('emits ResultSelected when a preview result is mousedown-clicked', () => {
    const result = makeResult({ ID: 'picked' });
    const fixture = render({
      IsOpen: true,
      Query: 'graph',
      MinQueryLength: 2,
      IsLoading: false,
      PreviewResults: [result],
      TotalCount: 1,
    });
    const selected = capture(fixture.componentInstance.ResultSelected);
    (query(fixture, '.suggest-result-item') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(selected.length).toBe(1);
    expect(selected[0].ID).toBe('picked');
  });

  it('emits SeeAllRequested with the query when the footer is mousedown-clicked', () => {
    const fixture = render({
      IsOpen: true,
      Query: 'graph',
      MinQueryLength: 2,
      IsLoading: false,
      PreviewResults: [makeResult()],
      TotalCount: 5,
    });
    const seeAll = capture(fixture.componentInstance.SeeAllRequested);
    (query(fixture, '.suggest-see-all') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(seeAll).toEqual(['graph']);
  });

  it('emits ClearRecentRequested when the recent-searches "Clear" link is mousedown-clicked', () => {
    const fixture = render({
      IsOpen: true,
      Query: '',
      MinQueryLength: 2,
      ShowRecent: true,
      RecentSearches: [makeRecent('alpha')],
    });
    const cleared = capture(fixture.componentInstance.ClearRecentRequested);
    (query(fixture, '.suggest-clear-link') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(cleared.length).toBe(1);
  });

  it('opens the relevance filter (chevron-open) and marks the selected option active', () => {
    // The filter bar only shows in preview mode (showPreviewSection), so render with a query +
    // results. IsFilterOpen is set in `setup` (before the first CD) so the chevron-open class
    // is stable on the first pass — flipping it after render trips the zoneless NG0100 check.
    const fixture = renderComponentFixture(SearchSuggestComponent, {
      imports: [CommonModule],
      declarations: [SearchSuggestComponent],
      inputs: { IsOpen: true, Query: 'graph', MinQueryLength: 2, IsLoading: false, PreviewResults: [makeResult()], TotalCount: 1 },
      setup: (c) => {
        c.IsFilterOpen = true; // open the Min Relevance popover
      },
    });
    expect(query(fixture, '.suggest-filter-chevron')?.classList.contains('suggest-filter-chevron-open')).toBe(true);
    // the option matching the current MinRelevancePercent carries the active class
    expect(queryAll(fixture, '.suggest-filter-option-active').length).toBeGreaterThanOrEqual(1);
  });
});
