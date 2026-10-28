import { SqlDocumentDiagnosticCodes } from '../sqlDiagnosticCodes.js';
import { FOR_CLAUSE_FORMS } from '../sqlKeywords.js';
import type {
    FetchClause, ForClause, ForClauseForm, LimitClause, OffsetClause, OptionClause, OrderByClause, OrderByItem,
    QueryExpression, QueryTailClauses,
} from '../sqlNodes.js';
import type { ParseContext } from './parseContext.js';

const ROW_WORDS: ReadonlySet<string> = new Set(['ROW', 'ROWS']);
const FETCH_STOP_WORDS: ReadonlySet<string> = new Set(['ROW', 'ROWS', 'PERCENT']);
const DOCUMENT_FORMS: Readonly<Partial<Record<ForClauseForm, string>>> = { Json: 'FOR JSON', Xml: 'FOR XML' };

/** A mutable set of tail clauses while they are being read. */
type MutableTail = { -readonly [K in keyof QueryTailClauses]: QueryTailClauses[K] };

/** Reads the clauses that can follow a query expression: ORDER BY, LIMIT, OFFSET, FETCH, FOR and OPTION. */
export class TailParser {
    constructor(private readonly ctx: ParseContext) {}

    /** Tail clauses with nothing set. */
    Empty(): QueryTailClauses {
        return { OrderBy: null, Limit: null, Offset: null, Fetch: null, For: null, Option: null };
    }

    /** Reads the tail clauses at the cursor, in any order, each at most once. */
    Parse(end: number): QueryTailClauses {
        const tail: MutableTail = { ...this.Empty() };
        while (this.ctx.Pos < end && this.parseOne(tail, end)) { /* each call reads one clause */ }
        return tail;
    }

    /** `expr` with `tail` attached, its span extended over them; `expr` itself when the tail is empty. */
    Attach(expr: QueryExpression, tail: QueryTailClauses): QueryExpression {
        const ends = [tail.OrderBy, tail.Limit, tail.Offset, tail.Fetch, tail.For, tail.Option].map(c => c?.Span.End ?? -1);
        const last = Math.max(...ends);
        if (last < 0) return expr;
        const span = Object.freeze({ Start: expr.Span.Start, End: Math.max(last, expr.Span.End) });
        if (expr.Kind === 'Unknown') return Object.freeze({ ...expr, Span: span });
        return Object.freeze({ ...expr, ...tail, Span: span });
    }

    private parseOne(tail: MutableTail, end: number): boolean {
        switch (this.ctx.BoundaryAt(this.ctx.Pos)) {
            case 'OrderBy': return tail.OrderBy === null && (tail.OrderBy = this.parseOrderBy(end)) !== null;
            case 'Limit': return tail.Limit === null && (tail.Limit = this.parseLimit(end)) !== null;
            case 'Offset': return tail.Offset === null && (tail.Offset = this.parseOffset(end)) !== null;
            case 'Fetch': return tail.Fetch === null && (tail.Fetch = this.parseFetch(end)) !== null;
            case 'For': return tail.For === null && (tail.For = this.parseFor(end)) !== null;
            case 'Option': return tail.Option === null && (tail.Option = this.parseOption(end)) !== null;
            default: return false;
        }
    }

    private parseOrderBy(end: number): OrderByClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos += 2;
        const items: OrderByItem[] = [];
        let trailingComma = false;
        while (ctx.Pos < end) {
            const itemEnd = ctx.ExpressionEnd(ctx.Pos, end, { Comma: true });
            if (itemEnd === ctx.Pos) break;
            items.push(this.orderByItem(ctx.Pos, itemEnd));
            ctx.Pos = itemEnd;
            trailingComma = ctx.T.IsChar(ctx.Pos, ',');
            if (!trailingComma) break;
            ctx.Pos++;
        }
        if (items.length === 0 || trailingComma) ctx.ReportEmpty(ctx.Pos, items.length === 0 ? 'This ORDER BY names nothing.' : 'The ORDER BY list ends with a comma.');
        return Object.freeze({ Kind: 'OrderBy', Span: ctx.Span(start, ctx.Pos), Items: Object.freeze(items) });
    }

    private orderByItem(start: number, end: number): OrderByItem {
        const t = this.ctx.T;
        let last = end;
        let nulls: 'First' | 'Last' | null = null;
        if (last - start >= 3 && t.IsWord(last - 2, 'NULLS') && (t.IsWord(last - 1, 'FIRST') || t.IsWord(last - 1, 'LAST'))) {
            nulls = t.IsWord(last - 1, 'FIRST') ? 'First' : 'Last';
            last -= 2;
        }
        let direction: 'Asc' | 'Desc' | null = null;
        if (last - start >= 2 && (t.IsWord(last - 1, 'ASC') || t.IsWord(last - 1, 'DESC'))) {
            direction = t.IsWord(last - 1, 'ASC') ? 'Asc' : 'Desc';
            last--;
        }
        const ordinal = last - start === 1 && t.Tokens[start].Kind === 'Number' && /^\d+$/.test(t.Tokens[start].Text);
        return Object.freeze({
            Kind: 'OrderByItem', Span: this.ctx.Span(start, end), Expression: this.ctx.Expression(start, last),
            Direction: direction, Nulls: nulls, IsOrdinal: ordinal,
        });
    }

    private parseLimit(end: number): LimitClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos++;
        if (ctx.T.IsWord(ctx.Pos, 'ALL')) {
            ctx.Pos++;
            return Object.freeze({ Kind: 'Limit', Span: ctx.Span(start, ctx.Pos), Value: null, LeadingOffset: null });
        }
        const firstEnd = ctx.ExpressionEnd(ctx.Pos, end, { Comma: true });
        const first = ctx.Expression(ctx.Pos, firstEnd);
        ctx.Pos = firstEnd;
        if (!ctx.T.IsChar(ctx.Pos, ',')) {
            return Object.freeze({ Kind: 'Limit', Span: ctx.Span(start, ctx.Pos), Value: first, LeadingOffset: null });
        }
        ctx.Pos++;
        const secondEnd = ctx.ExpressionEnd(ctx.Pos, end, { Comma: true });
        const second = ctx.Expression(ctx.Pos, secondEnd);
        ctx.Pos = secondEnd;
        return Object.freeze({ Kind: 'Limit', Span: ctx.Span(start, ctx.Pos), Value: second, LeadingOffset: first });
    }

    private parseOffset(end: number): OffsetClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos++;
        const valueEnd = ctx.ExpressionEnd(ctx.Pos, end, { Words: ROW_WORDS });
        const value = ctx.Expression(ctx.Pos, valueEnd);
        ctx.Pos = valueEnd;
        if (ROW_WORDS.has(ctx.T.Upper(ctx.Pos))) ctx.Pos++;
        this.checkForm('offset', start);
        return Object.freeze({ Kind: 'Offset', Span: ctx.Span(start, ctx.Pos), Value: value });
    }

    private parseFetch(end: number): FetchClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos += 2;
        const valueEnd = ctx.ExpressionEnd(ctx.Pos, end, { Words: FETCH_STOP_WORDS });
        const value = valueEnd > ctx.Pos ? ctx.Expression(ctx.Pos, valueEnd) : null;
        ctx.Pos = valueEnd;
        const percent = ctx.T.IsWord(ctx.Pos, 'PERCENT');
        if (percent) ctx.Pos++;
        if (ROW_WORDS.has(ctx.T.Upper(ctx.Pos))) ctx.Pos++;
        let withTies = false;
        if (ctx.T.IsWord(ctx.Pos, 'ONLY')) {
            ctx.Pos++;
        } else if (ctx.T.IsWord(ctx.Pos, 'WITH') && ctx.T.IsWord(ctx.Pos + 1, 'TIES')) {
            ctx.Pos += 2;
            withTies = true;
        }
        if (!ctx.Grammar.RowCapForms.includes('offset-fetch')) this.notInDialect(start, 'OFFSET … FETCH');
        return Object.freeze({ Kind: 'Fetch', Span: ctx.Span(start, ctx.Pos), Value: value, Percent: percent, WithTies: withTies });
    }

    /** OFFSET alone is in both the LIMIT / OFFSET and the OFFSET / FETCH forms. */
    private checkForm(clause: 'offset', start: number): void {
        const forms = this.ctx.Grammar.RowCapForms;
        if (clause === 'offset' && !forms.includes('offset-fetch') && !forms.includes('limit-offset')) this.notInDialect(start, 'OFFSET');
    }

    private parseFor(end: number): ForClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        const form: ForClauseForm = FOR_CLAUSE_FORMS.get(ctx.T.Upper(start + 1)) ?? 'Other';
        while (ctx.BoundaryAt(ctx.Pos) === 'For') {
            ctx.Pos += forKeywordLength(ctx.T.Upper(ctx.Pos + 1));
            ctx.Pos = ctx.ExpressionEnd(ctx.Pos, end);
        }
        const documentClause = DOCUMENT_FORMS[form];
        if (documentClause !== undefined && !ctx.Grammar.DocumentTailClauses.includes(documentClause)) this.notInDialect(start, documentClause);
        return Object.freeze({ Kind: 'For', Span: ctx.Span(start, ctx.Pos), Form: form });
    }

    private parseOption(end: number): OptionClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        const open = start + 1;
        const close = ctx.T.Match(open);
        const last = close < 0 || close >= end ? end : close;
        const hints = ctx.Expression(open + 1, last);
        ctx.Pos = close < 0 || close >= end ? end : close + 1;
        return Object.freeze({ Kind: 'Option', Span: ctx.Span(start, ctx.Pos), Hints: hints, ListSpan: ctx.Span(open, ctx.Pos) });
    }

    private notInDialect(start: number, what: string): void {
        this.ctx.Report(SqlDocumentDiagnosticCodes.NotInDialect, 'Warning', this.ctx.T.Tokens[start].Span, `This dialect does not have ${what}.`);
    }
}

/** How many tokens a FOR clause's opening keywords take: `FOR NO KEY UPDATE` is four. */
function forKeywordLength(second: string): number {
    if (second === 'NO') return 4;
    if (second === 'KEY' || second === 'READ') return 3;
    return 2;
}
