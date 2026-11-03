import '@angular/compiler'; // JIT support — component barrel import evaluates Angular decorators in vitest's node env
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_GRAPH_CATEGORIES,
    GraphNode,
    GraphEdge,
    GraphCategoryConfig,
    BeforeNodeActionEventArgs,
    NodeActionEventArgs,
} from '@memberjunction/ng-graph-view';
import {
    VISUALIZATION_MODES,
    IsValidVisualizationMode,
    BuildVisualizeAgentContext,
    VisualizeAgentContextInput,
} from '../KnowledgeHub/components/visualize/visualize-agent-context';

describe('Semantic Graph & Canon Explorer + @memberjunction/ng-graph-view extensions', () => {
    describe('DEFAULT_GRAPH_CATEGORIES', () => {
        it('includes the seeded GraphConceptType categories with Rank ordering', () => {
            const byCategory = new Map<string, GraphCategoryConfig>(
                DEFAULT_GRAPH_CATEGORIES.map((c) => [c.Category, c]),
            );

            expect(byCategory.get('Policy')?.Rank).toBe(10);
            expect(byCategory.get('Metric')?.Rank).toBe(20);
            expect(byCategory.get('Process')?.Rank).toBe(30);
            expect(byCategory.get('Role')?.Rank).toBe(40);
            expect(byCategory.get('Domain')?.Rank).toBe(50);
            expect(byCategory.get('Term')?.Rank).toBe(60);
        });

        it('preserves standard entity relationship and grounding categories for generic graph consumers', () => {
            const categories = DEFAULT_GRAPH_CATEGORIES.map((c) => c.Category);
            expect(categories).toContain('person');
            expect(categories).toContain('organization');
            expect(categories).toContain('committee');
            expect(categories).toContain('account');
            expect(categories).toContain('asset');
            expect(categories).toContain('group');
            expect(categories).toContain('grounding');
            expect(categories).toContain('chunk');
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
                Timestamp: new Date(),
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
});
