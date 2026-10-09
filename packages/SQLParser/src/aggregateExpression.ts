import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from './sql-parser.js';
import { LexSQL, SignificantTokens } from './sqlLexer.js';

/** Result of {@link CheckAggregateExpression}. */
export interface AggregateExpressionCheck {
    /** Whether the expression may be placed as one item of an aggregate SELECT list. */
    IsAllowed: boolean;
    /** Why the expression was refused; `null` when it is allowed. */
    Reason: string | null;
}

/** Aggregate functions an aggregate expression may call at its top level. */
const AGGREGATE_FUNCTIONS = new Set([
    'COUNT', 'COUNT_BIG', 'SUM', 'AVG', 'MIN', 'MAX', 'STDEV', 'STDEVP', 'VAR', 'VARP', 'STRING_AGG', 'CHECKSUM_AGG',
]);

/** Scalar functions an aggregate expression may call inside its aggregate. Each is pure and reads no table. */
const SCALAR_FUNCTIONS = new Set([
    'ISNULL', 'COALESCE', 'NULLIF', 'IIF',
    'ABS', 'CEILING', 'CEIL', 'FLOOR', 'ROUND', 'POWER', 'SQRT', 'SIGN', 'EXP', 'LOG', 'LOG10',
    'LEN', 'LENGTH', 'UPPER', 'LOWER', 'LTRIM', 'RTRIM', 'TRIM', 'LEFT', 'RIGHT', 'SUBSTRING', 'CHARINDEX', 'REPLACE', 'CONCAT',
    'YEAR', 'MONTH', 'DAY', 'DATEPART', 'DATEDIFF', 'DATEADD', 'EOMONTH', 'DATE_PART', 'DATE_TRUNC',
    'GETDATE', 'GETUTCDATE', 'SYSDATETIME', 'NOW',
    // The parser reads `NOT (x)` as a call to a function named NOT.
    'NOT',
]);

/** SQL Server functions whose first argument is a date-part keyword (`DATEDIFF(day, a, b)`), which the parser reads as a column. */
const DATE_PART_FUNCTIONS = new Set(['DATEPART', 'DATEDIFF', 'DATEADD']);

/** The date-part keywords {@link DATE_PART_FUNCTIONS} accept, lower case. */
const DATE_PARTS = new Set([
    'year', 'yy', 'yyyy', 'quarter', 'qq', 'q', 'month', 'mm', 'm', 'dayofyear', 'dy', 'y', 'day', 'dd', 'd',
    'week', 'wk', 'ww', 'weekday', 'dw', 'w', 'hour', 'hh', 'minute', 'mi', 'n', 'second', 'ss', 's',
    'millisecond', 'ms', 'microsecond', 'mcs', 'nanosecond', 'ns', 'iso_week', 'isowk', 'isoww',
]);

const BINARY_OPERATORS = new Set([
    '+', '-', '*', '/', '%', '||', '=', '<>', '!=', '<', '>', '<=', '>=',
    'AND', 'OR', 'IS', 'IS NOT', 'LIKE', 'NOT LIKE', 'ILIKE', 'NOT ILIKE', 'IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN',
]);

const UNARY_OPERATORS = new Set(['-', '+', 'NOT']);

/** Constant node types. A T-SQL `"x"` (`double_quote_string`) is a quoted identifier and is checked as a column. */
const CONSTANT_TYPES = new Set(['number', 'single_quote_string', 'var_string', 'bool', 'null']);

/**
 * The keys of each node shape that hold a sub-expression this checker reads. Any other key whose
 * value is an object (a COLLATE, OVER, FILTER or ORDER BY clause, and anything the parser adds
 * later) refuses the expression.
 */
const AGGREGATE_KEYS = new Set(['name', 'args']);
const AGGREGATE_ARG_KEYS = new Set(['expr', 'separator']);
const CALL_KEYS = new Set(['name', 'args']);
const COLUMN_KEYS = new Set(['column']);
const BINARY_KEYS = new Set(['left', 'right']);
const UNARY_KEYS = new Set(['expr']);
const LIST_KEYS = new Set(['value']);
const CASE_KEYS = new Set(['expr', 'args']);
const BRANCH_KEYS = new Set(['cond', 'result']);
const CAST_KEYS = new Set(['expr', 'target']);
const SEPARATOR_KEYS = new Set(['delimiter']);
const TYPE_KEYS = new Set(['suffix']);

/** The only table the expression is parsed against. */
const SCREEN_TABLE = '__mj_aggregate_screen';

const SINGLE_CALL = 'it must be a single aggregate function call, with nothing before or after it';

type ASTNode = Record<string, unknown>;

/**
 * Whether `expression` may be placed as one item of an aggregate SELECT list —
 * `SELECT <expression> AS [Agg_0] FROM <entity view> WHERE …` — for an entity whose columns are
 * `columns`.
 *
 * Allowed: exactly one call to an aggregate function (COUNT, SUM, AVG, MIN, MAX, STDEV, VAR,
 * STRING_AGG, …) with nothing before or after it. Inside the call: the given columns, `*` for
 * COUNT, DISTINCT, constants, arithmetic, comparison and logical operators, CASE, CAST, and a
 * fixed set of pure scalar functions. Everything else is refused: statement separators, comments,
 * subqueries, other tables, qualified names, variables, aliases, window clauses, and any shape
 * the parser produces that this check does not read.
 *
 * Tokens are read for the dialect — `[…]` identifiers on SQL Server, `E'…'` and dollar-quoted
 * strings on PostgreSQL — so a quote inside an identifier, or an escaped quote inside a string,
 * cannot hide a statement separator.
 *
 * @param expression The caller-supplied aggregate expression
 * @param dialect The dialect the expression runs under
 * @param columns The entity's column names (its base view's columns), matched case-insensitively
 */
export function CheckAggregateExpression(expression: string, dialect: SQLParserDialect, columns: Iterable<string>): AggregateExpressionCheck {
    if (typeof expression !== 'string' || expression.trim().length === 0) return refuse('it is empty');
    const tokenProblem = checkTokens(expression, dialect);
    if (tokenProblem) return refuse(tokenProblem);
    const call = parseSingleItem(expression, dialect);
    if (typeof call === 'string') return refuse(call);
    const problem = new AggregateCallChecker(columns).Check(call);
    return problem ? refuse(problem) : { IsAllowed: true, Reason: null };
}

function refuse(reason: string): AggregateExpressionCheck {
    return { IsAllowed: false, Reason: reason };
}

/** Refuses comments and statement separators, and requires `name(…)` with nothing outside its parentheses. */
function checkTokens(expression: string, dialect: SQLParserDialect): string | null {
    const tokens = LexSQL(expression, dialect);
    if (tokens.some(t => t.Kind === 'comment')) return 'it contains a comment';
    if (tokens.some(t => t.Kind === 'semicolon')) return 'it contains a statement separator (;)';
    const significant = SignificantTokens(tokens);
    const last = significant[significant.length - 1];
    const isOneCall = significant.length >= 3 &&
        significant[0].Kind === 'word' &&
        significant[1].Kind === 'open' &&
        last.Kind === 'close' && last.Depth === 0 &&
        significant.slice(2, -1).every(t => t.Depth > 0);
    return isOneCall ? null : SINGLE_CALL;
}

/** Parses the expression as the only item of `SELECT … FROM <screen table>`; returns the item's node or why it was refused. */
function parseSingleItem(expression: string, dialect: SQLParserDialect): ASTNode | string {
    const ast: unknown = SQLParser.ParseSQL(`SELECT ${expression} FROM ${SCREEN_TABLE}`, dialect);
    if (!ast) return 'it could not be parsed as SQL';
    const statements: unknown[] = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1) return 'it contains more than one statement';
    const select = statements[0];
    if (!isNode(select) || select.type !== 'select' || !readsOnlyScreenTable(select.from)) return SINGLE_CALL;
    const items: unknown = select.columns;
    if (!Array.isArray(items) || items.length !== 1) return SINGLE_CALL;
    const item: unknown = items[0];
    if (!isNode(item) || item.as || !isNode(item.expr)) return SINGLE_CALL;
    return item.expr;
}

function readsOnlyScreenTable(from: unknown): boolean {
    if (!Array.isArray(from) || from.length !== 1) return false;
    const source: unknown = from[0];
    return isNode(source) && typeof source.table === 'string' && source.table.toLowerCase() === SCREEN_TABLE && !source.db && !source.join;
}

function isNode(value: unknown): value is ASTNode {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConstant(value: unknown): boolean {
    return isNode(value) && typeof value.type === 'string' && CONSTANT_TYPES.has(value.type);
}

/** The first key outside `type` and `read` whose value is an object: a clause this checker does not read. */
function unreadPart(node: ASTNode, read: ReadonlySet<string>): string | null {
    for (const [key, value] of Object.entries(node)) {
        if (key !== 'type' && !read.has(key) && typeof value === 'object' && value !== null) return key;
    }
    return null;
}

function usesPart(key: string): string {
    return `it uses ${key.replace(/_/g, ' ').toUpperCase()}, which aggregate expressions do not allow`;
}

/** The name a call node invokes, as written (`SUM`, `dbo.fnX`), or null when the node is not a readable call. */
function callName(node: ASTNode): string | null {
    if (node.type === 'aggr_func') return typeof node.name === 'string' ? node.name : null;
    if (node.type !== 'function' || !isNode(node.name)) return null;
    const nameParts: unknown = node.name.name;
    if (!Array.isArray(nameParts) || nameParts.length === 0) return null;
    const parts: unknown[] = node.name.schema ? [node.name.schema, ...nameParts] : [...nameParts];
    const names = parts.map(namePart);
    return names.every((n): n is string => n !== null) ? names.join('.') : null;
}

function namePart(part: unknown): string | null {
    return isNode(part) && typeof part.value === 'string' ? part.value : null;
}

/** The column a `column_ref` names: a plain string on SQL Server, `{ expr: { value } }` on PostgreSQL. */
function columnName(node: ASTNode): unknown {
    if (typeof node.column === 'string') return node.column;
    return isNode(node.column) && isNode(node.column.expr) ? node.column.expr.value : undefined;
}

function isDatePart(value: unknown): boolean {
    if (!isNode(value) || value.type !== 'column_ref' || value.table) return false;
    const name = columnName(value);
    return typeof name === 'string' && DATE_PARTS.has(name.toLowerCase());
}

/** Walks one aggregate call, allowing only the node shapes {@link CheckAggregateExpression} documents. */
class AggregateCallChecker {
    private readonly columns: Set<string>;

    constructor(columns: Iterable<string>) {
        this.columns = new Set(Array.from(columns, c => c.trim().toLowerCase()));
    }

    /** Checks the top-level call; returns why it is refused, or null when it is allowed. */
    public Check(call: ASTNode): string | null {
        const name = callName(call);
        if (name === null) return SINGLE_CALL;
        const upper = name.toUpperCase();
        if (!AGGREGATE_FUNCTIONS.has(upper)) return `${name} is not an aggregate function`;
        // STDEV, VAR and their siblings parse as plain function calls rather than aggr_func.
        return call.type === 'aggr_func' ? this.checkAggregateArgs(upper, call) : this.checkCallArgs(call, upper);
    }

    private checkAggregateArgs(upperName: string, call: ASTNode): string | null {
        const unread = unreadPart(call, AGGREGATE_KEYS);
        if (unread) return usesPart(unread);
        const args = call.args;
        if (!isNode(args)) return SINGLE_CALL;
        const unreadArg = unreadPart(args, AGGREGATE_ARG_KEYS);
        if (unreadArg) return usesPart(unreadArg);
        if (args.separator !== null && args.separator !== undefined) {
            const separatorProblem = this.checkSeparator(args.separator);
            if (separatorProblem) return separatorProblem;
        }
        const countsRows = (upperName === 'COUNT' || upperName === 'COUNT_BIG') && isNode(args.expr) && args.expr.type === 'star';
        return countsRows ? null : this.checkExpression(args.expr);
    }

    private checkSeparator(separator: unknown): string | null {
        if (!isNode(separator) || unreadPart(separator, SEPARATOR_KEYS)) return usesPart('separator');
        return isConstant(separator.delimiter) ? null : 'it uses a STRING_AGG separator that is not a constant';
    }

    /** Checks one expression inside the aggregate call. */
    private checkExpression(node: unknown): string | null {
        if (!isNode(node)) return 'it contains an expression the parser could not read';
        if ('ast' in node) return 'it contains a subquery';
        switch (node.type) {
            case 'column_ref': return this.checkColumn(node);
            case 'double_quote_string': return this.checkColumnName(node.value);
            case 'binary_expr': return this.checkOperation(node, BINARY_OPERATORS, BINARY_KEYS, [node.left, node.right]);
            case 'unary_expr': return this.checkOperation(node, UNARY_OPERATORS, UNARY_KEYS, [node.expr]);
            case 'expr_list': return unreadPart(node, LIST_KEYS) ? usesPart('list') : this.checkList(node.value);
            case 'case': return this.checkCase(node);
            case 'cast': return this.checkCast(node);
            case 'function': return this.checkScalarCall(node);
            case 'aggr_func': return 'aggregate functions cannot be nested';
            default:
                if (isConstant(node)) return null;
                return `it contains an expression of type "${String(node.type)}", which aggregate expressions do not allow`;
        }
    }

    private checkList(nodes: unknown): string | null {
        if (!Array.isArray(nodes)) return 'it contains a list the parser could not read';
        for (const node of nodes) {
            const problem = this.checkExpression(node);
            if (problem) return problem;
        }
        return null;
    }

    private checkColumn(node: ASTNode): string | null {
        const unread = unreadPart(node, COLUMN_KEYS);
        if (unread) return usesPart(unread);
        if (node.table || node.db || node.schema) return 'it uses a qualified column name; name the column alone';
        return this.checkColumnName(columnName(node));
    }

    private checkColumnName(name: unknown): string | null {
        if (typeof name !== 'string') return 'it contains a column reference the parser could not read';
        return this.columns.has(name.trim().toLowerCase()) ? null : `it references "${name}", which is not a column of this entity`;
    }

    private checkOperation(node: ASTNode, operators: ReadonlySet<string>, read: ReadonlySet<string>, operands: unknown[]): string | null {
        const operator = typeof node.operator === 'string' ? node.operator.toUpperCase() : '';
        if (!operators.has(operator)) return `it uses the operator "${operator}", which aggregate expressions do not allow`;
        const unread = unreadPart(node, read);
        return unread ? usesPart(unread) : this.checkList(operands);
    }

    private checkCase(node: ASTNode): string | null {
        const unread = unreadPart(node, CASE_KEYS);
        if (unread) return usesPart(unread);
        if (node.expr !== null && node.expr !== undefined) {
            const problem = this.checkExpression(node.expr);
            if (problem) return problem;
        }
        if (!Array.isArray(node.args)) return 'it contains a CASE the parser could not read';
        for (const branch of node.args) {
            const problem = this.checkBranch(branch);
            if (problem) return problem;
        }
        return null;
    }

    private checkBranch(branch: unknown): string | null {
        if (!isNode(branch) || (branch.type !== 'when' && branch.type !== 'else')) return 'it contains a CASE the parser could not read';
        const unread = unreadPart(branch, BRANCH_KEYS);
        if (unread) return usesPart(unread);
        return this.checkList(branch.type === 'when' ? [branch.cond, branch.result] : [branch.result]);
    }

    private checkCast(node: ASTNode): string | null {
        const unread = unreadPart(node, CAST_KEYS);
        if (unread) return usesPart(unread);
        if (!Array.isArray(node.target) || !node.target.every(isTypeName)) return 'it casts to a type the parser could not read';
        return this.checkExpression(node.expr);
    }

    private checkScalarCall(node: ASTNode): string | null {
        const name = callName(node);
        if (name === null) return 'it calls a function whose name the parser could not read';
        const upper = name.toUpperCase();
        if (SCALAR_FUNCTIONS.has(upper)) return this.checkCallArgs(node, upper);
        return AGGREGATE_FUNCTIONS.has(upper)
            ? 'aggregate functions cannot be nested'
            : `it calls ${name}(), which aggregate expressions do not allow`;
    }

    /** Checks a function call's arguments; a date-part keyword may lead a {@link DATE_PART_FUNCTIONS} call. */
    private checkCallArgs(node: ASTNode, upperName: string): string | null {
        const unread = unreadPart(node, CALL_KEYS);
        if (unread) return usesPart(unread);
        const args = node.args;
        if (args === null || args === undefined) return null;
        if (!isNode(args) || args.type !== 'expr_list' || !Array.isArray(args.value)) return `it calls ${upperName} with arguments the parser could not read`;
        const values: unknown[] = args.value;
        return DATE_PART_FUNCTIONS.has(upperName) && isDatePart(values[0]) ? this.checkList(values.slice(1)) : this.checkList(values);
    }
}

/** A CAST target that is only a type name, with optional length and scale. */
function isTypeName(target: unknown): boolean {
    if (!isNode(target) || typeof target.dataType !== 'string' || !/^[A-Za-z][A-Za-z0-9_ ]*$/.test(target.dataType)) return false;
    const suffix = target.suffix;
    const plainSuffix = suffix === undefined || suffix === null || (Array.isArray(suffix) && suffix.length === 0);
    return plainSuffix && unreadPart(target, TYPE_KEYS) === null;
}
