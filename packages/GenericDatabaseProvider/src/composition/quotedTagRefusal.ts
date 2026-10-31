import type { ParserDialect } from '@memberjunction/sql-dialect';
import { MJQueryDiagnosticCodes, SqlTokens } from '@memberjunction/sql-parser';
import type { Diagnostic, Span } from '@memberjunction/sql-parser';
import { QueryTextPosition } from '@memberjunction/core-entities';

/** Where a quoted tag sits: inside a SQL string literal, or inside a quoted identifier. */
export type QuotedTagKind = 'StringLiteral' | 'QuotedIdentifier';

/** One template tag written inside a SQL string literal or a quoted identifier. */
export interface QuotedTag {
    readonly Kind: QuotedTagKind;
    /** The tag, e.g. `{{ Region }}`. */
    readonly Tag: string;
    /** The parameter the tag reads; `null` when it is not a plain `{{ name }}`. */
    readonly Parameter: string | null;
    /**
     * The whole quoted piece the tag sits in, quotes included: the string literal (`'{{ Region }}'`)
     * or the quoted identifier (`[{{ Col }}]`, `"{{ Col }}"`, `` `{{ Col }}` ``).
     */
    readonly Quoted: string;
    readonly Line: number;
    readonly Column: number;
}

/** The diagnostic code for each kind of quoted tag. */
const KIND_BY_CODE: ReadonlyMap<string, QuotedTagKind> = new Map([
    [MJQueryDiagnosticCodes.TagInStringLiteral, 'StringLiteral'],
    [MJQueryDiagnosticCodes.TagInQuotedIdentifier, 'QuotedIdentifier'],
]);

/** What a dialect's opening identifier quote is called in a fix. */
const IDENTIFIER_QUOTE_NAMES: Readonly<Record<string, string>> = { '[': 'brackets', '"': 'double quotes', '`': 'backticks' };

/** The first name a `{{ … }}` tag reads, e.g. `Region` in `{{- Region | upper }}` or `Context.Now`. */
const TAG_PARAMETER = /^\{\{-?\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)/;

/** A composition tag, `{{query:"…"}}`. */
const COMPOSITION_TAG_TEXT = /^\{\{-?\s*query\s*:/;

/**
 * Whether a diagnostic reports a template tag inside a SQL string literal
 * (`MJQ_TAG_IN_STRING_LITERAL`) or a quoted identifier (`MJQ_TAG_IN_QUOTED_IDENTIFIER`).
 */
export function IsQuotedTagCode(code: string): boolean {
    return KIND_BY_CODE.has(code);
}

/**
 * Whether a tag written inside a SQL string literal or a quoted identifier pastes a value there: a
 * `{{ … }}` value tag. A composition tag there stays literal text, and a `{% %}` block or `{# #}`
 * comment pastes no value, so a run does not stop for those (a save still refuses them).
 */
export function IsQuotedValueTag(tagText: string): boolean {
    return tagText.startsWith('{{') && !COMPOSITION_TAG_TEXT.test(tagText);
}

/**
 * Why a query whose SQL writes a value tag inside a SQL string literal (`'{{ Region }}'`) or a
 * quoted identifier (`[{{ Col }}]`) may not run, written for the people who own the query: which
 * tags, where, why each kind is refused, the exact fix, and how to find every query with the same
 * problem. One message covers both kinds when the query has both.
 *
 * The positions are read from `sql` as stored (comments included), so they match what an editor
 * shows. Returns `null` when `sql` has no such tag.
 *
 * @param queryName - Names the query; a request that is not a saved query passes `null`.
 */
export function QuotedTagRefusalMessage(queryName: string | null, sql: string, dialect: ParserDialect): string | null {
    const tags = FindQuotedTags(sql, dialect);
    if (tags.length === 0) return null;
    const subject = queryName ? `Query "${queryName}"` : 'This query';
    const literal = tags.find(t => t.Kind === 'StringLiteral');
    const identifier = tags.find(t => t.Kind === 'QuotedIdentifier');
    return [
        `${subject} cannot run: its SQL writes a template tag inside quotes, ${tags.map(describeTag).join('; ')}.`,
        ...(literal ? literalGuidance(literal) : []),
        ...(identifier ? identifierGuidance(identifier) : []),
        'MJ therefore refuses to run the query until it is fixed.',
        findEveryQuery(literal !== undefined, identifier !== undefined),
    ].join(' ');
}

/** Why a tag inside a string literal is unsafe, and the filter that writes the whole literal. */
function literalGuidance(tag: QuotedTag): string[] {
    return [
        'In a string literal, MJ pastes the value between the quotes without escaping it, so a value that contains a quote can change the statement.',
        literalFix(tag),
        'When the value is not text, use the filter for its type instead (sqlNumber, sqlDate, sqlBoolean).',
    ];
}

/** The exact rewrite for a tag inside a string literal: the filter that writes the whole literal from the value. */
function literalFix(tag: QuotedTag): string {
    const name = tag.Parameter ?? 'Value';
    const body = tag.Quoted.slice(1, -1);
    if (body === tag.Tag) {
        return `Fix: replace ${tag.Quoted} with {{ ${name} | sqlString }} and drop the surrounding quotes; sqlString adds the quotes and escapes the value.`;
    }
    const like = body === `%${tag.Tag}%` ? 'sqlLikeContains' : body === `${tag.Tag}%` ? 'sqlLikeBegins' : body === `%${tag.Tag}` ? 'sqlLikeEnds' : null;
    if (like) {
        return `Fix: replace ${tag.Quoted} with {{ ${name} | ${like} }} and drop the surrounding quotes; ${like} adds the quotes, the % wildcards and the escaping.`;
    }
    return `Fix: take the tag out of the quotes and give it a filter, joining any fixed text in SQL, e.g. CONCAT('…', {{ ${name} | sqlString }}, '…') in place of ${tag.Quoted}; sqlString adds the quotes and escapes the value.`;
}

/**
 * Why a tag inside a quoted identifier is unsafe, and the rewrite with `sqlIdentifier`, which
 * quotes the name for the dialect and refuses a value that is not a plain name.
 */
function identifierGuidance(tag: QuotedTag): string[] {
    const name = tag.Parameter ?? 'Name';
    const closing = tag.Quoted.slice(-1);
    const quotes = IDENTIFIER_QUOTE_NAMES[tag.Quoted[0]] ?? 'quotes';
    const what = 'sqlIdentifier quotes the name for the database and refuses a value that is not a plain name (letters, digits and underscores).';
    const fix = tag.Quoted.slice(1, -1) === tag.Tag
        ? `Fix: replace ${tag.Quoted} with {{ ${name} | sqlIdentifier }} and drop the surrounding ${quotes}; ${what}`
        : `Fix: take the tag out of the ${quotes}: pass the whole name as the value and write {{ ${name} | sqlIdentifier }} in place of ${tag.Quoted}; ${what}`;
    return [
        `In a quoted identifier, MJ pastes the value between the identifier's ${quotes} without escaping it, so a value that contains the closing ${closing} can end the identifier and change the statement.`,
        fix,
    ];
}

/** How to list every saved query with the same problem, naming the refresh code(s) reported. */
function findEveryQuery(hasLiteral: boolean, hasIdentifier: boolean): string {
    const codes: string[] = [];
    if (hasLiteral) codes.push(MJQueryDiagnosticCodes.TagInStringLiteral);
    if (hasIdentifier) codes.push(MJQueryDiagnosticCodes.TagInQuotedIdentifier);
    return `To list every saved query with this problem, run \`mj query refresh --all --dry-run\`: each is reported as an Error (${codes.join(' or ')}).`;
}

/** The value tags `sql` writes inside SQL string literals or quoted identifiers, in source order. */
export function FindQuotedTags(sql: string, dialect: ParserDialect): QuotedTag[] {
    const tokens = SqlTokens.Lex(sql, dialect);
    return tokens.Diagnostics
        .filter(d => IsQuotedTagCode(d.Code) && IsQuotedValueTag(sql.substring(d.Span.Start, d.Span.End)))
        .map(d => quotedTag(sql, d, enclosingQuoted(tokens, d.Span)));
}

function quotedTag(sql: string, diagnostic: Diagnostic, quoted: Span): QuotedTag {
    const span = diagnostic.Span;
    const tag = sql.substring(span.Start, span.End);
    const at = QueryTextPosition(sql, span.Start);
    return {
        Kind: KIND_BY_CODE.get(diagnostic.Code) ?? 'StringLiteral',
        Tag: tag,
        Parameter: TAG_PARAMETER.exec(tag)?.[1] ?? null,
        Quoted: sql.substring(quoted.Start, quoted.End),
        Line: at.Line,
        Column: at.Column,
    };
}

/** The full extent of the string literal or quoted identifier the tag at `span` interrupts; the tag itself when none is found. */
function enclosingQuoted(tokens: SqlTokens, span: Span): Span {
    const piece = tokens.Tokens.find(t => t.Enclosing !== null && t.Enclosing.Start <= span.Start && t.Enclosing.End >= span.End);
    return piece?.Enclosing ?? span;
}

function describeTag(tag: QuotedTag): string {
    const kind = tag.Parameter?.startsWith('Context.') ? 'context value' : 'parameter';
    const parameter = tag.Parameter ? ` (${kind} "${tag.Parameter}")` : '';
    return `${tag.Tag}${parameter} at line ${tag.Line}, column ${tag.Column}: ${tag.Quoted}`;
}
