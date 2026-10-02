/**
 * Integration test: index groups, TTL and category clearing against a real Redis.
 *
 * The unit suite mocks ioredis, so it cannot prove what the Lua script does to a set's expiry or
 * what SCAN matches. These checks run the real commands. Every key is written under a per-run
 * prefix and removed afterwards.
 *
 * Requires a real Redis connection — set REDIS_URL to run. Skipped automatically otherwise.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Redis from 'ioredis';
import { RedisLocalStorageProvider } from '../RedisLocalStorageProvider.js';
import { ClearSharedCacheCategories } from '../SharedCacheClear.js';

const REDIS_URL = process.env.REDIS_URL;
const describeRedis = describe.skipIf(!REDIS_URL);
const CAT = 'RunViewCache';

describeRedis('Integration: index groups and TTL', () => {
    const prefix = `it-groups-${Date.now().toString(36)}`;
    let provider: RedisLocalStorageProvider;
    let raw: Redis;
    const groupKey = (group: string) => `${prefix}:__group__:${CAT}:${group}`;

    beforeAll(() => {
        provider = new RedisLocalStorageProvider({ url: REDIS_URL, keyPrefix: prefix, enableLogging: false });
        raw = new Redis(REDIS_URL!);
    });

    afterAll(async () => {
        const leftovers = await raw.keys(`${prefix}:*`);
        if (leftovers.length > 0) {
            await raw.del(...leftovers);
        }
        await provider.Disconnect();
        await raw.quit();
    });

    it('gives a group set the TTL of its first member', async () => {
        await provider.SetItem('G1|a', { v: 1 }, CAT, { IndexGroup: 'G1', TTLSeconds: 100 });
        const ttl = await raw.ttl(groupKey('G1'));
        expect(ttl).toBeGreaterThan(95);
        expect(ttl).toBeLessThanOrEqual(100);
        expect(await raw.ttl(`${prefix}:${CAT}:G1|a`)).toBeGreaterThan(95);
    });

    it('extends the set for a longer-lived member and never shortens it', async () => {
        await provider.SetItem('G2|long', 1, CAT, { IndexGroup: 'G2', TTLSeconds: 500 });
        await provider.SetItem('G2|short', 1, CAT, { IndexGroup: 'G2', TTLSeconds: 10 });
        expect(await raw.ttl(groupKey('G2'))).toBeGreaterThan(490);

        await provider.SetItem('G3|short', 1, CAT, { IndexGroup: 'G3', TTLSeconds: 10 });
        await provider.SetItem('G3|long', 1, CAT, { IndexGroup: 'G3', TTLSeconds: 500 });
        expect(await raw.ttl(groupKey('G3'))).toBeGreaterThan(490);
    });

    it('keeps a set persistent once it holds a member without expiry', async () => {
        await provider.SetItem('G4|ttl', 1, CAT, { IndexGroup: 'G4', TTLSeconds: 50 });
        await provider.SetItem('G4|forever', 1, CAT, { IndexGroup: 'G4', TTLSeconds: 0 });
        expect(await raw.ttl(groupKey('G4'))).toBe(-1);

        await provider.SetItem('G4|ttl2', 1, CAT, { IndexGroup: 'G4', TTLSeconds: 50 });
        expect(await raw.ttl(groupKey('G4'))).toBe(-1);
    });

    it('re-arms the expiry when the only member is rewritten with a TTL', async () => {
        await provider.SetItem('G5|a', 1, CAT, { IndexGroup: 'G5', TTLSeconds: 0 });
        expect(await raw.ttl(groupKey('G5'))).toBe(-1);
        await provider.SetItem('G5|a', 1, CAT, { IndexGroup: 'G5', TTLSeconds: 50 });
        expect(await raw.ttl(groupKey('G5'))).toBeGreaterThan(45);
    });

    it('prunes expired members when the group is read', async () => {
        await provider.SetItem('G6|stays', 1, CAT, { IndexGroup: 'G6', TTLSeconds: 100 });
        await provider.SetItem('G6|expires', 1, CAT, { IndexGroup: 'G6', TTLSeconds: 1 });
        await new Promise(resolve => setTimeout(resolve, 1500));

        expect(await provider.GetIndexGroupKeys(CAT, 'G6')).toEqual(['G6|stays']);
        expect(await raw.smembers(groupKey('G6'))).toEqual(['G6|stays']);
    });

    it('lists and clears a category with SCAN, leaving other categories alone', async () => {
        await provider.SetItem('G7|a', 1, CAT, { IndexGroup: 'G7' });
        await provider.SetItem('other', 1, 'Metadata');
        await raw.sadd(`${prefix}:__categories__:${CAT}`, 'G7|a');   // set left by an older version

        expect(await provider.GetCategoryKeys(CAT)).toContain('G7|a');

        await provider.ClearCategory(CAT);

        expect(await raw.keys(`${prefix}:${CAT}:*`)).toEqual([]);
        expect(await raw.keys(`${prefix}:__group__:${CAT}:*`)).toEqual([]);
        expect(await raw.exists(`${prefix}:__categories__:${CAT}`)).toBe(0);
        expect(await provider.GetItem('other', 'Metadata')).toBe(1);
    });

    it('ClearSharedCacheCategories: a dry run counts without deleting; a clear deletes and notifies', async () => {
        await provider.SetItem('G8|a', 1, CAT, { IndexGroup: 'G8' });
        await provider.SetItem('meta', 1, 'ClearTest');
        const connection = { url: REDIS_URL, keyPrefix: prefix };

        const dry = await ClearSharedCacheCategories({ Connection: connection, Categories: [CAT, 'ClearTest'], DryRun: true });
        expect(dry).toEqual([{ Category: CAT, KeyCount: 1, Ok: true, Error: undefined }, { Category: 'ClearTest', KeyCount: 1, Ok: true, Error: undefined }]);
        expect(await raw.exists(`${prefix}:${CAT}:G8|a`)).toBe(1);

        const listener = new Redis(REDIS_URL!);
        const heard: string[] = [];
        await listener.subscribe(`${prefix}:__pubsub__`);
        listener.on('message', (_c: string, m: string) => heard.push(JSON.parse(m).Category + '/' + JSON.parse(m).Action));
        try {
            const done = await ClearSharedCacheCategories({ Connection: connection, Categories: [CAT, 'ClearTest'] });
            expect(done.map(d => d.KeyCount)).toEqual([1, 1]);
            expect(await raw.keys(`${prefix}:${CAT}:*`)).toEqual([]);
            expect(await raw.exists(`${prefix}:ClearTest:meta`)).toBe(0);
            await new Promise(resolve => setTimeout(resolve, 200));
            expect(heard).toEqual([`${CAT}/category_cleared`, 'ClearTest/category_cleared']);
        } finally {
            await listener.quit();
        }
    });

    it('ClearSharedCacheCategories throws when Redis cannot be reached', async () => {
        await expect(ClearSharedCacheCategories({ Connection: { url: 'redis://127.0.0.1:1', keyPrefix: prefix, maxRetries: 0 } }))
            .rejects.toThrow('did not answer PING');
    });

    /** Subscribes to the prefix's notices; returns what was heard as "Category/Action/Key". */
    async function listen(): Promise<{ heard: string[]; stop: () => Promise<void> }> {
        const listener = new Redis(REDIS_URL!);
        const heard: string[] = [];
        await listener.subscribe(`${prefix}:__pubsub__`);
        listener.on('message', (_c: string, m: string) => {
            const event = JSON.parse(m) as { Category: string; Action: string; CacheKey: string };
            heard.push(`${event.Category}/${event.Action}/${event.CacheKey}`);
        });
        return { heard, stop: async () => { await listener.quit(); } };
    }

    it('ClearSharedCacheCategories with no categories also removes the metadata snapshot, timestamps last', async () => {
        await provider.SetItem('SNAP|a', 1, CAT);
        await provider.SetItem('___MJCore_Metadata_AllMetadata', 'x', 'default');
        await provider.SetItem('___MJCore_Metadata_Timestamps', 'y', 'default');
        await provider.SetItem('unrelated-default', 1, 'default');
        const { heard, stop } = await listen();
        try {
            const done = await ClearSharedCacheCategories({ Connection: { url: REDIS_URL, keyPrefix: prefix } });
            expect(done.find(d => d.Category === 'default')).toEqual({ Category: 'default', KeyCount: 2, Ok: true });
            expect(await provider.GetItem('___MJCore_Metadata_Timestamps', 'default')).toBeNull();
            expect(await provider.GetItem('unrelated-default', 'default')).toBe(1);
            await new Promise(resolve => setTimeout(resolve, 200));
            const snapshot = heard.filter(h => h.startsWith('default/'));
            expect(snapshot[snapshot.length - 1]).toBe('default/removed/___MJCore_Metadata_Timestamps');
        } finally {
            await stop();
        }
    });

    it('ClearSharedCacheCategories removes the snapshot with explicit categories only when asked', async () => {
        await provider.SetItem('___MJCore_Metadata_Timestamps', 'y', 'default');
        const connection = { url: REDIS_URL, keyPrefix: prefix };
        const without = await ClearSharedCacheCategories({ Connection: connection, Categories: [CAT] });
        expect(without.map(r => r.Category)).toEqual([CAT]);
        expect(without.every(r => r.Ok)).toBe(true);
        expect(await provider.GetItem('___MJCore_Metadata_Timestamps', 'default')).toBe('y');

        const withSnapshot = await ClearSharedCacheCategories({ Connection: connection, Categories: [CAT], IncludeMetadataSnapshot: true });
        expect(withSnapshot).toEqual([{ Category: CAT, KeyCount: 0, Ok: true, Error: undefined }, { Category: 'default', KeyCount: 1, Ok: true }]);
        expect(await provider.GetItem('___MJCore_Metadata_Timestamps', 'default')).toBeNull();
    });

    it('renews a held lock so work outlasting the TTL is not overtaken', async () => {
        // The lock's own TTL is 10 s; this work runs past a renewal interval and must still hold it.
        const start = Date.now();
        await provider.WithKeyLock('renewed', 'LockTest', async () => {
            await new Promise(resolve => setTimeout(resolve, 3500));
        });
        expect(Date.now() - start).toBeGreaterThanOrEqual(3500);

        // A second holder can take it immediately afterwards: the release still worked.
        const other = new RedisLocalStorageProvider({ url: REDIS_URL, keyPrefix: prefix, enableLogging: false });
        try {
            await expect(other.WithKeyLock('renewed', 'LockTest', async () => 'ok')).resolves.toBe('ok');
        } finally {
            await other.Disconnect();
        }
    }, 20000);

    it('a lease can be renewed by its holder and by nobody else', async () => {
        const other = new RedisLocalStorageProvider({ url: REDIS_URL, keyPrefix: prefix, enableLogging: false });
        try {
            expect(await provider.TryAcquireLease('renew-probe', 2000)).toBe(true);
            expect(await provider.RenewLease('renew-probe', 5000)).toBe(true);
            // Another process never held it, so it cannot renew it.
            expect(await other.RenewLease('renew-probe', 5000)).toBe(false);
            // …and cannot claim it while the renewal keeps it alive.
            expect(await other.TryAcquireLease('renew-probe', 1000)).toBe(false);
        } finally {
            await provider.ReleaseLease('renew-probe');
            await other.Disconnect();
        }
    });

    it('WithKeyLock serializes read-modify-writes from two providers (no lost updates)', async () => {
        const other = new RedisLocalStorageProvider({ url: REDIS_URL, keyPrefix: prefix, enableLogging: false });
        try {
            await provider.SetItem('counter', 0, 'LockTest');
            const bump = async (p: RedisLocalStorageProvider) => {
                for (let i = 0; i < 25; i++) {
                    await p.WithKeyLock('counter', 'LockTest', async () => {
                        const n = (await p.GetItem<number>('counter', 'LockTest')) ?? 0;
                        await new Promise(resolve => setTimeout(resolve, 1));   // widen the race window
                        await p.SetItem('counter', n + 1, 'LockTest');
                    });
                }
            };
            await Promise.all([bump(provider), bump(other)]);
            expect(await provider.GetItem<number>('counter', 'LockTest')).toBe(50);
            expect(await raw.exists(`${prefix}:__lock__:LockTest:counter`)).toBe(0);
        } finally {
            await other.Disconnect();
        }
    });

    it('WithKeyLock releases the lock when the work throws, and never releases a lock it does not hold', async () => {
        await expect(provider.WithKeyLock('k1', 'LockTest', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(await raw.exists(`${prefix}:__lock__:LockTest:k1`)).toBe(0);

        // Someone else holds k2: our timed-out attempt must leave their lock in place.
        await raw.set(`${prefix}:__lock__:LockTest:k2`, 'someone-else', 'PX', 20000);
        const ran = vi.fn();
        await expect(provider.WithKeyLock('k2', 'LockTest', async () => ran())).rejects.toThrow('timed out');
        expect(ran).not.toHaveBeenCalled();
        expect(await raw.get(`${prefix}:__lock__:LockTest:k2`)).toBe('someone-else');
    }, 15000);

    it('TryAcquireLease grants a lease to one of several processes until it expires', async () => {
        const other = new RedisLocalStorageProvider({ url: REDIS_URL, keyPrefix: prefix, enableLogging: false });
        try {
            const claims = await Promise.all([provider, other, provider, other].map(p => p.TryAcquireLease('sweep:Test', 300)));
            expect(claims.filter(Boolean)).toHaveLength(1);
            const ttl = await raw.pttl(`${prefix}:__lease__:sweep:Test`);
            expect(ttl).toBeGreaterThan(0);
            expect(ttl).toBeLessThanOrEqual(300);
            await new Promise(resolve => setTimeout(resolve, 350));
            expect(await other.TryAcquireLease('sweep:Test', 300)).toBe(true);

            // Release ends only a lease the caller holds.
            expect(await provider.TryAcquireLease('warmup:Test', 60000)).toBe(true);
            await other.ReleaseLease('warmup:Test');
            expect(await raw.exists(`${prefix}:__lease__:warmup:Test`)).toBe(1);
            await provider.ReleaseLease('warmup:Test');
            expect(await raw.exists(`${prefix}:__lease__:warmup:Test`)).toBe(0);
            expect(await other.TryAcquireLease('warmup:Test', 60000)).toBe(true);
        } finally {
            await other.Disconnect();
        }
    });
});

