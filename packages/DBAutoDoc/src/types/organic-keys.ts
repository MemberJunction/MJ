/**
 * Organic Key Cluster Detection
 *
 * Types for the cluster-based organic key detector. An "organic key" is a value-based
 * matching rule between columns/entities that share a semantic concept — even when no
 * foreign key links them directly. Clustering surfaces these as groups (one concept,
 * N member columns) rather than as individual edges.
 *
 * See proposal: plans/entity-organic-key-clusters.md
 */

/** Strategy used to normalize values before equality comparison. */
export type OrganicKeyNormalizationStrategy = 'LowerCaseTrim' | 'Trim' | 'ExactMatch' | 'Custom';

/** A single column participating in an organic key cluster. */
export interface OrganicKeyClusterMember {
  schema: string;
  table: string;
  column: string;
  /** Whether the column appears in any FK relationship discovered by DBAutoDoc. */
  participatesInFK: boolean;
  /** FK target column if `participatesInFK` is true. */
  fkTarget?: { schema: string; table: string; column: string } | null;
  /** Per-member confidence after LLM refinement (0–1). */
  memberConfidence?: number;
}

/** A confirmed organic key cluster (one concept, multiple columns). */
export interface OrganicKeyCluster {
  /** Stable identifier for this cluster within the analysis run. */
  id: string;
  /** Human-readable snake_case concept name (e.g. "email_address", "customer_id"). */
  concept: string;
  /** Cluster-level normalization strategy. */
  normalization: OrganicKeyNormalizationStrategy;
  /** Optional custom normalization SQL expression when normalization='Custom'. */
  customNormalizationExpression?: string;
  /** Members of the cluster. */
  members: OrganicKeyClusterMember[];
  /** Cluster-level confidence (0–1). */
  confidence: number;
  /** LLM reasoning for why this cluster represents a coherent concept. */
  reasoning: string;
  /**
   * Tags surfacing structural notes for downstream consumers.
   * - 'fk-redundant-single-target': every member is FK to one common target (low organic-key value)
   * - 'fk-fragmented': members FK to different targets in a shared lineage (cluster captures cross-cutting concept)
   * - 'pk-to-pk': members are all PKs of their own tables (typically live/archive patterns)
   * - 'no-fk-no-pk': no members are in any FK or PK (pure value-space match)
   */
  tags: OrganicKeyClusterTag[];
  /** Maximum pairwise distance among members at clustering time (lower = tighter). */
  maxIntraDistance: number;
  /** Hybrid distance weights used to produce this cluster. */
  distanceWeights?: HybridDistanceWeights;
}

export type OrganicKeyClusterTag =
  | 'fk-redundant-single-target'
  | 'fk-fragmented'
  | 'pk-to-pk'
  | 'no-fk-no-pk'
  | 'mixed';

/** Phase tracking for the organic key detection pass in state.json. */
export interface OrganicKeyDetectionPhase {
  triggered: boolean;
  triggerReason?: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  /** Total clusters surfaced by the detector pre-refinement. */
  candidateClusterCount: number;
  /** Clusters kept after LLM refinement (or all candidates if refinement was skipped). */
  confirmedClusterCount: number;
  /** Clusters rejected by LLM refinement. */
  rejectedClusterCount: number;
  /** Clusters partitioned by LLM into multiple sub-clusters. */
  splitClusterCount: number;
  /** Aggregate LLM tokens consumed by refinement. */
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  /** Hybrid distance weights used for this run. */
  weights: HybridDistanceWeights;
  /** Embedding model used (if any). */
  embeddingModelUsed?: string;
  /** LLM refinement model used (if any). */
  refinementModelUsed?: string;
  /** Tunable thresholds applied for this run. */
  thresholds: ClusteringThresholds;
  /** Skipped reason if status='skipped' (e.g., 'no AI provider configured'). */
  skipReason?: string;
  errorMessage?: string;
}

/**
 * Hybrid distance metric weights. The detector computes a weighted sum across signals.
 * Weights need not sum to 1; the result is a relative distance used for thresholding.
 * Setting a weight to 0 disables that signal entirely.
 */
export interface HybridDistanceWeights {
  /** Weight for (1 - name_token_jaccard). Always available (deps-free). */
  nameSimilarity: number;
  /** Weight for cosine distance over column-description embeddings. Requires AI provider. */
  embeddingDistance: number;
  /** Weight for (1 - minhash_value_jaccard). Requires column value sampling. */
  valueOverlap: number;
}

/** Tunable thresholds for the clustering algorithm. */
export interface ClusteringThresholds {
  /** Edges with hybrid distance > this value never become merge candidates. */
  candidateEdgeMax: number;
  /** Complete-linkage cut — max intra-cluster pairwise distance after merge. */
  mergeMax: number;
  /** Top-K nearest neighbors per column retained as candidate edges. */
  topKNeighbors: number;
  /** Minimum members for a cluster to be reported (default: 2). */
  minClusterSize: number;
  /** Minimum distinct tables a cluster must span (default: 2). */
  minDistinctTables: number;
}

/** Default hybrid weights — name-first baseline with optional enhancements. */
export const DEFAULT_HYBRID_WEIGHTS: HybridDistanceWeights = {
  nameSimilarity: 1.0,
  embeddingDistance: 1.0,
  valueOverlap: 0.5,
};

/** Conservative default thresholds tuned against the AdventureWorks POC. */
export const DEFAULT_THRESHOLDS: ClusteringThresholds = {
  candidateEdgeMax: 0.5,
  mergeMax: 0.4,
  topKNeighbors: 20,
  minClusterSize: 2,
  minDistinctTables: 2,
};
