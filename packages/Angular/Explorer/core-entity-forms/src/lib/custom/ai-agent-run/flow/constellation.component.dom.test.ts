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
    Id: 0, Name: 'Node', Type: 'other', Status: 'Completed', Model: null, RealDur: 1,
    T0: 0, T1: 1, Tmid: 0.5, R0: 0, R1: 1, Depth: 0, Heat: 0,
    Parent: null, Children: [], Raw: null, IconClass: 'fa-circle', LogoUrl: null, ...over,
  };
}

/** root agent → prompt leaf + action leaf. */
function sampleModel(): FlowModel {
  const root = node({ Id: 0, Name: 'Support Agent', Type: 'agent', Depth: 0 });
  const prompt = node({ Id: 1, Name: 'Execute Agent Prompt', Type: 'prompt', Depth: 1, Parent: root });
  const action = node({ Id: 2, Name: 'Execute Action: Search', Type: 'action', Depth: 1, Parent: root });
  root.Children = [prompt, action];
  const nodes = [root, prompt, action];
  return { Root: root, Nodes: nodes, Leaves: [prompt, action], Total: 2, MaxDepth: 1, MaxLeafDur: 1 };
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
