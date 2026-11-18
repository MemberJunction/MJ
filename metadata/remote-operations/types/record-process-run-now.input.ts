/** Runtime scope override for a Record Process run (instead of the stored Scope). */
export type RecordProcessScopeOverride =
    | { Kind: 'records'; RecordIDs: string[] }
    | { Kind: 'view'; ViewID: string }
    | { Kind: 'list'; ListID: string }
    | { Kind: 'filter'; Filter?: string };

/** Input for `RecordProcess.RunNow`. */
export interface RecordProcessRunNowInput {
    /** The `MJ: Record Processes` definition to run. */
    recordProcessID: string;
    /** When set, processes just this single record instead of the configured scope. */
    singleRecordID?: string;
    /**
     * Compute the per-record changes WITHOUT writing, for every work type: Infer, FieldRules and every write-back
     * persist nothing, while an Action or Agent still runs and only its write-back is previewed. An Infer dry run over
     * the stored scope previews the first 25 records. Powers the preview.
     */
    dryRun?: boolean;
    /** Runtime scope override (selected rows / a view / list / filter), used instead of the stored Scope. */
    scope?: RecordProcessScopeOverride;
    /** Overwrite values a person entered on the process's write-back targets, and retire their Human values (default false: they are kept). */
    overwriteHumanValues?: boolean;
}
