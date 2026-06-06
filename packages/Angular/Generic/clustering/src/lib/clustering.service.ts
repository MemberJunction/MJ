/**
 * @fileoverview Clustering + dimensionality-reduction orchestration service.
 *
 * This service has two complementary paths:
 *
 * 1. **Server-delegated** ({@link ClusteringService.RunClusterAnalysis}) —
 *    the preferred path when a data provider is available. The heavy
 *    fetch → cluster → reduce → name pipeline runs server-side via the
 *    `RunClusterAnalysis` GraphQL mutation (engine: `@memberjunction/clustering-engine`).
 *    The transport is the typed {@link GraphQLClusterClient}. This keeps large
 *    vector payloads off the wire and lets the server own LLM cluster-naming.
 *
 * 2. **In-browser fallback** ({@link ClusteringService.RunClustering}) — accepts
 *    pre-fetched vectors and runs the clustering + 2D projection locally via
 *    `SimpleVectorService` + UMAP/PCA. Used when no provider/endpoint is
 *    available, or by callers that already hold the vectors.
 *
 * The public API of the in-browser path is unchanged so existing consumers keep
 * compiling.
 */

import { Injectable } from '@angular/core';
import { SimpleVectorService, VectorEntry, ClusterResult } from '@memberjunction/ai-vectors-memory';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import {
    GraphQLDataProvider,
    GraphQLClusterClient,
    RunClusterAnalysisInput,
    RunClusterAnalysisResult,
    ClusterAnalysisPoint,
    ClusterAnalysisInfo,
} from '@memberjunction/graphql-dataprovider';
import {
    ClusterConfig,
    ClusterVisualizationResult,
    ClusterPoint,
    ClusterInfo,
    ClusterMetrics,
    ClusterInputVector,
    CLUSTER_COLORS,
} from './clustering.types';

/**
 * Optional server-only knobs that `ClusterConfig` (the in-browser config shape)
 * does not carry, but the server pipeline supports. Passed alongside the config
 * to {@link ClusteringService.RunClusterAnalysis}.
 */
export interface ClusterAnalysisServerOptions {
    /** Entity ID — persisted to the analysis row when available. */
    EntityID?: string;
    /** When true, the server runs the optional LLM cluster-naming step. */
    NameClusters?: boolean;
    /** Number of dimensions for the projected layout (2 or 3). Defaults to 2. */
    Dimensions?: 2 | 3;
    /** When supplied, the server persists the analysis with this Name and returns its AnalysisID. */
    PersistName?: string;
}

@Injectable({ providedIn: 'root' })
export class ClusteringService {

    /**
     * Run the full clustering pipeline on the **server** via the
     * `RunClusterAnalysis` GraphQL mutation, then map the result into the
     * Angular {@link ClusterVisualizationResult} shape used for rendering.
     *
     * This is the preferred path: the server fetches the vectors, clusters,
     * reduces dimensions, and (optionally) names clusters with an LLM — so the
     * client never has to ship large vector payloads or duplicate that logic.
     *
     * The data provider is resolved per multi-provider rules: the caller may
     * pass an explicit {@link IMetadataProvider}; otherwise the global
     * `Metadata.Provider` is used. The provider must be a {@link GraphQLDataProvider}
     * (the browser transport); when it is not, this method returns `null` so the
     * caller can fall back to {@link ClusteringService.RunClustering}.
     *
     * @param config   Clustering configuration (algorithm, K, epsilon, etc.).
     * @param options  Optional server-only knobs (NameClusters, Dimensions, PersistName, EntityID).
     * @param provider Optional metadata provider to scope the request to a specific server.
     * @returns A visualization result, or `null` when no GraphQL provider is available.
     */
    public async RunClusterAnalysis(
        config: ClusterConfig,
        options?: ClusterAnalysisServerOptions,
        provider?: IMetadataProvider | null,
    ): Promise<ClusterVisualizationResult | null> {
        const gqlProvider = this.resolveGraphQLProvider(provider);
        if (!gqlProvider) {
            // No GraphQL endpoint available — caller should fall back to RunClustering().
            return null;
        }

        const client = new GraphQLClusterClient(gqlProvider);
        const input = this.buildAnalysisInput(config, options);
        const serverResult = await client.RunClusterAnalysis(input);

        if (!serverResult.Success) {
            throw new Error(serverResult.ErrorMessage || 'Cluster analysis failed on the server.');
        }

        return this.mapServerResult(serverResult, config);
    }

    /**
     * Run the full clustering pipeline on pre-fetched vectors **in the browser**:
     * cluster, project to 2D, and return a visualization result.
     *
     * This is the fallback path used when no GraphQL provider is available, or
     * by callers that already hold the vectors and want local computation.
     *
     * @param vectors  Array of vectors with keys, raw number arrays, and optional metadata.
     * @param config   Clustering configuration (algorithm, K, epsilon, etc.).
     * @returns        A complete visualization result ready for rendering.
     */
    public async RunClustering(
        vectors: ClusterInputVector[],
        config: ClusterConfig,
    ): Promise<ClusterVisualizationResult> {
        const startTime = performance.now();

        if (vectors.length === 0) {
            return this.buildEmptyResult(config, performance.now() - startTime);
        }

        // Step 1: Load into SimpleVectorService and run clustering
        const svc = new SimpleVectorService();
        const entries: VectorEntry[] = vectors.map(v => ({
            key: v.Key,
            vector: v.Vector,
            metadata: v.Metadata ?? {},
        }));
        svc.LoadVectors(entries);

        let clusterResult: ClusterResult;
        if (config.Algorithm === 'dbscan') {
            clusterResult = svc.DBSCANCluster(config.Epsilon, config.MinPoints, config.DistanceMetric);
        } else {
            const k = Math.min(config.K, vectors.length);
            clusterResult = svc.KMeansCluster(k, 100, config.DistanceMetric);
        }

        // Step 2: Reduce dimensions to 2D
        const vectorMap = new Map<string, number[]>();
        for (const v of vectors) {
            vectorMap.set(v.Key, v.Vector);
        }
        const projected = await this.reduceDimensionsKeyed(vectorMap);

        // Step 3: Build result
        return this.buildResult(vectors, clusterResult, projected, config, startTime);
    }

    /**
     * Reduce an array of high-dimensional vectors to 2D points using UMAP
     * (falls back to PCA if UMAP is unavailable).
     *
     * This is a standalone helper when you only need dimensionality reduction
     * without clustering.
     *
     * @param vectors  Array of raw number arrays (each the same length).
     * @returns        Array of {x, y} points in the same order as input.
     */
    public async ReduceDimensions(vectors: number[][]): Promise<Array<{ x: number; y: number }>> {
        if (vectors.length === 0) return [];

        // Build temporary keyed map
        const keys = vectors.map((_, i) => String(i));
        const keyedMap = new Map<string, number[]>();
        keys.forEach((k, i) => keyedMap.set(k, vectors[i]));

        const projected = await this.reduceDimensionsKeyed(keyedMap);
        return keys.map(k => {
            const [x, y] = projected.get(k) ?? [0, 0];
            return { x, y };
        });
    }

    // ================================================================
    // Private helpers — server delegation
    // ================================================================

    /**
     * Resolve a {@link GraphQLDataProvider} from the supplied provider (or the
     * global default). Returns `null` when the active provider is not a GraphQL
     * provider (e.g. a non-browser transport), signalling the caller to fall
     * back to the in-browser pipeline.
     */
    private resolveGraphQLProvider(provider?: IMetadataProvider | null): GraphQLDataProvider | null {
        const p = provider ?? Metadata.Provider;
        return p instanceof GraphQLDataProvider ? p : null;
    }

    /** Build the {@link RunClusterAnalysisInput} from the config + server options. */
    private buildAnalysisInput(
        config: ClusterConfig,
        options?: ClusterAnalysisServerOptions,
    ): RunClusterAnalysisInput {
        return {
            EntityName: config.EntityName,
            EntityID: options?.EntityID,
            EntityDocumentID: config.EntityDocumentID,
            Algorithm: config.Algorithm,
            K: config.K,
            Epsilon: config.Epsilon,
            MinPoints: config.MinPoints,
            DistanceMetric: config.DistanceMetric,
            MaxRecords: config.MaxRecords,
            Filter: config.Filter,
            NameClusters: options?.NameClusters,
            Dimensions: options?.Dimensions,
            PersistName: options?.PersistName,
        };
    }

    /**
     * Map the server's {@link RunClusterAnalysisResult} (engine-shaped, with
     * `ClusterIndex` / `Index` / `Key`) into the Angular
     * {@link ClusterVisualizationResult} shape (`ClusterId` / `Id` / `VectorKey`)
     * consumed by the scatter plot.
     */
    private mapServerResult(
        serverResult: RunClusterAnalysisResult,
        config: ClusterConfig,
    ): ClusterVisualizationResult {
        const points: ClusterPoint[] = serverResult.Points.map(p => this.mapServerPoint(p));
        const clusters: ClusterInfo[] = serverResult.Clusters.map(c => this.mapServerCluster(c));
        clusters.sort((a, b) => a.Id - b.Id);

        const m = serverResult.Metrics;
        const metrics: ClusterMetrics = {
            SilhouetteScore: m.SilhouetteScore,
            ClusterCount: m.ClusterCount,
            ComputationTimeMs: m.ComputationTimeMs,
            RecordCount: m.RecordCount,
            OutlierCount: m.OutlierCount,
        };

        return { Points: points, Clusters: clusters, Metrics: metrics, Config: config };
    }

    /** Map a single engine-shaped point into the Angular {@link ClusterPoint} shape. */
    private mapServerPoint(p: ClusterAnalysisPoint): ClusterPoint {
        return {
            X: p.X,
            Y: p.Y,
            ClusterId: p.ClusterIndex,
            Label: p.Label ?? p.Key,
            VectorKey: p.Key,
            Metadata: p.Metadata ?? {},
        };
    }

    /** Map a single engine-shaped cluster into the Angular {@link ClusterInfo} shape. */
    private mapServerCluster(c: ClusterAnalysisInfo): ClusterInfo {
        return {
            Id: c.Index,
            Label: c.Label,
            Color: c.Color || CLUSTER_COLORS[c.Index % CLUSTER_COLORS.length],
            MemberCount: c.MemberCount,
        };
    }

    // ================================================================
    // Private helpers — in-browser pipeline
    // ================================================================

    /**
     * Reduce high-dimensional vectors to 2D using UMAP.
     * Falls back to PCA if UMAP is not available.
     */
    private async reduceDimensionsKeyed(vectorMap: Map<string, number[]>): Promise<Map<string, [number, number]>> {
        const keys = Array.from(vectorMap.keys());
        const vectors = keys.map(k => vectorMap.get(k)!);
        const result = new Map<string, [number, number]>();

        if (vectors.length <= 2) {
            // Trivial case
            keys.forEach((key, i) => {
                result.set(key, [i * 500 + 250, 350]);
            });
            return result;
        }

        try {
            const { UMAP } = await import('umap-js');
            const umap = new UMAP({
                nComponents: 2,
                nNeighbors: Math.min(15, Math.max(2, Math.floor(vectors.length / 5))),
                minDist: 0.1,
                spread: 1.0,
            });
            const embedding = umap.fit(vectors);
            this.normalizeAndAssign(keys, embedding, result);
        } catch {
            // PCA fallback: project onto first 2 principal components
            this.pcaFallback(keys, vectors, result);
        }

        return result;
    }

    /** Normalize 2D embedding to [padding, viewBoxSize - padding] range */
    private normalizeAndAssign(
        keys: string[],
        embedding: number[][],
        result: Map<string, [number, number]>
    ): void {
        const padding = 60;
        const size = 1000;
        const usable = size - 2 * padding;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of embedding) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;

        keys.forEach((key, i) => {
            const nx = padding + ((embedding[i][0] - minX) / rangeX) * usable;
            const ny = padding + ((embedding[i][1] - minY) / rangeY) * usable;
            result.set(key, [nx, ny]);
        });
    }

    /** Simple PCA: compute mean, subtract, take first 2 components via power iteration */
    private pcaFallback(
        keys: string[],
        vectors: number[][],
        result: Map<string, [number, number]>
    ): void {
        const dim = vectors[0].length;
        const n = vectors.length;

        // Compute mean
        const mean = new Array<number>(dim).fill(0);
        for (const v of vectors) {
            for (let d = 0; d < dim; d++) mean[d] += v[d];
        }
        for (let d = 0; d < dim; d++) mean[d] /= n;

        // Center data
        const centered = vectors.map(v => v.map((val, d) => val - mean[d]));

        // Power iteration for first 2 components
        const components: number[][] = [];
        for (let comp = 0; comp < 2; comp++) {
            let w = new Array<number>(dim).fill(0).map(() => Math.random() - 0.5);
            for (let iter = 0; iter < 50; iter++) {
                const newW = new Array<number>(dim).fill(0);
                for (const row of centered) {
                    const dot = row.reduce((s, val, d) => s + val * w[d], 0);
                    for (let d = 0; d < dim; d++) newW[d] += dot * row[d];
                }
                // Deflate by previous components
                for (const prev of components) {
                    const proj = newW.reduce((s, val, d) => s + val * prev[d], 0);
                    for (let d = 0; d < dim; d++) newW[d] -= proj * prev[d];
                }
                // Normalize
                const norm = Math.sqrt(newW.reduce((s, val) => s + val * val, 0)) || 1;
                w = newW.map(val => val / norm);
            }
            components.push(w);
        }

        // Project
        const projections = centered.map(row => [
            row.reduce((s, val, d) => s + val * components[0][d], 0),
            row.reduce((s, val, d) => s + val * (components[1]?.[d] ?? 0), 0),
        ]);

        this.normalizeAndAssign(keys, projections, result);
    }

    /** Build a ClusterVisualizationResult from raw data */
    private buildResult(
        vectors: ClusterInputVector[],
        clusterResult: ClusterResult,
        projected: Map<string, [number, number]>,
        config: ClusterConfig,
        startTime: number,
    ): ClusterVisualizationResult {
        // Build lookup: vectorKey -> clusterId
        const keyToCluster = new Map<string, number>();
        clusterResult.clusters.forEach((members, clusterId) => {
            for (const key of members) {
                keyToCluster.set(key, clusterId);
            }
        });

        // Mark outliers as cluster -1
        if (clusterResult.outliers) {
            for (const key of clusterResult.outliers) {
                keyToCluster.set(key, -1);
            }
        }

        // Build points
        const points: ClusterPoint[] = vectors.map(v => {
            const [x, y] = projected.get(v.Key) ?? [500, 350];
            return {
                X: x,
                Y: y,
                ClusterId: keyToCluster.get(v.Key) ?? -1,
                Label: v.Label ?? v.Key,
                VectorKey: v.Key,
                Metadata: v.Metadata ?? {},
            };
        });

        // Build cluster infos
        const clusters: ClusterInfo[] = [];
        clusterResult.clusters.forEach((members, clusterId) => {
            clusters.push({
                Id: clusterId,
                Label: `Cluster ${clusterId + 1}`,
                Color: CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length],
                MemberCount: members.length,
            });
        });
        // Sort by ID
        clusters.sort((a, b) => a.Id - b.Id);

        const outlierCount = clusterResult.outliers?.length ?? 0;

        const metrics: ClusterMetrics = {
            SilhouetteScore: clusterResult.metadata?.silhouetteScore ?? 0,
            ClusterCount: clusters.length,
            ComputationTimeMs: Math.round(performance.now() - startTime),
            RecordCount: vectors.length,
            OutlierCount: outlierCount,
        };

        return { Points: points, Clusters: clusters, Metrics: metrics, Config: config };
    }

    /** Build an empty result when no vectors are found */
    private buildEmptyResult(config: ClusterConfig, elapsedMs: number): ClusterVisualizationResult {
        return {
            Points: [],
            Clusters: [],
            Metrics: {
                SilhouetteScore: 0,
                ClusterCount: 0,
                ComputationTimeMs: Math.round(elapsedMs),
                RecordCount: 0,
                OutlierCount: 0,
            },
            Config: config,
        };
    }
}
