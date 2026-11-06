/**
 * Integration test: a schema-hash mismatch on a slot in real Redis.
 *
 * Two `LocalCacheManager` instances stand in for servers that loaded metadata on either side of a
 * migration, each on its own `RedisLocalStorageProvider`. A mismatched read must leave the shared
 * slot in place and publish nothing: a delete would publish `removed` to every server, whose
 * engines reload and rewrite the slot under their own hash.
 *
 * Requires a real Redis connection — set REDIS_URL env var to run.
 * Skipped automatically if REDIS_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import { LocalCacheManager, Metadata } from '@memberjunction/core';
import type { RunViewParams } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { RedisLocalStorageProvider } from '../RedisLocalStorageProvider.js';

const REDIS_URL = process.env.REDIS_URL;
const describeRedis = describe.skipIf(!REDIS_URL);

const KEY_PREFIX = 'test-schema-mismatch';
const ENTITY = 'SchemaMismatchTestEntity';
const FP = `${ENTITY}|_|_|-1|0|_|_`;
const SLOT_KEY = `${KEY_PREFIX}:RunViewCache:${FP}`;
const PARAMS = { EntityName: ENTITY } as RunViewParams;
const ROWS = [{ ID: '1', Name: 'Alice' }];

const OLD_FIELDS = [
    { Name: 'ID', __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z') },
    { Name: 'Name', __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z') },
];
const NEW_FIELDS = [...OLD_FIELDS, { Name: 'NewColumn', __mj_UpdatedAt: new Date('2026-02-01T00:00:00Z') }];

function useFields(fields: typeof OLD_FIELDS): void {
    vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue(
        { AllowCaching: true, __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'), Fields: fields } as unknown as ReturnType<Metadata['EntityByName']>
    );
}

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

describeRedis('Integration: schema mismatch on a shared Redis slot', () => {
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

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        await raw.del(SLOT_KEY);
        resetLocalCacheManager();
        await olderProvider.Disconnect();
        await newerProvider.Disconnect();
        await subscriber.quit();
        await raw.quit();
    });

    it('leaves a slot written under newer metadata in place and publishes no removal', async () => {
        await raw.del(SLOT_KEY);
        const newer = await newManager(newerProvider);
        useFields(NEW_FIELDS);
        await newer.SetRunViewResult(FP, PARAMS, ROWS, '');
        const written = await raw.get(SLOT_KEY);
        expect(written).not.toBeNull();

        const older = await newManager(olderProvider);
        useFields(OLD_FIELDS);
        for (let i = 0; i < 5; i++) {
            expect(await older.GetRunViewResult(FP)).toBeNull();
            await older.SetRunViewResult(FP, PARAMS, ROWS, '');
        }
        // Give any publish time to arrive before asserting none did.
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(removedEvents).toHaveLength(0);
        expect(await raw.get(SLOT_KEY)).toBe(written);
    });
});
