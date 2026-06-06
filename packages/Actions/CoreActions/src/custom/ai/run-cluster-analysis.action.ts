import { ActionResultSimple, RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import {
    ClusteringEngine,
    ClusterConfig,
    ClusterResult,
    EntityDocumentVectorSource,
    ClusterAlgorithm,
    ClusterDistanceMetric,
} from '@memberjunction/clustering-engine';

/**
 * Action: "Run Cluster Analysis"
 *
 * Thin wrapper over {@link ClusteringEngine.RunPipeline}. Fetches embedding
 * vectors for an entity / entity document, clusters them (KMeans or DBSCAN),
 * projects them to 2D/3D, optionally names clusters with an LLM, and — when a
 * `PersistAs` name is supplied — persists the result to `MJ: Cluster Analysis`.
 *
 * All business logic lives in the engine; this action only maps params and
 * returns a summary.
 *
 * Parameters (Input):
 *  - EntityID: ID of the entity to cluster (alternative to EntityDocumentID).
 *  - EntityDocumentID: specific Entity Document supplying vectors.
 *  - Algorithm: 'kmeans' (default) or 'dbscan'.
 *  - K: number of clusters for KMeans (default 4).
 *  - Epsilon: DBSCAN neighbourhood radius (default 0.3).
 *  - MinPoints: DBSCAN minimum points (default 3).
 *  - DistanceMetric: 'cosine' (default) | 'euclidean' | 'dotproduct'.
 *  - MaxRecords: max records to fetch (default 500).
 *  - Filter: optional SQL filter applied to the source records.
 *  - NameClusters: 'true' to run LLM cluster naming (default false).
 *  - PersistAs: when set, the analysis is saved with this name.
 *
 * Output params: AnalysisID (when persisted), ClusterCount, RecordCount, SilhouetteScore.
 */
@RegisterClass(BaseAction, 'Run Cluster Analysis')
export class RunClusterAnalysisAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const config = this.buildConfig(params);
            if (!config.EntityID && !config.EntityDocumentID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "One of 'EntityID' or 'EntityDocumentID' is required.",
                };
            }

            const engine = new ClusteringEngine();
            const source = new EntityDocumentVectorSource(params.ContextUser);
            const result = await engine.RunPipeline(config, source, params.ContextUser);

            if (result.Metrics.RecordCount === 0) {
                return {
                    Success: false,
                    ResultCode: 'NO_VECTORS',
                    Message: 'No vectors were found for the supplied entity / document / filter.',
                };
            }

            const analysisID = await this.maybePersist(params, engine, result, config);
            this.addOutputs(params, result, analysisID);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: this.buildSummary(result, analysisID),
            };
        } catch (error) {
            LogError(`RunClusterAnalysisAction: ${error}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /** Build a {@link ClusterConfig} from the action params. */
    private buildConfig(params: RunActionParams): ClusterConfig {
        const algorithm = this.getString(params, 'algorithm', 'kmeans').toLowerCase();
        const metric = this.getString(params, 'distancemetric', 'cosine').toLowerCase();
        return {
            EntityID: this.getString(params, 'entityid', ''),
            EntityDocumentID: this.getString(params, 'entitydocumentid', ''),
            Algorithm: (algorithm === 'dbscan' ? 'dbscan' : 'kmeans') as ClusterAlgorithm,
            K: this.getNumber(params, 'k', 4),
            Epsilon: this.getNumber(params, 'epsilon', 0.3),
            MinPoints: this.getNumber(params, 'minpoints', 3),
            DistanceMetric: this.normalizeMetric(metric),
            MaxRecords: this.getNumber(params, 'maxrecords', 500),
            Filter: this.getString(params, 'filter', ''),
            NameClusters: this.getBoolean(params, 'nameclusters', false),
            Dimensions: 2,
        };
    }

    /** Persist the analysis when a PersistAs name is supplied; return its ID or null. */
    private async maybePersist(
        params: RunActionParams,
        engine: ClusteringEngine,
        result: ClusterResult,
        config: ClusterConfig,
    ): Promise<string | null> {
        const persistAs = this.getString(params, 'persistas', '');
        if (!persistAs) {
            return null;
        }
        const user = params.ContextUser;
        if (!user) {
            LogError('RunClusterAnalysisAction: PersistAs supplied but no ContextUser available — skipping persistence.');
            return null;
        }
        return engine.SaveAnalysis(result, config, { Name: persistAs, UserID: user.ID }, user);
    }

    /** Add output params summarizing the run. */
    private addOutputs(params: RunActionParams, result: ClusterResult, analysisID: string | null): void {
        if (analysisID) {
            this.addOutput(params, 'AnalysisID', analysisID);
        }
        this.addOutput(params, 'ClusterCount', result.Metrics.ClusterCount);
        this.addOutput(params, 'RecordCount', result.Metrics.RecordCount);
        this.addOutput(params, 'SilhouetteScore', result.Metrics.SilhouetteScore);
    }

    /** Build a human-readable summary message. */
    private buildSummary(result: ClusterResult, analysisID: string | null): string {
        const m = result.Metrics;
        const parts = [
            `Clustered ${m.RecordCount} records into ${m.ClusterCount} clusters`,
            `silhouette=${m.SilhouetteScore.toFixed(3)}`,
            `outliers=${m.OutlierCount}`,
            `time=${m.ComputationTimeMs}ms`,
        ];
        if (analysisID) {
            parts.push(`saved as ${analysisID}`);
        }
        return parts.join(', ');
    }

    /** Coerce the engine metric onto the supported union, defaulting to cosine. */
    private normalizeMetric(metric: string): ClusterDistanceMetric {
        if (metric === 'euclidean' || metric === 'dotproduct') {
            return metric;
        }
        return 'cosine';
    }

    // ---- param helpers -------------------------------------------------

    private findParam(params: RunActionParams, name: string): ActionParam | undefined {
        return params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
    }

    private getString(params: RunActionParams, name: string, defaultValue: string): string {
        const param = this.findParam(params, name);
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : defaultValue;
    }

    private getNumber(params: RunActionParams, name: string, defaultValue: number): number {
        const param = this.findParam(params, name);
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const parsed = Number(param.Value);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }

    private getBoolean(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const param = this.findParam(params, name);
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim().toLowerCase();
        if (value === 'true' || value === '1' || value === 'yes') return true;
        if (value === 'false' || value === '0' || value === 'no') return false;
        return defaultValue;
    }

    private addOutput(params: RunActionParams, name: string, value: unknown): void {
        const existing = this.findParam(params, name);
        if (existing) {
            existing.Value = value;
            existing.Type = 'Output';
        } else {
            params.Params.push({ Name: name, Type: 'Output', Value: value });
        }
    }
}

/** Tree-shaking prevention — call from index to keep the @RegisterClass alive. */
export function LoadRunClusterAnalysisAction(): void {
    // no-op
}
