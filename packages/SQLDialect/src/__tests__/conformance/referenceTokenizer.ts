/**
 * A small reference reader for the conformance suite, written from the lexical facets alone and
 * independent of the production lexer: it reads one string literal or quoted identifier at the
 * start of a text and decodes it, so a value written by a dialect's writer can be read back.
 */
import type { DialectLexicalRules } from '../../facets/dialectLexicalRules.js';

/** What the reader found at the start of the text. */
export interface ReadResult {
    /** The decoded content. */
    Value: string;
    /** Offset just past the literal or identifier. */
    End: number;
}

/** Reads a quoted body opening at `start` (the quote), decoding doubled-quote and backslash escapes. */
function readQuotedBody(text: string, start: number, close: string, doubled: boolean, backslash: boolean): ReadResult | null {
    let value = '';
    let j = start + 1;
    while (j < text.length) {
        const c = text[j];
        if (backslash && c === '\\' && j + 1 < text.length) {
            value += text[j + 1];
            j += 2;
            continue;
        }
        if (c === close) {
            if (doubled && text[j + 1] === close) {
                value += close;
                j += 2;
                continue;
            }
            return { Value: value, End: j + 1 };
        }
        value += c;
        j++;
    }
    return null;
}

/** Reads the string literal at the start of `text` under `rules`, or `null` when there is none. */
export function ReadStringLiteral(text: string, rules: DialectLexicalRules): ReadResult | null {
    for (const form of rules.StringLiterals) {
        for (const prefix of form.Prefixes) {
            const opens = text.substring(0, prefix.length).toUpperCase() === prefix.toUpperCase() && text[prefix.length] === form.Quote;
            if (opens) {
                return readQuotedBody(text, prefix.length, form.Quote, form.DoubledQuoteEscape, form.BackslashEscape);
            }
        }
    }
    return null;
}

/** Reads the quoted identifier at the start of `text` under `rules`, or `null` when there is none. */
export function ReadQuotedIdentifier(text: string, rules: DialectLexicalRules): ReadResult | null {
    const form = rules.IdentifierQuotes.find(f => text.startsWith(f.Open));
    return form ? readQuotedBody(text, 0, form.Close, form.DoubledCloseEscape, false) : null;
}
