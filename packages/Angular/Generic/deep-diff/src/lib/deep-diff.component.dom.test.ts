import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, attr, hasClass } from '@memberjunction/ng-test-utils';
import { DeepDiffComponent } from './deep-diff.component';
import { DeepDiffModule } from './module';

/**
 * DOM-level coverage for DeepDiffComponent — the half of the contract that lives in
 * the template: header/title binding, @if-gated summary, the empty-states, the
 * filter-type [class.active] toggle + (click) handlers, and the rendered diff tree
 * (recursive ng-template). Uses the REAL DeepDiffer (@memberjunction/global); no data
 * mocking is needed because the component computes the diff synchronously from its
 * value inputs.
 *
 * `autoDetect: true` is used because the oldValue/newValue setters call generateDiff()
 * during input application/init, recomputing bound state — a single detectChanges()
 * would trip the dev-mode NG0100 check.
 */

// A representative diff with one of each change type at root level.
const OLD = { name: 'alpha', removed: 'gone', count: 1 };
const NEW = { name: 'beta', added: 'fresh', count: 1 };

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(DeepDiffComponent, {
    imports: [DeepDiffModule],
    inputs,
    autoDetect: true,
  });
}

describe('DeepDiffComponent (DOM)', () => {
  it('renders the title binding in the header', () => {
    const fixture = render({ title: 'My Diff', oldValue: OLD, newValue: NEW });
    expect(text(fixture, '.diff-title')).toContain('My Diff');
  });

  it('shows the empty-state ("No data to compare") when there is no data', () => {
    const fixture = render({});
    expect(query(fixture, '.diff-tree')).toBeNull();
    const empty = query(fixture, 'mj-empty-state');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No data to compare');
  });

  it('renders the summary with correct added/removed/modified counts when showSummary is true', () => {
    const fixture = render({ oldValue: OLD, newValue: NEW, showSummary: true });
    const summary = query(fixture, '.diff-summary');
    expect(summary).not.toBeNull();
    // name changed alpha->beta = 1 modified; added key = 1 added; removed key = 1 removed
    expect(text(fixture, '.summary-item.added .count')).toBe('1');
    expect(text(fixture, '.summary-item.removed .count')).toBe('1');
    expect(text(fixture, '.summary-item.modified .count')).toBe('1');
  });

  it('hides the summary block when showSummary is false', () => {
    const fixture = render({ oldValue: OLD, newValue: NEW, showSummary: false });
    expect(query(fixture, '.diff-summary')).toBeNull();
  });

  it('omits the unchanged summary item by default (showUnchanged false)', () => {
    const fixture = render({ oldValue: OLD, newValue: NEW });
    expect(query(fixture, '.summary-item.unchanged')).toBeNull();
  });

  it('renders one diff-item row per root change in the tree', () => {
    const fixture = render({ oldValue: OLD, newValue: NEW });
    const tree = query(fixture, '.diff-tree');
    expect(tree).not.toBeNull();
    const paths = queryAll(fixture, '.diff-item .item-path').map((e) => e.textContent?.trim());
    expect(paths).toContain('name');
    expect(paths).toContain('added');
    expect(paths).toContain('removed');
  });

  it('disables the export button when there is no diff result', () => {
    const fixture = render({});
    expect(attr(fixture, '[aria-label="Export Diff"]', 'disabled')).not.toBeNull();
  });

  it('enables the export button when a diff result exists', () => {
    const fixture = render({ oldValue: OLD, newValue: NEW });
    expect(attr(fixture, '[aria-label="Export Diff"]', 'disabled')).toBeNull();
  });

  it('marks the "All Changes" filter button active by default', () => {
    const fixture = render({ oldValue: OLD, newValue: NEW });
    const allBtn = queryAll(fixture, '.filter-btn').find((b) => b.textContent?.includes('All Changes'));
    expect(allBtn?.classList.contains('active')).toBe(true);
  });

  it('toggles [class.active] to the Added filter when its button is clicked', () => {
    const fixture = render({ oldValue: OLD, newValue: NEW });
    const addedBtn = queryAll(fixture, '.filter-btn.added')[0] as HTMLElement;
    addedBtn.click();
    fixture.detectChanges();
    expect(addedBtn.classList.contains('active')).toBe(true);
    // After filtering to "added", only the added path survives in the tree.
    const paths = queryAll(fixture, '.diff-item .item-path').map((e) => e.textContent?.trim());
    expect(paths).toContain('added');
    expect(paths).not.toContain('removed');
  });

  it('shows the filtered empty-state when no items match the filter type', () => {
    // Diff with only modifications, then filter to "added" → no matches. filterType is a
    // plain getter/setter (not an @Input), so set it in setup before the first render.
    const fixture = renderComponentFixture(DeepDiffComponent, {
      imports: [DeepDiffModule],
      inputs: { oldValue: { a: 1 }, newValue: { a: 2 } },
      setup: (instance) => {
        instance.filterType = 'added';
      },
      autoDetect: true,
    });
    const empty = query(fixture, 'mj-empty-state');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No changes match your filter criteria');
  });

  it('applies the type CSS class to each diff item row', () => {
    const fixture = render({ oldValue: OLD, newValue: NEW });
    expect(hasClass(fixture, '.diff-item.added', 'added')).toBe(true);
    expect(hasClass(fixture, '.diff-item.removed', 'removed')).toBe(true);
    expect(hasClass(fixture, '.diff-item.modified', 'modified')).toBe(true);
  });

  it('renders Old/New value rows for a modified item', () => {
    const fixture = render({ oldValue: { name: 'alpha' }, newValue: { name: 'beta' } });
    const valueContents = queryAll(fixture, '.value-row .value-content').map((e) => e.textContent?.trim());
    expect(valueContents).toContain('"alpha"');
    expect(valueContents).toContain('"beta"');
  });
});
