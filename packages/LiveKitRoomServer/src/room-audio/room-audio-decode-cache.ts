/**
 * @fileoverview {@link RoomAudioDecodeCache} — a small LRU of ready-to-play PCM keyed by source (an `MJ: Files` id or
 * a URL), so every caller placed on hold in the same queue does not re-download and re-decode the same file.
 *
 * It caches the in-flight PROMISE, so ten callers arriving at once share one download. A failed load is evicted so
 * the next caller retries. Bounded both by entry count and by total samples held.
 *
 * @module @memberjunction/livekit-room-server
 */

/** Default maximum number of cached sources. */
export const DEFAULT_DECODE_CACHE_ENTRIES = 8;

/** Default maximum total samples held across all entries (128 Mi samples = 256 MB of PCM16). */
export const DEFAULT_DECODE_CACHE_MAX_SAMPLES = 128 * 1024 * 1024;

/** One cache slot: the load in progress (or done), and its size once known. */
interface CacheSlot {
  Load: Promise<Int16Array>;
  Samples: number;
}

/** A bounded, promise-sharing LRU of decoded PCM. */
export class RoomAudioDecodeCache {
  private readonly slots = new Map<string, CacheSlot>();

  /**
   * @param maxEntries Maximum number of cached sources.
   * @param maxSamples Maximum total samples held across all resolved entries.
   */
  constructor(
    private readonly maxEntries: number = DEFAULT_DECODE_CACHE_ENTRIES,
    private readonly maxSamples: number = DEFAULT_DECODE_CACHE_MAX_SAMPLES,
  ) {}

  /** How many sources are cached (or loading). */
  public get Size(): number {
    return this.slots.size;
  }

  /**
   * Returns the cached PCM for `key`, or runs `load` once and caches its result. Concurrent callers for the same key
   * share one load. A rejected load is removed so the next call retries.
   */
  public GetOrLoad(key: string, load: () => Promise<Int16Array>): Promise<Int16Array> {
    const existing = this.slots.get(key);
    if (existing) {
      this.slots.delete(key); // re-insert: Map order is the recency order
      this.slots.set(key, existing);
      return existing.Load;
    }
    const slot: CacheSlot = { Load: load(), Samples: 0 };
    this.slots.set(key, slot);
    this.evictOverflow();
    slot.Load.then(
      (pcm) => {
        slot.Samples = pcm.length;
        this.evictOverflow();
      },
      () => {
        if (this.slots.get(key) === slot) {
          this.slots.delete(key); // the caller sees the rejection; the cache just forgets it
        }
      },
    );
    return slot.Load;
  }

  /** Empties the cache. */
  public Clear(): void {
    this.slots.clear();
  }

  /** Drops least-recently-used entries until both bounds hold (never the most recent one). */
  private evictOverflow(): void {
    while (this.slots.size > 1 && (this.slots.size > this.maxEntries || this.totalSamples() > this.maxSamples)) {
      const oldest = this.slots.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.slots.delete(oldest);
    }
  }

  private totalSamples(): number {
    let total = 0;
    for (const slot of this.slots.values()) {
      total += slot.Samples;
    }
    return total;
  }
}
