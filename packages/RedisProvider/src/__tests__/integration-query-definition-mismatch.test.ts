/**
 * Integration test: a query definition mismatch on a RunQuery slot in real Redis.
 *
 * Two `LocalCacheManager` instances stand in for servers whose `QueryEngine`s hold different
 * definitions of one query (one has seen an edit, the other has not yet). A read under the older
 * definition must miss without deleting the shared slot or publishing anything, and must not
 * overwrite a slot written under the newer definition. The slot is indexed by query ID, so any
 * server can find and delete it.
 *
 * Requires a real Redis connection — set REDIS_URL env var to run.
 * Skipped automatically if REDIS_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { LocalCacheManager } from '@memberjunction/core';
import type { QueryDefinitionSignature } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { RedisLocalStorageProvider } from '../RedisLocalStorageProvider.js';

const REDIS_URL = process.env.REDIS_URL;
const describeRedis = describe.skipIf(!REDIS_URL);

const KEY_PREFIX = 'test-query-definition-mismatch';
const QUERY_ID = 'AAAAAAAA-0000-0000-0000-0000000000AA';
const FP = `Revenue|${QUERY_ID}|_|{"__maxRows":-1,"__startRow":0}`;
const SLOT_KEY = `${KEY_PREFIX}:RunQueryCache:${FP}`;
const OLD: QueryDefinitionSignature = { QueryID: QUERY_ID, Hash: 'old-hash', Stamp: '2026-01-01T00:00:00.000Z' };
const NEW: QueryDefinitionSignature = { QueryID: QUERY_ID, Hash: 'new-hash', Stamp: '2026-02-01T00:00:00.000Z' };

function resetLocalCacheManager(): void {
    const store = GetGlobalObjectStore();
    if (store) {
        delete store['___SINGLETON__LocalCacheManager'];
    }
}

/** A fresh, independent manager on its own provider (the class is a singleton, so its global slot is cleared first). */
async function newManager(provider: RedisLocalStorageProvider): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const manager = LocalCacheManager.Instance;
    await manager.Initialize(provider);
    return manager;
}

function newProvider(): RedisLocalStorageProvider {
    return new RedisLocalStorageProvider({ url: REDIS_URL, keyPrefix: KEY_PREFIX, enablePubSub: true, enableLogging: false });
}

function write(manager: LocalCacheManager, rows: unknown[], definition: QueryDefinitionSignature): Promise<void> {
    return manager.SetRunQueryResult(FP, 'Revenue', rows, '', rows.length, QUERY_ID, undefined, undefined, definition);
}

describeRedis('Integration: query definition mismatch on a shared Redis RunQuery slot', () => {
    let olderProvider: RedisLocalStorageProvider;
    let newerProvider: RedisLocalStorageProvider;
    let raw: Redis;
    let subscriber: Redis;
    const removedEvents: string[] = [];

    beforeAll(async () => {
        olderProvider = newProvider();
        newerProvider = newProvider();
        raw = new Redis(REDIS_URL!);
        subscriber = new Redis(REDIS_URL!);
        await subscriber.subscribe(`${KEY_PREFIX}:__pubsub__`);
        subscriber.on('message', (_channel: string, message: string) => {
            const event = JSON.parse(message) as { Action: string; CacheKey: string };
            if (event.Action === 'removed' && event.CacheKey === FP) {
                removedEvents.push(message);
            }
        });
    });

    afterAll(async () => {
        await raw.del(SLOT_KEY);
        resetLocalCacheManager();
        await olderProvider.Disconnect();
        await newerProvider.Disconnect();
        await subscriber.quit();
        await raw.quit();
    });

    it('leaves a slot written under a newer definition in place, unchanged, and publishes no removal', async () => {
        await raw.del(SLOT_KEY);
        const newer = await newManager(newerProvider);
        await write(newer, [{ Marker: 'new' }], NEW);
        const written = await raw.get(SLOT_KEY);
        expect(written).not.toBeNull();

        const older = await newManager(olderProvider);
        for (let i = 0; i < 5; i++) {
            expect(await older.GetRunQueryResult(FP, OLD)).toBeNull();
            await write(older, [{ Marker: 'old' }], OLD);
        }
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(removedEvents).toHaveLength(0);
        expect(await raw.get(SLOT_KEY)).toBe(written);
        expect((await older.GetRunQueryResult(FP, NEW))?.results).toEqual([{ Marker: 'new' }]);
    });

    it('lets another server find the slot by query ID and delete it', async () => {
        await raw.del(SLOT_KEY);
        const writer = await newManager(newerProvider);
        await write(writer, [{ Marker: 'new' }], NEW);

        const other = await newManager(olderProvider);
        expect(await other.InvalidateRunQueryResultsForQuery(QUERY_ID)).toBe(1);
        expect(await raw.get(SLOT_KEY)).toBeNull();
    });
});
