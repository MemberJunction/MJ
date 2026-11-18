import { SqlDocument, type IdentifierPath, type SelectCore, type SqlToken } from '@memberjunction/sql-parser';
import { PostgreSQLDialect, QueryDialect, SQLServerDialect, type ParserDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';

/**
 * Shared readers of a SQL statement's structure for the materialization CodeGen analyzers: the
 * parameter verifier (materializationParamVerifier.ts), the broad-render predicate remover
 * (materializationBroadRender.ts), and the key and binding analyses (materializationAnalysis.ts).
 *
 * These MUST be a single source of truth. The verifier classifies a parameter as a clean row filter
 * only where {@link ReadComparison} reads a `column <op> literal` conjunct, and broad-render removes
 * exactly the conjuncts the same reader accepts. If the two drifted apart, the verifier could accept
 * a predicate that broad-render then fails to isolate, and the materialization would be filtered wrongly.
 *
 * Everything here reads a {@link SqlDocument}: token ranges and spans over the author's text. A WHERE
 * condition is read as a tree of AND-ed conjuncts ({@link ReadConditionTree}); each conjunct that is
 * not itself an AND chain is a leaf, and only a leaf can be a re-applicable row filter.
 */

/** Comparison operators whose `column <op> value` form is a re-applicable read-time row filter. */
export const COMPARISON_OPS = new Set<string>([
    '=', '!=', '<>', '<', '>', '<=', '>=',
    'IN', 'NOT IN', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT', 'BETWEEN', 'NOT BETWEEN',
]);

/** Operator characters that combine into a comparison operator (`<`, `<=`, `<>`, `!=`, …). */
const COMPARISON_CHARS = new Set<string>(['<', '>', '=', '!']);

/** The category of a literal token. Two variants whose literal at one place changes category differ in shape. */
export type LiteralCategory = 'String' | 'Number' | 'Boolean' | 'Null';

/** How a predicate's value side is written: one scalar literal, or a list of literals (`IN (…)`, `BETWEEN a AND b`). */
export type PredicateValueKind = 'scalar' | 'list';

/**
 * The faceted dialect the structural parser needs, for a dialect typed by the older parser interface.
 * A built-in dialect object is used as itself; any other object is read by its parser grammar name.
 */
export function ToParserDialect(dialect: SQLParserDialect): ParserDialect {
    if (dialect instanceof QueryDialect) {
        return dialect;
    }
    return dialect.ParserDialect.toLowerCase() === 'postgresql' ? new PostgreSQLDialect() : new SQLServerDialect();
}

/** Case- and whitespace-insensitive SQL identifier equality. Null/undefined never matches anything. */
export function IdentifiersEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    if (a == null || b == null) {
        return false;
    }
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A document whose only statement is a single SELECT block. */
export interface SoleSelect {
    Document: SqlDocument;
    Select: SelectCore;
}

/**
 * Parses `sql` and returns its sole SELECT block, or null when that is not what it is: text the parser
 * could not read completely, several statements, a statement that is not a query, or a top-level query
 * that is not one SELECT block. A set operation (`UNION`, `EXCEPT`, `INTERSECT`) is refused because no
 * single block's WHERE, GROUP BY or select list describes the whole result. A leading WITH clause is
 * allowed: the block returned is the query after it.
 */
export function ParseSoleSelect(sql: string, dialect: SQLParserDialect): SoleSelect | null {
    const document = SqlDocument.Parse(sql, ToParserDialect(dialect));
    if (!document.IsComplete || document.HasStackedStatements().Value) {
        return null;
    }
    const statement = document.Statements[0];
    const top = document.TopLevelQuery();
    if (statement === undefined || statement.StatementKind !== 'Select' || top === null || top.Kind !== 'Select') {
        return null;
    }
    return { Document: document, Select: top };
}

/** The last part of an identifier path: the column name. */
export function PathColumn(path: IdentifierPath): string {
    return path.Parts[path.Parts.length - 1].Value;
}

/** The part before the column in an identifier path (`o` in `o.Status`); null when the path is unqualified. */
export function PathQualifier(path: IdentifierPath): string | null {
    return path.Parts.length > 1 ? path.Parts[path.Parts.length - 2].Value : null;
}

/**
 * The literal category of a token, or null when it is not a literal. Only a plain `'…'` string counts as
 * a string literal: a prefixed form such as `N'…'` is compared as written, so a value that changes one is
 * read as a change of shape (refused) rather than as a varying literal.
 */
export function LiteralCategoryOf(token: SqlToken | undefined): LiteralCategory | null {
    if (token === undefined) {
        return null;
    }
    if (token.Kind === 'String') {
        return token.Text.startsWith("'") ? 'String' : null;
    }
    if (token.Kind === 'Number') {
        return 'Number';
    }
    if (token.Kind !== 'Word') {
        return null;
    }
    const upper = token.Text.toUpperCase();
    if (upper === 'TRUE' || upper === 'FALSE') {
        return 'Boolean';
    }
    return upper === 'NULL' ? 'Null' : null;
}

function isPunctuation(tokens: readonly SqlToken[], i: number, text: string): boolean {
    const token = tokens[i];
    return token !== undefined && token.Kind === 'Punctuation' && token.Text === text;
}

function isOperatorChar(tokens: readonly SqlToken[], i: number, text: string): boolean {
    const token = tokens[i];
    return token !== undefined && token.Kind === 'Operator' && token.Text === text;
}

function upperWord(tokens: readonly SqlToken[], i: number): string {
    const token = tokens[i];
    return token !== undefined && token.Kind === 'Word' ? token.Text.toUpperCase() : '';
}

/** The index of the `)` that closes the `(` at `open`, searching before `end`; -1 when there is none. */
export function MatchingClose(tokens: readonly SqlToken[], open: number, end: number = tokens.length): number {
    if (!isPunctuation(tokens, open, '(')) {
        return -1;
    }
    const depth = tokens[open].Depth;
    for (let i = open + 1; i < end; i++) {
        if (isPunctuation(tokens, i, ')') && tokens[i].Depth === depth) {
            return i;
        }
    }
    return -1;
}

/** Whether the tokens from `start` begin a query (`SELECT`, `WITH`, `VALUES`), so the parentheses around them are a subquery's. */
function startsQuery(tokens: readonly SqlToken[], start: number): boolean {
    const word = upperWord(tokens, start);
    return word === 'SELECT' || word === 'WITH' || word === 'VALUES';
}

/** The token range inside any parentheses that wrap all of `[start, end)`, subquery parentheses excepted. */
export function StripWrappingParens(tokens: readonly SqlToken[], start: number, end: number): { Start: number; End: number } {
    let s = start;
    let e = end;
    while (e - s >= 2 && MatchingClose(tokens, s, e) === e - 1 && !startsQuery(tokens, s + 1)) {
        s++;
        e--;
    }
    return { Start: s, End: e };
}

/** Whether `[start, end)` is exactly one scalar literal: optionally parenthesized, a number optionally signed. */
export function IsScalarLiteral(tokens: readonly SqlToken[], start: number, end: number): boolean {
    const inner = StripWrappingParens(tokens, start, end);
    const length = inner.End - inner.Start;
    if (length === 1) {
        return LiteralCategoryOf(tokens[inner.Start]) !== null;
    }
    const signed = isOperatorChar(tokens, inner.Start, '-') || isOperatorChar(tokens, inner.Start, '+');
    return length === 2 && signed && tokens[inner.Start + 1].Kind === 'Number';
}

/**
 * When the `(` at `open` starts a parenthesized, comma-separated list of scalar literals (`('A', 'B')`,
 * `(1)`), the index of its closing `)`; otherwise -1.
 */
export function LiteralListClose(tokens: readonly SqlToken[], open: number, end: number = tokens.length): number {
    const close = MatchingClose(tokens, open, end);
    if (close < 0 || close === open + 1) {
        return -1;
    }
    let itemStart = open + 1;
    for (let i = open + 1; i <= close; i++) {
        if (i === close || (isPunctuation(tokens, i, ',') && tokens[i].Depth === tokens[open].Depth + 1)) {
            if (!IsScalarLiteral(tokens, itemStart, i)) {
                return -1;
            }
            itemStart = i + 1;
        }
    }
    return close;
}

/** A WHERE-condition conjunct that is not itself an AND chain. Token indexes are into the condition's tokens. */
export interface ConditionLeaf {
    Kind: 'Leaf';
    /** First token, including any wrapping parentheses. */
    Start: number;
    /** One past the last token, including any wrapping parentheses. */
    End: number;
    /** First token inside the wrapping parentheses. */
    InnerStart: number;
    /** One past the last token inside the wrapping parentheses. */
    InnerEnd: number;
}

/** An AND chain: its conjuncts in order and the `AND` token between each pair. */
export interface ConditionAnd {
    Kind: 'And';
    /** First token, including any wrapping parentheses. */
    Start: number;
    /** One past the last token, including any wrapping parentheses. */
    End: number;
    Children: ConditionNode[];
    /** `Separators[k]` is the index of the `AND` between `Children[k]` and `Children[k + 1]`. */
    Separators: number[];
}

/** A node of a WHERE condition read as AND-ed conjuncts. */
export type ConditionNode = ConditionLeaf | ConditionAnd;

/**
 * The `AND` tokens that split `[start, end)` into conjuncts at its own parenthesis depth, skipping the
 * `AND` of `BETWEEN … AND …` and anything inside `CASE … END`. Returns null when the range holds a
 * top-level `OR`: `OR` binds loosest, so such a range is one disjunction, never a conjunction.
 */
function topLevelAndSeparators(tokens: readonly SqlToken[], start: number, end: number): number[] | null {
    const depth = tokens[start].Depth;
    const separators: number[] = [];
    let caseDepth = 0;
    let pendingBetween = false;
    for (let i = start; i < end; i++) {
        const word = tokens[i].Depth === depth ? upperWord(tokens, i) : '';
        if (word === 'CASE') {
            caseDepth++;
        } else if (word === 'END' && caseDepth > 0) {
            caseDepth--;
        } else if (caseDepth > 0 || word === '') {
            continue;
        } else if (word === 'OR') {
            return null;
        } else if (word === 'BETWEEN') {
            pendingBetween = true;
        } else if (word === 'AND') {
            if (pendingBetween) pendingBetween = false;
            else separators.push(i);
        }
    }
    return separators;
}

function readConditionNode(tokens: readonly SqlToken[], start: number, end: number): ConditionNode {
    const inner = StripWrappingParens(tokens, start, end);
    const separators = inner.End > inner.Start ? topLevelAndSeparators(tokens, inner.Start, inner.End) : null;
    if (separators === null || separators.length === 0) {
        return { Kind: 'Leaf', Start: start, End: end, InnerStart: inner.Start, InnerEnd: inner.End };
    }
    const bounds = [inner.Start - 1, ...separators, inner.End];
    const children: ConditionNode[] = [];
    for (let k = 0; k + 1 < bounds.length; k++) {
        children.push(readConditionNode(tokens, bounds[k] + 1, bounds[k + 1]));
    }
    return { Kind: 'And', Start: start, End: end, Children: children, Separators: separators };
}

/**
 * Whether a WHERE condition's tokens can be read as one boolean expression: not empty, and with no comma
 * outside parentheses (a list where one condition belongs is not SQL any dialect accepts, so nothing in
 * it is trusted).
 */
export function IsReadableCondition(tokens: readonly SqlToken[]): boolean {
    if (tokens.length === 0) {
        return false;
    }
    const depth = tokens[0].Depth;
    return !tokens.some((t, i) => t.Depth === depth && isPunctuation(tokens, i, ','));
}

/** Reads a WHERE condition's tokens as a tree of AND-ed conjuncts, flattening AND chains through parentheses. */
export function ReadConditionTree(tokens: readonly SqlToken[]): ConditionNode {
    return readConditionNode(tokens, 0, tokens.length);
}

/** Every leaf of a condition tree, in text order. */
export function ConditionLeaves(node: ConditionNode): ConditionLeaf[] {
    return node.Kind === 'Leaf' ? [node] : node.Children.flatMap(ConditionLeaves);
}

/** A comparison operator found in a conjunct: its token range and its normalized text (`<=`, `NOT IN`, `IS NOT`). */
interface FoundOperator {
    Start: number;
    End: number;
    Text: string;
}

/** Reads a run of adjacent operator characters at `i` (`<`, `<=`, `<>`, `!=`). */
function operatorCharsAt(tokens: readonly SqlToken[], i: number, end: number): FoundOperator {
    let j = i;
    let text = '';
    while (j < end && tokens[j].Kind === 'Operator' && COMPARISON_CHARS.has(tokens[j].Text)
        && (j === i || tokens[j - 1].Span.End === tokens[j].Span.Start)) {
        text += tokens[j].Text;
        j++;
    }
    return { Start: i, End: j, Text: text };
}

/** Reads a keyword comparison operator at `i` (`IN`, `NOT LIKE`, `IS NOT`, …); null when none starts there. */
function keywordOperatorAt(tokens: readonly SqlToken[], i: number): FoundOperator | null {
    const word = upperWord(tokens, i);
    const next = upperWord(tokens, i + 1);
    if (word === 'IS') {
        return next === 'NOT' ? { Start: i, End: i + 2, Text: 'IS NOT' } : { Start: i, End: i + 1, Text: 'IS' };
    }
    if (word === 'IN' || word === 'LIKE' || word === 'BETWEEN') {
        return { Start: i, End: i + 1, Text: word };
    }
    if (word === 'NOT' && (next === 'IN' || next === 'LIKE' || next === 'BETWEEN')) {
        return { Start: i, End: i + 2, Text: `NOT ${next}` };
    }
    return null;
}

/** The first comparison operator at the range's own depth, outside `CASE … END`; null when there is none. */
function findComparisonOperator(tokens: readonly SqlToken[], start: number, end: number): FoundOperator | null {
    const depth = tokens[start].Depth;
    let caseDepth = 0;
    for (let i = start; i < end; i++) {
        if (tokens[i].Depth !== depth) continue;
        const word = upperWord(tokens, i);
        if (word === 'CASE') caseDepth++;
        else if (word === 'END' && caseDepth > 0) caseDepth--;
        if (caseDepth > 0 || word === 'END') continue;
        if (tokens[i].Kind === 'Operator' && COMPARISON_CHARS.has(tokens[i].Text)) {
            return operatorCharsAt(tokens, i, end);
        }
        const keyword = keywordOperatorAt(tokens, i);
        if (keyword !== null) return keyword;
    }
    return null;
}

/** The identifier path that is exactly `[start, end)` (wrapping parentheses allowed); null otherwise. */
function columnPathAt(tokens: readonly SqlToken[], start: number, end: number, paths: readonly IdentifierPath[]): IdentifierPath | null {
    const inner = StripWrappingParens(tokens, start, end);
    if (inner.End <= inner.Start) {
        return null;
    }
    const first = tokens[inner.Start].Span.Start;
    const last = tokens[inner.End - 1].Span.End;
    return paths.find((p) => p.Span.Start === first && p.Span.End === last) ?? null;
}

/** Whether `[start, end)` is `literal AND literal`, the bounds of a BETWEEN. */
function isBetweenBounds(tokens: readonly SqlToken[], start: number, end: number): boolean {
    for (let i = start + 1; i < end - 1; i++) {
        if (upperWord(tokens, i) === 'AND' && tokens[i].Depth === tokens[start].Depth) {
            return IsScalarLiteral(tokens, start, i) && IsScalarLiteral(tokens, i + 1, end);
        }
    }
    return false;
}

/** How the value side `[start, end)` of a `column <op> value` comparison is written; null when it is not literal. */
function valueKindOf(tokens: readonly SqlToken[], start: number, end: number, operator: string): PredicateValueKind | null {
    if (end <= start) {
        return null;
    }
    if (operator === 'IN' || operator === 'NOT IN') {
        return LiteralListClose(tokens, start, end) === end - 1 ? 'list' : null;
    }
    if (operator === 'BETWEEN' || operator === 'NOT BETWEEN') {
        return isBetweenBounds(tokens, start, end) ? 'list' : null;
    }
    return IsScalarLiteral(tokens, start, end) ? 'scalar' : null;
}

/** Flips a scalar comparison operator so a `value <op> column` predicate reads as `column <flip> value`. */
export function FlipOperator(op: string): string {
    switch (op) {
        case '<': return '>';
        case '>': return '<';
        case '<=': return '>=';
        case '>=': return '<=';
        // =, !=, <> are symmetric so need no flip. IN/BETWEEN/IS never appear as `value <op> column`.
        // NOTE: LIKE is NOT symmetric (`value LIKE column` ≠ `column LIKE value`), so this default would
        // MIS-normalize a column-on-right LIKE — safe only because LIKE is excluded from the read-time
        // filter operators (refused → live-only) and never reaches read-time injection. If LIKE (or any
        // non-symmetric op) is ever allowed there, handle its column-on-right form explicitly here.
        default: return op;
    }
}

/** A conjunct read as `column <op> literal value` (or `literal <op> column`). */
export interface ComparisonPredicate {
    /** The column side. */
    Column: IdentifierPath;
    /** The operator, normalized to the `column <op> value` reading (flipped when the column is on the right). */
    Operator: string;
    /** First token of the value side. */
    ValueStart: number;
    /** One past the last token of the value side. */
    ValueEnd: number;
    ValueKind: PredicateValueKind;
}

/**
 * Reads the conjunct `[start, end)` as a comparison between one plain column and a literal value: a scalar
 * literal, an all-literal `IN (…)` list, or literal `BETWEEN` bounds. The column may be on either side of
 * a scalar comparison. Returns null for anything else: a function or expression on either side, a
 * column compared to a column, a subquery, `OR`, `NOT`, an operator outside {@link COMPARISON_OPS}.
 * `paths` are the identifier paths of the expression the tokens belong to.
 */
export function ReadComparison(tokens: readonly SqlToken[], start: number, end: number, paths: readonly IdentifierPath[]): ComparisonPredicate | null {
    if (end <= start) return null;
    const op = findComparisonOperator(tokens, start, end);
    if (op === null || op.Start === start || !COMPARISON_OPS.has(op.Text)) return null;
    const left = columnPathAt(tokens, start, op.Start, paths);
    const right = columnPathAt(tokens, op.End, end, paths);
    if (left !== null && right === null) {
        const kind = valueKindOf(tokens, op.End, end, op.Text);
        return kind === null ? null : { Column: left, Operator: op.Text, ValueStart: op.End, ValueEnd: end, ValueKind: kind };
    }
    if (right !== null && left === null && IsScalarLiteral(tokens, start, op.Start)) {
        return { Column: right, Operator: FlipOperator(op.Text), ValueStart: start, ValueEnd: op.Start, ValueKind: 'scalar' };
    }
    return null;
}
