import {
    BaseEngine,
    BaseEnginePropertyConfig,
    EntityInfo,
    IMetadataProvider,
    IRunQueryProvider,
    IRunViewProvider,
    Metadata,
    RegisterForStartup,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import {
    IndexByUUID,
    MJGlobal,
    NormalizeUUID,
    UUIDMap,
    UUIDSet,
    UUIDsEqual,
} from '@memberjunction/global';
import {
    MJGraphAuthorityTierEntity,
    MJGraphConceptEntity,
    MJGraphConceptTypeEntity,
    MJGraphEdgeEntity,
    MJGraphEdgeProviderEntity,
    MJGraphEdgeTypeEndpointEntity,
    MJGraphEdgeTypeEntity,
    MJGraphEntity,
    MJGraphTypeEntity,
} from '../generated/entity_subclasses';
import {
    BaseGraphEdgeProvider,
    BuildGraphNodeKey,
    GraphEdgeRequest,
    GraphEdgeView,
    GraphNodeRef,
    GraphNodeRefsEqual,
    GraphNodeView,
    GraphProviderContext,
    GraphSubgraphResult,
    GraphTraversalOptions,
    LoadGraphEdgeProviders,
    MatchesGraphEdgeRequest,
} from '../graph';
import { QueryEngine } from './QueryEngine';

interface PreloadedGraphMemo {
    GraphID: string;
    StoredEdgesRef: MJGraphEdgeEntity[];
    EdgeTypesRef: MJGraphEdgeTypeEntity[];
    ProvidersRef: MJGraphEdgeProviderEntity[];
    EntitiesRef: EntityInfo[];
    QueriesRef: unknown[];
    QueryEntitiesRef: unknown[];
    QueryDependenciesRef: unknown[];
    AllPreloadedEdges: GraphEdgeView[];
    StoredEdgeFieldIDs: Set<string>;
    NonEnumeratingProviders: MJGraphEdgeProviderEntity[];
}

interface FrontierCandidate {
    Node: GraphNodeRef;
    Score: number;
}

const ENTITY_ENTITIES = 'MJ: Entities';
const ENTITY_FIELDS = 'MJ: Entity Fields';
const ENTITY_ALTERNATE_BASE_VIEWS = 'MJ: Entity Alternate Base Views';
const ENTITY_QUERIES = 'MJ: Queries';
const ENTITY_GRAPH_CONCEPTS = 'MJ: Graph Concepts';
const ENTITY_GRAPH_EDGES = 'MJ: Graph Edges';

function escapeSqlLiteral(val: string): string {
    return val.replace(/'/g, "''");
}

/**
 * Semantic and knowledge graph engine for MemberJunction.
 *
 * Manages named graph partitions (`MJ: Graphs`), concept nodes (`MJ: Graph Concepts`),
 * edge types (`MJ: Graph Edge Types`), stored edges (`MJ: Graph Edges`), and derived
 * runtime edge providers (`MJ: Graph Edge Providers` / {@link BaseGraphEdgeProvider}).
 */
@RegisterForStartup()
export class GraphEngine extends BaseEngine<GraphEngine> {
    public static get Instance(): GraphEngine {
        return super.getInstance<GraphEngine>();
    }

    private _graphs: MJGraphEntity[] = [];
    private _graphTypes: MJGraphTypeEntity[] = [];
    private _conceptTypes: MJGraphConceptTypeEntity[] = [];
    private _authorityTiers: MJGraphAuthorityTierEntity[] = [];
    private _edgeTypes: MJGraphEdgeTypeEntity[] = [];
    private _edgeTypeEndpoints: MJGraphEdgeTypeEndpointEntity[] = [];
    private _edgeProviders: MJGraphEdgeProviderEntity[] = [];
    private _concepts: MJGraphConceptEntity[] = [];
    private _storedEdges: MJGraphEdgeEntity[] = [];

    private readonly _preloadedGraphMemos = new UUIDMap<PreloadedGraphMemo>();

    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        LoadGraphEdgeProviders();

        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: 'MJ: Graphs', PropertyName: '_graphs', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Types', PropertyName: '_graphTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Concept Types', PropertyName: '_conceptTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Authority Tiers', PropertyName: '_authorityTiers', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Edge Types', PropertyName: '_edgeTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Edge Type Endpoints', PropertyName: '_edgeTypeEndpoints', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Edge Providers', PropertyName: '_edgeProviders', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Concepts', PropertyName: '_concepts', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Edges', PropertyName: '_storedEdges', CacheLocal: true },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
        if (forceRefresh) {
            this._preloadedGraphMemos.Clear();
        }
    }

    // ─── Public Cached Metadata Getters ─────────────────────────────────────────

    public get Graphs(): MJGraphEntity[] {
        return this.GetConfigData<MJGraphEntity>('_graphs') ?? this._graphs;
    }

    public get GraphTypes(): MJGraphTypeEntity[] {
        return this.GetConfigData<MJGraphTypeEntity>('_graphTypes') ?? this._graphTypes;
    }

    public get ConceptTypes(): MJGraphConceptTypeEntity[] {
        return this.GetConfigData<MJGraphConceptTypeEntity>('_conceptTypes') ?? this._conceptTypes;
    }

    public get AuthorityTiers(): MJGraphAuthorityTierEntity[] {
        return this.GetConfigData<MJGraphAuthorityTierEntity>('_authorityTiers') ?? this._authorityTiers;
    }

    public get EdgeTypes(): MJGraphEdgeTypeEntity[] {
        return this.GetConfigData<MJGraphEdgeTypeEntity>('_edgeTypes') ?? this._edgeTypes;
    }

    public get EdgeTypeEndpoints(): MJGraphEdgeTypeEndpointEntity[] {
        return this.GetConfigData<MJGraphEdgeTypeEndpointEntity>('_edgeTypeEndpoints') ?? this._edgeTypeEndpoints;
    }

    public get EdgeProviders(): MJGraphEdgeProviderEntity[] {
        return this.GetConfigData<MJGraphEdgeProviderEntity>('_edgeProviders') ?? this._edgeProviders;
    }

    public get Concepts(): MJGraphConceptEntity[] {
        return this.GetConfigData<MJGraphConceptEntity>('_concepts') ?? this._concepts;
    }

    public get StoredEdges(): MJGraphEdgeEntity[] {
        return this.GetConfigData<MJGraphEdgeEntity>('_storedEdges') ?? this._storedEdges;
    }

    /**
     * Finds an active graph by name (case-insensitive).
     */
    public GetGraphByName(graphName: string): MJGraphEntity | undefined {
        const target = graphName.trim().toLowerCase();
        return this.Graphs.find(
            g => g.Status === 'Active' && g.Name.trim().toLowerCase() === target,
        );
    }

    /**
     * Returns all active graphs whose `GraphType` has `IsCanon = true`.
     */
    public GetCanonGraphs(): MJGraphEntity[] {
        const canonTypeIDs = new UUIDSet(
            this.GraphTypes.filter(gt => gt.Status === 'Active' && gt.IsCanon).map(gt => gt.ID),
        );
        return this.Graphs.filter(
            g =>
                g.Status === 'Active' &&
                (canonTypeIDs.Has(g.GraphTypeID) || g.Name.trim().toLowerCase() === 'mj canon'),
        );
    }

    /**
     * Resolves an edge type by name for a given graph (checking graph-scoped edge types first,
     * then global edge types where `GraphID` is `null`).
     */
    public ResolveEdgeType(graphID: string, edgeTypeName: string): MJGraphEdgeTypeEntity | undefined {
        const target = edgeTypeName.trim().toLowerCase();
        const scoped = this.EdgeTypes.find(
            et => et.GraphID != null && UUIDsEqual(et.GraphID, graphID) && et.Name.trim().toLowerCase() === target,
        );
        if (scoped) {
            return scoped;
        }
        return this.EdgeTypes.find(
            et => et.GraphID == null && et.Name.trim().toLowerCase() === target,
        );
    }

    // ─── Core Graph Traversal API ───────────────────────────────────────────────

    /**
     * Returns all visible edges incident to `node` in `graphName` matching `options` for `user`.
     */
    public async GetEdges(
        graphName: string,
        node: GraphNodeRef,
        options: GraphTraversalOptions = {},
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        const graph = this.GetGraphByName(graphName);
        if (!graph) {
            return [];
        }

        const direction = options.Direction ?? 'Both';
        const rawEdges = await this.collectStepEdges(
            graph,
            {
                Nodes: [node],
                Direction: direction,
                EdgeTypes: options.EdgeTypes,
            },
            user,
        );

        const filtered = this.filterEdgesByOptions(rawEdges, [node], options);
        if (filtered.length === 0) {
            return [];
        }

        const endpointRefs: GraphNodeRef[] = [node];
        for (const edge of filtered) {
            endpointRefs.push(edge.Source, edge.Target);
        }

        const visibleNodes = await this.resolveNodesAndPermissions(
            endpointRefs,
            options.IncludeProposed === true,
            user,
        );

        return filtered.filter(edge => {
            const srcKey = this.nodeLookupKey(edge.Source);
            const tgtKey = this.nodeLookupKey(edge.Target);
            return visibleNodes.has(srcKey) && visibleNodes.has(tgtKey);
        });
    }

    /**
     * Expands a best-first weighted subgraph around `seeds` in `graphName` under `user`.
     *
     * Path scores are computed as the product of edge weights decayed by hop depth (`0.9^hop`),
     * ensuring high-weight definitional edges (`Defines`, `Subsets`, `Measures`, `Implements`)
     * are expanded ahead of lower-weight structural links (`References`, `RelatedTo`).
     */
    public async Subgraph(
        graphName: string,
        seeds: GraphNodeRef[],
        options: GraphTraversalOptions = {},
        user: UserInfo,
    ): Promise<GraphSubgraphResult> {
        const graph = this.GetGraphByName(graphName);
        if (!graph || seeds.length === 0) {
            return { Nodes: [], Edges: [] };
        }

        const includeProposed = options.IncludeProposed === true;
        const depthLimit = Math.min(Math.max(options.Depth ?? 2, 0), 4);
        const hardMaxNodes = graph.LoadMode === 'OnDemand' ? 200 : 500;
        const maxNodes = Math.min(Math.max(options.MaxNodes ?? 50, 1), hardMaxNodes);
        const direction = options.Direction ?? 'Both';

        // Step 1: Resolve and permission-check seed nodes
        const initialSeedMap = await this.resolveNodesAndPermissions(seeds, includeProposed, user);
        if (initialSeedMap.size === 0) {
            return { Nodes: [], Edges: [] };
        }

        const acceptedNodes = new Map<string, GraphNodeView>();
        const nodeScores = new Map<string, number>();
        const expandedNodeKeys = new Set<string>();
        const acceptedEdges = new Map<string, GraphEdgeView>();

        let frontier: FrontierCandidate[] = [];
        for (const [key, nodeView] of initialSeedMap) {
            if (acceptedNodes.size >= maxNodes) {
                break;
            }
            acceptedNodes.set(key, nodeView);
            nodeScores.set(key, 1.0);
            frontier.push({
                Node: { EntityName: nodeView.EntityName, RecordID: nodeView.RecordID },
                Score: 1.0,
            });
        }

        // Step 2: Best-first hop expansion
        for (let hop = 0; hop < depthLimit && frontier.length > 0; hop++) {
            frontier.sort((a, b) => b.Score - a.Score);
            const hopNodes = frontier.map(f => f.Node);
            for (const f of frontier) {
                expandedNodeKeys.add(this.nodeLookupKey(f.Node));
            }

            const rawStepEdges = await this.collectStepEdges(
                graph,
                {
                    Nodes: hopNodes,
                    Direction: direction,
                    EdgeTypes: options.EdgeTypes,
                },
                user,
            );

            const stepEdges = this.filterEdgesByOptions(rawStepEdges, hopNodes, options);
            if (stepEdges.length === 0) {
                break;
            }

            const scoredEdges = this.scoreStepEdges(stepEdges, nodeScores, hop);
            const nextFrontierRefs = this.selectNextFrontierRefs(
                scoredEdges,
                acceptedNodes,
                maxNodes,
            );

            // Resolve labels & permissions for newly discovered neighbor nodes in one batch
            if (nextFrontierRefs.length > 0) {
                const resolvedNeighbors = await this.resolveNodesAndPermissions(
                    nextFrontierRefs,
                    includeProposed,
                    user,
                );
                for (const [key, view] of resolvedNeighbors) {
                    if (acceptedNodes.size < maxNodes && !acceptedNodes.has(key)) {
                        acceptedNodes.set(key, view);
                    }
                }
            }

            // Keep all valid edges whose endpoints are both in acceptedNodes, and build next frontier
            const nextFrontierMap = new Map<string, FrontierCandidate>();
            for (const { Edge, CandidateScore } of scoredEdges) {
                const srcKey = this.nodeLookupKey(Edge.Source);
                const tgtKey = this.nodeLookupKey(Edge.Target);
                if (!acceptedNodes.has(srcKey) || !acceptedNodes.has(tgtKey)) {
                    continue;
                }
                acceptedEdges.set(Edge.ID, Edge);

                for (const endpoint of [Edge.Source, Edge.Target]) {
                    const epKey = this.nodeLookupKey(endpoint);
                    const prevScore = nodeScores.get(epKey) ?? 0;
                    if (CandidateScore > prevScore) {
                        nodeScores.set(epKey, CandidateScore);
                    }
                    if (!expandedNodeKeys.has(epKey) && !nextFrontierMap.has(epKey)) {
                        nextFrontierMap.set(epKey, {
                            Node: endpoint,
                            Score: nodeScores.get(epKey) ?? CandidateScore,
                        });
                    }
                }
            }

            frontier = Array.from(nextFrontierMap.values());
        }

        const sortedEdges = Array.from(acceptedEdges.values()).sort((a, b) => b.Weight - a.Weight);
        return {
            Nodes: Array.from(acceptedNodes.values()),
            Edges: sortedEdges,
        };
    }

    /**
     * Renders a subgraph into structured, token-efficient Markdown suitable for injection
     * into an AI agent prompt.
     */
    public DescribeForPrompt(subgraph: GraphSubgraphResult): string {
        if (subgraph.Nodes.length === 0 && subgraph.Edges.length === 0) {
            return 'No semantic graph context found.';
        }

        const nodeByKey = new Map<string, GraphNodeView>();
        for (const node of subgraph.Nodes) {
            nodeByKey.set(this.nodeLookupKey(node), node);
        }

        const concepts = subgraph.Nodes.filter(
            n => n.EntityName.trim().toLowerCase() === ENTITY_GRAPH_CONCEPTS.toLowerCase(),
        );
        const altViews = subgraph.Nodes.filter(
            n => n.EntityName.trim().toLowerCase() === ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase(),
        );
        const queries = subgraph.Nodes.filter(
            n => n.EntityName.trim().toLowerCase() === ENTITY_QUERIES.toLowerCase(),
        );
        const entitiesAndFields = subgraph.Nodes.filter(n => {
            const lower = n.EntityName.trim().toLowerCase();
            return lower === ENTITY_ENTITIES.toLowerCase() || lower === ENTITY_FIELDS.toLowerCase();
        });
        const dataRecords = subgraph.Nodes.filter(n => {
            const lower = n.EntityName.trim().toLowerCase();
            return (
                lower !== ENTITY_GRAPH_CONCEPTS.toLowerCase() &&
                lower !== ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase() &&
                lower !== ENTITY_QUERIES.toLowerCase() &&
                lower !== ENTITY_ENTITIES.toLowerCase() &&
                lower !== ENTITY_FIELDS.toLowerCase()
            );
        });

        const sections: string[] = [];
        this.appendConceptSection(concepts, sections);
        this.appendNodeGroupSection('Canonical Alternate Base Views', altViews, sections);
        this.appendNodeGroupSection('Governed Queries', queries, sections);
        this.appendNodeGroupSection('Schema Entities & Fields', entitiesAndFields, sections);
        this.appendNodeGroupSection('Data Records', dataRecords, sections);
        this.appendEdgesSection(subgraph.Edges, nodeByKey, sections);

        return sections.join('\n\n');
    }

    // ─── Internal Preload & Step Edge Collection ────────────────────────────────

    private async collectStepEdges(
        graph: MJGraphEntity,
        request: GraphEdgeRequest,
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        if (graph.LoadMode === 'Preload') {
            return this.collectPreloadGraphEdges(graph, request, user);
        }
        return this.collectOnDemandGraphEdges(graph, request, user);
    }

    private async collectPreloadGraphEdges(
        graph: MJGraphEntity,
        request: GraphEdgeRequest,
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        const memo = await this.getOrBuildPreloadedGraphMemo(graph, user);
        const matching = memo.AllPreloadedEdges.filter(e => MatchesGraphEdgeRequest(e, request));

        if (memo.NonEnumeratingProviders.length > 0 && request.Nodes && request.Nodes.length > 0) {
            const dynamicEdges = await this.runProviders(
                graph,
                memo.NonEnumeratingProviders,
                request,
                memo.StoredEdgeFieldIDs,
                user,
            );
            matching.push(...dynamicEdges);
        }

        return this.deduplicateEdges(matching);
    }

    private async getOrBuildPreloadedGraphMemo(
        graph: MJGraphEntity,
        user: UserInfo,
    ): Promise<PreloadedGraphMemo> {
        const md = this.metadataProvider;
        const storedEdgesRef = this.StoredEdges;
        const edgeTypesRef = this.EdgeTypes;
        const providersRef = this.EdgeProviders;
        const entitiesRef = md.Entities;
        const queriesRef = QueryEngine.Instance.Queries;
        const queryEntitiesRef = QueryEngine.Instance.QueryEntities;
        const queryDepsRef = QueryEngine.Instance.Dependencies;

        const existing = this._preloadedGraphMemos.Get(graph.ID);
        if (
            existing &&
            existing.StoredEdgesRef === storedEdgesRef &&
            existing.EdgeTypesRef === edgeTypesRef &&
            existing.ProvidersRef === providersRef &&
            existing.EntitiesRef === entitiesRef &&
            existing.QueriesRef === queriesRef &&
            existing.QueryEntitiesRef === queryEntitiesRef &&
            existing.QueryDependenciesRef === queryDepsRef
        ) {
            return existing;
        }

        const graphStoredRows = storedEdgesRef.filter(e => UUIDsEqual(e.GraphID, graph.ID));
        const storedEdgeViews: GraphEdgeView[] = [];
        const storedFieldIDs = new Set<string>();
        const entityFieldEntity = md.EntityByName(ENTITY_FIELDS);

        for (const row of graphStoredRows) {
            const view = this.storedEdgeRowToView(row, graph);
            if (view) {
                storedEdgeViews.push(view);
            }
            if (entityFieldEntity) {
                if (UUIDsEqual(row.SourceEntityID, entityFieldEntity.ID)) {
                    storedFieldIDs.add(NormalizeUUID(row.SourceRecordID));
                }
                if (UUIDsEqual(row.TargetEntityID, entityFieldEntity.ID)) {
                    storedFieldIDs.add(NormalizeUUID(row.TargetRecordID));
                }
            }
        }

        const activeProviders = providersRef
            .filter(p => UUIDsEqual(p.GraphID, graph.ID) && p.IsActive)
            .sort((a, b) => a.Sequence - b.Sequence);

        const enumeratingRows: MJGraphEdgeProviderEntity[] = [];
        const nonEnumeratingRows: MJGraphEdgeProviderEntity[] = [];

        for (const pRow of activeProviders) {
            const instance = this.instantiateProvider(pRow.DriverClass);
            if (!instance) {
                continue;
            }
            if (instance.SupportsEnumeration) {
                enumeratingRows.push(pRow);
            } else {
                nonEnumeratingRows.push(pRow);
            }
        }

        const derivedEdges = await this.runProviders(
            graph,
            enumeratingRows,
            { Direction: 'Both' },
            storedFieldIDs,
            user,
        );

        const memo: PreloadedGraphMemo = {
            GraphID: graph.ID,
            StoredEdgesRef: storedEdgesRef,
            EdgeTypesRef: edgeTypesRef,
            ProvidersRef: providersRef,
            EntitiesRef: entitiesRef,
            QueriesRef: queriesRef,
            QueryEntitiesRef: queryEntitiesRef,
            QueryDependenciesRef: queryDepsRef,
            AllPreloadedEdges: this.deduplicateEdges([...storedEdgeViews, ...derivedEdges]),
            StoredEdgeFieldIDs: storedFieldIDs,
            NonEnumeratingProviders: nonEnumeratingRows,
        };
        this._preloadedGraphMemos.Set(graph.ID, memo);
        return memo;
    }

    private async collectOnDemandGraphEdges(
        graph: MJGraphEntity,
        request: GraphEdgeRequest,
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        const storedEdges = await this.loadOnDemandStoredEdges(graph, request, user);
        const storedFieldIDs = new Set<string>();
        for (const edge of storedEdges) {
            if (edge.Source.EntityName.trim().toLowerCase() === ENTITY_FIELDS.toLowerCase()) {
                storedFieldIDs.add(NormalizeUUID(edge.Source.RecordID));
            }
            if (edge.Target.EntityName.trim().toLowerCase() === ENTITY_FIELDS.toLowerCase()) {
                storedFieldIDs.add(NormalizeUUID(edge.Target.RecordID));
            }
        }

        const activeProviders = this.EdgeProviders
            .filter(p => UUIDsEqual(p.GraphID, graph.ID) && p.IsActive)
            .sort((a, b) => a.Sequence - b.Sequence);

        const derivedEdges = await this.runProviders(
            graph,
            activeProviders,
            request,
            storedFieldIDs,
            user,
        );

        return this.deduplicateEdges([...storedEdges, ...derivedEdges]);
    }

    private async loadOnDemandStoredEdges(
        graph: MJGraphEntity,
        request: GraphEdgeRequest,
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        const cachedRows = this.StoredEdges.filter(e => UUIDsEqual(e.GraphID, graph.ID));
        const viewsByID = new Map<string, GraphEdgeView>();

        for (const row of cachedRows) {
            const view = this.storedEdgeRowToView(row, graph);
            if (view && MatchesGraphEdgeRequest(view, request)) {
                viewsByID.set(view.ID, view);
            }
        }

        if (!request.Nodes || request.Nodes.length === 0) {
            return Array.from(viewsByID.values());
        }

        const endpointClause = this.buildStoredEdgeFilterClause(request);
        if (!endpointClause) {
            return Array.from(viewsByID.values());
        }

        try {
            const rv = new RunView(this.runViewProvider);
            const result = await rv.RunView<Record<string, unknown>>(
                {
                    EntityName: ENTITY_GRAPH_EDGES,
                    ExtraFilter: `(GraphID = '${escapeSqlLiteral(graph.ID)}') AND (${endpointClause})`,
                    ResultType: 'simple',
                    MaxRows: 500,
                },
                user,
            );
            if (result.Success && result.Results) {
                for (const rawRow of result.Results) {
                    const view = this.simpleStoredRowToView(rawRow, graph);
                    if (view && MatchesGraphEdgeRequest(view, request)) {
                        viewsByID.set(view.ID, view);
                    }
                }
            }
        } catch {
            // Fall back to in-memory cached rows if RunView is unavailable
        }

        return Array.from(viewsByID.values());
    }

    private buildStoredEdgeFilterClause(request: GraphEdgeRequest): string | null {
        const md = this.metadataProvider;
        const byEntity = new UUIDMap<{ EntityID: string; RecordIDs: string[] }>();

        for (const node of request.Nodes ?? []) {
            const entity = md.EntityByName(node.EntityName);
            if (!entity) {
                continue;
            }
            let entry = byEntity.Get(entity.ID);
            if (!entry) {
                entry = { EntityID: entity.ID, RecordIDs: [] };
                byEntity.Set(entity.ID, entry);
            }
            entry.RecordIDs.push(`'${escapeSqlLiteral(node.RecordID)}'`);
        }

        const clauses: string[] = [];
        for (const [, entry] of byEntity) {
            const eid = escapeSqlLiteral(entry.EntityID);
            const rids = entry.RecordIDs.join(', ');
            clauses.push(`(SourceEntityID = '${eid}' AND SourceRecordID IN (${rids}))`);
            clauses.push(`(TargetEntityID = '${eid}' AND TargetRecordID IN (${rids}))`);
        }

        return clauses.length > 0 ? clauses.join(' OR ') : null;
    }

    private async runProviders(
        graph: MJGraphEntity,
        providerRows: MJGraphEdgeProviderEntity[],
        request: GraphEdgeRequest,
        storedEdgeFieldIDs: ReadonlySet<string>,
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        const results: GraphEdgeView[] = [];
        const providerToUse = this.combinedProvider;

        for (const row of providerRows) {
            const instance = this.instantiateProvider(row.DriverClass);
            if (!instance) {
                continue;
            }

            let parsedConfig: unknown = {};
            if (row.Configuration?.trim()) {
                try {
                    parsedConfig = JSON.parse(row.Configuration);
                } catch {
                    parsedConfig = {};
                }
            }

            const ctx: GraphProviderContext = {
                Graph: graph,
                Config: parsedConfig,
                User: user,
                Provider: providerToUse,
                StoredEdgeFieldIDs: storedEdgeFieldIDs,
                ResolveDefaultWeight: (edgeTypeName: string, fallback: number) => {
                    const edgeType = this.ResolveEdgeType(graph.ID, edgeTypeName);
                    return edgeType?.DefaultWeight ?? fallback;
                },
            };

            const providerEdges = await instance.GetEdges(request, ctx);
            results.push(...providerEdges);
        }

        return results;
    }

    private instantiateProvider(driverClass: string): BaseGraphEdgeProvider | null {
        if (!driverClass?.trim()) {
            return null;
        }
        LoadGraphEdgeProviders();
        const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseGraphEdgeProvider>(
            BaseGraphEdgeProvider,
            driverClass.trim(),
        );
        if (res && typeof res === 'object' && 'Instance' in res) {
            return res.Instance ?? null;
        }
        return (
            MJGlobal.Instance.ClassFactory.CreateInstance<BaseGraphEdgeProvider>(
                BaseGraphEdgeProvider,
                driverClass.trim(),
            ) ?? null
        );
    }

    // ─── Stored Edge Mapping & Validation ───────────────────────────────────────

    private storedEdgeRowToView(
        row: MJGraphEdgeEntity,
        graph: MJGraphEntity,
    ): GraphEdgeView | null {
        const md = this.metadataProvider;
        const edgeType = this. EdgeTypes.find(et => UUIDsEqual(et.ID, row.EdgeTypeID));
        const typeName = edgeType?.Name ?? row.EdgeType;
        if (!typeName) {
            return null;
        }
        if (edgeType && !this.satisfiesEndpointConstraints(edgeType.ID, row.SourceEntityID, row.TargetEntityID)) {
            return null;
        }

        const sourceEntityName =
            row.SourceEntity || md.EntityByID(row.SourceEntityID)?.Name;
        const targetEntityName =
            row.TargetEntity || md.EntityByID(row.TargetEntityID)?.Name;
        if (!sourceEntityName || !targetEntityName) {
            return null;
        }

        let attributes: Record<string, unknown> | null = null;
        if (row.Attributes?.trim()) {
            try {
                const parsed: unknown = JSON.parse(row.Attributes);
                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    attributes = parsed as Record<string, unknown>;
                }
            } catch {
                attributes = null;
            }
        }

        return {
            ID: row.ID,
            GraphName: graph.Name,
            TypeName: typeName,
            Source: { EntityName: sourceEntityName, RecordID: row.SourceRecordID },
            Target: { EntityName: targetEntityName, RecordID: row.TargetRecordID },
            IsDirected: edgeType ? edgeType.IsDirected : true,
            Weight: Number(row.Weight ?? edgeType?.DefaultWeight ?? 1.0),
            Description: row.Description ?? null,
            Attributes: attributes,
            Origin: row.Origin,
            Status: row.Status,
            Confidence: row.Confidence != null ? Number(row.Confidence) : null,
        };
    }

    private simpleStoredRowToView(
        row: Record<string, unknown>,
        graph: MJGraphEntity,
    ): GraphEdgeView | null {
        const id = row['ID'] != null ? String(row['ID']) : '';
        const edgeTypeID = row['EdgeTypeID'] != null ? String(row['EdgeTypeID']) : '';
        const sourceEntityID = row['SourceEntityID'] != null ? String(row['SourceEntityID']) : '';
        const targetEntityID = row['TargetEntityID'] != null ? String(row['TargetEntityID']) : '';
        const sourceRecordID = row['SourceRecordID'] != null ? String(row['SourceRecordID']) : '';
        const targetRecordID = row['TargetRecordID'] != null ? String(row['TargetRecordID']) : '';
        if (!id || !sourceEntityID || !targetEntityID || !sourceRecordID || !targetRecordID) {
            return null;
        }

        const md = this.metadataProvider;
        const edgeType = this.EdgeTypes.find(et => UUIDsEqual(et.ID, edgeTypeID));
        const typeName =
            edgeType?.Name ?? (row['EdgeType'] != null ? String(row['EdgeType']) : '');
        if (!typeName) {
            return null;
        }
        if (edgeType && !this.satisfiesEndpointConstraints(edgeType.ID, sourceEntityID, targetEntityID)) {
            return null;
        }

        const sourceEntityName =
            (row['SourceEntity'] != null ? String(row['SourceEntity']) : '') ||
            md.EntityByID(sourceEntityID)?.Name;
        const targetEntityName =
            (row['TargetEntity'] != null ? String(row['TargetEntity']) : '') ||
            md.EntityByID(targetEntityID)?.Name;
        if (!sourceEntityName || !targetEntityName) {
            return null;
        }

        const statusRaw = row['Status'] != null ? String(row['Status']) : 'Approved';
        const status: 'Proposed' | 'Approved' | 'Rejected' =
            statusRaw === 'Proposed' || statusRaw === 'Rejected' ? statusRaw : 'Approved';
        const originRaw = row['Origin'] != null ? String(row['Origin']) : 'Declared';
        const origin: 'Declared' | 'Inferred' = originRaw === 'Inferred' ? 'Inferred' : 'Declared';

        return {
            ID: id,
            GraphName: graph.Name,
            TypeName: typeName,
            Source: { EntityName: sourceEntityName, RecordID: sourceRecordID },
            Target: { EntityName: targetEntityName, RecordID: targetRecordID },
            IsDirected: edgeType ? edgeType.IsDirected : true,
            Weight: Number(row['Weight'] ?? edgeType?.DefaultWeight ?? 1.0),
            Description: row['Description'] != null ? String(row['Description']) : null,
            Attributes: null,
            Origin: origin,
            Status: status,
            Confidence: row['Confidence'] != null ? Number(row['Confidence']) : null,
        };
    }

    private satisfiesEndpointConstraints(
        edgeTypeID: string,
        sourceEntityID: string,
        targetEntityID: string,
    ): boolean {
        const endpoints = this.EdgeTypeEndpoints.filter(ep =>
            UUIDsEqual(ep.EdgeTypeID, edgeTypeID),
        );
        if (endpoints.length === 0) {
            return true;
        }

        const sourceAllowed = endpoints.filter(ep => ep.Side === 'Source');
        if (
            sourceAllowed.length > 0 &&
            !sourceAllowed.some(ep => UUIDsEqual(ep.EntityID, sourceEntityID))
        ) {
            return false;
        }

        const targetAllowed = endpoints.filter(ep => ep.Side === 'Target');
        if (
            targetAllowed.length > 0 &&
            !targetAllowed.some(ep => UUIDsEqual(ep.EntityID, targetEntityID))
        ) {
            return false;
        }

        return true;
    }

    // ─── Filtering, Scoring & Permission Resolution ─────────────────────────────

    private filterEdgesByOptions(
        edges: GraphEdgeView[],
        frontierNodes: GraphNodeRef[],
        options: GraphTraversalOptions,
    ): GraphEdgeView[] {
        const includeProposed = options.IncludeProposed === true;
        const minWeight = options.MinWeight ?? 0;
        const request: GraphEdgeRequest = {
            Nodes: frontierNodes,
            Direction: options.Direction ?? 'Both',
            EdgeTypes: options.EdgeTypes,
        };

        return edges.filter(edge => {
            if (edge.Status === 'Rejected') {
                return false;
            }
            if (!includeProposed && edge.Status !== 'Approved') {
                return false;
            }
            if (edge.Weight < minWeight) {
                return false;
            }
            return MatchesGraphEdgeRequest(edge, request);
        });
    }

    private scoreStepEdges(
        stepEdges: GraphEdgeView[],
        nodeScores: ReadonlyMap<string, number>,
        hop: number,
    ): Array<{ Edge: GraphEdgeView; CandidateScore: number }> {
        const hopDecay = Math.pow(0.9, hop);
        const scored = stepEdges.map(edge => {
            const srcScore = nodeScores.get(this.nodeLookupKey(edge.Source)) ?? 0;
            const tgtScore = nodeScores.get(this.nodeLookupKey(edge.Target)) ?? 0;
            const anchorScore = Math.max(srcScore, tgtScore, 0.1);
            const candidateScore = anchorScore * edge.Weight * hopDecay;
            return { Edge: edge, CandidateScore: candidateScore };
        });

        scored.sort((a, b) => b.CandidateScore - a.CandidateScore);
        return scored;
    }

    private selectNextFrontierRefs(
        scoredEdges: ReadonlyArray<{ Edge: GraphEdgeView; CandidateScore: number }>,
        acceptedNodes: ReadonlyMap<string, GraphNodeView>,
        maxNodes: number,
    ): GraphNodeRef[] {
        const candidateMap = new Map<string, GraphNodeRef>();
        const remainingBudget = Math.max(0, maxNodes - acceptedNodes.size);
        if (remainingBudget === 0) {
            return [];
        }

        for (const { Edge } of scoredEdges) {
            for (const endpoint of [Edge.Source, Edge.Target]) {
                const key = this.nodeLookupKey(endpoint);
                if (!acceptedNodes.has(key) && !candidateMap.has(key)) {
                    candidateMap.set(key, endpoint);
                }
            }
        }

        return Array.from(candidateMap.values());
    }

    /**
     * Resolves display labels, icons, descriptions, and user permissions for a batch of candidate
     * nodes. Metadata-scale nodes are checked in-memory; data-scale nodes are resolved with one
     * batched `RunViews` call per entity under `user` (enforcing both entity permissions and RLS).
     */
    private async resolveNodesAndPermissions(
        candidates: GraphNodeRef[],
        includeProposed: boolean,
        user: UserInfo,
    ): Promise<Map<string, GraphNodeView>> {
        const resolved = new Map<string, GraphNodeView>();
        const dataCandidatesByEntity = new Map<string, { Entity: EntityInfo; Nodes: GraphNodeRef[] }>();
        const md = this.metadataProvider;

        for (const node of candidates) {
            const lookupKey = this.nodeLookupKey(node);
            if (resolved.has(lookupKey)) {
                continue;
            }

            const entityLower = node.EntityName.trim().toLowerCase();
            if (entityLower === ENTITY_ENTITIES.toLowerCase()) {
                const view = this.resolveEntityMetadataNode(node, user);
                if (view) {
                    resolved.set(lookupKey, view);
                }
            } else if (entityLower === ENTITY_FIELDS.toLowerCase()) {
                const view = this.resolveFieldMetadataNode(node, user);
                if (view) {
                    resolved.set(lookupKey, view);
                }
            } else if (entityLower === ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase()) {
                const view = this.resolveAlternateBaseViewNode(node, user);
                if (view) {
                    resolved.set(lookupKey, view);
                }
            } else if (entityLower === ENTITY_QUERIES.toLowerCase()) {
                const view = this.resolveQueryMetadataNode(node, user);
                if (view) {
                    resolved.set(lookupKey, view);
                }
            } else if (entityLower === ENTITY_GRAPH_CONCEPTS.toLowerCase()) {
                const view = this.resolveConceptMetadataNode(node, includeProposed, user);
                if (view) {
                    resolved.set(lookupKey, view);
                }
            } else {
                const entityInfo = md.EntityByName(node.EntityName);
                if (!entityInfo || !this.userCanReadEntity(entityInfo, user)) {
                    continue;
                }
                const groupKey = NormalizeUUID(entityInfo.ID);
                let group = dataCandidatesByEntity.get(groupKey);
                if (!group) {
                    group = { Entity: entityInfo, Nodes: [] };
                    dataCandidatesByEntity.set(groupKey, group);
                }
                if (!group.Nodes.some(n => GraphNodeRefsEqual(n, node))) {
                    group.Nodes.push(node);
                }
            }
        }

        if (dataCandidatesByEntity.size > 0) {
            await this.resolveDataNodesBatch(dataCandidatesByEntity, user, resolved);
        }

        return resolved;
    }

    private resolveEntityMetadataNode(node: GraphNodeRef, user: UserInfo): GraphNodeView | null {
        const md = this.metadataProvider;
        const entity = md.EntityByID(node.RecordID);
        if (!entity || !this.userCanReadEntity(entity, user)) {
            return null;
        }
        return {
            Key: BuildGraphNodeKey(entity.ID, entity.ID),
            EntityName: ENTITY_ENTITIES,
            RecordID: entity.ID,
            Label: entity.DisplayNameOrName || entity.Name,
            Icon: entity.Icon || 'fa-solid fa-table',
            Description: entity.Description || null,
        };
    }

    private resolveFieldMetadataNode(node: GraphNodeRef, user: UserInfo): GraphNodeView | null {
        const md = this.metadataProvider;
        for (const entity of md.Entities ?? []) {
            const field = (entity.Fields ?? []).find(f => UUIDsEqual(f.ID, node.RecordID));
            if (field) {
                if (!this.userCanReadEntity(entity, user)) {
                    return null;
                }
                const fieldEntity = md.EntityByName(ENTITY_FIELDS);
                return {
                    Key: BuildGraphNodeKey(fieldEntity?.ID ?? ENTITY_FIELDS, field.ID),
                    EntityName: ENTITY_FIELDS,
                    RecordID: field.ID,
                    Label: `${entity.Name}.${field.DisplayNameOrName || field.Name}`,
                    Icon: 'fa-solid fa-table-columns',
                    Description: field.Description || null,
                };
            }
        }
        return null;
    }

    private resolveAlternateBaseViewNode(
        node: GraphNodeRef,
        user: UserInfo,
    ): GraphNodeView | null {
        const md = this.metadataProvider;
        for (const entity of md.Entities ?? []) {
            const abv = (entity.AlternateBaseViews ?? []).find(v => UUIDsEqual(v.ID, node.RecordID));
            if (abv) {
                if (!abv.IsUsable || !this.userCanReadEntity(entity, user)) {
                    return null;
                }
                const abvEntity = md.EntityByName(ENTITY_ALTERNATE_BASE_VIEWS);
                return {
                    Key: BuildGraphNodeKey(abvEntity?.ID ?? ENTITY_ALTERNATE_BASE_VIEWS, abv.ID),
                    EntityName: ENTITY_ALTERNATE_BASE_VIEWS,
                    RecordID: abv.ID,
                    Label: `${entity.Name}.${abv.EffectiveDisplayName} (${abv.ViewName})`,
                    Icon: 'fa-solid fa-filter',
                    Description: abv.Description || null,
                };
            }
        }
        return null;
    }

    private resolveQueryMetadataNode(node: GraphNodeRef, user: UserInfo): GraphNodeView | null {
        const query = (QueryEngine.Instance.Queries ?? []).find(q =>
            UUIDsEqual(q.ID, node.RecordID),
        );
        if (!query) {
            return null;
        }
        if (user && !query.UserCanRun(user).canRun) {
            return null;
        }
        const md = this.metadataProvider;
        const queryEntity = md.EntityByName(ENTITY_QUERIES);
        const label = query.CategoryPath ? `${query.CategoryPath}/${query.Name}` : query.Name;
        return {
            Key: BuildGraphNodeKey(queryEntity?.ID ?? ENTITY_QUERIES, query.ID),
            EntityName: ENTITY_QUERIES,
            RecordID: query.ID,
            Label: label,
            Icon: 'fa-solid fa-terminal',
            Description: query.Description || null,
        };
    }

    private resolveConceptMetadataNode(
        node: GraphNodeRef,
        includeProposed: boolean,
        user: UserInfo,
    ): GraphNodeView | null {
        const concept = this.Concepts.find(c => UUIDsEqual(c.ID, node.RecordID));
        if (!concept) {
            return null;
        }
        const allowedStatus =
            concept.Status === 'Approved' ||
            (includeProposed && (concept.Status === 'Proposed' || concept.Status === 'Draft'));
        if (!allowedStatus) {
            return null;
        }

        const md = this.metadataProvider;
        const conceptEntity = md.EntityByName(ENTITY_GRAPH_CONCEPTS);
        if (conceptEntity && !this.userCanReadEntity(conceptEntity, user)) {
            return null;
        }

        const conceptType = this.ConceptTypes.find(ct => UUIDsEqual(ct.ID, concept.ConceptTypeID));
        return {
            Key: BuildGraphNodeKey(conceptEntity?.ID ?? ENTITY_GRAPH_CONCEPTS, concept.ID),
            EntityName: ENTITY_GRAPH_CONCEPTS,
            RecordID: concept.ID,
            Label: concept.Name,
            Icon: conceptType?.IconClass ?? 'fa-solid fa-lightbulb',
            Description: concept.Description || null,
        };
    }

    private async resolveDataNodesBatch(
        groupsByEntity: Map<string, { Entity: EntityInfo; Nodes: GraphNodeRef[] }>,
        user: UserInfo,
        resolved: Map<string, GraphNodeView>,
    ): Promise<void> {
        const groupList: Array<{
            Entity: EntityInfo;
            PKFieldName: string;
            NameFieldName: string | null;
            DescFieldName: string | null;
            Nodes: GraphNodeRef[];
            Params: RunViewParams;
        }> = [];

        for (const [, group] of groupsByEntity) {
            const pkField = group.Entity.FirstPrimaryKey;
            if (!pkField || group.Nodes.length === 0) {
                continue;
            }
            const nameField = group.Entity.NameField;
            const descField = group.Entity.Fields.find(
                f => f.Name.toLowerCase() === 'description',
            );

            const fields = new Set<string>([pkField.Name]);
            if (nameField) {
                fields.add(nameField.Name);
            }
            if (descField) {
                fields.add(descField.Name);
            }

            const quotedIDs = group.Nodes.map(n => `'${escapeSqlLiteral(n.RecordID)}'`).join(', ');
            groupList.push({
                Entity: group.Entity,
                PKFieldName: pkField.Name,
                NameFieldName: nameField?.Name ?? null,
                DescFieldName: descField?.Name ?? null,
                Nodes: group.Nodes,
                Params: {
                    EntityName: group.Entity.Name,
                    ExtraFilter: `${pkField.Name} IN (${quotedIDs})`,
                    Fields: Array.from(fields),
                    ResultType: 'simple',
                },
            });
        }

        if (groupList.length === 0) {
            return;
        }

        const rv = new RunView(this.runViewProvider);
        const batchResults = await rv.RunViews<Record<string, unknown>>(
            groupList.map(g => g.Params),
            user,
        );

        for (let i = 0; i < groupList.length; i++) {
            const group = groupList[i];
            const viewResult = batchResults[i];
            if (!viewResult?.Success || !viewResult.Results) {
                continue;
            }

            const rowsByID = new UUIDMap<Record<string, unknown>>();
            for (const row of viewResult.Results) {
                const rawPK = row[group.PKFieldName];
                if (rawPK != null) {
                    rowsByID.Set(String(rawPK), row);
                }
            }

            for (const candidate of group.Nodes) {
                const row = rowsByID.Get(candidate.RecordID);
                if (!row) {
                    // Row did not come back (either missing or hidden by RLS) -> drop node
                    continue;
                }
                const labelVal = group.NameFieldName ? row[group.NameFieldName] : null;
                const descVal = group.DescFieldName ? row[group.DescFieldName] : null;
                const lookupKey = this.nodeLookupKey(candidate);

                resolved.set(lookupKey, {
                    Key: BuildGraphNodeKey(group.Entity.ID, candidate.RecordID),
                    EntityName: group.Entity.Name,
                    RecordID: candidate.RecordID,
                    Label: labelVal != null ? String(labelVal) : candidate.RecordID,
                    Icon: group.Entity.Icon || null,
                    Description: descVal != null ? String(descVal) : null,
                });
            }
        }
    }

    private userCanReadEntity(entity: EntityInfo, user?: UserInfo): boolean {
        if (!user) {
            return true;
        }
        if (!entity.Permissions || entity.Permissions.length === 0) {
            return true;
        }
        const perms = entity.GetUserPermisions(user);
        return perms?.CanRead === true;
    }

    // ─── Prompt Formatting Helpers ──────────────────────────────────────────────

    private appendConceptSection(concepts: GraphNodeView[], sections: string[]): void {
        if (concepts.length === 0) {
            return;
        }
        const conceptsByID = IndexByUUID(this.Concepts);
        const lines: string[] = ['### Governed Concepts'];
        for (const node of concepts) {
            const fullConcept = conceptsByID.Get(node.RecordID);
            const tierBadge = fullConcept?.AuthorityTier ? ` [${fullConcept.AuthorityTier}]` : '';
            const typeBadge = fullConcept?.ConceptType ? ` (${fullConcept.ConceptType})` : '';
            let line = `- **${node.Label}**${typeBadge}${tierBadge}: ${node.Description ?? ''}`;

            if (fullConcept?.Synonyms?.trim()) {
                try {
                    const syn: unknown = JSON.parse(fullConcept.Synonyms);
                    if (Array.isArray(syn) && syn.length > 0) {
                        line += `\n  - Synonyms: ${syn.join(', ')}`;
                    }
                } catch {
                    // Ignore malformed synonyms JSON
                }
            }
            if (fullConcept?.Specification?.trim()) {
                line += `\n  - Specification: ${fullConcept.Specification.trim()}`;
            }
            lines.push(line);
        }
        sections.push(lines.join('\n'));
    }

    private appendNodeGroupSection(
        heading: string,
        nodes: GraphNodeView[],
        sections: string[],
    ): void {
        if (nodes.length === 0) {
            return;
        }
        const lines: string[] = [`### ${heading}`];
        for (const node of nodes) {
            const desc = node.Description?.trim() ? ` — ${node.Description.trim()}` : '';
            lines.push(`- **${node.Label}** (${node.EntityName})${desc}`);
        }
        sections.push(lines.join('\n'));
    }

    private appendEdgesSection(
        edges: GraphEdgeView[],
        nodeByKey: ReadonlyMap<string, GraphNodeView>,
        sections: string[],
    ): void {
        if (edges.length === 0) {
            return;
        }

        const precedenceEdges = edges.filter(e => {
            const lower = e.TypeName.trim().toLowerCase();
            return lower === 'preferred over' || lower === 'supersedes' || lower === 'contradicts';
        });

        if (precedenceEdges.length > 0) {
            const precLines: string[] = ['### Governance & Precedence Rules'];
            for (const edge of precedenceEdges) {
                precLines.push(this.formatEdgeLine(edge, nodeByKey));
            }
            sections.push(precLines.join('\n'));
        }

        const lines: string[] = ['### Semantic Relationships'];
        for (const edge of edges) {
            lines.push(this.formatEdgeLine(edge, nodeByKey));
        }
        sections.push(lines.join('\n'));
    }

    private formatEdgeLine(
        edge: GraphEdgeView,
        nodeByKey: ReadonlyMap<string, GraphNodeView>,
    ): string {
        const srcNode = nodeByKey.get(this.nodeLookupKey(edge.Source));
        const tgtNode = nodeByKey.get(this.nodeLookupKey(edge.Target));
        const srcLabel = srcNode ? srcNode.Label : `${edge.Source.EntityName}:${edge.Source.RecordID}`;
        const tgtLabel = tgtNode ? tgtNode.Label : `${edge.Target.EntityName}:${edge.Target.RecordID}`;
        const arrow = edge.IsDirected ? `-[${edge.TypeName}]->` : `<-[${edge.TypeName}]->`;
        const desc = edge.Description?.trim() ? ` (${edge.Description.trim()})` : '';
        return `- **${srcLabel}** ${arrow} **${tgtLabel}**${desc}`;
    }

    // ─── Utilities ──────────────────────────────────────────────────────────────

    private deduplicateEdges(edges: GraphEdgeView[]): GraphEdgeView[] {
        const byID = new Map<string, GraphEdgeView>();
        for (const edge of edges) {
            byID.set(edge.ID, edge);
        }
        return Array.from(byID.values());
    }

    private nodeLookupKey(node: Pick<GraphNodeRef, 'EntityName' | 'RecordID'>): string {
        return BuildGraphNodeKey(node.EntityName.trim().toLowerCase(), node.RecordID);
    }

    private get metadataProvider(): IMetadataProvider {
        return (this.ProviderToUse as unknown as IMetadataProvider) ?? Metadata.Provider;
    }

    private get runViewProvider(): IRunViewProvider {
        return (
            (this.ProviderToUse as unknown as IRunViewProvider) ??
            (Metadata.Provider as unknown as IRunViewProvider)
        );
    }

    private get combinedProvider(): IMetadataProvider & IRunViewProvider & Partial<IRunQueryProvider> {
        return (this.ProviderToUse as unknown as IMetadataProvider &
            IRunViewProvider &
            Partial<IRunQueryProvider>) ?? (Metadata.Provider as unknown as IMetadataProvider & IRunViewProvider);
    }
}
