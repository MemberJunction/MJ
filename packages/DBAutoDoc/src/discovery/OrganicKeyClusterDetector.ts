/**
 * Organic Key Cluster Detector
 *
 * Pure-TypeScript agglomerative clustering with complete-linkage over a hybrid
 * distance metric (name similarity + optional embedding distance + optional value
 * overlap). Operates on pre-computed signals — embeddings and MinHash signatures
 * are passed in by the caller, never fetched inline.
 *
 * No external dependencies. Embedding and MinHash inputs are optional, so the
 * detector can run on name + value, name + embedding, or all three signals.
 */

import { MinHashSignature, jaccardDistance as minhashDistance } from './MinHashSketch.js';
import { weightedColumnNameSimilarity } from './NameSimilarity.js';
import {
    ClusteringThresholds,
    DEFAULT_HYBRID_WEIGHTS,
    DEFAULT_THRESHOLDS,
    HybridDistanceWeights,
    OrganicKeyCluster,
    OrganicKeyClusterMember,
    OrganicKeyClusterTag,
} from '../types/organic-keys.js';

/** Input column metadata required by the detector. */
export interface DetectorInputColumn {
    schema: string;
    table: string;
    column: string;
    /** SQL data type (e.g. 'uniqueidentifier', 'nvarchar(50)', 'int') — used for type-compatibility prefilter. */
    dataType: string;
    /** LLM-generated column description (used as embedding input upstream; the detector itself only references the column for tag/output purposes). */
    description?: string;
    /** Whether this column is a primary key (informational; affects tagging). */
    isPrimaryKey?: boolean;
    /** Whether this column participates in an FK relationship (declared or discovered). */
    participatesInFK?: boolean;
    /** FK target column when participatesInFK. */
    fkTarget?: { schema: string; table: string; column: string } | null;
    /** Optional pre-computed embedding vector (unit-normalized for cosine = 1 - dot). */
    embedding?: Float32Array | number[] | null;
    /** Optional pre-computed MinHash signature over column values. */
    valueSignature?: MinHashSignature | null;
}

/** Constructor configuration for the detector. */
export interface DetectorConfig {
    weights?: Partial<HybridDistanceWeights>;
    thresholds?: Partial<ClusteringThresholds>;
}

/**
 * Detect candidate organic key clusters over a set of columns.
 * Output is unrefined — pass through {@link OrganicKeyClusterRefiner} for naming,
 * outlier ejection, sub-cluster splitting, and the isUsefulOrganicKey verdict.
 */
export class OrganicKeyClusterDetector {
    private readonly weights: HybridDistanceWeights;
    private readonly thresholds: ClusteringThresholds;

    constructor(config: DetectorConfig = {}) {
        this.weights = { ...DEFAULT_HYBRID_WEIGHTS, ...config.weights };
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    }

    /** Run the full detection pipeline against the input columns. */
    public detect(columns: DetectorInputColumn[]): OrganicKeyCluster[] {
        const n = columns.length;
        if (n < this.thresholds.minClusterSize) return [];

        // Step 1 — Pre-normalize embeddings into Float32Array for fast dot-product
        const normalizedEmbeddings = columns.map((c) =>
            c.embedding ? unitNormalize(c.embedding) : null,
        );

        // Step 2 — Build sparse candidate edges (top-K per column above threshold)
        const edges = this.buildCandidateEdges(columns, normalizedEmbeddings);

        // Step 3 — Sort edges by distance ascending
        edges.sort((a, b) => a.distance - b.distance);

        // Step 4 — Agglomerative complete-linkage via union-find
        const uf = new UnionFind(n);
        for (const edge of edges) {
            if (edge.distance > this.thresholds.mergeMax) break;
            const ra = uf.find(edge.i);
            const rb = uf.find(edge.j);
            if (ra === rb) continue;

            // Complete-linkage check — every pair across the two clusters must stay under threshold
            if (this.canMerge(uf.members(ra), uf.members(rb), columns, normalizedEmbeddings)) {
                uf.union(ra, rb);
            }
        }

        // Step 5 — Gather final clusters, filter by size + table-span requirements
        return this.buildClusters(uf, columns, normalizedEmbeddings);
    }

    /** Compute hybrid distance between two columns using active signals. */
    public computeDistance(
        i: number,
        j: number,
        columns: DetectorInputColumn[],
        normalizedEmbeddings: (Float32Array | null)[],
    ): number {
        const colA = columns[i];
        const colB = columns[j];

        // Hard prefilter: type compatibility
        if (!areTypesCompatible(colA.dataType, colB.dataType)) {
            return Number.POSITIVE_INFINITY;
        }

        let weightedSum = 0;
        let totalWeight = 0;

        // Signal 1: name similarity (always active when weight > 0)
        if (this.weights.nameSimilarity > 0) {
            const nameDistance = 1 - weightedColumnNameSimilarity(colA, colB);
            weightedSum += this.weights.nameSimilarity * nameDistance;
            totalWeight += this.weights.nameSimilarity;
        }

        // Signal 2: embedding cosine distance (active when both columns have embeddings)
        if (this.weights.embeddingDistance > 0) {
            const eA = normalizedEmbeddings[i];
            const eB = normalizedEmbeddings[j];
            if (eA && eB) {
                const cos = dot(eA, eB);
                const embDistance = Math.max(0, 1 - cos);
                weightedSum += this.weights.embeddingDistance * embDistance;
                totalWeight += this.weights.embeddingDistance;
            }
        }

        // Signal 3: MinHash value overlap (active when both columns have signatures)
        if (this.weights.valueOverlap > 0) {
            const sA = colA.valueSignature;
            const sB = colB.valueSignature;
            if (sA && sB) {
                const overlapDist = minhashDistance(sA, sB);
                weightedSum += this.weights.valueOverlap * overlapDist;
                totalWeight += this.weights.valueOverlap;
            }
        }

        if (totalWeight === 0) return Number.POSITIVE_INFINITY;
        return weightedSum / totalWeight;
    }

    private buildCandidateEdges(
        columns: DetectorInputColumn[],
        normalizedEmbeddings: (Float32Array | null)[],
    ): CandidateEdge[] {
        const n = columns.length;
        const edges: CandidateEdge[] = [];
        const topK = this.thresholds.topKNeighbors;
        const maxDist = this.thresholds.candidateEdgeMax;

        for (let i = 0; i < n; i++) {
            // For each column, find its top-K closest neighbors above threshold
            const neighbors: { j: number; distance: number }[] = [];
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const d = this.computeDistance(i, j, columns, normalizedEmbeddings);
                if (d <= maxDist) neighbors.push({ j, distance: d });
            }
            neighbors.sort((a, b) => a.distance - b.distance);
            for (const n of neighbors.slice(0, topK)) {
                if (i < n.j) edges.push({ i, j: n.j, distance: n.distance });
            }
        }

        return edges;
    }

    private canMerge(
        membersA: number[],
        membersB: number[],
        columns: DetectorInputColumn[],
        normalizedEmbeddings: (Float32Array | null)[],
    ): boolean {
        const threshold = this.thresholds.mergeMax;
        for (const a of membersA) {
            for (const b of membersB) {
                const d = this.computeDistance(a, b, columns, normalizedEmbeddings);
                if (d > threshold) return false;
            }
        }
        return true;
    }

    private buildClusters(
        uf: UnionFind,
        columns: DetectorInputColumn[],
        normalizedEmbeddings: (Float32Array | null)[],
    ): OrganicKeyCluster[] {
        const seen = new Set<number>();
        const clusters: OrganicKeyCluster[] = [];

        for (let i = 0; i < columns.length; i++) {
            const root = uf.find(i);
            if (seen.has(root)) continue;
            const memberIdxs = uf.members(root);
            if (memberIdxs.length < this.thresholds.minClusterSize) continue;

            const distinctTables = new Set(
                memberIdxs.map((idx) => `${columns[idx].schema}.${columns[idx].table}`),
            );
            if (distinctTables.size < this.thresholds.minDistinctTables) continue;

            seen.add(root);

            // Compute max intra-cluster distance for reporting
            let maxIntra = 0;
            for (let a = 0; a < memberIdxs.length; a++) {
                for (let b = a + 1; b < memberIdxs.length; b++) {
                    const d = this.computeDistance(
                        memberIdxs[a],
                        memberIdxs[b],
                        columns,
                        normalizedEmbeddings,
                    );
                    if (d > maxIntra && Number.isFinite(d)) maxIntra = d;
                }
            }

            const members: OrganicKeyClusterMember[] = memberIdxs.map((idx) => ({
                schema: columns[idx].schema,
                table: columns[idx].table,
                column: columns[idx].column,
                participatesInFK: !!columns[idx].participatesInFK,
                fkTarget: columns[idx].fkTarget ?? null,
            }));

            clusters.push({
                id: `cluster_${clusters.length}`,
                concept: '', // Filled in by refiner
                normalization: 'LowerCaseTrim', // Default; refiner may override
                members,
                confidence: 0, // Filled in by refiner
                reasoning: '', // Filled in by refiner
                tags: computeStructuralTags(members, columns, memberIdxs),
                maxIntraDistance: maxIntra,
                distanceWeights: { ...this.weights },
            });
        }

        // Sort biggest-first for review ergonomics
        clusters.sort((a, b) => b.members.length - a.members.length);
        return clusters;
    }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface CandidateEdge {
    i: number;
    j: number;
    distance: number;
}

class UnionFind {
    private parent: Int32Array;
    private memberLists: number[][];

    constructor(n: number) {
        this.parent = new Int32Array(n);
        this.memberLists = new Array(n);
        for (let i = 0; i < n; i++) {
            this.parent[i] = i;
            this.memberLists[i] = [i];
        }
    }

    find(x: number): number {
        let r = x;
        while (this.parent[r] !== r) r = this.parent[r];
        while (this.parent[x] !== r) {
            const next = this.parent[x];
            this.parent[x] = r;
            x = next;
        }
        return r;
    }

    union(a: number, b: number): number {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra === rb) return ra;
        const [keep, drop] =
            this.memberLists[ra].length >= this.memberLists[rb].length ? [ra, rb] : [rb, ra];
        this.parent[drop] = keep;
        this.memberLists[keep] = this.memberLists[keep].concat(this.memberLists[drop]);
        this.memberLists[drop] = [];
        return keep;
    }

    members(root: number): number[] {
        return this.memberLists[root];
    }
}

function unitNormalize(vec: Float32Array | number[]): Float32Array {
    const out = new Float32Array(vec.length);
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
    return out;
}

function dot(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}

/**
 * Hard prefilter: two columns can only be clustered if their SQL types are compatible.
 * Conservatively groups types into compatibility classes.
 */
function areTypesCompatible(a: string, b: string): boolean {
    return getTypeClass(a) === getTypeClass(b);
}

function getTypeClass(dataType: string): string {
    if (!dataType) return 'unknown';
    const t = dataType.toLowerCase().trim();
    if (t.includes('uniqueidentifier') || t === 'uuid') return 'guid';
    if (
        t.includes('int') ||
        t.includes('numeric') ||
        t.includes('decimal') ||
        t.includes('float') ||
        t.includes('real') ||
        t.includes('money') ||
        t.includes('smallmoney')
    ) {
        return 'numeric';
    }
    if (
        t.includes('char') ||
        t.includes('text') ||
        t.includes('varchar') ||
        t.includes('nvarchar') ||
        t.includes('nchar')
    ) {
        return 'string';
    }
    if (t.includes('date') || t.includes('time')) return 'datetime';
    if (t.includes('bit') || t === 'boolean') return 'boolean';
    if (t.includes('binary') || t.includes('blob') || t.includes('image')) return 'binary';
    return 'other';
}

/** Compute structural tags for a cluster based on the FK status of its members. */
function computeStructuralTags(
    members: OrganicKeyClusterMember[],
    columns: DetectorInputColumn[],
    memberIdxs: number[],
): OrganicKeyClusterTag[] {
    const tags = new Set<OrganicKeyClusterTag>();

    const allFK = members.every((m) => m.participatesInFK);
    const allPK = memberIdxs.every((idx) => columns[idx].isPrimaryKey);
    const noFK = members.every((m) => !m.participatesInFK);
    const noPK = memberIdxs.every((idx) => !columns[idx].isPrimaryKey);

    if (allFK) {
        // Check if all FK to same target
        const targets = new Set(
            members
                .map((m) => m.fkTarget)
                .filter((t): t is { schema: string; table: string; column: string } => !!t)
                .map((t) => `${t.schema}.${t.table}.${t.column}`),
        );
        if (targets.size === 1) tags.add('fk-redundant-single-target');
        else tags.add('fk-fragmented');
    } else if (noFK && allPK) {
        tags.add('pk-to-pk');
    } else if (noFK && noPK) {
        tags.add('no-fk-no-pk');
    } else {
        tags.add('mixed');
    }

    return Array.from(tags);
}
