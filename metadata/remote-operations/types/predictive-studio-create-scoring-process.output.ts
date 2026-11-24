/** Output of `PredictiveStudio.CreateScoringProcess` — the created on-demand scoring Record Process + write-back lineage. */
export interface PredictiveStudioCreateScoringProcessOutput {
    /**
     * Id of the created `MJ: Record Processes` row (`WorkType='ML Model'`,
     * `OnDemandEnabled=true`, no schedule). This is the row the generic
     * "Run Record Process" run-now Remote Op and the generic scheduler dialog target.
     */
    recordProcessId: string;
    /**
     * Whether the binding names a column — `true` when an `outputField` was supplied
     * (each run copies the newest score into it through the binding; the Record Process
     * carries no `OutputMapping`), `false` in generic mode (Feature Values only).
     */
    wroteColumn: boolean;
    /**
     * Id of the created (or updated) `MJ: ML Model Scoring Bindings` row (`Mode='OnDemand'`),
     * in both modes: a run of the process scores through it.
     */
    scoringBindingId?: string;
}
