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
import { ClonePlan } from '@memberjunction/record-cloning-base';
import { ComputeClonePlanHash } from '../ClonePlanHash';
import { GrantedCloneAuthorizations } from './helpers/cloneAuthorizations';

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
        Authorizations: GrantedCloneAuthorizations(),
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

        const result = await executor.Execute(plan, mockUser);
        expect(result.Success).toBe(true);
        expect(result.RecordsCloned).toBe(1);
        expect(result.CloneLogID).toBeDefined();

        expect(savedEntities.length).toBe(1);
        const root = savedEntities[0];
        expect(root.CloneContext).toBeDefined();
        expect(root.CloneContext?.CloneLogID).toBeDefined();
        expect(root.CloneContext?.SourceRecordID).toBe('src-1');
    });

    /** A provider that knows the provenance entities; `failRoot` makes the cloned row's save fail. */
    const provenanceProvider = (requested: string[] = [], failRoot = false) => {
        const provenanceInfo = { ID: 'ent-prov', Name: 'provenance' } as EntityInfo;
        return {
            ...mockMetadataProvider,
            EntityByName: (name: string) =>
                name === 'ParentEntity' ? (parentEntityInfo as EntityInfo)
                    : ['MJ: Record Links', 'MJ: Record Clone Logs', 'MJ: Record Clone Log Items'].includes(name) ? provenanceInfo
                    : null,
            GetEntityObject: async <T extends BaseEntity>(entityName: string): Promise<T> => {
                requested.push(entityName);
                const ent = await mockDataProvider.GetEntityObject<T>(entityName);
                if (failRoot && entityName === 'ParentEntity') vi.spyOn(ent, 'Save').mockResolvedValue(false);
                return ent;
            },
        } as unknown as IMetadataProvider;
    };
    const rootOnlyPlan = (hash?: string): ClonePlan => {
        const nodes = [
            {
                NodeKey: 'node-root', EntityName: 'ParentEntity', SourceKey: 'src-1', TargetKey: 'tgt-1',
                Action: 'Create' as const, Depth: 0, Blocked: false, Route: 'RootSave' as const,
                FieldChanges: [{ Field: 'Name', Kind: 'Copy' as const, OldValue: 'n', NewValue: 'n', Reason: '' }],
            },
        ];
        return {
            RootEntityName: 'ParentEntity', RootSourceKey: 'src-1', RootTargetKey: 'tgt-1',
            PlanHash: hash ?? ComputeClonePlanHash({ Nodes: nodes, Edges: [], Excluded: [] }),
            Blocked: false, Warnings: [], Nodes: nodes, Edges: [], Excluded: [],
        } as unknown as ClonePlan;
    };
    type Row = { Status?: string; LinkType?: string; Metadata?: string; StartedAt?: Date; ErrorMessage?: string; RecordCloneLogID?: string; FieldChangesJSON?: string };
    const rows = () => savedEntities as unknown as Row[];

    it('writes the clone log, one log item per row and a ClonedFrom link', async () => {
        const requested: string[] = [];
        const result = await new CloneExecutor({ Provider: provenanceProvider(requested) }).Execute(rootOnlyPlan(), mockUser);

        expect(result.Success).toBe(true);
        expect(requested).toEqual(expect.arrayContaining(['MJ: Record Links', 'MJ: Record Clone Logs', 'MJ: Record Clone Log Items']));
        const log = rows().find((e) => e.Status === 'Complete');
        expect(log?.StartedAt).toBeInstanceOf(Date);
        const item = rows().find((e) => e.Status === 'Created');
        expect(item?.RecordCloneLogID).toBe(result.CloneLogID);
        expect(JSON.parse(item!.FieldChangesJSON!)).toHaveLength(1);
        const link = rows().find((e) => e.LinkType === 'ClonedFrom');
        expect(JSON.parse(link!.Metadata!)).toEqual({ CloneLogID: result.CloneLogID });
    });

    it('records a failed clone in an Error log written after the rollback', async () => {
        const result = await new CloneExecutor({ Provider: provenanceProvider([], true) }).Execute(rootOnlyPlan(), mockUser);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('EXECUTION_ERROR');
        const log = rows().find((e) => e.Status === 'Error');
        expect(log?.ErrorMessage).toBeTruthy();
        expect(rows().some((e) => e.LinkType === 'ClonedFrom' || e.Status === 'Created')).toBe(false);
    });

    it('records a refused plan in a Cancelled log', async () => {
        const result = await new CloneExecutor({ Provider: provenanceProvider() }).Execute(rootOnlyPlan('stale-hash'), mockUser);

        expect(result.ResultCode).toBe('PLAN_CHANGED');
        expect(rows().find((e) => e.Status === 'Cancelled')?.ErrorMessage).toContain('PLAN_CHANGED');
    });

    it('saves a sidecar row with its own source record and counts it once', async () => {
        const noteInfo = {
            ID: 'ent-note', Name: 'Notes', PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' },
            Fields: [
                { Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' },
                { Name: 'ParentID', IsPrimaryKey: false, Type: 'uniqueidentifier' },
            ],
            RelatedEntities: [],
        } as unknown as EntityInfo;
        const declare = vi.spyOn(BaseEntity.prototype, 'DeclareRelatedRecordsDynamic').mockImplementation(() => {
            throw new Error('no dynamic collections');
        });
        const provider = {
            ...mockMetadataProvider,
            EntityByName: (n: string) => (n === 'Notes' ? noteInfo : n === 'ParentEntity' ? (parentEntityInfo as EntityInfo) : null),
            GetEntityObject: async <T extends BaseEntity>(n: string): Promise<T> => {
                const ent = new MockEntity((n === 'Notes' ? noteInfo : parentEntityInfo) as EntityInfo, mockDataProvider);
                vi.spyOn(ent, 'Save').mockImplementation(async () => (savedEntities.push(ent), true));
                return ent as unknown as T;
            },
        } as unknown as IMetadataProvider;
        const nodes = [
            { NodeKey: 'root', EntityName: 'ParentEntity', SourceKey: 'src-1', TargetKey: 'tgt-1', Action: 'Create' as const, Depth: 0, Route: 'RootSave' as const, FieldChanges: [] },
            { NodeKey: 'note', EntityName: 'Notes', SourceKey: 'n-1', TargetKey: 'n-2', Action: 'Create' as const, Depth: 1, Route: 'Collection' as const, FieldChanges: [] },
        ];
        const plan = {
            RootEntityName: 'ParentEntity', RootSourceKey: 'src-1', RootTargetKey: 'tgt-1', Blocked: false, Warnings: [],
            Nodes: nodes, Edges: [{ FromKey: 'root', ToKey: 'note', JoinField: 'ParentID', Policy: 'Deep' }], Excluded: [],
        } as unknown as ClonePlan;
        plan.PlanHash = ComputeClonePlanHash(plan);

        const result = await new CloneExecutor({ Provider: provider }).Execute(plan, mockUser);
        declare.mockRestore();

        expect(result.ErrorMessage).toBeUndefined();
        expect(result.Success).toBe(true);
        expect(result.RecordsCloned).toBe(2);
        expect(result.Created).toHaveLength(2);
        const note = savedEntities.find((e) => e.EntityInfo?.Name === 'Notes');
        expect(note?.CloneContext?.SourceRecordID).toBe('n-1');
    });

    it('suppresses Entity Actions and AI Actions on clone saves unless the plan fires them', async () => {
        const run = async (effective?: Record<string, string>) => {
            savedEntities = [];
            const sourceRoot = new MockEntity(parentEntityInfo as EntityInfo, mockDataProvider);
            sourceRoot.NewRecord();
            sourceRoot.Set('ID', 'src-1');
            const nodes = [{ NodeKey: 'node-root', EntityName: 'ParentEntity', SourceKey: 'src-1', TargetKey: 'tgt-1', Action: 'Create' as const, Depth: 0, Blocked: false, Route: 'RootSave' as const, FieldChanges: [] }];
            const plan = {
                RootEntityName: 'ParentEntity', RootSourceKey: 'src-1', RootTargetKey: 'tgt-1',
                PlanHash: ComputeClonePlanHash({ Nodes: nodes, Edges: [], Excluded: [] }),
                Blocked: false, Warnings: [], Nodes: nodes, Edges: [], Excluded: [],
                EffectiveOptions: effective,
            } as unknown as ClonePlan;
            await new CloneExecutor({ Provider: mockMetadataProvider }).Execute(plan, mockUser);
            const save = vi.mocked(savedEntities[0].Save);
            return save.mock.calls[0][0];
        };

        expect(await run()).toMatchObject({ SkipEntityActions: true, SkipEntityAIActions: true });
        expect(await run({ EntityActions: 'fire', AIActions: 'suppress' })).toMatchObject({ SkipEntityActions: false, SkipEntityAIActions: true });
    });

    it('handles save failure by rolling back and returning error message', async () => {
        saveShouldSucceed = false;
        const executor = new CloneExecutor({ Provider: mockMetadataProvider });

        const sourceRoot = new MockEntity(parentEntityInfo as EntityInfo, mockDataProvider);
        sourceRoot.NewRecord();
        sourceRoot.Set('ID', 'src-1');


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

        const result = await executor.Execute(plan, mockUser);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('DB Constraint Violation');
    });
});
