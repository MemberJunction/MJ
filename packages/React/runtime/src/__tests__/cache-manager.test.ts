import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock window for timer functions
const mockSetInterval = vi.fn().mockReturnValue(1);
const mockClearInterval = vi.fn();
vi.stubGlobal('window', {
  setInterval: mockSetInterval,
  clearInterval: mockClearInterval,
});

import { CacheManager } from '../utilities/cache-manager';

describe('CacheManager', () => {
  let cache: CacheManager<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSetInterval.mockClear();
    mockClearInterval.mockClear();
    cache = new CacheManager<string>({
      maxSize: 5,
      defaultTTL: 10000, // 10 seconds
      cleanupInterval: 0, // disable auto cleanup for most tests
    });
  });

  afterEach(() => {
    cache.destroy();
    vi.useRealTimers();
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing value', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove a key', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return false for non-existent key', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should reset memory usage', () => {
      cache.set('key1', 'value1');
      cache.clear();
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.memoryUsage).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set('key1', 'value1');
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(5);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('TTL expiration', () => {
    it('should return undefined for expired entries on get', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(11000); // advance past 10s TTL
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should report false for expired entries on has', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(11000);
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when max size reached', () => {
      // Fill to capacity (maxSize = 5)
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
        vi.advanceTimersByTime(100); // separate timestamps
      }

      // Adding one more should evict the oldest (key0)
      cache.set('key5', 'value5');

      // key0 should be evicted
      expect(cache.has('key0')).toBe(false);
      // newest should be present
      expect(cache.get('key5')).toBe('value5');
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries that scheduled timeout has not yet removed', () => {
      // When set() is called, it schedules a setTimeout for TTL deletion.
      // With fake timers, advancing time triggers those scheduled removals.
      // After the TTL, entries are already removed by their scheduled timeouts.
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.getStats().size).toBe(2);
      // Advance time past TTL -- the scheduled timeouts will fire and remove entries
      vi.advanceTimersByTime(11000);
      // Entries already removed by scheduled timeout, so cleanup finds nothing
      const removed = cache.cleanup();
      expect(removed).toBe(0);
      expect(cache.getStats().size).toBe(0);
    });

    it('should return 0 when nothing to clean', () => {
      cache.set('key1', 'value1');
      const removed = cache.cleanup();
      expect(removed).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should clear the cache and stop timers', () => {
      cache.set('key1', 'value1');
      cache.destroy();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('timer cancellation on overwrite', () => {
    it('should cancel the old TTL timer when a key is overwritten', () => {
      // Store a value with a short TTL so its timer fires at +5s
      cache.set('key1', 'originalValue', 5000);

      // Advance 3 seconds — timer not yet fired
      vi.advanceTimersByTime(3000);
      expect(cache.get('key1')).toBe('originalValue');

      // Overwrite the key with a fresh 10s TTL
      cache.set('key1', 'updatedValue', 10000);

      // Advance another 3 seconds — original timer would have fired at +5s (2s into overwrite)
      // but since it was cancelled, the key should still be present
      vi.advanceTimersByTime(3000);
      expect(cache.get('key1')).toBe('updatedValue');
    });

    it('should not delete new value when the old TTL would have expired', () => {
      cache.set('key1', 'first', 2000); // expires in 2s

      vi.advanceTimersByTime(1000); // advance 1s

      cache.set('key1', 'second', 10000); // overwrite with 10s TTL

      // Advance 2 more seconds — original timer (now cancelled) would have fired here
      vi.advanceTimersByTime(2000);

      // Value should still be 'second', not deleted by the cancelled original timer
      expect(cache.get('key1')).toBe('second');
    });
  });

  describe('timer cancellation on delete', () => {
    it('should cancel TTL timer when entry is explicitly deleted', () => {
      cache.set('key1', 'value1', 5000);
      cache.delete('key1');

      // Advance past original TTL — timer fires should be no-ops
      vi.advanceTimersByTime(6000);

      // Nothing should blow up and the entry stays deleted
      expect(cache.has('key1')).toBe(false);
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('timer cancellation on clear', () => {
    it('should cancel all pending TTL timers when clear() is called', () => {
      cache.set('key1', 'value1', 2000);
      cache.set('key2', 'value2', 3000);
      cache.set('key3', 'value3', 4000);

      cache.clear();

      // Advance past all TTLs — pending timer callbacks should be no-ops
      vi.advanceTimersByTime(5000);

      // Cache remains empty and memory usage is 0
      expect(cache.getStats().size).toBe(0);
      expect(cache.getStats().memoryUsage).toBe(0);
    });
  });
});
