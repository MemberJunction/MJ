/** Idle time after which a built bundle's bytes are dropped from memory: 2 hours. */
export const LOCAL_BUNDLE_IDLE_TTL_MS = 2 * 60 * 60_000;
/** Total archive bytes kept in memory across all built bundles: 256 MB. */
export const LOCAL_BUNDLE_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

interface CachedBundleEntry<T> {
  Item: T;
  SizeBytes: number;
  LastAccessMs: number;
}

/**
 * Holds built bundles in memory by bundle ID. An entry not read or written for `idleTtlMs` is
 * dropped, and when the total size passes `maxTotalBytes` the least recently used entries are
 * evicted. The entry just stored is never evicted by its own insert.
 */
export class LocalBundleCache<T> {
  private readonly entries = new Map<string, CachedBundleEntry<T>>();
  private totalBytes = 0;

  public constructor(
    private readonly idleTtlMs: number = LOCAL_BUNDLE_IDLE_TTL_MS,
    private readonly maxTotalBytes: number = LOCAL_BUNDLE_MAX_TOTAL_BYTES
  ) {}

  /** Stores an item as the most recently used one, then evicts as needed. */
  public Set(bundleId: string, item: T, sizeBytes: number): void {
    this.Delete(bundleId);
    this.entries.set(bundleId, { Item: item, SizeBytes: sizeBytes, LastAccessMs: Date.now() });
    this.totalBytes += sizeBytes;
    this.evict(bundleId);
  }

  /** Returns the item and marks it most recently used, or `undefined` when it is missing or expired. */
  public Get(bundleId: string): T | undefined {
    this.dropExpired();
    const entry = this.entries.get(bundleId);
    if (!entry) return undefined;
    this.entries.delete(bundleId);
    entry.LastAccessMs = Date.now();
    this.entries.set(bundleId, entry);
    return entry.Item;
  }

  /** Removes an item. Returns true when it was held. */
  public Delete(bundleId: string): boolean {
    const entry = this.entries.get(bundleId);
    if (!entry) return false;
    this.entries.delete(bundleId);
    this.totalBytes -= entry.SizeBytes;
    return true;
  }

  /** Number of items held. */
  public get Size(): number {
    return this.entries.size;
  }

  /** Total size of the items held, in bytes. */
  public get TotalBytes(): number {
    return this.totalBytes;
  }

  private evict(keepId: string): void {
    this.dropExpired();
    for (const id of this.entries.keys()) {
      if (this.totalBytes <= this.maxTotalBytes) return;
      if (id !== keepId) this.Delete(id);
    }
  }

  /** Map order is least recently used first, so expired entries are at the front. */
  private dropExpired(): void {
    const cutoff = Date.now() - this.idleTtlMs;
    for (const [id, entry] of this.entries) {
      if (entry.LastAccessMs >= cutoff) return;
      this.Delete(id);
    }
  }
}
