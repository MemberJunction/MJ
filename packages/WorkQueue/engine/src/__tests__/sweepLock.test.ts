import { describe, it, expect } from 'vitest';
import { TryAcquireSweepLock } from '../sql/sweepLock';
import { RecordingExecutor, TEST_USER } from './fakes';

describe('TryAcquireSweepLock', () => {
    it('holds the lock in a transaction on one executor and hands back a second one for the pass', async () => {
        const source = new RecordingExecutor().QueueRows([{ Acquired: true }]);
        const lock = await TryAcquireSweepLock(source, TEST_USER);
        expect(lock).not.toBeNull();
        await lock?.Executor.ExecuteSQL('SELECT 1');
        expect(source.Calls[0].Executor).toBe('independent#1');
        expect(source.Calls[0].InTransaction).toBe(true);
        expect(source.Calls[0].SQL).toBe('EXEC [__mj].[spWorkQueueAcquireSweepLock] @Resource=@p0');
        expect(source.Calls[0].Params).toEqual(['mj-wq-sweep']);
        expect(source.Calls[1].Executor).toBe('independent#2');
        expect(source.Calls[1].InTransaction).toBe(false);
        await lock?.Release();
        expect(source.Events).toEqual(['independent', 'begin', 'independent', 'release', 'commit', 'release']);
    });

    it('returns null and releases everything when another instance holds the lock', async () => {
        const source = new RecordingExecutor().QueueRows([{ Acquired: 0 }]);
        expect(await TryAcquireSweepLock(source, TEST_USER)).toBeNull();
        expect(source.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it('releases the lock executor and rethrows when the lock statement fails', async () => {
        const source = new RecordingExecutor().QueueError(new Error('connection reset'));
        await expect(TryAcquireSweepLock(source, TEST_USER)).rejects.toThrow('connection reset');
        expect(source.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it('releases only once', async () => {
        const source = new RecordingExecutor().QueueRows([{ Acquired: 1 }]);
        const lock = await TryAcquireSweepLock(source, TEST_USER);
        await lock?.Release();
        await lock?.Release();
        expect(source.Events.filter(e => e === 'release')).toHaveLength(2);
    });
});
