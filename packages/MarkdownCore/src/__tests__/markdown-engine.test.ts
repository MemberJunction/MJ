import { describe, it, expect, vi } from 'vitest';
import type { Tokens } from 'marked';
import { MarkdownEngine } from '../engine/markdown-engine.js';
import type { SvgCodeBlockToken } from '../extensions/svg-renderer.extension.js';

describe('MarkdownEngine.parseToHtml', () => {
  it('renders a heading with a gfm id', () => {
    const engine = new MarkdownEngine();
    const html = engine.parseToHtml('# Hello World');
    expect(html).toContain('<h1');
    expect(html).toContain('id="hello-world"');
    expect(html).toContain('Hello World');
  });

  it('returns empty string for empty input', () => {
    const engine = new MarkdownEngine();
    expect(engine.parseToHtml('')).toBe('');
  });

  it('omits heading ids when enableHeadingIds is false', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableHeadingIds: false });
    const html = engine.parseToHtml('# No Id');
    expect(html).toContain('<h1');
    expect(html).not.toContain('id="no-id"');
  });

  it('calls the injected highlight function for fenced code', () => {
    const engine = new MarkdownEngine();
    const highlightFn = vi.fn((code: string, lang: string) => `HL:${lang}:${code}`);
    engine.configureMarked({ enableHighlight: true }, { highlightFn });
    const html = engine.parseToHtml('```js\nconst x = 1;\n```');
    expect(highlightFn).toHaveBeenCalled();
    expect(highlightFn.mock.calls[0][1]).toBe('js');
    expect(html).toContain('HL:js:');
    expect(html).toContain('language-js');
  });

  it('does not highlight when no highlight function is injected', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableHighlight: true });
    const html = engine.parseToHtml('```js\nconst x = 1;\n```');
    // Falls back to plain (escaped) code, no highlighter markup.
    expect(html).toContain('<pre>');
    expect(html).toContain('const x = 1;');
  });

  it('renders ```svg blocks as inline svg, not code', () => {
    const engine = new MarkdownEngine();
    const html = engine.parseToHtml('```svg\n<svg width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>\n```');
    expect(html).toContain('class="svg-rendered"');
    expect(html).toContain('<svg');
    expect(html).not.toContain('language-svg');
  });

  it('renders GitHub-style alerts when enabled', () => {
    const engine = new MarkdownEngine();
    const html = engine.parseToHtml('> [!NOTE]\n> Something to note');
    expect(html.toLowerCase()).toContain('markdown-alert');
  });

  it('wraps headings in collapsible sections when enabled', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableCollapsibleHeadings: true, collapsibleHeadingLevel: 2 });
    const html = engine.parseToHtml('## Section A\n\nBody A\n\n### Sub A1\n\nBody A1');
    expect(html).toContain('class="collapsible-section"');
    expect(html).toContain('collapsible-content');
    // The h3 section should be nested inside the h2 section's content, not a sibling.
    const h2Index = html.indexOf('data-level="2"');
    const h3Index = html.indexOf('data-level="3"');
    expect(h2Index).toBeGreaterThanOrEqual(0);
    expect(h3Index).toBeGreaterThan(h2Index);
  });

  it('preserves the injected highlighter across config overrides', () => {
    const engine = new MarkdownEngine();
    const highlightFn = vi.fn((code: string) => `HL:${code}`);
    engine.configureMarked({ enableHighlight: true }, { highlightFn });
    // parseToHtml with a config override re-runs configureMarked WITHOUT options;
    // the highlighter must survive.
    engine.parseToHtml('```js\na\n```', { headingIdPrefix: 'x-' });
    expect(highlightFn).toHaveBeenCalled();
  });

  it('escapes raw markdown without a DOM when parsing throws', () => {
    const engine = new MarkdownEngine();
    // Force a throw inside parse by stubbing the internal marked instance.
    const broken = engine as unknown as { marked: { parse: () => string } };
    const original = broken.marked.parse;
    broken.marked.parse = () => { throw new Error('boom'); };
    const html = engine.parseToHtml('<script>alert(1)</script>');
    expect(html).toContain('markdown-error');
    expect(html).toContain('&lt;script&gt;');
    broken.marked.parse = original;
  });
});

describe('MarkdownEngine.parseToTokens', () => {
  it('returns a heading token tree', () => {
    const engine = new MarkdownEngine();
    const tokens = engine.parseToTokens('# Title\n\nA paragraph.');
    const heading = tokens.find(t => t.type === 'heading') as Tokens.Heading | undefined;
    expect(heading).toBeDefined();
    expect(heading?.depth).toBe(1);
    const paragraph = tokens.find(t => t.type === 'paragraph');
    expect(paragraph).toBeDefined();
  });

  it('emits an svgCodeBlock token carrying the raw svg', () => {
    const engine = new MarkdownEngine();
    const tokens = engine.parseToTokens('```svg\n<svg viewBox="0 0 1 1"><rect/></svg>\n```');
    const svg = tokens.find(t => t.type === 'svgCodeBlock') as SvgCodeBlockToken | undefined;
    expect(svg).toBeDefined();
    expect(svg?.svgContent).toContain('<svg');
    expect(svg?.svgContent).toContain('<rect');
  });

  it('emits a code token with language for fenced code (no highlight applied)', () => {
    const engine = new MarkdownEngine();
    const tokens = engine.parseToTokens('```ts\nconst y: number = 2;\n```');
    const code = tokens.find(t => t.type === 'code') as Tokens.Code | undefined;
    expect(code).toBeDefined();
    expect(code?.lang).toBe('ts');
    expect(code?.text).toBe('const y: number = 2;');
  });

  it('returns an empty token list for empty input', () => {
    const engine = new MarkdownEngine();
    const tokens = engine.parseToTokens('');
    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens.length).toBe(0);
  });

  it('tokenizes a table into header + rows', () => {
    const engine = new MarkdownEngine();
    const tokens = engine.parseToTokens('| A | B |\n|---|---|\n| 1 | 2 |');
    const table = tokens.find(t => t.type === 'table') as Tokens.Table | undefined;
    expect(table).toBeDefined();
    expect(table?.header).toHaveLength(2);
    expect(table?.rows).toHaveLength(1);
  });
});

describe('MarkdownEngine config', () => {
  it('getConfig reflects merged overrides', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableHtml: true, headingIdPrefix: 'p-' });
    const cfg = engine.getConfig();
    expect(cfg.enableHtml).toBe(true);
    expect(cfg.headingIdPrefix).toBe('p-');
    // Untouched defaults remain.
    expect(cfg.enableAlerts).toBe(true);
  });

  it('resetConfig restores defaults', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableHtml: true });
    engine.resetConfig();
    expect(engine.getConfig().enableHtml).toBe(false);
  });

  it('populates the heading list after an HTML parse', () => {
    const engine = new MarkdownEngine();
    engine.parseToHtml('# One\n\n## Two');
    const headings = engine.getHeadingList();
    expect(headings.length).toBeGreaterThanOrEqual(2);
    expect(headings.some(h => h.id === 'one')).toBe(true);
  });

  it('applies a heading id prefix when configured', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableHeadingIds: true, headingIdPrefix: 'doc-' });
    const html = engine.parseToHtml('# Intro');
    expect(html).toContain('id="doc-intro"');
  });

  it('getConfig returns a copy, not the internal reference', () => {
    const engine = new MarkdownEngine();
    const a = engine.getConfig();
    a.enableHtml = true;
    // Mutating the returned object must not change the engine's config.
    expect(engine.getConfig().enableHtml).toBe(false);
  });
});

describe('MarkdownEngine feature toggles', () => {
  it('renders svg as a plain code block when enableSvgRenderer is false', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableSvgRenderer: false });
    const html = engine.parseToHtml('```svg\n<svg><circle/></svg>\n```');
    expect(html).not.toContain('class="svg-rendered"');
    expect(html).toContain('<pre>');
  });

  it('applies smartypants typography when enabled (default)', () => {
    const engine = new MarkdownEngine();
    const html = engine.parseToHtml('He said -- "hi" ...');
    // marked emits the typographic characters as numeric HTML entities.
    expect(html).toContain('&#8211;'); // en dash for --
    expect(html).toContain('&#8230;'); // ellipsis for ...
    expect(html).toContain('&#8220;'); // opening curly double-quote
    expect(html).not.toContain('--');
  });

  it('leaves typography as ASCII when smartypants is disabled', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableSmartypants: false });
    const html = engine.parseToHtml('He said -- "hi" ...');
    expect(html).toContain('--');
    expect(html).toContain('...');
    expect(html).not.toContain('–');
  });

  it('omits collapsible section wrappers when collapsible headings are off (default)', () => {
    const engine = new MarkdownEngine();
    const html = engine.parseToHtml('## Section\n\nbody');
    expect(html).not.toContain('collapsible-section');
  });

  it('honors autoExpandLevels through the engine config', () => {
    const engine = new MarkdownEngine();
    engine.configureMarked({
      enableCollapsibleHeadings: true,
      collapsibleHeadingLevel: 2,
      autoExpandLevels: [2]
    });
    const html = engine.parseToHtml('## A\n\np\n\n### B\n\nc');
    // h3 not in autoExpandLevels → its section carries the collapsed class.
    expect(html).toMatch(/collapsible-section collapsed" data-level="3"/);
  });
});

describe('MarkdownEngine HTML block indentation normalization', () => {
  // normalizeHtmlBlockIndentation only runs when enableHtml is true. It strips
  // leading whitespace from lines inside an HTML block so marked does not treat
  // 4-space-indented inner markup as an indented code block.
  const parse = (md: string): string => {
    const engine = new MarkdownEngine();
    engine.configureMarked({ enableHtml: true });
    return engine.parseToHtml(md);
  };

  it('renders indented nested HTML as HTML, not an escaped code block', () => {
    const html = parse('<div>\n    <p>indented</p>\n</div>');
    expect(html).toContain('<p>indented</p>');
    // Should not have been escaped into a code block.
    expect(html).not.toContain('&lt;p&gt;');
  });

  it('handles a self-closing tag line without leaving the block open', () => {
    const html = parse('<div>\n    <img src="x" />\n</div>\n\nAfter paragraph.');
    expect(html).toContain('<img');
    // Content after the closed div should render as a normal paragraph.
    expect(html).toContain('After paragraph.');
  });

  it('handles a tag that opens and closes on the same line', () => {
    const html = parse('<section>\n    <span>inline</span>\n</section>\n\nDone.');
    expect(html).toContain('<span>inline</span>');
    expect(html).toContain('Done.');
  });

  it('tracks nested same-name tags via the tag stack (pop only closes the block at depth 0)', () => {
    const md = '<div>\n    <div>\n        <p>deep</p>\n    </div>\n</div>\n\nTail.';
    const html = parse(md);
    expect(html).toContain('<p>deep</p>');
    // The block only ends after BOTH </div>s, so the trailing prose is a paragraph.
    expect(html).toContain('Tail.');
    expect(html).not.toContain('&lt;');
  });

  it('handles mixed indentation widths inside the block', () => {
    const md = '<ul>\n  <li>two spaces</li>\n      <li>six spaces</li>\n</ul>';
    const html = parse(md);
    expect(html).toContain('<li>two spaces</li>');
    expect(html).toContain('<li>six spaces</li>');
  });

  it('does not alter ordinary prose that is not inside an HTML block', () => {
    const html = parse('Just a sentence with a < less-than that is not a tag.');
    expect(html).toContain('less-than');
  });
});
