/** Output of `PredictiveStudio.CreateScoringProcess` — the created on-demand scoring Record Process + write-back lineage. */
export interface PredictiveStudioCreateScoringProcessOutput {
    /**
     * Id of the created `MJ: Record Processes` row (`WorkType='ML Model'`,
     * `OnDemandEnabled=true`, no schedule). This is the row the generic
     * "Run Record Process" run-now Remote Op and the generic scheduler dialog target.
     */
    recordProcessId: string;
    /**
     * Whether write-back was configured — `true` when an `outputField` was supplied
     * (the Record Process carries an `OutputMapping` and a scoring binding was
     * created), `false` in generic mode (predictions recorded in run history only).
     */
    wroteColumn: boolean;
    /**
     * Id of the created `MJ: ML Model Scoring Bindings` lineage row (`Mode='OnDemand'`)
     * in write-back mode. Omitted in generic mode (no `outputField`, no binding).
     */
    scoringBindingId?: string;
}
