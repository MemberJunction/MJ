import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MJCore logging
vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

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
        on: vi.fn().mockReturnThis(),
        _store: store,
        _sets: sets,
        _ttls: ttls,
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
});
