import type { IdentifierQuoteForm, ParserDialect } from '@memberjunction/sql-dialect';
import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, Span } from '../common/analysis.js';
import type { SqlTokens } from '../lexer/sqlTokens.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';
import { SqlDocumentDiagnosticCodes } from './sqlDiagnosticCodes.js';
import { RESERVED_WORDS } from './sqlKeywords.js';
import type { IdentifierNode, ObjectName } from './sqlNodes.js';

/**
 * The significant tokens of a document with what the parser asks of them in constant time: the
 * upper-case text of each word, the matching parenthesis of each `(` and `)`, and name reading.
 * Built once per document in linear time.
 */
export class TokenTable {
    /** The significant tokens: no whitespace, comments or template comments. */
    readonly Tokens: readonly SqlToken[];
    /** The source token stream. */
    readonly Source: SqlTokens;
    readonly Dialect: ParserDialect;
    /** Problems found while matching parentheses. */
    readonly Diagnostics: readonly Diagnostic[];
    private readonly upper: readonly string[];
    private readonly match: Int32Array;
    private readonly quotes: readonly IdentifierQuoteForm[];

    constructor(source: SqlTokens, dialect: ParserDialect) {
        this.Source = source;
        this.Dialect = dialect;
        this.Tokens = source.Significant();
        this.upper = this.Tokens.map(t => (t.Kind === 'Word' ? t.Text.toUpperCase() : ''));
        this.quotes = dialect.Lexical.IdentifierQuotes;
        const matched = matchParentheses(this.Tokens);
        this.match = matched.Match;
        this.Diagnostics = matched.Diagnostics;
    }

    /** How many significant tokens there are. */
    get Length(): number {
        return this.Tokens.length;
    }

    /** The upper-case text of a word token; `''` for any other token or an index out of range. */
    Upper(i: number): string {
        return this.upper[i] ?? '';
    }

    /** Whether token `i` is the given upper-case keyword. */
    IsWord(i: number, keyword: string): boolean {
        return this.upper[i] === keyword;
    }

    /** Whether token `i` is the punctuation or operator character `ch`. */
    IsChar(i: number, ch: string): boolean {
        const token = this.Tokens[i];
        return token !== undefined && (token.Kind === 'Punctuation' || token.Kind === 'Operator') && token.Text === ch;
    }

    /** The index of the parenthesis matching the one at `i`; -1 when it has none or `i` is not one. */
    Match(i: number): number {
        return this.match[i] ?? -1;
    }

    /** Whether token `i` is a template tag or an unclosed template opener. */
    IsTemplate(i: number): boolean {
        const kind = this.Tokens[i]?.Kind;
        return kind === 'TemplateExpression' || kind === 'TemplateBlock' || kind === 'Unknown';
    }

    /** Whether token `i` is a reserved word. */
    IsReserved(i: number): boolean {
        return RESERVED_WORDS.has(this.upper[i] ?? '');
    }

    /** Whether token `i` can be a name part: a quoted identifier, or a word that is not reserved. */
    IsNamePart(i: number): boolean {
        const token = this.Tokens[i];
        if (token === undefined) return false;
        if (token.Kind === 'QuotedIdentifier') return true;
        return token.Kind === 'Word' && !this.IsReserved(i);
    }

    /** Whether token `i` is a quoted identifier or any word (reserved or not). */
    IsAnyName(i: number): boolean {
        const kind = this.Tokens[i]?.Kind;
        return kind === 'QuotedIdentifier' || kind === 'Word';
    }

    /** The span from the start of token `first` to the end of token `last` (inclusive). */
    SpanOf(first: number, last: number): Span {
        const start = this.Tokens[first]?.Span.Start ?? this.endOfText();
        const end = this.Tokens[last]?.Span.End ?? start;
        return { Start: start, End: Math.max(start, end) };
    }

    /** An empty span at the start of token `i`, or at the end of the text. */
    PointAt(i: number): Span {
        const at = this.Tokens[i]?.Span.Start ?? this.endOfText();
        return { Start: at, End: at };
    }

    /** Reads token `i` as one name part. */
    Identifier(i: number): IdentifierNode {
        const token = this.Tokens[i];
        const quoted = token.Kind === 'QuotedIdentifier';
        const value = quoted ? this.unquote(token.Text) : token.Kind === 'String' ? unquoteString(token.Text) : token.Text;
        return Object.freeze({ Kind: 'Identifier', Value: value, Quoted: quoted || token.Kind === 'String', Span: token.Span });
    }

    /**
     * Reads a dotted name starting at `i`: parts separated by `.`, an omitted part (`db..t`) read as
     * an empty identifier. Returns the name and the index after it, or `null` when no name starts here.
     */
    ReadObjectName(i: number, end: number): { Name: ObjectName; Next: number } | null {
        if (!this.IsNamePart(i) && !(this.Tokens[i]?.Kind === 'Word' && this.IsChar(i + 1, '.'))) return null;
        const parts: IdentifierNode[] = [this.Identifier(i)];
        let j = i + 1;
        while (j + 1 < end && this.IsChar(j, '.')) {
            if (this.IsAnyName(j + 1)) {
                parts.push(this.Identifier(j + 1));
                j += 2;
            } else if (this.IsChar(j + 1, '.') && j + 2 < end && this.IsAnyName(j + 2)) {
                parts.push(Object.freeze({ Kind: 'Identifier', Value: '', Quoted: false, Span: this.PointAt(j + 1) }));
                j += 1;
            } else {
                break;
            }
        }
        const span = this.SpanOf(i, j - 1);
        return { Name: Object.freeze({ Kind: 'ObjectName', Parts: Object.freeze(parts), Span: span }), Next: j };
    }

    private endOfText(): number {
        return this.Source.Text.length;
    }

    private unquote(text: string): string {
        const form = this.quotes.find(q => text.startsWith(q.Open)) ?? defaultQuote(text);
        const closed = text.length >= 2 && text.endsWith(form.Close);
        const inner = text.substring(form.Open.length, closed ? text.length - form.Close.length : text.length);
        return form.DoubledCloseEscape ? inner.split(form.Close + form.Close).join(form.Close) : inner;
    }
}

function defaultQuote(text: string): IdentifierQuoteForm {
    const open = text[0] ?? '"';
    const close = open === '[' ? ']' : open;
    return { Open: open, Close: close, DoubledCloseEscape: true };
}

/** The value of a simple string literal used as an alias (`'Total'`, `N'Total'`). */
function unquoteString(text: string): string {
    const open = text.indexOf("'");
    if (open < 0) return text;
    const closed = text.length - 1 > open && text.endsWith("'");
    return text.substring(open + 1, closed ? text.length - 1 : text.length).split("''").join("'");
}

function matchParentheses(tokens: readonly SqlToken[]): { Match: Int32Array; Diagnostics: Diagnostic[] } {
    const match = new Int32Array(tokens.length).fill(-1);
    const diagnostics: Diagnostic[] = [];
    const open: number[] = [];
    tokens.forEach((token, i) => {
        if (token.Kind !== 'Punctuation') return;
        if (token.Text === '(') {
            open.push(i);
        } else if (token.Text === ')') {
            const opener = open.pop();
            if (opener === undefined) {
                diagnostics.push(unbalanced(token.Span, 'This ) has no matching (.'));
            } else {
                match[opener] = i;
                match[i] = opener;
            }
        }
    });
    for (const opener of open) diagnostics.push(unbalanced(tokens[opener].Span, 'This ( has no matching ).'));
    return { Match: match, Diagnostics: diagnostics };
}

function unbalanced(span: Span, message: string): Diagnostic {
    return MakeDiagnostic(SqlDocumentDiagnosticCodes.UnbalancedParenthesis, 'Error', span, message, 'Balance the parentheses.');
}
