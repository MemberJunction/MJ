import { describe, it, expect } from 'vitest';
import { RetryTransient, RunInWorkQueueTransaction } from '../transaction/RunInWorkQueueTransaction';
import { RecordingExecutor } from './fakes';

const noWait = async (): Promise<void> => undefined;

describe('RunInWorkQueueTransaction', () => {
    it('runs on an independent instance, commits and releases', async () => {
        const executor = new RecordingExecutor();
        const value = await RunInWorkQueueTransaction(executor, async () => ({ Commit: true, Value: 42 }));
        expect(value).toBe(42);
        expect(executor.Events).toEqual(['independent', 'begin', 'commit', 'release']);
    });

    it('rolls back when the work asks not to commit', async () => {
        const executor = new RecordingExecutor();
        await RunInWorkQueueTransaction(executor, async () => ({ Commit: false, Value: 'x' }));
        expect(executor.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it('rolls back, releases and rethrows when the work throws', async () => {
        const executor = new RecordingExecutor();
        await expect(RunInWorkQueueTransaction(executor, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(executor.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it('rethrows the original error even when the rollback itself fails', async () => {
        const executor = new RecordingExecutor();
        const scope = { IsNested: false, Commit: async () => undefined, Rollback: async () => { throw new Error('connection closed'); } };
        const independent = await executor.CreateIndependentInstance();
        independent.BeginEntityTransaction = async () => scope;
        executor.CreateIndependentInstance = async () => independent;
        await expect(RunInWorkQueueTransaction(executor, async () => { throw new Error('Transaction was deadlocked'); }))
            .rejects.toThrow('Transaction was deadlocked');
    });

    it("joins the caller's transaction without creating or releasing an instance", async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor();
        await RunInWorkQueueTransaction(source, async tx => {
            expect(tx).toBe(caller);
            return { Commit: true, Value: null };
        }, caller);
        expect(source.Events).toEqual([]);
        expect(caller.Events).toEqual(['begin', 'commit']);
    });
});

describe('RetryTransient', () => {
    it('retries transient failures and returns the first success', async () => {
        let calls = 0;
        const result = await RetryTransient(async () => {
            calls++;
            if (calls < 3) {
                throw new Error('Transaction was deadlocked');
            }
            return 'ok';
        }, 3, noWait);
        expect(result).toBe('ok');
        expect(calls).toBe(3);
    });

    it('does not retry non-transient failures', async () => {
        let calls = 0;
        await expect(RetryTransient(async () => { calls++; throw new Error('syntax error'); }, 3, noWait)).rejects.toThrow('syntax error');
        expect(calls).toBe(1);
    });

    it('gives up after the attempt limit', async () => {
        let calls = 0;
        await expect(RetryTransient(async () => { calls++; throw new Error('deadlock'); }, 2, noWait)).rejects.toThrow('deadlock');
        expect(calls).toBe(2);
    });
});
