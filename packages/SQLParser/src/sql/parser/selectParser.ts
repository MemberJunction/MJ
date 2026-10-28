import { SqlDocumentDiagnosticCodes } from '../sqlDiagnosticCodes.js';
import type { SqlExpression } from '../sqlExpression.js';
import { NEVER_ALIAS_WORDS, VALUE_KEYWORDS } from '../sqlKeywords.js';
import type {
    ConditionClause, DistinctClause, GroupByClause, IdentifierNode, IntoClause, ObjectName, SelectCore, SelectItem,
    TopClause, UnknownNode, ValuesQuery, WindowClause, WindowDefinition,
} from '../sqlNodes.js';
import { FromParser } from './fromParser.js';
import type { ClauseBoundary, ParseContext } from './parseContext.js';

const ROLLUP_WORDS: ReadonlySet<string> = new Set(['WITH']);
const INTO_MODIFIERS: ReadonlySet<string> = new Set(['TEMP', 'TEMPORARY', 'UNLOGGED', 'TABLE', 'GLOBAL', 'LOCAL']);

/** The block clauses a select core reads, in any order, each at most once. */
type CoreClauses = {
    Into: IntoClause | null;
    From: SelectCore['From'];
    Where: ConditionClause | null;
    GroupBy: GroupByClause | null;
    Having: ConditionClause | null;
    Window: WindowClause | null;
    Qualify: ConditionClause | null;
    Unrecognized: UnknownNode[];
};

/** How an alias was found on a select item. */
interface AliasSplit {
    readonly Alias: IdentifierNode | null;
    readonly Form: SelectItem['AliasForm'];
    readonly ExpressionStart: number;
    readonly ExpressionEnd: number;
}

/** Reads `SELECT` blocks and `VALUES` lists. */
export class SelectParser {
    private readonly from: FromParser;
    private readonly equalsAlias: boolean;
    private readonly stringAlias: boolean;

    constructor(private readonly ctx: ParseContext) {
        this.from = new FromParser(ctx);
        const forms = ctx.Grammar.ExtraColumnAliasForms ?? [];
        this.equalsAlias = forms.includes('equals');
        this.stringAlias = forms.includes('string');
    }

    /** Reads a select block starting at the `SELECT` at the cursor. */
    Parse(end: number): SelectCore {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos++;
        const distinct = this.parseDistinct(end);
        const top = this.parseTop(end);
        const listStart = ctx.Pos;
        const items = this.parseSelectList(end);
        const listSpan = ctx.Span(listStart, ctx.Pos);
        const clauses = this.parseClauses(end);
        return Object.freeze({
            Kind: 'Select', Span: ctx.Span(start, ctx.Pos), Distinct: distinct, Top: top, SelectList: Object.freeze(items),
            SelectListSpan: listSpan, ...clauses, Unrecognized: Object.freeze(clauses.Unrecognized),
            OrderBy: null, Limit: null, Offset: null, Fetch: null, For: null, Option: null,
        });
    }

    /** Reads `VALUES (…), (…)` at the cursor. */
    ParseValues(end: number): ValuesQuery {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos++;
        const rows = this.ReadRows(end);
        return Object.freeze({
            Kind: 'Values', Span: ctx.Span(start, ctx.Pos), Rows: rows,
            OrderBy: null, Limit: null, Offset: null, Fetch: null, For: null, Option: null,
        });
    }

    /** Reads comma-separated row expressions at the cursor. */
    ReadRows(end: number): readonly SqlExpression[] {
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

    private parseDistinct(end: number): DistinctClause | null {
        const ctx = this.ctx;
        const start = ctx.Pos;
        if (ctx.T.IsWord(start, 'ALL')) {
            ctx.Pos++;
            return Object.freeze({ Kind: 'Distinct', Span: ctx.Span(start, ctx.Pos), Form: 'All', On: Object.freeze([]) });
        }
        if (!ctx.T.IsWord(start, 'DISTINCT')) return null;
        ctx.Pos++;
        if (!ctx.T.IsWord(ctx.Pos, 'ON') || !ctx.T.IsChar(ctx.Pos + 1, '(')) {
            return Object.freeze({ Kind: 'Distinct', Span: ctx.Span(start, ctx.Pos), Form: 'Distinct', On: Object.freeze([]) });
        }
        const open = ctx.Pos + 1;
        const close = ctx.T.Match(open);
        const last = close < 0 || close >= end ? end : close;
        ctx.Pos = open + 1;
        const on = this.expressionList(last);
        ctx.Pos = last < end ? last + 1 : end;
        return Object.freeze({ Kind: 'Distinct', Span: ctx.Span(start, ctx.Pos), Form: 'DistinctOn', On: on });
    }

    /** Comma-separated expressions from the cursor to `end`. */
    private expressionList(end: number): readonly SqlExpression[] {
        const ctx = this.ctx;
        const list: SqlExpression[] = [];
        while (ctx.Pos < end) {
            const itemEnd = ctx.ExpressionEnd(ctx.Pos, end, { Comma: true });
            if (itemEnd > ctx.Pos) list.push(ctx.Expression(ctx.Pos, itemEnd));
            ctx.Pos = itemEnd;
            if (!ctx.T.IsChar(ctx.Pos, ',')) break;
            ctx.Pos++;
        }
        return Object.freeze(list);
    }

    private parseTop(end: number): TopClause | null {
        const ctx = this.ctx;
        const start = ctx.Pos;
        if (!ctx.T.IsWord(start, 'TOP') || start + 1 >= end || ctx.T.IsChar(start + 1, ',')) return null;
        const parenthesized = ctx.T.IsChar(start + 1, '(');
        const close = parenthesized ? ctx.T.Match(start + 1) : -1;
        if (parenthesized && (close < 0 || close >= end)) return null;
        const value = parenthesized ? ctx.Expression(start + 2, close) : ctx.Expression(start + 1, start + 2);
        ctx.Pos = parenthesized ? close + 1 : start + 2;
        const percent = ctx.T.IsWord(ctx.Pos, 'PERCENT');
        if (percent) ctx.Pos++;
        const withTies = ctx.T.IsWord(ctx.Pos, 'WITH') && ctx.T.IsWord(ctx.Pos + 1, 'TIES');
        if (withTies) ctx.Pos += 2;
        if (!ctx.Grammar.RowCapForms.includes('top')) {
            ctx.Report(SqlDocumentDiagnosticCodes.NotInDialect, 'Warning', ctx.T.Tokens[start].Span, 'This dialect does not have SELECT TOP.');
        }
        return Object.freeze({ Kind: 'Top', Span: ctx.Span(start, ctx.Pos), Value: value, Parenthesized: parenthesized, Percent: percent, WithTies: withTies });
    }

    private parseSelectList(end: number): SelectItem[] {
        const ctx = this.ctx;
        const items: SelectItem[] = [];
        while (ctx.Pos < end && ctx.BoundaryAt(ctx.Pos) === null) {
            const itemEnd = ctx.ExpressionEnd(ctx.Pos, end, { Comma: true });
            if (itemEnd === ctx.Pos) break;
            items.push(this.selectItem(ctx.Pos, itemEnd));
            ctx.Pos = itemEnd;
            if (!ctx.T.IsChar(ctx.Pos, ',')) return items;
            ctx.Pos++;
        }
        if (items.length > 0) ctx.ReportEmpty(ctx.Pos, 'The select list ends with a comma.');
        return items;
    }

    private selectItem(start: number, end: number): SelectItem {
        const ctx = this.ctx;
        const star = this.starQualifier(start, end);
        const split = star === undefined ? this.splitAlias(start, end) : { Alias: null, Form: null, ExpressionStart: start, ExpressionEnd: end };
        return Object.freeze({
            Kind: 'SelectItem', Span: ctx.Span(start, end),
            Expression: ctx.Expression(split.ExpressionStart, split.ExpressionEnd),
            Alias: split.Alias, AliasForm: split.Form, IsStar: star !== undefined, StarQualifier: star ?? null,
        });
    }

    /** `null` for `*`, the qualifier for `q.*`, `undefined` when the item is not a star. */
    private starQualifier(start: number, end: number): ObjectName | null | undefined {
        const t = this.ctx.T;
        if (!t.IsChar(end - 1, '*')) return undefined;
        if (end - start === 1) return null;
        if (!t.IsChar(end - 2, '.')) return undefined;
        const name = t.ReadObjectName(start, end);
        return name !== null && name.Next === end - 2 ? name.Name : undefined;
    }

    private splitAlias(start: number, end: number): AliasSplit {
        const t = this.ctx.T;
        const none: AliasSplit = { Alias: null, Form: null, ExpressionStart: start, ExpressionEnd: end };
        if (end - start >= 3 && t.IsWord(end - 2, 'AS') && this.isAliasToken(end - 1, true)) {
            return { Alias: t.Identifier(end - 1), Form: 'As', ExpressionStart: start, ExpressionEnd: end - 2 };
        }
        if (this.equalsAlias && end - start >= 3 && this.isEqualsAlias(start)) {
            return { Alias: t.Identifier(start), Form: 'Equals', ExpressionStart: start + 2, ExpressionEnd: end };
        }
        if (end - start >= 2 && this.isAliasToken(end - 1, false) && this.endsValue(end - 2)) {
            const form = t.Tokens[end - 1].Kind === 'String' ? 'String' : 'Bare';
            return { Alias: t.Identifier(end - 1), Form: form, ExpressionStart: start, ExpressionEnd: end - 1 };
        }
        return none;
    }

    /** `alias = expression` (SQL Server): a name, then `=` that is not part of `==`, `<=`, `>=`, `!=`. */
    private isEqualsAlias(start: number): boolean {
        const t = this.ctx.T;
        const name = t.Tokens[start];
        const isName = (name.Kind === 'Word' && !name.Text.startsWith('@') && !t.IsReserved(start)) || name.Kind === 'QuotedIdentifier' || (this.stringAlias && name.Kind === 'String');
        return isName && t.IsChar(start + 1, '=') && !t.IsChar(start + 2, '=');
    }

    /** Whether token `i` can be an alias: after `AS` any name or quoted name, otherwise a non-reserved one. */
    private isAliasToken(i: number, afterAs: boolean): boolean {
        const t = this.ctx.T;
        const token = t.Tokens[i];
        if (token.Kind === 'QuotedIdentifier') return true;
        if (token.Kind === 'String') return this.stringAlias;
        if (token.Kind !== 'Word' || token.Text.startsWith('@')) return false;
        if (afterAs) return true;
        return !t.IsReserved(i) && !NEVER_ALIAS_WORDS.has(t.Upper(i));
    }

    /** Whether token `i` ends a value, so a name after it is an alias. */
    private endsValue(i: number): boolean {
        const t = this.ctx.T;
        const token = t.Tokens[i];
        switch (token.Kind) {
            case 'Number': case 'String': case 'QuotedIdentifier': case 'TemplateExpression':
                return true;
            case 'Punctuation':
                return token.Text === ')';
            case 'Word':
                return (!t.IsReserved(i) || VALUE_KEYWORDS.has(t.Upper(i))) && !t.IsWord(i - 1, 'INTERVAL');
            default:
                return false;
        }
    }

    /** Reads the block's clauses after the select list. */
    private parseClauses(end: number): CoreClauses {
        const clauses: CoreClauses = { Into: null, From: null, Where: null, GroupBy: null, Having: null, Window: null, Qualify: null, Unrecognized: [] };
        while (this.ctx.Pos < end) {
            const boundary = this.ctx.BoundaryAt(this.ctx.Pos);
            if (isQueryLevel(boundary)) break;
            if (!this.parseClause(boundary, clauses, end)) clauses.Unrecognized.push(this.unknownClause(end));
        }
        return clauses;
    }

    /** Reads one clause into `clauses`; false when the boundary is not a block clause or was already read. */
    private parseClause(boundary: ClauseBoundary | null, clauses: CoreClauses, end: number): boolean {
        switch (boundary) {
            case 'Into': return clauses.Into === null && (clauses.Into = this.parseInto(end)) !== null;
            case 'From': return clauses.From === null && (clauses.From = this.from.ParseFrom(end)) !== null;
            case 'Where': return clauses.Where === null && (clauses.Where = this.condition('Where', 1, end)) !== null;
            case 'GroupBy': return clauses.GroupBy === null && (clauses.GroupBy = this.parseGroupBy(end)) !== null;
            case 'Having': return clauses.Having === null && (clauses.Having = this.condition('Having', 1, end)) !== null;
            case 'Window': return clauses.Window === null && (clauses.Window = this.parseWindow(end)) !== null;
            case 'Qualify': return clauses.Qualify === null && (clauses.Qualify = this.condition('Qualify', 1, end)) !== null;
            default: return false;
        }
    }

    private unknownClause(end: number): UnknownNode {
        const ctx = this.ctx;
        const start = ctx.Pos;
        let k = start + 1;
        while (k < end && ctx.BoundaryAt(k) === null) {
            const close = ctx.T.IsChar(k, '(') ? ctx.T.Match(k) : -1;
            k = ctx.T.IsChar(k, '(') ? (close < 0 ? end : close + 1) : k + 1;
        }
        ctx.Pos = Math.min(k, end);
        return ctx.Unknown(start, ctx.Pos, 'This part of the SELECT is not a clause the parser knows.');
    }

    private condition(kind: ConditionClause['Kind'], keywordLength: number, end: number): ConditionClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos += keywordLength;
        const conditionEnd = ctx.ExpressionEnd(ctx.Pos, end);
        if (conditionEnd === ctx.Pos) ctx.ReportEmpty(start, `This ${ctx.T.Upper(start)} has no condition.`);
        const condition = ctx.Expression(ctx.Pos, conditionEnd);
        ctx.Pos = conditionEnd;
        return Object.freeze({ Kind: kind, Span: ctx.Span(start, ctx.Pos), Condition: condition });
    }

    private parseInto(end: number): IntoClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        let k = start + 1;
        while (INTO_MODIFIERS.has(ctx.T.Upper(k))) k++;
        const name = ctx.T.Tokens[k]?.Text.startsWith('@') ? null : ctx.T.ReadObjectName(k, end);
        const target = name !== null && !['OUTFILE', 'DUMPFILE'].includes(ctx.T.Upper(k)) ? name.Name : null;
        ctx.Pos = ctx.ExpressionEnd(name?.Next ?? k, end);
        return Object.freeze({ Kind: 'Into', Span: ctx.Span(start, ctx.Pos), Target: target });
    }

    private parseGroupBy(end: number): GroupByClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos += 2;
        if (ctx.T.IsWord(ctx.Pos, 'ALL') || ctx.T.IsWord(ctx.Pos, 'DISTINCT')) ctx.Pos++;
        const items: SqlExpression[] = [];
        let trailingComma = false;
        while (ctx.Pos < end) {
            const itemEnd = ctx.ExpressionEnd(ctx.Pos, end, { Comma: true, Words: ROLLUP_WORDS });
            if (itemEnd === ctx.Pos) break;
            items.push(ctx.Expression(ctx.Pos, itemEnd));
            ctx.Pos = itemEnd;
            trailingComma = ctx.T.IsChar(ctx.Pos, ',');
            if (!trailingComma) break;
            ctx.Pos++;
        }
        if (items.length === 0 || trailingComma) ctx.ReportEmpty(ctx.Pos, items.length === 0 ? 'This GROUP BY names nothing.' : 'The GROUP BY list ends with a comma.');
        if (ctx.T.IsWord(ctx.Pos, 'WITH') && (ctx.T.IsWord(ctx.Pos + 1, 'ROLLUP') || ctx.T.IsWord(ctx.Pos + 1, 'CUBE'))) ctx.Pos += 2;
        return Object.freeze({ Kind: 'GroupBy', Span: ctx.Span(start, ctx.Pos), Items: Object.freeze(items) });
    }

    private parseWindow(end: number): WindowClause {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos++;
        const definitions: WindowDefinition[] = [];
        while (ctx.Pos < end && ctx.T.IsAnyName(ctx.Pos) && ctx.T.IsWord(ctx.Pos + 1, 'AS') && ctx.T.IsChar(ctx.Pos + 2, '(')) {
            const nameIndex = ctx.Pos;
            const open = nameIndex + 2;
            const close = ctx.T.Match(open);
            const last = close < 0 || close >= end ? end : close;
            definitions.push(Object.freeze({
                Kind: 'WindowDefinition', Span: ctx.Span(nameIndex, Math.min(last + 1, end)), Name: ctx.T.Identifier(nameIndex),
                Specification: ctx.Expression(open + 1, last, true),
            }));
            ctx.Pos = Math.min(last + 1, end);
            if (!ctx.T.IsChar(ctx.Pos, ',')) break;
            ctx.Pos++;
        }
        return Object.freeze({ Kind: 'Window', Span: ctx.Span(start, ctx.Pos), Definitions: Object.freeze(definitions) });
    }
}

/** Boundaries that end a select block: tail clauses, set operators, the end of the query, a new statement. */
function isQueryLevel(boundary: ClauseBoundary | null): boolean {
    switch (boundary) {
        case 'Close': case 'Semicolon': case 'OrderBy': case 'SetOperation': case 'Limit': case 'Offset': case 'Fetch':
        case 'For': case 'Option': case 'Statement':
            return true;
        default:
            return false;
    }
}
