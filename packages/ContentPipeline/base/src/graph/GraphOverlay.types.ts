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
    /** Authority tier given to sources feeding graphs of this type when the source names none. `null` = unranked. */
    readonly DefaultAuthorityTierID?: string | null;
    /** Concept taxonomy mode used when a source names none. */
    readonly DefaultConceptTaxonomyMode?: ConceptTaxonomyMode | null;
    /** Metadata grounding depth used when a source names none. */
    readonly DefaultGroundingMode?: GraphGroundingMode | null;
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
 * Name of a row in `MJ: Graph Authority Tiers` (`__mj.GraphAuthorityTier`). Tiers are pure metadata:
 * an organization renames, adds, removes, or re-ranks them in that table, and no code knows the names.
 */
export type GraphAuthorityTier = string;

/** Descriptor for a row in `MJ: Graph Authority Tiers` (`__mj.GraphAuthorityTier`). */
export interface GraphAuthorityTierDescriptor {
    readonly ID: string;
    readonly Name: GraphAuthorityTier;
    readonly Description?: string | null;
    /** Evidentiary precedence rank (higher = more authoritative). */
    readonly Rank: number;
    readonly IconClass?: string | null;
}

/** Rank of a source or concept that carries no authority tier, or one that matches no configured tier. Below every real tier. */
export const UNRANKED_AUTHORITY_RANK = 0;

/** Display label for a source or concept with no authority tier. Never compared against tier names. */
export const UNRANKED_AUTHORITY_LABEL = 'Unranked';

/** Normalizes a tier name for matching: case-insensitive and whitespace-insensitive (`BoardPolicy` matches `Board Policy`). */
function normalizeTierName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Finds the configured `MJ: Graph Authority Tiers` row for a tier reference, which may be the row's
 * ID or its name (matched case- and whitespace-insensitively). Returns `null` when nothing matches.
 */
export function FindAuthorityTier(
    tierNameOrID: string | null | undefined,
    configuredTiers: readonly GraphAuthorityTierDescriptor[],
): GraphAuthorityTierDescriptor | null {
    const ref = tierNameOrID?.trim();
    if (!ref || configuredTiers.length === 0) {
        return null;
    }
    const lowerRef = ref.toLowerCase();
    const byID = configuredTiers.find((t) => t.ID.trim().toLowerCase() === lowerRef);
    if (byID) {
        return byID;
    }
    const normalized = normalizeTierName(ref);
    return configuredTiers.find((t) => normalizeTierName(t.Name) === normalized) ?? null;
}

/**
 * Precedence rank of an authority tier (higher = more authoritative), read only from the configured
 * `MJ: Graph Authority Tiers` rows. A missing or unmatched tier ranks {@link UNRANKED_AUTHORITY_RANK}.
 */
export function GetAuthorityTierRank(
    tierNameOrID: GraphAuthorityTier | null | undefined,
    configuredTiers: readonly GraphAuthorityTierDescriptor[],
): number {
    return FindAuthorityTier(tierNameOrID, configuredTiers)?.Rank ?? UNRANKED_AUTHORITY_RANK;
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
 * Every field is optional; what a source leaves unset comes from the target graph's `MJ: Graph Types` row.
 */
export interface ContentSourceGraphOverlayConfig {
    /** When true, runs concept & graph-edge synthesis over ingested Content Items and Chunks. */
    EnableGraphOverlay?: boolean;
    /** Target `MJ: Graphs` ID. Overrides or supplements `ContentSource.GraphID`. */
    GraphID?: string | null;
    /** Informational graph type name. The real type is read from the target graph's `GraphTypeID`. */
    TargetGraphType?: SemanticGraphType;
    /** Used only when the target graph's type is not known; the graph type's `IsCanon` always wins. */
    IsCanon?: boolean;
    /** How new concepts are handled. Defaults to the graph type's `DefaultConceptTaxonomyMode`. */
    ConceptTaxonomyMode?: ConceptTaxonomyMode;
    /** Authority tier (name or ID) stamped on concepts and edges from this source. Defaults to the graph type's `DefaultAuthorityTierID`. */
    AuthorityTier?: GraphAuthorityTier;
    /** Authority tier ID; takes precedence over `AuthorityTier`. */
    AuthorityTierID?: string | null;
    /** Metadata grounding depth. Defaults to the graph type's `DefaultGroundingMode`. */
    GroundingMode?: GraphGroundingMode;
    /** Minimum lexical/vector similarity score (0..1) to bind a chunk/tag cluster to an existing `GraphConcept`. Default 0.82. */
    ConceptMatchThreshold?: number;
    /** Maximum new `GraphConcept`s that may be proposed/created in a single pipeline run. `null` = unlimited. */
    MaxNewConceptsPerRun?: number | null;
    /** Registration key of the `BaseConceptSynthesizer` implementation to use. Defaults to `'Deterministic'`. */
    SynthesizerKey?: string;
}

/** Fully-resolved Graph Overlay settings. */
export interface ResolvedGraphOverlayConfig {
    readonly EnableGraphOverlay: boolean;
    readonly GraphID: string | null;
    /** The target graph's type name, or the configured name when the type is not known; `null` when neither is. */
    readonly TargetGraphType: SemanticGraphType | null;
    readonly IsCanon: boolean;
    readonly ConceptTaxonomyMode: ConceptTaxonomyMode;
    /** Authority tier name, or `null` when the source is unranked. */
    readonly AuthorityTier: GraphAuthorityTier | null;
    /** Authority tier ID when it resolved against `MJ: Graph Authority Tiers`; otherwise `null`. */
    readonly AuthorityTierID: string | null;
    readonly GroundingMode: GraphGroundingMode;
    readonly ConceptMatchThreshold: number;
    readonly MaxNewConceptsPerRun: number | null;
    readonly SynthesizerKey: string;
}

/** Metadata used to fill in what a source's configuration leaves unset. */
export interface GraphOverlayMetadata {
    /** The `MJ: Graph Types` row of the target graph, when known. */
    readonly GraphType?: GraphTypeDescriptor | null;
    /** Active `MJ: Graph Authority Tiers` rows. When given, a configured tier must match one of them. */
    readonly AuthorityTiers?: readonly GraphAuthorityTierDescriptor[];
}

/**
 * Converts a `MJ: Graph Types.DefaultConceptTaxonomyMode` value (written for people, e.g. `Propose Only`)
 * to the pipeline's {@link ConceptTaxonomyMode}. Returns `null` for an unrecognized value.
 */
export function TaxonomyModeFromGraphTypeValue(value: string | null | undefined): ConceptTaxonomyMode | null {
    const mode = toPipelineToken(value);
    return isValidTaxonomyMode(mode) ? mode : null;
}

/**
 * Converts a `MJ: Graph Types.DefaultGroundingMode` value (e.g. `Schema and Queries`) to the
 * pipeline's {@link GraphGroundingMode}. Returns `null` for an unrecognized value.
 */
export function GroundingModeFromGraphTypeValue(value: string | null | undefined): GraphGroundingMode | null {
    const mode = toPipelineToken(value);
    return isValidGroundingMode(mode) ? mode : null;
}

function toPipelineToken(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
}

/** Thrown when a source configures an authority tier that matches no active `MJ: Graph Authority Tiers` row. */
export class UnknownAuthorityTierError extends Error {
    constructor(public readonly TierReference: string) {
        super(
            `Graph overlay authority tier '${TierReference}' does not match any active row in 'MJ: Graph Authority Tiers'. ` +
                `Use an existing tier name or ID, or add the tier.`,
        );
        this.name = 'UnknownAuthorityTierError';
    }
}

/**
 * Merges `ContentSourceGraphOverlayConfig` across configuration layers
 * (`ContentSourceType.Configuration` → `ContentSource.Configuration` → Run `Configuration`) without
 * applying any defaults, so {@link FinalizeGraphOverlayConfig} can tell what was set from what was not.
 */
export function MergeGraphOverlayConfig(
    explicitGraphID: string | null | undefined,
    ...configurations: Array<Readonly<Record<string, unknown>> | undefined>
): ContentSourceGraphOverlayConfig {
    const merged: ContentSourceGraphOverlayConfig = {};
    for (let i = 0; i < configurations.length; i++) {
        const cfg = configurations[i];
        if (cfg) {
            mergeOverlayLayer(merged, readOverlayLayer(cfg));
        }
        // The first-class ContentSource.GraphID FK column takes precedence over any GraphID
        // inside source-level JSON configuration (configurations[0]), while still allowing
        // explicit per-run overrides (configurations[1+]) to target a different graph.
        if (i === 0 && explicitGraphID?.trim()) {
            merged.GraphID = explicitGraphID.trim();
        }
    }
    if (!merged.GraphID && explicitGraphID?.trim()) {
        merged.GraphID = explicitGraphID.trim();
    }
    return merged;
}

/**
 * Fills in what a merged configuration leaves unset, from the target graph's type and the active
 * authority tiers. Precedence for each setting: the source's own value, then the graph type's default.
 * When no graph type is known the only fallbacks are structural (a Canon graph never auto-approves,
 * grounding is off, and the source is unranked); no tier, mode, or type is ever chosen by name.
 *
 * @throws {UnknownAuthorityTierError} when tiers are supplied and the configured tier matches none of them.
 */
export function FinalizeGraphOverlayConfig(
    merged: ContentSourceGraphOverlayConfig,
    metadata: GraphOverlayMetadata = {},
): ResolvedGraphOverlayConfig {
    const graphType = metadata.GraphType ?? null;
    const isCanon = graphType ? graphType.IsCanon : (merged.IsCanon ?? false);
    const tier = resolveConfiguredTier(merged, graphType, metadata.AuthorityTiers ?? []);
    return {
        EnableGraphOverlay: merged.EnableGraphOverlay ?? merged.GraphID != null,
        GraphID: merged.GraphID ?? null,
        TargetGraphType: graphType?.Name ?? merged.TargetGraphType ?? null,
        IsCanon: isCanon,
        ConceptTaxonomyMode:
            merged.ConceptTaxonomyMode ?? graphType?.DefaultConceptTaxonomyMode ?? (isCanon ? 'propose-only' : 'auto-grow'),
        AuthorityTier: tier.Name,
        AuthorityTierID: tier.ID,
        GroundingMode: merged.GroundingMode ?? graphType?.DefaultGroundingMode ?? 'none',
        ConceptMatchThreshold: merged.ConceptMatchThreshold ?? 0.82,
        MaxNewConceptsPerRun: merged.MaxNewConceptsPerRun ?? null,
        SynthesizerKey: merged.SynthesizerKey ?? 'Deterministic',
    };
}

/**
 * Merges configuration layers and fills in defaults in one step. Callers that know the target graph's
 * type and the active tiers should pass them, so defaults come from metadata.
 */
export function ResolveGraphOverlayConfig(
    explicitGraphID: string | null | undefined,
    ...configurations: Array<Readonly<Record<string, unknown>> | undefined>
): ResolvedGraphOverlayConfig {
    return FinalizeGraphOverlayConfig(MergeGraphOverlayConfig(explicitGraphID, ...configurations));
}

/** The tier a source resolves to: its own reference, else the graph type's default, else unranked. */
function resolveConfiguredTier(
    merged: ContentSourceGraphOverlayConfig,
    graphType: GraphTypeDescriptor | null,
    tiers: readonly GraphAuthorityTierDescriptor[],
): { Name: string | null; ID: string | null } {
    const configuredRef = merged.AuthorityTierID?.trim() || merged.AuthorityTier?.trim() || null;
    if (configuredRef) {
        if (tiers.length === 0) {
            // Tiers not loaded: keep the reference as given; it is ranked when tiers are available.
            return { Name: merged.AuthorityTier?.trim() || null, ID: merged.AuthorityTierID?.trim() || null };
        }
        const match = FindAuthorityTier(configuredRef, tiers);
        if (!match) {
            throw new UnknownAuthorityTierError(configuredRef);
        }
        return { Name: match.Name, ID: match.ID };
    }
    const defaultTier = FindAuthorityTier(graphType?.DefaultAuthorityTierID, tiers);
    if (defaultTier) {
        return { Name: defaultTier.Name, ID: defaultTier.ID };
    }
    return { Name: null, ID: graphType?.DefaultAuthorityTierID?.trim() || null };
}

/**
 * Reads one configuration layer. Accepts both the pipeline keys (`EnableGraphOverlay`, `AuthorityTier`)
 * and the documented `IContentSourceGraphOverlayConfig` JSON keys (`Enabled`, `DefaultAuthorityTier`,
 * `DefaultAuthorityTierID`), so either spelling configures the same thing.
 */
function readOverlayLayer(cfg: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const optionsObj = cfg.Options as Record<string, unknown> | undefined;
    const overlay = (cfg.GraphOverlay ?? optionsObj?.GraphOverlay ?? cfg) as Record<string, unknown>;
    return {
        ...overlay,
        EnableGraphOverlay: overlay.EnableGraphOverlay ?? overlay.Enabled,
        AuthorityTier: overlay.AuthorityTier ?? overlay.DefaultAuthorityTier,
        AuthorityTierID: overlay.AuthorityTierID ?? overlay.DefaultAuthorityTierID,
    };
}

function mergeOverlayLayer(merged: ContentSourceGraphOverlayConfig, overlay: Record<string, unknown>): void {
    if (typeof overlay.EnableGraphOverlay === 'boolean') merged.EnableGraphOverlay = overlay.EnableGraphOverlay;
    if (isNonEmptyString(overlay.GraphID)) merged.GraphID = overlay.GraphID.trim();
    if (isNonEmptyString(overlay.TargetGraphType)) merged.TargetGraphType = overlay.TargetGraphType.trim();
    if (typeof overlay.IsCanon === 'boolean') merged.IsCanon = overlay.IsCanon;
    if (isValidTaxonomyMode(overlay.ConceptTaxonomyMode)) merged.ConceptTaxonomyMode = overlay.ConceptTaxonomyMode;
    if (isNonEmptyString(overlay.AuthorityTier)) merged.AuthorityTier = overlay.AuthorityTier.trim();
    if (isNonEmptyString(overlay.AuthorityTierID)) merged.AuthorityTierID = overlay.AuthorityTierID.trim();
    if (isValidGroundingMode(overlay.GroundingMode)) merged.GroundingMode = overlay.GroundingMode;
    if (isUnitInterval(overlay.ConceptMatchThreshold)) merged.ConceptMatchThreshold = overlay.ConceptMatchThreshold;
    if (overlay.MaxNewConceptsPerRun === null) merged.MaxNewConceptsPerRun = null;
    else if (isNonNegativeNumber(overlay.MaxNewConceptsPerRun)) merged.MaxNewConceptsPerRun = overlay.MaxNewConceptsPerRun;
    if (isNonEmptyString(overlay.SynthesizerKey)) merged.SynthesizerKey = overlay.SynthesizerKey.trim();
}

function isNonEmptyString(val: unknown): val is string {
    return typeof val === 'string' && val.trim().length > 0;
}

function isUnitInterval(val: unknown): val is number {
    return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 1;
}

function isNonNegativeNumber(val: unknown): val is number {
    return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

/** True for a valid {@link ConceptTaxonomyMode}. */
function isValidTaxonomyMode(val: unknown): val is ConceptTaxonomyMode {
    return val === 'constrained' || val === 'propose-only' || val === 'auto-grow';
}

/** True for a valid {@link GraphGroundingMode}. */
function isValidGroundingMode(val: unknown): val is GraphGroundingMode {
    return val === 'none' || val === 'schema-and-queries' || val === 'full-canon';
}
