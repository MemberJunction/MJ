import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryCache } from '../generic/QueryCache';
import { QueryCacheConfig } from '../generic/QueryCacheConfig';

// Mock the logging module to prevent console output
vi.mock('../generic/logging', () => ({
    LogStatus: vi.fn(),
    LogError: vi.fn()
}));

describe('QueryCache', () => {
    let cache: QueryCache;
    const enabledConfig: QueryCacheConfig = {
        enabled: true,
        ttlMinutes: 60
    };
    const disabledConfig: QueryCacheConfig = {
        enabled: false,
        ttlMinutes: 60
    };

    beforeEach(() => {
        cache = new QueryCache();
    });

    describe('set and get', () => {
        it('should cache and retrieve results', () => {
            const results = [{ id: 1, name: 'Test' }];
            cache.set('query1', { filter: 'active' }, results, enabledConfig);

            const entry = cache.get('query1', { filter: 'active' }, enabledConfig);

            expect(entry).not.toBeNull();
            expect(entry!.results).toEqual(results);
            expect(entry!.queryId).toBe('query1');
        });

        it('should return null for cache miss', () => {
            const entry = cache.get('nonexistent', {}, enabledConfig);

            expect(entry).toBeNull();
        });

        it('should not cache when disabled', () => {
            cache.set('query1', {}, [{ id: 1 }], disabledConfig);

            const entry = cache.get('query1', {}, disabledConfig);

            expect(entry).toBeNull();
        });

        it('should generate deterministic keys regardless of parameter order', () => {
            const results = [{ id: 1 }];
            cache.set('query1', { b: 2, a: 1 }, results, enabledConfig);

            // Parameters in different order should match
            const entry = cache.get('query1', { a: 1, b: 2 }, enabledConfig);

            expect(entry).not.toBeNull();
            expect(entry!.results).toEqual(results);
        });

        it('should differentiate by parameters', () => {
            cache.set('query1', { filter: 'active' }, [{ status: 'active' }], enabledConfig);
            cache.set('query1', { filter: 'inactive' }, [{ status: 'inactive' }], enabledConfig);

            const active = cache.get('query1', { filter: 'active' }, enabledConfig);
            const inactive = cache.get('query1', { filter: 'inactive' }, enabledConfig);

            expect(active!.results[0].status).toBe('active');
            expect(inactive!.results[0].status).toBe('inactive');
        });

        it('should increment hitCount on each get', () => {
            cache.set('query1', {}, [{ id: 1 }], enabledConfig);

            cache.get('query1', {}, enabledConfig);
            cache.get('query1', {}, enabledConfig);
            const entry = cache.get('query1', {}, enabledConfig);

            expect(entry!.hitCount).toBe(3);
        });
    });

    describe('TTL expiration', () => {
        it('should return null for expired entries', () => {
            const shortTtlConfig: QueryCacheConfig = {
                enabled: true,
                ttlMinutes: 0 // 0 minutes = expires immediately
            };

            cache.set('query1', {}, [{ id: 1 }], shortTtlConfig);

            // Manually expire by setting timestamp in the past
            // Access via any means since the entry uses Date.now() internally
            // We use a small delay approach
            vi.useFakeTimers();
            const now = Date.now();
            cache.set('query1', {}, [{ id: 1 }], {
                enabled: true,
                ttlMinutes: 1 // 1 minute
            });

            // Advance time by 2 minutes
            vi.advanceTimersByTime(2 * 60 * 1000);

            const entry = cache.get('query1', {}, enabledConfig);
            expect(entry).toBeNull();

            vi.useRealTimers();
        });

        it('should return valid entries within TTL', () => {
            vi.useFakeTimers();

            cache.set('query1', {}, [{ id: 1 }], {
                enabled: true,
                ttlMinutes: 60 // 60 minutes
            });

            // Advance time by 30 minutes (still within TTL)
            vi.advanceTimersByTime(30 * 60 * 1000);

            const entry = cache.get('query1', {}, enabledConfig);
            expect(entry).not.toBeNull();

            vi.useRealTimers();
        });
    });

    describe('LRU eviction', () => {
        it('should evict least recently used when at capacity', () => {
            const smallConfig: QueryCacheConfig = {
                enabled: true,
                ttlMinutes: 60,
                maxCacheSize: 2
            };

            cache.set('q1', {}, [1], smallConfig);
            cache.set('q2', {}, [2], smallConfig);

            // Access q1 to make it more recently used
            cache.get('q1', {}, smallConfig);

            // Add q3 - should evict q2 (LRU)
            cache.set('q3', {}, [3], smallConfig);

            expect(cache.get('q1', {}, smallConfig)).not.toBeNull();
            expect(cache.get('q2', {}, smallConfig)).toBeNull();
            expect(cache.get('q3', {}, smallConfig)).not.toBeNull();
        });
    });

    describe('clear', () => {
        it('should clear all entries when no queryId provided', () => {
            cache.set('q1', {}, [1], enabledConfig);
            cache.set('q2', {}, [2], enabledConfig);

            cache.clear();

            expect(cache.get('q1', {}, enabledConfig)).toBeNull();
            expect(cache.get('q2', {}, enabledConfig)).toBeNull();
        });

        it('should clear only entries for specific queryId', () => {
            cache.set('q1', { p: 'a' }, [1], enabledConfig);
            cache.set('q1', { p: 'b' }, [2], enabledConfig);
            cache.set('q2', {}, [3], enabledConfig);

            cache.clear('q1');

            expect(cache.get('q1', { p: 'a' }, enabledConfig)).toBeNull();
            expect(cache.get('q1', { p: 'b' }, enabledConfig)).toBeNull();
            expect(cache.get('q2', {}, enabledConfig)).not.toBeNull();
        });
    });

    describe('getStats', () => {
        it('should track hits and misses', () => {
            cache.set('q1', {}, [1], enabledConfig);
            cache.get('q1', {}, enabledConfig); // hit
            cache.get('q1', {}, enabledConfig); // hit
            cache.get('q_miss', {}, enabledConfig); // miss

            const stats = cache.getStats();

            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBeCloseTo(0.67, 1);
        });

        it('should report size', () => {
            cache.set('q1', {}, [1], enabledConfig);
            cache.set('q2', {}, [2], enabledConfig);

            expect(cache.getStats().size).toBe(2);
        });

        it('should return 0 hit rate for empty cache', () => {
            const stats = cache.getStats();

            expect(stats.hitRate).toBe(0);
            expect(stats.size).toBe(0);
        });
    });

    describe('cleanupExpired', () => {
        it('should remove expired entries', () => {
            vi.useFakeTimers();

            cache.set('q1', {}, [1], { enabled: true, ttlMinutes: 1 });
            cache.set('q2', {}, [2], { enabled: true, ttlMinutes: 120 });

            // Advance time past q1's TTL but not q2's
            vi.advanceTimersByTime(5 * 60 * 1000);

            const cleaned = cache.cleanupExpired();

            expect(cleaned).toBe(1);
            expect(cache.get('q1', {}, enabledConfig)).toBeNull();
            expect(cache.get('q2', {}, enabledConfig)).not.toBeNull();

            vi.useRealTimers();
        });

        it('should return 0 when no entries are expired', () => {
            cache.set('q1', {}, [1], enabledConfig);

            const cleaned = cache.cleanupExpired();

            expect(cleaned).toBe(0);
        });
    });
});
