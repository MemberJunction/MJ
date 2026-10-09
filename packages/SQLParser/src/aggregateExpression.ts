import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from './sql-parser.js';
import { LexSQL, SignificantTokens } from './sqlLexer.js';

/** Result of {@link CheckAggregateExpression}. */
export interface AggregateExpressionCheck {
    /** Whether the expression may be placed as one item of an aggregate SELECT list. */
    IsAllowed: boolean;
    /** Why the expression was refused; `null` when it is allowed. */
    Reason: string | null;
    /**
     * The SQL to run in place of the caller's text: the expression rebuilt from its checked parse
     * tree, with the dialect's quoting. `null` when the expression is refused.
     */
    SQL: string | null;
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

/** Types a CAST inside an aggregate may convert to. */
const CAST_TYPES = new Set([
    'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'BIT', 'DECIMAL', 'NUMERIC', 'MONEY', 'SMALLMONEY', 'FLOAT', 'REAL',
    'DATE', 'TIME', 'DATETIME', 'DATETIME2', 'DATETIMEOFFSET', 'SMALLDATETIME', 'TIMESTAMP', 'TIMESTAMPTZ',
    'CHAR', 'VARCHAR', 'NCHAR', 'NVARCHAR', 'TEXT', 'UNIQUEIDENTIFIER', 'UUID', 'BOOLEAN', 'BOOL',
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

/** A numeric literal the way both databases read one. */
const NUMBER_TEXT = /^-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/**
 * The keys of each node shape that hold a sub-expression the renderer reads. Any other key whose
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

const BACKSLASH = 'it contains a backslash inside a quoted string or identifier';

type ASTNode = Record<string, unknown>;

/**
 * Whether `expression` may be placed as one item of an aggregate SELECT list —
 * `SELECT <expression> AS [Agg_0] FROM <entity view> WHERE …` — for an entity whose columns are
 * `columns`, and the SQL to run for it.
 *
 * Allowed: exactly one call to an aggregate function (COUNT, SUM, AVG, MIN, MAX, STDEV, VAR,
 * STRING_AGG, …) with nothing before or after it. Inside the call: the given columns, `*` for
 * COUNT, DISTINCT, constants, arithmetic, comparison and logical operators, CASE, CAST, and a
 * fixed set of pure scalar functions. Everything else is refused: statement separators, comments,
 * backslashes inside quoted strings or identifiers, subqueries, other tables, qualified names,
 * variables, aliases, window clauses, and any shape the parser produces that this check does not
 * read.
 *
 * The caller's text is never run. {@link AggregateExpressionCheck.SQL} is rebuilt from the
 * checked parse tree: columns come from `columns` and are quoted for the dialect; function names,
 * type names, operators and keywords come from fixed lists; string and number constants are
 * re-quoted or re-checked. So the database runs exactly the expression that was checked, even
 * where the parser and the database would read the caller's text differently.
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
    try {
        return { IsAllowed: true, Reason: null, SQL: new AggregateRenderer(dialect, columns).RenderCall(call) };
    } catch (e) {
        if (e instanceof AggregateRefusal) return refuse(e.message);
        throw e;
    }
}

function refuse(reason: string): AggregateExpressionCheck {
    return { IsAllowed: false, Reason: reason, SQL: null };
}

/** Refuses an expression from inside {@link AggregateRenderer}; {@link CheckAggregateExpression} turns it into a refusal. */
class AggregateRefusal extends Error {}

function refuseWith(reason: string): never {
    throw new AggregateRefusal(reason);
}

/**
 * Refuses comments, statement separators and backslashes inside quoted spans, and requires
 * `name(…)` with nothing outside its parentheses. The parser reads `\'` inside `'…'` as an escaped
 * quote and the database does not, so a backslash is the one way the two could disagree about
 * where a quoted span ends.
 */
function checkTokens(expression: string, dialect: SQLParserDialect): string | null {
    const tokens = LexSQL(expression, dialect);
    if (tokens.some(t => t.Kind === 'comment')) return 'it contains a comment';
    if (tokens.some(t => t.Kind === 'semicolon')) return 'it contains a statement separator (;)';
    if (tokens.some(t => (t.Kind === 'string' || t.Kind === 'identifier') && t.Text.includes('\\'))) return BACKSLASH;
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

/** Refuses a node that holds an object under a key outside `type` and `read`: a clause the renderer does not read. */
function assertRead(node: ASTNode, read: ReadonlySet<string>): void {
    for (const [key, value] of Object.entries(node)) {
        if (key !== 'type' && !read.has(key) && typeof value === 'object' && value !== null) {
            refuseWith(`it uses ${key.replace(/_/g, ' ').toUpperCase()}, which aggregate expressions do not allow`);
        }
    }
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

/** The date-part keyword a {@link DATE_PART_FUNCTIONS} call starts with, lower case, or null. */
function datePartOf(value: unknown): string | null {
    if (!isNode(value) || value.type !== 'column_ref' || value.table) return null;
    const name = columnName(value);
    return typeof name === 'string' && DATE_PARTS.has(name.toLowerCase()) ? name.toLowerCase() : null;
}

function parenthesize(sql: string, operand: boolean): string {
    return operand ? `(${sql})` : sql;
}

/** The upper-case operator of an operation node, refused unless it is in `allowed`. */
function operatorOf(node: ASTNode, allowed: ReadonlySet<string>): string {
    const operator = typeof node.operator === 'string' ? node.operator.toUpperCase() : '';
    return allowed.has(operator) ? operator : refuseWith(`it uses the operator "${operator}", which aggregate expressions do not allow`);
}

/** Rebuilds a constant: numbers re-checked, strings re-quoted, NULL and booleans as keywords. */
function renderConstant(node: ASTNode): string {
    switch (node.type) {
        case 'number':
        case 'bigint': return renderNumber(node.value);
        case 'single_quote_string': return `'${requote(node.value)}'`;
        case 'var_string': return `N'${requote(node.value)}'`;
        case 'bool': return renderBoolean(node.value);
        case 'null': return 'NULL';
        default: return refuseWith(`it contains an expression of type "${String(node.type)}", which aggregate expressions do not allow`);
    }
}

function renderNumber(value: unknown): string {
    const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : '';
    return NUMBER_TEXT.test(text) ? text : refuseWith('it contains a number the parser could not read');
}

function renderBoolean(value: unknown): string {
    return typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : refuseWith('it contains a boolean the parser could not read');
}

/** A string constant as the inside of a quoted literal: the parser's doubled quotes undone, then every quote doubled. */
function requote(raw: unknown): string {
    if (typeof raw !== 'string') return refuseWith('it contains a string the parser could not read');
    if (raw.includes('\\')) return refuseWith(BACKSLASH);
    return raw.replace(/''/g, "'").replace(/'/g, "''");
}

function isStringConstant(value: unknown): boolean {
    return isNode(value) && (value.type === 'single_quote_string' || value.type === 'var_string');
}

/** The right side of `IS` / `IS NOT`: only NULL, TRUE or FALSE. */
function renderIsOperand(value: unknown): string {
    if (isNode(value) && value.type === 'null') return 'NULL';
    if (isNode(value) && value.type === 'bool') return renderBoolean(value.value);
    return refuseWith('it uses IS with something other than NULL, TRUE or FALSE');
}

/** A CAST target: an allowed type name with an optional length and scale. */
function renderType(target: unknown): string {
    if (!isNode(target) || typeof target.dataType !== 'string') return refuseWith('it casts to a type the parser could not read');
    assertRead(target, TYPE_KEYS);
    const type = target.dataType.toUpperCase();
    if (!CAST_TYPES.has(type)) return refuseWith(`it casts to ${type}, which aggregate expressions do not allow`);
    const suffix = target.suffix;
    if (suffix !== undefined && suffix !== null && !(Array.isArray(suffix) && suffix.length === 0)) return refuseWith('it casts with a type suffix');
    if (target.length === undefined || target.length === null) {
        return target.scale === undefined || target.scale === null ? type : refuseWith('it casts with a scale but no length');
    }
    const scale = target.scale === undefined || target.scale === null ? '' : `, ${renderTypeSize(target.scale)}`;
    return `${type}(${renderTypeSize(target.length)}${scale})`;
}

function renderTypeSize(value: unknown): string {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return String(value);
    if (typeof value === 'string' && value.toUpperCase() === 'MAX') return 'MAX';
    return refuseWith('it casts with a size the parser could not read');
}

/** A call's argument nodes; an empty list when it has none. */
function callArguments(node: ASTNode, upperName: string): unknown[] {
    const args = node.args;
    if (args === null || args === undefined) return [];
    if (!isNode(args) || args.type !== 'expr_list' || !Array.isArray(args.value)) {
        return refuseWith(`it calls ${upperName} with arguments the parser could not read`);
    }
    assertRead(args, LIST_KEYS);
    return args.value;
}

/**
 * Walks one aggregate call, allowing only the node shapes {@link CheckAggregateExpression} documents,
 * and rebuilds its SQL. An operation that is the operand of another operation is parenthesized, so
 * the rebuilt SQL keeps the parse tree's grouping.
 */
class AggregateRenderer {
    private readonly columns = new Map<string, string>();

    constructor(private readonly dialect: SQLParserDialect, columns: Iterable<string>) {
        for (const column of columns) this.columns.set(column.trim().toLowerCase(), column.trim());
    }

    /** Rebuilds the top-level aggregate call. */
    public RenderCall(call: ASTNode): string {
        const name = callName(call);
        if (name === null) return refuseWith(SINGLE_CALL);
        const upper = name.toUpperCase();
        if (!AGGREGATE_FUNCTIONS.has(upper)) return refuseWith(`${name} is not an aggregate function`);
        // STDEV, VAR and their siblings parse as plain function calls rather than aggr_func.
        return call.type === 'aggr_func' ? this.renderAggregate(upper, call) : this.renderCall(upper, call);
    }

    private renderAggregate(upperName: string, call: ASTNode): string {
        assertRead(call, AGGREGATE_KEYS);
        const args = call.args;
        if (!isNode(args)) return refuseWith(SINGLE_CALL);
        assertRead(args, AGGREGATE_ARG_KEYS);
        const distinct = this.renderDistinct(args.distinct);
        if ((upperName === 'COUNT' || upperName === 'COUNT_BIG') && !distinct && isNode(args.expr) && args.expr.type === 'star') {
            return `${upperName}(*)`;
        }
        const separator = args.separator === null || args.separator === undefined ? '' : `, ${this.renderSeparator(args.separator)}`;
        return `${upperName}(${distinct}${this.render(args.expr)}${separator})`;
    }

    private renderDistinct(value: unknown): string {
        if (value === null || value === undefined) return '';
        return typeof value === 'string' && value.toUpperCase() === 'DISTINCT' ? 'DISTINCT ' : refuseWith(`it uses ${String(value)} inside the aggregate`);
    }

    private renderSeparator(separator: unknown): string {
        if (!isNode(separator)) return refuseWith('it uses a STRING_AGG separator the parser could not read');
        assertRead(separator, SEPARATOR_KEYS);
        return isStringConstant(separator.delimiter) ? this.render(separator.delimiter) : refuseWith('it uses a STRING_AGG separator that is not a constant');
    }

    /** Rebuilds one expression inside the aggregate call; `operand` parenthesizes an operation. */
    private render(node: unknown, operand = false): string {
        if (!isNode(node)) return refuseWith('it contains an expression the parser could not read');
        if ('ast' in node) return refuseWith('it contains a subquery');
        switch (node.type) {
            case 'column_ref': return this.renderColumn(node);
            // A T-SQL "x" is a quoted identifier.
            case 'double_quote_string': return this.renderColumnName(node.value);
            case 'binary_expr': return parenthesize(this.renderBinary(node), operand);
            case 'unary_expr': return parenthesize(this.renderUnary(node), operand);
            case 'case': return this.renderCase(node);
            case 'cast': return this.renderCast(node);
            case 'function': return this.renderScalarCall(node);
            case 'aggr_func': return refuseWith('aggregate functions cannot be nested');
            default: return renderConstant(node);
        }
    }

    private renderColumn(node: ASTNode): string {
        assertRead(node, COLUMN_KEYS);
        if (node.table || node.db || node.schema) return refuseWith('it uses a qualified column name; name the column alone');
        return this.renderColumnName(columnName(node));
    }

    private renderColumnName(name: unknown): string {
        if (typeof name !== 'string') return refuseWith('it contains a column reference the parser could not read');
        const column = this.columns.get(name.trim().toLowerCase());
        return column === undefined
            ? refuseWith(`it references "${name}", which is not a column of this entity`)
            : this.dialect.QuoteIdentifier(column);
    }

    private renderBinary(node: ASTNode): string {
        const operator = operatorOf(node, BINARY_OPERATORS);
        assertRead(node, BINARY_KEYS);
        const left = this.render(node.left, true);
        if (operator === 'IN' || operator === 'NOT IN') return `${left} ${operator} (${this.renderList(node.right).join(', ')})`;
        if (operator === 'BETWEEN' || operator === 'NOT BETWEEN') {
            const bounds = this.renderList(node.right, true);
            return bounds.length === 2 ? `${left} ${operator} ${bounds[0]} AND ${bounds[1]}` : refuseWith(`it uses ${operator} without two bounds`);
        }
        if (operator === 'IS' || operator === 'IS NOT') return `${left} ${operator} ${renderIsOperand(node.right)}`;
        return `${left} ${operator} ${this.render(node.right, true)}`;
    }

    private renderUnary(node: ASTNode): string {
        const operator = operatorOf(node, UNARY_OPERATORS);
        assertRead(node, UNARY_KEYS);
        // The space keeps a minus before a negative number from forming the comment marker `--`.
        return `${operator} ${this.render(node.expr, true)}`;
    }

    private renderList(node: unknown, operands = false): string[] {
        if (isNode(node) && 'ast' in node) return refuseWith('it contains a subquery');
        if (!isNode(node) || node.type !== 'expr_list' || !Array.isArray(node.value)) return refuseWith('it contains a list the parser could not read');
        assertRead(node, LIST_KEYS);
        return node.value.map((value: unknown) => this.render(value, operands));
    }

    private renderCase(node: ASTNode): string {
        assertRead(node, CASE_KEYS);
        const subject = node.expr === null || node.expr === undefined ? '' : ` ${this.render(node.expr)}`;
        if (!Array.isArray(node.args) || node.args.length === 0) return refuseWith('it contains a CASE the parser could not read');
        const branches = node.args.map((branch: unknown) => this.renderBranch(branch));
        return `CASE${subject} ${branches.join(' ')} END`;
    }

    private renderBranch(branch: unknown): string {
        if (!isNode(branch) || (branch.type !== 'when' && branch.type !== 'else')) return refuseWith('it contains a CASE the parser could not read');
        assertRead(branch, BRANCH_KEYS);
        return branch.type === 'when'
            ? `WHEN ${this.render(branch.cond)} THEN ${this.render(branch.result)}`
            : `ELSE ${this.render(branch.result)}`;
    }

    private renderCast(node: ASTNode): string {
        assertRead(node, CAST_KEYS);
        if (!Array.isArray(node.target) || node.target.length !== 1) return refuseWith('it casts to a type the parser could not read');
        return `CAST(${this.render(node.expr)} AS ${renderType(node.target[0])})`;
    }

    private renderScalarCall(node: ASTNode): string {
        const name = callName(node);
        if (name === null) return refuseWith('it calls a function whose name the parser could not read');
        const upper = name.toUpperCase();
        if (SCALAR_FUNCTIONS.has(upper)) return this.renderCall(upper, node);
        return refuseWith(AGGREGATE_FUNCTIONS.has(upper) ? 'aggregate functions cannot be nested' : `it calls ${name}(), which aggregate expressions do not allow`);
    }

    /** Rebuilds a function call; a date-part keyword may lead a {@link DATE_PART_FUNCTIONS} call. */
    private renderCall(upperName: string, node: ASTNode): string {
        assertRead(node, CALL_KEYS);
        const values = callArguments(node, upperName);
        if (upperName === 'NOT') {
            return values.length === 1 ? `NOT (${this.render(values[0])})` : refuseWith('it uses NOT with more than one operand');
        }
        const datePart = DATE_PART_FUNCTIONS.has(upperName) ? datePartOf(values[0]) : null;
        const rendered = datePart === null
            ? values.map(value => this.render(value))
            : [datePart, ...values.slice(1).map(value => this.render(value))];
        return `${upperName}(${rendered.join(', ')})`;
    }
}
