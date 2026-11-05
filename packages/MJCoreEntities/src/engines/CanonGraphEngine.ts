import { BaseSingleton, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJGraphConceptEntity } from '../generated/entity_subclasses';
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

    private get metadataProvider(): IMetadataProvider {
        return Metadata.Provider;
    }
}
