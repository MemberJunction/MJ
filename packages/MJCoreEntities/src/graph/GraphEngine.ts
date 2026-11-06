import {
    BaseEngine,
    BaseEnginePropertyConfig,
    EntityAlternateBaseViewInfo,
    EntityFieldInfo,
    EntityInfo,
    IMetadataProvider,
    IRunQueryProvider,
    IRunViewProvider,
    LogError,
    Metadata,
    RegisterForStartup,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import {
    EscapeSQLString,
    MJGlobal,
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
import type { MJGraphEdgeEntityType } from '../generated/entities/__mj';
import { QueryEngine } from '../engines/QueryEngine';
import {
    BaseGraphEdgeProvider,
    FormatGraphNodeKey,
    MatchesEdgeTypeFilter,
    type GraphEdgeRequest,
    type GraphEdgeView,
    type GraphNodeRef,
    type GraphNodeView,
    type GraphSubgraph,
    type GraphTraversalOptions,
} from './BaseGraphEdgeProvider';

interface FrontierCandidate {
    Node: GraphNodeRef;
    Key: string;
    PathWeight: number;
    Hop: number;
}

/**
 * Semantic Graph Engine (`WS-4.2` / `plans/canon-semantic-graph.md`).
 *
 * Manages named graph partitions (`MJ: Graphs`), edge types and endpoint constraints,
 * stored polymorphic edges (`MJ: Graph Edges`), and pluggable derived edge providers
 * (`MJ: Graph Edge Providers`), executing best-first bounded neighborhood expansions
 * (`Subgraph`) with unified label and permission/RLS resolution.
 */
@RegisterForStartup()
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
    private _storedEdges: MJGraphEdgeEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: 'MJ: Graphs', PropertyName: '_graphs', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Types', PropertyName: '_graphTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Edge Types', PropertyName: '_edgeTypes', CacheLocal: true },
            {
                Type: 'entity',
                EntityName: 'MJ: Graph Edge Type Endpoints',
                PropertyName: '_edgeTypeEndpoints',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Graph Edge Providers',
                PropertyName: '_edgeProviders',
                CacheLocal: true,
            },
            { Type: 'entity', EntityName: 'MJ: Graph Concepts', PropertyName: '_concepts', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Graph Concept Types', PropertyName: '_conceptTypes', CacheLocal: true },
            {
                Type: 'entity',
                EntityName: 'MJ: Graph Authority Tiers',
                PropertyName: '_authorityTiers',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Graph Edges',
                PropertyName: '_storedEdges',
                Filter: "Status='Approved'",
                CacheLocal: true,
            },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
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

    public get Concepts(): MJGraphConceptEntity[] {
        return this.GetConfigData<MJGraphConceptEntity>('_concepts') ?? this._concepts;
    }

    public get ConceptTypes(): MJGraphConceptTypeEntity[] {
        return this.GetConfigData<MJGraphConceptTypeEntity>('_conceptTypes') ?? this._conceptTypes;
    }

    public get AuthorityTiers(): MJGraphAuthorityTierEntity[] {
        return this.GetConfigData<MJGraphAuthorityTierEntity>('_authorityTiers') ?? this._authorityTiers;
    }

    public get StoredEdges(): MJGraphEdgeEntity[] {
        const raw = this.GetConfigData<MJGraphEdgeEntity>('_storedEdges') ?? this._storedEdges;
        const graphs = this.Graphs;
        if (!graphs || graphs.length === 0) {
            return raw;
        }
        const preloadGraphIds = new UUIDSet();
        for (const g of graphs) {
            if (g.LoadMode === 'Preload' && g.Status === 'Active') {
                preloadGraphIds.Add(g.ID);
            }
        }
        if (preloadGraphIds.Size === 0) {
            return [];
        }
        return raw.filter((e) => preloadGraphIds.Has(e.GraphID));
    }

    /**
     * Find an active `MJ: Graphs` row by `Name` (case-insensitive) or `ID`.
     */
    public GetGraph(graphNameOrId: string): MJGraphEntity | undefined {
        const trimmed = graphNameOrId.trim();
        if (!trimmed) {
            return undefined;
        }
        const lower = trimmed.toLowerCase();
        return this.Graphs.find(
            (g) =>
                g.Status === 'Active' &&
                (g.Name.trim().toLowerCase() === lower || UUIDsEqual(g.ID, trimmed)),
        );
    }

    /**
     * Validate whether `entityId` is permitted on `side` (`'Source'` or `'Target'`) of `edgeTypeId`
     * according to `MJ: Graph Edge Type Endpoints`. When no endpoint rows exist for `(edgeTypeId, side)`,
     * any entity is permitted.
     */
    public ValidateEdgeEndpoint(
        edgeTypeId: string,
        side: 'Source' | 'Target',
        entityId: string,
    ): boolean {
        const constraints = this.EdgeTypeEndpoints.filter(
            (ep) => UUIDsEqual(ep.EdgeTypeID, edgeTypeId) && ep.Side === side,
        );
        if (constraints.length === 0) {
            return true;
        }
        return constraints.some((ep) => UUIDsEqual(ep.EntityID, entityId));
    }

    /**
     * Resolve display labels and enforce entity `CanRead`, RLS, `UserCanRun`, and `IsUsable`
     * for a set of candidate nodes under `user`, returning only the nodes `user` is permitted to see.
     */
    public async FilterNodesForUser(
        nodes: GraphNodeRef[],
        user: UserInfo,
        provider?: IMetadataProvider & IRunViewProvider,
    ): Promise<Map<string, GraphNodeView>> {
        if (!user || !nodes || nodes.length === 0) {
            return new Map<string, GraphNodeView>();
        }
        const activeProvider = provider ?? this.getMetadataProvider();
        return this.resolveNodesAndPermissions(nodes, user, activeProvider);
    }

    /**
     * Retrieve stored and derived edges incident to a single `node` in `graphName`,
     * filtering out any edge touching an entity or record `user` cannot read.
     */
    public async GetEdges(
        graphName: string,
        node: GraphNodeRef,
        options: GraphTraversalOptions,
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        if (!user) {
            return [];
        }
        const provider = this.getMetadataProvider();
        const rawEdges = await this.getEdgesForFrontier(graphName, [node], options, user);
        if (rawEdges.length === 0) {
            return [];
        }
        const endpointRefs: GraphNodeRef[] = [node];
        for (const edge of rawEdges) {
            endpointRefs.push(edge.Source, edge.Target);
        }
        const visibleNodes = await this.resolveNodesAndPermissions(endpointRefs, user, provider);
        return rawEdges.filter((edge) => {
            const sKey = this.getNodeKey(edge.Source, provider);
            const tKey = this.getNodeKey(edge.Target, provider);
            return visibleNodes.has(sKey) && visibleNodes.has(tKey);
        });
    }

    /**
     * Perform a best-first bounded neighborhood expansion around `seeds` in `graphName`,
     * resolving display labels and enforcing entity `CanRead`, row-level security,
     * `UserCanRun` (queries), and `IsUsable` (alternate base views) at every hop so
     * traversal never crosses an unauthorized intermediate node.
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

        const provider = this.getMetadataProvider();
        const rawDepth = options.Depth ?? options.MaxDepth ?? 2;
        const maxDepth = Math.max(1, Math.min(4, Math.floor(rawDepth)));
        const rawMaxNodes = options.MaxNodes ?? 50;
        const maxNodes = Math.max(1, Math.min(200, Math.floor(rawMaxNodes)));
        const minWeight = options.MinWeight ?? 0;

        const normalizedSeeds = seeds.map((s) => this.normalizeNodeRef(s, provider));
        const visibleSeedMap = await this.resolveNodesAndPermissions(normalizedSeeds, user, provider);
        if (visibleSeedMap.size === 0) {
            return { Nodes: [], Edges: [] };
        }

        const discoveredNodes = new Map<string, FrontierCandidate>();
        const visibleNodeMap = new Map<string, GraphNodeView>();
        let frontier: FrontierCandidate[] = [];

        for (const seed of normalizedSeeds) {
            const key = this.getNodeKey(seed, provider);
            const resolvedSeed = visibleSeedMap.get(key);
            if (!resolvedSeed) {
                continue;
            }
            if (!discoveredNodes.has(key) && discoveredNodes.size < maxNodes) {
                const candidate: FrontierCandidate = {
                    Node: seed,
                    Key: key,
                    PathWeight: 1.0,
                    Hop: 0,
                };
                discoveredNodes.set(key, candidate);
                visibleNodeMap.set(key, resolvedSeed);
                frontier.push(candidate);
            }
        }

        const collectedEdges = new Map<string, GraphEdgeView>();

        for (let hop = 1; hop <= maxDepth && frontier.length > 0; hop++) {
            // Sort frontier best-first by PathWeight descending
            frontier.sort((a, b) => b.PathWeight - a.PathWeight);

            const stepEdges = await this.getEdgesForFrontier(
                graphName,
                frontier.map((f) => f.Node),
                options,
                user,
            );

            // Rank candidate edges best-first by parent path weight * edge weight * hop decay
            const scoredEdges: Array<{
                Edge: GraphEdgeView;
                Neighbor: GraphNodeRef;
                NeighborKey: string;
                Score: number;
            }> = [];
            for (const edge of stepEdges) {
                if (edge.Weight < minWeight) {
                    continue;
                }
                const sourceKey = this.getNodeKey(edge.Source, provider);
                const targetKey = this.getNodeKey(edge.Target, provider);

                const fromSource = discoveredNodes.get(sourceKey);
                const fromTarget = discoveredNodes.get(targetKey);

                if (fromSource && !discoveredNodes.has(targetKey)) {
                    scoredEdges.push({
                        Edge: edge,
                        Neighbor: edge.Target,
                        NeighborKey: targetKey,
                        Score: fromSource.PathWeight * edge.Weight * Math.pow(0.85, hop - 1),
                    });
                } else if (fromTarget && !discoveredNodes.has(sourceKey)) {
                    scoredEdges.push({
                        Edge: edge,
                        Neighbor: edge.Source,
                        NeighborKey: sourceKey,
                        Score: fromTarget.PathWeight * edge.Weight * Math.pow(0.85, hop - 1),
                    });
                } else if (fromSource && fromTarget) {
                    // Edge between two already-discovered visible nodes
                    collectedEdges.set(edge.ID, edge);
                }
            }

            if (scoredEdges.length === 0) {
                break;
            }

            scoredEdges.sort((a, b) => b.Score - a.Score);

            // Batch permission/RLS check for this hop's candidate neighbors before admitting them to the frontier
            const uniqueCandidateRefs = new Map<string, GraphNodeRef>();
            for (const item of scoredEdges) {
                if (!discoveredNodes.has(item.NeighborKey) && !uniqueCandidateRefs.has(item.NeighborKey)) {
                    uniqueCandidateRefs.set(item.NeighborKey, this.normalizeNodeRef(item.Neighbor, provider));
                }
            }
            const hopVisibleMap = await this.resolveNodesAndPermissions(
                Array.from(uniqueCandidateRefs.values()),
                user,
                provider,
            );

            const nextFrontier: FrontierCandidate[] = [];

            for (const item of scoredEdges) {
                const resolvedNeighbor =
                    visibleNodeMap.get(item.NeighborKey) ?? hopVisibleMap.get(item.NeighborKey);
                if (!resolvedNeighbor) {
                    // Neighbor is unreadable or RLS-hidden — drop both the neighbor and the edge
                    continue;
                }
                if (!discoveredNodes.has(item.NeighborKey)) {
                    if (discoveredNodes.size >= maxNodes) {
                        continue;
                    }
                    const cand: FrontierCandidate = {
                        Node: this.normalizeNodeRef(item.Neighbor, provider),
                        Key: item.NeighborKey,
                        PathWeight: item.Score,
                        Hop: hop,
                    };
                    discoveredNodes.set(item.NeighborKey, cand);
                    visibleNodeMap.set(item.NeighborKey, resolvedNeighbor);
                    nextFrontier.push(cand);
                }
                collectedEdges.set(item.Edge.ID, item.Edge);
            }

            frontier = nextFrontier;
        }

        const finalEdges: GraphEdgeView[] = [];
        for (const edge of collectedEdges.values()) {
            const sKey = this.getNodeKey(edge.Source, provider);
            const tKey = this.getNodeKey(edge.Target, provider);
            if (visibleNodeMap.has(sKey) && visibleNodeMap.has(tKey)) {
                finalEdges.push(edge);
            }
        }

        return {
            Nodes: Array.from(visibleNodeMap.values()),
            Edges: finalEdges,
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
            return 'No semantic graph context found.';
        }

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
            const provider = this.getMetadataProvider();
            for (const e of subgraph.Edges) {
                const sKey = this.getNodeKey(e.Source, provider);
                const tKey = this.getNodeKey(e.Target, provider);
                const sLabel = nodeByKey.get(sKey)?.Label ?? `${e.Source.EntityName}:${e.Source.RecordID}`;
                const tLabel = nodeByKey.get(tKey)?.Label ?? `${e.Target.EntityName}:${e.Target.RecordID}`;
                const arrow = e.IsDirected ? '-->' : '<-->';
                const desc = e.Description ? ` (${e.Description})` : '';
                lines.push(`- "${sLabel}" --[${e.TypeName} (${e.Weight.toFixed(2)})]${arrow} "${tLabel}"${desc}`);
            }
        }

        return lines.join('\n');
    }

    // ----- Internal helpers ----------------------------------------------------

    private getMetadataProvider(): IMetadataProvider & IRunViewProvider & Partial<IRunQueryProvider> {
        const p = this.ProviderToUse as unknown as
            | (IMetadataProvider & IRunViewProvider & Partial<IRunQueryProvider>)
            | undefined;
        if (p && Array.isArray(p.Entities)) {
            return p;
        }
        return Metadata.Provider as unknown as IMetadataProvider & IRunViewProvider & Partial<IRunQueryProvider>; // global-provider-ok: fallback when BaseEngine has not been bound to an explicit provider
    }

    private normalizeNodeRef(node: GraphNodeRef, provider: IMetadataProvider): GraphNodeRef {
        if (node.EntityID && node.EntityName) {
            return node;
        }
        const byName = node.EntityName ? provider.EntityByName(node.EntityName) : undefined;
        if (byName) {
            return {
                EntityName: byName.Name,
                EntityID: byName.ID,
                RecordID: String(node.RecordID).trim(),
            };
        }
        if (node.EntityID) {
            const byId = provider.Entities?.find((e) => UUIDsEqual(e.ID, node.EntityID));
            if (byId) {
                return {
                    EntityName: byId.Name,
                    EntityID: byId.ID,
                    RecordID: String(node.RecordID).trim(),
                };
            }
        }
        return {
            EntityName: node.EntityName.trim(),
            EntityID: node.EntityID,
            RecordID: String(node.RecordID).trim(),
        };
    }

    private getNodeKey(node: GraphNodeRef, provider: IMetadataProvider): string {
        const normalized = this.normalizeNodeRef(node, provider);
        return FormatGraphNodeKey(normalized.EntityID ?? normalized.EntityName, normalized.RecordID);
    }

    private async getEdgesForFrontier(
        graphName: string,
        nodes: GraphNodeRef[],
        options: GraphTraversalOptions,
        user: UserInfo,
    ): Promise<GraphEdgeView[]> {
        const provider = this.getMetadataProvider();
        const graph = this.GetGraph(graphName);
        const direction = options.Direction ?? 'Both';
        const minWeight = options.MinWeight ?? 0;
        const includeProposed = options.IncludeProposed === true;

        const normalizedFrontier = nodes.map((n) => this.normalizeNodeRef(n, provider));
        const frontierKeys = new Set(normalizedFrontier.map((n) => this.getNodeKey(n, provider)));

        const edgeTypeById = new UUIDMap<MJGraphEdgeTypeEntity>();
        for (const et of this.EdgeTypes) {
            edgeTypeById.Set(et.ID, et);
        }

        const entitiesById = new UUIDMap<EntityInfo>();
        for (const entity of provider.Entities ?? []) {
            if (entity.ID) {
                entitiesById.Set(entity.ID, entity);
            }
        }

        const storedRows = await this.loadStoredEdgesForStep(graph, normalizedFrontier, direction, user, provider);
        const results = new Map<string, GraphEdgeView>();

        const wantOut = direction === 'Out' || direction === 'Both';
        const wantIn = direction === 'In' || direction === 'Both';

        for (const row of storedRows) {
            if (graph && !UUIDsEqual(row.GraphID, graph.ID)) {
                continue;
            }
            if (row.Status === 'Rejected') {
                continue;
            }
            if (row.Status === 'Proposed' && !includeProposed) {
                continue;
            }

            const edgeType = edgeTypeById.Get(row.EdgeTypeID);
            const typeName = edgeType?.Name ?? row.EdgeType ?? 'Related To';
            if (!MatchesEdgeTypeFilter(typeName, options.EdgeTypes)) {
                continue;
            }

            const weight = typeof row.Weight === 'number' ? row.Weight : (edgeType?.DefaultWeight ?? 1.0);
            if (weight < minWeight) {
                continue;
            }

            if (edgeType) {
                if (!this.ValidateEdgeEndpoint(edgeType.ID, 'Source', row.SourceEntityID)) {
                    continue;
                }
                if (!this.ValidateEdgeEndpoint(edgeType.ID, 'Target', row.TargetEntityID)) {
                    continue;
                }
            }

            const sourceInfo =
                (row.SourceEntityID ? entitiesById.Get(row.SourceEntityID) : undefined) ??
                (row.SourceEntity ? provider.EntityByName(row.SourceEntity) : undefined);
            const targetInfo =
                (row.TargetEntityID ? entitiesById.Get(row.TargetEntityID) : undefined) ??
                (row.TargetEntity ? provider.EntityByName(row.TargetEntity) : undefined);
            const sourceRef: GraphNodeRef = {
                EntityName: sourceInfo?.Name ?? row.SourceEntity ?? row.SourceEntityID,
                EntityID: sourceInfo?.ID ?? row.SourceEntityID,
                RecordID: String(row.SourceRecordID),
            };
            const targetRef: GraphNodeRef = {
                EntityName: targetInfo?.Name ?? row.TargetEntity ?? row.TargetEntityID,
                EntityID: targetInfo?.ID ?? row.TargetEntityID,
                RecordID: String(row.TargetRecordID),
            };

            const sKey = this.getNodeKey(sourceRef, provider);
            const tKey = this.getNodeKey(targetRef, provider);
            const isDirected = edgeType ? edgeType.IsDirected : true;

            const matchesDirection =
                (wantOut && frontierKeys.has(sKey)) ||
                (wantIn && frontierKeys.has(tKey)) ||
                (!isDirected && (frontierKeys.has(sKey) || frontierKeys.has(tKey)));
            if (!matchesDirection) {
                continue;
            }

            let attributes: Record<string, unknown> | null = null;
            if (row.Attributes) {
                try {
                    const parsed: unknown = JSON.parse(row.Attributes);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        attributes = parsed as Record<string, unknown>;
                    }
                } catch {
                    attributes = null;
                }
            }

            results.set(row.ID, {
                ID: row.ID,
                GraphName: graph?.Name ?? row.Graph ?? graphName,
                TypeName: typeName,
                InverseTypeName: edgeType?.InverseName ?? null,
                Source: sourceRef,
                Target: targetRef,
                IsDirected: isDirected,
                Weight: weight,
                Description: row.Description ?? null,
                Attributes: attributes,
                Origin: row.Origin,
                Status: row.Status,
                Confidence: row.Confidence ?? null,
            });
        }

        // Run active derived edge providers registered for this graph
        if (graph) {
            const activeProviders = this.EdgeProviders.filter(
                (ep) => ep.IsActive && UUIDsEqual(ep.GraphID, graph.ID),
            ).sort((a, b) => a.Sequence - b.Sequence);

            const edgeRequest: GraphEdgeRequest = {
                Nodes: normalizedFrontier,
                Direction: direction,
                EdgeTypes: options.EdgeTypes,
            };

            for (const providerRow of activeProviders) {
                const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseGraphEdgeProvider>(
                    BaseGraphEdgeProvider,
                    providerRow.DriverClass,
                );
                if (!instance) {
                    continue;
                }
                let parsedConfig: Record<string, unknown> = {};
                if (providerRow.Configuration) {
                    try {
                        const raw: unknown = JSON.parse(providerRow.Configuration);
                        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                            parsedConfig = raw as Record<string, unknown>;
                        }
                    } catch {
                        parsedConfig = {};
                    }
                }

                try {
                    const derived = await instance.GetEdges(edgeRequest, {
                        Graph: graph,
                        Config: parsedConfig,
                        User: user,
                        Provider: provider,
                    });
                    for (const dEdge of derived) {
                        if (dEdge.Weight < minWeight) {
                            continue;
                        }
                        if (!MatchesEdgeTypeFilter(dEdge.TypeName, options.EdgeTypes)) {
                            continue;
                        }
                        const dSourceKey = this.getNodeKey(dEdge.Source, provider);
                        const dTargetKey = this.getNodeKey(dEdge.Target, provider);
                        const dMatchesFrontier =
                            (wantOut && frontierKeys.has(dSourceKey)) ||
                            (wantIn && frontierKeys.has(dTargetKey)) ||
                            (!dEdge.IsDirected && (frontierKeys.has(dSourceKey) || frontierKeys.has(dTargetKey)));
                        if (!dMatchesFrontier) {
                            continue;
                        }
                        results.set(dEdge.ID, dEdge);
                    }
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    LogError(
                        `GraphEngine: derived edge provider '${providerRow.DriverClass}' failed on graph '${graph.Name}': ${msg}`,
                    );
                }
            }
        }

        return Array.from(results.values());
    }

    private async loadStoredEdgesForStep(
        graph: MJGraphEntity | undefined,
        frontier: GraphNodeRef[],
        direction: 'Out' | 'In' | 'Both',
        user: UserInfo,
        provider: IMetadataProvider & IRunViewProvider,
    ): Promise<Array<Pick<
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
    >>> {
        // When stored edges are preloaded in memory for a Preload graph, use them directly without a DB round-trip
        if ((!graph || graph.LoadMode === 'Preload') && this.StoredEdges.length > 0) {
            return this.StoredEdges;
        }

        // Group frontier record IDs by EntityID so Source/Target filters pair EntityID with RecordID
        const idsByEntityId = new Map<string, Set<string>>();
        const ungroupedRecordIds = new Set<string>();
        for (const node of frontier) {
            const recId = node.RecordID.trim();
            if (!recId) {
                continue;
            }
            const entityId =
                node.EntityID ?? (node.EntityName ? provider.EntityByName(node.EntityName)?.ID : undefined);
            if (entityId) {
                let set = idsByEntityId.get(entityId);
                if (!set) {
                    set = new Set<string>();
                    idsByEntityId.set(entityId, set);
                }
                set.add(recId);
            } else {
                ungroupedRecordIds.add(recId);
            }
        }

        if (idsByEntityId.size === 0 && ungroupedRecordIds.size === 0) {
            return [];
        }

        const buildSideClauses = (entityCol: 'SourceEntityID' | 'TargetEntityID', recordCol: 'SourceRecordID' | 'TargetRecordID'): string[] => {
            const sideParts: string[] = [];
            for (const [entId, recSet] of idsByEntityId.entries()) {
                const quotedIds = Array.from(recSet)
                    .map((id) => `'${EscapeSQLString(id)}'`)
                    .join(', ');
                sideParts.push(`([${entityCol}] = '${EscapeSQLString(entId)}' AND [${recordCol}] IN (${quotedIds}))`);
            }
            if (ungroupedRecordIds.size > 0) {
                const quotedIds = Array.from(ungroupedRecordIds)
                    .map((id) => `'${EscapeSQLString(id)}'`)
                    .join(', ');
                sideParts.push(`[${recordCol}] IN (${quotedIds})`);
            }
            return sideParts;
        };

        const clauses: string[] = [];
        if (direction === 'Out' || direction === 'Both') {
            clauses.push(...buildSideClauses('SourceEntityID', 'SourceRecordID'));
        }
        if (direction === 'In' || direction === 'Both') {
            clauses.push(...buildSideClauses('TargetEntityID', 'TargetRecordID'));
        }
        if (clauses.length === 0) {
            return [];
        }

        let extraFilter = `(${clauses.join(' OR ')})`;
        if (graph?.ID) {
            extraFilter = `([GraphID] = '${EscapeSQLString(graph.ID)}') AND ${extraFilter}`;
        }

        try {
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<MJGraphEdgeEntityType>(
                {
                    EntityName: 'MJ: Graph Edges',
                    ExtraFilter: extraFilter,
                    ResultType: 'simple',
                },
                user,
            );
            return res.Success && Array.isArray(res.Results) ? res.Results : [];
        } catch {
            return [];
        }
    }

    private async resolveNodesAndPermissions(
        candidates: GraphNodeRef[],
        user: UserInfo,
        provider: IMetadataProvider & IRunViewProvider,
    ): Promise<Map<string, GraphNodeView>> {
        const visible = new Map<string, GraphNodeView>();
        const dataNodesByEntity = new Map<string, { Entity: EntityInfo; Nodes: Array<{ Ref: GraphNodeRef; Key: string }> }>();

        // Pre-index metadata lookup structures
        const entitiesById = new UUIDMap<EntityInfo>();
        const fieldsById = new UUIDMap<{ Entity: EntityInfo; Field: EntityFieldInfo }>();
        const abvsById = new UUIDMap<{ Entity: EntityInfo; View: EntityAlternateBaseViewInfo }>();

        for (const entity of provider.Entities ?? []) {
            entitiesById.Set(entity.ID, entity);
            for (const f of entity.Fields ?? []) {
                fieldsById.Set(f.ID, { Entity: entity, Field: f });
            }
            for (const v of entity.AlternateBaseViews ?? []) {
                if (v.ID) {
                    abvsById.Set(v.ID, { Entity: entity, View: v });
                }
            }
        }

        const conceptsById = new UUIDMap<MJGraphConceptEntity>();
        for (const c of this.Concepts) {
            conceptsById.Set(c.ID, c);
        }

        for (const rawNode of candidates) {
            const node = this.normalizeNodeRef(rawNode, provider);
            const key = this.getNodeKey(node, provider);
            const entityLower = node.EntityName.trim().toLowerCase();

            // 1. MJ: Entities metadata check
            if (entityLower === 'mj: entities' || entityLower === 'entities') {
                const targetEntity = entitiesById.Get(node.RecordID);
                if (!targetEntity || !this.canUserReadEntity(targetEntity, user)) {
                    continue;
                }
                visible.set(key, {
                    Key: key,
                    EntityName: 'MJ: Entities',
                    EntityID: node.EntityID,
                    RecordID: targetEntity.ID,
                    Label: targetEntity.DisplayNameOrName || targetEntity.Name,
                    Icon: targetEntity.Icon || null,
                    Description: targetEntity.Description || null,
                });
                continue;
            }

            // 2. MJ: Entity Fields metadata check
            if (entityLower === 'mj: entity fields' || entityLower === 'entity fields') {
                const entry = fieldsById.Get(node.RecordID);
                if (!entry || !this.canUserReadEntity(entry.Entity, user)) {
                    continue;
                }
                visible.set(key, {
                    Key: key,
                    EntityName: 'MJ: Entity Fields',
                    EntityID: node.EntityID,
                    RecordID: entry.Field.ID,
                    Label: `${entry.Entity.Name}.${entry.Field.Name}`,
                    Icon: entry.Entity.Icon || null,
                    Description: entry.Field.Description || null,
                });
                continue;
            }

            // 3. MJ: Entity Alternate Base Views metadata check (UserCanUse = entity CanRead + IsUsable)
            if (
                entityLower === 'mj: entity alternate base views' ||
                entityLower === 'entity alternate base views'
            ) {
                const entry = abvsById.Get(node.RecordID);
                if (!entry || !this.canUserReadEntity(entry.Entity, user) || !entry.View.IsUsable) {
                    continue;
                }
                visible.set(key, {
                    Key: key,
                    EntityName: 'MJ: Entity Alternate Base Views',
                    EntityID: node.EntityID,
                    RecordID: entry.View.ID,
                    Label: `${entry.Entity.Name}.${entry.View.Name}`,
                    Icon: entry.Entity.Icon || null,
                    Description: entry.View.Description || null,
                });
                continue;
            }

            // 4. MJ: Queries metadata check (UserCanRun)
            if (entityLower === 'mj: queries' || entityLower === 'queries') {
                const query = QueryEngine.Instance.FindQueryByID(node.RecordID);
                if (!query) {
                    continue;
                }
                const canRun = typeof query.UserCanRun === 'function' ? query.UserCanRun(user) : true;
                if (!canRun) {
                    continue;
                }
                visible.set(key, {
                    Key: key,
                    EntityName: 'MJ: Queries',
                    EntityID: node.EntityID,
                    RecordID: query.ID,
                    Label: query.Name,
                    Icon: 'fa-solid fa-terminal',
                    Description: query.Description || null,
                });
                continue;
            }

            // 5. MJ: Graph Concepts check (from cached Concepts when available)
            if (entityLower === 'mj: graph concepts' || entityLower === 'graph concepts') {
                const conceptEntityInfo = provider.EntityByName('MJ: Graph Concepts');
                if (conceptEntityInfo && !this.canUserReadEntity(conceptEntityInfo, user)) {
                    continue;
                }
                const cachedConcept = conceptsById.Get(node.RecordID);
                if (cachedConcept) {
                    visible.set(key, {
                        Key: key,
                        EntityName: 'MJ: Graph Concepts',
                        EntityID: conceptEntityInfo?.ID ?? node.EntityID,
                        RecordID: cachedConcept.ID,
                        Label: cachedConcept.Name,
                        Icon: conceptEntityInfo?.Icon ?? 'fa-solid fa-lightbulb',
                        Description: cachedConcept.Description || null,
                    });
                    continue;
                }
            }

            // 6. Data-scale entity record: queue for batched RunViews label + RLS resolution
            const entityInfo = provider.EntityByName(node.EntityName);
            if (!entityInfo) {
                continue;
            }
            if (!this.canUserReadEntity(entityInfo, user)) {
                continue;
            }
            let bucket = dataNodesByEntity.get(entityInfo.Name);
            if (!bucket) {
                bucket = { Entity: entityInfo, Nodes: [] };
                dataNodesByEntity.set(entityInfo.Name, bucket);
            }
            bucket.Nodes.push({ Ref: node, Key: key });
        }

        if (dataNodesByEntity.size > 0) {
            const buckets = Array.from(dataNodesByEntity.values());
            const viewParams: RunViewParams[] = buckets.map((b) => {
                const pkField = b.Entity.FirstPrimaryKey.Name; // first-pk-ok: Graph node keys address single-PK or URL-segment records via FirstPrimaryKey
                const nameField = b.Entity.NameField?.Name;
                const fields = nameField && nameField !== pkField ? [pkField, nameField] : [pkField];
                const quotedIds = Array.from(new Set(b.Nodes.map((n) => `'${EscapeSQLString(n.Ref.RecordID)}'`))).join(
                    ', ',
                );
                return {
                    EntityName: b.Entity.Name,
                    ExtraFilter: `[${pkField}] IN (${quotedIds})`,
                    Fields: fields,
                    ResultType: 'simple',
                };
            });

            const rv = RunView.FromMetadataProvider(provider);
            const batchResults = await rv.RunViews(viewParams, user);

            for (let i = 0; i < buckets.length; i++) {
                const bucket = buckets[i];
                const runRes = batchResults[i];
                if (!runRes?.Success || !Array.isArray(runRes.Results)) {
                    continue;
                }
                const pkField = bucket.Entity.FirstPrimaryKey.Name; // first-pk-ok: Graph node keys address single-PK or URL-segment records via FirstPrimaryKey
                const nameField = bucket.Entity.NameField?.Name;
                const labelByRecordId = new Map<string, string>();
                const seenUuidSet = new UUIDSet();
                const uuidLabels = new UUIDMap<string>();

                for (const rawRow of runRes.Results as Array<Record<string, unknown>>) {
                    const idVal = rawRow[pkField];
                    if (idVal == null) {
                        continue;
                    }
                    const idStr = String(idVal).trim();
                    const labelVal = nameField && rawRow[nameField] != null ? String(rawRow[nameField]) : `${bucket.Entity.Name} ${idStr}`;
                    labelByRecordId.set(idStr, labelVal);
                    seenUuidSet.Add(idStr);
                    uuidLabels.Set(idStr, labelVal);
                }

                for (const item of bucket.Nodes) {
                    const recId = item.Ref.RecordID;
                    const resolvedLabel = labelByRecordId.get(recId) ?? (seenUuidSet.Has(recId) ? uuidLabels.Get(recId) : undefined);
                    if (resolvedLabel === undefined) {
                        // Missing from RunView under `user` (RLS or not found) -> drop node and its edges
                        continue;
                    }
                    visible.set(item.Key, {
                        Key: item.Key,
                        EntityName: bucket.Entity.Name,
                        EntityID: bucket.Entity.ID,
                        RecordID: recId,
                        Label: resolvedLabel,
                        Icon: bucket.Entity.Icon || null,
                        Description: null,
                    });
                }
            }
        }

        return visible;
    }

    private canUserReadEntity(entity: EntityInfo, user: UserInfo | undefined): boolean {
        if (!user) {
            return false;
        }
        try {
            if (user.Type && user.Type.trim().toLowerCase() === 'owner') {
                return true;
            }
            if (!Array.isArray(user.UserRoles) || user.UserRoles.length === 0) {
                return false;
            }
            if (typeof entity.GetUserPermisions === 'function') {
                const perms = entity.GetUserPermisions(user);
                return Boolean(perms?.CanRead);
            }
            if (Array.isArray(entity.Permissions) && entity.Permissions.length > 0) {
                const roleNames = new Set(
                    user.UserRoles.map((r) => (r.Role ?? '').trim().toLowerCase()).filter(Boolean),
                );
                return entity.Permissions.some(
                    (p) => p.CanRead && roleNames.has((p.Role ?? '').trim().toLowerCase()),
                );
            }
            return true;
        } catch {
            return false;
        }
    }
}

