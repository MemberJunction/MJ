import { describe, it, expect, beforeAll } from 'vitest';
import { renderComponentFixture, queryAll, capture } from '@memberjunction/ng-test-utils';
import { SubwayLinesComponent } from './subway-lines.component';
import type { FlowModel, FlowNode } from './agent-run-flow.model';

/**
 * DOM coverage for <mj-agent-flow-subway> — the transit-map renderer: one line per agent, one
 * station per leaf step. Imperative SVG on Render(). It measures connector paths via
 * getTotalLength(), which jsdom leaves unimplemented, so we stub it at the prototype (test scope).
 * We assert station COUNT (= leaves) + agent-line labels + empty state, not geometry.
 */

beforeAll(() => {
  // jsdom's SVG path prototype chain is SVGElement → Element (no SVGPathElement/SVGGeometryElement),
  // so getTotalLength must be stubbed on SVGElement.prototype (test-file scope only).
  const proto = SVGElement.prototype as unknown as { getTotalLength?: () => number };
  if (!proto.getTotalLength) proto.getTotalLength = () => 100;
});

function node(over: Partial<FlowNode>): FlowNode {
  return {
    id: 0, name: 'Node', type: 'other', status: 'Completed', model: null, realDur: 1,
    t0: 0, t1: 1, tmid: 0.5, r0: 0, r1: 1, depth: 0, heat: 0,
    parent: null, children: [], raw: null, iconClass: 'fa-circle', logoUrl: null, ...over,
  };
}

/** root agent line with 3 leaf stations at spread-out tmids. */
function sampleModel(): FlowModel {
  const root = node({ id: 0, name: 'Support Agent', type: 'agent', depth: 0, tmid: 0.5 });
  const a = node({ id: 1, name: 'Execute Agent Prompt', type: 'prompt', depth: 1, tmid: 0.1, parent: root });
  const b = node({ id: 2, name: 'Execute Action: Search', type: 'action', depth: 1, tmid: 0.5, parent: root });
  const c = node({ id: 3, name: 'Agent Validation', type: 'validation', depth: 1, tmid: 0.9, parent: root });
  root.children = [a, b, c];
  const nodes = [root, a, b, c];
  return { root, nodes, leaves: [a, b, c], total: 3, maxDepth: 1, maxLeafDur: 1 };
}

const render = (model: FlowModel | null) => {
  const fixture = renderComponentFixture(SubwayLinesComponent, { declarations: [SubwayLinesComponent], inputs: { Model: model } });
  fixture.componentInstance.Render(1, 0);
  fixture.detectChanges();
  return fixture;
};

describe('SubwayLinesComponent (DOM)', () => {
  it('renders an empty svg (no stations) when there is no model', () => {
    expect(queryAll(render(null), 'svg circle').length).toBe(0);
  });

  it('renders one station ring per leaf step', () => {
    const fixture = render(sampleModel());
    // Station rings carry stroke-width 3.2; the train dots (2) do not.
    const rings = queryAll(fixture, 'svg circle').filter((c) => c.getAttribute('stroke-width') === '3.2');
    expect(rings.length).toBe(3);
  });

  it('labels the agent line with its short name and step count', () => {
    const allText = queryAll(render(sampleModel()), 'svg text').map((t) => t.textContent).join(' | ');
    expect(allText).toContain('Support Agent');
    expect(allText).toContain('3 steps');
  });

  it('emits nodeSelected when a station is clicked', () => {
    const fixture = render(sampleModel());
    const selected = capture(fixture.componentInstance.nodeSelected);
    const ring = queryAll(fixture, 'svg circle').filter((c) => c.getAttribute('stroke-width') === '3.2')[0] as SVGElement;
    (ring.parentElement as unknown as SVGElement).dispatchEvent(new MouseEvent('click'));
    expect(selected.length).toBe(1);
  });
});
