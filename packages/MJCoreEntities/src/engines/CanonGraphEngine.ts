import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { BaseSingleton, NormalizeUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import type { MJGraphConceptEntity } from '../generated/entity_subclasses';
import {
    FormatGraphNodeKey,
    type GraphEdgeView,
    type GraphNodeRef,
    type GraphNodeView,
    type GraphSubgraph,
    type GraphTraversalOptions,
} from '../graph/BaseGraphEdgeProvider';
import { GraphEngine } from '../graph/GraphEngine';

/**
 * Structured Canon explanation for an `MJ: Entities` record (`Get Entity Details` canon section).
 */
export interface CanonEntityExplanation {
    EntityName: string;
    DescribedConcepts: GraphNodeView[];
    AlternateBaseViews: GraphNodeView[];
    ReadingQueries: GraphNodeView[];
    MeasuringQueries: GraphNodeView[];
    Edges: GraphEdgeView[];
}

/**
 * Structured Canon explanation for an `MJ: Graph Concepts` record.
 */
export interface CanonConceptExplanation {
    Concept: GraphNodeView;
    Specification: string | null;
    Synonyms: string[];
    AuthorityTier: string | null;
    ConceptType: string;
    Subgraph: GraphSubgraph;
}

export interface CanonGraphExpansionSeed {
    readonly EntityName: string;
    readonly RecordID: string;
    readonly Title?: string;
    readonly SeedScore?: number;
    readonly GraphName?: string;
}

export interface CanonGraphExpansionEdge {
    readonly EdgeID?: string;
    readonly FromNodeID: string;
    readonly ToNodeID: string;
    readonly EdgeType: string;
    readonly Weight: number;
    readonly Label?: string;
}

export interface CanonGraphExpansionNode {
    readonly NodeID: string;
    readonly EntityName: string;
    readonly RecordID: string;
    readonly Title: string;
    readonly Snippet?: string;
    readonly GraphName?: string;
    readonly NodeKind?: 'Record' | 'View' | 'Query' | 'Concept';
    readonly Score?: number;
    readonly SeedScore?: number;
    readonly SeedTitle?: string;
    readonly PathEdges?: readonly CanonGraphExpansionEdge[];
}

export interface CanonGraphExpansionParams {
    readonly Seeds: readonly CanonGraphExpansionSeed[];
    readonly GraphNames?: readonly string[];
    readonly MaxDepth?: number;
    readonly MaxNodes?: number;
    readonly MinWeight?: number;
    readonly EdgeTypeFilter?: readonly string[];
    readonly AudienceReaders?: readonly UserInfo[];
}

export interface CanonGraphExpansionResult {
    readonly Nodes: readonly CanonGraphExpansionNode[];
    readonly Edges: readonly CanonGraphExpansionEdge[];
}

export interface CanonGraphExpansionService {
    ResolveSeeds(
        queryText: string,
        graphNames: readonly string[] | undefined,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<readonly CanonGraphExpansionSeed[]>;
    Expand(
        params: CanonGraphExpansionParams,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<CanonGraphExpansionResult>;
}

/**
 * Convenience factory returning an `IGraphExpansionService`-compatible adapter backed by
 * {@link CanonGraphEngine} and {@link GraphEngine}.
 */
export function CreateCanonGraphExpansionService(): CanonGraphExpansionService {
    return CanonGraphEngine.Instance.AsExpansionService();
}

/**
 * Convenience singleton over {@link GraphEngine} scoped to institutional Canon graphs
 * (`GraphType.IsCanon === true` or `"MJ Canon"`).
 */
export class CanonGraphEngine extends BaseSingleton<CanonGraphEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): CanonGraphEngine {
        return super.getInstance<CanonGraphEngine>();
    }

    /**
     * Match `MJ: Graph Concepts` in Canon graphs by `Name` and `Synonyms` (v1 lexical + synonym matching).
     */
    public FindConcepts(text: string, user?: UserInfo): GraphNodeView[] {
        const query = text?.trim().toLowerCase();
        if (!query) {
            return [];
        }

        const graphEngine = GraphEngine.Instance;
        const canonGraphIds = this.resolveCanonGraphIds(graphEngine);
        const queryTokens = this.tokenizeAlphanumeric(query);

        const conceptMeta = this.resolveConceptEntityMetadata();
        if (conceptMeta) {
            if (!user) {
                return [];
            }
            const isOwner = user.Type && user.Type.trim().toLowerCase() === 'owner';
            if (!isOwner) {
                if (!Array.isArray(user.UserRoles) || user.UserRoles.length === 0) {
                    return [];
                }
                if (typeof conceptMeta.GetUserPermisions === 'function' && !conceptMeta.GetUserPermisions(user)?.CanRead) {
                    return [];
                }
            }
        }

        const scored: Array<{ View: GraphNodeView; Score: number }> = [];

        for (const concept of graphEngine.Concepts) {
            if (concept.Status === 'Deprecated') {
                continue;
            }
            if (canonGraphIds.Size > 0 && !canonGraphIds.Has(concept.GraphID)) {
                continue;
            }

            const score = this.scoreConceptMatch(concept, query, queryTokens);
            if (score <= 0) {
                continue;
            }

            const entityId = conceptMeta?.ID ?? 'MJ: Graph Concepts';
            scored.push({
                Score: score,
                View: {
                    Key: FormatGraphNodeKey(entityId, concept.ID),
                    EntityName: 'MJ: Graph Concepts',
                    EntityID: conceptMeta?.ID,
                    RecordID: concept.ID,
                    Label: concept.Name,
                    Icon: conceptMeta?.Icon ?? 'fa-solid fa-lightbulb',
                    Description: concept.Description || null,
                },
            });
        }

        scored.sort((a, b) => b.Score - a.Score || a.View.Label.localeCompare(b.View.Label));
        return scored.map((s) => s.View);
    }

    /**
     * Resolve `MJ: Graph Concepts` matching `question` and expand their bounded Canon neighborhood.
     */
    public async CanonContext(
        question: string,
        options: GraphTraversalOptions,
        user: UserInfo,
    ): Promise<GraphSubgraph> {
        const matchedConcepts = this.FindConcepts(question, user);
        if (matchedConcepts.length === 0) {
            return { Nodes: [], Edges: [] };
        }
        const seeds: GraphNodeRef[] = matchedConcepts.slice(0, 5).map((c) => ({
            EntityName: c.EntityName,
            EntityID: c.EntityID,
            RecordID: c.RecordID,
        }));
        const graphName = this.resolvePrimaryCanonGraphName();
        return GraphEngine.Instance.Subgraph(graphName, seeds, options, user);
    }

    /**
     * Build a structured Canon summary for `entityName` (concepts it `Describes`, its alternate base views,
     * and the queries that `Reads` it or `Measures` its concepts).
     */
    public async ExplainEntity(entityName: string, user: UserInfo): Promise<CanonEntityExplanation> {
        const md: IMetadataProvider = Metadata.Provider; // global-provider-ok: CanonGraphEngine reads entity metadata from the active provider
        const entityInfo = md.EntityByName(entityName);
        if (!entityInfo) {
            return {
                EntityName: entityName,
                DescribedConcepts: [],
                AlternateBaseViews: [],
                ReadingQueries: [],
                MeasuringQueries: [],
                Edges: [],
            };
        }

        const entitiesMeta = md.EntityByName('MJ: Entities');
        const seed: GraphNodeRef = {
            EntityName: 'MJ: Entities',
            EntityID: entitiesMeta?.ID,
            RecordID: entityInfo.ID,
        };
        const graphName = this.resolvePrimaryCanonGraphName();
        const subgraph = await GraphEngine.Instance.Subgraph(
            graphName,
            [seed],
            { Depth: 2, MaxNodes: 50, Direction: 'Both' },
            user,
        );

        const describedConcepts = subgraph.Nodes.filter((n) => n.EntityName === 'MJ: Graph Concepts');
        const alternateBaseViews = subgraph.Nodes.filter(
            (n) => n.EntityName === 'MJ: Entity Alternate Base Views',
        );
        const queryNodes = subgraph.Nodes.filter((n) => n.EntityName === 'MJ: Queries');

        const measuringQueryIds = new UUIDSet();
        for (const edge of subgraph.Edges) {
            if (edge.TypeName === 'Measures' && edge.Source.EntityName === 'MJ: Queries') {
                measuringQueryIds.Add(edge.Source.RecordID);
            }
        }

        const readingQueries = queryNodes.filter((q) => !measuringQueryIds.Has(q.RecordID));
        const measuringQueries = queryNodes.filter((q) => measuringQueryIds.Has(q.RecordID));

        return {
            EntityName: entityInfo.Name,
            DescribedConcepts: describedConcepts,
            AlternateBaseViews: alternateBaseViews,
            ReadingQueries: readingQueries,
            MeasuringQueries: measuringQueries,
            Edges: subgraph.Edges,
        };
    }

    /**
     * Explain a single `MJ: Graph Concepts` node by `Name` or `ID` along with its 2-hop Canon neighborhood.
     */
    public async ExplainConcept(
        conceptNameOrId: string,
        user: UserInfo,
    ): Promise<CanonConceptExplanation | null> {
        const trimmed = conceptNameOrId.trim();
        if (!trimmed) {
            return null;
        }
        const lower = trimmed.toLowerCase();
        const concept = GraphEngine.Instance.Concepts.find(
            (c) => c.Name.trim().toLowerCase() === lower || UUIDsEqual(c.ID, trimmed),
        );
        if (!concept) {
            return null;
        }

        const conceptMeta = this.resolveConceptEntityMetadata();
        const seed: GraphNodeRef = {
            EntityName: 'MJ: Graph Concepts',
            EntityID: conceptMeta?.ID,
            RecordID: concept.ID,
        };
        const graphName = concept.Graph || this.resolvePrimaryCanonGraphName();
        const subgraph = await GraphEngine.Instance.Subgraph(
            graphName,
            [seed],
            { Depth: 2, MaxNodes: 50, Direction: 'Both' },
            user,
        );

        const synonyms = this.parseSynonyms(concept.Synonyms);
        return {
            Concept: {
                Key: FormatGraphNodeKey(conceptMeta?.ID ?? 'MJ: Graph Concepts', concept.ID),
                EntityName: 'MJ: Graph Concepts',
                EntityID: conceptMeta?.ID,
                RecordID: concept.ID,
                Label: concept.Name,
                Icon: conceptMeta?.Icon ?? 'fa-solid fa-lightbulb',
                Description: concept.Description || null,
            },
            Specification: concept.Specification ?? null,
            Synonyms: synonyms,
            AuthorityTier: concept.AuthorityTier ?? null,
            ConceptType: concept.ConceptType,
            Subgraph: subgraph,
        };
    }

    /**
     * Delegate endpoint constraint check to {@link GraphEngine.ValidateEdgeEndpoint}.
     */
    public ValidateEdgeEndpoint(
        edgeTypeId: string,
        side: 'Source' | 'Target',
        entityId: string,
    ): boolean {
        return GraphEngine.Instance.ValidateEdgeEndpoint(edgeTypeId, side, entityId);
    }

    /**
     * Return an adapter implementing the `IGraphExpansionService` / `IGraphSearchExpansionService`
     * contract backed by `CanonGraphEngine.Instance.FindConcepts` and `GraphEngine.Instance.Subgraph`.
     */
    public AsExpansionService(): CanonGraphExpansionService {
        return {
            ResolveSeeds: async (
                queryText: string,
                graphNames: readonly string[] | undefined,
                contextUser: UserInfo,
                provider?: IMetadataProvider,
            ): Promise<readonly CanonGraphExpansionSeed[]> => {
                if (!contextUser) {
                    return [];
                }
                const defaultGraph =
                    graphNames && graphNames.length > 0 ? graphNames[0] : this.resolvePrimaryCanonGraphName();
                const seeds: CanonGraphExpansionSeed[] = [];
                const seenKeys = new Set<string>();

                const concepts = this.FindConcepts(queryText, contextUser);
                for (const c of concepts) {
                    const key = `${c.EntityName.toLowerCase()}::${NormalizeUUID(c.RecordID)}`;
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        seeds.push({
                            EntityName: c.EntityName,
                            RecordID: c.RecordID,
                            Title: c.Label,
                            SeedScore: 1.0,
                            GraphName: defaultGraph,
                        });
                    }
                }

                // Also match MJ: Entities mentioned in queryText that contextUser can read
                const queryLower = queryText?.trim().toLowerCase() ?? '';
                if (queryLower.length >= 3) {
                    const md = provider ?? Metadata.Provider; // global-provider-ok: fallback when caller does not pass provider
                    const entities = md?.Entities ?? [];
                    const isOwner = contextUser.Type && contextUser.Type.trim().toLowerCase() === 'owner';
                    const hasRoles = Array.isArray(contextUser.UserRoles) && contextUser.UserRoles.length > 0;
                    for (const entity of entities) {
                        if (!isOwner) {
                            if (!hasRoles) {
                                continue;
                            }
                            if (
                                typeof entity.GetUserPermisions === 'function' &&
                                !entity.GetUserPermisions(contextUser)?.CanRead
                            ) {
                                continue;
                            }
                        }
                        const nameLower = entity.Name?.trim().toLowerCase() ?? '';
                        if (
                            nameLower.length >= 3 &&
                            (nameLower === queryLower || queryLower.includes(nameLower))
                        ) {
                            const key = `mj: entities::${NormalizeUUID(entity.ID)}`;
                            if (!seenKeys.has(key)) {
                                seenKeys.add(key);
                                seeds.push({
                                    EntityName: 'MJ: Entities',
                                    RecordID: entity.ID,
                                    Title: entity.Name,
                                    SeedScore: 0.9,
                                    GraphName: defaultGraph,
                                });
                            }
                        }
                    }
                }

                return seeds;
            },
            Expand: async (
                params: CanonGraphExpansionParams,
                contextUser: UserInfo,
            ): Promise<CanonGraphExpansionResult> => {
                const graphNames =
                    params.GraphNames && params.GraphNames.length > 0
                        ? params.GraphNames
                        : [this.resolvePrimaryCanonGraphName()];
                const maxDepth = params.MaxDepth ?? 2;
                const maxNodes = params.MaxNodes ?? 25;
                const minWeight = params.MinWeight ?? 0.25;
                const edgeTypes = params.EdgeTypeFilter ? [...params.EdgeTypeFilter] : undefined;

                const seedRefs: GraphNodeRef[] = params.Seeds.map((s) => ({
                    EntityName: s.EntityName,
                    RecordID: s.RecordID,
                }));

                const allNodes = new Map<string, CanonGraphExpansionNode>();
                const allEdges = new Map<string, CanonGraphExpansionEdge>();

                for (const graphName of graphNames) {
                    const subgraph = await GraphEngine.Instance.Subgraph(
                        graphName,
                        seedRefs,
                        {
                            Depth: maxDepth,
                            MaxNodes: maxNodes,
                            MinWeight: minWeight,
                            EdgeTypes: edgeTypes,
                            Direction: 'Both',
                        },
                        contextUser,
                    );

                    // Intersect audience readers by filtering already-expanded nodes per reader
                    let allowedKeys: Set<string> | null = null;
                    if (params.AudienceReaders && params.AudienceReaders.length > 0 && subgraph.Nodes.length > 0) {
                        const expandedNodeRefs: GraphNodeRef[] = subgraph.Nodes.map((n) => ({
                            EntityName: n.EntityName,
                            EntityID: n.EntityID,
                            RecordID: n.RecordID,
                        }));
                        for (const reader of params.AudienceReaders) {
                            const readerVisibleMap = await GraphEngine.Instance.FilterNodesForUser(
                                expandedNodeRefs,
                                reader,
                            );
                            const readerKeySet = new Set(readerVisibleMap.keys());
                            if (allowedKeys === null) {
                                allowedKeys = readerKeySet;
                            } else {
                                for (const k of Array.from(allowedKeys)) {
                                    if (!readerKeySet.has(k)) {
                                        allowedKeys.delete(k);
                                    }
                                }
                            }
                        }
                    }

                    const visibleNodes = allowedKeys
                        ? subgraph.Nodes.filter((n) => allowedKeys.has(n.Key))
                        : subgraph.Nodes;
                    const visibleKeySet = new Set(visibleNodes.map((n) => n.Key));
                    const visibleNodeByEntityAndId = new Map<string, GraphNodeView>();
                    for (const n of visibleNodes) {
                        const eLower = n.EntityName.trim().toLowerCase();
                        visibleNodeByEntityAndId.set(`${eLower}::${NormalizeUUID(n.RecordID)}`, n);
                        visibleNodeByEntityAndId.set(`${eLower}::${n.RecordID.trim()}`, n);
                    }
                    const findVisibleNode = (ref: GraphNodeRef): GraphNodeView | undefined => {
                        const eLower = ref.EntityName.trim().toLowerCase();
                        return (
                            visibleNodeByEntityAndId.get(`${eLower}::${NormalizeUUID(ref.RecordID)}`) ??
                            visibleNodeByEntityAndId.get(`${eLower}::${ref.RecordID.trim()}`)
                        );
                    };
                    const findNodeKey = (ref: GraphNodeRef): string | undefined => findVisibleNode(ref)?.Key;

                    const visibleEdges = subgraph.Edges.filter((e) => {
                        const sNode = findVisibleNode(e.Source);
                        const tNode = findVisibleNode(e.Target);
                        return Boolean(sNode && tNode && visibleKeySet.has(sNode.Key) && visibleKeySet.has(tNode.Key));
                    });

                    // Map node Key lookup and seed lookup
                    const nodeByKey = new Map(visibleNodes.map((n) => [n.Key, n]));

                    // Reconstruct highest-weight paths from seeds via BFS/Dijkstra
                    const bestPathByKey = new Map<
                        string,
                        { SeedTitle: string; SeedScore: number; PathEdges: CanonGraphExpansionEdge[]; Score: number }
                    >();
                    const queue: string[] = [];

                    for (const seed of params.Seeds) {
                        const key = findNodeKey({ EntityName: seed.EntityName, RecordID: seed.RecordID });
                        if (!key) {
                            continue;
                        }
                        const seedNode = nodeByKey.get(key);
                        const seedScore = typeof seed.SeedScore === 'number' ? seed.SeedScore : 1.0;
                        bestPathByKey.set(key, {
                            SeedTitle: seed.Title ?? seedNode?.Label ?? `${seed.EntityName}:${seed.RecordID}`,
                            SeedScore: seedScore,
                            PathEdges: [],
                            Score: seedScore,
                        });
                        queue.push(key);
                    }

                    while (queue.length > 0) {
                        const currentKey = queue.shift()!;
                        const currentPath = bestPathByKey.get(currentKey);
                        if (!currentPath || currentPath.PathEdges.length >= maxDepth) {
                            continue;
                        }
                        for (const edge of visibleEdges) {
                            const sKey = findNodeKey(edge.Source);
                            const tKey = findNodeKey(edge.Target);
                            if (!sKey || !tKey) {
                                continue;
                            }
                            let neighborKey: string | undefined;
                            let hopEdgeType = edge.TypeName;
                            let hopLabel = edge.TypeName;
                            if (sKey === currentKey) {
                                neighborKey = tKey;
                                hopEdgeType = edge.TypeName;
                                hopLabel = edge.TypeName;
                            } else if (tKey === currentKey) {
                                neighborKey = sKey;
                                const invName = edge.InverseTypeName?.trim() || (edge.IsDirected ? `Inverse ${edge.TypeName}` : edge.TypeName);
                                hopEdgeType = invName;
                                hopLabel = invName;
                            }
                            if (!neighborKey) {
                                continue;
                            }
                            const nextScore = currentPath.Score * edge.Weight;
                            const existing = bestPathByKey.get(neighborKey);
                            if (!existing || nextScore > existing.Score) {
                                const hopEdge: CanonGraphExpansionEdge = {
                                    EdgeID: edge.ID,
                                    FromNodeID: currentKey,
                                    ToNodeID: neighborKey,
                                    EdgeType: hopEdgeType,
                                    Weight: edge.Weight,
                                    Label: hopLabel,
                                };
                                bestPathByKey.set(neighborKey, {
                                    SeedTitle: currentPath.SeedTitle,
                                    SeedScore: currentPath.SeedScore,
                                    PathEdges: [...currentPath.PathEdges, hopEdge],
                                    Score: nextScore,
                                });
                                queue.push(neighborKey);
                            }
                        }
                    }

                    for (const edge of visibleEdges) {
                        const sKey = findNodeKey(edge.Source) ?? `${edge.Source.EntityName}:${edge.Source.RecordID}`;
                        const tKey = findNodeKey(edge.Target) ?? `${edge.Target.EntityName}:${edge.Target.RecordID}`;
                        allEdges.set(edge.ID, {
                            EdgeID: edge.ID,
                            FromNodeID: sKey,
                            ToNodeID: tKey,
                            EdgeType: edge.TypeName,
                            Weight: edge.Weight,
                            Label: edge.TypeName,
                        });
                    }

                    for (const node of visibleNodes) {
                        const pathInfo = bestPathByKey.get(node.Key);
                        const nodeKind = this.classifyNodeKind(node.EntityName);
                        allNodes.set(node.Key, {
                            NodeID: node.Key,
                            EntityName: node.EntityName,
                            RecordID: node.RecordID,
                            Title: node.Label,
                            Snippet: node.Description ?? undefined,
                            GraphName: graphName,
                            NodeKind: nodeKind,
                            Score: pathInfo?.Score ?? 1.0,
                            SeedScore: pathInfo?.SeedScore ?? 1.0,
                            SeedTitle: pathInfo?.SeedTitle ?? node.Label,
                            PathEdges: pathInfo?.PathEdges ?? [],
                        });
                    }
                }

                return {
                    Nodes: Array.from(allNodes.values()),
                    Edges: Array.from(allEdges.values()),
                };
            },
        };
    }

    private classifyNodeKind(entityName: string): 'Record' | 'View' | 'Query' | 'Concept' {
        const lower = entityName.trim().toLowerCase();
        if (lower === 'mj: graph concepts' || lower === 'graph concepts') {
            return 'Concept';
        }
        if (lower === 'mj: queries' || lower === 'queries') {
            return 'Query';
        }
        if (
            lower === 'mj: user views' ||
            lower === 'user views' ||
            lower === 'mj: entity alternate base views' ||
            lower === 'entity alternate base views'
        ) {
            return 'View';
        }
        return 'Record';
    }

    private resolveCanonGraphIds(graphEngine: GraphEngine): UUIDSet {
        const canonTypeIds = new UUIDSet();
        for (const gt of graphEngine.GraphTypes) {
            if (gt.IsCanon && gt.Status === 'Active') {
                canonTypeIds.Add(gt.ID);
            }
        }
        const canonGraphIds = new UUIDSet();
        for (const g of graphEngine.Graphs) {
            if (g.Status !== 'Active') {
                continue;
            }
            if (
                canonTypeIds.Has(g.GraphTypeID) ||
                g.GraphType?.trim().toLowerCase() === 'canon' ||
                g.Name.trim().toLowerCase() === 'mj canon'
            ) {
                canonGraphIds.Add(g.ID);
            }
        }
        return canonGraphIds;
    }

    private resolvePrimaryCanonGraphName(): string {
        const graphEngine = GraphEngine.Instance;
        const mjCanon = graphEngine.Graphs.find(
            (g) => g.Status === 'Active' && g.Name.trim().toLowerCase() === 'mj canon',
        );
        if (mjCanon) {
            return mjCanon.Name;
        }
        const canonIds = this.resolveCanonGraphIds(graphEngine);
        const firstCanon = graphEngine.Graphs.find((g) => canonIds.Has(g.ID));
        return firstCanon?.Name ?? 'MJ Canon';
    }

    private resolveConceptEntityMetadata() {
        try {
            return Metadata.Provider?.EntityByName('MJ: Graph Concepts'); // global-provider-ok: metadata lookup for 'MJ: Graph Concepts' entity icon/ID
        } catch {
            return undefined;
        }
    }

    private scoreConceptMatch(
        concept: MJGraphConceptEntity,
        queryLower: string,
        queryTokens: readonly string[],
    ): number {
        const nameLower = concept.Name.trim().toLowerCase();
        if (nameLower === queryLower) {
            return 1.0;
        }
        if (queryLower.includes(nameLower) || nameLower.startsWith(queryLower)) {
            return 0.9;
        }

        const synonyms = this.parseSynonyms(concept.Synonyms).map((s) => s.toLowerCase());
        for (const syn of synonyms) {
            if (syn === queryLower) {
                return 0.95;
            }
            if (queryLower.includes(syn) || syn.includes(queryLower)) {
                return 0.85;
            }
        }

        if (queryTokens.length > 0) {
            const candidateTokens = new Set(this.tokenizeAlphanumeric([nameLower, ...synonyms].join(' ')));
            let hits = 0;
            for (const qt of queryTokens) {
                if (candidateTokens.has(qt)) {
                    hits++;
                }
            }
            if (hits > 0) {
                return 0.5 * (hits / queryTokens.length);
            }
        }

        return 0;
    }

    private tokenizeAlphanumeric(input: string): string[] {
        const tokens: string[] = [];
        let start = -1;
        for (let i = 0; i <= input.length; i++) {
            const code = i < input.length ? input.charCodeAt(i) : 0;
            const isWordChar =
                (code >= 97 && code <= 122) || // a-z
                (code >= 48 && code <= 57) || // 0-9
                code === 95; // _
            if (isWordChar) {
                if (start === -1) {
                    start = i;
                }
            } else if (start !== -1) {
                if (i - start >= 2) {
                    tokens.push(input.slice(start, i));
                }
                start = -1;
            }
        }
        return tokens;
    }

    private parseSynonyms(raw: string | null | undefined): string[] {
        if (!raw) {
            return [];
        }
        try {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item).trim()).filter(Boolean);
            }
        } catch {
            return raw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        }
        return [];
    }
}
