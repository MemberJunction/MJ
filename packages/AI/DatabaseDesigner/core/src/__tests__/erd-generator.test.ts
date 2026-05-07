import { describe, it, expect } from 'vitest';
import { generateERDMermaid } from '../erd-generator.js';
import type { TableDefinition } from '@memberjunction/schema-engine';

const PRODUCTS_TABLE: TableDefinition = {
    SchemaName: '__mj_UDT',
    TableName: 'Products',
    EntityName: 'Products',
    Columns: [
        { Name: 'Name', Type: 'string', IsNullable: false },
        { Name: 'Price', Type: 'decimal', IsNullable: false },
        { Name: 'Status', Type: 'string', IsNullable: false },
    ],
};

const ORDERS_TABLE: TableDefinition = {
    SchemaName: '__mj_UDT',
    TableName: 'CustomerOrders',
    EntityName: 'Customer Orders',
    Columns: [
        { Name: 'CustomerID', Type: 'uuid', IsNullable: false },
        { Name: 'TotalAmount', RawSqlType: 'DECIMAL(18,4)', IsNullable: false, Type: 'decimal' },
        { Name: 'Status', RawSqlType: 'NVARCHAR(50)', IsNullable: false, Type: 'string' },
    ],
    ForeignKeys: [
        { ColumnName: 'CustomerID', ReferencedSchema: '__mj', ReferencedTable: 'User', ReferencedColumn: 'ID', IsSoft: false },
    ],
};

const ORDER_LINES_TABLE: TableDefinition = {
    SchemaName: '__mj_UDT',
    TableName: 'OrderLines',
    EntityName: 'Order Lines',
    Columns: [
        { Name: 'OrderID', Type: 'uuid', IsNullable: false },
        { Name: 'ProductID', Type: 'uuid', IsNullable: false },
        { Name: 'Quantity', Type: 'integer', IsNullable: false },
    ],
    ForeignKeys: [
        { ColumnName: 'OrderID', ReferencedSchema: '__mj_UDT', ReferencedTable: 'CustomerOrders', ReferencedColumn: 'ID', IsSoft: true },
        { ColumnName: 'ProductID', ReferencedSchema: '__mj_UDT', ReferencedTable: 'Products', ReferencedColumn: 'ID', IsSoft: true },
    ],
};

describe('generateERDMermaid', () => {

    describe('single table — no FKs', () => {
        it('returns null (no diagram needed for isolated table)', () => {
            expect(generateERDMermaid([PRODUCTS_TABLE])).toBeNull();
        });
    });

    describe('single table — with FKs to existing entity', () => {
        it('returns a non-null mermaid string', () => {
            expect(generateERDMermaid([ORDERS_TABLE])).not.toBeNull();
        });

        it('starts with erDiagram', () => {
            const result = generateERDMermaid([ORDERS_TABLE])!;
            expect(result.startsWith('erDiagram')).toBe(true);
        });

        it('includes the table entity block', () => {
            const result = generateERDMermaid([ORDERS_TABLE])!;
            expect(result).toContain('CustomerOrders {');
        });

        it('tags FK column with FK marker', () => {
            const result = generateERDMermaid([ORDERS_TABLE])!;
            expect(result).toContain('CustomerID FK');
        });

        it('strips parentheses from RawSqlType for mermaid compatibility', () => {
            const result = generateERDMermaid([ORDERS_TABLE])!;
            // DECIMAL(18,4) → DECIMAL, NVARCHAR(50) → NVARCHAR
            expect(result).toContain('DECIMAL TotalAmount');
            expect(result).toContain('NVARCHAR Status');
        });

        it('draws a relationship line to the referenced table', () => {
            const result = generateERDMermaid([ORDERS_TABLE])!;
            expect(result).toContain('User ||--o{ CustomerOrders');
        });
    });

    describe('multi-table batch — cross-table FKs', () => {
        it('returns a non-null mermaid string for multi-table (even without external FKs)', () => {
            // Products has no FKs, but multi-table always generates an ERD
            expect(generateERDMermaid([PRODUCTS_TABLE, ORDER_LINES_TABLE])).not.toBeNull();
        });

        it('includes entity blocks for all tables', () => {
            const result = generateERDMermaid([ORDERS_TABLE, ORDER_LINES_TABLE])!;
            expect(result).toContain('CustomerOrders {');
            expect(result).toContain('OrderLines {');
        });

        it('draws FK relationships from OrderLines to both referenced tables', () => {
            const result = generateERDMermaid([ORDERS_TABLE, ORDER_LINES_TABLE])!;
            expect(result).toContain('CustomerOrders ||--o{ OrderLines');
            expect(result).toContain('Products ||--o{ OrderLines');
        });

        it('deduplicates identical relationship lines', () => {
            // Duplicate the same FK entry to verify dedup
            const tableWithDuplicateFKs: TableDefinition = {
                ...ORDER_LINES_TABLE,
                ForeignKeys: [
                    ...ORDER_LINES_TABLE.ForeignKeys!,
                    { ColumnName: 'OrderID', ReferencedSchema: '__mj_UDT', ReferencedTable: 'CustomerOrders', ReferencedColumn: 'ID', IsSoft: true },
                ],
            };
            const result = generateERDMermaid([tableWithDuplicateFKs])!;
            const matches = result.match(/CustomerOrders \|\|--o\{ OrderLines/g) ?? [];
            expect(matches.length).toBe(1);
        });
    });

    describe('empty input', () => {
        it('returns null for an empty array', () => {
            expect(generateERDMermaid([])).toBeNull();
        });
    });

    describe('type mapping', () => {
        it('maps abstract uuid type to UNIQUEIDENTIFIER', () => {
            const result = generateERDMermaid([ORDERS_TABLE])!;
            expect(result).toContain('UNIQUEIDENTIFIER CustomerID');
        });

        it('uses RawSqlType stripped of precision over abstract Type', () => {
            const table: TableDefinition = {
                ...ORDERS_TABLE,
                Columns: [
                    { Name: 'Amount', RawSqlType: 'DECIMAL(18,4)', IsNullable: false, Type: 'decimal' },
                    { Name: 'RefID', Type: 'uuid', IsNullable: false },
                ],
            };
            const result = generateERDMermaid([table])!;
            expect(result).toContain('DECIMAL Amount');
            expect(result).toContain('UNIQUEIDENTIFIER RefID');
        });
    });
});
