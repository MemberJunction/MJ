/**
 * Organic-Key Cluster Detection — types.
 *
 * A cluster is N≥2 columns across ≥2 tables sharing a single business-meaningful
 * value space (email addresses, customer IDs, phone numbers, etc.). The runtime
 * organic-key feature (see PR #2193) matches records across tables by literal
 * value equality; clusters propose which columns should form such match groups.
 *
 * See plans/dbautodoc-organic-keys.md.
 */

/** Strategy used to normalize values before equality comparison (matches PR #2193). */
export type OrganicKeyNormalizationStrategy = 'LowerCaseTrim' | 'Trim' | 'ExactMatch' | 'Custom';


/** A single column (Pattern 1) or compound tuple (Pattern 2) participating in a cluster. */
export interface OrganicKeyClusterMember {
    schema: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    table: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Primary column for Pattern 1; first column of the tuple for Pattern 2. */
    column: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /**
     * Pattern 2 — additional columns of a compound key tuple, in positional order.
     * Undefined or empty for single-column (Pattern 1) members. When set, the full
     * compound match is `[column, ...additionalColumns]` which the translator emits
     * as `MatchFieldNames` for PR #2193's runtime.
     */
    additionalColumns?: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Whether the column appears in any FK relationship (declared or DBAutoDoc-discovered). */
    participatesInFK: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** FK target column if `participatesInFK` is true. */
    fkTarget?: { schema: string; table: string; column: string } | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Whether the column is a PK (informational; affects tagging). */
    isPrimaryKey?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /**
     * Per-column normalization strategy — the function that should be applied to THIS
     * column's values at match time. Persisted into THIS column's hub `EntityOrganicKey`
     * row at emission. Different members of the same cluster can have different strategies
     * (e.g. one column already canonical → ExactMatch, another needs LowerCaseTrim).
     * Falls back to the cluster-level `normalization` when not set.
     */
    normalizationStrategy?: OrganicKeyNormalizationStrategy;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Custom SQL expression for this column when normalizationStrategy='Custom'. */
    customNormalizationExpression?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Helper: returns the complete column list for a member (single or compound). */
export function MemberColumns(m: OrganicKeyClusterMember): string[] {
    return [m.column, ...(m.additionalColumns ?? [])];
}

/** @deprecated Use {@link MemberColumns}. */
export function memberColumns(m: OrganicKeyClusterMember): string[] {
    return MemberColumns(m);
}

/** Helper: true when the member represents a compound tuple (Pattern 2). */
export function IsCompoundMember(m: OrganicKeyClusterMember): boolean {
    return (m.additionalColumns?.length ?? 0) > 0;
}

/** @deprecated Use {@link IsCompoundMember}. */
export function isCompoundMember(m: OrganicKeyClusterMember): boolean {
    return IsCompoundMember(m);
}


/** A confirmed cluster after LLM refinement — one business concept, N member columns. */
export interface OrganicKeyCluster {
    /** Stable identifier for this cluster within the analysis run. */
    id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Canonical snake_case concept name (e.g. "email_address", "customer_id"). */
    concept: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Cluster-level normalization strategy. */
    normalization: OrganicKeyNormalizationStrategy;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Optional custom normalization SQL expression when normalization='Custom'. */
    customNormalizationExpression?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Members surviving the LLM refinement pass. */
    members: OrganicKeyClusterMember[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Cluster-level confidence (0–1). */
    confidence: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** LLM reasoning for why this cluster is a coherent business concept. */
    reasoning: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Maximum pairwise embedding distance among members at clustering time (legacy field; 0 with the LLM-only pipeline). */
    maxIntraDistance: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /**
     * Set when EVERY non-PK member is a declared FK pointing at the PK member's column.
     * PR #2193 organic keys exist to provide value-based matching "in place of a FK";
     * when the FK is already declared, the cluster adds no navigation value and may
     * indicate a lookup-table-PK pattern (country/currency/state codes). The dashboard
     * can use this to offer a "hide FK-redundant" filter without losing the data.
     */
    isFKRedundant?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Algorithmic configuration the detector actually runs with at execution time.
 *
 * Layering note: these are DBAutoDoc-internal tuning knobs. DBAutoDoc is a
 * standalone tool that does NOT depend on MemberJunction, so these settings
 * must be exposed through DBAutoDoc's own config system (see DBAutoDocConfig
 * in types/config.ts) — NOT through mj.config.cjs.
 *
 * Cross-MJ-tool project facts (e.g. the project-wide table-exclusion list that
 * CodeGen, mj-sync, and DBAutoDoc all need to agree on) DO live in mj.config.cjs;
 * algorithm tuning does not.
 *
 * DEFAULT_DETECTOR_CONFIG values are the fallbacks used when DBAutoDoc's config
 * doesn't override them; they are not authoritative.
 */
export interface OrganicKeyDetectorConfig {
    /** Cosine-distance threshold for the agglomerative merge step. Lower = tighter clusters. */
    mergeThreshold: number;
    /** Minimum cluster size to report. */
    minClusterSize: number;
    /** Minimum number of distinct tables a cluster must span. */
    minDistinctTables: number;
    /** Sample values per column to include in the embedding input (and refiner prompt). */
    sampleValueCount: number;
    /** Concurrency for per-cluster LLM refinement. */
    refinementConcurrency: number;
}

/** Fallback values used when DBAutoDoc's config doesn't override them. Not authoritative. */
export const DEFAULT_DETECTOR_CONFIG: OrganicKeyDetectorConfig = {
    mergeThreshold: 0.35,
    minClusterSize: 2,
    minDistinctTables: 2,
    sampleValueCount: 5,
    refinementConcurrency: 4,
};

/** Per-run phase tracking persisted in state.json. */
export interface OrganicKeyDetectionPhase {
    triggered: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    startedAt: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    completedAt?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    status: 'running' | 'completed' | 'failed' | 'skipped';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    candidateClusterCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    confirmedClusterCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    rejectedClusterCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    splitClusterCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    tokensUsed: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    inputTokens: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    outputTokens: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    estimatedCost: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    embeddingModelUsed?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    refinementModelUsed?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    skipReason?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    errorMessage?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Outcome of refining a single cluster. */
export interface ClusterRefinementOutcome {
    outcome: 'keep' | 'split' | 'reject' | 'error';
    /** For 'keep' — refined cluster with concept + normalization + outliers ejected. */
    refinedCluster?: OrganicKeyCluster;
    /** For 'split' — coherent sub-clusters the LLM partitioned the input into. */
    subClusters?: OrganicKeyCluster[];
    /** For 'reject' — LLM-provided reason. */
    rejectReason?: string;
    /** For 'error' — failure detail. */
    errorMessage?: string;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
}
