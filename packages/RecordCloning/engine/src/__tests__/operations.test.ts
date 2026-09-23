import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    EntityInfo,
    EntityFieldInfo,
    EntityRelationshipInfo,
    IMetadataProvider,
    UserInfo,
    RunView,
} from '@memberjunction/core';
import { RecordCloneOperationsHandler } from '../operations';
import { ClonePlanner } from '../ClonePlanner';
import { CloneExecutor } from '../CloneExecutor';

describe('RecordCloneOperationsHandler', () => {
    const mockUser: UserInfo = {
        ID: 'u-ops-1',
        Name: 'Ops User',
        Email: 'ops@test.com',
    } as UserInfo;

    const mockChildRel: Partial<EntityRelationshipInfo> = {
        ID: 'rel-1',
        DisplayName: 'Items',
        RelatedEntity: 'ChildEntity',
        CloneConfig: { Policy: 'Deep', Locked: false },
    };

    const mockEntity: Partial<EntityInfo> = {
        ID: 'ent-ops-1',
        Name: 'ParentEntity',
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [{ Name: 'ID', PrimaryKey: true } as EntityFieldInfo],
        RelatedEntities: [mockChildRel as EntityRelationshipInfo],
        GetUserPermisions: () => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
    };

    const mockNotCloneableEntity: Partial<EntityInfo> = {
        ID: 'ent-ops-2',
        Name: 'AuditLog',
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [{ Name: 'ID', PrimaryKey: true } as EntityFieldInfo],
        RelatedEntities: [],
        CloneConfiguration: { Enabled: false },
        GetUserPermisions: () => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
    };

    const mockNoPermEntity: Partial<EntityInfo> = {
        ID: 'ent-ops-3',
        Name: 'LockedEntity',
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [{ Name: 'ID', PrimaryKey: true } as EntityFieldInfo],
        RelatedEntities: [],
        GetUserPermisions: () => ({
            CanCreate: false,
            CanRead: true,
            CanUpdate: false,
            CanDelete: false,
        }),
    };

    const mockProvider: IMetadataProvider = {
        Entities: [
            mockEntity as EntityInfo,
            mockNotCloneableEntity as EntityInfo,
            mockNoPermEntity as EntityInfo,
        ],
        EntityByName: (n: string) => {
            if (n === 'ParentEntity') return mockEntity as EntityInfo;
            if (n === 'AuditLog') return mockNotCloneableEntity as EntityInfo;
            if (n === 'LockedEntity') return mockNoPermEntity as EntityInfo;
            return null;
        },
    } as unknown as IMetadataProvider;

    let handler: RecordCloneOperationsHandler;

    beforeEach(() => {
        handler = new RecordCloneOperationsHandler(mockProvider);
    });

    describe('Describe', () => {
        it('returns CanClone: true with relationships for cloneable entity', async () => {
            const desc = await handler.Describe({ EntityName: 'ParentEntity' }, mockUser);
            expect(desc.CanClone).toBe(true);
            expect(desc.Policies.length).toBe(1);
            expect(desc.Policies[0].RelatedEntityName).toBe('ChildEntity');
            expect(desc.Policies[0].DefaultPolicy).toBe('Deep');
        });

        it('returns CanClone: false when entity is disabled in config', async () => {
            const desc = await handler.Describe({ EntityName: 'AuditLog' }, mockUser);
            expect(desc.CanClone).toBe(false);
            expect(desc.Reason).toContain('NotCloneable');
        });

        it('returns CanClone: false when user lacks CanCreate', async () => {
            const desc = await handler.Describe({ EntityName: 'LockedEntity' }, mockUser);
            expect(desc.CanClone).toBe(false);
            expect(desc.Reason).toContain('lacks CanCreate');
        });
    });

    describe('Plan and Execute', () => {
        it('plans a clone request via ClonePlanner', async () => {
            const mockPlan = {
                RootEntityName: 'ParentEntity',
                RootSourceKey: 'src-1',
                RootTargetKey: 'tgt-1',
                PlanHash: 'hash-123',
                Blocked: false,
                Warnings: [],
                Nodes: [],
                Edges: [],
                Excluded: [],
            };

            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(mockPlan as never);

            const res = await handler.Plan(
                { EntityName: 'ParentEntity', RecordID: 'src-1' },
                mockUser
            );

            expect(res.Plan).toBe(mockPlan);
        });

        it('executes clone request and bails if PlanHash does not match (PLAN_HASH_MISMATCH)', async () => {
            const mockPlan = {
                RootEntityName: 'ParentEntity',
                RootSourceKey: 'src-1',
                RootTargetKey: 'tgt-1',
                PlanHash: 'hash-current',
                Blocked: false,
                Warnings: [],
                Nodes: [],
                Edges: [],
                Excluded: [],
            };

            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(mockPlan as never);

            const res = await handler.Execute(
                {
                    EntityName: 'ParentEntity',
                    RecordID: 'src-1',
                    PlanHash: 'hash-expected-different',
                },
                mockUser
            );

            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('PLAN_HASH_MISMATCH');
        });

        it('successfully executes and serializes CompositeKeyLike roots and created records without ToConcatenatedString error', async () => {
            const mockPlan = {
                RootEntityName: 'ParentEntity',
                RootSourceKey: 'src-1',
                RootTargetKey: 'tgt-1',
                PlanHash: 'hash-1',
                Blocked: false,
                Warnings: [],
                Nodes: [],
                Edges: [],
                Excluded: [],
                Counts: { TotalNodes: 1, NodesToCreate: 1, NodesToReference: 0, NodesToSkip: 0, NodesBlocked: 0, MaxDepth: 0 },
            };

            const mockResult = {
                Success: true,
                ResultCode: 'SUCCESS',
                Roots: [
                    {
                        EntityName: 'ParentEntity',
                        SourceKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'src-1' }] },
                        TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'tgt-new-1' }] },
                    },
                ],
                Created: [
                    {
                        EntityName: 'ParentEntity',
                        SourceKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'src-1' }] },
                        TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'tgt-new-1' }] },
                        Depth: 0,
                    },
                ],
                Skipped: [],
                Warnings: [],
            };

            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(mockPlan as never);
            vi.spyOn(CloneExecutor.prototype, 'Execute').mockResolvedValue(mockResult as never);

            const res = await handler.Execute(
                {
                    EntityName: 'ParentEntity',
                    RecordID: 'src-1',
                    PlanHash: 'hash-1',
                },
                mockUser
            );

            expect(res.Success).toBe(true);
            expect(res.RootTargetKey).toBe('tgt-new-1');
            expect(res.Roots?.[0].TargetKey).toBe('tgt-new-1');
            expect(res.Roots?.[0].SourceKey).toBe('src-1');
            expect(res.Created?.[0].TargetKey).toBe('tgt-new-1');
        });
    });

    describe('GetLineage', () => {
        it('retrieves ancestors and child clones from Record Links', async () => {
            vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
                const filter = (params as { ExtraFilter?: string }).ExtraFilter || '';
                if (filter.includes('SourceEntityID')) {
                    // Upwards (ancestors)
                    return {
                        Success: true,
                        Results: [
                            {
                                TargetRecordID: 'ancestor-rec-1',
                                TargetEntityID: 'ent-ops-1',
                                __mj_CreatedAt: '2026-09-01T00:00:00Z',
                            },
                        ],
                    };
                }
                if (filter.includes('TargetEntityID')) {
                    // Downwards (clones)
                    return {
                        Success: true,
                        Results: [
                            {
                                SourceRecordID: 'clone-rec-1',
                                SourceEntityID: 'ent-ops-1',
                                __mj_CreatedAt: '2026-09-10T00:00:00Z',
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            });

            const lineage = await handler.GetLineage(
                {
                    EntityName: 'ParentEntity',
                    RecordID: 'rec-mid',
                    Direction: 'both',
                },
                mockUser
            );

            expect(lineage.Ancestors.length).toBe(1);
            expect(lineage.Ancestors[0].RecordID).toBe('ancestor-rec-1');
            expect(lineage.Clones.length).toBe(1);
            expect(lineage.Clones[0].RecordID).toBe('clone-rec-1');
            expect(lineage.TotalClones).toBe(1);
        });

        it('supports Key object with KeyValuePairs for GetLineage', async () => {
            const lineage = await handler.GetLineage(
                {
                    EntityName: 'ParentEntity',
                    Key: { KeyValuePairs: [{ FieldName: 'ID', Value: 'rec-mid' }] },
                    Direction: 'both',
                },
                mockUser
            );

            expect(lineage.Ancestors.length).toBe(1);
            expect(lineage.Clones.length).toBe(1);
        });
    });

    describe('SourceRecordKey and Roots payload support', () => {
        it('plans with SourceRecordKey composite key payload', async () => {
            const mockPlan = {
                RootEntityName: 'ParentEntity',
                RootSourceKey: 'src-1',
                RootTargetKey: 'tgt-1',
                PlanHash: 'hash-plan',
                Blocked: false,
                Warnings: [],
                Nodes: [],
                Edges: [],
                Excluded: [],
            };

            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(mockPlan as never);

            const res = await handler.Plan(
                {
                    EntityName: 'ParentEntity',
                    SourceRecordKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'src-1' }] },
                },
                mockUser
            );

            expect(res.Plan).toBe(mockPlan);
        });
    });
});

