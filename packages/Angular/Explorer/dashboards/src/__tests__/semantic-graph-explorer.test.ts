import '@angular/compiler'; // JIT support — component barrel import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCdr = vi.hoisted(() => ({
    markForCheck: vi.fn(),
    detectChanges: vi.fn(),
    checkNoChanges: vi.fn(),
    detach: vi.fn(),
    reattach: vi.fn(),
}));

vi.mock('@angular/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@angular/core')>();
    return {
        ...actual,
        inject: (token: { name?: string }) => {
            if (token?.name === 'ChangeDetectorRef') return mockCdr;
            return {};
        },
    };
});

import { AuthorizationInfo, AuthorizationRoleInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GRAPH_APPROVE_EDGES_AUTHORIZATION, type MJGraphConceptEntity } from '@memberjunction/core-entities';
import {
    DEFAULT_GRAPH_CATEGORIES,
    GraphNode,
    GraphEdge,
    GraphCategoryConfig,
    GraphViewComponent,
    BeforeNodeActionEventArgs,
    NodeActionEventArgs,
} from '@memberjunction/ng-graph-view';
import { DEFAULT_SEMANTIC_GRAPH_CATEGORIES, SemanticGraphExplorerComponent } from '../KnowledgeHub/components/visualize/semantic-graph/semantic-graph-explorer.component';
import {
    VISUALIZATION_MODES,
    IsValidVisualizationMode,
    BuildVisualizeAgentContext,
    VisualizeAgentContextInput,
} from '../KnowledgeHub/components/visualize/visualize-agent-context';

describe('Semantic Graph & Canon Explorer + @memberjunction/ng-graph-view extensions', () => {
    describe('DEFAULT_SEMANTIC_GRAPH_CATEGORIES & DEFAULT_GRAPH_CATEGORIES', () => {
        it('includes the seeded GraphConceptType categories with Rank ordering in DEFAULT_SEMANTIC_GRAPH_CATEGORIES', () => {
            const byCategory = new Map<string, GraphCategoryConfig>(
                DEFAULT_SEMANTIC_GRAPH_CATEGORIES.map((c) => [c.Category, c]),
            );

            expect(byCategory.get('Policy')?.Rank).toBe(10);
            expect(byCategory.get('Metric')?.Rank).toBe(20);
            expect(byCategory.get('Process')?.Rank).toBe(30);
            expect(byCategory.get('Role')?.Rank).toBe(40);
            expect(byCategory.get('Domain')?.Rank).toBe(50);
            expect(byCategory.get('Term')?.Rank).toBe(60);
            expect(byCategory.get('grounding')?.Rank).toBe(90);
            expect(byCategory.get('chunk')?.Rank).toBe(95);
        });

        it('preserves standard entity relationship categories for generic graph consumers in DEFAULT_GRAPH_CATEGORIES', () => {
            const categories = DEFAULT_GRAPH_CATEGORIES.map((c) => c.Category);
            expect(categories).toContain('person');
            expect(categories).toContain('organization');
            expect(categories).toContain('committee');
            expect(categories).toContain('account');
            expect(categories).toContain('asset');
            expect(categories).toContain('group');
            expect(categories).toContain('custom');
        });
    });

    describe('GraphNode & GraphEdge semantic extensions', () => {
        it('supports AuthorityTier, Status, Rank, Conflicts, Groundings, and ProvenanceChunks on GraphNode', () => {
            const node: GraphNode = {
                ID: 'concept-arr-001',
                Label: 'Annual Recurring Revenue (ARR)',
                Sublabel: 'Metric · Approved',
                Category: 'Metric',
                Status: 'Approved',
                AuthorityTier: 'Bylaws (100)',
                Rank: 20,
                Description: 'Annualized value of active recurring subscription contracts.',
                Specification: 'SUM(Contract.MonthlyValue * 12) WHERE Contract.Status = Active',
                Conflicts: [
                    {
                        EdgeID: 'edge-conflict-1',
                        HigherAuthoritySummary: 'Finance Governance Charter v4.2 · §2.1 — excludes non-recurring services',
                        ConflictingSummary: 'Legacy Sales Handbook p.14 — includes implementation fees',
                        ResolutionNote: 'Bylaws/Charter (Tier 100) supersedes Handbook (Tier 20)',
                    },
                ],
                Groundings: [
                    {
                        EdgeLabel: 'Measures',
                        TargetEntityName: 'MJ: Queries',
                        TargetRecordID: 'query-arr-by-segment',
                        TargetDisplayName: 'ARR by Customer Segment',
                    },
                ],
                ProvenanceChunks: [
                    {
                        ChunkID: 'chunk-finance-charter-1',
                        SourceName: 'Finance Governance Charter v4.2',
                        Locator: 'Article II > §2.1',
                        AuthorityTier: 'Bylaws',
                        Snippet: 'ARR strictly excludes non-recurring implementation fees.',
                    },
                ],
            };

            expect(node.AuthorityTier).toBe('Bylaws (100)');
            expect(node.Status).toBe('Approved');
            expect(node.Rank).toBe(20);
            expect(node.Conflicts).toHaveLength(1);
            expect(node.Groundings).toHaveLength(1);
            expect(node.ProvenanceChunks).toHaveLength(1);
        });

        it('supports animated dashed Contradicts edges and cancelable BeforeNodeAction events', () => {
            const conflictEdge: GraphEdge = {
                ID: 'edge-conflict-1',
                SourceID: 'concept-legacy-arr',
                TargetID: 'concept-arr-001',
                Label: 'Contradicts',
                Direction: 'directed',
                Style: 'dashed',
                Color: '#ef4444',
                Animated: true,
            };

            expect(conflictEdge.Style).toBe('dashed');
            expect(conflictEdge.Animated).toBe(true);
            expect(conflictEdge.Direction).toBe('directed');

            const beforeArgs: BeforeNodeActionEventArgs = {
                Cancel: false,
                Node: {
                    ID: 'concept-proposed-1',
                    Label: 'Net Retention Rate (NRR)',
                    Category: 'Metric',
                    Status: 'Proposed',
                },
                Action: 'approve',
            };
            const afterArgs: NodeActionEventArgs = {
                Node: beforeArgs.Node,
                Action: beforeArgs.Action,
            };
            expect(beforeArgs.Cancel).toBe(false);
            expect(afterArgs.Action).toBe('approve');
        });
    });

    describe('Visualize mode integration', () => {
        it('registers graph mode in VISUALIZATION_MODES and BuildVisualizeAgentContext', () => {
            expect(VISUALIZATION_MODES).toEqual(['clusters', 'tagcloud', 'graph']);
            expect(IsValidVisualizationMode('graph')).toBe(true);
            const state: VisualizeAgentContextInput = {
                ActiveMode: 'graph',
                AvailableModes: ['clusters', 'tagcloud', 'graph'],
                DrilldownVisible: true,
                DrilldownLoading: false,
                DrilldownTitle: 'Annual Recurring Revenue (ARR)',
                DrilldownSubtitle: '3 grounded primitives',
                DrilldownRecords: [
                    {
                        RecordID: 'query-arr-by-segment',
                        Title: 'ARR by Customer Segment',
                        Subtitle: 'MJ: Queries',
                    },
                ],
            };
            const ctx = BuildVisualizeAgentContext(state);
            expect(ctx['ActiveVisualizationMode']).toBe('graph');
            expect(ctx['AvailableVisualizationModes']).toEqual(['clusters', 'tagcloud', 'graph']);
            expect(ctx['DrilldownRecordCount']).toBe(1);
        });
    });

    describe('Workstream 5a approval gating on GraphViewComponent & SemanticGraphExplorerComponent', () => {
        const APPROVE_AUTH_ID = 'F1000001-0000-0000-0000-000000000001';
        const STAFF_ROLE_ID = 'F1000002-0000-0000-0000-000000000001';
        const CURATOR_ROLE_ID = 'F1000002-0000-0000-0000-000000000002';

        function makeUser(id: string, roleId: string): UserInfo {
            return {
                ID: id,
                Name: id,
                Email: `${id}@example.com`,
                Type: 'User',
                UserRoles: [{ UserID: id, RoleID: roleId, RoleName: roleId }],
            } as unknown as UserInfo;
        }

        function makeProvider(user: UserInfo, saveMock: ReturnType<typeof vi.fn>): IMetadataProvider {
            const owningProvider = {
                AuthorizationRoles: [
                    new AuthorizationRoleInfo({ ID: 'ar-ui-1', AuthorizationID: APPROVE_AUTH_ID, RoleID: CURATOR_ROLE_ID, Type: 'Allow' }),
                ],
            } as unknown as IMetadataProvider;
            const auths = [
                new AuthorizationInfo({ ID: APPROVE_AUTH_ID, Name: GRAPH_APPROVE_EDGES_AUTHORIZATION, ParentID: null, IsActive: true }, owningProvider),
            ];
            return {
                CurrentUser: user,
                Authorizations: auths,
                GetEntityObject: async (): Promise<MJGraphConceptEntity> =>
                    ({
                        Status: 'Proposed',
                        Load: vi.fn().mockResolvedValue(true),
                        Save: saveMock,
                        LatestResult: { CompleteMessage: 'refused' },
                    }) as unknown as MJGraphConceptEntity,
            } as unknown as IMetadataProvider;
        }

        const proposedNode: GraphNode = {
            ID: 'C0000001-0000-0000-0000-000000000001',
            Label: 'Grace Period',
            Category: 'Policy',
            Status: 'Proposed',
        };

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('defaults GraphViewComponent.CanApproveNodes to false and blocks approve actions until enabled', () => {
            const view = new GraphViewComponent();
            expect(view.CanApproveNodes).toBe(false);

            const emitted: NodeActionEventArgs[] = [];
            view.NodeAction.subscribe((e) => emitted.push(e));

            view.TriggerNodeAction(proposedNode, 'approve');
            expect(emitted).toHaveLength(0);

            view.CanApproveNodes = true;
            view.TriggerNodeAction(proposedNode, 'approve');
            expect(emitted).toHaveLength(1);
            expect(emitted[0].Action).toBe('approve');
        });

        it('allows sample graph preview approval, denies unauthorized DB approvals, and allows authorized curators', async () => {
            const staffSave = vi.fn().mockResolvedValue(true);
            const explorer = new SemanticGraphExplorerComponent();
            explorer.SelectedGraphID = 'G1';
            explorer.GraphOptions = [
                {
                    ID: 'G1',
                    Name: 'Real Org Graph',
                    Description: '',
                    GraphTypeID: 'GT-CANON',
                    GraphTypeName: 'Canon',
                    IsCanon: true,
                    GraphTypeRank: 1,
                    IconClass: 'fa-solid fa-diagram-project',
                    ConceptCount: 1,
                    ConflictCount: 0,
                    SourceNames: ['Source 1'],
                    IsSample: false,
                },
                {
                    ID: 'G-SAMPLE',
                    Name: 'Sample Graph',
                    Description: '',
                    GraphTypeID: 'GT-CANON',
                    GraphTypeName: 'Canon',
                    IsCanon: true,
                    GraphTypeRank: 1,
                    IconClass: 'fa-solid fa-diagram-project',
                    ConceptCount: 1,
                    ConflictCount: 0,
                    SourceNames: [],
                    IsSample: true,
                },
            ];
            explorer.Provider = makeProvider(makeUser('u-staff', STAFF_ROLE_ID), staffSave);

            expect(explorer.CanApproveSelectedGraph).toBe(false);
            await explorer.OnNodeAction({ Node: { ...proposedNode }, Action: 'approve' });
            expect(staffSave).not.toHaveBeenCalled();
            expect(explorer.ActionError).toContain(GRAPH_APPROVE_EDGES_AUTHORIZATION);

            // Sample preview stays interactive without DB authorization
            explorer.SelectedGraphID = 'G-SAMPLE';
            expect(explorer.CanApproveSelectedGraph).toBe(true);
            const sampleNode: GraphNode = { ID: 'sample-concept-1', Label: 'Sample', Category: 'Term', Status: 'Proposed' };
            await explorer.OnNodeAction({ Node: sampleNode, Action: 'approve' });
            expect(sampleNode.Status).toBe('Approved');
            expect(staffSave).not.toHaveBeenCalled();

            // Curator with Graph: Approve Edges proceeds to entity Load + Save on real graph
            const curatorSave = vi.fn().mockResolvedValue(true);
            explorer.SelectedGraphID = 'G1';
            explorer.Provider = makeProvider(makeUser('u-curator', CURATOR_ROLE_ID), curatorSave);
            expect(explorer.CanApproveSelectedGraph).toBe(true);
            const dbNode = { ...proposedNode };
            await explorer.OnNodeAction({ Node: dbNode, Action: 'approve' });
            expect(curatorSave).toHaveBeenCalledTimes(1);
            expect(dbNode.Status).toBe('Approved');
            expect(explorer.ActionError).toBeNull();
        });
    });
});
