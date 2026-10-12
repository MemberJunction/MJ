import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    CreateRecordingShardStore,
    RECORDING_SHARD_RETENTION_MS,
    type PendingRecordingShard,
} from '../session/RecordingShardStore';

function shard(sessionID: string, index: number, savedAt: number): PendingRecordingShard {
    return { SessionID: sessionID, Index: index, Bytes: new Uint8Array([index, 7, 9]), SavedAt: savedAt };
}

afterEach(() => vi.restoreAllMocks());

describe('RecordingShardStore', () => {
    it('puts, lists oldest first, and deletes', async () => {
        const store = CreateRecordingShardStore(new IDBFactory(), () => 1000);
        await store.Put(shard('s1', 1, 300));
        await store.Put(shard('s1', 0, 100));
        await store.Put(shard('s2', 0, 200));
        const listed = await store.ListOldest(10);
        expect(listed.map((s) => [s.SessionID, s.Index])).toEqual([['s1', 0], ['s2', 0], ['s1', 1]]);
        expect(listed[0].Bytes).toBeInstanceOf(Uint8Array);
        expect(Array.from(listed[0].Bytes)).toEqual([0, 7, 9]);
        expect((await store.ListOldest(2)).length).toBe(2);
        await store.Delete('s1', 0);
        expect((await store.ListOldest(10)).map((s) => s.SessionID + s.Index)).toEqual(['s20', 's11']);
    });

    it('stores a copy, not the caller buffer', async () => {
        const store = CreateRecordingShardStore(new IDBFactory(), () => 1000);
        const bytes = new Uint8Array([1, 2, 3]);
        await store.Put({ SessionID: 's', Index: 0, Bytes: bytes, SavedAt: 1 });
        bytes[0] = 99;
        expect(Array.from((await store.ListOldest(1))[0].Bytes)).toEqual([1, 2, 3]);
    });

    it('purges entries older than the retention window before listing', async () => {
        const now = 10 * RECORDING_SHARD_RETENTION_MS;
        const factory = new IDBFactory();
        const store = CreateRecordingShardStore(factory, () => now);
        await store.Put(shard('old', 0, now - RECORDING_SHARD_RETENTION_MS - 1));
        await store.Put(shard('new', 0, now - 1000));
        expect((await store.ListOldest(10)).map((s) => s.SessionID)).toEqual(['new']);
        // an earlier clock proves the purge deleted the row rather than merely hiding it
        const earlier = CreateRecordingShardStore(factory, () => 0);
        expect(await earlier.ListOldest(10).then((l) => l.map((s) => s.SessionID))).toEqual(['new']);
    });

    it('logs and resolves when the database cannot be opened, warning once after degrading', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const factory = new IDBFactory();
        vi.spyOn(factory, 'open').mockImplementation(() => {
            throw new Error('blocked');
        });
        const store = CreateRecordingShardStore(factory, () => 1);
        await expect(store.Put(shard('s', 3, 1))).resolves.toBeUndefined();
        await expect(store.Delete('s', 3)).resolves.toBeUndefined();
        await expect(store.ListOldest(5)).resolves.toEqual([]);
        await expect(store.ListOldest(5)).resolves.toEqual([]);
        // open is tried initially plus at most one retry
        expect((factory.open as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
        const messages = warn.mock.calls.map((c) => String(c[0]));
        expect(messages.every((m) => m.includes('[RealtimeSession]'))).toBe(true);
        expect(messages.some((m) => m.includes('s') && m.includes('3'))).toBe(true);
        expect(messages.filter((m) => m.includes('disabled')).length).toBe(1);
    });

    it('null or undefined factory yields a no-op store', async () => {
        for (const f of [null, undefined]) {
            const store = CreateRecordingShardStore(f);
            await store.Put(shard('s', 0, 1));
            await store.Delete('s', 0);
            expect(await store.ListOldest(5)).toEqual([]);
        }
    });
});
