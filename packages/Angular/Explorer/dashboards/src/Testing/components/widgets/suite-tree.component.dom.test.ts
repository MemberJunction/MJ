import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { SuiteTreeComponent, SuiteTreeNodeComponent } from './suite-tree.component';
import type { SuiteHierarchyNode } from '../../services/testing-instrumentation.service';

/**
 * DOM coverage for <app-suite-tree> (+ its recursive <app-suite-tree-node> child). No services —
 * pure @Input-driven presentation. Covers: empty-state gating (no-suites vs. rendered nodes),
 * node structure from the `suites` input, the suiteSelect output on node click, selected-class
 * gating, and the expand/collapse toolbar mutating node.expanded. Module-declared; both declared.
 */

function node(over: Partial<SuiteHierarchyNode> = {}): SuiteHierarchyNode {
  return {
    id: 'n1', name: 'Suite A', testCount: 4, RunCount: 10, SkippedCount: 0, passRate: 92, expanded: false, children: [], ...over,
  } as SuiteHierarchyNode;
}

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(SuiteTreeComponent, {
    declarations: [SuiteTreeComponent, SuiteTreeNodeComponent],
    inputs,
  });

describe('SuiteTreeComponent (DOM)', () => {
  it('shows the empty state when there are no suites', () => {
    const fixture = render({ suites: [] });
    expect(query(fixture, '.no-suites')).not.toBeNull();
    expect(text(fixture, '.no-suites p')).toContain('No test suites found');
    expect(query(fixture, 'app-suite-tree-node')).toBeNull();
  });

  it('renders one tree node per top-level suite with its name', () => {
    const fixture = render({ suites: [node({ id: 'a', name: 'Alpha' }), node({ id: 'b', name: 'Beta' })] });
    const nodes = queryAll(fixture, 'app-suite-tree-node');
    expect(nodes.length).toBe(2);
    const names = queryAll(fixture, '.suite-name').map((e) => e.textContent?.trim());
    expect(names).toEqual(expect.arrayContaining(['Alpha', 'Beta']));
    expect(query(fixture, '.no-suites')).toBeNull();
  });

  it('emits suiteSelect with the suite id when a node is clicked', () => {
    const fixture = render({ suites: [node({ id: 'clicked-id', name: 'Alpha' })] });
    const selected = capture(fixture.componentInstance.suiteSelect);
    (query(fixture, '.node-content') as HTMLElement).click();
    expect(selected).toEqual(['clicked-id']);
  });

  it('marks the node selected when selectedSuiteId matches', () => {
    const fixture = render({ suites: [node({ id: 'sel', name: 'Alpha' })], selectedSuiteId: 'sel' });
    expect(query(fixture, '.node-content.selected')).not.toBeNull();
  });

  it('expandAll / collapseAll toggle expanded across the nested suite tree', () => {
    const child = node({ id: 'child', name: 'Child' });
    const parent = node({ id: 'parent', name: 'Parent', children: [child] });
    const fixture = render({ suites: [parent] });
    fixture.componentInstance.expandAll();
    expect(parent.expanded).toBe(true);
    expect(child.expanded).toBe(true);
    fixture.componentInstance.collapseAll();
    expect(parent.expanded).toBe(false);
    expect(child.expanded).toBe(false);
  });

  it('shows "No runs" instead of a 0% pass rate for a suite with no runs in the period (F18)', () => {
    const fixture = render({ suites: [node({ id: 'a', name: 'Alpha', RunCount: 0, passRate: 0 }), node({ id: 'b', name: 'Beta' })] });
    const rates = queryAll(fixture, '.pass-rate').map((e) => e.textContent?.trim());
    expect(rates).toEqual(['No runs', '92%']);
  });

  it('shows "All skipped" for a suite whose runs in the period were all skipped (QF2-Y2)', () => {
    const fixture = render({ suites: [node({ id: 'a', name: 'Alpha', RunCount: 3, SkippedCount: 3, passRate: 0 })] });
    expect(queryAll(fixture, '.pass-rate').map((e) => e.textContent?.trim())).toEqual(['All skipped']);
  });
});
