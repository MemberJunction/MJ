/** Input for `PredictiveStudio.MigratePreGateModels`. */
export interface PredictiveStudioMigratePreGateModelsInput {
    /**
     * True (the default) reports what the pre-change model migration would visit and writes nothing. False runs one
     * pass of its steps, which only a run of a Predictive Studio Registry Check job may do (`scheduledJobRunId`).
     */
    dryRun?: boolean;
    /**
     * The `MJ: Scheduled Job Runs` row of the Predictive Studio Registry Check job run this pass belongs to; required
     * when `dryRun` is false (every lifecycle change it makes is initiated by that run).
     */
    scheduledJobRunId?: string;
    /** Models visited per step in this pass (default 50). */
    batchSize?: number;
    /** Pipelines retrained in this pass (default 3). */
    retrainPerRun?: number;
}
