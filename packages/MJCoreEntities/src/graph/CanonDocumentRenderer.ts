import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDMap, UUIDSet } from '@memberjunction/global';
import { QueryEngine } from '../engines/QueryEngine';
import {
    IsGraphDataProvider,
    type GraphDataProvider,
    type GraphEdgeView,
    type GraphNodeRef,
    type GraphNodeView,
    type GraphSubgraph,
} from './BaseGraphEdgeProvider';
import {
    CanUserReadEntity,
    GraphEngine,
    IsFieldReadableByAll,
    IsGraphConceptStatusVisible,
    NeutralGraphNodeLabel,
} from './GraphEngine';

const ENTITY_GRAPH_CONCEPTS = 'MJ: Graph Concepts';
const ENTITY_GRAPH_EDGES = 'MJ: Graph Edges';
const ENTITY_ENTITIES = 'MJ: Entities';
const ENTITY_ENTITY_FIELDS = 'MJ: Entity Fields';
const ENTITY_ALTERNATE_BASE_VIEWS = 'MJ: Entity Alternate Base Views';
const ENTITY_QUERIES = 'MJ: Queries';

/** Seeded edge types rendered in Section 1 (Precedence & Equivalence). */
const PRECEDENCE_EDGE_TYPES = new Set([
    'Preferred Over',
    'Supersedes',
    'Contradicts',
    'Same As',
]);

/** Seeded artifact → concept edge types (source = artifact, target = concept, per MJ #6842). */
const ARTIFACT_TO_CONCEPT_EDGE_TYPES = new Set([
    'Defines',
    'Measures',
    'Describes',
    'Implements',
]);

/** Seeded concept-to-concept relationship edge types shown under concept definitions. */
const CONCEPT_RELATION_EDGE_TYPES = new Set([
    'BroaderThan',
    'Governs',
    'DependsOn',
    'RelatedTo',
    'Same As',
    'Supersedes',
    'Preferred Over',
]);

/**
 * Options for collapsing a governed Canon graph into a flat, deterministic Markdown
 * domain-knowledge document via {@link CanonGraphEngine.RenderCanonDocument}.
 */
export interface CanonDocumentOptions {
    /** Explicit graph name; defaults to the primary active Canon graph (`'MJ Canon'`). */
    GraphName?: string;
    /**
     * Optional natural-language question or search text. When provided (and `Subgraph` is not
     * supplied), `RenderCanonDocument` slices the document to the bounded Canon neighborhood
     * matched by `Question`.
     */
    Question?: string;
    /**
     * Optional pre-expanded {@link GraphSubgraph} (for example from
     * {@link CanonGraphEngine.CanonContext} or {@link GraphEngine.Subgraph}). When provided,
     * only the concepts, entities, alternate base views, queries, and precedence rules in this
     * subgraph are rendered.
     */
    Subgraph?: GraphSubgraph;
    /** Optional filter restricting concepts to specific `ConceptType` names (case-insensitive). */
    ConceptTypes?: readonly string[];
    /** Optional filter restricting output to specific `Entity` names (case-insensitive). */
    EntityNames?: readonly string[];
    /** Whether to include concept `Specification` blocks (default `true`). */
    IncludeSpecifications?: boolean;
    /** Whether to include `Proposed` concepts and edges in addition to `Approved` (default `false`). */
    IncludeProposed?: boolean;
    /** Additional principals who must also be able to see every rendered node (shared-room safety). */
    AudienceReaders?: readonly UserInfo[];
    /** Optional maximum character length of the returned document. */
    MaxChars?: number;
    /** Optional metadata provider override (defaults to `GraphEngine.Instance.ProviderToUse`). */
    Provider?: IMetadataProvider;
}

interface ConceptRow {
    ID: string;
    Name: string;
    ConceptType: string;
    Description: string | null;
    Specification: string | null;
    Synonyms: string | null;
    AuthorityTier: string | null;
    Status: string;
}

interface StoredEdgeRow {
    ID: string;
    EdgeTypeID: string;
    EdgeType?: string;
    SourceEntityID: string;
    SourceEntity?: string;
    SourceRecordID: string;
    TargetEntityID: string;
    TargetEntity?: string;
    TargetRecordID: string;
    Description: string | null;
    Origin?: string;
    Status: string;
    Weight: number;
}

interface ResolvedEdge {
    TypeName: string;
    Source: GraphNodeView;
    Target: GraphNodeView;
    Description: string | null;
}

interface RenderScope {
    ConceptIDs: UUIDSet;
    EntityNamesLower: Set<string>;
    AbvIDs: UUIDSet;
    QueryIDs: UUIDSet;
}

interface MetadataOwnerIndex {
    FieldEntityNameByID: UUIDMap<string>;
    AbvEntityNameByID: UUIDMap<string>;
}

/**
 * Render a governed Canon graph (or a question/subgraph slice of it) into a deterministic
 * Markdown document. All reads are checked as `user` and every principal in `AudienceReaders`.
 */
export async function RenderCanonDocumentMarkdown(
    graphName: string,
    user: UserInfo,
    options: CanonDocumentOptions,
    resolveQuestionSubgraph: (question: string, graphName: string) => Promise<GraphSubgraph>,
): Promise<string> {
    if (!user) {
        return '';
    }
    const engine = GraphEngine.Instance;
    const provider = options.Provider ?? engine.ProviderToUse;
    if (!IsGraphDataProvider(provider)) {
        return '';
    }
    const graph = engine.GetGraph(graphName);
    if (!graph) {
        return '';
    }

    const principals: UserInfo[] = [user, ...(options.AudienceReaders ?? [])];
    const includeProposed = options.IncludeProposed === true;
    const includeSpecs = options.IncludeSpecifications !== false;
    const entityFilterSet = options.EntityNames?.length
        ? new Set(options.EntityNames.map((n) => n.trim().toLowerCase()).filter(Boolean))
        : null;
    const conceptTypeFilterSet = options.ConceptTypes?.length
        ? new Set(options.ConceptTypes.map((t) => t.trim().toLowerCase()).filter(Boolean))
        : null;
    const ownerIndex = buildMetadataOwnerIndex(provider);

    let subgraph: GraphSubgraph | null = options.Subgraph ?? null;
    if (!subgraph && options.Question?.trim()) {
        subgraph = await resolveQuestionSubgraph(options.Question.trim(), graph.Name);
    }

    let resolvedEdges: ResolvedEdge[];
    let visibleConcepts: ConceptRow[];
    let scope: RenderScope | null = null;

    if (subgraph) {
        scope = buildScopeFromSubgraph(subgraph, provider, ownerIndex);
        resolvedEdges = resolveEdgesFromSubgraph(subgraph);
        const conceptIDs = Array.from(scope.ConceptIDs);
        visibleConcepts = await readVisibleConcepts(
            graph.ID,
            conceptIDs,
            includeProposed,
            user,
            principals,
            options.AudienceReaders,
            provider,
        );
    } else {
        const storedRows = await readGraphStoredEdgesAsPrincipals(
            graph.ID,
            includeProposed,
            principals,
            provider,
        );
        resolvedEdges = await resolveStoredEdgesForPrincipals(
            graph.Name,
            storedRows,
            includeProposed,
            user,
            principals,
            options.AudienceReaders,
            provider,
        );
        visibleConcepts = await readVisibleConcepts(
            graph.ID,
            null,
            includeProposed,
            user,
            principals,
            options.AudienceReaders,
            provider,
        );
    }

    const sections: string[] = [
        `# Organizational Canon & Domain Knowledge (${graph.Name})`,
    ];

    const precedenceSection = renderPrecedenceSection(resolvedEdges, entityFilterSet, provider, ownerIndex);
    if (precedenceSection) {
        sections.push(precedenceSection);
    }

    const conceptsSection = renderConceptsSection(
        visibleConcepts,
        resolvedEdges,
        conceptTypeFilterSet,
        entityFilterSet,
        includeSpecs,
        principals,
        provider,
        ownerIndex,
    );
    if (conceptsSection) {
        sections.push(conceptsSection);
    }

    const abvSection = renderAlternateBaseViewsSection(
        resolvedEdges,
        entityFilterSet,
        scope,
        principals,
        provider,
    );
    if (abvSection) {
        sections.push(abvSection);
    }

    const queriesSection = renderGovernedQueriesSection(
        resolvedEdges,
        entityFilterSet,
        scope,
        principals,
    );
    if (queriesSection) {
        sections.push(queriesSection);
    }

    let document = sections.join('\n\n');
    if (options.MaxChars && options.MaxChars > 0 && document.length > options.MaxChars) {
        document = `${document.slice(0, options.MaxChars)}\n\n...[truncated to ${options.MaxChars} chars]`;
    }
    return document;
}

// ─── Data Loading (Caller + Audience RLS, FLS, & Graph Access Policies) ──────

async function readGraphStoredEdgesAsPrincipals(
    graphID: string,
    includeProposed: boolean,
    principals: readonly UserInfo[],
    provider: GraphDataProvider,
): Promise<StoredEdgeRow[]> {
    const edgeEntity = provider.EntityByName(ENTITY_GRAPH_EDGES);
    if (edgeEntity && !principals.every((p) => CanUserReadEntity(edgeEntity, p))) {
        return [];
    }
    const statuses = includeProposed ? `'Approved', 'Proposed'` : `'Approved'`;
    const params = {
        EntityName: ENTITY_GRAPH_EDGES,
        ExtraFilter: `[GraphID] = '${EscapeSQLString(graphID)}' AND [Status] IN (${statuses})`,
        Fields: [
            'ID',
            'EdgeTypeID',
            'EdgeType',
            'SourceEntityID',
            'SourceEntity',
            'SourceRecordID',
            'TargetEntityID',
            'TargetEntity',
            'TargetRecordID',
            'Description',
            'Origin',
            'Status',
            'Weight',
        ],
        ResultType: 'simple' as const,
    };

    const rv = RunView.FromMetadataProvider(provider);
    const results = await Promise.all(principals.map((p) => rv.RunView<StoredEdgeRow>(params, p)));
    let rows: StoredEdgeRow[] | null = null;
    for (const res of results) {
        if (!res.Success) {
            return [];
        }
        const ids = new UUIDSet(res.Results.map((r) => r.ID));
        rows = rows === null ? res.Results : rows.filter((r) => ids.Has(r.ID));
    }
    return rows ?? [];
}

async function resolveStoredEdgesForPrincipals(
    graphName: string,
    rows: readonly StoredEdgeRow[],
    includeProposed: boolean,
    user: UserInfo,
    principals: readonly UserInfo[],
    audienceReaders: readonly UserInfo[] | undefined,
    provider: GraphDataProvider,
): Promise<ResolvedEdge[]> {
    if (rows.length === 0) {
        return [];
    }
    const engine = GraphEngine.Instance;
    const edgeEntity = provider.EntityByName(ENTITY_GRAPH_EDGES);
    const canReadEdgeDesc = !edgeEntity || IsFieldReadableByAll(edgeEntity, 'Description', principals);
    const edgeTypesByID = new UUIDMap(engine.EdgeTypes.map((et) => [et.ID, et]));
    const refs: GraphNodeRef[] = [];
    const seenKeys = new Set<string>();

    const collectRef = (entityID: string, entityNameFallback: string | undefined, recordID: string): GraphNodeRef | null => {
        const entityName = (entityNameFallback || provider.EntityByID(entityID)?.Name || '').trim();
        if (!entityName || !recordID) {
            return null;
        }
        const ref: GraphNodeRef = { EntityName: entityName, EntityID: entityID, RecordID: recordID };
        const key = engine.GetNodeKey(ref);
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            refs.push(ref);
        }
        return ref;
    };

    const edgeViews: GraphEdgeView[] = [];
    for (const row of rows) {
        const src = collectRef(row.SourceEntityID, row.SourceEntity, row.SourceRecordID);
        const tgt = collectRef(row.TargetEntityID, row.TargetEntity, row.TargetRecordID);
        if (!src || !tgt) {
            continue;
        }
        const et = edgeTypesByID.Get(row.EdgeTypeID);
        const typeName = (et?.Name ?? row.EdgeType ?? '').trim();
        if (!typeName) {
            continue;
        }
        edgeViews.push({
            ID: row.ID,
            GraphName: graphName,
            TypeName: typeName,
            InverseTypeName: et?.InverseName ?? null,
            IsDirected: et?.IsDirected !== false,
            Source: src,
            Target: tgt,
            Weight: typeof row.Weight === 'number' ? row.Weight : 1,
            Description: canReadEdgeDesc ? (row.Description ?? null) : null,
            Attributes: null,
            Origin: row.Origin === 'Inferred' ? 'Inferred' : 'Declared',
            Status: row.Status === 'Proposed' ? 'Proposed' : 'Approved',
            Confidence: null,
        });
    }

    const [visibleNodes, policyAllowedEdges] = await Promise.all([
        engine.FilterNodesForUser(refs, user, audienceReaders, {
            IncludeProposed: includeProposed,
            Provider: provider,
        }),
        engine.FilterEdgesForUser(edgeViews, user, audienceReaders, {
            IncludeProposed: includeProposed,
            Provider: provider,
        }),
    ]);

    const resolved: ResolvedEdge[] = [];
    for (const edge of policyAllowedEdges) {
        const srcView = visibleNodes.get(engine.GetNodeKey(edge.Source));
        const tgtView = visibleNodes.get(engine.GetNodeKey(edge.Target));
        if (!srcView || !tgtView) {
            continue;
        }
        resolved.push({
            TypeName: edge.TypeName,
            Source: srcView,
            Target: tgtView,
            Description: edge.Description,
        });
    }
    return resolved;
}

function resolveEdgesFromSubgraph(subgraph: GraphSubgraph): ResolvedEdge[] {
    const engine = GraphEngine.Instance;
    const nodeByKey = new Map<string, GraphNodeView>(subgraph.Nodes.map((n) => [n.Key, n]));
    const resolved: ResolvedEdge[] = [];
    for (const edge of subgraph.Edges) {
        const src = nodeByKey.get(engine.GetNodeKey(edge.Source));
        const tgt = nodeByKey.get(engine.GetNodeKey(edge.Target));
        if (!src || !tgt) {
            continue;
        }
        resolved.push({
            TypeName: edge.TypeName,
            Source: src,
            Target: tgt,
            Description: edge.Description,
        });
    }
    return resolved;
}

async function readVisibleConcepts(
    graphID: string,
    conceptIDs: readonly string[] | null,
    includeProposed: boolean,
    user: UserInfo,
    principals: readonly UserInfo[],
    audienceReaders: readonly UserInfo[] | undefined,
    provider: GraphDataProvider,
): Promise<ConceptRow[]> {
    if (conceptIDs !== null && conceptIDs.length === 0) {
        return [];
    }
    const conceptEntity = provider.EntityByName(ENTITY_GRAPH_CONCEPTS);
    if (conceptEntity && !principals.every((p) => CanUserReadEntity(conceptEntity, p))) {
        return [];
    }
    const canReadName = !conceptEntity || IsFieldReadableByAll(conceptEntity, 'Name', principals);
    const statuses = includeProposed ? `'Approved', 'Proposed'` : `'Approved'`;
    const idClause =
        conceptIDs !== null
            ? ` AND [ID] IN (${conceptIDs.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`
            : '';
    const params = {
        EntityName: ENTITY_GRAPH_CONCEPTS,
        ExtraFilter: `[GraphID] = '${EscapeSQLString(graphID)}' AND [Status] IN (${statuses})${idClause}`,
        Fields: ['ID', 'Name', 'ConceptType', 'Description', 'Specification', 'Synonyms', 'AuthorityTier', 'Status'],
        ResultType: 'simple' as const,
    };

    const rv = RunView.FromMetadataProvider(provider);
    const results = await Promise.all(principals.map((p) => rv.RunView<ConceptRow>(params, p)));
    let rows: ConceptRow[] | null = null;
    for (const res of results) {
        if (!res.Success) {
            return [];
        }
        const ids = new UUIDSet(res.Results.map((r) => r.ID));
        rows = rows === null ? res.Results : rows.filter((r) => ids.Has(r.ID));
    }
    const allowedIDs = conceptIDs !== null ? new UUIDSet(conceptIDs) : null;
    const candidates = (rows ?? []).filter(
        (r) =>
            IsGraphConceptStatusVisible(r.Status, includeProposed) &&
            (allowedIDs === null || allowedIDs.Has(r.ID)),
    );
    if (candidates.length === 0) {
        return [];
    }

    const refs: GraphNodeRef[] = candidates.map((c) => ({ EntityName: ENTITY_GRAPH_CONCEPTS, RecordID: c.ID }));
    const visible = await GraphEngine.Instance.FilterNodesForUser(refs, user, audienceReaders, {
        IncludeProposed: includeProposed,
        Provider: provider,
    });

    const sanitized: ConceptRow[] = [];
    for (const c of candidates) {
        const key = GraphEngine.Instance.GetNodeKey({ EntityName: ENTITY_GRAPH_CONCEPTS, RecordID: c.ID });
        const view = visible.get(key);
        if (!view) {
            continue;
        }
        const neutralLabel = NeutralGraphNodeLabel(ENTITY_GRAPH_CONCEPTS, c.ID);
        const isRedacted = !canReadName || (view.Label === neutralLabel && c.Name !== neutralLabel);
        if (isRedacted) {
            sanitized.push({
                ...c,
                Name: view.Label,
                Description: null,
                Specification: null,
                Synonyms: null,
                AuthorityTier: null,
            });
        } else {
            sanitized.push(c);
        }
    }
    return sanitized.sort((a, b) => a.Name.localeCompare(b.Name) || compareText(a.ID, b.ID));
}

// ─── Scope & Metadata Indexing ───────────────────────────────────────────────

function buildMetadataOwnerIndex(provider: IMetadataProvider): MetadataOwnerIndex {
    const fieldMap = new UUIDMap<string>();
    const abvMap = new UUIDMap<string>();
    for (const ent of provider.Entities) {
        for (const f of ent.Fields) {
            fieldMap.Set(f.ID, ent.Name);
        }
        for (const abv of ent.AlternateBaseViews ?? []) {
            abvMap.Set(abv.ID, ent.Name);
        }
    }
    return { FieldEntityNameByID: fieldMap, AbvEntityNameByID: abvMap };
}

function buildScopeFromSubgraph(
    subgraph: GraphSubgraph,
    provider: IMetadataProvider,
    ownerIndex: MetadataOwnerIndex,
): RenderScope {
    const scope: RenderScope = {
        ConceptIDs: new UUIDSet(),
        EntityNamesLower: new Set<string>(),
        AbvIDs: new UUIDSet(),
        QueryIDs: new UUIDSet(),
    };
    for (const node of subgraph.Nodes) {
        addNodeToScope(node.EntityName, node.RecordID, scope, provider, ownerIndex);
    }
    return scope;
}

function addNodeToScope(
    entityName: string,
    recordID: string,
    scope: RenderScope,
    provider: IMetadataProvider,
    ownerIndex: MetadataOwnerIndex,
): void {
    const lower = entityName.trim().toLowerCase();
    if (lower === ENTITY_GRAPH_CONCEPTS.toLowerCase()) {
        scope.ConceptIDs.Add(recordID);
        return;
    }
    if (lower === ENTITY_ENTITIES.toLowerCase()) {
        const ent = provider.EntityByID(recordID);
        if (ent) {
            scope.EntityNamesLower.add(ent.Name.trim().toLowerCase());
        }
        return;
    }
    if (lower === ENTITY_ENTITY_FIELDS.toLowerCase()) {
        const owner = ownerIndex.FieldEntityNameByID.Get(recordID);
        if (owner) {
            scope.EntityNamesLower.add(owner.trim().toLowerCase());
        }
        return;
    }
    if (lower === ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase()) {
        scope.AbvIDs.Add(recordID);
        const owner = ownerIndex.AbvEntityNameByID.Get(recordID);
        if (owner) {
            scope.EntityNamesLower.add(owner.trim().toLowerCase());
        }
        return;
    }
    if (lower === ENTITY_QUERIES.toLowerCase()) {
        scope.QueryIDs.Add(recordID);
    }
}

// ─── Section Renderers ───────────────────────────────────────────────────────

function renderPrecedenceSection(
    edges: readonly ResolvedEdge[],
    entityFilterSet: ReadonlySet<string> | null,
    provider: IMetadataProvider,
    ownerIndex: MetadataOwnerIndex,
): string | null {
    const matching = edges
        .filter((e) => PRECEDENCE_EDGE_TYPES.has(e.TypeName))
        .filter((e) => {
            if (!entityFilterSet) {
                return true;
            }
            const srcOwner = owningEntityName(e.Source, provider, ownerIndex);
            const tgtOwner = owningEntityName(e.Target, provider, ownerIndex);
            return (
                (srcOwner !== null && entityFilterSet.has(srcOwner.toLowerCase())) ||
                (tgtOwner !== null && entityFilterSet.has(tgtOwner.toLowerCase()))
            );
        })
        .sort(
            (a, b) =>
                a.TypeName.localeCompare(b.TypeName) ||
                a.Source.Label.localeCompare(b.Source.Label) ||
                a.Target.Label.localeCompare(b.Target.Label),
        );

    if (matching.length === 0) {
        return null;
    }

    const lines: string[] = ['## 1. Precedence & Deprecation Rules'];
    for (const edge of matching) {
        const verb = formatPrecedenceVerb(edge.TypeName);
        const reason = edge.Description?.trim() ? ` — ${edge.Description.trim()}` : '';
        lines.push(`- **${edge.Source.Label}** ${verb} **${edge.Target.Label}**${reason}`);
    }
    return lines.join('\n');
}

function formatPrecedenceVerb(edgeType: string): string {
    switch (edgeType) {
        case 'Preferred Over':
            return 'is PREFERRED OVER';
        case 'Supersedes':
            return 'SUPERSEDES';
        case 'Contradicts':
            return 'CONTRADICTS';
        case 'Same As':
            return 'is SAME AS';
        default:
            return edgeType.toUpperCase();
    }
}

interface ConceptEdgeIndex {
    ArtifactEdgesByConceptID: UUIDMap<ResolvedEdge[]>;
    RelatedItemsByConceptID: UUIDMap<Array<{ SortKey: string; Text: string }>>;
}

function indexConceptEdges(edges: readonly ResolvedEdge[]): ConceptEdgeIndex {
    const artifactMap = new UUIDMap<ResolvedEdge[]>();
    const relatedMap = new UUIDMap<Array<{ SortKey: string; Text: string }>>();
    const conceptEntityLower = ENTITY_GRAPH_CONCEPTS.toLowerCase();

    for (const e of edges) {
        const srcIsConcept = e.Source.EntityName.trim().toLowerCase() === conceptEntityLower;
        const tgtIsConcept = e.Target.EntityName.trim().toLowerCase() === conceptEntityLower;

        // Per MJ #6842: Defines, Measures, Describes, Implements are artifact → concept
        if (ARTIFACT_TO_CONCEPT_EDGE_TYPES.has(e.TypeName) && tgtIsConcept) {
            const list = artifactMap.Get(e.Target.RecordID) ?? [];
            list.push(e);
            artifactMap.Set(e.Target.RecordID, list);
        }

        if (CONCEPT_RELATION_EDGE_TYPES.has(e.TypeName) && srcIsConcept && tgtIsConcept) {
            const sortKey = `${e.TypeName}\0${e.Source.Label}\0${e.Target.Label}`;
            const outList = relatedMap.Get(e.Source.RecordID) ?? [];
            outList.push({ SortKey: sortKey, Text: `${e.TypeName} → ${e.Target.Label}` });
            relatedMap.Set(e.Source.RecordID, outList);

            if (e.Source.Key !== e.Target.Key) {
                const inList = relatedMap.Get(e.Target.RecordID) ?? [];
                inList.push({ SortKey: sortKey, Text: `${e.Source.Label} → ${e.TypeName}` });
                relatedMap.Set(e.Target.RecordID, inList);
            }
        }
    }
    return { ArtifactEdgesByConceptID: artifactMap, RelatedItemsByConceptID: relatedMap };
}

function renderConceptsSection(
    concepts: readonly ConceptRow[],
    edges: readonly ResolvedEdge[],
    conceptTypeFilterSet: ReadonlySet<string> | null,
    entityFilterSet: ReadonlySet<string> | null,
    includeSpecifications: boolean,
    principals: readonly UserInfo[],
    provider: IMetadataProvider,
    ownerIndex: MetadataOwnerIndex,
): string | null {
    const conceptEntity = provider.EntityByName(ENTITY_GRAPH_CONCEPTS);
    const canReadDesc = !conceptEntity || IsFieldReadableByAll(conceptEntity, 'Description', principals);
    const canReadSpec = !conceptEntity || IsFieldReadableByAll(conceptEntity, 'Specification', principals);
    const canReadSynonyms = !conceptEntity || IsFieldReadableByAll(conceptEntity, 'Synonyms', principals);
    const canReadAuthority = !conceptEntity || IsFieldReadableByAll(conceptEntity, 'AuthorityTier', principals);
    const edgeIndex = indexConceptEdges(edges);

    const blocks: string[] = [];
    for (const concept of concepts) {
        if (conceptTypeFilterSet && !conceptTypeFilterSet.has((concept.ConceptType || '').trim().toLowerCase())) {
            continue;
        }

        const artifactEdges = [...(edgeIndex.ArtifactEdgesByConceptID.Get(concept.ID) ?? [])].sort(
            (a, b) => a.TypeName.localeCompare(b.TypeName) || a.Source.Label.localeCompare(b.Source.Label),
        );

        if (entityFilterSet) {
            const touchesEntity = artifactEdges.some((e) => {
                const owner = owningEntityName(e.Source, provider, ownerIndex);
                return owner !== null && entityFilterSet.has(owner.toLowerCase());
            });
            if (!touchesEntity) {
                continue;
            }
        }

        const relatedItems = [...(edgeIndex.RelatedItemsByConceptID.Get(concept.ID) ?? [])].sort((a, b) =>
            compareText(a.SortKey, b.SortKey),
        );

        const authorityLabel = canReadAuthority && concept.AuthorityTier ? ` — Authority: ${concept.AuthorityTier}` : '';
        const statusBadge = concept.Status === 'Proposed' ? ' [Proposed]' : '';
        const entry: string[] = [`### ${concept.Name} (${concept.ConceptType || 'Term'})${authorityLabel}${statusBadge}`];

        if (canReadSynonyms) {
            const synonyms = parseSynonyms(concept.Synonyms);
            if (synonyms.length > 0) {
                entry.push(`- **Synonyms:** ${synonyms.join(', ')}`);
            }
        }
        if (canReadDesc && concept.Description?.trim()) {
            entry.push(`- **Definition:** ${concept.Description.trim()}`);
        }
        if (includeSpecifications && canReadSpec && concept.Specification?.trim()) {
            entry.push(`- **Specification:** ${concept.Specification.trim()}`);
        }
        if (artifactEdges.length > 0) {
            const formatted = artifactEdges.map((e) => `${e.Source.Label} (${e.TypeName})`);
            entry.push(`- **Grounded By:** ${formatted.join('; ')}`);
        }
        if (relatedItems.length > 0) {
            entry.push(`- **Related Concepts:** ${relatedItems.map((i) => i.Text).join('; ')}`);
        }
        blocks.push(entry.join('\n'));
    }

    if (blocks.length === 0) {
        return null;
    }
    return `## 2. Domain Concepts & Definitions\n\n${blocks.join('\n\n')}`;
}

function indexArtifactConceptRoles(
    edges: readonly ResolvedEdge[],
    sourceEntityLower: string,
    allowedTypes: ReadonlySet<string>,
): UUIDMap<string[]> {
    const bySourceID = new UUIDMap<string[]>();
    const conceptEntityLower = ENTITY_GRAPH_CONCEPTS.toLowerCase();
    for (const e of edges) {
        if (
            allowedTypes.has(e.TypeName) &&
            e.Source.EntityName.trim().toLowerCase() === sourceEntityLower &&
            e.Target.EntityName.trim().toLowerCase() === conceptEntityLower
        ) {
            const list = bySourceID.Get(e.Source.RecordID) ?? [];
            list.push(`${e.TypeName}: ${e.Target.Label}`);
            bySourceID.Set(e.Source.RecordID, list);
        }
    }
    return bySourceID;
}

function renderAlternateBaseViewsSection(
    edges: readonly ResolvedEdge[],
    entityFilterSet: ReadonlySet<string> | null,
    scope: RenderScope | null,
    principals: readonly UserInfo[],
    provider: IMetadataProvider,
): string | null {
    const entities = [...provider.Entities]
        .filter((e) => principals.every((p) => CanUserReadEntity(e, p)))
        .sort((a, b) => a.Name.localeCompare(b.Name));

    // Per MJ #6842: ABV --Defines/Measures--> Concept
    const rolesByAbvID = indexArtifactConceptRoles(
        edges,
        ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase(),
        new Set(['Defines', 'Measures']),
    );

    const lines: string[] = ['## 3. Canonical Alternate Base Views'];
    for (const entity of entities) {
        if (entityFilterSet && !entityFilterSet.has(entity.Name.trim().toLowerCase())) {
            continue;
        }
        const activeAbvs = [...(entity.AlternateBaseViews ?? [])]
            .filter((v) => v.Status === 'Active')
            .sort((a, b) => a.ViewName.localeCompare(b.ViewName));

        for (const abv of activeAbvs) {
            if (
                scope &&
                !scope.AbvIDs.Has(abv.ID) &&
                !scope.EntityNamesLower.has(entity.Name.trim().toLowerCase())
            ) {
                continue;
            }
            const linkedConcepts = [...(rolesByAbvID.Get(abv.ID) ?? [])].sort();
            const viewName = abv.ViewName || abv.Name;
            const viewRef = entity.SchemaName
                ? `\`[${entity.SchemaName}].[${viewName}]\``
                : `\`${viewName}\``;
            const desc = abv.Description?.trim() ? ` — ${abv.Description.trim()}` : '';
            lines.push(`- **${entity.Name} → ${abv.Name}** (${viewRef})${desc}`);
            if (linkedConcepts.length > 0) {
                lines.push(`  - **Canon Role:** ${linkedConcepts.join('; ')}`);
            }
        }
    }
    return lines.length > 1 ? lines.join('\n') : null;
}

function renderGovernedQueriesSection(
    edges: readonly ResolvedEdge[],
    entityFilterSet: ReadonlySet<string> | null,
    scope: RenderScope | null,
    principals: readonly UserInfo[],
): string | null {
    const queries = [...(QueryEngine.Instance.Queries ?? [])].sort((a, b) => {
        const pathA = a.CategoryPath ? `${a.CategoryPath}/${a.Name}` : a.Name;
        const pathB = b.CategoryPath ? `${b.CategoryPath}/${b.Name}` : b.Name;
        return pathA.localeCompare(pathB) || compareText(a.ID, b.ID);
    });
    const queriesByID = new UUIDMap(queries.map((q) => [q.ID, q]));

    const queryEntitiesByQueryID = new UUIDMap<typeof QueryEngine.Instance.QueryEntities>();
    for (const qe of QueryEngine.Instance.QueryEntities ?? []) {
        const list = queryEntitiesByQueryID.Get(qe.QueryID) ?? [];
        list.push(qe);
        queryEntitiesByQueryID.Set(qe.QueryID, list);
    }

    const depsByQueryID = new UUIDMap<typeof QueryEngine.Instance.QueryDependencies>();
    for (const dep of QueryEngine.Instance.QueryDependencies ?? []) {
        const list = depsByQueryID.Get(dep.QueryID) ?? [];
        list.push(dep);
        depsByQueryID.Set(dep.QueryID, list);
    }

    // Per MJ #6842: Query --Measures/Defines--> Concept
    const rolesByQueryID = indexArtifactConceptRoles(
        edges,
        ENTITY_QUERIES.toLowerCase(),
        new Set(['Measures', 'Defines']),
    );

    const lines: string[] = ['## 4. Governed Ground-Truth Queries'];
    for (const query of queries) {
        if (query.Status !== 'Approved') {
            continue;
        }
        if (!principals.every((p) => query.UserCanRun(p).canRun)) {
            continue;
        }

        const qEntities = queryEntitiesByQueryID.Get(query.ID) ?? [];
        if (
            entityFilterSet &&
            !qEntities.some((qe) => entityFilterSet.has((qe.Entity ?? '').trim().toLowerCase()))
        ) {
            continue;
        }
        if (
            scope &&
            !scope.QueryIDs.Has(query.ID) &&
            !qEntities.some((qe) => scope.EntityNamesLower.has((qe.Entity ?? '').trim().toLowerCase()))
        ) {
            continue;
        }

        const measuredConcepts = [...(rolesByQueryID.Get(query.ID) ?? [])].sort();
        const readTargets = qEntities
            .map((qe) => (qe.AlternateBaseView ? `${qe.Entity}.${qe.AlternateBaseView}` : qe.Entity || qe.EntityID))
            .filter(Boolean)
            .sort();
        const composedTargets = (depsByQueryID.Get(query.ID) ?? [])
            .map((d) => queriesByID.Get(d.DependsOnQueryID)?.Name ?? d.DependsOnQuery ?? d.ReferencePath)
            .filter(Boolean)
            .sort();

        const fullPath = query.CategoryPath ? `${query.CategoryPath}/${query.Name}` : query.Name;
        const desc = query.Description?.trim() ? ` — ${query.Description.trim()}` : '';
        lines.push(`- **\`${fullPath}\`**${desc}`);
        if (measuredConcepts.length > 0) {
            lines.push(`  - **Canon Role:** ${measuredConcepts.join('; ')}`);
        }
        if (readTargets.length > 0) {
            lines.push(`  - **Reads:** ${readTargets.map((r) => `\`${r}\``).join(', ')}`);
        }
        if (composedTargets.length > 0) {
            lines.push(`  - **Composes:** ${composedTargets.map((c) => `\`${c}\``).join(', ')}`);
        }
    }

    return lines.length > 1 ? lines.join('\n') : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function owningEntityName(
    node: GraphNodeView,
    provider: IMetadataProvider,
    ownerIndex: MetadataOwnerIndex,
): string | null {
    const lower = node.EntityName.trim().toLowerCase();
    if (lower === ENTITY_ENTITIES.toLowerCase()) {
        return provider.EntityByID(node.RecordID)?.Name ?? node.Label;
    }
    if (lower === ENTITY_ENTITY_FIELDS.toLowerCase()) {
        return ownerIndex.FieldEntityNameByID.Get(node.RecordID) ?? null;
    }
    if (lower === ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase()) {
        return ownerIndex.AbvEntityNameByID.Get(node.RecordID) ?? null;
    }
    return null;
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
