import type { SQLDialect } from '@memberjunction/sql-dialect';
import { MJQueryDiagnosticCodes, SqlTokens } from '@memberjunction/sql-parser';
import type { Span } from '@memberjunction/sql-parser';
import { QueryTextPosition } from '@memberjunction/core-entities';

/** One template tag written inside a SQL string literal. */
interface QuotedTag {
    /** The tag, e.g. `{{ Region }}`. */
    readonly Tag: string;
    /** The parameter the tag reads; `null` when it is not a plain `{{ name }}`. */
    readonly Parameter: string | null;
    /** The whole string literal the tag sits in, quotes included, e.g. `'{{ Region }}'`. */
    readonly Literal: string;
    readonly Line: number;
    readonly Column: number;
}

/** The first name a `{{ … }}` tag reads, e.g. `Region` in `{{- Region | upper }}` or `Context.Now`. */
const TAG_PARAMETER = /^\{\{-?\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)/;

/** A composition tag, `{{query:"…"}}`. */
const COMPOSITION_TAG_TEXT = /^\{\{-?\s*query\s*:/;

/**
 * Whether a tag written inside a SQL string literal pastes a value there: a `{{ … }}` value tag.
 * A composition tag in a literal stays literal text, and a `{% %}` block or `{# #}` comment pastes
 * no value, so a run does not stop for those (a save still refuses them).
 */
export function IsQuotedValueTag(tagText: string): boolean {
    return tagText.startsWith('{{') && !COMPOSITION_TAG_TEXT.test(tagText);
}

/**
 * Why a query whose SQL writes a template tag inside a SQL string literal (`'{{ Region }}'`) may
 * not run, written for the people who own the query: which tags, where, why it is refused, the
 * exact fix, and how to find every query with the same problem.
 *
 * The positions are read from `sql` as stored (comments included), so they match what an editor
 * shows. Returns `null` when `sql` has no such tag.
 *
 * @param queryName - Names the query; a request that is not a saved query passes `null`.
 */
export function QuotedTagRefusalMessage(queryName: string | null, sql: string, dialect: SQLDialect): string | null {
    const tags = FindQuotedTags(sql, dialect);
    if (tags.length === 0) return null;
    const subject = queryName ? `Query "${queryName}"` : 'This query';
    return [
        `${subject} cannot run: its SQL writes a template tag inside quotes, ${tags.map(describeTag).join('; ')}.`,
        'MJ pastes the value between those quotes without escaping it, so a value that contains a quote can change the statement. MJ therefore refuses to run the query until it is fixed.',
        fixFor(tags[0]),
        'When the value is not text, use the filter for its type instead (sqlNumber, sqlDate, sqlBoolean).',
        `To list every saved query with this problem, run \`mj query refresh --all --dry-run\`: each is reported as an Error (${MJQueryDiagnosticCodes.TagInStringLiteral}).`,
    ].join(' ');
}

/** The exact rewrite for a quoted tag: the filter that writes the whole literal from the value. */
function fixFor(tag: QuotedTag): string {
    const name = tag.Parameter ?? 'Value';
    const body = tag.Literal.slice(1, -1);
    if (body === tag.Tag) {
        return `Fix: replace ${tag.Literal} with {{ ${name} | sqlString }} and drop the surrounding quotes; sqlString adds the quotes and escapes the value.`;
    }
    const like = body === `%${tag.Tag}%` ? 'sqlLikeContains' : body === `${tag.Tag}%` ? 'sqlLikeBegins' : body === `%${tag.Tag}` ? 'sqlLikeEnds' : null;
    if (like) {
        return `Fix: replace ${tag.Literal} with {{ ${name} | ${like} }} and drop the surrounding quotes; ${like} adds the quotes, the % wildcards and the escaping.`;
    }
    return `Fix: take the tag out of the quotes and give it a filter, joining any fixed text in SQL, e.g. CONCAT('…', {{ ${name} | sqlString }}, '…') in place of ${tag.Literal}; sqlString adds the quotes and escapes the value.`;
}

/** The template tags `sql` writes inside SQL string literals, in source order. */
export function FindQuotedTags(sql: string, dialect: SQLDialect): QuotedTag[] {
    const tokens = SqlTokens.Lex(sql, dialect);
    return tokens.Diagnostics
        .filter(d => d.Code === MJQueryDiagnosticCodes.TagInStringLiteral && IsQuotedValueTag(sql.substring(d.Span.Start, d.Span.End)))
        .map(d => quotedTag(sql, d.Span, enclosingLiteral(tokens, d.Span)));
}

function quotedTag(sql: string, span: Span, literal: Span): QuotedTag {
    const tag = sql.substring(span.Start, span.End);
    const at = QueryTextPosition(sql, span.Start);
    return { Tag: tag, Parameter: TAG_PARAMETER.exec(tag)?.[1] ?? null, Literal: sql.substring(literal.Start, literal.End), Line: at.Line, Column: at.Column };
}

/** The full extent of the string literal the tag at `span` interrupts; the tag itself when none is found. */
function enclosingLiteral(tokens: SqlTokens, span: Span): Span {
    const piece = tokens.Tokens.find(t => t.Enclosing !== null && t.Enclosing.Start <= span.Start && t.Enclosing.End >= span.End);
    return piece?.Enclosing ?? span;
}

function describeTag(tag: QuotedTag): string {
    const kind = tag.Parameter?.startsWith('Context.') ? 'context value' : 'parameter';
    const parameter = tag.Parameter ? ` (${kind} "${tag.Parameter}")` : '';
    return `${tag.Tag}${parameter} at line ${tag.Line}, column ${tag.Column}: ${tag.Literal}`;
}
