import { UUIDMap, UUIDsEqual } from '@memberjunction/global';

/** Idle time after which a built bundle's bytes are dropped from memory: 2 hours. */
export const LOCAL_BUNDLE_IDLE_TTL_MS = 2 * 60 * 60_000;
/** Total archive bytes kept in memory across all built bundles: 256 MB. */
export const LOCAL_BUNDLE_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** How often idle bundles are dropped while any are held: 10 minutes. */
export const LOCAL_BUNDLE_PRUNE_INTERVAL_MS = 10 * 60_000;

interface CachedBundleEntry<T> {
  Item: T;
  SizeBytes: number;
  LastAccessMs: number;
}

/**
 * Holds built bundles in memory by bundle ID (case-insensitive). An entry not read or written for
 * `idleTtlMs` is dropped, on access and by an unref'd timer that runs every `pruneIntervalMs` while
 * the cache holds entries. When the total size passes `maxTotalBytes` the least recently used
 * entries are evicted. The entry just stored is never evicted by its own insert.
 */
export class LocalBundleCache<T> {
  private readonly entries = new UUIDMap<CachedBundleEntry<T>>();
  private totalBytes = 0;
  private pruneTimer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly idleTtlMs: number = LOCAL_BUNDLE_IDLE_TTL_MS,
    private readonly maxTotalBytes: number = LOCAL_BUNDLE_MAX_TOTAL_BYTES,
    private readonly pruneIntervalMs: number = LOCAL_BUNDLE_PRUNE_INTERVAL_MS
  ) {}

  /** Stores an item as the most recently used one, then evicts as needed. */
  public Set(bundleId: string, item: T, sizeBytes: number): void {
    this.Delete(bundleId);
    this.entries.Set(bundleId, { Item: item, SizeBytes: sizeBytes, LastAccessMs: Date.now() });
    this.totalBytes += sizeBytes;
    this.evict(bundleId);
    this.startPruneTimer();
  }

  /** Returns the item and marks it most recently used, or `undefined` when it is missing or expired. */
  public Get(bundleId: string): T | undefined {
    this.DropExpired();
    const entry = this.entries.Get(bundleId);
    if (!entry) return undefined;
    this.entries.Delete(bundleId);
    entry.LastAccessMs = Date.now();
    this.entries.Set(bundleId, entry);
    return entry.Item;
  }

  /** Removes an item. Returns true when it was held. */
  public Delete(bundleId: string): boolean {
    const entry = this.entries.Get(bundleId);
    if (!entry) return false;
    this.entries.Delete(bundleId);
    this.totalBytes -= entry.SizeBytes;
    if (this.entries.Size === 0) this.stopPruneTimer();
    return true;
  }

  /** Removes every item. */
  public Clear(): void {
    this.entries.Clear();
    this.totalBytes = 0;
    this.stopPruneTimer();
  }

  /** Number of items held. */
  public get Size(): number {
    return this.entries.Size;
  }

  /** Drops every entry not read or written for the idle time. Entries are kept least recently used first, so the scan stops at the first live one. */
  public DropExpired(): void {
    const cutoff = Date.now() - this.idleTtlMs;
    for (const [id, entry] of this.entries) {
      if (entry.LastAccessMs >= cutoff) return;
      this.Delete(id);
    }
  }

  /** Total size of the items held, in bytes. */
  public get TotalBytes(): number {
    return this.totalBytes;
  }

  private evict(keepId: string): void {
    this.DropExpired();
    for (const id of this.entries.Keys()) {
      if (this.totalBytes <= this.maxTotalBytes) return;
      if (!UUIDsEqual(id, keepId)) this.Delete(id);
    }
  }

  /** Starts the prune timer when it is not running. The timer does not keep the process alive. */
  private startPruneTimer(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => this.DropExpired(), this.pruneIntervalMs);
    this.pruneTimer.unref?.();
  }

  private stopPruneTimer(): void {
    if (!this.pruneTimer) return;
    clearInterval(this.pruneTimer);
    this.pruneTimer = undefined;
  }
}
