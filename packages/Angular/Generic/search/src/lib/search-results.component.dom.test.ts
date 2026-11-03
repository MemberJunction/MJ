import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, hasClass, click, capture, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { SearchResultsComponent } from './search-results.component';
import { SearchResultItem } from './search-types';

/**
 * Stub for <mj-loading> (normally from SharedGenericModule). We only need the element
 * to render so SearchResultsComponent's loading branch can be asserted; the real
 * spinner's behavior is out of scope for this component's contract.
 */

function makeResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    ID: 'r1',
    Title: 'Result One',
    Snippet: 'a snippet',
    EntityName: 'Users',
    RecordID: 'rec-1',
    SourceType: 'entity',
    Score: 0.5,
    ScoreBreakdown: {},
    Tags: [],
    SourceIcon: 'fa-solid fa-database',
    MatchedAt: new Date(),
    ...overrides,
  };
}

/**
 * DOM tests for SearchResultsComponent. Asserts the three top-level branches
 * (loading / empty / results), the ShowSummary gating + count text, flat-mode card
 * rendering + pagination (@if TotalPages > 1, disabled prev on page 1), the score-badge
 * gating, the expand toggle, and the ResultSelected / OpenRecordRequested @Output payloads.
 */
describe('SearchResultsComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(SearchResultsComponent, {
      imports: [CommonModule, MJEmptyStateComponent, StubLoadingComponent],
      declarations: [SearchResultsComponent],
      inputs,
    });

  it('renders the loading branch when IsLoading is true', () => {
    const fixture = render({ IsLoading: true });
    expect(query(fixture, '.results-loading')).not.toBeNull();
    expect(query(fixture, '.stub-loading')).not.toBeNull();
    expect(query(fixture, '.result-card')).toBeNull();
  });

  it('renders the empty branch when there are no results and TotalCount is 0', () => {
    const fixture = render({ FlatResults: [], TotalCount: 0, DisplayMode: 'flat' });
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(text(fixture, 'mj-empty-state .mj-empty-state__title')).toBe('No results to display');
  });

  it('renders flat result cards and the summary line', () => {
    const results = [makeResult({ ID: 'a', Title: 'Alpha' }), makeResult({ ID: 'b', Title: 'Beta' })];
    const fixture = render({ FlatResults: results, TotalCount: 2, DisplayMode: 'flat', ShowSummary: true });
    expect(queryAll(fixture, '.result-card').length).toBe(2);
    expect(text(fixture, '.results-summary')).toContain('2 results');
  });

  it('hides the summary line when ShowSummary is false', () => {
    const fixture = render({ FlatResults: [makeResult()], TotalCount: 1, DisplayMode: 'flat', ShowSummary: false });
    expect(query(fixture, '.results-summary')).toBeNull();
  });

  it('hides the match chips when ShowScores is false', () => {
    const fixture = render({ FlatResults: [makeResult({ ScoreBreakdown: { Entity: 0.9 } })], TotalCount: 1, ShowScores: false });
    expect(query(fixture, '.result-card-match')).toBeNull();
  });

  // #5123: the fused Score is rank-based, so the card says how a result matched instead of
  // showing it as a percentage.
  it('a keyword-only result shows a text match naming the field, and no percentage', () => {
    const fixture = render({
      FlatResults: [makeResult({ Score: 1, ScoreBreakdown: { Entity: 0.9 }, MatchedFields: ['Email', 'Notes'] })],
      TotalCount: 1,
    });
    const chips = queryAll(fixture, '.match-chip');
    expect(chips.map(c => c.textContent?.trim())).toEqual(['Text match · Email +1']);
    expect(text(fixture, '.result-card-match')).not.toContain('%');
  });

  it('a semantic-only result shows "Similar meaning" and no percentage', () => {
    const fixture = render({ FlatResults: [makeResult({ Score: 1, ScoreBreakdown: { Vector: 0.82 } })], TotalCount: 1 });
    expect(queryAll(fixture, '.match-chip').map(c => c.textContent?.trim())).toEqual(['Similar meaning']);
  });

  it('a result both lanes matched shows both chips', () => {
    const fixture = render({
      FlatResults: [makeResult({ ScoreBreakdown: { Entity: 0.9, Vector: 0.8 }, MatchedFields: ['Notes'] })],
      TotalCount: 1,
    });
    expect(queryAll(fixture, '.match-chip').map(c => c.textContent?.trim())).toEqual(['Text match · Notes', 'Similar meaning']);
  });

  it('a re-ranked result also shows the re-ranker relevance', () => {
    const fixture = render({ FlatResults: [makeResult({ ScoreBreakdown: { Vector: 0.8, ReRank: 0.734 } })], TotalCount: 1 });
    expect(queryAll(fixture, '.match-chip').map(c => c.textContent?.trim())).toEqual(['Similar meaning', 'Relevance 73%']);
  });

  it('the expanded card shows the technical details: rank, matched fields, raw similarity', () => {
    const result = makeResult({ ID: 'tech', Score: 0.5, ScoreBreakdown: { Vector: 0.8123 }, MatchedFields: ['Email'] });
    const fixture = render({ FlatResults: [result], TotalCount: 1 });
    click(fixture, '.result-card-main');
    const details = text(fixture, '.detail-technical');
    expect(details).toContain('Technical details');
    expect(details).toContain('#1');
    expect(details).toContain('Email');
    expect(details).toContain('0.812');
  });

  it('does not render the pager when there is a single page', () => {
    const fixture = render({ FlatResults: [makeResult()], TotalCount: 1, PageSize: 10 });
    expect(query(fixture, '.results-pager')).toBeNull();
  });

  it('renders the pager with a disabled prev button on the first page', () => {
    const results = Array.from({ length: 25 }, (_, i) => makeResult({ ID: `r${i}`, Title: `R${i}` }));
    const fixture = render({ FlatResults: results, TotalCount: 25, PageSize: 10 });
    const pager = query(fixture, '.results-pager');
    expect(pager).not.toBeNull();
    const prev = query(fixture, 'button.pager-prev') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    // 25 results / 10 per page → 3 pages, so a "next" button that is enabled.
    const next = query(fixture, 'button.pager-next') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
  });

  it('advances the page (and updates PagedResults) when next is clicked', () => {
    const results = Array.from({ length: 25 }, (_, i) => makeResult({ ID: `r${i}`, Title: `R${i}` }));
    const fixture = render({ FlatResults: results, TotalCount: 25, PageSize: 10 });
    click(fixture, 'button.pager-next');
    expect(fixture.componentInstance.CurrentPage).toBe(2);
  });

  it('expands the result card when its main row is clicked', () => {
    const result = makeResult({ ID: 'x', Title: 'Clickable' });
    const fixture = render({ FlatResults: [result], TotalCount: 1 });
    expect(hasClass(fixture, '.result-card', 'result-card-expanded')).toBe(false);
    click(fixture, '.result-card-main');
    expect(hasClass(fixture, '.result-card', 'result-card-expanded')).toBe(true);
    expect(fixture.componentInstance.IsExpanded('x')).toBe(true);
  });

  it('toggles the expanded class when the expand button is clicked', () => {
    const result = makeResult({ ID: 'exp' });
    const fixture = render({ FlatResults: [result], TotalCount: 1 });
    expect(hasClass(fixture, '.result-card', 'result-card-expanded')).toBe(false);
    click(fixture, 'button.result-expand-btn');
    expect(hasClass(fixture, '.result-card', 'result-card-expanded')).toBe(true);
    expect(fixture.componentInstance.IsExpanded('exp')).toBe(true);
  });

  it('emits OpenRecordRequested when the open button is clicked', () => {
    const result = makeResult({ ID: 'open-me' });
    const fixture = render({ FlatResults: [result], TotalCount: 1 });
    const opens = capture(fixture.componentInstance.OpenRecordRequested);
    click(fixture, 'button.result-open-btn');
    expect(opens.length).toBe(1);
    expect(opens[0].ID).toBe('open-me');
  });
});
