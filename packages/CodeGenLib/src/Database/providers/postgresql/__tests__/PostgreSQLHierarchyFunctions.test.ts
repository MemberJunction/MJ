import { describe, it, expect } from 'vitest';
import { FitPGIdentifier, PostgreSQLCodeGenProvider } from '../PostgreSQLCodeGenProvider';
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


describe('PostgreSQLCodeGenProvider — hierarchy function names fit 63 characters (#5541)', () => {
    const provider = new PostgreSQLCodeGenProvider();

    function longEntity() {
        const e = createHierarchyEntity({ BaseTable: 'AccountingCompanyProfile', BaseTableCodeName: 'AccountingCompanyProfile' });
        const parent = e.Fields.find(f => f.Name === 'ParentID')!;
        // Rename the hierarchy field to the reported one.
        Object.defineProperty(parent, 'Name', { value: 'ParentAccountingCompanyID' });
        return { e, parent };
    }

    function namesFor(e: EntityInfo, f: EntityInfo['Fields'][number]): string[] {
        return [
            provider.getHierarchyMetaFunctionName(e, f),
            provider.getDescendantsFunctionName(e, f),
            provider.getAncestorsFunctionName(e, f),
            provider.getRootIDFunctionName(e, f),
        ];
    }

    it('gives four distinct names of at most 63 characters, each keeping its suffix', () => {
        const { e, parent } = longEntity();
        const names = namesFor(e, parent);
        expect(new Set(names).size).toBe(4);
        for (const n of names) {
            expect(n.length).toBeLessThanOrEqual(63);
        }
        expect(names[0].endsWith('_get_hierarchy_meta')).toBe(true);
        expect(names[1].endsWith('_get_descendants')).toBe(true);
        expect(names[2].endsWith('_get_ancestors')).toBe(true);
        expect(names[3].endsWith('_get_root_id')).toBe(true);
        expect(names[1]).toMatch(/^fn_accounting_company_profile_parent_[a-z_]*_[0-9a-f]{8}_get_descendants$/);
        // The untruncated forms are longer than 63 and would collide once PostgreSQL truncated them.
        expect('fn_accounting_company_profile_parent_accounting_company_id_get_descendants'.length).toBeGreaterThan(63);
    });

    it('is stable across calls', () => {
        const { e, parent } = longEntity();
        expect(namesFor(e, parent)).toEqual(namesFor(e, parent));
    });

    it('leaves names that already fit unchanged, byte for byte', () => {
        const e = createHierarchyEntity();
        const parent = e.Fields.find(f => f.Name === 'ParentID')!;
        expect(namesFor(e, parent)).toEqual([
            'fn_category_parent_id_get_hierarchy_meta',
            'fn_category_parent_id_get_descendants',
            'fn_category_parent_id_get_ancestors',
            'fn_category_parent_id_get_root_id',
        ]);
    });

    it('uses the fitted names in the lateral joins and the function DDL', () => {
        const { e, parent } = longEntity();
        const [meta, , , root] = namesFor(e, parent);
        expect(provider.generateHierarchyFieldJoin(e, parent, 'hier_P')).toContain(`"sales"."${meta}"(`);
        expect(provider.generateRootFieldJoin(e, parent, 'root_P')).toContain(root);
        expect(provider.generateDescendantsFunction(e, parent)).toContain(`"sales"."${provider.getDescendantsFunctionName(e, parent)}"(`);
    });
});

describe('FitPGIdentifier', () => {
    it('returns the name as is when it fits', () => {
        expect(FitPGIdentifier('fn_a_b', '_get_root_id')).toBe('fn_a_b_get_root_id');
    });

    it('hashes the prefix tail of a name over 63 characters and keeps the suffix', () => {
        const prefix = 'fn_' + 'x'.repeat(60);
        const fitted = FitPGIdentifier(prefix, '_get_descendants');
        expect(fitted).toHaveLength(63);
        expect(fitted).toMatch(/^fn_x+_[0-9a-f]{8}_get_descendants$/);
        expect(FitPGIdentifier(prefix, '_get_ancestors')).not.toBe(fitted.replace('_get_descendants', '_get_ancestors'));
    });
});
