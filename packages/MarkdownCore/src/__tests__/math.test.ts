import { describe, it, expect } from 'vitest';
import type { Token, TokensList } from 'marked';
import { MarkdownEngine } from '../engine/markdown-engine.js';
import type { MathToken, MathMLToken } from '../extensions/math.extension.js';

const html = (markdown: string): string => new MarkdownEngine().ParseToHtml(markdown);

/**
 * Budget for the "stay linear" cases. They take 100–200 ms locally but 1.3–1.5 s on a CI runner
 * under the full suite (the v6.2.0-edge.4 publish gate failed twice at 1 s, #5663). The quadratic
 * scans these cases guard against took ~5 s locally, so 3 s still catches them.
 */
const LINEAR_BUDGET_MS = 3000;

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

describe('math extension: MathML markup', () => {
  // Shaped like the JATS MathML in Optica's article XML: prefixed, pretty-printed, with comments.
  const jatsInline = '<mml:math display="inline">\n   <mml:mrow>\n      <mml:mn>7</mml:mn>\n   </mml:mrow>\n   <mml:mo>×<!-- × --></mml:mo>\n   <mml:msup>\n      <mml:mn>10</mml:mn>\n      <mml:mn>13</mml:mn>\n   </mml:msup>\n</mml:math>';
  const jatsBlock = '<mml:math display="block">\n  <mml:msub>\n    <mml:mi>τ</mml:mi>\n    <mml:mi>z</mml:mi>\n  </mml:msub>\n\n        <mml:mo>=</mml:mo>\n  <mml:mn>2</mml:mn>\n</mml:math>';

  it('a prefixed inline formula stays inside its sentence, prefixes removed', () => {
    const out = html(`Loss was ${jatsInline} per pulse.`);
    expect(out).toMatch(/^<p>Loss was <math display="inline">[\s\S]*<msup>[\s\S]*<\/math> per pulse\.<\/p>/);
    expect(out).not.toMatch(/mml:/);
  });

  // Correctness only: the bounded lookahead must not hide a formula past its window. marked calls
  // start() again further along, so this passes for any window size; the cost tests guard the bound.
  it('an inline formula past the opener lookahead window still renders', () => {
    const out = html(`${'plain words '.repeat(300)}then ${jatsInline} per pulse.`);
    expect(out).toMatch(/then <math display="inline">[\s\S]*<\/math> per pulse\.<\/p>/);
  });

  it('a pretty-printed display formula is one block, even across a blank line and deep indentation', () => {
    const out = html(`Before.\n\n${jatsBlock}\n\nAfter.`);
    expect(out).toContain('<div class="mj-math-block"><math display="block">');
    expect(out).not.toContain('<pre>');
    expect((out.match(/<math\b/g) ?? []).length).toBe(1);
    expect(out).toContain('<p>After.</p>');
  });

  it('an inline formula that starts a line stays in its sentence', () => {
    const out = html(`Loss was\n${jatsInline}\nper pulse.`);
    expect((out.match(/<p>/g) ?? []).length).toBe(1);
    expect(out).toMatch(/^<p>Loss was[\s\S]*<math display="inline">[\s\S]*<\/math>[\s\S]*per pulse\.<\/p>/);
  });

  it('a formula that is a whole paragraph stays one element across a blank line', () => {
    const out = html(`Before.\n\n<mml:math>\n  <mml:mi>a</mml:mi>\n\n      <mml:mi>b</mml:mi>\n</mml:math>\n\nAfter.`);
    expect(out).toMatch(/<p><math>\s*<mi>a<\/mi>\s*<mi>b<\/mi>\s*<\/math><\/p>/);
    expect(out).not.toContain('<pre>');
  });

  it('a display formula inside a sentence gets the scrolling wrapper', () => {
    expect(html('Then <math display="block"><mi>x</mi></math> holds.')).toContain('<span class="mj-math-block"><math display="block">');
  });

  it('tag names are case-insensitive, and <math-field> is not math', () => {
    expect(html('so <Math><mi>a</mi><mo>*</mo><mi>b</mi><mo>*</mo></Math> holds')).not.toContain('<em>');
    const tokens = new MarkdownEngine().ParseToTokens('a <math-field>x</math-field> and </math>');
    expect(JSON.stringify(tokens)).not.toContain('"mathml');
  });

  it('an opener never swallows a later code span', () => {
    expect(html('a <math> b `</math>` c')).toContain('<code>&lt;/math&gt;</code>');
  });

  it('markdown never reaches inside the markup', () => {
    const out = html('so <math><mi>a</mi><mo>*</mo><mi>b</mi><mo>*</mo><msub><mi>x</mi><mi>i_j</mi></msub></math> holds');
    expect(out).not.toContain('<em>');
    expect(out).toContain('<mi>i_j</mi>');
  });

  it('MathML shown as code stays code', () => {
    const out = html('JATS writes `<mml:math>` for formulas.');
    expect(out).toContain('<code>&lt;mml:math&gt;</code>');
    expect(out).not.toContain('<math');
  });

  it.each([
    ['unclosed elements', 'text <math><mi>x</mi> and more\n\n'.repeat(2000)],
    ['open tags with no closing >', 'x <math a'.repeat(30000)],
    ['prefixed open tags with no closing >', 'x <a.b-c:math '.repeat(20000)],
  ])('%s stay linear', (_name, markdown) => {
    const started = performance.now();
    html(markdown);
    expect(performance.now() - started).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('is off with the rest of math when enableMath is false', () => {
    const engine = new MarkdownEngine();
    engine.ConfigureMarked({ enableMath: false });
    expect(engine.ParseToHtml(`x ${jatsInline} y`)).not.toContain('<math');
  });

  it('the token path carries the unprefixed markup and the display mode', () => {
    const tokens: TokensList = new MarkdownEngine().ParseToTokens(jatsBlock);
    const block = tokens.find((t: Token) => t.type === 'mathmlBlock') as MathMLToken;
    expect(block.displayMode).toBe(true);
    expect(block.text).toMatch(/^<math display="block">[\s\S]*<\/math>$/);
    expect(block.text).not.toContain('mml:');
  });
});

describe('math extension: cost', () => {
  // An unclosed opener used to scan to the end of the document from every candidate, so these took
  // seconds (2000 lines: ~5s) and chat re-parses on every streamed chunk.
  it.each([
    ['unclosed \\[ blocks', '\\[ x\n\n'.repeat(2000)],
    ['unclosed \\( spans', 'text \\( a b c\n\n'.repeat(2000)],
    ['unclosed $$ blocks', '$$ x\n\n'.repeat(2000)],
    // The inline MathML start() searched the whole rest of the message at every inline step.
    ['300 KB of "$a " amounts', '$a '.repeat(100_000)],
    ['200 KB of "a_b " identifiers', 'a_b '.repeat(50_000)],
  ])('%s stay linear', (_name, markdown) => {
    const started = performance.now();
    html(markdown);
    expect(performance.now() - started).toBeLessThan(LINEAR_BUDGET_MS);
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
