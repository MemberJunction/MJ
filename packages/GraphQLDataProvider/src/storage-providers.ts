import { ILocalStorageProvider, LogError, LogErrorEx } from '@memberjunction/core';
import { openDB, DBSchema, IDBPDatabase } from '@tempfix/idb';

// Default category used when no category is specified
const DEFAULT_CATEGORY = 'default';

// ============================================================================
// IN-MEMORY STORAGE PROVIDER (Map of Maps)
// ============================================================================

/**
 * In-memory storage provider using nested Map structure for category isolation.
 * Used as a fallback when browser storage is not available.
 *
 * Storage structure: Map<category, Map<key, value>>
 */
export class BrowserStorageProviderBase implements ILocalStorageProvider {
    private _storage: Map<string, Map<string, string>> = new Map();

    /**
     * Gets or creates a category map
     */
    private getCategoryMap(category: string): Map<string, string> {
        const cat = category || DEFAULT_CATEGORY;
        let categoryMap = this._storage.get(cat);
        if (!categoryMap) {
            categoryMap = new Map();
            this._storage.set(cat, categoryMap);
        }
        return categoryMap;
    }

    public async GetItem(key: string, category?: string): Promise<string | null> {
        const categoryMap = this.getCategoryMap(category || DEFAULT_CATEGORY);
        return categoryMap.get(key) ?? null;
    }

    public async SetItem(key: string, value: string, category?: string): Promise<void> {
        const categoryMap = this.getCategoryMap(category || DEFAULT_CATEGORY);
        categoryMap.set(key, value);
    }

    public async Remove(key: string, category?: string): Promise<void> {
        const categoryMap = this.getCategoryMap(category || DEFAULT_CATEGORY);
        categoryMap.delete(key);
    }

    public async ClearCategory(category: string): Promise<void> {
        const cat = category || DEFAULT_CATEGORY;
        this._storage.delete(cat);
    }

    public async GetCategoryKeys(category: string): Promise<string[]> {
        const categoryMap = this._storage.get(category || DEFAULT_CATEGORY);
        return categoryMap ? Array.from(categoryMap.keys()) : [];
    }
}

// ============================================================================
// BROWSER LOCAL STORAGE PROVIDER (Key Prefix)
// ============================================================================

/**
 * Browser localStorage provider with category support via key prefixing.
 *
 * Key format: [mj]:[category]:[key]
 * Example: [mj]:[RunViewCache]:[Users|Active=1|Name ASC]
 *
 * Falls back to in-memory storage if localStorage is not available.
 */
class BrowserLocalStorageProvider extends BrowserStorageProviderBase {
    /**
     * Builds a prefixed key for localStorage
     * Format: [mj]:[category]:[key]
     */
    private buildKey(key: string, category?: string): string {
        const cat = category || DEFAULT_CATEGORY;
        return `[mj]:[${cat}]:[${key}]`;
    }

    /**
     * Parses a prefixed key to extract category and original key
     */
    private parseKey(prefixedKey: string): { category: string; key: string } | null {
        const match = prefixedKey.match(/^\[mj\]:\[([^\]]*)\]:\[(.+)\]$/);
        if (match) {
            return { category: match[1], key: match[2] };
        }
        return null;
    }

    public override async GetItem(key: string, category?: string): Promise<string | null> {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(this.buildKey(key, category));
        }
        return await super.GetItem(key, category);
    }

    public override async SetItem(key: string, value: string, category?: string): Promise<void> {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(this.buildKey(key, category), value);
        } else {
            await super.SetItem(key, value, category);
        }
    }

    public override async Remove(key: string, category?: string): Promise<void> {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(this.buildKey(key, category));
        } else {
            await super.Remove(key, category);
        }
    }

    public override async ClearCategory(category: string): Promise<void> {
        if (typeof localStorage !== 'undefined') {
            const cat = category || DEFAULT_CATEGORY;
            const prefix = `[mj]:[${cat}]:`;
            const keysToRemove: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }

            for (const key of keysToRemove) {
                localStorage.removeItem(key);
            }
        } else {
            await super.ClearCategory(category);
        }
    }

    public override async GetCategoryKeys(category: string): Promise<string[]> {
        if (typeof localStorage !== 'undefined') {
            const cat = category || DEFAULT_CATEGORY;
            const prefix = `[mj]:[${cat}]:`;
            const keys: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const prefixedKey = localStorage.key(i);
                if (prefixedKey && prefixedKey.startsWith(prefix)) {
                    const parsed = this.parseKey(prefixedKey);
                    if (parsed) {
                        keys.push(parsed.key);
                    }
                }
            }

            return keys;
        }
        return await super.GetCategoryKeys(category);
    }
}

// ============================================================================
// INDEXED DB STORAGE PROVIDER (Object Stores per Category)
// ============================================================================

const IDB_DB_NAME = 'MJ_Metadata';
const IDB_DB_VERSION = 3; // v3: Remove legacy Metadata_KVPairs store

// Known object store names as a const tuple for type safety
const KNOWN_OBJECT_STORES = [
    'mj:default',       // Default category
    'mj:Metadata',      // Metadata cache
    'mj:RunViewCache',  // RunView results cache
    'mj:RunQueryCache', // RunQuery results cache
    'mj:DatasetCache',  // Dataset cache
] as const;

// Type for known store names
type KnownStoreName = typeof KNOWN_OBJECT_STORES[number];

// Legacy store name - kept for cleanup during upgrade
const LEGACY_STORE_NAME = 'Metadata_KVPairs';

/**
 * IndexedDB schema with dynamic object stores per category.
 * Each category gets its own object store: mj:CategoryName
 */
export interface MJ_MetadataDB extends DBSchema {
    // Default category store
    'mj:default': {
        key: string;
        value: string;
    };
    // Metadata store
    'mj:Metadata': {
        key: string;
        value: string;
    };
    // RunView cache store
    'mj:RunViewCache': {
        key: string;
        value: string;
    };
    // RunQuery cache store
    'mj:RunQueryCache': {
        key: string;
        value: string;
    };
    // Dataset cache store
    'mj:DatasetCache': {
        key: string;
        value: string;
    };
}

/**
 * IndexedDB storage provider with category support via separate object stores.
 *
 * Known categories (mj:Metadata, mj:RunViewCache, etc.) get dedicated object stores.
 * Unknown categories fall back to the default store with prefixed keys.
 */
export class BrowserIndexedDBStorageProvider extends BrowserStorageProviderBase {
    private dbPromise: Promise<IDBPDatabase<MJ_MetadataDB>>;
    private _dbReady: boolean = false;

    constructor() {
        super();
        this.dbPromise = openDB<MJ_MetadataDB>(IDB_DB_NAME, IDB_DB_VERSION, {
            upgrade(db) {
                try {
                    // Remove legacy store if it exists (cleanup from v1/v2)
                    // Cast needed because LEGACY_STORE_NAME is not in current schema (it's being removed)
                    if (db.objectStoreNames.contains(LEGACY_STORE_NAME as KnownStoreName)) {
                        db.deleteObjectStore(LEGACY_STORE_NAME as KnownStoreName);
                    }

                    // Create known category stores
                    for (const storeName of KNOWN_OBJECT_STORES) {
                        if (!db.objectStoreNames.contains(storeName)) {
                            db.createObjectStore(storeName);
                        }
                    }
                } catch (e) {
                    LogErrorEx({
                        error: e,
                        message: (e as Error)?.message
                    });
                }
            },
        });

        this.dbPromise.then(() => {
            this._dbReady = true;
        }).catch(e => {
            LogErrorEx({
                error: e,
                message: 'IndexedDB initialization failed: ' + (e as Error)?.message
            });
        });
    }

    /**
     * Checks if a category has a dedicated object store
     */
    private isKnownCategory(category: string): boolean {
        const storeName = `mj:${category}`;
        return (KNOWN_OBJECT_STORES as readonly string[]).includes(storeName);
    }

    /**
     * Gets the object store name for a category.
     * Returns the dedicated store if it exists, otherwise returns the default store.
     */
    private getStoreName(category?: string): KnownStoreName {
        const cat = category || DEFAULT_CATEGORY;
        if (this.isKnownCategory(cat)) {
            return `mj:${cat}` as KnownStoreName;
        }
        return 'mj:default';
    }

    /**
     * Gets the key to use in the store.
     * For known stores, use the key as-is.
     * For unknown categories using the default store, prefix with category.
     */
    private getStoreKey(key: string, category?: string): string {
        const cat = category || DEFAULT_CATEGORY;
        if (this.isKnownCategory(cat)) {
            return key;
        }
        // If using default store for unknown category, prefix the key
        return `[${cat}]:${key}`;
    }

    public override async SetItem(key: string, value: string, category?: string): Promise<void> {
        try {
            const db = await this.dbPromise;
            const storeName = this.getStoreName(category);
            const storeKey = this.getStoreKey(key, category);

            const tx = db.transaction(storeName, 'readwrite');
            await tx.objectStore(storeName).put(value, storeKey);
            await tx.done;
        } catch (e) {
            LogErrorEx({
                error: e,
                message: (e as Error)?.message
            });
            // Fall back to in-memory
            await super.SetItem(key, value, category);
        }
    }

    public override async GetItem(key: string, category?: string): Promise<string | null> {
        try {
            const db = await this.dbPromise;
            const storeName = this.getStoreName(category);
            const storeKey = this.getStoreKey(key, category);

            const value = await db.transaction(storeName).objectStore(storeName).get(storeKey);
            return value ?? null;
        } catch (e) {
            LogErrorEx({
                error: e,
                message: (e as Error)?.message
            });
            // Fall back to in-memory
            return await super.GetItem(key, category);
        }
    }

    public override async Remove(key: string, category?: string): Promise<void> {
        try {
            const db = await this.dbPromise;
            const storeName = this.getStoreName(category);
            const storeKey = this.getStoreKey(key, category);

            const tx = db.transaction(storeName, 'readwrite');
            await tx.objectStore(storeName).delete(storeKey);
            await tx.done;
        } catch (e) {
            LogErrorEx({
                error: e,
                message: (e as Error)?.message
            });
            // Fall back to in-memory
            await super.Remove(key, category);
        }
    }

    public override async ClearCategory(category: string): Promise<void> {
        try {
            const db = await this.dbPromise;
            const cat = category || DEFAULT_CATEGORY;
            const storeName = this.getStoreName(category);

            // If it's a dedicated store, clear the entire store
            if (this.isKnownCategory(cat)) {
                const tx = db.transaction(storeName, 'readwrite');
                await tx.objectStore(storeName).clear();
                await tx.done;
            } else {
                // For unknown categories using default store, clear only prefixed keys
                const prefix = `[${cat}]:`;
                const tx = db.transaction('mj:default', 'readwrite');
                const store = tx.objectStore('mj:default');
                const allKeys = await store.getAllKeys();

                for (const storeKey of allKeys) {
                    if (typeof storeKey === 'string' && storeKey.startsWith(prefix)) {
                        await store.delete(storeKey);
                    }
                }
                await tx.done;
            }
        } catch (e) {
            LogErrorEx({
                error: e,
                message: (e as Error)?.message
            });
            // Fall back to in-memory
            await super.ClearCategory(category);
        }
    }

    public override async GetCategoryKeys(category: string): Promise<string[]> {
        try {
            const db = await this.dbPromise;
            const cat = category || DEFAULT_CATEGORY;
            const storeName = this.getStoreName(category);

            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const allKeys = await store.getAllKeys();

            // If it's a dedicated store, return keys as-is
            if (this.isKnownCategory(cat)) {
                return allKeys.map(k => String(k));
            }

            // For unknown categories, filter and strip prefix
            const prefix = `[${cat}]:`;
            return allKeys
                .map(k => String(k))
                .filter(k => k.startsWith(prefix))
                .map(k => k.slice(prefix.length));
        } catch (e) {
            LogErrorEx({
                error: e,
                message: (e as Error)?.message
            });
            // Fall back to in-memory
            return await super.GetCategoryKeys(category);
        }
    }
}
