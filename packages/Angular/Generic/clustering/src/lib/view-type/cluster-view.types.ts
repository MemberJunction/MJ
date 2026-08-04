import { ClusterAlgorithm } from '../clustering.types';

/**
 * Configuration for the Cluster **view type** (the entity-viewer plug-in), persisted per
 * `UserView` in `DisplayState.viewTypeConfigs` keyed by the Cluster `MJ: View Types` row ID.
 *
 * This is the plug-in-owned config shape referenced opaquely by the host as
 * `Record<string, unknown>`; the Cluster renderer + prop-sheet interpret it with this type.
 */
export interface ClusterViewConfig {
  /** Clustering algorithm. */
  algorithm: ClusterAlgorithm;
  /** Number of clusters for K-Means (ignored for DBSCAN). */
  k: number;
  /** Projected layout dimensionality: 2 (SVG) or 3 (rotatable). */
  dimensions: 2 | 3;
  /** Legend mode: color by assigned cluster (default) or by source entity. */
  colorBy: 'cluster' | 'entity';
  /** Maximum records to fetch for clustering. */
  maxRecords: number;
  /** Whether to name clusters with an LLM (server-side). */
  nameClusters: boolean;
}

/** Sensible defaults for a fresh Cluster view. */
export const DEFAULT_CLUSTER_VIEW_CONFIG: ClusterViewConfig = {
  algorithm: 'kmeans',
  k: 5,
  dimensions: 2,
  colorBy: 'cluster',
  maxRecords: 500,
  nameClusters: true,
};

/**
 * Normalizes an opaque host config map into a fully-populated {@link ClusterViewConfig},
 * filling any missing keys from {@link DEFAULT_CLUSTER_VIEW_CONFIG}. Tolerant of partial or
 * empty input (e.g. a brand-new view with no saved config).
 */
export function toClusterViewConfig(raw: Record<string, unknown> | null | undefined): ClusterViewConfig {
  const r = raw ?? {};
  const algorithm = r['algorithm'] === 'dbscan' ? 'dbscan' : 'kmeans';
  const dimensions = r['dimensions'] === 3 ? 3 : 2;
  const colorBy = r['colorBy'] === 'entity' ? 'entity' : 'cluster';
  return {
    algorithm,
    k: typeof r['k'] === 'number' ? (r['k'] as number) : DEFAULT_CLUSTER_VIEW_CONFIG.k,
    dimensions,
    colorBy,
    maxRecords: typeof r['maxRecords'] === 'number' ? (r['maxRecords'] as number) : DEFAULT_CLUSTER_VIEW_CONFIG.maxRecords,
    nameClusters: typeof r['nameClusters'] === 'boolean' ? (r['nameClusters'] as boolean) : DEFAULT_CLUSTER_VIEW_CONFIG.nameClusters,
  };
}
