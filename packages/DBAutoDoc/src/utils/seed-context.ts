/**
 * The part of the operator's seed context (`seedContext.customInstructions`, which also holds the
 * text of `seedContext.file` / `files`) that is worth sending to a key-inference prompt.
 *
 * The table-analysis prompt gets the whole text. The PK/FK passes run once per table, so sending a
 * long data-layout document to each of them would multiply its cost by the table count. A
 * per-table pass gets only the paragraphs that name its table; a whole-schema pass gets the text.
 * Both are capped.
 */

/** Default cap on the seed text sent to one key-inference prompt, in characters. */
export const DEFAULT_SEED_KEY_PASS_MAX_CHARS = 6000;

/** The fields of a seed context this module reads; satisfied by both the config and state shapes. */
export interface SeedContextText {
  customInstructions?: string;
  keyPassMaxChars?: number;
}

/**
 * Returns the seed text for a key-inference prompt, or undefined when there is none to send.
 * @param seed the seed context from config or state
 * @param tableNames the tables the prompt is about; empty for a whole-schema prompt
 */
export function SeedContextExcerpt(seed: SeedContextText | undefined, tableNames: string[]): string | undefined {
  const text = seed?.customInstructions?.trim();
  const maxChars = seed?.keyPassMaxChars ?? DEFAULT_SEED_KEY_PASS_MAX_CHARS;
  if (!text || maxChars <= 0) {
    return undefined;
  }

  let excerpt = text;
  if (tableNames.length > 0) {
    const matchers = tableNames.map(name => new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(name)}([^A-Za-z0-9_]|$)`, 'i'));
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    const relevant = paragraphs.filter(p => matchers.some(m => m.test(p)));
    if (relevant.length === 0) {
      return undefined;
    }
    excerpt = relevant.join('\n\n');
  }

  return excerpt.length > maxChars ? `${excerpt.slice(0, maxChars)}\n…(truncated)` : excerpt;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
