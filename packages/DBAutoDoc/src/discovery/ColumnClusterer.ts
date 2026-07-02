/**
 * ColumnClusterer — average-linkage agglomerative clustering on cosine distance.
 *
 * Input:  N columns each with a unit-normalized embedding vector.
 * Output: clusters of ≥2 members spanning ≥2 distinct tables, sorted biggest-first.
 *
 * Algorithm:
 *   1. Compute the full N×N upper-triangular pairwise cosine-distance matrix.
 *   2. Repeatedly find the closest two clusters; if their distance ≤ mergeThreshold,
 *      merge them and update the distance to every other cluster as the AVERAGE
 *      pairwise distance between their members. Stop when the closest pair exceeds
 *      the threshold.
 *   3. Filter clusters by minClusterSize + minDistinctTables.
 *
 * Why average-linkage:
 *   Complete-linkage requires EVERY pair across two clusters to be close before
 *   merging — too tight in practice. Single-linkage chains unrelated points
 *   through bridges. Average-linkage merges when clusters are similar on average,
 *   which matches the actual "cluster = one concept" question.
 */

import { OrganicKeyClusterMember } from '../types/organic-keys.js';

/** A column ready to cluster — identity + embedding + structural metadata. */
export interface ClustererInputColumn {
    schema: string;
    table: string;
    column: string;
    embedding: Float32Array;
    participatesInFK: boolean;
    fkTarget?: { schema: string; table: string; column: string } | null;
    isPrimaryKey?: boolean;
}

/** A raw cluster from the clusterer — naming/normalization filled in by the caller. */
export interface RawCluster {
    memberIndexes: number[];
    members: OrganicKeyClusterMember[];
    /** Max pairwise distance among members (cluster "tightness" — lower is tighter). */
    maxIntraDistance: number;
}

export interface ClustererOptions {
    /**
     * Explicit merge-distance threshold. When provided, used directly.
     * When omitted, the clusterer auto-calibrates from the actual distance
     * distribution (threshold = pN of pairwise distances, default p5).
     */
    mergeThreshold?: number;
    /** Percentile (0–100) of the pairwise distance distribution for auto-calibration. Default 5. */
    mergeThresholdPercentile?: number;
    /** Minimum cluster size to report. */
    minClusterSize: number;
    /** Minimum distinct tables a cluster must span. */
    minDistinctTables: number;
}

export class ColumnClusterer {
    public lastResolvedThreshold = 0;

    constructor(private readonly opts: ClustererOptions) {}

    public cluster(columns: ClustererInputColumn[]): RawCluster[] {
        const n = columns.length;
        if (n < this.opts.minClusterSize) return [];

        // Step 1 — pairwise cosine-distance matrix.
        const distance = computePairwiseDistance(columns);
        const resolvedThreshold = this.opts.mergeThreshold !== undefined
            ? this.opts.mergeThreshold
            : computeThresholdFromDistribution(distance, this.opts.mergeThresholdPercentile ?? 5);
        this.lastResolvedThreshold = resolvedThreshold;

        // Step 2 — agglomerative merge with average-linkage.
        const clusters = new Map<number, number[]>();
        for (let i = 0; i < n; i++) clusters.set(i, [i]);

        const avgDist = new Map<number, Map<number, number>>();
        for (let i = 0; i < n; i++) {
            const row = new Map<number, number>();
            for (let j = 0; j < n; j++) {
                if (i !== j) row.set(j, distanceAt(distance, n, i, j));
            }
            avgDist.set(i, row);
        }

        while (clusters.size > 1) {
            let bestA = -1;
            let bestB = -1;
            let bestD = Number.POSITIVE_INFINITY;
            for (const [a, aRow] of avgDist) {
                for (const [b, d] of aRow) {
                    if (a < b && d < bestD) {
                        bestD = d;
                        bestA = a;
                        bestB = b;
                    }
                }
            }
            if (bestD > resolvedThreshold || bestA < 0) break;

            const membersA = clusters.get(bestA)!;
            const membersB = clusters.get(bestB)!;
            const sizeA = membersA.length;
            const sizeB = membersB.length;
            const rowA = avgDist.get(bestA)!;
            const rowB = avgDist.get(bestB)!;
            for (const c of clusters.keys()) {
                if (c === bestA || c === bestB) continue;
                const dAC = rowA.get(c)!;
                const dBC = rowB.get(c)!;
                const newD = (sizeA * dAC + sizeB * dBC) / (sizeA + sizeB);
                rowA.set(c, newD);
                avgDist.get(c)!.set(bestA, newD);
                avgDist.get(c)!.delete(bestB);
            }
            rowA.delete(bestB);
            avgDist.delete(bestB);

            clusters.set(bestA, membersA.concat(membersB));
            clusters.delete(bestB);
        }

        // Step 3 — filter + emit.
        const out: RawCluster[] = [];
        for (const memberIdxs of clusters.values()) {
            if (memberIdxs.length < this.opts.minClusterSize) continue;
            const tableSet = new Set(memberIdxs.map((i) => `${columns[i].schema}.${columns[i].table}`));
            if (tableSet.size < this.opts.minDistinctTables) continue;
            const members: OrganicKeyClusterMember[] = memberIdxs.map((i) => ({
                schema: columns[i].schema,
                table: columns[i].table,
                column: columns[i].column,
                participatesInFK: !!columns[i].participatesInFK,
                fkTarget: columns[i].fkTarget ?? null,
                isPrimaryKey: !!columns[i].isPrimaryKey,
            }));
            out.push({
                memberIndexes: memberIdxs,
                members,
                maxIntraDistance: maxIntraDistance(memberIdxs, distance, n),
            });
        }
        out.sort((a, b) => b.members.length - a.members.length);
        return out;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computePairwiseDistance(columns: ClustererInputColumn[]): Float32Array {
    const n = columns.length;
    const len = (n * (n - 1)) / 2;
    const out = new Float32Array(len);
    for (let i = 0; i < n; i++) {
        const ei = columns[i].embedding;
        for (let j = i + 1; j < n; j++) {
            const ej = columns[j].embedding;
            let s = 0;
            const dim = Math.min(ei.length, ej.length);
            for (let k = 0; k < dim; k++) s += ei[k] * ej[k];
            const d = 1 - s;
            out[flatIndex(i, j, n)] = d > 0 ? d : 0;
        }
    }
    return out;
}

function flatIndex(i: number, j: number, n: number): number {
    return i * n - (i * (i + 1)) / 2 + (j - i - 1);
}

/**
 * Auto-calibrate the merge threshold from the actual distance distribution.
 *
 * Real embedding-distance distributions for "same vs different concept" data
 * are usually BIMODAL: a dense cluster of small distances (same concept) and
 * a dense cluster of large distances (different concept), with a clear gap
 * between them. A flat percentile (p5) breaks in the degenerate cases where
 * many descriptions land exactly identically — p5 becomes 0 and the merge
 * loop refuses to merge anything that isn't byte-equal.
 *
 * Robust approach: find the largest gap in the BOTTOM half of the sorted
 * distance distribution (where the same-concept / different-concept split
 * lives), and place the threshold inside that gap so all same-concept pairs
 * merge and no different-concept pair does.
 *
 * Fallback when no clear gap exists: use the pN percentile (legacy behavior).
 * Floor the result so we still merge near-identical descriptions even when
 * the geometry is degenerate.
 */
function computeThresholdFromDistribution(distances: Float32Array, percentile: number): number {
    if (distances.length === 0) return 0;
    const sorted = Array.from(distances).sort((a, b) => a - b);
    const N = sorted.length;

    // Search the entire distribution for the largest gap whose START is in the
    // "same-concept territory" (≤0.40 cosine distance). Anything above 0.40 is
    // already inter-concept, and the gaps up there are irrelevant noise.
    //
    // For Gemini clustering embeddings, same-concept pairs concentrate ≤0.15
    // and different-concept pairs ≥0.30, so the boundary gap lives somewhere in
    // [0.05, 0.35]. Searching that window finds it whether the intra-concept
    // pairs are 10% or 60% of all pairs.
    const GAP_START_MAX = 0.40;
    const MIN_MEANINGFUL_GAP = 0.03;
    const FLOOR = 0.05;

    let bestGap = 0;
    let bestGapStart = 0;
    for (let i = 0; i < N - 1; i++) {
        if (sorted[i] > GAP_START_MAX) break;
        const gap = sorted[i + 1] - sorted[i];
        if (gap > bestGap) {
            bestGap = gap;
            bestGapStart = sorted[i];
        }
    }

    if (bestGap >= MIN_MEANINGFUL_GAP) {
        return Math.max(FLOOR, bestGapStart + bestGap * 0.5);
    }

    // No clear gap — use the pN percentile, floored to merge near-identical pairs.
    const p = Math.max(0, Math.min(100, percentile));
    const idx = Math.floor((N * p) / 100);
    return Math.max(FLOOR, sorted[Math.min(idx, N - 1)]);
}

function distanceAt(matrix: Float32Array, n: number, i: number, j: number): number {
    if (i === j) return 0;
    if (i > j) [i, j] = [j, i];
    return matrix[flatIndex(i, j, n)];
}

function maxIntraDistance(memberIdxs: number[], matrix: Float32Array, n: number): number {
    let max = 0;
    for (let a = 0; a < memberIdxs.length; a++) {
        for (let b = a + 1; b < memberIdxs.length; b++) {
            const d = distanceAt(matrix, n, memberIdxs[a], memberIdxs[b]);
            if (d > max) max = d;
        }
    }
    return max;
}
