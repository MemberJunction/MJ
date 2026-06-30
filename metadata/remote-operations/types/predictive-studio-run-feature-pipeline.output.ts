/** Output of `PredictiveStudio.RunFeaturePipeline` — the underlying Record Process run summary. */
export interface PredictiveStudioRunFeaturePipelineOutput {
    /** Id of the persisted `MJ: Process Runs` row produced by the underlying Record Process. */
    processRunID?: string;
    /** Run-level status (`Completed` / `Failed` / `Cancelled` / …). */
    status: string;
    /** Records the run touched. */
    processed: number;
    /** Records whose features were written back (0 in dry-run). */
    written: number;
    /** Records skipped (no rule matched / nothing changed). */
    skipped: number;
    /** Records that errored. */
    error: number;
    /** Run-level error detail when `status` is not `Completed`. */
    errorMessage?: string;
}
