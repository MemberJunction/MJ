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
    /** Compute the per-record changes WITHOUT writing (FieldRules work type) — powers the preview. */
    dryRun?: boolean;
    /** Runtime scope override (selected rows / a view / list / filter), used instead of the stored Scope. */
    scope?: RecordProcessScopeOverride;
}
