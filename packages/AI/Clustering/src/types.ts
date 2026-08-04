/**
 * @fileoverview Framework-agnostic type definitions for the clustering engine.
 *
 * These types mirror (and are the canonical source for) the shapes that were
 * previously defined in the Angular `@memberjunction/ng-clustering` package.
 * They are intentionally pure data interfaces with no Angular / DOM coupling so
 * the engine can run on the server, in a worker, or in the browser.
 */

import { DistanceMetric } from '@memberjunction/ai-vectors-memory';

/** Supported clustering algorithms exposed by the engine. */
export type ClusterAlgorithm = 'kmeans' | 'dbscan';

/**
 * Distance metric accepted by the engine config. This is a subset of the
 * metrics supported by {@link SimpleVectorService}; all values here are valid
 * {@link DistanceMetric} values so they pass straight through.
 */
export type ClusterDistanceMetric = 'cosine' | 'euclidean' | 'dotproduct';

/**
 * A single vector handed to the engine for clustering. Produced by an
 * {@link IClusterVectorSource} adapter.
 */
export interface ClusterInputVector {
    /** Unique key identifying this vector (typically an entity record ID). */
    Key: string;
    /** The raw embedding / feature vector. */
    Vector: number[];
    /** Optional display label for this point (defaults to Key if omitted). */
    Label?: string;
    /** Arbitrary metadata surfaced in tooltips / drilldown. */
    Metadata?: Record<string, unknown>;
}

/**
 * Full configuration for a clustering run. Self-describing snapshot that can be
 * persisted to `MJ: Cluster Analysis.Configuration` and used to re-run.
 */
export interface ClusterConfig {
    /** Entity name whose records are being clustered (drives drilldown / view qualification). */
    EntityName?: string;
    /** Entity ID — persisted to the top-level `EntityID` column when available. Null for multi-entity analyses. */
    EntityID?: string;
    /** Specific Entity Document ID supplying the vectors. Blank => source adapter chooses. */
    EntityDocumentID?: string;
    /**
     * Multi-entity clustering: one or more Entity Document IDs whose vectors are
     * merged into a single analysis. When supplied (length >= 1) this takes
     * precedence over {@link EntityDocumentID}. All selected documents MUST share
     * the same embedding model + vector dimensionality — the source adapter
     * hard-blocks incompatible combinations rather than produce a meaningless layout.
     */
    EntityDocumentIDs?: string[];
    /**
     * How points are colored in the renderer: by their assigned cluster (default)
     * or by their source entity (useful for multi-entity analyses). Persisted so a
     * reloaded analysis restores the chosen legend mode.
     */
    ColorBy?: 'cluster' | 'entity';
    /** Clustering algorithm to use. */
    Algorithm: ClusterAlgorithm;
    /** Number of clusters for K-Means (ignored for DBSCAN). */
    K: number;
    /** Epsilon neighbourhood radius for DBSCAN (ignored for K-Means). */
    Epsilon: number;
    /** Minimum points to form a dense region in DBSCAN (ignored for K-Means). */
    MinPoints: number;
    /** Distance metric used when comparing vectors. */
    DistanceMetric: ClusterDistanceMetric;
    /** Maximum number of records to fetch for clustering. */
    MaxRecords: number;
    /** Optional SQL-style filter applied by the vector source. */
    Filter: string;
    /** When true, the engine runs the optional LLM cluster-naming step. */
    NameClusters?: boolean;
    /** Number of dimensions for the projected layout (2 or 3). Defaults to 2. */
    Dimensions?: 2 | 3;
}

/**
 * A single projected point ready for rendering, after dimensionality reduction.
 */
export interface ClusterPoint {
    /** X coordinate in projected space. */
    X: number;
    /** Y coordinate in projected space. */
    Y: number;
    /** Z coordinate in projected space (only present when Dimensions === 3). */
    Z?: number;
    /** Cluster assignment index (`-1` for outliers / noise). */
    ClusterIndex: number;
    /** Display label for this point. */
    Label: string;
    /** Original vector key (entity record ID). */
    Key: string;
    /** Arbitrary metadata surfaced in tooltips / drilldown. */
    Metadata: Record<string, unknown>;
}

/** Summary information about a single discovered cluster. */
export interface ClusterInfo {
    /** Zero-based cluster index, matching `ClusterPoint.ClusterIndex`. */
    Index: number;
    /** Human-readable label (LLM-generated or default). */
    Label: string;
    /** Display color as a CSS hex string. */
    Color: string;
    /** Number of member points in this cluster. */
    MemberCount: number;
    /** Whether the label was edited by a user (always false on a fresh run). */
    IsUserEdited: boolean;
}

/** Quality + performance metrics for a clustering run. */
export interface ClusterMetrics {
    /** Silhouette score ranging from -1 (poor) to 1 (excellent). */
    SilhouetteScore: number;
    /** Total number of clusters discovered. */
    ClusterCount: number;
    /** Wall-clock computation time in milliseconds. */
    ComputationTimeMs: number;
    /** Total records that were processed. */
    RecordCount: number;
    /** Number of outlier points (DBSCAN only; 0 for K-Means). */
    OutlierCount: number;
}

/** Complete result of a clustering pipeline run. */
export interface ClusterResult {
    /** Projected points ready for rendering. */
    Points: ClusterPoint[];
    /** Cluster summaries with colors and counts. */
    Clusters: ClusterInfo[];
    /** Performance and quality metrics. */
    Metrics: ClusterMetrics;
    /** The config that produced this result. */
    Config: ClusterConfig;
}

/**
 * Transport-agnostic seam for fetching the vectors to cluster. Concrete
 * implementations (server-side from Entity Document Runs, client-side via
 * GraphQL, in-memory test fixtures, etc.) implement this so the engine stays
 * decoupled from how vectors are sourced.
 */
export interface IClusterVectorSource {
    /**
     * Fetch the vectors to be clustered based on the supplied configuration.
     * @param config The clustering configuration (entity, document, filter, max records).
     * @returns A promise resolving to the vectors to cluster.
     */
    FetchVectors(config: ClusterConfig): Promise<ClusterInputVector[]>;
}

/** Default cluster color palette — 10 distinct, accessible colors. */
export const CLUSTER_COLORS: string[] = [
    '#5b8def', // blue
    '#34d399', // emerald
    '#fbbf24', // amber
    '#f472b6', // pink
    '#a78bfa', // violet
    '#fb923c', // orange
    '#22d3ee', // cyan
    '#f87171', // red
    '#4ade80', // green
    '#e879f9', // fuchsia
];

/** Maps the engine's lowercase {@link ClusterDistanceMetric} to a {@link DistanceMetric}. */
export function toVectorMetric(metric: ClusterDistanceMetric): DistanceMetric {
    return metric;
}

/** Maps the engine's lowercase {@link ClusterAlgorithm} to the persisted Algorithm enum value. */
export function toPersistedAlgorithm(algorithm: ClusterAlgorithm): 'KMeans' | 'DBSCAN' {
    return algorithm === 'dbscan' ? 'DBSCAN' : 'KMeans';
}

/** Create a {@link ClusterConfig} populated with sensible defaults. */
export function DefaultClusterConfig(): ClusterConfig {
    return {
        EntityName: '',
        EntityID: '',
        EntityDocumentID: '',
        EntityDocumentIDs: [],
        ColorBy: 'cluster',
        Algorithm: 'kmeans',
        K: 4,
        Epsilon: 0.3,
        MinPoints: 3,
        DistanceMetric: 'cosine',
        MaxRecords: 500,
        Filter: '',
        NameClusters: false,
        Dimensions: 2,
    };
}
