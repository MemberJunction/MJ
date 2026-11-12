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
    logError: vi.fn(), logStatus: vi.fn(), LogWarning: vi.fn(),
    get logWarning() { return this.LogWarning; }, StartSpinner: vi.fn(),
    get startSpinner() { return this.StartSpinner; }, SucceedSpinner: vi.fn(),
    get succeedSpinner() { return this.SucceedSpinner; },
    UpdateSpinner: vi.fn(), FailSpinner: vi.fn(),
}));

import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLCodeGenBase } from '../Database/sql_codegen';

class TestSQLCodeGen extends SQLCodeGenBase {
    public callGenerateBaseViewJoins(entity: EntityInfo, fields: EntityFieldInfo[]): string {
        return this.generateBaseViewJoins(entity, fields);
    }
}

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

    describe("SaveReturnMode ('datestamps_only' vs 'full')", () => {
        const datestampFields: FieldInit[] = [
            pkField('ID', 'uniqueidentifier', { DefaultValue: 'newsequentialid()' }),
            dataField('InputData', true),
            {
                ID: 'f-created', Name: '__mj_CreatedAt', CodeName: '__mj_CreatedAt', Type: 'datetimeoffset', Length: 10,
                IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: 'getutcdate()',
            },
            {
                ID: 'f-updated', Name: '__mj_UpdatedAt', CodeName: '__mj_UpdatedAt', Type: 'datetimeoffset', Length: 10,
                IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, AutoIncrement: false, DefaultValue: 'getutcdate()',
            },
            {
                ID: 'f-virtual', Name: 'AgentName', CodeName: 'AgentName', Type: 'nvarchar', Length: 100,
                IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: false, IsVirtual: true, AutoIncrement: false, DefaultValue: '',
            },
        ];

        it('emits SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [schema].[BaseTable] in spCreate and spUpdate when SaveReturnMode is datestamps_only', () => {
            const entity = createEntity(
                { Configuration: JSON.stringify({ SaveReturnMode: 'datestamps_only' }) },
                datestampFields,
            );
            const createSQL = provider.generateCRUDCreate(entity);
            const updateSQL = provider.generateCRUDUpdate(entity);

            expect(createSQL).toContain('SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [dbo].[TestEntity] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)');
            expect(createSQL).not.toContain('vwTestEntities');

            expect(updateSQL).toContain('SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [dbo].[TestEntity] WHERE 1=0');
            expect(updateSQL).toContain('SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [dbo].[TestEntity] WHERE [ID] = @ID');
            expect(updateSQL).not.toContain('vwTestEntities');
        });

        it('keeps SELECT * FROM [schema].[BaseView] in spCreate and spUpdate when SaveReturnMode is full (default)', () => {
            const entity = createEntity({}, datestampFields);
            const createSQL = provider.generateCRUDCreate(entity);
            const updateSQL = provider.generateCRUDUpdate(entity);

            expect(createSQL).toContain('SELECT * FROM [dbo].[vwTestEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)');
            expect(updateSQL).toContain('SELECT TOP 0 * FROM [dbo].[vwTestEntities] WHERE 1=0');
            expect(updateSQL).toContain('[dbo].[vwTestEntities]');
        });
    });
});

describe('Wave 4.3b — single-write spUpdate, hierarchy TVF, geo base-table join, and polymorphic FK indexing', () => {
    const provider = new SQLServerCodeGenProvider();

    describe('single-write spUpdate and guarded trgUpdate timestamp trigger', () => {
        const updatableWithTimestamp: FieldInit[] = [
            pkField('ID', 'uniqueidentifier'),
            dataField('Name', false),
            {
                ID: 'f-updated',
                Name: '__mj_UpdatedAt',
                CodeName: '__mj_UpdatedAt',
                Type: 'datetimeoffset',
                Length: 10,
                IsPrimaryKey: false,
                AllowsNull: false,
                AllowUpdateAPI: false,
                IsVirtual: false,
                AutoIncrement: false,
                DefaultValue: 'getutcdate()',
            },
        ];

        it('sets [__mj_UpdatedAt] = GETUTCDATE() in spUpdate when entity has updatable fields and __mj_UpdatedAt', () => {
            const entity = createEntity({}, updatableWithTimestamp);
            const updateSQL = provider.generateCRUDUpdate(entity);

            expect(updateSQL).toContain('[Name] = ISNULL(@Name, [Name]),\n        [__mj_UpdatedAt] = GETUTCDATE()');
        });

        it('guards trgUpdate with IF NOT UPDATE([__mj_UpdatedAt]) to prevent double clustered-index writes on spUpdate', () => {
            const entity = createEntity({}, updatableWithTimestamp);
            const triggerSQL = provider.generateTimestampTrigger(entity);

            expect(triggerSQL).toContain('IF NOT UPDATE([__mj_UpdatedAt])');
            expect(triggerSQL).toContain('BEGIN\n        UPDATE\n            [dbo].[TestEntity]\n        SET\n            __mj_UpdatedAt = GETUTCDATE()');
        });

        it('does not emit an invalid UPDATE in spUpdate for PK-only entities without updatable fields', () => {
            const pkOnlyFields: FieldInit[] = [
                pkField('ID', 'uniqueidentifier'),
                {
                    ID: 'f-updated',
                    Name: '__mj_UpdatedAt',
                    CodeName: '__mj_UpdatedAt',
                    Type: 'datetimeoffset',
                    Length: 10,
                    IsPrimaryKey: false,
                    AllowsNull: false,
                    AllowUpdateAPI: false,
                    IsVirtual: false,
                    AutoIncrement: false,
                    DefaultValue: 'getutcdate()',
                },
            ];
            const entity = createEntity({}, pkOnlyFields);
            const updateSQL = provider.generateCRUDUpdate(entity);

            expect(updateSQL).not.toContain('UPDATE\n        [dbo].[TestEntity]');
            expect(updateSQL).toContain('No updatable fields (PK-only entity, e.g. junction table). Return the existing row.');
        });

        it('does not include [__mj_UpdatedAt] = GETUTCDATE() when entity has no __mj_UpdatedAt column', () => {
            const noTimestampFields: FieldInit[] = [
                pkField('ID', 'uniqueidentifier'),
                dataField('Name', false),
            ];
            const entity = createEntity({}, noTimestampFields);
            const updateSQL = provider.generateCRUDUpdate(entity);
            const triggerSQL = provider.generateTimestampTrigger(entity);

            expect(updateSQL).not.toContain('[__mj_UpdatedAt] = GETUTCDATE()');
            expect(triggerSQL).toBe('');
        });
    });

    describe('collapsed fn*GetHierarchyMeta inline table-valued function', () => {
        const hierarchyFields: FieldInit[] = [
            pkField('ID', 'uniqueidentifier'),
            {
                ID: 'fk-parent',
                Name: 'ParentID',
                CodeName: 'ParentID',
                Type: 'uniqueidentifier',
                Length: 16,
                IsPrimaryKey: false,
                AllowsNull: true,
                AllowUpdateAPI: true,
                IsVirtual: false,
                AutoIncrement: false,
                RelatedEntityID: 'entity-1',
                RelatedEntity: 'Test Entity',
            },
            dataField('Name', false),
        ];

        it('references CTE_Ancestors once in the outer query and projects Depth and Path directly with OUTER APPLY child count', () => {
            const entity = createEntity({ BaseTable: 'Category', BaseTableCodeName: 'Category' }, hierarchyFields);
            const parentField = entity.Fields.find(f => f.Name === 'ParentID')!;
            const sql = provider.generateHierarchyMetaFunction(entity, parentField);

            // Replaces redundant CTE evaluations with direct column references on 'a'
            expect(sql).toContain('a.[Depth] AS [Depth]');
            expect(sql).toContain('a.[Path] AS [Path]');
            expect(sql).not.toContain('SELECT MAX([Depth]) FROM CTE_Ancestors');
            expect(sql).not.toContain('SELECT TOP 1 [Path] FROM CTE_Ancestors');

            // Replaces EXISTS and COUNT with a single OUTER APPLY
            expect(sql).toContain('OUTER APPLY (\n        SELECT COUNT(1) AS [ChildCount]\n        FROM [dbo].[Category]\n        WHERE [ParentID] = @RecordID\n    ) ch');
            expect(sql).toContain('CAST(CASE WHEN ch.[ChildCount] > 0 THEN 0 ELSE 1 END AS BIT) AS [IsLeaf]');
            expect(sql).toContain('ch.[ChildCount] AS [ChildCount]');
        });
    });

    describe('automatic foreign key indexing for polymorphic pairs (EntityIDFieldName)', () => {
        it('indexes bounded polymorphic FK columns and skips unbounded ones with disclosure', () => {
            const polymorphicFields: FieldInit[] = [
                pkField('ID', 'uniqueidentifier'),
                {
                    ID: 'f-ent',
                    Name: 'EntityID',
                    CodeName: 'EntityID',
                    Type: 'uniqueidentifier',
                    Length: 16,
                    IsPrimaryKey: false,
                    AllowsNull: false,
                    AllowUpdateAPI: true,
                    IsVirtual: false,
                    AutoIncrement: false,
                },
                {
                    ID: 'f-rec',
                    Name: 'RecordID',
                    CodeName: 'RecordID',
                    Type: 'nvarchar',
                    Length: 450,
                    IsPrimaryKey: false,
                    AllowsNull: false,
                    AllowUpdateAPI: true,
                    IsVirtual: false,
                    AutoIncrement: false,
                    EntityIDFieldName: 'EntityID',
                },
                {
                    ID: 'f-rec-unbounded',
                    Name: 'UnboundedRecordID',
                    CodeName: 'UnboundedRecordID',
                    Type: 'nvarchar',
                    Length: -1,
                    IsPrimaryKey: false,
                    AllowsNull: true,
                    AllowUpdateAPI: true,
                    IsVirtual: false,
                    AutoIncrement: false,
                    EntityIDFieldName: 'EntityID',
                },
            ];

            const entity = createEntity({}, polymorphicFields);
            const indexes = provider.GenerateForeignKeyIndexes(entity);

            // Bounded columns are indexed
            expect(indexes.some(i => i.includes('CREATE INDEX IDX_AUTO_MJ_FKEY_TestEntity_RecordID') && i.includes('([RecordID])'))).toBe(true);
            expect(indexes.some(i => i.includes('CREATE INDEX IDX_AUTO_MJ_FKEY_TestEntity_EntityID') && i.includes('([EntityID])'))).toBe(true);

            // Unbounded column is skipped with disclosure
            expect(indexes.some(i => i.includes('-- FK INDEX SKIPPED for dbo.TestEntity') && i.includes('UnboundedRecordID (nvarchar): unbounded'))).toBe(true);
            expect(indexes.some(i => i.includes('IDX_AUTO_MJ_FKEY_TestEntity_UnboundedRecordID'))).toBe(false);
        });
    });

    describe('generateBaseViewJoins joins physical RecordGeoCode table', () => {
        it('joins RecordGeoCode instead of vwRecordGeoCodes for geo-enabled entities', () => {
            const geoFields: FieldInit[] = [
                pkField('ID', 'uniqueidentifier'),
                {
                    ID: 'f-address',
                    Name: 'StreetAddress',
                    CodeName: 'StreetAddress',
                    Type: 'nvarchar',
                    Length: 200,
                    IsPrimaryKey: false,
                    AllowsNull: true,
                    AllowUpdateAPI: true,
                    IsVirtual: false,
                    AutoIncrement: false,
                    ExtendedType: 'GeoAddress',
                },
            ];

            const geoEntity = createEntity({ SupportsGeoCoding: true }, geoFields);
            const codeGen = new TestSQLCodeGen();
            codeGen.DBProvider = provider;

            const joins = codeGen.callGenerateBaseViewJoins(geoEntity, geoEntity.Fields);

            expect(joins).toContain('LEFT OUTER JOIN\n    [__mj].[RecordGeoCode] AS __mj_rgc');
            expect(joins).not.toContain('vwRecordGeoCodes');
        });
    });
});

