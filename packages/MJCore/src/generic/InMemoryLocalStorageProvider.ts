import { ILocalStorageProvider } from './interfaces';

/**
 * In-memory implementation of {@link ILocalStorageProvider}.
 * Useful for server-side environments (Node.js) where browser storage APIs like
 * localStorage or IndexedDB are not available, and as a default fallback wherever
 * a storage provider is required but no persistence is needed.
 *
 * Stores values **by reference** — no serialization. Mirrors the IndexedDB
 * provider's structured-clone semantics (preserves Date, Map, Set, typed arrays,
 * etc.) without the storage round-trip cost.
 *
 * Note: Data is not persisted across process restarts. Suitable for caching
 * scenarios where persistence is not required.
 */
export class InMemoryLocalStorageProvider implements ILocalStorageProvider {
    private static readonly DEFAULT_CATEGORY = 'default';
    private _storage: Map<string, Map<string, unknown>> = new Map();

    /**
     * Gets or creates a category map
     */
    private getCategoryMap(category: string): Map<string, unknown> {
        const cat = category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY;
        let categoryMap = this._storage.get(cat);
        if (!categoryMap) {
            categoryMap = new Map();
            this._storage.set(cat, categoryMap);
        }
        return categoryMap;
    }

    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const categoryMap = this.getCategoryMap(category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY);
        const value = categoryMap.get(key);
        return (value === undefined ? null : (value as T));
    }

    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        // In-memory has no batching benefit (Map.get is already O(1)) — just read each key
        // and assemble the result map. Implementing the API for contract uniformity.
        const out = new Map<string, T | null>();
        if (keys.length === 0) return out;
        const categoryMap = this.getCategoryMap(category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY);
        // Dedupe via Set so duplicate input keys don't produce duplicate map entries
        for (const key of new Set(keys)) {
            const value = categoryMap.get(key);
            out.set(key, value === undefined ? null : (value as T));
        }
        return out;
    }

    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        const categoryMap = this.getCategoryMap(category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY);
        categoryMap.set(key, value);
    }

    public async Remove(key: string, category?: string): Promise<void> {
        const categoryMap = this.getCategoryMap(category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY);
        categoryMap.delete(key);
    }

    public async ClearCategory(category: string): Promise<void> {
        const cat = category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY;
        this._storage.delete(cat);
    }

    public async GetCategoryKeys(category: string): Promise<string[]> {
        const categoryMap = this._storage.get(category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY);
        return categoryMap ? Array.from(categoryMap.keys()) : [];
    }
}
