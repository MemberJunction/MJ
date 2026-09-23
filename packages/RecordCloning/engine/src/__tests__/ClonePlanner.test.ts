import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    EntityInfo,
    EntityFieldInfo,
    EntityRelationshipInfo,
    IMetadataProvider,
    UserInfo,
} from '@memberjunction/core';
import { ClonePlanner } from '../ClonePlanner';
import { RecordCloneRequest } from '@memberjunction/record-cloning-base';

// Mock RunView before tests execute
const mockRunViewInstance = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        RunView = mockRunViewInstance;
    }
    return {
        ...actual,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

describe('ClonePlanner', () => {
    const standardUser: UserInfo = {
        ID: 'user-standard',
        Name: 'Standard User',
        Email: 'user@test.com',
        Type: 'User',
    } as UserInfo;

    const ownerUser: UserInfo = {
        ID: 'user-owner',
        Name: 'Owner User',
        Email: 'owner@test.com',
        Type: 'Owner',
    } as UserInfo;

    const parentEntity: Partial<EntityInfo> = {
        ID: 'ent-parent-id',
        Name: 'ParentEntity',
        BaseView: 'vwParentEntities',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-children',
                Name: 'Children',
                EntityID: 'ent-parent-id',
                RelatedEntityID: 'ent-child-id',
                RelatedEntity: 'ChildEntity',
                RelatedEntityJoinField: 'ParentID',
                Type: 'One To Many',
                RelatedRecordCollection: JSON.stringify({ Name: 'Children' }),
            } as EntityRelationshipInfo,
        ],
        GetUserPermisions: (u: UserInfo) => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
        CloneConfiguration: {
            Enabled: true,
            MaxDepth: 3,
            MaxRecords: 100,
        },
    };

    const childEntity: Partial<EntityInfo> = {
        ID: 'ent-child-id',
        Name: 'ChildEntity',
        BaseView: 'vwChildEntities',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ParentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-parent-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        GetUserPermisions: (u: UserInfo) => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
        CloneConfiguration: {
            Enabled: true,
        },
    };

    const entitiesList: EntityInfo[] = [parentEntity as EntityInfo, childEntity as EntityInfo];

    const mockProvider: IMetadataProvider = {
        Entities: entitiesList,
        EntityByName: (name: string) => entitiesList.find((e) => e.Name.toLowerCase() === name.toLowerCase()) ?? null,
        EntityByID: (id: string) => entitiesList.find((e) => e.ID === id) ?? null,
    } as IMetadataProvider;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('computes valid clone plan with pre-minted target keys and stable hash', async () => {
        const planner = new ClonePlanner({ Provider: mockProvider });

        mockRunViewInstance
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'parent-1', Name: 'Original Parent' }],
            })
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'child-1', Name: 'Original Child', ParentID: 'parent-1' }],
            });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
            Options: {
                NamingTemplate: '{Name} - Clone',
            },
        };

        const plan = await planner.Plan(request, standardUser);

        expect(plan.Blocked).toBe(false);
        expect(plan.RootEntityName).toBe('ParentEntity');
        expect(plan.RootSourceKey).toContain('parent-1');
        expect(plan.RootTargetKey).toBeDefined();
        expect(plan.Nodes.length).toBe(2);
        expect(plan.PlanHash).toBeDefined();
        expect(plan.PlanHash.length).toBe(64); // SHA-256 hex string

        // Verify root node
        const rootNode = plan.Nodes.find((n) => n.Depth === 0);
        expect(rootNode).toBeDefined();
        expect(rootNode?.TargetKey).toBe(plan.RootTargetKey);
        expect(rootNode?.FieldChanges.some((fc) => fc.Field === 'Name' && fc.NewValue === 'Original Parent - Clone')).toBe(true);

        // Verify child node
        const childNode = plan.Nodes.find((n) => n.Depth === 1);
        expect(childNode).toBeDefined();
        expect(childNode?.EntityName).toBe('ChildEntity');
        expect(childNode?.TargetKey).toBeDefined();
        expect(childNode?.TargetKey).not.toBe('child-1');
    });

    it('blocks plan with CAP_EXCEEDED when node count exceeds MaxRecords', async () => {
        const planner = new ClonePlanner({ Provider: mockProvider });

        mockRunViewInstance
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'parent-1', Name: 'Parent' }],
            })
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'child-1', Name: 'Child', ParentID: 'parent-1' }],
            });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
            Options: {
                MaxRecords: 1, // Only allow 1 record, but graph has 2
            },
        };

        const plan = await planner.Plan(request, standardUser);
        expect(plan.Blocked).toBe(true);
        expect(plan.Warnings.some((w) => w.Code === 'CAP_EXCEEDED')).toBe(true);
    });

    it('blocks plan with REQUIRED_USER_TYPE_MISMATCH when user type is insufficient', async () => {
        const restrictedParent: EntityInfo = {
            ...parentEntity,
            CloneConfiguration: {
                Enabled: true,
                RequiredUserType: 'Owner',
            },
        } as EntityInfo;

        const provider: IMetadataProvider = {
            ...mockProvider,
            Entities: [restrictedParent, childEntity as EntityInfo],
            EntityByName: (name: string) => (name === 'ParentEntity' ? restrictedParent : childEntity as EntityInfo),
        } as IMetadataProvider;

        const planner = new ClonePlanner({ Provider: provider });

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'ParentEntity') {
                return { Success: true, Results: [{ ID: 'parent-1', Name: 'Parent' }] };
            }
            return { Success: true, Results: [] };
        });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
        };

        const plan = await planner.Plan(request, standardUser);
        expect(plan.Blocked).toBe(true);
        expect(plan.Warnings.some((w) => w.Code === 'REQUIRED_USER_TYPE_MISMATCH')).toBe(true);

        // Should succeed when user is Owner
        const ownerPlan = await planner.Plan(request, ownerUser);
        expect(ownerPlan.Blocked).toBe(false);
    });

    it('blocks plan with NO_CREATE_PERMISSION when user lacks permission on child node', async () => {
        const unauthorizedChild: EntityInfo = {
            ...childEntity,
            GetUserPermisions: () => ({
                CanCreate: false,
                CanRead: true,
                CanUpdate: false,
                CanDelete: false,
            }),
        } as EntityInfo;

        const provider: IMetadataProvider = {
            ...mockProvider,
            Entities: [parentEntity as EntityInfo, unauthorizedChild],
            EntityByName: (name: string) => (name === 'ChildEntity' ? unauthorizedChild : parentEntity as EntityInfo),
        } as IMetadataProvider;

        const planner = new ClonePlanner({ Provider: provider });

        mockRunViewInstance
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'parent-1', Name: 'Parent' }],
            })
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'child-1', Name: 'Child', ParentID: 'parent-1' }],
            });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
        };

        const plan = await planner.Plan(request, standardUser);
        expect(plan.Blocked).toBe(true);
        expect(plan.Warnings.some((w) => w.Code === 'NO_CREATE_PERMISSION')).toBe(true);
    });

    it('skips server-generated children with warning', async () => {
        const parentWithHook: EntityInfo = {
            ...parentEntity,
            CloneConfiguration: {
                Enabled: true,
                Hooks: {
                    ServerGeneratedChildren: ['ChildEntity'],
                },
            },
        } as EntityInfo;

        const provider: IMetadataProvider = {
            ...mockProvider,
            Entities: [parentWithHook, childEntity as EntityInfo],
            EntityByName: (name: string) => (name === 'ParentEntity' ? parentWithHook : childEntity as EntityInfo),
        } as IMetadataProvider;

        const planner = new ClonePlanner({ Provider: provider });

        mockRunViewInstance.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: 'parent-1', Name: 'Parent' }],
        });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
        };

        const plan = await planner.Plan(request, standardUser);
        expect(plan.Nodes.length).toBe(1); // Child was skipped
        expect(plan.Warnings.some((w) => w.Code === 'SERVER_GENERATED_CHILD_SKIPPED')).toBe(true);
    });
});
