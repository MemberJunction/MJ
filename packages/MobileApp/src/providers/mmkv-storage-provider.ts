import { MMKV } from 'react-native-mmkv';
import type { ILocalStorageProvider } from '@memberjunction/core';

/**
 * MMKV-backed ILocalStorageProvider for React Native.
 *
 * `ILocalStorageProvider` (defined in @memberjunction/core/generic/interfaces.ts)
 * is the storage abstraction the rest of MJ uses — IndexedDB on web, localStorage
 * as a fallback, in-memory for tests. This file plugs MMKV in as the RN backend.
 *
 * MMKV stores by string key. Categories are folded into the key with a delimiter
 * — `category:key` — and we maintain a per-category key index so `ClearCategory`
 * and `GetCategoryKeys` stay O(category-size).
 *
 * Values are JSON-serialized. Mirrors the localStorage provider's contract:
 * Date/Map/Set/typed-arrays do NOT survive round-trip — callers must store plain
 * data. (IndexedDB's structured clone is the exception, not the norm.)
 */

/** Category used when a caller omits one. */
const DEFAULT_CATEGORY = 'default';
/** Namespace prefix for the per-category key-index entries. */
const CATEGORY_INDEX_PREFIX = '__cat_idx__';

/** Fold a `(category, key)` pair into the single MMKV storage key `category:key`. */
function compositeKey(category: string, key: string): string {
    return `${category}:${key}`;
}

/** MMKV key under which the set of keys belonging to a category is stored. */
function categoryIndexKey(category: string): string {
    return `${CATEGORY_INDEX_PREFIX}:${category}`;
}

/**
 * MMKV-backed implementation of MJ's `ILocalStorageProvider` — the React
 * Native cache backend. Values are JSON-serialized; a per-category key index is
 * maintained so category-wide operations stay O(category-size).
 */
export class MMKVStorageProvider implements ILocalStorageProvider {
    private readonly _mmkv: MMKV;

    /**
     * @param instance Optional pre-built MMKV instance (for tests / custom
     *   config); defaults to a new instance with id `mj-mobile-cache`.
     */
    constructor(instance?: MMKV) {
        this._mmkv = instance ?? new MMKV({ id: 'mj-mobile-cache' });
    }

    /** Read and parse the key-index Set for a category (empty on miss/corruption). */
    private getCategoryIndex(category: string): Set<string> {
        const raw = this._mmkv.getString(categoryIndexKey(category));
        if (!raw) return new Set();
        try {
            const arr = JSON.parse(raw) as string[];
            return new Set(arr);
        } catch {
            return new Set();
        }
    }

    /** Persist a category's key-index Set (deletes the index entry when empty). */
    private setCategoryIndex(category: string, keys: Set<string>): void {
        if (keys.size === 0) {
            this._mmkv.delete(categoryIndexKey(category));
            return;
        }
        this._mmkv.set(categoryIndexKey(category), JSON.stringify(Array.from(keys)));
    }

    /**
     * Retrieve and JSON-parse a single value.
     * @param key Item key.
     * @param category Optional namespace (defaults to `'default'`).
     * @returns The parsed value, or `null` if missing or unparseable.
     */
    async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const cat = category || DEFAULT_CATEGORY;
        const raw = this._mmkv.getString(compositeKey(cat, key));
        if (raw === undefined) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    /**
     * Batch-retrieve multiple values in one call (deduplicates `keys`).
     * @param keys Item keys to fetch.
     * @param category Optional namespace (defaults to `'default'`).
     * @returns A Map from key to parsed value, with `null` for misses/parse
     *   failures.
     */
    async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        if (keys.length === 0) return out;
        const cat = category || DEFAULT_CATEGORY;
        for (const key of new Set(keys)) {
            const raw = this._mmkv.getString(compositeKey(cat, key));
            if (raw === undefined) {
                out.set(key, null);
                continue;
            }
            try {
                out.set(key, JSON.parse(raw) as T);
            } catch {
                out.set(key, null);
            }
        }
        return out;
    }

    /**
     * JSON-serialize and store a value, updating the category key index.
     * @param key Item key.
     * @param value Value to store (must be JSON-serializable plain data).
     * @param category Optional namespace (defaults to `'default'`).
     */
    async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        const cat = category || DEFAULT_CATEGORY;
        this._mmkv.set(compositeKey(cat, key), JSON.stringify(value));
        const idx = this.getCategoryIndex(cat);
        if (!idx.has(key)) {
            idx.add(key);
            this.setCategoryIndex(cat, idx);
        }
    }

    /**
     * Delete a single value and remove it from the category key index.
     * @param key Item key.
     * @param category Optional namespace (defaults to `'default'`).
     */
    async Remove(key: string, category?: string): Promise<void> {
        const cat = category || DEFAULT_CATEGORY;
        this._mmkv.delete(compositeKey(cat, key));
        const idx = this.getCategoryIndex(cat);
        if (idx.delete(key)) {
            this.setCategoryIndex(cat, idx);
        }
    }

    /**
     * Delete every value in a category (via its key index) and the index itself.
     * @param category Namespace to clear (falsy is treated as `'default'`).
     */
    async ClearCategory(category: string): Promise<void> {
        const cat = category || DEFAULT_CATEGORY;
        const idx = this.getCategoryIndex(cat);
        for (const key of idx) {
            this._mmkv.delete(compositeKey(cat, key));
        }
        this._mmkv.delete(categoryIndexKey(cat));
    }

    /**
     * List the keys currently stored under a category.
     * @param category Namespace to enumerate (falsy is treated as `'default'`).
     * @returns The keys in that category (order not guaranteed).
     */
    async GetCategoryKeys(category: string): Promise<string[]> {
        return Array.from(this.getCategoryIndex(category || DEFAULT_CATEGORY));
    }
}
