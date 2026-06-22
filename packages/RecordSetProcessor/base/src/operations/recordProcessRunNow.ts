/**
 * @fileoverview The `RecordProcess.RunNow` Remote Operation — client-safe contract + types, shared by
 * both sides. This base class carries the operation key + typed I/O so a browser caller can
 * `new RecordProcessRunNowOperation().Execute(input)` (routed over the generic `ExecuteRemoteOperation`
 * transport) WITHOUT importing the server engine. The server impl lives in
 * `@memberjunction/record-set-processor` and extends this with the actual `InternalExecute`.
 * @module @memberjunction/record-set-processor-base
 */
import { BaseRemotableOperation } from '@memberjunction/core';

/**
 * A runtime scope override for a run — the rows to act on, supplied by a UI invocation, used INSTEAD of
 * the Record Process's stored Scope. The stored Scope remains the default for scheduled / standalone runs.
 */
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

/**
 * Client-safe, typed entry point for running a Record Process on demand. Instantiate and call `.Execute()`
 * from anywhere (browser or server) — the call routes through the active provider (marshalled over GraphQL
 * on the client, in-process on the server). The server-side body is supplied by the registered subclass in
 * `@memberjunction/record-set-processor`; this base has no `InternalExecute` of its own (so it is never
 * the registered server implementation).
 */
export class RecordProcessRunNowOperation extends BaseRemotableOperation<RecordProcessRunNowInput, RecordProcessRunNowOutput> {
    public readonly OperationKey = 'RecordProcess.RunNow';
    public readonly RequiredScope = 'recordprocess:execute';
    public readonly ExecutionMode = 'LongRunning' as const;
}
