import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderComponentFixture, queryAll, capture } from '@memberjunction/ng-test-utils';
import { FlowchartComponent } from './flowchart.component';
import type { FlowModel, FlowNode } from './agent-run-flow.model';

/**
 * DOM coverage for <mj-agent-flow-flowchart> — the static top-down tree renderer. It draws its
 * scene imperatively into an inline <svg> when the container calls Render(). We feed it a small
 * hand-built FlowModel (the model layer's own DB→node adapter is not exercised here) and assert the
 * rendered node COUNT + labels + empty state — not pixel geometry. `fitToView()` calls SVG getBBox()
 * inside a requestAnimationFrame, which jsdom doesn't implement, so we stub getBBox at the prototype
 * (test-file scope only). OnPush + imperative SVG, so one render + explicit Render() call per test.
 */

// jsdom has no SVGGraphicsElement.getBBox — Flowchart's deferred fitToView() needs it. Installed in
// beforeAll and restored in afterAll so the patch cannot leak into other specs if per-file process
// isolation is ever relaxed.
let savedGetBBox: PropertyDescriptor | undefined;

beforeAll(() => {
  savedGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
  const stub = (): DOMRect => new DOMRect(0, 0, 800, 600);
  Object.defineProperty(SVGElement.prototype, 'getBBox', { value: stub, configurable: true, writable: true });
});

afterAll(async () => {
  // Every rendering test queues `requestAnimationFrame(() => this.fitToView())` (which calls
  // getBBox). rAF callbacks run FIFO, so awaiting one queued NOW guarantees all of the tests'
  // earlier callbacks have already fired — while the stub is still installed. Without this
  // flush, slow CI runners fire those callbacks AFTER the restore below and every one crashes
  // as an Unhandled Error ("this.mainG.getBBox is not a function"), failing the run even
  // though all tests passed.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (savedGetBBox) Object.defineProperty(SVGElement.prototype, 'getBBox', savedGetBBox);
  else Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
});

/** Build a minimal FlowNode with sensible defaults for the fields renderers read. */
function node(over: Partial<FlowNode>): FlowNode {
  return {
    id: 0, name: 'Node', type: 'other', status: 'Completed', model: null, realDur: 1,
    t0: 0, t1: 1, tmid: 0.5, r0: 0, r1: 1, depth: 0, heat: 0,
    parent: null, children: [], raw: null, iconClass: 'fa-circle', logoUrl: null, ...over,
  };
}

/** A tiny 3-node run: root agent → one prompt leaf + one action leaf. */
function sampleModel(): FlowModel {
  const root = node({ id: 0, name: 'Support Agent', type: 'agent', depth: 0 });
  const prompt = node({ id: 1, name: 'Execute Agent Prompt', type: 'prompt', depth: 1, parent: root });
  const action = node({ id: 2, name: 'Execute Action: Search', type: 'action', depth: 1, parent: root });
  root.children = [prompt, action];
  const nodes = [root, prompt, action];
  return { root, nodes, leaves: [prompt, action], total: 2, maxDepth: 1, maxLeafDur: 1 };
}

const render = (model: FlowModel | null) => {
  const fixture = renderComponentFixture(FlowchartComponent, { declarations: [FlowchartComponent], inputs: { Model: model } });
  fixture.componentInstance.Render(1, 0);
  fixture.detectChanges();
  return fixture;
};

describe('FlowchartComponent (DOM)', () => {
  it('renders an empty svg (no node rects) when there is no model', () => {
    const fixture = render(null);
    expect(queryAll(fixture, 'svg rect').length).toBe(0);
  });

  it('renders one node group per model node', () => {
    const fixture = render(sampleModel());
    // Each node emits a labelled <text> at the same font size (13) for its title.
    const titles = queryAll(fixture, 'svg text').filter((t) => t.getAttribute('font-size') === '13');
    expect(titles.length).toBe(3);
  });

  it('renders the node labels (short-form) from the model', () => {
    const fixture = render(sampleModel());
    const allText = queryAll(fixture, 'svg text').map((t) => t.textContent).join(' | ');
    expect(allText).toContain('Support Agent');
    expect(allText).toContain('Search'); // "Execute Action: Search" → "Search"
  });

  it('draws a connector path from each child to its parent', () => {
    const fixture = render(sampleModel());
    // 2 children → 2 elbow connector paths (plus the collapse triangle path for the container).
    expect(queryAll(fixture, 'svg path').length).toBeGreaterThanOrEqual(2);
  });

  it('emits nodeSelected when a node body is clicked', () => {
    const fixture = render(sampleModel());
    const selected = capture(fixture.componentInstance.nodeSelected);
    // The node "body" <g> (which wraps the node's <rect>) listens for mouseup (guarded by no-drag).
    const firstRect = queryAll(fixture, 'svg rect')[0] as SVGElement;
    const body = firstRect.parentElement as unknown as SVGElement;
    body.dispatchEvent(new MouseEvent('mouseup'));
    expect(selected.length).toBe(1);
  });
});
