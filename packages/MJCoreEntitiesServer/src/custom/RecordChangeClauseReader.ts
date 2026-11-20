/**
 * A strict reader for the SQL text of a filter or sort sent with a view read. It reads only the
 * plain subset of SQL that filters and sorts need and gives `null` for anything else, so a caller
 * can refuse text it cannot read with certainty.
 */

/** One token of a clause. `Depth` is the parenthesis depth the token sits at. */
export interface ClauseToken {
    Kind: 'word' | 'name' | 'literal' | 'symbol';
    Text: string;
    Depth: number;
}

/** A top-level `column = 'literal'` term of a filter. `Column` is lower case. */
export interface ClauseEquality {
    Column: string;
    Value: string;
}

/** Character pairs and characters that end the read: comments, statement breaks, templates, escapes. */
const REFUSED_SEQUENCES = ['--', '/*', '*/'];
const REFUSED_CHARACTERS = new Set([';', '$', '\\', '{', '}', '`']);

/** Keywords that make the top-level terms of a filter something other than one conjunction. */
const NON_CONJUNCTION_KEYWORDS = new Set(['or', 'between', 'case']);

const WORD_CHARACTER = /[A-Za-z0-9_@#]/;

function isPlainCharacter(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (code >= 32 && code <= 126) || ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
}

/** Reads a quoted literal that starts at `start`. Returns the value and the index after it, or null. */
function readLiteral(text: string, start: number): { Value: string; End: number } | null {
    let value = '';
    let i = start + 1;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '\\') {
            return null;
        }
        if (ch === "'") {
            if (text[i + 1] === "'") {
                value += "'";
                i += 2;
                continue;
            }
            return { Value: value, End: i + 1 };
        }
        value += ch;
        i++;
    }
    return null;
}

/** Reads a `[name]` or `"name"` identifier that starts at `start`. Returns null for an escaped closer or no closer. */
function readQuotedName(text: string, start: number): { Value: string; End: number } | null {
    const closer = text[start] === '[' ? ']' : '"';
    const end = text.indexOf(closer, start + 1);
    if (end < 0 || text[end + 1] === closer) {
        return null;
    }
    return { Value: text.substring(start + 1, end), End: end + 1 };
}

function readWord(text: string, start: number): { Value: string; End: number } {
    let i = start;
    while (i < text.length && WORD_CHARACTER.test(text[i])) {
        i++;
    }
    return { Value: text.substring(start, i), End: i };
}

/** True when the text at `i` starts a sequence or character the reader refuses. */
function startsRefusedText(text: string, i: number): boolean {
    return REFUSED_CHARACTERS.has(text[i]) || REFUSED_SEQUENCES.some((s) => text.startsWith(s, i)) || !isPlainCharacter(text[i]);
}

/**
 * Splits `text` into tokens. Returns null when the text holds a comment, a statement break, a
 * template, a backslash in a literal, a character outside printable ASCII (outside literals),
 * an unclosed literal or identifier, or unbalanced parentheses.
 */
export function ReadClauseTokens(text: string): ClauseToken[] | null {
    const tokens: ClauseToken[] = [];
    let depth = 0;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (ch === "'" || ((ch === 'N' || ch === 'n') && text[i + 1] === "'")) {
            const literal = readLiteral(text, ch === "'" ? i : i + 1);
            if (!literal) {
                return null;
            }
            tokens.push({ Kind: 'literal', Text: literal.Value, Depth: depth });
            i = literal.End;
            continue;
        }
        if (startsRefusedText(text, i)) {
            return null;
        }
        if (ch === '[' || ch === '"') {
            const name = readQuotedName(text, i);
            if (!name) {
                return null;
            }
            tokens.push({ Kind: 'name', Text: name.Value, Depth: depth });
            i = name.End;
            continue;
        }
        if (WORD_CHARACTER.test(ch)) {
            const word = readWord(text, i);
            tokens.push({ Kind: 'word', Text: word.Value, Depth: depth });
            i = word.End;
            continue;
        }
        if (ch === ')') {
            depth--;
            if (depth < 0) {
                return null;
            }
        }
        tokens.push({ Kind: 'symbol', Text: ch, Depth: depth });
        if (ch === '(') {
            depth++;
        }
        i++;
    }
    return depth === 0 ? tokens : null;
}

/** The lower-case identifiers (words and quoted names) of a clause. Literal text is not included. */
export function ClauseIdentifiers(tokens: ClauseToken[]): string[] {
    return tokens.filter((t) => t.Kind === 'word' || t.Kind === 'name').map((t) => t.Text.toLowerCase());
}

/** Removes one pair of parentheses that wraps the whole term. */
function unwrapTerm(term: ClauseToken[]): ClauseToken[] {
    if (term.length < 2 || term[0].Text !== '(' || term[term.length - 1].Text !== ')' || term[0].Kind !== 'symbol') {
        return term;
    }
    const inner = term.slice(1, -1);
    return inner.every((t) => t.Depth > term[0].Depth) ? inner : term;
}

function equalityOf(term: ClauseToken[]): ClauseEquality | null {
    const t = unwrapTerm(term);
    if (t.length !== 3 || (t[0].Kind !== 'word' && t[0].Kind !== 'name') || t[1].Kind !== 'symbol' || t[1].Text !== '=' || t[2].Kind !== 'literal') {
        return null;
    }
    return { Column: t[0].Text.toLowerCase(), Value: t[2].Text };
}

/**
 * The `column = 'literal'` terms that the whole filter is a conjunction of. Gives an empty list
 * when the top level of the filter holds OR, BETWEEN or CASE, since its terms are then not all
 * required of every row.
 */
export function TopLevelEqualities(tokens: ClauseToken[]): ClauseEquality[] {
    const topLevel = tokens.filter((t) => t.Depth === 0 && t.Kind === 'word');
    if (topLevel.some((t) => NON_CONJUNCTION_KEYWORDS.has(t.Text.toLowerCase()))) {
        return [];
    }
    const terms: ClauseToken[][] = [[]];
    for (const token of tokens) {
        if (token.Depth === 0 && token.Kind === 'word' && token.Text.toLowerCase() === 'and') {
            terms.push([]);
        } else {
            terms[terms.length - 1].push(token);
        }
    }
    return terms.map(equalityOf).filter((e): e is ClauseEquality => e !== null);
}
