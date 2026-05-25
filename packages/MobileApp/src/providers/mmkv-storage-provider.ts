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

const DEFAULT_CATEGORY = 'default';
const CATEGORY_INDEX_PREFIX = '__cat_idx__';

function compositeKey(category: string, key: string): string {
    return `${category}:${key}`;
}

function categoryIndexKey(category: string): string {
    return `${CATEGORY_INDEX_PREFIX}:${category}`;
}

export class MMKVStorageProvider implements ILocalStorageProvider {
    private readonly _mmkv: MMKV;

    constructor(instance?: MMKV) {
        this._mmkv = instance ?? new MMKV({ id: 'mj-mobile-cache' });
    }

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

    private setCategoryIndex(category: string, keys: Set<string>): void {
        if (keys.size === 0) {
            this._mmkv.delete(categoryIndexKey(category));
            return;
        }
        this._mmkv.set(categoryIndexKey(category), JSON.stringify(Array.from(keys)));
    }

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

    async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        const cat = category || DEFAULT_CATEGORY;
        this._mmkv.set(compositeKey(cat, key), JSON.stringify(value));
        const idx = this.getCategoryIndex(cat);
        if (!idx.has(key)) {
            idx.add(key);
            this.setCategoryIndex(cat, idx);
        }
    }

    async Remove(key: string, category?: string): Promise<void> {
        const cat = category || DEFAULT_CATEGORY;
        this._mmkv.delete(compositeKey(cat, key));
        const idx = this.getCategoryIndex(cat);
        if (idx.delete(key)) {
            this.setCategoryIndex(cat, idx);
        }
    }

    async ClearCategory(category: string): Promise<void> {
        const cat = category || DEFAULT_CATEGORY;
        const idx = this.getCategoryIndex(cat);
        for (const key of idx) {
            this._mmkv.delete(compositeKey(cat, key));
        }
        this._mmkv.delete(categoryIndexKey(cat));
    }

    async GetCategoryKeys(category: string): Promise<string[]> {
        return Array.from(this.getCategoryIndex(category || DEFAULT_CATEGORY));
    }
}
