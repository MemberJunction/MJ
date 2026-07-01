import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { MJAppliedFiltersComponent } from './applied-filters.component';

/** DOM-level spec for <mj-applied-filters> — empty gating, token rendering, and the Remove/ClearAll emits. */
const FILTERS = [
  { key: 'status', label: 'Status', value: 'Active' },
  { key: 'type', label: 'Type', value: 'Lead' },
];

describe('MJAppliedFiltersComponent (DOM)', () => {
  it('renders nothing when there are no filters', () => {
    const f = renderComponentFixture(MJAppliedFiltersComponent);
    expect(query(f, '.mj-applied-filters')).toBeNull();
  });

  it('renders a token per filter with its label and value', () => {
    const f = renderComponentFixture(MJAppliedFiltersComponent, { inputs: { Filters: FILTERS } });
    const tokens = queryAll(f, '.mj-applied-filters__token');

    expect(tokens.length).toBe(2);
    expect(tokens[0].textContent).toContain('Status');
    expect(tokens[0].textContent).toContain('Active');
  });

  it('renders the lead and clear-all labels', () => {
    const f = renderComponentFixture(MJAppliedFiltersComponent, {
      inputs: { Filters: FILTERS, LeadLabel: 'Showing', ClearAllLabel: 'Reset' },
    });

    expect(text(f, '.mj-applied-filters__lead')).toBe('Showing');
    expect(text(f, '.mj-applied-filters__clear')).toBe('Reset');
  });

  it('emits Remove with the clicked filter', () => {
    const f = renderComponentFixture(MJAppliedFiltersComponent, { inputs: { Filters: FILTERS } });
    const removed = capture(f.componentInstance.Remove);

    click(f, '.mj-applied-filters__x'); // first token's ✕

    expect(removed).toEqual([FILTERS[0]]);
  });

  it('emits ClearAll when the clear-all button is clicked', () => {
    const f = renderComponentFixture(MJAppliedFiltersComponent, { inputs: { Filters: FILTERS } });
    const cleared = capture(f.componentInstance.ClearAll);

    click(f, '.mj-applied-filters__clear');

    expect(cleared).toHaveLength(1);
  });
});
