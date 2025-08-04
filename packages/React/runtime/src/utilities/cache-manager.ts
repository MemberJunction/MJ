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
export class CacheManager<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private memoryUsage = 0;
  private cleanupTimer?: number;
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
  set(key: string, value: T, ttl?: number): void {
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

    this.cache.set(key, entry);
    this.memoryUsage += size;

    // Schedule removal if TTL is set
    if (ttl || this.options.defaultTTL) {
      const timeout = ttl || this.options.defaultTTL;
      setTimeout(() => this.delete(key), timeout);
    }
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (this.isExpired(entry)) {
      this.delete(key);
      return undefined;
    }

    // Update timestamp for LRU
    entry.timestamp = Date.now();
    return entry.value;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.memoryUsage -= entry.size || 0;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.memoryUsage = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
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

  /**
   * Manually trigger cleanup
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry, now)) {
        this.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Destroy the cache and stop cleanup timer
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
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
      this.delete(lruKey);
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
      this.delete(key);
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
    this.cleanupTimer = window.setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * Stop the cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      window.clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}