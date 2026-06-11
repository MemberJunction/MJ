import { describe, it, expect, beforeEach } from 'vitest';
import {
  WhiteboardChange, WhiteboardHtmlItem, WhiteboardMarkdownItem, WhiteboardState, WhiteboardStickyItem, WhiteboardTextItem
} from '../lib/whiteboard-state';
import {
  ApplyWhiteboardAgentTool, WHITEBOARD_HTML_MAX_CHARS, WHITEBOARD_MARKDOWN_MAX_CHARS,
  WHITEBOARD_TOOL_DEFINITIONS, WHITEBOARD_TOOL_NAMES, WhiteboardToolResult
} from '../lib/whiteboard-tools';
import {
  BuildWhiteboardExportHtml, BuildWhiteboardExportSvg, RenderMarkdownInert, WhiteboardExportOptions
} from '../lib/whiteboard-export';

/**
 * RICH WIDGETS — markdown panels + sandboxed HTML widgets: engine support (bounds,
 * journal fragments, compact perception projection, JSON round-trip), the
 * AddMarkdown / AddHtml / UpdateContent agent tools (validation, size caps, kind-vs-field
 * checks, undo batching), the inert export renderer, and export escaping for both kinds.
 */

const OPTS: WhiteboardExportOptions = {
  Title: 'Rich Board',
  AgentName: 'Sage',
  GeneratedAt: '2026-06-11, 8:00 AM'
};

function parseResult(json: string): WhiteboardToolResult {
  return JSON.parse(json) as WhiteboardToolResult;
}

describe('WhiteboardState — markdown / html item kinds', () => {
  let state: WhiteboardState;
  let changes: WhiteboardChange[];

  beforeEach(() => {
    state = new WhiteboardState();
    changes = [];
    state.Changed$.subscribe((c) => changes.push(c));
  });

  it('adds a markdown panel with engine-stamped identity and W-required bounds', () => {
    const md = state.AddItem({ Kind: 'markdown', X: 40, Y: 60, W: 300, Markdown: '## Plan\n\n- step one' }, 'user') as WhiteboardMarkdownItem;
    expect(md.ID).toBe('markdown-1');
    expect(md.Author).toBe('user');
    const b = state.ItemBounds(md);
    expect(b).toMatchObject({ X: 40, Y: 60, W: 300 });
    expect(b.H).toBeGreaterThan(0); // content-driven estimate when H omitted
  });

  it('honors an explicit max height (H) in markdown bounds', () => {
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 180, Markdown: 'x' }, 'agent') as WhiteboardMarkdownItem;
    expect(state.ItemBounds(md)).toEqual({ X: 0, Y: 0, W: 280, H: 180 });
  });

  it('adds an html widget with full W+H bounds and moves like a positioned item', () => {
    const widget = state.AddItem({ Kind: 'html', X: 10, Y: 20, W: 360, H: 240, Html: '<p>hi</p>', Title: 'Demo' }, 'agent') as WhiteboardHtmlItem;
    expect(widget.ID).toBe('html-1');
    expect(state.ItemBounds(widget)).toEqual({ X: 10, Y: 20, W: 360, H: 240 });
    state.MoveItem(widget.ID, 200, 300, 'user');
    expect(state.ItemBounds(state.GetItem(widget.ID) as WhiteboardHtmlItem)).toMatchObject({ X: 200, Y: 300 });
  });

  it('resizes both kinds through UpdateItem and supports undo', () => {
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: 'note' }, 'user');
    const widget = state.AddItem({ Kind: 'html', X: 0, Y: 300, W: 360, H: 240, Html: '<p>w</p>' }, 'user');
    state.UpdateItem(md.ID, { W: 420 }, 'user');
    state.UpdateItem(widget.ID, { W: 500, H: 320 }, 'user');
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).W).toBe(420);
    expect(state.ItemBounds(state.GetItem(widget.ID) as WhiteboardHtmlItem)).toMatchObject({ W: 500, H: 320 });
    state.Undo();
    expect(state.ItemBounds(state.GetItem(widget.ID) as WhiteboardHtmlItem)).toMatchObject({ W: 360, H: 240 });
  });

  it('emits human journal fragments for both kinds', () => {
    state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: '## Key risks for Q3' }, 'agent');
    state.AddItem({ Kind: 'html', X: 0, Y: 0, W: 360, H: 240, Html: '<p>x</p>', Title: 'Burn-down chart' }, 'agent');
    expect(changes[0].SummaryFragment).toContain('a markdown panel');
    expect(changes[0].SummaryFragment).toContain('Key risks');
    expect(changes[1].SummaryFragment).toContain('an HTML widget');
    expect(changes[1].SummaryFragment).toContain('Burn-down chart');
  });

  describe('compact perception projection', () => {
    it('projects the markdown panel as clipped SOURCE + dims (the agent must SEE the content)', () => {
      const long = '# Heading\n' + 'lorem ipsum dolor '.repeat(30);
      state.AddItem({ Kind: 'markdown', X: 12, Y: 34, W: 300, H: 220, Markdown: long }, 'user');
      const summary = state.BuildSceneSummary();
      const c = summary.items[0];
      expect(c.type).toBe('markdown');
      expect(c).toMatchObject({ x: 12, y: 34, w: 300, h: 220 });
      expect(c.text).toContain('# Heading');
      expect(c.text!.length).toBeLessThanOrEqual(201); // ~200 chars + ellipsis
      expect(c.text!.endsWith('…')).toBe(true);
    });

    it('projects the html widget as title + clipped source + dims', () => {
      const html = '<!doctype html><html><body><h1>Hello</h1>' + '<p>filler</p>'.repeat(40) + '</body></html>';
      state.AddItem({ Kind: 'html', X: 5, Y: 6, W: 360, H: 240, Html: html, Title: 'Hello widget' }, 'agent');
      const c = state.BuildSceneSummary().items[0];
      expect(c.type).toBe('html');
      expect(c).toMatchObject({ x: 5, y: 6, w: 360, h: 240, name: 'Hello widget', author: 'agent' });
      expect(c.text).toContain('<!doctype html>');
      expect(c.text!.length).toBeLessThanOrEqual(201);
    });

    it('flows both kinds through coalesced scene deltas', () => {
      const token = state.CurrentSeq;
      const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: 'v1' }, 'agent');
      state.UpdateItem(md.ID, { Markdown: 'v2 content' }, 'agent');
      const delta = state.BuildSceneDelta(token);
      expect(delta.added).toHaveLength(1);
      expect(delta.added[0].text).toBe('v2 content'); // add+update coalesces to current state
    });
  });

  describe('ToJSON / FromJSON round-trip', () => {
    it('round-trips markdown and html items losslessly', () => {
      state.AddItem({ Kind: 'markdown', X: 1, Y: 2, W: 280, H: 200, Markdown: '## Persist\n\n- `code` & **bold**' }, 'user');
      state.AddItem({ Kind: 'html', X: 3, Y: 4, W: 360, H: 240, Html: '<script>let x = 1;</script>', Title: 'Widget' }, 'agent');
      const restored = WhiteboardState.FromJSON(state.ToJSON());
      expect(restored.Items).toEqual(state.Items);
      expect((restored.GetItem('markdown-1') as WhiteboardMarkdownItem).Markdown).toContain('**bold**');
      expect((restored.GetItem('html-2') as WhiteboardHtmlItem).Html).toBe('<script>let x = 1;</script>');
    });

    it('remains ADDITIVE — old payloads without the new kinds still parse', () => {
      const old = new WhiteboardState();
      old.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'legacy' }, 'user');
      const restored = WhiteboardState.FromJSON(old.ToJSON());
      expect(restored.ElementCount).toBe(1);
      // and the restored engine accepts the new kinds afterwards
      const md = restored.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: 'new' }, 'user');
      expect(restored.GetItem(md.ID)).toBeTruthy();
    });
  });
});

describe('Whiteboard_AddMarkdown', () => {
  let state: WhiteboardState;

  beforeEach(() => {
    state = new WhiteboardState();
  });

  it('adds an agent-authored markdown panel with explicit geometry', () => {
    const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddMarkdown,
      JSON.stringify({ markdown: '## Findings\n\n- one\n- two', x: 100, y: 80, w: 320, h: 260 })));
    expect(result.success).toBe(true);
    const item = state.GetItem(result.itemId as string) as WhiteboardMarkdownItem;
    expect(item.Kind).toBe('markdown');
    expect(item.Author).toBe('agent');
    expect(item).toMatchObject({ X: 100, Y: 80, W: 320, H: 260 });
    expect(item.Markdown).toContain('## Findings');
  });

  it('auto-places and defaults width when geometry is omitted', () => {
    const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddMarkdown,
      JSON.stringify({ markdown: 'note' })));
    expect(result.success).toBe(true);
    const item = state.GetItem(result.itemId as string) as WhiteboardMarkdownItem;
    expect(item.W).toBe(280);
    expect(item.H).toBeUndefined(); // content-driven height
  });

  it('clamps out-of-range w/h instead of failing', () => {
    const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddMarkdown,
      JSON.stringify({ markdown: 'x', w: 5000, h: 1 })));
    expect(result.success).toBe(true);
    const item = state.GetItem(result.itemId as string) as WhiteboardMarkdownItem;
    expect(item.W).toBe(800);
    expect(item.H).toBe(80);
  });

  it('rejects missing markdown and oversize sources', () => {
    const missing = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddMarkdown, '{}'));
    expect(missing.success).toBe(false);
    expect(missing.error).toContain('markdown');

    const oversize = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddMarkdown,
      JSON.stringify({ markdown: 'a'.repeat(WHITEBOARD_MARKDOWN_MAX_CHARS + 1) })));
    expect(oversize.success).toBe(false);
    expect(oversize.error).toContain(`${WHITEBOARD_MARKDOWN_MAX_CHARS}`);
    expect(state.Items).toHaveLength(0); // nothing mutated
  });

  it('runs as ONE agent-authored undo batch', () => {
    const authors: string[] = [];
    state.Changed$.subscribe((c) => authors.push(c.Author));
    ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddMarkdown, '{"markdown":"m"}');
    expect(authors).toEqual(['agent']);
    state.Undo();
    expect(state.Items).toHaveLength(0);
  });
});

describe('Whiteboard_AddHtml', () => {
  let state: WhiteboardState;

  beforeEach(() => {
    state = new WhiteboardState();
  });

  it('adds an agent-authored html widget with title + geometry defaults', () => {
    const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddHtml,
      JSON.stringify({ html: '<!doctype html><p>chart</p>', title: 'Mini chart' })));
    expect(result.success).toBe(true);
    expect(result.summary).toContain('sandboxed');
    const item = state.GetItem(result.itemId as string) as WhiteboardHtmlItem;
    expect(item.Kind).toBe('html');
    expect(item.Author).toBe('agent');
    expect(item.Title).toBe('Mini chart');
    expect(item.W).toBe(360);
    expect(item.H).toBe(240);
  });

  it('rejects missing html and oversize sources', () => {
    const missing = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddHtml, '{"title":"no source"}'));
    expect(missing.success).toBe(false);
    expect(missing.error).toContain('html');

    const oversize = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddHtml,
      JSON.stringify({ html: 'a'.repeat(WHITEBOARD_HTML_MAX_CHARS + 1) })));
    expect(oversize.success).toBe(false);
    expect(oversize.error).toContain(`${WHITEBOARD_HTML_MAX_CHARS}`);
    expect(state.Items).toHaveLength(0);
  });

  it('clamps geometry into the allowed ranges', () => {
    const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddHtml,
      JSON.stringify({ html: '<p>x</p>', w: 10, h: 9000 })));
    expect(result.success).toBe(true);
    const item = state.GetItem(result.itemId as string) as WhiteboardHtmlItem;
    expect(item.W).toBe(200);
    expect(item.H).toBe(800);
  });
});

describe('Whiteboard_UpdateContent', () => {
  let state: WhiteboardState;
  let md: WhiteboardMarkdownItem;
  let widget: WhiteboardHtmlItem;
  let sticky: WhiteboardStickyItem;
  let label: WhiteboardTextItem;

  beforeEach(() => {
    state = new WhiteboardState();
    md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: 'v1' }, 'agent') as WhiteboardMarkdownItem;
    widget = state.AddItem({ Kind: 'html', X: 0, Y: 300, W: 360, H: 240, Html: '<p>v1</p>', Title: 'T1' }, 'agent') as WhiteboardHtmlItem;
    sticky = state.AddItem({ Kind: 'sticky', X: 400, Y: 0, Text: 'old note' }, 'user') as WhiteboardStickyItem;
    label = state.AddItem({ Kind: 'text', X: 400, Y: 200, Text: 'old label' }, 'user') as WhiteboardTextItem;
  });

  it('replaces markdown panel content', () => {
    const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: md.ID, markdown: '## v2' })));
    expect(result.success).toBe(true);
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).Markdown).toBe('## v2');
  });

  it('replaces html widget source and/or title (iframe re-render path)', () => {
    const both = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: widget.ID, html: '<p>v2</p>', title: 'T2' })));
    expect(both.success).toBe(true);
    const after = state.GetItem(widget.ID) as WhiteboardHtmlItem;
    expect(after.Html).toBe('<p>v2</p>');
    expect(after.Title).toBe('T2');

    const titleOnly = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: widget.ID, title: 'T3' })));
    expect(titleOnly.success).toBe(true);
    expect((state.GetItem(widget.ID) as WhiteboardHtmlItem).Title).toBe('T3');
  });

  it('replaces sticky and text-label content via "text"', () => {
    expect(parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: sticky.ID, text: 'new note' }))).success).toBe(true);
    expect((state.GetItem(sticky.ID) as WhiteboardStickyItem).Text).toBe('new note');

    expect(parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: label.ID, text: 'new label' }))).success).toBe(true);
    expect((state.GetItem(label.ID) as WhiteboardTextItem).Text).toBe('new label');
  });

  it('validates kind-vs-field strictly', () => {
    const mdOnSticky = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: sticky.ID, markdown: '# nope' })));
    expect(mdOnSticky.success).toBe(false);
    expect(mdOnSticky.error).toContain('markdown panels');

    const htmlOnMd = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: md.ID, html: '<p>nope</p>' })));
    expect(htmlOnMd.success).toBe(false);
    expect(htmlOnMd.error).toContain('HTML widgets');

    const textOnHtml = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: widget.ID, text: 'nope' })));
    expect(textOnHtml.success).toBe(false);
    expect(textOnHtml.error).toContain('sticky notes');

    // nothing mutated by any rejection
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).Markdown).toBe('v1');
    expect((state.GetItem(widget.ID) as WhiteboardHtmlItem).Html).toBe('<p>v1</p>');
  });

  it('rejects missing/unknown ids, no content field, multiple content fields and oversize', () => {
    const noId = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent, '{"markdown":"x"}'));
    expect(noId.success).toBe(false);
    expect(noId.error).toContain('itemId');

    const unknown = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      '{"itemId":"markdown-99","markdown":"x"}'));
    expect(unknown.success).toBe(false);
    expect(unknown.error).toContain('markdown-99');

    const empty = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: md.ID })));
    expect(empty.success).toBe(false);

    const multi = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: md.ID, markdown: 'a', text: 'b' })));
    expect(multi.success).toBe(false);
    expect(multi.error).toContain('exactly ONE');

    const oversize = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: md.ID, markdown: 'a'.repeat(WHITEBOARD_MARKDOWN_MAX_CHARS + 1) })));
    expect(oversize.success).toBe(false);

    const oversizeHtml = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: widget.ID, html: 'a'.repeat(WHITEBOARD_HTML_MAX_CHARS + 1) })));
    expect(oversizeHtml.success).toBe(false);
  });

  it('runs as ONE agent-authored update (single undo step)', () => {
    const ops: string[] = [];
    const authors: string[] = [];
    state.Changed$.subscribe((c) => { ops.push(c.Op); authors.push(c.Author); });
    ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.UpdateContent,
      JSON.stringify({ itemId: md.ID, markdown: '## v2' }));
    expect(ops).toEqual(['update']);
    expect(authors).toEqual(['agent']);
    state.Undo();
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).Markdown).toBe('v1');
  });
});

describe('tool definitions for the new tools', () => {
  it('registers AddMarkdown / AddHtml / UpdateContent with schemas and security notes', () => {
    const byName = new Map(WHITEBOARD_TOOL_DEFINITIONS.map((d) => [d.Name, d]));
    const addMd = byName.get(WHITEBOARD_TOOL_NAMES.AddMarkdown)!;
    const addHtml = byName.get(WHITEBOARD_TOOL_NAMES.AddHtml)!;
    const update = byName.get(WHITEBOARD_TOOL_NAMES.UpdateContent)!;
    expect(addMd.ParametersSchema['required']).toEqual(['markdown']);
    expect(addHtml.ParametersSchema['required']).toEqual(['html']);
    expect(update.ParametersSchema['required']).toEqual(['itemId']);
    // the security contract rides in the descriptions the model reads
    expect(addHtml.Description.toLowerCase()).toContain('sandbox');
    expect(addHtml.Description.toLowerCase()).toContain('network');
    expect(addMd.Description.toLowerCase()).toContain('sanitiz');
  });
});

describe('RenderMarkdownInert (export-only minimal renderer)', () => {
  it('renders headings, lists, bold, italic, inline code and paragraphs', () => {
    const html = RenderMarkdownInert('# Title\n\n## Sub\n\nplain **bold** and *ital* and `code`\n\n- a\n- b\n\n1. one\n2. two');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Sub</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>ital</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>');
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>');
    expect(html).toContain('<p>');
  });

  it('renders fenced code blocks verbatim (escaped) without inline formatting', () => {
    const html = RenderMarkdownInert('```\nconst x = a < b && c > d; // **not bold**\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('a &lt; b &amp;&amp; c &gt; d');
    expect(html).toContain('**not bold**'); // inline formats do NOT apply inside fences
    expect(html).not.toContain('<strong>');
  });

  it('allows only http(s)/mailto links — javascript: stays inert text', () => {
    const good = RenderMarkdownInert('[docs](https://example.com/a?b=1)');
    expect(good).toContain('<a href="https://example.com/a?b=1" rel="noopener noreferrer">docs</a>');
    const bad = RenderMarkdownInert('[evil](javascript:alert(1))');
    expect(bad).not.toContain('<a ');
    expect(bad).toContain('[evil](javascript:alert(1))');
  });

  it('is escape-FIRST: raw HTML in the source can never become live markup', () => {
    const html = RenderMarkdownInert('# Hi <script>alert(1)</script>\n\n<img src=x onerror=alert(2)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
  });
});

describe('exports — markdown panels + html widgets', () => {
  let state: WhiteboardState;

  beforeEach(() => {
    state = new WhiteboardState();
    state.AddItem({
      Kind: 'markdown', X: 20, Y: 30, W: 300, H: 240,
      Markdown: '## Roadmap\n\n- **ship** v1\n- [site](https://example.com)'
    }, 'agent');
    state.AddItem({
      Kind: 'html', X: 400, Y: 30, W: 360, H: 240,
      Html: '<!doctype html><body><script>draw();</script><h1>Chart</h1></body>',
      Title: 'Funnel chart'
    }, 'user');
  });

  it('renders markdown items as FORMATTED content in the HTML export', () => {
    const html = BuildWhiteboardExportHtml(state, OPTS);
    expect(html).toContain('<h2>Roadmap</h2>');
    expect(html).toContain('<strong>ship</strong>');
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">site</a>');
    expect(html).toContain('class="it md"');
  });

  it('exports html widgets as a placeholder card — NEVER live HTML', () => {
    const html = BuildWhiteboardExportHtml(state, OPTS);
    expect(html).toContain('Funnel chart');
    expect(html).toContain('Interactive HTML widget');
    expect(html).toContain('<details class="htmlw-src">');
    // the widget's script arrives ONLY as escaped text inside the <details> source view
    expect(html).not.toContain('<script>draw();</script>');
    expect(html).toContain('&lt;script&gt;draw();&lt;/script&gt;');
    expect(html).not.toContain('<h1>Chart</h1>');
    expect(html).toContain('&lt;h1&gt;Chart&lt;/h1&gt;');
  });

  it('keeps script-injection in markdown source inert in the export', () => {
    const hostile = new WhiteboardState();
    hostile.AddItem({
      Kind: 'markdown', X: 0, Y: 0, W: 280,
      Markdown: '# T\n\n<script>alert(1)</script>\n\n[x](javascript:alert(2))'
    }, 'user');
    hostile.AddItem({ Kind: 'html', X: 0, Y: 300, W: 360, H: 200, Html: '"><svg onload=alert(3)>', Title: '<b>t</b>' }, 'user');
    const out = BuildWhiteboardExportHtml(hostile, OPTS);
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<svg onload');
    expect(out).not.toContain('href="javascript:');
    expect(out).not.toContain('<b>t</b>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('&lt;b&gt;t&lt;/b&gt;');
  });

  it('renders simple labeled rects for both kinds in the SVG export (escaped)', () => {
    const svg = BuildWhiteboardExportSvg(state);
    expect(svg).toContain('markdown panel');
    expect(svg).toContain('## Roadmap');           // first markdown line as the label
    expect(svg).toContain('Funnel chart');
    expect(svg).toContain('interactive HTML widget');
    expect(svg).not.toContain('<script>');         // widget source is NOT in the SVG at all

    const hostile = new WhiteboardState();
    hostile.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: '<script>x</script>' }, 'user');
    hostile.AddItem({ Kind: 'html', X: 0, Y: 300, W: 300, H: 200, Html: '<p>x</p>', Title: '<script>t</script>' }, 'user');
    const hostileSvg = BuildWhiteboardExportSvg(hostile);
    expect(hostileSvg).not.toContain('<script>');
    expect(hostileSvg).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(hostileSvg).toContain('&lt;script&gt;t&lt;/script&gt;');
  });

  it('export stays deterministic with the new kinds', () => {
    expect(BuildWhiteboardExportHtml(state, OPTS)).toBe(BuildWhiteboardExportHtml(state, OPTS));
    expect(BuildWhiteboardExportSvg(state)).toBe(BuildWhiteboardExportSvg(state));
  });
});
