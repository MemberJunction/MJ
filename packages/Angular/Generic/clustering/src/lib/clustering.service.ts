/**
 * @fileoverview Pure clustering + dimensionality-reduction service.
 *
 * This service is GENERIC — it accepts pre-fetched vectors and returns
 * clustering results.  It does NOT fetch data from any database or API.
 *
 * Pipeline:
 * 1. Accept vectors from the caller
 * 2. Run clustering via SimpleVectorService (K-Means or DBSCAN)
 * 3. Reduce dimensions to 2D via UMAP (or PCA fallback)
 * 4. Return ClusterVisualizationResult
 */

import { Injectable } from '@angular/core';
import { SimpleVectorService, VectorEntry, ClusterResult } from '@memberjunction/ai-vectors-memory';
import {
    ClusterConfig,
    ClusterVisualizationResult,
    ClusterPoint,
    ClusterInfo,
    ClusterMetrics,
    ClusterInputVector,
    CLUSTER_COLORS,
} from './clustering.types';

@Injectable({ providedIn: 'root' })
export class ClusteringService {

    /**
     * Run the full clustering pipeline on pre-fetched vectors:
     * cluster, project to 2D, and return a visualization result.
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
    // Private helpers
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
