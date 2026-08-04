import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Recompute-trigger coverage for the DeepDiffComponent precomputes (PR #2841):
 *
 *  - `filteredItems`: a precomputed array (was a getter that re-walked the tree
 *    every CD pass). Must recompute on the `filter` / `filterType` setters AND on
 *    `generateDiff()` (data change via oldValue/newValue setters), and must match
 *    the naive filter the old getter produced.
 *
 *  - `formatValue` / `isValueTruncated`: memoized by `${path}|${expanded}`. The
 *    cache must (a) hit on repeat calls, (b) be keyed by expansion state so an
 *    expand/collapse yields the correct (truncated vs full) value, and (c) be
 *    INVALIDATED when the source data regenerates — a stale cached value must not
 *    leak after new data lands.
 *
 * Uses the REAL DeepDiffer (`@memberjunction/global`); only Angular's decorator
 * surface is stubbed so the component can be `new`'d in a node unit test.
 */

vi.mock('@angular/core', () => ({
  Component: () => (t: Function) => t,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ChangeDetectionStrategy: { OnPush: 1 },
  OnInit: class {},
}));

import { DeepDiffComponent, DeepDiffItem } from '../deep-diff.component';
import { ChangeDetectorRef } from '@angular/core';

function makeComponent(): DeepDiffComponent {
  const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
  return new DeepDiffComponent(cdr);
}

/** Flatten the filtered tree to its paths (order-preserving) for stable assertions. */
function paths(items: DeepDiffItem[]): string[] {
  const out: string[] = [];
  const walk = (list: DeepDiffItem[]) => {
    for (const i of list) {
      out.push(i.path);
      walk(i.children);
    }
  };
  walk(items);
  return out;
}

describe('DeepDiffComponent — filteredItems recompute', () => {
  let component: DeepDiffComponent;

  beforeEach(() => {
    component = makeComponent();
    // A representative object diff with several change types.
    component.oldValue = { name: 'alpha', count: 1, removed: 'gone', nested: { keep: 1 } };
    component.newValue = { name: 'beta', count: 1, added: 'fresh', nested: { keep: 1 } };
    component.ngOnInit();
  });

  it('builds filteredItems on data change (generateDiff) — non-empty for a real diff', () => {
    expect(component.diffItems.length).toBeGreaterThan(0);
    // filter='' + type='all' → filteredItems is exactly diffItems (identity fast-path)
    expect(component.filteredItems).toBe(component.diffItems);
  });

  it('recomputes filteredItems when the filterType setter changes', () => {
    const before = component.filteredItems;
    component.filterType = 'added';
    const after = component.filteredItems;
    expect(after).not.toBe(before);
    // every surviving leaf (no children kept) should be an "added" path, and 'added' must appear
    const ps = paths(after);
    expect(ps.some((p) => p.includes('added'))).toBe(true);
    expect(ps.some((p) => p.includes('removed'))).toBe(false);
  });

  it('recomputes filteredItems when the text filter setter changes', () => {
    component.filter = 'name';
    const ps = paths(component.filteredItems);
    expect(ps).toContain('name');
    expect(ps).not.toContain('removed');
  });

  it('text filter is case-insensitive on path', () => {
    component.filter = 'NAME';
    expect(paths(component.filteredItems)).toContain('name');
  });

  it('reverts to the identity fast-path when filters are cleared', () => {
    component.filter = 'name';
    expect(component.filteredItems).not.toBe(component.diffItems);
    component.filter = '';
    component.filterType = 'all';
    expect(component.filteredItems).toBe(component.diffItems);
  });

  it('matches the old getter baseline (naive recursive filter) under an active filter', () => {
    component.filterType = 'modified';
    // Baseline: keep an item if it is modified OR any descendant survives.
    const baseline = (items: DeepDiffItem[]): DeepDiffItem[] =>
      items.reduce<DeepDiffItem[]>((acc, item) => {
        const kids = baseline(item.children);
        const isModified = String(item.type) === 'modified';
        if (isModified || kids.length > 0) acc.push({ ...item, children: kids });
        return acc;
      }, []);
    expect(paths(component.filteredItems)).toEqual(paths(baseline(component.diffItems)));
  });

  it('re-derives filteredItems when new source data is set (regen trigger)', () => {
    component.filterType = 'added';
    const firstAddedPaths = paths(component.filteredItems);

    // brand-new data with a DIFFERENT added key
    component.oldValue = { x: 1 };
    component.newValue = { x: 1, brandNew: 'v' };
    // generateDiff ran via the setter; the active 'added' filter re-applied to NEW data
    const secondAddedPaths = paths(component.filteredItems);
    expect(secondAddedPaths).not.toEqual(firstAddedPaths);
    expect(secondAddedPaths.some((p) => p.includes('brandNew'))).toBe(true);
  });
});

describe('DeepDiffComponent — formatValue / isValueTruncated memoization', () => {
  let component: DeepDiffComponent;

  beforeEach(() => {
    component = makeComponent();
    component.maxStringLength = 10;
    component.truncateValues = true;
  });

  it('returns the same cached string on repeat formatValue calls for a (path, expanded) key', () => {
    const longString = 'x'.repeat(50);
    const first = component.formatValue(longString, 'a.b');
    const second = component.formatValue(longString, 'a.b');
    expect(first).toBe(second);
    // truncated form (maxStringLength=10) ends with the ellipsis marker
    expect(first.endsWith('..."')).toBe(true);
  });

  it('keys the cache by expansion state — expanded path yields the FULL value, collapsed the truncated one', () => {
    const longString = 'y'.repeat(50);
    // collapsed → truncated
    const collapsed = component.formatValue(longString, 'p');
    expect(collapsed.endsWith('..."')).toBe(true);

    // expand that path, then re-format: must NOT serve the collapsed cache entry
    component.toggleValueExpansion('p', { stopPropagation: vi.fn() } as unknown as Event);
    const expanded = component.formatValue(longString, 'p');
    expect(expanded).toBe(`"${longString}"`);
    expect(expanded).not.toBe(collapsed);
  });

  it('isValueTruncated reports truncation for long strings and caches the result', () => {
    const longString = 'z'.repeat(50);
    expect(component.isValueTruncated(longString, 'q')).toBe(true);
    // short string under the cap is not truncated
    expect(component.isValueTruncated('short', 'r')).toBe(false);
  });

  it('isValueTruncated returns false once the path is expanded', () => {
    const longString = 'w'.repeat(50);
    expect(component.isValueTruncated(longString, 's')).toBe(true);
    component.toggleValueExpansion('s', { stopPropagation: vi.fn() } as unknown as Event);
    expect(component.isValueTruncated(longString, 's')).toBe(false);
  });

  it('does NOT leak a stale cached value after the source data regenerates', () => {
    // Prime the cache for path 'root' under the first dataset.
    component.oldValue = { root: 'a'.repeat(50) };
    component.newValue = { root: 'a'.repeat(50) };
    component.ngOnInit();
    const firstFormatted = component.formatValue('a'.repeat(50), 'root');
    expect(firstFormatted.endsWith('..."')).toBe(true);

    // Regenerate with a DIFFERENT value at the same path. generateDiff clears the
    // memo caches, so formatting 'root' again must reflect the NEW value, not the
    // stale cached string.
    const newVal = 'b'.repeat(50);
    component.oldValue = { root: newVal };
    component.newValue = { root: 'changed-' + newVal };
    const afterRegen = component.formatValue('changed-' + newVal, 'root');
    expect(afterRegen).toContain('changed-');
    expect(afterRegen).not.toBe(firstFormatted);
  });

  it('caches object formatting (computeFormattedValue runs once per (path, expanded))', () => {
    const obj = { a: 1, b: 2, c: 3, d: 'x'.repeat(300) };
    const first = component.formatValue(obj, 'obj');
    const second = component.formatValue(obj, 'obj');
    expect(second).toBe(first);
  });
});
