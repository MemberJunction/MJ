import { describe, it, expect, vi } from 'vitest';

/**
 * SQL Server CodeGen provider — composite primary key handling.
 *
 * MJ entities may have composite primary keys. Every MJ core entity happens to use a single `ID`
 * column, so a generator that keys on `FirstPrimaryKey` alone works on the core product and only
 * breaks on customer schemas: a composite key gets truncated to its first column. These tests pin
 * the two generators that had that shape — spCreate for a composite key containing an IDENTITY
 * column, and the cascade delete/update whose FK may reference a composite parent's second column —
 * and also pin that the single-column output shape is unchanged.
 */
vi.mock('mssql', () => ({}));
vi.mock('../Misc/status_logging', () => ({
    logError: vi.fn(), logStatus: vi.fn(), logWarning: vi.fn(), startSpinner: vi.fn(), succeedSpinner: vi.fn(),
}));

import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';

type FieldInit = Record<string, unknown>;
const pkField = (name: string, type: string, extra: FieldInit = {}): FieldInit => ({
    ID: `pk-${name}`, Name: name, CodeName: name, Type: type, Length: type === 'int' ? 4 : 16,
    IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: '', ...extra,
});
const dataField = (name: string, allowsNull: boolean): FieldInit => ({
    ID: `f-${name}`, Name: name, CodeName: name, Type: 'nvarchar', Length: 100,
    IsPrimaryKey: false, AllowsNull: allowsNull, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '',
});
function createEntity(overrides: FieldInit, fields: FieldInit[]): EntityInfo {
    return new EntityInfo({
        ID: 'entity-1', Name: 'Test Entity', SchemaName: 'dbo', BaseTable: 'TestEntity', BaseTableCodeName: 'TestEntity', BaseView: 'vwTestEntities',
        IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, CascadeDeletes: false, DeleteType: 'Hard',
        spCreate: '', spUpdate: '', spDelete: '', EntityFields: fields, EntityPermissions: [], ...overrides,
    });
}
const tenantOrders = { ID: 'parent-composite', Name: 'Tenant Orders', BaseTable: 'TenantOrder', BaseTableCodeName: 'TenantOrder', BaseView: 'vwTenantOrders' };

describe('SQLServerCodeGenProvider — composite primary keys are never truncated to the first column', () => {
    const provider = new SQLServerCodeGenProvider();

    describe('generateCRUDCreate with an IDENTITY column inside a composite key', () => {
        it('inserts the caller-supplied key columns and looks the row up by every key column', () => {
            const entity = createEntity(tenantOrders, [
                pkField('TenantID', 'uniqueidentifier'),
                pkField('OrderNo', 'int', { AutoIncrement: true }),
                dataField('Status', true),
            ]);
            const sql = provider.generateCRUDCreate(entity);
            expect(sql).toContain('WHERE [OrderNo] = SCOPE_IDENTITY() AND [TenantID] = @TenantID');
            const colList = sql.match(/INSERT INTO\s*\[dbo\]\.\[TenantOrder\]\s*\(([\s\S]*?)\)\s*VALUES/i)![1];
            expect((colList.match(/\[TenantID\]/g) || []).length).toBe(1);
            expect(colList).not.toContain('[OrderNo]');
            const valList = sql.match(/VALUES\s*\(([\s\S]*?)\)\s*-- return the new record/i)![1];
            expect(valList).toContain('@TenantID');
        });

        it('keeps the single-column identity shape unchanged', () => {
            const entity = createEntity({}, [pkField('ID', 'int', { AutoIncrement: true }), dataField('Name', false)]);
            const sql = provider.generateCRUDCreate(entity);
            expect(sql).toMatch(/WHERE \[ID\] = SCOPE_IDENTITY\(\)\s*$/m);
            expect(sql).not.toContain('SCOPE_IDENTITY() AND');
            const colList = sql.match(/INSERT INTO\s*\[dbo\]\.\[TestEntity\]\s*\(([\s\S]*?)\)\s*VALUES/i)![1];
            expect(colList).not.toContain('[ID]');
            expect(colList).toContain('[Name]');
        });
    });

    describe('generateInsertFieldString evaluates AutoIncrement per key column', () => {
        it('keeps the non-identity column of a composite key in the caller-supplied list', () => {
            const entity = createEntity(tenantOrders, [pkField('TenantID', 'uniqueidentifier'), pkField('OrderNo', 'int', { AutoIncrement: true }), dataField('Status', true)]);
            const cols = provider.generateInsertFieldString(entity, entity.Fields, '', false);
            expect(cols).toContain('[TenantID]');
            expect(cols).not.toContain('[OrderNo]');
            expect(cols).toContain('[Status]');
        });
    });

    describe('generateSingleCascadeOperation on a composite-key parent', () => {
        const parent = createEntity(tenantOrders, [pkField('TenantID', 'uniqueidentifier'), pkField('OrderNo', 'int'), dataField('Status', true)]);
        const related = createEntity(
            { ID: 'entity-lines', Name: 'Order Lines', CodeName: 'OrderLines', BaseTable: 'OrderLine', BaseTableCodeName: 'OrderLine', BaseView: 'vwOrderLines' },
            [pkField('ID', 'uniqueidentifier'), dataField('Qty', true)]
        );

        it('binds the FK to the parent key column it references — not the first key column', () => {
            const fk = new EntityFieldInfo({ Name: 'OrderNo', CodeName: 'OrderNo', AllowsNull: false, RelatedEntityID: 'parent-composite', RelatedEntityFieldName: 'OrderNo', Type: 'int', Length: 4 });
            const sql = provider.generateSingleCascadeOperation({ parentEntity: parent, relatedEntity: related, fkField: fk, operation: 'delete' });
            expect(sql).toMatch(/DECLARE cascade_delete_\w+_OrderNo_cursor CURSOR FOR/);
            expect(sql).toContain('WHERE [OrderNo] = @OrderNo');
            expect(sql).not.toContain('@TenantID');
        });

        it('emits a warning instead of guessing when the FK does not resolve to a parent key column', () => {
            const unresolved = new EntityFieldInfo({ Name: 'OrderRef', CodeName: 'OrderRef', AllowsNull: true, RelatedEntityID: 'parent-composite', Type: 'int', Length: 4 });
            const sql = provider.generateSingleCascadeOperation({ parentEntity: parent, relatedEntity: related, fkField: unresolved, operation: 'update' });
            expect(sql).toContain('-- WARNING: Cannot cascade to Order Lines.OrderRef');
            expect(sql).not.toContain('CURSOR FOR');
            expect(sql).not.toContain('@TenantID');
        });

        it('still binds the sole key column on a single-key parent (RelatedEntityFieldName not required)', () => {
            const singleParent = createEntity({}, [pkField('ID', 'uniqueidentifier'), dataField('Name', false)]);
            const fk = new EntityFieldInfo({ Name: 'ParentID', CodeName: 'ParentID', AllowsNull: false, RelatedEntityID: 'entity-1', Type: 'uniqueidentifier', Length: 16 });
            const sql = provider.generateSingleCascadeOperation({ parentEntity: singleParent, relatedEntity: related, fkField: fk, operation: 'delete' });
            expect(sql).toContain('WHERE [ParentID] = @ID');
        });
    });
});
