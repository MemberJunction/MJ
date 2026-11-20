/** One monitored period of `PredictiveStudio.RunModelMonitoring`: its `MJ: ML Monitoring Results` row as written. */
export interface PredictiveStudioMonitoredPeriod {
    /** First day of the period (`YYYY-MM-DD`). */
    period: string;
    /** Id of the period's `MJ: ML Monitoring Results` row (a re-run updates it). */
    monitoringResultId: string;
    /** `window-open` (outcomes not yet known), `evaluated`, `insufficient-rows` (fewer scored rows than the job's minimum: recorded, not judged) or `failed`. */
    state: 'window-open' | 'evaluated' | 'insufficient-rows' | 'failed';
    /** Predictions joined to a realised outcome. */
    joinedRows: number;
    /** The primary score's value and its 95% bounds; absent unless evaluated. */
    primaryValue?: number;
    primaryLower?: number;
    primaryUpper?: number;
    /** Inputs whose drift alarm fired at the period's look. */
    driftAlarms: number;
    /** Kinds of the retrain triggers that fired. */
    triggersFired: string[];
    /** What a fired trigger's challenger came to (`none`, `waiting`, `published`, `withheld`, `stopped`, `failed`). */
    challengerOutcome?: string;
    /** The challenger's `MJ: ML Training Runs` row, when one was started. */
    challengerRunId?: string;
    /** The rollback check in words. */
    rollback?: string;
    /** Why the period failed. */
    errorMessage?: string;
}

/**
 * Output of `PredictiveStudio.RunModelMonitoring`: the monitored periods; `skipped` names why nothing ran (the model is
 * no longer Published).
 */
export interface PredictiveStudioRunModelMonitoringOutput {
    modelId: string;
    skipped?: string;
    periods: PredictiveStudioMonitoredPeriod[];
}
