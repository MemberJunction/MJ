/**
 * Business Concept Projector — projects generic semantic embeddings onto a
 * business-concept-aligned subspace anchored on PR #2193 organic key examples.
 *
 * Motivation: organic keys are *defined* as value-based matches on BUSINESS-MEANINGFUL
 * data (email, phone, tax ID, domain, customer ID, etc). The intent of this module was
 * to rotate the embedding space so business axes dominate and non-business columns
 * (audit timestamps, replication GUIDs) project weakly.
 *
 * EMPIRICAL FINDING (2026-05 against AdventureWorks): projection into a small
 * concept space (~14 anchor axes) DOES separate business from non-business reliably,
 * but it ALSO over-merges distinct business concepts. BusinessEntityID, ProductID,
 * CustomerID, etc. all score similarly on the "business identifier" anchor — so they
 * collapse into a single mega-cluster (108+ columns observed) and we lose the cross-
 * concept discrimination raw 1536-dim embeddings preserve.
 *
 * The module is retained for two reasons:
 *   1. As a future POST-FILTER gate: project each cluster's centroid and reject
 *      clusters whose average business-axis score is low (or audit/system scores
 *      dominate). The projection is correct for THIS purpose — it separates
 *      business from non-business cleanly.
 *   2. For experimentation — opt-in via `embedding.useBusinessProjection: true`.
 *
 * The runtime default is OFF. See tools/organic-key-cluster-poc/compare-projection-modes.mjs
 * for the side-by-side validation that produced this conclusion.
 *
 * For each column, the projector computes:
 *   project(col) = [ dot(col, anchor_1), dot(col, anchor_2), ..., dot(col, anchor_N) ]
 */

import { EmbeddingProvider } from './EmbeddingProvider.js';

/**
 * Canonical business-concept anchors derived from PR #2193 organic key examples.
 *
 * Each anchor describes a business-meaningful value category an organic key would match on.
 * The negative anchors (audit timestamps, internal/system identifiers) are intentionally
 * included so non-business columns project strongly onto those axes and away from the
 * business axes — making them easy to distinguish from real organic key candidates.
 */
/** Positive (business-concept) anchors — value-matchable business identifiers / attributes. */
export const DEFAULT_POSITIVE_ANCHORS: readonly string[] = [
    'Email address used to identify or contact a person, customer, subscriber, or business across systems',
    'Phone number used to reach a person, contact, customer, or business',
    'Tax identifier, social security number, national ID, or government-issued personal identifier',
    'Domain name or web address used to identify a company, organization, or online resource',
    'Customer, contact, person, member, subscriber, or user identifier shared across business systems',
    'Product, item, SKU, part number, or catalog identifier shared across business systems',
    'Order, invoice, transaction, payment, or shipment reference identifier',
    'Geographic, jurisdictional, or currency code such as country, state, region, postal, or ISO code',
    'Employee, vendor, supplier, partner, store, or organization identifier',
    'Account, subscription, license, or contract identifier shared across systems',
];

/** Negative (non-business) anchors — system-level fields that should NOT be organic keys. */
export const DEFAULT_NEGATIVE_ANCHORS: readonly string[] = [
    'System-generated audit timestamp such as created date, modified date, last updated, or insert time',
    'Internal sequence, replication GUID, row version, system-generated unique identifier, or technical row marker',
    'Generic descriptive text content such as a name, title, label, description, or notes field with no specific business meaning',
    'Numeric quantity, measurement, amount, count, percentage, or aggregate metric',
];

/**
 * Default anchor list (positive then negative). Concept-axis projection scores
 * each column's similarity to every anchor in this order.
 */
export const DEFAULT_BUSINESS_ANCHORS: readonly string[] = [
    ...DEFAULT_POSITIVE_ANCHORS,
    ...DEFAULT_NEGATIVE_ANCHORS,
];

export interface BusinessConceptProjectorOptions {
    /** Override anchor texts. Falls back to DEFAULT_BUSINESS_ANCHORS if omitted. */
    anchors?: readonly string[];
    /** Optional additional anchors appended to the defaults (use for domain-specific concepts). */
    additionalAnchors?: readonly string[];
    /**
     * Number of anchors at the END of the array that are NEGATIVE (audit/system).
     * Default is the number of DEFAULT_NEGATIVE_ANCHORS when using the default list,
     * or 0 when fully custom anchors are supplied (caller must pass this explicitly
     * if their custom anchors include negative ones).
     */
    negativeAnchorCount?: number;
}

/** Per-cluster business-vs-anti score from the projector gate. */
export interface ClusterBusinessScore {
    /** Sum of cosine similarities with positive (business) anchors. */
    businessScore: number;
    /** Sum of cosine similarities with negative (audit/system) anchors. */
    antiScore: number;
    /** businessScore - antiScore. Higher = more business-like. */
    netBusinessScore: number;
    /** Per-anchor breakdown (length = numAnchors). */
    axisScores: Float32Array;
    /** Index of the highest-scoring anchor. */
    dominantAnchorIndex: number;
    /** Kind of the dominant anchor. */
    dominantAnchorKind: 'positive' | 'negative';
}

/**
 * Builds and applies a business-concept projection over generic embeddings.
 */
export class BusinessConceptProjector {
    private readonly anchorVectors: Float32Array[];
    private readonly anchors: readonly string[];
    /** Count of NEGATIVE anchors at the tail end of the anchor array. */
    private readonly negativeCount: number;

    private constructor(
        anchors: readonly string[],
        anchorVectors: Float32Array[],
        negativeCount: number,
    ) {
        this.anchors = anchors;
        this.anchorVectors = anchorVectors;
        this.negativeCount = negativeCount;
    }

    /**
     * Build a projector by embedding the anchor texts using the given provider.
     * Anchors are normalized to unit length so projection becomes cosine similarity.
     */
    public static async build(
        embedder: EmbeddingProvider,
        opts: BusinessConceptProjectorOptions = {},
    ): Promise<BusinessConceptProjector> {
        const baseAnchors = opts.anchors ?? DEFAULT_BUSINESS_ANCHORS;
        const anchors: readonly string[] = opts.additionalAnchors
            ? [...baseAnchors, ...opts.additionalAnchors]
            : baseAnchors;
        if (anchors.length === 0) {
            throw new Error('BusinessConceptProjector requires at least one anchor');
        }
        const vectors = await embedder.embed([...anchors]);
        const normalized = vectors.map(unitNormalize);
        const negativeCount = resolveNegativeCount(opts, baseAnchors, anchors.length);
        return new BusinessConceptProjector(anchors, normalized, negativeCount);
    }

    /** Test-friendly factory that accepts pre-built anchor vectors. */
    public static withAnchorVectors(
        anchors: readonly string[],
        anchorVectors: Float32Array[],
        negativeAnchorCount = 0,
    ): BusinessConceptProjector {
        if (anchors.length !== anchorVectors.length) {
            throw new Error(
                `Anchor count mismatch: ${anchors.length} texts vs ${anchorVectors.length} vectors`,
            );
        }
        return new BusinessConceptProjector(
            anchors,
            anchorVectors.map(unitNormalize),
            negativeAnchorCount,
        );
    }

    /**
     * Project a single raw embedding into business-concept space.
     * Returns an N-dim vector where N = number of anchors. Each component is the
     * cosine similarity between the input and the corresponding anchor.
     *
     * The output vector is NOT unit-normalized — the detector normalizes vectors
     * before computing distance, so the magnitudes (which encode business
     * strength) flow through as direction information.
     */
    public project(rawEmbedding: Float32Array | number[]): Float32Array {
        const normalized = unitNormalize(rawEmbedding);
        const out = new Float32Array(this.anchorVectors.length);
        for (let i = 0; i < this.anchorVectors.length; i++) {
            out[i] = dot(normalized, this.anchorVectors[i]);
        }
        return out;
    }

    /** Project a batch of embeddings. Preserves input order. */
    public projectAll(rawEmbeddings: (Float32Array | number[])[]): Float32Array[] {
        return rawEmbeddings.map((e) => this.project(e));
    }

    public get numAnchors(): number {
        return this.anchorVectors.length;
    }

    public get anchorTexts(): readonly string[] {
        return this.anchors;
    }

    /** Number of positive (business) anchors. */
    public get positiveAnchorCount(): number {
        return this.anchorVectors.length - this.negativeCount;
    }

    /** Number of negative (audit / system) anchors. */
    public get negativeAnchorCount(): number {
        return this.negativeCount;
    }

    /**
     * Score a single raw embedding against the positive vs negative anchors.
     * Used by the cluster-level gate to decide whether a cluster's centroid
     * represents a business concept or a system/audit field.
     */
    public scoreColumn(rawEmbedding: Float32Array | number[]): ClusterBusinessScore {
        const axisScores = this.project(rawEmbedding);
        return this.scoreFromAxis(axisScores);
    }

    /**
     * Score a cluster by averaging its member embeddings (centroid) and projecting
     * the result through the anchor axes. Returns separate business and anti
     * scores so the runner can apply a gate threshold.
     *
     * Centroid averaging operates on raw embeddings — the caller must pass the
     * RAW per-column embeddings here, not pre-projected vectors.
     */
    public scoreCluster(memberEmbeddings: (Float32Array | number[])[]): ClusterBusinessScore {
        if (memberEmbeddings.length === 0) {
            throw new Error('scoreCluster requires at least one member embedding');
        }
        // Compute the centroid (mean of unit-normalized member vectors)
        const dim = memberEmbeddings[0].length;
        const centroid = new Float32Array(dim);
        for (const member of memberEmbeddings) {
            const normalized = unitNormalize(member);
            for (let i = 0; i < dim; i++) centroid[i] += normalized[i];
        }
        for (let i = 0; i < dim; i++) centroid[i] /= memberEmbeddings.length;
        return this.scoreColumn(centroid);
    }

    /** Helper: given the per-axis scores, produce a ClusterBusinessScore breakdown. */
    private scoreFromAxis(axisScores: Float32Array): ClusterBusinessScore {
        const positiveEnd = this.anchorVectors.length - this.negativeCount;
        let businessScore = 0;
        let antiScore = 0;
        let dominantAnchorIndex = 0;
        let dominantValue = -Infinity;
        for (let i = 0; i < axisScores.length; i++) {
            const v = axisScores[i];
            if (i < positiveEnd) businessScore += v;
            else antiScore += v;
            if (v > dominantValue) {
                dominantValue = v;
                dominantAnchorIndex = i;
            }
        }
        const dominantAnchorKind: 'positive' | 'negative' =
            dominantAnchorIndex < positiveEnd ? 'positive' : 'negative';
        return {
            businessScore,
            antiScore,
            netBusinessScore: businessScore - antiScore,
            axisScores,
            dominantAnchorIndex,
            dominantAnchorKind,
        };
    }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Resolve how many anchors at the tail of the array are negative.
 * Defaults to DEFAULT_NEGATIVE_ANCHORS.length when the user is using the default
 * anchor list; otherwise zero unless explicitly specified by the caller.
 */
function resolveNegativeCount(
    opts: BusinessConceptProjectorOptions,
    baseAnchors: readonly string[],
    finalLength: number,
): number {
    if (typeof opts.negativeAnchorCount === 'number') {
        return Math.min(Math.max(0, opts.negativeAnchorCount), finalLength);
    }
    // If the caller used the default anchor list, we know which are negative
    if (baseAnchors === DEFAULT_BUSINESS_ANCHORS) {
        return DEFAULT_NEGATIVE_ANCHORS.length;
    }
    return 0;
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
