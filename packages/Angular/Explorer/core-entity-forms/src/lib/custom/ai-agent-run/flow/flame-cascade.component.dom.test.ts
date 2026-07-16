import { describe, it, expect } from 'vitest';
import { renderComponentFixture, queryAll, capture } from '@memberjunction/ng-test-utils';
import { FlameCascadeComponent } from './flame-cascade.component';
import type { FlowModel, FlowNode } from './agent-run-flow.model';

/**
 * DOM coverage for <mj-agent-flow-flame> — the icicle/flame renderer. Imperative SVG drawn on
 * Render(); pan/zoom is loaded from UserInfoEngine (returns empty on an unconfigured engine, so no
 * stub needed) and uses viewBox math (no getBBox). We feed a small hand-built FlowModel and assert
 * the rendered bar COUNT + labels + empty state, not geometry. One render + Render() per test.
 */

function node(over: Partial<FlowNode>): FlowNode {
  return {
    id: 0, name: 'Node', type: 'other', status: 'Completed', model: null, realDur: 1,
    t0: 0, t1: 1, tmid: 0.5, r0: 0, r1: 1, depth: 0, heat: 0,
    parent: null, children: [], raw: null, iconClass: 'fa-circle', logoUrl: null, ...over,
  };
}

/** root agent (0..1) → prompt leaf (0..0.5) + action leaf (0.5..1). */
function sampleModel(): FlowModel {
  const root = node({ id: 0, name: 'Support Agent', type: 'agent', depth: 0, t0: 0, t1: 1 });
  const prompt = node({ id: 1, name: 'Execute Agent Prompt', type: 'prompt', depth: 1, t0: 0, t1: 0.5, parent: root });
  const action = node({ id: 2, name: 'Execute Action: Search', type: 'action', depth: 1, t0: 0.5, t1: 1, parent: root });
  root.children = [prompt, action];
  const nodes = [root, prompt, action];
  return { root, nodes, leaves: [prompt, action], total: 2, maxDepth: 1, maxLeafDur: 1 };
}

const render = (model: FlowModel | null) => {
  const fixture = renderComponentFixture(FlameCascadeComponent, { declarations: [FlameCascadeComponent], inputs: { Model: model } });
  fixture.componentInstance.Render(1, 0);
  fixture.detectChanges();
  return fixture;
};

describe('FlameCascadeComponent (DOM)', () => {
  it('renders an empty svg (no node groups) when there is no model', () => {
    expect(queryAll(render(null), 'svg g > g').length).toBe(0);
  });

  it('renders one bar (outline rect with rounded corners) per model node', () => {
    const fixture = render(sampleModel());
    const bars = queryAll(fixture, 'svg rect').filter((r) => r.getAttribute('rx') === '8' && r.getAttribute('stroke'));
    // 2 outline rects per node group (outline + hidden fill) — count the stroked outline ones (3 nodes).
    const outlines = bars.filter((r) => r.getAttribute('stroke-width') === '1.4');
    expect(outlines.length).toBe(3);
  });

  it('renders the abbreviated node labels', () => {
    const allText = queryAll(render(sampleModel()), 'svg text').map((t) => t.textContent).join(' | ');
    expect(allText).toContain('Support Agent');
    expect(allText).toContain('Search');
  });

  it('draws a percentage time axis (0%..100%)', () => {
    const axis = queryAll(render(sampleModel()), 'svg text').map((t) => t.textContent);
    expect(axis).toContain('0%');
    expect(axis).toContain('100%');
  });

  it('emits nodeSelected when a node group is clicked', () => {
    const fixture = render(sampleModel());
    const selected = capture(fixture.componentInstance.nodeSelected);
    const firstRect = queryAll(fixture, 'svg rect').filter((r) => r.getAttribute('stroke-width') === '1.4')[0] as SVGElement;
    (firstRect.parentElement as unknown as SVGElement).dispatchEvent(new MouseEvent('click'));
    expect(selected.length).toBe(1);
  });
});
