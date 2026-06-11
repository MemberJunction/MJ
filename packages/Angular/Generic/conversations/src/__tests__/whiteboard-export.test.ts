import { describe, it, expect, beforeEach } from 'vitest';
import { BuildWhiteboardExportHtml, BuildWhiteboardExportSvg, WhiteboardExportOptions } from '../lib/components/realtime/whiteboard/whiteboard-export';
import { WhiteboardState } from '../lib/components/realtime/whiteboard/whiteboard-state';

/**
 * EXPORT builders — self-contained HTML document structure, every item kind rendered,
 * HTML escaping of all user/agent text, text-style fields reflected, ownership chips,
 * footer counts, print rules, determinism, and the standalone SVG variant.
 */

const OPTS: WhiteboardExportOptions = {
  Title: 'Q3 Planning Board',
  AgentName: 'Sage',
  GeneratedAt: '2026-06-10, 9:30 AM'
};

/** Build a board containing every item kind (one connector anchored item-to-item). */
function buildFullBoard(): WhiteboardState {
  const state = new WhiteboardState();
  const sticky = state.AddItem({
    Kind: 'sticky', X: 100, Y: 100, Text: 'Sticky idea', Tint: 'amber',
    FontSize: 24, FontFamily: 'serif', FontWeight: 700
  }, 'user');
  const shape = state.AddItem({ Kind: 'shape', Shape: 'ellipse', X: 420, Y: 120, W: 160, H: 90, Label: 'Pipeline', Sub: 'phase 2' }, 'agent');
  state.AddItem({ Kind: 'connector', FromItemID: sticky.ID, ToItemID: shape.ID }, 'agent');
  state.AddItem({ Kind: 'text', X: 60, Y: 320, Text: 'Free label', FontSize: 18, FontFamily: 'mono', Color: '#0ea5e9' }, 'user');
  state.AddItem({ Kind: 'image', X: 300, Y: 340, Name: 'roadmap.png' }, 'user');
  state.AddItem({ Kind: 'ink', Points: [{ X: 50, Y: 50 }, { X: 80, Y: 64 }, { X: 120, Y: 58 }], Color: '#ef4444', StrokeWidth: 4 }, 'user');
  state.AddItem({ Kind: 'highlight', X: 400, Y: 300, W: 120, H: 80, Label: 'look here' }, 'agent');
  return state;
}

describe('BuildWhiteboardExportHtml', () => {
  let state: WhiteboardState;
  let html: string;

  beforeEach(() => {
    state = buildFullBoard();
    html = BuildWhiteboardExportHtml(state, OPTS);
  });

  it('produces a self-contained HTML document with header, inline CSS and footer', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Q3 Planning Board</title>');
    expect(html).toContain('<h1>Q3 Planning Board</h1>');
    expect(html).toContain('Generated 2026-06-10, 9:30 AM');
    expect(html).toContain('Live session with Sage');
    expect(html).toContain('<style>');
    // self-contained: no external references of any kind (xmlns namespace URIs aside)
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('src=');
    // item-count footer (6 elements — the highlight is transient and excluded)
    expect(html).toContain(`${state.ElementCount} elements`);
    expect(html).toContain('you 4');
    expect(html).toContain('Sage 2');
  });

  it('renders every item kind: boxes as divs, ink/connector/highlight in one SVG layer', () => {
    expect(html).toContain('Sticky idea');                                  // sticky
    expect(html).toContain('Pipeline');                                     // shape label
    expect(html).toContain('phase 2');                                      // shape sub
    expect(html).toContain('Free label');                                   // text
    expect(html).toContain('roadmap.png');                                  // image placeholder
    expect((html.match(/<svg /g) ?? []).length).toBe(1);                    // ONE vector layer
    expect(html).toContain('<polyline points=');                            // ink stroke
    expect(html).toContain('stroke="#ef4444"');                             // ink color honored
    expect(html).toContain('marker-end="url(#wb-arrow)"');                  // connector arrow
    expect(html).toContain('stroke-dasharray');                             // highlight dashed outline
    expect(html).toContain('look here');                                    // highlight label
  });

  it('anchors connectors to item centers using the engine bounds math', () => {
    // sticky center: (100 + 172/2, 100 + 96/2) = (186, 148), offset by the padded board origin
    const conn = /<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/.exec(html);
    expect(conn).toBeTruthy();
    const bounds = state.ContentBounds();
    expect(bounds).toBeTruthy();
    if (conn && bounds) {
      const ox = bounds.X - 36;
      const oy = bounds.Y - 36;
      expect(Number(conn[1])).toBeCloseTo(186 - ox, 1);
      expect(Number(conn[2])).toBeCloseTo(148 - oy, 1);
      expect(Number(conn[3])).toBeCloseTo(420 + 80 - ox, 1); // ellipse center X
      expect(Number(conn[4])).toBeCloseTo(120 + 45 - oy, 1); // ellipse center Y
    }
  });

  it('reflects the optional text-style fields (FontSize / FontFamily / FontWeight / Color)', () => {
    expect(html).toContain('font-size:24px');
    expect(html).toContain('Georgia');             // serif stack on the sticky
    expect(html).toContain('font-weight:700');
    expect(html).toContain('font-size:18px');
    expect(html).toContain('ui-monospace');        // mono stack on the text label
    expect(html).toContain('color:#0ea5e9');       // text color honored
  });

  it('garnishes items with ownership chips (You / agent name)', () => {
    expect(html).toContain('class="chip chip--user">You</span>');
    expect(html).toContain('class="chip chip--agent">Sage</span>');
  });

  it('HTML-escapes every piece of user/agent text — script injection renders inert', () => {
    const hostile = new WhiteboardState();
    hostile.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: '<script>alert(1)</script>' }, 'user');
    hostile.AddItem({ Kind: 'shape', Shape: 'rect', X: 200, Y: 0, W: 100, H: 60, Label: `"><img src=x onerror=alert(2)>`, Sub: `Tom & Jerry's` }, 'user');
    hostile.AddItem({ Kind: 'image', X: 0, Y: 200, Name: `<b>bold.png</b>` }, 'agent');
    hostile.AddItem({ Kind: 'highlight', X: 200, Y: 200, W: 50, H: 50, Label: '<svg onload=alert(3)>' }, 'agent');

    const out = BuildWhiteboardExportHtml(hostile, {
      Title: '<script>title</script>',
      AgentName: `A&B "Agent"`,
      GeneratedAt: '<now>'
    });

    // no ACTIVE markup survives — tag openers are what make injected text dangerous
    // (the literal `onerror=` substring remains as inert escaped TEXT, with no tag to host it)
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<svg onload');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('&quot;&gt;&lt;img src=x onerror=alert(2)&gt;');
    expect(out).toContain('Tom &amp; Jerry&#39;s');
    expect(out).toContain('&lt;b&gt;bold.png&lt;/b&gt;');
    expect(out).toContain('A&amp;B &quot;Agent&quot;');
    expect(out).toContain('&lt;now&gt;');
  });

  it('is deterministic given the same state and GeneratedAt', () => {
    expect(BuildWhiteboardExportHtml(state, OPTS)).toBe(BuildWhiteboardExportHtml(state, OPTS));
  });

  it('includes paper-friendly @media print rules and page margins', () => {
    expect(html).toContain('@media print');
    expect(html).toContain('box-shadow: none !important');
    expect(html).toContain('@page { margin: 12mm; }');
  });

  it('renders an explicit empty-board note when the board has no items', () => {
    const out = BuildWhiteboardExportHtml(new WhiteboardState(), OPTS);
    expect(out).toContain('This whiteboard is empty.');
    expect(out).toContain('0 elements');
  });
});

describe('BuildWhiteboardExportSvg', () => {
  it('produces a standalone SVG document covering every item kind', () => {
    const state = buildFullBoard();
    const svg = BuildWhiteboardExportSvg(state);

    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('Sticky idea');                 // sticky text
    expect(svg).toContain('<ellipse');                    // ellipse shape geometry
    expect(svg).toContain('Pipeline');                    // shape label
    expect(svg).toContain('Free label');                  // text item
    expect(svg).toContain('roadmap.png');                 // image placeholder
    expect(svg).toContain('<polyline points=');           // ink
    expect(svg).toContain('marker-end="url(#wb-arrow)"'); // connector
    expect(svg).toContain('stroke-dasharray');            // highlight outline
  });

  it('escapes text content and reflects text-style fields', () => {
    const state = new WhiteboardState();
    state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: '<script>alert(1)</script>', FontSize: 32, FontWeight: 700 }, 'user');
    const svg = BuildWhiteboardExportSvg(state);

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).toContain('font-size="32"');
    expect(svg).toContain('font-weight="700"');
  });

  it('is deterministic for the same state', () => {
    const state = buildFullBoard();
    expect(BuildWhiteboardExportSvg(state)).toBe(BuildWhiteboardExportSvg(state));
  });
});
