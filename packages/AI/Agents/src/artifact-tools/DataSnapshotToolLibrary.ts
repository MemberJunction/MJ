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
type AggregateOperation = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct_count';

const VALID_SEARCH_OPERATORS: ReadonlySet<string> = new Set<SearchOperator>([
    'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'startsWith',
]);

const VALID_AGGREGATE_OPS: ReadonlySet<string> = new Set<AggregateOperation>([
    'sum', 'avg', 'count', 'min', 'max', 'distinct_count',
]);

// ---------------------------------------------------------------------------
// DataSnapshotToolLibrary
// ---------------------------------------------------------------------------

@RegisterClass(BaseArtifactToolLibrary, 'DataSnapshotToolLibrary')
export class DataSnapshotToolLibrary extends BaseArtifactToolLibrary {

    // -----------------------------------------------------------------------
    // GetToolList
    // -----------------------------------------------------------------------

    public GetToolList(): ArtifactToolDefinition[] {
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
                description: 'Computes an aggregate over a field. Operations: sum, avg, count, min, max, distinct_count.',
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
            {
                name: 'get_full',
                description: 'Returns the parsed DataSnapshot content. Large tables are truncated to the first 100 rows; use get_rows to page through the rest.',
                inputSchema: { type: 'object', properties: {}, required: [] },
            },
        ];
    }

    // -----------------------------------------------------------------------
    // InvokeTool — dispatcher
    // -----------------------------------------------------------------------

    public async InvokeTool(
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
            case 'get_full':
                return this.handleGetFull(payload);
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

    private handleGetFull(payload: SnapshotPayload): ArtifactToolResult {
        const MAX_ROWS_PER_TABLE = 100;
        const truncatedTables = payload.tables.map(t => {
            if (t.rows.length <= MAX_ROWS_PER_TABLE) return t;
            return {
                ...t,
                rows: t.rows.slice(0, MAX_ROWS_PER_TABLE),
                metadata: {
                    ...t.metadata,
                    rowCount: t.rows.length,
                    truncated: true,
                    note: `Showing first ${MAX_ROWS_PER_TABLE} of ${t.rows.length} rows. Use get_rows to page through the rest.`,
                },
            };
        });
        return this.successResult({ tables: truncatedTables });
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
    ): number {
        switch (operation) {
            case 'count':
                return rows.length;
            case 'distinct_count':
                return new Set(rows.map(r => r[field])).size;
            case 'sum':
                return rows.reduce((acc, r) => acc + (r[field] as number), 0);
            case 'avg': {
                const sum = rows.reduce((acc, r) => acc + (r[field] as number), 0);
                return rows.length > 0 ? sum / rows.length : 0;
            }
            case 'min':
                return Math.min(...rows.map(r => r[field] as number));
            case 'max':
                return Math.max(...rows.map(r => r[field] as number));
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
