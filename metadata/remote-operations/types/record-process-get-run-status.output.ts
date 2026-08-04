/** Output of `RecordProcess.GetRunStatus` — a snapshot of the run's progress. */
export interface RecordProcessGetRunStatusOutput {
    status: string;
    processed: number;
    total: number | null;
    success: number;
    error: number;
    skipped: number;
}
