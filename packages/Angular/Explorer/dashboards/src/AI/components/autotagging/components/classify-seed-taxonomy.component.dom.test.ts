import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { ClassifySeedTaxonomyComponent, SeedTaxonomyNode } from './classify-seed-taxonomy.component';

/**
 * DOM coverage for <classify-seed-taxonomy> — the seed-taxonomy review tree. Module-declared
 * (standalone:false), extends BaseAngularComponent. Generation calls a GraphQL client (network) so we
 * don't invoke it; instead we drive the already-generated state by seeding `ProposedNodes` + `HasGenerated`
 * via `setup` (pre-first-render, NG0100-safe) and assert the flattened tree, the Generate button's
 * SourceID gating, and node selection/toggle. mj-loading / mj-empty-state are stubbed elements; mjButton
 * is an attribute directive (no stub needed).
 */

const node = (key: string, name: string, over: Partial<SeedTaxonomyNode> = {}): SeedTaxonomyNode => ({
  Key: key,
  Name: name,
  Selected: true,
  Renaming: false,
  Depth: 0,
  Children: [],
  ...over,
});

const render = (opts: { sourceId?: string | null; nodes?: SeedTaxonomyNode[]; generated?: boolean } = {}) =>
  renderComponentFixture(ClassifySeedTaxonomyComponent, {
    declarations: [ClassifySeedTaxonomyComponent],
    imports: [StubLoadingComponent, StubEmptyStateComponent],
    inputs: { SourceID: opts.sourceId ?? null },
    setup: (instance) => {
      if (opts.nodes) instance.ProposedNodes = opts.nodes;
      if (opts.generated) instance.HasGenerated = true;
    },
  });

describe('ClassifySeedTaxonomyComponent (DOM)', () => {
  it('disables the Generate button when no SourceID is set', () => {
    const fixture = render({ sourceId: null });
    expect((query(fixture, '.cls-seed-bar button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the Generate button once a SourceID is provided', () => {
    const fixture = render({ sourceId: 'src-1' });
    expect((query(fixture, '.cls-seed-bar button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders one tree row per node (flattened depth-first) once generated', () => {
    const fixture = render({
      sourceId: 'src-1',
      generated: true,
      nodes: [node('n0', 'Finance', { Children: [node('n1', 'Taxes', { Depth: 1 })] }), node('n2', 'Ops')],
    });
    expect(queryAll(fixture, '.cls-seed-row').length).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Finance');
    expect(fixture.nativeElement.textContent).toContain('Taxes');
  });

  it('reports the selected count via the SelectedCount getter', () => {
    const fixture = render({
      sourceId: 'src-1',
      generated: true,
      nodes: [node('n0', 'A'), node('n1', 'B', { Selected: false })],
    });
    expect(fixture.componentInstance.SelectedCount).toBe(1);
  });

  it('toggling a node checkbox flips its selection (and cascades)', () => {
    const nodes = [node('n0', 'Parent', { Children: [node('n1', 'Child', { Depth: 1 })] })];
    const fixture = render({ sourceId: 'src-1', generated: true, nodes });
    const checkbox = query(fixture, '.cls-seed-row input[type="checkbox"]') as HTMLInputElement;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(nodes[0].Selected).toBe(false);
    expect(nodes[0].Children[0].Selected).toBe(false);
  });

  it('shows the empty-state element when generated with no proposed nodes', () => {
    const fixture = render({ sourceId: 'src-1', generated: true, nodes: [] });
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(query(fixture, '.cls-seed-tree')).toBeNull();
  });
});
