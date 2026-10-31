import { SqlDocumentDiagnosticCodes } from '../sqlDiagnosticCodes.js';
import { SHORT_STATEMENT_KINDS, STATEMENT_KEYWORDS } from '../sqlKeywords.js';
import type {
    CTEDeclaration, QueryExpression, QueryNode, SetOperator, SqlStatementKind, StatementNode, UnknownNode,
    WithClause,
} from '../sqlNodes.js';
import { MAX_QUERY_NESTING, ParseContext } from './parseContext.js';
import type { QueryParsing } from './parseContext.js';
import { SelectParser } from './selectParser.js';
import { TailParser } from './tailParser.js';

const SET_OPERATORS: Readonly<Record<string, SetOperator>> = { UNION: 'Union', INTERSECT: 'Intersect', EXCEPT: 'Except', MINUS: 'Minus' };

/**
 * Reads statements, WITH clauses and query expressions (set operations of select blocks, with
 * their tail clauses) by recursive descent over a {@link ParseContext}.
 */
export class QueryParser implements QueryParsing {
    private readonly selects: SelectParser;
    private readonly tails: TailParser;

    constructor(private readonly ctx: ParseContext) {
        ctx.Query = this;
        this.tails = new TailParser(ctx);
        this.selects = new SelectParser(ctx);
    }

    /** Reads every statement in the token table. */
    ParseStatements(): StatementNode[] {
        const statements: StatementNode[] = [];
        const end = this.ctx.T.Length;
        while (this.ctx.Pos < end) {
            if (this.ctx.T.IsChar(this.ctx.Pos, ';')) {
                this.ctx.Pos++;
                continue;
            }
            const before = this.ctx.Pos;
            statements.push(this.parseStatement(end));
            if (this.ctx.Pos === before) this.ctx.Pos++;
        }
        return statements;
    }

    private parseStatement(end: number): StatementNode {
        const ctx = this.ctx;
        const start = ctx.Pos;
        const parts = this.parseBody(end);
        const tail = this.leftovers(end);
        let terminator = null;
        if (ctx.T.IsChar(ctx.Pos, ';')) {
            terminator = ctx.T.Tokens[ctx.Pos].Span;
            ctx.Pos++;
        }
        return Object.freeze({
            Kind: 'Statement', Span: ctx.Span(start, ctx.Pos), StatementKind: parts.Kind, With: parts.With,
            Body: parts.Body, Tail: Object.freeze(tail), Terminator: terminator,
        });
    }

    /** Reads `[WITH …] query` or a statement that is not a query, up to `end`. */
    private parseBody(end: number): { Kind: SqlStatementKind; With: WithClause | null; Body: QueryExpression | UnknownNode } {
        const ctx = this.ctx;
        const withClause = ctx.T.IsWord(ctx.Pos, 'WITH') ? this.parseWith(end) : null;
        const kind = withClause?.Failed ? 'Other' : this.classify(ctx.Pos);
        const clause = withClause?.Clause ?? null;
        if (withClause?.Failed) {
            return { Kind: kind, With: clause, Body: this.otherStatement(end, kind, 'The WITH clause could not be read.') };
        }
        if (kind !== 'Select') return { Kind: kind, With: clause, Body: this.otherStatement(end, kind, null) };
        return { Kind: kind, With: clause, Body: this.ParseQueryExpression(end) };
    }

    /** The statement kind of the statement starting at token `i`. */
    private classify(i: number): SqlStatementKind {
        if (this.ctx.T.IsChar(i, '(')) return 'Select';
        if (i >= this.ctx.T.Length) return 'Empty';
        const upper = this.ctx.T.Upper(i);
        const kind = STATEMENT_KEYWORDS.get(upper);
        if (kind !== undefined && !(upper === 'TABLE' && !this.ctx.T.IsAnyName(i + 1))) return kind;
        return 'Other';
    }

    /** Keeps a statement that is not a query whole, up to its `;` (or the next statement, for short T-SQL statements). */
    private otherStatement(end: number, kind: SqlStatementKind, reason: string | null): UnknownNode {
        const ctx = this.ctx;
        const start = ctx.Pos;
        const short = SHORT_STATEMENT_KINDS.has(kind);
        let k = start;
        while (k < end && !ctx.T.IsChar(k, ';')) {
            if (k > start && short && ctx.BoundaryAt(k) === 'Statement') break;
            const close = ctx.T.IsChar(k, '(') ? ctx.T.Match(k) : -1;
            k = ctx.T.IsChar(k, '(') ? (close < 0 ? end : close + 1) : k + 1;
        }
        ctx.Pos = Math.min(k, end);
        const message = reason ?? (kind === 'Empty' ? 'The statement is empty.' : `This ${kind === 'Other' ? 'statement' : `${kind.toUpperCase()} statement`} is not a query.`);
        return ctx.Unknown(start, ctx.Pos, message, reason === null ? SqlDocumentDiagnosticCodes.NotAQuery : SqlDocumentDiagnosticCodes.UnknownSyntax);
    }

    /** Text after a statement's query that belongs to no clause, up to the `;` or the next statement. */
    private leftovers(end: number): UnknownNode[] {
        const ctx = this.ctx;
        const tail: UnknownNode[] = [];
        if (ctx.Pos >= end || ctx.T.IsChar(ctx.Pos, ';') || this.startsStatement(ctx.Pos)) return tail;
        const start = ctx.Pos;
        let k = start + 1;
        while (k < end && !ctx.T.IsChar(k, ';') && !this.startsStatement(k)) {
            const close = ctx.T.IsChar(k, '(') ? ctx.T.Match(k) : -1;
            k = close > k ? close + 1 : k + 1;
        }
        k = Math.min(k, end);
        ctx.Pos = k;
        tail.push(ctx.Unknown(start, k, 'This text follows the query but belongs to none of its clauses.', SqlDocumentDiagnosticCodes.UnexpectedToken));
        return tail;
    }

    private startsStatement(i: number): boolean {
        return this.ctx.BoundaryAt(i) === 'Statement' || this.ctx.T.IsWord(i, 'WITH');
    }

    /** {@inheritDoc QueryParsing.ParseQueryNode} */
    ParseQueryNode(start: number, end: number): QueryNode {
        const ctx = this.ctx;
        const saved = ctx.Pos;
        ctx.Pos = start;
        ctx.Nesting++;
        const node = ctx.Nesting > MAX_QUERY_NESTING ? this.tooDeep(start, end) : this.nestedQuery(start, end);
        ctx.Nesting--;
        ctx.Pos = saved;
        return node;
    }

    private nestedQuery(start: number, end: number): QueryNode {
        const parts = this.parseBody(end);
        const tail = this.ctx.Pos < end ? [this.ctx.Unknown(this.ctx.Pos, end, 'This text follows the query but belongs to none of its clauses.', SqlDocumentDiagnosticCodes.UnexpectedToken)] : [];
        return Object.freeze({
            Kind: 'Query', Span: this.ctx.Span(start, end), StatementKind: parts.Kind, With: parts.With, Body: parts.Body,
            Tail: Object.freeze(tail),
        });
    }

    private tooDeep(start: number, end: number): QueryNode {
        const body = this.ctx.Unknown(start, end, `Queries are nested more than ${MAX_QUERY_NESTING} deep here; the inner part is not read.`, SqlDocumentDiagnosticCodes.NestingTooDeep);
        return Object.freeze({ Kind: 'Query', Span: this.ctx.Span(start, end), StatementKind: 'Other', With: null, Body: body, Tail: Object.freeze([]) });
    }

    /** Reads `WITH [RECURSIVE] cte, …`. `Failed` is set when a CTE could not be read. */
    private parseWith(end: number): { Clause: WithClause; Failed: boolean } {
        const ctx = this.ctx;
        const start = ctx.Pos;
        ctx.Pos++;
        const recursive = this.readRecursive();
        const ctes: CTEDeclaration[] = [];
        let failed = false;
        for (;;) {
            const cte = this.parseCTE(end);
            if (cte === null) {
                failed = true;
                break;
            }
            ctes.push(cte);
            if (!ctx.T.IsChar(ctx.Pos, ',')) break;
            ctx.Pos++;
        }
        const clause: WithClause = Object.freeze({ Kind: 'With', Span: ctx.Span(start, ctx.Pos), Recursive: recursive, CTEs: Object.freeze(ctes) });
        return { Clause: clause, Failed: failed };
    }

    private readRecursive(): boolean {
        const ctx = this.ctx;
        if (!ctx.T.IsWord(ctx.Pos, 'RECURSIVE') || !ctx.T.IsAnyName(ctx.Pos + 1)) return false;
        if (ctx.Grammar.RecursiveKeyword?.toUpperCase() !== 'RECURSIVE') {
            ctx.Report(SqlDocumentDiagnosticCodes.NotInDialect, 'Warning', ctx.T.Tokens[ctx.Pos].Span, 'This dialect does not have WITH RECURSIVE.');
        }
        ctx.Pos++;
        return true;
    }

    /** Reads `name [(columns)] AS [[NOT] MATERIALIZED] (body)`; `null` (with a diagnostic) when it does not parse. */
    private parseCTE(end: number): CTEDeclaration | null {
        const ctx = this.ctx;
        const start = ctx.Pos;
        if (!ctx.T.IsAnyName(start) || start >= end) return this.cteFailure(start, end);
        const name = ctx.T.Identifier(start);
        ctx.Pos++;
        const columns = ctx.T.IsChar(ctx.Pos, '(') ? ctx.ReadNameList(ctx.Pos) : null;
        if (!ctx.T.IsWord(ctx.Pos, 'AS')) return this.cteFailure(start, end);
        ctx.Pos++;
        const materialized = this.readMaterialized();
        const open = ctx.Pos;
        const close = ctx.T.Match(open);
        if (!ctx.T.IsChar(open, '(') || close < 0 || close >= end) return this.cteFailure(start, end);
        const body = this.ParseQueryNode(open + 1, close);
        ctx.Pos = close + 1;
        return Object.freeze({
            Kind: 'CTE', Span: ctx.Span(start, ctx.Pos), Name: name, ColumnList: columns, Materialized: materialized,
            Body: body, BodySpan: ctx.Span(open, close + 1),
        });
    }

    private cteFailure(start: number, end: number): null {
        this.ctx.Pos = start;
        this.ctx.Report(SqlDocumentDiagnosticCodes.UnknownSyntax, 'Error', this.ctx.Span(start, Math.min(start + 1, end)),
            'This common table expression could not be read: expected name [(columns)] AS (query).');
        return null;
    }

    private readMaterialized(): 'Materialized' | 'NotMaterialized' | null {
        const ctx = this.ctx;
        if (ctx.T.IsWord(ctx.Pos, 'MATERIALIZED')) {
            ctx.Pos++;
            return 'Materialized';
        }
        if (ctx.T.IsWord(ctx.Pos, 'NOT') && ctx.T.IsWord(ctx.Pos + 1, 'MATERIALIZED')) {
            ctx.Pos += 2;
            return 'NotMaterialized';
        }
        return null;
    }

    /** Reads a query expression: set operations over select blocks, then its tail clauses. */
    ParseQueryExpression(end: number): QueryExpression {
        let left = this.parseIntersectTerm(end);
        while (this.ctx.Pos < end && this.isOperator(this.ctx.Pos, false)) {
            left = this.parseSetOperation(left, end, false);
        }
        return this.tails.Attach(left, this.tails.Parse(end));
    }

    private parseIntersectTerm(end: number): QueryExpression {
        let left = this.parsePrimary(end);
        while (this.ctx.Pos < end && this.isOperator(this.ctx.Pos, true)) {
            left = this.parseSetOperation(left, end, true);
        }
        return left;
    }

    private isOperator(i: number, intersect: boolean): boolean {
        return this.ctx.IsSetOperator(i) && (this.ctx.T.IsWord(i, 'INTERSECT') === intersect);
    }

    private parseSetOperation(left: QueryExpression, end: number, intersect: boolean): QueryExpression {
        const ctx = this.ctx;
        const opStart = ctx.Pos;
        const operator = SET_OPERATORS[ctx.T.Upper(opStart)];
        ctx.Pos++;
        const all = ctx.T.IsWord(ctx.Pos, 'ALL');
        if (all || ctx.T.IsWord(ctx.Pos, 'DISTINCT')) ctx.Pos++;
        const operatorSpan = ctx.Span(opStart, ctx.Pos);
        const right = intersect ? this.parsePrimary(end) : this.parseIntersectTerm(end);
        return Object.freeze({
            Kind: 'SetOperation', Span: Object.freeze({ Start: left.Span.Start, End: right.Span.End }), Operator: operator,
            All: all, OperatorSpan: operatorSpan, Left: left, Right: right, ...this.tails.Empty(),
        });
    }

    /** Reads one select block, `VALUES` list or parenthesized query. */
    private parsePrimary(end: number): QueryExpression {
        const ctx = this.ctx;
        const start = ctx.Pos;
        if (ctx.T.IsChar(start, '(')) return this.parseParenthesized(start, end);
        if (ctx.T.IsWord(start, 'SELECT')) return this.selects.Parse(end);
        if (ctx.T.IsWord(start, 'VALUES')) return this.selects.ParseValues(end);
        let k = start + 1;
        while (k < end && ctx.BoundaryAt(k) === null) k++;
        ctx.Pos = Math.max(k, start + 1);
        return ctx.Unknown(start, ctx.Pos, 'Expected SELECT, VALUES or a parenthesized query here.');
    }

    private parseParenthesized(open: number, end: number): QueryExpression {
        const ctx = this.ctx;
        const close = ctx.T.Match(open);
        if (close < 0 || close >= end) {
            ctx.Pos = end;
            return ctx.Unknown(open, end, 'This parenthesized query is not closed.');
        }
        const query = this.ParseQueryNode(open + 1, close);
        ctx.Pos = close + 1;
        return Object.freeze({ Kind: 'Parenthesized', Span: ctx.Span(open, close + 1), Query: query, ...this.tails.Empty() });
    }
}
