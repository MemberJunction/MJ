import { describe, it, expect } from 'vitest';
import { MarkdownEngine } from '../engine/markdown-engine.js';

/**
 * `normalizeHtmlBlockIndentation` (the `enableHtml` string pass) drops blank
 * lines while an HTML element is still open.
 *
 * Why: a blank line ends an HTML block in CommonMark, and the markup after it is
 * re-tokenized according to its indentation — 4+ spaces becomes an indented code
 * block (which html-block-repair rescues), 0-3 spaces becomes a paragraph
 * rendered as `<p>…<br>…</p>`. Because this pass strips indentation, the
 * paragraph case is what arises. `<p>` and `<br>` sit on the HTML5
 * foreign-content breakout list, so inside an `<svg>` the browser leaves the SVG
 * namespace and auto-closes the chart: every later `<text>` renders as bare
 * document text and every `<path>`/`<circle>`/`<rect>` renders as nothing.
 *
 * Regression fixture: Skip PRD "## Mockup" sections, whose SVG charts separate
 * gridlines, axis labels and the plot with blank lines for readability.
 */

/** Engine with the `enableHtml` normalization pass active. */
function htmlEngine(): MarkdownEngine {
  const engine = new MarkdownEngine();
  engine.configureMarked({ enableHtml: true });
  return engine;
}

/** True when a `<p>`/`<br>` lands between an `<svg>` and its close — the breakout signature. */
function svgIsBrokenBy(html: string): boolean {
  const open = html.indexOf('<svg');
  if (open < 0) return false;
  const close = html.indexOf('</svg>', open);
  return /<p>|<br>/.test(html.slice(open, close > open ? close : html.length));
}

/** A mockup-shaped SVG whose children are split by a blank line, at a given indent. */
function svgMockup(indent: string): string {
  return [
    '<div style="border:3px solid #4a90d9">',
    `${indent}<svg width="100%" height="180" viewBox="0 0 700 180">`,
    `${indent}<line x1="50" y1="20" x2="670" y2="20" stroke="#f1f5f9" />`,
    '',
    `${indent}<text x="35" y="24" font-size="10" fill="#94a3b8">600</text>`,
    `${indent}</svg>`,
    '</div>',
    ''
  ].join('\n');
}

describe('normalizeHtmlBlockIndentation — blank lines inside an open HTML block', () => {
  for (const [label, indent] of [
    ['unindented', ''],
    ['2-space indented', '  '],
    ['4-space indented', '    '],
    ['8-space indented', '        ']
  ] as const) {
    it(`keeps an ${label} SVG intact across a blank line`, () => {
      const html = htmlEngine().parseToHtml(svgMockup(indent));

      expect(svgIsBrokenBy(html)).toBe(false);
      // The shapes after the blank line must still be inside the SVG, not escaped
      // and not stranded in a paragraph.
      expect(html).toContain('<text x="35" y="24" font-size="10" fill="#94a3b8">600</text>');
      expect(html).not.toContain('&lt;text');
      expect(html).not.toMatch(/<\/svg>\s*<p>/);
    });
  }

  it('does not merge sibling top-level blocks separated by a blank line', () => {
    // The blank line here sits between two *closed* blocks. Swallowing it would
    // fuse them into a single HTML block.
    const html = htmlEngine().parseToHtml('<div>a</div>\n\n<div>b</div>\n');

    expect(html.match(/<div>/g)).toHaveLength(2);
  });

  it('does not swallow a blank line inside a nested <pre>, where whitespace is content', () => {
    const html = htmlEngine().parseToHtml('<div>\n<pre>\nline1\n\nline2\n</pre>\n</div>\n');

    // The blank line survives the normalization pass. How marked then renders a
    // blank line inside an HTML block is its own long-standing behaviour and is
    // deliberately left alone here — the point is that this pass must not delete
    // the line, because inside <pre> it is content rather than layout.
    expect(html).toMatch(/line1\n\s*\n/);
  });

  it('still renders markdown in a paragraph that follows a closed HTML block', () => {
    // Guards against over-reach: this paragraph is not inside an open element, so
    // it must keep being parsed as markdown rather than emitted as raw HTML.
    const html = htmlEngine().parseToHtml('<div>x</div>\n\n<span>has **bold** inside</span>\n');

    expect(html).toContain('<strong>bold</strong>');
  });

  it('leaves a fenced html example escaped', () => {
    const html = htmlEngine().parseToHtml('<div>x</div>\n\n```html\n<div>example</div>\n```\n');

    expect(html).toContain('&lt;div&gt;example&lt;/div&gt;');
  });

  it('is inert when enableHtml is false (normalization does not run)', () => {
    // The pass is gated on enableHtml; with it off the markdown is untouched by
    // this transform and the token-level repair extension is the only defence.
    const engine = new MarkdownEngine();
    const html = engine.parseToHtml('<div>a</div>\n\n<div>b</div>\n');

    expect(html.match(/<div>/g)).toHaveLength(2);
  });
});
