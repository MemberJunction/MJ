/**
 * @fileoverview Tag search provider using TagEngineBase and RunView.
 *
 * Matches search queries against the taxonomy graph (tags and synonyms)
 * and retrieves the associated records from MJ: Tagged Items (and
 * MJ: Content Item Tags), weighted by the tag match confidence multiplied
 * by the tagged item's continuous relevance weight (0.0 to 1.0).
 *
 * @module @memberjunction/search-engine
 */

import {
    IMetadataProvider,
    LogError,
    LogStatus,
    RunView,
    UserInfo
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJTaggedItemEntity, MJContentItemTagEntity, MJTagEntity } from '@memberjunction/core-entities';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import {
    SearchFilters,
    SearchResultItem,
    SearchResultType,
    SearchSource,
    ScopeConstraints
} from './search.types';

/**
 * Internal interface representing a matched tag and its match confidence.
 */
interface MatchedTagInfo {
    tag: MJTagEntity;
    confidence: number;
    matchedTerm: string;
}

/**
 * Internal interface representing an aggregated candidate record.
 */
interface CandidateRecord {
    id: string;
    entityName: string;
    recordID: string;
    bestScore: number;
    tags: Array<{ name: string; weight: number }>;
}

/**
 * Taxonomy entity names that must never be surfaced as direct search results.
 */
const TAXONOMY_ENTITIES = new Set([
    'mj: tags',
    'mj: tagged items',
    'mj: tag synonyms',
    'mj: tag scopes',
    'mj: tag co-occurrences',
]);

/**
 * Escape special regex characters in a query token.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Provides tag-weighted record search.
 * Matches search terms against taxonomy tags and synonyms, then retrieves
 * records linked via MJ: Tagged Items and MJ: Content Item Tags.
 */
@RegisterClass(BaseSearchProvider, 'TagSearchProvider')
export class TagSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'tag';

    /**
     * Minimum query length to evaluate for tag matching.
     */
    private static readonly MIN_TERM_LENGTH = 2;

    /**
     * Initialize the provider and ensure TagEngineBase is loaded.
     */
    public override async Initialize(config: SearchProviderConfig, contextUser: UserInfo): Promise<void> {
        await super.Initialize(config, contextUser);
        try {
            await TagEngineBase.Instance.EnsureLoaded(contextUser, this.Provider);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`TagSearchProvider: Failed to initialize TagEngineBase: ${msg}`);
        }
    }

    /**
     * Check whether the provider is operational by verifying tag taxonomy availability.
     */
    public override async CheckAvailability(contextUser: UserInfo): Promise<void> {
        try {
            await TagEngineBase.Instance.EnsureLoaded(contextUser, this.Provider);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`TagSearchProvider: CheckAvailability failed: ${msg}`);
        }
    }

    /**
     * Whether this provider is available.
     * Available when TagEngineBase has at least one tag configured.
     */
    public override IsAvailable(): boolean {
        return TagEngineBase.Instance.Tags.length > 0;
    }

    /**
     * Execute a tag-weighted search.
     *
     * 1. Matches query terms to active tags in the taxonomy graph (including synonyms).
     * 2. If no tags match, immediately returns [] (zero database overhead).
     * 3. Retrieves records linked to matched tags via `MJ: Tagged Items` (and `MJ: Content Item Tags`).
     * 4. Multiplies tag match confidence by tagged item weight to produce final relevance score.
     *
     * @param query - The search query text
     * @param topK - Maximum number of results to return
     * @param filters - Optional filters (e.g. EntityNames to restrict scope)
     * @param contextUser - The user performing the search
     * @param scopeConstraints - Optional per-scope constraints
     */
    public async Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints
    ): Promise<SearchResultItem[]> {
        const trimmed = (query ?? '').trim();
        if (trimmed.length < TagSearchProvider.MIN_TERM_LENGTH || topK <= 0) {
            return [];
        }

        try {
            // Honor per-provider query transform if supplied
            const rawQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;
            const effectiveQuery = rawQuery.trim();
            if (effectiveQuery.length < TagSearchProvider.MIN_TERM_LENGTH) {
                return [];
            }

            // Ensure TagEngineBase is loaded
            await TagEngineBase.Instance.EnsureLoaded(contextUser, this.Provider);

            // Step 1: Match query against taxonomy tags and synonyms
            const matchedTags = this.matchQueryToTags(effectiveQuery);
            if (matchedTags.length === 0) {
                return [];
            }

            // Step 2: Determine allowed searchable entities
            const md = this.Provider;
            const allowedEntityNames = this.resolveAllowedEntities(md, filters, scopeConstraints);
            if (allowedEntityNames.size === 0) {
                return [];
            }

            // Step 3: Retrieve tagged records from MJ: Tagged Items and MJ: Content Item Tags
            const candidateMap = new Map<string, CandidateRecord>();
            await Promise.all([
                this.searchTaggedItems(matchedTags, allowedEntityNames, topK, contextUser, candidateMap),
                this.searchContentItemTags(matchedTags, allowedEntityNames, topK, contextUser, candidateMap)
            ]);

            if (candidateMap.size === 0) {
                return [];
            }

            // Step 4: Convert candidate records to SearchResultItems
            const results: SearchResultItem[] = [];
            for (const candidate of candidateMap.values()) {
                if (candidate.bestScore <= 0 || !candidate.recordID) {
                    continue;
                }

                const entityInfo = md.EntityByName(candidate.entityName);
                const tagNames = candidate.tags.map(t => t.name);
                const snippet = candidate.tags.length === 1
                    ? `Tagged with "${candidate.tags[0].name}" (${Math.round(candidate.tags[0].weight * 100)}% relevance)`
                    : `Tagged with ` + candidate.tags.map(t => `"${t.name}" (${Math.round(t.weight * 100)}%)`).join(', ');

                results.push({
                    ID: candidate.recordID,
                    EntityName: candidate.entityName,
                    RecordID: candidate.recordID,
                    SourceType: 'tag',
                    ResultType: 'entity-record' as SearchResultType,
                    Title: `${candidate.entityName} Record`,
                    Snippet: snippet,
                    Score: candidate.bestScore,
                    ScoreBreakdown: {
                        Tag: candidate.bestScore
                    },
                    Tags: tagNames,
                    EntityIcon: entityInfo?.Icon ?? undefined,
                    MatchedAt: new Date()
                });
            }

            // Sort by score descending and return topK
            results.sort((a, b) => b.Score - a.Score);
            return results.slice(0, topK);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`TagSearchProvider: Search failed: ${msg}`);
            return [];
        }
    }

    /**
     * Matches the search query text against active tags and tag synonyms.
     * Returns matching tags sorted by confidence descending.
     */
    private matchQueryToTags(query: string): MatchedTagInfo[] {
        const queryLower = query.toLowerCase();
        const words = queryLower.split(/\s+/).filter(w => w.length >= 2);
        const matched = new Map<string, MatchedTagInfo>();

        const addMatch = (tag: MJTagEntity, confidence: number, term: string) => {
            if (tag.Status !== 'Active') return;
            const existing = matched.get(tag.ID);
            if (!existing || confidence > existing.confidence) {
                matched.set(tag.ID, { tag, confidence, matchedTerm: term });
            }
        };

        const allTags = TagEngineBase.Instance.Tags;

        // Tier 1: Check exact matches and word matches on Tag Name and DisplayName
        for (const tag of allTags) {
            if (tag.Status !== 'Active') continue;

            const nameLower = tag.Name.trim().toLowerCase();
            const displayLower = (tag.DisplayName ?? '').trim().toLowerCase();

            // Exact match on Name or DisplayName
            if (nameLower === queryLower || displayLower === queryLower) {
                addMatch(tag, 1.0, tag.DisplayName || tag.Name);
                continue;
            }

            // Multi-word / token match: tag name equals one of the query words
            if (words.includes(nameLower) || (displayLower && words.includes(displayLower))) {
                addMatch(tag, 0.90, tag.DisplayName || tag.Name);
                continue;
            }

            // Query contains tag name as a full word boundary
            if (nameLower.length >= 3) {
                const regex = new RegExp(`\\b${escapeRegex(nameLower)}\\b`, 'i');
                if (regex.test(queryLower)) {
                    addMatch(tag, 0.90, tag.DisplayName || tag.Name);
                    continue;
                }
            }

            // Tag name contains query as a full word boundary (e.g. tag "Cheddar Cheese", query "Cheddar")
            if (queryLower.length >= 3) {
                const regex = new RegExp(`\\b${escapeRegex(queryLower)}\\b`, 'i');
                if (regex.test(nameLower) || (displayLower && regex.test(displayLower))) {
                    addMatch(tag, 0.85, tag.DisplayName || tag.Name);
                    continue;
                }
            }

            // Substring containment fallback (minimum 3 chars to prevent noise)
            if (queryLower.length >= 3 && nameLower.length >= 3) {
                if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
                    addMatch(tag, 0.75, tag.DisplayName || tag.Name);
                    continue;
                }
                if (displayLower && (displayLower.includes(queryLower) || queryLower.includes(displayLower))) {
                    addMatch(tag, 0.75, tag.DisplayName || tag.Name);
                    continue;
                }
            }
        }

        // Tier 2: Check synonyms
        const allSynonyms = TagEngineBase.Instance.TagSynonyms;
        for (const syn of allSynonyms) {
            const synText = (syn.Synonym ?? '').trim().toLowerCase();
            if (!synText || !syn.TagID) continue;

            const tag = TagEngineBase.Instance.GetTagByID(syn.TagID);
            if (!tag || tag.Status !== 'Active') continue;

            if (synText === queryLower) {
                addMatch(tag, 1.0, syn.Synonym);
            } else if (words.includes(synText)) {
                addMatch(tag, 0.85, syn.Synonym);
            } else if (synText.length >= 3 && queryLower.length >= 3) {
                const regex = new RegExp(`\\b${escapeRegex(synText)}\\b`, 'i');
                if (regex.test(queryLower)) {
                    addMatch(tag, 0.85, syn.Synonym);
                }
            }
        }

        return Array.from(matched.values()).sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Resolves the set of entity names eligible to return records.
     * Respects AllowUserSearchAPI, taxonomy exclusions, and search filters.
     */
    private resolveAllowedEntities(
        md: IMetadataProvider,
        filters: SearchFilters | undefined,
        scopeConstraints?: ScopeConstraints
    ): Set<string> {
        let entities = md.Entities.filter(e => e.AllowUserSearchAPI && !TAXONOMY_ENTITIES.has(e.Name.toLowerCase()));

        if (scopeConstraints?.Entities && scopeConstraints.Entities.length > 0) {
            const scopedSet = new Set(scopeConstraints.Entities.map(e => e.EntityName.toLowerCase()));
            entities = entities.filter(e => scopedSet.has(e.Name.toLowerCase()));
        }

        if (filters?.EntityNames && filters.EntityNames.length > 0) {
            const filterSet = new Set(filters.EntityNames.map(n => n.toLowerCase()));
            entities = entities.filter(e => filterSet.has(e.Name.toLowerCase()));
        }

        return new Set(entities.map(e => e.Name.toLowerCase()));
    }

    /**
     * Queries MJ: Tagged Items for records associated with the matched tags.
     */
    private async searchTaggedItems(
        matchedTags: MatchedTagInfo[],
        allowedEntities: Set<string>,
        topK: number,
        contextUser: UserInfo,
        candidateMap: Map<string, CandidateRecord>
    ): Promise<void> {
        try {
            // Take top 10 matched tags to keep SQL IN-clause compact
            const topTags = matchedTags.slice(0, 10);
            const tagMap = new Map<string, MatchedTagInfo>();
            for (const t of topTags) {
                tagMap.set(t.tag.ID.toLowerCase(), t);
            }

            const tagIdList = topTags.map(t => `'${t.tag.ID}'`).join(',');
            let filterClause = `TagID IN (${tagIdList})`;

            // If a specific subset of entities was requested via filters, push down to SQL
            const md = this.Provider;
            if (allowedEntities.size < md.Entities.length) {
                const entityValues = Array.from(allowedEntities).map(name => {
                    const entity = md.EntityByName(name);
                    const actualName = entity ? entity.Name : name;
                    return `'${actualName.replace(/'/g, "''")}'`;
                }).join(',');
                if (entityValues.length > 0) {
                    filterClause += ` AND Entity IN (${entityValues})`;
                }
            }

            const rv = new RunView();
            const fetchLimit = Math.min(topK * 3, 100);
            const rvResult = await rv.RunView<MJTaggedItemEntity>({
                EntityName: 'MJ: Tagged Items',
                ExtraFilter: filterClause,
                OrderBy: 'Weight DESC',
                MaxRows: fetchLimit,
                ResultType: 'entity_object'
            }, contextUser);

            if (!rvResult.Success || !rvResult.Results) {
                if (!rvResult.Success) {
                    LogError(`TagSearchProvider: RunView failed on "MJ: Tagged Items": ${rvResult.ErrorMessage}`);
                }
                return;
            }

            for (const item of rvResult.Results) {
                const entityName = item.Entity;
                const recordID = item.RecordID;
                if (!entityName || !recordID || !allowedEntities.has(entityName.toLowerCase())) {
                    continue;
                }

                const matchedTag = tagMap.get(item.TagID.toLowerCase());
                const tagConfidence = matchedTag?.confidence ?? 0.85;
                const tagName = matchedTag?.tag.DisplayName || matchedTag?.tag.Name || item.Tag || 'Tag';
                const itemWeight = item.Weight != null ? Number(item.Weight) : 1.0;
                const score = Math.round(tagConfidence * itemWeight * 100) / 100;

                const key = `${entityName}::${recordID}`;
                const existing = candidateMap.get(key);
                if (!existing) {
                    candidateMap.set(key, {
                        id: recordID,
                        entityName,
                        recordID,
                        bestScore: score,
                        tags: [{ name: tagName, weight: itemWeight }]
                    });
                } else {
                    existing.bestScore = Math.max(existing.bestScore, score);
                    if (!existing.tags.some(t => t.name.toLowerCase() === tagName.toLowerCase())) {
                        existing.tags.push({ name: tagName, weight: itemWeight });
                    }
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`TagSearchProvider: searchTaggedItems error: ${msg}`);
        }
    }

    /**
     * Queries MJ: Content Item Tags if MJ: Content Items is an allowed entity.
     */
    private async searchContentItemTags(
        matchedTags: MatchedTagInfo[],
        allowedEntities: Set<string>,
        topK: number,
        contextUser: UserInfo,
        candidateMap: Map<string, CandidateRecord>
    ): Promise<void> {
        if (!allowedEntities.has('mj: content items')) {
            return;
        }

        try {
            const topTags = matchedTags.slice(0, 10);
            const tagLookup = new Map<string, MatchedTagInfo>();
            const tagNames: string[] = [];

            for (const t of topTags) {
                const n1 = t.tag.Name.trim();
                const n2 = (t.tag.DisplayName ?? '').trim();
                if (n1) {
                    tagNames.push(`'${n1.replace(/'/g, "''")}'`);
                    tagLookup.set(n1.toLowerCase(), t);
                }
                if (n2 && n2.toLowerCase() !== n1.toLowerCase()) {
                    tagNames.push(`'${n2.replace(/'/g, "''")}'`);
                    tagLookup.set(n2.toLowerCase(), t);
                }
            }

            if (tagNames.length === 0) return;

            const rv = new RunView();
            const fetchLimit = Math.min(topK * 3, 100);
            const rvResult = await rv.RunView<MJContentItemTagEntity>({
                EntityName: 'MJ: Content Item Tags',
                ExtraFilter: `Tag IN (${tagNames.join(',')})`,
                OrderBy: 'Weight DESC',
                MaxRows: fetchLimit,
                ResultType: 'entity_object'
            }, contextUser);

            if (!rvResult.Success || !rvResult.Results) {
                return;
            }

            for (const item of rvResult.Results) {
                const recordID = item.ItemID;
                if (!recordID) continue;

                const itemTag = item.Tag?.trim() ?? '';
                const matchedTag = tagLookup.get(itemTag.toLowerCase());
                const tagConfidence = matchedTag?.confidence ?? 1.0;
                const itemWeight = item.Weight != null ? Number(item.Weight) : 1.0;
                const score = Math.round(tagConfidence * itemWeight * 100) / 100;
                const entityName = 'MJ: Content Items';

                const key = `${entityName}::${recordID}`;
                const existing = candidateMap.get(key);
                if (!existing) {
                    candidateMap.set(key, {
                        id: recordID,
                        entityName,
                        recordID,
                        bestScore: score,
                        tags: [{ name: itemTag, weight: itemWeight }]
                    });
                } else {
                    existing.bestScore = Math.max(existing.bestScore, score);
                    if (!existing.tags.some(t => t.name.toLowerCase() === itemTag.toLowerCase())) {
                        existing.tags.push({ name: itemTag, weight: itemWeight });
                    }
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`TagSearchProvider: searchContentItemTags error: ${msg}`);
        }
    }
}
