import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderComponentFixture, queryAll, capture } from '@memberjunction/ng-test-utils';
import { ConstellationComponent } from './constellation.component';
import type { FlowModel, FlowNode } from './agent-run-flow.model';

/**
 * DOM coverage for <mj-agent-flow-constellation> — the radial "star map" renderer: the run laid out
 * as a constellation, one star per node with curved edges to parents. Imperative SVG on Render();
 * edges measure paths via getTotalLength() (unimplemented in jsdom → prototype stub, test scope).
 * We assert star COUNT (= nodes) + labels + empty state, not geometry.
 */

// jsdom's SVG path prototype chain is SVGElement → Element (no SVGPathElement/SVGGeometryElement),
// so getTotalLength must be stubbed on SVGElement.prototype. Installed in beforeAll and restored in
// afterAll so the patch cannot leak into other specs if per-file process isolation is ever relaxed.
let savedGetTotalLength: PropertyDescriptor | undefined;

beforeAll(() => {
  savedGetTotalLength = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getTotalLength');
  const stub = (): number => 100;
  Object.defineProperty(SVGElement.prototype, 'getTotalLength', { value: stub, configurable: true, writable: true });
});

afterAll(() => {
  if (savedGetTotalLength) Object.defineProperty(SVGElement.prototype, 'getTotalLength', savedGetTotalLength);
  else Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength');
});

function node(over: Partial<FlowNode>): FlowNode {
  return {
    id: 0, name: 'Node', type: 'other', status: 'Completed', model: null, realDur: 1,
    t0: 0, t1: 1, tmid: 0.5, r0: 0, r1: 1, depth: 0, heat: 0,
    parent: null, children: [], raw: null, iconClass: 'fa-circle', logoUrl: null, ...over,
  };
}

/** root agent → prompt leaf + action leaf. */
function sampleModel(): FlowModel {
  const root = node({ id: 0, name: 'Support Agent', type: 'agent', depth: 0 });
  const prompt = node({ id: 1, name: 'Execute Agent Prompt', type: 'prompt', depth: 1, parent: root });
  const action = node({ id: 2, name: 'Execute Action: Search', type: 'action', depth: 1, parent: root });
  root.children = [prompt, action];
  const nodes = [root, prompt, action];
  return { root, nodes, leaves: [prompt, action], total: 2, maxDepth: 1, maxLeafDur: 1 };
}

const render = (model: FlowModel | null) => {
  const fixture = renderComponentFixture(ConstellationComponent, { declarations: [ConstellationComponent], inputs: { Model: model } });
  fixture.componentInstance.Render(1, 0);
  fixture.detectChanges();
  return fixture;
};

describe('ConstellationComponent (DOM)', () => {
  it('renders only the background starfield (no node groups) when there is no model', () => {
    // No model → no node <g> groups (the background stars are drawn eagerly, but node groups aren't).
    expect(queryAll(render(null), 'svg g g g').length).toBe(0);
  });

  it('renders one star ring per model node', () => {
    const fixture = render(sampleModel());
    // Star rings carry stroke-width 1.6; background stars and halos do not (fill-opacity is animated).
    const rings = queryAll(fixture, 'svg circle').filter((c) => c.getAttribute('stroke-width') === '1.6');
    expect(rings.length).toBe(3);
  });

  it('renders the node labels', () => {
    const allText = queryAll(render(sampleModel()), 'svg text').map((t) => t.textContent).join(' | ');
    expect(allText).toContain('Support Agent');
    expect(allText).toContain('Search');
  });

  it('emits nodeSelected when a star is clicked', () => {
    const fixture = render(sampleModel());
    const selected = capture(fixture.componentInstance.nodeSelected);
    const ring = queryAll(fixture, 'svg circle').filter((c) => c.getAttribute('stroke-width') === '1.6')[0] as SVGElement;
    (ring.parentElement as unknown as SVGElement).dispatchEvent(new MouseEvent('click'));
    expect(selected.length).toBe(1);
  });
});
