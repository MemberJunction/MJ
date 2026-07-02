import { MarkedExtension, Token, Tokens } from 'marked';

/**
 * Creates a marked extension that repairs HTML blocks split by a blank line.
 *
 * Raw HTML embedded in markdown (e.g. a Skip PRD "## Mockup" section) is meant
 * to be a single HTML block, but CommonMark ends an HTML block at the first
 * blank line. Any following indented (4+ space) markup is then tokenized as an
 * indented code block and rendered as escaped text — a "black box" of raw
 * markup instead of the intended HTML.
 *
 * This hook detects that case in the token stream and reclassifies the
 * misparsed code token back to an html token so it renders. To stay precise it
 * only fires when the code token is ALL of:
 *   - an indented code block (no `lang` → not a fenced ``` example),
 *   - whose content starts with an HTML tag or comment, and
 *   - directly adjacent to an `html` token (the signature of a split block).
 * Prose, fenced code examples, and standalone indented code are left untouched.
 */
export function createHtmlBlockRepairExtension(): MarkedExtension {
  const looksLikeHtml = (text: string): boolean => /^\s*<\/?[a-zA-Z!]/.test(text || '');
  return {
    hooks: {
      processAllTokens(tokens: Token[]): Token[] {
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          if (token.type !== 'code') continue;
          const code = token as Tokens.Code;
          if (code.lang || !looksLikeHtml(code.text)) continue;

          const prev = tokens[i - 1];
          const next = tokens[i + 1];
          if (prev?.type === 'html' || next?.type === 'html') {
            // Reclassify as a raw HTML block so the html renderer emits it verbatim.
            const html: Tokens.HTML = { type: 'html', raw: code.raw, pre: false, text: code.text, block: true };
            tokens[i] = html;
          }
        }
        return tokens;
      }
    }
  };
}
