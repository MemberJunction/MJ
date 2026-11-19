/** Input for `PredictiveStudio.RunModelMonitoring`. */
export interface PredictiveStudioRunModelMonitoringInput {
    /** Id of the Published `MJ: ML Models` row to monitor; its open monitoring job's spec is used. */
    modelId: string;
    /** First day (`YYYY-MM-DD`) of the period to monitor, of the job's grain; omitted: the last complete period. */
    periodStart?: string;
}
