import { describe, it, expect } from 'vitest';
import { DataTable, DataComputation } from '../generic/data-table';
import { MJColumnDescriptor } from '../generic/column-descriptors';

describe('DataTable', () => {
    it('holds columns, rows, and metadata as a self-describing dataset', () => {
        const table = new DataTable();
        table.name = 'customers';
        table.description = 'Active customers';
        table.source = 'view';
        table.columns = [
            Object.assign(new MJColumnDescriptor('Name'), { sqlBaseType: 'nvarchar' as const }),
            Object.assign(new MJColumnDescriptor('Revenue'), { sqlBaseType: 'money' as const }),
        ];
        table.rows = [
            { Name: 'Acme Corp', Revenue: 45000 },
            { Name: 'Globex Inc', Revenue: 38000 },
        ];
        table.metadata = {
            entityName: 'Customers',
            rowCount: 2,
            executionTimeMs: 42,
        };

        expect(table.name).toBe('customers');
        expect(table.description).toBe('Active customers');
        expect(table.source).toBe('view');
        expect(table.columns).toHaveLength(2);
        expect(table.columns[0].field).toBe('Name');
        expect(table.rows).toHaveLength(2);
        expect(table.rows[0]['Revenue']).toBe(45000);
        expect(table.metadata?.entityName).toBe('Customers');
        expect(table.metadata?.executionTimeMs).toBe(42);
    });

    describe('FromLegacySpec', () => {
        it('wraps a legacy single-table shape into a DataTable with metadata', () => {
            const legacy = {
                source: 'query',
                columns: [
                    Object.assign(new MJColumnDescriptor('Month'), { sqlBaseType: 'nvarchar' as const }),
                    Object.assign(new MJColumnDescriptor('Revenue'), { sqlBaseType: 'money' as const }),
                ],
                rows: [
                    { Month: 'Jan', Revenue: 100000 },
                    { Month: 'Feb', Revenue: 120000 },
                ],
                metadata: { sql: 'SELECT Month, Revenue FROM Sales', executionTimeMs: 55 },
                entityName: 'Sales',
                extraFilter: "Year = 2025",
                queryName: 'Monthly Revenue',
                queryCategoryPath: 'Sales/Reports',
                parameters: { year: 2025 },
            };

            const table = DataTable.FromLegacySpec(legacy, 'monthly_revenue');

            expect(table.name).toBe('monthly_revenue');
            expect(table.source).toBe('query');
            expect(table.columns).toHaveLength(2);
            expect(table.rows).toHaveLength(2);
            expect(table.rows[0]['Month']).toBe('Jan');

            // Metadata merges original + provenance fields
            expect(table.metadata?.sql).toBe('SELECT Month, Revenue FROM Sales');
            expect(table.metadata?.executionTimeMs).toBe(55);
            expect(table.metadata?.entityName).toBe('Sales');
            expect(table.metadata?.extraFilter).toBe("Year = 2025");
            expect(table.metadata?.queryName).toBe('Monthly Revenue');
            expect(table.metadata?.queryCategoryPath).toBe('Sales/Reports');
            expect(table.metadata?.parameters).toEqual({ year: 2025 });
        });

        it('handles minimal input — defaults name and empty arrays', () => {
            const table = DataTable.FromLegacySpec({});

            expect(table.name).toBe('results');
            expect(table.columns).toEqual([]);
            expect(table.rows).toEqual([]);
            expect(table.source).toBeUndefined();
            expect(table.metadata).toBeUndefined();
        });

        it('creates metadata when spec.metadata exists even without provenance fields', () => {
            const table = DataTable.FromLegacySpec({
                metadata: { sql: 'SELECT 1' },
            });

            expect(table.metadata?.sql).toBe('SELECT 1');
            expect(table.metadata?.entityName).toBeUndefined();
            expect(table.metadata?.queryName).toBeUndefined();
        });
    });

    it('supports per-table state: sorting, selectedRows, pageNumber, computations', () => {
        const table = new DataTable();
        table.name = 'orders';
        table.columns = [new MJColumnDescriptor('Amount')];
        table.rows = [{ Amount: 100 }, { Amount: 200 }];

        table.sorting = [{ field: 'Amount', direction: 'desc' }];
        table.selectedRows = [{ rowIndex: 0, rowData: { Amount: 100 } }];
        table.pageNumber = 3;
        const comp: DataComputation = { name: 'Total', type: 'sum', field: 'Amount', value: 300, formattedValue: '$300' };
        table.computations = [comp];

        expect(table.sorting).toEqual([{ field: 'Amount', direction: 'desc' }]);
        expect(table.selectedRows).toHaveLength(1);
        expect(table.selectedRows![0].rowIndex).toBe(0);
        expect(table.pageNumber).toBe(3);
        expect(table.computations).toHaveLength(1);
        expect(table.computations![0].name).toBe('Total');
        expect(table.computations![0].value).toBe(300);
    });
});
