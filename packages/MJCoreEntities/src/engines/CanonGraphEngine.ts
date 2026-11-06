import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import type { MJGraphConceptEntity, MJGraphEntity } from '../generated/entity_subclasses';
import type { MJGraphConceptEntityType } from '../generated/entities/__mj';
import {
    IsGraphDataProvider,
    type GraphEdgeView,
    type GraphNodeRef,
    type GraphNodeView,
    type GraphSubgraph,
    type GraphTraversalOptions,
} from '../graph/BaseGraphEdgeProvider';
import { CanUserReadEntity, ClampGraphDepth, ClampGraphMaxNodes, GraphEngine } from '../graph/GraphEngine';
import type {
    GraphExpandedEdge,
    GraphExpandedNode,
    GraphExpansionParams,
    GraphExpansionResult,
    GraphNodeKind,
    GraphSeedNode,
    IGraphExpansionService,
} from '../graph/GraphExpansion';

const CONCEPT_ENTITY = 'MJ: Graph Concepts';
const PRIMARY_CANON_GRAPH_NAME = 'MJ Canon';
/** Concept matches used as seeds for one question. */
const MAX_CONCEPT_SEEDS = 5;

/**
 * Structured Canon explanation for an `MJ: Entities` record (`Get Entity Details` canon section).
 */
export interface CanonEntityExplanation {
    EntityName: string;
    /** Concepts this entity `Describes` (Entity --Describes--> Concept). */
    DescribedConcepts: GraphNodeView[];
    /** Alternate base views that `Subsets` this entity. */
    AlternateBaseViews: GraphNodeView[];
    /** Queries with a `Reads` edge to this entity. */
    ReadingQueries: GraphNodeView[];
    /** Queries that `Measures` a concept this entity describes. */
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

/** Options for {@link CanonGraphEngine.FindConcepts}. */
export interface FindConceptsOptions {
    /** Graphs to search; the active canon graphs when omitted. */
    GraphNames?: readonly string[];
    /** Readers besides the caller who must also be able to see each concept. */
    AudienceReaders?: readonly UserInfo[];
    provider?: IMetadataProvider;
}

/** The concept columns a caller reads when a concept is explained. */
type ConceptDetailRow = Pick<
    MJGraphConceptEntityType,
    'ID' | 'Name' | 'Description' | 'Specification' | 'Synonyms' | 'AuthorityTier' | 'ConceptType' | 'Graph'
>;

/**
 * Canon conveniences over {@link GraphEngine} (`GraphType.IsCanon`, `"MJ Canon"` first).
 *
 * Every method that returns concepts or nodes to a caller checks them AS THE CALLER through
 * `GraphEngine.FilterNodesForUser` (row-level security applies); the engine's cached concepts are
 * used only to find candidates.
 */
export class CanonGraphEngine extends BaseSingleton<CanonGraphEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): CanonGraphEngine {
        return super.getInstance<CanonGraphEngine>();
    }

    /** Make sure the lazily configured {@link GraphEngine} is loaded. */
    public async EnsureConfigured(user: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await GraphEngine.Instance.Config(false, user, provider);
    }

    /**
     * `MJ: Graph Concepts` matching `text` by `Name` and `Synonyms` (v1 lexical matching), best match
     * first, limited to concepts the caller — and every audience reader — may see.
     */
    public async FindConcepts(text: string, user: UserInfo, options: FindConceptsOptions = {}): Promise<GraphNodeView[]> {
        const query = text?.trim().toLowerCase();
        if (!query || !user) {
            return [];
        }
        await this.EnsureConfigured(user, options.provider);
        const graphIds = this.ResolveGraphIds(options.GraphNames);
        if (graphIds.Size === 0) {
            return [];
        }

        const scored = this.scoreConcepts(query, graphIds);
        if (scored.length === 0) {
            return [];
        }
        const refs = scored.map((s) => ({ EntityName: CONCEPT_ENTITY, RecordID: s.Concept.ID }));
        const visible = await GraphEngine.Instance.FilterNodesForUser(refs, user, options.AudienceReaders);
        const result: GraphNodeView[] = [];
        for (const s of scored) {
            const view = visible.get(GraphEngine.Instance.GetNodeKey({ EntityName: CONCEPT_ENTITY, RecordID: s.Concept.ID }));
            if (view) {
                result.push(view);
            }
        }
        return result;
    }

    /**
     * Resolve `MJ: Graph Concepts` matching `question` and expand their bounded Canon neighborhood.
     */
    public async CanonContext(question: string, options: GraphTraversalOptions, user: UserInfo): Promise<GraphSubgraph> {
        const matched = await this.FindConcepts(question, user, { AudienceReaders: options.AudienceReaders });
        if (matched.length === 0) {
            return { Nodes: [], Edges: [] };
        }
        const seeds: GraphNodeRef[] = matched.slice(0, MAX_CONCEPT_SEEDS).map((c) => ({ EntityName: c.EntityName, EntityID: c.EntityID, RecordID: c.RecordID }));
        return GraphEngine.Instance.Subgraph(this.ResolvePrimaryCanonGraphName(), seeds, options, user);
    }

    /**
     * Canon summary for `entityName`: the concepts it `Describes`, the alternate views that `Subset`
     * it, the queries that `Read` it, and the queries that `Measure` a concept it describes — each
     * classified by the edge that links it, from a traversal the caller may see.
     */
    public async ExplainEntity(entityName: string, user: UserInfo, provider?: IMetadataProvider): Promise<CanonEntityExplanation> {
        const empty: CanonEntityExplanation = { EntityName: entityName, DescribedConcepts: [], AlternateBaseViews: [], ReadingQueries: [], MeasuringQueries: [], Edges: [] };
        await this.EnsureConfigured(user, provider);
        const md = provider ?? GraphEngine.Instance.ProviderToUse;
        const entityInfo = md.EntityByName(entityName);
        if (!entityInfo || !CanUserReadEntity(entityInfo, user)) {
            return empty;
        }

        const seed: GraphNodeRef = { EntityName: 'MJ: Entities', RecordID: entityInfo.ID };
        const subgraph = await GraphEngine.Instance.Subgraph(
            this.ResolvePrimaryCanonGraphName(),
            [seed],
            { Depth: 2, MaxNodes: 50, Direction: 'Both', EdgeTypes: ['Describes', 'Subsets', 'Reads', 'Measures'] },
            user,
        );
        return { ...this.classifyEntityNeighborhood(GraphEngine.Instance.GetNodeKey(seed), subgraph), EntityName: entityInfo.Name };
    }

    /**
     * Explain one `MJ: Graph Concepts` record by `Name` or `ID` with its 2-hop Canon neighborhood.
     *
     * The concept is read AS THE CALLER (row-level and field-level security apply), so a concept the
     * caller may not read returns `null`, and its specification and synonyms come from the caller's own
     * read, never from the engine's cache.
     */
    public async ExplainConcept(conceptNameOrId: string, user: UserInfo, provider?: IMetadataProvider): Promise<CanonConceptExplanation | null> {
        const trimmed = conceptNameOrId?.trim();
        if (!trimmed || !user) {
            return null;
        }
        await this.EnsureConfigured(user, provider);
        const lower = trimmed.toLowerCase();
        const cached = GraphEngine.Instance.Concepts.find((c) => c.Name.trim().toLowerCase() === lower || UUIDsEqual(c.ID, trimmed));
        if (!cached) {
            return null;
        }
        const detail = await this.readConceptAsUser(cached.ID, user, provider);
        if (!detail) {
            return null;
        }

        const seed: GraphNodeRef = { EntityName: CONCEPT_ENTITY, RecordID: detail.ID };
        const subgraph = await GraphEngine.Instance.Subgraph(detail.Graph || this.ResolvePrimaryCanonGraphName(), [seed], { Depth: 2, MaxNodes: 50, Direction: 'Both' }, user);
        const conceptEntity = (provider ?? GraphEngine.Instance.ProviderToUse).EntityByName(CONCEPT_ENTITY);
        return {
            Concept: {
                Key: GraphEngine.Instance.GetNodeKey(seed),
                EntityName: CONCEPT_ENTITY,
                EntityID: conceptEntity?.ID,
                RecordID: detail.ID,
                Label: detail.Name,
                Icon: conceptEntity?.Icon ?? 'fa-solid fa-lightbulb',
                Description: detail.Description || null,
            },
            Specification: detail.Specification ?? null,
            Synonyms: parseSynonyms(detail.Synonyms),
            AuthorityTier: detail.AuthorityTier ?? null,
            ConceptType: detail.ConceptType,
            Subgraph: subgraph,
        };
    }

    /**
     * Delegate endpoint constraint check to {@link GraphEngine.ValidateEdgeEndpoint}.
     */
    public ValidateEdgeEndpoint(edgeTypeId: string, side: 'Source' | 'Target', entityId: string): boolean {
        return GraphEngine.Instance.ValidateEdgeEndpoint(edgeTypeId, side, entityId);
    }

    /**
     * The engine-backed {@link IGraphExpansionService}: seeds from {@link FindConcepts} and entity
     * names, expansion through `GraphEngine.Subgraph` with the audience applied during traversal.
     */
    public AsExpansionService(): IGraphExpansionService {
        return new CanonGraphExpansionService(this);
    }

    /** The name of the primary canon graph: `"MJ Canon"` when active, else the first active canon graph. */
    public ResolvePrimaryCanonGraphName(): string {
        const graphs = GraphEngine.Instance.Graphs;
        const mjCanon = graphs.find((g) => g.Status === 'Active' && g.Name.trim().toLowerCase() === PRIMARY_CANON_GRAPH_NAME.toLowerCase());
        if (mjCanon) {
            return mjCanon.Name;
        }
        const canonIds = this.ResolveGraphIds(undefined);
        return graphs.find((g) => canonIds.Has(g.ID))?.Name ?? PRIMARY_CANON_GRAPH_NAME;
    }

    /** Active graph IDs named in `graphNames`, or the active canon graphs when none are named. */
    public ResolveGraphIds(graphNames: readonly string[] | undefined): UUIDSet {
        const ids = new UUIDSet();
        const engine = GraphEngine.Instance;
        if (graphNames && graphNames.length > 0) {
            for (const name of graphNames) {
                const graph = engine.GetGraph(name);
                if (graph) {
                    ids.Add(graph.ID);
                }
            }
            return ids;
        }
        const canonTypeIds = new UUIDSet(engine.GraphTypes.filter((gt) => gt.IsCanon).map((gt) => gt.ID));
        for (const g of engine.Graphs) {
            if (g.Status === 'Active' && isCanonGraph(g, canonTypeIds)) {
                ids.Add(g.ID);
            }
        }
        return ids;
    }

    private scoreConcepts(query: string, graphIds: UUIDSet): Array<{ Concept: MJGraphConceptEntity; Score: number }> {
        const queryTokens = tokenizeAlphanumeric(query);
        const scored: Array<{ Concept: MJGraphConceptEntity; Score: number }> = [];
        for (const concept of GraphEngine.Instance.Concepts) {
            if (concept.Status === 'Deprecated' || !graphIds.Has(concept.GraphID)) {
                continue;
            }
            const score = scoreConceptMatch(concept, query, queryTokens);
            if (score > 0) {
                scored.push({ Concept: concept, Score: score });
            }
        }
        return scored.sort((a, b) => b.Score - a.Score || a.Concept.Name.localeCompare(b.Concept.Name) || compareText(a.Concept.ID, b.Concept.ID));
    }

    private classifyEntityNeighborhood(entityKey: string, subgraph: GraphSubgraph): Omit<CanonEntityExplanation, 'EntityName'> {
        const engine = GraphEngine.Instance;
        const nodeByKey = new Map(subgraph.Nodes.map((n) => [n.Key, n]));
        const described = new Map<string, GraphNodeView>();
        const views = new Map<string, GraphNodeView>();
        const readers = new Map<string, GraphNodeView>();
        const add = (target: Map<string, GraphNodeView>, key: string): void => {
            const node = nodeByKey.get(key);
            if (node) {
                target.set(key, node);
            }
        };
        for (const edge of subgraph.Edges) {
            const sKey = engine.GetNodeKey(edge.Source);
            const tKey = engine.GetNodeKey(edge.Target);
            if (edge.TypeName === 'Describes' && sKey === entityKey && edge.Target.EntityName === CONCEPT_ENTITY) {
                add(described, tKey);
            } else if (edge.TypeName === 'Subsets' && tKey === entityKey) {
                add(views, sKey);
            } else if (edge.TypeName === 'Reads' && tKey === entityKey && edge.Source.EntityName === 'MJ: Queries') {
                add(readers, sKey);
            }
        }
        const measuring = new Map<string, GraphNodeView>();
        for (const edge of subgraph.Edges) {
            if (edge.TypeName === 'Measures' && edge.Source.EntityName === 'MJ: Queries' && described.has(engine.GetNodeKey(edge.Target))) {
                add(measuring, engine.GetNodeKey(edge.Source));
            }
        }
        return {
            DescribedConcepts: Array.from(described.values()),
            AlternateBaseViews: Array.from(views.values()),
            ReadingQueries: Array.from(readers.values()),
            MeasuringQueries: Array.from(measuring.values()),
            Edges: subgraph.Edges,
        };
    }

    private async readConceptAsUser(conceptId: string, user: UserInfo, provider?: IMetadataProvider): Promise<ConceptDetailRow | null> {
        const md = provider ?? GraphEngine.Instance.ProviderToUse;
        if (!IsGraphDataProvider(md)) {
            return null;
        }
        const res = await RunView.FromMetadataProvider(md).RunView<ConceptDetailRow>(
            {
                EntityName: CONCEPT_ENTITY,
                ExtraFilter: `[ID] = '${EscapeSQLString(conceptId)}'`,
                Fields: ['ID', 'Name', 'Description', 'Specification', 'Synonyms', 'AuthorityTier', 'ConceptType', 'Graph'],
                ResultType: 'simple',
                MaxRows: 1,
            },
            user,
        );
        return res.Success && res.Results.length > 0 ? res.Results[0] : null;
    }
}

/**
 * {@link IGraphExpansionService} over {@link CanonGraphEngine} and {@link GraphEngine}.
 *
 * Seeds: canon concepts whose `Name`/`Synonyms` match the query text (checked as the caller), then
 * entities whose name appears in the query and the caller may read. Content-chunk hits from other
 * search lanes are NOT used as seeds: `SearchEngine` runs its lanes in parallel, so no chunk hits
 * exist when this runs.
 *
 * Expansion: one `Subgraph` per requested graph with `AudienceReaders`, so a node is admitted only
 * when the caller and every reader may see it at the hop it is reached. Each node carries the path
 * that reached it and the rank of its seed.
 */
export class CanonGraphExpansionService implements IGraphExpansionService {
    public constructor(private readonly canon: CanonGraphEngine) {}

    public async ResolveSeeds(
        queryText: string,
        graphNames: readonly string[] | undefined,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        audienceReaders?: readonly UserInfo[],
    ): Promise<readonly GraphSeedNode[]> {
        if (!contextUser || !queryText?.trim()) {
            return [];
        }
        await this.canon.EnsureConfigured(contextUser, provider);
        if (this.canon.ResolveGraphIds(graphNames).Size === 0) {
            return []; // no active graph to search: the lane is a no-op
        }
        const graphName = graphNames && graphNames.length > 0 ? graphNames[0] : this.canon.ResolvePrimaryCanonGraphName();
        const seeds: GraphSeedNode[] = [];
        const seen = new Set<string>();
        const push = (seed: GraphSeedNode): void => {
            const key = GraphEngine.Instance.GetNodeKey(seed);
            if (!seen.has(key)) {
                seen.add(key);
                seeds.push(seed);
            }
        };
        const concepts = await this.canon.FindConcepts(queryText, contextUser, { GraphNames: graphNames, AudienceReaders: audienceReaders, provider });
        for (const c of concepts) {
            push({ EntityName: c.EntityName, RecordID: c.RecordID, Title: c.Label, SeedScore: 1.0, GraphName: graphName });
        }
        for (const seed of this.entityNameSeeds(queryText, [contextUser, ...(audienceReaders ?? [])], graphName, provider)) {
            push(seed);
        }
        return seeds;
    }

    public async Expand(params: GraphExpansionParams, contextUser: UserInfo, provider?: IMetadataProvider): Promise<GraphExpansionResult> {
        if (!contextUser || params.Seeds.length === 0) {
            return { Nodes: [], Edges: [] };
        }
        await this.canon.EnsureConfigured(contextUser, provider);
        const graphNames = params.GraphNames && params.GraphNames.length > 0 ? params.GraphNames : [this.canon.ResolvePrimaryCanonGraphName()];
        const options: GraphTraversalOptions = {
            Depth: ClampGraphDepth(params.MaxDepth),
            MaxNodes: ClampGraphMaxNodes(params.MaxNodes, 25),
            MinWeight: params.MinWeight ?? 0.25,
            EdgeTypes: params.EdgeTypeFilter ? [...params.EdgeTypeFilter] : undefined,
            Direction: 'Both',
            AudienceReaders: params.AudienceReaders,
        };
        const seedRefs: GraphNodeRef[] = params.Seeds.map((s) => ({ EntityName: s.EntityName, RecordID: s.RecordID }));
        const seedIndex = new Map(params.Seeds.map((s, i) => [GraphEngine.Instance.GetNodeKey(s), { Seed: s, Rank: i + 1 }]));

        const nodes = new Map<string, GraphExpandedNode>();
        const edges = new Map<string, GraphExpandedEdge>();
        const admittedSeeds = new Map<string, GraphSeedNode>();
        const messages: string[] = [];
        for (const graphName of graphNames) {
            const subgraph = await GraphEngine.Instance.Subgraph(graphName, seedRefs, options, contextUser);
            if (subgraph.Message) {
                messages.push(subgraph.Message);
            }
            this.addSubgraph(subgraph, graphName, seedIndex, nodes, edges, admittedSeeds);
        }
        return {
            Nodes: Array.from(nodes.values()),
            Edges: Array.from(edges.values()),
            Seeds: Array.from(admittedSeeds.values()),
            Messages: messages.length > 0 ? messages : undefined,
        };
    }

    private addSubgraph(
        subgraph: GraphSubgraph,
        graphName: string,
        seedIndex: Map<string, { Seed: GraphSeedNode; Rank: number }>,
        nodes: Map<string, GraphExpandedNode>,
        edges: Map<string, GraphExpandedEdge>,
        admittedSeeds: Map<string, GraphSeedNode>,
    ): void {
        const nodeByKey = new Map(subgraph.Nodes.map((n) => [n.Key, n]));
        for (const node of subgraph.Nodes) {
            const seed = seedIndex.get(node.Key);
            if (seed && !node.ParentKey && !admittedSeeds.has(node.Key)) {
                // Admitted at hop 0, so the caller and every reader may see it; the title is the checked label.
                admittedSeeds.set(node.Key, { EntityName: node.EntityName, RecordID: node.RecordID, Title: node.Label, SeedScore: seed.Seed.SeedScore ?? 1.0, GraphName: graphName });
            }
        }
        const edgeById = new Map(subgraph.Edges.map((e) => [e.ID, e]));
        for (const edge of subgraph.Edges) {
            edges.set(edge.ID, {
                EdgeID: edge.ID,
                FromNodeID: GraphEngine.Instance.GetNodeKey(edge.Source),
                ToNodeID: GraphEngine.Instance.GetNodeKey(edge.Target),
                EdgeType: edge.TypeName,
                Weight: edge.Weight,
                Label: edge.TypeName,
            });
        }
        for (const node of subgraph.Nodes) {
            const path = this.pathTo(node, nodeByKey, edgeById);
            const seed = seedIndex.get(path.RootKey);
            const expanded: GraphExpandedNode = {
                NodeID: node.Key,
                EntityName: node.EntityName,
                RecordID: node.RecordID,
                Title: node.Label,
                Snippet: node.Description ?? undefined,
                GraphName: graphName,
                NodeKind: classifyNodeKind(node.EntityName),
                SeedScore: seed?.Seed.SeedScore ?? 1.0,
                SeedRank: seed?.Rank ?? 1,
                // The admitted root's label, never the requested seed's title: that was not checked for every reader.
                SeedTitle: nodeByKey.get(path.RootKey)?.Label ?? node.Label,
                PathEdges: path.Edges,
            };
            const existing = nodes.get(node.Key);
            if (!existing || (existing.PathEdges?.length ?? 0) > path.Edges.length) {
                nodes.set(node.Key, expanded);
            }
        }
    }

    /** The edges from the node's seed to the node, walked through the traversal's parent pointers. */
    private pathTo(
        node: GraphNodeView,
        nodeByKey: Map<string, GraphNodeView>,
        edgeById: Map<string, GraphEdgeView>,
    ): { RootKey: string; Edges: GraphExpandedEdge[] } {
        const reversed: GraphExpandedEdge[] = [];
        let current: GraphNodeView | undefined = node;
        const visited = new Set<string>();
        while (current && current.ParentKey && current.ViaEdgeID && !visited.has(current.Key)) {
            visited.add(current.Key);
            const edge = edgeById.get(current.ViaEdgeID);
            if (!edge) {
                break;
            }
            const walkedForward = GraphEngine.Instance.GetNodeKey(edge.Source) === current.ParentKey;
            const label = walkedForward ? edge.TypeName : (edge.InverseTypeName?.trim() || edge.TypeName);
            reversed.push({ EdgeID: edge.ID, FromNodeID: current.ParentKey, ToNodeID: current.Key, EdgeType: label, Weight: edge.Weight, Label: label });
            current = nodeByKey.get(current.ParentKey);
        }
        return { RootKey: current?.Key ?? node.Key, Edges: reversed.reverse() };
    }

    /** `MJ: Entities` nodes named in the query that every one of `principals` may read. */
    private entityNameSeeds(queryText: string, principals: readonly UserInfo[], graphName: string, provider?: IMetadataProvider): GraphSeedNode[] {
        const queryLower = queryText.trim().toLowerCase();
        if (queryLower.length < 3) {
            return [];
        }
        const md = provider ?? GraphEngine.Instance.ProviderToUse;
        const seeds: GraphSeedNode[] = [];
        for (const entity of md.Entities ?? []) {
            const nameLower = entity.Name?.trim().toLowerCase() ?? '';
            if (nameLower.length >= 3 && queryLower.includes(nameLower) && principals.every((p) => CanUserReadEntity(entity, p))) {
                seeds.push({ EntityName: 'MJ: Entities', RecordID: entity.ID, Title: entity.Name, SeedScore: 0.9, GraphName: graphName });
            }
        }
        return seeds.sort((a, b) => compareText(a.Title ?? '', b.Title ?? ''));
    }
}

/** True for a graph of a canon graph type, or named "MJ Canon". */
function isCanonGraph(graph: MJGraphEntity, canonTypeIds: UUIDSet): boolean {
    return canonTypeIds.Has(graph.GraphTypeID) || graph.Name.trim().toLowerCase() === PRIMARY_CANON_GRAPH_NAME.toLowerCase();
}

function classifyNodeKind(entityName: string): GraphNodeKind {
    const lower = entityName.trim().toLowerCase();
    if (lower === 'mj: graph concepts') {
        return 'Concept';
    }
    if (lower === 'mj: queries') {
        return 'Query';
    }
    if (lower === 'mj: user views' || lower === 'mj: entity alternate base views') {
        return 'View';
    }
    return 'Record';
}

function scoreConceptMatch(concept: MJGraphConceptEntity, queryLower: string, queryTokens: readonly string[]): number {
    const nameLower = concept.Name.trim().toLowerCase();
    if (nameLower === queryLower) {
        return 1.0;
    }
    if (queryLower.includes(nameLower) || nameLower.startsWith(queryLower)) {
        return 0.9;
    }
    const synonyms = parseSynonyms(concept.Synonyms).map((s) => s.toLowerCase());
    for (const syn of synonyms) {
        if (syn === queryLower) {
            return 0.95;
        }
        if (queryLower.includes(syn) || syn.includes(queryLower)) {
            return 0.85;
        }
    }
    if (queryTokens.length > 0) {
        const candidateTokens = new Set(tokenizeAlphanumeric([nameLower, ...synonyms].join(' ')));
        const hits = queryTokens.filter((t) => candidateTokens.has(t)).length;
        if (hits > 0) {
            return 0.5 * (hits / queryTokens.length);
        }
    }
    return 0;
}

function tokenizeAlphanumeric(input: string): string[] {
    const tokens: string[] = [];
    let start = -1;
    for (let i = 0; i <= input.length; i++) {
        const code = i < input.length ? input.charCodeAt(i) : 0;
        const isWordChar = (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95;
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

function parseSynonyms(raw: string | null | undefined): string[] {
    if (!raw) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
    } catch {
        return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
