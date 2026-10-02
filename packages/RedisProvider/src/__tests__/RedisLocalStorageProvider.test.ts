import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MJCore logging
vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

// Mock MJGlobal - provide a stable ProcessUUID for tests
// NOTE: The UUID must be inlined in the vi.mock factory because vi.mock is hoisted
vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ProcessUUID: 'test-server-00000000-0000-4000-a000-000000000001',
        },
    },
}));

const MOCK_PROCESS_UUID = 'test-server-00000000-0000-4000-a000-000000000001';

/** Translates a Redis MATCH glob (with backslash escapes) into an anchored RegExp. */
function globToRegExp(glob: string): RegExp {
    let out = '';
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i];
        if (ch === '\\' && i + 1 < glob.length) {
            out += glob[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        } else if (ch === '*') {
            out += '.*';
        } else if (ch === '?') {
            out += '.';
        } else {
            out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${out}$`);
}

/**
 * Helper: create a mock Redis instance with an in-memory store.
 * Returned object quacks like an ioredis `Redis` instance.
 */
function createMockRedisInstance() {
    const store = new Map<string, string>();
    const sets = new Map<string, Set<string>>();
    const ttls = new Map<string, number>();
    /** TTL argument passed with the most recent index-group add, per group set. */
    const groupTTLs = new Map<string, number>();

    const instance = {
        get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        // ioredis MGET returns string|null per requested key, in order.
        mget: vi.fn((...keys: string[]) =>
            Promise.resolve(keys.map(k => (store.has(k) ? store.get(k)! : null)))
        ),
        set: vi.fn((key: string, value: string) => {
            store.set(key, value);
            return Promise.resolve('OK');
        }),
        setex: vi.fn((key: string, ttl: number, value: string) => {
            store.set(key, value);
            ttls.set(key, ttl);
            return Promise.resolve('OK');
        }),
        del: vi.fn((...keys: string[]) => {
            let removed = 0;
            for (const key of keys) {
                if (store.delete(key) || sets.delete(key)) removed++;
            }
            return Promise.resolve(removed);
        }),
        // Single-page SCAN over both value keys and set keys (the real server pages; one page is enough here).
        scan: vi.fn((_cursor: string, _matchToken: string, pattern: string) => {
            const re = globToRegExp(pattern);
            const keys = [...store.keys(), ...sets.keys()].filter(k => re.test(k));
            return Promise.resolve(['0', keys]);
        }),
        exists: vi.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
        // Client-level EVAL: the index-group prune runs as one Lua script (it must be atomic, so a
        // peer's SADD cannot land mid-prune and be dropped unseen). The mock reproduces its
        // semantics: live members returned, dead ones removed, an emptied set deleted.
        eval: vi.fn((script: string, _numKeys: number, setKey: string, memberPrefix: string) => {
            if (!script.includes('SMEMBERS')) {
                return Promise.resolve(0); // not the prune script (lock scripts are asserted elsewhere)
            }
            const members = Array.from(sets.get(setKey) ?? []);
            if (members.length === 0) {
                return Promise.resolve([]);
            }
            const alive = members.filter(m => store.has(`${memberPrefix}${m}`));
            const dead = members.filter(m => !store.has(`${memberPrefix}${m}`));
            if (dead.length > 0) {
                if (alive.length === 0) {
                    sets.delete(setKey);
                } else {
                    for (const m of dead) sets.get(setKey)?.delete(m);
                }
            }
            return Promise.resolve(alive);
        }),
        ttl: vi.fn((key: string) => {
            if (!store.has(key)) return Promise.resolve(-2);
            return Promise.resolve(ttls.get(key) ?? -1);
        }),
        ping: vi.fn().mockResolvedValue('PONG'),
        quit: vi.fn().mockResolvedValue('OK'),
        disconnect: vi.fn(),
        sadd: vi.fn((setKey: string, member: string) => {
            if (!sets.has(setKey)) sets.set(setKey, new Set());
            sets.get(setKey)!.add(member);
            return Promise.resolve(1);
        }),
        srem: vi.fn((setKey: string, ...members: string[]) => {
            for (const member of members) sets.get(setKey)?.delete(member);
            return Promise.resolve(members.length);
        }),
        smembers: vi.fn((setKey: string) => {
            const s = sets.get(setKey);
            return Promise.resolve(s ? Array.from(s) : []);
        }),
        pipeline: vi.fn(() => {
            const ops: Array<() => unknown> = [];
            const pipe = {
                set: vi.fn((key: string, value: string) => {
                    ops.push(() => { store.set(key, value); });
                    return pipe;
                }),
                setex: vi.fn((key: string, ttl: number, value: string) => {
                    ops.push(() => {
                        store.set(key, value);
                        ttls.set(key, ttl);
                    });
                    return pipe;
                }),
                del: vi.fn((key: string) => {
                    ops.push(() => { store.delete(key); });
                    return pipe;
                }),
                sadd: vi.fn((setKey: string, member: string) => {
                    ops.push(() => {
                        if (!sets.has(setKey)) sets.set(setKey, new Set());
                        sets.get(setKey)!.add(member);
                    });
                    return pipe;
                }),
                srem: vi.fn((setKey: string, member: string) => {
                    ops.push(() => { sets.get(setKey)?.delete(member); });
                    return pipe;
                }),
                exists: vi.fn((key: string) => {
                    ops.push(() => (store.has(key) ? 1 : 0));
                    return pipe;
                }),
                // Records the index-group add the provider's Lua script performs (membership +
                // the TTL argument). The script's own expiry logic is exercised against a real
                // Redis in integration-two-servers.test.ts.
                eval: vi.fn((script: string, _numKeys: number, setKey: string, member: string, ttl: number) => {
                    ops.push(() => {
                        if (!sets.has(setKey)) sets.set(setKey, new Set());
                        sets.get(setKey)!.add(member);
                        groupTTLs.set(setKey, ttl);
                        return 1;
                    });
                    return pipe;
                }),
                exec: vi.fn(() => {
                    const results = ops.map(op => [null, op() ?? 'OK'] as [null, unknown]);
                    ops.length = 0;
                    return Promise.resolve(results);
                }),
            };
            return pipe;
        }),
        publish: vi.fn().mockResolvedValue(1),
        subscribe: vi.fn().mockResolvedValue('OK'),
        unsubscribe: vi.fn().mockResolvedValue('OK'),
        on: vi.fn(function(this: Record<string, unknown>, event: string, handler: (...args: unknown[]) => void) {
            if (!this._eventHandlers) {
                this._eventHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
            }
            const handlers = this._eventHandlers as Map<string, Array<(...args: unknown[]) => void>>;
            if (!handlers.has(event)) {
                handlers.set(event, []);
            }
            handlers.get(event)!.push(handler);
            return this;
        }),
        removeAllListeners: vi.fn().mockReturnThis(),
        _store: store,
        _sets: sets,
        _ttls: ttls,
        _groupTTLs: groupTTLs,
        _eventHandlers: new Map<string, Array<(...args: unknown[]) => void>>(),
        /** Helper to simulate receiving a pub/sub message */
        _simulateMessage(channel: string, message: string) {
            const handlers = this._eventHandlers as Map<string, Array<(...args: unknown[]) => void>>;
            const messageHandlers = handlers?.get('message') || [];
            for (const h of messageHandlers) {
                h(channel, message);
            }
        },
    };

    return instance;
}

// Mock ioredis — the default export must be a constructor function
vi.mock('ioredis', () => {
    // ioredis is imported as `import Redis from 'ioredis'` then called as `new Redis(...)`.
    // vi.fn() creates a function, but for `new` to work correctly we need
    // a proper constructor-like function.
    function MockRedis() {
        const instance = createMockRedisInstance();
        return instance;
    }

    return { default: MockRedis };
});

import { RedisLocalStorageProvider, KeyLockLostError } from '../RedisLocalStorageProvider.js';
import { LogError } from '@memberjunction/core';

describe('RedisLocalStorageProvider', () => {
    let provider: RedisLocalStorageProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new RedisLocalStorageProvider({
            enableLogging: false,
        });
    });

    afterEach(async () => {
        if (provider) {
            await provider.Disconnect();
        }
    });

    describe('constructor', () => {
        it('should create provider with default settings', () => {
            const p = new RedisLocalStorageProvider({ enableLogging: false });
            expect(p).toBeDefined();
            expect(p.Client).toBeDefined();
        });

        it('should accept a URL config', () => {
            const p = new RedisLocalStorageProvider({
                url: 'redis://localhost:6379',
                enableLogging: false,
            });
            expect(p).toBeDefined();
        });

        it('should accept options config', () => {
            const p = new RedisLocalStorageProvider({
                options: { host: 'myhost', port: 6380 },
                enableLogging: false,
            });
            expect(p).toBeDefined();
        });
    });

    describe('GetItem', () => {
        it('should return null for non-existent key', async () => {
            const result = await provider.GetItem('nonexistent');
            expect(result).toBeNull();
        });

        it('should return stored value', async () => {
            await provider.SetItem('key1', 'value1');
            const result = await provider.GetItem('key1');
            expect(result).toBe('value1');
        });

        it('should isolate keys by category', async () => {
            await provider.SetItem('key1', 'value-a', 'catA');
            await provider.SetItem('key1', 'value-b', 'catB');

            const resultA = await provider.GetItem('key1', 'catA');
            const resultB = await provider.GetItem('key1', 'catB');

            expect(resultA).toBe('value-a');
            expect(resultB).toBe('value-b');
        });

        it('should use default category when none specified', async () => {
            await provider.SetItem('key1', 'value1');
            const result = await provider.GetItem('key1');
            expect(result).toBe('value1');
        });

        it('should return null on error', async () => {
            const client = provider.Client;
            (client.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection lost'));

            const result = await provider.GetItem('key1');
            expect(result).toBeNull();
        });
    });

    describe('SetItem', () => {
        it('should store a value', async () => {
            await provider.SetItem('key1', 'value1', 'testCat');
            const result = await provider.GetItem('key1', 'testCat');
            expect(result).toBe('value1');
        });

        it('should overwrite existing value', async () => {
            await provider.SetItem('key1', 'original');
            await provider.SetItem('key1', 'updated');
            const result = await provider.GetItem('key1');
            expect(result).toBe('updated');
        });

        it('should not throw on error', async () => {
            const client = provider.Client;
            (client.pipeline as ReturnType<typeof vi.fn>).mockReturnValueOnce({
                set: vi.fn().mockReturnThis(),
                setex: vi.fn().mockReturnThis(),
                sadd: vi.fn().mockReturnThis(),
                exec: vi.fn().mockRejectedValueOnce(new Error('Write failed')),
            });

            await expect(provider.SetItem('key1', 'value1')).resolves.not.toThrow();
        });

        it('should store with default TTL from config', async () => {
            const p = new RedisLocalStorageProvider({
                defaultTTLSeconds: 300,
                enableLogging: false,
            });
            await p.SetItem('k', 'v', 'cat');
            expect((p.Client as unknown as { _ttls: Map<string, number> })._ttls.get('mj:cat:k')).toBe(300);
        });

        it('expires entries after one hour when no default is configured', async () => {
            await provider.SetItem('k', 'v', 'cat');
            expect((provider.Client as unknown as { _ttls: Map<string, number> })._ttls.get('mj:cat:k')).toBe(3600);
        });

        it('stores without expiry when the configured default is 0', async () => {
            const p = new RedisLocalStorageProvider({ defaultTTLSeconds: 0, enableLogging: false });
            await p.SetItem('k', 'v', 'cat');
            expect((p.Client as unknown as { _ttls: Map<string, number> })._ttls.has('mj:cat:k')).toBe(false);
        });
    });

    describe('Remove', () => {
        it('should remove an existing key', async () => {
            await provider.SetItem('key1', 'value1');
            await provider.Remove('key1');
            const result = await provider.GetItem('key1');
            expect(result).toBeNull();
        });

        it('should not throw when removing non-existent key', async () => {
            await expect(provider.Remove('nonexistent')).resolves.not.toThrow();
        });

        it('should not throw on error', async () => {
            const client = provider.Client;
            (client.del as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Delete failed'));

            await expect(provider.Remove('key1')).resolves.not.toThrow();
        });
    });

    describe('ClearCategory', () => {
        it('should clear all keys in a category', async () => {
            await provider.SetItem('key1', 'v1', 'myCat');
            await provider.SetItem('key2', 'v2', 'myCat');

            await provider.ClearCategory('myCat');

            const result1 = await provider.GetItem('key1', 'myCat');
            const result2 = await provider.GetItem('key2', 'myCat');
            expect(result1).toBeNull();
            expect(result2).toBeNull();
        });

        it('should not affect other categories', async () => {
            await provider.SetItem('key1', 'v1', 'catA');
            await provider.SetItem('key1', 'v2', 'catB');

            await provider.ClearCategory('catA');

            const resultB = await provider.GetItem('key1', 'catB');
            expect(resultB).toBe('v2');
        });

        it('should handle empty category gracefully', async () => {
            await expect(provider.ClearCategory('empty')).resolves.not.toThrow();
        });

        it('should not throw on error', async () => {
            const client = provider.Client;
            (client.scan as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Read failed'));

            await expect(provider.ClearCategory('myCat')).resolves.not.toThrow();
        });

        it('removes the category\'s index-group sets and the legacy category set', async () => {
            await provider.SetItem('Users|a', 'v1', 'RunViewCache', { IndexGroup: 'Users' });
            const sets = (provider.Client as unknown as { _sets: Map<string, Set<string>> })._sets;
            sets.set('mj:__categories__:RunViewCache', new Set(['Users|a']));   // written by older versions
            sets.set('mj:__group__:Other:Users', new Set(['x']));                // another category's group

            await provider.ClearCategory('RunViewCache');

            expect(sets.has('mj:__group__:RunViewCache:Users')).toBe(false);
            expect(sets.has('mj:__categories__:RunViewCache')).toBe(false);
            expect(sets.has('mj:__group__:Other:Users')).toBe(true);
        });

        it('treats glob characters in the category literally', async () => {
            await provider.SetItem('k', 'v', 'cat*');
            await provider.SetItem('k', 'v', 'catalog');

            await provider.ClearCategory('cat*');

            expect(await provider.GetItem('k', 'cat*')).toBeNull();
            expect(await provider.GetItem('k', 'catalog')).toBe('v');
        });
    });

    describe('GetCategoryKeys', () => {
        it('should return empty array for non-existent category', async () => {
            const keys = await provider.GetCategoryKeys('nonexistent');
            expect(keys).toEqual([]);
        });

        it('should return keys in a category', async () => {
            await provider.SetItem('key1', 'v1', 'myCat');
            await provider.SetItem('key2', 'v2', 'myCat');

            const keys = await provider.GetCategoryKeys('myCat');
            expect(keys).toHaveLength(2);
            expect(keys).toContain('key1');
            expect(keys).toContain('key2');
        });

        it('should return empty array on error', async () => {
            const client = provider.Client;
            (client.scan as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Read failed'));

            const result = await provider.GetCategoryKeys('myCat');
            expect(result).toEqual([]);
        });

        it('does not keep a category-wide set (it would grow for ever once keys expire)', async () => {
            await provider.SetItem('key1', 'v1', 'myCat');
            const sets = (provider.Client as unknown as { _sets: Map<string, Set<string>> })._sets;
            expect(sets.has('mj:__categories__:myCat')).toBe(false);
        });
    });

    describe('index groups', () => {
        type MockInternals = { _sets: Map<string, Set<string>>; _store: Map<string, string>; _groupTTLs: Map<string, number>; _ttls: Map<string, number> };
        const internals = (p: RedisLocalStorageProvider) => p.Client as unknown as MockInternals;

        it('records a key under its IndexGroup and returns it from GetIndexGroupKeys', async () => {
            await provider.SetItem('Users|f1', 'v1', 'RunViewCache', { IndexGroup: 'Users' });
            await provider.SetItem('Users|f2', 'v2', 'RunViewCache', { IndexGroup: 'Users' });
            await provider.SetItem('Roles|f1', 'v3', 'RunViewCache', { IndexGroup: 'Roles' });

            const keys = await provider.GetIndexGroupKeys('RunViewCache', 'Users');
            expect(keys.sort()).toEqual(['Users|f1', 'Users|f2']);
        });

        it('does not index a key written without an IndexGroup', async () => {
            await provider.SetItem('Users|f1', 'v1', 'RunViewCache');
            expect(await provider.GetIndexGroupKeys('RunViewCache', 'Users')).toEqual([]);
        });

        it('drops members whose key no longer exists, and returns only live keys', async () => {
            await provider.SetItem('Users|live', 'v1', 'RunViewCache', { IndexGroup: 'Users' });
            await provider.SetItem('Users|gone', 'v2', 'RunViewCache', { IndexGroup: 'Users' });
            internals(provider)._store.delete('mj:RunViewCache:Users|gone');   // expired

            expect(await provider.GetIndexGroupKeys('RunViewCache', 'Users')).toEqual(['Users|live']);
            expect([...internals(provider)._sets.get('mj:__group__:RunViewCache:Users')!]).toEqual(['Users|live']);
        });

        it('keeps a member whose EXISTS check failed rather than hiding a live key', async () => {
            await provider.SetItem('Users|f1', 'v1', 'RunViewCache', { IndexGroup: 'Users' });
            (provider.Client.pipeline as ReturnType<typeof vi.fn>).mockReturnValueOnce({
                exists: vi.fn().mockReturnThis(),
                exec: vi.fn().mockResolvedValueOnce([[new Error('timeout'), null]]),
            });

            expect(await provider.GetIndexGroupKeys('RunViewCache', 'Users')).toEqual(['Users|f1']);
        });

        it('returns an empty array when Redis fails', async () => {
            (provider.Client.smembers as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'));
            expect(await provider.GetIndexGroupKeys('RunViewCache', 'Users')).toEqual([]);
        });

        it('passes the entry TTL to the group script: default, per-call, and none', async () => {
            const withDefault = new RedisLocalStorageProvider({ enableLogging: false, defaultTTLSeconds: 3600 });
            await withDefault.SetItem('A|1', 'v', 'RunViewCache', { IndexGroup: 'A' });
            await withDefault.SetItem('B|1', 'v', 'RunViewCache', { IndexGroup: 'B', TTLSeconds: 60 });
            await withDefault.SetItem('C|1', 'v', 'RunViewCache', { IndexGroup: 'C', TTLSeconds: 0 });

            const m = internals(withDefault);
            expect(m._groupTTLs.get('mj:__group__:RunViewCache:A')).toBe(3600);
            expect(m._ttls.get('mj:RunViewCache:A|1')).toBe(3600);
            expect(m._groupTTLs.get('mj:__group__:RunViewCache:B')).toBe(60);
            expect(m._ttls.get('mj:RunViewCache:B|1')).toBe(60);
            expect(m._groupTTLs.get('mj:__group__:RunViewCache:C')).toBe(0);
            expect(m._ttls.has('mj:RunViewCache:C|1')).toBe(false);   // stored with SET, no expiry
            await withDefault.Disconnect();
        });

        it('still accepts a bare number as the TTL (legacy signature)', async () => {
            await provider.SetItem('k', 'v', 'cat', 90);
            expect(internals(provider)._ttls.get('mj:cat:k')).toBe(90);
        });
    });

    describe('Exists', () => {
        it('should return false for non-existent key', async () => {
            const result = await provider.Exists('nonexistent');
            expect(result).toBe(false);
        });

        it('should return true for existing key', async () => {
            // Set via the mock client directly to test Exists path
            const client = provider.Client;
            await client.set('mj:default:key1', 'value');

            const result = await provider.Exists('key1');
            expect(result).toBe(true);
        });

        it('should return false on error', async () => {
            const client = provider.Client;
            (client.exists as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('err'));

            const result = await provider.Exists('key1');
            expect(result).toBe(false);
        });
    });

    describe('GetTTL', () => {
        it('should return null on error', async () => {
            const client = provider.Client;
            (client.ttl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('err'));

            const result = await provider.GetTTL('key1');
            expect(result).toBeNull();
        });

        it('should return -2 for non-existent key', async () => {
            const result = await provider.GetTTL('nonexistent');
            expect(result).toBe(-2);
        });
    });

    describe('Ping', () => {
        it('should return true when Redis is available', async () => {
            const result = await provider.Ping();
            expect(result).toBe(true);
        });

        it('should return false when Redis is unavailable', async () => {
            const client = provider.Client;
            (client.ping as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection refused'));

            const result = await provider.Ping();
            expect(result).toBe(false);
        });
    });

    describe('Disconnect', () => {
        it('should disconnect gracefully', async () => {
            await expect(provider.Disconnect()).resolves.not.toThrow();
            expect(provider.Client.quit).toHaveBeenCalled();
        });

        it('should force disconnect on quit error', async () => {
            const client = provider.Client;
            (client.quit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Quit failed'));

            await expect(provider.Disconnect()).resolves.not.toThrow();
            expect(client.disconnect).toHaveBeenCalled();
        });
    });

    describe('error logging', () => {
        it('should log errors when enableLogging is true', async () => {
            const p = new RedisLocalStorageProvider({ enableLogging: true });
            const client = p.Client;
            (client.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Test error'));

            await p.GetItem('test');
            expect(LogError).toHaveBeenCalledWith(
                expect.stringContaining('Test error')
            );
        });
    });

    // ====================================================================
    // Pub/Sub Tests
    // ====================================================================

    describe('Pub/Sub - publishChange on mutations', () => {
        let pubsubProvider: RedisLocalStorageProvider;

        beforeEach(() => {
            pubsubProvider = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
            });
        });

        afterEach(async () => {
            await pubsubProvider.Disconnect();
        });

        it('should publish a "set" event when SetItem is called', async () => {
            await pubsubProvider.SetItem('myKey', 'myValue', 'testCat');

            const client = pubsubProvider.Client;
            expect(client.publish).toHaveBeenCalled();
            const [channel, message] = (client.publish as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(channel).toBe('mj:__pubsub__');
            const event = JSON.parse(message);
            expect(event.CacheKey).toBe('myKey');
            expect(event.Category).toBe('testCat');
            expect(event.Action).toBe('set');
            // SetItem now JSON-serializes the value internally (provider is generic-typed).
            // The pub/sub Data field carries the serialized payload so subscribers can
            // re-deserialize without re-querying Redis.
            expect(event.Data).toBe(JSON.stringify('myValue'));
            expect(event.SourceServerId).toBe(MOCK_PROCESS_UUID);
            expect(event.Timestamp).toBeTypeOf('number');
        });

        it('should publish a "removed" event when Remove is called', async () => {
            await pubsubProvider.SetItem('myKey', 'myValue', 'testCat');
            (pubsubProvider.Client.publish as ReturnType<typeof vi.fn>).mockClear();

            await pubsubProvider.Remove('myKey', 'testCat');

            const client = pubsubProvider.Client;
            expect(client.publish).toHaveBeenCalled();
            const [, message] = (client.publish as ReturnType<typeof vi.fn>).mock.calls[0];
            const event = JSON.parse(message);
            expect(event.CacheKey).toBe('myKey');
            expect(event.Action).toBe('removed');
            expect(event.Data).toBeUndefined();
        });

        it('should publish a "category_cleared" event when ClearCategory is called', async () => {
            await pubsubProvider.SetItem('k1', 'v1', 'myCat');
            (pubsubProvider.Client.publish as ReturnType<typeof vi.fn>).mockClear();

            await pubsubProvider.ClearCategory('myCat');

            const client = pubsubProvider.Client;
            expect(client.publish).toHaveBeenCalled();
            const [, message] = (client.publish as ReturnType<typeof vi.fn>).mock.calls[0];
            const event = JSON.parse(message);
            expect(event.Category).toBe('myCat');
            expect(event.Action).toBe('category_cleared');
        });

        describe('publish modes', () => {
            const published = (p: RedisLocalStorageProvider) =>
                (p.Client.publish as ReturnType<typeof vi.fn>).mock.calls.map(([, m]) => JSON.parse(m as string));

            it('full: the event carries the value (the default)', async () => {
                await pubsubProvider.SetItem('k', { big: true }, 'RunViewCache');
                expect(published(pubsubProvider)[0].Data).toBe(JSON.stringify({ big: true }));
            });

            it('notice: the event names the key but carries no value', async () => {
                const p = new RedisLocalStorageProvider({ enablePubSub: true, enableLogging: false, publishModes: { default: 'notice' } });
                await p.SetItem('___MJCore_Metadata_Timestamps', 'x'.repeat(1000));
                const [event] = published(p);
                expect(event).toMatchObject({ CacheKey: '___MJCore_Metadata_Timestamps', Category: 'default', Action: 'set' });
                expect(event.Data).toBeUndefined();
                expect(typeof event.Timestamp).toBe('number');
                await p.Disconnect();
            });

            it('none: sets and removals publish nothing, but a category clear still does', async () => {
                const p = new RedisLocalStorageProvider({ enablePubSub: true, enableLogging: false, publishModes: { RunViewCache: 'full' }, defaultPublishMode: 'none' });
                await p.SetItem('ds', 1, 'DatasetCache');
                await p.Remove('ds', 'DatasetCache');
                await p.SetItem('rv', 1, 'RunViewCache');
                await p.ClearCategory('DatasetCache');
                expect(published(p).map(e => `${e.Category}/${e.Action}`)).toEqual(['RunViewCache/set', 'DatasetCache/category_cleared']);
                await p.Disconnect();
            });
        });

        it('should NOT publish when pubsub is disabled', async () => {
            const noPubSub = new RedisLocalStorageProvider({
                enablePubSub: false,
                enableLogging: false,
            });

            await noPubSub.SetItem('key1', 'val1');

            expect(noPubSub.Client.publish).not.toHaveBeenCalled();
            await noPubSub.Disconnect();
        });

        it('should use custom keyPrefix in channel name', async () => {
            const custom = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'myapp',
            });

            await custom.SetItem('k', 'v', 'cat');

            const client = custom.Client;
            expect(client.publish).toHaveBeenCalled();
            const [channel] = (client.publish as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(channel).toBe('myapp:__pubsub__');
            await custom.Disconnect();
        });
    });

    describe('Pub/Sub - StartListening and message handling', () => {
        let pubsubProvider: RedisLocalStorageProvider;

        beforeEach(() => {
            pubsubProvider = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
            });
        });

        afterEach(async () => {
            await pubsubProvider.Disconnect();
        });

        it('should be a no-op when pubsub is disabled', async () => {
            const noPubSub = new RedisLocalStorageProvider({
                enablePubSub: false,
                enableLogging: false,
            });
            await noPubSub.StartListening();
            expect(noPubSub.IsSubscriberConnected).toBe(false);
            await noPubSub.Disconnect();
        });

        it('should be idempotent (calling StartListening twice does not create a second subscriber)', async () => {
            await pubsubProvider.StartListening();
            await pubsubProvider.StartListening(); // Should be a no-op
            // No error thrown means success
        });
    });

    describe('Pub/Sub - OnCacheChanged callback', () => {
        let pubsubProvider: RedisLocalStorageProvider;

        beforeEach(() => {
            pubsubProvider = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
            });
        });

        afterEach(async () => {
            await pubsubProvider.Disconnect();
        });

        it('should register and invoke callback on cache change events', async () => {
            const callback = vi.fn();
            pubsubProvider.OnCacheChanged(callback);

            await pubsubProvider.StartListening();

            // Find the subscriber client — it's the second Redis instance created
            // We simulate a message arriving on the subscriber
            // Access the internal subscriber via the provider
            // The subscriber is created inside StartListening, we can't directly access it
            // But we can test the event emitter path by triggering handlePubSubMessage indirectly
            // via the OnCacheChanged registration

            // Simulate an external event by directly emitting on the event emitter
            const event = {
                CacheKey: 'TestEntity|filter||entity_object|||',
                Category: 'RunViewCache',
                Action: 'set',
                Timestamp: Date.now(),
                SourceServerId: 'other-server-id',
                Data: '{"results":[]}',
            };

            // Use the internal event emitter directly via the provider's OnCacheChanged path
            // We registered a callback above, now emit the event
            // Access private _eventEmitter is not ideal, but we test the public contract
            // by relying on the message handler calling the emitter.
            // For a more direct test, we invoke the event emitter via type assertion:
            (pubsubProvider as unknown as { _eventEmitter: { emit: (event: string, data: unknown) => void } })
                ._eventEmitter.emit('cacheChanged', event);

            expect(callback).toHaveBeenCalledOnce();
            expect(callback).toHaveBeenCalledWith(event);
        });

        it('should return an unsubscribe function that removes the callback', () => {
            const callback = vi.fn();
            const unsub = pubsubProvider.OnCacheChanged(callback);

            // Trigger event
            (pubsubProvider as unknown as { _eventEmitter: { emit: (event: string, data: unknown) => void } })
                ._eventEmitter.emit('cacheChanged', { CacheKey: 'test' });
            expect(callback).toHaveBeenCalledOnce();

            // Unsubscribe and trigger again
            unsub();
            (pubsubProvider as unknown as { _eventEmitter: { emit: (event: string, data: unknown) => void } })
                ._eventEmitter.emit('cacheChanged', { CacheKey: 'test' });
            expect(callback).toHaveBeenCalledOnce(); // Still only once
        });
    });

    describe('Pub/Sub - self-message filtering', () => {
        it('should NOT emit events originating from this server', async () => {
            const pubsubProvider = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
            });

            const callback = vi.fn();
            pubsubProvider.OnCacheChanged(callback);

            // Simulate the handlePubSubMessage path with a self-originated event
            const selfEvent = JSON.stringify({
                CacheKey: 'test-key',
                Category: 'RunViewCache',
                Action: 'set',
                Timestamp: Date.now(),
                SourceServerId: MOCK_PROCESS_UUID, // Same as this server
                Data: '{}',
            });

            // Call handlePubSubMessage via private access
            (pubsubProvider as unknown as { handlePubSubMessage: (msg: string) => void })
                .handlePubSubMessage(selfEvent);

            expect(callback).not.toHaveBeenCalled();
            await pubsubProvider.Disconnect();
        });

        it('should emit events originating from other servers', async () => {
            const pubsubProvider = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
            });

            const callback = vi.fn();
            pubsubProvider.OnCacheChanged(callback);

            const otherEvent = JSON.stringify({
                CacheKey: 'test-key',
                Category: 'RunViewCache',
                Action: 'set',
                Timestamp: Date.now(),
                SourceServerId: 'different-server-id',
                Data: '{"results":[]}',
            });

            (pubsubProvider as unknown as { handlePubSubMessage: (msg: string) => void })
                .handlePubSubMessage(otherEvent);

            expect(callback).toHaveBeenCalledOnce();
            const received = callback.mock.calls[0][0];
            expect(received.SourceServerId).toBe('different-server-id');
            await pubsubProvider.Disconnect();
        });

        it('should handle malformed messages gracefully', async () => {
            const pubsubProvider = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: true,
            });

            const callback = vi.fn();
            pubsubProvider.OnCacheChanged(callback);

            // Send invalid JSON
            (pubsubProvider as unknown as { handlePubSubMessage: (msg: string) => void })
                .handlePubSubMessage('not valid json {{{{');

            expect(callback).not.toHaveBeenCalled();
            expect(LogError).toHaveBeenCalledWith(
                expect.stringContaining('failed to parse message')
            );
            await pubsubProvider.Disconnect();
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Generic named-channel pub/sub — the transport for cross-instance push-status
    // fan-out (MJ #4222). Distinct from the cache channel above: the payload is opaque
    // here, so this layer does no echo suppression and the publisher supplies its own.
    // ────────────────────────────────────────────────────────────────────────
    describe('Pub/Sub - named channels', () => {
        it('publishes on a channel namespaced by the key prefix', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'app1',
            });

            p.PublishMessage('push-status-updates', 'hello');

            expect(p.Client.publish).toHaveBeenCalledWith('app1:push-status-updates', 'hello');
            await p.Disconnect();
        });

        it('is a no-op when pub/sub is disabled', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: false,
                enableLogging: false,
            });

            p.PublishMessage('push-status-updates', 'hello');

            expect(p.Client.publish).not.toHaveBeenCalled();
            await p.Disconnect();
        });

        it('delivers a message to the handler registered for its channel', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            const handler = vi.fn();
            await p.SubscribeToChannel('push-status-updates', handler);

            (p as unknown as { dispatchChannelMessage: (c: string, m: string) => void })
                .dispatchChannelMessage('mj:push-status-updates', 'payload');

            expect(handler).toHaveBeenCalledWith('payload');
            await p.Disconnect();
        });

        it('does not deliver a message meant for a different channel', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            const handler = vi.fn();
            await p.SubscribeToChannel('push-status-updates', handler);

            (p as unknown as { dispatchChannelMessage: (c: string, m: string) => void })
                .dispatchChannelMessage('mj:something-else', 'payload');

            expect(handler).not.toHaveBeenCalled();
            await p.Disconnect();
        });

        it('stops delivering after the returned unsubscribe is called', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            const handler = vi.fn();
            const unsubscribe = await p.SubscribeToChannel('push-status-updates', handler);

            unsubscribe();
            (p as unknown as { dispatchChannelMessage: (c: string, m: string) => void })
                .dispatchChannelMessage('mj:push-status-updates', 'payload');

            expect(handler).not.toHaveBeenCalled();
            await p.Disconnect();
        });

        it('keeps delivering to the other handlers when one throws', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            const good = vi.fn();
            await p.SubscribeToChannel('push-status-updates', () => {
                throw new Error('handler blew up');
            });
            await p.SubscribeToChannel('push-status-updates', good);

            expect(() =>
                (p as unknown as { dispatchChannelMessage: (c: string, m: string) => void })
                    .dispatchChannelMessage('mj:push-status-updates', 'payload')
            ).not.toThrow();
            expect(good).toHaveBeenCalledWith('payload');
            await p.Disconnect();
        });

        it('subscribes to the underlying channel only once for repeated handlers', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            await p.SubscribeToChannel('push-status-updates', vi.fn());
            await p.SubscribeToChannel('push-status-updates', vi.fn());

            const subscriber = (p as unknown as { _subscriber: { subscribe: ReturnType<typeof vi.fn> } })._subscriber;
            const namedCalls = subscriber.subscribe.mock.calls.filter(
                (c: unknown[]) => c[0] === 'mj:push-status-updates'
            );
            expect(namedCalls).toHaveLength(1);
            await p.Disconnect();
        });

        it('delivers to every handler when two subscribe to a new channel at once', async () => {
            // Both callers find no entry and both wait on the Redis subscribe. If each then
            // publishes its own handler set, the second replaces the first and the first handler
            // never receives another message, with nothing surfaced.
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            await p.SubscribeToChannel('warm-up', vi.fn());
            const first = vi.fn();
            const second = vi.fn();

            await Promise.all([
                p.SubscribeToChannel('push-status-updates', first),
                p.SubscribeToChannel('push-status-updates', second),
            ]);
            (p as unknown as { dispatchChannelMessage: (c: string, m: string) => void })
                .dispatchChannelMessage('mj:push-status-updates', 'payload');

            expect(first).toHaveBeenCalledWith('payload');
            expect(second).toHaveBeenCalledWith('payload');
            await p.Disconnect();
        });

        it('shares one underlying subscribe between concurrent first subscribers', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            await p.SubscribeToChannel('warm-up', vi.fn());

            await Promise.all([
                p.SubscribeToChannel('push-status-updates', vi.fn()),
                p.SubscribeToChannel('push-status-updates', vi.fn()),
            ]);

            const subscriber = (p as unknown as { _subscriber: { subscribe: ReturnType<typeof vi.fn> } })._subscriber;
            const namedCalls = subscriber.subscribe.mock.calls.filter(
                (c: unknown[]) => c[0] === 'mj:push-status-updates'
            );
            expect(namedCalls).toHaveLength(1);
            await p.Disconnect();
        });

        it('does not leave a poisoned entry behind when the subscribe is rejected', async () => {
            // The handler map is what later callers consult to decide whether the channel is
            // already subscribed. An entry left behind by a failed subscribe makes every later
            // caller skip the subscribe and register against a channel Redis is not listening on,
            // with nothing surfaced.
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            await p.SubscribeToChannel('warm-up', vi.fn());
            const subscriber = (p as unknown as { _subscriber: { subscribe: ReturnType<typeof vi.fn> } })._subscriber;
            subscriber.subscribe.mockRejectedValueOnce(new Error('redis down'));

            await expect(p.SubscribeToChannel('push-status-updates', vi.fn())).rejects.toThrow('redis down');

            const handlers = (p as unknown as { _channelHandlers: Map<string, Set<unknown>> })._channelHandlers;
            expect(handlers.has('mj:push-status-updates')).toBe(false);
            await p.Disconnect();
        });

        it('re-subscribes after an earlier subscribe failed', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            await p.SubscribeToChannel('warm-up', vi.fn());
            const subscriber = (p as unknown as { _subscriber: { subscribe: ReturnType<typeof vi.fn> } })._subscriber;
            subscriber.subscribe.mockRejectedValueOnce(new Error('redis down'));
            await expect(p.SubscribeToChannel('push-status-updates', vi.fn())).rejects.toThrow('redis down');

            const handler = vi.fn();
            await p.SubscribeToChannel('push-status-updates', handler);

            const namedCalls = subscriber.subscribe.mock.calls.filter(
                (c: unknown[]) => c[0] === 'mj:push-status-updates'
            );
            expect(namedCalls).toHaveLength(2);
            (p as unknown as { dispatchChannelMessage: (c: string, m: string) => void })
                .dispatchChannelMessage('mj:push-status-updates', 'payload');
            expect(handler).toHaveBeenCalledWith('payload');
            await p.Disconnect();
        });

        it('returns an inert unsubscribe when pub/sub is disabled', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: false,
                enableLogging: false,
            });

            const unsubscribe = await p.SubscribeToChannel('push-status-updates', vi.fn());

            expect(() => unsubscribe()).not.toThrow();
            await p.Disconnect();
        });

        it('reports whether pub/sub is enabled', async () => {
            const on = new RedisLocalStorageProvider({ enablePubSub: true, enableLogging: false });
            const off = new RedisLocalStorageProvider({ enablePubSub: false, enableLogging: false });

            expect(on.IsPubSubEnabled).toBe(true);
            expect(off.IsPubSubEnabled).toBe(false);
            await on.Disconnect();
            await off.Disconnect();
        });

        it('refuses the channel reserved for cache invalidation', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });

            expect(() => p.PublishMessage('__pubsub__', 'forged')).toThrow(/reserved/);
            await expect(p.PublishMessageAndWait('__pubsub__', 'forged')).rejects.toThrow(/reserved/);
            await expect(p.SubscribeToChannel('__pubsub__', vi.fn())).rejects.toThrow(/reserved/);
            expect(p.Client.publish).not.toHaveBeenCalled();
            await p.Disconnect();
        });

        describe('PublishMessageAndWait', () => {
            it('resolves to the number of subscribers that received the message', async () => {
                const p = new RedisLocalStorageProvider({
                    enablePubSub: true,
                    enableLogging: false,
                    keyPrefix: 'app1',
                });
                (p.Client.publish as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);

                const received = await p.PublishMessageAndWait('abort', 'payload');

                expect(received).toBe(3);
                expect(p.Client.publish).toHaveBeenCalledWith('app1:abort', 'payload');
                await p.Disconnect();
            });

            it('rejects when pub/sub is disabled, rather than reporting a delivery', async () => {
                const p = new RedisLocalStorageProvider({ enablePubSub: false, enableLogging: false });

                await expect(p.PublishMessageAndWait('abort', 'payload')).rejects.toThrow(/enablePubSub/);
                expect(p.Client.publish).not.toHaveBeenCalled();
                await p.Disconnect();
            });

            it('rejects when Redis rejects the publish', async () => {
                const p = new RedisLocalStorageProvider({ enablePubSub: true, enableLogging: false });
                (p.Client.publish as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('redis down'));

                await expect(p.PublishMessageAndWait('abort', 'payload')).rejects.toThrow('redis down');
                await p.Disconnect();
            });
        });

        describe('releasing a channel', () => {
            type MockSubscriber = {
                subscribe: ReturnType<typeof vi.fn>;
                unsubscribe: ReturnType<typeof vi.fn>;
                _simulateMessage: (channel: string, message: string) => void;
            };
            const subscriberOf = (p: RedisLocalStorageProvider): MockSubscriber =>
                (p as unknown as { _subscriber: MockSubscriber })._subscriber;

            it('unsubscribes from Redis only when the last handler leaves, and only once', async () => {
                const p = new RedisLocalStorageProvider({
                    enablePubSub: true,
                    enableLogging: false,
                    keyPrefix: 'mj',
                });
                const first = await p.SubscribeToChannel('abort', vi.fn());
                const second = await p.SubscribeToChannel('abort', vi.fn());
                const subscriber = subscriberOf(p);

                first();
                expect(subscriber.unsubscribe).not.toHaveBeenCalledWith('mj:abort');

                second();
                second();
                const released = subscriber.unsubscribe.mock.calls.filter((c: unknown[]) => c[0] === 'mj:abort');
                expect(released).toHaveLength(1);
                await p.Disconnect();
            });

            it('subscribes again when a handler arrives after the channel was released', async () => {
                const p = new RedisLocalStorageProvider({
                    enablePubSub: true,
                    enableLogging: false,
                    keyPrefix: 'mj',
                });
                const unsubscribe = await p.SubscribeToChannel('abort', vi.fn());
                unsubscribe();

                const handler = vi.fn();
                await p.SubscribeToChannel('abort', handler);
                const subscriber = subscriberOf(p);
                subscriber._simulateMessage('mj:abort', 'payload');

                const subscribes = subscriber.subscribe.mock.calls.filter((c: unknown[]) => c[0] === 'mj:abort');
                expect(subscribes).toHaveLength(2);
                expect(handler).toHaveBeenCalledWith('payload');
                await p.Disconnect();
            });

            it('starts a fresh subscriber when the first one failed to subscribe', async () => {
                // A subscriber left behind by a failed start reads as "already listening" to every
                // later caller, and has no message listener, so their handlers never fire.
                const p = new RedisLocalStorageProvider({
                    enablePubSub: true,
                    enableLogging: false,
                    keyPrefix: 'mj',
                });
                const internals = p as unknown as { createSubscriberClient: () => MockSubscriber };
                const createSubscriber = internals.createSubscriberClient.bind(p);
                let created = 0;
                internals.createSubscriberClient = () => {
                    const client = createSubscriber();
                    if (created++ === 0) {
                        client.subscribe.mockRejectedValueOnce(new Error('redis down'));
                    }
                    return client;
                };

                await expect(p.SubscribeToChannel('abort', vi.fn())).rejects.toThrow('redis down');
                const handler = vi.fn();
                await p.SubscribeToChannel('abort', handler);
                subscriberOf(p)._simulateMessage('mj:abort', 'payload');

                expect(handler).toHaveBeenCalledWith('payload');
                await p.Disconnect();
            });
        });

        it('contains a rejected promise from an async handler and logs it', async () => {
            const p = new RedisLocalStorageProvider({
                enablePubSub: true,
                enableLogging: false,
                keyPrefix: 'mj',
            });
            const good = vi.fn();
            await p.SubscribeToChannel('abort', async () => {
                throw new Error('async handler blew up');
            });
            await p.SubscribeToChannel('abort', good);

            (p as unknown as { dispatchChannelMessage: (c: string, m: string) => void })
                .dispatchChannelMessage('mj:abort', 'payload');
            await new Promise(resolve => setImmediate(resolve));

            expect(good).toHaveBeenCalledWith('payload');
            expect(LogError).toHaveBeenCalledWith(expect.stringContaining('async handler blew up'));
            await p.Disconnect();
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Generic typing — internal JSON serialization for non-string values
    // ────────────────────────────────────────────────────────────────────────
    describe('generic typing — internal JSON conversion', () => {
        it('round-trips a plain object via JSON serialization', async () => {
            interface UserCacheEntry {
                userId: string;
                roles: string[];
                count: number;
            }
            const user: UserCacheEntry = { userId: 'u-1', roles: ['admin'], count: 42 };
            await provider.SetItem<UserCacheEntry>('u', user, 'Users');
            const out = await provider.GetItem<UserCacheEntry>('u', 'Users');
            expect(out).toEqual(user);
            expect(out!.roles).toContain('admin');
            expect(out!.count).toBe(42);
        });

        it('round-trips an array', async () => {
            const arr = [1, 2, 3, { four: 4 }];
            await provider.SetItem('arr', arr, 'Test');
            const out = await provider.GetItem<typeof arr>('arr', 'Test');
            expect(out).toEqual(arr);
        });

        it('round-trips a number', async () => {
            await provider.SetItem('n', 42, 'Test');
            const out = await provider.GetItem<number>('n', 'Test');
            expect(out).toBe(42);
        });

        it('round-trips a boolean', async () => {
            await provider.SetItem('b', true, 'Test');
            const out = await provider.GetItem<boolean>('b', 'Test');
            expect(out).toBe(true);
        });

        it('round-trips null (stored as JSON "null", returned as null)', async () => {
            await provider.SetItem('n', null, 'Test');
            const out = await provider.GetItem('n', 'Test');
            expect(out).toBeNull();
        });

        it('returns null for a corrupt (non-JSON) value already in Redis', async () => {
            // Simulate a legacy entry written by some non-MJ process directly into Redis
            const client = provider.Client;
            const rawKey = 'mj:Test:legacy';
            await (client.set as ReturnType<typeof vi.fn>).mockImplementationOnce(
                async (_k: string, _v: string) => {
                    (provider.Client._store as Map<string, string>).set(rawKey, 'this is not JSON {{{');
                    return 'OK';
                }
            );
            await client.set(rawKey, 'this is not JSON {{{');

            const out = await provider.GetItem<string>('legacy', 'Test');
            expect(out).toBeNull();
        });

        it('Date objects survive round-trip as ISO strings (JSON limitation)', async () => {
            // Documented JSON limitation: Date → ISO string on stringify; comes back as string.
            // Not as nice as IndexedDB structured clone, but still usable.
            const d = new Date('2026-05-02T12:00:00.000Z');
            await provider.SetItem('d', d, 'Test');
            const out = await provider.GetItem<string>('d', 'Test');
            expect(out).toBe('2026-05-02T12:00:00.000Z');
        });

        it('does not throw when storing un-JSON-serializable values (logs internally)', async () => {
            // Functions can't be JSON-serialized — JSON.stringify drops them.
            // The wrapping object IS still serializable, just with the function field omitted.
            const obj = {
                value: 7,
                fn: () => 'oops',
            };
            await expect(provider.SetItem('weird', obj, 'Test')).resolves.toBeUndefined();
            const out = await provider.GetItem<typeof obj>('weird', 'Test');
            expect(out!.value).toBe(7);
            expect(out!.fn).toBeUndefined();  // function silently dropped by JSON
        });

        it('SetItem with an object that has a circular reference does not throw', async () => {
            // Circular refs make JSON.stringify throw — provider should catch and log.
            const a: { name: string; self?: unknown } = { name: 'a' };
            a.self = a;
            await expect(provider.SetItem('circ', a, 'Test')).resolves.toBeUndefined();
            expect(await provider.GetItem('circ', 'Test')).toBeNull();
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // GetItems — batched read via MGET pipeline
    // ────────────────────────────────────────────────────────────────────────
    describe('GetItems (batched read via MGET)', () => {
        it('issues exactly one MGET call for N keys (not N individual GETs)', async () => {
            await provider.SetItem('k1', 'v1', 'Test');
            await provider.SetItem('k2', 'v2', 'Test');
            await provider.SetItem('k3', 'v3', 'Test');

            const client = provider.Client;
            (client.get as ReturnType<typeof vi.fn>).mockClear();
            (client.mget as ReturnType<typeof vi.fn>).mockClear();

            const out = await provider.GetItems<string>(['k1', 'k2', 'k3'], 'Test');

            expect(out.size).toBe(3);
            expect(out.get('k1')).toBe('v1');
            expect(out.get('k2')).toBe('v2');
            expect(out.get('k3')).toBe('v3');
            // Verify we used MGET, not N individual GETs
            expect(client.mget).toHaveBeenCalledTimes(1);
            expect(client.get).not.toHaveBeenCalled();
        });

        it('passes keys as variadic args to MGET (ioredis API contract)', async () => {
            await provider.SetItem('k1', 'v1', 'Test');
            await provider.SetItem('k2', 'v2', 'Test');

            const client = provider.Client;
            (client.mget as ReturnType<typeof vi.fn>).mockClear();

            await provider.GetItems<string>(['k1', 'k2'], 'Test');

            // mget should be called with two separate args, not a single array
            const call = (client.mget as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(call.length).toBe(2);
            expect(call[0]).toContain('k1');
            expect(call[1]).toContain('k2');
        });

        it('returns null for missing keys interleaved with hits', async () => {
            await provider.SetItem('present-1', { id: 1 }, 'Test');
            await provider.SetItem('present-2', { id: 2 }, 'Test');

            const out = await provider.GetItems<{ id: number }>(
                ['present-1', 'missing', 'present-2'],
                'Test'
            );
            expect(out.get('present-1')).toEqual({ id: 1 });
            expect(out.get('missing')).toBeNull();
            expect(out.get('present-2')).toEqual({ id: 2 });
        });

        it('treats corrupt JSON entries as cache misses (per-key, not whole batch)', async () => {
            // Stuff a corrupt entry directly into the underlying mock store.
            await provider.SetItem('good', 'value', 'Test');
            const client = provider.Client as unknown as { _store: Map<string, string> };
            client._store.set('mj:Test:bad', 'this is not JSON {{{');

            const out = await provider.GetItems<string>(['good', 'bad'], 'Test');
            expect(out.get('good')).toBe('value');
            expect(out.get('bad')).toBeNull();
        });

        it('returns null for every requested key when MGET fails (fail-open)', async () => {
            const client = provider.Client;
            (client.mget as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
                new Error('Connection lost')
            );

            const out = await provider.GetItems<string>(['k1', 'k2', 'k3'], 'Test');
            expect(out.size).toBe(3);
            expect(out.get('k1')).toBeNull();
            expect(out.get('k2')).toBeNull();
            expect(out.get('k3')).toBeNull();
        });

        it('returns empty Map for empty input without touching Redis', async () => {
            const client = provider.Client;
            (client.mget as ReturnType<typeof vi.fn>).mockClear();

            const out = await provider.GetItems<string>([]);
            expect(out.size).toBe(0);
            expect(client.mget).not.toHaveBeenCalled();
        });

        it('deduplicates input keys before issuing MGET', async () => {
            await provider.SetItem('k', 'v', 'Test');

            const client = provider.Client;
            (client.mget as ReturnType<typeof vi.fn>).mockClear();

            const out = await provider.GetItems<string>(['k', 'k', 'k'], 'Test');
            expect(out.size).toBe(1);
            expect(out.get('k')).toBe('v');
            // Underlying MGET should have been called with one key, not three
            const call = (client.mget as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(call.length).toBe(1);
        });

        it('respects category isolation in batched reads', async () => {
            await provider.SetItem('shared', 'A-val', 'CategoryA');
            await provider.SetItem('shared', 'B-val', 'CategoryB');

            const fromA = await provider.GetItems<string>(['shared'], 'CategoryA');
            const fromB = await provider.GetItems<string>(['shared'], 'CategoryB');

            expect(fromA.get('shared')).toBe('A-val');
            expect(fromB.get('shared')).toBe('B-val');
        });

        it('handles mixed-type batched reads (objects + arrays + primitives)', async () => {
            await provider.SetItem('obj', { x: 1 }, 'Mix');
            await provider.SetItem('arr', [1, 2, 3], 'Mix');
            await provider.SetItem('num', 42, 'Mix');
            await provider.SetItem('str', 'hello', 'Mix');
            await provider.SetItem('bool', true, 'Mix');

            const out = await provider.GetItems<unknown>(['obj', 'arr', 'num', 'str', 'bool'], 'Mix');
            expect(out.get('obj')).toEqual({ x: 1 });
            expect(out.get('arr')).toEqual([1, 2, 3]);
            expect(out.get('num')).toBe(42);
            expect(out.get('str')).toBe('hello');
            expect(out.get('bool')).toBe(true);
        });

        it('handles a large batch (100 keys) in one MGET call', async () => {
            const N = 100;
            for (let i = 0; i < N; i++) {
                await provider.SetItem(`k-${i}`, i, 'Bulk');
            }

            const client = provider.Client;
            (client.mget as ReturnType<typeof vi.fn>).mockClear();

            const keys = Array.from({ length: N }, (_, i) => `k-${i}`);
            const out = await provider.GetItems<number>(keys, 'Bulk');

            expect(out.size).toBe(N);
            for (let i = 0; i < N; i++) {
                expect(out.get(`k-${i}`)).toBe(i);
            }
            expect(client.mget).toHaveBeenCalledTimes(1);
        });
    });

    /**
     * Found in review. Neither is visible to a happy-path test: the first
     * needs the pipeline reply to come back unusable, the second needs two keys written in order
     * and then compared for expiry.
     */
    describe('index pruning is atomic', () => {
        it('prunes a member whose key is gone and keeps the live ones', async () => {
            await provider.SetItem('Users|f1', 'v1', 'RunViewCache', { IndexGroup: 'Users' });
            await provider.SetItem('Users|f2', 'v2', 'RunViewCache', { IndexGroup: 'Users' });
            await provider.Remove('Users|f2', 'RunViewCache');

            expect(await provider.GetIndexGroupKeys('RunViewCache', 'Users')).toEqual(['Users|f1']);
        });

        it('reads and prunes in ONE round trip, so a peer\'s add cannot be dropped unseen', async () => {
            await provider.SetItem('Users|f1', 'v1', 'RunViewCache', { IndexGroup: 'Users' });
            const client = provider.Client;
            (client.smembers as ReturnType<typeof vi.fn>).mockClear();
            (client.srem as ReturnType<typeof vi.fn>).mockClear();
            (client.del as ReturnType<typeof vi.fn>).mockClear();

            await provider.GetIndexGroupKeys('RunViewCache', 'Users');

            // Every step happens inside the script: no client-side SMEMBERS/SREM/DEL, which is what
            // opened the window a peer's SADD could fall into.
            expect(client.eval).toHaveBeenCalled();
            expect(client.smembers).not.toHaveBeenCalled();
            expect(client.srem).not.toHaveBeenCalled();
            expect(client.del).not.toHaveBeenCalled();
        });

        it('deletes a set whose every member is gone, rather than leaving an empty one', async () => {
            await provider.SetItem('Users|f1', 'v1', 'RunViewCache', { IndexGroup: 'Users' });
            await provider.Remove('Users|f1', 'RunViewCache');

            expect(await provider.GetIndexGroupKeys('RunViewCache', 'Users')).toEqual([]);
            expect(provider.Client._sets.has('mj:__group__:RunViewCache:Users')).toBe(false);
        });
    });

    describe('holding the key lock while Redis stops answering', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        /** Makes every lock command fail, as a dropped connection does. */
        function connectionDrops(p: RedisLocalStorageProvider): void {
            const client = p.Client as unknown as { get: ReturnType<typeof vi.fn>; eval: ReturnType<typeof vi.fn> };
            client.get.mockRejectedValue(new Error('Connection is closed'));
            client.eval.mockRejectedValue(new Error('Connection is closed'));
        }

        it('reports the lock lost when the connection has been down longer than the lock could live', async () => {
            // The post-work check reads the lock back. When THAT read fails, the connection is
            // down — and the renewals ran over the same connection, so they have been failing
            // silently too. Answering "still mine" is then exactly backwards: it is most likely
            // gone, and another process is writing the same key. The clock can answer when Redis
            // cannot — the lock cannot outlive its TTL measured from the last confirmed renewal.
            let finishWork!: () => void;
            const working = new Promise<void>(resolve => { finishWork = resolve; });
            const held = provider.WithKeyLock('slot', 'RunViewCache', async () => { await working; return 'wrote'; });

            await vi.advanceTimersByTimeAsync(0);   // the lock is acquired
            connectionDrops(provider);
            await vi.advanceTimersByTimeAsync(11_000); // past the 10 s TTL with no renewal landing
            finishWork();

            await expect(held).rejects.toBeInstanceOf(KeyLockLostError);
        });

        it('still trusts the lock when the read fails but it cannot have expired yet', async () => {
            // Same unreadable check, different facts: the connection dropped a moment ago, well
            // inside the TTL, so the lock IS still ours and refusing the write would be a
            // needless failure.
            let finishWork!: () => void;
            const working = new Promise<void>(resolve => { finishWork = resolve; });
            const held = provider.WithKeyLock('slot', 'RunViewCache', async () => { await working; return 'wrote'; });

            await vi.advanceTimersByTimeAsync(0);
            connectionDrops(provider);
            await vi.advanceTimersByTimeAsync(500);
            finishWork();

            await expect(held).resolves.toBe('wrote');
        });
    });

    describe('per-category expiry', () => {
        it('does not expire the default category, where keys vouch for other keys', async () => {
            const ttlProvider = new RedisLocalStorageProvider({ defaultTTLSeconds: 60, enableLogging: false });
            try {
                await ttlProvider.SetItem('___MJCore_Metadata_AllMetadata', 'payload', 'default');
                await ttlProvider.SetItem('___MJCore_Metadata_Timestamps', 'claim', 'default');
                await ttlProvider.SetItem('Users|f1', 'rows', 'RunViewCache');

                // -1 = stored without expiry. The proxy key must never outlive its payload, and the
                // cheapest way to guarantee that is for neither to expire on its own.
                expect(await ttlProvider.GetTTL('___MJCore_Metadata_AllMetadata', 'default')).toBe(-1);
                expect(await ttlProvider.GetTTL('___MJCore_Metadata_Timestamps', 'default')).toBe(-1);
                expect(await ttlProvider.GetTTL('Users|f1', 'RunViewCache')).toBe(60);
            } finally {
                await ttlProvider.Disconnect();
            }
        });

        it('keeps the default category unexpiring when a host configures some OTHER category', async () => {
            // The invariant belongs to the `default` category, not to the act of writing a config:
            // a host that only wants a dataset TTL must not silently reinstate the proxy-key bug.
            // The test above passes `default: 0` explicitly, so it cannot see a config that
            // REPLACES the built-in map instead of merging over it.
            const ttlProvider = new RedisLocalStorageProvider({
                defaultTTLSeconds: 60,
                categoryTTLSeconds: { DatasetCache: 30 },
                enableLogging: false,
            });
            try {
                await ttlProvider.SetItem('___MJCore_Metadata_Timestamps', 'claim', 'default');
                await ttlProvider.SetItem('ds', 'v', 'DatasetCache');

                expect(await ttlProvider.GetTTL('___MJCore_Metadata_Timestamps', 'default')).toBe(-1);
                expect(await ttlProvider.GetTTL('ds', 'DatasetCache')).toBe(30);
            } finally {
                await ttlProvider.Disconnect();
            }
        });

        it('lets a host override the default category deliberately', async () => {
            const ttlProvider = new RedisLocalStorageProvider({
                defaultTTLSeconds: 60,
                categoryTTLSeconds: { default: 15 },
                enableLogging: false,
            });
            try {
                await ttlProvider.SetItem('k', 'v', 'default');
                expect(await ttlProvider.GetTTL('k', 'default')).toBe(15);
            } finally {
                await ttlProvider.Disconnect();
            }
        });

        it('honours an explicit per-write TTL and a configured per-category override', async () => {
            const ttlProvider = new RedisLocalStorageProvider({
                defaultTTLSeconds: 60,
                categoryTTLSeconds: { default: 0, DatasetCache: 30 },
                enableLogging: false,
            });
            try {
                await ttlProvider.SetItem('ds', 'v', 'DatasetCache');
                await ttlProvider.SetItem('explicit', 'v', 'default', { TTLSeconds: 5 });

                expect(await ttlProvider.GetTTL('ds', 'DatasetCache')).toBe(30);
                expect(await ttlProvider.GetTTL('explicit', 'default')).toBe(5);
            } finally {
                await ttlProvider.Disconnect();
            }
        });
    });
});
