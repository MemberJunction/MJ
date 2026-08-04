/** A single ephemeral prediction surfaced when write-back is NOT requested. */
export interface PredictiveStudioEphemeralPrediction {
    /** The scored record's id (when known). */
    recordId?: string;
    /** Numeric model output (probability or value). */
    score: number;
    /** Predicted class (classification only). */
    class?: string;
}

/** Output of `PredictiveStudio.ScoreRecordSet` — the run summary. */
export interface PredictiveStudioScoreRecordSetOutput {
    /** Number of records successfully scored. */
    scored: number;
    /** Number of records that failed to score. */
    failed: number;
    /** Number of records skipped (no selector matched / nothing to score). */
    skipped: number;
    /** True when the runner wrote scores back to the target (predictions are then NOT returned ephemerally). */
    wroteBack: boolean;
    /** Ephemeral predictions, present only when `wroteBack` is false. */
    predictions?: PredictiveStudioEphemeralPrediction[];
}
