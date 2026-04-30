import { BaseSingleton, NormalizeUUID } from '@memberjunction/global';
import { UserInfo, Metadata, RunView, LogError, LogStatus, IMetadataProvider } from '@memberjunction/core';
import { MJTagCoOccurrenceEntity, MJTagEntity } from '@memberjunction/core-entities';

/**
 * Result returned by {@link TagCoOccurrenceEngine.RecomputeCoOccurrence}.
 */
export interface CoOccurrenceComputeResult {
    /** Number of co-occurrence pairs that were created or updated */
    PairsUpdated: number;
    /** Number of stale co-occurrence pairs that were deleted (count dropped to 0) */
    PairsDeleted: number;
}

/**
 * A single co-occurrence pair with resolved tag names, suitable for display.
 */
export interface CoOccurrencePairDisplay {
    /** Display name of the first tag in the pair */
    TagAName: string;
    /** Display name of the second tag in the pair */
    TagBName: string;
    /** Number of items that share both tags */
    Count: number;
}

/**
 * A single co-occurring tag relative to a queried tag.
 */
export interface CoOccurrenceForTag {
    /** Display name of the co-occurring tag */
    TagName: string;
    /** Number of items that share the queried tag and this tag */
    Count: number;
}

/**
 * Lightweight record shape for ContentItemTag RunView results (simple mode).
 */
interface ContentItemTagRow {
    ItemID: string;
    TagID: string;
}

/**
 * Lightweight record shape for TaggedItem RunView results (simple mode).
 */
interface TaggedItemRow {
    TagID: string;
    EntityID: string;
    RecordID: string;
}

/**
 * Lightweight record shape for existing co-occurrence records (simple mode).
 */
interface CoOccurrenceRow {
    ID: string;
    TagAID: string;
    TagBID: string;
    CoOccurrenceCount: number;
}

/**
 * Lightweight record shape for co-occurrence records with resolved tag names (simple mode).
 */
interface CoOccurrenceWithNamesRow {
    TagAID: string;
    TagBID: string;
    TagA: string;
    TagB: string;
    CoOccurrenceCount: number;
}

/**
 * Engine that computes and queries tag co-occurrence data.
 *
 * Co-occurrence measures how often two tags appear together on the same item.
 * This data powers tag relationship analysis, "related tags" suggestions,
 * and word-cloud / network-graph visualizations.
 *
 * Pairs are stored in canonical order (TagAID < TagBID by normalized UUID)
 * so each pair is recorded exactly once.
 *
 * @example
 * ```typescript
 * const engine = TagCoOccurrenceEngine.Instance;
 *
 * // Full recompute
 * const result = await engine.RecomputeCoOccurrence(contextUser);
 * console.log(`Updated ${result.PairsUpdated}, deleted ${result.PairsDeleted}`);
 *
 * // Get top co-occurring pairs
 * const topPairs = await engine.GetTopPairs(10, contextUser);
 *
 * // Get tags that co-occur with a specific tag
 * const related = await engine.GetCoOccurrencesForTag(tagID, contextUser);
 * ```
 */
export class TagCoOccurrenceEngine extends BaseSingleton<TagCoOccurrenceEngine> {
    // Constructor must be public to satisfy BaseSingleton.getInstance() constraint
    public constructor() {
        super();
    }

    public static get Instance(): TagCoOccurrenceEngine {
        return TagCoOccurrenceEngine.getInstance<TagCoOccurrenceEngine>();
    }

    private _provider: IMetadataProvider | null = null;

    /**
     * Optional metadata provider override. Callers should set
     * `instance.Provider = providerToUse` before invoking engine methods
     * in multi-provider contexts. Falls back to the global default provider when unset.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? (new Metadata() as unknown as IMetadataProvider);
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Recompute all tag co-occurrence counts from scratch.
     *
     * This method scans both ContentItemTag records (where TagID is not null)
     * and TaggedItem records to build a complete picture of which tags appear
     * together on the same item/record. It then upserts co-occurrence counts
     * and removes stale pairs.
     *
     * @param contextUser - The user context for server-side data operations
     * @returns A summary of how many pairs were updated and how many were deleted
     */
    public async RecomputeCoOccurrence(contextUser: UserInfo): Promise<CoOccurrenceComputeResult> {
        const pairCounts = await this.computePairCounts(contextUser);
        const existingPairs = await this.loadExistingPairs(contextUser);
        const result = await this.upsertAndPrune(pairCounts, existingPairs, contextUser);

        LogStatus(
            `TagCoOccurrenceEngine: Recompute complete. ` +
            `Updated ${result.PairsUpdated} pairs, deleted ${result.PairsDeleted} stale pairs.`
        );

        return result;
    }

    /**
     * Get the top N co-occurring tag pairs by count, with resolved tag names.
     *
     * @param limit - Maximum number of pairs to return
     * @param contextUser - The user context for server-side data operations
     * @returns Array of pairs sorted by co-occurrence count descending
     */
    public async GetTopPairs(limit: number, contextUser: UserInfo): Promise<CoOccurrencePairDisplay[]> {
        const rv = new RunView();
        const result = await rv.RunView<CoOccurrenceWithNamesRow>({
            EntityName: 'MJ: Tag Co Occurrences',
            ExtraFilter: 'CoOccurrenceCount > 0',
            OrderBy: 'CoOccurrenceCount DESC',
            MaxRows: limit,
            Fields: ['TagAID', 'TagBID', 'TagA', 'TagB', 'CoOccurrenceCount'],
            ResultType: 'simple'
        }, contextUser);

        if (!result.Success) {
            LogError(`TagCoOccurrenceEngine: Failed to load top pairs: ${result.ErrorMessage}`);
            return [];
        }

        return result.Results.map(row => ({
            TagAName: row.TagA,
            TagBName: row.TagB,
            Count: row.CoOccurrenceCount,
        }));
    }

    /**
     * Get all tags that co-occur with a specific tag, sorted by count descending.
     *
     * This looks up all co-occurrence pairs where the given tag appears as
     * either TagA or TagB, and returns the "other" tag in each pair along with
     * the co-occurrence count.
     *
     * @param tagID - The tag ID to find co-occurrences for
     * @param contextUser - The user context for server-side data operations
     * @returns Array of co-occurring tags sorted by count descending
     */
    public async GetCoOccurrencesForTag(tagID: string, contextUser: UserInfo): Promise<CoOccurrenceForTag[]> {
        const normalizedTagID = NormalizeUUID(tagID);

        const rv = new RunView();
        const result = await rv.RunView<CoOccurrenceWithNamesRow>({
            EntityName: 'MJ: Tag Co Occurrences',
            ExtraFilter: `(TagAID='${normalizedTagID}' OR TagBID='${normalizedTagID}') AND CoOccurrenceCount > 0`,
            OrderBy: 'CoOccurrenceCount DESC',
            Fields: ['TagAID', 'TagBID', 'TagA', 'TagB', 'CoOccurrenceCount'],
            ResultType: 'simple'
        }, contextUser);

        if (!result.Success) {
            LogError(`TagCoOccurrenceEngine: Failed to load co-occurrences for tag ${tagID}: ${result.ErrorMessage}`);
            return [];
        }

        return result.Results.map(row => {
            const isTagA = NormalizeUUID(row.TagAID) === normalizedTagID;
            return {
                TagName: isTagA ? row.TagB : row.TagA,
                Count: row.CoOccurrenceCount,
            };
        });
    }

    // ========================================================================
    // Pair Counting
    // ========================================================================

    /**
     * Compute all tag pair counts from ContentItemTag and TaggedItem data.
     * Returns a Map keyed by canonical pair key ("normalizedTagAID|normalizedTagBID").
     */
    private async computePairCounts(contextUser: UserInfo): Promise<Map<string, number>> {
        const [contentItemGroups, taggedItemGroups] = await Promise.all([
            this.loadContentItemTagGroups(contextUser),
            this.loadTaggedItemGroups(contextUser),
        ]);

        const pairCounts = new Map<string, number>();

        this.accumulatePairsFromGroups(contentItemGroups, pairCounts);
        this.accumulatePairsFromGroups(taggedItemGroups, pairCounts);

        return pairCounts;
    }

    /**
     * Load ContentItemTag records and group tag IDs by item.
     * Only includes records where TagID is not null.
     */
    private async loadContentItemTagGroups(contextUser: UserInfo): Promise<Map<string, string[]>> {
        const rv = new RunView();
        const result = await rv.RunView<ContentItemTagRow>({
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: 'TagID IS NOT NULL',
            Fields: ['ItemID', 'TagID'],
            ResultType: 'simple'
        }, contextUser);

        if (!result.Success) {
            LogError(`TagCoOccurrenceEngine: Failed to load content item tags: ${result.ErrorMessage}`);
            return new Map();
        }

        return this.groupTagsByKey(
            result.Results,
            row => NormalizeUUID(row.ItemID),
            row => NormalizeUUID(row.TagID)
        );
    }

    /**
     * Load TaggedItem records and group tag IDs by entity+record composite key.
     */
    private async loadTaggedItemGroups(contextUser: UserInfo): Promise<Map<string, string[]>> {
        const rv = new RunView();
        const result = await rv.RunView<TaggedItemRow>({
            EntityName: 'MJ: Tagged Items',
            ExtraFilter: '',
            Fields: ['TagID', 'EntityID', 'RecordID'],
            ResultType: 'simple'
        }, contextUser);

        if (!result.Success) {
            LogError(`TagCoOccurrenceEngine: Failed to load tagged items: ${result.ErrorMessage}`);
            return new Map();
        }

        return this.groupTagsByKey(
            result.Results,
            row => `${NormalizeUUID(row.EntityID)}|${NormalizeUUID(row.RecordID)}`,
            row => NormalizeUUID(row.TagID)
        );
    }

    /**
     * Generic helper to group rows by a key extractor and collect tag IDs.
     */
    private groupTagsByKey<T>(
        rows: T[],
        keyExtractor: (row: T) => string,
        tagExtractor: (row: T) => string
    ): Map<string, string[]> {
        const groups = new Map<string, string[]>();
        for (const row of rows) {
            const key = keyExtractor(row);
            const tagID = tagExtractor(row);
            const existing = groups.get(key);
            if (existing) {
                existing.push(tagID);
            } else {
                groups.set(key, [tagID]);
            }
        }
        return groups;
    }

    /**
     * For each group of tags (belonging to the same item), enumerate all
     * canonical pairs and add their counts to the accumulator map.
     */
    private accumulatePairsFromGroups(groups: Map<string, string[]>, pairCounts: Map<string, number>): void {
        for (const tagIDs of groups.values()) {
            const uniqueTags = this.deduplicateTags(tagIDs);
            if (uniqueTags.length < 2) continue;

            const pairs = this.enumerateCanonicalPairs(uniqueTags);
            for (const pairKey of pairs) {
                const current = pairCounts.get(pairKey) ?? 0;
                pairCounts.set(pairKey, current + 1);
            }
        }
    }

    /**
     * Remove duplicate tag IDs from a list (using normalized UUIDs).
     */
    private deduplicateTags(tagIDs: string[]): string[] {
        const seen = new Set<string>();
        const unique: string[] = [];
        for (const id of tagIDs) {
            const normalized = NormalizeUUID(id);
            if (!seen.has(normalized)) {
                seen.add(normalized);
                unique.push(normalized);
            }
        }
        return unique;
    }

    /**
     * Given a list of unique normalized tag IDs, enumerate all canonical pairs.
     * A canonical pair has TagA < TagB (alphabetical comparison of normalized UUIDs).
     *
     * @returns Array of pair keys in format "tagAID|tagBID"
     */
    private enumerateCanonicalPairs(uniqueTags: string[]): string[] {
        const sorted = [...uniqueTags].sort();
        const pairs: string[] = [];
        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                pairs.push(`${sorted[i]}|${sorted[j]}`);
            }
        }
        return pairs;
    }

    // ========================================================================
    // Existing Data Loading
    // ========================================================================

    /**
     * Load all existing co-occurrence records, keyed by canonical pair key.
     */
    private async loadExistingPairs(contextUser: UserInfo): Promise<Map<string, CoOccurrenceRow>> {
        const rv = new RunView();
        const result = await rv.RunView<CoOccurrenceRow>({
            EntityName: 'MJ: Tag Co Occurrences',
            ExtraFilter: '',
            Fields: ['ID', 'TagAID', 'TagBID', 'CoOccurrenceCount'],
            ResultType: 'simple'
        }, contextUser);

        if (!result.Success) {
            LogError(`TagCoOccurrenceEngine: Failed to load existing co-occurrence records: ${result.ErrorMessage}`);
            return new Map();
        }

        const map = new Map<string, CoOccurrenceRow>();
        for (const row of result.Results) {
            const key = this.makePairKey(row.TagAID, row.TagBID);
            map.set(key, row);
        }
        return map;
    }

    // ========================================================================
    // Upsert and Prune
    // ========================================================================

    /**
     * Upsert computed pair counts into the database and delete stale pairs.
     */
    private async upsertAndPrune(
        pairCounts: Map<string, number>,
        existingPairs: Map<string, CoOccurrenceRow>,
        contextUser: UserInfo
    ): Promise<CoOccurrenceComputeResult> {
        let pairsUpdated = 0;
        let pairsDeleted = 0;

        // Upsert: create or update pairs that have a count > 0
        for (const [pairKey, count] of pairCounts.entries()) {
            const existing = existingPairs.get(pairKey);
            if (existing) {
                const updated = await this.updateExistingPair(existing.ID, count, contextUser);
                if (updated) pairsUpdated++;
            } else {
                const created = await this.createNewPair(pairKey, count, contextUser);
                if (created) pairsUpdated++;
            }
        }

        // Prune: delete existing pairs that are no longer in the computed set
        for (const [pairKey, existing] of existingPairs.entries()) {
            if (!pairCounts.has(pairKey)) {
                const deleted = await this.deleteStalePair(existing.ID, contextUser);
                if (deleted) pairsDeleted++;
            }
        }

        return { PairsUpdated: pairsUpdated, PairsDeleted: pairsDeleted };
    }

    /**
     * Update an existing co-occurrence record with a new count.
     */
    private async updateExistingPair(recordID: string, count: number, contextUser: UserInfo): Promise<boolean> {
        const md = this.Provider;
        const entity = await md.GetEntityObject<MJTagCoOccurrenceEntity>('MJ: Tag Co Occurrences', contextUser);
        const loaded = await entity.Load(recordID);
        if (!loaded) {
            LogError(`TagCoOccurrenceEngine: Failed to load co-occurrence record ${recordID} for update.`);
            return false;
        }

        entity.CoOccurrenceCount = count;
        entity.LastComputedAt = new Date();
        const saved = await entity.Save();
        if (!saved) {
            LogError(`TagCoOccurrenceEngine: Failed to update co-occurrence record ${recordID}: ${entity.LatestResult?.Message ?? 'Unknown error'}`);
            return false;
        }
        return true;
    }

    /**
     * Create a new co-occurrence record for a computed pair.
     */
    private async createNewPair(pairKey: string, count: number, contextUser: UserInfo): Promise<boolean> {
        const [tagAID, tagBID] = pairKey.split('|');

        const md = this.Provider;
        const entity = await md.GetEntityObject<MJTagCoOccurrenceEntity>('MJ: Tag Co Occurrences', contextUser);
        entity.NewRecord();
        entity.TagAID = tagAID;
        entity.TagBID = tagBID;
        entity.CoOccurrenceCount = count;
        entity.LastComputedAt = new Date();

        const saved = await entity.Save();
        if (!saved) {
            LogError(`TagCoOccurrenceEngine: Failed to create co-occurrence pair (${tagAID}, ${tagBID}): ${entity.LatestResult?.Message ?? 'Unknown error'}`);
            return false;
        }
        return true;
    }

    /**
     * Delete a co-occurrence record that no longer has any co-occurring items.
     */
    private async deleteStalePair(recordID: string, contextUser: UserInfo): Promise<boolean> {
        const md = this.Provider;
        const entity = await md.GetEntityObject<MJTagCoOccurrenceEntity>('MJ: Tag Co Occurrences', contextUser);
        const loaded = await entity.Load(recordID);
        if (!loaded) {
            LogError(`TagCoOccurrenceEngine: Failed to load co-occurrence record ${recordID} for deletion.`);
            return false;
        }

        const deleted = await entity.Delete();
        if (!deleted) {
            LogError(`TagCoOccurrenceEngine: Failed to delete stale co-occurrence record ${recordID}: ${entity.LatestResult?.Message ?? 'Unknown error'}`);
            return false;
        }
        return true;
    }

    // ========================================================================
    // Utilities
    // ========================================================================

    /**
     * Build a canonical pair key from two tag IDs.
     * Normalizes UUIDs and ensures alphabetical ordering (TagA < TagB).
     */
    private makePairKey(tagAID: string, tagBID: string): string {
        const a = NormalizeUUID(tagAID);
        const b = NormalizeUUID(tagBID);
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    }
}
