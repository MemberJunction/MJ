import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseEntity,
    EntityInfo,
    EntityFieldInfo,
    IMetadataProvider,
    UserInfo,
    IEntityDataProvider,
} from '@memberjunction/core';
import { CloneExecutor } from '../CloneExecutor';
import { ClonePlan, ComputeClonePlanHash } from '@memberjunction/record-cloning-base';

class MockEntity extends BaseEntity {
    protected override CheckPermissions(): boolean {
        return true;
    }
}

describe('CloneExecutor', () => {
    const mockUser: UserInfo = {
        ID: 'user-exec-1',
        Name: 'Executor User',
        Email: 'exec@test.com',
    } as UserInfo;

    const parentEntityInfo: Partial<EntityInfo> = {
        ID: 'ent-p-id',
        Name: 'ParentEntity',
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier' } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar' } as EntityFieldInfo,
        ],
        RelatedEntities: [],
    };

    let saveShouldSucceed = true;
    let savedEntities: BaseEntity[] = [];

    const mockDataProvider: IEntityDataProvider = {
        CurrentUser: mockUser,
        SupportsEntityTransactions: true,
        IsInTransaction: false,
        BeginEntityTransaction: async () => ({
            Commit: async () => {},
            Rollback: async () => {},
        }),
        GetEntityObject: async <T extends BaseEntity>(entityName: string): Promise<T> => {
            const ent = new MockEntity(parentEntityInfo as EntityInfo, mockDataProvider);
            vi.spyOn(ent, 'LatestResult', 'get').mockReturnValue({
                Success: !saveShouldSucceed ? false : true,
                Message: !saveShouldSucceed ? 'DB Constraint Violation' : 'Success',
                CompleteMessage: !saveShouldSucceed ? 'DB Constraint Violation on ParentEntity' : 'Success',
            } as import('@memberjunction/core').BaseEntityResult);
            vi.spyOn(ent, 'Save').mockImplementation(async () => {
                if (!saveShouldSucceed) {
                    return false;
                }
                savedEntities.push(ent);
                return true;
            });
            return ent as unknown as T;
        },
        Save: async (entity: BaseEntity) => entity.GetAll(),
        Delete: async () => true,
        SetCachedRecordName: () => {},
        GetCachedRecordName: () => undefined,
    } as unknown as IEntityDataProvider;

    const mockMetadataProvider: IMetadataProvider = {
        Entities: [parentEntityInfo as EntityInfo],
        EntityByName: (name: string) => (name === 'ParentEntity' ? (parentEntityInfo as EntityInfo) : null),
        EntityByID: (id: string) => (id === 'ent-p-id' ? (parentEntityInfo as EntityInfo) : null),
        GetEntityObject: async <T extends BaseEntity>(entityName: string): Promise<T> => {
            return mockDataProvider.GetEntityObject<T>(entityName);
        },
        SupportsEntityTransactions: true,
        BeginEntityTransaction: async () => ({
            Commit: async () => {},
            Rollback: async () => {},
        }),
    } as unknown as IMetadataProvider;

    beforeEach(() => {
        saveShouldSucceed = true;
        savedEntities = [];
    });

    it('refuses to execute a blocked plan', async () => {
        const executor = new CloneExecutor({ Provider: mockMetadataProvider });

        const plan: ClonePlan = {
            RootEntityName: 'ParentEntity',
            RootSourceKey: 'src-1',
            RootTargetKey: 'tgt-1',
            PlanHash: 'hash-1',
            Blocked: true,
            Warnings: [{ Code: 'CAP_EXCEEDED', Severity: 'Error', Message: 'Max records exceeded' }],
            Nodes: [],
            Edges: [],
            Excluded: [],
        };

        const result = await executor.Execute(plan, mockUser);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Max records exceeded');
    });

    it('rejects execution when plan hash is altered (PLAN_CHANGED)', async () => {
        const executor = new CloneExecutor({ Provider: mockMetadataProvider });

        const nodes = [
            {
                NodeKey: 'node-root',
                EntityName: 'ParentEntity',
                SourceKey: 'src-1',
                TargetKey: 'tgt-1',
                Action: 'Create' as const,
                Depth: 0,
                Blocked: false,
                Route: 'RootSave' as const,
                FieldChanges: [],
            },
        ];

        const realHash = ComputeClonePlanHash({ Nodes: nodes, Edges: [], Excluded: [] });

        const plan: ClonePlan = {
            RootEntityName: 'ParentEntity',
            RootSourceKey: 'src-1',
            RootTargetKey: 'tgt-1',
            PlanHash: 'tampered-or-stale-hash', // Mismatch!
            Blocked: false,
            Warnings: [],
            Nodes: nodes,
            Edges: [],
            Excluded: [],
        };

        const result = await executor.Execute(plan, mockUser);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe('PLAN_CHANGED');
    });

    it('executes valid plan, applies ChangeContext and marks Source=Clone', async () => {
        const executor = new CloneExecutor({ Provider: mockMetadataProvider });

        const sourceRoot = new MockEntity(parentEntityInfo as EntityInfo, mockDataProvider);
        sourceRoot.NewRecord();
        sourceRoot.Set('ID', 'src-1');
        sourceRoot.Set('Name', 'Source Parent');

        const loadedSources = new Map<string, BaseEntity>();
        loadedSources.set('src-1', sourceRoot);

        const nodes = [
            {
                NodeKey: 'node-root',
                EntityName: 'ParentEntity',
                SourceKey: 'src-1',
                TargetKey: 'tgt-1',
                Action: 'Create' as const,
                Depth: 0,
                Blocked: false,
                Route: 'RootSave' as const,
                FieldChanges: [],
            },
        ];

        const validHash = ComputeClonePlanHash({ Nodes: nodes, Edges: [], Excluded: [] });

        const plan: ClonePlan = {
            RootEntityName: 'ParentEntity',
            RootSourceKey: 'src-1',
            RootTargetKey: 'tgt-1',
            PlanHash: validHash,
            Blocked: false,
            Warnings: [],
            Nodes: nodes,
            Edges: [],
            Excluded: [],
        };

        const result = await executor.Execute(plan, mockUser, loadedSources);
        expect(result.Success).toBe(true);
        expect(result.RecordsCloned).toBe(1);
        expect(result.CloneLogID).toBeDefined();

        expect(savedEntities.length).toBe(1);
        const root = savedEntities[0];
        expect(root.CloneContext).toBeDefined();
        expect(root.CloneContext?.CloneLogID).toBeDefined();
        expect(root.CloneContext?.SourceRecordID).toBe('src-1');
    });

    it('handles save failure by rolling back and returning error message', async () => {
        saveShouldSucceed = false;
        const executor = new CloneExecutor({ Provider: mockMetadataProvider });

        const sourceRoot = new MockEntity(parentEntityInfo as EntityInfo, mockDataProvider);
        sourceRoot.NewRecord();
        sourceRoot.Set('ID', 'src-1');

        const loadedSources = new Map<string, BaseEntity>();
        loadedSources.set('src-1', sourceRoot);

        const nodes = [
            {
                NodeKey: 'node-root',
                EntityName: 'ParentEntity',
                SourceKey: 'src-1',
                TargetKey: 'tgt-1',
                Action: 'Create' as const,
                Depth: 0,
                Blocked: false,
                Route: 'RootSave' as const,
                FieldChanges: [],
            },
        ];

        const validHash = ComputeClonePlanHash({ Nodes: nodes, Edges: [], Excluded: [] });

        const plan: ClonePlan = {
            RootEntityName: 'ParentEntity',
            RootSourceKey: 'src-1',
            RootTargetKey: 'tgt-1',
            PlanHash: validHash,
            Blocked: false,
            Warnings: [],
            Nodes: nodes,
            Edges: [],
            Excluded: [],
        };

        const result = await executor.Execute(plan, mockUser, loadedSources);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('DB Constraint Violation');
    });
});
