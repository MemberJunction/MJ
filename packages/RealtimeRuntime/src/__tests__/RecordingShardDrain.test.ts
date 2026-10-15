import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { IMetadataProvider } from '@memberjunction/core';
import { ReleaseRecordingShardsAtLogout, ReleaseUserRecordingShards } from '../session/RecordingShardDrain';
import { CreateRecordingShardStore } from '../session/RecordingShardStore';
import { FakeRecordingTransport, FakeShardStore } from './recording-test-helpers';

describe('ReleaseUserRecordingShards (logout)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    async function seeded(): Promise<FakeShardStore> {
        const store = new FakeShardStore();
        await store.Put({ SessionID: 'a-call', UserID: 'user-a', Index: 0, Bytes: new Uint8Array([1]), SavedAt: 1 });
        await store.Put({ SessionID: 'a-call', UserID: 'user-a', Index: 1, Bytes: new Uint8Array([2]), SavedAt: 2 });
        await store.Put({ SessionID: 'b-call', UserID: 'user-b', Index: 0, Bytes: new Uint8Array([3]), SavedAt: 3 });
        return store;
    }

    it("sends the user's shards it can, then deletes the rest of that user's, and keeps other users'", async () => {
        const store = await seeded();
        const transport = new FakeRecordingTransport([], ['stored', 'unavailable']);

        const result = await ReleaseUserRecordingShards(store, transport, 'user-a', 3000);

        expect(result).toEqual({ Delivered: 1, TimedOut: false });
        expect(transport.Uploads.map((u) => `${u.SessionID}/${u.Index}`)).toEqual(['a-call/0', 'a-call/1']);
        expect(store.Keys).toEqual(['b-call/0']);
    });

    it("stops waiting at the time limit and still deletes the user's shards (logout must not hang)", async () => {
        const store = await seeded();
        const transport = new FakeRecordingTransport();
        transport.HoldNextUpload = new Promise(() => undefined); // the server never answers

        const released = ReleaseUserRecordingShards(store, transport, 'user-a', 3000);
        await vi.advanceTimersByTimeAsync(3000);

        await expect(released).resolves.toEqual({ Delivered: 0, TimedOut: true });
        expect(store.Keys).toEqual(['b-call/0']);
    });

    it("only deletes when there is no transport (a provider that is not configured)", async () => {
        const store = await seeded();
        await expect(ReleaseUserRecordingShards(store, null, 'user-a', 3000)).resolves.toEqual({ Delivered: 0, TimedOut: false });
        expect(store.Keys).toEqual(['b-call/0']);
    });

    it("drains across multiple 50-shard passes when a user has more than one page of pending shards at logout", async () => {
        const store = new FakeShardStore();
        for (let i = 0; i < 120; i++) {
            await store.Put({ SessionID: 'a-call', UserID: 'user-a', Index: i, Bytes: new Uint8Array([i & 0xff]), SavedAt: i + 1 });
        }
        await store.Put({ SessionID: 'b-call', UserID: 'user-b', Index: 0, Bytes: new Uint8Array([9]), SavedAt: 200 });
        const transport = new FakeRecordingTransport();

        const result = await ReleaseUserRecordingShards(store, transport, 'user-a', 3000);

        expect(result).toEqual({ Delivered: 120, TimedOut: false });
        expect(transport.Uploads).toHaveLength(120);
        expect(store.Keys).toEqual(['b-call/0']);
    });
});

describe('ReleaseRecordingShardsAtLogout', () => {
    afterEach(() => vi.unstubAllGlobals());

    it("clears the signed-in user's shards from the browser's IndexedDB and keeps other users'", async () => {
        const factory = new IDBFactory();
        vi.stubGlobal('indexedDB', factory);
        const store = CreateRecordingShardStore(factory);
        await store.Put({ SessionID: 'a-call', UserID: 'user-a', Index: 0, Bytes: new Uint8Array([1]), SavedAt: Date.now() });
        await store.Put({ SessionID: 'b-call', UserID: 'user-b', Index: 0, Bytes: new Uint8Array([2]), SavedAt: Date.now() });
        // A provider with no GraphQL URL has no transport: logout can only delete.
        const provider = { CurrentUser: { ID: 'user-a' } } as unknown as IMetadataProvider;

        await ReleaseRecordingShardsAtLogout(provider, 3000);

        expect(await store.ListOldest(10, 'user-a')).toEqual([]);
        expect((await store.ListOldest(10, 'user-b')).map((s) => s.SessionID)).toEqual(['b-call']);
    });
});
