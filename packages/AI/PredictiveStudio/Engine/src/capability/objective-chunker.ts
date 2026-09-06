/**
 * @module capability/objective-chunker
 *
 * Cutting a strategy document into the things it says the organization wants to do.
 *
 * Deliberately **deterministic** — no LLM. A capability diagnosis is something a client acts on, and
 * one that chunked differently on each run would produce a different set of gaps each time it was
 * shown. Reproducibility is worth more here than the extra nuance an LLM pass would add, and the
 * rules below are ones a person can check by reading their own document.
 *
 * The rules:
 *  - a bullet or numbered item is one objective;
 *  - a paragraph is split into sentences, because *"We will grow membership 10% and improve
 *    retention"* is two objectives and answering it as one hides whichever half is uncovered;
 *  - a heading becomes the `Section` of everything under it rather than an objective of its own —
 *    "Membership Growth" is a topic, not something you can be measured against;
 *  - fragments too short to carry meaning are dropped, since embedding "Q3" matches everything and
 *    nothing.
 */

/** One thing the document says the organization wants to do. */
export interface Objective {
  /** Position in the source, so a caller can render the diagnosis in document order. */
  Index: number;
  /** The nearest heading above it, when the document has any. */
  Section: string | null;
  /** The objective's own text. */
  Text: string;
}

/** Below this many characters a chunk is a fragment — it would match everything and mean nothing. */
const MIN_OBJECTIVE_CHARS = 25;

/** Above this many characters, a "sentence" is really a paragraph that lost its punctuation. */
const MAX_OBJECTIVE_CHARS = 600;

/** Leading bullet or numbering: `-`, `*`, `•`, `1.`, `1)`, `a.`, `(i)`. */
const BULLET = /^\s*(?:[-*•‣◦–—]|\(?[0-9]{1,2}[.)]|\(?[a-z][.)]|\(?[ivx]+[.)])\s+/i;

/** A markdown heading, or a short line with no terminal punctuation acting as one. */
function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  // A short line with no sentence-ending punctuation, not a bullet, reads as a heading.
  return (
    trimmed.length <= 60 &&
    !BULLET.test(trimmed) &&
    !/[.!?;:]$/.test(trimmed) &&
    // Requires at least one letter, so "2026" or "----" is not mistaken for a heading.
    /[A-Za-z]/.test(trimmed)
  );
}

/** Strip the marker off a bullet, and markdown emphasis off any line. */
function clean(line: string): string {
  return line
    .replace(BULLET, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

/**
 * Split a paragraph into sentences.
 *
 * Abbreviation-aware only to the degree that matters here: the split requires the following
 * character to be an uppercase letter or a digit, which keeps "e.g. members" together while still
 * cutting "…retention. We will…".
 */
function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Cut a document into objectives.
 *
 * @param text the pasted document — a strategic plan, a funder report, a board paper
 * @param maxObjectives cap, so a 90-page plan cannot turn into a thousand embedding calls
 */
export function chunkObjectives(text: string, maxObjectives = 60): Objective[] {
  const objectives: Objective[] = [];
  let section: string | null = null;
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join(' ').trim();
    paragraph = [];
    for (const sentence of toSentences(joined)) {
      push(sentence);
    }
  };

  const push = (raw: string): void => {
    const value = raw.trim();
    // Long chunks are kept rather than dropped — truncating an objective would change what the
    // client asked for, and a long one still embeds usefully.
    if (value.length < MIN_OBJECTIVE_CHARS || objectives.length >= maxObjectives) return;
    objectives.push({
      Index: objectives.length,
      Section: section,
      Text: value.length > MAX_OBJECTIVE_CHARS ? `${value.slice(0, MAX_OBJECTIVE_CHARS)}…` : value,
    });
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }
    if (BULLET.test(line)) {
      // A bullet ends whatever paragraph preceded it and is an objective on its own.
      flushParagraph();
      push(clean(line));
      continue;
    }
    if (isHeading(trimmed)) {
      flushParagraph();
      section = clean(trimmed);
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();

  return objectives;
}
