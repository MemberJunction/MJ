import type { EntityTransactionScope } from '@memberjunction/core';
import { IsTransientDatabaseError } from '../sql/sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';

export interface TransactionOutcome<T> {
    Commit: boolean;
    Value: T;
}

/**
 * Runs work inside one provider-arbitrated transaction. With a caller executor the work joins the caller's
 * transaction (a savepoint when one is already open). Without one, it runs on an independent instance with its
 * own transaction stack, so concurrent units of work on the shared server provider never interleave (03 §11).
 */
export async function RunInWorkQueueTransaction<T>(
    source: WorkQueueExecutorSource,
    work: (tx: WorkQueueTransactionalExecutor) => Promise<TransactionOutcome<T>>,
    callerExecutor: WorkQueueTransactionalExecutor | null = null,
): Promise<T> {
    if (callerExecutor) {
        return RunScoped(callerExecutor, work);
    }
    const independent = await source.CreateIndependentInstance();
    try {
        return await RunScoped(independent, work);
    } finally {
        await independent.ReleaseIndependentInstance();
    }
}

async function RunScoped<T>(
    tx: WorkQueueTransactionalExecutor,
    work: (tx: WorkQueueTransactionalExecutor) => Promise<TransactionOutcome<T>>,
): Promise<T> {
    const scope = await tx.BeginEntityTransaction();
    try {
        const outcome = await work(tx);
        if (outcome.Commit) {
            await scope.Commit();
        } else {
            await scope.Rollback();
        }
        return outcome.Value;
    } catch (error) {
        await RollbackQuietly(scope);
        throw error;
    }
}

/** A failed rollback must never replace the error that caused it: callers classify that error (deadlock → retry). */
async function RollbackQuietly(scope: EntityTransactionScope): Promise<void> {
    try {
        await scope.Rollback();
    } catch {
        // The connection is already gone or the transaction already ended; the original error is what matters.
    }
}

const defaultWait = (attempt: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 80)));

/** Retries an operation that failed with a deadlock, serialization error or lock timeout. Other errors propagate at once. */
export async function RetryTransient<T>(
    operation: () => Promise<T>,
    attempts = 3,
    wait: (attempt: number) => Promise<void> = defaultWait,
): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= attempts || !IsTransientDatabaseError(error)) {
                throw error;
            }
            await wait(attempt);
        }
    }
}
