import { describe, it, expect } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';

describe('BaseEntity hierarchy traversal methods', () => {
    class MockCategoryEntity extends BaseEntity {
        // Concrete test subclass
    }

    const entityInfo = new EntityInfo({
        ID: '11111111-2222-3333-4444-555555555555',
        Name: 'Test Categories',
        BaseTable: 'TestCategory',
        BaseView: 'vwTestCategories',
        Status: 'Active',
        Fields: [
            {
                ID: 'f1',
                Name: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                AllowsNull: false,
                Status: 'Active',
            },
            {
                ID: 'f2',
                Name: 'Name',
                Type: 'nvarchar',
                AllowsNull: false,
                Status: 'Active',
            },
            {
                ID: 'f3',
                Name: 'ParentID',
                Type: 'uniqueidentifier',
                AllowsNull: true,
                RelatedEntityID: '11111111-2222-3333-4444-555555555555',
                RelatedEntity: 'Test Categories',
                Status: 'Active',
            },
            {
                ID: 'f4',
                Name: 'RootParentID',
                Type: 'uniqueidentifier',
                AllowsNull: true,
                Status: 'Active',
            },
            {
                ID: 'f5',
                Name: 'ParentIDDepth',
                Type: 'int',
                AllowsNull: true,
                Status: 'Active',
            },
            {
                ID: 'f6',
                Name: 'ParentIDPath',
                Type: 'nvarchar',
                AllowsNull: true,
                Status: 'Active',
            },
            {
                ID: 'f7',
                Name: 'ParentIDIsLeaf',
                Type: 'bit',
                AllowsNull: true,
                Status: 'Active',
            },
            {
                ID: 'f8',
                Name: 'ParentIDChildCount',
                Type: 'int',
                AllowsNull: true,
                Status: 'Active',
            },
        ],
    });

    it('getRecursiveForeignKeyField finds ParentID field by default', () => {
        const entity = new MockCategoryEntity(entityInfo);

        const field = (entity as unknown as { getRecursiveForeignKeyField: (name?: string) => unknown }).getRecursiveForeignKeyField();
        expect(field).toBeDefined();
        expect((field as { Name: string }).Name).toBe('ParentID');
    });

    it('getRecursiveForeignKeyField resolves explicit field name case-insensitively', () => {
        const entity = new MockCategoryEntity(entityInfo);

        const field = (entity as unknown as { getRecursiveForeignKeyField: (name?: string) => unknown }).getRecursiveForeignKeyField('parentid');
        expect(field).toBeDefined();
        expect((field as { Name: string }).Name).toBe('ParentID');
    });

    it('returns empty array when record ID is missing for GetDescendants', async () => {
        const entity = new MockCategoryEntity(entityInfo);

        const descendants = await entity.GetDescendants();
        expect(descendants).toEqual([]);
    });

    it('returns empty array when ParentIDPath is missing for GetAncestors', async () => {
        const entity = new MockCategoryEntity(entityInfo);
        entity.Set('ID', '11111111-1111-1111-1111-111111111111');

        const ancestors = await entity.GetAncestors();
        expect(ancestors).toEqual([]);
    });
});
