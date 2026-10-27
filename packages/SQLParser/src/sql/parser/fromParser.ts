import type { Span } from '../../common/analysis.js';
import { SqlDocumentDiagnosticCodes } from '../sqlDiagnosticCodes.js';
import { JOIN_HINTS } from '../sqlKeywords.js';
import type { FromClause, FromSource, IdentifierNode, JoinKind, JoinSource, ObjectName, SourceAlias } from '../sqlNodes.js';
import type { SqlExpression } from '../sqlExpression.js';
import type { ParseContext } from './parseContext.js';

const JOIN_KINDS: Readonly<Record<string, JoinKind>> = { INNER: 'Inner', LEFT: 'Left', RIGHT: 'Right', FULL: 'Full', CROSS: 'Cross' };
const INDEX_HINT_WORDS: ReadonlySet<string> = new Set(['USE', 'FORCE', 'IGNORE']);

/** Reads FROM clauses: comma-separated sources, each a tree of joins, APPLYs and PIVOTs. */
export class FromParser {
    constructor(private readonly ctx: ParseContext) {}

    /** Reads `FROM source, …` starting at the `FROM` at the cursor. */
    ParseFrom(end: number): FromClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos++;
        const sources: FromSource[] = [];
        while (ctx.Pos < end && ctx.BoundaryAt(ctx.Pos) === null) {
            const before = ctx.Pos;
            sources.push(this.parseJoined(end));
            if (ctx.Pos === before) break;
            if (!ctx.T.IsChar(ctx.Pos, ',')) break;
            ctx.Pos++;
        }
        return Object.freeze({ Kind: 'From', Span: ctx.Span(start, ctx.Pos), Sources: Object.freeze(sources) });
    }

    private parseJoined(end: number): FromSource {
        let left = this.parsePrimary(end);
        for (;;) {
            const pos = this.ctx.Pos;
            if (pos >= end || !this.ctx.JoinStarts(pos)) return left;
            const upper = this.ctx.T.Upper(pos);
            if (upper === 'PIVOT' || upper === 'UNPIVOT') left = this.parsePivot(left, end);
            else if (this.ctx.T.IsWord(pos + 1, 'APPLY')) left = this.parseApply(left, end);
            else left = this.parseJoin(left, end);
        }
    }

    private parseJoin(left: FromSource, end: number): FromSource {
        const ctx = this.ctx;
        const keywordStart = ctx.Pos;
        const natural = ctx.T.IsWord(ctx.Pos, 'NATURAL');
        if (natural) ctx.Pos++;
        const kind = JOIN_KINDS[ctx.T.Upper(ctx.Pos)] ?? 'Inner';
        if (JOIN_KINDS[ctx.T.Upper(ctx.Pos)] !== undefined) ctx.Pos++;
        if (ctx.T.IsWord(ctx.Pos, 'OUTER')) ctx.Pos++;
        if (JOIN_HINTS.has(ctx.T.Upper(ctx.Pos))) ctx.Pos++;
        if (!ctx.T.IsWord(ctx.Pos, 'JOIN') && !ctx.T.IsWord(ctx.Pos, 'STRAIGHT_JOIN')) {
            ctx.Pos = Math.max(ctx.Pos, keywordStart + 1);
            return this.joinFailure(left, keywordStart);
        }
        ctx.Pos++;
        const keywordSpan = ctx.Span(keywordStart, ctx.Pos);
        const right = this.parsePrimary(end);
        const condition = this.parseJoinCondition(end);
        return Object.freeze({
            Kind: 'Join', Span: Object.freeze({ Start: left.Span.Start, End: this.lastEnd() }), JoinKind: kind, Natural: natural,
            KeywordSpan: keywordSpan, Left: left, Right: right, On: condition.On, Using: condition.Using,
        }) satisfies JoinSource;
    }

    private joinFailure(left: FromSource, keywordStart: number): FromSource {
        const unknown = this.ctx.Unknown(keywordStart, this.ctx.Pos, 'This join could not be read: expected JOIN.');
        return Object.freeze({
            Kind: 'Join', Span: Object.freeze({ Start: left.Span.Start, End: unknown.Span.End }), JoinKind: 'Inner', Natural: false,
            KeywordSpan: unknown.Span, Left: left, Right: unknown, On: null, Using: null,
        });
    }

    private parseJoinCondition(end: number): { On: SqlExpression | null; Using: readonly IdentifierNode[] | null } {
        const ctx = this.ctx;
        if (ctx.T.IsWord(ctx.Pos, 'ON')) {
            ctx.Pos++;
            const conditionEnd = ctx.ExpressionEnd(ctx.Pos, end, { Join: true });
            const on = ctx.Expression(ctx.Pos, conditionEnd);
            ctx.Pos = conditionEnd;
            return { On: on, Using: null };
        }
        if (ctx.T.IsWord(ctx.Pos, 'USING') && ctx.T.IsChar(ctx.Pos + 1, '(')) {
            return { On: null, Using: ctx.ReadNameList(ctx.Pos + 1) };
        }
        return { On: null, Using: null };
    }

    private parseApply(left: FromSource, end: number): FromSource {
        const ctx = this.ctx;
        const start = ctx.Pos;
        const applyKind = ctx.T.IsWord(start, 'OUTER') ? 'Outer' : 'Cross';
        ctx.Pos += 2;
        if (ctx.Grammar.CorrelatedJoin !== 'apply' && ctx.Grammar.CorrelatedJoin !== 'both') {
            ctx.Report(SqlDocumentDiagnosticCodes.NotInDialect, 'Warning', ctx.Span(start, ctx.Pos), 'This dialect does not have CROSS / OUTER APPLY.');
        }
        const right = this.parsePrimary(end);
        return Object.freeze({
            Kind: 'Apply', Span: Object.freeze({ Start: left.Span.Start, End: right.Span.End }), ApplyKind: applyKind, Left: left, Right: right,
        });
    }

    private parsePivot(left: FromSource, end: number): FromSource {
        const ctx = this.ctx;
        const form = ctx.T.IsWord(ctx.Pos, 'PIVOT') ? 'Pivot' : 'Unpivot';
        const open = ctx.Pos + 1;
        const close = ctx.T.Match(open);
        if (!ctx.T.IsChar(open, '(') || close < 0 || close >= end) {
            ctx.Pos = Math.min(open, end);
            return this.joinFailure(left, open - 1);
        }
        const body = ctx.Expression(open + 1, close);
        ctx.Pos = close + 1;
        const alias = this.parseAlias(end);
        return Object.freeze({
            Kind: 'Pivot', Span: Object.freeze({ Start: left.Span.Start, End: this.lastEnd() }), Form: form, Source: left, Body: body, ...alias,
        });
    }

    /** Reads one source: a table, function, derived table, VALUES list or parenthesized join. */
    private parsePrimary(end: number): FromSource {
        const ctx = this.ctx;
        const start = ctx.Pos;
        const lateral = ctx.T.IsWord(start, 'LATERAL');
        if (lateral) this.readLateral();
        const at = ctx.Pos;
        if (ctx.T.IsChar(at, '(')) return this.parseParenthesized(start, at, end, lateral);
        if (ctx.T.IsTemplate(at)) return this.parseTemplateSource(at, end);
        const name = ctx.T.ReadObjectName(at, end);
        if (name === null) {
            ctx.Pos = Math.min(at + 1, end);
            return ctx.Unknown(at, ctx.Pos, 'Expected a table, function or subquery here.');
        }
        ctx.Pos = name.Next;
        if (ctx.T.IsChar(ctx.Pos, '(')) return this.parseFunction(start, name.Name, end, lateral);
        return this.parseTable(at, name.Name, end);
    }

    private readLateral(): void {
        const ctx = this.ctx;
        if (ctx.Grammar.CorrelatedJoin !== 'lateral' && ctx.Grammar.CorrelatedJoin !== 'both') {
            ctx.Report(SqlDocumentDiagnosticCodes.NotInDialect, 'Warning', ctx.T.Tokens[ctx.Pos].Span, 'This dialect does not have LATERAL.');
        }
        ctx.Pos++;
    }

    private parseTable(start: number, name: ObjectName, end: number): FromSource {
        const before = this.tableHints(end);
        const alias = this.parseAlias(end);
        const after = this.tableHints(end);
        const hints = mergeSpans(before, after);
        return Object.freeze({ Kind: 'Table', Span: this.ctx.Span(start, this.ctx.Pos), Name: name, Hints: hints, ...alias });
    }

    private parseFunction(start: number, name: ObjectName, end: number, lateral: boolean): FromSource {
        const ctx = this.ctx;
        const open = ctx.Pos;
        const close = ctx.T.Match(open);
        const last = close < 0 || close >= end ? end : close;
        const args = ctx.Expression(open + 1, last);
        ctx.Pos = last < end ? last + 1 : end;
        const options = this.functionOptions(end);
        const alias = this.parseAlias(end);
        return Object.freeze({
            Kind: 'Function', Span: ctx.Span(start, ctx.Pos), Name: name, Arguments: args, Lateral: lateral, Options: options, ...alias,
        });
    }

    /** `WITH ORDINALITY` (PostgreSQL) and `WITH (columns)` (T-SQL OPENJSON / OPENXML) after a function source. */
    private functionOptions(end: number): Span | null {
        const ctx = this.ctx;
        const start = ctx.Pos;
        if (ctx.T.IsWord(start, 'WITH') && ctx.T.IsWord(start + 1, 'ORDINALITY')) {
            ctx.Pos += 2;
        } else if (ctx.T.IsWord(start, 'WITH') && ctx.T.IsChar(start + 1, '(')) {
            const close = ctx.T.Match(start + 1);
            ctx.Pos = close < 0 || close >= end ? end : close + 1;
        }
        return ctx.Pos > start ? ctx.Span(start, ctx.Pos) : null;
    }

    private parseParenthesized(start: number, open: number, end: number, lateral: boolean): FromSource {
        const ctx = this.ctx;
        const close = ctx.T.Match(open);
        if (close < 0 || close >= end) {
            ctx.Pos = end;
            return ctx.Unknown(open, end, 'This parenthesized source is not closed.');
        }
        if (ctx.T.IsWord(open + 1, 'VALUES')) return this.parseValuesSource(start, open, close, end);
        if (this.isQueryInParentheses(open)) {
            const query = ctx.Query.ParseQueryNode(open + 1, close);
            ctx.Pos = close + 1;
            const alias = this.parseAlias(end);
            return Object.freeze({ Kind: 'Derived', Span: ctx.Span(start, ctx.Pos), Query: query, Lateral: lateral, ...alias });
        }
        return this.parseParenthesizedJoin(start, open, close, end);
    }

    private parseParenthesizedJoin(start: number, open: number, close: number, end: number): FromSource {
        const ctx = this.ctx;
        ctx.Pos = open + 1;
        let inner = this.parseJoined(close);
        if (ctx.Pos < close) inner = ctx.Unknown(open + 1, close, 'This parenthesized source could not be read.');
        ctx.Pos = close + 1;
        const alias = this.parseAlias(end);
        return Object.freeze({ Kind: 'ParenthesizedSource', Span: ctx.Span(start, ctx.Pos), Inner: inner, ...alias });
    }

    private parseValuesSource(start: number, open: number, close: number, end: number): FromSource {
        const ctx = this.ctx;
        ctx.Pos = open + 2;
        const rows = this.readRows(close);
        if (ctx.Pos < close) ctx.Unknown(ctx.Pos, close, 'This text in a VALUES list could not be read.');
        ctx.Pos = close + 1;
        const alias = this.parseAlias(end);
        return Object.freeze({ Kind: 'ValuesSource', Span: ctx.Span(start, ctx.Pos), Rows: rows, ...alias });
    }

    private readRows(end: number): readonly SqlExpression[] {
        const ctx = this.ctx;
        const rows: SqlExpression[] = [];
        while (ctx.Pos < end) {
            const rowEnd = ctx.ExpressionEnd(ctx.Pos, end, { Comma: true });
            if (rowEnd === ctx.Pos) break;
            rows.push(ctx.Expression(ctx.Pos, rowEnd));
            ctx.Pos = rowEnd;
            if (!ctx.T.IsChar(ctx.Pos, ',')) break;
            ctx.Pos++;
        }
        return Object.freeze(rows);
    }

    /**
     * Whether the parentheses at `open` hold a query rather than a join: they start with SELECT,
     * WITH or VALUES, or with a parenthesized query that a set operator or tail clause follows.
     */
    private isQueryInParentheses(open: number): boolean {
        const t = this.ctx.T;
        let at = open;
        for (let steps = 0; steps < 1000; steps++) {
            if (this.ctx.OpensQuery(at + 1)) return true;
            if (!t.IsChar(at + 1, '(')) return false;
            const innerClose = t.Match(at + 1);
            if (innerClose < 0) return false;
            if (innerClose + 1 !== t.Match(at)) {
                const after = t.Upper(innerClose + 1);
                return this.ctx.IsSetOperator(innerClose + 1) || after === 'ORDER' || after === 'LIMIT' || after === 'OFFSET' || after === 'FETCH';
            }
            at++;
        }
        return false;
    }

    /** A template tag where a source goes, such as a composition: kept as an Unknown node with its alias. */
    private parseTemplateSource(at: number, end: number): FromSource {
        const ctx = this.ctx;
        ctx.Pos = at + 1;
        this.parseAlias(end);
        return ctx.Unknown(at, ctx.Pos, 'A template tag stands where a source goes; render the template first.', SqlDocumentDiagnosticCodes.TemplateToken);
    }

    /** Reads `[AS] alias [(columns)]` at the cursor. */
    private parseAlias(end: number): SourceAlias {
        const ctx = this.ctx;
        let alias: IdentifierNode | null = null;
        if (ctx.T.IsWord(ctx.Pos, 'AS') && ctx.Pos + 1 < end && ctx.T.IsAnyName(ctx.Pos + 1)) {
            alias = ctx.T.Identifier(ctx.Pos + 1);
            ctx.Pos += 2;
        } else if (ctx.Pos < end && ctx.T.IsNamePart(ctx.Pos) && !this.isIndexHint(ctx.Pos) && !ctx.T.Tokens[ctx.Pos].Text.startsWith('@')) {
            alias = ctx.T.Identifier(ctx.Pos);
            ctx.Pos++;
        }
        const columns = alias !== null && ctx.T.IsChar(ctx.Pos, '(') && ctx.Pos < end ? ctx.ReadNameList(ctx.Pos) : Object.freeze([]);
        return { Alias: alias, ColumnAliases: columns };
    }

    /** Table hints, sampling, temporal and index-hint clauses after a table name; `null` when none. */
    private tableHints(end: number): Span | null {
        const ctx = this.ctx;
        const start = ctx.Pos;
        for (;;) {
            const next = this.hintEnd(ctx.Pos, end);
            if (next === ctx.Pos) break;
            ctx.Pos = next;
        }
        return ctx.Pos > start ? ctx.Span(start, ctx.Pos) : null;
    }

    /** The index after one hint clause starting at `i`; `i` when none starts there. */
    private hintEnd(i: number, end: number): number {
        const t = this.ctx.T;
        if (t.IsWord(i, 'WITH') && t.IsChar(i + 1, '(')) return this.afterParentheses(i + 1, end);
        if (t.IsWord(i, 'TABLESAMPLE')) {
            const open = t.IsChar(i + 1, '(') ? i + 1 : i + 2;
            const next = this.afterParentheses(open, end);
            return t.IsWord(next, 'REPEATABLE') ? this.afterParentheses(next + 1, end) : next;
        }
        if (this.isIndexHint(i)) return this.afterParentheses(i + 2, end);
        if (t.IsWord(i, 'FOR') && t.IsWord(i + 1, 'SYSTEM_TIME')) return Math.min(this.temporalEnd(i + 2, end), end);
        return i;
    }

    private isIndexHint(i: number): boolean {
        const t = this.ctx.T;
        return INDEX_HINT_WORDS.has(t.Upper(i)) && (t.IsWord(i + 1, 'INDEX') || t.IsWord(i + 1, 'KEY'));
    }

    /** `ALL`, `AS OF v`, `FROM a TO b`, `BETWEEN a AND b` or `CONTAINED IN (a, b)` after `FOR SYSTEM_TIME`. */
    private temporalEnd(i: number, end: number): number {
        const t = this.ctx.T;
        if (t.IsWord(i, 'ALL')) return i + 1;
        if (t.IsWord(i, 'AS') && t.IsWord(i + 1, 'OF')) return i + 3;
        if (t.IsWord(i, 'FROM') || t.IsWord(i, 'BETWEEN')) return i + 4;
        if (t.IsWord(i, 'CONTAINED')) return this.afterParentheses(i + 2, end);
        return i;
    }

    private afterParentheses(open: number, end: number): number {
        const close = this.ctx.T.IsChar(open, '(') ? this.ctx.T.Match(open) : -1;
        return close < 0 || close >= end ? Math.min(open + 1, end) : close + 1;
    }

    private lastEnd(): number {
        const previous = this.ctx.T.Tokens[this.ctx.Pos - 1];
        return previous?.Span.End ?? 0;
    }
}

function mergeSpans(a: Span | null, b: Span | null): Span | null {
    if (a === null) return b;
    if (b === null) return a;
    return Object.freeze({ Start: a.Start, End: b.End });
}
