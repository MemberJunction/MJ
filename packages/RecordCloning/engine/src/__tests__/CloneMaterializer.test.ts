import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseEntity,
    EntityInfo,
    EntityFieldInfo,
    IMetadataProvider,
    UserInfo,
    IEntityDataProvider,
} from '@memberjunction/core';
import { CloneMaterializer } from '../CloneMaterializer';
import { ClonePlan } from '@memberjunction/record-cloning-base';
import { GrantedCloneAuthorizations } from './helpers/cloneAuthorizations';

class MockEntity extends BaseEntity {
    protected override CheckPermissions(): boolean {
        return true;
    }
}

describe('CloneMaterializer', () => {
    const mockUser: UserInfo = {
        ID: 'user-1',
        Name: 'Cloning User',
        Email: 'clone@test.com',
    } as UserInfo;

    const parentEntityInfo: Partial<EntityInfo> = {
        ID: 'ent-parent-id',
        Name: 'ParentEntity',
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier' } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar' } as EntityFieldInfo,
        ],
        RelatedEntities: [],
    };

    const childEntityInfo: Partial<EntityInfo> = {
        ID: 'ent-child-id',
        Name: 'ChildEntity',
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier' } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar' } as EntityFieldInfo,
            { Name: 'ParentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier' } as EntityFieldInfo,
            { Name: 'Sequence', PrimaryKey: false, IsPrimaryKey: false, Type: 'int' } as EntityFieldInfo,
        ],
        RelatedEntities: [],
    };

    const mockDataProvider: IEntityDataProvider = {
        CurrentUser: mockUser,
        SupportsEntityTransactions: true,
        IsInTransaction: false,
        GetEntityObject: async <T extends BaseEntity>(entityName: string): Promise<T> => {
            const info = entityName === 'ParentEntity' ? parentEntityInfo : childEntityInfo;
            return new MockEntity(info as EntityInfo, mockDataProvider) as unknown as T;
        },
        Save: async (entity: BaseEntity) => entity.GetAll(),
        Delete: async () => true,
        SetCachedRecordName: () => {},
        GetCachedRecordName: () => undefined,
    } as unknown as IEntityDataProvider;

    const mockMetadataProvider: IMetadataProvider = {
        Authorizations: GrantedCloneAuthorizations(),
        Entities: [parentEntityInfo as EntityInfo, childEntityInfo as EntityInfo],
        EntityByName: (name: string) => {
            if (name === 'ParentEntity') return parentEntityInfo as EntityInfo;
            if (name === 'ChildEntity') return childEntityInfo as EntityInfo;
            return null;
        },
        EntityByID: (id: string) => {
            if (id === 'ent-parent-id') return parentEntityInfo as EntityInfo;
            if (id === 'ent-child-id') return childEntityInfo as EntityInfo;
            return null;
        },
        GetEntityObject: async <T extends BaseEntity>(entityName: string): Promise<T> => {
            return mockDataProvider.GetEntityObject<T>(entityName);
        },
    } as unknown as IMetadataProvider;

    it('materializes root and children using dynamic collections and re-stamps join field (§6.7)', async () => {
        const materializer = new CloneMaterializer(mockMetadataProvider);

        // Source records
        const sourceRoot = new MockEntity(parentEntityInfo as EntityInfo, mockDataProvider);
        sourceRoot.NewRecord();
        sourceRoot.Set('ID', 'source-parent-uuid');
        sourceRoot.Set('Name', 'Original Source Parent');

        const sourceChild = new MockEntity(childEntityInfo as EntityInfo, mockDataProvider);
        sourceChild.NewRecord();
        sourceChild.Set('ID', 'source-child-uuid');
        sourceChild.Set('ParentID', 'source-parent-uuid'); // Points to old parent
        sourceChild.Set('Name', 'Original Child');
        sourceChild.Set('Sequence', 42);

        const loadedSources = new Map<string, BaseEntity>();
        loadedSources.set('source-parent-uuid', sourceRoot);
        loadedSources.set('source-child-uuid', sourceChild);

        const plan: ClonePlan = {
            RootEntityName: 'ParentEntity',
            RootSourceKey: 'source-parent-uuid',
            RootTargetKey: 'target-parent-uuid',
            PlanHash: 'test-hash',
            Blocked: false,
            Warnings: [],
            Nodes: [
                {
                    NodeKey: 'node-root',
                    EntityName: 'ParentEntity',
                    SourceKey: 'source-parent-uuid',
                    TargetKey: 'target-parent-uuid',
                    Action: 'Create',
                    Depth: 0,
                    Blocked: false,
                    Route: 'RootSave',
                    FieldChanges: [
                        { Field: 'Name', Kind: 'Rename', OldValue: 'Original Source Parent', NewValue: 'Cloned Parent' },
                    ],
                },
                {
                    NodeKey: 'node-child',
                    EntityName: 'ChildEntity',
                    SourceKey: 'source-child-uuid',
                    TargetKey: 'target-child-uuid',
                    Action: 'Create',
                    Depth: 1,
                    Blocked: false,
                    Route: 'Collection',
                    FieldChanges: [
                        { Field: 'Name', Kind: 'Copy', OldValue: 'Original Child', NewValue: 'Original Child' },
                        { Field: 'Sequence', Kind: 'Copy', OldValue: 42, NewValue: 42 },
                    ],
                },
            ],
            Edges: [
                {
                    FromKey: 'node-root',
                    ToKey: 'node-child',
                    JoinField: 'ParentID',
                    Policy: 'Deep',
                },
            ],
            Excluded: [],
        };

        const result = await materializer.Materialize(plan, mockUser, loadedSources);

        // 1. Root verification
        expect(result.RootEntity).toBeDefined();
        expect(result.RootEntity.Get('ID')).toBe('target-parent-uuid');
        expect(result.RootEntity.Get('Name')).toBe('Cloned Parent');

        // 2. Dynamic Collection declaration
        expect(result.RootEntity.HasCompanions).toBe(true);

        // 3. Child verification & §6.7 Join Field Re-stamp
        const stagedChild = result.StagedEntities.get('node-child');
        expect(stagedChild).toBeDefined();
        expect(stagedChild?.Get('ID')).toBe('target-child-uuid');
        expect(stagedChild?.Get('Name')).toBe('Original Child');
        expect(stagedChild?.Get('Sequence')).toBe(42);

        // CRITICAL CHECK: child's ParentID points to target parent, NOT old source parent!
        expect(stagedChild?.Get('ParentID')).toBe('target-parent-uuid');
        expect(stagedChild?.Get('ParentID')).not.toBe('source-parent-uuid');
    });

    it('writes every column of a composite target key onto a junction row', async () => {
        const junctionInfo = {
            ID: 'ent-junction-id',
            Name: 'ParentTags',
            PrimaryKeys: [{ Name: 'ParentID' } as EntityFieldInfo, { Name: 'TagID' } as EntityFieldInfo],
            FirstPrimaryKey: { Name: 'ParentID' } as EntityFieldInfo,
            Fields: [
                { Name: 'ParentID', IsPrimaryKey: true, Type: 'uniqueidentifier', RelatedEntity: 'ParentEntity' } as unknown as EntityFieldInfo,
                { Name: 'TagID', IsPrimaryKey: true, Type: 'uniqueidentifier', RelatedEntity: 'Tags' } as unknown as EntityFieldInfo,
                { Name: 'Note', IsPrimaryKey: false, Type: 'nvarchar' } as EntityFieldInfo,
            ],
            RelatedEntities: [],
        } as unknown as EntityInfo;
        const dataProvider = {
            ...mockDataProvider,
            GetEntityObject: async <T extends BaseEntity>(name: string): Promise<T> =>
                new MockEntity((name === 'ParentTags' ? junctionInfo : parentEntityInfo) as EntityInfo, dataProvider) as unknown as T,
        } as unknown as IEntityDataProvider;
        const provider = {
            ...mockMetadataProvider,
            Entities: [parentEntityInfo as EntityInfo, junctionInfo],
            EntityByName: (n: string) => (n === 'ParentTags' ? junctionInfo : n === 'ParentEntity' ? (parentEntityInfo as EntityInfo) : null),
            GetEntityObject: async <T extends BaseEntity>(n: string): Promise<T> => dataProvider.GetEntityObject<T>(n),
        } as unknown as IMetadataProvider;

        const sourceRoot = new MockEntity(parentEntityInfo as EntityInfo, dataProvider);
        sourceRoot.NewRecord();
        sourceRoot.Set('ID', 'p-1');
        const sourceTag = new MockEntity(junctionInfo, dataProvider);
        sourceTag.NewRecord();
        sourceTag.Set('ParentID', 'p-1');
        sourceTag.Set('TagID', 't-9');
        sourceTag.Set('Note', 'keep me');
        const loaded = new Map<string, BaseEntity>([['p-1', sourceRoot], ['ParentID|p-1||TagID|t-9', sourceTag]]);

        const plan = {
            RootEntityName: 'ParentEntity', RootSourceKey: 'p-1', RootTargetKey: 'p-new', PlanHash: 'h', Blocked: false, Warnings: [],
            Nodes: [
                { NodeKey: 'root', EntityName: 'ParentEntity', SourceKey: 'ID|p-1', TargetKey: 'p-new', Action: 'Create', Depth: 0, Route: 'RootSave', FieldChanges: [] },
                { NodeKey: 'tag', EntityName: 'ParentTags', SourceKey: 'ParentID|p-1||TagID|t-9', TargetKey: 'ParentID|p-new||TagID|t-9', Action: 'Create', Depth: 1, Route: 'Collection', FieldChanges: [] },
            ],
            Edges: [{ FromKey: 'root', ToKey: 'tag', JoinField: 'ParentID', Policy: 'Deep' }],
            Excluded: [],
        } as unknown as ClonePlan;

        const result = await new CloneMaterializer(provider).Materialize(plan, mockUser, loaded);
        const tag = result.StagedEntities.get('tag')!;

        expect(result.RootEntity.Get('ID')).toBe('p-new');
        expect(tag.Get('ParentID')).toBe('p-new');
        expect(tag.Get('TagID')).toBe('t-9');
        expect(tag.Get('Note')).toBe('keep me');
    });

    it("stamps a soft-link child's RecordID with the parent's record-id string", async () => {
        const noteInfo = {
            ID: 'ent-note-id',
            Name: 'Notes',
            PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
            FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
            Fields: [
                { Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' } as EntityFieldInfo,
                { Name: 'RecordID', IsPrimaryKey: false, Type: 'nvarchar' } as EntityFieldInfo,
            ],
            RelatedEntities: [],
        } as unknown as EntityInfo;
        const dataProvider = {
            ...mockDataProvider,
            GetEntityObject: async <T extends BaseEntity>(name: string): Promise<T> =>
                new MockEntity((name === 'Notes' ? noteInfo : parentEntityInfo) as EntityInfo, dataProvider) as unknown as T,
        } as unknown as IEntityDataProvider;
        const provider = {
            ...mockMetadataProvider,
            EntityByName: (n: string) => (n === 'Notes' ? noteInfo : n === 'ParentEntity' ? (parentEntityInfo as EntityInfo) : null),
            GetEntityObject: async <T extends BaseEntity>(n: string): Promise<T> => dataProvider.GetEntityObject<T>(n),
        } as unknown as IMetadataProvider;
        const sourceRoot = new MockEntity(parentEntityInfo as EntityInfo, dataProvider);
        sourceRoot.NewRecord();
        sourceRoot.Set('ID', 'p-1');
        const sourceNote = new MockEntity(noteInfo, dataProvider);
        sourceNote.NewRecord();
        sourceNote.Set('ID', 'n-1');
        sourceNote.Set('RecordID', 'p-1');
        const plan = {
            RootEntityName: 'ParentEntity', RootSourceKey: 'p-1', RootTargetKey: 'p-new', PlanHash: 'h', Blocked: false, Warnings: [],
            Nodes: [
                { NodeKey: 'root', EntityName: 'ParentEntity', SourceKey: 'ID|p-1', TargetKey: 'p-new', Action: 'Create', Depth: 0, Route: 'RootSave', FieldChanges: [] },
                { NodeKey: 'note', EntityName: 'Notes', SourceKey: 'ID|n-1', TargetKey: 'n-new', Action: 'Create', Depth: 1, Route: 'Sidecar', FieldChanges: [] },
            ],
            Edges: [{ FromKey: 'root', ToKey: 'note', JoinField: 'RecordID', Policy: 'Deep', Kind: 'SoftLink' }],
            Excluded: [],
        } as unknown as ClonePlan;

        const result = await new CloneMaterializer(provider).Materialize(plan, mockUser, new Map([['p-1', sourceRoot], ['n-1', sourceNote]]));
        expect(result.StagedEntities.get('note')!.Get('RecordID')).toBe('p-new');
    });

    it('falls back to sidecar entities when collection dynamic declaration fails', async () => {
        const materializer = new CloneMaterializer(mockMetadataProvider);

        const sourceRoot = new MockEntity(parentEntityInfo as EntityInfo, mockDataProvider);
        sourceRoot.NewRecord();
        sourceRoot.Set('ID', 'source-p');

        const sourceChild = new MockEntity(childEntityInfo as EntityInfo, mockDataProvider);
        sourceChild.NewRecord();
        sourceChild.Set('ID', 'source-c');
        sourceChild.Set('ParentID', 'source-p');

        const loadedSources = new Map<string, BaseEntity>();
        loadedSources.set('source-p', sourceRoot);
        loadedSources.set('source-c', sourceChild);

        // Spy on DeclareRelatedRecordsDynamic to throw
        vi.spyOn(sourceRoot, 'DeclareRelatedRecordsDynamic').mockImplementation(() => {
            throw new Error('Dynamic collections unsupported');
        });

        // Also mock new root instance's DeclareRelatedRecordsDynamic
        const origGetEntityObject = mockMetadataProvider.GetEntityObject;
        vi.spyOn(mockMetadataProvider, 'GetEntityObject').mockImplementation(async (entityName: string) => {
            const ent = await origGetEntityObject(entityName);
            if (entityName === 'ParentEntity') {
                vi.spyOn(ent, 'DeclareRelatedRecordsDynamic').mockImplementation(() => {
                    throw new Error('Dynamic collections unsupported');
                });
            }
            return ent;
        });

        const plan: ClonePlan = {
            RootEntityName: 'ParentEntity',
            RootSourceKey: 'source-p',
            RootTargetKey: 'target-p',
            PlanHash: 'test-hash-2',
            Blocked: false,
            Warnings: [],
            Nodes: [
                {
                    NodeKey: 'n-root',
                    EntityName: 'ParentEntity',
                    SourceKey: 'source-p',
                    TargetKey: 'target-p',
                    Action: 'Create',
                    Depth: 0,
                    Blocked: false,
                    Route: 'RootSave',
                    FieldChanges: [],
                },
                {
                    NodeKey: 'n-child',
                    EntityName: 'ChildEntity',
                    SourceKey: 'source-c',
                    TargetKey: 'target-c',
                    Action: 'Create',
                    Depth: 1,
                    Blocked: false,
                    Route: 'Collection',
                    FieldChanges: [],
                },
            ],
            Edges: [
                {
                    FromKey: 'n-root',
                    ToKey: 'n-child',
                    JoinField: 'ParentID',
                    Policy: 'Deep',
                },
            ],
            Excluded: [],
        };

        const result = await materializer.Materialize(plan, mockUser, loadedSources);

        expect(result.SidecarEntities.length).toBe(1);
        expect(result.SidecarEntities[0].Get('ID')).toBe('target-c');
        expect(result.SidecarEntities[0].Get('ParentID')).toBe('target-p');
    });
});
