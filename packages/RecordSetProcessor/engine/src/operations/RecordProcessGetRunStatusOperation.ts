/**
 * @fileoverview `RecordProcess.GetRunStatus` — a typed, sync Remote Operation that returns the
 * status + counts of a Process Run. The proof-of-concept consumer of the Remote Operations
 * substrate: the same typed object runs in-process on the server and (once dispatched) is callable
 * from the browser via the generic `ExecuteRemoteOperation` transport.
 * @module @memberjunction/record-set-processor
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJProcessRunEntity } from '@memberjunction/core-entities';

/** Input for {@link RecordProcessGetRunStatusOperation}. */
export interface RecordProcessGetRunStatusInput {
    /** The `MJ: Process Runs` ID to read. */
    processRunID: string;
}

/** Output of {@link RecordProcessGetRunStatusOperation}. */
export interface RecordProcessGetRunStatusOutput {
    status: string;
    processed: number;
    total: number | null;
    success: number;
    error: number;
    skipped: number;
}

/** Returns the live status and counts of a Process Run. */
@RegisterClass(BaseRemotableOperation, 'RecordProcess.GetRunStatus')
export class RecordProcessGetRunStatusOperation extends BaseRemotableOperation<RecordProcessGetRunStatusInput, RecordProcessGetRunStatusOutput> {
    public readonly OperationKey = 'RecordProcess.GetRunStatus';
    public readonly RequiredScope = 'recordprocess:execute';

    protected async InternalExecute(input: RecordProcessGetRunStatusInput, provider: IMetadataProvider, user: UserInfo): Promise<RecordProcessGetRunStatusOutput> {
        if (!input?.processRunID) {
            throw new Error('processRunID is required');
        }
        const run = await provider.GetEntityObject<MJProcessRunEntity>('MJ: Process Runs', user);
        const loaded = await run.Load(input.processRunID);
        if (!loaded) {
            throw new Error(`Process Run '${input.processRunID}' not found`);
        }
        return {
            status: run.Status,
            processed: run.ProcessedItems,
            total: run.TotalItemCount,
            success: run.SuccessCount,
            error: run.ErrorCount,
            skipped: run.SkippedCount,
        };
    }
}

/**
 * Tree-shaking anchor — call from a server bootstrap to guarantee the `@RegisterClass` registration
 * is retained so the operation is resolvable by key.
 */
export function LoadRecordProcessGetRunStatusOperation(): void {
    // intentionally empty
}
