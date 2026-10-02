import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    CompositeKey,
    EntityInfo,
    EntityFieldInfo,
    EntityRelationshipInfo,
    IMetadataProvider,
    UserInfo,
} from '@memberjunction/core';
import { DependencyGraphWalker } from '../DependencyGraphWalker';
import type { DependencyNode, GraphEdgeCandidate } from '../types';

// Mock RunView before tests execute
const mockRunViewInstance = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        RunView = mockRunViewInstance;
        static FromMetadataProvider = () => new MockRunView();
    }
    return {
        ...actual,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

describe('DependencyGraphWalker', () => {
    const mockUser = { ID: 'user-1' } as UserInfo;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('FlattenTopological', () => {
        it('flattens graph in breadth-first topological order', () => {
            const walker = new DependencyGraphWalker();
            const child1: DependencyNode = {
                EntityName: 'Child1',
                EntityInfo: {} as EntityInfo,
                RecordKey: {} as CompositeKey,
                RecordID: 'c1',
                RecordData: {},
                Relationship: null,
                Children: [],
                Depth: 1,
            };
            const child2: DependencyNode = {
                EntityName: 'Child2',
                EntityInfo: {} as EntityInfo,
                RecordKey: {} as CompositeKey,
                RecordID: 'c2',
                RecordData: {},
                Relationship: null,
                Children: [],
                Depth: 1,
            };
            const root: DependencyNode = {
                EntityName: 'Root',
                EntityInfo: {} as EntityInfo,
                RecordKey: {} as CompositeKey,
                RecordID: 'r',
                RecordData: {},
                Relationship: null,
                Children: [child1, child2],
                Depth: 0,
            };

            const flat = walker.FlattenTopological(root);
            expect(flat.map(n => n.EntityName)).toEqual(['Root', 'Child1', 'Child2']);
        });
    });

    describe('WalkDependents options', () => {
        // Setup standard test entities
        const parentEntity: Partial<EntityInfo> = {
            ID: 'ent-parent-id',
            Name: 'ParentEntity',
            TrackRecordChanges: true,
            PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
            FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
            Fields: [
                { Name: 'ID', PrimaryKey: true } as EntityFieldInfo,
            ],
            RelatedEntities: [
                {
                    Type: 'One To Many',
                    RelatedEntityID: 'ent-child-id',
                    RelatedEntityJoinField: 'ParentID',
                    RelatedRecordCollection: JSON.stringify({ Name: 'Children' }),
                } as EntityRelationshipInfo,
            ],
        };

        const childEntity: Partial<EntityInfo> = {
            ID: 'ent-child-id',
            Name: 'ChildEntity',
            TrackRecordChanges: false, // Intentionally false to test RequireTrackRecordChanges
            PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
            FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
            Fields: [
                { Name: 'ID', PrimaryKey: true } as EntityFieldInfo,
                { Name: 'ParentID', RelatedEntityID: 'ent-parent-id' } as EntityFieldInfo,
            ],
            RelatedEntities: [],
        };

        const entitiesList = [parentEntity as EntityInfo, childEntity as EntityInfo];

        const mockProvider: IMetadataProvider = {
            Entities: entitiesList,
            EntityByName: (name: string) => entitiesList.find(e => e.Name === name) ?? null,
            EntityByID: (id: string) => entitiesList.find(e => e.ID === id) ?? null,
        } as IMetadataProvider;

        it('skips non-tracking child entities when RequireTrackRecordChanges is true (default)', async () => {
            const walker = new DependencyGraphWalker(mockProvider);

            mockRunViewInstance.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'parent-1' }],
            });

            const { CompositeKey } = await import('@memberjunction/core');
            const rootKey = new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]);

            const rootNode = await walker.WalkDependents('ParentEntity', rootKey, {}, mockUser);

            // ChildEntity has TrackRecordChanges = false, so it should not be visited
            expect(rootNode.Children.length).toBe(0);
        });

        it('includes non-tracking child entities when RequireTrackRecordChanges is false', async () => {
            const walker = new DependencyGraphWalker(mockProvider);

            mockRunViewInstance
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'parent-1' }],
                })
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'child-1', ParentID: 'parent-1' }],
                });

            const { CompositeKey } = await import('@memberjunction/core');
            const rootKey = new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]);

            const rootNode = await walker.WalkDependents(
                'ParentEntity',
                rootKey,
                { RequireTrackRecordChanges: false },
                mockUser
            );

            expect(rootNode.Children.length).toBe(1);
            expect(rootNode.Children[0]?.EntityName).toBe('ChildEntity');
            expect(rootNode.Children[0]?.RecordID).toContain('child-1');
            expect(rootNode.Children[0]?.DiscoveringEdge?.Kind).toBe('Collection');
        });

        it('respects EdgePolicy returning Skip', async () => {
            const walker = new DependencyGraphWalker(mockProvider);

            mockRunViewInstance.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'parent-1' }],
            });

            const { CompositeKey } = await import('@memberjunction/core');
            const rootKey = new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]);

            const edgePolicyCalls: GraphEdgeCandidate[] = [];
            const rootNode = await walker.WalkDependents(
                'ParentEntity',
                rootKey,
                {
                    RequireTrackRecordChanges: false,
                    EdgePolicy: (edge) => {
                        edgePolicyCalls.push(edge);
                        return 'Skip';
                    },
                },
                mockUser
            );

            expect(edgePolicyCalls.length).toBeGreaterThan(0);
            expect(edgePolicyCalls[0]?.TargetEntityName).toBe('ChildEntity');
            expect(rootNode.Children.length).toBe(0);
        });

        it('reports an edge whose rows fail to load, with the decision made before the load', async () => {
            const walker = new DependencyGraphWalker(mockProvider);
            mockRunViewInstance
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'parent-1' }] })
                .mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'no read permission' });

            const { CompositeKey } = await import('@memberjunction/core');
            const failures: Array<{ Target: string; Decision: string; Message: string }> = [];
            const rootNode = await walker.WalkDependents(
                'ParentEntity',
                new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]),
                {
                    RequireTrackRecordChanges: false,
                    EdgePolicy: () => 'Deep',
                    OnLoadFailure: (f) => failures.push({ Target: f.Edge.TargetEntityName, Decision: f.Decision, Message: f.Message }),
                },
                mockUser
            );

            expect(rootNode.Children).toEqual([]);
            expect(failures).toEqual([{ Target: 'ChildEntity', Decision: 'Deep', Message: 'no read permission' }]);
        });

        it('reports a load that throws', async () => {
            const walker = new DependencyGraphWalker(mockProvider);
            mockRunViewInstance
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'parent-1' }] })
                .mockRejectedValueOnce(new Error('connection reset'));

            const { CompositeKey } = await import('@memberjunction/core');
            const messages: string[] = [];
            await walker.WalkDependents(
                'ParentEntity',
                new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]),
                { RequireTrackRecordChanges: false, OnLoadFailure: (f) => messages.push(`${f.Decision}: ${f.Message}`) },
                mockUser
            );

            expect(messages).toEqual(['Deep: connection reset']);
        });

        it('respects EdgePolicy returning Reference without recursing deeper', async () => {
            const walker = new DependencyGraphWalker(mockProvider);

            mockRunViewInstance
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'parent-1' }],
                })
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'child-1', ParentID: 'parent-1' }],
                });

            const { CompositeKey } = await import('@memberjunction/core');
            const rootKey = new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]);

            const rootNode = await walker.WalkDependents(
                'ParentEntity',
                rootKey,
                {
                    RequireTrackRecordChanges: false,
                    EdgePolicy: () => 'Reference',
                },
                mockUser
            );

            expect(rootNode.Children.length).toBe(1);
            expect(rootNode.Children[0]?.EntityName).toBe('ChildEntity');
        });

        it('discovers IS-A subtype rows when IncludeSubtypes is true', async () => {
            const providerWithISA = {
                ...mockProvider,
                FindISAChildEntities: vi.fn().mockResolvedValue([{ ChildEntityName: 'ChildEntity' }]),
            } as IMetadataProvider;

            const walker = new DependencyGraphWalker(providerWithISA);

            // Answer by query, not call order: the root load, then the subtype row loaded by the
            // root's key; every relationship query finds nothing.
            mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
                if (params.EntityName === 'ParentEntity') return { Success: true, Results: [{ ID: 'parent-1' }] };
                if (params.EntityName === 'ChildEntity' && /^\[?ID\]?\s*=\s*'parent-1'$/.test(params.ExtraFilter ?? '')) {
                    return { Success: true, Results: [{ ID: 'parent-1', ExtraSubtypeField: 'subtype-val' }] };
                }
                return { Success: true, Results: [] };
            });

            const { CompositeKey } = await import('@memberjunction/core');
            const rootKey = new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]);

            const rootNode = await walker.WalkDependents(
                'ParentEntity',
                rootKey,
                {
                    RequireTrackRecordChanges: false,
                    IncludeSubtypes: true,
                },
                mockUser
            );

            const subtypeNode = rootNode.Children.find(c => c.IsSubtypeRow);
            expect(subtypeNode).toBeDefined();
            expect(subtypeNode?.EntityName).toBe('ChildEntity');
            expect(subtypeNode?.DiscoveringEdge?.Kind).toBe('IsASubtype');
            // The provider matches the bare key value, not the "ID|parent-1" record-id string.
            expect((providerWithISA.FindISAChildEntities as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('parent-1');
            // The root's subtypes are looked up once, not once before and again inside walkChildren.
            const rootLookups = (providerWithISA.FindISAChildEntities as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0].Name === 'ParentEntity');
            expect(rootLookups).toHaveLength(1);
        });

        it('matches soft links stored as the full record-id or the bare value', async () => {
            const notes = {
                ID: 'ent-notes', Name: 'Notes', TrackRecordChanges: true,
                PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' },
                Fields: [{ Name: 'ID', IsPrimaryKey: true }, { Name: 'EntityID' }, { Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
                RelatedEntities: [],
            } as unknown as EntityInfo;
            const list = [...entitiesList, notes];
            const provider = { ...mockProvider, Entities: list, EntityByName: (n: string) => list.find((e) => e.Name === n) ?? null } as IMetadataProvider;
            const filters: string[] = [];
            mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter: string }) => {
                filters.push(params.ExtraFilter);
                return { Success: true, Results: params.EntityName === 'ParentEntity' ? [{ ID: 'parent-1' }] : [] };
            });
            const { CompositeKey } = await import('@memberjunction/core');

            await new DependencyGraphWalker(provider).WalkDependents(
                'ParentEntity',
                new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]),
                { RequireTrackRecordChanges: false, IncludeSoftLinks: true, MaxDepth: 1, EdgePolicy: (c) => (c.Kind === 'SoftLink' ? 'Deep' : 'Skip') },
                mockUser
            );

            const softLink = filters.find((f) => f.includes('[RecordID]'));
            expect(softLink).toContain("[RecordID] = 'ID|parent-1'");
            expect(softLink).toContain("[RecordID] = 'parent-1'");
            mockRunViewInstance.mockReset();
        });

        it('builds its RunViews from the walker\'s provider', async () => {
            const { RunView, CompositeKey } = await import('@memberjunction/core');
            const from = vi.spyOn(RunView as unknown as { FromMetadataProvider: (p: unknown) => unknown }, 'FromMetadataProvider');
            mockRunViewInstance.mockResolvedValue({ Success: true, Results: [{ ID: 'parent-1' }] });

            await new DependencyGraphWalker(mockProvider).WalkDependents(
                'ParentEntity',
                new CompositeKey([{ FieldName: 'ID', Value: 'parent-1' }]),
                { RequireTrackRecordChanges: false, MaxDepth: 1 },
                mockUser
            );

            expect(from).toHaveBeenCalled();
            expect(from.mock.calls.every((c) => c[0] === mockProvider)).toBe(true);
            from.mockRestore();
            mockRunViewInstance.mockReset();
        });

        describe('non-curated inbound FKs, the system-FK skip list and the depth cap', () => {
            const project = {
                ID: 'ent-project', Name: 'Projects', TrackRecordChanges: true,
                PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' },
                Fields: [{ Name: 'ID', PrimaryKey: true }], RelatedEntities: [],
            } as unknown as EntityInfo;
            // No EntityRelationship row points Notes at Projects: only the FK columns do.
            const notes = {
                ID: 'ent-notes', Name: 'Notes', TrackRecordChanges: true,
                PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' },
                Fields: [
                    { Name: 'ID', PrimaryKey: true },
                    { Name: 'ProjectID', RelatedEntityID: 'ent-project' },
                    { Name: 'CreatedByUserID', RelatedEntityID: 'ent-project' },
                ],
                RelatedEntities: [],
            } as unknown as EntityInfo;
            const provider = {
                Entities: [project, notes],
                EntityByName: (n: string) => [project, notes].find((e) => e.Name === n) ?? null,
                EntityByID: (id: string) => [project, notes].find((e) => e.ID === id),
            } as unknown as IMetadataProvider;
            const filters: string[] = [];

            beforeEach(() => {
                filters.length = 0;
                mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
                    filters.push(`${params.EntityName}: ${params.ExtraFilter ?? ''}`);
                    if (params.EntityName === 'Projects') return { Success: true, Results: [{ ID: 'p-1' }] };
                    if (params.EntityName === 'Notes' && (params.ExtraFilter ?? '').includes('[ProjectID]')) {
                        return { Success: true, Results: [{ ID: 'n-1', ProjectID: 'p-1' }] };
                    }
                    return { Success: true, Results: [] };
                });
            });

            const walk = async (options: Record<string, unknown>) => {
                const { CompositeKey } = await import('@memberjunction/core');
                return new DependencyGraphWalker(provider).WalkDependents('Projects', new CompositeKey([{ FieldName: 'ID', Value: 'p-1' }]), options, mockUser);
            };

            it('lists nothing through non-curated FKs unless ListNonCuratedInbound is on', async () => {
                const root = await walk({ EdgePolicy: () => 'Deep' });
                expect(root.Children).toHaveLength(0);
                expect(filters.some((f) => f.startsWith('Notes'))).toBe(false);
            });

            it('follows a non-curated inbound FK when asked, and never the system FKs', async () => {
                const root = await walk({ ListNonCuratedInbound: true, EdgePolicy: () => 'Deep' });
                expect(root.Children.map((c) => [c.EntityName, c.DiscoveringEdge?.Kind, c.DiscoveringEdge?.JoinField])).toEqual([['Notes', 'InboundFK', 'ProjectID']]);
                expect(filters.some((f) => f.includes('CreatedByUserID'))).toBe(false);
            });

            it('stops at MaxDepth', async () => {
                const root = await walk({ ListNonCuratedInbound: true, EdgePolicy: () => 'Deep', MaxDepth: 0 });
                expect(root.Children).toHaveLength(0);
                expect(filters.filter((f) => f.startsWith('Notes'))).toEqual([]);
            });
        });

        it('follows hierarchy self-references only when FollowHierarchies is true', async () => {
            const hierarchyEntity: Partial<EntityInfo> = {
                ID: 'ent-hier-id',
                Name: 'Folder',
                TrackRecordChanges: true,
                PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
                FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
                Fields: [
                    { Name: 'ID', PrimaryKey: true } as EntityFieldInfo,
                    {
                        Name: 'ParentFolderID',
                        RelatedEntityID: 'ent-hier-id',
                        IsHierarchy: true,
                    } as EntityFieldInfo,
                ],
                RelatedEntities: [],
            };

            const hierProvider: IMetadataProvider = {
                Entities: [hierarchyEntity as EntityInfo],
                EntityByName: () => hierarchyEntity as EntityInfo,
                EntityByID: () => hierarchyEntity as EntityInfo,
            } as IMetadataProvider;

            const { CompositeKey } = await import('@memberjunction/core');
            const folderKey = new CompositeKey([{ FieldName: 'ID', Value: 'child-folder' }]);

            // First: FollowHierarchies = false
            mockRunViewInstance.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'child-folder', ParentFolderID: 'parent-folder' }],
            });

            const walker1 = new DependencyGraphWalker(hierProvider);
            const node1 = await walker1.WalkDependents(
                'Folder',
                folderKey,
                { FollowHierarchies: false },
                mockUser
            );
            expect(node1.Children.length).toBe(0);

            // Second: FollowHierarchies = true
            mockRunViewInstance
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'child-folder', ParentFolderID: 'parent-folder' }],
                })
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'parent-folder', ParentFolderID: null }],
                });

            const walker2 = new DependencyGraphWalker(hierProvider);
            const node2 = await walker2.WalkDependents(
                'Folder',
                folderKey,
                { FollowHierarchies: true },
                mockUser
            );
            expect(node2.Children.length).toBe(1);
            expect(node2.Children[0]?.DiscoveringEdge?.Kind).toBe('Hierarchy');
        });
    });
});
