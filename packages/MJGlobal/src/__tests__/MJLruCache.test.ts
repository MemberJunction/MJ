import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJLruCache } from '../MJLruCache';

describe('MJLruCache', () => {
    describe('basic Get/Set/Has/Delete', () => {
        it('returns undefined for missing keys', () => {
            const cache = new MJLruCache<string, number>();
            expect(cache.Get('missing')).toBeUndefined();
            expect(cache.Has('missing')).toBe(false);
        });

        it('stores and retrieves values', () => {
            const cache = new MJLruCache<string, number>();
            cache.Set('a', 1);
            expect(cache.Get('a')).toBe(1);
            expect(cache.Has('a')).toBe(true);
            expect(cache.Size).toBe(1);
        });

        it('overwrites existing values and fires onEvict for the old value', () => {
            const evicted: Array<{ key: string; value: number; reason: string }> = [];
            const cache = new MJLruCache<string, number>({
                onEvict: (key, value, reason) => evicted.push({ key, value, reason }),
            });
            cache.Set('a', 1);
            cache.Set('a', 2);
            expect(cache.Get('a')).toBe(2);
            expect(evicted).toEqual([{ key: 'a', value: 1, reason: 'delete' }]);
        });

        it('Delete removes the entry and fires onEvict', () => {
            const evicted: Array<[string, number, string]> = [];
            const cache = new MJLruCache<string, number>({
                onEvict: (k, v, r) => evicted.push([k, v, r]),
            });
            cache.Set('a', 1);
            expect(cache.Delete('a')).toBe(true);
            expect(cache.Delete('a')).toBe(false);
            expect(cache.Get('a')).toBeUndefined();
            expect(evicted).toEqual([['a', 1, 'delete']]);
        });

        it('Clear empties the map and fires onEvict for each entry', () => {
            const evicted: string[] = [];
            const cache = new MJLruCache<string, number>({
                onEvict: (k, _v, r) => evicted.push(`${k}:${r}`),
            });
            cache.Set('a', 1);
            cache.Set('b', 2);
            cache.Clear();
            expect(cache.Size).toBe(0);
            expect(evicted.sort()).toEqual(['a:clear', 'b:clear']);
        });
    });

    describe('LRU eviction', () => {
        it('evicts the least-recently-used entry when over capacity', () => {
            const evicted: Array<[string, string]> = [];
            const cache = new MJLruCache<string, number>({
                maxSize: 2,
                onEvict: (k, _v, r) => evicted.push([k, r]),
            });
            cache.Set('a', 1);
            cache.Set('b', 2);
            cache.Set('c', 3); // 'a' should be evicted
            expect(cache.Has('a')).toBe(false);
            expect(cache.Has('b')).toBe(true);
            expect(cache.Has('c')).toBe(true);
            expect(evicted).toEqual([['a', 'lru']]);
        });

        it('Get refreshes recency so a touched entry survives eviction', () => {
            const cache = new MJLruCache<string, number>({ maxSize: 2 });
            cache.Set('a', 1);
            cache.Set('b', 2);
            // touch 'a' to make 'b' the LRU
            cache.Get('a');
            cache.Set('c', 3);
            expect(cache.Has('a')).toBe(true);
            expect(cache.Has('b')).toBe(false);
            expect(cache.Has('c')).toBe(true);
        });

        it('Has does NOT refresh recency', () => {
            const cache = new MJLruCache<string, number>({ maxSize: 2 });
            cache.Set('a', 1);
            cache.Set('b', 2);
            cache.Has('a'); // should NOT refresh
            cache.Set('c', 3);
            expect(cache.Has('a')).toBe(false); // 'a' was still LRU
            expect(cache.Has('b')).toBe(true);
        });
    });

    describe('TTL expiry', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('expires entries after ttlMs and fires onEvict with reason ttl', () => {
            const evicted: Array<[string, string]> = [];
            const cache = new MJLruCache<string, number>({
                ttlMs: 1000,
                onEvict: (k, _v, r) => evicted.push([k, r]),
            });
            cache.Set('a', 1);
            expect(cache.Get('a')).toBe(1);
            vi.advanceTimersByTime(999);
            expect(cache.Get('a')).toBe(1);
            vi.advanceTimersByTime(2);
            expect(cache.Get('a')).toBeUndefined();
            expect(evicted).toEqual([['a', 'ttl']]);
        });

        it('Set refreshes the TTL window on overwrite', () => {
            const cache = new MJLruCache<string, number>({ ttlMs: 1000 });
            cache.Set('a', 1);
            vi.advanceTimersByTime(900);
            cache.Set('a', 2); // refresh
            vi.advanceTimersByTime(900);
            expect(cache.Get('a')).toBe(2);
        });

        it('Prune removes all expired entries eagerly', () => {
            const cache = new MJLruCache<string, number>({ ttlMs: 1000 });
            cache.Set('a', 1);
            cache.Set('b', 2);
            vi.advanceTimersByTime(1500);
            cache.Set('c', 3);
            const evictedCount = cache.Prune();
            expect(evictedCount).toBe(2);
            expect(cache.Size).toBe(1);
            expect(cache.Has('c')).toBe(true);
        });

        it('Prune is a no-op when TTL is disabled', () => {
            const cache = new MJLruCache<string, number>({});
            cache.Set('a', 1);
            expect(cache.Prune()).toBe(0);
            expect(cache.Size).toBe(1);
        });
    });

    describe('configuration', () => {
        it('throws on invalid maxSize', () => {
            expect(() => new MJLruCache({ maxSize: 0 })).toThrow();
            expect(() => new MJLruCache({ maxSize: -1 })).toThrow();
            expect(() => new MJLruCache({ maxSize: Number.NaN })).toThrow();
        });

        it('exposes MaxSize as configured', () => {
            const cache = new MJLruCache({ maxSize: 7 });
            expect(cache.MaxSize).toBe(7);
        });

        it('rounds fractional maxSize down', () => {
            const cache = new MJLruCache({ maxSize: 5.9 });
            expect(cache.MaxSize).toBe(5);
        });
    });
});
