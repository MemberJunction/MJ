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
export const DEFAULT_BUSINESS_ANCHORS: readonly string[] = [
    // ─── Positive business anchors ──────────────────────────────────────────
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

    // ─── Negative anchors (non-business; tag these as distinct so the detector can see them apart) ───
    'System-generated audit timestamp such as created date, modified date, last updated, or insert time',
    'Internal sequence, replication GUID, row version, system-generated unique identifier, or technical row marker',
    'Generic descriptive text content such as a name, title, label, description, or notes field with no specific business meaning',
    'Numeric quantity, measurement, amount, count, percentage, or aggregate metric',
];

export interface BusinessConceptProjectorOptions {
    /** Override anchor texts. Falls back to DEFAULT_BUSINESS_ANCHORS if omitted. */
    anchors?: readonly string[];
    /** Optional additional anchors appended to the defaults (use for domain-specific concepts). */
    additionalAnchors?: readonly string[];
}

/**
 * Builds and applies a business-concept projection over generic embeddings.
 */
export class BusinessConceptProjector {
    private readonly anchorVectors: Float32Array[];
    private readonly anchors: readonly string[];

    private constructor(anchors: readonly string[], anchorVectors: Float32Array[]) {
        this.anchors = anchors;
        this.anchorVectors = anchorVectors;
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
        return new BusinessConceptProjector(anchors, normalized);
    }

    /** Test-friendly factory that accepts pre-built anchor vectors. */
    public static withAnchorVectors(
        anchors: readonly string[],
        anchorVectors: Float32Array[],
    ): BusinessConceptProjector {
        if (anchors.length !== anchorVectors.length) {
            throw new Error(
                `Anchor count mismatch: ${anchors.length} texts vs ${anchorVectors.length} vectors`,
            );
        }
        return new BusinessConceptProjector(anchors, anchorVectors.map(unitNormalize));
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
}

// ─── Internal helpers ───────────────────────────────────────────────────────

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
