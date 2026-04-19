import { describe, it, expect } from 'vitest';
import { DataSnapshot, NormalizeToTables, TotalRowCount, TotalAvailableRowCount } from '../generic/data-snapshot';
import { DataTable } from '../generic/data-table';
import { MJColumnDescriptor } from '../generic/column-descriptors';

function makeTable(name: string, rowCount: number): DataTable {
    const t = new DataTable();
    t.name = name;
    t.columns = [new MJColumnDescriptor('ID')];
    t.rows = Array.from({ length: rowCount }, (_, i) => ({ ID: i + 1 }));
    t.metadata = { rowCount };
    return t;
}

describe('DataSnapshot', () => {
    describe('factory methods and IsMultiTable', () => {
        it('FromTable wraps a single table and IsMultiTable is false', () => {
            const table = makeTable('customers', 5);
            const snap = DataSnapshot.FromTable(table, 'Customer Report');

            expect(snap.tables).toHaveLength(1);
            expect(snap.tables![0].name).toBe('customers');
            expect(snap.title).toBe('Customer Report');
            expect(snap.IsMultiTable).toBe(false);
        });

        it('FromTables wraps multiple tables and IsMultiTable is true', () => {
            const snap = DataSnapshot.FromTables(
                [makeTable('orders', 10), makeTable('products', 3)],
                'Sales Dashboard'
            );

            expect(snap.tables).toHaveLength(2);
            expect(snap.IsMultiTable).toBe(true);
            expect(snap.title).toBe('Sales Dashboard');
        });

        it('IsMultiTable is false for empty tables array', () => {
            const snap = new DataSnapshot();
            snap.tables = [];
            expect(snap.IsMultiTable).toBe(false);
        });

        it('IsMultiTable is false when tables is undefined', () => {
            const snap = new DataSnapshot();
            expect(snap.IsMultiTable).toBe(false);
        });
    });
});

describe('NormalizeToTables', () => {
    it('returns normalized tables for a multi-table snapshot', () => {
        const tables = [makeTable('a', 2), makeTable('b', 3)];
        const snap = DataSnapshot.FromTables(tables);

        const result = NormalizeToTables(snap);

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('a');
        expect(result[1].name).toBe('b');
        // Deep-equal the source — normalizer defensively fills rows/columns
        // defaults but passes through every other field.
        expect(result[0]).toEqual(tables[0]);
        expect(result[1]).toEqual(tables[1]);
    });

    it('fills rows and columns defaults when a multi-table entry is malformed', () => {
        // This guards against runtime crashes in artifact tool handlers that
        // call .map / .length on these arrays. A legacy JSON blob that has a
        // `tables` key but a table missing rows/columns must not break downstream.
        const malformedJson: Record<string, unknown> = {
            tables: [
                { name: 'orphan' }, // missing rows and columns entirely
                { name: 'partial', rows: [{ a: 1 }] }, // missing columns
            ],
        };

        const result = NormalizeToTables(malformedJson);

        expect(result).toHaveLength(2);
        expect(result[0].rows).toEqual([]);
        expect(result[0].columns).toEqual([]);
        expect(result[1].rows).toEqual([{ a: 1 }]);
        expect(result[1].columns).toEqual([]);
    });

    it('wraps legacy single-table JSON (no tables[] property) into one DataTable', () => {
        // This is the shape persisted by Query Builder before multi-table support
        const legacyJson: Record<string, unknown> = {
            source: 'query',
            columns: [
                { field: 'Name', sqlBaseType: 'nvarchar' },
                { field: 'Revenue', sqlBaseType: 'money' },
            ],
            rows: [
                { Name: 'Acme', Revenue: 100 },
                { Name: 'Globex', Revenue: 200 },
            ],
            metadata: { sql: 'SELECT Name, Revenue FROM Customers', rowCount: 2 },
            entityName: 'Customers',
        };

        const result = NormalizeToTables(legacyJson, 'query_results');

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('query_results');
        expect(result[0].rows).toHaveLength(2);
        expect(result[0].metadata?.sql).toBe('SELECT Name, Revenue FROM Customers');
        expect(result[0].metadata?.entityName).toBe('Customers');
    });

    it('detects legacy format when only metadata.sql exists (no rows/columns)', () => {
        const legacyJson: Record<string, unknown> = {
            metadata: { sql: 'SELECT 1' },
        };

        const result = NormalizeToTables(legacyJson);

        expect(result).toHaveLength(1);
        expect(result[0].metadata?.sql).toBe('SELECT 1');
    });

    it('returns empty array for a context-only snapshot (no tables, rows, or columns)', () => {
        const snap = new DataSnapshot();
        snap.title = 'Just a title';
        snap.interpretation = 'No data here';

        expect(NormalizeToTables(snap)).toEqual([]);
    });
});

describe('TotalRowCount', () => {
    it('sums rowCount across multiple tables', () => {
        const snap = DataSnapshot.FromTables([
            makeTable('a', 10),
            makeTable('b', 25),
            makeTable('c', 5),
        ]);

        expect(TotalRowCount(snap)).toBe(40);
    });

    it('falls back to rows.length when metadata.rowCount is missing', () => {
        const table = new DataTable();
        table.name = 'noMeta';
        table.columns = [];
        table.rows = [{ x: 1 }, { x: 2 }, { x: 3 }];
        // No metadata set

        const snap = DataSnapshot.FromTable(table);
        expect(TotalRowCount(snap)).toBe(3);
    });

    it('returns 0 for empty snapshot', () => {
        expect(TotalRowCount(new DataSnapshot())).toBe(0);
    });
});

describe('TotalAvailableRowCount', () => {
    it('prefers totalAvailableRows over rowCount when present', () => {
        const table = makeTable('paged', 10);
        table.metadata = { rowCount: 10, totalAvailableRows: 500 };

        const snap = DataSnapshot.FromTable(table);
        expect(TotalAvailableRowCount(snap)).toBe(500);
    });

    it('falls back to rowCount then rows.length', () => {
        const snap = DataSnapshot.FromTables([
            makeTable('a', 10),  // metadata.rowCount = 10, no totalAvailableRows
            makeTable('b', 5),
        ]);

        expect(TotalAvailableRowCount(snap)).toBe(15);
    });
});
