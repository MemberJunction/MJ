/**
 * @fileoverview Query unquoting and whitespace normalization helpers for Scoped Search.
 *
 * AI agents and human callers frequently pass quoted phrases, escaped JSON quotes,
 * embedded quoted sub-phrases, or unbalanced quotes to `__Scoped_Search`. Downstream
 * search providers (SQL `LIKE`, SQL Server Full-Text, external indexes, tag matchers)
 * either match literal quote marks or throw syntax errors on unbalanced quotes, while
 * internal apostrophes (`O'Brien's`, `don't`) and trailing possessives (`James'`) must
 * remain intact.
 */

const DOUBLE_QUOTE_CHARS = new Set(['"', '“', '”']);
const SINGLE_QUOTE_CHARS = new Set(["'", '‘', '’']);
const ALL_QUOTE_CHARS = new Set([...DOUBLE_QUOTE_CHARS, ...SINGLE_QUOTE_CHARS]);

interface BoundarySingleQuote {
    Index: number;
    IsLeading: boolean;
    IsTrailing: boolean;
    IsPossessive: boolean;
}

/**
 * Unquote and normalize a raw Scoped Search query string deterministically.
 *
 * Handles:
 * - Surrounding straight/curly double quotes (`"refund policy"`, `“Executive Review”`, `""nested""`)
 * - Surrounding straight/curly single quotes (`'refund policy'`, `'O'Brien's report'`)
 * - Embedded quoted phrases (`budget "Q3 review" plan`, `'foo' and 'bar'`)
 * - Escaped quotes (`\"refund policy\"`, `\'O\'Brien\'s\'`) while keeping non-quote backslashes
 * - Internal apostrophes (`O'Brien's report`, `don't`, `2025's`) and trailing possessives (`James' report`)
 * - Empty quotes (`""`, `''`, `"   "`) -> `""`
 * - Unbalanced quotes (`"unclosed`, `unclosed"`, `'unclosed`, `'"foo "bar'`) without syntax errors or mangled tokens
 */
export function NormalizeScopedSearchQuery(rawQuery: string): string {
    if (typeof rawQuery !== 'string') return '';
    const trimmed = rawQuery.trim();
    if (trimmed.length === 0) return '';

    const unescaped = unescapeQuotedCharacters(trimmed);
    const withoutDoubleQuotes = stripDoubleQuotes(unescaped);
    const withoutBoundarySingleQuotes = stripBoundarySingleQuotes(withoutDoubleQuotes);
    return collapseWhitespace(withoutBoundarySingleQuotes);
}

/**
 * Unescape backslash-escaped quote marks (`\"`, `\'`, etc.) without altering non-quote backslashes.
 */
function unescapeQuotedCharacters(input: string): string {
    return input.replace(/\\+(["'“”‘’])/g, '$1');
}

/**
 * Replace straight and curly double-quote marks with spaces so adjacent tokens never concatenate
 * (`prefix"inner"suffix` -> `prefix inner suffix`) and unbalanced double quotes cannot cause syntax errors.
 */
function stripDoubleQuotes(input: string): string {
    return input.replace(/["“”]+/g, ' ');
}

/**
 * Strip surrounding, embedded, and unbalanced boundary single quotes while preserving internal
 * apostrophes (`O'Brien's`, `don't`) and standalone trailing possessives (`James'`, `users'`).
 */
function stripBoundarySingleQuotes(input: string): string {
    let current = collapseWhitespace(input);
    if (current.length === 0) return '';

    if (isOnlyQuotesAndSpaces(current)) return '';

    // Unwrap genuinely wrapping outer single quotes first (e.g., `'O'Brien's report'` or `'James' report'`)
    // when doing so does not orphan an embedded pair like `'foo' and 'bar'`.
    current = unwrapOuterSingleQuotes(current);
    if (!containsAnySingleQuote(current)) return current;

    const boundaryQuotes = findBoundarySingleQuotes(current);
    if (boundaryQuotes.length === 0) return current;

    const indicesToStrip = selectSingleQuoteIndicesToStrip(boundaryQuotes);
    if (indicesToStrip.size === 0) return current;

    return removeCharIndicesAsSpaces(current, indicesToStrip);
}

function unwrapOuterSingleQuotes(input: string): string {
    let current = input.trim();
    while (current.length >= 2 && SINGLE_QUOTE_CHARS.has(current[0]) && SINGLE_QUOTE_CHARS.has(current[current.length - 1])) {
        const inner = current.slice(1, -1).trim();
        if (inner.length === 0) return '';
        if (!hasSafeOuterUnwrap(inner)) break;
        current = inner;
    }
    return current;
}

/**
 * Confirm that stripping one outer single-quote pair leaves `inner` without an unmatched pair
 * split in the middle (e.g. `'foo' and 'bar'` has interior `foo'` + `'bar` where `foo'` is
 * non-possessive, so outer stripping would orphan both inner quotes).
 */
function hasSafeOuterUnwrap(inner: string): boolean {
    const innerBoundary = findBoundarySingleQuotes(inner);
    if (innerBoundary.length === 0) return true;
    // Allow interior boundary quotes only when every one of them is a standalone trailing possessive (e.g. `James' report`).
    return innerBoundary.every(q => q.IsTrailing && q.IsPossessive && !q.IsLeading);
}

function findBoundarySingleQuotes(input: string): BoundarySingleQuote[] {
    const quotes: BoundarySingleQuote[] = [];
    for (let i = 0; i < input.length; i++) {
        if (!SINGLE_QUOTE_CHARS.has(input[i])) continue;
        const prevAlnum = i > 0 && isAlnum(input[i - 1]);
        const nextAlnum = i < input.length - 1 && isAlnum(input[i + 1]);
        // Internal apostrophes (`O'Brien`, `don't`, `2025's`) always sit between alphanumeric chars.
        if (prevAlnum && nextAlnum) continue;

        const isLeading = !prevAlnum;
        const isTrailing = prevAlnum && !nextAlnum;
        const isPossessive = isTrailing && i >= 2 && (input[i - 1] === 's' || input[i - 1] === 'S') && isAsciiAlpha(input[i - 2]);
        quotes.push({ Index: i, IsLeading: isLeading, IsTrailing: isTrailing, IsPossessive: isPossessive });
    }
    return quotes;
}

function selectSingleQuoteIndicesToStrip(quotes: BoundarySingleQuote[]): Set<number> {
    const strip = new Set<number>();
    let openQuoteIndex: number | null = null;

    for (const q of quotes) {
        if (q.IsLeading && !q.IsTrailing) {
            if (openQuoteIndex !== null) {
                // Previous leading quote was never closed; strip it too.
                strip.add(openQuoteIndex);
            }
            openQuoteIndex = q.Index;
            continue;
        }
        if (q.IsTrailing) {
            if (openQuoteIndex !== null) {
                // Closes the active single-quoted phrase.
                strip.add(openQuoteIndex);
                strip.add(q.Index);
                openQuoteIndex = null;
            } else if (!q.IsPossessive) {
                // Unbalanced trailing quote (not a plural/s-ending possessive like `James'`).
                strip.add(q.Index);
            }
            continue;
        }
        // Standalone quote with non-alnum on both sides.
        strip.add(q.Index);
    }

    if (openQuoteIndex !== null) {
        strip.add(openQuoteIndex);
    }
    return strip;
}

function removeCharIndicesAsSpaces(input: string, indices: Set<number>): string {
    let out = '';
    for (let i = 0; i < input.length; i++) {
        out += indices.has(i) ? ' ' : input[i];
    }
    return out;
}

function isOnlyQuotesAndSpaces(input: string): boolean {
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (!ALL_QUOTE_CHARS.has(ch) && !/\s/.test(ch)) {
            return false;
        }
    }
    return true;
}

function containsAnySingleQuote(input: string): boolean {
    for (let i = 0; i < input.length; i++) {
        if (SINGLE_QUOTE_CHARS.has(input[i])) return true;
    }
    return false;
}

function isAlnum(ch: string): boolean {
    return /^[A-Za-z0-9]$/.test(ch);
}

function isAsciiAlpha(ch: string): boolean {
    return /^[A-Za-z]$/.test(ch);
}

function collapseWhitespace(input: string): string {
    return input.replace(/\s+/g, ' ').trim();
}
