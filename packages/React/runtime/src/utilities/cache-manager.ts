/**
 * @fileoverview Cache management with TTL and size limits
 * @module @memberjunction/react-runtime/utilities
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  size?: number;
}

export interface CacheOptions {
  maxSize?: number;          // Maximum number of entries
  maxMemory?: number;        // Maximum memory in bytes (estimated)
  defaultTTL?: number;       // Default TTL in milliseconds
  cleanupInterval?: number;  // Cleanup interval in milliseconds
}

/**
 * Cache manager with TTL and size limits.
 * Provides automatic cleanup and memory management.
 */
export class CacheManager<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private memoryUsage = 0;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private readonly options: Required<CacheOptions>;

  constructor(options: CacheOptions = {}) {
    this.options = {
      maxSize: options.maxSize || 1000,
      maxMemory: options.maxMemory || 50 * 1024 * 1024, // 50MB default
      defaultTTL: options.defaultTTL || 5 * 60 * 1000,   // 5 minutes default
      cleanupInterval: options.cleanupInterval || 60 * 1000 // 1 minute default
    };

    if (this.options.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * Set a value in the cache
   */
  Set(key: string, value: T, ttl?: number): void {
    const size = this.estimateSize(value);
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      size
    };

    // Check if we need to evict entries
    if (this.cache.size >= this.options.maxSize) {
      this.evictLRU();
    }

    // Check memory usage
    if (this.memoryUsage + size > this.options.maxMemory) {
      this.evictByMemory(size);
    }

    // Remove old entry if exists
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      this.memoryUsage -= oldEntry.size || 0;
    }

    // Cancel any existing TTL timer for this key so overwriting an entry doesn't
    // leave a dangling timer that deletes the new value when it fires.
    const oldTimer = this.timers.get(key);
    if (oldTimer !== undefined) {
      clearTimeout(oldTimer);
      this.timers.delete(key);
    }

    this.cache.set(key, entry);
    this.memoryUsage += size;

    // Schedule removal if TTL is set
    if (ttl || this.options.defaultTTL) {
      const timeout = ttl || this.options.defaultTTL;
      const timerId = setTimeout(() => {
        this.timers.delete(key);
        this.Delete(key);
      }, timeout);
      this.timers.set(key, timerId);
    }
  }

  /** @deprecated Use {@link Set}. */
  set(key: string, value: T, ttl?: number): void {
    return this.Set(key, value, ttl);
  }

  /**
   * Get a value from the cache
   */
  Get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (this.isExpired(entry)) {
      this.Delete(key);
      return undefined;
    }

    // Update timestamp for LRU
    entry.timestamp = Date.now();
    return entry.value;
  }

  /** @deprecated Use {@link Get}. */
  get(key: string): T | undefined {
    return this.Get(key);
  }

  /**
   * Check if a key exists and is not expired
   */
  Has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.Delete(key);
      return false;
    }

    return true;
  }

  /** @deprecated Use {@link Has}. */
  has(key: string): boolean {
    return this.Has(key);
  }

  /**
   * Delete a key from the cache
   */
  Delete(key: string): boolean {
    const timer = this.timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    const entry = this.cache.get(key);
    if (entry) {
      this.memoryUsage -= entry.size || 0;
      return this.cache.delete(key);
    }
    return false;
  }

  /** @deprecated Use {@link Delete}. */
  delete(key: string): boolean {
    return this.Delete(key);
  }

  /**
   * Clear all entries
   */
  Clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
    this.memoryUsage = 0;
  }

  /** @deprecated Use {@link Clear}. */
  clear(): void {
    return this.Clear();
  }

  /**
   * Get cache statistics
   */
  GetStats(): {
    size: number;
    memoryUsage: number;
    maxSize: number;
    maxMemory: number;
  } {
    return {
      size: this.cache.size,
      memoryUsage: this.memoryUsage,
      maxSize: this.options.maxSize,
      maxMemory: this.options.maxMemory
    };
  }

  /** @deprecated Use {@link GetStats}. */
  getStats(): {
    size: number;
    memoryUsage: number;
    maxSize: number;
    maxMemory: number;
  } {
    return this.GetStats();
  }

  /**
   * Manually trigger cleanup
   */
  Cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry, now)) {
        this.Delete(key);
        removed++;
      }
    }

    return removed;
  }

  /** @deprecated Use {@link Cleanup}. */
  cleanup(): number {
    return this.Cleanup();
  }

  /**
   * Destroy the cache, cancel all entry timers, and stop the cleanup timer.
   */
  Destroy(): void {
    this.stopCleanupTimer();
    this.Clear();
  }

  /** @deprecated Use {@link Destroy}. */
  destroy(): void {
    return this.Destroy();
  }

  /**
   * Check if an entry is expired
   */
  private isExpired(entry: CacheEntry<T>, now?: number): boolean {
    if (!this.options.defaultTTL) return false;
    const currentTime = now || Date.now();
    return currentTime - entry.timestamp > this.options.defaultTTL;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | undefined;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < lruTime) {
        lruTime = entry.timestamp;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.Delete(lruKey);
    }
  }

  /**
   * Evict entries to make room for new memory
   */
  private evictByMemory(requiredSize: number): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    let freedMemory = 0;
    for (const [key, entry] of entries) {
      if (freedMemory >= requiredSize) break;
      freedMemory += entry.size || 0;
      this.Delete(key);
    }
  }

  /**
   * Estimate size of a value
   */
  private estimateSize(value: T): number {
    if (typeof value === 'string') {
      return value.length * 2; // 2 bytes per character
    } else if (typeof value === 'object' && value !== null) {
      // Rough estimation for objects
      try {
        return JSON.stringify(value).length * 2;
      } catch {
        return 1024; // Default 1KB for objects that can't be stringified
      }
    } else {
      return 8; // Default for primitives
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.Cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * Stop the cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}