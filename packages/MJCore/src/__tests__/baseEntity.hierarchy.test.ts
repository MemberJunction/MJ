import { describe, it, expect, vi, afterEach } from 'vitest';
import * as logging from '../generic/logging';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import type { IEntityDataProvider } from '../generic/interfaces';

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
                Configuration: '{"Hierarchy":{"IsHierarchy":true}}',
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

    it('returns null and logs error when entity has composite primary keys', async () => {
        const compositeEntityInfo = new EntityInfo({
            ID: '22222222-2222-2222-2222-222222222222',
            Name: 'Composite Entity',
            BaseTable: 'CompositeEntity',
            BaseView: 'vwCompositeEntities',
            Status: 'Active',
            Fields: [
                {
                    ID: 'f1',
                    Name: 'TenantID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: true,
                    AllowsNull: false,
                    Status: 'Active',
                },
                {
                    ID: 'f2',
                    Name: 'ID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: true,
                    AllowsNull: false,
                    Status: 'Active',
                },
                {
                    ID: 'f3',
                    Name: 'ParentID',
                    Type: 'uniqueidentifier',
                    AllowsNull: true,
                    RelatedEntityID: '22222222-2222-2222-2222-222222222222',
                    RelatedEntity: 'Composite Entity',
                    Status: 'Active',
                },
            ],
        });

        const entity = new MockCategoryEntity(compositeEntityInfo);
        const field = (entity as unknown as { getRecursiveForeignKeyField: (name?: string) => unknown }).getRecursiveForeignKeyField();
        expect(field).toBeNull();

        const descendants = await entity.GetDescendants();
        expect(descendants).toEqual([]);

        const ancestors = await entity.GetAncestors();
        expect(ancestors).toEqual([]);

        const children = await entity.GetChildren();
        expect(children).toEqual([]);
    });

    describe('failed reads are not "no rows" (#3982)', () => {
        type ResolveFn = (name?: string, requireHierarchyColumns?: boolean) => { Name: string } | null;
        const SELF_ID = '33333333-3333-3333-3333-333333333333';
        const RECORD_ID = '44444444-4444-4444-4444-444444444444';

        afterEach(() => {
            vi.restoreAllMocks();
        });

        /** A self-referencing `ParentID` with no `IsHierarchy` flag; hierarchy columns only when asked. */
        function makeInfo(withHierarchyColumns: boolean): EntityInfo {
            const fields: Record<string, unknown>[] = [
                { ID: 'h1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
                { ID: 'h2', Name: 'ParentID', Type: 'uniqueidentifier', AllowsNull: true, RelatedEntityID: SELF_ID, RelatedEntity: 'Plain Tree', Status: 'Active' },
            ];
            if (withHierarchyColumns) {
                fields.push(
                    { ID: 'h3', Name: 'RootParentID', Type: 'uniqueidentifier', AllowsNull: true, Status: 'Active' },
                    { ID: 'h4', Name: 'ParentIDDepth', Type: 'int', AllowsNull: true, Status: 'Active' },
                    { ID: 'h5', Name: 'ParentIDPath', Type: 'nvarchar', AllowsNull: true, Status: 'Active' },
                );
            }
            return new EntityInfo({ ID: SELF_ID, Name: 'Plain Tree', BaseTable: 'PlainTree', BaseView: 'vwPlainTrees', Status: 'Active', Fields: fields });
        }

        function makeProvider(success: boolean) {
            const runView = vi.fn(async (_params: { ExtraFilter?: string }) => ({
                Success: success,
                Results: [],
                ErrorMessage: success ? '' : 'Invalid column name',
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0,
                UserViewRunID: '',
            }));
            return { runView, provider: { RunView: runView } as unknown as IEntityDataProvider };
        }

        it('does not resolve a ParentID / recursive-FK fallback when the entity lacks Root<Field> and <Field>Depth', async () => {
            const { runView, provider } = makeProvider(true);
            const logSpy = vi.spyOn(logging, 'LogError').mockImplementation(() => undefined);
            const entity = new MockCategoryEntity(makeInfo(false), provider);
            entity.Set('ID', RECORD_ID);
            entity.Set('ParentIDPath', `${RECORD_ID}/`);

            const resolve = (entity as unknown as { getRecursiveForeignKeyField: ResolveFn }).getRecursiveForeignKeyField.bind(entity);
            expect(resolve(undefined, true)).toBeNull();
            expect(resolve()?.Name).toBe('ParentID');

            expect(await entity.GetDescendants()).toEqual([]);
            expect(await entity.GetAncestors()).toEqual([]);
            expect(runView).not.toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('GetDescendants(): No recursive foreign key field with hierarchy columns'));
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('GetAncestors(): No recursive foreign key field with hierarchy columns'));
        });

        it('GetChildren still uses the ParentID fallback, which needs no hierarchy columns', async () => {
            const { runView, provider } = makeProvider(true);
            const entity = new MockCategoryEntity(makeInfo(false), provider);
            entity.Set('ID', RECORD_ID);

            expect(await entity.GetChildren()).toEqual([]);
            expect(runView).toHaveBeenCalledTimes(1);
            expect(runView.mock.calls[0][0]).toEqual(expect.objectContaining({ ExtraFilter: `ParentID = '${RECORD_ID}'` }));
        });

        it('resolves the fallback when the hierarchy columns exist', () => {
            const entity = new MockCategoryEntity(makeInfo(true));
            const resolve = (entity as unknown as { getRecursiveForeignKeyField: ResolveFn }).getRecursiveForeignKeyField.bind(entity);
            expect(resolve(undefined, true)?.Name).toBe('ParentID');
        });

        it('logs a failed RunView in GetDescendants, GetAncestors and GetChildren with the entity and filter', async () => {
            const { runView, provider } = makeProvider(false);
            const logSpy = vi.spyOn(logging, 'LogError').mockImplementation(() => undefined);
            const entity = new MockCategoryEntity(makeInfo(true), provider);
            entity.Set('ID', RECORD_ID);
            entity.Set('ParentIDPath', `${SELF_ID}/${RECORD_ID}`);

            expect(await entity.GetDescendants()).toEqual([]);
            expect(await entity.GetAncestors()).toEqual([]);
            expect(await entity.GetChildren()).toEqual([]);
            expect(runView).toHaveBeenCalledTimes(3);

            const messages = logSpy.mock.calls.map(c => String(c[0]));
            expect(messages).toContainEqual(expect.stringMatching(/GetDescendants\(\): query failed on entity Plain Tree \(filter: RootParentID = '4444.*Invalid column name/));
            expect(messages).toContainEqual(expect.stringMatching(/GetAncestors\(\): query failed on entity Plain Tree \(filter: ID IN \('3333/));
            expect(messages).toContainEqual(expect.stringMatching(/GetChildren\(\): query failed on entity Plain Tree \(filter: ParentID = '4444/));
        });
    });
});
