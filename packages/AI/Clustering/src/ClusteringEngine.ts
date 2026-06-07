/**
 * @fileoverview Framework-agnostic clustering engine.
 *
 * Orchestrates the full pipeline: fetch vectors (via an injected
 * {@link IClusterVectorSource}) -> cluster (via {@link SimpleVectorService})
 * -> reduce dimensions (UMAP / PCA via {@link DimensionalityReducer}) ->
 * optionally name clusters with an LLM (via {@link ClusterNamer}) -> return a
 * {@link ClusterResult}. Also persists results to the `MJ: Cluster Analysis`
 * entity and suggests an optimal K via the elbow method.
 *
 * This engine has NO Angular / DOM coupling and can run on the server or client.
 */

import { Metadata, UserInfo, LogError, IMetadataProvider } from '@memberjunction/core';
import {
    SimpleVectorService,
    VectorEntry,
    ClusterResult as VectorClusterResult,
} from '@memberjunction/ai-vectors-memory';
import { MJClusterAnalysisEntity, MJClusterAnalysisClusterEntity } from '@memberjunction/core-entities';
import {
    CLUSTER_COLORS,
    ClusterConfig,
    ClusterInfo,
    ClusterInputVector,
    ClusterMetrics,
    ClusterPoint,
    ClusterResult,
    IClusterVectorSource,
    toPersistedAlgorithm,
    toVectorMetric,
} from './types';
import { DimensionalityReducer } from './DimensionalityReducer';
import { ClusterNamer } from './ClusterNamer';

/**
 * The serialized shape persisted into `ClusterAnalysis.ProjectedPoints`. A flat
 * array of points so the scatter can be rebuilt without re-running UMAP.
 */
export interface PersistedProjectedPoints {
    Dimensions: 2 | 3;
    Points: ClusterPoint[];
}

/**
 * Framework-agnostic clustering engine. Instantiate directly:
 * `const engine = new ClusteringEngine();`
 */
export class ClusteringEngine {
    private readonly reducer = new DimensionalityReducer();
    private readonly namer = new ClusterNamer();

    /**
     * Run the full clustering pipeline.
     *
     * @param config Clustering configuration.
     * @param vectorSource Adapter that fetches the vectors to cluster.
     * @param contextUser User context (required for server-side LLM naming).
     * @returns A complete {@link ClusterResult}.
     */
    public async RunPipeline(
        config: ClusterConfig,
        vectorSource: IClusterVectorSource,
        contextUser?: UserInfo,
    ): Promise<ClusterResult> {
        const startTime = Date.now();
        const vectors = await vectorSource.FetchVectors(config);

        if (vectors.length === 0) {
            return this.buildEmptyResult(config, Date.now() - startTime);
        }

        const vectorResult = this.cluster(vectors, config);
        const projected = this.project(vectors, config);
        const result = this.buildResult(vectors, vectorResult, projected, config, startTime);

        if (config.NameClusters) {
            await this.namer.NameClusters(result.Clusters, result.Points, contextUser);
        }

        return result;
    }

    /**
     * Suggest an optimal number of clusters (K) for the given vectors using the
     * elbow method (largest second-difference in inertia).
     *
     * @param vectors Vectors to analyze.
     * @param minK Minimum K to test (default 2).
     * @param maxK Maximum K to test (default 10, capped at vector count - 1).
     * @returns The suggested K, or 1 when there are too few vectors.
     */
    public SuggestK(vectors: ClusterInputVector[], minK = 2, maxK = 10): number {
        if (vectors.length <= 2) {
            return 1;
        }
        const svc = this.loadService(vectors);
        const upper = Math.min(maxK, vectors.length - 1);
        if (upper < minK) {
            return Math.max(1, upper);
        }

        const inertias = svc.ElbowMethod(minK, upper);
        return this.pickElbow(inertias, minK, upper);
    }

    /**
     * Persist a {@link ClusterResult} as a `MJ: Cluster Analysis` row plus child
     * `MJ: Cluster Analysis Clusters` rows.
     *
     * @param result The result to persist.
     * @param config The config the result was produced with.
     * @param owner Display name + ID of the owning user.
     * @param contextUser User context for the save (required server-side).
     * @param provider Per-request metadata provider — REQUIRED on a multi-user server
     *   so the save uses the caller's connection/security context, not the process
     *   global. Falls back to the global only for single-provider callers (e.g. CLI).
     * @returns The saved analysis ID, or null on failure.
     */
    public async SaveAnalysis(
        result: ClusterResult,
        config: ClusterConfig,
        owner: { Name: string; UserID: string },
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<string | null> {
        const md = provider ?? new Metadata();
        const analysis = await md.GetEntityObject<MJClusterAnalysisEntity>('MJ: Cluster Analysis', contextUser);

        this.populateAnalysis(analysis, result, config, owner);

        if (!(await analysis.Save())) {
            LogError(`SaveAnalysis: failed to save Cluster Analysis: ${analysis.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }

        const clustersSaved = await this.saveClusters(analysis.ID, result.Clusters, contextUser, provider);
        if (!clustersSaved) {
            LogError('SaveAnalysis: one or more cluster child rows failed to save.');
        }

        return analysis.ID;
    }

    // ================================================================
    // Pipeline steps
    // ================================================================

    /** Run KMeans or DBSCAN over the supplied vectors. */
    private cluster(vectors: ClusterInputVector[], config: ClusterConfig): VectorClusterResult {
        const svc = this.loadService(vectors);
        const metric = toVectorMetric(config.DistanceMetric);

        if (config.Algorithm === 'dbscan') {
            return svc.DBSCANCluster(config.Epsilon, config.MinPoints, metric);
        }
        const k = Math.min(Math.max(1, config.K), vectors.length);
        return svc.KMeansCluster(k, 100, metric);
    }

    /** Project the vectors to 2D/3D coordinates. */
    private project(vectors: ClusterInputVector[], config: ClusterConfig): Map<string, number[]> {
        const vectorMap = new Map<string, number[]>();
        for (const v of vectors) {
            vectorMap.set(v.Key, v.Vector);
        }
        return this.reducer.Reduce(vectorMap, config.Dimensions ?? 2);
    }

    /** Load vectors into a fresh SimpleVectorService instance. */
    private loadService(vectors: ClusterInputVector[]): SimpleVectorService {
        const svc = new SimpleVectorService();
        const entries: VectorEntry[] = vectors.map((v) => ({
            key: v.Key,
            vector: v.Vector,
            metadata: v.Metadata ?? {},
        }));
        svc.LoadVectors(entries);
        return svc;
    }

    // ================================================================
    // Result assembly
    // ================================================================

    /** Build a {@link ClusterResult} from raw clustering + projection output. */
    private buildResult(
        vectors: ClusterInputVector[],
        vectorResult: VectorClusterResult,
        projected: Map<string, number[]>,
        config: ClusterConfig,
        startTime: number,
    ): ClusterResult {
        const keyToCluster = this.buildAssignmentMap(vectorResult);
        const dimensions = config.Dimensions ?? 2;
        const points = vectors.map((v) => this.buildPoint(v, projected, keyToCluster, dimensions));
        const clusters = this.buildClusterInfos(vectorResult);
        const metrics = this.buildMetrics(vectors, vectorResult, clusters, startTime);

        return { Points: points, Clusters: clusters, Metrics: metrics, Config: config };
    }

    /** Map each vector key to its assigned cluster index (-1 for outliers). */
    private buildAssignmentMap(vectorResult: VectorClusterResult): Map<string, number> {
        const map = new Map<string, number>();
        vectorResult.clusters.forEach((members, clusterId) => {
            for (const key of members) {
                map.set(key, clusterId);
            }
        });
        for (const key of vectorResult.outliers ?? []) {
            map.set(key, -1);
        }
        return map;
    }

    /** Build a single projected point. */
    private buildPoint(
        v: ClusterInputVector,
        projected: Map<string, number[]>,
        keyToCluster: Map<string, number>,
        dimensions: 2 | 3,
    ): ClusterPoint {
        const coord = projected.get(v.Key) ?? [500, 350, 350];
        const point: ClusterPoint = {
            X: coord[0] ?? 500,
            Y: coord[1] ?? 350,
            ClusterIndex: keyToCluster.get(v.Key) ?? -1,
            Label: v.Label ?? v.Key,
            Key: v.Key,
            Metadata: v.Metadata ?? {},
        };
        if (dimensions === 3) {
            point.Z = coord[2] ?? 350;
        }
        return point;
    }

    /** Build cluster summaries (sorted by index). */
    private buildClusterInfos(vectorResult: VectorClusterResult): ClusterInfo[] {
        const clusters: ClusterInfo[] = [];
        vectorResult.clusters.forEach((members, clusterId) => {
            clusters.push({
                Index: clusterId,
                Label: `Cluster ${clusterId + 1}`,
                Color: CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length],
                MemberCount: members.length,
                IsUserEdited: false,
            });
        });
        return clusters.sort((a, b) => a.Index - b.Index);
    }

    /** Build run metrics. */
    private buildMetrics(
        vectors: ClusterInputVector[],
        vectorResult: VectorClusterResult,
        clusters: ClusterInfo[],
        startTime: number,
    ): ClusterMetrics {
        return {
            SilhouetteScore: vectorResult.metadata?.silhouetteScore ?? 0,
            ClusterCount: clusters.length,
            ComputationTimeMs: Date.now() - startTime,
            RecordCount: vectors.length,
            OutlierCount: vectorResult.outliers?.length ?? 0,
        };
    }

    /** Build an empty result when there are no vectors to cluster. */
    private buildEmptyResult(config: ClusterConfig, elapsedMs: number): ClusterResult {
        return {
            Points: [],
            Clusters: [],
            Metrics: {
                SilhouetteScore: 0,
                ClusterCount: 0,
                ComputationTimeMs: elapsedMs,
                RecordCount: 0,
                OutlierCount: 0,
            },
            Config: config,
        };
    }

    // ================================================================
    // Elbow selection
    // ================================================================

    /** Pick the elbow K via the largest second difference in inertia. */
    private pickElbow(inertias: Map<number, number>, minK: number, maxK: number): number {
        const ks: number[] = [];
        for (let k = minK; k <= maxK; k++) {
            ks.push(k);
        }
        if (ks.length < 3) {
            return ks[0] ?? minK;
        }

        let bestK = ks[0];
        let bestDelta = -Infinity;
        for (let i = 1; i < ks.length - 1; i++) {
            const prev = inertias.get(ks[i - 1]) ?? 0;
            const curr = inertias.get(ks[i]) ?? 0;
            const next = inertias.get(ks[i + 1]) ?? 0;
            const secondDiff = prev - 2 * curr + next;
            if (secondDiff > bestDelta) {
                bestDelta = secondDiff;
                bestK = ks[i];
            }
        }
        return bestK;
    }

    // ================================================================
    // Persistence
    // ================================================================

    /** Populate an analysis entity from a result + config. */
    private populateAnalysis(
        analysis: MJClusterAnalysisEntity,
        result: ClusterResult,
        config: ClusterConfig,
        owner: { Name: string; UserID: string },
    ): void {
        analysis.Name = owner.Name;
        analysis.UserID = owner.UserID;
        if (config.EntityID) {
            analysis.EntityID = config.EntityID;
        }
        analysis.Algorithm = toPersistedAlgorithm(config.Algorithm);
        analysis.Configuration = JSON.stringify(config);
        analysis.Metrics = JSON.stringify(result.Metrics);
        analysis.ProjectedPoints = JSON.stringify({
            Dimensions: config.Dimensions ?? 2,
            Points: result.Points,
        } satisfies PersistedProjectedPoints);
        analysis.ViewportState = null;
        analysis.Status = 'Complete';
    }

    /** Save the child cluster rows for an analysis. */
    private async saveClusters(
        analysisID: string,
        clusters: ClusterInfo[],
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<boolean> {
        const md = provider ?? new Metadata();
        let allOk = true;
        for (const cluster of clusters) {
            const row = await md.GetEntityObject<MJClusterAnalysisClusterEntity>(
                'MJ: Cluster Analysis Clusters',
                contextUser,
            );
            row.ClusterAnalysisID = analysisID;
            row.ClusterIndex = cluster.Index;
            row.Label = cluster.Label;
            row.MemberCount = cluster.MemberCount;
            row.Color = cluster.Color;
            row.IsUserEdited = cluster.IsUserEdited;

            if (!(await row.Save())) {
                LogError(`saveClusters: failed to save cluster ${cluster.Index}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                allOk = false;
            }
        }
        return allOk;
    }
}
