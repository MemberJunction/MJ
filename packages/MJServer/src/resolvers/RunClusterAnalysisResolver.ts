import { Resolver, Mutation, Arg, Ctx, ObjectType, InputType, Field, Float, Int } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import {
    ClusteringEngine,
    EntityDocumentVectorSource,
    ClusterConfig,
    ClusterAlgorithm,
    ClusterDistanceMetric,
} from '@memberjunction/clustering-engine';

/* ───── GraphQL input ───── */

@InputType()
export class RunClusterAnalysisInput {
    @Field({ nullable: true })
    EntityName?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    EntityDocumentID?: string;

    /**
     * Multi-entity clustering: one or more Entity Document IDs whose vectors are
     * merged into a single analysis. Takes precedence over EntityDocumentID when
     * non-empty. All selected docs must share the same embedding model (the engine
     * hard-blocks mismatches).
     */
    @Field(() => [String], { nullable: true })
    EntityDocumentIDs?: string[];

    /** Legend mode: color points by 'cluster' (default) or 'entity'. */
    @Field({ nullable: true })
    ColorBy?: string;

    /** Clustering algorithm: 'kmeans' or 'dbscan'. */
    @Field({ nullable: true })
    Algorithm?: string;

    /** Number of clusters for K-Means. */
    @Field(() => Int, { nullable: true })
    K?: number;

    /** Epsilon neighbourhood radius for DBSCAN. */
    @Field(() => Float, { nullable: true })
    Epsilon?: number;

    /** Minimum points to form a dense region in DBSCAN. */
    @Field(() => Int, { nullable: true })
    MinPoints?: number;

    /** Distance metric: 'cosine', 'euclidean' or 'dotproduct'. */
    @Field({ nullable: true })
    DistanceMetric?: string;

    /** Maximum number of records to fetch for clustering. */
    @Field(() => Int, { nullable: true })
    MaxRecords?: number;

    /** Optional SQL-style filter applied by the vector source. */
    @Field({ nullable: true })
    Filter?: string;

    /** When true, runs the optional LLM cluster-naming step. */
    @Field({ nullable: true })
    NameClusters?: boolean;

    /** Number of dimensions for the projected layout (2 or 3). Defaults to 2. */
    @Field(() => Int, { nullable: true })
    Dimensions?: number;

    /**
     * When supplied, the result is persisted as an `MJ: Cluster Analysis` row
     * with this Name and the returned `AnalysisID` is populated.
     */
    @Field({ nullable: true })
    PersistName?: string;
}

/* ───── GraphQL output ───── */

@ObjectType()
export class RunClusterAnalysisResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    /** Number of clusters discovered. */
    @Field(() => Int)
    ClusterCount: number;

    /** Number of records that were clustered. */
    @Field(() => Int)
    RecordCount: number;

    /** Number of outlier points (DBSCAN only). */
    @Field(() => Int)
    OutlierCount: number;

    /** Silhouette score (-1 .. 1). */
    @Field(() => Float)
    SilhouetteScore: number;

    /** Wall-clock computation time in milliseconds. */
    @Field(() => Float)
    ComputationTimeMs: number;

    /** JSON-serialized {@link ClusterMetrics}. */
    @Field()
    MetricsJSON: string;

    /** JSON-serialized array of {@link ClusterInfo}. */
    @Field()
    ClustersJSON: string;

    /** JSON-serialized array of {@link ClusterPoint} (can be large). */
    @Field()
    PointsJSON: string;

    /** The persisted `MJ: Cluster Analysis` ID when a PersistName was supplied. */
    @Field({ nullable: true })
    AnalysisID?: string;
}

/* ───── Resolver ───── */

@Resolver()
export class RunClusterAnalysisResolver extends ResolverBase {
    @Mutation(() => RunClusterAnalysisResult)
    async RunClusterAnalysis(
        @Arg('input', () => RunClusterAnalysisInput) input: RunClusterAnalysisInput,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<RunClusterAnalysisResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user');
            }

            const config = this.buildConfig(input);
            const engine = new ClusteringEngine();
            const vectorSource = new EntityDocumentVectorSource(currentUser);

            LogStatus(
                `RunClusterAnalysis: algorithm=${config.Algorithm} entity=${config.EntityName ?? config.EntityID ?? config.EntityDocumentID}`
            );

            const result = await engine.RunPipeline(config, vectorSource, currentUser);

            let analysisID: string | undefined;
            if (input.PersistName && input.PersistName.trim().length > 0) {
                analysisID = await this.persistAnalysis(engine, result, config, input.PersistName.trim(), currentUser);
            }

            return {
                Success: true,
                ClusterCount: result.Metrics.ClusterCount,
                RecordCount: result.Metrics.RecordCount,
                OutlierCount: result.Metrics.OutlierCount,
                SilhouetteScore: result.Metrics.SilhouetteScore,
                ComputationTimeMs: result.Metrics.ComputationTimeMs,
                MetricsJSON: JSON.stringify(result.Metrics),
                ClustersJSON: JSON.stringify(result.Clusters),
                PointsJSON: JSON.stringify(result.Points),
                AnalysisID: analysisID,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RunClusterAnalysis mutation failed: ${msg}`);
            return this.errorResult(msg);
        }
    }

    /** Build a {@link ClusterConfig} from the GraphQL input, applying defaults. */
    private buildConfig(input: RunClusterAnalysisInput): ClusterConfig {
        return {
            EntityName: input.EntityName ?? '',
            EntityID: input.EntityID ?? '',
            EntityDocumentID: input.EntityDocumentID ?? '',
            EntityDocumentIDs: (input.EntityDocumentIDs ?? []).filter((id) => !!id && id.trim().length > 0),
            ColorBy: input.ColorBy === 'entity' ? 'entity' : 'cluster',
            Algorithm: this.normalizeAlgorithm(input.Algorithm),
            K: input.K ?? 4,
            Epsilon: input.Epsilon ?? 0.3,
            MinPoints: input.MinPoints ?? 3,
            DistanceMetric: this.normalizeMetric(input.DistanceMetric),
            MaxRecords: input.MaxRecords ?? 500,
            Filter: input.Filter ?? '',
            NameClusters: input.NameClusters ?? false,
            Dimensions: input.Dimensions === 3 ? 3 : 2,
        };
    }

    /** Coerce a raw algorithm string to a supported {@link ClusterAlgorithm}. */
    private normalizeAlgorithm(value: string | undefined): ClusterAlgorithm {
        return value?.toLowerCase() === 'dbscan' ? 'dbscan' : 'kmeans';
    }

    /** Coerce a raw metric string to a supported {@link ClusterDistanceMetric}. */
    private normalizeMetric(value: string | undefined): ClusterDistanceMetric {
        const v = value?.toLowerCase();
        if (v === 'euclidean' || v === 'dotproduct') {
            return v;
        }
        return 'cosine';
    }

    /** Persist the result and return the new analysis ID (or undefined on failure). */
    private async persistAnalysis(
        engine: ClusteringEngine,
        result: Awaited<ReturnType<ClusteringEngine['RunPipeline']>>,
        config: ClusterConfig,
        persistName: string,
        currentUser: UserInfo
    ): Promise<string | undefined> {
        const owner = { Name: persistName, UserID: currentUser.ID };
        const savedID = await engine.SaveAnalysis(result, config, owner, currentUser);
        if (!savedID) {
            LogError(`RunClusterAnalysis: failed to persist analysis "${persistName}".`);
            return undefined;
        }
        return savedID;
    }

    private errorResult(message: string): RunClusterAnalysisResult {
        return {
            Success: false,
            ErrorMessage: message,
            ClusterCount: 0,
            RecordCount: 0,
            OutlierCount: 0,
            SilhouetteScore: 0,
            ComputationTimeMs: 0,
            MetricsJSON: '{}',
            ClustersJSON: '[]',
            PointsJSON: '[]',
        };
    }
}
