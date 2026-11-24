import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityIndexInfo, EntityIndexFieldInfo } from '../generic/entityInfo';
import { ProviderBase } from '../generic/providerBase';

const ENTITY_ID = '11111111-1111-1111-1111-111111111111';
const FIELD_ID_PK = '22222222-2222-2222-2222-222222222221';
const FIELD_ID_TENANT = '22222222-2222-2222-2222-222222222222';
const FIELD_ID_STATUS = '22222222-2222-2222-2222-222222222223';
const FIELD_ID_NAME = '22222222-2222-2222-2222-222222222224';
const FIELD_ID_EMAIL = '22222222-2222-2222-2222-222222222225';
const FIELD_ID_PROPOSED = '22222222-2222-2222-2222-222222222226';
const FIELD_ID_UNINDEXED = '22222222-2222-2222-2222-222222222227';

function makeEntity(indexes: Record<string, unknown>[]): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Orders',
        BaseTable: 'Order',
        SchemaName: 'dbo',
        EntityFields: [
            { ID: FIELD_ID_PK, EntityID: ENTITY_ID, Name: 'ID', Sequence: 1, IsPrimaryKey: true },
            { ID: FIELD_ID_TENANT, EntityID: ENTITY_ID, Name: 'TenantID', Sequence: 2 },
            { ID: FIELD_ID_STATUS, EntityID: ENTITY_ID, Name: 'Status', Sequence: 3 },
            { ID: FIELD_ID_NAME, EntityID: ENTITY_ID, Name: 'Name', Sequence: 4 },
            { ID: FIELD_ID_EMAIL, EntityID: ENTITY_ID, Name: 'Email', Sequence: 5 },
            { ID: FIELD_ID_PROPOSED, EntityID: ENTITY_ID, Name: 'CreatedAt', Sequence: 6 },
            { ID: FIELD_ID_UNINDEXED, EntityID: ENTITY_ID, Name: 'Notes', Sequence: 7 },
        ],
        EntityIndexes: indexes,
    });
}

describe('EntityIndexInfo & EntityIndexFieldInfo', () => {
    it('hydrates fields sorted by Sequence and splits KeyFields vs IncludeFields', () => {
        const idx = new EntityIndexInfo({
            ID: 'idx-1',
            EntityID: ENTITY_ID,
            Name: 'IX_Order_Tenant_Status',
            IndexType: 'BTree',
            NativeType: 'NONCLUSTERED',
            IsUnique: false,
            IsPrimaryKey: false,
            IsClustered: false,
            FilterDefinition: "([Status]<>'Deleted')",
            HasExpressions: false,
            Source: 'Database',
            Status: 'Active',
            EntityIndexFields: [
                { ID: 'f3', EntityIndexID: 'idx-1', EntityFieldID: FIELD_ID_NAME, Sequence: 3, Role: 'Include', SortDirection: 'ASC' },
                { ID: 'f2', EntityIndexID: 'idx-1', EntityFieldID: FIELD_ID_STATUS, Sequence: 2, Role: 'Key', SortDirection: 'DESC' },
                { ID: 'f1', EntityIndexID: 'idx-1', EntityFieldID: FIELD_ID_TENANT, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
            ],
        });

        expect(idx.IsFiltered).toBe(true);
        expect(idx.IsActive).toBe(true);
        expect(idx.Fields.map((f) => f.Sequence)).toEqual([1, 2, 3]);
        expect(idx.KeyFields.map((f) => f.EntityFieldID)).toEqual([FIELD_ID_TENANT, FIELD_ID_STATUS]);
        expect(idx.IncludeFields.map((f) => f.EntityFieldID)).toEqual([FIELD_ID_NAME]);
        expect(idx.KeyFields[1].SortDirection).toBe('DESC');
        expect(idx.IncludeFields[0].IsInclude).toBe(true);
        expect(idx.KeyFields[0].IsKey).toBe(true);
    });

    it('identifies expression key parts via IsExpression', () => {
        const exprField = new EntityIndexFieldInfo({
            ID: 'f-expr',
            EntityIndexID: 'idx-expr',
            EntityFieldID: null,
            Expression: 'lower(email)',
            Sequence: 1,
            Role: 'Key',
            SortDirection: 'ASC',
        });
        expect(exprField.IsExpression).toBe(true);
        expect(exprField.Expression).toBe('lower(email)');
    });
});

describe('EntityInfo.Indexes & EntityFieldInfo index helpers', () => {
    it('evaluates IsIndexed and IsLeadingIndexColumn over Active key columns only', () => {
        const entity = makeEntity([
            {
                ID: 'idx-pk',
                EntityID: ENTITY_ID,
                Name: 'PK_Order',
                IndexType: 'BTree',
                NativeType: 'CLUSTERED',
                IsUnique: true,
                IsPrimaryKey: true,
                IsClustered: true,
                Source: 'Database',
                Status: 'Active',
                EntityIndexFields: [
                    { ID: 'f-pk', EntityIndexID: 'idx-pk', EntityFieldID: FIELD_ID_PK.toUpperCase(), Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                ],
            },
            {
                ID: 'idx-comp',
                EntityID: ENTITY_ID,
                Name: 'IX_Order_Tenant_Status',
                IndexType: 'BTree',
                NativeType: 'NONCLUSTERED',
                Source: 'Database',
                Status: 'Active',
                EntityIndexFields: [
                    { ID: 'f-t', EntityIndexID: 'idx-comp', EntityFieldID: FIELD_ID_TENANT, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                    { ID: 'f-s', EntityIndexID: 'idx-comp', EntityFieldID: FIELD_ID_STATUS, Sequence: 2, Role: 'Key', SortDirection: 'DESC' },
                    { ID: 'f-n', EntityIndexID: 'idx-comp', EntityFieldID: FIELD_ID_NAME, Sequence: 3, Role: 'Include', SortDirection: 'ASC' },
                ],
            },
            {
                ID: 'idx-expr',
                EntityID: ENTITY_ID,
                Name: 'IX_Order_LowerEmail',
                IndexType: 'BTree',
                NativeType: 'btree',
                HasExpressions: true,
                Source: 'Database',
                Status: 'Active',
                EntityIndexFields: [
                    { ID: 'f-e1', EntityIndexID: 'idx-expr', EntityFieldID: null, Expression: 'lower(email)', Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                    { ID: 'f-e2', EntityIndexID: 'idx-expr', EntityFieldID: FIELD_ID_EMAIL, Sequence: 2, Role: 'Key', SortDirection: 'ASC' },
                ],
            },
            {
                ID: 'idx-prop',
                EntityID: ENTITY_ID,
                Name: 'IX_Order_CreatedAt_Proposed',
                IndexType: 'BTree',
                NativeType: 'NONCLUSTERED',
                Source: 'DBAutoDoc',
                Status: 'Proposed',
                EntityIndexFields: [
                    { ID: 'f-p1', EntityIndexID: 'idx-prop', EntityFieldID: FIELD_ID_PROPOSED, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
                ],
            },
        ]);

        // Sorted deterministically by Name
        expect(entity.Indexes.map((i) => i.Name)).toEqual([
            'IX_Order_CreatedAt_Proposed',
            'IX_Order_LowerEmail',
            'IX_Order_Tenant_Status',
            'PK_Order',
        ]);
        expect(entity.ActiveIndexes).toHaveLength(3);

        const field = (name: string) => entity.Fields.find((f) => f.Name === name)!;

        // Primary key: indexed & leading (case-insensitive UUID match)
        expect(field('ID').IsIndexed).toBe(true);
        expect(field('ID').IsLeadingIndexColumn).toBe(true);

        // Composite leading key column: indexed & leading
        expect(field('TenantID').IsIndexed).toBe(true);
        expect(field('TenantID').IsLeadingIndexColumn).toBe(true);

        // Composite second key column: indexed, NOT leading
        expect(field('Status').IsIndexed).toBe(true);
        expect(field('Status').IsLeadingIndexColumn).toBe(false);

        // INCLUDE-only column: neither indexed nor leading
        expect(field('Name').IsIndexed).toBe(false);
        expect(field('Name').IsLeadingIndexColumn).toBe(false);

        // Column after leading expression key part: indexed, NOT leading
        expect(field('Email').IsIndexed).toBe(true);
        expect(field('Email').IsLeadingIndexColumn).toBe(false);

        // Column only in a Proposed index: neither indexed nor leading
        expect(field('CreatedAt').IsIndexed).toBe(false);
        expect(field('CreatedAt').IsLeadingIndexColumn).toBe(false);

        // Unindexed column
        expect(field('Notes').IsIndexed).toBe(false);
        expect(field('Notes').IsLeadingIndexColumn).toBe(false);
    });
});

describe('ProviderBase.PostProcessEntityMetadata — EntityIndexes linking', () => {
    it('links EntityIndexFields to EntityIndexes and EntityIndexes to Entities across UUID cases', () => {
        const postProcess = (
            ProviderBase.prototype as unknown as {
                PostProcessEntityMetadata: (
                    entities: unknown[],
                    fields: unknown[],
                    fieldValues: unknown[],
                    permissions: unknown[],
                    relationships: unknown[],
                    settings: unknown[],
                    organicKeys?: unknown[],
                    organicKeyRelatedEntities?: unknown[],
                    fieldPermissions?: unknown[],
                    alternateBaseViews?: unknown[],
                    uniqueKeys?: unknown[],
                    entityIndexes?: unknown[],
                    entityIndexFields?: unknown[],
                ) => EntityInfo[];
            }
        ).PostProcessEntityMetadata.bind(ProviderBase.prototype);

        const entities = postProcess(
            [{ ID: ENTITY_ID.toLowerCase(), Name: 'Orders', SchemaName: 'dbo', BaseTable: 'Order' }],
            [{ ID: FIELD_ID_TENANT.toLowerCase(), EntityID: ENTITY_ID.toLowerCase(), Name: 'TenantID', Sequence: 1 }],
            [], [], [], [],
            undefined, undefined, undefined, undefined, undefined,
            [{ ID: 'aaaa1111-1111-1111-1111-111111111111', EntityID: ENTITY_ID.toUpperCase(), Name: 'IX_Order_TenantID', Status: 'Active', Source: 'CodeGen' }],
            [{ ID: 'bbbb1111-1111-1111-1111-111111111111', EntityIndexID: 'AAAA1111-1111-1111-1111-111111111111', EntityFieldID: FIELD_ID_TENANT.toUpperCase(), Sequence: 1, Role: 'Key', SortDirection: 'ASC' }],
        );

        expect(entities).toHaveLength(1);
        expect(entities[0].Indexes).toHaveLength(1);
        expect(entities[0].Indexes[0].Fields).toHaveLength(1);
        expect(entities[0].Fields[0].IsIndexed).toBe(true);
        expect(entities[0].Fields[0].IsLeadingIndexColumn).toBe(true);
    });

    it('includes EntityIndexes and EntityIndexFields in MetadataBuildItemCodes', () => {
        expect(ProviderBase.MetadataBuildItemCodes.has('EntityIndexes')).toBe(true);
        expect(ProviderBase.MetadataBuildItemCodes.has('EntityIndexFields')).toBe(true);
    });
});
