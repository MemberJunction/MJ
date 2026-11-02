/**
 * @fileoverview Graph Overlay configuration, authority hierarchy, and concept/edge contracts
 * for projecting `MJ: Content Sources` (`Content Items`, `Chunks`, `Tags`) into `MJ: Graphs`
 * and `MJ: Graph Concepts`.
 *
 * Client- and server-safe: lives in `@memberjunction/content-pipeline-base` so stages,
 * synthesizers, and UI configuration editors share one definition.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** Partition type of an `MJ: Graphs` record. */
export type SemanticGraphType = 'Canon' | 'Knowledge' | 'Network' | 'Custom';

/** Classification of an `MJ: Graph Concepts` node within its owning graph. */
export type GraphConceptType = 'Domain' | 'Term' | 'Policy' | 'Metric' | 'Process';

/**
 * Governance / evidentiary weight of a source document or concept.
 * Higher-ranked tiers outrank lower tiers when resolving contradictions across multiple Content Sources.
 */
export type GraphAuthorityTier =
    | 'Bylaws'
    | 'BoardPolicy'
    | 'ExecutiveSOP'
    | 'DepartmentPractice'
    | 'Reference'
    | 'Inferred';

/** Numeric precedence rank for each `GraphAuthorityTier` (higher = more authoritative). */
export const AuthorityTierPrecedence: Readonly<Record<GraphAuthorityTier, number>> = {
    Bylaws: 100,
    BoardPolicy: 80,
    ExecutiveSOP: 60,
    DepartmentPractice: 40,
    Reference: 20,
    Inferred: 10,
} as const;

/** Returns the numeric precedence rank of an authority tier. */
export function GetAuthorityTierRank(tier: GraphAuthorityTier | undefined | null): number {
    return tier ? (AuthorityTierPrecedence[tier] ?? AuthorityTierPrecedence.Reference) : AuthorityTierPrecedence.Reference;
}

/**
 * How extracted concepts from a Content Source interact with the target Graph's existing `GraphConcept`s.
 * Mirrors `TagTaxonomyMode` on `MJ: Content Sources`.
 */
export type ConceptTaxonomyMode =
    /** Only link chunks (`SourcedFrom` / `Mentions`) to existing `GraphConcept`s; never create new concepts. */
    | 'constrained'
    /** Match existing concepts and propose new `GraphConcept`s / `GraphEdge`s with `Status = 'Proposed'`. */
    | 'propose-only'
    /** Automatically create/merge `GraphConcept`s and `GraphEdge`s with `Status = 'Approved'` (GraphRAG default). */
    | 'auto-grow';

/**
 * Depth of grounding against live MemberJunction metadata (`MJ: Entities`, `MJ: Queries`, `Actions`, `Skills`, `Workflows`).
 */
export type GraphGroundingMode =
    /** Document-only GraphRAG: extracts concepts, hierarchies, and chunk/tag provenance edges. */
    | 'none'
    /** Also resolves and links concepts to `MJ: Entities`, `Entity Fields`, `Alternate Base Views`, and `MJ: Queries`. */
    | 'schema-and-queries'
    /** Full Canon mode: links to `Entities`, `Queries`, `Actions`, `AI Skills`, and Flow `Workflows`, plus Doc-vs-SQL contradiction checks. */
    | 'full-canon';

/**
 * Per-source or per-run Graph Overlay configuration stored under `ContentSource.Configuration.GraphOverlay`.
 */
export interface ContentSourceGraphOverlayConfig {
    /** When true, runs concept & graph-edge synthesis over ingested Content Items and Chunks. */
    EnableGraphOverlay?: boolean;
    /** Target `MJ: Graphs` ID. Overrides or supplements `ContentSource.GraphID`. */
    GraphID?: string | null;
    /** Target graph's `GraphType`, used to select sensible defaults (`'Canon'` vs `'Knowledge'`). */
    TargetGraphType?: SemanticGraphType;
    /** How new concepts are handled. Defaults to `'propose-only'` for `'Canon'` graphs and `'auto-grow'` for `'Knowledge'` graphs. */
    ConceptTaxonomyMode?: ConceptTaxonomyMode;
    /** Authority tier stamped on concepts and `SourcedFrom` edges originating from this Content Source. */
    AuthorityTier?: GraphAuthorityTier;
    /** Metadata grounding depth. Defaults to `'full-canon'` for `'Canon'` graphs and `'none'` for `'Knowledge'` graphs. */
    GroundingMode?: GraphGroundingMode;
    /** Minimum lexical/vector similarity score (0..1) to bind a chunk/tag cluster to an existing `GraphConcept`. Default 0.82. */
    ConceptMatchThreshold?: number;
    /** Maximum new `GraphConcept`s that may be proposed/created in a single pipeline run. `null` = unlimited. */
    MaxNewConceptsPerRun?: number | null;
    /** Registration key of the `BaseConceptSynthesizer` implementation to use. Defaults to `'ManagedPrompt'`. */
    SynthesizerKey?: string;
}

/** Fully-resolved Graph Overlay settings with defaults filled in based on `TargetGraphType`. */
export interface ResolvedGraphOverlayConfig {
    readonly EnableGraphOverlay: boolean;
    readonly GraphID: string | null;
    readonly TargetGraphType: SemanticGraphType;
    readonly ConceptTaxonomyMode: ConceptTaxonomyMode;
    readonly AuthorityTier: GraphAuthorityTier;
    readonly GroundingMode: GraphGroundingMode;
    readonly ConceptMatchThreshold: number;
    readonly MaxNewConceptsPerRun: number | null;
    readonly SynthesizerKey: string;
}

/**
 * Resolves `ContentSourceGraphOverlayConfig` across configuration layers
 * (`ContentSourceType.Configuration` → `ContentSource.Configuration` → Run `Configuration`),
 * applying defaults tailored to whether the target graph is `'Canon'` or `'Knowledge'`.
 */
export function ResolveGraphOverlayConfig(
    explicitGraphID: string | null | undefined,
    ...configurations: Array<Readonly<Record<string, unknown>> | undefined>
): ResolvedGraphOverlayConfig {
    const merged: ContentSourceGraphOverlayConfig = {};

    for (const cfg of configurations) {
        if (!cfg) continue;
        const optionsObj = cfg.Options as Record<string, unknown> | undefined;
        const overlay = (cfg.GraphOverlay ?? optionsObj?.GraphOverlay ?? cfg) as Partial<ContentSourceGraphOverlayConfig>;

        if (typeof overlay.EnableGraphOverlay === 'boolean') {
            merged.EnableGraphOverlay = overlay.EnableGraphOverlay;
        }
        if (typeof overlay.GraphID === 'string' && overlay.GraphID.trim().length > 0) {
            merged.GraphID = overlay.GraphID.trim();
        }
        if (isValidGraphType(overlay.TargetGraphType)) {
            merged.TargetGraphType = overlay.TargetGraphType;
        }
        if (isValidTaxonomyMode(overlay.ConceptTaxonomyMode)) {
            merged.ConceptTaxonomyMode = overlay.ConceptTaxonomyMode;
        }
        if (isValidAuthorityTier(overlay.AuthorityTier)) {
            merged.AuthorityTier = overlay.AuthorityTier;
        }
        if (isValidGroundingMode(overlay.GroundingMode)) {
            merged.GroundingMode = overlay.GroundingMode;
        }
        if (
            typeof overlay.ConceptMatchThreshold === 'number' &&
            Number.isFinite(overlay.ConceptMatchThreshold) &&
            overlay.ConceptMatchThreshold >= 0 &&
            overlay.ConceptMatchThreshold <= 1
        ) {
            merged.ConceptMatchThreshold = overlay.ConceptMatchThreshold;
        }
        if (
            overlay.MaxNewConceptsPerRun === null ||
            (typeof overlay.MaxNewConceptsPerRun === 'number' &&
                Number.isFinite(overlay.MaxNewConceptsPerRun) &&
                overlay.MaxNewConceptsPerRun >= 0)
        ) {
            merged.MaxNewConceptsPerRun = overlay.MaxNewConceptsPerRun;
        }
        if (typeof overlay.SynthesizerKey === 'string' && overlay.SynthesizerKey.trim().length > 0) {
            merged.SynthesizerKey = overlay.SynthesizerKey.trim();
        }
    }

    const graphID = merged.GraphID || explicitGraphID?.trim() || null;
    const graphType: SemanticGraphType = merged.TargetGraphType ?? 'Knowledge';
    const isCanon = graphType === 'Canon';

    return {
        EnableGraphOverlay: merged.EnableGraphOverlay ?? graphID !== null,
        GraphID: graphID,
        TargetGraphType: graphType,
        ConceptTaxonomyMode: merged.ConceptTaxonomyMode ?? (isCanon ? 'propose-only' : 'auto-grow'),
        AuthorityTier: merged.AuthorityTier ?? (isCanon ? 'ExecutiveSOP' : 'Reference'),
        GroundingMode: merged.GroundingMode ?? (isCanon ? 'full-canon' : 'none'),
        ConceptMatchThreshold: merged.ConceptMatchThreshold ?? 0.82,
        MaxNewConceptsPerRun: merged.MaxNewConceptsPerRun ?? null,
        SynthesizerKey: merged.SynthesizerKey ?? 'ManagedPrompt',
    };
}

function isValidGraphType(val: unknown): val is SemanticGraphType {
    return val === 'Canon' || val === 'Knowledge' || val === 'Network' || val === 'Custom';
}

function isValidTaxonomyMode(val: unknown): val is ConceptTaxonomyMode {
    return val === 'constrained' || val === 'propose-only' || val === 'auto-grow';
}

function isValidAuthorityTier(val: unknown): val is GraphAuthorityTier {
    return (
        val === 'Bylaws' ||
        val === 'BoardPolicy' ||
        val === 'ExecutiveSOP' ||
        val === 'DepartmentPractice' ||
        val === 'Reference' ||
        val === 'Inferred'
    );
}

function isValidGroundingMode(val: unknown): val is GraphGroundingMode {
    return val === 'none' || val === 'schema-and-queries' || val === 'full-canon';
}
