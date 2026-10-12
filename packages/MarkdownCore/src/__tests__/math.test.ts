import { describe, it, expect } from 'vitest';
import type { Token, TokensList } from 'marked';
import { MarkdownEngine } from '../engine/markdown-engine.js';
import type { MathToken } from '../extensions/math.extension.js';

const html = (markdown: string): string => new MarkdownEngine().ParseToHtml(markdown);

/** The TeX of every math placeholder in the HTML, decoded, in order. */
const mathIn = (output: string): string[] =>
  [...output.matchAll(/<code class="mj-math(?: mj-math-display)?">([\s\S]*?)<\/code>/g)].map((m) =>
    m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));

describe('math extension: what counts as math', () => {
  it.each([
    ['$x^2$', 'x^2'],
    ['Energy is $E = mc^2$.', 'E = mc^2'],
    ['\\(a + b\\)', 'a + b'],
    ['the $10$ apples', '10'],
    ['a dollar inside: $\\$5 + x$', '\\$5 + x'],
  ])('inline %j', (markdown, tex) => {
    const out = html(markdown);
    expect(mathIn(out)).toEqual([tex]);
    expect(out).not.toContain('mj-math-display');
  });

  it.each([
    ['$$\n\\frac{a}{b}\n$$', '\\frac{a}{b}'],
    ['\\[\n\\sum_{i=1}^{n} i\n\\]', '\\sum_{i=1}^{n} i'],
    ['$$ \\int_0^\\infty e^{-x}\\,dx $$', '\\int_0^\\infty e^{-x}\\,dx'],
  ])('display block %j', (markdown, tex) => {
    const out = html(markdown);
    expect(mathIn(out)).toEqual([tex]);
    expect(out).toContain('<div class="mj-math-block"><code class="mj-math mj-math-display">');
    expect(out).not.toContain('<p>');
  });

  it('display math inside a paragraph stays in the paragraph', () => {
    const out = html('so $$x = 1$$ and \\[y = 2\\] hold');
    expect(mathIn(out)).toEqual(['x = 1', 'y = 2']);
    expect(out).toMatch(/^<p>so <code class="mj-math mj-math-display">/);
  });

  it('two formulas on one line stay two formulas', () => {
    expect(mathIn(html('$a$ and $b$'))).toEqual(['a', 'b']);
    expect(mathIn(html('$$a$$ and $$b$$'))).toEqual(['a', 'b']);
    expect(mathIn(html('\\[a\\] and \\[b\\]'))).toEqual(['a', 'b']);
  });

  it('a block keeps multi-line TeX intact, including a blank line and markdown-looking lines', () => {
    const tex = '\\begin{aligned}\na &= b \\\\\n\n- c &= d\n# e &= f\n\\end{aligned}';
    expect(mathIn(html(`$$\n${tex}\n$$`))).toEqual([tex]);
  });

  it('a TeX line break followed by a bracket does not close \\[…\\] early', () => {
    expect(mathIn(html('\\[a \\\\[2pt] b\\]'))).toEqual(['a \\\\[2pt] b']);
  });
});

describe('math extension: what must stay text', () => {
  it.each([
    'It costs $5 and $10.',
    'between $5-$10 per seat',
    'from $1,000–$2,000',
    'US$5 or US$10',
    'Revenue was $5M, up from $3M.',
    'cell $A$1 in the sheet',
    'just $ signs $ with spaces',
    'an escaped \\$5 and \\$6',
    'a lone $ sign',
    '$$ $$',
  ])('%j', (markdown) => {
    expect(html(markdown)).not.toContain('mj-math');
  });

  it('escaped brackets stay brackets (HTML-to-markdown converters write citations this way)', () => {
    const out = html('France.\\[1\\] It has \\[citation needed\\] museums. \\(not math\\)\n\n\\[Edit\\]\n\nnext');
    expect(out).not.toContain('mj-math');
    expect(out).toContain('France.[1] It has [citation needed] museums. (not math)');
    expect(out).toContain('<p>[Edit]</p>');
  });

  it('backslash delimiters still take a lone letter, the way models write a variable', () => {
    expect(mathIn(html('where \\( n \\) is the index and \\(\\lambda\\) the wavelength'))).toEqual(['n', '\\lambda']);
  });

  it('price tiers are not display math', () => {
    expect(html('Restaurant A: $$, Restaurant B: $$$.')).not.toContain('mj-math');
  });

  it('math syntax inside code spans and fences is code, not math', () => {
    const out = html('`$x^2$` and\n\n```\n$$y$$\n```');
    expect(out).not.toContain('mj-math');
    expect(out).toContain('<code>$x^2$</code>');
  });

  it('a price never pairs with a dollar inside a later code span', () => {
    const out = html('or $5-$10 per seat. Code stays code: `$x^2$`, and `\\(y\\)` too.');
    expect(out).not.toContain('mj-math');
    expect(out).toContain('<code>$x^2$</code>');
  });

  it('a single-dollar span does not cross a line', () => {
    expect(html('pay $5\nthen x$ later')).not.toContain('mj-math');
  });

  it('a line that only starts with $$ does not split its paragraph', () => {
    const out = html('first line\n$$x$$ is the value');
    expect(out.match(/<p>/g)).toHaveLength(1);
    expect(mathIn(out)).toEqual(['x']);
  });
});

describe('math extension: the TeX reaches the renderer unchanged', () => {
  it('underscores and asterisks are not emphasis', () => {
    const out = html('$\\sum_{i=1}^n x_i$ and $a*b*c$');
    expect(out).not.toContain('<em>');
    expect(out).not.toContain('<strong>');
    expect(mathIn(out)).toEqual(['\\sum_{i=1}^n x_i', 'a*b*c']);
  });

  it('smartypants leaves quotes, dashes and dots alone', () => {
    const out = html("Then $f'(x) -- g''(x) ... \"y\"$ holds -- yes.");
    expect(mathIn(out)).toEqual(["f'(x) -- g''(x) ... \"y\""]);
    expect(out).toContain('holds &#8211; yes'); // prose around it still gets smartypants
  });

  it('HTML in the TeX is escaped, not emitted', () => {
    const out = html('$a<b><img src=x onerror=alert(1)>$');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b>');
    expect(mathIn(out)).toEqual(['a<b><img src=x onerror=alert(1)>']);
  });
});

describe('math extension: cost', () => {
  // An unclosed opener used to scan to the end of the document from every candidate, so these took
  // seconds (2000 lines: ~5s) and chat re-parses on every streamed chunk.
  it.each([
    ['unclosed \\[ blocks', '\\[ x\n\n'.repeat(2000)],
    ['unclosed \\( spans', 'text \\( a b c\n\n'.repeat(2000)],
    ['unclosed $$ blocks', '$$ x\n\n'.repeat(2000)],
  ])('%s stay linear', (_name, markdown) => {
    const started = performance.now();
    html(markdown);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('math extension: config and tokens', () => {
  it('is off when enableMath is false', () => {
    const engine = new MarkdownEngine();
    engine.ConfigureMarked({ enableMath: false });
    const out = engine.ParseToHtml('$x^2$ and $$y$$');
    expect(out).not.toContain('mj-math');
    expect(out).toContain('$x^2$');
  });

  it('the token path carries the TeX and the display mode', () => {
    const tokens: TokensList = new MarkdownEngine().ParseToTokens('$$\na^2\n$$\n\ninline $b$');
    const block = tokens.find((t: Token) => t.type === 'mathBlock') as MathToken;
    expect(block).toMatchObject({ text: 'a^2', displayMode: true });
    const paragraph = tokens.find((t: Token) => t.type === 'paragraph') as Token & { tokens: Token[] };
    const inline = paragraph.tokens.find((t) => t.type === 'math') as MathToken;
    expect(inline).toMatchObject({ text: 'b', displayMode: false });
  });
});
