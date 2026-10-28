/** Output of `RecordProcess.RunNow` — the run summary. */
export interface RecordProcessRunNowOutput {
    /** ID of the persisted `MJ: Process Runs` row. */
    processRunID?: string;
    /** Run-level status, as `MJ: Process Runs.Status` holds it. A refused run (e.g. a Feature Pipeline version not activated) is `Failed`, with `errorMessage` saying why. */
    status: 'Pending' | 'Running' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled';
    /** Records the run touched. */
    processed: number;
    /** Records that succeeded (in dry-run, records with a computed preview). */
    success: number;
    /** Records that errored. */
    error: number;
    /** Records skipped (no rule matched / nothing changed). */
    skipped: number;
    /** Run-level error detail when `status` is not `Completed`. */
    errorMessage?: string;
    /** A Feature Pipeline dry run only: why a real run would be refused (e.g. its version is not activated). Absent when the real run would go ahead. */
    wouldRefuse?: string;
}
