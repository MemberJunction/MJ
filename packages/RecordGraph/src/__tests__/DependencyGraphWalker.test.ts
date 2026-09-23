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

            mockRunViewInstance
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'parent-1' }],
                })
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'parent-1', ExtraSubtypeField: 'subtype-val' }],
                })
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [],
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
