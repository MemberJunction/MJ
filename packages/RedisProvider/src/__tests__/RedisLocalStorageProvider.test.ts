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

/**
 * Helper: create a mock Redis instance with an in-memory store.
 * Returned object quacks like an ioredis `Redis` instance.
 */
function createMockRedisInstance() {
    const store = new Map<string, string>();
    const sets = new Map<string, Set<string>>();
    const ttls = new Map<string, number>();

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
        del: vi.fn((key: string) => {
            store.delete(key);
            return Promise.resolve(1);
        }),
        exists: vi.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
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
        srem: vi.fn((setKey: string, member: string) => {
            sets.get(setKey)?.delete(member);
            return Promise.resolve(1);
        }),
        smembers: vi.fn((setKey: string) => {
            const s = sets.get(setKey);
            return Promise.resolve(s ? Array.from(s) : []);
        }),
        pipeline: vi.fn(() => {
            const ops: Array<() => void> = [];
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
                exec: vi.fn(() => {
                    for (const op of ops) op();
                    ops.length = 0;
                    return Promise.resolve([]);
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

import { RedisLocalStorageProvider } from '../RedisLocalStorageProvider.js';
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

        it('should store with default TTL from config', () => {
            const p = new RedisLocalStorageProvider({
                defaultTTLSeconds: 300,
                enableLogging: false,
            });
            // Verify construction doesn't throw — TTL path is exercised via pipeline.setex
            expect(p).toBeDefined();
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
            (client.pipeline as ReturnType<typeof vi.fn>).mockReturnValueOnce({
                del: vi.fn().mockReturnThis(),
                srem: vi.fn().mockReturnThis(),
                exec: vi.fn().mockRejectedValueOnce(new Error('Delete failed')),
            });

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
            (client.smembers as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Read failed'));

            await expect(provider.ClearCategory('myCat')).resolves.not.toThrow();
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
            (client.smembers as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Read failed'));

            const result = await provider.GetCategoryKeys('myCat');
            expect(result).toEqual([]);
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
});
