/**
 * Drives the REAL SQLServerDataProvider with a mocked mssql driver.
 * Replaces transaction-publish-after-begin.test.ts: the production mutex and
 * doomed-TX path live here, not on a hand-rolled host.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { DoomedTransactionError } from '@memberjunction/generic-database-provider';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());
vi.mock('@memberjunction/queue', () => ({
    QueueManager: { AddTask: vi.fn().mockResolvedValue(undefined) },
}));

import sql from 'mssql';
import { QueueManager } from '@memberjunction/queue';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool, MockTransaction } from './helpers/mock-mssql';

type Surface = {
    _pool: MockConnectionPool;
    _transaction: MockTransaction | null;
    _datetimeOffsetTestComplete: boolean;
    _deferredTasks: unknown[];
    initializeQueueProcessor(): void;
};

class NestingProvider extends SQLServerDataProvider {
    public Attach(pool: MockConnectionPool): void {
        const s = this as unknown as Surface;
        s._pool = pool;
        s._datetimeOffsetTestComplete = true;
        s.initializeQueueProcessor();
    }
    public Handle(): MockTransaction | null {
        return (this as unknown as Surface)._transaction;
    }
    public DeferredCount(): number {
        return (this as unknown as Surface)._deferredTasks.length;
    }
    public EnqueueAI(): void {
        this.EnqueueAfterSaveAIAction(
            { entityAIActionId: 'a', entityRecord: {} as never, actionId: 'b', modelId: 'c' },
            { ID: 'u1' } as UserInfo,
        );
    }
}

describe('SQLServerDataProvider nested transactions (real class, mocked mssql)', () => {
    let provider: NestingProvider;
    let pool: MockConnectionPool;

    beforeEach(() => {
        mssqlState.Reset();
        vi.mocked(QueueManager.AddTask).mockClear();
        pool = new MockConnectionPool();
        provider = new NestingProvider();
        provider.Attach(pool);
    });

    afterEach(async () => {
        await provider.Dispose().catch(() => undefined);
        mssqlState.Reset();
    });

    it('never publishes an un-begun handle (poll each microtask)', async () => {
        const seenUnbegun: boolean[] = [];
        let stop = false;
        const pump = (async () => {
            while (!stop) {
                const h = provider.Handle();
                if (h && !h.begun) seenUnbegun.push(true);
                await Promise.resolve();
            }
        })();
        await provider.BeginTransaction();
        stop = true;
        await pump;
        expect(seenUnbegun).toEqual([]);
        expect(provider.Handle()?.begun).toBe(true);
        expect(provider.isTransactionActive).toBe(true);
        expect(provider.TransactionDepth).toBe(1);
        await provider.RollbackTransaction();
    });

    it('outer rollback of an aborted handle unpublishes so the next begin is a new physical TX (B2)', async () => {
        await provider.BeginTransaction();
        const first = provider.Handle();
        first!.abortServerSide();
        await expect(provider.RollbackTransaction()).rejects.toMatchObject({ code: 'EABORT' });
        expect(provider.TransactionDepth).toBe(0);
        expect(provider.Handle()).toBeNull();
        expect(provider.isTransactionActive).toBe(false);
        await provider.BeginTransaction();
        expect(provider.Handle()).not.toBe(first);
        expect(provider.Handle()?.begun).toBe(true);
        expect(mssqlState.EventKinds().filter((k) => k === 'begin')).toHaveLength(2);
        await provider.RollbackTransaction();
    });

    it('outer commit of an aborted handle unpublishes (B2 commit path)', async () => {
        await provider.BeginTransaction();
        provider.Handle()!.abortServerSide();
        await expect(provider.CommitTransaction()).rejects.toBeTruthy();
        expect(provider.TransactionDepth).toBe(0);
        expect(provider.Handle()).toBeNull();
        expect(provider.isTransactionActive).toBe(false);
    });

    it('server abort then nested begin is a doomed TX, not a second physical begin (B1)', async () => {
        await provider.BeginTransaction();
        provider.Handle()!.abortServerSide();
        await expect(provider.BeginTransaction()).rejects.toBeInstanceOf(DoomedTransactionError);
        expect(mssqlState.EventKinds().filter((k) => k === 'begin')).toHaveLength(1);
        expect(provider.TransactionDepth).toBe(1);
        expect(provider.Handle()).toBeNull();
        await expect(provider.CommitTransaction()).rejects.toBeInstanceOf(DoomedTransactionError);
        expect(provider.TransactionDepth).toBe(0);
    });

    it('ExecuteSQL with no source rejects while doomed; pool-scoped source still runs (H6)', async () => {
        await provider.BeginTransaction();
        provider.Handle()!.abortServerSide();
        await expect(provider.BeginTransaction()).rejects.toBeInstanceOf(DoomedTransactionError);
        await expect(provider.ExecuteSQL('UPDATE Orders SET Status=Confirmed')).rejects.toBeInstanceOf(DoomedTransactionError);
        expect(mssqlState.Queries.filter((q) => !q.viaTransaction && /UPDATE Orders/.test(q.sql))).toEqual([]);
        await provider.ExecuteSQL('SELECT 1 AS ok', undefined, { connectionSource: pool });
        expect(mssqlState.Queries.some((q) => !q.viaTransaction && /SELECT 1/.test(q.sql))).toBe(true);
        await provider.RollbackTransaction();
    });

    it('ExecuteSQL rejects while doomed after nested-rollback doom (H6)', async () => {
        await provider.BeginTransaction();
        await provider.BeginTransaction();
        provider.Handle()!.abortServerSide();
        await provider.RollbackTransaction();
        await expect(provider.ExecuteSQL('EXEC spCreateOrderLine line2')).rejects.toBeInstanceOf(DoomedTransactionError);
        expect(mssqlState.Queries.filter((q) => !q.viaTransaction && /spCreateOrderLine/.test(q.sql))).toEqual([]);
        await provider.RollbackTransaction();
    });

    it('queued nested units after a server abort all reject and never commit (H5)', async () => {
        await provider.BeginTransaction();
        provider.Handle()!.abortServerSide();
        const unit = async () => {
            await provider.BeginTransaction();
            await provider.CommitTransaction();
        };
        const results = await Promise.allSettled([unit(), unit()]);
        expect(results.every((r) => r.status === 'rejected')).toBe(true);
        expect(mssqlState.EventKinds().filter((k) => k === 'begin')).toHaveLength(1);
        expect(mssqlState.EventKinds().filter((k) => k === 'commit')).toEqual([]);
        await expect(provider.CommitTransaction()).rejects.toBeInstanceOf(DoomedTransactionError);
        expect(provider.TransactionDepth).toBe(0);
        await provider.BeginTransaction();
        expect(provider.Handle()?.begun).toBe(true);
        await provider.RollbackTransaction();
    });

    it('does not ROLLBACK a savepoint name that was never saved on the published handle (B3)', async () => {
        await provider.BeginTransaction();
        await provider.BeginTransaction();
        provider.Handle()!.abortServerSide();
        await expect(provider.BeginTransaction()).rejects.toBeInstanceOf(DoomedTransactionError);
        const rollbacks = mssqlState.Queries.filter((q) => /ROLLBACK TRANSACTION SavePoint_1/i.test(q.sql));
        expect(rollbacks).toEqual([]);
        expect(provider.TransactionDepth).toBe(2);
        expect(provider.Handle()).toBeNull();
        await provider.RollbackTransaction();
        await provider.RollbackTransaction();
        expect(provider.TransactionDepth).toBe(0);
    });

    it('serializes two concurrent nested begins to one physical begin (H2)', async () => {
        await provider.BeginTransaction();
        const results = await Promise.allSettled([provider.BeginTransaction(), provider.BeginTransaction()]);
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
        expect(mssqlState.EventKinds().filter((k) => k === 'begin')).toHaveLength(1);
        expect(provider.SavepointStack).toEqual(['SavePoint_1', 'SavePoint_2']);
        expect(provider.Handle()?.savepoints.has('SavePoint_1')).toBe(true);
        expect(provider.Handle()?.savepoints.has('SavePoint_2')).toBe(true);
        await provider.RollbackTransaction();
        await provider.RollbackTransaction();
    });

    it('deferred AI tasks run after commit at depth 0 with no handle (H3)', async () => {
        await provider.BeginTransaction();
        provider.EnqueueAI();
        expect(provider.DeferredCount()).toBe(1);
        expect(QueueManager.AddTask).not.toHaveBeenCalled();
        const seen: Array<{ depth: number; active: boolean }> = [];
        vi.mocked(QueueManager.AddTask).mockImplementation(async () => {
            seen.push({ depth: provider.TransactionDepth, active: provider.isTransactionActive });
            return undefined;
        });
        await provider.CommitTransaction();
        expect(seen).toEqual([{ depth: 0, active: false }]);
        expect(provider.Handle()).toBeNull();
        expect(QueueManager.AddTask).toHaveBeenCalledTimes(1);
    });

    it('outer rollback clears deferred tasks and never AddTask (B13)', async () => {
        await provider.BeginTransaction();
        provider.EnqueueAI();
        await provider.RollbackTransaction();
        expect(provider.DeferredCount()).toBe(0);
        expect(QueueManager.AddTask).not.toHaveBeenCalled();
    });

    it('transactionState$ is false at depth 0; nested begin emits nothing (B11)', async () => {
        const emissions: boolean[] = [];
        const sub = provider.transactionState$.subscribe((v) => emissions.push(v));
        await provider.BeginTransaction();
        await provider.BeginTransaction();
        await provider.CommitTransaction();
        await provider.CommitTransaction();
        sub.unsubscribe();
        expect(emissions[0]).toBe(false);
        expect(emissions).toContain(true);
        expect(emissions.at(-1)).toBe(false);
        expect(provider.TransactionDepth).toBe(0);
    });

    it('BeginEntityTransaction outer/inner: IsNested, depth, SAVE TRANSACTION, IsInTransaction stays false (B21)', async () => {
        const outer = await provider.BeginEntityTransaction();
        expect(outer.IsNested).toBe(false);
        expect(provider.TransactionDepth).toBe(1);
        expect(provider.IsInTransaction).toBe(false);
        const inner = await provider.BeginEntityTransaction();
        expect(inner.IsNested).toBe(true);
        expect(provider.TransactionDepth).toBe(2);
        expect(provider.IsInTransaction).toBe(false);
        expect(mssqlState.Queries.some((q) => /SAVE TRANSACTION SavePoint_1/i.test(q.sql))).toBe(true);
        await inner.Commit();
        await outer.Rollback();
    });

    it('begin failure with a stray begun handle rolls it back (P8)', async () => {
        const stray = new MockTransaction(pool);
        await stray.begin();
        (provider as unknown as { _transaction: MockTransaction })._transaction = stray;
        await expect(provider.BeginTransaction()).rejects.toThrow(/existing handle/);
        expect(stray.begun).toBe(false);
        expect(mssqlState.EventKinds()).toContain('rollback');
        expect(provider.Handle()).toBeNull();
        expect(provider.TransactionDepth).toBe(0);
    });

    it('instanceof sql.Transaction still holds for the published handle', async () => {
        await provider.BeginTransaction();
        expect(provider.Handle() instanceof sql.Transaction).toBe(true);
        await provider.RollbackTransaction();
    });
});
