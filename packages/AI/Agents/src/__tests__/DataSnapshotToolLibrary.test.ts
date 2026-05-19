/**
 * TDD tests for DataSnapshotToolLibrary.
 *
 * Each `describe` block corresponds to one TDD slice from the spec.
 * Written RED-first — the implementation file does not yet exist when
 * these tests are first authored.
 */
import { describe, it, expect } from 'vitest';
import { DataSnapshotToolLibrary } from '../artifact-tools/DataSnapshotToolLibrary';
import type { ArtifactToolResult } from '@memberjunction/ai-core-plus';

// ---------------------------------------------------------------------------
// Test-data helper
// ---------------------------------------------------------------------------

function makeSnapshotJson(): string {
    return JSON.stringify({
        tables: [
            {
                name: 'customers',
                columns: [
                    { field: 'ID', sqlBaseType: 'int' },
                    { field: 'Name', sqlBaseType: 'nvarchar' },
                    { field: 'Revenue', sqlBaseType: 'money' },
                ],
                rows: [
                    { ID: 1, Name: 'Acme Corp', Revenue: 50000 },
                    { ID: 2, Name: 'Globex Inc', Revenue: 30000 },
                    { ID: 3, Name: 'Acme Labs', Revenue: 20000 },
                ],
                metadata: { rowCount: 3 },
            },
            {
                name: 'orders',
                columns: [
                    { field: 'OrderID', sqlBaseType: 'int' },
                    { field: 'CustomerID', sqlBaseType: 'int' },
                    { field: 'Amount', sqlBaseType: 'money' },
                ],
                rows: [
                    { OrderID: 101, CustomerID: 1, Amount: 5000 },
                    { OrderID: 102, CustomerID: 2, Amount: 3000 },
                ],
                metadata: { rowCount: 2 },
            },
        ],
    });
}

// ---------------------------------------------------------------------------
// Slice 1: GetToolList returns 6 tools
// ---------------------------------------------------------------------------

describe('DataSnapshotToolLibrary', () => {
    const lib = new DataSnapshotToolLibrary();
    const snapshot = makeSnapshotJson();

    describe('GetToolList', () => {
        it('should return exactly 6 tool definitions', () => {
            const tools = lib.GetToolList();
            expect(tools).toHaveLength(6);
        });

        it('should include the expected tool names', () => {
            const names = lib.GetToolList().map(t => t.name);
            expect(names).toEqual(
                expect.arrayContaining([
                    'get_tables',
                    'get_schema',
                    'get_rows',
                    'search_rows',
                    'aggregate',
                    'get_full',
                ])
            );
        });

        it('should have non-empty description and inputSchema on every tool', () => {
            for (const tool of lib.GetToolList()) {
                expect(tool.description.length).toBeGreaterThan(0);
                expect(tool.inputSchema).toBeDefined();
            }
        });
    });

    // -----------------------------------------------------------------------
    // Slice 2: get_tables returns table overview
    // -----------------------------------------------------------------------

    describe('get_tables', () => {
        it('should return table names, row counts, and column schemas', async () => {
            const result = await lib.InvokeTool('get_tables', {}, snapshot);
            expect(result.success).toBe(true);

            const tables = result.data as Array<{
                name: string;
                rowCount: number;
                columns: Array<{ field: string; sqlBaseType: string }>;
            }>;
            expect(tables).toHaveLength(2);

            const customers = tables.find(t => t.name === 'customers');
            expect(customers).toBeDefined();
            expect(customers!.rowCount).toBe(3);
            expect(customers!.columns).toHaveLength(3);

            const orders = tables.find(t => t.name === 'orders');
            expect(orders).toBeDefined();
            expect(orders!.rowCount).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    // Slice 3: get_schema returns column details
    // -----------------------------------------------------------------------

    describe('get_schema', () => {
        it('should return column details for the customers table', async () => {
            const result = await lib.InvokeTool('get_schema', { table: 'customers' }, snapshot);
            expect(result.success).toBe(true);

            const columns = result.data as Array<{ field: string; sqlBaseType: string }>;
            expect(columns).toHaveLength(3);
            expect(columns[0]).toEqual({ field: 'ID', sqlBaseType: 'int' });
            expect(columns[1]).toEqual({ field: 'Name', sqlBaseType: 'nvarchar' });
            expect(columns[2]).toEqual({ field: 'Revenue', sqlBaseType: 'money' });
        });
    });

    // -----------------------------------------------------------------------
    // Slice 4: get_rows returns a slice
    // -----------------------------------------------------------------------

    describe('get_rows', () => {
        it('should return rows starting at offset with given count', async () => {
            const result = await lib.InvokeTool(
                'get_rows',
                { table: 'customers', start: 1, count: 2 },
                snapshot
            );
            expect(result.success).toBe(true);

            const rows = result.data as Array<Record<string, unknown>>;
            expect(rows).toHaveLength(2);
            expect(rows[0]).toEqual({ ID: 2, Name: 'Globex Inc', Revenue: 30000 });
            expect(rows[1]).toEqual({ ID: 3, Name: 'Acme Labs', Revenue: 20000 });
        });

        it('should clamp to available rows when count exceeds remainder', async () => {
            const result = await lib.InvokeTool(
                'get_rows',
                { table: 'customers', start: 2, count: 100 },
                snapshot
            );
            expect(result.success).toBe(true);

            const rows = result.data as Array<Record<string, unknown>>;
            expect(rows).toHaveLength(1);
        });
    });

    // -----------------------------------------------------------------------
    // Slice 5: search_rows with 'eq' operator
    // -----------------------------------------------------------------------

    describe('search_rows — eq', () => {
        it('should return rows where field equals value', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Name', operator: 'eq', value: 'Acme Corp' },
                snapshot
            );
            expect(result.success).toBe(true);

            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toHaveLength(1);
            expect(data.totalMatches).toBe(1);
            expect(data.rows[0]).toEqual({ ID: 1, Name: 'Acme Corp', Revenue: 50000 });
        });

        it('should return empty array when no rows match', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Name', operator: 'eq', value: 'Nope' },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toEqual([]);
            expect(data.totalMatches).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // Slice 6: search_rows with 'contains' operator
    // -----------------------------------------------------------------------

    describe('search_rows — contains', () => {
        it('should return rows where field contains substring', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Name', operator: 'contains', value: 'Acme' },
                snapshot
            );
            expect(result.success).toBe(true);

            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toHaveLength(2);
            expect(data.totalMatches).toBe(2);
            expect(data.rows.map(r => r.Name)).toEqual(['Acme Corp', 'Acme Labs']);
        });
    });

    // -----------------------------------------------------------------------
    // Slice 7: aggregate — sum and avg
    // -----------------------------------------------------------------------

    describe('aggregate — sum and avg', () => {
        it('should compute sum of a numeric field', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'sum' },
                snapshot
            );
            expect(result.success).toBe(true);
            expect((result.data as { value: number }).value).toBe(100000);
        });

        it('should compute avg of a numeric field', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'avg' },
                snapshot
            );
            expect(result.success).toBe(true);
            // 100000 / 3 ≈ 33333.33...
            expect((result.data as { value: number }).value).toBeCloseTo(33333.33, 0);
        });
    });

    // -----------------------------------------------------------------------
    // Slice 8: aggregate — count and distinct_count
    // -----------------------------------------------------------------------

    describe('aggregate — count and distinct_count', () => {
        it('should count total rows', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'ID', operation: 'count' },
                snapshot
            );
            expect(result.success).toBe(true);
            expect((result.data as { value: number }).value).toBe(3);
        });

        it('should count distinct values and return the actual distinct values', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'orders', field: 'CustomerID', operation: 'distinct_count' },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { value: number; distinctValues?: unknown[] };
            expect(data.value).toBe(2);
            expect(data.distinctValues).toHaveLength(2);
            expect(new Set(data.distinctValues)).toEqual(new Set([1, 2]));
        });
    });

    // -----------------------------------------------------------------------
    // Slice 9: get_full returns entire content
    // -----------------------------------------------------------------------

    describe('get_full', () => {
        it('should return the parsed snapshot with tables', async () => {
            const result = await lib.InvokeTool('get_full', {}, snapshot);
            expect(result.success).toBe(true);
            const data = result.data as { tables: Array<{ name: string; rows: Array<Record<string, unknown>> }> };
            expect(data.tables).toHaveLength(2);
            expect(data.tables.map(t => t.name)).toEqual(['customers', 'orders']);
            // Small tables are returned in full (no truncation)
            expect(data.tables[0].rows).toHaveLength(3);
            expect(data.tables[1].rows).toHaveLength(2);
        });
    });

    // -----------------------------------------------------------------------
    // Slice 10: Error handling — unknown table
    // -----------------------------------------------------------------------

    describe('error handling', () => {
        it('should return error for unknown table in get_schema', async () => {
            const result = await lib.InvokeTool(
                'get_schema',
                { table: 'nonexistent' },
                snapshot
            );
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBeDefined();
            expect(result.errorMessage!.toLowerCase()).toContain('table');
        });

        it('should return error for unknown table in get_rows', async () => {
            const result = await lib.InvokeTool(
                'get_rows',
                { table: 'nonexistent', start: 0, count: 10 },
                snapshot
            );
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBeDefined();
        });

        it('should return error for unknown table in search_rows', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'nonexistent', field: 'ID', operator: 'eq', value: 1 },
                snapshot
            );
            expect(result.success).toBe(false);
        });

        it('should return error for unknown table in aggregate', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'nonexistent', field: 'ID', operation: 'count' },
                snapshot
            );
            expect(result.success).toBe(false);
        });

        it('should return error for unknown tool name', async () => {
            const result = await lib.InvokeTool('unknown_tool', {}, snapshot);
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBeDefined();
        });

        it('should return error for invalid JSON content', async () => {
            const result = await lib.InvokeTool('get_tables', {}, 'not json');
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBeDefined();
        });

        it('should return error for unsupported search operator', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'ID', operator: 'like', value: 1 },
                snapshot
            );
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBeDefined();
        });

        it('should return error for unsupported aggregate operation', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'not_a_real_op' },
                snapshot
            );
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Additional: search_rows with comparison operators
    // -----------------------------------------------------------------------

    describe('search_rows — comparison operators', () => {
        it('should handle neq operator', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Name', operator: 'neq', value: 'Acme Corp' },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toHaveLength(2);
        });

        it('should handle gt operator', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Revenue', operator: 'gt', value: 25000 },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toHaveLength(2);
        });

        it('should handle gte operator', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Revenue', operator: 'gte', value: 30000 },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toHaveLength(2);
        });

        it('should handle lt operator', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Revenue', operator: 'lt', value: 30000 },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toHaveLength(1);
        });

        it('should handle lte operator', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Revenue', operator: 'lte', value: 30000 },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toHaveLength(2);
        });

        it('should handle startsWith operator', async () => {
            const result = await lib.InvokeTool(
                'search_rows',
                { table: 'customers', field: 'Name', operator: 'startsWith', value: 'Glob' },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { rows: Array<Record<string, unknown>>; totalMatches: number };
            expect(data.rows).toHaveLength(1);
            expect(data.rows[0]).toEqual({ ID: 2, Name: 'Globex Inc', Revenue: 30000 });
        });
    });

    // -----------------------------------------------------------------------
    // Additional: aggregate min and max
    // -----------------------------------------------------------------------

    describe('aggregate — min and max', () => {
        it('should compute min of a numeric field and return the contributing row', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'min' },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { value: number; contributingRows?: Array<Record<string, unknown>> };
            expect(data.value).toBe(20000);
            expect(data.contributingRows).toHaveLength(1);
            expect(data.contributingRows![0]).toMatchObject({ Revenue: 20000 });
        });

        it('should compute max of a numeric field and return the contributing row', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'max' },
                snapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { value: number; contributingRows?: Array<Record<string, unknown>> };
            expect(data.value).toBe(50000);
            expect(data.contributingRows).toHaveLength(1);
            expect(data.contributingRows![0]).toMatchObject({ Name: 'Acme Corp', Revenue: 50000 });
        });

        it('should return multiple contributing rows when several tie on the extremum', async () => {
            const tiedSnapshot = JSON.stringify({
                tables: [{
                    name: 'items',
                    columns: [{ field: 'Name' }, { field: 'Score' }],
                    rows: [
                        { Name: 'A', Score: 10 },
                        { Name: 'B', Score: 10 },
                        { Name: 'C', Score: 5 },
                    ],
                }],
            });
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'items', field: 'Score', operation: 'max' },
                tiedSnapshot
            );
            expect(result.success).toBe(true);
            const data = result.data as { value: number; contributingRows?: Array<Record<string, unknown>> };
            expect(data.value).toBe(10);
            expect(data.contributingRows).toHaveLength(2);
            expect(data.contributingRows!.map(r => r.Name).sort()).toEqual(['A', 'B']);
        });
    });

    // -----------------------------------------------------------------------
    // Statistical ops: mean (alias), median, mode, stdev, variance
    // -----------------------------------------------------------------------

    describe('aggregate — mean (alias for avg)', () => {
        it('should behave identically to avg', async () => {
            const avgResult = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'avg' },
                snapshot
            );
            const meanResult = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'mean' },
                snapshot
            );
            expect(avgResult.success).toBe(true);
            expect(meanResult.success).toBe(true);
            expect((meanResult.data as { value: number }).value)
                .toBe((avgResult.data as { value: number }).value);
        });
    });

    describe('aggregate — median', () => {
        it('should return the middle value for an odd-count field', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'median' },
                snapshot
            );
            expect(result.success).toBe(true);
            // Sorted: [20000, 30000, 50000] → median = 30000
            expect((result.data as { value: number }).value).toBe(30000);
        });

        it('should return the average of the two middle values for an even-count field', async () => {
            const evenSnap = JSON.stringify({
                tables: [{
                    name: 'scores',
                    columns: [{ field: 'v' }],
                    rows: [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }],
                }],
            });
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'scores', field: 'v', operation: 'median' },
                evenSnap
            );
            // (2 + 3) / 2 = 2.5
            expect((result.data as { value: number }).value).toBe(2.5);
        });

        it('should skip null and non-numeric values', async () => {
            const mixedSnap = JSON.stringify({
                tables: [{
                    name: 'mixed',
                    columns: [{ field: 'v' }],
                    rows: [{ v: 10 }, { v: null }, { v: 'skip me' }, { v: 20 }, { v: 30 }],
                }],
            });
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'mixed', field: 'v', operation: 'median' },
                mixedSnap
            );
            // Numeric only: [10, 20, 30] → median = 20
            expect((result.data as { value: number }).value).toBe(20);
        });
    });

    describe('aggregate — mode', () => {
        it('should return the most frequent value with frequency and contributing rows', async () => {
            const modeSnap = JSON.stringify({
                tables: [{
                    name: 'votes',
                    columns: [{ field: 'candidate' }],
                    rows: [
                        { candidate: 'Alice' },
                        { candidate: 'Bob' },
                        { candidate: 'Alice' },
                        { candidate: 'Carol' },
                        { candidate: 'Alice' },
                    ],
                }],
            });
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'votes', field: 'candidate', operation: 'mode' },
                modeSnap
            );
            const data = result.data as {
                value: unknown;
                frequency?: number;
                contributingRows?: Array<Record<string, unknown>>;
                allModes?: unknown[];
            };
            expect(data.value).toBe('Alice');
            expect(data.frequency).toBe(3);
            expect(data.contributingRows).toHaveLength(3);
            expect(data.allModes).toBeUndefined();
        });

        it('should return allModes when multiple values share the top frequency', async () => {
            const tieSnap = JSON.stringify({
                tables: [{
                    name: 'votes',
                    columns: [{ field: 'candidate' }],
                    rows: [
                        { candidate: 'Alice' },
                        { candidate: 'Bob' },
                        { candidate: 'Alice' },
                        { candidate: 'Bob' },
                    ],
                }],
            });
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'votes', field: 'candidate', operation: 'mode' },
                tieSnap
            );
            const data = result.data as {
                value: unknown;
                frequency?: number;
                allModes?: unknown[];
            };
            expect(data.frequency).toBe(2);
            expect((data.allModes ?? []).sort()).toEqual(['Alice', 'Bob']);
        });

        it('should handle empty tables gracefully', async () => {
            const emptySnap = JSON.stringify({
                tables: [{ name: 'empty', columns: [{ field: 'x' }], rows: [] }],
            });
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'empty', field: 'x', operation: 'mode' },
                emptySnap
            );
            const data = result.data as { value: unknown; frequency?: number };
            expect(data.value).toBeNull();
            expect(data.frequency).toBe(0);
        });
    });

    describe('aggregate — stdev and variance', () => {
        const statSnap = JSON.stringify({
            tables: [{
                name: 'measurements',
                columns: [{ field: 'v' }],
                // Sample values 2, 4, 4, 4, 5, 5, 7, 9 — classic stats-textbook example
                // Mean = 5, sample variance = 32/7 ≈ 4.571, sample stdev ≈ 2.138
                rows: [{ v: 2 }, { v: 4 }, { v: 4 }, { v: 4 }, { v: 5 }, { v: 5 }, { v: 7 }, { v: 9 }],
            }],
        });

        it('should compute sample variance (N-1 divisor)', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'measurements', field: 'v', operation: 'variance' },
                statSnap
            );
            expect((result.data as { value: number }).value).toBeCloseTo(32 / 7, 4);
        });

        it('should compute sample standard deviation', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'measurements', field: 'v', operation: 'stdev' },
                statSnap
            );
            expect((result.data as { value: number }).value).toBeCloseTo(Math.sqrt(32 / 7), 4);
        });

        it('should return 0 for fewer than 2 numeric values (sample stats undefined)', async () => {
            const singleSnap = JSON.stringify({
                tables: [{ name: 't', columns: [{ field: 'v' }], rows: [{ v: 42 }] }],
            });
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 't', field: 'v', operation: 'stdev' },
                singleSnap
            );
            expect((result.data as { value: number }).value).toBe(0);
        });

        it('should skip null and non-numeric values', async () => {
            const mixedSnap = JSON.stringify({
                tables: [{
                    name: 'mixed',
                    columns: [{ field: 'v' }],
                    rows: [{ v: 2 }, { v: null }, { v: 'ignore' }, { v: 4 }, { v: 4 }, { v: 4 }, { v: 5 }, { v: 5 }, { v: 7 }, { v: 9 }],
                }],
            });
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'mixed', field: 'v', operation: 'variance' },
                mixedSnap
            );
            // Numeric only: same 8 values as statSnap → 32/7
            expect((result.data as { value: number }).value).toBeCloseTo(32 / 7, 4);
        });
    });
});
