/** Output of `RecordProcess.RunNow` — the run summary. */
export interface RecordProcessRunNowOutput {
    /** ID of the persisted `MJ: Process Runs` row. */
    processRunID?: string;
    /** Run-level status (`Completed` / `Failed` / `Cancelled` / …). */
    status: string;
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
}
