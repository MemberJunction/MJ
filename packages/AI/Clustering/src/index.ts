/**
 * @module @memberjunction/clustering-engine
 * @description Framework-agnostic clustering + dimensionality-reduction engine
 * with persistence to the MJ Cluster Analysis entities.
 */

export * from './types';
export { DimensionalityReducer, ProjectionDimensions, ProjectedCoord } from './DimensionalityReducer';
export { ClusterNamer, CLUSTER_NAMING_PROMPT_NAME } from './ClusterNamer';
export { ClusteringEngine, PersistedProjectedPoints } from './ClusteringEngine';
export { InMemoryVectorSource } from './adapters/InMemoryVectorSource';
export { EntityDocumentVectorSource } from './adapters/EntityDocumentVectorSource';
