import { describe, it, expect } from 'vitest';
import {
  BuildWhiteboardExportHtml,
  BuildWhiteboardExportHtmlAllPages,
  BuildWhiteboardExportSvg,
  WhiteboardExportOptions
} from '../lib/whiteboard-export';
import { WHITEBOARD_PEN_COLORS, WhiteboardInkItem, WhiteboardState, WhiteboardStickyItem, WhiteboardTextItem } from '../lib/whiteboard-state';

/**
 * HOSTILE SHARED BOARDS (CodeQL #366 / #367, issue #5569) — board JSON is shared between
 * users, so the closed-set item fields (`Author`, `FontWeight`, `FontFamily`) must never
 * reach the exported HTML/SVG as raw text, and must be coerced when a board is loaded.
 */

const OPTS: WhiteboardExportOptions = { Title: 'Board', AgentName: 'Sage', GeneratedAt: '2026-06-10' };

const HOSTILE_AUTHOR = 'x"><img src=x onerror=alert(1)>';
const HOSTILE_WEIGHT = '700;"><img src=x onerror=alert(2)>';
const HOSTILE_FAMILY = '__proto__';

/** A board whose live items carry hostile closed-set fields (bypasses load-time coercion). */
function buildHostileState(): WhiteboardState {
  const state = new WhiteboardState();
  const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'note' }, 'user');
  const text = state.AddItem({ Kind: 'text', X: 200, Y: 0, Text: 'label' }, 'user');
  Object.assign(state.GetItem(sticky.ID)!, { Author: HOSTILE_AUTHOR, FontWeight: HOSTILE_WEIGHT, FontFamily: HOSTILE_FAMILY });
  Object.assign(state.GetItem(text.ID)!, { Author: HOSTILE_AUTHOR, FontWeight: HOSTILE_WEIGHT });
  return state;
}

function expectNoInjection(output: string): void {
  expect(output).not.toContain('<img');
  expect(output).not.toContain('onerror');
  expect(output).not.toContain('chip--x');
  expect(output).not.toContain('[object Object]');
}

describe('export with hostile item fields', () => {
  it('HTML export emits only closed-set chip classes and validated font weights', () => {
    const html = BuildWhiteboardExportHtml(buildHostileState(), OPTS);
    expectNoInjection(html);
    expect(html).toContain('class="chip chip--user"');
    expect(html).not.toContain('font-weight:700;"');
    expect(html).not.toMatch(/style="[^"]*font-weight:/);
  });

  it('all-pages HTML export is guarded the same way', () => {
    // the all-pages builder rehydrates through FromJSON, so hostile values are coerced on load
    expectNoInjection(BuildWhiteboardExportHtmlAllPages(buildHostileState(), OPTS));
  });

  it('SVG export falls back to the default weight and font stack', () => {
    const svg = BuildWhiteboardExportSvg(buildHostileState());
    expectNoInjection(svg);
    expect(svg).toContain('font-weight="400"');
  });

  it('valid fields still render unchanged', () => {
    const state = new WhiteboardState();
    state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'bold', FontWeight: 700, FontFamily: 'mono' }, 'agent');
    const html = BuildWhiteboardExportHtml(state, OPTS);
    expect(html).toContain('class="chip chip--agent"');
    expect(html).toContain('font-weight:700');
    expect(html).toContain('font-family:ui-monospace');
  });
});

describe('FromJSON coerces hostile persisted items', () => {
  const hostileItems = [
    { ID: 'sticky-1', Kind: 'sticky', X: 0, Y: 0, Text: 'a', Z: 1, Author: HOSTILE_AUTHOR, FontWeight: HOSTILE_WEIGHT, FontFamily: HOSTILE_FAMILY },
    { ID: 'text-2', Kind: 'text', X: 0, Y: 0, Text: 'b', Z: 2, Author: 'agent', FontWeight: 700, FontFamily: 'serif' },
    null,
    'not-an-item'
  ];

  it('paged shape: Author coerced, invalid FontWeight / FontFamily dropped, valid kept', () => {
    const json = JSON.stringify({ version: 2, activePageId: 'page-1', pages: [{ id: 'page-1', name: 'P', items: hostileItems }] });
    const state = WhiteboardState.FromJSON(json);
    const hostile = state.GetItem('sticky-1') as WhiteboardStickyItem;
    expect(hostile.Author).toBe('user');
    expect(hostile.FontWeight).toBeUndefined();
    expect(hostile.FontFamily).toBeUndefined();
    const valid = state.GetItem('text-2') as WhiteboardTextItem;
    expect(valid.Author).toBe('agent');
    expect(valid.FontWeight).toBe(700);
    expect(valid.FontFamily).toBe('serif');
    expect(state.Items).toHaveLength(2);
    expectNoInjection(BuildWhiteboardExportHtml(state, OPTS));
  });

  it('legacy flat shape is coerced the same way', () => {
    const state = WhiteboardState.FromJSON(JSON.stringify({ version: 1, items: hostileItems }));
    const hostile = state.GetItem('sticky-1') as WhiteboardStickyItem;
    expect(hostile.Author).toBe('user');
    expect(hostile.FontWeight).toBeUndefined();
    expect(hostile.FontFamily).toBeUndefined();
  });
});

describe('item Color is a hex color on load and on export (#5595, #6189)', () => {
  const HOSTILE_COLORS = ['red;background:url(https://example.invalid/t)', 'url(https://example.invalid/t)', 'var(--x)', 'rgb(1,2,3)', '#12345', 42];

  function boardJson(color: unknown): string {
    const items = [
      { ID: 'text-1', Kind: 'text', X: 0, Y: 0, Text: 't', Z: 1, Author: 'user', Color: color },
      { ID: 'ink-2', Kind: 'ink', X: 0, Y: 0, Z: 2, Author: 'user', Points: [{ X: 0, Y: 0 }, { X: 10, Y: 10 }], StrokeWidth: 4, Color: color }
    ];
    return JSON.stringify({ version: 2, activePageId: 'page-1', pages: [{ id: 'page-1', name: 'P', items }] });
  }

  it.each(HOSTILE_COLORS)('load drops a text Color of %j and defaults ink to the first pen color', (color) => {
    const state = WhiteboardState.FromJSON(boardJson(color));
    expect((state.GetItem('text-1') as WhiteboardTextItem).Color).toBeUndefined();
    expect((state.GetItem('ink-2') as WhiteboardInkItem).Color).toBe(WHITEBOARD_PEN_COLORS[0]);
  });

  it.each(['#abc', '#a1b2c3', '#A1B2C3'])('load keeps the hex color %s', (color) => {
    const state = WhiteboardState.FromJSON(boardJson(color));
    expect((state.GetItem('text-1') as WhiteboardTextItem).Color).toBe(color);
    expect((state.GetItem('ink-2') as WhiteboardInkItem).Color).toBe(color);
  });

  it('ink with no Color gets the first pen color', () => {
    const state = WhiteboardState.FromJSON(boardJson(undefined));
    expect((state.GetItem('ink-2') as WhiteboardInkItem).Color).toBe(WHITEBOARD_PEN_COLORS[0]);
  });

  it('HTML and SVG exports of live state with a hostile Color contain no url( or extra declarations', () => {
    const state = new WhiteboardState();
    const text = state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'label' }, 'user');
    const ink = state.AddItem({ Kind: 'ink', X: 0, Y: 0, Points: [{ X: 0, Y: 0 }, { X: 5, Y: 5 }], StrokeWidth: 3, Color: '#abc' }, 'user');
    Object.assign(state.GetItem(text.ID)!, { Color: HOSTILE_COLORS[0] });
    Object.assign(state.GetItem(ink.ID)!, { Color: HOSTILE_COLORS[1] });
    for (const output of [BuildWhiteboardExportHtml(state, OPTS), BuildWhiteboardExportSvg(state)]) {
      expect(output).not.toContain('url(');
      expect(output).not.toContain('example.invalid');
      expect(output).not.toContain('background:url');
    }
  });

  it('a hex Color still reaches the exports', () => {
    const state = new WhiteboardState();
    state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'label', Color: '#4ade80' }, 'user');
    state.AddItem({ Kind: 'ink', X: 0, Y: 0, Points: [{ X: 0, Y: 0 }, { X: 5, Y: 5 }], StrokeWidth: 3, Color: '#fbbf24' }, 'user');
    expect(BuildWhiteboardExportHtml(state, OPTS)).toContain('color:#4ade80;');
    const svg = BuildWhiteboardExportSvg(state);
    expect(svg).toContain('fill="#4ade80"');
    expect(svg).toContain('stroke="#fbbf24"');
  });
});
