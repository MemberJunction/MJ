/**
 * @fileoverview Artifact tool library for DataSnapshot content.
 *
 * Parses a DataSnapshot JSON string and exposes tools for inspecting
 * table metadata, slicing rows, searching, and aggregating values.
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
    | 'median' | 'mode' | 'stdev' | 'variance';

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
    'median', 'mode', 'stdev', 'variance',
]);

// ---------------------------------------------------------------------------
// DataSnapshotToolLibrary
// ---------------------------------------------------------------------------

@RegisterClass(BaseArtifactToolLibrary, 'DataSnapshotToolLibrary')
export class DataSnapshotToolLibrary extends BaseArtifactToolLibrary {

    // -----------------------------------------------------------------------
    // GetSubclassToolList
    // -----------------------------------------------------------------------

    protected GetSubclassToolList(): ArtifactToolDefinition[] {
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
                description: 'Returns rows matching a field condition (max 200 rows). Operators: eq, neq, gt, lt, gte, lte, contains, startsWith.',
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
                    'sum, avg (alias: mean), count, min, max, distinct_count, median, mode, stdev (sample), variance (sample). ' +
                    'Returns an object { value, ...context }. ' +
                    'For min/max the object also includes `contributingRows` — rows whose field equals the extremum. ' +
                    'For distinct_count, the object includes `distinctValues` — the actual distinct values found. ' +
                    'For mode, the object includes `frequency` (how many rows), `contributingRows`, and `allModes` when there is a tie. ' +
                    'stdev/variance skip null/non-numeric values and use the sample divisor (N-1). ' +
                    'Use these context fields directly — do not guess the identity from the scalar alone.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        table: { type: 'string' },
                        field: { type: 'string' },
                        operation: { type: 'string' },
                    },
                    required: ['table', 'field', 'operation'],
                },
            },
        ];
    }

    // -----------------------------------------------------------------------
    // InvokeSubclassTool — dispatcher
    // -----------------------------------------------------------------------

    protected async InvokeSubclassTool(
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

        const result = this.computeAggregate(table.rows, field, operation as AggregateOperation);
        return this.successResult(result);
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
    // Aggregate computation
    // -----------------------------------------------------------------------

    private computeAggregate(
        rows: Array<Record<string, unknown>>,
        field: string,
        operation: AggregateOperation
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
            case 'median': {
                const nums = numericValues();
                if (nums.length === 0) return { value: 0 };
                nums.sort((a, b) => a - b);
                const mid = Math.floor(nums.length / 2);
                const median = nums.length % 2 === 0
                    ? (nums[mid - 1] + nums[mid]) / 2
                    : nums[mid];
                return { value: median };
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
