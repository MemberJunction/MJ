import {
    BaseEngine,
    BaseEnginePropertyConfig,
    BaseEntityEvent,
    EntityAlternateBaseViewInfo,
    EntityFieldInfo,
    EntityInfo,
    EntityPermissionType,
    IMetadataProvider,
    LogError,
    LogStatus,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import { EscapeSQLString, IndexByUUID, MJGlobal, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    MJGraphAuthorityTierEntity,
    MJGraphConceptEntity,
    MJGraphConceptTypeEntity,
    MJGraphEdgeProviderEntity,
    MJGraphEdgeTypeEndpointEntity,
    MJGraphEdgeTypeEntity,
    MJGraphEntity,
    MJGraphTypeEntity,
} from '../generated/entity_subclasses';
import type { MJGraphEdgeEntityType } from '../generated/entities/__mj';
import { QueryEngine } from '../engines/QueryEngine';
import {
    BaseGraphEdgeProvider,
    FormatGraphNodeKey,
    IsGraphDataProvider,
    MatchesEdgeTypeFilter,
    type GraphDataProvider,
    type GraphEdgeRequest,
    type GraphEdgeView,
    type GraphNodeRef,
    type GraphNodeView,
    type GraphSubgraph,
    type GraphTraversalOptions,
} from './BaseGraphEdgeProvider';

/** Depth used when the caller gives none. */
export const GRAPH_DEFAULT_DEPTH = 2;
/** Hard upper bound on traversal depth. */
export const GRAPH_MAX_DEPTH = 4;
/** Node budget used when the caller gives none. */
export const GRAPH_DEFAULT_MAX_NODES = 50;
/** Hard upper bound on nodes a traversal returns. */
export const GRAPH_MAX_NODES = 200;
/** Row cap on the stored edges one expansion step reads on demand. */
export const GRAPH_MAX_STORED_EDGES_PER_STEP = 1000;

/**
 * Server operation key (`ServerOperationScopeManager`) under which the Content Pipeline `Graph` stage
 * saves the `Inferred` edges its content source's `GraphOverlay` policy approves (every
 * `ConceptTaxonomyMode` except `propose-only`). `MJGraphEdgeEntityServer` lets a new `Inferred` edge
 * start `Approved` without `Graph: Approve Edges` only inside this scope. Client CRUD entry points
 * (GraphQL, REST, transaction groups) run inside a client CRUD boundary that masks every outer scope,
 * so an API caller cannot enter it; only server code that names this key can.
 */
export const GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION = 'ContentPipeline.GraphStage.ApproveInferredEdges';
/** Per-hop decay applied to best-first path scores, so near nodes outrank far ones. */
const HOP_DECAY = 0.85;

const GRAPH_EDGES_ENTITY = 'MJ: Graph Edges';
const GRAPH_CONCEPTS_ENTITY = 'MJ: Graph Concepts';

/** The stored-edge columns traversal reads. */
type StoredEdgeRow = Pick<
    MJGraphEdgeEntityType,
    | 'ID'
    | 'GraphID'
    | 'Graph'
    | 'EdgeTypeID'
    | 'EdgeType'
    | 'SourceEntityID'
    | 'SourceEntity'
    | 'SourceRecordID'
    | 'TargetEntityID'
    | 'TargetEntity'
    | 'TargetRecordID'
    | 'Weight'
    | 'Description'
    | 'Attributes'
    | 'Origin'
    | 'Status'
    | 'Confidence'
>;

const STORED_EDGE_FIELDS: Array<keyof StoredEdgeRow> = [
    'ID',
    'GraphID',
    'Graph',
    'EdgeTypeID',
    'EdgeType',
    'SourceEntityID',
    'SourceEntity',
    'SourceRecordID',
    'TargetEntityID',
    'TargetEntity',
    'TargetRecordID',
    'Weight',
    'Description',
    'Attributes',
    'Origin',
    'Status',
    'Confidence',
];

/** A node admitted during traversal, with the best path that reached it. */
interface DiscoveredNode {
    Node: GraphNodeRef;
    Key: string;
    PathWeight: number;
    Hop: number;
    ParentKey: string | null;
    /** The edge this node was reached through (`null` for a seed). */
    ViaEdge: GraphEdgeView | null;
}

/** A candidate neighbor proposed by one edge during an expansion step. */
interface CandidateHop {
    Edge: GraphEdgeView;
    Parent: DiscoveredNode;
    Neighbor: GraphNodeRef;
    NeighborKey: string;
    Score: number;
}

/** Data-scale nodes of one entity awaiting a batched visibility read. */
interface DataNodeBucket {
    Entity: EntityInfo;
    Nodes: Array<{ Ref: GraphNodeRef; Key: string }>;
}

/** Entity fields and alternate base views by ID, built once per metadata snapshot. */
interface MetadataNodeIndex {
    Source: EntityInfo[];
    FieldsById: UUIDMap<{ Entity: EntityInfo; Field: EntityFieldInfo }>;
    ViewsById: UUIDMap<{ Entity: EntityInfo; View: EntityAlternateBaseViewInfo }>;
}

/** Metadata entities whose nodes are checked against metadata rather than read as data. */
type MetadataNodeKindName = 'MJ: Entities' | 'MJ: Entity Fields' | 'MJ: Entity Alternate Base Views' | 'MJ: Queries';

/**
 * Semantic Graph Engine (`WS-4.2` / `plans/canon-semantic-graph.md`).
 *
 * Caches graph metadata (graphs, edge types, endpoints, providers, concepts, lookup tables) and,
 * for `Preload` graphs only, their approved stored edges. `OnDemand` graphs read stored edges per
 * expansion step with one bounded RunView. Derived edges come from the graph's active
 * `MJ: Graph Edge Providers`.
 *
 * **Lazily configured.** Nothing loads at startup; the first caller of `Config` pays for it.
 *
 * **Whose data the cache holds.** On a server `BaseEngine` loads every config as the MJ system user,
 * so the shared cache never takes the first caller's scope. Nothing cached is handed to a caller
 * unchecked: every node returned is checked AS THE CALLER (and as every audience reader) at the hop
 * it is reached, with one batched `RunViews` per principal per hop (`[pk] IN (...)` per entity, so
 * entity permissions and row-level security apply), and cached stored edges are used only for a
 * principal who could read every one of them anyway.
 */
export class GraphEngine extends BaseEngine<GraphEngine> {
    public static get Instance(): GraphEngine {
        return super.getInstance<GraphEngine>();
    }

    private _graphs: MJGraphEntity[] = [];
    private _graphTypes: MJGraphTypeEntity[] = [];
    private _edgeTypes: MJGraphEdgeTypeEntity[] = [];
    private _edgeTypeEndpoints: MJGraphEdgeTypeEndpointEntity[] = [];
    private _edgeProviders: MJGraphEdgeProviderEntity[] = [];
    private _concepts: MJGraphConceptEntity[] = [];
    private _conceptTypes: MJGraphConceptTypeEntity[] = [];
    private _authorityTiers: MJGraphAuthorityTierEntity[] = [];

    /** Approved stored edges of active `Preload` graphs, indexed by incident node key. */
    private preloadEdgesByNodeKey = new Map<string, StoredEdgeRow[]>();
    /** False until the preload edges load, and after a `MJ: Graph Edges` change until they reload. */
    private preloadEdgesFresh = false;
    /** Field and alternate-view lookups for metadata nodes; rebuilt when the provider's entity list changes. */
    private metadataNodeIndex: MetadataNodeIndex | null = null;

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: 'MJ: Graphs', PropertyName: '_graphs', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Types', PropertyName: '_graphTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Edge Types', PropertyName: '_edgeTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Edge Type Endpoints', PropertyName: '_edgeTypeEndpoints', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Edge Providers', PropertyName: '_edgeProviders', CacheLocal: true },
            { Type: 'entity', EntityName: GRAPH_CONCEPTS_ENTITY, PropertyName: '_concepts', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Concept Types', PropertyName: '_conceptTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Authority Tiers', PropertyName: '_authorityTiers', CacheLocal: true },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    /**
     * Loads the approved stored edges of active `Preload` graphs (and only those) after every
     * metadata (re)load, as the engine's own identity (the system user on a server).
     */
    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        await this.loadPreloadStoredEdges(contextUser ?? this.ContextUser);
    }

    /** Marks the preload edge cache stale when a `MJ: Graph Edges` row changes here or on another server. */
    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        const entityName = event.baseEntity?.EntityInfo?.Name ?? event.entityName;
        const changed = event.type === 'save' || event.type === 'delete' || event.type === 'remote-invalidate';
        if (changed && entityName?.trim().toLowerCase() === GRAPH_EDGES_ENTITY.toLowerCase()) {
            this.preloadEdgesFresh = false;
        }
        return super.HandleIndividualBaseEntityEvent(event);
    }

    public get Graphs(): MJGraphEntity[] {
        return this.GetConfigData<MJGraphEntity>('_graphs') ?? this._graphs;
    }

    public get GraphTypes(): MJGraphTypeEntity[] {
        return this.GetConfigData<MJGraphTypeEntity>('_graphTypes') ?? this._graphTypes;
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

    /**
     * Every cached concept, loaded as the engine's identity. Never hand these to a caller directly:
     * check them with {@link FilterNodesForUser} first (as `CanonGraphEngine.FindConcepts` does).
     */
    public get Concepts(): MJGraphConceptEntity[] {
        return this.GetConfigData<MJGraphConceptEntity>('_concepts') ?? this._concepts;
    }

    public get ConceptTypes(): MJGraphConceptTypeEntity[] {
        return this.GetConfigData<MJGraphConceptTypeEntity>('_conceptTypes') ?? this._conceptTypes;
    }

    public get AuthorityTiers(): MJGraphAuthorityTierEntity[] {
        return this.GetConfigData<MJGraphAuthorityTierEntity>('_authorityTiers') ?? this._authorityTiers;
    }

    /**
     * Find an ACTIVE `MJ: Graphs` row by `Name` (case-insensitive) or `ID`. An unknown or disabled
     * graph returns `undefined`; traversal of it returns nothing.
     */
    public GetGraph(graphNameOrId: string): MJGraphEntity | undefined {
        const trimmed = graphNameOrId?.trim();
        if (!trimmed) {
            return undefined;
        }
        const lower = trimmed.toLowerCase();
        return this.Graphs.find(
            (g) => g.Status === 'Active' && (g.Name.trim().toLowerCase() === lower || UUIDsEqual(g.ID, trimmed)),
        );
    }

    /**
     * Validate whether `entityId` is permitted on `side` (`'Source'` or `'Target'`) of `edgeTypeId`
     * according to `MJ: Graph Edge Type Endpoints`. When no endpoint rows exist for `(edgeTypeId, side)`,
     * any entity is permitted.
     */
    public ValidateEdgeEndpoint(edgeTypeId: string, side: 'Source' | 'Target', entityId: string): boolean {
        const constraints = this.EdgeTypeEndpoints.filter(
            (ep) => UUIDsEqual(ep.EdgeTypeID, edgeTypeId) && ep.Side === side,
        );
        if (constraints.length === 0) {
            return true;
        }
        return constraints.some((ep) => UUIDsEqual(ep.EntityID, entityId));
    }

    /**
     * The canonical key of a node (`<entityID>|<recordID>`), resolving the entity through metadata.
     */
    public GetNodeKey(node: GraphNodeRef): string {
        return this.nodeKey(node, this.graphProvider());
    }

    /**
     * The nodes in `nodes` that `user` — and every one of `audienceReaders` — may see, with display
     * labels, keyed by node key. Data records (including concepts) are read as each principal with one
     * batched `RunViews` per principal, so entity permissions and row-level security apply; metadata
     * nodes use entity `CanRead`, `UserCanRun` (queries) and `CanRead` + `IsUsable` (alternate views).
     */
    public async FilterNodesForUser(
        nodes: GraphNodeRef[],
        user: UserInfo,
        audienceReaders?: readonly UserInfo[],
    ): Promise<Map<string, GraphNodeView>> {
        if (!user || !nodes || nodes.length === 0) {
            return new Map<string, GraphNodeView>();
        }
        const provider = this.graphProvider();
        return this.resolveVisibleNodes(nodes, this.principals(user, audienceReaders), provider);
    }

    /**
     * Stored and derived edges incident to `node` in `graphName` whose endpoints the caller (and any
     * `options.AudienceReaders`) may see. An unknown or inactive graph yields no edges.
     */
    public async GetEdges(
        graphName: string,
        node: GraphNodeRef,
        options: GraphTraversalOptions,
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        const graph = this.GetGraph(graphName);
        if (!user || !graph) {
            return [];
        }
        const provider = this.graphProvider();
        const principals = this.principals(user, options.AudienceReaders);
        const start = this.normalizeNodeRef(node, provider);
        const rawEdges = await this.getEdgesForFrontier(graph, [start], options, principals, provider);
        if (rawEdges.length === 0) {
            return [];
        }
        const endpoints: GraphNodeRef[] = [start];
        for (const edge of rawEdges) {
            endpoints.push(edge.Source, edge.Target);
        }
        const visible = await this.resolveVisibleNodes(endpoints, principals, provider);
        return rawEdges.filter(
            (edge) => visible.has(this.nodeKey(edge.Source, provider)) && visible.has(this.nodeKey(edge.Target, provider)),
        );
    }

    /**
     * Best-first bounded expansion around `seeds` in `graphName`.
     *
     * Each step reads the frontier's edges, ranks candidate neighbors by path score (product of edge
     * weights, decayed per hop; ties broken by node key then edge ID), checks the candidates'
     * visibility for the caller and every audience reader in one batch, and admits visible ones until
     * `MaxNodes`. Only admitted nodes are expanded, so traversal never crosses a node some principal
     * cannot see. Every admitted node carries the path that reached it.
     *
     * An unknown or inactive graph returns an empty subgraph with a `Message`.
     */
    public async Subgraph(
        graphName: string,
        seeds: GraphNodeRef[],
        options: GraphTraversalOptions,
        user: UserInfo,
    ): Promise<GraphSubgraph> {
        if (!user || !seeds || seeds.length === 0) {
            return { Nodes: [], Edges: [] };
        }
        const graph = this.GetGraph(graphName);
        if (!graph) {
            return { Nodes: [], Edges: [], Message: `Graph "${graphName}" was not found or is not active.` };
        }

        const provider = this.graphProvider();
        const principals = this.principals(user, options.AudienceReaders);
        const maxDepth = ClampGraphDepth(options.Depth ?? options.MaxDepth);
        const maxNodes = ClampGraphMaxNodes(options.MaxNodes);
        const minWeight = options.MinWeight ?? 0;

        const discovered = new Map<string, DiscoveredNode>();
        const visibleByKey = new Map<string, GraphNodeView>();
        let frontier = await this.admitSeeds(seeds, principals, maxNodes, provider, discovered, visibleByKey);
        let capped = false;

        for (let hop = 1; hop <= maxDepth && frontier.length > 0; hop++) {
            const stepEdges = await this.getEdgesForFrontier(graph, frontier.map((f) => f.Node), options, principals, provider);
            const candidates = this.rankCandidates(stepEdges, frontier, discovered, minWeight, hop, provider);
            const visible = await this.resolveVisibleNodes(this.uniqueNeighborRefs(candidates), principals, provider);
            const admitted = this.admitCandidates(candidates, visible, maxNodes, hop, discovered, visibleByKey);
            capped = capped || admitted.Capped;
            frontier = admitted.Next;
        }

        const edges = new Map((await this.collectEdgesBetween(graph, discovered, options, principals, provider)).map((e) => [e.ID, e]));
        const nodes: GraphNodeView[] = [];
        for (const d of discovered.values()) {
            const view = visibleByKey.get(d.Key);
            if (view) {
                nodes.push({ ...view, Hop: d.Hop, PathWeight: d.PathWeight, ParentKey: d.ParentKey, ViaEdgeID: d.ViaEdge?.ID ?? null });
            }
            if (d.ViaEdge && !edges.has(d.ViaEdge.ID)) {
                edges.set(d.ViaEdge.ID, d.ViaEdge); // the path edge, even if the final read was capped
            }
        }
        return {
            Nodes: nodes,
            Edges: Array.from(edges.values()).sort((a, b) => compareStrings(a.ID, b.ID)),
            Message: capped ? `Expansion stopped at the ${maxNodes}-node limit.` : undefined,
        };
    }

    /**
     * Alias for {@link Subgraph} used by RAG and pipeline callers.
     */
    public async Expand(
        graphName: string,
        seeds: GraphNodeRef[],
        options: GraphTraversalOptions,
        user: UserInfo,
    ): Promise<GraphSubgraph> {
        return this.Subgraph(graphName, seeds, options, user);
    }

    /**
     * Render a {@link GraphSubgraph} as a compact, deterministic Markdown block for LLM prompt injection.
     */
    public DescribeForPrompt(subgraph: GraphSubgraph): string {
        if (subgraph.Nodes.length === 0 && subgraph.Edges.length === 0) {
            return subgraph.Message ? `No semantic graph context found. ${subgraph.Message}` : 'No semantic graph context found.';
        }
        const provider = this.graphProvider();
        const nodeByKey = new Map<string, GraphNodeView>();
        for (const node of subgraph.Nodes) {
            nodeByKey.set(node.Key, node);
        }

        const lines: string[] = ['### Semantic Graph Context'];
        if (subgraph.Nodes.length > 0) {
            lines.push('**Nodes:**');
            for (const n of subgraph.Nodes) {
                const descSuffix = n.Description ? ` — ${n.Description}` : '';
                lines.push(`- **[${n.EntityName}] ${n.Label}** (\`${n.RecordID}\`)${descSuffix}`);
            }
        }
        if (subgraph.Edges.length > 0) {
            lines.push('');
            lines.push('**Relationships:**');
            for (const e of subgraph.Edges) {
                const sLabel = nodeByKey.get(this.nodeKey(e.Source, provider))?.Label ?? `${e.Source.EntityName}:${e.Source.RecordID}`;
                const tLabel = nodeByKey.get(this.nodeKey(e.Target, provider))?.Label ?? `${e.Target.EntityName}:${e.Target.RecordID}`;
                const arrow = e.IsDirected ? '-->' : '<-->';
                const desc = e.Description ? ` (${e.Description})` : '';
                lines.push(`- "${sLabel}" --[${e.TypeName} (${e.Weight.toFixed(2)})]${arrow} "${tLabel}"${desc}`);
            }
        }
        if (subgraph.Message) {
            lines.push('', `_${subgraph.Message}_`);
        }
        return lines.join('\n');
    }

    // ----- Provider + principals ------------------------------------------------

    private graphProvider(): GraphDataProvider {
        const p = this.ProviderToUse;
        if (IsGraphDataProvider(p)) {
            return p;
        }
        throw new Error('GraphEngine: the bound provider does not implement metadata, RunView and RunQuery.');
    }

    /** `[user, ...readers]` with each user once (by ID) and the caller first. */
    private principals(user: UserInfo, audienceReaders: readonly UserInfo[] | undefined): UserInfo[] {
        const seen = new UUIDSet(user.ID ? [user.ID] : []);
        const result: UserInfo[] = [user];
        for (const reader of audienceReaders ?? []) {
            if (!reader) {
                continue;
            }
            if (reader.ID && seen.Has(reader.ID)) {
                continue;
            }
            if (reader.ID) {
                seen.Add(reader.ID);
            }
            result.push(reader);
        }
        return result;
    }

    // ----- Traversal steps ------------------------------------------------------

    private async admitSeeds(
        seeds: GraphNodeRef[],
        principals: UserInfo[],
        maxNodes: number,
        provider: GraphDataProvider,
        discovered: Map<string, DiscoveredNode>,
        visibleByKey: Map<string, GraphNodeView>,
    ): Promise<DiscoveredNode[]> {
        const normalized = seeds.map((s) => this.normalizeNodeRef(s, provider));
        const visible = await this.resolveVisibleNodes(normalized, principals, provider);
        const frontier: DiscoveredNode[] = [];
        for (const seed of normalized) {
            const key = this.nodeKey(seed, provider);
            const view = visible.get(key);
            if (!view || discovered.has(key) || discovered.size >= maxNodes) {
                continue;
            }
            const node: DiscoveredNode = { Node: seed, Key: key, PathWeight: 1.0, Hop: 0, ParentKey: null, ViaEdge: null };
            discovered.set(key, node);
            visibleByKey.set(key, view);
            frontier.push(node);
        }
        return frontier;
    }

    /** Candidate neighbors of the frontier, best first, with a deterministic tie-break. */
    private rankCandidates(
        stepEdges: GraphEdgeView[],
        frontier: DiscoveredNode[],
        discovered: Map<string, DiscoveredNode>,
        minWeight: number,
        hop: number,
        provider: GraphDataProvider,
    ): CandidateHop[] {
        const frontierByKey = new Map(frontier.map((f) => [f.Key, f]));
        const decay = Math.pow(HOP_DECAY, hop - 1);
        const candidates: CandidateHop[] = [];
        for (const edge of stepEdges) {
            if (edge.Weight < minWeight) {
                continue;
            }
            const sourceKey = this.nodeKey(edge.Source, provider);
            const targetKey = this.nodeKey(edge.Target, provider);
            const fromSource = frontierByKey.get(sourceKey);
            const fromTarget = frontierByKey.get(targetKey);
            if (fromSource && !discovered.has(targetKey)) {
                candidates.push({ Edge: edge, Parent: fromSource, Neighbor: edge.Target, NeighborKey: targetKey, Score: fromSource.PathWeight * edge.Weight * decay });
            } else if (fromTarget && !discovered.has(sourceKey)) {
                candidates.push({ Edge: edge, Parent: fromTarget, Neighbor: edge.Source, NeighborKey: sourceKey, Score: fromTarget.PathWeight * edge.Weight * decay });
            }
        }
        return candidates.sort(
            (a, b) => b.Score - a.Score || compareStrings(a.NeighborKey, b.NeighborKey) || compareStrings(a.Edge.ID, b.Edge.ID),
        );
    }

    private uniqueNeighborRefs(candidates: CandidateHop[]): GraphNodeRef[] {
        const byKey = new Map<string, GraphNodeRef>();
        for (const c of candidates) {
            if (!byKey.has(c.NeighborKey)) {
                byKey.set(c.NeighborKey, c.Neighbor);
            }
        }
        return Array.from(byKey.values());
    }

    /** Admit visible candidates in rank order until `maxNodes`; the best path to each node wins. */
    private admitCandidates(
        candidates: CandidateHop[],
        visible: Map<string, GraphNodeView>,
        maxNodes: number,
        hop: number,
        discovered: Map<string, DiscoveredNode>,
        visibleByKey: Map<string, GraphNodeView>,
    ): { Next: DiscoveredNode[]; Capped: boolean } {
        const next: DiscoveredNode[] = [];
        let capped = false;
        for (const c of candidates) {
            const view = visible.get(c.NeighborKey);
            if (!view || discovered.has(c.NeighborKey)) {
                continue; // invisible to some principal, or already reached by a better path
            }
            if (discovered.size >= maxNodes) {
                capped = true;
                break;
            }
            const node: DiscoveredNode = {
                Node: c.Neighbor,
                Key: c.NeighborKey,
                PathWeight: c.Score,
                Hop: hop,
                ParentKey: c.Parent.Key,
                ViaEdge: c.Edge,
            };
            discovered.set(c.NeighborKey, node);
            visibleByKey.set(c.NeighborKey, view);
            next.push(node);
        }
        return { Next: next, Capped: capped };
    }

    /**
     * Every edge (that the traversal options allow) between two admitted nodes. Reads the admitted
     * set's edges once more so edges among nodes reached on different branches are included.
     */
    private async collectEdgesBetween(
        graph: MJGraphEntity,
        discovered: Map<string, DiscoveredNode>,
        options: GraphTraversalOptions,
        principals: UserInfo[],
        provider: GraphDataProvider,
    ): Promise<GraphEdgeView[]> {
        if (discovered.size < 2) {
            return [];
        }
        const nodes = Array.from(discovered.values()).map((d) => d.Node);
        const edges = await this.getEdgesForFrontier(graph, nodes, options, principals, provider);
        return edges.filter(
            (e) => discovered.has(this.nodeKey(e.Source, provider)) && discovered.has(this.nodeKey(e.Target, provider)),
        );
    }

    // ----- Edges for one step -----------------------------------------------------

    private async getEdgesForFrontier(
        graph: MJGraphEntity,
        frontier: GraphNodeRef[],
        options: GraphTraversalOptions,
        principals: UserInfo[],
        provider: GraphDataProvider,
    ): Promise<GraphEdgeView[]> {
        const normalizedFrontier = frontier.map((n) => this.normalizeNodeRef(n, provider));
        const frontierKeys = new Set(normalizedFrontier.map((n) => this.nodeKey(n, provider)));
        const direction = options.Direction ?? 'Both';
        const minWeight = options.MinWeight ?? 0;
        const results = new Map<string, GraphEdgeView>();

        const storedRows = await this.loadStoredEdges(graph, normalizedFrontier, frontierKeys, options, principals, provider);
        const edgeTypesById = IndexByUUID(this.EdgeTypes);
        for (const row of storedRows) {
            const view = this.toStoredEdgeView(row, graph, options, frontierKeys, provider, edgeTypesById);
            if (view) {
                results.set(view.ID, view);
            }
        }

        const derived = await this.derivedEdgesForEveryPrincipal(graph, normalizedFrontier, options, principals, provider);
        for (const edge of derived) {
            if (edge.Weight < minWeight || !MatchesEdgeTypeFilter(edge.TypeName, options.EdgeTypes)) {
                continue;
            }
            if (this.touchesFrontier(edge, frontierKeys, direction, provider)) {
                results.set(edge.ID, edge);
            }
        }

        return Array.from(results.values()).sort((a, b) => compareStrings(a.ID, b.ID));
    }

    private touchesFrontier(
        edge: Pick<GraphEdgeView, 'Source' | 'Target' | 'IsDirected'>,
        frontierKeys: Set<string>,
        direction: 'Out' | 'In' | 'Both',
        provider: GraphDataProvider,
    ): boolean {
        const sKey = this.nodeKey(edge.Source, provider);
        const tKey = this.nodeKey(edge.Target, provider);
        const wantOut = direction === 'Out' || direction === 'Both';
        const wantIn = direction === 'In' || direction === 'Both';
        return (
            (wantOut && frontierKeys.has(sKey)) ||
            (wantIn && frontierKeys.has(tKey)) ||
            (!edge.IsDirected && (frontierKeys.has(sKey) || frontierKeys.has(tKey)))
        );
    }

    private toStoredEdgeView(
        row: StoredEdgeRow,
        graph: MJGraphEntity,
        options: GraphTraversalOptions,
        frontierKeys: Set<string>,
        provider: GraphDataProvider,
        edgeTypesById: UUIDMap<MJGraphEdgeTypeEntity>,
    ): GraphEdgeView | null {
        if (!UUIDsEqual(row.GraphID, graph.ID) || row.Status === 'Rejected') {
            return null;
        }
        if (row.Status === 'Proposed' && options.IncludeProposed !== true) {
            return null;
        }
        const edgeType = edgeTypesById.Get(row.EdgeTypeID);
        const typeName = edgeType?.Name ?? row.EdgeType ?? 'Related To';
        const weight = typeof row.Weight === 'number' ? row.Weight : (edgeType?.DefaultWeight ?? 1.0);
        if (!MatchesEdgeTypeFilter(typeName, options.EdgeTypes) || weight < (options.MinWeight ?? 0)) {
            return null;
        }
        if (
            edgeType &&
            (!this.ValidateEdgeEndpoint(edgeType.ID, 'Source', row.SourceEntityID) ||
                !this.ValidateEdgeEndpoint(edgeType.ID, 'Target', row.TargetEntityID))
        ) {
            return null;
        }
        const source = this.normalizeNodeRef(
            { EntityName: row.SourceEntity ?? '', EntityID: row.SourceEntityID, RecordID: String(row.SourceRecordID) },
            provider,
        );
        const target = this.normalizeNodeRef(
            { EntityName: row.TargetEntity ?? '', EntityID: row.TargetEntityID, RecordID: String(row.TargetRecordID) },
            provider,
        );
        const isDirected = edgeType ? edgeType.IsDirected : true;
        if (!this.touchesFrontier({ Source: source, Target: target, IsDirected: isDirected }, frontierKeys, options.Direction ?? 'Both', provider)) {
            return null;
        }
        return {
            ID: row.ID,
            GraphName: graph.Name,
            TypeName: typeName,
            InverseTypeName: edgeType?.InverseName ?? null,
            Source: source,
            Target: target,
            IsDirected: isDirected,
            Weight: weight,
            Description: row.Description ?? null,
            Attributes: parseJsonObject(row.Attributes),
            Origin: row.Origin,
            Status: row.Status,
            Confidence: row.Confidence ?? null,
        };
    }

    /**
     * Stored edges incident to the frontier, as every principal may read them.
     *
     * Served from the preload cache only for an active `Preload` graph, approved edges only, and only
     * when every principal can read `MJ: Graph Edges` with no row-level filter (so the cache, loaded
     * as the engine's identity, holds exactly what each of them could read). Otherwise each principal
     * reads the frontier's edges itself — one bounded, ordered RunView per principal — and an edge is
     * kept only if every principal read it.
     */
    private async loadStoredEdges(
        graph: MJGraphEntity,
        frontier: GraphNodeRef[],
        frontierKeys: Set<string>,
        options: GraphTraversalOptions,
        principals: UserInfo[],
        provider: GraphDataProvider,
    ): Promise<StoredEdgeRow[]> {
        const edgeEntity = provider.EntityByName(GRAPH_EDGES_ENTITY);
        if (!edgeEntity || !principals.every((p) => CanUserReadEntity(edgeEntity, p))) {
            return [];
        }
        const includeProposed = options.IncludeProposed === true;
        const cacheServesEveryone = principals.every((p) => edgeEntity.UserExemptFromRowLevelSecurity(p, EntityPermissionType.Read));
        if (graph.LoadMode === 'Preload' && !includeProposed && cacheServesEveryone && (await this.ensurePreloadEdgesFresh())) {
            return this.preloadEdgesFor(graph, frontierKeys);
        }
        return this.readStoredEdgesAsPrincipals(graph, frontier, options, principals, provider);
    }

    private preloadEdgesFor(graph: MJGraphEntity, frontierKeys: Set<string>): StoredEdgeRow[] {
        const byId = new Map<string, StoredEdgeRow>();
        for (const key of frontierKeys) {
            for (const row of this.preloadEdgesByNodeKey.get(key) ?? []) {
                if (UUIDsEqual(row.GraphID, graph.ID)) {
                    byId.set(row.ID, row);
                }
            }
        }
        return Array.from(byId.values());
    }

    private async readStoredEdgesAsPrincipals(
        graph: MJGraphEntity,
        frontier: GraphNodeRef[],
        options: GraphTraversalOptions,
        principals: UserInfo[],
        provider: GraphDataProvider,
    ): Promise<StoredEdgeRow[]> {
        const params = this.buildStoredEdgeParams(graph, frontier, options, provider);
        if (!params) {
            return [];
        }
        const rv = RunView.FromMetadataProvider(provider);
        const perPrincipal = await Promise.all(principals.map((p) => rv.RunView<StoredEdgeRow>(params, p)));
        let rows: StoredEdgeRow[] | null = null;
        for (const res of perPrincipal) {
            if (!res.Success) {
                LogError(`GraphEngine: reading stored edges of graph "${graph.Name}" failed: ${res.ErrorMessage}`);
                return [];
            }
            if (res.Results.length >= GRAPH_MAX_STORED_EDGES_PER_STEP) {
                LogStatus(
                    `GraphEngine: an expansion step of graph "${graph.Name}" reached the ${GRAPH_MAX_STORED_EDGES_PER_STEP}-row stored-edge cap; the step may be missing edges.`,
                );
            }
            const ids = new UUIDSet(res.Results.map((r) => r.ID));
            rows = rows === null ? res.Results : rows.filter((r) => ids.Has(r.ID));
        }
        return rows ?? [];
    }

    private buildStoredEdgeParams(
        graph: MJGraphEntity,
        frontier: GraphNodeRef[],
        options: GraphTraversalOptions,
        provider: GraphDataProvider,
    ): RunViewParams | null {
        const idsByEntityId = new UUIDMap<Set<string>>();
        for (const node of frontier) {
            const recordId = node.RecordID.trim();
            const entityId = node.EntityID ?? provider.EntityByName(node.EntityName)?.ID;
            if (!recordId || !entityId) {
                continue; // a node with no resolvable entity cannot be matched safely on RecordID alone
            }
            const set = idsByEntityId.Get(entityId) ?? new Set<string>();
            set.add(recordId);
            idsByEntityId.Set(entityId, set);
        }
        if (idsByEntityId.Size === 0) {
            return null;
        }
        const side = (entityCol: string, recordCol: string): string[] => {
            const parts: string[] = [];
            for (const [entityId, recordIds] of idsByEntityId) {
                const quoted = Array.from(recordIds)
                    .sort()
                    .map((id) => `'${EscapeSQLString(id)}'`)
                    .join(', ');
                parts.push(`([${entityCol}] = '${EscapeSQLString(entityId)}' AND [${recordCol}] IN (${quoted}))`);
            }
            return parts;
        };
        // Both sides are read; direction is applied per edge after the read (an undirected edge matches either side).
        const clauses = [...side('SourceEntityID', 'SourceRecordID'), ...side('TargetEntityID', 'TargetRecordID')];
        const statuses = options.IncludeProposed === true ? `'Approved', 'Proposed'` : `'Approved'`;
        return {
            EntityName: GRAPH_EDGES_ENTITY,
            ExtraFilter: `[GraphID] = '${EscapeSQLString(graph.ID)}' AND [Status] IN (${statuses}) AND (${clauses.join(' OR ')})`,
            Fields: STORED_EDGE_FIELDS,
            OrderBy: '[ID]',
            MaxRows: GRAPH_MAX_STORED_EDGES_PER_STEP,
            ResultType: 'simple',
        };
    }

    private async ensurePreloadEdgesFresh(): Promise<boolean> {
        if (!this.preloadEdgesFresh) {
            await this.loadPreloadStoredEdges(this.ContextUser);
        }
        return this.preloadEdgesFresh;
    }

    private async loadPreloadStoredEdges(contextUser: UserInfo | undefined): Promise<void> {
        const preloadGraphIds = this.Graphs.filter((g) => g.Status === 'Active' && g.LoadMode === 'Preload').map((g) => g.ID);
        this.preloadEdgesByNodeKey = new Map<string, StoredEdgeRow[]>();
        if (preloadGraphIds.length === 0) {
            this.preloadEdgesFresh = true;
            return;
        }
        const provider = this.ProviderToUse;
        if (!IsGraphDataProvider(provider)) {
            this.preloadEdgesFresh = false;
            return;
        }
        const graphList = preloadGraphIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
        const res = await RunView.FromMetadataProvider(provider).RunView<StoredEdgeRow>(
            {
                EntityName: GRAPH_EDGES_ENTITY,
                ExtraFilter: `[Status] = 'Approved' AND [GraphID] IN (${graphList})`,
                Fields: STORED_EDGE_FIELDS,
                OrderBy: '[ID]',
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!res.Success) {
            LogError(`GraphEngine: loading stored edges of Preload graphs failed; reading them on demand until a reload succeeds: ${res.ErrorMessage}`);
            this.preloadEdgesFresh = false;
            return;
        }
        for (const row of res.Results) {
            this.indexPreloadEdge(FormatGraphNodeKey(row.SourceEntityID, String(row.SourceRecordID)), row);
            this.indexPreloadEdge(FormatGraphNodeKey(row.TargetEntityID, String(row.TargetRecordID)), row);
        }
        this.preloadEdgesFresh = true;
    }

    private indexPreloadEdge(key: string, row: StoredEdgeRow): void {
        const list = this.preloadEdgesByNodeKey.get(key);
        if (list) {
            list.push(row);
        } else {
            this.preloadEdgesByNodeKey.set(key, [row]);
        }
    }

    /**
     * Derived edges every principal derives. Data-scale providers read as the user they run for, so an
     * edge one principal derives from a row another cannot read (a membership, a link) would reveal that
     * row; each principal runs the providers and only edges all of them produce are kept.
     */
    private async derivedEdgesForEveryPrincipal(
        graph: MJGraphEntity,
        frontier: GraphNodeRef[],
        options: GraphTraversalOptions,
        principals: UserInfo[],
        provider: GraphDataProvider,
    ): Promise<GraphEdgeView[]> {
        const perPrincipal = await Promise.all(principals.map((p) => this.runDerivedProviders(graph, frontier, options, p, provider)));
        const [callerEdges, ...others] = perPrincipal;
        if (others.length === 0) {
            return callerEdges;
        }
        const otherIds = others.map((edges) => new Set(edges.map((e) => e.ID)));
        return callerEdges.filter((e) => otherIds.every((ids) => ids.has(e.ID)));
    }

    /** Derived edges from the graph's active providers, read as `caller`. */
    private async runDerivedProviders(
        graph: MJGraphEntity,
        frontier: GraphNodeRef[],
        options: GraphTraversalOptions,
        caller: UserInfo,
        provider: GraphDataProvider,
    ): Promise<GraphEdgeView[]> {
        const active = this.EdgeProviders.filter((ep) => ep.IsActive && UUIDsEqual(ep.GraphID, graph.ID)).sort(
            (a, b) => a.Sequence - b.Sequence || compareStrings(a.ID, b.ID),
        );
        const request: GraphEdgeRequest = { Nodes: frontier, Direction: options.Direction ?? 'Both', EdgeTypes: options.EdgeTypes };
        const edges: GraphEdgeView[] = [];
        for (const row of active) {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseGraphEdgeProvider>(BaseGraphEdgeProvider, row.DriverClass);
            if (!instance) {
                LogError(`GraphEngine: no BaseGraphEdgeProvider is registered as "${row.DriverClass}" (graph "${graph.Name}").`);
                continue;
            }
            try {
                const config = parseJsonObject(row.Configuration) ?? {};
                edges.push(...(await instance.GetEdges(request, { Graph: graph, Config: config, User: caller, Provider: provider })));
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`GraphEngine: derived edge provider '${row.DriverClass}' failed on graph '${graph.Name}': ${msg}`);
            }
        }
        return edges;
    }

    // ----- Node visibility ------------------------------------------------------

    /** Nodes visible to EVERY principal; labels come from the caller's read. */
    private async resolveVisibleNodes(
        candidates: GraphNodeRef[],
        principals: UserInfo[],
        provider: GraphDataProvider,
    ): Promise<Map<string, GraphNodeView>> {
        if (candidates.length === 0 || principals.length === 0) {
            return new Map<string, GraphNodeView>();
        }
        const normalized = candidates.map((c) => this.normalizeNodeRef(c, provider));
        const perPrincipal = await Promise.all(principals.map((p) => this.resolveNodesForPrincipal(normalized, p, provider)));
        const visible = perPrincipal[0];
        for (const other of perPrincipal.slice(1)) {
            for (const key of Array.from(visible.keys())) {
                if (!other.has(key)) {
                    visible.delete(key);
                }
            }
        }
        return visible;
    }

    /**
     * Nodes `principal` may see. Metadata nodes are checked against metadata; every data record —
     * concepts included — is read as `principal` in one batched `RunViews` (`[pk] IN (...)` per
     * entity), and a record that does not come back is invisible.
     */
    private async resolveNodesForPrincipal(
        nodes: GraphNodeRef[],
        principal: UserInfo,
        provider: GraphDataProvider,
    ): Promise<Map<string, GraphNodeView>> {
        const visible = new Map<string, GraphNodeView>();
        const buckets = new Map<string, DataNodeBucket>();
        const seen = new Set<string>();
        for (const node of nodes) {
            const key = this.nodeKey(node, provider);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const kind = metadataNodeKind(node.EntityName);
            if (kind) {
                const view = this.resolveMetadataNode(kind, node, key, principal, provider);
                if (view) {
                    visible.set(key, view);
                }
                continue;
            }
            const entity = provider.EntityByName(node.EntityName);
            if (!entity || !CanUserReadEntity(entity, principal)) {
                continue;
            }
            const bucket = buckets.get(entity.Name) ?? { Entity: entity, Nodes: [] };
            bucket.Nodes.push({ Ref: node, Key: key });
            buckets.set(entity.Name, bucket);
        }
        await this.resolveDataNodes(Array.from(buckets.values()), principal, provider, visible);
        return visible;
    }

    private resolveMetadataNode(
        kind: MetadataNodeKindName,
        node: GraphNodeRef,
        key: string,
        principal: UserInfo,
        provider: GraphDataProvider,
    ): GraphNodeView | null {
        const base = { Key: key, EntityName: kind, EntityID: provider.EntityByName(kind)?.ID ?? node.EntityID };
        if (kind === 'MJ: Entities') {
            const target = provider.EntityByID(node.RecordID);
            return target && CanUserReadEntity(target, principal)
                ? { ...base, RecordID: target.ID, Label: target.DisplayNameOrName || target.Name, Icon: target.Icon || null, Description: target.Description || null }
                : null;
        }
        if (kind === 'MJ: Entity Fields') {
            const entry = this.metadataIndex(provider).FieldsById.Get(node.RecordID);
            return entry && CanUserReadEntity(entry.Entity, principal)
                ? { ...base, RecordID: entry.Field.ID, Label: `${entry.Entity.Name}.${entry.Field.Name}`, Icon: entry.Entity.Icon || null, Description: entry.Field.Description || null }
                : null;
        }
        if (kind === 'MJ: Entity Alternate Base Views') {
            const entry = this.metadataIndex(provider).ViewsById.Get(node.RecordID);
            // "UserCanUse": read permission on the owning entity, and the view must be usable.
            return entry && CanUserReadEntity(entry.Entity, principal) && entry.View.IsUsable
                ? { ...base, RecordID: entry.View.ID, Label: `${entry.Entity.Name}.${entry.View.Name}`, Icon: entry.Entity.Icon || null, Description: entry.View.Description || null }
                : null;
        }
        const query = QueryEngine.Instance.FindQueryByID(node.RecordID);
        // UserCanRun returns { canRun, deniedEntities }; the object itself is always truthy.
        return query && query.UserCanRun(principal).canRun
            ? { ...base, RecordID: query.ID, Label: query.Name, Icon: 'fa-solid fa-terminal', Description: query.Description || null }
            : null;
    }

    private metadataIndex(provider: GraphDataProvider): MetadataNodeIndex {
        const entities = provider.Entities ?? [];
        if (this.metadataNodeIndex && this.metadataNodeIndex.Source === entities) {
            return this.metadataNodeIndex;
        }
        const index: MetadataNodeIndex = { Source: entities, FieldsById: new UUIDMap(), ViewsById: new UUIDMap() };
        for (const entity of entities) {
            for (const field of entity.Fields ?? []) {
                index.FieldsById.Set(field.ID, { Entity: entity, Field: field });
            }
            for (const view of entity.AlternateBaseViews ?? []) {
                if (view.ID) {
                    index.ViewsById.Set(view.ID, { Entity: entity, View: view });
                }
            }
        }
        this.metadataNodeIndex = index;
        return index;
    }

    private async resolveDataNodes(
        buckets: DataNodeBucket[],
        principal: UserInfo,
        provider: GraphDataProvider,
        visible: Map<string, GraphNodeView>,
    ): Promise<void> {
        if (buckets.length === 0) {
            return;
        }
        const params: RunViewParams[] = buckets.map((b) => this.buildNodeReadParams(b));
        const results = await RunView.FromMetadataProvider(provider).RunViews(params, principal);
        for (let i = 0; i < buckets.length; i++) {
            const res = results[i];
            if (!res?.Success) {
                LogError(`GraphEngine: reading ${buckets[i].Entity.Name} nodes failed: ${res?.ErrorMessage ?? 'no result'}`);
                continue; // unreadable means invisible
            }
            this.addReturnedRows(buckets[i], res.Results, visible);
        }
    }

    private buildNodeReadParams(bucket: DataNodeBucket): RunViewParams {
        const pkField = bucket.Entity.FirstPrimaryKey.Name; // first-pk-ok: Graph node keys address single-PK or URL-segment records via FirstPrimaryKey
        const fields = new Set<string>([pkField]);
        const nameField = bucket.Entity.NameField?.Name;
        if (nameField) {
            fields.add(nameField);
        }
        if (bucket.Entity.Name === GRAPH_CONCEPTS_ENTITY && bucket.Entity.Fields?.some((f) => f.Name === 'Description')) {
            fields.add('Description');
        }
        const ids = Array.from(new Set(bucket.Nodes.map((n) => n.Ref.RecordID))).sort();
        return {
            EntityName: bucket.Entity.Name,
            ExtraFilter: `[${pkField}] IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`,
            Fields: Array.from(fields),
            OrderBy: `[${pkField}]`,
            ResultType: 'simple',
        };
    }

    private addReturnedRows(bucket: DataNodeBucket, rows: Array<Record<string, unknown>>, visible: Map<string, GraphNodeView>): void {
        const pkField = bucket.Entity.FirstPrimaryKey.Name; // first-pk-ok: Graph node keys address single-PK or URL-segment records via FirstPrimaryKey
        const nameField = bucket.Entity.NameField?.Name;
        const rowByKey = new Map<string, Record<string, unknown>>();
        for (const row of rows) {
            const id = row[pkField];
            if (id != null) {
                rowByKey.set(FormatGraphNodeKey(bucket.Entity.ID, String(id)), row);
            }
        }
        for (const item of bucket.Nodes) {
            const row = rowByKey.get(item.Key);
            if (!row) {
                continue; // not returned to this principal: entity permission or row-level security
            }
            const label = nameField && row[nameField] != null ? String(row[nameField]) : `${bucket.Entity.Name} ${item.Ref.RecordID}`;
            const description = row['Description'];
            visible.set(item.Key, {
                Key: item.Key,
                EntityName: bucket.Entity.Name,
                EntityID: bucket.Entity.ID,
                RecordID: item.Ref.RecordID,
                Label: label,
                Icon: bucket.Entity.Icon || null,
                Description: typeof description === 'string' && description.length > 0 ? description : null,
            });
        }
    }

    // ----- Node references ------------------------------------------------------

    private normalizeNodeRef(node: GraphNodeRef, provider: IMetadataProvider): GraphNodeRef {
        const recordId = String(node.RecordID).trim();
        const byName = node.EntityName ? provider.EntityByName(node.EntityName) : undefined;
        if (byName) {
            return { EntityName: byName.Name, EntityID: byName.ID, RecordID: recordId };
        }
        const byId = node.EntityID ? provider.EntityByID(node.EntityID) : undefined;
        if (byId) {
            return { EntityName: byId.Name, EntityID: byId.ID, RecordID: recordId };
        }
        return { EntityName: (node.EntityName ?? '').trim(), EntityID: node.EntityID, RecordID: recordId };
    }

    private nodeKey(node: GraphNodeRef, provider: IMetadataProvider): string {
        const normalized = this.normalizeNodeRef(node, provider);
        return FormatGraphNodeKey(normalized.EntityID ?? normalized.EntityName, normalized.RecordID);
    }
}

function metadataNodeKind(entityName: string): MetadataNodeKindName | null {
    switch (entityName.trim().toLowerCase()) {
        case 'mj: entities':
            return 'MJ: Entities';
        case 'mj: entity fields':
            return 'MJ: Entity Fields';
        case 'mj: entity alternate base views':
            return 'MJ: Entity Alternate Base Views';
        case 'mj: queries':
            return 'MJ: Queries';
        default:
            return null;
    }
}

/**
 * Entity read permission with MJ's own semantics (`EntityInfo.GetUserPermisions`): role-based allow
 * minus deny, no bypass for any user type. Anything unknown is denied.
 */
export function CanUserReadEntity(entity: EntityInfo | undefined, user: UserInfo | undefined): boolean {
    if (!entity || !user || !Array.isArray(user.UserRoles)) {
        return false;
    }
    return entity.GetUserPermisions(user)?.CanRead === true;
}

/** Clamp a requested traversal depth to `1..4` (default `2`). */
export function ClampGraphDepth(requested: number | undefined): number {
    const value = requested != null && Number.isFinite(requested) ? Math.floor(requested) : GRAPH_DEFAULT_DEPTH;
    return Math.max(1, Math.min(GRAPH_MAX_DEPTH, value));
}

/** Clamp a requested node budget to `1..200` (default `50`, or `fallback`). */
export function ClampGraphMaxNodes(requested: number | undefined, fallback: number = GRAPH_DEFAULT_MAX_NODES): number {
    const value = requested != null && Number.isFinite(requested) ? Math.floor(requested) : fallback;
    return Math.max(1, Math.min(GRAPH_MAX_NODES, value));
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
    if (!raw) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}
