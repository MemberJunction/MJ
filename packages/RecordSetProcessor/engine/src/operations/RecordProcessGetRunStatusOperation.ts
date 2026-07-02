/**
 * @fileoverview `RecordProcess.GetRunStatus` — a typed, sync Remote Operation that returns the
 * status + counts of a Process Run. The proof-of-concept consumer of the Remote Operations
 * substrate: the same typed object runs in-process on the server and (once dispatched) is callable
 * from the browser via the generic `ExecuteRemoteOperation` transport.
 * @module @memberjunction/record-set-processor
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    MJProcessRunEntity,
    RecordProcessGetRunStatusOperation,
    type RecordProcessGetRunStatusInput,
    type RecordProcessGetRunStatusOutput,
} from '@memberjunction/core-entities';

// RecordProcessGetRunStatusInput / Output + the typed base are now CodeGen-emitted into
// @memberjunction/core-entities (generated/remote_operations.ts) and imported above.

/** Returns the live status and counts of a Process Run; the server body for the generated `RecordProcess.GetRunStatus` base. */
@RegisterClass(BaseRemotableOperation, 'RecordProcess.GetRunStatus')
export class RecordProcessGetRunStatusServerOperation extends RecordProcessGetRunStatusOperation {

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
