import { ILocalStorageProvider } from './interfaces';

/**
 * In-memory implementation of ILocalStorageProvider.
 * Useful for server-side environments (Node.js) where browser storage APIs like
 * localStorage or indexedDB are not available.
 *
 * Note: Data is not persisted across process restarts. This is suitable for
 * caching scenarios where persistence is not required.
 */
export class InMemoryLocalStorageProvider implements ILocalStorageProvider {
    private static readonly DEFAULT_CATEGORY = 'default';
    private _storage: Map<string, Map<string, string>> = new Map();

    /**
     * Gets or creates a category map
     */
    private getCategoryMap(category: string): Map<string, string> {
        const cat = category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY;
        let categoryMap = this._storage.get(cat);
        if (!categoryMap) {
            categoryMap = new Map();
            this._storage.set(cat, categoryMap);
        }
        return categoryMap;
    }

    public async GetItem(key: string, category?: string): Promise<string | null> {
        const categoryMap = this.getCategoryMap(category || InMemoryLocalStorageProvider.DEFAULT_CATEGORY);
        return categoryMap.get(key) ?? null;
    }

    public async SetItem(key: string, value: string, category?: string): Promise<void> {
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
