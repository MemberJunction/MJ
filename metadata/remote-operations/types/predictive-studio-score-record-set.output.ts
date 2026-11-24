/** One record's prediction, returned when nothing was written (no binding, or a dry run). */
export interface PredictiveStudioScoredPrediction {
    /** The scored record's bare key value. */
    recordId: string;
    /** A classification's probability of its class 1 (a binary model) or of its predicted class; a regression's predicted value. */
    score: number;
    /** The predicted class (classification only). */
    class?: string;
    /** The probability of the adverse outcome (classification only). */
    adverseProbability?: number;
    /** True when the record was in the model's training snapshot. */
    inTraining: boolean;
}

/**
 * Output of `PredictiveStudio.ScoreRecordSet`: the completed scoring run. A refused or failed run is returned as
 * `Success = false` with the refusal's `ResultCode`, and its message names the refusal and the scoring run.
 */
export interface PredictiveStudioScoreRecordSetOutput {
    /** The run completed. */
    status: 'completed';
    /** The `MJ: ML Scoring Runs` row of the call. */
    scoringRunId: string;
    /** The model that scored. */
    modelId: string;
    /** The model's version. */
    modelVersion: number;
    /** The SHA-256 of the artifact that scored. */
    artifactSha256: string;
    /** Records in the scope. */
    total: number;
    /** Feature Values written (0 without a binding and on a dry run). */
    written: number;
    /** The run wrote nothing by request. */
    dryRun: boolean;
    /** The predictions, when nothing was written (no binding, or a dry run). */
    predictions?: PredictiveStudioScoredPrediction[];
}
