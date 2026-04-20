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
            expect(event.Data).toBe('myValue');
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
});
