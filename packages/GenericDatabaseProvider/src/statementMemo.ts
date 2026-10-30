import { createHash } from 'node:crypto';

/**
 * A bounded memo of facts about SQL statements, keyed by a SHA-256 of the dialect key and the
 * statement text, so a long statement is never kept as a key. When full, the entry stored longest
 * ago goes first. An optional lifetime makes an entry expire, for facts that depend on the
 * database schema rather than on the text alone.
 */
export class StatementMemo<V> {
    private readonly entries = new Map<string, { readonly Value: V; readonly At: number }>();

    /**
     * @param maxEntries - How many entries are kept.
     * @param ttlMs - How long an entry is trusted, in milliseconds; `null` for as long as it is kept.
     */
    constructor(private readonly maxEntries: number, private readonly ttlMs: number | null = null) {}

    /** The key of `sql` read in `dialectKey`. */
    static KeyOf(sql: string, dialectKey: string): string {
        return createHash('sha256').update(dialectKey).update('\u0000').update(sql).digest('hex');
    }

    /** The value kept under `key`; undefined when there is none or it has expired. */
    Get(key: string, now: number = Date.now()): V | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (this.ttlMs !== null && now - entry.At > this.ttlMs) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.Value;
    }

    /** Keeps `value` under `key`, dropping the oldest entry when full. */
    Set(key: string, value: V, now: number = Date.now()): void {
        this.entries.delete(key);
        if (this.entries.size >= this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (!oldest.done) this.entries.delete(oldest.value);
        }
        this.entries.set(key, { Value: value, At: now });
    }

    /** The value under `key`, computing and keeping it on a miss. */
    GetOrCompute(key: string, compute: () => V): V {
        const kept = this.Get(key);
        if (kept !== undefined) return kept;
        const value = compute();
        this.Set(key, value);
        return value;
    }

    /** Forgets the entry under `key`. */
    Delete(key: string): void {
        this.entries.delete(key);
    }

    /** How many entries are kept. */
    get Size(): number {
        return this.entries.size;
    }
}
