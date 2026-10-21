import type { EntityTransactionScope, UserInfo } from '@memberjunction/core';
import { SWEEP_LOCK_RESOURCE } from '../constants';
import { CreateWorkQueueSqlBuilder } from './CreateWorkQueueSqlBuilder';
import type { SweepLockRow } from './rows';
import { ExecuteRows, ToBoolean } from './sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueIndependentExecutor, WorkQueueSqlExecutor } from './WorkQueueSqlExecutor';

/** The sweep lock, held until Release(). Run the pass on Executor — never on the shared source (03 §11, F8). */
export interface SweepLock {
    Executor: WorkQueueSqlExecutor;
    Release(): Promise<void>;
}

/**
 * 03 §7 "one sweeper at a time" (F9). Returns null when another instance holds the lock. The lock is owned by a
 * transaction held open on a private independent executor — pooled connections make a session-level lock unsafe —
 * and the returned Executor is a second independent executor, so the pass's chunked statements commit on their own.
 * A process that dies drops its connection, which ends the transaction and frees the lock.
 */
export async function TryAcquireSweepLock(source: WorkQueueExecutorSource, contextUser: UserInfo): Promise<SweepLock | null> {
    const holder = await source.CreateIndependentInstance();
    let scope: EntityTransactionScope | null = null;
    try {
        scope = await holder.BeginEntityTransaction();
        const sql = CreateWorkQueueSqlBuilder(holder).Operator;
        const rows = await ExecuteRows<SweepLockRow>(holder, sql.AcquireSweepLock(SWEEP_LOCK_RESOURCE), contextUser);
        if (!ToBoolean(rows[0]?.Acquired)) {
            await EndLock(holder, scope, false);
            return null;
        }
        const worker = await source.CreateIndependentInstance();
        return BuildSweepLock(holder, scope, worker);
    } catch (error) {
        await EndLock(holder, scope, false);
        throw error;
    }
}

function BuildSweepLock(holder: WorkQueueIndependentExecutor, scope: EntityTransactionScope, worker: WorkQueueIndependentExecutor): SweepLock {
    let released = false;
    return {
        Executor: worker,
        Release: async () => {
            if (released) {
                return;
            }
            released = true;
            await worker.ReleaseIndependentInstance().catch(() => undefined);
            await EndLock(holder, scope, true);
        },
    };
}

/** Ends the lock transaction and releases its executor. Never throws: the caller's own error must survive. */
async function EndLock(holder: WorkQueueIndependentExecutor, scope: EntityTransactionScope | null, commit: boolean): Promise<void> {
    try {
        await (commit ? scope?.Commit() : scope?.Rollback());
    } catch {
        // The connection is gone or the transaction already ended; either way the lock is free.
    }
    await holder.ReleaseIndependentInstance().catch(() => undefined);
}
