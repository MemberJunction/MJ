import { BaseSingleton, IndexByUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJGraphConceptEntity, MJGraphEdgeEntity } from '../generated/entity_subclasses';
import {
    BuildGraphNodeKey,
    GraphEdgeView,
    GraphNodeRef,
    GraphNodeView,
    GraphSubgraphResult,
    GraphTraversalOptions,
} from '../graph';
import { GraphEngine } from './GraphEngine';
import { QueryEngine } from './QueryEngine';

/**
 * Structured Canon summary for a single MJ Entity, surfaced by `Get Entity Details`
 * and agent schema discovery tools.
 */
export interface EntityCanonSummary {
    EntityName: string;
    EntityID: string;
    Concepts: Array<{
        ID: string;
        Name: string;
        ConceptType: string;
        AuthorityTier: string | null;
        Relationship: string;
        Description: string;
    }>;
    AlternateBaseViews: Array<{
        ID: string;
        Name: string;
        DisplayName: string;
        ViewName: string;
        Description: string;
    }>;
    Queries: Array<{
        ID: string;
        Name: string;
        CategoryPath: string;
        Relationship: string;
        Description: string | null;
    }>;
    PrecedenceRules: Array<{
        EdgeType: string;
        Preferred: GraphNodeRef;
        Over: GraphNodeRef;
        Description: string | null;
    }>;
}

/**
 * Options for collapsing the governed Canon graph into a flat Markdown domain-knowledge document
 * via {@link CanonGraphEngine.RenderCanonDocument}.
 */
export interface CanonDocumentOptions {
    /** Optional explicit graph name (defaults to `'MJ Canon'`) */
    GraphName?: string;
    /**
     * Optional natural-language question or search query. When provided (and `Subgraph` is not
     * already supplied), `RenderCanonDocument` slices the Canon graph around the concepts,
     * entities, alternate base views, and queries matched by `Question`.
     */
    Question?: string;
    /**
     * Optional pre-expanded subgraph (for example from {@link CanonGraphEngine.CanonContext} or
     * {@link GraphEngine.Subgraph}). When provided, only the concepts, entities, alternate base
     * views, queries, and precedence rules in this subgraph are collapsed into the document.
     */
    Subgraph?: GraphSubgraphResult;
    /** Optional filter restricting output to specific `ConceptType` names (case-insensitive) */
    ConceptTypes?: string[];
    /** Optional filter restricting output to specific `Entity` names (case-insensitive) */
    EntityNames?: string[];
    /** Whether to include full concept `Specification` blocks (default `true`) */
    IncludeSpecifications?: boolean;
    /** Whether to include `Proposed` concepts and edges in addition to `Approved` (default `false`) */
    IncludeProposed?: boolean;
    /** Optional maximum character length of the returned document */
    MaxChars?: number;
}

interface CanonSubgraphScope {
    ConceptIDs: UUIDSet;
    EntityNamesLower: Set<string>;
    AbvIDs: UUIDSet;
    QueryIDs: UUIDSet;
}

const ENTITY_GRAPH_CONCEPTS = 'MJ: Graph Concepts';
const ENTITY_ENTITIES = 'MJ: Entities';
const ENTITY_ALTERNATE_BASE_VIEWS = 'MJ: Entity Alternate Base Views';
const ENTITY_QUERIES = 'MJ: Queries';

function normalizeStem(word: string): string {
    const lower = word.toLowerCase().trim();
    if (lower.length <= 3) {
        return lower;
    }
    if (lower.endsWith('ies') && lower.length > 4) {
        return lower.slice(0, -3) + 'y';
    }
    if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('zes')) {
        return lower.slice(0, -2);
    }
    if (lower.endsWith('s') && !lower.endsWith('ss')) {
        return lower.slice(0, -1);
    }
    return lower;
}

function tokenizePhrase(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(t => t.length > 0);
}

/**
 * High-level governed Canon helper built over {@link GraphEngine} (`"MJ Canon"`).
 *
 * Provides concept lookup by name and synonyms (`FindConcepts`), natural-language
 * question seed resolution and subgraph expansion (`CanonContext`), and per-entity
 * Canon summaries (`GetEntityCanonSummary`).
 */
export class CanonGraphEngine extends BaseSingleton<CanonGraphEngine> {
    public static readonly DEFAULT_CANON_GRAPH_NAME = 'MJ Canon';

    public static get Instance(): CanonGraphEngine {
        return super.getInstance<CanonGraphEngine>();
    }

    /**
     * Resolves the active Canon graph name (preferring `graphName` when provided, otherwise
     * `"MJ Canon"` or the highest-ranked active graph with `IsCanon = true`).
     */
    public ResolveCanonGraphName(graphName?: string): string {
        if (graphName?.trim()) {
            return graphName.trim();
        }
        const graphEngine = GraphEngine.Instance;
        const explicit = graphEngine.GetGraphByName(CanonGraphEngine.DEFAULT_CANON_GRAPH_NAME);
        if (explicit) {
            return explicit.Name;
        }
        const canonGraphs = graphEngine.GetCanonGraphs();
        if (canonGraphs.length > 0) {
            return canonGraphs[0].Name;
        }
        return CanonGraphEngine.DEFAULT_CANON_GRAPH_NAME;
    }

    /**
     * Finds approved `MJ: Graph Concepts` in the Canon graph whose `Name` or `Synonyms`
     * match `text` (supporting exact, substring, and stemmed phrase matching).
     */
    public FindConcepts(
        text: string,
        user?: UserInfo,
        graphName?: string,
    ): GraphNodeView[] {
        const trimmed = text?.trim();
        if (!trimmed) {
            return [];
        }

        const graphEngine = GraphEngine.Instance;
        const md = this.metadataProvider;
        const conceptEntity = md.EntityByName(ENTITY_GRAPH_CONCEPTS);
        if (conceptEntity && user && conceptEntity.Permissions?.length > 0) {
            if (!conceptEntity.GetUserPermisions(user)?.CanRead) {
                return [];
            }
        }

        const canonGraphIDs = this.resolveTargetCanonGraphIDs(graphName);
        const candidates = graphEngine.Concepts.filter(
            c =>
                c.Status === 'Approved' &&
                (canonGraphIDs.Size === 0 || canonGraphIDs.Has(c.GraphID)),
        );

        const queryTokens = tokenizePhrase(trimmed);
        const queryStemmed = queryTokens.map(normalizeStem);
        const queryLower = trimmed.toLowerCase();

        const scoredMatches: Array<{ Concept: MJGraphConceptEntity; Score: number }> = [];
        for (const concept of candidates) {
            const score = this.scoreConceptMatch(concept, queryLower, queryStemmed);
            if (score > 0) {
                scoredMatches.push({ Concept: concept, Score: score });
            }
        }

        scoredMatches.sort((a, b) => b.Score - a.Score);

        return scoredMatches.map(({ Concept }) => {
            const conceptType = graphEngine.ConceptTypes.find(ct =>
                UUIDsEqual(ct.ID, Concept.ConceptTypeID),
            );
            return {
                Key: BuildGraphNodeKey(conceptEntity?.ID ?? ENTITY_GRAPH_CONCEPTS, Concept.ID),
                EntityName: ENTITY_GRAPH_CONCEPTS,
                RecordID: Concept.ID,
                Label: Concept.Name,
                Icon: conceptType?.IconClass ?? 'fa-solid fa-lightbulb',
                Description: Concept.Description || null,
            };
        });
    }

    /**
     * Resolves seed nodes (concepts, entities, alternate base views, and queries) mentioned
     * in `question` and expands a best-first Canon subgraph around them.
     */
    public async CanonContext(
        question: string,
        options: GraphTraversalOptions = {},
        user: UserInfo,
        graphName?: string,
    ): Promise<GraphSubgraphResult> {
        const resolvedGraphName = this.ResolveCanonGraphName(graphName);
        const seeds = this.extractQuestionSeeds(question, user, resolvedGraphName);
        if (seeds.length === 0) {
            return { Nodes: [], Edges: [] };
        }
        return GraphEngine.Instance.Subgraph(resolvedGraphName, seeds, options, user);
    }

    /**
     * Builds a structured summary of Canon governance for a single entity:
     * concepts it `Describes`/`Defines`/`Governs`, its active `Alternate Base Views`,
     * approved `Queries` reading it or measuring its concepts, and any `Preferred Over`
     * precedence rules.
     */
    public async GetEntityCanonSummary(
        entityNameOrID: string,
        user: UserInfo,
        graphName?: string,
    ): Promise<EntityCanonSummary | null> {
        const md = this.metadataProvider;
        const entity =
            md.EntityByName(entityNameOrID) ?? md.EntityByID(entityNameOrID);
        if (!entity) {
            return null;
        }

        const resolvedGraphName = this.ResolveCanonGraphName(graphName);
        const seed: GraphNodeRef = { EntityName: ENTITY_ENTITIES, RecordID: entity.ID };
        const subgraph = await GraphEngine.Instance.Subgraph(
            resolvedGraphName,
            [seed],
            { Depth: 2, Direction: 'Both', MaxNodes: 50 },
            user,
        );

        return this.buildEntityCanonSummaryFromSubgraph(entity, subgraph, user);
    }

    /**
     * Collapses the governed Canon graph into a flat, deterministic Markdown domain-knowledge
     * document suitable for **DBAutoDoc** grounding, **Skip Brain** (`*_DataExpert.md` replacement
     * / Metadata Cache `canon` section), **QueryGen**, and agent system prompts.
     *
     * Respects `user` entity read permissions (`CanRead`) and query run permissions (`UserCanRun`).
     */
    public RenderCanonDocument(
        options: CanonDocumentOptions = {},
        user?: UserInfo,
    ): string {
        const graphEngine = GraphEngine.Instance;
        const resolvedGraphName = this.ResolveCanonGraphName(options.GraphName);
        const graph = graphEngine.GetGraphByName(resolvedGraphName);
        const includeProposed = options.IncludeProposed === true;
        const includeSpecs = options.IncludeSpecifications !== false;

        const entityFilterSet = options.EntityNames?.length
            ? new Set(options.EntityNames.map(n => n.trim().toLowerCase()))
            : null;
        const conceptTypeFilterSet = options.ConceptTypes?.length
            ? new Set(options.ConceptTypes.map(t => t.trim().toLowerCase()))
            : null;

        const storedEdges = graphEngine.StoredEdges.filter(e => {
            if (graph && !UUIDsEqual(e.GraphID, graph.ID)) {
                return false;
            }
            if (e.Status === 'Rejected') {
                return false;
            }
            return includeProposed || e.Status === 'Approved';
        });

        const subgraphScope = this.resolveSubgraphScope(
            options,
            resolvedGraphName,
            storedEdges,
            user,
        );

        const sections: string[] = [
            `# Organizational Canon & Domain Knowledge (${resolvedGraphName})`,
        ];

        const precedenceSection = this.renderPrecedenceSection(
            storedEdges,
            entityFilterSet,
            subgraphScope,
            user,
        );
        if (precedenceSection) {
            sections.push(precedenceSection);
        }

        const conceptsSection = this.renderConceptsSection(
            graph?.ID,
            storedEdges,
            conceptTypeFilterSet,
            entityFilterSet,
            subgraphScope,
            includeProposed,
            includeSpecs,
            user,
        );
        if (conceptsSection) {
            sections.push(conceptsSection);
        }

        const abvSection = this.renderAlternateBaseViewsSection(
            storedEdges,
            entityFilterSet,
            subgraphScope,
            user,
        );
        if (abvSection) {
            sections.push(abvSection);
        }

        const queriesSection = this.renderGovernedQueriesSection(
            storedEdges,
            entityFilterSet,
            subgraphScope,
            user,
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

    // ─── Internal Helpers ───────────────────────────────────────────────────────

    private resolveTargetCanonGraphIDs(graphName?: string): UUIDSet {
        const graphEngine = GraphEngine.Instance;
        if (graphName?.trim()) {
            const g = graphEngine.GetGraphByName(graphName);
            return g ? new UUIDSet([g.ID]) : new UUIDSet();
        }
        const canonGraphs = graphEngine.GetCanonGraphs();
        return new UUIDSet(canonGraphs.map(g => g.ID));
    }

    private scoreConceptMatch(
        concept: MJGraphConceptEntity,
        queryLower: string,
        queryStemmedTokens: string[],
    ): number {
        const surfaceForms: string[] = [concept.Name];
        if (concept.Synonyms?.trim()) {
            try {
                const parsed: unknown = JSON.parse(concept.Synonyms);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        if (typeof item === 'string' && item.trim()) {
                            surfaceForms.push(item.trim());
                        }
                    }
                }
            } catch {
                // Ignore invalid JSON in Synonyms
            }
        }

        let bestScore = 0;
        for (let i = 0; i < surfaceForms.length; i++) {
            const form = surfaceForms[i];
            const formLower = form.toLowerCase().trim();
            if (!formLower) {
                continue;
            }
            const isPrimaryName = i === 0;
            const weightBoost = isPrimaryName ? 1.0 : 0.95;

            if (queryLower === formLower) {
                bestScore = Math.max(bestScore, 1.0 * weightBoost);
                continue;
            }

            if (queryLower.includes(formLower) || formLower.includes(queryLower)) {
                bestScore = Math.max(bestScore, 0.9 * weightBoost);
                continue;
            }

            const formTokens = tokenizePhrase(formLower).map(normalizeStem);
            if (formTokens.length === 0) {
                continue;
            }

            // Check contiguous stemmed phrase match inside queryStemmedTokens
            if (this.containsStemmedSequence(queryStemmedTokens, formTokens)) {
                bestScore = Math.max(bestScore, 0.85 * weightBoost);
                continue;
            }

            // Check high token overlap (all tokens of the concept surface form appear in the question)
            const matchedCount = formTokens.filter(t => queryStemmedTokens.includes(t)).length;
            if (matchedCount === formTokens.length && formTokens.length >= 1) {
                bestScore = Math.max(bestScore, 0.75 * weightBoost);
            }
        }

        return bestScore;
    }

    private containsStemmedSequence(haystack: string[], needle: string[]): boolean {
        if (needle.length === 0 || needle.length > haystack.length) {
            return false;
        }
        for (let i = 0; i <= haystack.length - needle.length; i++) {
            let allMatch = true;
            for (let j = 0; j < needle.length; j++) {
                if (haystack[i + j] !== needle[j]) {
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) {
                return true;
            }
        }
        return false;
    }

    private extractQuestionSeeds(
        question: string,
        user: UserInfo,
        graphName: string,
    ): GraphNodeRef[] {
        const seeds: GraphNodeRef[] = [];
        const seen = new Set<string>();
        const addSeed = (ref: GraphNodeRef) => {
            const key = `${ref.EntityName.toLowerCase()}|${ref.RecordID.toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                seeds.push(ref);
            }
        };

        // 1. Matched Canon Concepts
        const matchedConcepts = this.FindConcepts(question, user, graphName);
        for (const c of matchedConcepts) {
            addSeed({ EntityName: ENTITY_GRAPH_CONCEPTS, RecordID: c.RecordID });
        }

        const queryTokens = tokenizePhrase(question).map(normalizeStem);
        const queryLower = question.toLowerCase();
        const md = this.metadataProvider;

        // 2. Matched Entities and their Alternate Base Views
        for (const entity of md?.Entities ?? []) {
            if (entity.Name.startsWith('MJ: Graph')) {
                continue;
            }
            const entityTokens = tokenizePhrase(entity.Name).map(normalizeStem);
            if (
                entityTokens.length > 0 &&
                (queryLower.includes(entity.Name.toLowerCase()) ||
                    this.containsStemmedSequence(queryTokens, entityTokens))
            ) {
                addSeed({ EntityName: ENTITY_ENTITIES, RecordID: entity.ID });
            }

            for (const abv of entity.AlternateBaseViews ?? []) {
                if (abv.Status !== 'Active') {
                    continue;
                }
                const abvLower = abv.Name.toLowerCase();
                const viewLower = abv.ViewName.toLowerCase();
                if (queryLower.includes(viewLower) || queryLower.includes(`${abvLower} ${entity.Name.toLowerCase()}`)) {
                    addSeed({ EntityName: ENTITY_ALTERNATE_BASE_VIEWS, RecordID: abv.ID });
                }
            }
        }

        // 3. Matched Approved Queries
        for (const q of QueryEngine.Instance.Queries ?? []) {
            if (q.Status !== 'Approved') {
                continue;
            }
            const qLower = q.Name.toLowerCase().trim();
            if (qLower.length >= 4 && queryLower.includes(qLower)) {
                addSeed({ EntityName: ENTITY_QUERIES, RecordID: q.ID });
            }
        }

        return seeds;
    }

    private buildEntityCanonSummaryFromSubgraph(
        entity: EntityInfo,
        subgraph: GraphSubgraphResult,
        user: UserInfo,
    ): EntityCanonSummary {
        const graphEngine = GraphEngine.Instance;
        const concepts: EntityCanonSummary['Concepts'] = [];
        const seenConceptIDs = new UUIDSet();

        for (const node of subgraph.Nodes) {
            if (node.EntityName.trim().toLowerCase() !== ENTITY_GRAPH_CONCEPTS.toLowerCase()) {
                continue;
            }
            if (seenConceptIDs.Has(node.RecordID)) {
                continue;
            }
            seenConceptIDs.Add(node.RecordID);

            const conceptEntity = graphEngine.Concepts.find(c =>
                UUIDsEqual(c.ID, node.RecordID),
            );
            const linkingEdge = subgraph.Edges.find(
                e =>
                    UUIDsEqual(e.Source.RecordID, node.RecordID) ||
                    UUIDsEqual(e.Target.RecordID, node.RecordID),
            );

            concepts.push({
                ID: node.RecordID,
                Name: node.Label,
                ConceptType: conceptEntity?.ConceptType ?? 'Term',
                AuthorityTier: conceptEntity?.AuthorityTier ?? null,
                Relationship: linkingEdge?.TypeName ?? 'RelatedTo',
                Description: node.Description ?? conceptEntity?.Description ?? '',
            });
        }

        const activeABVs = (entity.AlternateBaseViews ?? [])
            .filter(abv => abv.Status === 'Active')
            .map(abv => ({
                ID: abv.ID,
                Name: abv.Name,
                DisplayName: abv.EffectiveDisplayName,
                ViewName: abv.ViewName,
                Description: abv.Description,
            }));

        const queries: EntityCanonSummary['Queries'] = [];
        const seenQueryIDs = new UUIDSet();
        for (const node of subgraph.Nodes) {
            if (node.EntityName.trim().toLowerCase() !== ENTITY_QUERIES.toLowerCase()) {
                continue;
            }
            if (seenQueryIDs.Has(node.RecordID)) {
                continue;
            }
            const fullQuery = QueryEngine.Instance.Queries.find(q =>
                UUIDsEqual(q.ID, node.RecordID),
            );
            if (!fullQuery || fullQuery.Status !== 'Approved') {
                continue;
            }
            if (user && !fullQuery.UserCanRun(user).canRun) {
                continue;
            }
            seenQueryIDs.Add(node.RecordID);

            const linkingEdge = subgraph.Edges.find(
                e =>
                    UUIDsEqual(e.Source.RecordID, node.RecordID) ||
                    UUIDsEqual(e.Target.RecordID, node.RecordID),
            );
            queries.push({
                ID: fullQuery.ID,
                Name: fullQuery.Name,
                CategoryPath: fullQuery.CategoryPath,
                Relationship: linkingEdge?.TypeName ?? 'Reads',
                Description: fullQuery.Description ?? null,
            });
        }

        const precedenceRules: EntityCanonSummary['PrecedenceRules'] = subgraph.Edges.filter(
            (e: GraphEdgeView) => {
                const lower = e.TypeName.trim().toLowerCase();
                return lower === 'preferred over' || lower === 'supersedes';
            },
        ).map(e => ({
            EdgeType: e.TypeName,
            Preferred: e.Source,
            Over: e.Target,
            Description: e.Description,
        }));

        return {
            EntityName: entity.Name,
            EntityID: entity.ID,
            Concepts: concepts,
            AlternateBaseViews: activeABVs,
            Queries: queries,
            PrecedenceRules: precedenceRules,
        };
    }

    // ─── Flat Document Collapse Helpers ─────────────────────────────────────────

    private resolveSubgraphScope(
        options: CanonDocumentOptions,
        resolvedGraphName: string,
        storedEdges: MJGraphEdgeEntity[],
        user?: UserInfo,
    ): CanonSubgraphScope | null {
        const seedRefs: GraphNodeRef[] = [];
        if (options.Subgraph) {
            for (const node of options.Subgraph.Nodes) {
                seedRefs.push({ EntityName: node.EntityName, RecordID: node.RecordID });
            }
        } else if (options.Question?.trim()) {
            const extracted = this.extractQuestionSeeds(
                options.Question,
                user ?? ({} as UserInfo),
                resolvedGraphName,
            );
            seedRefs.push(...extracted);
        } else {
            return null;
        }

        const scope: CanonSubgraphScope = {
            ConceptIDs: new UUIDSet(),
            EntityNamesLower: new Set<string>(),
            AbvIDs: new UUIDSet(),
            QueryIDs: new UUIDSet(),
        };

        for (const ref of seedRefs) {
            this.addNodeRefToScope(ref.EntityName, ref.RecordID, scope);
        }

        // Expand 1 hop across stored edges so concepts linked to matched entities/ABVs/queries
        // (and vice versa, including precedence rules) are captured in the collapsed document.
        const initialConceptIDs = new UUIDSet(scope.ConceptIDs);
        const initialAbvIDs = new UUIDSet(scope.AbvIDs);
        const initialQueryIDs = new UUIDSet(scope.QueryIDs);
        const initialEntities = new Set(scope.EntityNamesLower);

        for (const edge of storedEdges) {
            const srcDisplay = this.resolveStoredEndpointDisplay(
                edge.SourceEntityID,
                edge.SourceEntity,
                edge.SourceRecordID,
                user,
            );
            const tgtDisplay = this.resolveStoredEndpointDisplay(
                edge.TargetEntityID,
                edge.TargetEntity,
                edge.TargetRecordID,
                user,
            );
            const srcMatches = this.nodeMatchesInitialScope(
                edge.SourceEntity || this.metadataProvider?.EntityByID(edge.SourceEntityID)?.Name || '',
                edge.SourceRecordID,
                srcDisplay?.OwningEntityName ?? null,
                initialConceptIDs,
                initialEntities,
                initialAbvIDs,
                initialQueryIDs,
            );
            const tgtMatches = this.nodeMatchesInitialScope(
                edge.TargetEntity || this.metadataProvider?.EntityByID(edge.TargetEntityID)?.Name || '',
                edge.TargetRecordID,
                tgtDisplay?.OwningEntityName ?? null,
                initialConceptIDs,
                initialEntities,
                initialAbvIDs,
                initialQueryIDs,
            );

            if (srcMatches || tgtMatches) {
                const srcEntity =
                    edge.SourceEntity ||
                    this.metadataProvider?.EntityByID(edge.SourceEntityID)?.Name ||
                    '';
                const tgtEntity =
                    edge.TargetEntity ||
                    this.metadataProvider?.EntityByID(edge.TargetEntityID)?.Name ||
                    '';
                this.addNodeRefToScope(srcEntity, edge.SourceRecordID, scope);
                this.addNodeRefToScope(tgtEntity, edge.TargetRecordID, scope);
            }
        }

        return scope;
    }

    private addNodeRefToScope(
        entityName: string,
        recordID: string,
        scope: CanonSubgraphScope,
    ): void {
        const lower = entityName.trim().toLowerCase();
        const md = this.metadataProvider;

        if (lower === ENTITY_GRAPH_CONCEPTS.toLowerCase()) {
            scope.ConceptIDs.Add(recordID);
            return;
        }
        if (lower === ENTITY_ENTITIES.toLowerCase()) {
            const ent = md?.EntityByID(recordID);
            if (ent) {
                scope.EntityNamesLower.add(ent.Name.trim().toLowerCase());
            }
            return;
        }
        if (lower === 'mj: entity fields') {
            for (const ent of md?.Entities ?? []) {
                if ((ent.Fields ?? []).some(f => UUIDsEqual(f.ID, recordID))) {
                    scope.EntityNamesLower.add(ent.Name.trim().toLowerCase());
                    return;
                }
            }
            return;
        }
        if (lower === ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase()) {
            scope.AbvIDs.Add(recordID);
            for (const ent of md?.Entities ?? []) {
                if ((ent.AlternateBaseViews ?? []).some(v => UUIDsEqual(v.ID, recordID))) {
                    scope.EntityNamesLower.add(ent.Name.trim().toLowerCase());
                    return;
                }
            }
            return;
        }
        if (lower === ENTITY_QUERIES.toLowerCase()) {
            scope.QueryIDs.Add(recordID);
        }
    }

    private nodeMatchesInitialScope(
        entityName: string,
        recordID: string,
        owningEntityName: string | null,
        conceptIDs: UUIDSet,
        entityNamesLower: ReadonlySet<string>,
        abvIDs: UUIDSet,
        queryIDs: UUIDSet,
    ): boolean {
        const lower = entityName.trim().toLowerCase();
        if (lower === ENTITY_GRAPH_CONCEPTS.toLowerCase() && conceptIDs.Has(recordID)) {
            return true;
        }
        if (lower === ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase() && abvIDs.Has(recordID)) {
            return true;
        }
        if (lower === ENTITY_QUERIES.toLowerCase() && queryIDs.Has(recordID)) {
            return true;
        }
        if (owningEntityName && entityNamesLower.has(owningEntityName.trim().toLowerCase())) {
            return true;
        }
        return false;
    }

    private renderPrecedenceSection(
        storedEdges: MJGraphEdgeEntity[],
        entityFilterSet: ReadonlySet<string> | null,
        subgraphScope: CanonSubgraphScope | null,
        user?: UserInfo,
    ): string | null {
        const graphEngine = GraphEngine.Instance;
        const edgeTypesByID = IndexByUUID(graphEngine.EdgeTypes);

        const precedenceEdges = storedEdges.filter(e => {
            const etName = (edgeTypesByID.Get(e.EdgeTypeID)?.Name ?? e.EdgeType ?? '')
                .trim()
                .toLowerCase();
            return etName === 'preferred over' || etName === 'supersedes' || etName === 'contradicts';
        });

        if (precedenceEdges.length === 0) {
            return null;
        }

        const lines: string[] = ['## 1. Precedence & Deprecation Rules'];
        for (const edge of precedenceEdges) {
            const srcDisplay = this.resolveStoredEndpointDisplay(
                edge.SourceEntityID,
                edge.SourceEntity,
                edge.SourceRecordID,
                user,
            );
            const tgtDisplay = this.resolveStoredEndpointDisplay(
                edge.TargetEntityID,
                edge.TargetEntity,
                edge.TargetRecordID,
                user,
            );
            if (!srcDisplay || !tgtDisplay) {
                continue;
            }
            if (
                entityFilterSet &&
                !this.endpointMatchesEntityFilter(srcDisplay.OwningEntityName, entityFilterSet) &&
                !this.endpointMatchesEntityFilter(tgtDisplay.OwningEntityName, entityFilterSet)
            ) {
                continue;
            }
            if (subgraphScope) {
                const srcInScope = this.nodeMatchesInitialScope(
                    edge.SourceEntity || this.metadataProvider?.EntityByID(edge.SourceEntityID)?.Name || '',
                    edge.SourceRecordID,
                    srcDisplay.OwningEntityName,
                    subgraphScope.ConceptIDs,
                    subgraphScope.EntityNamesLower,
                    subgraphScope.AbvIDs,
                    subgraphScope.QueryIDs,
                );
                const tgtInScope = this.nodeMatchesInitialScope(
                    edge.TargetEntity || this.metadataProvider?.EntityByID(edge.TargetEntityID)?.Name || '',
                    edge.TargetRecordID,
                    tgtDisplay.OwningEntityName,
                    subgraphScope.ConceptIDs,
                    subgraphScope.EntityNamesLower,
                    subgraphScope.AbvIDs,
                    subgraphScope.QueryIDs,
                );
                if (!srcInScope && !tgtInScope) {
                    continue;
                }
            }
            const etName = (edgeTypesByID.Get(edge.EdgeTypeID)?.Name ?? edge.EdgeType ?? 'Preferred Over').toUpperCase();
            const reason = edge.Description?.trim() ? `\n  - Reason: ${edge.Description.trim()}` : '';
            lines.push(`- **${srcDisplay.Label}** is ${etName} **${tgtDisplay.Label}**${reason}`);
        }

        return lines.length > 1 ? lines.join('\n') : null;
    }

    private renderConceptsSection(
        graphID: string | undefined,
        storedEdges: MJGraphEdgeEntity[],
        conceptTypeFilterSet: ReadonlySet<string> | null,
        entityFilterSet: ReadonlySet<string> | null,
        subgraphScope: CanonSubgraphScope | null,
        includeProposed: boolean,
        includeSpecs: boolean,
        user?: UserInfo,
    ): string | null {
        const graphEngine = GraphEngine.Instance;
        const conceptTypesByID = IndexByUUID(graphEngine.ConceptTypes);
        const authorityTiersByID = IndexByUUID(graphEngine.AuthorityTiers);
        const edgeTypesByID = IndexByUUID(graphEngine.EdgeTypes);
        const conceptsByID = IndexByUUID(graphEngine.Concepts);

        const candidateConcepts = graphEngine.Concepts.filter(c => {
            if (graphID && !UUIDsEqual(c.GraphID, graphID)) {
                return false;
            }
            const allowedStatus =
                c.Status === 'Approved' ||
                (includeProposed && (c.Status === 'Proposed' || c.Status === 'Draft'));
            if (!allowedStatus) {
                return false;
            }
            if (subgraphScope && !subgraphScope.ConceptIDs.Has(c.ID)) {
                return false;
            }
            const cType = (conceptTypesByID.Get(c.ConceptTypeID)?.Name ?? c.ConceptType ?? '').trim();
            if (conceptTypeFilterSet && !conceptTypeFilterSet.has(cType.toLowerCase())) {
                return false;
            }
            return true;
        });

        if (candidateConcepts.length === 0) {
            return null;
        }

        // Sort by AuthorityTier Rank DESC, then ConceptType Rank ASC, then Name ASC
        candidateConcepts.sort((a, b) => {
            const tierA = a.AuthorityTierID ? (authorityTiersByID.Get(a.AuthorityTierID)?.Rank ?? 20) : 20;
            const tierB = b.AuthorityTierID ? (authorityTiersByID.Get(b.AuthorityTierID)?.Rank ?? 20) : 20;
            if (tierB !== tierA) {
                return tierB - tierA;
            }
            const typeRankA = conceptTypesByID.Get(a.ConceptTypeID)?.Rank ?? 100;
            const typeRankB = conceptTypesByID.Get(b.ConceptTypeID)?.Rank ?? 100;
            if (typeRankA !== typeRankB) {
                return typeRankA - typeRankB;
            }
            return a.Name.localeCompare(b.Name);
        });

        const blocks: string[] = ['## 2. Domain Concepts & Definitions'];
        for (const concept of candidateConcepts) {
            const block = this.renderSingleConceptBlock(
                concept,
                storedEdges,
                conceptsByID,
                conceptTypesByID,
                authorityTiersByID,
                edgeTypesByID,
                entityFilterSet,
                includeSpecs,
                user,
            );
            if (block) {
                blocks.push(block);
            }
        }

        return blocks.length > 1 ? blocks.join('\n\n') : null;
    }

    private renderSingleConceptBlock(
        concept: MJGraphConceptEntity,
        storedEdges: MJGraphEdgeEntity[],
        conceptsByID: ReturnType<typeof IndexByUUID<MJGraphConceptEntity>>,
        conceptTypesByID: ReturnType<typeof IndexByUUID<typeof GraphEngine.Instance.ConceptTypes[number]>>,
        authorityTiersByID: ReturnType<typeof IndexByUUID<typeof GraphEngine.Instance.AuthorityTiers[number]>>,
        edgeTypesByID: ReturnType<typeof IndexByUUID<typeof GraphEngine.Instance.EdgeTypes[number]>>,
        entityFilterSet: ReadonlySet<string> | null,
        includeSpecs: boolean,
        user?: UserInfo,
    ): string | null {
        const incidentEdges = storedEdges.filter(
            e =>
                UUIDsEqual(e.SourceRecordID, concept.ID) ||
                UUIDsEqual(e.TargetRecordID, concept.ID),
        );

        const implementationLines: string[] = [];
        let matchesEntityFilter = !entityFilterSet;
        const broaderNames: string[] = [];
        if (concept.ParentID) {
            const parent = conceptsByID.Get(concept.ParentID);
            if (parent) {
                broaderNames.push(parent.Name);
            }
        }

        for (const edge of incidentEdges) {
            const etName = (edgeTypesByID.Get(edge.EdgeTypeID)?.Name ?? edge.EdgeType ?? '').trim();
            const etLower = etName.toLowerCase();

            if (etLower === 'broader than' && UUIDsEqual(edge.TargetRecordID, concept.ID)) {
                const broader = conceptsByID.Get(edge.SourceRecordID);
                if (broader && !broaderNames.includes(broader.Name)) {
                    broaderNames.push(broader.Name);
                }
                continue;
            }

            const isConceptTarget = UUIDsEqual(edge.TargetRecordID, concept.ID);
            const otherEntityID = isConceptTarget ? edge.SourceEntityID : edge.TargetEntityID;
            const otherEntityName = isConceptTarget ? edge.SourceEntity : edge.TargetEntity;
            const otherRecordID = isConceptTarget ? edge.SourceRecordID : edge.TargetRecordID;

            const resolved = this.resolveStoredEndpointDisplay(
                otherEntityID,
                otherEntityName,
                otherRecordID,
                user,
            );
            if (!resolved) {
                continue;
            }
            if (
                entityFilterSet &&
                this.endpointMatchesEntityFilter(resolved.OwningEntityName, entityFilterSet)
            ) {
                matchesEntityFilter = true;
            }

            const detail = edge.Description?.trim() ? ` — ${edge.Description.trim()}` : '';
            implementationLines.push(`  - **${etName}**: ${resolved.KindLabel} \`${resolved.Label}\`${detail}`);
        }

        if (!matchesEntityFilter) {
            return null;
        }

        const cTypeName = conceptTypesByID.Get(concept.ConceptTypeID)?.Name ?? concept.ConceptType ?? 'Term';
        const tierName =
            (concept.AuthorityTierID ? authorityTiersByID.Get(concept.AuthorityTierID)?.Name : null) ??
            concept.AuthorityTier;
        const tierSuffix = tierName ? ` — Authority: ${tierName}` : '';

        const lines: string[] = [`### ${concept.Name} (${cTypeName})${tierSuffix}`];
        if (broaderNames.length > 0) {
            lines.push(`- **Broader Concept:** ${broaderNames.join(', ')}`);
        }
        if (concept.Synonyms?.trim()) {
            try {
                const parsed: unknown = JSON.parse(concept.Synonyms);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    lines.push(`- **Synonyms:** ${parsed.join(', ')}`);
                }
            } catch {
                // Ignore malformed JSON
            }
        }
        lines.push(`- **Definition:** ${concept.Description}`);
        if (includeSpecs && concept.Specification?.trim()) {
            lines.push(`- **Specification:** ${concept.Specification.trim()}`);
        }
        if (implementationLines.length > 0) {
            lines.push(`- **Canonical Implementation:**`);
            lines.push(...implementationLines);
        }

        return lines.join('\n');
    }

    private renderAlternateBaseViewsSection(
        storedEdges: MJGraphEdgeEntity[],
        entityFilterSet: ReadonlySet<string> | null,
        subgraphScope: CanonSubgraphScope | null,
        user?: UserInfo,
    ): string | null {
        const md = this.metadataProvider;
        const graphEngine = GraphEngine.Instance;
        const conceptsByID = IndexByUUID(graphEngine.Concepts);
        const edgeTypesByID = IndexByUUID(graphEngine.EdgeTypes);

        const rows: string[] = [];
        for (const entity of md?.Entities ?? []) {
            if (entityFilterSet && !entityFilterSet.has(entity.Name.trim().toLowerCase())) {
                continue;
            }
            if (user && entity.Permissions?.length > 0 && !entity.GetUserPermisions(user)?.CanRead) {
                continue;
            }
            for (const abv of entity.AlternateBaseViews ?? []) {
                if (abv.Status !== 'Active') {
                    continue;
                }
                if (
                    subgraphScope &&
                    !subgraphScope.AbvIDs.Has(abv.ID) &&
                    !subgraphScope.EntityNamesLower.has(entity.Name.trim().toLowerCase())
                ) {
                    continue;
                }
                const definedConcepts = storedEdges
                    .filter(e => {
                        const etName = (edgeTypesByID.Get(e.EdgeTypeID)?.Name ?? e.EdgeType ?? '').toLowerCase();
                        return etName === 'defines' && UUIDsEqual(e.SourceRecordID, abv.ID);
                    })
                    .map(e => conceptsByID.Get(e.TargetRecordID)?.Name)
                    .filter((n): n is string => !!n);

                const parentSuffix = abv.Parent ? ` (subsets \`${abv.Parent}\`)` : '';
                const conceptsText = definedConcepts.length > 0 ? definedConcepts.join(', ') : '—';
                rows.push(
                    `| \`${entity.Name}\` | \`${abv.Name}\`${parentSuffix} | \`[${abv.EffectiveSchemaName}].[${abv.ViewName}]\` | ${conceptsText} | ${abv.Description || ''} |`,
                );
            }
        }

        if (rows.length === 0) {
            return null;
        }

        return [
            '## 3. Canonical Entity Subsets (Alternate Base Views)',
            '| Entity | Alternate Base View | SQL View | Defines Concept | Description |',
            '|---|---|---|---|---|',
            ...rows,
        ].join('\n');
    }

    private renderGovernedQueriesSection(
        storedEdges: MJGraphEdgeEntity[],
        entityFilterSet: ReadonlySet<string> | null,
        subgraphScope: CanonSubgraphScope | null,
        user?: UserInfo,
    ): string | null {
        const graphEngine = GraphEngine.Instance;
        const conceptsByID = IndexByUUID(graphEngine.Concepts);
        const edgeTypesByID = IndexByUUID(graphEngine.EdgeTypes);
        const queries = QueryEngine.Instance.Queries ?? [];
        const queriesByID = IndexByUUID(queries);
        const queryEntities = QueryEngine.Instance.QueryEntities ?? [];
        const dependencies = QueryEngine.Instance.Dependencies ?? [];

        const lines: string[] = ['## 4. Governed Ground-Truth Queries'];
        for (const query of queries) {
            if (query.Status !== 'Approved') {
                continue;
            }
            if (user && !query.UserCanRun(user).canRun) {
                continue;
            }

            const qEntities = queryEntities.filter(qe => UUIDsEqual(qe.QueryID, query.ID));
            if (
                entityFilterSet &&
                !qEntities.some(qe => entityFilterSet.has((qe.Entity ?? '').trim().toLowerCase()))
            ) {
                continue;
            }
            if (
                subgraphScope &&
                !subgraphScope.QueryIDs.Has(query.ID) &&
                !qEntities.some(qe =>
                    subgraphScope.EntityNamesLower.has((qe.Entity ?? '').trim().toLowerCase()),
                )
            ) {
                continue;
            }

            const measuredConcepts = storedEdges
                .filter(e => {
                    const etName = (edgeTypesByID.Get(e.EdgeTypeID)?.Name ?? e.EdgeType ?? '').toLowerCase();
                    return (
                        (etName === 'measures' || etName === 'defines') &&
                        UUIDsEqual(e.SourceRecordID, query.ID)
                    );
                })
                .map(e => {
                    const etName = edgeTypesByID.Get(e.EdgeTypeID)?.Name ?? e.EdgeType ?? 'Measures';
                    const cName = conceptsByID.Get(e.TargetRecordID)?.Name ?? e.TargetRecordID;
                    return `${etName}: ${cName}`;
                });

            const readTargets = qEntities.map(qe =>
                qe.AlternateBaseView
                    ? `${qe.Entity}.${qe.AlternateBaseView}`
                    : qe.Entity || qe.EntityID,
            );
            const composedTargets = dependencies
                .filter(d => UUIDsEqual(d.QueryID, query.ID))
                .map(d => queriesByID.Get(d.DependsOnQueryID)?.Name ?? d.DependsOnQuery ?? d.ReferencePath);

            const fullPath = query.CategoryPath ? `${query.CategoryPath}/${query.Name}` : query.Name;
            const desc = query.Description?.trim() ? ` — ${query.Description.trim()}` : '';
            lines.push(`- **\`${fullPath}\`**${desc}`);
            if (measuredConcepts.length > 0) {
                lines.push(`  - **Canon Role:** ${measuredConcepts.join('; ')}`);
            }
            if (readTargets.length > 0) {
                lines.push(`  - **Reads:** ${readTargets.map(r => `\`${r}\``).join(', ')}`);
            }
            if (composedTargets.length > 0) {
                lines.push(`  - **Composes:** ${composedTargets.map(c => `\`${c}\``).join(', ')}`);
            }
        }

        return lines.length > 1 ? lines.join('\n') : null;
    }

    private resolveStoredEndpointDisplay(
        entityID: string,
        entityNameFallback: string | undefined,
        recordID: string,
        user?: UserInfo,
    ): { KindLabel: string; Label: string; OwningEntityName: string | null } | null {
        const md = this.metadataProvider;
        const entityName = (entityNameFallback || md?.EntityByID(entityID)?.Name || '').trim();
        const lower = entityName.toLowerCase();

        if (lower === ENTITY_ENTITIES.toLowerCase()) {
            const target = md?.EntityByID(recordID);
            if (!target) return null;
            if (user && target.Permissions?.length > 0 && !target.GetUserPermisions(user)?.CanRead) {
                return null;
            }
            return { KindLabel: 'Entity', Label: target.Name, OwningEntityName: target.Name };
        }

        if (lower === 'mj: entity fields') {
            for (const ent of md?.Entities ?? []) {
                const field = (ent.Fields ?? []).find(f => UUIDsEqual(f.ID, recordID));
                if (field) {
                    if (user && ent.Permissions?.length > 0 && !ent.GetUserPermisions(user)?.CanRead) {
                        return null;
                    }
                    return {
                        KindLabel: 'Field',
                        Label: `${ent.Name}.${field.Name}`,
                        OwningEntityName: ent.Name,
                    };
                }
            }
            return null;
        }

        if (lower === ENTITY_ALTERNATE_BASE_VIEWS.toLowerCase()) {
            for (const ent of md?.Entities ?? []) {
                const abv = (ent.AlternateBaseViews ?? []).find(v => UUIDsEqual(v.ID, recordID));
                if (abv) {
                    if (!abv.IsUsable) return null;
                    if (user && ent.Permissions?.length > 0 && !ent.GetUserPermisions(user)?.CanRead) {
                        return null;
                    }
                    return {
                        KindLabel: 'Alternate Base View',
                        Label: `${ent.Name}.${abv.Name} (${abv.ViewName})`,
                        OwningEntityName: ent.Name,
                    };
                }
            }
            return null;
        }

        if (lower === ENTITY_QUERIES.toLowerCase()) {
            const q = (QueryEngine.Instance.Queries ?? []).find(item => UUIDsEqual(item.ID, recordID));
            if (!q || q.Status !== 'Approved') return null;
            if (user && !q.UserCanRun(user).canRun) return null;
            const path = q.CategoryPath ? `${q.CategoryPath}/${q.Name}` : q.Name;
            return { KindLabel: 'Query', Label: path, OwningEntityName: null };
        }

        if (lower === ENTITY_GRAPH_CONCEPTS.toLowerCase()) {
            const c = GraphEngine.Instance.Concepts.find(item => UUIDsEqual(item.ID, recordID));
            if (!c) return null;
            return { KindLabel: 'Concept', Label: c.Name, OwningEntityName: null };
        }

        return {
            KindLabel: entityName || 'Record',
            Label: `${entityName}:${recordID}`,
            OwningEntityName: entityName || null,
        };
    }

    private endpointMatchesEntityFilter(
        owningEntityName: string | null,
        entityFilterSet: ReadonlySet<string>,
    ): boolean {
        if (!owningEntityName) {
            return false;
        }
        return entityFilterSet.has(owningEntityName.trim().toLowerCase());
    }

    private get metadataProvider(): IMetadataProvider {
        return Metadata.Provider;
    }
}
