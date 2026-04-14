/**
 * TDD tests for DataSnapshotToolLibrary.
 *
 * Each `describe` block corresponds to one TDD slice from the spec.
 * Written RED-first — the implementation file does not yet exist when
 * these tests are first authored.
 */
import { describe, it, expect } from 'vitest';
import { DataSnapshotToolLibrary } from '../artifact-tools/DataSnapshotToolLibrary';
import type { ArtifactToolResult } from '../artifact-tools/BaseArtifactToolLibrary';

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
            expect(result.data).toBe(100000);
        });

        it('should compute avg of a numeric field', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'avg' },
                snapshot
            );
            expect(result.success).toBe(true);
            // 100000 / 3 ≈ 33333.33...
            expect(result.data).toBeCloseTo(33333.33, 0);
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
            expect(result.data).toBe(3);
        });

        it('should count distinct values', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'orders', field: 'CustomerID', operation: 'distinct_count' },
                snapshot
            );
            expect(result.success).toBe(true);
            expect(result.data).toBe(2);
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
                { table: 'customers', field: 'Revenue', operation: 'median' },
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
        it('should compute min of a numeric field', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'min' },
                snapshot
            );
            expect(result.success).toBe(true);
            expect(result.data).toBe(20000);
        });

        it('should compute max of a numeric field', async () => {
            const result = await lib.InvokeTool(
                'aggregate',
                { table: 'customers', field: 'Revenue', operation: 'max' },
                snapshot
            );
            expect(result.success).toBe(true);
            expect(result.data).toBe(50000);
        });
    });
});
