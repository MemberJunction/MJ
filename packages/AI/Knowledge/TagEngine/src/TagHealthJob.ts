import { BaseSingleton, NormalizeUUID } from '@memberjunction/global';
import { LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { MJTagCoOccurrenceEntity, MJTagSuggestionEntity, MJTagEntity } from '@memberjunction/core-entities';
import { TagEngine } from './TagEngine';
import { TagGovernanceEngine } from './TagGovernanceEngine';

/**
 * Threshold knobs for the Tag Health emitters. Defaults are conservative;
 * tune up/down per deployment based on inbox volume.
 */
export interface TagHealthThresholds {
    /** Minimum CoOccurrenceCount for a pair to be considered as a merge candidate. */
    minCoOccurrence: number;
    /** Minimum embedding cosine similarity (0-1) for a merge candidate. */
    minEmbeddingSimilarity: number;
    /** Minimum normalized name similarity (Dice's-coefficient-like, 0-1) for a merge candidate. */
    minNameSimilarity: number;
    /** Tags with usage strictly less than this are flagged as low-usage candidates. */
    maxUsage: number;
    /**
     * Tags with more direct children than this are flagged as wide-node candidates
     * (when the tag has no explicit MaxChildren cap).
     */
    maxImplicitChildren: number;
}

export const DEFAULT_TAG_HEALTH_THRESHOLDS: TagHealthThresholds = {
    minCoOccurrence: 5,
    minEmbeddingSimilarity: 0.85,
    minNameSimilarity: 0.5,
    maxUsage: 2,
    maxImplicitChildren: 25,
};

export interface TagHealthSummary {
    mergeCount: number;
    lowUsageCount: number;
    wideNodeCount: number;
    durationMs: number;
}

/**
 * Tag Health Job — fans out three suggestion-emitting passes:
 *   1. **Merge candidates** — pairs of tags that frequently co-occur AND look
 *      similar by name + embedding. Fed by `MJ:Tag Co Occurrences`.
 *   2. **Low-usage** — Active tags with very few `MJ:Tagged Items` /
 *      `MJ:Content Item Tags` references. Reviewer can deprecate or delete.
 *   3. **Wide-node** — tags whose direct-child count exceeds a soft cap
 *      (`maxImplicitChildren` for tags with no explicit `MaxChildren`).
 *
 * All three are idempotent: re-running won't duplicate Pending suggestions
 * for the same (proposed name, best match) pair / tag.
 */
export class TagHealthJob extends BaseSingleton<TagHealthJob> {
    public constructor() { super(); }
    public static get Instance(): TagHealthJob {
        return TagHealthJob.getInstance<TagHealthJob>();
    }

    public async Run(thresholds: TagHealthThresholds, contextUser: UserInfo): Promise<TagHealthSummary> {
        const start = Date.now();
        await TagEngine.Instance.Config(false, contextUser);

        const [mergeCount, lowUsageCount, wideNodeCount] = await Promise.all([
            this.emitMergeSuggestions(thresholds, contextUser),
            this.emitLowUsageSuggestions(thresholds, contextUser),
            this.emitWideNodeSuggestions(thresholds, contextUser),
        ]);

        const summary: TagHealthSummary = {
            mergeCount,
            lowUsageCount,
            wideNodeCount,
            durationMs: Date.now() - start,
        };
        LogStatus(`TagHealthJob: ${mergeCount} merge / ${lowUsageCount} low-usage / ${wideNodeCount} wide-node suggestions emitted in ${summary.durationMs}ms.`);
        return summary;
    }

    // ========================================================================
    // 1. Merge candidates
    // ========================================================================

    private async emitMergeSuggestions(t: TagHealthThresholds, contextUser: UserInfo): Promise<number> {
        const rv = new RunView();
        const coOcc = await rv.RunView<MJTagCoOccurrenceEntity>({
            EntityName: 'MJ: Tag Co Occurrences',
            ExtraFilter: `CoOccurrenceCount >= ${t.minCoOccurrence}`,
            ResultType: 'simple'
        }, contextUser);
        if (!coOcc.Success) {
            LogError(`TagHealthJob.emitMergeSuggestions: failed to load co-occurrence rows: ${coOcc.ErrorMessage}`);
            return 0;
        }

        const existingPending = await this.loadPendingSuggestionKeys('MergeCandidate', contextUser);

        let count = 0;
        for (const row of coOcc.Results as Array<{ TagAID: string; TagBID: string; CoOccurrenceCount: number }>) {
            const tagA = TagEngine.Instance.GetTagByID(row.TagAID);
            const tagB = TagEngine.Instance.GetTagByID(row.TagBID);
            if (!tagA || !tagB || tagA.Status !== 'Active' || tagB.Status !== 'Active') continue;

            const nameSim = this.nameSimilarity(tagA.Name, tagB.Name);
            if (nameSim < t.minNameSimilarity) continue;

            const embeddingSim = this.embeddingSimilarity(tagA.ID, tagB.ID);
            if (embeddingSim == null || embeddingSim < t.minEmbeddingSimilarity) continue;

            const key = this.suggestionDedupKey(tagA.Name, tagB.ID);
            if (existingPending.has(key)) continue;

            try {
                await TagGovernanceEngine.Instance.EnqueueSuggestion({
                    proposedName: tagA.Name,
                    bestMatchTagID: tagB.ID,
                    bestMatchScore: embeddingSim,
                    reason: 'MergeCandidate',
                }, contextUser);
                existingPending.add(key);
                count++;
            } catch (e) {
                LogError(`TagHealthJob.emitMergeSuggestions: enqueue failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return count;
    }

    // ========================================================================
    // 2. Low-usage
    // ========================================================================

    private async emitLowUsageSuggestions(t: TagHealthThresholds, contextUser: UserInfo): Promise<number> {
        const rv = new RunView();
        // Pull usage counts in two cheap queries: TaggedItem grouped by TagID,
        // and ContentItemTag grouped by TagID. Sum client-side.
        const [taggedRes, citRes] = await rv.RunViews([
            { EntityName: 'MJ: Tagged Items', Fields: ['TagID'], ResultType: 'simple' },
            { EntityName: 'MJ: Content Item Tags', ExtraFilter: `TagID IS NOT NULL`, Fields: ['TagID'], ResultType: 'simple' },
        ], contextUser);

        const usage = new Map<string, number>();
        if (taggedRes.Success) {
            for (const r of taggedRes.Results as Array<{ TagID: string }>) {
                usage.set(NormalizeUUID(r.TagID), (usage.get(NormalizeUUID(r.TagID)) ?? 0) + 1);
            }
        }
        if (citRes.Success) {
            for (const r of citRes.Results as Array<{ TagID: string }>) {
                if (!r.TagID) continue;
                usage.set(NormalizeUUID(r.TagID), (usage.get(NormalizeUUID(r.TagID)) ?? 0) + 1);
            }
        }

        const existingPending = await this.loadPendingSuggestionKeys('LowUsage', contextUser);

        let count = 0;
        for (const tag of TagEngine.Instance.Tags) {
            if (tag.Status !== 'Active') continue;
            const used = usage.get(NormalizeUUID(tag.ID)) ?? 0;
            if (used >= t.maxUsage) continue;

            const key = this.suggestionDedupKey(tag.Name, tag.ID);
            if (existingPending.has(key)) continue;

            try {
                await TagGovernanceEngine.Instance.EnqueueSuggestion({
                    proposedName: tag.Name,
                    proposedParentID: tag.ParentID ?? null,
                    bestMatchTagID: tag.ID,
                    reason: 'LowUsage',
                }, contextUser);
                existingPending.add(key);
                count++;
            } catch (e) {
                LogError(`TagHealthJob.emitLowUsageSuggestions: enqueue failed for "${tag.Name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return count;
    }

    // ========================================================================
    // 3. Wide-node
    // ========================================================================

    private async emitWideNodeSuggestions(t: TagHealthThresholds, contextUser: UserInfo): Promise<number> {
        const existingPending = await this.loadPendingSuggestionKeys('WideNode', contextUser);

        let count = 0;
        for (const tag of TagEngine.Instance.Tags) {
            if (tag.Status !== 'Active') continue;
            const directChildren = TagEngine.Instance.GetChildTags(tag.ID).length;
            const cap = tag.MaxChildren != null ? tag.MaxChildren : t.maxImplicitChildren;
            if (directChildren <= cap) continue;

            const key = this.suggestionDedupKey(tag.Name, tag.ID);
            if (existingPending.has(key)) continue;

            try {
                await TagGovernanceEngine.Instance.EnqueueSuggestion({
                    proposedName: tag.Name,
                    proposedParentID: tag.ID,
                    bestMatchTagID: tag.ID,
                    reason: 'WideNode',
                }, contextUser);
                existingPending.add(key);
                count++;
            } catch (e) {
                LogError(`TagHealthJob.emitWideNodeSuggestions: enqueue failed for "${tag.Name}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return count;
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    /**
     * Load existing Pending suggestion keys (proposedName + bestMatchTagID) for
     * the given Reason so we don't duplicate. Returns lowercased "name|matchID".
     */
    private async loadPendingSuggestionKeys(reason: string, contextUser: UserInfo): Promise<Set<string>> {
        const rv = new RunView();
        const result = await rv.RunView<{ ProposedName: string; BestMatchTagID: string | null }>({
            EntityName: 'MJ: Tag Suggestions',
            ExtraFilter: `Status='Pending' AND Reason='${reason}'`,
            Fields: ['ProposedName', 'BestMatchTagID'],
            ResultType: 'simple'
        }, contextUser);
        const out = new Set<string>();
        if (result.Success) {
            for (const r of result.Results) {
                out.add(this.suggestionDedupKey(r.ProposedName, r.BestMatchTagID ?? ''));
            }
        }
        return out;
    }

    private suggestionDedupKey(name: string, matchID: string): string {
        return `${name.trim().toLowerCase()}|${NormalizeUUID(matchID).toLowerCase()}`;
    }

    /**
     * Dice's-coefficient bigram similarity. Cheap and good enough for picking
     * "obvious" merge candidates ("AI" vs "A.I.", "Companies" vs "Company").
     */
    private nameSimilarity(a: string, b: string): number {
        const grams = (s: string): Set<string> => {
            const norm = s.trim().toLowerCase().replace(/\s+/g, '');
            const out = new Set<string>();
            for (let i = 0; i < norm.length - 1; i++) out.add(norm.slice(i, i + 2));
            if (out.size === 0 && norm.length > 0) out.add(norm);
            return out;
        };
        const A = grams(a);
        const B = grams(b);
        if (A.size === 0 || B.size === 0) return 0;
        let intersect = 0;
        for (const g of A) if (B.has(g)) intersect++;
        return (2 * intersect) / (A.size + B.size);
    }

    /**
     * Cosine similarity between two tags' persisted embeddings, using the
     * in-memory vector service. Returns null when either vector is missing.
     */
    private embeddingSimilarity(tagAID: string, tagBID: string): number | null {
        const tagA = TagEngine.Instance.GetTagByID(tagAID);
        const tagB = TagEngine.Instance.GetTagByID(tagBID);
        if (!tagA?.EmbeddingVector || !tagB?.EmbeddingVector) return null;
        try {
            const vA = JSON.parse(tagA.EmbeddingVector) as number[];
            const vB = JSON.parse(tagB.EmbeddingVector) as number[];
            return this.cosine(vA, vB);
        } catch {
            return null;
        }
    }

    private cosine(a: number[], b: number[]): number {
        const len = Math.min(a.length, b.length);
        if (len === 0) return 0;
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < len; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        const mag = Math.sqrt(magA) * Math.sqrt(magB);
        return mag === 0 ? 0 : dot / mag;
    }
}
