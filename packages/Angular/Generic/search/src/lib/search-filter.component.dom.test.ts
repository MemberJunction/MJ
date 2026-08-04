import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJEmptyStateComponent, MJAccordionModule } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { SearchFilterComponent } from './search-filter.component';
import { SearchFilter, SearchFilterChangeEvent } from './search-types';

/**
 * DOM tests for SearchFilterComponent — a faceted-filter sidebar, pure @Input/@Output.
 * We assert: category/option rendering via @for, the single-option read-only branch vs.
 * the multi-option checkbox branch, the "Clear (N)" button @if-gated on HasActiveFilters(),
 * the checkbox-checked class binding, the relevance slider @if gating, the empty-state
 * branch, and the FilterChanged / FiltersCleared / CloseRequested @Output payloads.
 */
describe('SearchFilterComponent (DOM)', () => {
  const FILTERS: SearchFilter[] = [
    {
      Category: 'Entity',
      MultiSelect: true,
      Options: [
        { Label: 'Users', Value: 'users', Count: 12, IsSelected: false },
        { Label: 'Agents', Value: 'agents', Count: 3, IsSelected: false },
      ],
    },
    {
      Category: 'Source',
      MultiSelect: true,
      Options: [{ Label: 'Vector', Value: 'vector', Count: 7, IsSelected: false }],
    },
  ];

  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(SearchFilterComponent, {
      // Each filter category is rendered as an <mj-accordion-panel>, so the isolated TestBed
      // must register the accordion via MJAccordionModule (the real app gets it through the
      // search module). Without it, rendering throws NG0304. The option rows live in the
      // accordion's [mjAccordionBody]; categories are Expanded by default (Collapsible=true and
      // nothing collapsed), so the accordion instantiates the body and the rows are in the DOM.
      imports: [CommonModule, MJEmptyStateComponent, MJAccordionModule],
      declarations: [SearchFilterComponent],
      inputs: { Filters: FILTERS, ShowRelevanceSlider: false, ...inputs },
    });

  it('renders one category block per filter', () => {
    const fixture = render();
    expect(queryAll(fixture, 'mj-accordion-panel').length).toBe(2);
    const names = queryAll(fixture, '.filter-category-name').map((e) => e.textContent?.trim());
    expect(names).toEqual(['Entity', 'Source']);
  });

  it('renders multi-option categories as interactive checkbox labels', () => {
    const fixture = render();
    // The "Entity" category has 2 options → two checkbox labels (.filter-option, not readonly).
    const entityBlock = queryAll(fixture, 'mj-accordion-panel')[0];
    const interactive = entityBlock.querySelectorAll('label.filter-option');
    expect(interactive.length).toBe(2);
    expect(entityBlock.querySelectorAll('.filter-option-readonly').length).toBe(0);
  });

  it('renders single-option categories as a read-only row (no checkbox)', () => {
    const fixture = render();
    const sourceBlock = queryAll(fixture, 'mj-accordion-panel')[1];
    expect(sourceBlock.querySelectorAll('.filter-option-readonly').length).toBe(1);
    expect(sourceBlock.querySelectorAll('label.filter-option').length).toBe(0);
  });

  it('hides the "Clear (N)" button when there are no active filters', () => {
    const fixture = render({ ActiveFilters: {} });
    expect(query(fixture, 'button.filter-clear-all')).toBeNull();
  });

  it('shows the "Clear (N)" button with the active count when filters are active', () => {
    const fixture = render({ ActiveFilters: { Entity: ['users', 'agents'] } });
    const btn = query(fixture, 'button.filter-clear-all');
    expect(btn).not.toBeNull();
    expect(text(fixture, 'button.filter-clear-all')).toContain('Clear (2)');
  });

  it('marks an option checkbox as checked when its value is in ActiveFilters', () => {
    const fixture = render({ ActiveFilters: { Entity: ['users'] } });
    const entityBlock = queryAll(fixture, 'mj-accordion-panel')[0];
    const firstCheckbox = entityBlock.querySelector('.filter-checkbox');
    expect(firstCheckbox?.classList.contains('filter-checkbox-checked')).toBe(true);
  });

  it('emits FilterChanged with the toggled selection when an option is clicked', () => {
    const fixture = render({ ActiveFilters: {} });
    const changes: SearchFilterChangeEvent[] = capture(fixture.componentInstance.FilterChanged);
    const entityBlock = queryAll(fixture, 'mj-accordion-panel')[0];
    (entityBlock.querySelector('label.filter-option') as HTMLElement).click();
    expect(changes.length).toBe(1);
    expect(changes[0].Category).toBe('Entity');
    expect(changes[0].SelectedValues).toEqual(['users']);
  });

  it('emits FiltersCleared and clears active state when "Clear" is clicked', () => {
    const fixture = render({ ActiveFilters: { Entity: ['users'] } });
    const cleared = capture(fixture.componentInstance.FiltersCleared);
    click(fixture, 'button.filter-clear-all');
    expect(cleared.length).toBe(1);
    expect(fixture.componentInstance.HasActiveFilters()).toBe(false);
  });

  it('emits CloseRequested when the close button is clicked', () => {
    const fixture = render();
    const closes = capture(fixture.componentInstance.CloseRequested);
    click(fixture, 'button.filter-close-btn');
    expect(closes.length).toBe(1);
  });

  it('renders the relevance slider with its value when ShowRelevanceSlider is true', () => {
    const fixture = render({ ShowRelevanceSlider: true, MinScorePercent: 25 });
    expect(query(fixture, 'input.relevance-range')).not.toBeNull();
    expect(text(fixture, '.relevance-value')).toBe('25%');
  });

  it('omits the relevance slider when ShowRelevanceSlider is false', () => {
    const fixture = render({ ShowRelevanceSlider: false });
    expect(query(fixture, 'input.relevance-range')).toBeNull();
  });

  it('renders the empty state when there are no filters and no slider', () => {
    const fixture = render({ Filters: [], ShowRelevanceSlider: false });
    expect(query(fixture, '.filter-empty')).not.toBeNull();
    expect(text(fixture, '.filter-empty')).toContain('No filters available');
  });

  it('collapses a filter category when its accordion header is clicked', () => {
    const fixture = render();
    const firstPanel = queryAll(fixture, 'mj-accordion-panel')[0];
    // Collapsible=true and nothing collapsed → the panel is Expanded by default (the accordion
    // signals expansion via the --expanded class; the chevron is a static icon rotated in CSS,
    // so collapse is asserted via IsCategoryCollapsed() state + the class rather than the old
    // bespoke .filter-category-header chevron-up/down that this template no longer uses).
    expect(fixture.componentInstance.IsCategoryCollapsed('Entity')).toBe(false);
    expect(firstPanel.querySelector('.mj-accordion-panel--expanded')).not.toBeNull();

    // Clicking the accordion header toggles Expanded, whose (ExpandedChange) is wired to
    // OnCategoryExpandedChange → adds the category to CollapsedCategories.
    (firstPanel.querySelector('.mj-accordion-header') as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.IsCategoryCollapsed('Entity')).toBe(true);
    expect(firstPanel.querySelector('.mj-accordion-panel--expanded')).toBeNull();
  });
});
