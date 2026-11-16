import type { DialectGrammar } from '@memberjunction/sql-dialect';
import { MakeDiagnostic } from '../../common/analysis.js';
import type { Diagnostic, Span } from '../../common/analysis.js';
import { SqlExpression } from '../sqlExpression.js';
import type { SubqueryRange } from '../sqlExpression.js';
import { SqlDocumentDiagnosticCodes } from '../sqlDiagnosticCodes.js';
import { FOR_CLAUSE_FORMS, NEXT_STATEMENT_WORDS, STATEMENT_KEYWORDS } from '../sqlKeywords.js';
import type { IdentifierNode, QueryNode, UnknownNode } from '../sqlNodes.js';
import type { TokenTable } from '../tokenTable.js';

/** The deepest nesting of queries the parser follows; deeper text is kept as an Unknown node. */
export const MAX_QUERY_NESTING = 100;

/** A clause boundary: where an expression or clause at the current level ends. */
export type ClauseBoundary =
    | 'Close' | 'Semicolon' | 'From' | 'Into' | 'Where' | 'GroupBy' | 'Having' | 'Window' | 'Qualify' | 'OrderBy'
    | 'SetOperation' | 'Limit' | 'Offset' | 'Fetch' | 'For' | 'Option' | 'Statement';

/** Options for {@link ParseContext.ExpressionEnd}. */
export interface ExpressionEndOptions {
    /** Stop at a comma at the current level. */
    readonly Comma?: boolean;
    /** Stop where a join starts (`JOIN`, `LEFT`, `CROSS APPLY`, `PIVOT`, …). */
    readonly Join?: boolean;
    /** Stop at any of these upper-case words. */
    readonly Words?: ReadonlySet<string>;
}

/** The query-level parsing a source or clause parser calls back into. */
export interface QueryParsing {
    /** Parses the tokens between a pair of parentheses, `start` to `end` exclusive, as a nested query. */
    ParseQueryNode(start: number, end: number): QueryNode;
}

/**
 * The state one parse shares between the statement, query, select and source parsers: the
 * token table, a cursor, the diagnostics and the nesting depth.
 */
export class ParseContext {
    /** The index of the next token to read. */
    Pos = 0;
    /** How deeply nested the query being read is. */
    Nesting = 0;
    readonly Diagnostics: Diagnostic[] = [];
    readonly Grammar: DialectGrammar;
    private queryParsing: QueryParsing | null = null;

    constructor(readonly T: TokenTable) {
        this.Grammar = T.Dialect.Grammar;
    }

    /** The nested-query parser; set once by the query parser. */
    get Query(): QueryParsing {
        if (this.queryParsing === null) throw new Error('ParseContext: the query parser is not attached.');
        return this.queryParsing;
    }

    set Query(value: QueryParsing) {
        this.queryParsing = value;
    }

    /** Adds a diagnostic. */
    Report(code: string, severity: 'Error' | 'Warning' | 'Info', span: Span, message: string, fixHint: string | null = null): void {
        this.Diagnostics.push(MakeDiagnostic(code, severity, span, message, fixHint));
    }

    /** Reports that the clause or list at token `at` is missing a part it must have. */
    ReportEmpty(at: number, message: string): void {
        this.Report(SqlDocumentDiagnosticCodes.EmptyClause, 'Error', this.T.PointAt(at), message);
    }

    /** An Unknown node over tokens `start` to `end` (exclusive), with a diagnostic. */
    Unknown(start: number, end: number, reason: string, code: string = SqlDocumentDiagnosticCodes.UnknownSyntax): UnknownNode {
        const span = end > start ? this.T.SpanOf(start, end - 1) : this.T.PointAt(start);
        this.Report(code, code === SqlDocumentDiagnosticCodes.NotAQuery ? 'Warning' : 'Error', span, reason);
        return Object.freeze({ Kind: 'Unknown', Span: span, Reason: reason });
    }

    /** The span of tokens `start` to `end` (exclusive); an empty span at `start` when the range is empty. */
    Span(start: number, end: number): Span {
        return Object.freeze(end > start ? this.T.SpanOf(start, end - 1) : this.T.PointAt(start));
    }

    /** An expression over tokens `start` to `end` (exclusive), parsing the queries nested in it. */
    Expression(start: number, end: number, windowContext = false): SqlExpression {
        return new SqlExpression(this.T, start, end, this.subqueries(start, end), windowContext);
    }

    private subqueries(start: number, end: number): SubqueryRange[] {
        const ranges: SubqueryRange[] = [];
        let k = start;
        while (k < end) {
            const close = this.T.Match(k);
            if (this.T.IsChar(k, '(') && close > k && close < end && this.OpensQuery(k + 1)) {
                ranges.push({ Node: this.Query.ParseQueryNode(k + 1, close), Open: k, Close: close });
                k = close + 1;
            } else {
                k++;
            }
        }
        return ranges;
    }

    /** Reads `(name, …)` at the `(` at `open` and moves past the `)`. Tokens that are not names are skipped. */
    ReadNameList(open: number): readonly IdentifierNode[] {
        const close = this.T.Match(open);
        const last = close < 0 ? this.T.Length : close;
        const names: IdentifierNode[] = [];
        for (let k = open + 1; k < last; k++) {
            if (this.T.IsAnyName(k)) names.push(this.T.Identifier(k));
        }
        this.Pos = close < 0 ? last : close + 1;
        return Object.freeze(names);
    }

    /** Whether token `i` starts a statement or query body: `SELECT`, `WITH`, `VALUES`, or a statement keyword. */
    OpensQuery(i: number): boolean {
        const upper = this.T.Upper(i);
        if (upper === 'SELECT' || upper === 'WITH') return true;
        if (upper === 'VALUES') return this.T.IsChar(i + 1, '(') && !this.T.IsChar(i - 1, '.');
        const isStatement = STATEMENT_KEYWORDS.has(upper) || this.Grammar.WriteStatementKeywords.includes(upper);
        return isStatement && upper !== 'TABLE' && !this.T.IsChar(i + 1, '(');
    }

    /** The index of the first token at or after `i` where an expression at this level ends. */
    ExpressionEnd(i: number, end: number, options: ExpressionEndOptions = {}): number {
        let k = i;
        while (k < end) {
            if (this.T.IsChar(k, '(')) {
                const close = this.T.Match(k);
                k = close < 0 ? end : close + 1;
                continue;
            }
            if (this.stopsAt(k, options)) return k;
            k++;
        }
        return Math.min(k, end);
    }

    private stopsAt(k: number, options: ExpressionEndOptions): boolean {
        if (options.Comma && this.T.IsChar(k, ',')) return true;
        if (options.Words?.has(this.T.Upper(k))) return true;
        if (options.Join && (this.JoinStarts(k) || this.T.IsChar(k, ','))) return true;
        return this.BoundaryAt(k) !== null;
    }

    /** The clause boundary token `i` starts, if any. */
    BoundaryAt(i: number): ClauseBoundary | null {
        const token = this.T.Tokens[i];
        if (token === undefined) return null;
        if (token.Kind === 'Punctuation') return token.Text === ')' ? 'Close' : token.Text === ';' ? 'Semicolon' : null;
        if (token.Kind !== 'Word') return null;
        return this.keywordBoundary(i, this.T.Upper(i));
    }

    private keywordBoundary(i: number, upper: string): ClauseBoundary | null {
        switch (upper) {
            case 'FROM': return this.isDistinctFrom(i) ? null : 'From';
            case 'INTO': return 'Into';
            case 'WHERE': return 'Where';
            case 'GROUP': return this.T.IsWord(i + 1, 'BY') ? 'GroupBy' : null;
            case 'HAVING': return 'Having';
            case 'WINDOW': return this.T.IsAnyName(i + 1) && this.T.IsWord(i + 2, 'AS') ? 'Window' : null;
            case 'QUALIFY': return 'Qualify';
            case 'ORDER': return this.T.IsWord(i + 1, 'BY') ? 'OrderBy' : null;
            case 'LIMIT': return this.Grammar.RowCapForms.includes('limit-offset') && this.valueFollows(i) ? 'Limit' : null;
            case 'OFFSET': return this.valueFollows(i) ? 'Offset' : null;
            case 'FETCH': return this.T.IsWord(i + 1, 'FIRST') || this.T.IsWord(i + 1, 'NEXT') ? 'Fetch' : null;
            case 'FOR': return FOR_CLAUSE_FORMS.has(this.T.Upper(i + 1)) ? 'For' : null;
            default: return this.otherBoundary(i, upper);
        }
    }

    private otherBoundary(i: number, upper: string): ClauseBoundary | null {
        if (this.IsSetOperator(i)) return 'SetOperation';
        const hint = this.Grammar.QueryHintKeyword;
        if (hint !== null && upper === hint.toUpperCase() && this.T.IsChar(i + 1, '(')) return 'Option';
        if (NEXT_STATEMENT_WORDS.has(upper) && !this.T.IsChar(i + 1, '(')) return 'Statement';
        return null;
    }

    /** Whether token `i` is a set operator of the dialect. */
    IsSetOperator(i: number): boolean {
        const upper = this.T.Upper(i);
        return upper !== '' && this.Grammar.SetOperatorKeywords.includes(upper);
    }

    /** `IS [NOT] DISTINCT FROM`: the FROM is part of an operator. */
    private isDistinctFrom(i: number): boolean {
        if (!this.T.IsWord(i - 1, 'DISTINCT')) return false;
        return this.T.IsWord(i - 2, 'IS') || (this.T.IsWord(i - 2, 'NOT') && this.T.IsWord(i - 3, 'IS'));
    }

    /** Whether a value follows token `i` (so `LIMIT` / `OFFSET` there is a clause, not a name). */
    private valueFollows(i: number): boolean {
        const next = this.T.Tokens[i + 1];
        if (next === undefined) return false;
        if (next.Kind === 'Punctuation') return next.Text === '(';
        if (next.Kind === 'Word') return !this.T.IsReserved(i + 1) || this.T.IsWord(i + 1, 'ALL') || this.T.IsWord(i + 1, 'NULL');
        return next.Kind !== 'Operator' || next.Text !== '=';
    }

    /** Whether a join, an APPLY or a PIVOT starts at token `i`. */
    JoinStarts(i: number): boolean {
        switch (this.T.Upper(i)) {
            case 'JOIN': case 'STRAIGHT_JOIN': case 'INNER': case 'FULL': case 'NATURAL': case 'PIVOT': case 'UNPIVOT':
                return true;
            case 'LEFT': case 'RIGHT':
                return !this.T.IsChar(i + 1, '(');
            case 'CROSS':
                return this.T.IsWord(i + 1, 'JOIN') || this.T.IsWord(i + 1, 'APPLY');
            case 'OUTER':
                return this.T.IsWord(i + 1, 'APPLY');
            default:
                return false;
        }
    }
}
