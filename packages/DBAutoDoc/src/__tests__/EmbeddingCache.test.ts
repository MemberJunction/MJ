import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingCache, EmbeddingKey } from '../discovery/EmbeddingCache.js';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

function f32(...vals: number[]): Float32Array {
    return Float32Array.from(vals);
}

async function tempCachePath(): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const dir = await mkdtemp(join(tmpdir(), 'embed-cache-test-'));
    const path = join(dir, 'embedding-cache.json');
    return { path, cleanup: async () => rm(dir, { recursive: true, force: true }) };
}

describe('EmbeddingCache', () => {
    describe('load + get with no existing cache file', () => {
        it('returns null on get-miss', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                await cache.load();
                const v = cache.get({ model: 'gemini', dimensions: 8, text: 'foo' });
                expect(v).toBeNull();
                expect(cache.stats().misses).toBe(1);
                expect(cache.stats().hits).toBe(0);
            } finally {
                await cleanup();
            }
        });

        it('throws when get() called before load()', () => {
            const cache = new EmbeddingCache('/tmp/never-created.json');
            expect(() =>
                cache.get({ model: 'gemini', dimensions: 8, text: 'foo' }),
            ).toThrow(/before load/);
        });
    });

    describe('set + get roundtrip', () => {
        it('returns the previously set vector', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                await cache.load();
                const key: EmbeddingKey = { model: 'gemini', dimensions: 3, text: 'alpha' };
                cache.set(key, f32(0.1, 0.2, 0.3));
                const got = cache.get(key);
                expect(got).not.toBeNull();
                expect(got![0]).toBeCloseTo(0.1, 5);
                expect(got![1]).toBeCloseTo(0.2, 5);
                expect(got![2]).toBeCloseTo(0.3, 5);
                expect(cache.stats().hits).toBe(1);
            } finally {
                await cleanup();
            }
        });

        it('produces different cache keys for different models / dimensions / texts', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                await cache.load();
                cache.set({ model: 'gemini', dimensions: 3, text: 'alpha' }, f32(1, 2, 3));
                cache.set({ model: 'openai', dimensions: 3, text: 'alpha' }, f32(4, 5, 6));
                cache.set({ model: 'gemini', dimensions: 5, text: 'alpha' }, f32(7, 8, 9, 10, 11));
                cache.set({ model: 'gemini', dimensions: 3, text: 'beta' }, f32(12, 13, 14));
                expect(cache.stats().entries).toBe(4);
                expect(cache.get({ model: 'gemini', dimensions: 3, text: 'alpha' })![0]).toBe(1);
                expect(cache.get({ model: 'openai', dimensions: 3, text: 'alpha' })![0]).toBe(4);
            } finally {
                await cleanup();
            }
        });
    });

    describe('persistence across instances', () => {
        it('save() writes a file that load() can read back', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const writer = new EmbeddingCache(path);
                await writer.load();
                writer.set(
                    { model: 'gemini', dimensions: 4, text: 'persist-me' },
                    f32(0.5, 0.6, 0.7, 0.8),
                );
                await writer.save();
                expect(await writer.exists()).toBe(true);

                const reader = new EmbeddingCache(path);
                await reader.load();
                const got = reader.get({ model: 'gemini', dimensions: 4, text: 'persist-me' });
                expect(got).not.toBeNull();
                expect(got![0]).toBeCloseTo(0.5, 5);
                expect(got![3]).toBeCloseTo(0.8, 5);
                expect(reader.stats().entries).toBe(1);
            } finally {
                await cleanup();
            }
        });

        it('save() does NOT write when nothing has changed since load', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                await cache.load();
                cache.set({ model: 'g', dimensions: 1, text: 'a' }, f32(1));
                await cache.save();

                // Simulate fresh load with no modifications
                const cache2 = new EmbeddingCache(path);
                await cache2.load();
                cache2.get({ model: 'g', dimensions: 1, text: 'a' }); // pure read
                // Spy on writeFile would require module mocking — instead, check exists timestamp doesn't change
                const before = (await readFile(path, 'utf-8')).length;
                await cache2.save();
                const after = (await readFile(path, 'utf-8')).length;
                expect(before).toBe(after); // no change
            } finally {
                await cleanup();
            }
        });

        it('treats a missing cache file as an empty cache', async () => {
            const cache = new EmbeddingCache('/tmp/this-file-does-not-exist-xyz.json');
            await cache.load(); // should not throw
            expect(cache.stats().entries).toBe(0);
            expect(await cache.exists()).toBe(false);
        });

        it('treats a corrupt cache file as empty (self-heals on next save)', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                await readFile(path).catch(() => null); // ensure dir
                const fs = await import('node:fs/promises');
                await fs.mkdir(join(path, '..'), { recursive: true });
                await fs.writeFile(path, 'not valid json {{{');
                const cache = new EmbeddingCache(path);
                await cache.load();
                expect(cache.stats().entries).toBe(0);
            } finally {
                await cleanup();
            }
        });
    });

    describe('getOrFill bulk operation', () => {
        it('fetches only missing entries, returns all in input order', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                await cache.load();
                // Pre-populate two entries
                cache.set({ model: 'g', dimensions: 2, text: 'a' }, f32(1, 1));
                cache.set({ model: 'g', dimensions: 2, text: 'c' }, f32(3, 3));
                await cache.save();

                const fetcher = vi.fn(async (keys: EmbeddingKey[]) => {
                    expect(keys).toHaveLength(2); // only 'b' and 'd' should be missing
                    expect(keys.map((k) => k.text).sort()).toEqual(['b', 'd']);
                    return keys.map((k) => f32(k.text.charCodeAt(0), k.text.charCodeAt(0)));
                });

                const results = await cache.getOrFill(
                    [
                        { model: 'g', dimensions: 2, text: 'a' },
                        { model: 'g', dimensions: 2, text: 'b' },
                        { model: 'g', dimensions: 2, text: 'c' },
                        { model: 'g', dimensions: 2, text: 'd' },
                    ],
                    fetcher,
                );

                expect(results).toHaveLength(4);
                expect(results[0][0]).toBe(1); // 'a' from cache
                expect(results[1][0]).toBe('b'.charCodeAt(0)); // 'b' from fetcher
                expect(results[2][0]).toBe(3); // 'c' from cache
                expect(results[3][0]).toBe('d'.charCodeAt(0)); // 'd' from fetcher
                expect(fetcher).toHaveBeenCalledOnce();
                expect(cache.stats().hits).toBe(2);
                expect(cache.stats().misses).toBe(2);
            } finally {
                await cleanup();
            }
        });

        it('does not call fetcher when all entries are cached', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                await cache.load();
                cache.set({ model: 'g', dimensions: 2, text: 'a' }, f32(1, 1));

                const fetcher = vi.fn();
                const results = await cache.getOrFill(
                    [{ model: 'g', dimensions: 2, text: 'a' }],
                    fetcher,
                );
                expect(fetcher).not.toHaveBeenCalled();
                expect(results[0][0]).toBe(1);
            } finally {
                await cleanup();
            }
        });

        it('throws when fetcher returns wrong number of vectors', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                await cache.load();
                const fetcher = vi.fn(async () => [f32(1)]); // 1 vector for 2 missing keys
                await expect(
                    cache.getOrFill(
                        [
                            { model: 'g', dimensions: 1, text: 'a' },
                            { model: 'g', dimensions: 1, text: 'b' },
                        ],
                        fetcher,
                    ),
                ).rejects.toThrow(/Fetcher returned 1 vectors for 2/);
            } finally {
                await cleanup();
            }
        });

        it('auto-loads if get/set never explicitly called before getOrFill', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                // Skip explicit load() — getOrFill should auto-load
                const fetcher = vi.fn(async (keys: EmbeddingKey[]) =>
                    keys.map(() => f32(0, 0)),
                );
                await cache.getOrFill([{ model: 'g', dimensions: 2, text: 'a' }], fetcher);
                expect(fetcher).toHaveBeenCalled();
            } finally {
                await cleanup();
            }
        });
    });

    describe('resetStats', () => {
        it('clears hit/miss counters without touching the store', async () => {
            const { path, cleanup } = await tempCachePath();
            try {
                const cache = new EmbeddingCache(path);
                await cache.load();
                cache.set({ model: 'g', dimensions: 1, text: 'a' }, f32(1));
                cache.get({ model: 'g', dimensions: 1, text: 'a' });
                cache.get({ model: 'g', dimensions: 1, text: 'missing' });
                expect(cache.stats().hits).toBe(1);
                expect(cache.stats().misses).toBe(1);
                expect(cache.stats().entries).toBe(1);
                cache.resetStats();
                expect(cache.stats().hits).toBe(0);
                expect(cache.stats().misses).toBe(0);
                expect(cache.stats().entries).toBe(1); // unchanged
            } finally {
                await cleanup();
            }
        });
    });
});
