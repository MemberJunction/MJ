/**
 * @fileoverview Reciprocal Rank Fusion (RRF) implementation for combining
 * ranked result lists from different retrieval methods (e.g., vector + keyword).
 *
 * RRF is a rank-based fusion method that is score-scale independent —
 * it works purely on ordinal position, making it ideal for combining results
 * from systems with incomparable scoring scales.
 *
 * Reference: Cormack, Clarke, Buettcher (2009) — "Reciprocal Rank Fusion
 * outperforms Condorcet and individual Rank Learning Methods"
 *
 * @module @memberjunction/core
 */

/**
 * A candidate document with an ID, score, and optional metadata.
 * Used as both input to and output from RRF fusion.
 */
export interface ScoredCandidate {
    /** Unique identifier for the candidate (e.g., record ID) */
    ID: string;
    /** Relevance score — interpretation varies by source system */
    Score: number;
    /** Optional metadata preserved through fusion */
    Metadata?: Record<string, unknown>;
}

/**
 * Compute Reciprocal Rank Fusion across multiple ranked result lists, with
 * optional per-list weights.
 *
 * Unweighted formula: `FusedScore(d) = Σ_i 1 / (k + rank_i(d))`
 * Weighted formula:   `FusedScore(d) = Σ_i w_i / (k + rank_i(d))`
 *
 * where `rank_i(d)` is the 1-based rank of document `d` in list `i`,
 * `k` is a smoothing constant (default 60, per the original paper), and
 * `w_i` is the optional weight for list `i` (default 1.0).
 *
 * Documents not present in a list receive no contribution from that list
 * (they are simply absent, not penalized).
 *
 * @param rankedLists - Arrays of candidates, each sorted by descending relevance.
 *                      Each list represents results from one retrieval method.
 * @param k - Smoothing constant. Higher values reduce the influence of top-ranked
 *            positions. Default: 60 (the standard value from the RRF paper and
 *            used by Azure AI Search, OpenSearch, and Elasticsearch).
 * @param weights - Optional per-list weights aligned by index with `rankedLists`.
 *                  Lists with no entry in the array fall back to a weight of 1.0.
 *                  A weight of 0 suppresses that list's contribution entirely.
 *                  Omitting the parameter is equivalent to all-ones (canonical RRF).
 * @returns Fused candidates sorted by descending RRF score.
 */
export function ComputeRRF(
    rankedLists: ScoredCandidate[][],
    k: number = 60,
    weights?: number[]
): ScoredCandidate[] {
    if (rankedLists.length === 0) {
        return [];
    }

    if (rankedLists.length === 1) {
        return [...rankedLists[0]];
    }

    const fusedScores = new Map<string, { Score: number; Metadata?: Record<string, unknown> }>();

    for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
        const list = rankedLists[listIdx];
        const weight = weights?.[listIdx] ?? 1.0;
        if (weight === 0) {
            continue;
        }

        for (let rank = 0; rank < list.length; rank++) {
            const candidate = list[rank];
            const rrfContribution = weight * (1.0 / (k + rank + 1)); // rank is 0-based, formula uses 1-based

            const existing = fusedScores.get(candidate.ID);
            if (existing) {
                existing.Score += rrfContribution;
            } else {
                fusedScores.set(candidate.ID, {
                    Score: rrfContribution,
                    Metadata: candidate.Metadata,
                });
            }
        }
    }

    const results: ScoredCandidate[] = [];
    for (const [id, entry] of fusedScores) {
        results.push({ ID: id, Score: entry.Score, Metadata: entry.Metadata });
    }

    results.sort((a, b) => b.Score - a.Score);
    return results;
}
