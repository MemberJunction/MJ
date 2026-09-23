import type { RecordClonePlanDetails } from './record-clone-plan.output';

/** Record mapping result from clone execution. */
export interface RecordCloneRecordMapping {
    EntityName: string;
    SourceKey: string;
    TargetKey: string;
    Depth?: number;
}

/** Record skipped during clone execution. */
export interface RecordCloneSkippedRecord {
    EntityName: string;
    SourceKey: string;
    Reason: string;
}

/** Warning or execution issue. */
export interface RecordCloneExecuteWarning {
    Code: string;
    Severity: 'Info' | 'Warning' | 'Error';
    NodeKey?: string;
    Field?: string;
    Message: string;
}

/** Output for `RecordClone.Execute`. */
export interface RecordCloneExecuteOutput {
    /** Whether the clone succeeded. */
    Success: boolean;
    /** Outcome code. */
    ResultCode: 'SUCCESS' | 'PLAN_CHANGED' | 'BLOCKED' | 'FORBIDDEN' | 'EXECUTION_ERROR';
    /** ID of the created MJ: Record Clone Logs header row, if written. */
    CloneLogID: string | null;
    /** Mappings for the root records. */
    Roots: RecordCloneRecordMapping[];
    /** Mappings for all successfully created records. */
    Created: RecordCloneRecordMapping[];
    /** Records that were skipped. */
    Skipped: RecordCloneSkippedRecord[];
    /** Aggregate counts. */
    Counts: {
        ByEntity: Record<string, { Create: number; Reference: number; Skip: number }>;
        Create: number;
        Total: number;
    };
    /** Warnings emitted during planning or execution. */
    Warnings: RecordCloneExecuteWarning[];
    /** Updated plan returned on PLAN_CHANGED or BLOCKED. */
    Plan?: RecordClonePlanDetails;
    /** Error message on failure. */
    ErrorMessage?: string;
}
