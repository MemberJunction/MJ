/**
 * Persistent Embedding Cache for organic key detection.
 *
 * Disk-backed JSON store keyed by SHA-256(model | dimensions | descriptor-text).
 * Survives `--resume` runs and re-runs with different clustering knobs, so iterating
 * on thresholds / weights / refinement prompts costs nothing in embedding API calls.
 *
 * Cache invalidates automatically when the model or dimensions change because the
 * key includes both — there's no possibility of returning a stale embedding from
 * a different model.
 *
 * No external dependencies; uses Node's built-in `node:crypto` and `node:fs/promises`.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Identity of an embedding for cache-key purposes. */
export interface EmbeddingKey {
    /** Model identifier (e.g. 'gemini-embedding-001'). */
    model: string;
    /** Embedding dimensionality. */
    dimensions: number;
    /** The text that was embedded (the column descriptor). */
    text: string;
}

/** Summary of cache activity for telemetry / phase tracking. */
export interface EmbeddingCacheStats {
    /** Cache hits (entries already on disk). */
    hits: number;
    /** Cache misses (entries that had to be fetched fresh). */
    misses: number;
    /** Number of entries currently held in memory after load. */
    entries: number;
    /** Path to the on-disk cache file. */
    cachePath: string;
}

/**
 * Load-on-demand, write-on-update cache. Optimized for the common organic key
 * detection access pattern: one bulk get-or-fill per run.
 */
export class EmbeddingCache {
    private readonly cachePath: string;
    /** In-memory store keyed by SHA-256 hex digest. Values are plain number[] for JSON serialization. */
    private store: Map<string, number[]>;
    private loaded = false;
    private dirty = false;
    private hits = 0;
    private misses = 0;

    constructor(cachePath: string) {
        this.cachePath = cachePath;
        this.store = new Map();
    }

    /**
     * Load the cache file into memory. Idempotent — subsequent calls are no-ops.
     * A missing cache file is treated as an empty cache.
     */
    public async load(): Promise<void> {
        if (this.loaded) return;
        try {
            const raw = await readFile(this.cachePath, 'utf-8');
            const parsed = JSON.parse(raw) as Record<string, number[]>;
            for (const [k, v] of Object.entries(parsed)) {
                if (Array.isArray(v)) this.store.set(k, v);
            }
        } catch (err) {
            // Missing file or parse error — start empty. Corrupt cache files self-heal on next write.
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                // Log via no-op; a corrupt file shouldn't kill the run
            }
        }
        this.loaded = true;
    }

    /**
     * Persist the cache to disk. Only writes if the cache has been modified since load.
     */
    public async save(): Promise<void> {
        if (!this.dirty) return;
        await mkdir(dirname(this.cachePath), { recursive: true });
        const obj: Record<string, number[]> = {};
        for (const [k, v] of this.store) obj[k] = v;
        await writeFile(this.cachePath, JSON.stringify(obj));
        this.dirty = false;
    }

    /**
     * Look up an embedding by key. Returns null on miss.
     * Updates internal hit/miss counters.
     */
    public get(key: EmbeddingKey): Float32Array | null {
        if (!this.loaded) {
            throw new Error('EmbeddingCache.get() called before load()');
        }
        const hashKey = this.makeKey(key);
        const hit = this.store.get(hashKey);
        if (hit) {
            this.hits++;
            return Float32Array.from(hit);
        }
        this.misses++;
        return null;
    }

    /** Insert or replace an embedding. */
    public set(key: EmbeddingKey, vector: Float32Array | number[]): void {
        if (!this.loaded) {
            throw new Error('EmbeddingCache.set() called before load()');
        }
        const hashKey = this.makeKey(key);
        const asArray = Array.isArray(vector) ? vector : Array.from(vector);
        this.store.set(hashKey, asArray);
        this.dirty = true;
    }

    /**
     * Bulk get-or-fill: for each key, returns the cached embedding when available
     * or invokes `fetcher` to populate the missing entries. The fetcher receives
     * the subset of keys that missed and must return one vector per key, in order.
     *
     * Saves once at the end if anything new was fetched.
     */
    public async getOrFill(
        keys: EmbeddingKey[],
        fetcher: (missingKeys: EmbeddingKey[]) => Promise<Float32Array[]>,
    ): Promise<Float32Array[]> {
        if (!this.loaded) await this.load();

        const out: (Float32Array | null)[] = new Array(keys.length).fill(null);
        const missingKeys: EmbeddingKey[] = [];
        const missingIdx: number[] = [];

        for (let i = 0; i < keys.length; i++) {
            const cached = this.get(keys[i]);
            if (cached) {
                out[i] = cached;
            } else {
                missingKeys.push(keys[i]);
                missingIdx.push(i);
            }
        }

        if (missingKeys.length > 0) {
            const fetched = await fetcher(missingKeys);
            if (fetched.length !== missingKeys.length) {
                throw new Error(
                    `Fetcher returned ${fetched.length} vectors for ${missingKeys.length} missing keys`,
                );
            }
            for (let j = 0; j < missingKeys.length; j++) {
                this.set(missingKeys[j], fetched[j]);
                out[missingIdx[j]] = fetched[j];
            }
            await this.save();
        }

        return out as Float32Array[];
    }

    /** Get current telemetry. */
    public stats(): EmbeddingCacheStats {
        return {
            hits: this.hits,
            misses: this.misses,
            entries: this.store.size,
            cachePath: this.cachePath,
        };
    }

    /** Reset hit/miss counters (cache contents untouched). */
    public resetStats(): void {
        this.hits = 0;
        this.misses = 0;
    }

    /** Has the cache file ever been written? */
    public async exists(): Promise<boolean> {
        try {
            await stat(this.cachePath);
            return true;
        } catch {
            return false;
        }
    }

    private makeKey(key: EmbeddingKey): string {
        const composite = `${key.model}|${key.dimensions}|${key.text}`;
        return createHash('sha256').update(composite).digest('hex');
    }
}
