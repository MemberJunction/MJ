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

    /** Map from SearchSourceType (lowercase) to ScoreBreakdown property (PascalCase) */
    private static readonly SOURCE_TO_BREAKDOWN_KEY: Record<SearchSourceType, 'Vector' | 'FullText' | 'Entity'> = {
        vector: 'Vector',
        fulltext: 'FullText',
        entity: 'Entity',
    };

    /**
     * Build a map of candidate ID -> per-source score for breakdown reporting.
     * Keys use PascalCase to match the ScoreBreakdown interface directly.
     */
    private buildSourceScoreMap(
        lists: LabeledCandidateList[]
    ): Map<string, { Vector?: number; FullText?: number; Entity?: number }> {
        const scoreMap = new Map<string, { Vector?: number; FullText?: number; Entity?: number }>();

        for (const list of lists) {
            const key = SearchFusion.SOURCE_TO_BREAKDOWN_KEY[list.Source];
            for (const candidate of list.Candidates) {
                const existing = scoreMap.get(candidate.ID);
                if (existing) {
                    existing[key] = candidate.Score;
                } else {
                    const breakdown: { Vector?: number; FullText?: number; Entity?: number } = {};
                    breakdown[key] = candidate.Score;
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
        sourceScores: Map<string, { Vector?: number; FullText?: number; Entity?: number }>
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
                Vector: breakdown?.Vector,
                FullText: breakdown?.FullText,
                Entity: breakdown?.Entity,
            },
            Tags: Array.isArray(metadata['Tags']) ? metadata['Tags'] as string[] : [],
            MatchedAt: new Date(),
        };
    }
}
