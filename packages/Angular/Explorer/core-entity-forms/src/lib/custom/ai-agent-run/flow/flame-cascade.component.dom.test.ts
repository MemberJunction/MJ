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
    Id: 0, Name: 'Node', Type: 'other', Status: 'Completed', Model: null, RealDur: 1,
    T0: 0, T1: 1, Tmid: 0.5, R0: 0, R1: 1, Depth: 0, Heat: 0,
    Parent: null, Children: [], Raw: null, IconClass: 'fa-circle', LogoUrl: null, ...over,
  };
}

/** root agent (0..1) → prompt leaf (0..0.5) + action leaf (0.5..1). */
function sampleModel(): FlowModel {
  const root = node({ Id: 0, Name: 'Support Agent', Type: 'agent', Depth: 0, T0: 0, T1: 1 });
  const prompt = node({ Id: 1, Name: 'Execute Agent Prompt', Type: 'prompt', Depth: 1, T0: 0, T1: 0.5, Parent: root });
  const action = node({ Id: 2, Name: 'Execute Action: Search', Type: 'action', Depth: 1, T0: 0.5, T1: 1, Parent: root });
  root.Children = [prompt, action];
  const nodes = [root, prompt, action];
  return { Root: root, Nodes: nodes, Leaves: [prompt, action], Total: 2, MaxDepth: 1, MaxLeafDur: 1 };
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
