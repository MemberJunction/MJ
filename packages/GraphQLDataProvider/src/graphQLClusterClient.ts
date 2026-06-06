import { LogError } from "@memberjunction/core";
import { SafeJSONParse } from "@memberjunction/global";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";

/**
 * Input for the `RunClusterAnalysis` GraphQL mutation.
 *
 * Mirrors the server-side `RunClusterAnalysisInput` (MJServer
 * `RunClusterAnalysisResolver`). All fields are optional; the server applies
 * defaults for any that are omitted.
 */
export interface RunClusterAnalysisInput {
    /** Entity name whose records are being clustered. */
    EntityName?: string;
    /** Entity ID — persisted to the top-level `EntityID` column when available. */
    EntityID?: string;
    /** Specific Entity Document ID supplying the vectors. Blank => the server chooses. */
    EntityDocumentID?: string;
    /** Clustering algorithm: 'kmeans' or 'dbscan'. */
    Algorithm?: string;
    /** Number of clusters for K-Means. */
    K?: number;
    /** Epsilon neighbourhood radius for DBSCAN. */
    Epsilon?: number;
    /** Minimum points to form a dense region in DBSCAN. */
    MinPoints?: number;
    /** Distance metric: 'cosine', 'euclidean' or 'dotproduct'. */
    DistanceMetric?: string;
    /** Maximum number of records to fetch for clustering. */
    MaxRecords?: number;
    /** Optional SQL-style filter applied by the vector source. */
    Filter?: string;
    /** When true, runs the optional LLM cluster-naming step server-side. */
    NameClusters?: boolean;
    /** Number of dimensions for the projected layout (2 or 3). Defaults to 2. */
    Dimensions?: number;
    /**
     * When supplied, the result is persisted as an `MJ: Cluster Analysis` row
     * with this Name and the returned `AnalysisID` is populated.
     */
    PersistName?: string;
}

/**
 * A single projected point returned by the clustering pipeline, after
 * dimensionality reduction. Parsed from the mutation's `PointsJSON` field.
 *
 * Defined locally here (not imported from `@memberjunction/clustering-engine`)
 * so this transport package stays decoupled from the engine. The shape mirrors
 * the engine's `ClusterPoint`.
 */
export interface ClusterAnalysisPoint {
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

/**
 * Summary information about a single discovered cluster. Parsed from the
 * mutation's `ClustersJSON` field. Mirrors the engine's `ClusterInfo`.
 */
export interface ClusterAnalysisInfo {
    /** Zero-based cluster index, matching `ClusterAnalysisPoint.ClusterIndex`. */
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

/**
 * Quality + performance metrics for a clustering run. Parsed from the
 * mutation's `MetricsJSON` field. Mirrors the engine's `ClusterMetrics`.
 */
export interface ClusterAnalysisMetrics {
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
 * Fully-parsed result of a `RunClusterAnalysis` mutation.
 *
 * The transport helper parses the JSON-string fields
 * (`MetricsJSON` / `ClustersJSON` / `PointsJSON`) returned by the server back
 * into the typed `Metrics` / `Clusters` / `Points` properties so consumers
 * never deal with raw JSON strings.
 */
export interface RunClusterAnalysisResult {
    /** Whether the analysis succeeded. */
    Success: boolean;
    /** Error message when `Success` is false. */
    ErrorMessage?: string;
    /** Parsed quality + performance metrics. */
    Metrics: ClusterAnalysisMetrics;
    /** Parsed cluster summaries. */
    Clusters: ClusterAnalysisInfo[];
    /** Parsed projected points (can be large). */
    Points: ClusterAnalysisPoint[];
    /** The persisted `MJ: Cluster Analysis` ID when a `PersistName` was supplied. */
    AnalysisID?: string;
}

/** Raw shape of the GraphQL mutation payload (before JSON-string parsing). */
interface RawRunClusterAnalysisResult {
    Success: boolean;
    ErrorMessage?: string;
    ClusterCount: number;
    RecordCount: number;
    OutlierCount: number;
    SilhouetteScore: number;
    ComputationTimeMs: number;
    MetricsJSON: string;
    ClustersJSON: string;
    PointsJSON: string;
    AnalysisID?: string;
}

/**
 * Client for running cluster analysis on the server through GraphQL.
 *
 * The heavy clustering / dimensionality-reduction / LLM-naming pipeline runs
 * server-side (via `@memberjunction/clustering-engine`); this client is a thin,
 * strongly-typed transport that sends the `RunClusterAnalysis` mutation and
 * parses the JSON-string fields back into typed objects.
 *
 * Follows the same naming + construction convention as the other GraphQL
 * clients in this package (`GraphQLAIClient`, `GraphQLEncryptionClient`, etc.).
 *
 * @example
 * ```typescript
 * const clusterClient = new GraphQLClusterClient(graphQLProvider);
 * const result = await clusterClient.RunClusterAnalysis({
 *   EntityName: 'Companies',
 *   Algorithm: 'kmeans',
 *   K: 5,
 *   Dimensions: 2,
 *   NameClusters: true,
 * });
 * if (result.Success) {
 *   console.log('Clusters:', result.Clusters);
 *   console.log('Points:', result.Points.length);
 * } else {
 *   console.error(result.ErrorMessage);
 * }
 * ```
 */
export class GraphQLClusterClient {
    /** The GraphQLDataProvider instance used to execute GraphQL requests. */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLClusterClient instance.
     * @param dataProvider The GraphQL data provider to use for the mutation.
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Run a cluster analysis on the server.
     *
     * Sends the `RunClusterAnalysis` mutation, then parses the JSON-string
     * fields (`MetricsJSON` / `ClustersJSON` / `PointsJSON`) into typed objects.
     *
     * @param input The clustering parameters (entity, algorithm, K, etc.).
     * @returns A Promise resolving to a fully-parsed {@link RunClusterAnalysisResult}.
     */
    public async RunClusterAnalysis(input: RunClusterAnalysisInput): Promise<RunClusterAnalysisResult> {
        try {
            const mutation = gql`
                mutation RunClusterAnalysis($input: RunClusterAnalysisInput!) {
                    RunClusterAnalysis(input: $input) {
                        Success
                        ErrorMessage
                        ClusterCount
                        RecordCount
                        OutlierCount
                        SilhouetteScore
                        ComputationTimeMs
                        MetricsJSON
                        ClustersJSON
                        PointsJSON
                        AnalysisID
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(mutation, { input });
            const raw: RawRunClusterAnalysisResult | undefined = result?.RunClusterAnalysis;
            if (!raw) {
                throw new Error('Invalid response from server');
            }

            return this.parseResult(raw);
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLClusterClient.RunClusterAnalysis failed', undefined, e);
            return this.errorResult(e.message || 'Unknown error occurred');
        }
    }

    /**
     * Parse the raw mutation payload, deserializing the JSON-string fields into
     * typed objects.
     */
    private parseResult(raw: RawRunClusterAnalysisResult): RunClusterAnalysisResult {
        const metrics = this.parseMetrics(raw);
        const clusters = SafeJSONParse<ClusterAnalysisInfo[]>(raw.ClustersJSON) ?? [];
        const points = SafeJSONParse<ClusterAnalysisPoint[]>(raw.PointsJSON) ?? [];

        return {
            Success: raw.Success,
            ErrorMessage: raw.ErrorMessage,
            Metrics: metrics,
            Clusters: clusters,
            Points: points,
            AnalysisID: raw.AnalysisID,
        };
    }

    /**
     * Parse the `MetricsJSON` field, falling back to the scalar metric fields
     * on the payload when the JSON is missing or unparseable.
     */
    private parseMetrics(raw: RawRunClusterAnalysisResult): ClusterAnalysisMetrics {
        const parsed = SafeJSONParse<ClusterAnalysisMetrics>(raw.MetricsJSON);
        if (parsed) {
            return parsed;
        }
        return {
            SilhouetteScore: raw.SilhouetteScore,
            ClusterCount: raw.ClusterCount,
            ComputationTimeMs: raw.ComputationTimeMs,
            RecordCount: raw.RecordCount,
            OutlierCount: raw.OutlierCount,
        };
    }

    /** Build a failed {@link RunClusterAnalysisResult} carrying an error message. */
    private errorResult(message: string): RunClusterAnalysisResult {
        return {
            Success: false,
            ErrorMessage: message,
            Metrics: {
                SilhouetteScore: 0,
                ClusterCount: 0,
                ComputationTimeMs: 0,
                RecordCount: 0,
                OutlierCount: 0,
            },
            Clusters: [],
            Points: [],
        };
    }
}
