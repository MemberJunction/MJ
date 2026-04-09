/**
 * @fileoverview Search result fusion using Reciprocal Rank Fusion (RRF).
 *
 * Takes ranked lists from vector, full-text, and entity search providers,
 * applies RRF to produce a unified ranking, deduplicates by EntityName+RecordID,
 * and normalizes scores when only a single source has results.
 *
 * @module @memberjunction/search-engine
 */

import { ComputeRRF, ScoredCandidate } from '@memberjunction/core';
import { SearchResultItem, SearchSource, SearchScoreBreakdown } from './search.types';

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
     * @returns Fused, deduplicated, and ranked results
     */
    public Fuse(lists: LabeledResultList[], maxResults: number): SearchResultItem[] {
        // Collect only lists that have results
        const nonEmpty = lists.filter(l => l.Results.length > 0);
        if (nonEmpty.length === 0) return [];

        // Single source: return as-is (no normalization needed, scores are native to that source)
        if (nonEmpty.length === 1) {
            return nonEmpty[0].Results.slice(0, maxResults);
        }

        // Multiple sources: apply RRF
        return this.applyRRF(nonEmpty, maxResults);
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
     * Maps results to ScoredCandidate[], runs ComputeRRF, then maps back.
     */
    private applyRRF(lists: LabeledResultList[], maxResults: number): SearchResultItem[] {
        // Build ScoredCandidate arrays for each source
        const rankedLists: ScoredCandidate[][] = lists.map(list =>
            list.Results.map((r, i) => ({
                ID: r.RecordID,
                Score: r.Score,
                Rank: i + 1
            }))
        );

        // Run RRF fusion
        const fused = ComputeRRF(rankedLists);

        // Build a lookup from RecordID to full result item (prefer first occurrence)
        const resultMap = new Map<string, SearchResultItem>();
        for (const list of lists) {
            for (const r of list.Results) {
                if (!resultMap.has(r.RecordID)) {
                    resultMap.set(r.RecordID, r);
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
        return {
            ID: candidate.ID,
            EntityName: 'Unknown',
            RecordID: candidate.ID,
            SourceType: 'fused',
            Title: 'Unknown',
            Snippet: '',
            Score: candidate.Score,
            ScoreBreakdown: {} as SearchScoreBreakdown,
            Tags: [],
            MatchedAt: new Date()
        };
    }
}
