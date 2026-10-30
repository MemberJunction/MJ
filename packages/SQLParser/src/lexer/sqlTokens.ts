import type { ParserDialect } from '@memberjunction/sql-dialect';
import { LexSQL } from '../sqlLexer.js';
import type { SQLLexToken, SQLLexTokenKind } from '../sqlLexer.js';
import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import { ScanTemplateTags } from './templateTagScanner.js';
import type { ScannedTag, UnclosedOpener } from './templateTagScanner.js';
import type { SqlToken, SqlTokenKind, TemplateSqlContext, TemplateTagForm } from './sqlTokenTypes.js';

/** A stretch of the input the template engine owns: a tag, or an opener with no closer. */
type Hole =
    | { readonly Start: number; readonly End: number; readonly Tag: ScannedTag; readonly Unclosed: null }
    | { readonly Start: number; readonly End: number; readonly Tag: null; readonly Unclosed: UnclosedOpener };

const KIND_MAP: Readonly<Record<SQLLexTokenKind, SqlTokenKind>> = {
    word: 'Word', number: 'Number', string: 'String', identifier: 'QuotedIdentifier', comment: 'Comment',
    open: 'Punctuation', close: 'Punctuation', comma: 'Punctuation', semicolon: 'Punctuation', dot: 'Punctuation',
    operator: 'Operator', whitespace: 'Whitespace',
};

const TEMPLATE_KINDS: Readonly<Record<TemplateTagForm, SqlTokenKind>> = {
    Expression: 'TemplateExpression', Block: 'TemplateBlock', Comment: 'TemplateComment',
};

const TAG_OPENER = /\{[{%#]/;

/** The Info diagnostic for a template tag written inside a SQL comment. */
export function InertCommentDiagnostic(span: Span): Diagnostic {
    return MakeDiagnostic(MJQueryDiagnosticCodes.ExpressionInComment, 'Info', span,
        'A template tag inside a SQL comment is inert: SQL comments are removed before the template is rendered.',
        'Write template notes in a {# #} template comment.');
}

const CLOSER_TEXT: Readonly<Record<TemplateTagForm, string>> = { Expression: '}}', Block: '%}', Comment: '#}' };

/**
 * An immutable token stream over MJ Query text: SQL in one dialect, with MJ template tags.
 *
 * Every character of the input belongs to exactly one token, so joining the tokens' text gives
 * the input back. Spans are UTF-16 offsets. Lexing runs in linear time and never throws.
 *
 * SQL comments are found first, by the dialect's lexical rules over the raw text, because the
 * render pipeline removes them before the template is evaluated. `{# … #}` always opens a
 * template comment and takes precedence over a dialect's `#` line comment. A tag written inside a SQL
 * comment is inert, stays part of the comment token, and gets an `Info` diagnostic. Template
 * tags are then found over the rest of the text, as the template engine finds them. The SQL
 * around the tags is read as though each tag were blank, so a tag inside a string literal or
 * quoted identifier is seen there: the tag records that {@link TemplateTagInfo.SqlContext}, and
 * the literal is split into pieces around it, each piece carrying `ContainsTemplate`.
 */
export class SqlTokens {
    private readonly text: string;
    private readonly dialect: ParserDialect;
    private readonly tokens: readonly SqlToken[];
    private readonly diagnostics: readonly Diagnostic[];
    private significant: readonly SqlToken[] | null = null;

    private constructor(text: string, dialect: ParserDialect, tokens: readonly SqlToken[], diagnostics: readonly Diagnostic[]) {
        this.text = text;
        this.dialect = dialect;
        this.tokens = tokens;
        this.diagnostics = diagnostics;
    }

    /**
     * Lexes MJ Query text.
     * @param text - The text, template tags included.
     * @param dialect - The SQL dialect whose lexical rules read the SQL between tags.
     */
    static Lex(text: string, dialect: ParserDialect): SqlTokens {
        const source = typeof text === 'string' ? text : '';
        const comments = LexSQL(blankTemplateComments(source), dialect).filter(t => t.Kind === 'comment');
        const scan = ScanTemplateTags(blank(source, comments));
        const holes = collectHoles(scan.Tags, scan.Unclosed);
        const sqlTokens = LexSQL(maskHoles(source, holes), dialect);
        const builder = new TokenBuilder(source, holes);
        for (const token of sqlTokens) builder.Add(token);
        builder.ReportInertComments();
        return new SqlTokens(source, dialect, Object.freeze(builder.Tokens), Object.freeze(builder.Diagnostics));
    }

    /** The input text. */
    get Text(): string {
        return this.text;
    }

    /** The dialect the SQL was read with. */
    get Dialect(): ParserDialect {
        return this.dialect;
    }

    /** Every token, in input order. */
    get Tokens(): readonly SqlToken[] {
        return this.tokens;
    }

    /** What the lexer found wrong: unclosed tags and tags inside literals or quoted identifiers. */
    get Diagnostics(): readonly Diagnostic[] {
        return this.diagnostics;
    }

    /** Whether the text holds any template tag. */
    get HasTemplate(): boolean {
        return this.tokens.some(t => t.Template !== null);
    }

    /** The tokens that carry meaning: everything except whitespace, SQL comments and template comments. */
    Significant(): readonly SqlToken[] {
        if (this.significant === null) {
            this.significant = Object.freeze(this.tokens.filter(t => IsSignificantToken(t)));
        }
        return this.significant;
    }

    /** The index of the token that covers `offset`, or -1 when the offset is outside the text. */
    IndexAt(offset: number): number {
        let low = 0;
        let high = this.tokens.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            const span = this.tokens[mid].Span;
            if (offset < span.Start) high = mid - 1;
            else if (offset >= span.End) low = mid + 1;
            else return mid;
        }
        return -1;
    }

    /** The input text a span covers. */
    Slice(span: Span): string {
        return this.text.substring(span.Start, span.End);
    }
}

/** Whether a token carries meaning: not whitespace, a SQL comment or a template comment. */
export function IsSignificantToken(token: SqlToken): boolean {
    return token.Kind !== 'Whitespace' && token.Kind !== 'Comment' && token.Kind !== 'TemplateComment';
}

function collectHoles(tags: readonly ScannedTag[], unclosed: readonly UnclosedOpener[]): Hole[] {
    const holes: Hole[] = [
        ...tags.map((t): Hole => ({ Start: t.Start, End: t.End, Tag: t, Unclosed: null })),
        ...unclosed.map((u): Hole => ({ Start: u.Start, End: u.Start + 2, Tag: null, Unclosed: u })),
    ];
    return holes.sort((a, b) => a.Start - b.Start);
}

/**
 * The text with every `{# … #}` template comment blanked (line breaks kept), for finding SQL
 * comments. `{#` always opens a template comment, in every dialect, so its `#` and the `#` of its
 * `#}` never start a `#` line comment (MySQL). An opener with no closer is blanked alone.
 * Linear: once one opener finds no closer, no later one can.
 */
function blankTemplateComments(text: string): string {
    let open = text.indexOf('{#');
    if (open < 0) return text;
    const parts: string[] = [];
    let at = 0;
    let closerExists = true;
    while (open >= 0) {
        const close = closerExists ? text.indexOf('#}', open + 2) : -1;
        if (close < 0) closerExists = false;
        const end = close < 0 ? open + 2 : close + 2;
        parts.push(text.substring(at, open), text.substring(open, end).replace(/[^\r\n]/g, ' '));
        at = end;
        open = text.indexOf('{#', end);
    }
    parts.push(text.substring(at));
    return parts.join('');
}

/** The text with the given spans blanked to spaces, so no template tag is found inside them. Lengths are kept. */
function blank(text: string, spans: readonly { readonly Start: number; readonly End: number }[]): string {
    if (spans.length === 0) return text;
    const parts: string[] = [];
    let at = 0;
    for (const span of spans) {
        parts.push(text.substring(at, span.Start), ' '.repeat(span.End - span.Start));
        at = span.End;
    }
    parts.push(text.substring(at));
    return parts.join('');
}

/** The text with every hole blanked to spaces, so the SQL lexer reads around it. Lengths are kept. */
function maskHoles(text: string, holes: readonly Hole[]): string {
    if (holes.length === 0) return text;
    const parts: string[] = [];
    let at = 0;
    for (const hole of holes) {
        parts.push(text.substring(at, hole.Start), ' '.repeat(hole.End - hole.Start));
        at = hole.End;
    }
    parts.push(text.substring(at));
    return parts.join('');
}

/** The SQL context a hole inside a token of this kind sits in. */
function contextFor(kind: SqlTokenKind): TemplateSqlContext {
    if (kind === 'String') return 'StringLiteral';
    if (kind === 'QuotedIdentifier') return 'QuotedIdentifier';
    if (kind === 'Comment') return 'Comment';
    return 'Code';
}

/** Splits the SQL tokens around the holes and builds the final stream. */
class TokenBuilder {
    readonly Tokens: SqlToken[] = [];
    readonly Diagnostics: Diagnostic[] = [];
    private holeIndex = 0;

    constructor(private readonly text: string, private readonly holes: readonly Hole[]) {}

    /** Adds one SQL token, splitting it around any holes inside it. */
    Add(token: SQLLexToken): void {
        const kind = KIND_MAP[token.Kind];
        const inside = this.holesWithin(token.Start, token.End);
        if (inside.length === 0) {
            this.push(kind, token.Start, token.End, token.Depth, null);
            return;
        }
        const splitsLiteral = kind !== 'Whitespace';
        const enclosing = splitsLiteral ? { Start: token.Start, End: token.End } : null;
        let at = token.Start;
        for (const hole of inside) {
            this.push(kind, at, hole.Start, token.Depth, enclosing);
            this.pushHole(hole, contextFor(kind), token.Depth);
            at = hole.End;
        }
        this.push(kind, at, token.End, token.Depth, enclosing);
    }

    /** Adds an Info diagnostic for each SQL comment that mentions a template tag: the tag is inert. */
    ReportInertComments(): void {
        for (const token of this.Tokens) {
            if (token.Kind !== 'Comment' || !TAG_OPENER.test(token.Text)) continue;
            this.Diagnostics.push(InertCommentDiagnostic(token.Span));
        }
    }

    private holesWithin(start: number, end: number): Hole[] {
        const found: Hole[] = [];
        while (this.holeIndex < this.holes.length && this.holes[this.holeIndex].Start < end) {
            const hole = this.holes[this.holeIndex];
            if (hole.Start >= start) found.push(hole);
            this.holeIndex++;
        }
        return found;
    }

    private push(kind: SqlTokenKind, start: number, end: number, depth: number, enclosing: Span | null): void {
        if (end <= start) return;
        this.Tokens.push(Object.freeze({
            Kind: kind, Text: this.text.substring(start, end), Span: { Start: start, End: end }, Depth: depth,
            ContainsTemplate: enclosing !== null, Enclosing: enclosing, Template: null,
        }));
    }

    private pushHole(hole: Hole, context: TemplateSqlContext, depth: number): void {
        const span = { Start: hole.Start, End: hole.End };
        if (hole.Tag === null) {
            this.pushUnclosed(hole.Unclosed, span, depth);
            return;
        }
        const tag = hole.Tag;
        this.Tokens.push(Object.freeze({
            Kind: TEMPLATE_KINDS[tag.Form], Text: this.text.substring(tag.Start, tag.End), Span: span, Depth: depth,
            ContainsTemplate: false, Enclosing: null,
            Template: Object.freeze({
                Form: tag.Form, Body: this.text.substring(tag.BodyStart, tag.BodyEnd),
                BodySpan: { Start: tag.BodyStart, End: tag.BodyEnd },
                TrimBefore: tag.TrimBefore, TrimAfter: tag.TrimAfter, SqlContext: context,
            }),
        }));
        this.reportContext(context, span);
    }

    private pushUnclosed(opener: UnclosedOpener, span: Span, depth: number): void {
        this.Tokens.push(Object.freeze({
            Kind: 'Unknown', Text: this.text.substring(span.Start, span.End), Span: span, Depth: depth,
            ContainsTemplate: false, Enclosing: null, Template: null,
        }));
        const closer = CLOSER_TEXT[opener.Form];
        this.Diagnostics.push(MakeDiagnostic(MJQueryDiagnosticCodes.UnclosedTag, 'Error', span,
            `This template tag opener has no closing ${closer}.`, `Close the tag with ${closer}, or remove the opener.`));
    }

    private reportContext(context: TemplateSqlContext, span: Span): void {
        if (context === 'StringLiteral') {
            this.Diagnostics.push(MakeDiagnostic(MJQueryDiagnosticCodes.TagInStringLiteral, 'Error', span,
                'A template tag sits inside a SQL string literal, where its value is not escaped.',
                "Put the tag outside the quotes and use a filter, e.g. {{ x | sqlLikeContains }} instead of '%{{ x }}%'."));
        } else if (context === 'QuotedIdentifier') {
            this.Diagnostics.push(MakeDiagnostic(MJQueryDiagnosticCodes.TagInQuotedIdentifier, 'Error', span,
                'A template tag sits inside a quoted identifier, where its value is not escaped.',
                'Use {{ name | sqlIdentifier }} outside any quotes, or write the identifier out.'));
        }
    }
}
