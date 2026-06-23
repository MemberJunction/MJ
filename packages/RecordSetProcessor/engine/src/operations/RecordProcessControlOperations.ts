/**
 * @fileoverview Record Process control Remote Operations — RunNow (on-demand execution) plus the
 * Pause / Resume / Cancel control surface (the run's `CancellationRequested` handshake). These are
 * the facade's only on-demand/control path (no bespoke resolvers).
 * @module @memberjunction/record-set-processor
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJProcessRunEntity } from '@memberjunction/core-entities';
import {
    RecordProcessRunNowOperation,
    RecordProcessPauseRunOperation,
    RecordProcessCancelRunOperation,
    RecordProcessResumeRunOperation,
    type RecordProcessRunNowInput,
    type RecordProcessRunNowOutput,
    type ProcessRunControlInput,
    type ProcessRunControlOutput,
} from '@memberjunction/core-entities';
import { RecordProcessExecutor } from '../RecordProcessExecutor';

/**
 * Server implementation of `RecordProcess.RunNow` — runs a Record Process on demand, honoring an optional
 * dry-run (compute-only preview) and runtime scope override (the rows a UI selected). Extends the
 * client-safe {@link RecordProcessRunNowOperation} base in `-base` (which carries the key + typed I/O) and
 * supplies the server body; registered last so it wins server-side dispatch. Marked `LongRunning` (the
 * handle is a `ProcessRunID`).
 */
@RegisterClass(BaseRemotableOperation, 'RecordProcess.RunNow')
export class RecordProcessRunNowServerOperation extends RecordProcessRunNowOperation {
    protected async InternalExecute(input: RecordProcessRunNowInput, provider: IMetadataProvider, user: UserInfo): Promise<RecordProcessRunNowOutput> {
        if (!input?.recordProcessID) {
            throw new Error('recordProcessID is required');
        }
        const result = await new RecordProcessExecutor().RunByID(input.recordProcessID, {
            contextUser: user,
            provider,
            triggeredBy: 'OnDemand',
            singleRecordID: input.singleRecordID,
            dryRun: input.dryRun,
            scope: input.scope,
        });
        return {
            processRunID: result.ProcessRunID,
            status: result.Status,
            processed: result.Processed,
            success: result.Success,
            error: result.Error,
            skipped: result.Skipped,
            errorMessage: result.ErrorMessage,
        };
    }
}

// ProcessRunControlInput / ProcessRunControlOutput are now CodeGen-emitted into @memberjunction/core-entities
// (generated/remote_operations.ts) from the MJ: Remote Operations rows, and imported above.

/** Sets `CancellationRequested` on a run to the given value, returning the run's status. */
async function setCancellation(processRunID: string, value: boolean, provider: IMetadataProvider, user: UserInfo): Promise<ProcessRunControlOutput> {
    if (!processRunID) {
        throw new Error('processRunID is required');
    }
    const run = await provider.GetEntityObject<MJProcessRunEntity>('MJ: Process Runs', user);
    const loaded = await run.Load(processRunID);
    if (!loaded) {
        throw new Error(`Process Run '${processRunID}' not found`);
    }
    run.CancellationRequested = value;
    const saved = await run.Save();
    if (!saved) {
        throw new Error(`Failed updating Process Run '${processRunID}': ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return { status: run.Status };
}

// Each server operation extends its CodeGen-emitted base (which carries OperationKey / ExecutionMode /
// RequiredScope / RequiresSystemUser from metadata) and supplies only the InternalExecute body + @RegisterClass.

/** Requests a graceful pause of a running process (honored at the next checkpoint). */
@RegisterClass(BaseRemotableOperation, 'RecordProcess.PauseRun')
export class RecordProcessPauseRunServerOperation extends RecordProcessPauseRunOperation {
    protected async InternalExecute(input: ProcessRunControlInput, provider: IMetadataProvider, user: UserInfo): Promise<ProcessRunControlOutput> {
        return setCancellation(input.processRunID, true, provider, user);
    }
}

/** Requests cancellation of a running process (honored at the next checkpoint). */
@RegisterClass(BaseRemotableOperation, 'RecordProcess.CancelRun')
export class RecordProcessCancelRunServerOperation extends RecordProcessCancelRunOperation {
    protected async InternalExecute(input: ProcessRunControlInput, provider: IMetadataProvider, user: UserInfo): Promise<ProcessRunControlOutput> {
        return setCancellation(input.processRunID, true, provider, user);
    }
}

/** Clears a paused run's cancellation flag so it can be resumed by a subsequent run. */
@RegisterClass(BaseRemotableOperation, 'RecordProcess.ResumeRun')
export class RecordProcessResumeRunServerOperation extends RecordProcessResumeRunOperation {
    protected async InternalExecute(input: ProcessRunControlInput, provider: IMetadataProvider, user: UserInfo): Promise<ProcessRunControlOutput> {
        return setCancellation(input.processRunID, false, provider, user);
    }
}

/** Tree-shaking anchor — call from a server bootstrap to retain these operation registrations. */
export function LoadRecordProcessControlOperations(): void {
    // intentionally empty
}
