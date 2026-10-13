import { describe, it, expect } from 'vitest';
import { PostgreSQLCodeGenProvider } from '../PostgreSQLCodeGenProvider';
import { EntityInfo } from '@memberjunction/core';

function createHierarchyEntity(overrides: Record<string, unknown> = {}): EntityInfo {
    const fields = [
        {
            ID: 'pk-1',
            Name: 'ID',
            Type: 'uuid',
            Length: 16,
            IsPrimaryKey: true,
            AllowsNull: false,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
        },
        {
            ID: 'fk-parent',
            Name: 'ParentID',
            Type: 'uuid',
            Length: 16,
            IsPrimaryKey: false,
            AllowsNull: true,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            RelatedEntityID: 'entity-categories',
            RelatedEntity: 'Categories',
            Configuration: '{"Hierarchy":{"IsHierarchy":true}}',
        },
        {
            ID: 'f-name',
            Name: 'Name',
            Type: 'varchar',
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

describe('PostgreSQLCodeGenProvider — Hierarchy Functions suite', () => {
    const provider = new PostgreSQLCodeGenProvider();
    const entity = createHierarchyEntity();
    const parentField = entity.Fields.find(f => f.Name === 'ParentID')!;

    it('generates PostgreSQL hierarchy metadata function (fn_category_parent_id_get_hierarchy_meta)', () => {
        const sql = provider.generateHierarchyMetaFunction(entity, parentField);

        expect(sql).toContain('CREATE OR REPLACE FUNCTION "sales"."fn_category_parent_id_get_hierarchy_meta"(');
        expect(sql).toContain('p_record_id uuid,');
        expect(sql).toContain('p_parent_id uuid');
        expect(sql).toContain('RETURNS TABLE (');
        expect(sql).toContain('"RootID" uuid,');
        expect(sql).toContain('"Depth" INTEGER,');
        expect(sql).toContain('"Path" TEXT,');
        expect(sql).toContain('"IsLeaf" BOOLEAN,');
        expect(sql).toContain('"ChildCount" INTEGER');
        expect(sql).toContain('$$ LANGUAGE sql STABLE;');

        // Short circuit / recursion
        expect(sql).toContain('WITH RECURSIVE cte_ancestors AS');
        expect(sql).toContain('c.depth < 100');
        expect(sql).toContain('LIMIT 1;');
    });

    it('generates PostgreSQL descendants function (fn_category_parent_id_get_descendants)', () => {
        const sql = provider.generateDescendantsFunction(entity, parentField);

        expect(sql).toContain('CREATE OR REPLACE FUNCTION "sales"."fn_category_parent_id_get_descendants"(');
        expect(sql).toContain('p_root_id uuid,');
        expect(sql).toContain('p_max_depth INTEGER DEFAULT NULL');
        expect(sql).toContain('RETURNS TABLE (');
        expect(sql).toContain('$$ LANGUAGE sql STABLE;');

        // Subtree CTE
        expect(sql).toContain('WITH RECURSIVE cte_descendants AS');
        expect(sql).toContain('"ID" = p_root_id');
        expect(sql).toContain('p.relative_depth < 100');
    });

    it('generates PostgreSQL ancestors function (fn_category_parent_id_get_ancestors)', () => {
        const sql = provider.generateAncestorsFunction(entity, parentField);

        expect(sql).toContain('CREATE OR REPLACE FUNCTION "sales"."fn_category_parent_id_get_ancestors"(');
        expect(sql).toContain('p_record_id uuid');
        expect(sql).toContain('RETURNS TABLE (');
        expect(sql).toContain('"LevelUp" INTEGER,');
        expect(sql).toContain('$$ LANGUAGE sql STABLE;');

        // Upward CTE
        expect(sql).toContain('WITH RECURSIVE cte_ancestors AS');
        expect(sql).toContain('"ID" = p_record_id');
        expect(sql).toContain('c.level_up < 100');
    });

    it('generates PostgreSQL hierarchy SELECT projections', () => {
        const selectCols = provider.generateHierarchyFieldSelect(entity, parentField, 'hier_ParentID');
        expect(selectCols).toBe(
            'hier_ParentID."RootID" AS "RootParentID",\n' +
            '    hier_ParentID."Depth" AS "ParentIDDepth",\n' +
            '    hier_ParentID."Path" AS "ParentIDPath",\n' +
            '    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",\n' +
            '    hier_ParentID."ChildCount" AS "ParentIDChildCount"'
        );
    });

    it('generates PostgreSQL hierarchy LEFT JOIN LATERAL clause', () => {
        const joinClause = provider.generateHierarchyFieldJoin(entity, parentField, 'hier_ParentID');
        expect(joinClause).toBe(
            'LEFT JOIN LATERAL "sales"."fn_category_parent_id_get_hierarchy_meta"(c."ID", c."ParentID") AS hier_ParentID ON true'
        );
    });

    it('throws descriptive error when entity has composite primary keys', () => {
        const compositePKEntity = createHierarchyEntity({
            EntityFields: [
                {
                    ID: 'pk-1',
                    Name: 'TenantID',
                    Type: 'uuid',
                    Length: 16,
                    IsPrimaryKey: true,
                    AllowsNull: false,
                },
                {
                    ID: 'pk-2',
                    Name: 'ID',
                    Type: 'uuid',
                    Length: 16,
                    IsPrimaryKey: true,
                    AllowsNull: false,
                },
                {
                    ID: 'fk-parent',
                    Name: 'ParentID',
                    Type: 'uuid',
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

