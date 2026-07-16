import { describe, it, expect } from 'vitest';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { VennDiagramComponent } from './venn-diagram.component';
import type { VennData, VennSet } from '../../services/list-set-operations.service';

/**
 * DOM coverage for <mj-venn-diagram> (module-declared). The circles/intersection labels are drawn
 * imperatively into the SVG by D3 and depend on a measured container size that jsdom cannot provide,
 * so we DON'T assert pixels. What IS Angular-template-driven — and therefore data-driven-testable —
 * is the legend (`@for` over data.sets: name + size) and the empty-state overlay (shown when there
 * are no sets). Those are exactly the "counts/labels/legend/empty-state" targets for a viz component.
 * Pure @Input, no DI/async → single synchronous render.
 */

const set = (over: Partial<VennSet> = {}): VennSet =>
  ({
    operandKey: 'list:a',
    kind: 'list',
    listId: 'a',
    listName: 'List A',
    color: '#123456',
    recordIds: new Set<string>(),
    size: 0,
    ...over,
  }) as VennSet;

const vennData = (sets: VennSet[]): VennData => ({ sets, intersections: [] });

const render = (data: VennData | null) =>
  renderComponentFixture(VennDiagramComponent, {
    imports: [MJEmptyStateComponent],
    declarations: [VennDiagramComponent],
    inputs: { data },
  });

describe('VennDiagramComponent (DOM)', () => {
  it('renders the container and svg host', () => {
    const fixture = render(null);
    expect(query(fixture, '.venn-container')).not.toBeNull();
    expect(query(fixture, 'svg.venn-svg')).not.toBeNull();
  });

  it('shows the empty-state overlay when data is null', () => {
    const fixture = render(null);
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(query(fixture, '.venn-legend')).toBeNull();
  });

  it('shows the empty-state overlay when the set list is empty', () => {
    const fixture = render(vennData([]));
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
  });

  it('renders one legend item per set (no empty-state) when sets are present', () => {
    const fixture = render(vennData([
      set({ listId: 'a', listName: 'List A', size: 10 }),
      set({ listId: 'b', listName: 'List B', size: 5 }),
    ]));
    expect(query(fixture, 'mj-empty-state')).toBeNull();
    expect(queryAll(fixture, '.legend-item').length).toBe(2);
  });

  it('shows each set name and item count in the legend', () => {
    const fixture = render(vennData([set({ listId: 'a', listName: 'VIP Members', size: 42 })]));
    expect(text(fixture, '.legend-name')).toBe('VIP Members');
    expect(text(fixture, '.legend-count')).toContain('42');
  });

  it('binds each legend swatch to its set color', () => {
    const fixture = render(vennData([set({ color: 'rgb(1, 2, 3)' })]));
    const swatch = query(fixture, '.legend-color') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });
});
