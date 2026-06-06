/**
 * @fileoverview Shared types for the clustering visualization library.
 *
 * This module defines every interface, type alias, and constant used across the
 * `@memberjunction/ng-clustering` package.  It is the single source of truth for:
 *
 * - **Data shapes** (`ClusterPoint`, `ClusterInfo`, `ClusterVisualizationResult`, ...)
 * - **Configuration** (`ClusterConfig`, `ClusterAlgorithm`, `ClusterDistanceMetric`)
 * - **Event payloads** (`CancelableEvent`, `ViewportRect`, `ClusterSelectedEvent`, ...)
 * - **Constants** (`CLUSTER_COLORS`, `DefaultClusterConfig`)
 *
 * @example
 * ```typescript
 * import {
 *     CancelableEvent,
 *     ClusterPoint,
 *     ClusterConfig,
 *     DefaultClusterConfig,
 * } from '@memberjunction/ng-clustering';
 *
 * const cfg = DefaultClusterConfig();
 * cfg.EntityName = 'Companies';
 * cfg.K = 5;
 * ```
 */

// ================================================================
// Cancelable event pattern
// ================================================================

/**
 * Generic wrapper for cancelable events emitted by clustering components.
 *
 * The component emits a `CancelableEvent<T>` **before** performing a
 * side-effect.  The consumer can inspect `Data`, and set `Cancel = true` to
 * prevent the default behavior.
 *
 * @typeParam T  Payload type carried by the event.
 *
 * @example
 * ```html
 * <mj-cluster-scatter
 *     (BeforePointClick)="onBeforeClick($event)">
 * </mj-cluster-scatter>
 * ```
 * ```typescript
 * onBeforeClick(event: CancelableEvent<ClusterPoint>): void {
 *     if (event.Data.ClusterId === -1) {
 *         event.Cancel = true; // suppress click on outliers
 *     }
 * }
 * ```
 */
export interface CancelableEvent<T = unknown> {
    /** The event payload. */
    Data: T;
    /** Set to `true` to cancel the default operation that would follow. */
    Cancel: boolean;
}

// ================================================================
// Viewport / selection event payloads
// ================================================================

/**
 * Describes the visible rectangle of the scatter plot after a zoom or pan.
 *
 * Coordinates are in the SVG coordinate space (the `viewBox`).
 */
export interface ViewportRect {
    /** Left edge X coordinate. */
    MinX: number;
    /** Top edge Y coordinate. */
    MinY: number;
    /** Viewport width in SVG units. */
    Width: number;
    /** Viewport height in SVG units. */
    Height: number;
}

/**
 * Payload emitted when the user clicks a cluster label in the legend.
 */
export interface ClusterSelectedEvent {
    /** The numeric cluster ID that was selected. */
    ClusterId: number;
    /** The human-readable label shown in the legend. */
    Label: string;
    /** The display color of the cluster. */
    Color: string;
    /** Number of points belonging to this cluster. */
    MemberCount: number;
}

// ================================================================
// Config panel types
// ================================================================

/**
 * Simple entity option used by the config panel's entity dropdown.
 * The parent component is responsible for populating this list.
 */
export interface ClusterConfigPanelEntityOption {
    /** Entity display name shown in the dropdown. */
    Name: string;
}

/** Option for the entity document dropdown in the config panel. */
export interface ClusterConfigPanelEntityDocOption {
    /** Entity Document ID */
    ID: string;
    /** Display name of the entity document */
    Name: string;
    /** Name of the entity this document belongs to (used for multi-entity selection grouping/labels). */
    EntityName?: string;
}

// ================================================================
// Input types
// ================================================================

/**
 * A single vector provided to `ClusteringService.RunClustering()`.
 *
 * The caller is responsible for fetching/building these vectors from
 * whatever data source is appropriate (database, vector index, API, etc.).
 */
export interface ClusterInputVector {
    /** Unique key identifying this vector (e.g., a record ID). */
    Key: string;
    /** The raw embedding / feature vector. */
    Vector: number[];
    /** Optional display label for this point (defaults to Key if omitted). */
    Label?: string;
    /** Arbitrary metadata surfaced in tooltips and click handlers. */
    Metadata?: Record<string, unknown>;
}

// ================================================================
// Core data types
// ================================================================

/**
 * A single point in the 2D scatter plot.
 *
 * Each point corresponds to one vectorized entity record after
 * dimensionality reduction (UMAP or PCA).
 */
export interface ClusterPoint {
    /** X coordinate in projected space. */
    X: number;
    /** Y coordinate in projected space. */
    Y: number;
    /** Z coordinate in projected space (only present for 3D projections). */
    Z?: number;
    /** Cluster assignment ID (`-1` for outliers / noise). */
    ClusterId: number;
    /** Display label for this point (typically the entity record identifier). */
    Label: string;
    /** Original vector key (e.g., entity record ID). */
    VectorKey: string;
    /** Arbitrary metadata surfaced in tooltips and click handlers. */
    Metadata: Record<string, unknown>;
}

/**
 * Summary information about a single cluster.
 *
 * Produced by `ClusteringService.RunPipeline()` and consumed by the
 * scatter plot legend and various event payloads.
 */
export interface ClusterInfo {
    /** Unique cluster identifier (zero-based). */
    Id: number;
    /** Human-readable label (auto-generated or user-defined). */
    Label: string;
    /** Display color as a CSS hex string (e.g., `#5b8def`). */
    Color: string;
    /** Number of member points in this cluster. */
    MemberCount: number;
}

/** Supported clustering algorithms. */
export type ClusterAlgorithm = 'kmeans' | 'dbscan';

/** Supported distance metrics for clustering. */
export type ClusterDistanceMetric = 'cosine' | 'euclidean' | 'dotproduct';

/**
 * Full configuration for a clustering run.
 *
 * Pass an instance to `ClusteringService.RunPipeline()` or emit from the
 * config panel's `RunClustering` output.
 */
export interface ClusterConfig {
    /** Entity name to cluster (must have Entity Documents with vectors). */
    EntityName: string;
    /** Specific Entity Document ID to use. When blank, the first active doc for the entity is used. */
    EntityDocumentID: string;
    /**
     * Multi-entity clustering: one or more Entity Document IDs whose vectors are
     * merged into a single analysis. When two or more are selected this takes
     * precedence over {@link EntityDocumentID}/{@link EntityName}. All selected
     * documents must use the same embedding model — the server hard-blocks mismatches.
     */
    EntityDocumentIDs?: string[];
    /** Legend mode: color points by their assigned cluster (default) or by source entity. */
    ColorBy?: 'cluster' | 'entity';
    /** Projected layout dimensionality: 2 (default, SVG) or 3 (rotatable projection). */
    Dimensions?: 2 | 3;
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
    /** Maximum number of entity records to fetch for clustering. */
    MaxRecords: number;
    /** Optional SQL-style filter applied to the Entity Document Runs query. */
    Filter: string;
}

/**
 * Quality and performance metrics returned after a clustering run.
 */
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

/**
 * Complete result of a clustering visualization pipeline.
 *
 * Returned by {@link ClusteringService.RunPipeline} and consumed by
 * both `mj-cluster-scatter` and `mj-cluster-config-panel`.
 */
export interface ClusterVisualizationResult {
    /** 2D projected points ready for rendering. */
    Points: ClusterPoint[];
    /** Cluster summaries with colors and counts. */
    Clusters: ClusterInfo[];
    /** Performance and quality metrics. */
    Metrics: ClusterMetrics;
    /** The config that produced this result. */
    Config: ClusterConfig;
}

/**
 * Serializable reference to a saved cluster visualization.
 *
 * Persisted via `UserInfoEngine` user settings so the user can reload
 * previous analyses.
 */
export interface SavedClusterVisualization {
    /** Unique identifier (UUID). */
    Id: string;
    /** User-given display name. */
    Name: string;
    /** Entity that was clustered. */
    EntityName: string;
    /** Algorithm used. */
    Algorithm: ClusterAlgorithm;
    /** Snapshot of the full config at save time. */
    Params: Partial<ClusterConfig>;
    /** ISO 8601 timestamp of when this was saved. */
    CreatedAt: string;
    /** Cached clustering result (points, clusters, metrics) — avoids re-computation on restore. */
    Result?: ClusterVisualizationResult;
    /** Viewport transform at save time (pan + zoom state). */
    Viewport?: ViewportTransform;
    /** LLM-generated (or user-edited) labels for each cluster. */
    ClusterLabels?: ClusterLabel[];
}

/** Viewport pan/zoom state for restoring scatter plot position. */
export interface ViewportTransform {
    TranslateX: number;
    TranslateY: number;
    Scale: number;
}

/** A human-readable label for a cluster. */
export interface ClusterLabel {
    /** The cluster ID this label applies to. */
    ClusterId: number;
    /** Short descriptive label (2-5 words). */
    Label: string;
    /** Whether the user has manually edited this label. */
    IsUserEdited: boolean;
}

// ================================================================
// Constants
// ================================================================

/**
 * Default cluster color palette -- 10 distinct, accessible colors.
 *
 * Override at the component level via `ClusterScatterComponent.ColorPalette`.
 */
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

// ================================================================
// Factory functions
// ================================================================

/**
 * Create a `ClusterConfig` populated with sensible defaults.
 *
 * @returns A new `ClusterConfig` with K-Means / cosine / 500 max records.
 *
 * @example
 * ```typescript
 * const cfg = DefaultClusterConfig();
 * cfg.EntityName = 'Accounts';
 * cfg.K = 6;
 * ```
 */
export function DefaultClusterConfig(): ClusterConfig {
    return {
        EntityName: '',
        EntityDocumentID: '',
        EntityDocumentIDs: [],
        ColorBy: 'cluster',
        Dimensions: 2,
        Algorithm: 'kmeans',
        K: 4,
        Epsilon: 0.3,
        MinPoints: 3,
        DistanceMetric: 'cosine',
        MaxRecords: 500,
        Filter: '',
    };
}
