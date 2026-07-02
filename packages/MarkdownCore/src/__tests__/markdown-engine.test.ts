import { describe, it, expect, vi } from 'vitest';
import type { Tokens } from 'marked';
import { MarkdownEngine } from '../engine/markdown-engine';
import type { SvgCodeBlockToken } from '../extensions/svg-renderer.extension';

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
});
