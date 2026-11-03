/**
 * @fileoverview Knowledge Hub Semantic Graph & Canon Explorer (Visualize > Graphs & Canon mode)
 *
 * Interactive 2-pane workspace built on `@memberjunction/ng-graph-view` (`<mj-graph-view>`)
 * for exploring `MJ: Graphs` (grouped by `MJ: Graph Types` and `IsCanon`), ranked
 * `MJ: Graph Concept Types` (`Policy #10`, `Metric #20`, `Process #30`, `Role #40`,
 * `Domain #50`, `Term #60`), `MJ: Graph Concepts`, grounded MJ primitives, source
 * provenance chunks (`SourcedFrom`), and cross-source authority conflicts (`Contradicts`).
 */

import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    OnInit,
    inject,
} from '@angular/core';
import { IMetadataProvider, RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type {
    MJGraphTypeEntity,
    MJGraphConceptTypeEntity,
    MJGraphEntity,
    MJGraphConceptEntity,
    MJGraphEdgeEntity,
} from '@memberjunction/core-entities';
import {
    DEFAULT_GRAPH_CATEGORIES,
    type GraphNode,
    type GraphEdge,
    type GraphCategoryConfig,
    type GraphLayoutMode,
    type GraphConflictItem,
    type GraphGroundingItem,
    type GraphProvenanceChunkItem,
    type NodeNavigatedEventArgs,
    type NodeActionEventArgs,
    type NodeSelectedEventArgs,
} from '@memberjunction/ng-graph-view';

/** Summary of a selectable `MJ: Graphs` partition in the left rail. */
export interface SemanticGraphOption {
    ID: string;
    Name: string;
    Description: string;
    GraphTypeID: string;
    GraphTypeName: string;
    IsCanon: boolean;
    GraphTypeRank: number;
    IconClass: string;
    ConceptCount: number;
    ConflictCount: number;
    SourceNames: string[];
    IsSample?: boolean;
}

/** Ranked `MJ: Graph Concept Types` filter pill descriptor. */
export interface ConceptTypeFilterOption {
    ID: string;
    Name: string;
    Rank: number;
    IconClass: string;
    Color: string;
    Count: number;
}

/** Request to open an underlying MJ entity record in Explorer. */
export interface GraphRecordOpenRequest {
    EntityName: string;
    RecordID: string;
}

/** Emitted when a concept node is selected so the host can update agent context or drilldown. */
export interface GraphConceptSelection {
    NodeID: string;
    Label: string;
    ConceptType: string;
    Status: string;
    AuthorityTier: string;
    ConnectedChunkCount: number;
    ConflictCount: number;
}

const SAMPLE_GRAPH_ID = 'D1000000-0000-4000-8000-000000000004';

const CONCEPT_TYPE_COLORS: Record<string, string> = {
    policy: '#f43f5e',
    metric: '#10b981',
    process: '#8b5cf6',
    role: '#f59e0b',
    domain: '#3b82f6',
    term: '#06b6d4',
};

@Component({
    standalone: false,
    selector: 'app-kh-semantic-graph',
    templateUrl: './semantic-graph-explorer.component.html',
    styleUrls: ['./semantic-graph-explorer.component.css'],
})
export class SemanticGraphExplorerComponent extends BaseAngularComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    @Input() override Provider: IMetadataProvider | null = null;

    /** Emitted when the user requests to open an entity record from the graph or inspector. */
    @Output() OpenRecordRequested = new EventEmitter<GraphRecordOpenRequest>();

    /** Emitted when a graph node is selected on canvas. */
    @Output() ConceptSelected = new EventEmitter<GraphConceptSelection>();

    // ================================================================
    // State
    // ================================================================

    public IsLoading = true;
    public GraphOptions: SemanticGraphOption[] = [];
    public ConceptTypeOptions: ConceptTypeFilterOption[] = [];
    public SelectedGraphID = '';
    public OnlyCanonGraphs = false;
    public ActiveConceptTypeFilter: string | null = null;
    public LayoutMode: GraphLayoutMode = 'force';

    /** Edge / Node Overlay Toggles */
    public ShowGroundedPrimitives = true;
    public ShowSourceChunks = true;
    public HighlightConflicts = true;

    /** Raw & Filtered Graph Data passed to <mj-graph-view> */
    private rawNodes: GraphNode[] = [];
    private rawEdges: GraphEdge[] = [];
    public Nodes: GraphNode[] = [];
    public Edges: GraphEdge[] = [];
    public Categories: GraphCategoryConfig[] = [...DEFAULT_GRAPH_CATEGORIES];
    public SelectedNodeId?: string;

    // ================================================================
    // Lifecycle
    // ================================================================

    async ngOnInit(): Promise<void> {
        await this.LoadGraphCatalog();
    }

    // ================================================================
    // Public Getters & Actions
    // ================================================================

    public get VisibleGraphOptions(): SemanticGraphOption[] {
        if (!this.OnlyCanonGraphs) {
            return this.GraphOptions;
        }
        return this.GraphOptions.filter(g => g.IsCanon);
    }

    public get SelectedGraph(): SemanticGraphOption | undefined {
        return this.GraphOptions.find(g => UUIDsEqual(g.ID, this.SelectedGraphID));
    }

    public async SelectGraph(graphId: string): Promise<void> {
        if (UUIDsEqual(this.SelectedGraphID, graphId)) {
            return;
        }
        this.SelectedGraphID = graphId;
        this.ActiveConceptTypeFilter = null;
        await this.LoadSelectedGraphData();
    }

    public ToggleCanonFilter(): void {
        this.OnlyCanonGraphs = !this.OnlyCanonGraphs;
        const visible = this.VisibleGraphOptions;
        if (visible.length > 0 && !visible.some(g => UUIDsEqual(g.ID, this.SelectedGraphID))) {
            void this.SelectGraph(visible[0].ID);
        } else {
            this.cdr.detectChanges();
        }
    }

    public ToggleConceptTypeFilter(typeName: string | null): void {
        if (!typeName || (this.ActiveConceptTypeFilter && this.ActiveConceptTypeFilter.toLowerCase() === typeName.toLowerCase())) {
            this.ActiveConceptTypeFilter = null;
        } else {
            this.ActiveConceptTypeFilter = typeName;
        }
        this.rebuildConceptTypeCounts();
        this.cdr.detectChanges();
    }

    public OnCategoryFilterChangedFromCanvas(category: string | null): void {
        this.ActiveConceptTypeFilter = category;
        this.cdr.detectChanges();
    }

    public OnOverlayToggleChanged(): void {
        this.applyOverlayFilters();
        this.cdr.detectChanges();
    }

    public CreateNewGraphRecord(): void {
        if (this.SelectedGraph && !this.SelectedGraph.IsSample) {
            this.OpenRecordRequested.emit({
                EntityName: 'MJ: Graphs',
                RecordID: this.SelectedGraph.ID,
            });
        }
    }

    public OnNodeSelected(event: NodeSelectedEventArgs): void {
        const node = event.Node;
        this.SelectedNodeId = node.ID;
        this.ConceptSelected.emit({
            NodeID: node.ID,
            Label: node.Label,
            ConceptType: String(node.Category),
            Status: String(node.Status ?? 'Approved'),
            AuthorityTier: String(node.AuthorityTier ?? 'Reference'),
            ConnectedChunkCount: node.ProvenanceChunks?.length ?? 0,
            ConflictCount: node.Conflicts?.length ?? 0,
        });
    }

    public OnNodeNavigated(event: NodeNavigatedEventArgs): void {
        const entityName = event.EntityName || String(event.Node.Data?.['EntityName'] ?? 'MJ: Graph Concepts');
        const recordId = event.RecordID || String(event.Node.Data?.['RecordID'] ?? event.Node.ID);
        if (entityName && recordId && !recordId.startsWith('sample-')) {
            this.OpenRecordRequested.emit({ EntityName: entityName, RecordID: recordId });
        }
    }

    public async OnNodeAction(event: NodeActionEventArgs): Promise<void> {
        if (event.Action === 'approve') {
            const node = event.Node;
            node.Status = 'Approved';
            if (!node.ID.startsWith('sample-')) {
                try {
                    const provider = this.ProviderToUse;
                    const conceptEntity = await provider.GetEntityObject<MJGraphConceptEntity>(
                        'MJ: Graph Concepts',
                        provider.CurrentUser,
                    );
                    if (await conceptEntity.Load(node.ID)) {
                        conceptEntity.Status = 'Approved';
                        await conceptEntity.Save();
                    }
                } catch (err) {
                    console.warn('[SemanticGraphExplorer] Failed to persist concept approval:', err);
                }
            }
            this.Nodes = [...this.Nodes];
            this.cdr.detectChanges();
        }
    }

    // ================================================================
    // Data Loading (MJ: Graph Types, MJ: Graph Concept Types, MJ: Graphs)
    // ================================================================

    public async LoadGraphCatalog(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const provider = this.ProviderToUse;
            const rv = RunView.FromMetadataProvider(provider);
            const user = provider.CurrentUser;

            const [graphTypesRes, conceptTypesRes, graphsRes, sourcesRes] = await Promise.all([
                rv.RunView<MJGraphTypeEntity>({
                    EntityName: 'MJ: Graph Types',
                    ExtraFilter: `Status = 'Active'`,
                    OrderBy: 'Rank ASC, Name ASC',
                    ResultType: 'simple',
                }, user),
                rv.RunView<MJGraphConceptTypeEntity>({
                    EntityName: 'MJ: Graph Concept Types',
                    ExtraFilter: `Status = 'Active'`,
                    OrderBy: 'Rank ASC, Name ASC',
                    ResultType: 'simple',
                }, user),
                rv.RunView<MJGraphEntity>({
                    EntityName: 'MJ: Graphs',
                    ExtraFilter: `Status = 'Active'`,
                    OrderBy: 'Name ASC',
                    ResultType: 'simple',
                }, user),
                rv.RunView<{ ID: string; Name: string; GraphID: string | null }>({
                    EntityName: 'MJ: Content Sources',
                    Fields: ['ID', 'Name', 'GraphID'],
                    ResultType: 'simple',
                }, user),
            ]);

            const graphTypesById = new Map<string, MJGraphTypeEntity>();
            for (const gt of graphTypesRes.Results ?? []) {
                graphTypesById.set(NormalizeUUID(gt.ID), gt);
            }

            const conceptTypes = conceptTypesRes.Results ?? [];
            this.ConceptTypeOptions = conceptTypes.length > 0
                ? conceptTypes.map(ct => ({
                    ID: ct.ID,
                    Name: ct.Name,
                    Rank: ct.Rank ?? 100,
                    IconClass: ct.IconClass || 'fa-solid fa-circle-dot',
                    Color: this.resolveConceptTypeColor(ct.Name),
                    Count: 0,
                }))
                : this.buildDefaultConceptTypeOptions();

            this.Categories = [
                ...this.ConceptTypeOptions.map(ct => ({
                    Category: ct.Name,
                    Label: ct.Name,
                    Color: ct.Color,
                    IconClass: ct.IconClass,
                    Rank: ct.Rank,
                })),
                { Category: 'grounding', Label: 'Grounded Primitive', Color: '#14b8a6', IconClass: 'fa-solid fa-bolt', Rank: 90 },
                { Category: 'chunk', Label: 'Source Chunk', Color: '#64748b', IconClass: 'fa-solid fa-file-lines', Rank: 95 },
            ];

            const sourcesByGraphId = new Map<string, string[]>();
            for (const src of sourcesRes.Results ?? []) {
                if (src.GraphID) {
                    const key = NormalizeUUID(src.GraphID);
                    const list = sourcesByGraphId.get(key) ?? [];
                    list.push(src.Name || 'Untitled Source');
                    sourcesByGraphId.set(key, list);
                }
            }

            const dbGraphs = graphsRes.Results ?? [];
            const options: SemanticGraphOption[] = dbGraphs.map(g => {
                const gt = graphTypesById.get(NormalizeUUID(g.GraphTypeID));
                return {
                    ID: g.ID,
                    Name: g.Name,
                    Description: g.Description ?? '',
                    GraphTypeID: g.GraphTypeID,
                    GraphTypeName: gt?.Name ?? g.GraphType ?? 'Custom',
                    IsCanon: Boolean(gt?.IsCanon ?? (g.GraphType === 'Canon')),
                    GraphTypeRank: gt?.Rank ?? 100,
                    IconClass: gt?.IconClass || 'fa-solid fa-diagram-project',
                    ConceptCount: 0,
                    ConflictCount: 0,
                    SourceNames: sourcesByGraphId.get(NormalizeUUID(g.ID)) ?? [],
                };
            }).sort((a, b) => a.GraphTypeRank - b.GraphTypeRank || a.Name.localeCompare(b.Name));

            // Ensure the rich Association Governance Canon graph is available even on a fresh database
            const existingAssoc = options.find(o => UUIDsEqual(o.ID, SAMPLE_GRAPH_ID));
            if (existingAssoc) {
                existingAssoc.ConceptCount = 5;
                existingAssoc.ConflictCount = 1;
                if (existingAssoc.SourceNames.length === 0) {
                    existingAssoc.SourceNames = ['Association Bylaws (PDF)', 'Finance & Dues SOPs', 'Staff Desk Manual'];
                }
            } else {
                options.push(this.buildSampleGraphOption());
            }

            this.GraphOptions = options;
            if (!this.SelectedGraphID || !this.GraphOptions.some(o => UUIDsEqual(o.ID, this.SelectedGraphID))) {
                this.SelectedGraphID = this.GraphOptions[0].ID;
            }

            await this.LoadSelectedGraphData();
        } catch (err) {
            console.warn('[SemanticGraphExplorer] Falling back to sample graph:', err);
            this.ConceptTypeOptions = this.buildDefaultConceptTypeOptions();
            this.GraphOptions = [this.buildSampleGraphOption()];
            this.SelectedGraphID = SAMPLE_GRAPH_ID;
            await this.LoadSelectedGraphData();
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    public async LoadSelectedGraphData(): Promise<void> {
        const selected = this.SelectedGraph;
        if (!selected || selected.IsSample || UUIDsEqual(selected.ID, SAMPLE_GRAPH_ID)) {
            this.loadSampleCanonGraphNodesAndEdges();
            this.applyOverlayFilters();
            this.rebuildConceptTypeCounts();
            this.cdr.detectChanges();
            return;
        }

        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const provider = this.ProviderToUse;
            const rv = RunView.FromMetadataProvider(provider);
            const user = provider.CurrentUser;
            const safeGraphId = selected.ID.replace(/'/g, "''");

            const [conceptsRes, edgesRes] = await Promise.all([
                rv.RunView<MJGraphConceptEntity>({
                    EntityName: 'MJ: Graph Concepts',
                    ExtraFilter: `GraphID = '${safeGraphId}'`,
                    OrderBy: 'Name ASC',
                    MaxRows: 500,
                    ResultType: 'simple',
                }, user),
                rv.RunView<MJGraphEdgeEntity>({
                    EntityName: 'MJ: Graph Edges',
                    ExtraFilter: `GraphID = '${safeGraphId}'`,
                    MaxRows: 1000,
                    ResultType: 'simple',
                }, user),
            ]);

            const concepts = conceptsRes.Results ?? [];
            const edges = edgesRes.Results ?? [];

            if (concepts.length === 0 && edges.length === 0) {
                this.rawNodes = [];
                this.rawEdges = [];
                selected.ConceptCount = 0;
                selected.ConflictCount = 0;
                this.applyOverlayFilters();
                this.rebuildConceptTypeCounts();
                return;
            }

            const rankByTypeName = new Map<string, number>();
            for (const ct of this.ConceptTypeOptions) {
                rankByTypeName.set(ct.Name.toLowerCase(), ct.Rank);
            }

            const nodes: GraphNode[] = concepts.map(c => {
                const typeName = c.ConceptType || 'Term';
                const rank = rankByTypeName.get(typeName.toLowerCase()) ?? 60;
                return {
                    ID: c.ID,
                    Label: c.Name,
                    Sublabel: `${typeName} · ${c.AuthorityTier}`,
                    Category: typeName,
                    Rank: rank,
                    Badge: `#${rank}`,
                    Status: c.Status,
                    AuthorityTier: `${c.AuthorityTier}`,
                    ParentID: c.ParentID,
                    Description: c.Description,
                    Specification: c.Specification ?? undefined,
                    Conflicts: [],
                    Groundings: [],
                    ProvenanceChunks: [],
                    Data: {
                        EntityName: 'MJ: Graph Concepts',
                        RecordID: c.ID,
                    },
                };
            });

            const nodeById = new Map<string, GraphNode>();
            for (const n of nodes) {
                nodeById.set(NormalizeUUID(n.ID), n);
            }

            const graphEdges: GraphEdge[] = [];
            let conflictCount = 0;

            for (const e of edges) {
                const edgeLabel = e.EdgeType || 'Related To';
                const isConflict = edgeLabel.toLowerCase().includes('contradict');
                if (isConflict) {
                    conflictCount++;
                }

                // Ensure synthetic endpoint nodes exist for non-concept endpoints (chunks or grounded MJ entities)
                const srcKey = NormalizeUUID(e.SourceRecordID);
                const tgtKey = NormalizeUUID(e.TargetRecordID);

                if (!nodeById.has(srcKey)) {
                    const synth = this.createSyntheticEndpointNode(e.SourceEntity || 'Record', e.SourceRecordID, edgeLabel);
                    nodes.push(synth);
                    nodeById.set(srcKey, synth);
                }
                if (!nodeById.has(tgtKey)) {
                    const synth = this.createSyntheticEndpointNode(e.TargetEntity || 'Record', e.TargetRecordID, edgeLabel);
                    nodes.push(synth);
                    nodeById.set(tgtKey, synth);
                }

                const srcNode = nodeById.get(srcKey)!;
                const tgtNode = nodeById.get(tgtKey)!;

                if (edgeLabel === 'Defines' || edgeLabel === 'Describes' || edgeLabel === 'Measures' || edgeLabel === 'Implements') {
                    srcNode.Groundings = srcNode.Groundings ?? [];
                    srcNode.Groundings.push({
                        EdgeLabel: edgeLabel,
                        TargetEntityName: e.TargetEntity || 'MJ: Entities',
                        TargetRecordID: e.TargetRecordID,
                        TargetDisplayName: `${e.TargetEntity || 'Entity'}: ${tgtNode.Label}`,
                    });
                } else if (edgeLabel === 'SourcedFrom') {
                    srcNode.ProvenanceChunks = srcNode.ProvenanceChunks ?? [];
                    srcNode.ProvenanceChunks.push({
                        ChunkID: e.TargetRecordID,
                        SourceName: e.TargetEntity || 'MJ: Content Item Chunks',
                        Snippet: `Chunk ${e.TargetRecordID.slice(0, 8)} (Confidence: ${Math.round((e.Confidence ?? 1) * 100)}%)`,
                    });
                } else if (isConflict) {
                    const conflictItem: GraphConflictItem = {
                        HigherAuthoritySummary: srcNode.Label,
                        ConflictingSummary: tgtNode.Label,
                        ResolutionNote: 'Flagged by Contradicts edge for steward review.',
                        EdgeID: e.ID,
                    };
                    srcNode.Conflicts = [...(srcNode.Conflicts ?? []), conflictItem];
                    tgtNode.Conflicts = [...(tgtNode.Conflicts ?? []), conflictItem];
                }

                graphEdges.push({
                    ID: e.ID,
                    SourceID: e.SourceRecordID,
                    TargetID: e.TargetRecordID,
                    Label: edgeLabel,
                    Direction: 'directed',
                    Weight: e.Weight ?? 1,
                    Style: isConflict ? 'dashed' : (edgeLabel === 'SourcedFrom' ? 'dotted' : 'solid'),
                    Color: isConflict ? '#f43f5e' : undefined,
                    Animated: isConflict,
                });
            }

            selected.ConceptCount = concepts.length;
            selected.ConflictCount = conflictCount;
            this.rawNodes = nodes;
            this.rawEdges = graphEdges;
            this.applyOverlayFilters();
            this.rebuildConceptTypeCounts();
        } catch (err) {
            console.error('[SemanticGraphExplorer] Error loading graph data:', err);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ================================================================
    // Private Helpers & Sample Canon Graph
    // ================================================================

    private applyOverlayFilters(): void {
        const filteredNodes = this.rawNodes.filter(n => {
            if (!this.ShowGroundedPrimitives && n.Category === 'grounding') {
                return false;
            }
            if (!this.ShowSourceChunks && n.Category === 'chunk') {
                return false;
            }
            return true;
        });

        const visibleNodeIds = new Set(filteredNodes.map(n => NormalizeUUID(n.ID)));
        const filteredEdges = this.rawEdges.filter(e => {
            if (!visibleNodeIds.has(NormalizeUUID(e.SourceID)) || !visibleNodeIds.has(NormalizeUUID(e.TargetID))) {
                return false;
            }
            if (!this.HighlightConflicts && e.Label.toLowerCase().includes('contradict')) {
                return false;
            }
            return true;
        });

        this.Nodes = filteredNodes;
        this.Edges = filteredEdges;
    }

    private rebuildConceptTypeCounts(): void {
        const counts = new Map<string, number>();
        for (const n of this.rawNodes) {
            const key = String(n.Category || '').toLowerCase();
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        this.ConceptTypeOptions = this.ConceptTypeOptions.map(opt => ({
            ...opt,
            Count: counts.get(opt.Name.toLowerCase()) ?? 0,
        }));
    }

    private createSyntheticEndpointNode(entityName: string, recordId: string, edgeLabel: string): GraphNode {
        const isChunk = entityName.toLowerCase().includes('chunk') || edgeLabel === 'SourcedFrom';
        return {
            ID: recordId,
            Label: isChunk ? `Chunk ${recordId.slice(0, 6)}` : `${entityName.replace(/^MJ:\s*/, '')}`,
            Sublabel: entityName,
            Category: isChunk ? 'chunk' : 'grounding',
            Badge: isChunk ? '§' : '⚡',
            Radius: 20,
            Status: 'Approved',
            Data: {
                EntityName: entityName,
                RecordID: recordId,
            },
        };
    }

    private resolveConceptTypeColor(name: string): string {
        return CONCEPT_TYPE_COLORS[name.trim().toLowerCase()] ?? '#38bdf8';
    }

    private buildDefaultConceptTypeOptions(): ConceptTypeFilterOption[] {
        return [
            { ID: 'ct-policy', Name: 'Policy', Rank: 10, IconClass: 'fa-solid fa-gavel', Color: '#f43f5e', Count: 0 },
            { ID: 'ct-metric', Name: 'Metric', Rank: 20, IconClass: 'fa-solid fa-chart-line', Color: '#10b981', Count: 0 },
            { ID: 'ct-process', Name: 'Process', Rank: 30, IconClass: 'fa-solid fa-gears', Color: '#8b5cf6', Count: 0 },
            { ID: 'ct-role', Name: 'Role', Rank: 40, IconClass: 'fa-solid fa-user-shield', Color: '#f59e0b', Count: 0 },
            { ID: 'ct-domain', Name: 'Domain', Rank: 50, IconClass: 'fa-solid fa-layer-group', Color: '#3b82f6', Count: 0 },
            { ID: 'ct-term', Name: 'Term', Rank: 60, IconClass: 'fa-solid fa-book-bookmark', Color: '#06b6d4', Count: 0 },
        ];
    }

    private buildSampleGraphOption(): SemanticGraphOption {
        return {
            ID: SAMPLE_GRAPH_ID,
            Name: 'Association Governance Canon',
            Description: 'Multi-source Canon graph illustrating ranked Concept Types, AuthorityTier precedence, grounded ABVs/Queries, and Contradicts conflict detection.',
            GraphTypeID: 'A4B9E210-1001-4C81-9A01-000000000001',
            GraphTypeName: 'Canon',
            IsCanon: true,
            GraphTypeRank: 10,
            IconClass: 'fa-solid fa-scale-balanced',
            ConceptCount: 5,
            ConflictCount: 1,
            SourceNames: ['Association Bylaws (PDF)', 'Finance & Dues SOPs', 'Staff Desk Manual'],
            IsSample: true,
        };
    }

    private loadSampleCanonGraphNodesAndEdges(): void {
        const ID_DOMAIN_GOV = 'C3000000-0000-4000-8000-000000000001';
        const ID_POLICY_GRACE = 'C3000000-0000-4000-8000-000000000002';
        const ID_METRIC_NRR = 'C3000000-0000-4000-8000-000000000003';
        const ID_PROCESS_RENEWAL = 'C3000000-0000-4000-8000-000000000004';
        const ID_ROLE_STEWARD = 'C3000000-0000-4000-8000-000000000005';
        const ID_CHUNK_BYLAWS = 'C3000000-0000-4000-8000-000000000006';
        const ID_CHUNK_MANUAL = 'C3000000-0000-4000-8000-000000000007';
        const ID_ABV_GRACE = 'B4000000-0000-4000-8000-000000000001';
        const ID_ABV_ACTIVE = 'B4000000-0000-4000-8000-000000000002';
        const ID_QUERY_RETENTION = 'B4000000-0000-4000-8000-000000000003';

        const conflictDetail: GraphConflictItem = {
            HigherAuthoritySummary: 'Association Bylaws (Article IV §4.2) — "60 days"',
            ConflictingSummary: 'Staff Desk Manual (Ch. 3 p. 42) — "90 days"',
            ResolutionNote: 'Resolved in favor of Bylaws (Rank 100 > DeptPractice 40); Contradicts edge flagged for steward review.',
        };

        const sampleChunks: GraphProvenanceChunkItem[] = [
            {
                ChunkID: ID_CHUNK_BYLAWS,
                SourceName: 'Association Bylaws PDF',
                Locator: 'Article IV > §4.2',
                AuthorityTier: 'Bylaws (100)',
                Snippet: 'A member whose dues remain unpaid 60 days after the renewal date shall be suspended.',
            },
            {
                ChunkID: ID_CHUNK_MANUAL,
                SourceName: 'Staff Desk Manual',
                Locator: 'Chapter 3 > Grace Handling',
                AuthorityTier: 'DeptPractice (40)',
                Snippet: 'Customer service reps wait 90 days before deactivating member portal access.',
            },
        ];

        const sampleGroundingsGrace: GraphGroundingItem[] = [
            {
                EdgeLabel: 'Defines',
                TargetEntityName: 'MJ: Entity Alternate Base Views',
                TargetRecordID: ID_ABV_GRACE,
                TargetDisplayName: 'MembersInGracePeriod (vwUsers)',
            },
        ];

        const sampleGroundingsMetric: GraphGroundingItem[] = [
            {
                EdgeLabel: 'Measures',
                TargetEntityName: 'MJ: Queries',
                TargetRecordID: ID_QUERY_RETENTION,
                TargetDisplayName: 'Golden Query: Annual Cohort Retention',
            },
            {
                EdgeLabel: 'Defines',
                TargetEntityName: 'MJ: Entity Alternate Base Views',
                TargetRecordID: ID_ABV_ACTIVE,
                TargetDisplayName: 'Active Subscribers (vwUsers)',
            },
        ];

        this.rawNodes = [
            {
                ID: ID_DOMAIN_GOV,
                Label: 'Membership Governance',
                Sublabel: 'Domain · Bylaws',
                Category: 'Domain',
                Rank: 50,
                Badge: '#50',
                Status: 'Approved',
                AuthorityTier: 'Bylaws (100)',
                Description: 'Umbrella governance domain for member standing, eligibility, dues billing, and suspension rules.',
                Specification: '### Scope\nCovers all active membership classes, renewal cycles, and standing transitions across national and chapter tiers.',
                Data: { EntityName: 'MJ: Graph Concepts', RecordID: ID_DOMAIN_GOV },
            },
            {
                ID: ID_POLICY_GRACE,
                Label: 'Renewal Grace Period',
                Sublabel: 'Policy · Bylaws',
                Category: 'Policy',
                Rank: 10,
                Badge: '#10',
                ParentID: ID_DOMAIN_GOV,
                Status: 'Proposed',
                AuthorityTier: 'Bylaws (100)',
                Description: 'Members have 60 calendar days after invoice due date before benefits are suspended.',
                Specification: '### Canonical Rule (Bylaws Precedence)\n- Grace Window: Strictly 60 calendar days past invoice due date.\n- Late Notice: Triggered at day 30 and day 45.\n- Overrides the 90-day informal practice in the Staff Desk Manual.',
                Conflicts: [conflictDetail],
                Groundings: sampleGroundingsGrace,
                ProvenanceChunks: sampleChunks,
                Data: { EntityName: 'MJ: Graph Concepts', RecordID: ID_POLICY_GRACE },
            },
            {
                ID: ID_METRIC_NRR,
                Label: 'Net Member Retention Rate',
                Sublabel: 'Metric · ExecutiveSOP',
                Category: 'Metric',
                Rank: 20,
                Badge: '#20',
                ParentID: ID_DOMAIN_GOV,
                Status: 'Approved',
                AuthorityTier: 'ExecutiveSOP (60)',
                Description: 'Percentage of active cohort members renewing within the 60-day grace window.',
                Specification: '### Formula\nRenewedActiveMembers / PriorPeriodActiveSubscribers * 100',
                Groundings: sampleGroundingsMetric,
                Data: { EntityName: 'MJ: Graph Concepts', RecordID: ID_METRIC_NRR },
            },
            {
                ID: ID_PROCESS_RENEWAL,
                Label: 'Dues Renewal & Escalation',
                Sublabel: 'Process · ExecutiveSOP',
                Category: 'Process',
                Rank: 30,
                Badge: '#30',
                ParentID: ID_DOMAIN_GOV,
                Status: 'Proposed',
                AuthorityTier: 'ExecutiveSOP (60)',
                Description: 'End-to-end invoice dispatch, D&B credit check, 60-day grace monitoring, and suspension workflow.',
                Specification: '### Steps\n1. Dispatch invoice 30 days prior to expiration.\n2. Run credit risk check for enterprise tiers.\n3. Enforce 60-day Renewal Grace Period.',
                Groundings: [
                    {
                        EdgeLabel: 'Defines',
                        TargetEntityName: 'MJ: Entity Alternate Base Views',
                        TargetRecordID: ID_ABV_GRACE,
                        TargetDisplayName: 'MembersInGracePeriod (vwUsers)',
                    },
                ],
                Data: { EntityName: 'MJ: Graph Concepts', RecordID: ID_PROCESS_RENEWAL },
            },
            {
                ID: ID_ROLE_STEWARD,
                Label: 'Finance Policy Steward',
                Sublabel: 'Role · Bylaws',
                Category: 'Role',
                Rank: 40,
                Badge: '#40',
                ParentID: ID_DOMAIN_GOV,
                Status: 'Approved',
                AuthorityTier: 'Bylaws (100)',
                Description: 'Designated officer authorized to approve grace waivers and canon policy updates.',
                Specification: '### Authority\nApproves Proposed GraphConcepts in the Association Core Canon and resolves Contradicts edges.',
                Data: { EntityName: 'MJ: Graph Concepts', RecordID: ID_ROLE_STEWARD },
            },
            {
                ID: ID_ABV_ACTIVE,
                Label: 'ABV: Active Subscribers',
                Sublabel: 'MJ: Entity Alternate Base Views',
                Category: 'grounding',
                Badge: '⚡',
                Radius: 21,
                Status: 'Approved',
                AuthorityTier: 'Schema Grounded',
                Description: 'Governed SQL cohort view filtering active paid members.',
                Specification: "WHERE Status = 'Active' AND PaidThroughDate >= GETUTCDATE()",
                Data: { EntityName: 'MJ: Entity Alternate Base Views', RecordID: ID_ABV_ACTIVE },
            },
            {
                ID: ID_QUERY_RETENTION,
                Label: 'Query: Cohort Retention',
                Sublabel: 'MJ: Queries',
                Category: 'grounding',
                Badge: '⚡',
                Radius: 21,
                Status: 'Approved',
                AuthorityTier: 'Schema Grounded',
                Description: 'Verified Golden Query computing trailing 12-month cohort retention.',
                Data: { EntityName: 'MJ: Queries', RecordID: ID_QUERY_RETENTION },
            },
            {
                ID: ID_CHUNK_BYLAWS,
                Label: 'Bylaws §4.2 ("60 days")',
                Sublabel: 'Association Bylaws PDF',
                Category: 'chunk',
                Badge: '§',
                Radius: 20,
                Status: 'Approved',
                AuthorityTier: 'Bylaws (100)',
                Description: 'Authoritative chunk from Association Bylaws Article IV §4.2.',
                Specification: '"A member whose dues remain unpaid 60 days after the renewal date shall be suspended from good standing."',
                Data: { EntityName: 'MJ: Graph Concepts', RecordID: ID_CHUNK_BYLAWS },
            },
            {
                ID: ID_CHUNK_MANUAL,
                Label: 'Desk Manual p.42 ("90 days")',
                Sublabel: 'Staff Desk Manual',
                Category: 'chunk',
                Badge: '§',
                Radius: 20,
                Status: 'Proposed',
                AuthorityTier: 'DeptPractice (40)',
                Description: 'Conflicting lower-authority chunk from Staff Desk Manual Ch. 3.',
                Specification: '"Customer service reps wait 90 days before deactivating member portal access."',
                Conflicts: [conflictDetail],
                Data: { EntityName: 'MJ: Graph Concepts', RecordID: ID_CHUNK_MANUAL },
            },
        ];

        this.rawEdges = [
            { ID: 'e-1', SourceID: ID_DOMAIN_GOV, TargetID: ID_POLICY_GRACE, Label: 'Broader Than', Direction: 'directed' },
            { ID: 'e-2', SourceID: ID_DOMAIN_GOV, TargetID: ID_METRIC_NRR, Label: 'Broader Than', Direction: 'directed' },
            { ID: 'e-3', SourceID: ID_DOMAIN_GOV, TargetID: ID_PROCESS_RENEWAL, Label: 'Broader Than', Direction: 'directed' },
            { ID: 'e-4', SourceID: ID_ROLE_STEWARD, TargetID: ID_POLICY_GRACE, Label: 'Governs', Direction: 'directed' },
            { ID: 'e-5', SourceID: ID_METRIC_NRR, TargetID: ID_ABV_ACTIVE, Label: 'Defines', Direction: 'directed' },
            { ID: 'e-6', SourceID: ID_METRIC_NRR, TargetID: ID_QUERY_RETENTION, Label: 'Measures', Direction: 'directed' },
            { ID: 'e-7', SourceID: ID_POLICY_GRACE, TargetID: ID_CHUNK_BYLAWS, Label: 'SourcedFrom', Direction: 'directed', Style: 'dotted' },
            { ID: 'e-8', SourceID: ID_POLICY_GRACE, TargetID: ID_CHUNK_MANUAL, Label: 'SourcedFrom', Direction: 'directed', Style: 'dotted' },
            {
                ID: 'e-conflict-1',
                SourceID: ID_CHUNK_BYLAWS,
                TargetID: ID_CHUNK_MANUAL,
                Label: 'Contradicts (60d vs 90d)',
                Direction: 'directed',
                Style: 'dashed',
                Color: '#f43f5e',
                Animated: true,
                Weight: 2.5,
            },
        ];

        this.SelectedNodeId = ID_POLICY_GRACE;
    }
}

/** Tree-shaking prevention */
export function LoadSemanticGraphExplorerComponent(): void {
    // Prevents tree-shaking of the component
}
