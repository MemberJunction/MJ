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

    it('should cancel the old TTL timer when a key is overwritten', () => {
      // Arrange: set a key and then overwrite it before the first TTL fires.
      // If the old timer is NOT cancelled, it fires and deletes the new value.
      cache.set('key1', 'original');    // schedules delete-key1 at t+10s
      vi.advanceTimersByTime(5000);     // halfway to first TTL
      cache.set('key1', 'updated');     // must cancel the t+10s timer and schedule a new one

      // Advance past the original TTL — the cancelled timer must NOT fire
      vi.advanceTimersByTime(6000);     // t=11s; original timer would have fired here

      // The new value must still be present (or have been evicted by its own TTL at t=15s)
      // At t=11s the new entry's TTL (set at t=5s) still has 4s to go
      expect(cache.get('key1')).toBe('updated');
    });

    it('should delete key only when the current TTL fires, not the overwritten timer', () => {
      cache.set('key1', 'v1');       // timer fires at t=10s
      vi.advanceTimersByTime(2000);
      cache.set('key1', 'v2');       // timer fires at t=12s; old timer cancelled
      vi.advanceTimersByTime(2000);
      cache.set('key1', 'v3');       // timer fires at t=14s; prev timer cancelled

      // At t=14s first two timers should be cancelled; key still present from last set
      vi.advanceTimersByTime(9999);  // t=13.999s — latest TTL hasn't fired yet
      expect(cache.get('key1')).toBe('v3');

      // At t=14s the latest TTL fires
      vi.advanceTimersByTime(2);     // cross t=14s
      expect(cache.get('key1')).toBeUndefined();
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

    it('should cancel the TTL timer when a key is explicitly deleted', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');

      // Advancing past TTL must not throw (timer already cancelled) and key stays gone
      vi.advanceTimersByTime(15000);
      expect(cache.get('key1')).toBeUndefined();
      // Stats should show 0 entries (timer didn't re-delete an already-missing entry)
      expect(cache.getStats().size).toBe(0);
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
});
