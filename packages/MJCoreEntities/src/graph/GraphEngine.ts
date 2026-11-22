import {
    AuthorizationInfo,
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
import { EvaluateAuthorizationChecks } from '../custom/operations/EvaluateAuthorizationChecks';
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
import type { MJGraphEdgeEntityType, MJGraphEntityType, MJGraphTypeEntityType } from '../generated/entities/__mj';
import { QueryEngine } from '../engines/QueryEngine';
import {
    GraphAccessPolicyRegistry,
    type BaseGraphEdgeAccessPolicy,
    type BaseGraphNodeAccessPolicy,
    type GraphAccessPolicyContext,
    type GraphNodeAccessDecision,
    type GraphPolicyNode,
} from './GraphAccessPolicy';
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
    type GraphPath,
    type GraphSubgraph,
    type GraphTraversalOptions,
    GRAPH_DEFAULT_EDGE_TYPE,
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
 * Named `MJ: Authorizations` grant required for every approval, rejection/deprecation, edit-of-approved,
 * or delete-of-approved decision on `MJ: Graph Edges` and `MJ: Graph Concepts`.
 */
export const GRAPH_APPROVE_EDGES_AUTHORIZATION = 'Graph: Approve Edges';

/**
 * Server operation key (`ServerOperationScopeManager`) under which the Content Pipeline `Graph` stage
 * saves the newly synthesized `Approved` `MJ: Graph Concepts` and `Inferred` + `Approved`
 * `MJ: Graph Edges` that its content source's `GraphOverlay` policy approves (every
 * `ConceptTaxonomyMode` except `propose-only`). `MJGraphEdgeEntityServer` and
 * `MJGraphConceptEntityServer` let a newly created policy-approved row start `Approved` without
 * `Graph: Approve Edges` only inside this scope (never edits, deprecations, or status transitions on
 * existing concepts). Client CRUD entry points (GraphQL, REST, transaction groups) run inside a client
 * CRUD boundary that masks every outer scope, so an API caller cannot enter it; only server code
 * that names this key can.
 */
export const GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION = 'ContentPipeline.GraphStage.ApproveInferredEdges';
/**
 * Server operation key under which the Content Pipeline retracts the evidence of a chunk it is
 * deleting: the `Inferred` edges that have that chunk as an endpoint. Deleting an `Approved` edge is
 * otherwise a review decision that needs `Graph: Approve Edges`, but an edge whose evidence is gone
 * is not one a person decided to keep, so `MJGraphEdgeEntityServer` allows deleting an `Inferred`
 * edge inside this scope. A `Declared` edge is never covered. Like the approval scope, no API caller
 * can enter it.
 */
export const GRAPH_PIPELINE_EVIDENCE_RETRACTION_OPERATION = 'ContentPipeline.Delete.RetractInferredEdges';
/**
 * How deeply access policies may nest (a concept's visibility following its chunks', a chunk's
 * following its document's). Past this depth every node is hidden, so a cycle cannot recurse forever.
 */
const MAX_POLICY_DEPTH = 6;
/** Per-hop decay applied to best-first path scores, so near nodes outrank far ones. */
const HOP_DECAY = 0.85;

const GRAPH_EDGES_ENTITY = 'MJ: Graph Edges';
const GRAPHS_ENTITY = 'MJ: Graphs';
const GRAPH_TYPES_ENTITY = 'MJ: Graph Types';
const GRAPH_CONCEPTS_ENTITY = 'MJ: Graph Concepts';

type GraphProbeRow = Pick<MJGraphEntityType, 'ID' | 'Name' | 'GraphTypeID' | 'Status'>;
type GraphTypeProbeRow = Pick<MJGraphTypeEntityType, 'ID' | 'IsCanon'>;

/**
 * True when a graph belongs to a graph type with `IsCanon = 1`. Whether a graph is Canon is metadata:
 * neither the graph's name nor its type's name decides it.
 */
export function IsCanonGraph(graph: Pick<MJGraphEntityType, 'GraphTypeID'>, canonTypeIds: UUIDSet): boolean {
    return canonTypeIds.Has(graph.GraphTypeID);
}

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

/** One `Preload` graph's approved stored edges, indexed by incident node key. */
interface PreloadedGraphEdges {
    ByNodeKey: Map<string, StoredEdgeRow[]>;
    EdgeIds: UUIDSet;
}

/** Which stored-edge text columns every principal may read. */
interface StoredEdgeTextReadability {
    Description: boolean;
    Attributes: boolean;
}

/** Options for {@link GraphEngine.FilterNodesForUser}. */
export interface GraphNodeFilterOptions {
    /** When `true`, `Proposed` concepts are visible alongside `Approved` ones (`false` by default). */
    IncludeProposed?: boolean;
    /** Provider for the visibility reads (the engine's own when omitted). */
    Provider?: IMetadataProvider;
}

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

/** Limits for one {@link GraphEngine.traverse} run, already clamped. */
interface TraversalLimits {
    MaxDepth: number;
    MaxNodes: number;
    /** Stop expanding as soon as this node key is admitted (path search). */
    StopAtKey?: string;
}

/** What one {@link GraphEngine.traverse} run reached. */
interface TraversalRun {
    discovered: Map<string, DiscoveredNode>;
    visibleByKey: Map<string, GraphNodeView>;
    capped: boolean;
    maxNodes: number;
    principals: UserInfo[];
    dataProvider: GraphDataProvider;
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
 * for `Preload` graphs only, their approved stored edges, loaded per graph on its first traversal
 * and reloaded per graph after a change. `OnDemand` graphs read stored edges per expansion step with
 * one bounded RunView. Derived edges come from the graph's active `MJ: Graph Edge Providers`.
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

    /**
     * Approved stored edges of the `Preload` graphs traversed so far, one entry per graph, loaded on a
     * graph's first traversal. A change drops only the entries it affects (see
     * {@link HandleIndividualBaseEntityEvent}); the next traversal of that graph reloads it alone.
     */
    private preloadedEdges = new UUIDMap<PreloadedGraphEdges>();
    /** In-flight preload reads by graph ID, so concurrent traversals share one read per graph. */
    private preloadReads = new UUIDMap<Promise<PreloadedGraphEdges | null>>();
    /** Bumped by every invalidation, so a read that started before one is not cached after it. */
    private preloadGeneration = 0;
    /** Field and alternate-view lookups for metadata nodes; rebuilt when the provider's entity list changes. */
    private metadataNodeIndex: MetadataNodeIndex | null = null;
    /** Cached result of the lightweight unloaded Canon-graph existence probe, keyed by provider. */
    private activeCanonGraphCache = new WeakMap<IMetadataProvider, boolean>();
    /** In-flight lightweight Canon-graph probes so concurrent callers share one query per provider. */
    private activeCanonGraphInFlight = new WeakMap<IMetadataProvider, Promise<boolean>>();
    /** Monotonic counter incremented when graph/type metadata changes so stale probes do not cache. */
    private activeCanonProbeGeneration = 0;

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
     * Returns `true` when at least one active Canon graph exists. When `GraphEngine` is already
     * loaded for the resolved provider, evaluates strictly in memory; otherwise runs a single
     * lightweight `RunView` probe cached per provider so callers can skip loading all 8 graph entities
     * on deployments with no active Canon graphs.
     */
    public async HasActiveCanonGraphs(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<boolean> {
        const resolvedProvider = provider ?? this.ProviderToUse;
        if (this.Loaded && resolvedProvider === this.ProviderToUse) {
            const canonTypeIds = new UUIDSet(this.GraphTypes.filter((gt) => gt.IsCanon).map((gt) => gt.ID));
            return this.Graphs.some((g) => g.Status === 'Active' && IsCanonGraph(g, canonTypeIds));
        }

        const cached = this.activeCanonGraphCache.get(resolvedProvider);
        if (cached !== undefined) {
            return cached;
        }

        const pending = this.activeCanonGraphInFlight.get(resolvedProvider);
        if (pending) {
            return pending;
        }

        const probe = this.probeActiveCanonGraphs(resolvedProvider, contextUser).finally(() => {
            this.activeCanonGraphInFlight.delete(resolvedProvider);
        });
        this.activeCanonGraphInFlight.set(resolvedProvider, probe);
        return probe;
    }

    private async probeActiveCanonGraphs(resolvedProvider: IMetadataProvider, contextUser?: UserInfo): Promise<boolean> {
        const graphsMeta = resolvedProvider.EntityByName(GRAPHS_ENTITY);
        if (!graphsMeta) {
            return false;
        }

        await this.SetupGlobalEventListener();
        const generation = this.activeCanonProbeGeneration;

        const rv = RunView.FromMetadataProvider(resolvedProvider);
        const graphsRes = await rv.RunView<GraphProbeRow>(
            {
                EntityName: GRAPHS_ENTITY,
                ExtraFilter: "[Status] = 'Active'",
                Fields: ['ID', 'Name', 'GraphTypeID', 'Status'],
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!graphsRes.Success) {
            // Fail open without caching so callers fall back to Config().
            return true;
        }

        const activeGraphs = (graphsRes.Results ?? []).filter((g) => g.Status === 'Active');
        let hasActive = false;
        if (activeGraphs.length > 0) {
            const typesRes = await rv.RunView<GraphTypeProbeRow>(
                {
                    EntityName: GRAPH_TYPES_ENTITY,
                    Fields: ['ID', 'IsCanon'],
                    ResultType: 'simple',
                },
                contextUser,
            );
            if (!typesRes.Success) {
                return true;
            }
            const canonTypeIds = new UUIDSet((typesRes.Results ?? []).filter((gt) => Boolean(gt.IsCanon)).map((gt) => gt.ID));
            hasActive = activeGraphs.some((g) => IsCanonGraph(g, canonTypeIds));
        }

        const rlsExempt = !contextUser || graphsMeta.UserExemptFromRowLevelSecurity(contextUser, EntityPermissionType.Read);
        if (rlsExempt && generation === this.activeCanonProbeGeneration) {
            this.activeCanonGraphCache.set(resolvedProvider, hasActive);
        }
        return hasActive;
    }

    private invalidateActiveCanonGraphCache(): void {
        this.activeCanonProbeGeneration++;
        this.activeCanonGraphCache = new WeakMap<IMetadataProvider, boolean>();
    }

    /** A first or forced (re)load also drops every preloaded graph; each reloads on its next traversal. */
    protected override async Load(
        configs: Partial<BaseEnginePropertyConfig>[],
        provider: IMetadataProvider,
        forceRefresh: boolean = false,
        contextUser?: UserInfo,
    ): Promise<void> {
        if (forceRefresh || !this.Loaded) {
            this.invalidatePreloadedEdges(null);
            this.invalidateActiveCanonGraphCache();
        }
        return super.Load(configs, provider, forceRefresh, contextUser);
    }

    /**
     * Drops the preload entries a change affects, and nothing else.
     *
     * There is deliberately no `AdditionalLoading` override: `BaseEngine` turns off in-place cache
     * updates for an engine that has one, so every concept or edge-type save would reload that whole
     * config and then every Preload graph's edges. Without it, the cached configs update in place and
     * stored edges load per graph, lazily:
     * - a `MJ: Graph Edges` save or delete drops the edge's graph, and any graph whose entry holds that
     *   edge ID (an edge moved to another graph);
     * - a `MJ: Graphs` save or delete drops that graph (its `LoadMode` or `Status` may have changed);
     * - a change that does not say which row (a remote invalidation) drops every entry.
     */
    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        const entityName = (event.baseEntity?.EntityInfo?.Name ?? event.entityName ?? '').trim().toLowerCase();
        const changed = event.type === 'save' || event.type === 'delete' || event.type === 'remote-invalidate';
        if (changed && entityName === GRAPH_EDGES_ENTITY.toLowerCase()) {
            const edge = event.baseEntity instanceof MJGraphEdgeEntity ? event.baseEntity : null;
            this.invalidatePreloadedEdges(edge ? (graph) => UUIDsEqual(graph, edge.GraphID) || this.preloadHoldsEdge(graph, edge.ID) : null);
        } else if (changed && entityName === GRAPHS_ENTITY.toLowerCase()) {
            const graphRow = event.baseEntity instanceof MJGraphEntity ? event.baseEntity : null;
            this.invalidatePreloadedEdges(graphRow ? (graph) => UUIDsEqual(graph, graphRow.ID) : null);
            this.invalidateActiveCanonGraphCache();
        } else if (changed && entityName === GRAPH_TYPES_ENTITY.toLowerCase()) {
            this.invalidateActiveCanonGraphCache();
        }
        return super.HandleIndividualBaseEntityEvent(event);
    }

    /** Drops the preload entries whose graph ID matches `affects` (every entry when `null`). */
    private invalidatePreloadedEdges(affects: ((graphId: string) => boolean) | null): void {
        this.preloadGeneration++;
        for (const map of [this.preloadedEdges, this.preloadReads]) {
            for (const graphId of Array.from(map.Keys())) {
                if (affects === null || affects(graphId)) {
                    map.Delete(graphId);
                }
            }
        }
    }

    private preloadHoldsEdge(graphId: string, edgeId: string): boolean {
        return this.preloadedEdges.Get(graphId)?.EdgeIds.Has(edgeId) === true;
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
     * A concept appears only when {@link IsGraphConceptStatusVisible} for `options.IncludeProposed`.
     */
    public async FilterNodesForUser(
        nodes: GraphNodeRef[],
        user: UserInfo,
        audienceReaders?: readonly UserInfo[],
        options: GraphNodeFilterOptions = {},
    ): Promise<Map<string, GraphNodeView>> {
        if (!user || !nodes || nodes.length === 0) {
            return new Map<string, GraphNodeView>();
        }
        const provider = this.graphProvider(options.Provider);
        return this.resolveVisibleNodes(nodes, this.principals(user, audienceReaders), provider, options.IncludeProposed === true);
    }

    /**
     * Stored and derived edges incident to `node` in `graphName` whose endpoints the caller (and any
     * `options.AudienceReaders`) may see. An unknown or inactive graph yields no edges. Every read made
     * for the caller goes through `provider` when one is given (see {@link Subgraph}).
     */
    public async GetEdges(
        graphName: string,
        node: GraphNodeRef,
        options: GraphTraversalOptions,
        user: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<GraphEdgeView[]> {
        const graph = this.GetGraph(graphName);
        if (!user || !graph) {
            return [];
        }
        const dataProvider = this.graphProvider(provider);
        const principals = this.principals(user, options.AudienceReaders);
        const start = this.normalizeNodeRef(node, dataProvider);
        const rawEdges = await this.getEdgesForFrontier(graph, [start], options, principals, dataProvider);
        if (rawEdges.length === 0) {
            return [];
        }
        const endpoints: GraphNodeRef[] = [start];
        for (const edge of rawEdges) {
            endpoints.push(edge.Source, edge.Target);
        }
        const visible = await this.resolveVisibleNodes(endpoints, principals, dataProvider, options.IncludeProposed === true);
        return rawEdges.filter(
            (edge) => visible.has(this.nodeKey(edge.Source, dataProvider)) && visible.has(this.nodeKey(edge.Target, dataProvider)),
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
     *
     * `provider`, when given, carries every read made for the caller and the readers (node visibility,
     * on-demand stored edges, derived-edge providers), e.g. the request's own provider on a server. The
     * engine's cached metadata and Preload edges still come from the provider the engine was configured
     * with.
     */
    public async Subgraph(
        graphName: string,
        seeds: GraphNodeRef[],
        options: GraphTraversalOptions,
        user: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<GraphSubgraph> {
        if (!user || !seeds || seeds.length === 0) {
            return { Nodes: [], Edges: [] };
        }
        const graph = this.GetGraph(graphName);
        if (!graph) {
            return { Nodes: [], Edges: [], Message: `Graph "${graphName}" was not found or is not active.` };
        }

        const { discovered, visibleByKey, capped, maxNodes, principals, dataProvider } = await this.traverse(
            graph,
            seeds,
            options,
            { MaxDepth: ClampGraphDepth(options.Depth ?? options.MaxDepth), MaxNodes: ClampGraphMaxNodes(options.MaxNodes) },
            user,
            provider,
        );

        const edges = new Map((await this.collectEdgesBetween(graph, discovered, options, principals, dataProvider)).map((e) => [e.ID, e]));
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
        provider?: IMetadataProvider,
    ): Promise<GraphSubgraph> {
        return this.Subgraph(graphName, seeds, options, user, provider);
    }

    /**
     * The fewest-hop path from `from` to `to` in `graphName` that the caller (and every
     * `options.AudienceReaders`) may see, with the best path weight among paths of that length.
     *
     * The search is the same best-first, permission-checked expansion as {@link Subgraph}, started at
     * `from` and stopped the moment `to` is admitted, so a path never runs through a node some
     * principal cannot see. `Depth` defaults to the maximum (4) and `MaxNodes` to the cap (200),
     * because a path search usually needs the reach that a neighborhood read does not.
     *
     * A node the caller cannot see (either endpoint included) and a node that is not connected give
     * the same answer, `Found: false` with a `Message`, so the result never reveals that a record exists.
     */
    public async FindPath(
        graphName: string,
        from: GraphNodeRef,
        to: GraphNodeRef,
        options: GraphTraversalOptions,
        user: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<GraphPath> {
        const graph = this.GetGraph(graphName);
        if (!graph) {
            return notFoundPath(`Graph "${graphName}" was not found or is not active.`);
        }
        if (!user || !from || !to) {
            return notFoundPath('Both a start node and an end node are required.');
        }
        const maxDepth = ClampGraphDepth(options.Depth ?? options.MaxDepth ?? GRAPH_MAX_DEPTH);
        const maxNodes = ClampGraphMaxNodes(options.MaxNodes, GRAPH_MAX_NODES);
        const stopAtKey = this.nodeKey(this.normalizeNodeRef(to, this.graphProvider(provider)), this.graphProvider(provider));
        const run = await this.traverse(graph, [from], options, { MaxDepth: maxDepth, MaxNodes: maxNodes, StopAtKey: stopAtKey }, user, provider);
        if (!run.discovered.has(stopAtKey)) {
            const limit = run.capped ? ` (the search stopped at the ${maxNodes}-node limit)` : '';
            return notFoundPath(`No path found within ${maxDepth} hop${maxDepth === 1 ? '' : 's'}${limit}.`);
        }
        return this.buildPath(stopAtKey, run);
    }

    /**
     * Render a {@link GraphPath} as one Markdown line per hop for LLM prompt injection. Each edge is
     * shown in its own direction, so a hop taken against an edge reads `<--`.
     */
    public DescribePathForPrompt(path: GraphPath, provider?: IMetadataProvider): string {
        if (!path.Found || path.Nodes.length === 0) {
            return path.Message ? `No graph path found. ${path.Message}` : 'No graph path found.';
        }
        const resolvedProvider = this.graphProvider(provider);
        const lines: string[] = [`### Graph Path (${path.Edges.length} hop${path.Edges.length === 1 ? '' : 's'}, weight ${path.PathWeight.toFixed(2)})`];
        lines.push(`- **[${path.Nodes[0].EntityName}] ${path.Nodes[0].Label}**`);
        for (let i = 0; i < path.Edges.length; i++) {
            const edge = path.Edges[i];
            const next = path.Nodes[i + 1];
            const forward = this.nodeKey(edge.Source, resolvedProvider) === path.Nodes[i].Key;
            const arrow = !edge.IsDirected ? '<-->' : forward ? '-->' : '<--';
            const desc = edge.Description ? ` (${edge.Description})` : '';
            lines.push(`  ${arrow} [${edge.TypeName} (${edge.Weight.toFixed(2)})]${desc} **[${next.EntityName}] ${next.Label}**`);
        }
        return lines.join('\n');
    }

    /**
     * Best-first bounded expansion shared by {@link Subgraph} and {@link FindPath}: admit the visible
     * seeds, then expand hop by hop, checking every candidate's visibility for every principal before
     * admitting it, until the depth or node limit is reached or `limits.StopAtKey` is admitted.
     */
    private async traverse(
        graph: MJGraphEntity,
        seeds: GraphNodeRef[],
        options: GraphTraversalOptions,
        limits: TraversalLimits,
        user: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<TraversalRun> {
        const dataProvider = this.graphProvider(provider);
        const principals = this.principals(user, options.AudienceReaders);
        const minWeight = options.MinWeight ?? 0;
        const includeProposed = options.IncludeProposed === true;
        const discovered = new Map<string, DiscoveredNode>();
        const visibleByKey = new Map<string, GraphNodeView>();
        const maxNodes = limits.MaxNodes;
        let frontier = await this.admitSeeds(seeds, principals, maxNodes, dataProvider, includeProposed, discovered, visibleByKey);
        let capped = false;
        const reachedStop = (): boolean => limits.StopAtKey != null && discovered.has(limits.StopAtKey);

        for (let hop = 1; hop <= limits.MaxDepth && frontier.length > 0 && !reachedStop(); hop++) {
            const stepEdges = await this.getEdgesForFrontier(graph, frontier.map((f) => f.Node), options, principals, dataProvider);
            const candidates = this.rankCandidates(stepEdges, frontier, discovered, minWeight, hop, dataProvider);
            const visible = await this.resolveVisibleNodes(this.uniqueNeighborRefs(candidates), principals, dataProvider, includeProposed);
            const admitted = this.admitCandidates(candidates, visible, maxNodes, hop, discovered, visibleByKey);
            capped = capped || admitted.Capped;
            frontier = admitted.Next;
        }
        return { discovered, visibleByKey, capped, maxNodes, principals, dataProvider };
    }

    /** Walk back from `targetKey` through each node's parent to the seed, and return the path in order. */
    private buildPath(targetKey: string, run: TraversalRun): GraphPath {
        const nodes: GraphNodeView[] = [];
        const edges: GraphEdgeView[] = [];
        let current = run.discovered.get(targetKey);
        const pathWeight = current?.PathWeight ?? 0;
        while (current) {
            const view = run.visibleByKey.get(current.Key);
            if (view) {
                nodes.push({ ...view, Hop: current.Hop, PathWeight: current.PathWeight, ParentKey: current.ParentKey, ViaEdgeID: current.ViaEdge?.ID ?? null });
            }
            if (current.ViaEdge) {
                edges.push(current.ViaEdge);
            }
            current = current.ParentKey ? run.discovered.get(current.ParentKey) : undefined;
        }
        return { Found: true, Nodes: nodes.reverse(), Edges: edges.reverse(), PathWeight: pathWeight };
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

    /** `requested` when it can serve graph reads, else the provider the engine is bound to. */
    private graphProvider(requested?: IMetadataProvider): GraphDataProvider {
        if (requested && IsGraphDataProvider(requested)) {
            return requested;
        }
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
        includeProposed: boolean,
        discovered: Map<string, DiscoveredNode>,
        visibleByKey: Map<string, GraphNodeView>,
    ): Promise<DiscoveredNode[]> {
        const normalized = seeds.map((s) => this.normalizeNodeRef(s, provider));
        const visible = await this.resolveVisibleNodes(normalized, principals, provider, includeProposed);
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
        const textReadable = this.storedEdgeTextReadable(principals, provider);
        for (const row of storedRows) {
            const view = this.toStoredEdgeView(row, graph, options, frontierKeys, provider, edgeTypesById, textReadable);
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

        const allowed = await this.applyEdgePolicies(Array.from(results.values()), principals, provider, options.IncludeProposed === true);
        return allowed.sort((a, b) => compareStrings(a.ID, b.ID));
    }

    /**
     * Runs each edge type's access policy, for every principal: an edge survives only if every
     * principal's policy allows it. Edge types with no policy pass through. A policy that throws hides
     * every edge it governs.
     */
    private async applyEdgePolicies(
        edges: GraphEdgeView[],
        principals: UserInfo[],
        provider: GraphDataProvider,
        includeProposed: boolean,
    ): Promise<GraphEdgeView[]> {
        const byType = new Map<string, GraphEdgeView[]>();
        for (const edge of edges) {
            const list = byType.get(edge.TypeName) ?? [];
            list.push(edge);
            byType.set(edge.TypeName, list);
        }
        const hidden = new Set<string>();
        for (const [typeName, typeEdges] of byType) {
            const policy = GraphAccessPolicyRegistry.GetEdgePolicy(typeName);
            if (!policy) {
                continue;
            }
            for (const principal of principals) {
                const allowed = await this.allowedEdges(typeName, policy, typeEdges, principal, provider, includeProposed);
                for (const e of typeEdges) {
                    if (!allowed.has(e.ID)) {
                        hidden.add(e.ID);
                    }
                }
            }
        }
        return edges.filter((e) => !hidden.has(e.ID));
    }

    private async allowedEdges(
        typeName: string,
        policy: BaseGraphEdgeAccessPolicy,
        edges: GraphEdgeView[],
        principal: UserInfo,
        provider: GraphDataProvider,
        includeProposed: boolean,
    ): Promise<Set<string>> {
        try {
            return await policy.FilterEdges(edges, this.policyContext(principal, provider, includeProposed, 0));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`GraphEngine: the access policy for edge type '${typeName}' failed; hiding its edges: ${msg}`);
            return new Set<string>();
        }
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
        textReadable: StoredEdgeTextReadability,
    ): GraphEdgeView | null {
        if (!UUIDsEqual(row.GraphID, graph.ID) || row.Status === 'Rejected') {
            return null;
        }
        if (row.Status === 'Proposed' && options.IncludeProposed !== true) {
            return null;
        }
        const edgeType = edgeTypesById.Get(row.EdgeTypeID);
        const typeName = edgeType?.Name ?? row.EdgeType ?? GRAPH_DEFAULT_EDGE_TYPE;
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
            Description: textReadable.Description ? (row.Description ?? null) : null,
            Attributes: textReadable.Attributes ? parseJsonObject(row.Attributes) : null,
            Origin: row.Origin,
            Status: row.Status,
            Confidence: row.Confidence ?? null,
        };
    }

    /**
     * Whether every principal may read a stored edge's `Description` and `Attributes`. A field-level
     * denial still returns the row (only the column is dropped), and the preload cache holds every
     * column, so an edge's text is shown only when no principal is denied it.
     */
    private storedEdgeTextReadable(principals: UserInfo[], provider: GraphDataProvider): StoredEdgeTextReadability {
        const edgeEntity = provider.EntityByName(GRAPH_EDGES_ENTITY);
        return {
            Description: edgeEntity != null && IsFieldReadableByAll(edgeEntity, 'Description', principals),
            Attributes: edgeEntity != null && IsFieldReadableByAll(edgeEntity, 'Attributes', principals),
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
        if (graph.LoadMode === 'Preload' && !includeProposed && cacheServesEveryone) {
            const preloaded = await this.preloadedEdgesOf(graph);
            if (preloaded) {
                return this.preloadEdgesFor(preloaded, frontierKeys);
            }
        }
        return this.readStoredEdgesAsPrincipals(graph, frontier, options, principals, provider);
    }

    private preloadEdgesFor(preloaded: PreloadedGraphEdges, frontierKeys: Set<string>): StoredEdgeRow[] {
        const byId = new Map<string, StoredEdgeRow>();
        for (const key of frontierKeys) {
            for (const row of preloaded.ByNodeKey.get(key) ?? []) {
                byId.set(row.ID, row);
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

    /**
     * The approved stored edges of one `Preload` graph, loaded on first use as the engine's own identity
     * (the system user on a server) and kept until a change drops them. `null` when the read fails: the
     * caller then reads on demand as each principal.
     */
    private async preloadedEdgesOf(graph: MJGraphEntity): Promise<PreloadedGraphEdges | null> {
        const cached = this.preloadedEdges.Get(graph.ID);
        if (cached) {
            return cached;
        }
        const inFlight = this.preloadReads.Get(graph.ID);
        if (inFlight) {
            return inFlight;
        }
        const generation = this.preloadGeneration;
        const read = this.readPreloadedEdges(graph).then((loaded) => {
            if (this.preloadReads.Get(graph.ID) === read) {
                this.preloadReads.Delete(graph.ID);
            }
            if (loaded && generation === this.preloadGeneration) {
                this.preloadedEdges.Set(graph.ID, loaded); // not cached if a change arrived mid-read
            }
            return loaded;
        });
        this.preloadReads.Set(graph.ID, read);
        return read;
    }

    private async readPreloadedEdges(graph: MJGraphEntity): Promise<PreloadedGraphEdges | null> {
        const provider = this.ProviderToUse;
        if (!IsGraphDataProvider(provider)) {
            return null;
        }
        const res = await RunView.FromMetadataProvider(provider).RunView<StoredEdgeRow>(
            {
                EntityName: GRAPH_EDGES_ENTITY,
                ExtraFilter: `[GraphID] = '${EscapeSQLString(graph.ID)}' AND [Status] = 'Approved'`,
                Fields: STORED_EDGE_FIELDS,
                OrderBy: '[ID]',
                ResultType: 'simple',
            },
            this.ContextUser,
        );
        if (!res.Success) {
            LogError(`GraphEngine: loading stored edges of Preload graph "${graph.Name}" failed; reading them on demand until a reload succeeds: ${res.ErrorMessage}`);
            return null;
        }
        const loaded: PreloadedGraphEdges = { ByNodeKey: new Map<string, StoredEdgeRow[]>(), EdgeIds: new UUIDSet() };
        for (const row of res.Results) {
            loaded.EdgeIds.Add(row.ID);
            for (const key of [FormatGraphNodeKey(row.SourceEntityID, String(row.SourceRecordID)), FormatGraphNodeKey(row.TargetEntityID, String(row.TargetRecordID))]) {
                const list = loaded.ByNodeKey.get(key);
                if (list) {
                    list.push(row);
                } else {
                    loaded.ByNodeKey.set(key, [row]);
                }
            }
        }
        return loaded;
    }

    /**
     * Derived edges every principal derives. Data-scale providers read as the user they run for, so an
     * edge one principal derives from a row another cannot read (a membership, a link) would reveal that
     * row; each principal runs the providers and only edges all of them produce are kept. Each read
     * also applied that principal's field-level security, so an edge keeps only the text every
     * principal's version carries (see {@link sharedEdgeText}).
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
        const otherById = others.map((edges) => new Map(edges.map((e) => [e.ID, e])));
        const shared: GraphEdgeView[] = [];
        for (const edge of callerEdges) {
            const versions = otherById.map((byId) => byId.get(edge.ID));
            if (versions.every((v) => v !== undefined)) {
                shared.push(sharedEdgeText(edge, versions.filter((v): v is GraphEdgeView => v !== undefined)));
            }
        }
        return shared;
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
        const request: GraphEdgeRequest = {
            Nodes: frontier,
            Direction: options.Direction ?? 'Both',
            EdgeTypes: options.EdgeTypes,
            IncludeProposed: options.IncludeProposed === true,
        };
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
        includeProposed: boolean,
    ): Promise<Map<string, GraphNodeView>> {
        if (candidates.length === 0 || principals.length === 0) {
            return new Map<string, GraphNodeView>();
        }
        const normalized = candidates.map((c) => this.normalizeNodeRef(c, provider));
        const perPrincipal = await Promise.all(principals.map((p) => this.resolveNodesForPrincipal(normalized, p, provider, includeProposed)));
        const visible = perPrincipal[0];
        for (const other of perPrincipal.slice(1)) {
            for (const [key, view] of Array.from(visible)) {
                const otherView = other.get(key);
                if (!otherView) {
                    visible.delete(key);
                } else {
                    visible.set(key, sharedNodeText(view, otherView));
                }
            }
        }
        if (principals.length > 1) {
            this.neutralizeUnsharedText(visible, principals, provider);
        }
        return visible;
    }

    /**
     * Data-node labels and descriptions come from the caller's read. Field-level security drops a
     * denied column but still returns the row, so a reader denied the name field still counts the node
     * as visible; its label and description are shown only when EVERY principal may read the field,
     * and otherwise replaced by the neutral `<entity name> <record ID>` label and no description.
     * (Metadata nodes take their text from metadata, which entity permissions already gate.)
     */
    private neutralizeUnsharedText(visible: Map<string, GraphNodeView>, principals: UserInfo[], provider: GraphDataProvider): void {
        const readableByEntity = new Map<string, { Name: boolean; Description: boolean }>();
        for (const [key, view] of visible) {
            if (metadataNodeKind(view.EntityName)) {
                continue;
            }
            const entity = provider.EntityByName(view.EntityName);
            if (!entity) {
                continue;
            }
            let readable = readableByEntity.get(entity.Name);
            if (!readable) {
                const nameField = entity.NameField?.Name;
                readable = {
                    Name: nameField != null && IsFieldReadableByAll(entity, nameField, principals),
                    Description: IsFieldReadableByAll(entity, 'Description', principals),
                };
                readableByEntity.set(entity.Name, readable);
            }
            if (!readable.Name || !readable.Description) {
                visible.set(key, {
                    ...view,
                    Label: readable.Name ? view.Label : NeutralGraphNodeLabel(entity.Name, view.RecordID),
                    Description: readable.Description ? view.Description : null,
                });
            }
        }
    }

    /**
     * Nodes `principal` may see. Metadata nodes are checked against metadata; every data record —
     * concepts included — is read as `principal` in one batched `RunViews` (`[pk] IN (...)` per
     * entity), and a record that does not come back is invisible. A concept whose `Status` (as this
     * principal read it) is not {@link IsGraphConceptStatusVisible} is invisible too.
     */
    private async resolveNodesForPrincipal(
        nodes: GraphNodeRef[],
        principal: UserInfo,
        provider: GraphDataProvider,
        includeProposed: boolean,
        policyDepth = 0,
    ): Promise<Map<string, GraphNodeView>> {
        const visible = new Map<string, GraphNodeView>();
        if (policyDepth > MAX_POLICY_DEPTH) {
            LogError(`GraphEngine: access policies nested more than ${MAX_POLICY_DEPTH} deep; hiding ${nodes.length} node(s).`);
            return visible;
        }
        const buckets = new Map<string, DataNodeBucket>();
        const replaced = new Map<string, { Policy: BaseGraphNodeAccessPolicy; Nodes: GraphPolicyNode[] }>();
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
            if (!entity) {
                continue;
            }
            const policy = GraphAccessPolicyRegistry.GetNodePolicy(entity.Name);
            if (policy?.Mode === 'Replace') {
                const group = replaced.get(entity.Name) ?? { Policy: policy, Nodes: [] };
                group.Nodes.push({ Key: key, Ref: node });
                replaced.set(entity.Name, group);
                continue;
            }
            if (!CanUserReadEntity(entity, principal)) {
                continue;
            }
            const bucket = buckets.get(entity.Name) ?? { Entity: entity, Nodes: [] };
            bucket.Nodes.push({ Ref: node, Key: key });
            buckets.set(entity.Name, bucket);
        }
        await this.resolveDataNodes(Array.from(buckets.values()), principal, provider, includeProposed, visible);
        const ctx = this.policyContext(principal, provider, includeProposed, policyDepth);
        await this.readReplacedNodes(replaced, ctx, visible);
        await this.applyNodePolicies(nodes, ctx, visible);
        return visible;
    }

    /** What a policy may use while deciding for `principal`; nested checks run one level deeper. */
    private policyContext(
        principal: UserInfo,
        provider: GraphDataProvider,
        includeProposed: boolean,
        policyDepth: number,
    ): GraphAccessPolicyContext {
        return {
            Principal: principal,
            Provider: provider,
            IncludeProposed: includeProposed,
            NodeKey: (node) => this.nodeKey(node, provider),
            IsCanonGraph: (graphID) => this.isCanonGraphID(graphID),
            ResolveVisibleKeys: async (refs) => {
                const normalized = refs.map((r) => this.normalizeNodeRef(r, provider));
                const found = await this.resolveNodesForPrincipal(normalized, principal, provider, includeProposed, policyDepth + 1);
                return new Set(found.keys());
            },
        };
    }

    /** `Replace` policies read their own nodes; a policy that throws hides its nodes. */
    private async readReplacedNodes(
        replaced: Map<string, { Policy: BaseGraphNodeAccessPolicy; Nodes: GraphPolicyNode[] }>,
        ctx: GraphAccessPolicyContext,
        visible: Map<string, GraphNodeView>,
    ): Promise<void> {
        for (const [entityName, group] of replaced) {
            try {
                const views = await group.Policy.ReadNodes(group.Nodes, ctx);
                for (const n of group.Nodes) {
                    const view = views.get(n.Key);
                    if (view) {
                        visible.set(n.Key, view);
                    }
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`GraphEngine: the Replace access policy for '${entityName}' failed; hiding its nodes: ${msg}`);
            }
        }
    }

    /**
     * Runs each visible node's entity policy over it. `Hidden` (or a missing decision) removes the
     * node; `Redacted` keeps it with the neutral label and no description. A policy that throws hides
     * every node it governs.
     */
    private async applyNodePolicies(
        nodes: GraphNodeRef[],
        ctx: GraphAccessPolicyContext,
        visible: Map<string, GraphNodeView>,
    ): Promise<void> {
        const groups = new Map<string, { Policy: BaseGraphNodeAccessPolicy; Nodes: GraphPolicyNode[] }>();
        for (const node of nodes) {
            const key = ctx.NodeKey(node);
            const view = visible.get(key);
            if (!view || metadataNodeKind(view.EntityName)) {
                continue;
            }
            const policy = GraphAccessPolicyRegistry.GetNodePolicy(view.EntityName);
            if (!policy) {
                continue;
            }
            const group = groups.get(view.EntityName) ?? { Policy: policy, Nodes: [] };
            if (!group.Nodes.some((n) => n.Key === key)) {
                group.Nodes.push({ Key: key, Ref: node, View: view });
            }
            groups.set(view.EntityName, group);
        }
        for (const [entityName, group] of groups) {
            const decisions = await this.decideNodes(entityName, group.Policy, group.Nodes, ctx);
            for (const n of group.Nodes) {
                this.applyNodeDecision(n, decisions.get(n.Key) ?? 'Hidden', visible);
            }
        }
    }

    private async decideNodes(
        entityName: string,
        policy: BaseGraphNodeAccessPolicy,
        nodes: GraphPolicyNode[],
        ctx: GraphAccessPolicyContext,
    ): Promise<Map<string, GraphNodeAccessDecision>> {
        try {
            return await policy.FilterNodes(nodes, ctx);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`GraphEngine: the access policy for '${entityName}' failed; hiding its nodes: ${msg}`);
            return new Map<string, GraphNodeAccessDecision>();
        }
    }

    private applyNodeDecision(node: GraphPolicyNode, decision: GraphNodeAccessDecision, visible: Map<string, GraphNodeView>): void {
        if (decision === 'Hidden') {
            visible.delete(node.Key);
            return;
        }
        const view = visible.get(node.Key);
        if (decision === 'Redacted' && view) {
            visible.set(node.Key, { ...view, Label: NeutralGraphNodeLabel(view.EntityName, view.RecordID), Description: null });
        }
    }

    /** `true` when `graphID` is an active graph whose graph type has `IsCanon = 1`. */
    private isCanonGraphID(graphID: string): boolean {
        const graph = this.Graphs.find((g) => UUIDsEqual(g.ID, graphID));
        if (!graph || graph.Status !== 'Active') {
            return false;
        }
        const graphType = this.GraphTypes.find((t) => UUIDsEqual(t.ID, graph.GraphTypeID));
        return graphType?.IsCanon === true;
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
        includeProposed: boolean,
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
            this.addReturnedRows(buckets[i], res.Results, includeProposed, visible);
        }
    }

    private buildNodeReadParams(bucket: DataNodeBucket): RunViewParams {
        const pkField = bucket.Entity.FirstPrimaryKey.Name; // first-pk-ok: Graph node keys address single-PK or URL-segment records via FirstPrimaryKey
        const fields = new Set<string>([pkField]);
        const nameField = bucket.Entity.NameField?.Name;
        if (nameField) {
            fields.add(nameField);
        }
        if (isConceptEntity(bucket.Entity)) {
            fields.add('Status'); // a concept's visibility depends on its review status
            if (bucket.Entity.Fields?.some((f) => f.Name === 'Description')) {
                fields.add('Description');
            }
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

    private addReturnedRows(
        bucket: DataNodeBucket,
        rows: Array<Record<string, unknown>>,
        includeProposed: boolean,
        visible: Map<string, GraphNodeView>,
    ): void {
        const pkField = bucket.Entity.FirstPrimaryKey.Name; // first-pk-ok: Graph node keys address single-PK or URL-segment records via FirstPrimaryKey
        const nameField = bucket.Entity.NameField?.Name;
        const isConcept = isConceptEntity(bucket.Entity);
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
            if (isConcept && !IsGraphConceptStatusVisible(row['Status'], includeProposed)) {
                continue; // an unreviewed (Draft/Proposed) or Deprecated concept is not canon
            }
            const label = nameField && row[nameField] != null ? String(row[nameField]) : NeutralGraphNodeLabel(bucket.Entity.Name, item.Ref.RecordID);
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

/** The label a node gets when its name field may not be shown: the entity name and the record key. */
export function NeutralGraphNodeLabel(entityName: string, recordId: string): string {
    return `${entityName} ${recordId}`;
}

/** True when every principal may read `fieldName` on `entity` (MJ field-level security). */
export function IsFieldReadableByAll(entity: EntityInfo, fieldName: string, principals: readonly UserInfo[]): boolean {
    return principals.every((p) => entity.IsFieldReadableByUser(fieldName, p));
}

/**
 * `edge` (the caller's version of a derived edge) with only the text every principal's version
 * carries: its `Description` when every version has the same one, and the `Attributes` keys whose
 * values every version shares. A value a principal's field-level security dropped is missing from
 * that principal's version, so it is dropped here too.
 */
function sharedEdgeText(edge: GraphEdgeView, others: readonly GraphEdgeView[]): GraphEdgeView {
    const description = others.every((o) => o.Description === edge.Description) ? edge.Description : null;
    let attributes: Record<string, unknown> | null = null;
    if (edge.Attributes) {
        const kept: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(edge.Attributes)) {
            const serialized = JSON.stringify(value);
            if (others.every((o) => o.Attributes != null && key in o.Attributes && JSON.stringify(o.Attributes[key]) === serialized)) {
                kept[key] = value;
            }
        }
        attributes = Object.keys(kept).length > 0 ? kept : null;
    }
    return { ...edge, Description: description, Attributes: attributes };
}

/**
 * The text two principals may both see on one node. A node an access policy redacted for one of them
 * comes back with the neutral label and no description, so any difference means one reader may not
 * see the other's text: the label falls back to the neutral label and the description to none.
 */
function sharedNodeText(view: GraphNodeView, other: GraphNodeView): GraphNodeView {
    const label = view.Label === other.Label ? view.Label : NeutralGraphNodeLabel(view.EntityName, view.RecordID);
    const description = view.Description === other.Description ? view.Description : null;
    return label === view.Label && description === view.Description ? view : { ...view, Label: label, Description: description };
}

function isConceptEntity(entity: EntityInfo): boolean {
    return entity.Name.trim().toLowerCase() === GRAPH_CONCEPTS_ENTITY.toLowerCase();
}

/** `MJ: Graph Concepts.Status` values, from the generated entity. */
export type GraphConceptStatus = MJGraphConceptEntity['Status'];

/**
 * Whether a concept with this `Status` may seed a traversal or appear in one. Only `Approved`
 * concepts are canon; `Proposed` ones appear only when the caller asked for proposed content
 * (`IncludeProposed`); `Draft` (the column default: still being written) and `Deprecated` never do.
 * Anything else, including a status the reader could not read, is not visible.
 */
export function IsGraphConceptStatusVisible(status: unknown, includeProposed: boolean): boolean {
    const approved: GraphConceptStatus = 'Approved';
    const proposed: GraphConceptStatus = 'Proposed';
    return status === approved || (includeProposed && status === proposed);
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

/**
 * True only when `user` holds the `Graph: Approve Edges` authorization (directly or via an
 * ancestor authorization) in `authorizations`. Fails closed when `user`, `authorizations`, or the
 * seeded `Graph: Approve Edges` authorization is missing.
 */
export function CanUserApproveGraph(
    user: UserInfo | null | undefined,
    authorizations: AuthorizationInfo[] | null | undefined,
): boolean {
    if (!user || !Array.isArray(authorizations) || authorizations.length === 0) {
        return false;
    }
    const [check] = EvaluateAuthorizationChecks([GRAPH_APPROVE_EDGES_AUTHORIZATION], user, authorizations);
    return check != null && !check.Unknown && check.Allowed === true;
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

/** A {@link GraphPath} that found nothing, with the reason. */
function notFoundPath(message: string): GraphPath {
    return { Found: false, Nodes: [], Edges: [], PathWeight: 0, Message: message };
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
