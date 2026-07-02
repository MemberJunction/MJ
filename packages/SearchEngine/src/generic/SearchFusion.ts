/**
 * @fileoverview Search result fusion using Reciprocal Rank Fusion (RRF).
 *
 * Two fusion layers:
 *   1. **Per-scope / per-source fusion** — `Fuse()` takes labeled lists from a single scope's
 *      providers (vector, full-text, entity, storage) and produces a single ranked list for
 *      that scope. Per-provider fusion weights are honored when supplied.
 *   2. **Cross-scope fusion** — `CrossScopeFusion()` takes an already-per-scope-fused map
 *      (`scopeID → results`) and combines them into a single ranked list across all scopes.
 *
 * Both layers use the shared `ComputeRRF()` from `@memberjunction/core`. Deduplication is
 * handled separately via `Deduplicate()` so callers can control ordering of dedup vs.
 * re-ranking vs. permission safety net.
 *
 * @module @memberjunction/search-engine
 */

import { ComputeRRF, ScoredCandidate } from '@memberjunction/core';
import { SearchResultItem, SearchSource, SearchScoreBreakdown, FusionWeightsByProvider } from './search.types';

/**
 * A labeled list of search results from a single source.
 */
export interface LabeledResultList {
    /** Which search source produced these results */
    Source: SearchSource;
    /** The results, sorted by descending relevance */
    Results: SearchResultItem[];
}

/**
 * Handles fusion and deduplication of multi-source search results
 * using Reciprocal Rank Fusion.
 */
export class SearchFusion {
    /**
     * Fuse multiple ranked result lists using RRF, deduplicate, and return
     * the top results up to maxResults.
     *
     * When only one source has results, scores are normalized relative to
     * the top result so the best match appears at ~95% rather than raw
     * cosine similarity (~40-50%).
     *
     * @param lists - Labeled result lists from each search source
     * @param maxResults - Maximum number of results to return
     * @param fusionWeights - Optional per-provider weights applied during RRF.
     *                       Keys match `SearchSource` values (plus any custom source types).
     *                       Missing keys default to 1.0. Only applied when there are 2+ sources.
     * @returns Fused, deduplicated, and ranked results
     */
    public Fuse(
        lists: LabeledResultList[],
        maxResults: number,
        fusionWeights?: FusionWeightsByProvider
    ): SearchResultItem[] {
        // Defensive sanitation: reject items with non-finite Score or empty
        // RecordID before fusion. A custom 3rd-party provider that returns
        // `Score: NaN`, `Score: undefined`, or `RecordID: ''` would otherwise
        // poison the RRF sort (NaN comparisons are always false → unstable
        // ordering) or short-circuit dedup (empty key collisions). Filter
        // here once rather than in three downstream places.
        const sanitized: LabeledResultList[] = lists.map(l => ({
            Source: l.Source,
            Results: l.Results.filter(r =>
                r != null
                && typeof r.RecordID === 'string'
                && r.RecordID.length > 0
                && Number.isFinite(r.Score)
            ),
        }));

        // Collect only lists that have (sanitized) results
        const nonEmpty = sanitized.filter(l => l.Results.length > 0);
        if (nonEmpty.length === 0) return [];

        // Single source: return as-is (no normalization needed, scores are native to that source)
        if (nonEmpty.length === 1) {
            return nonEmpty[0].Results.slice(0, maxResults);
        }

        // Multiple sources: apply RRF with optional weights
        return this.applyRRF(nonEmpty, maxResults, fusionWeights);
    }

    /**
     * Fuse already-per-scope-fused result lists into a single cross-scope ranking.
     *
     * Each entry in `scopeResults` is a per-scope ranked list (already internally fused
     * across its providers via `Fuse()`). Cross-scope RRF treats each scope's ranking as
     * one input list to a new RRF computation, so records that appear in multiple scopes
     * get boosted.
     *
     * @param scopeResults - Map of `scopeID → per-scope results`.
     * @param maxResults - Maximum number of results to return.
     * @param fusionWeights - Optional per-scope weights keyed by scope ID. Missing keys
     *                       default to 1.0.
     * @returns Fused, cross-scope-ranked results (not yet deduplicated).
     */
    public CrossScopeFusion(
        scopeResults: Map<string, SearchResultItem[]>,
        maxResults: number,
        fusionWeights?: Record<string, number>
    ): SearchResultItem[] {
        // Filter empty scopes
        const entries = Array.from(scopeResults.entries()).filter(([, list]) => list.length > 0);
        if (entries.length === 0) return [];
        if (entries.length === 1) return entries[0][1].slice(0, maxResults);

        // Build per-scope ScoredCandidate lists (by-record-identity keyed on EntityName::RecordID
        // so the same logical record across scopes merges properly). `Rank` is included as
        // an excess property so test doubles that key off of it work while real ComputeRRF
        // (which keys off array position) continues to behave correctly.
        const rankedLists: ScoredCandidate[][] = entries.map(([, list]) =>
            list.map((r, i) => ({
                ID: `${r.EntityName}::${r.RecordID}`,
                Score: r.Score,
                Rank: i + 1
            } as ScoredCandidate))
        );
        const weights = entries.map(([scopeID]) => fusionWeights?.[scopeID] ?? 1);

        const fused = this.computeWeightedRRF(rankedLists, weights);

        // Build a lookup from compound key to full result item (prefer best score)
        const resultMap = new Map<string, SearchResultItem>();
        for (const [, list] of entries) {
            for (const r of list) {
                const key = `${r.EntityName}::${r.RecordID}`;
                const existing = resultMap.get(key);
                if (!existing || r.Score > existing.Score) {
                    resultMap.set(key, r);
                }
            }
        }

        return fused.slice(0, maxResults).map(candidate => {
            const item = resultMap.get(candidate.ID);
            if (item) return { ...item, Score: candidate.Score };
            return this.createFallbackItem(candidate);
        });
    }

    /**
     * Deduplicate results by EntityName+RecordID.
     * When the same record appears from multiple sources (e.g., vector + entity),
     * prefer entity results (they have richer metadata like snippets and field data)
     * and merge the score breakdowns. The final score is the maximum across sources.
     */
    public Deduplicate(results: SearchResultItem[]): SearchResultItem[] {
        const seen = new Map<string, SearchResultItem>();
        for (const result of results) {
            const key = `${result.EntityName}::${result.RecordID}`;
            const existing = seen.get(key);
            if (!existing) {
                seen.set(key, result);
            } else {
                // Merge: keep the better result, combine score breakdowns
                const mergedBreakdown = { ...existing.ScoreBreakdown, ...result.ScoreBreakdown };
                const maxScore = Math.max(existing.Score, result.Score);

                // Prefer 'entity' source type (richer data) over 'vector'
                const preferred = existing.SourceType === 'entity' ? existing :
                                  result.SourceType === 'entity' ? result :
                                  result.Score > existing.Score ? result : existing;

                seen.set(key, {
                    ...preferred,
                    Score: maxScore,
                    ScoreBreakdown: mergedBreakdown
                });
            }
        }
        // Ensure Score is the max of all ScoreBreakdown values (handles cases
        // where dedup didn't merge but breakdown was set from a single source)
        const deduplicated = Array.from(seen.values()).map(r => {
            const breakdownValues = Object.values(r.ScoreBreakdown).filter((v): v is number => typeof v === 'number' && v > 0);
            const breakdownMax = breakdownValues.length > 0 ? Math.max(...breakdownValues) : 0;
            return breakdownMax > r.Score ? { ...r, Score: breakdownMax } : r;
        });
        return deduplicated.sort((a, b) => b.Score - a.Score);
    }

    /**
     * Apply RRF across multiple result lists.
     * Maps results to ScoredCandidate[], runs ComputeRRF (optionally weighted), then maps back.
     */
    private applyRRF(
        lists: LabeledResultList[],
        maxResults: number,
        fusionWeights?: FusionWeightsByProvider
    ): SearchResultItem[] {
        // Build ScoredCandidate arrays for each source. `Rank` is carried as an excess
        // property for test doubles that key off it; production ComputeRRF ignores it.
        const rankedLists: ScoredCandidate[][] = lists.map(list =>
            list.Results.map((r, i) => ({
                ID: r.RecordID,
                Score: r.Score,
                Rank: i + 1
            } as ScoredCandidate))
        );

        const weights = lists.map(l => fusionWeights?.[l.Source] ?? 1);
        const fused = this.computeWeightedRRF(rankedLists, weights);

        // Build a lookup from RecordID to full result item. When the same record
        // appears in multiple provider lists, merge their `ScoreBreakdown`s so the
        // multi-provider evidence isn't lost. Keeping only the first occurrence
        // would silently drop the second provider's contribution — which then
        // causes the downstream `Deduplicate.breakdownMax` post-processing to
        // under-rank multi-provider hits (they'd look single-provider).
        const resultMap = new Map<string, SearchResultItem>();
        for (const list of lists) {
            for (const r of list.Results) {
                const existing = resultMap.get(r.RecordID);
                if (!existing) {
                    resultMap.set(r.RecordID, r);
                } else {
                    resultMap.set(r.RecordID, {
                        ...existing,
                        ScoreBreakdown: { ...existing.ScoreBreakdown, ...r.ScoreBreakdown },
                    });
                }
            }
        }

        // Map fused candidates back to full result items
        return fused.slice(0, maxResults).map(candidate => {
            const item = resultMap.get(candidate.ID);
            if (item) {
                return { ...item, Score: candidate.Score };
            }
            // Fallback (shouldn't happen in practice)
            return this.createFallbackItem(candidate);
        });
    }

    /**
     * RRF with optional per-list weights. Delegates to the canonical `ComputeRRF()`
     * from `@memberjunction/core`, which accepts an optional `weights` argument
     * aligned by index with `rankedLists`.
     *
     * Kept as a thin wrapper so callers within SearchFusion can pass weights as a
     * required positional argument (clearer intent at the call sites) while the
     * canonical function keeps `weights` optional for backwards-compatible behavior.
     */
    private computeWeightedRRF(
        rankedLists: ScoredCandidate[][],
        weights: number[],
        k: number = 60
    ): ScoredCandidate[] {
        return ComputeRRF(rankedLists, k, weights);
    }

    /**
     * Normalize scores when only one search source returned results.
     * Scales scores relative to the top result so the best match shows
     * ~95% instead of raw cosine similarity (~40-50%).
     */
    private normalizeScores(results: SearchResultItem[]): SearchResultItem[] {
        if (results.length === 0) return results;

        const maxScore = results[0].Score; // Results are already sorted desc
        if (maxScore <= 0) return results;

        const scaleFactor = 0.95 / maxScore;
        return results.map(r => ({
            ...r,
            Score: Math.min(0.99, r.Score * scaleFactor)
        }));
    }

    /**
     * Create a fallback SearchResultItem for a fused candidate that has
     * no matching full result item (defensive).
     */
    private createFallbackItem(candidate: ScoredCandidate): SearchResultItem {
        // If the ID is a compound key (EntityName::RecordID) used by CrossScopeFusion,
        // split it back out for readability.
        let entityName = 'Unknown';
        let recordID = candidate.ID;
        const sep = candidate.ID.indexOf('::');
        if (sep > 0) {
            entityName = candidate.ID.substring(0, sep);
            recordID = candidate.ID.substring(sep + 2);
        }
        return {
            ID: recordID,
            EntityName: entityName,
            RecordID: recordID,
            SourceType: 'fused',
            ResultType: 'entity-record',
            Title: 'Unknown',
            Snippet: '',
            Score: candidate.Score,
            ScoreBreakdown: {} as SearchScoreBreakdown,
            Tags: [],
            MatchedAt: new Date()
        };
    }
}
