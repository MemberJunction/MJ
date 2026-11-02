import type { Span } from '../common/analysis.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';
import {
    CONVERT_TARGET_TYPES, DATE_PART_FUNCTIONS, DATE_PART_NAMES, FUNCTION_KEYWORDS, INTERVAL_UNITS, TYPE_CONTINUATION_WORDS,
    TYPE_FIRST_FUNCTIONS, WINDOW_WORDS,
} from './sqlKeywords.js';
import type { IdentifierNode, ObjectName, QueryNode } from './sqlNodes.js';
import type { TokenTable } from './tokenTable.js';

/** A dotted name read as a value, such as `o.CustomerID` or `[a] . [Name]`: usually a column. */
export interface IdentifierPath {
    readonly Kind: 'IdentifierPath';
    readonly Parts: readonly IdentifierNode[];
    readonly Span: Span;
}

/** A function call, `name(arguments)`. */
export interface FunctionCall {
    readonly Kind: 'FunctionCall';
    readonly Name: ObjectName;
    /** From the name to the closing parenthesis. */
    readonly Span: Span;
    /** The arguments, without the parentheses. */
    readonly Arguments: SqlExpression;
}

/** A `*` that stands for columns: `*`, `alias.*`, or the argument of `f(*)`. */
export interface StarReference {
    readonly Kind: 'Star';
    /** The qualifier of `alias.*`; `null` for a bare `*`. */
    readonly Qualifier: ObjectName | null;
    readonly Span: Span;
    /** The upper-case name of the function whose sole argument the star is (`COUNT`); `null` otherwise. */
    readonly FunctionName: string | null;
}

/** A nested query inside an expression, with the token indexes of its parentheses. */
export interface SubqueryRange {
    readonly Node: QueryNode;
    readonly Open: number;
    readonly Close: number;
}

/** What surrounds a token: the innermost parenthesis it sits in. */
interface ParenFrame {
    readonly Close: number;
    /** `Function` for `f(…)`, `Window` for `OVER (…)` and `WITHIN GROUP (…)`, `Other` otherwise. */
    readonly Kind: 'Function' | 'Window' | 'Other';
    /** The upper-case function name, for a `Function` frame. */
    readonly FunctionName: string;
    Argument: number;
    ArgumentStart: number;
}

interface ScanResult {
    readonly Identifiers: readonly IdentifierPath[];
    readonly FunctionCalls: readonly FunctionCall[];
    readonly Stars: readonly StarReference[];
}

/**
 * An expression, kept as the range of tokens it covers. Its helpers look into it for the parts
 * structure-level work needs: identifier paths, function calls and stars. A nested
 * `(SELECT …)` is parsed as a child query, returned by {@link Subqueries}; the helpers do not
 * look inside it (its own expressions report its names).
 */
export class SqlExpression {
    readonly Kind = 'Expression' as const;
    readonly Span: Span;
    private readonly table: TokenTable;
    private readonly start: number;
    private readonly end: number;
    private readonly ranges: readonly SubqueryRange[];
    private readonly windowContext: boolean;
    private scanned: ScanResult | null = null;

    /**
     * @param table - The document's tokens.
     * @param start - The index of the first token.
     * @param end - The index after the last token.
     * @param ranges - The subqueries inside the range, in order.
     * @param windowContext - Whether the range is a window specification.
     */
    constructor(table: TokenTable, start: number, end: number, ranges: readonly SubqueryRange[], windowContext = false) {
        this.table = table;
        this.start = start;
        this.end = Math.max(start, end);
        this.ranges = ranges;
        this.windowContext = windowContext;
        this.Span = this.end > start ? table.SpanOf(start, this.end - 1) : table.PointAt(start);
        Object.freeze(this.Span);
    }

    /** Whether the expression has no tokens. */
    get IsEmpty(): boolean {
        return this.end <= this.start;
    }

    /** The significant tokens the expression covers. */
    Tokens(): readonly SqlToken[] {
        return this.table.Tokens.slice(this.start, this.end);
    }

    /** The expression's text as written, comments included. */
    get Text(): string {
        return this.table.Source.Slice(this.Span);
    }

    /** The nested queries directly inside the expression, in order. */
    Subqueries(): readonly QueryNode[] {
        return this.ranges.map(r => r.Node);
    }

    /** Every identifier path that can be a column, outside nested queries. */
    Identifiers(): readonly IdentifierPath[] {
        return this.scan().Identifiers;
    }

    /** Every function call, outside nested queries; calls nested in arguments are included. */
    FunctionCalls(): readonly FunctionCall[] {
        return this.scan().FunctionCalls;
    }

    /** Every `*` that stands for columns, outside nested queries. */
    Stars(): readonly StarReference[] {
        return this.scan().Stars;
    }

    private scan(): ScanResult {
        this.scanned ??= new ExpressionScanner(this.table, this.start, this.end, this.ranges, this.windowContext).Run();
        return this.scanned;
    }
}

/** One linear pass over an expression's tokens that finds identifiers, calls and stars. */
class ExpressionScanner {
    private readonly identifiers: IdentifierPath[] = [];
    private readonly calls: FunctionCall[] = [];
    private readonly stars: StarReference[] = [];
    private readonly frames: ParenFrame[] = [];
    private pendingFunction: string | null = null;
    private nextRange = 0;
    private readonly colonPlaceholders: boolean;

    constructor(
        private readonly t: TokenTable,
        private readonly start: number,
        private readonly end: number,
        private readonly ranges: readonly SubqueryRange[],
        windowContext: boolean,
    ) {
        this.colonPlaceholders = t.Dialect.Lexical.ParameterPlaceholders.includes('colon-name');
        if (windowContext) this.frames.push({ Close: end, Kind: 'Window', FunctionName: '', Argument: 0, ArgumentStart: start });
    }

    Run(): ScanResult {
        let i = this.start;
        while (i < this.end) i = this.step(i);
        return Object.freeze({
            Identifiers: Object.freeze(this.identifiers),
            FunctionCalls: Object.freeze(this.calls),
            Stars: Object.freeze(this.stars),
        });
    }

    /** Reads the token at `i`; returns the index to read next. */
    private step(i: number): number {
        const range = this.ranges[this.nextRange];
        if (range !== undefined && range.Open === i) {
            this.nextRange++;
            return range.Close + 1;
        }
        const token = this.t.Tokens[i];
        if (token.Kind === 'Punctuation') return this.punctuation(i, token.Text);
        if (this.t.IsChar(i, '*')) {
            this.star(i);
            return i + 1;
        }
        if (token.Kind === 'Word' || token.Kind === 'QuotedIdentifier') return this.name(i);
        return i + 1;
    }

    private punctuation(i: number, text: string): number {
        if (text === '(') {
            this.openFrame(i);
        } else if (text === ')') {
            if (this.top()?.Close === i) this.frames.pop();
        } else if (text === ',') {
            const frame = this.top();
            if (frame !== undefined) {
                frame.Argument++;
                frame.ArgumentStart = i + 1;
            }
        }
        if (text !== '(') this.pendingFunction = null;
        return i + 1;
    }

    private openFrame(i: number): void {
        const close = this.t.Match(i) < 0 ? this.end : this.t.Match(i);
        const before = this.t.Upper(i - 1);
        const window = before === 'OVER' || (before === 'GROUP' && this.t.IsWord(i - 2, 'WITHIN'));
        const kind = this.pendingFunction !== null ? 'Function' : window ? 'Window' : 'Other';
        this.frames.push({ Close: close, Kind: kind, FunctionName: this.pendingFunction ?? '', Argument: 0, ArgumentStart: i + 1 });
        this.pendingFunction = null;
    }

    private top(): ParenFrame | undefined {
        return this.frames[this.frames.length - 1];
    }

    private star(i: number): void {
        const single = i === this.start && this.end === i + 1;
        const argument = this.t.IsChar(i - 1, '(') && this.t.IsChar(i + 1, ')') && i > this.start;
        if (!single && !argument) return;
        const frame = this.top();
        const functionName = argument && frame?.Kind === 'Function' ? frame.FunctionName : null;
        this.stars.push(Object.freeze({ Kind: 'Star', Qualifier: null, Span: this.t.Tokens[i].Span, FunctionName: functionName }));
    }

    /** Reads a word or quoted identifier at `i`, and any dotted path it starts. */
    private name(i: number): number {
        this.pendingFunction = null;
        const token = this.t.Tokens[i];
        if (token.Kind === 'Word') {
            const skip = this.wordSkip(i);
            if (skip !== null) return skip;
        }
        if (this.t.IsChar(i - 1, '.') && i > this.start) return i + 1;
        return this.path(i);
    }

    /** Where to resume when the word at `i` is syntax rather than a name; `null` when it is a name. */
    private wordSkip(i: number): number | null {
        const text = this.t.Tokens[i].Text;
        if (text.startsWith('@')) return i + 1;
        if (this.t.IsReserved(i)) return this.reserved(i);
        const contextual = this.contextualSkip(i);
        if (contextual !== null) return contextual;
        return this.positionalSkip(i);
    }

    private reserved(i: number): number {
        const upper = this.t.Upper(i);
        if (FUNCTION_KEYWORDS.has(upper) && this.t.IsChar(i + 1, '(')) {
            this.recordCall(i, i + 1, upper);
            return i + 1;
        }
        if (upper === 'AS') return this.skipType(i + 1);
        if (upper === 'COLLATE' && this.t.IsAnyName(i + 1)) return i + 2;
        if (upper === 'OVER' && this.t.IsAnyName(i + 1) && !this.t.IsChar(i + 1, '(')) return i + 2;
        return i + 1;
    }

    /** Multi-word syntax recognised from the words themselves: `INTERVAL …`, `AT TIME ZONE`, `::type`. */
    private contextualSkip(i: number): number | null {
        const upper = this.t.Upper(i);
        const nextKind = this.t.Tokens[i + 1]?.Kind;
        if (upper === 'INTERVAL' && (nextKind === 'String' || nextKind === 'Number')) {
            return INTERVAL_UNITS.has(this.t.Upper(i + 2)) ? i + 3 : i + 2;
        }
        if (upper === 'AT' && this.t.IsWord(i + 1, 'TIME') && this.t.IsWord(i + 2, 'ZONE')) return i + 3;
        if (upper === 'WITHIN' && this.t.IsWord(i + 1, 'GROUP') && this.t.IsChar(i + 2, '(')) return i + 1;
        if (upper === 'ARRAY' && this.t.IsChar(i + 1, '[')) return i + 1;
        if (this.t.IsChar(i - 1, ':') && this.t.IsChar(i - 2, ':')) return this.skipType(i);
        if (this.colonPlaceholders && this.t.IsChar(i - 1, ':') && !this.isValueEnd(i - 2)) return i + 1;
        const frame = this.top();
        if (frame?.Kind === 'Window' && WINDOW_WORDS.has(upper)) return i + 1;
        return null;
    }

    /** Words whose meaning comes from their argument position: date parts, `EXTRACT`, type arguments. */
    private positionalSkip(i: number): number | null {
        const frame = this.top();
        if (frame?.Kind !== 'Function' || frame.ArgumentStart !== i) return null;
        const fn = frame.FunctionName;
        const upper = this.t.Upper(i);
        if (frame.Argument === 0 && DATE_PART_FUNCTIONS.has(fn) && DATE_PART_NAMES.has(upper) && this.t.IsChar(i + 1, ',')) return i + 1;
        if (frame.Argument === 0 && fn === 'EXTRACT' && this.t.IsWord(i + 1, 'FROM')) return i + 1;
        if (fn === 'TRIM' && (upper === 'BOTH' || upper === 'LEADING' || upper === 'TRAILING')) return i + 1;
        if (frame.Argument === 0 && TYPE_FIRST_FUNCTIONS.has(fn) && this.t.IsChar(this.typeEnd(i), ',')) return this.skipType(i);
        if (frame.Argument === 1 && fn === 'CONVERT' && CONVERT_TARGET_TYPES.has(upper) && this.t.IsChar(this.typeEnd(i), ')')) {
            return this.skipType(i);
        }
        return null;
    }

    /** Whether token `i` ends a value, so a following `:` is an operator rather than a placeholder. */
    private isValueEnd(i: number): boolean {
        const token = this.t.Tokens[i];
        if (token === undefined) return false;
        if (token.Kind === 'String' || token.Kind === 'Number' || token.Kind === 'QuotedIdentifier') return true;
        return this.t.IsChar(i, ')') || this.t.IsNamePart(i);
    }

    /** Skips a type name at `i`: a dotted name, optional `(…)` arguments, continuation words and `[]`. */
    private skipType(i: number): number {
        return this.typeEnd(i);
    }

    private typeEnd(i: number): number {
        let j = i;
        if (!this.t.IsAnyName(j)) return j;
        j++;
        while (this.t.IsChar(j, '.') && this.t.IsAnyName(j + 1)) j += 2;
        if (this.t.IsChar(j, '(') && this.t.Match(j) > j) j = this.t.Match(j) + 1;
        while (j < this.end && TYPE_CONTINUATION_WORDS.has(this.t.Upper(j))) j++;
        while (this.t.IsChar(j, '[') && this.t.IsChar(j + 1, ']')) j += 2;
        return Math.min(j, this.end);
    }

    /** Reads `a.b.c`, `a.*` or `a.b(…)` starting at `i`. */
    private path(i: number): number {
        const parts: IdentifierNode[] = [this.t.Identifier(i)];
        let j = i + 1;
        while (j + 1 < this.end && this.t.IsChar(j, '.') && (this.t.IsAnyName(j + 1) || this.t.IsChar(j + 1, '*'))) {
            if (this.t.IsChar(j + 1, '*')) return this.qualifiedStar(i, parts, j + 1);
            parts.push(this.t.Identifier(j + 1));
            j += 2;
        }
        if (this.t.IsChar(j, '(') && j < this.end) {
            this.recordCall(i, j, this.functionKey(parts));
            return j;
        }
        this.identifiers.push(Object.freeze({ Kind: 'IdentifierPath', Parts: Object.freeze(parts), Span: this.t.SpanOf(i, j - 1) }));
        return j;
    }

    private qualifiedStar(first: number, parts: IdentifierNode[], starIndex: number): number {
        const qualifier: ObjectName = Object.freeze({ Kind: 'ObjectName', Parts: Object.freeze(parts), Span: this.t.SpanOf(first, starIndex - 2) });
        this.stars.push(Object.freeze({ Kind: 'Star', Qualifier: qualifier, Span: this.t.SpanOf(first, starIndex), FunctionName: null }));
        return starIndex + 1;
    }

    private functionKey(parts: readonly IdentifierNode[]): string {
        return parts[parts.length - 1].Value.toUpperCase();
    }

    /** Records `name(…)` whose name runs from `first` to the `(` at `open`. */
    private recordCall(first: number, open: number, key: string): void {
        const close = this.t.Match(open) < 0 ? this.end : Math.min(this.t.Match(open), this.end);
        const name = this.t.ReadObjectName(first, open)?.Name ?? keywordName(this.t, first);
        const inner = rangesWithin(this.ranges, open, close);
        this.calls.push(Object.freeze({
            Kind: 'FunctionCall',
            Name: name,
            Span: this.t.SpanOf(first, Math.min(close, this.end - 1)),
            Arguments: new SqlExpression(this.t, open + 1, close, inner),
        }));
        this.pendingFunction = key;
    }
}

/** The ranges strictly between token indexes `open` and `close`; `ranges` is sorted and non-overlapping. */
function rangesWithin(ranges: readonly SubqueryRange[], open: number, close: number): readonly SubqueryRange[] {
    let low = 0;
    let high = ranges.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (ranges[mid].Open <= open) low = mid + 1;
        else high = mid;
    }
    let last = low;
    while (last < ranges.length && ranges[last].Close < close) last++;
    return ranges.slice(low, last);
}

/** A one-part name for a reserved word used as a function (`LEFT`, `REPLACE`). */
function keywordName(t: TokenTable, i: number): ObjectName {
    const part = t.Identifier(i);
    return Object.freeze({ Kind: 'ObjectName', Parts: Object.freeze([part]), Span: part.Span });
}
