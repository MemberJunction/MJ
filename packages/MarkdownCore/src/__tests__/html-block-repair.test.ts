import { describe, it, expect } from 'vitest';
import type { Token, Tokens } from 'marked';
import { createHtmlBlockRepairExtension } from '../extensions/html-block-repair.extension';
import { MarkdownEngine } from '../engine/markdown-engine';

/**
 * Direct access to the extension's `processAllTokens` hook. The hook does not
 * use `this`, so invoking it standalone is safe and lets us assert the exact
 * reclassification rule against hand-crafted token streams (deterministic, no
 * dependency on how marked happens to tokenize a given markdown fixture).
 */
function getHook(): (tokens: Token[]) => Token[] {
  const ext = createHtmlBlockRepairExtension();
  const hook = ext.hooks?.processAllTokens;
  expect(hook).toBeTypeOf('function');
  return hook as (tokens: Token[]) => Token[];
}

/** An indented code block token (no lang) — the shape marked emits for 4-space HTML. */
function codeToken(text: string, lang = ''): Tokens.Code {
  return { type: 'code', raw: text, text, lang, codeBlockStyle: 'indented' } as Tokens.Code;
}

/** A raw HTML block token. */
function htmlToken(text: string): Tokens.HTML {
  return { type: 'html', raw: text, text, pre: false, block: true } as Tokens.HTML;
}

/** A prose paragraph token (a non-html neighbor). */
function paragraphToken(text: string): Tokens.Paragraph {
  return { type: 'paragraph', raw: text, text, tokens: [] } as Tokens.Paragraph;
}

describe('createHtmlBlockRepairExtension — processAllTokens rule', () => {
  it('reclassifies an html-looking code token when the PREVIOUS token is html', () => {
    const tokens: Token[] = [htmlToken('<div>'), codeToken('<span>hi</span>')];
    const out = getHook()(tokens);
    expect(out[1].type).toBe('html');
  });

  it('reclassifies an html-looking code token when the NEXT token is html', () => {
    const tokens: Token[] = [codeToken('<span>hi</span>'), htmlToken('</div>')];
    const out = getHook()(tokens);
    expect(out[0].type).toBe('html');
  });

  it('preserves raw/text and sets block=true, pre=false on the reclassified token', () => {
    const tokens: Token[] = [htmlToken('<div>'), codeToken('<span>hi</span>')];
    const out = getHook()(tokens);
    const repaired = out[1] as Tokens.HTML;
    expect(repaired.type).toBe('html');
    expect(repaired.text).toBe('<span>hi</span>');
    expect(repaired.raw).toBe('<span>hi</span>');
    expect(repaired.block).toBe(true);
    expect(repaired.pre).toBe(false);
  });

  it('reclassifies an HTML comment code token adjacent to html', () => {
    // looksLikeHtml matches "<!" so comments qualify.
    const tokens: Token[] = [htmlToken('<div>'), codeToken('<!-- a mockup note -->')];
    const out = getHook()(tokens);
    expect(out[1].type).toBe('html');
  });

  it('reclassifies a closing-tag code token adjacent to html', () => {
    const tokens: Token[] = [htmlToken('<section>'), codeToken('</section>')];
    const out = getHook()(tokens);
    expect(out[1].type).toBe('html');
  });

  it('does NOT fire for prose-looking indented code (does not start with a tag)', () => {
    const tokens: Token[] = [htmlToken('<div>'), codeToken('const x = 1; // not html')];
    const out = getHook()(tokens);
    expect(out[1].type).toBe('code');
  });

  it('does NOT fire for fenced code that has a language, even adjacent to html', () => {
    const tokens: Token[] = [htmlToken('<div>'), codeToken('<span>hi</span>', 'html')];
    const out = getHook()(tokens);
    // A fenced ```html example is an intentional code sample — leave it alone.
    expect(out[1].type).toBe('code');
  });

  it('does NOT fire for standalone html-looking indented code NOT adjacent to any html token', () => {
    const tokens: Token[] = [paragraphToken('intro'), codeToken('<span>hi</span>'), paragraphToken('outro')];
    const out = getHook()(tokens);
    expect(out[1].type).toBe('code');
  });

  it('does NOT fire when the code text is empty or whitespace-only', () => {
    const tokens: Token[] = [htmlToken('<div>'), codeToken('   \n  '), htmlToken('</div>')];
    const out = getHook()(tokens);
    expect(out[1].type).toBe('code');
  });

  it('leaves html and non-code tokens untouched', () => {
    const tokens: Token[] = [htmlToken('<div>'), paragraphToken('hi'), htmlToken('</div>')];
    const out = getHook()(tokens);
    expect(out.map(t => t.type)).toEqual(['html', 'paragraph', 'html']);
  });

  it('reclassifies only the html-adjacent code tokens in a mixed stream', () => {
    const tokens: Token[] = [
      codeToken('const a = 1;'),      // [0] prose-ish code, isolated → stays code
      paragraphToken('x'),            // [1]
      htmlToken('<div>'),             // [2]
      codeToken('<b>bold</b>'),       // [3] adjacent to html[2] → repaired
      htmlToken('</div>'),            // [4]
      paragraphToken('y'),            // [5]
      codeToken('<i>iso</i>'),        // [6] html-looking but NOT adjacent to html → stays code
      paragraphToken('z'),            // [7]
    ];
    const out = getHook()(tokens);
    expect(out[0].type).toBe('code');
    expect(out[3].type).toBe('html');
    expect(out[6].type).toBe('code');
  });

  it('returns an empty array unchanged', () => {
    expect(getHook()([])).toEqual([]);
  });

  it('handles a single code token with no neighbors (no throw, no change)', () => {
    const tokens: Token[] = [codeToken('<span>alone</span>')];
    const out = getHook()(tokens);
    expect(out[0].type).toBe('code');
  });
});

// The repair hook (`processAllTokens`) runs on marked's PARSE pipeline (the HTML
// output path), not on a bare `lexer()` call — so these integration assertions go
// through `parseToHtml`. Note the repair fires regardless of `enableHtml`; only the
// separate `normalizeHtmlBlockIndentation` string pass is gated on `enableHtml`.
describe('html-block-repair integration via MarkdownEngine.parseToHtml', () => {
  it('repairs a split HTML block so indented markup renders as raw HTML, not an escaped code block', () => {
    const engine = new MarkdownEngine();
    // `<div ...>` is an html block that ends at the blank line; the following
    // 4-space-indented markup would tokenize as an indented code block. The repair
    // extension reclassifies it because it is adjacent to the html token.
    const html = engine.parseToHtml('<div class="mockup">\n\n    <button>Click</button>');
    expect(html).toContain('<button>Click</button>');
    expect(html).not.toContain('&lt;button&gt;');
  });

  it('repairs the split block even when enableHtml is false (repair is independent of normalization)', () => {
    const engine = new MarkdownEngine();
    // enableHtml defaults to false → normalizeHtmlBlockIndentation does NOT run,
    // but the token-level repair still reclassifies the split block on the HTML path.
    const html = engine.parseToHtml('<div>\n\n    <p>x</p>');
    expect(html).toContain('<p>x</p>');
    expect(html).not.toContain('&lt;p&gt;');
  });

  it('does not unwrap a real fenced code sample that merely contains HTML', () => {
    const engine = new MarkdownEngine();
    // A fenced ```html block has a language → it is an intentional code example
    // and stays escaped inside <pre><code>.
    const html = engine.parseToHtml('```html\n<span>example</span>\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('&lt;span&gt;');
  });

  it('does not reclassify standalone indented html-looking code with no adjacent html block', () => {
    const engine = new MarkdownEngine();
    // Indented code surrounded by prose (not an html block) → stays an escaped code block.
    const html = engine.parseToHtml('Intro paragraph.\n\n    <span>iso</span>\n\nOutro paragraph.');
    expect(html).toContain('&lt;span&gt;');
  });

  it('leaves prose untouched (no spurious raw HTML)', () => {
    const engine = new MarkdownEngine();
    const html = engine.parseToHtml('Just a normal paragraph of prose.');
    expect(html).toContain('<p>');
    expect(html).toContain('Just a normal paragraph of prose.');
  });

  it('handles empty and whitespace-only input without throwing', () => {
    const engine = new MarkdownEngine();
    expect(engine.parseToHtml('')).toBe('');
    expect(() => engine.parseToHtml('   \n\n   ')).not.toThrow();
  });
});
