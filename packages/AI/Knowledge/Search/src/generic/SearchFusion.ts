/**
 * @fileoverview Search result fusion using Reciprocal Rank Fusion (RRF).
 *
 * Takes ranked lists from vector, full-text, and entity search providers,
 * fuses them using the existing ComputeRRF function, and enriches the
 * final results with metadata.
 *
 * @module @memberjunction/ai-knowledge-search
 */

import { ComputeRRF, ScoredCandidate } from '@memberjunction/ai-vector-dupe';
import { UnifiedSearchResult, SearchSourceType } from './SearchTypes';

/**
 * A labeled list of scored candidates from a single search source.
 */
export interface LabeledCandidateList {
    /** Which search source produced these candidates */
    Source: SearchSourceType;
    /** The candidates, sorted by descending relevance */
    Candidates: ScoredCandidate[];
}

/**
 * Fuses search results from multiple sources using RRF and enriches the output.
 */
export class SearchFusion {
    /**
     * Fuse multiple ranked result lists using Reciprocal Rank Fusion.
     *
     * @param labeledLists - Candidate lists from each search source
     * @param maxResults - Maximum number of results to return
     * @returns Fused and enriched search results
     */
    public Fuse(labeledLists: LabeledCandidateList[], maxResults: number): UnifiedSearchResult[] {
        if (labeledLists.length === 0) {
            return [];
        }

        // Build per-source score maps for the ScoreBreakdown
        const sourceScores = this.buildSourceScoreMap(labeledLists);

        // Extract raw candidate arrays for RRF
        const rankedLists = labeledLists.map(l => l.Candidates);

        // Run RRF fusion
        const fusedCandidates = ComputeRRF(rankedLists);

        // Convert to UnifiedSearchResult and limit
        const results = fusedCandidates
            .slice(0, maxResults)
            .map(candidate => this.enrichCandidate(candidate, sourceScores));

        return results;
    }

    /**
     * Build a map of candidate ID -> per-source score for breakdown reporting.
     */
    private buildSourceScoreMap(
        lists: LabeledCandidateList[]
    ): Map<string, Record<SearchSourceType, number | undefined>> {
        const scoreMap = new Map<string, Record<SearchSourceType, number | undefined>>();

        for (const list of lists) {
            for (const candidate of list.Candidates) {
                const existing = scoreMap.get(candidate.ID);
                if (existing) {
                    existing[list.Source] = candidate.Score;
                } else {
                    const breakdown: Record<SearchSourceType, number | undefined> = {
                        vector: undefined,
                        fulltext: undefined,
                        entity: undefined,
                    };
                    breakdown[list.Source] = candidate.Score;
                    scoreMap.set(candidate.ID, breakdown);
                }
            }
        }

        return scoreMap;
    }

    /**
     * Convert a fused ScoredCandidate into a fully enriched UnifiedSearchResult.
     */
    private enrichCandidate(
        candidate: ScoredCandidate,
        sourceScores: Map<string, Record<SearchSourceType, number | undefined>>
    ): UnifiedSearchResult {
        const metadata = candidate.Metadata ?? {};
        const breakdown = sourceScores.get(candidate.ID);

        return {
            ID: candidate.ID,
            EntityName: String(metadata['EntityName'] ?? ''),
            RecordID: String(metadata['RecordID'] ?? candidate.ID),
            SourceType: String(metadata['SourceType'] ?? 'entity'),
            Title: String(metadata['Title'] ?? ''),
            Snippet: String(metadata['Snippet'] ?? ''),
            Score: candidate.Score,
            ScoreBreakdown: {
                Vector: breakdown?.vector,
                FullText: breakdown?.fulltext,
                Entity: breakdown?.entity,
            },
            Tags: Array.isArray(metadata['Tags']) ? metadata['Tags'] as string[] : [],
            MatchedAt: new Date(),
        };
    }
}
