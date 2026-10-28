/** Output of `PredictiveStudio.RunFeaturePipeline` — the underlying Record Process run summary. */
export interface PredictiveStudioRunFeaturePipelineOutput {
    /** Id of the persisted `MJ: Process Runs` row produced by the underlying Record Process. */
    processRunID?: string;
    /** Run-level status, as `MJ: Process Runs.Status` holds it. A refused run (e.g. a Feature Pipeline version not activated) is `Failed`, with `errorMessage` saying why. */
    status: 'Pending' | 'Running' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled';
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
    /** A Feature Pipeline dry run only: why a real run would be refused (e.g. its version is not activated). Absent when the real run would go ahead. */
    wouldRefuse?: string;
}
