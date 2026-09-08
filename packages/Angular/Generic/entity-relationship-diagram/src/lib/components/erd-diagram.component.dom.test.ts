import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
import { ERDDiagramComponent } from './erd-diagram.component';
import type { ERDNode } from '../interfaces/erd-types';

/**
 * DOM coverage for <mj-erd-diagram> — the SVG ERD renderer (~6×). Its diagram body is a computed SVG
 * layout, but its header chrome (title, entity counts, search, schema-filter chips, layout-mode toggle)
 * is straightforward DOM driven by the `nodes` input. These cover that chrome + the search clear affordance
 * + the layout-mode active state, plus that the SVG canvas renders. The layout math itself is left to the
 * (heavier) e2e/visual tier.
 */

const node = (id: string, name: string, schemaName = 'dbo'): ERDNode =>
  ({ id, name, schemaName, description: '', status: 'Active', baseTable: name, fields: [] } as unknown as ERDNode);

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(ERDDiagramComponent, {
    imports: [StubEmptyStateComponent],
    declarations: [ERDDiagramComponent],
    inputs: { nodes: [node('e1', 'Accounts')], ...inputs },
  });
type Fx = ReturnType<typeof render>;

describe('ERDDiagramComponent (DOM)', () => {
  it('renders the header with the configured title', () => {
    expect(text(render({ headerTitle: 'My Schema' }), '.erd-title')).toBe('My Schema');
  });

  it('hides the header when showHeader is false', () => {
    expect(query(render({ showHeader: false }), '.erd-chrome')).toBeNull();
  });

  it('reflects the total entity count from the nodes', () => {
    const f = render({ nodes: [node('e1', 'Accounts'), node('e2', 'Contacts'), node('e3', 'Deals')] });
    expect(text(f, '.erd-count-label')).toContain('of 3 entities');
  });

  it('renders a schema chip per distinct schema when there is more than one', () => {
    const f = render({ nodes: [node('e1', 'Accounts', 'dbo'), node('e2', 'Logs', 'audit')] });
    const chips = queryAll(f, '.erd-chip .erd-chip-label').map((c) => c.textContent?.trim());
    expect(chips).toContain('dbo');
    expect(chips).toContain('audit');
  });

  it('shows the clear-search button only once a search query is entered', () => {
    const f = render();
    expect(query(f, '.erd-search-clear')).toBeNull();
    const input = query(f, '.erd-search input') as HTMLInputElement;
    input.value = 'acc';
    input.dispatchEvent(new Event('input'));
    f.detectChanges(false);
    expect(query(f, '.erd-search-clear')).not.toBeNull();
  });

  it('clears the search query via the clear button', () => {
    const f = render();
    const input = query(f, '.erd-search input') as HTMLInputElement;
    input.value = 'acc';
    input.dispatchEvent(new Event('input'));
    f.detectChanges(false);
    (query(f, '.erd-search-clear') as HTMLElement).click();
    f.detectChanges(false);
    expect(query(f, '.erd-search-clear')).toBeNull();
    expect(f.componentInstance.searchQuery).toBe('');
  });

  it('reflects the active layout mode on the layout toggle', () => {
    const f = render();
    const layoutBtns = Array.from(f.nativeElement.querySelectorAll('[aria-label$="layout"]')) as HTMLElement[];
    layoutBtns[1].click(); // hierarchical / dagre
    f.detectChanges(false);
    expect(f.componentInstance.activeLayout).toBe('dagre');
  });

  it('renders the SVG canvas', () => {
    expect(query(render(), 'svg.erd-canvas')).not.toBeNull();
  });
});
