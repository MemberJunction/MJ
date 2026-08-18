import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';

function createEntityWithRecursiveFK(fkFieldName: string = 'ParentID'): EntityInfo {
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
        },
        {
            ID: 'fk-rec',
            Name: fkFieldName,
            Type: 'uniqueidentifier',
            Length: 16,
            IsPrimaryKey: false,
            AllowsNull: true,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            RelatedEntityID: 'entity-test',
            RelatedEntity: 'TestHierarchy',
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

    return new EntityInfo({
        ID: 'entity-test',
        Name: 'TestHierarchy',
        SchemaName: '__mj',
        BaseTable: 'TestHierarchy',
        BaseTableCodeName: 'TestHierarchy',
        BaseView: 'vwTestHierarchies',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EntityFields: fields,
        EntityPermissions: [],
    });
}

describe('EntitySubClassGeneratorBase — Hierarchy Traversal Methods', () => {
    it('generates GetDescendants, GetAncestors, and GetChildren for entity with ParentID recursive FK', () => {
        const entity = createEntityWithRecursiveFK('ParentID');
        const code = EntitySubClassGeneratorBase.GenerateHierarchyMethods(entity, 'TestHierarchyEntity');

        expect(code).toContain('public async GetDescendants(maxDepth?: number): Promise<TestHierarchyEntity[]>');
        expect(code).toContain("EntityName: 'TestHierarchy'");
        expect(code).toContain("RootParentID = '${rootId}'");
        expect(code).toContain("ParentIDDepth <= ${maxDepth}");
        expect(code).toContain("OrderBy: 'ParentIDDepth ASC'");

        expect(code).toContain('public async GetAncestors(): Promise<TestHierarchyEntity[]>');
        expect(code).toContain("this.Get('ParentIDPath')");
        expect(code).toContain("ExtraFilter: `ID IN (${idList})`");

        expect(code).toContain('public async GetChildren(): Promise<TestHierarchyEntity[]>');
        expect(code).toContain("ExtraFilter: `ParentID = '${currentId}'`");
    });

    it('generates empty string for entities without recursive FKs', () => {
        const entity = new EntityInfo({
            ID: 'entity-plain',
            Name: 'PlainEntity',
            SchemaName: '__mj',
            BaseTable: 'PlainEntity',
            BaseTableCodeName: 'PlainEntity',
            BaseView: 'vwPlainEntities',
            EntityFields: [
                {
                    ID: 'pk-1',
                    Name: 'ID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: true,
                    AllowsNull: false,
                },
            ],
            EntityPermissions: [],
        });

        const code = EntitySubClassGeneratorBase.GenerateHierarchyMethods(entity, 'PlainEntityEntity');
        expect(code).toBe('');
    });
});
