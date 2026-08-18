import { describe, it, expect } from 'vitest';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';
import { EntityInfo } from '@memberjunction/core';

function createHierarchyEntity(overrides: Record<string, unknown> = {}): EntityInfo {
    const fields = [
        {
            ID: 'pk-1',
            Name: 'ID',
            Type: 'uniqueidentifier',
            Length: 16,
            IsPrimaryKey: true,
            AllowsNull: false,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            DefaultValue: 'newsequentialid()',
        },
        {
            ID: 'fk-parent',
            Name: 'ParentID',
            Type: 'uniqueidentifier',
            Length: 16,
            IsPrimaryKey: false,
            AllowsNull: true,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            RelatedEntityID: 'entity-categories',
            RelatedEntity: 'Categories',
        },
        {
            ID: 'f-name',
            Name: 'Name',
            Type: 'nvarchar',
            Length: 200,
            IsPrimaryKey: false,
            AllowsNull: false,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
        },
    ];

    const initData = {
        ID: 'entity-categories',
        Name: 'Categories',
        SchemaName: 'sales',
        BaseTable: 'Category',
        BaseTableCodeName: 'Category',
        BaseView: 'vwCategories',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EntityFields: fields,
        EntityPermissions: [],
        ...overrides,
    };

    return new EntityInfo(initData);
}

describe('SQLServerCodeGenProvider — Hierarchy TVF suite', () => {
    const provider = new SQLServerCodeGenProvider();
    const entity = createHierarchyEntity();
    const parentField = entity.Fields.find(f => f.Name === 'ParentID')!;

    it('generates hierarchy metadata function (fnCategoryParentID_GetHierarchyMeta)', () => {
        const sql = provider.generateHierarchyMetaFunction(entity, parentField);

        // Function signature and drops
        expect(sql).toContain("IF OBJECT_ID('[sales].[fnCategoryParentID_GetHierarchyMeta]', 'IF') IS NOT NULL");
        expect(sql).toContain('DROP FUNCTION [sales].[fnCategoryParentID_GetHierarchyMeta];');
        expect(sql).toContain('CREATE FUNCTION [sales].[fnCategoryParentID_GetHierarchyMeta]');
        expect(sql).toContain('@RecordID uniqueidentifier,');
        expect(sql).toContain('@ParentID uniqueidentifier');
        expect(sql).toContain('RETURNS TABLE');

        // Recursive CTE and cycle-guard
        expect(sql).toContain('WITH CTE_Ancestors AS');
        expect(sql).toContain('c.[Depth] < 100');
        expect(sql).toContain('ChildCount');
        expect(sql).toContain('IsLeaf');
        expect(sql).toContain('SELECT TOP 1');
    });

    it('generates descendants traversal function (fnCategoryParentID_GetDescendants)', () => {
        const sql = provider.generateDescendantsFunction(entity, parentField);

        expect(sql).toContain("IF OBJECT_ID('[sales].[fnCategoryParentID_GetDescendants]', 'IF') IS NOT NULL");
        expect(sql).toContain('CREATE FUNCTION [sales].[fnCategoryParentID_GetDescendants]');
        expect(sql).toContain('@RootID uniqueidentifier,');
        expect(sql).toContain('@MaxDepth INT = NULL');
        expect(sql).toContain('RETURNS TABLE');

        // Subtree recursion
        expect(sql).toContain('[ID] = @RootID');
        expect(sql).toContain('c.[ParentID] = p.[ID]');
        expect(sql).toContain('(@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)');
        expect(sql).toContain('p.[RelativeDepth] < 100');
    });

    it('generates ancestors traversal function (fnCategoryParentID_GetAncestors)', () => {
        const sql = provider.generateAncestorsFunction(entity, parentField);

        expect(sql).toContain("IF OBJECT_ID('[sales].[fnCategoryParentID_GetAncestors]', 'IF') IS NOT NULL");
        expect(sql).toContain('CREATE FUNCTION [sales].[fnCategoryParentID_GetAncestors]');
        expect(sql).toContain('@RecordID uniqueidentifier');
        expect(sql).toContain('RETURNS TABLE');

        // Upward traversal recursion
        expect(sql).toContain('[ID] = @RecordID');
        expect(sql).toContain('c.[LevelUp] < 100');
    });

    it('generates hierarchy SELECT column projections', () => {
        const selectCols = provider.generateHierarchyFieldSelect(entity, parentField, 'hier_ParentID');
        expect(selectCols).toBe(
            'hier_ParentID.RootID AS [RootParentID],\n' +
            '    hier_ParentID.Depth AS [ParentIDDepth],\n' +
            '    hier_ParentID.Path AS [ParentIDPath],\n' +
            '    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],\n' +
            '    hier_ParentID.ChildCount AS [ParentIDChildCount]'
        );
    });

    it('generates hierarchy OUTER APPLY join clause', () => {
        const joinClause = provider.generateHierarchyFieldJoin(entity, parentField, 'hier_ParentID');
        expect(joinClause).toBe(
            'OUTER APPLY\n' +
            '    [sales].[fnCategoryParentID_GetHierarchyMeta]([c].[ID], [c].[ParentID]) AS hier_ParentID'
        );
    });

    it('throws descriptive error when entity has composite primary keys', () => {
        const compositePKEntity = createHierarchyEntity({
            EntityFields: [
                {
                    ID: 'pk-1',
                    Name: 'TenantID',
                    Type: 'uniqueidentifier',
                    Length: 16,
                    IsPrimaryKey: true,
                    AllowsNull: false,
                },
                {
                    ID: 'pk-2',
                    Name: 'ID',
                    Type: 'uniqueidentifier',
                    Length: 16,
                    IsPrimaryKey: true,
                    AllowsNull: false,
                },
                {
                    ID: 'fk-parent',
                    Name: 'ParentID',
                    Type: 'uniqueidentifier',
                    Length: 16,
                    IsPrimaryKey: false,
                    AllowsNull: true,
                    RelatedEntityID: 'entity-categories',
                    RelatedEntity: 'Categories',
                },
            ],
        });
        const compFkField = compositePKEntity.Fields.find(f => f.Name === 'ParentID')!;

        expect(() => provider.generateHierarchyMetaFunction(compositePKEntity, compFkField)).toThrow(
            /requires a single-column primary key/
        );
        expect(() => provider.generateDescendantsFunction(compositePKEntity, compFkField)).toThrow(
            /requires a single-column primary key/
        );
        expect(() => provider.generateAncestorsFunction(compositePKEntity, compFkField)).toThrow(
            /requires a single-column primary key/
        );
        expect(() => provider.generateRootIDFunction(compositePKEntity, compFkField)).toThrow(
            /requires a single-column primary key/
        );
    });
});

