/**
 * Options for `MJLruCache`. All fields are optional — defaults give a 1000-entry,
 * no-TTL cache.
 */
export interface MJLruCacheOptions<K, V> {
    /** Maximum number of entries before LRU eviction kicks in. Default 1000. */
    maxSize?: number;
    /**
     * Time-to-live in milliseconds. When set, entries older than this are treated
     * as missing on `Get()` and evicted lazily. Use 0 or undefined to disable TTL.
     */
    ttlMs?: number;
    /**
     * Optional callback fired when an entry is evicted (LRU overflow, TTL expiry,
     * or explicit `Delete`/`Clear`). Useful for releasing handles owned by `V`
     * (e.g., calling `.destroy()` on an SDK client).
     */
    onEvict?: (key: K, value: V, reason: 'lru' | 'ttl' | 'delete' | 'clear') => void;
}

interface Entry<V> {
    value: V;
    expiresAt: number; // Infinity when TTL disabled
}

/**
 * Bounded LRU cache with optional TTL — designed to replace the unbounded `Map`
 * fields that proliferate across MJ singletons (per-credential SDK client caches,
 * issuer caches, script caches, etc.). Built on `Map`'s preserved insertion order:
 * touching an entry deletes-and-reinserts to move it to the end, so eviction is
 * trivially the first key.
 *
 * - `Get` returns `undefined` for missing or expired entries and lazily evicts
 *   expired ones (firing `onEvict` once).
 * - `Set` updates an existing entry in place (resetting recency + TTL) or evicts
 *   the least-recently-used when `size === maxSize`.
 * - `onEvict` is called for **every** removal — overflow, expiry, explicit delete,
 *   or `Clear()` — so callers can release SDK clients, sockets, etc.
 *
 * Thread-safety: same single-threaded JS guarantees as `Map`. Not safe across
 * worker threads — pin one cache per worker.
 *
 * NOTE: this is intentionally minimal. We don't expose `keys()`/`values()`
 * iterators because LRU semantics interact poorly with iteration order — callers
 * who need those should use `Map` directly.
 */
export class MJLruCache<K, V> {
    private readonly _map: Map<K, Entry<V>> = new Map();
    private readonly _maxSize: number;
    private readonly _ttlMs: number;
    private readonly _onEvict?: (key: K, value: V, reason: 'lru' | 'ttl' | 'delete' | 'clear') => void;

    constructor(options: MJLruCacheOptions<K, V> = {}) {
        const maxSize = options.maxSize ?? 1000;
        if (!Number.isFinite(maxSize) || maxSize < 1) {
            throw new Error(`MJLruCache: maxSize must be a positive integer (got ${maxSize})`);
        }
        this._maxSize = Math.floor(maxSize);
        this._ttlMs = options.ttlMs && options.ttlMs > 0 ? options.ttlMs : 0;
        this._onEvict = options.onEvict;
    }

    /**
     * Configured maximum entry count. Read-only after construction.
     */
    public get MaxSize(): number {
        return this._maxSize;
    }

    /**
     * Current entry count (including any expired entries that haven't been
     * lazily evicted yet — call `Prune()` to force eviction first).
     */
    public get Size(): number {
        return this._map.size;
    }

    /**
     * Look up a value, refreshing its recency. Returns `undefined` if the key is
     * absent or the entry has expired. Expired entries are evicted lazily on the
     * miss (firing `onEvict` with reason `'ttl'`).
     */
    public Get(key: K): V | undefined {
        const entry = this._map.get(key);
        if (!entry) {
            return undefined;
        }
        if (entry.expiresAt <= Date.now()) {
            this._map.delete(key);
            this._onEvict?.(key, entry.value, 'ttl');
            return undefined;
        }
        // Refresh recency — Map preserves insertion order, so delete + re-insert
        // moves to the back.
        this._map.delete(key);
        this._map.set(key, entry);
        return entry.value;
    }

    /**
     * Whether the key is present and unexpired. Does **not** refresh recency.
     */
    public Has(key: K): boolean {
        const entry = this._map.get(key);
        if (!entry) return false;
        if (entry.expiresAt <= Date.now()) {
            this._map.delete(key);
            this._onEvict?.(key, entry.value, 'ttl');
            return false;
        }
        return true;
    }

    /**
     * Insert or replace an entry. If replacing, the old value is evicted with
     * reason `'delete'` so SDK-client style resources can be cleaned up. If
     * inserting and the cache is full, the LRU entry is evicted with reason
     * `'lru'`.
     */
    public Set(key: K, value: V): void {
        const expiresAt = this._ttlMs > 0 ? Date.now() + this._ttlMs : Number.POSITIVE_INFINITY;
        const existing = this._map.get(key);
        if (existing) {
            this._map.delete(key);
            this._onEvict?.(key, existing.value, 'delete');
        } else if (this._map.size >= this._maxSize) {
            // Evict the LRU (first) entry to make room.
            const oldestKey = this._map.keys().next().value as K | undefined;
            if (oldestKey !== undefined) {
                const old = this._map.get(oldestKey)!;
                this._map.delete(oldestKey);
                this._onEvict?.(oldestKey, old.value, 'lru');
            }
        }
        this._map.set(key, { value, expiresAt });
    }

    /**
     * Remove a key. Returns true if removed. Fires `onEvict` with reason
     * `'delete'`.
     */
    public Delete(key: K): boolean {
        const entry = this._map.get(key);
        if (!entry) return false;
        this._map.delete(key);
        this._onEvict?.(key, entry.value, 'delete');
        return true;
    }

    /**
     * Remove every entry, firing `onEvict` for each with reason `'clear'`.
     */
    public Clear(): void {
        if (!this._onEvict) {
            this._map.clear();
            return;
        }
        for (const [key, entry] of this._map) {
            this._onEvict(key, entry.value, 'clear');
        }
        this._map.clear();
    }

    /**
     * Eagerly evict all expired entries. Useful from a periodic timer when
     * lazy eviction (only on `Get`/`Has`) isn't sufficient — for example, when
     * entries hold expensive resources you want released even if no one reads
     * them again.
     */
    public Prune(): number {
        if (this._ttlMs <= 0) return 0;
        const now = Date.now();
        let count = 0;
        for (const [key, entry] of this._map) {
            if (entry.expiresAt <= now) {
                this._map.delete(key);
                this._onEvict?.(key, entry.value, 'ttl');
                count++;
            }
        }
        return count;
    }
}
