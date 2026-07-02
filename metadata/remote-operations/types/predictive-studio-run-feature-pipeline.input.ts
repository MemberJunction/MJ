/**
 * Runtime scope override for a Feature Pipeline run. A Feature Pipeline is a
 * categorized `MJ: Record Processes` row, so this mirrors the Record Process
 * runtime scope shapes (records / view / list / filter). When omitted, the
 * pipeline's stored scope is used.
 */
export type PredictiveStudioFeaturePipelineScope =
    | { Kind: 'records'; RecordIDs: string[] }
    | { Kind: 'view'; ViewID: string }
    | { Kind: 'list'; ListID: string }
    | { Kind: 'filter'; Filter?: string };

/** Input for `PredictiveStudio.RunFeaturePipeline`. */
export interface PredictiveStudioRunFeaturePipelineInput {
    /** Id of the `MJ: Record Processes` row (a Feature Pipeline) to run. */
    featurePipelineID: string;
    /** When set, processes just this single record instead of the configured/scope rows. */
    singleRecordID?: string;
    /** Compute the per-record feature values WITHOUT writing them back (preview). */
    dryRun?: boolean;
    /** Runtime scope override (selected rows / a view / list / filter), used instead of the stored scope. */
    scope?: PredictiveStudioFeaturePipelineScope;
}
