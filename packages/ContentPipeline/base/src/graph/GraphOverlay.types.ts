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

/**
 * Seeded `MJ: Graph Types` names (`Canon`, `Knowledge`, `Network`, `Custom`) plus any
 * organization-configured graph type defined in `MJ: Graph Types`.
 */
export type SemanticGraphType = 'Canon' | 'Knowledge' | 'Network' | 'Custom' | (string & {});

/**
 * Seeded `MJ: Graph Concept Types` names (`Policy`, `Metric`, `Process`, `Role`, `Domain`, `Term`)
 * plus any organization-configured concept type defined in `MJ: Graph Concept Types`.
 */
export type GraphConceptType = 'Policy' | 'Metric' | 'Process' | 'Role' | 'Domain' | 'Term' | (string & {});

/** Descriptor for a row in `MJ: Graph Types` (`__mj.GraphType`). */
export interface GraphTypeDescriptor {
    readonly ID: string;
    readonly Name: SemanticGraphType;
    readonly Description?: string | null;
    /** When true, graphs of this type participate in governed institutional Canon. */
    readonly IsCanon: boolean;
    /** Sort and priority rank order (lower = higher priority). */
    readonly Rank: number;
    readonly IconClass?: string | null;
}

/** Descriptor for a row in `MJ: Graph Concept Types` (`__mj.GraphConceptType`). */
export interface GraphConceptTypeDescriptor {
    readonly ID: string;
    readonly Name: GraphConceptType;
    readonly Description?: string | null;
    /** Precedence and display rank order (lower = higher priority, e.g., Policy = 10, Term = 60). */
    readonly Rank: number;
    readonly IconClass?: string | null;
}

/** Default rank order for seeded `MJ: Graph Concept Types` (lower = higher priority). */
export const DefaultConceptTypeRanks: Readonly<Record<string, number>> = {
    Policy: 10,
    Metric: 20,
    Process: 30,
    Role: 40,
    Domain: 50,
    Term: 60,
} as const;

/**
 * Returns the rank order of a `GraphConceptType` (lower = higher priority), consulting
 * organization-configured `MJ: Graph Concept Types` descriptors first and falling back to
 * {@link DefaultConceptTypeRanks} (default `100`).
 */
export function GetConceptTypeRank(
    conceptType: GraphConceptType | undefined | null,
    configuredTypes?: readonly GraphConceptTypeDescriptor[],
): number {
    if (!conceptType) return 100;
    if (configuredTypes && configuredTypes.length > 0) {
        const lower = conceptType.trim().toLowerCase();
        const match = configuredTypes.find((t) => t.Name.trim().toLowerCase() === lower);
        if (match) return match.Rank;
    }
    return DefaultConceptTypeRanks[conceptType] ?? 100;
}

/**
 * Governance / evidentiary weight of a source document or concept.
 * Seeded `MJ: Graph Authority Tiers` names plus any organization-configured authority tier defined in `MJ: Graph Authority Tiers`.
 * Higher-ranked tiers outrank lower tiers when resolving contradictions across multiple Content Sources.
 */
export type GraphAuthorityTier =
    | 'Bylaws'
    | 'BoardPolicy'
    | 'Board Policy'
    | 'ExecutiveSOP'
    | 'Executive SOP'
    | 'DepartmentPractice'
    | 'Department Practice'
    | 'Reference'
    | 'Inferred'
    | (string & {});

/** Descriptor for a row in `MJ: Graph Authority Tiers` (`__mj.GraphAuthorityTier`). */
export interface GraphAuthorityTierDescriptor {
    readonly ID: string;
    readonly Name: GraphAuthorityTier;
    readonly Description?: string | null;
    /** Evidentiary precedence rank (higher = more authoritative, e.g., Bylaws = 100, Reference = 20). */
    readonly Rank: number;
    readonly IconClass?: string | null;
}

/** Numeric precedence rank for seeded `GraphAuthorityTier` values (higher = more authoritative). */
export const AuthorityTierPrecedence: Readonly<Record<string, number>> = {
    Bylaws: 100,
    BoardPolicy: 80,
    'Board Policy': 80,
    ExecutiveSOP: 60,
    'Executive SOP': 60,
    DepartmentPractice: 40,
    'Department Practice': 40,
    Reference: 20,
    Inferred: 10,
} as const;

/**
 * Returns the numeric precedence rank of an authority tier (higher = more authoritative),
 * consulting organization-configured `MJ: Graph Authority Tiers` descriptors first and
 * falling back to {@link AuthorityTierPrecedence} (default `20`).
 */
export function GetAuthorityTierRank(
    tier: GraphAuthorityTier | undefined | null,
    configuredTiers?: readonly GraphAuthorityTierDescriptor[],
): number {
    if (!tier) return AuthorityTierPrecedence.Reference;
    const normalized = tier.trim().toLowerCase().replace(/\s+/g, '');
    if (configuredTiers && configuredTiers.length > 0) {
        const match = configuredTiers.find(
            (t) =>
                t.Name.trim().toLowerCase().replace(/\s+/g, '') === normalized ||
                t.ID.trim().toLowerCase() === tier.trim().toLowerCase(),
        );
        if (match) return match.Rank;
    }
    for (const [key, rank] of Object.entries(AuthorityTierPrecedence)) {
        if (key.toLowerCase().replace(/\s+/g, '') === normalized) {
            return rank;
        }
    }
    return AuthorityTierPrecedence.Reference;
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
    /** Target graph's `GraphType` name, used to select sensible defaults (`'Canon'` vs `'Knowledge'`). */
    TargetGraphType?: SemanticGraphType;
    /** Explicit override or resolved `GraphType.IsCanon` flag indicating whether the target graph feeds institutional Canon. */
    IsCanon?: boolean;
    /** How new concepts are handled. Defaults to `'propose-only'` when `IsCanon` is true and `'auto-grow'` otherwise. */
    ConceptTaxonomyMode?: ConceptTaxonomyMode;
    /** Authority tier stamped on concepts and `SourcedFrom` edges originating from this Content Source. */
    AuthorityTier?: GraphAuthorityTier;
    /** Metadata grounding depth. Defaults to `'full-canon'` when `IsCanon` is true and `'none'` otherwise. */
    GroundingMode?: GraphGroundingMode;
    /** Minimum lexical/vector similarity score (0..1) to bind a chunk/tag cluster to an existing `GraphConcept`. Default 0.82. */
    ConceptMatchThreshold?: number;
    /** Maximum new `GraphConcept`s that may be proposed/created in a single pipeline run. `null` = unlimited. */
    MaxNewConceptsPerRun?: number | null;
    /** Registration key of the `BaseConceptSynthesizer` implementation to use. Defaults to `'ManagedPrompt'`. */
    SynthesizerKey?: string;
}

/** Fully-resolved Graph Overlay settings with defaults filled in based on `TargetGraphType` and `IsCanon`. */
export interface ResolvedGraphOverlayConfig {
    readonly EnableGraphOverlay: boolean;
    readonly GraphID: string | null;
    readonly TargetGraphType: SemanticGraphType;
    readonly IsCanon: boolean;
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
 * applying defaults tailored to whether the target graph is canonical (`IsCanon` or `TargetGraphType === 'Canon'`).
 */
export function ResolveGraphOverlayConfig(
    explicitGraphID: string | null | undefined,
    ...configurations: Array<Readonly<Record<string, unknown>> | undefined>
): ResolvedGraphOverlayConfig {
    const merged: ContentSourceGraphOverlayConfig = {};

    for (let i = 0; i < configurations.length; i++) {
        const cfg = configurations[i];
        if (cfg) {
            const optionsObj = cfg.Options as Record<string, unknown> | undefined;
            const overlay = (cfg.GraphOverlay ?? optionsObj?.GraphOverlay ?? cfg) as Partial<ContentSourceGraphOverlayConfig>;

            if (typeof overlay.EnableGraphOverlay === 'boolean') {
                merged.EnableGraphOverlay = overlay.EnableGraphOverlay;
            }
            if (typeof overlay.GraphID === 'string' && overlay.GraphID.trim().length > 0) {
                merged.GraphID = overlay.GraphID.trim();
            }
            if (isValidGraphType(overlay.TargetGraphType)) {
                merged.TargetGraphType = overlay.TargetGraphType.trim();
            }
            if (typeof overlay.IsCanon === 'boolean') {
                merged.IsCanon = overlay.IsCanon;
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
        // The first-class ContentSource.GraphID FK column takes precedence over any GraphID
        // inside source-level JSON configuration (configurations[0]), while still allowing
        // explicit per-run overrides (configurations[1+]) to target a different graph.
        if (i === 0 && explicitGraphID?.trim()) {
            merged.GraphID = explicitGraphID.trim();
        }
    }

    const graphID = merged.GraphID || explicitGraphID?.trim() || null;
    const graphType: SemanticGraphType = merged.TargetGraphType ?? 'Knowledge';
    const isCanon = merged.IsCanon ?? graphType === 'Canon';

    return {
        EnableGraphOverlay: merged.EnableGraphOverlay ?? graphID !== null,
        GraphID: graphID,
        TargetGraphType: graphType,
        IsCanon: isCanon,
        ConceptTaxonomyMode: merged.ConceptTaxonomyMode ?? (isCanon ? 'propose-only' : 'auto-grow'),
        AuthorityTier: merged.AuthorityTier ?? (isCanon ? 'ExecutiveSOP' : 'Reference'),
        GroundingMode: merged.GroundingMode ?? (isCanon ? 'full-canon' : 'none'),
        ConceptMatchThreshold: merged.ConceptMatchThreshold ?? 0.82,
        MaxNewConceptsPerRun: merged.MaxNewConceptsPerRun ?? null,
        SynthesizerKey: merged.SynthesizerKey ?? 'Deterministic',
    };
}

function isValidGraphType(val: unknown): val is SemanticGraphType {
    return typeof val === 'string' && val.trim().length > 0;
}

function isValidTaxonomyMode(val: unknown): val is ConceptTaxonomyMode {
    return val === 'constrained' || val === 'propose-only' || val === 'auto-grow';
}

function isValidAuthorityTier(val: unknown): val is GraphAuthorityTier {
    return typeof val === 'string' && val.trim().length > 0;
}

function isValidGroundingMode(val: unknown): val is GraphGroundingMode {
    return val === 'none' || val === 'schema-and-queries' || val === 'full-canon';
}
