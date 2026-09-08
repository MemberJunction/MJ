import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';

function createEntityWithRecursiveFK(fkFieldName: string = 'ParentID', isHierarchy: boolean = true, extraFields: Array<Record<string, unknown>> = []): EntityInfo {
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
            Configuration: isHierarchy ? '{"Hierarchy":{"IsHierarchy":true}}' : null,
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
        ...extraFields,
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
    it('generates named GetManagerDescendants, GetManagerAncestors, and GetManagerChildren for secondary recursive FK when multiple exist', () => {
        const entity = createEntityWithRecursiveFK('ParentID', true, [
            {
                ID: 'fk-rec-2',
                Name: 'ManagerID',
                Type: 'uniqueidentifier',
                Length: 16,
                IsPrimaryKey: false,
                AllowsNull: true,
                AllowUpdateAPI: true,
                IsVirtual: false,
                AutoIncrement: false,
                RelatedEntityID: 'entity-test',
                RelatedEntity: 'TestHierarchy',
                Configuration: '{"Hierarchy":{"IsHierarchy":true}}',
            },
        ]);

        const code = EntitySubClassGeneratorBase.GenerateHierarchyMethods(entity, 'TestHierarchyEntity');

        expect(code).toContain('public async GetManagerIDDescendants<T extends BaseEntity = this>(maxDepth?: number): Promise<T[]>');
        expect(code).toContain("parentFieldName: 'ManagerID'");
        expect(code).toContain('public async GetManagerIDAncestors<T extends BaseEntity = this>(): Promise<T[]>');
        expect(code).toContain("this.GetAncestors<T>('ManagerID')");
        expect(code).toContain('public async GetManagerIDChildren<T extends BaseEntity = this>(): Promise<T[]>');
        expect(code).toContain("this.GetChildren<T>('ManagerID')");
    });

    it('defers primary ParentID hierarchy methods to BaseEntity to avoid subclass shadowing and ensure this typing', () => {
        const entity = createEntityWithRecursiveFK('ParentID', true);
        const code = EntitySubClassGeneratorBase.GenerateHierarchyMethods(entity, 'TestHierarchyEntity');
        expect(code).toBe('');
    });

    it('skips generating hierarchy methods for self-referencing FKs that lack IsHierarchy=true (e.g. LastRunID)', () => {
        const entity = createEntityWithRecursiveFK('LastRunID', false);
        const code = EntitySubClassGeneratorBase.GenerateHierarchyMethods(entity, 'TestHierarchyEntity');
        expect(code).toBe('');
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

    it('skips generating hierarchy methods when entity has composite primary keys', () => {
        const compositeEntity = new EntityInfo({
            ID: 'entity-composite',
            Name: 'CompositeHierarchy',
            SchemaName: '__mj',
            BaseTable: 'CompositeHierarchy',
            BaseTableCodeName: 'CompositeHierarchy',
            BaseView: 'vwCompositeHierarchies',
            EntityFields: [
                {
                    ID: 'pk-1',
                    Name: 'TenantID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: true,
                    AllowsNull: false,
                },
                {
                    ID: 'pk-2',
                    Name: 'ID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: true,
                    AllowsNull: false,
                },
                {
                    ID: 'fk-rec',
                    Name: 'ParentID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: false,
                    AllowsNull: true,
                    RelatedEntityID: 'entity-composite',
                    RelatedEntity: 'CompositeHierarchy',
                    Configuration: '{"Hierarchy":{"IsHierarchy":true}}',
                },
            ],
            EntityPermissions: [],
        });

        const code = EntitySubClassGeneratorBase.GenerateHierarchyMethods(compositeEntity, 'CompositeHierarchyEntity');
        expect(code).toBe('');
    });
});


