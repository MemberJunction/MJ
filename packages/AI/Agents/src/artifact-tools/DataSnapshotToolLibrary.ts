/**
 * @fileoverview Artifact tool library for DataSnapshot content.
 *
 * Parses a DataSnapshot JSON string and exposes tools for inspecting
 * table metadata, slicing rows, searching, aggregating, grouping,
 * computing derived columns, and multi-condition filtering.
 */
import { RegisterClass } from '@memberjunction/global';
import { NormalizeToTables } from '@memberjunction/core';
import {
    BaseArtifactToolLibrary,
    type ArtifactToolDefinition,
    type ArtifactToolResult,
} from '@memberjunction/ai-core-plus';

// ---------------------------------------------------------------------------
// Internal types (kept local — no `any`)
// ---------------------------------------------------------------------------

interface SnapshotColumn {
    field: string;
    sqlBaseType: string;
}

interface SnapshotTable {
    name: string;
    columns: SnapshotColumn[];
    rows: Array<Record<string, unknown>>;
    metadata?: { rowCount: number };
}

interface SnapshotPayload {
    tables: SnapshotTable[];
}

type SearchOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith';
type AggregateOperation =
    | 'sum' | 'avg' | 'mean' | 'count' | 'min' | 'max' | 'distinct_count'
    | 'median' | 'percentile' | 'mode' | 'stdev' | 'variance';

/**
 * Structured aggregate result. Always carries `value`; for operations where
 * the identity matters (min/max → which row, distinct_count → which values,
 * mode → which value + how often) the result includes context fields so the
 * LLM doesn't have to guess or make a follow-up tool call.
 *
 * `value` is typed `unknown` because mode can return any scalar (string,
 * boolean, number, null) while the other ops return number. Consumers should
 * narrow based on the operation they requested.
 */
interface AggregateResult {
    value: unknown;
    /** For min/max/mode — rows whose field value equals the extremum / most frequent value. Capped at 10. */
    contributingRows?: Array<Record<string, unknown>>;
    /** For distinct_count — the actual distinct values. Capped at 50. */
    distinctValues?: unknown[];
    /** For mode — how many rows had the returned value. */
    frequency?: number;
    /** For mode — all tied mode values when frequency is shared by multiple values. Capped at 50. */
    allModes?: unknown[];
    /** True when `contributingRows` / `distinctValues` / `allModes` was truncated by the cap. */
    truncated?: boolean;
}

const VALID_SEARCH_OPERATORS: ReadonlySet<string> = new Set<SearchOperator>([
    'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'startsWith',
]);

const VALID_AGGREGATE_OPS: ReadonlySet<string> = new Set<AggregateOperation>([
    'sum', 'avg', 'mean', 'count', 'min', 'max', 'distinct_count',
    'median', 'percentile', 'mode', 'stdev', 'variance',
]);

// ---------------------------------------------------------------------------
// Safe arithmetic expression evaluator (for the `compute` tool)
//
// Deliberately NOT eval/Function — a restricted recursive-descent parser over
// numbers, field references, `+ - * /`, unary minus, parentheses, and a small
// whitelisted function set. This keeps derived-column computation deterministic
// and sandbox-free; anything beyond arithmetic belongs in Codesmith.
// ---------------------------------------------------------------------------

type ExprNode =
    | { type: 'num'; value: number }
    | { type: 'field'; name: string }
    | { type: 'unary'; operand: ExprNode }
    | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: ExprNode; right: ExprNode }
    | { type: 'call'; name: string; args: ExprNode[] };

const EXPR_FUNCTIONS: ReadonlySet<string> = new Set([
    'abs', 'round', 'floor', 'ceil', 'sqrt', 'min', 'max',
]);

type ExprToken =
    | { kind: 'num'; value: number }
    | { kind: 'ident'; value: string }
    | { kind: 'op'; value: string };

class ExpressionParser {
    private tokens: ExprToken[] = [];
    private pos = 0;

    /** Parse `expression` into an AST. Throws Error with a human-readable message on failure. */
    parse(expression: string): ExprNode {
        this.tokens = this.tokenize(expression);
        this.pos = 0;
        if (this.tokens.length === 0) {
            throw new Error('Expression is empty.');
        }
        const node = this.parseExpr();
        if (this.pos < this.tokens.length) {
            throw new Error(`Unexpected token "${this.peekRaw()}" in expression.`);
        }
        return node;
    }

    private tokenize(src: string): ExprToken[] {
        const out: ExprToken[] = [];
        let i = 0;
        while (i < src.length) {
            const ch = src[i];
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
            if ('+-*/(),'.includes(ch)) { out.push({ kind: 'op', value: ch }); i++; continue; }
            if (ch >= '0' && ch <= '9' || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
                let j = i + 1;
                while (j < src.length && /[0-9.]/.test(src[j])) j++;
                const numStr = src.slice(i, j);
                const value = Number(numStr);
                if (!Number.isFinite(value)) throw new Error(`Invalid number "${numStr}" in expression.`);
                out.push({ kind: 'num', value });
                i = j;
                continue;
            }
            if (/[A-Za-z_]/.test(ch)) {
                let j = i + 1;
                while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
                out.push({ kind: 'ident', value: src.slice(i, j) });
                i = j;
                continue;
            }
            throw new Error(`Unexpected character "${ch}" in expression. Only field names, numbers, + - * / ( ) , and functions (${[...EXPR_FUNCTIONS].join(', ')}) are allowed.`);
        }
        return out;
    }

    private peek(): ExprToken | undefined { return this.tokens[this.pos]; }
    private peekRaw(): string {
        const t = this.peek();
        return t ? String('value' in t ? t.value : '') : 'end of expression';
    }
    private next(): ExprToken | undefined { return this.tokens[this.pos++]; }
    private isOp(v: string): boolean {
        const t = this.peek();
        return !!t && t.kind === 'op' && t.value === v;
    }

    private parseExpr(): ExprNode {
        let left = this.parseTerm();
        while (this.isOp('+') || this.isOp('-')) {
            const op = (this.next() as ExprToken).value as '+' | '-';
            const right = this.parseTerm();
            left = { type: 'binary', op, left, right };
        }
        return left;
    }

    private parseTerm(): ExprNode {
        let left = this.parseFactor();
        while (this.isOp('*') || this.isOp('/')) {
            const op = (this.next() as ExprToken).value as '*' | '/';
            const right = this.parseFactor();
            left = { type: 'binary', op, left, right };
        }
        return left;
    }

    private parseFactor(): ExprNode {
        if (this.isOp('-')) {
            this.next();
            return { type: 'unary', operand: this.parseFactor() };
        }
        if (this.isOp('+')) {
            this.next();
            return this.parseFactor();
        }
        return this.parsePrimary();
    }

    private parsePrimary(): ExprNode {
        const t = this.next();
        if (!t) throw new Error('Unexpected end of expression.');
        if (t.kind === 'num') return { type: 'num', value: t.value };
        if (t.kind === 'op' && t.value === '(') {
            const inner = this.parseExpr();
            if (!this.isOp(')')) throw new Error('Missing closing ")" in expression.');
            this.next();
            return inner;
        }
        if (t.kind === 'ident') {
            // function call?
            if (this.isOp('(')) {
                const name = t.value.toLowerCase();
                if (!EXPR_FUNCTIONS.has(name)) {
                    throw new Error(`Unknown function "${t.value}". Allowed: ${[...EXPR_FUNCTIONS].join(', ')}.`);
                }
                this.next(); // consume '('
                const args: ExprNode[] = [];
                if (!this.isOp(')')) {
                    args.push(this.parseExpr());
                    while (this.isOp(',')) { this.next(); args.push(this.parseExpr()); }
                }
                if (!this.isOp(')')) throw new Error(`Missing closing ")" for function "${t.value}".`);
                this.next();
                return { type: 'call', name, args };
            }
            return { type: 'field', name: t.value };
        }
        throw new Error(`Unexpected token "${'value' in t ? t.value : ''}" in expression.`);
    }
}

/**
 * Evaluate a parsed expression against a row. Returns NaN when the expression
 * references a missing/non-numeric field or produces a non-finite value; the
 * caller converts NaN to null for output/sorting.
 */
function evaluateExpr(node: ExprNode, row: Record<string, unknown>): number {
    switch (node.type) {
        case 'num': return node.value;
        case 'field': {
            const v = row[node.name];
            return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
        }
        case 'unary': return -evaluateExpr(node.operand, row);
        case 'binary': {
            const l = evaluateExpr(node.left, row);
            const r = evaluateExpr(node.right, row);
            switch (node.op) {
                case '+': return l + r;
                case '-': return l - r;
                case '*': return l * r;
                case '/': return r === 0 ? NaN : l / r;
            }
            return NaN;
        }
        case 'call': {
            const a = node.args.map(arg => evaluateExpr(arg, row));
            switch (node.name) {
                case 'abs': return Math.abs(a[0]);
                case 'round': return Math.round(a[0]);
                case 'floor': return Math.floor(a[0]);
                case 'ceil': return Math.ceil(a[0]);
                case 'sqrt': return Math.sqrt(a[0]);
                case 'min': return Math.min(...a);
                case 'max': return Math.max(...a);
            }
            return NaN;
        }
    }
}

// ---------------------------------------------------------------------------
// DataSnapshotToolLibrary
// ---------------------------------------------------------------------------

@RegisterClass(BaseArtifactToolLibrary, 'DataSnapshotToolLibrary')
export class DataSnapshotToolLibrary extends BaseArtifactToolLibrary {

    // -----------------------------------------------------------------------
    // getSubclassToolList
    // -----------------------------------------------------------------------

    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'get_tables',
                description: 'Returns table names, row counts, and column schemas for every table in the snapshot.',
                inputSchema: { type: 'object', properties: {}, required: [] },
            },
            {
                name: 'get_schema',
                description: 'Returns column names, types, and descriptions for a specific table.',
                inputSchema: {
                    type: 'object',
                    properties: { table: { type: 'string', description: 'Table name' } },
                    required: ['table'],
                },
            },
            {
                name: 'get_rows',
                description: 'Returns a slice of rows from a table as a JSON array.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        table: { type: 'string' },
                        start: { type: 'number', description: 'Zero-based start index' },
                        count: { type: 'number', description: 'Number of rows to return' },
                    },
                    required: ['table', 'start', 'count'],
                },
            },
            {
                name: 'search_rows',
                description: 'Returns rows matching a SINGLE field condition (max 200 rows). Operators: eq, neq, gt, lt, gte, lte, contains, startsWith. For multiple conditions (AND/OR), use `filter`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        table: { type: 'string' },
                        field: { type: 'string' },
                        operator: { type: 'string' },
                        value: {},
                        limit: { type: 'number', description: 'Max rows to return. Default: 200' },
                    },
                    required: ['table', 'field', 'operator', 'value'],
                },
            },
            {
                name: 'aggregate',
                description: 'Computes an aggregate over a field. Operations: ' +
                    'sum, avg (alias: mean), count, min, max, distinct_count, median, percentile (requires `p`), mode, stdev (sample), variance (sample). ' +
                    'Returns an object { value, ...context }. ' +
                    'For min/max the object also includes `contributingRows` — rows whose field equals the extremum. ' +
                    'For distinct_count, the object includes `distinctValues` — the actual distinct values found. ' +
                    'For mode, the object includes `frequency` (how many rows), `contributingRows`, and `allModes` when there is a tie. ' +
                    'percentile uses linear interpolation (e.g. p=90 → 90th percentile; median is percentile with p=50). ' +
                    'stdev/variance skip null/non-numeric values and use the sample divisor (N-1). ' +
                    'Use these context fields directly — do not guess the identity from the scalar alone.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        table: { type: 'string' },
                        field: { type: 'string' },
                        operation: { type: 'string' },
                        p: { type: 'number', description: 'Percentile 0-100. Required when operation is "percentile".' },
                    },
                    required: ['table', 'field', 'operation'],
                },
            },
            {
                name: 'group_aggregate',
                description: 'GROUP BY one or more fields and compute one or more aggregations per group (SQL "GROUP BY ... [HAVING] ... [ORDER BY] ... [LIMIT]"). ' +
                    'Use this for rollups like "total revenue by category" or "avg hours by level" — do NOT delegate these to a sub-agent. ' +
                    'Each aggregation is { field, operation, alias, p? } where operation is any `aggregate` operation (count may omit field). ' +
                    'Returns { groups: [{ <groupBy fields>, <alias>: value, ... }], groupCount }.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        table: { type: 'string' },
                        groupBy: { type: 'array', items: { type: 'string' }, description: 'One or more fields to group by.' },
                        aggregations: {
                            type: 'array',
                            description: 'Each: { field, operation, alias, p? }. operation = sum/avg/count/min/max/distinct_count/median/percentile/mode/stdev/variance.',
                            items: {
                                type: 'object',
                                properties: {
                                    field: { type: 'string' },
                                    operation: { type: 'string' },
                                    alias: { type: 'string' },
                                    p: { type: 'number' },
                                },
                                required: ['operation', 'alias'],
                            },
                        },
                        having: {
                            type: 'object',
                            description: 'Optional post-aggregation filter on an aggregation alias: { alias, operator, value }. Operators as in search_rows.',
                            properties: {
                                alias: { type: 'string' },
                                operator: { type: 'string' },
                                value: {},
                            },
                        },
                        sort: {
                            type: 'object',
                            description: 'Optional { by, direction }. `by` is a groupBy field or an aggregation alias; direction is "asc" or "desc".',
                            properties: {
                                by: { type: 'string' },
                                direction: { type: 'string' },
                            },
                        },
                        limit: { type: 'number', description: 'Optional max number of groups to return.' },
                    },
                    required: ['table', 'groupBy', 'aggregations'],
                },
            },
            {
                name: 'compute',
                description: 'Adds a derived column from a safe arithmetic expression over numeric fields, then optionally sorts by it and returns the top/bottom N rows. ' +
                    'Use this for per-row metrics + ranking like "best price-to-hours ratio" (expression "Price / DurationHours", sort "desc", limit 10) — do NOT delegate these to a sub-agent. ' +
                    'Expression supports field names, numbers, + - * /, parentheses, unary minus, and functions: ' + [...EXPR_FUNCTIONS].join(', ') + '. ' +
                    'Rows where the expression is undefined (missing/non-numeric field, divide-by-zero) get null for the computed column and sort last. ' +
                    'Returns { rows: [original fields + <as>], totalRows, truncated? }.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        table: { type: 'string' },
                        expression: { type: 'string', description: 'e.g. "Price / DurationHours" or "(Revenue - Cost) / Revenue".' },
                        as: { type: 'string', description: 'Name for the computed column.' },
                        sort: { type: 'string', description: 'Optional "asc" or "desc" — sorts by the computed column.' },
                        limit: { type: 'number', description: 'Optional max rows to return (top/bottom N after sort).' },
                    },
                    required: ['table', 'expression', 'as'],
                },
            },
            {
                name: 'filter',
                description: 'Returns rows matching MULTIPLE field conditions combined with AND/OR (max 200 rows by default). ' +
                    'Each condition is { field, operator, value }; operators: eq, neq, gt, lt, gte, lte, contains, startsWith. ' +
                    'Use for "Price > 100 AND Level = \'Advanced\'". For a single condition, search_rows is simpler.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        table: { type: 'string' },
                        conditions: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    field: { type: 'string' },
                                    operator: { type: 'string' },
                                    value: {},
                                },
                                required: ['field', 'operator', 'value'],
                            },
                        },
                        combine: { type: 'string', description: '"and" (default) or "or".' },
                        limit: { type: 'number', description: 'Max rows to return. Default: 200' },
                    },
                    required: ['table', 'conditions'],
                },
            },
        ];
    }

    // -----------------------------------------------------------------------
    // invokeSubclassTool — dispatcher
    // -----------------------------------------------------------------------

    protected async invokeSubclassTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        const contentStr = typeof artifactContent === 'string'
            ? artifactContent
            : artifactContent.toString('utf-8');

        let payload: SnapshotPayload;
        try {
            const raw = JSON.parse(contentStr) as Record<string, unknown>;
            // NormalizeToTables handles both multi-table snapshots and
            // legacy single-table format ({ columns, rows, metadata }).
            const tables = NormalizeToTables(raw);
            if (tables.length === 0) {
                return this.errorResult('Artifact content contains no table data.');
            }
            payload = { tables: tables as SnapshotTable[] };
        } catch {
            return this.errorResult(`Failed to parse artifact content as JSON.`);
        }

        switch (toolName) {
            case 'get_tables':
                return this.handleGetTables(payload);
            case 'get_schema':
                return this.handleGetSchema(payload, input);
            case 'get_rows':
                return this.handleGetRows(payload, input);
            case 'search_rows':
                return this.handleSearchRows(payload, input);
            case 'aggregate':
                return this.handleAggregate(payload, input);
            case 'group_aggregate':
                return this.handleGroupAggregate(payload, input);
            case 'compute':
                return this.handleCompute(payload, input);
            case 'filter':
                return this.handleFilter(payload, input);
            default:
                return this.errorResult(`Unknown tool: "${toolName}".`);
        }
    }

    // -----------------------------------------------------------------------
    // Tool handlers
    // -----------------------------------------------------------------------

    private handleGetTables(payload: SnapshotPayload): ArtifactToolResult {
        const tables = payload.tables.map(t => ({
            name: t.name,
            rowCount: t.rows.length,
            columns: t.columns,
        }));
        return this.successResult(tables);
    }

    private handleGetSchema(
        payload: SnapshotPayload,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const table = this.findTable(payload, input.table as string);
        if (!table) {
            return this.tableNotFoundError(input.table as string);
        }
        return this.successResult(table.columns);
    }

    private handleGetRows(
        payload: SnapshotPayload,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const table = this.findTable(payload, input.table as string);
        if (!table) {
            return this.tableNotFoundError(input.table as string);
        }
        const start = input.start as number;
        const count = input.count as number;
        const sliced = table.rows.slice(start, start + count);
        return this.successResult(sliced);
    }

    private handleSearchRows(
        payload: SnapshotPayload,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const table = this.findTable(payload, input.table as string);
        if (!table) {
            return this.tableNotFoundError(input.table as string);
        }

        const field = input.field as string;
        const operator = input.operator as string;
        const value = input.value;
        const limit = Math.min((input.limit as number) ?? 200, 500);

        if (!VALID_SEARCH_OPERATORS.has(operator)) {
            return this.errorResult(`Unsupported search operator: "${operator}". Valid operators: ${[...VALID_SEARCH_OPERATORS].join(', ')}.`);
        }

        const allMatched = table.rows.filter(row =>
            this.evaluateCondition(row[field], operator as SearchOperator, value)
        );
        const truncated = allMatched.length > limit;
        const rows = truncated ? allMatched.slice(0, limit) : allMatched;
        return this.successResult({
            rows,
            totalMatches: allMatched.length,
            ...(truncated ? { truncated: true, note: `Showing ${limit} of ${allMatched.length} matches. Use the 'limit' parameter or narrow your search.` } : {}),
        });
    }

    private handleAggregate(
        payload: SnapshotPayload,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const table = this.findTable(payload, input.table as string);
        if (!table) {
            return this.tableNotFoundError(input.table as string);
        }

        const field = input.field as string;
        const operation = input.operation as string;

        if (!VALID_AGGREGATE_OPS.has(operation)) {
            return this.errorResult(`Unsupported aggregate operation: "${operation}". Valid operations: ${[...VALID_AGGREGATE_OPS].join(', ')}.`);
        }

        let p: number | undefined;
        if (operation === 'percentile') {
            p = input.p as number;
            if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 100) {
                return this.errorResult(`The "percentile" operation requires a numeric "p" between 0 and 100 (got ${JSON.stringify(input.p)}).`);
            }
        }

        const result = this.computeAggregate(table.rows, field, operation as AggregateOperation, p);
        return this.successResult(result);
    }

    private handleGroupAggregate(
        payload: SnapshotPayload,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const table = this.findTable(payload, input.table as string);
        if (!table) {
            return this.tableNotFoundError(input.table as string);
        }

        const groupBy = Array.isArray(input.groupBy)
            ? (input.groupBy as unknown[]).map(g => String(g))
            : [];
        if (groupBy.length === 0) {
            return this.errorResult('`groupBy` must be a non-empty array of field names.');
        }

        const rawAggs = Array.isArray(input.aggregations) ? (input.aggregations as Array<Record<string, unknown>>) : [];
        if (rawAggs.length === 0) {
            return this.errorResult('`aggregations` must be a non-empty array of { field, operation, alias, p? }.');
        }

        // Validate aggregation specs up front.
        interface AggSpec { field: string; operation: AggregateOperation; alias: string; p?: number; }
        const aggs: AggSpec[] = [];
        for (const a of rawAggs) {
            const operation = String(a.operation ?? '');
            const alias = String(a.alias ?? '');
            const fieldName = a.field !== undefined ? String(a.field) : '';
            if (!VALID_AGGREGATE_OPS.has(operation)) {
                return this.errorResult(`Unsupported aggregate operation "${operation}". Valid operations: ${[...VALID_AGGREGATE_OPS].join(', ')}.`);
            }
            if (!alias) {
                return this.errorResult('Every aggregation requires an "alias".');
            }
            if (operation !== 'count' && !fieldName) {
                return this.errorResult(`Aggregation "${alias}" (operation "${operation}") requires a "field".`);
            }
            let p: number | undefined;
            if (operation === 'percentile') {
                p = a.p as number;
                if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 100) {
                    return this.errorResult(`Aggregation "${alias}" uses "percentile" and requires a numeric "p" between 0 and 100.`);
                }
            }
            aggs.push({ field: fieldName, operation: operation as AggregateOperation, alias, p });
        }

        // Bucket rows by composite group key.
        const buckets = new Map<string, { keyValues: Record<string, unknown>; rows: Array<Record<string, unknown>> }>();
        for (const row of table.rows) {
            const keyValues: Record<string, unknown> = {};
            for (const g of groupBy) keyValues[g] = row[g];
            const key = JSON.stringify(groupBy.map(g => row[g] ?? null));
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = { keyValues, rows: [] };
                buckets.set(key, bucket);
            }
            bucket.rows.push(row);
        }

        // Build group rows: group-by values + each aggregation's scalar value.
        let groups: Array<Record<string, unknown>> = [];
        for (const bucket of buckets.values()) {
            const groupRow: Record<string, unknown> = { ...bucket.keyValues };
            for (const agg of aggs) {
                groupRow[agg.alias] = this.computeAggregate(bucket.rows, agg.field, agg.operation, agg.p).value;
            }
            groups.push(groupRow);
        }

        // Optional HAVING filter on an aggregation alias.
        if (input.having && typeof input.having === 'object') {
            const having = input.having as Record<string, unknown>;
            const alias = String(having.alias ?? '');
            const operator = String(having.operator ?? '');
            if (!alias || !VALID_SEARCH_OPERATORS.has(operator)) {
                return this.errorResult('`having` must be { alias, operator, value } with a valid operator.');
            }
            groups = groups.filter(g => this.evaluateCondition(g[alias], operator as SearchOperator, having.value));
        }

        // Optional sort by a group-by field or an aggregation alias.
        if (input.sort && typeof input.sort === 'object') {
            const sort = input.sort as Record<string, unknown>;
            const by = String(sort.by ?? '');
            const direction = String(sort.direction ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
            if (by) groups = this.sortRows(groups, by, direction);
        }

        const groupCount = groups.length;
        const limit = input.limit as number | undefined;
        const truncated = typeof limit === 'number' && limit >= 0 && groupCount > limit;
        if (truncated) groups = groups.slice(0, limit);

        return this.successResult({
            groups,
            groupCount,
            ...(truncated ? { truncated: true } : {}),
        });
    }

    private handleCompute(
        payload: SnapshotPayload,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const table = this.findTable(payload, input.table as string);
        if (!table) {
            return this.tableNotFoundError(input.table as string);
        }

        const expression = input.expression as string;
        const as = input.as as string;
        if (typeof expression !== 'string' || expression.trim().length === 0) {
            return this.errorResult('`expression` is required (e.g. "Price / DurationHours").');
        }
        if (typeof as !== 'string' || as.trim().length === 0) {
            return this.errorResult('`as` (name for the computed column) is required.');
        }

        let ast: ExprNode;
        try {
            ast = new ExpressionParser().parse(expression);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return this.errorResult(`Could not parse expression "${expression}": ${msg}`);
        }

        // Compute the derived column per row (NaN/non-finite → null).
        const computed = table.rows.map(row => {
            const raw = evaluateExpr(ast, row);
            const value = Number.isFinite(raw) ? raw : null;
            return { ...row, [as]: value };
        });

        // Optional sort by the computed column; nulls always sort last.
        let rows = computed;
        const sortRaw = typeof input.sort === 'string' ? (input.sort as string).toLowerCase() : undefined;
        if (sortRaw === 'asc' || sortRaw === 'desc') {
            rows = [...computed].sort((a, b) => {
                const av = a[as] as number | null;
                const bv = b[as] as number | null;
                if (av === null && bv === null) return 0;
                if (av === null) return 1;
                if (bv === null) return -1;
                return sortRaw === 'asc' ? av - bv : bv - av;
            });
        }

        const totalRows = rows.length;
        const limit = input.limit as number | undefined;
        const truncated = typeof limit === 'number' && limit >= 0 && totalRows > limit;
        if (truncated) rows = rows.slice(0, limit);

        return this.successResult({
            rows,
            totalRows,
            ...(truncated ? { truncated: true } : {}),
        });
    }

    private handleFilter(
        payload: SnapshotPayload,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const table = this.findTable(payload, input.table as string);
        if (!table) {
            return this.tableNotFoundError(input.table as string);
        }

        const rawConditions = Array.isArray(input.conditions) ? (input.conditions as Array<Record<string, unknown>>) : [];
        if (rawConditions.length === 0) {
            return this.errorResult('`conditions` must be a non-empty array of { field, operator, value }.');
        }

        interface Cond { field: string; operator: SearchOperator; value: unknown; }
        const conditions: Cond[] = [];
        for (const c of rawConditions) {
            const field = String(c.field ?? '');
            const operator = String(c.operator ?? '');
            if (!field || !VALID_SEARCH_OPERATORS.has(operator)) {
                return this.errorResult(`Each condition needs a "field" and a valid "operator" (${[...VALID_SEARCH_OPERATORS].join(', ')}). Got field="${field}", operator="${operator}".`);
            }
            conditions.push({ field, operator: operator as SearchOperator, value: c.value });
        }

        const combine = String(input.combine ?? 'and').toLowerCase() === 'or' ? 'or' : 'and';
        const limit = Math.min((input.limit as number) ?? 200, 500);

        const matches = (row: Record<string, unknown>): boolean => {
            if (combine === 'or') {
                return conditions.some(c => this.evaluateCondition(row[c.field], c.operator, c.value));
            }
            return conditions.every(c => this.evaluateCondition(row[c.field], c.operator, c.value));
        };

        const allMatched = table.rows.filter(matches);
        const truncated = allMatched.length > limit;
        const rows = truncated ? allMatched.slice(0, limit) : allMatched;
        return this.successResult({
            rows,
            totalMatches: allMatched.length,
            combine,
            ...(truncated ? { truncated: true, note: `Showing ${limit} of ${allMatched.length} matches. Use the 'limit' parameter or narrow your conditions.` } : {}),
        });
    }

    // -----------------------------------------------------------------------
    // Search condition evaluator
    // -----------------------------------------------------------------------

    private evaluateCondition(
        fieldValue: unknown,
        operator: SearchOperator,
        targetValue: unknown
    ): boolean {
        switch (operator) {
            case 'eq':
                return fieldValue === targetValue;
            case 'neq':
                return fieldValue !== targetValue;
            case 'gt':
                return (fieldValue as number) > (targetValue as number);
            case 'lt':
                return (fieldValue as number) < (targetValue as number);
            case 'gte':
                return (fieldValue as number) >= (targetValue as number);
            case 'lte':
                return (fieldValue as number) <= (targetValue as number);
            case 'contains':
                return String(fieldValue).includes(String(targetValue));
            case 'startsWith':
                return String(fieldValue).startsWith(String(targetValue));
        }
    }

    // -----------------------------------------------------------------------
    // Sort helper (shared by group_aggregate)
    // -----------------------------------------------------------------------

    private sortRows(
        rows: Array<Record<string, unknown>>,
        by: string,
        direction: 'asc' | 'desc'
    ): Array<Record<string, unknown>> {
        return [...rows].sort((a, b) => {
            const av = a[by];
            const bv = b[by];
            // Nulls/undefined last regardless of direction.
            const aNull = av === null || av === undefined;
            const bNull = bv === null || bv === undefined;
            if (aNull && bNull) return 0;
            if (aNull) return 1;
            if (bNull) return -1;
            if (typeof av === 'number' && typeof bv === 'number') {
                return direction === 'asc' ? av - bv : bv - av;
            }
            const cmp = String(av).localeCompare(String(bv));
            return direction === 'asc' ? cmp : -cmp;
        });
    }

    // -----------------------------------------------------------------------
    // Aggregate computation
    // -----------------------------------------------------------------------

    private computeAggregate(
        rows: Array<Record<string, unknown>>,
        field: string,
        operation: AggregateOperation,
        p?: number
    ): AggregateResult {
        const MAX_CONTRIBUTING_ROWS = 10;
        const MAX_DISTINCT_VALUES = 50;

        // Helper — extract finite numeric values for numeric-only operations.
        const numericValues = (): number[] =>
            rows
                .map(r => r[field])
                .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

        switch (operation) {
            case 'count':
                return { value: rows.length };
            case 'distinct_count': {
                const set = new Set<unknown>();
                for (const row of rows) set.add(row[field]);
                const all = Array.from(set);
                const capped = all.slice(0, MAX_DISTINCT_VALUES);
                const result: AggregateResult = { value: set.size, distinctValues: capped };
                if (all.length > capped.length) result.truncated = true;
                return result;
            }
            case 'sum':
                return { value: rows.reduce((acc, r) => acc + (r[field] as number), 0) };
            case 'avg':
            case 'mean': {
                const sum = rows.reduce((acc, r) => acc + (r[field] as number), 0);
                return { value: rows.length > 0 ? sum / rows.length : 0 };
            }
            case 'min':
            case 'max': {
                if (rows.length === 0) return { value: 0, contributingRows: [] };
                const nums = rows.map(r => r[field] as number);
                const extremum = operation === 'min'
                    ? Math.min(...nums)
                    : Math.max(...nums);
                const matching = rows.filter(r => (r[field] as number) === extremum);
                const capped = matching.slice(0, MAX_CONTRIBUTING_ROWS);
                const result: AggregateResult = { value: extremum, contributingRows: capped };
                if (matching.length > capped.length) result.truncated = true;
                return result;
            }
            case 'median':
            case 'percentile': {
                // median is percentile with p=50. Both use linear interpolation
                // between the two closest ranks (matches the prior median impl:
                // odd N → middle value, even N → mean of the two middle values).
                const nums = numericValues();
                if (nums.length === 0) return { value: 0 };
                nums.sort((a, b) => a - b);
                if (nums.length === 1) return { value: nums[0] };
                const pp = operation === 'median' ? 50 : (p ?? 50);
                const rank = (pp / 100) * (nums.length - 1);
                const lo = Math.floor(rank);
                const hi = Math.ceil(rank);
                const value = nums[lo] + (nums[hi] - nums[lo]) * (rank - lo);
                return { value };
            }
            case 'mode': {
                if (rows.length === 0) return { value: null, frequency: 0, contributingRows: [] };
                const tally = new Map<unknown, number>();
                for (const row of rows) {
                    const v = row[field];
                    tally.set(v, (tally.get(v) ?? 0) + 1);
                }
                let maxFreq = 0;
                for (const freq of tally.values()) {
                    if (freq > maxFreq) maxFreq = freq;
                }
                const modeValues: unknown[] = [];
                for (const [v, freq] of tally.entries()) {
                    if (freq === maxFreq) modeValues.push(v);
                }
                const primary = modeValues[0];
                const matching = rows.filter(r => r[field] === primary);
                const cappedContrib = matching.slice(0, MAX_CONTRIBUTING_ROWS);
                const result: AggregateResult = {
                    value: primary,
                    frequency: maxFreq,
                    contributingRows: cappedContrib,
                };
                if (modeValues.length > 1) {
                    result.allModes = modeValues.slice(0, MAX_DISTINCT_VALUES);
                }
                if (matching.length > cappedContrib.length) result.truncated = true;
                return result;
            }
            case 'variance':
            case 'stdev': {
                const nums = numericValues();
                // Sample stats undefined for N<2; return 0 rather than NaN to keep the schema stable.
                if (nums.length < 2) return { value: 0 };
                const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
                const sumSquaredDiffs = nums.reduce((acc, x) => acc + (x - mean) ** 2, 0);
                const variance = sumSquaredDiffs / (nums.length - 1); // sample (N-1)
                return { value: operation === 'variance' ? variance : Math.sqrt(variance) };
            }
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private findTable(payload: SnapshotPayload, tableName: string): SnapshotTable | undefined {
        return payload.tables.find(t => t.name === tableName);
    }

    private tableNotFoundError(tableName: string): ArtifactToolResult {
        return this.errorResult(`Table "${tableName}" not found in snapshot.`);
    }

    private successResult(data: unknown): ArtifactToolResult {
        return { success: true, data };
    }

    private errorResult(errorMessage: string): ArtifactToolResult {
        return { success: false, data: null, errorMessage };
    }
}
