import { describe, it, expect } from 'vitest';
import { ColumnDescriptor, MJColumnDescriptor, GridColumnDescriptor } from '../generic/column-descriptors';

describe('ColumnDescriptor', () => {
    it('sets field name on construction, everything else undefined', () => {
        const col = new ColumnDescriptor('Revenue');

        expect(col.field).toBe('Revenue');
        expect(col.displayName).toBeUndefined();
        expect(col.sqlBaseType).toBeUndefined();
        expect(col.sqlFullType).toBeUndefined();
        expect(col.width).toBeUndefined();
        expect(col.description).toBeUndefined();
    });
});

describe('MJColumnDescriptor', () => {
    describe('FromColumnDescriptor', () => {
        it('copies base properties and adds entity lineage', () => {
            const base = new ColumnDescriptor('Amount');
            base.sqlBaseType = 'money';
            base.displayName = 'Total Amount';
            base.width = 120;
            base.description = 'Invoice total';

            const mj = MJColumnDescriptor.FromColumnDescriptor(base, 'Invoices', 'Amount');

            // Base props preserved
            expect(mj.field).toBe('Amount');
            expect(mj.sqlBaseType).toBe('money');
            expect(mj.displayName).toBe('Total Amount');
            expect(mj.width).toBe(120);
            expect(mj.description).toBe('Invoice total');

            // Entity lineage added
            expect(mj.sourceEntity).toBe('Invoices');
            expect(mj.sourceFieldName).toBe('Amount');
        });

        it('defaults sourceFieldName to field when not provided', () => {
            const base = new ColumnDescriptor('CustomerName');

            const mj = MJColumnDescriptor.FromColumnDescriptor(base, 'Customers');

            expect(mj.sourceEntity).toBe('Customers');
            expect(mj.sourceFieldName).toBe('CustomerName');
        });
    });

    describe('FromSimpleQueryField', () => {
        it('converts a legacy SimpleQueryFieldInfo shape into MJColumnDescriptor', () => {
            const field = {
                name: 'TotalRevenue',
                type: 'money',
                sourceEntity: 'Invoices',
                sourceFieldName: 'Amount',
                isSummary: true,
                description: 'Sum of all invoice amounts',
            };

            const mj = MJColumnDescriptor.FromSimpleQueryField(field);

            expect(mj.field).toBe('TotalRevenue');
            expect(mj.sqlBaseType).toBe('money');
            expect(mj.sourceEntity).toBe('Invoices');
            expect(mj.sourceFieldName).toBe('Amount');
            expect(mj.isSummary).toBe(true);
            expect(mj.description).toBe('Sum of all invoice amounts');
        });

        it('handles minimal input with only name', () => {
            const mj = MJColumnDescriptor.FromSimpleQueryField({ name: 'ID' });

            expect(mj.field).toBe('ID');
            expect(mj.sqlBaseType).toBeUndefined();
            expect(mj.sourceEntity).toBeUndefined();
        });
    });
});

describe('GridColumnDescriptor', () => {
    it('has sensible display defaults on construction', () => {
        const grid = new GridColumnDescriptor('Status');

        expect(grid.field).toBe('Status');
        expect(grid.visible).toBe(true);
        expect(grid.sortable).toBe(true);
        expect(grid.resizable).toBe(true);
        expect(grid.reorderable).toBe(true);
        expect(grid.order).toBe(0);
        expect(grid.align).toBeUndefined();
        expect(grid.pinned).toBeUndefined();
    });

    describe('FromMJColumn', () => {
        it('copies MJ properties, sets order, and preserves grid defaults', () => {
            const mj = new MJColumnDescriptor('Revenue');
            mj.sqlBaseType = 'money';
            mj.displayName = 'Revenue';
            mj.sourceEntity = 'Invoices';
            mj.sourceFieldName = 'Amount';
            mj.isComputed = false;
            mj.isSummary = true;

            const grid = GridColumnDescriptor.FromMJColumn(mj, 3);

            // MJ props preserved
            expect(grid.field).toBe('Revenue');
            expect(grid.sqlBaseType).toBe('money');
            expect(grid.sourceEntity).toBe('Invoices');
            expect(grid.sourceFieldName).toBe('Amount');
            expect(grid.isSummary).toBe(true);

            // Order set from argument
            expect(grid.order).toBe(3);

            // Grid defaults still in place
            expect(grid.visible).toBe(true);
            expect(grid.sortable).toBe(true);
            expect(grid.resizable).toBe(true);
        });
    });

    describe('ToMJColumn', () => {
        it('strips grid-only properties, preserves data-level properties', () => {
            const grid = new GridColumnDescriptor('Revenue');
            grid.sqlBaseType = 'money';
            grid.displayName = 'Revenue';
            grid.sqlFullType = 'money';
            grid.width = 150;
            grid.description = 'Total revenue';
            grid.sourceEntity = 'Invoices';
            grid.sourceFieldName = 'Amount';
            grid.isComputed = false;
            grid.isSummary = true;
            // Grid-specific state
            grid.visible = false;
            grid.sortable = false;
            grid.order = 5;
            grid.align = 'right';
            grid.pinned = 'left';

            const mj = grid.ToMJColumn();

            // Data-level props preserved
            expect(mj.field).toBe('Revenue');
            expect(mj.sqlBaseType).toBe('money');
            expect(mj.displayName).toBe('Revenue');
            expect(mj.sqlFullType).toBe('money');
            expect(mj.width).toBe(150);
            expect(mj.description).toBe('Total revenue');
            expect(mj.sourceEntity).toBe('Invoices');
            expect(mj.sourceFieldName).toBe('Amount');
            expect(mj.isComputed).toBe(false);
            expect(mj.isSummary).toBe(true);

            // Grid-only props NOT present
            expect(mj).not.toHaveProperty('visible');
            expect(mj).not.toHaveProperty('sortable');
            expect(mj).not.toHaveProperty('resizable');
            expect(mj).not.toHaveProperty('order');
            expect(mj).not.toHaveProperty('align');
            expect(mj).not.toHaveProperty('pinned');

            // Returns MJColumnDescriptor, not GridColumnDescriptor
            expect(mj).toBeInstanceOf(MJColumnDescriptor);
            expect(mj).not.toBeInstanceOf(GridColumnDescriptor);
        });
    });
});

describe('Type hierarchy', () => {
    it('MJColumnDescriptor is a ColumnDescriptor', () => {
        const mj = new MJColumnDescriptor('ID');
        expect(mj).toBeInstanceOf(ColumnDescriptor);
    });

    it('GridColumnDescriptor is both an MJColumnDescriptor and a ColumnDescriptor', () => {
        const grid = new GridColumnDescriptor('ID');
        expect(grid).toBeInstanceOf(MJColumnDescriptor);
        expect(grid).toBeInstanceOf(ColumnDescriptor);
    });

    it('a function accepting ColumnDescriptor works with all three levels', () => {
        function getField(col: ColumnDescriptor): string {
            return col.field;
        }

        expect(getField(new ColumnDescriptor('a'))).toBe('a');
        expect(getField(new MJColumnDescriptor('b'))).toBe('b');
        expect(getField(new GridColumnDescriptor('c'))).toBe('c');
    });
});
