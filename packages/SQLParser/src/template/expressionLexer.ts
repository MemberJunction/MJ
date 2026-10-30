/** Kinds of token inside a template tag body. */
export type ExpressionTokenKind = 'Name' | 'Number' | 'String' | 'Operator' | 'Bad' | 'End';

/** One token of a tag body, with absolute offsets into the template text. */
export interface ExpressionToken {
    readonly Kind: ExpressionTokenKind;
    readonly Text: string;
    readonly Start: number;
    readonly End: number;
    /** The decoded value of a `String` token, or the numeric value of a `Number` token. */
    readonly Value: string | number | null;
    /** Whether a `String` token is missing its closing quote. */
    readonly Unterminated: boolean;
}

const MULTI_CHAR_OPERATORS = ['===', '!==', '==', '!=', '<=', '>=', '**', '//'];
const SINGLE_CHAR_OPERATORS = '+-*/%<>()[]{},.|=:~?!';
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r' };

/** How string literals are read. */
export interface ExpressionLexOptions {
    /**
     * Whether a doubled quote inside a string stands for one quote (`'It''s'`), as in SQL. Used
     * for composition arguments, which accepted this form before the expression grammar; a
     * backslash escape works either way.
     */
    readonly DoubledQuoteEscape?: boolean;
}

/**
 * Splits the body of a template tag into tokens. Reads `source` from `start` to `end`; offsets
 * in the tokens are absolute. Always ends with one `End` token. Never throws.
 */
export function LexExpression(source: string, start: number, end: number, options: ExpressionLexOptions = {}): ExpressionToken[] {
    const tokens: ExpressionToken[] = [];
    let i = start;
    while (i < end) {
        if (/\s/.test(source[i])) { i++; continue; }
        const token = readToken(source, i, end, options.DoubledQuoteEscape === true);
        tokens.push(token);
        i = token.End;
    }
    tokens.push(makeToken('End', '', end, end, null));
    return tokens;
}

function makeToken(kind: ExpressionTokenKind, text: string, start: number, end: number, value: string | number | null, unterminated = false): ExpressionToken {
    return { Kind: kind, Text: text, Start: start, End: end, Value: value, Unterminated: unterminated };
}

function readToken(source: string, i: number, end: number, doubledQuotes: boolean): ExpressionToken {
    const c = source[i];
    if (c === "'" || c === '"') return readString(source, i, end, doubledQuotes);
    if (/[0-9]/.test(c)) return readNumber(source, i, end);
    if (/[A-Za-z_]/.test(c)) {
        let j = i + 1;
        while (j < end && /[A-Za-z0-9_]/.test(source[j])) j++;
        return makeToken('Name', source.substring(i, j), i, j, null);
    }
    const multi = MULTI_CHAR_OPERATORS.find(op => source.startsWith(op, i) && i + op.length <= end);
    if (multi !== undefined) return makeToken('Operator', multi, i, i + multi.length, null);
    if (SINGLE_CHAR_OPERATORS.includes(c)) return makeToken('Operator', c, i, i + 1, null);
    return makeToken('Bad', c, i, i + 1, null);
}

/**
 * A quoted string; a backslash escapes the next character, and with `doubledQuotes` so does a
 * doubled quote. Unterminated strings run to `end`.
 */
function readString(source: string, i: number, end: number, doubledQuotes: boolean): ExpressionToken {
    const quote = source[i];
    let value = '';
    let j = i + 1;
    while (j < end) {
        const c = source[j];
        if (c === quote && doubledQuotes && j + 1 < end && source[j + 1] === quote) {
            value += quote;
            j += 2;
            continue;
        }
        if (c === quote) return makeToken('String', source.substring(i, j + 1), i, j + 1, value);
        if (c === '\\' && j + 1 < end) {
            const next = source[j + 1];
            value += ESCAPES[next] ?? next;
            j += 2;
            continue;
        }
        value += c;
        j++;
    }
    return makeToken('String', source.substring(i, end), i, end, value, true);
}

function readNumber(source: string, i: number, end: number): ExpressionToken {
    let j = i;
    while (j < end && /[0-9]/.test(source[j])) j++;
    if (source[j] === '.' && j + 1 < end && /[0-9]/.test(source[j + 1])) {
        j++;
        while (j < end && /[0-9]/.test(source[j])) j++;
    }
    const text = source.substring(i, j);
    return makeToken('Number', text, i, j, Number(text));
}
