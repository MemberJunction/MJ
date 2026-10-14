import { MarkedExtension, Tokens } from 'marked';
import { EscapeHtml } from '../helpers/escape.js';

/**
 * The custom token emitted for a TeX math span or block.
 *
 * The framework-agnostic hand-off: the HTML path renders it as a `code.mj-math`
 * placeholder holding the TeX source (typeset later in the browser, see
 * `MarkdownService.RenderMath` in ng-markdown), and a native renderer can read
 * {@link text} directly or show it as-is.
 */
export interface MathToken extends Tokens.Generic {
  /** `mathBlock` for a block on its own lines, `math` for a span inside a paragraph. */
  type: 'math' | 'mathBlock';
  /** The original matched markdown source, delimiters included. */
  raw: string;
  /** The TeX source between the delimiters, trimmed. */
  text: string;
  /** Display style (`$$…$$`, `\[…\]`) rather than inline style (`$…$`, `\(…\)`). */
  displayMode: boolean;
}

/**
 * The token for MathML written as markup, such as a formula carried over from a JATS article.
 * `text` is the markup with namespace prefixes removed (`<mml:mi>` becomes `<mi>`): the HTML parser
 * only recognizes unprefixed MathML and treats `<mml:math>` as an unknown element.
 */
export interface MathMLToken extends Tokens.Generic {
  /** `mathmlBlock` for an element on its own lines, `mathml` for one inside a paragraph. */
  type: 'mathml' | 'mathmlBlock';
  /** The original matched markdown source. */
  raw: string;
  /** The MathML markup, prefixes removed. */
  text: string;
  /** `display="block"` on the `<math>` element. */
  displayMode: boolean;
}

// A whole <math> element, optionally namespace-prefixed (JATS writes <mml:math>), matched as one
// piece so markdown never reaches inside it: pretty-printed MathML is indented and spans lines, which
// markdown would turn into code blocks, and `*` or `_` between its tags would become emphasis. Tag
// names are case-insensitive, as in HTML; `<math-field>` and the like are not math. Neither the open
// tag nor the content can run into another opener, so an unclosed one fails at the next instead of
// scanning on (attributes without a closing `>` made that quadratic). An inline element never contains
// a backtick, so an opener can't swallow a later code span.
const OPENER = String.raw`<(?:[A-Za-z][\w.-]*:)?math(?=[\s/>])`;
const OPEN_TAG = String.raw`<(?<prefix>(?:[A-Za-z][\w.-]*:)?)math(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>`;
const CLOSE_TAG = String.raw`<\/\k<prefix>math\s*>`;
const MATHML_INLINE_RULE = new RegExp('^' + OPEN_TAG + '(?:(?!' + OPENER + ')[^`])*?' + CLOSE_TAG, 'i');
// A block is a `display="block"` element on its own lines, or any element that is a whole paragraph
// (`tail` then holds a blank line). An inline element at the start of a line inside a sentence stays
// in the sentence.
const MATHML_BLOCK_RULE = new RegExp(
  String.raw`^ {0,3}(?<markup>` + OPEN_TAG + String.raw`(?:(?!` + OPENER + String.raw`)[\s\S])*?` + CLOSE_TAG +
    String.raw`)(?<tail>[ \t]*(?:\n(?:[ \t]*\n)*|$))`,
  'i',
);
const MATHML_OPENER = new RegExp(OPENER, 'i');
// How far the inline `start()` looks ahead for an opener. marked calls it at every inline step, so
// searching the whole rest of the message made parsing quadratic in its length. A formula further on
// is still found: inline text stops at `<`, and `start()` runs again from there.
const MATHML_INLINE_LOOKAHEAD = 2000;

function matchMathML(src: string, rule: RegExp, type: MathMLToken['type']): MathMLToken | undefined {
  const match = rule.exec(src);
  if (!match) return undefined;
  const text = (match.groups?.markup ?? match[0]).trim().replace(/<(\/?)[A-Za-z][\w.-]*:(?=[A-Za-z])/g, '<$1');
  const displayMode = /^<math(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*?\sdisplay\s*=\s*["']?block/i.test(text);
  if (type === 'mathmlBlock' && !displayMode) {
    const tail = match.groups?.tail ?? '';
    const wholeParagraph = (tail.match(/\n/g) ?? []).length >= 2 || match[0].length === src.length;
    if (!wholeParagraph) return undefined;
  }
  return { type, raw: match[0], text, displayMode };
}

// Content runs: a backslash always takes the next character with it, so an escaped delimiter
// (`\$`) never closes. A run can't contain its own opening or closing delimiter, so two formulas on
// one line stay two formulas, and an unclosed opener fails at the next opener instead of scanning
// the rest of the document (which made long documents quadratic). Inline runs also never contain a
// backtick: TeX has no use for one, and without that rule a price could pair with a `$` inside a
// later code span ("$10 per seat, see `$x`") and swallow the code span.
interface MathRule {
  rule: RegExp;
  displayMode: boolean;
  /** `\[…\]` / `\(…\)`, which markdown also uses for escaped brackets; see {@link looksLikeTex}. */
  backslash: boolean;
}

const BLOCK_RULES: MathRule[] = [
  { rule: /^ {0,3}\$\$(?!\$)((?:\\[\s\S]|(?!\$\$)[^\\])+?)\$\$[ \t]*(?:\n+|$)/, displayMode: true, backslash: false },
  { rule: /^ {0,3}\\\[((?:\\(?![[\]])[\s\S]|[^\\])+?)\\\][ \t]*(?:\n+|$)/, displayMode: true, backslash: true },
];

const INLINE_RULES: MathRule[] = [
  // `$$` next to a third `$` is a price tier ("$$, $$$"), not math.
  { rule: /^\$\$(?!\$)((?:\\[^`]|(?!\$\$)[^\\`])+?)\$\$(?!\$)/, displayMode: true, backslash: false },
  { rule: /^\\\[((?:\\(?![[\]`])[\s\S]|[^\\`])+?)\\\]/, displayMode: true, backslash: true },
  { rule: /^\\\(((?:\\(?![()`])[\s\S]|[^\\`])+?)\\\)/, displayMode: false, backslash: true },
  // Single dollars follow Pandoc's rule so prices stay prices: the opening `$` is not followed by
  // a space, the closing `$` is not preceded by one and not followed by a digit, and the span
  // stays on one line. "$5 and $10" and "$5-$10" are not math; "$x^2$" is.
  { rule: /^\$(?![\s$])((?:\\[^\n`]|[^\\$\n`])+?)(?<!\s)\$(?!\d)/, displayMode: false, backslash: false },
];

/**
 * `\[…\]` and `\(…\)` are also markdown's escaped brackets: HTML-to-markdown converters write a
 * citation as "\[1\]" and a link-less "[Edit]" as "\[Edit\]". Those delimiters count as math only
 * around something that reads as TeX: a command, script, brace or relation, or a single letter
 * ("\( n \)").
 */
function looksLikeTex(text: string): boolean {
  return /[\\^_{}=+<>|]/.test(text) || /^\p{L}$/u.test(text);
}

function matchMath(src: string, rules: MathRule[], type: MathToken['type']): MathToken | undefined {
  for (const { rule, displayMode, backslash } of rules) {
    const match = rule.exec(src);
    if (!match) continue;
    const text = match[1].trim();
    if (text && (!backslash || looksLikeTex(text))) {
      return { type, raw: match[0], text, displayMode };
    }
  }
  return undefined;
}

function renderPlaceholder(token: MathToken): string {
  // A <code> element on purpose: smartypants skips <code>, so quotes and dashes in the TeX
  // (f'(x), a--b) reach the typesetter unchanged, and until it runs (or if it can't) the
  // reader sees the source styled as code rather than as stray prose.
  const display = token.displayMode ? ' mj-math-display' : '';
  return `<code class="mj-math${display}">${EscapeHtml(token.text)}</code>`;
}

/**
 * Creates a marked extension that recognizes math: TeX the way language models write it,
 * `$…$` and `\(…\)` inline, `$$…$$` and `\[…\]` for display math (on their own lines or
 * inside a paragraph), and MathML markup.
 *
 * The extension only tokenizes. Typesetting needs a math engine, which this
 * framework-agnostic package doesn't carry, so the HTML path emits a placeholder:
 *
 * ```html
 * <code class="mj-math">x^2</code>                                         <!-- inline -->
 * <div class="mj-math-block"><code class="mj-math mj-math-display">…</code></div>  <!-- block -->
 * ```
 *
 * MathML markup (`<math>…</math>`, or `<mml:math>` as JATS articles write it) is matched as one
 * element and emitted with its namespace prefixes removed. Like any raw HTML in markdown it is passed
 * through as markup, and the host's sanitizer decides what survives (ng-markdown's allows MathML).
 *
 * Recognizing the math up front also protects it from the rest of the markdown grammar:
 * `a_i` and `b_j` in one formula no longer turn into emphasis, and `*` is no longer bold.
 * Math inside code spans and fences is left alone, `\$` is a literal dollar sign, and an escaped
 * bracket ("\[1\]") stays a bracket.
 */
export function CreateMathExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: 'mathBlock',
        level: 'block',
        start(src: string) {
          // Only where a block really matches, so a line that merely starts with "$$x$$ is"
          // doesn't cut its paragraph in two. marked asks this to cut the current paragraph,
          // which ends at the first blank line anyway, so candidates past it are never looked at
          // (scanning the whole rest of the document on every paragraph was quadratic).
          const paragraphEnd = src.search(/\n[ \t]*\n/);
          const scope = paragraphEnd === -1 ? src : src.slice(0, paragraphEnd + 1);
          const candidates = /^ {0,3}(?:\$\$|\\\[)/gm;
          let found: RegExpExecArray | null;
          while ((found = candidates.exec(scope)) !== null) {
            if (matchMath(src.slice(found.index), BLOCK_RULES, 'mathBlock')) return found.index;
          }
          return undefined;
        },
        tokenizer(src: string) {
          return matchMath(src, BLOCK_RULES, 'mathBlock');
        },
        renderer(token) {
          return `<div class="mj-math-block">${renderPlaceholder(token as MathToken)}</div>\n`;
        },
      },
      {
        name: 'math',
        level: 'inline',
        start(src: string) {
          // A `$` right after a letter, digit or backslash never opens math ("US$5", "\$"),
          // so it is not offered as a starting point at all.
          const candidates = /\$|\\[([]/g;
          let found: RegExpExecArray | null;
          while ((found = candidates.exec(src)) !== null) {
            const before = found.index > 0 ? src[found.index - 1] : '';
            if (found[0] === '$' && /[\p{L}\p{N}\\]/u.test(before)) continue;
            return found.index;
          }
          return undefined;
        },
        tokenizer(src: string) {
          return matchMath(src, INLINE_RULES, 'math');
        },
        renderer(token) {
          return renderPlaceholder(token as MathToken);
        },
      },
      {
        name: 'mathmlBlock',
        level: 'block',
        start(src: string) {
          // Same paragraph-bounded search as mathBlock above, and only a display element may cut
          // the paragraph: an inline formula that starts a line belongs to its sentence.
          const paragraphEnd = src.search(/\n[ \t]*\n/);
          const scope = paragraphEnd === -1 ? src : src.slice(0, paragraphEnd + 1);
          const candidates = new RegExp(`^ {0,3}${MATHML_OPENER.source}`, 'gim');
          let found: RegExpExecArray | null;
          while ((found = candidates.exec(scope)) !== null) {
            if (matchMathML(src.slice(found.index), MATHML_BLOCK_RULE, 'mathmlBlock')?.displayMode) return found.index;
          }
          return undefined;
        },
        tokenizer(src: string) {
          return matchMathML(src, MATHML_BLOCK_RULE, 'mathmlBlock');
        },
        renderer(token) {
          const mathml = token as MathMLToken;
          return mathml.displayMode ? `<div class="mj-math-block">${mathml.text}</div>\n` : `<p>${mathml.text}</p>\n`;
        },
      },
      {
        name: 'mathml',
        level: 'inline',
        start(src: string) {
          const index = src.slice(0, MATHML_INLINE_LOOKAHEAD).search(MATHML_OPENER);
          return index === -1 ? undefined : index;
        },
        tokenizer(src: string) {
          return matchMathML(src, MATHML_INLINE_RULE, 'mathml');
        },
        renderer(token) {
          // A display formula inside a sentence (JATS puts them mid-paragraph) gets the block
          // wrapper too, as a span, so a wide one scrolls instead of widening the message.
          const mathml = token as MathMLToken;
          return mathml.displayMode ? `<span class="mj-math-block">${mathml.text}</span>` : mathml.text;
        },
      },
    ],
  };
}
