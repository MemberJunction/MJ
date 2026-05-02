import { ILocalStorageProvider, LogError, LogErrorEx, LogStatus } from '@memberjunction/core';
import { openDB, DBSchema, IDBPDatabase } from '@tempfix/idb';
import { PACKAGE_VERSION } from './version.generated';

// Default category used when no category is specified
const DEFAULT_CATEGORY = 'default';

// ============================================================================
// IN-MEMORY STORAGE PROVIDER (Map of Maps) — base class
// ============================================================================

/**
 * In-memory storage provider using a nested Map structure for category isolation.
 * Used as a fallback when browser storage is not available, and as the base for
 * the localStorage / IndexedDB providers below.
 *
 * Stores values by reference — no serialization. Suitable as long as the calling
 * tier doesn't need persistence across page loads.
 *
 * Storage structure: `Map<category, Map<key, unknown>>`
 */
export class BrowserStorageProviderBase implements ILocalStorageProvider {
    private _storage: Map<string, Map<string, unknown>> = new Map();

    /**
     * Gets or creates a category map
     */
    private getCategoryMap(category: string): Map<string, unknown> {
        const cat = category || DEFAULT_CATEGORY;
        let categoryMap = this._storage.get(cat);
        if (!categoryMap) {
            categoryMap = new Map();
            this._storage.set(cat, categoryMap);
        }
        return categoryMap;
    }

    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const categoryMap = this.getCategoryMap(category || DEFAULT_CATEGORY);
        const value = categoryMap.get(key);
        return (value === undefined ? null : (value as T));
    }

    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        // Map.get is O(1); no batching benefit. Implementing for API uniformity.
        const out = new Map<string, T | null>();
        if (keys.length === 0) return out;
        const categoryMap = this.getCategoryMap(category || DEFAULT_CATEGORY);
        for (const key of new Set(keys)) {
            const value = categoryMap.get(key);
            out.set(key, value === undefined ? null : (value as T));
        }
        return out;
    }

    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
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
 * Key format: `[mj]:[category]:[key]`
 * Example: `[mj]:[RunViewCache]:[Users|Active=1|Name ASC]`
 *
 * **Internal serialization**: localStorage only stores strings, so SetItem/GetItem
 * JSON-encode/decode the value internally. Callers see the same generic-typed
 * interface as the IndexedDB provider.
 *
 * Falls back to in-memory storage if localStorage is not available.
 */
class BrowserLocalStorageProvider extends BrowserStorageProviderBase {
    /**
     * Builds a prefixed key for localStorage
     * Format: `[mj]:[category]:[key]`
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

    public override async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        if (typeof localStorage !== 'undefined') {
            const json = localStorage.getItem(this.buildKey(key, category));
            if (json === null) return null;
            try {
                return JSON.parse(json) as T;
            } catch {
                // Corrupt entry — treat as cache miss. Caller will repopulate.
                return null;
            }
        }
        return await super.GetItem<T>(key, category);
    }

    public override async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        if (keys.length === 0) return new Map();
        if (typeof localStorage === 'undefined') {
            return await super.GetItems<T>(keys, category);
        }
        // localStorage has no batched API — getItem is synchronous and cheap, so we just
        // loop. Each call is in-process (no IPC), so overhead is negligible vs IDB.
        const out = new Map<string, T | null>();
        for (const key of new Set(keys)) {
            const json = localStorage.getItem(this.buildKey(key, category));
            if (json === null) {
                out.set(key, null);
                continue;
            }
            try {
                out.set(key, JSON.parse(json) as T);
            } catch {
                out.set(key, null);
            }
        }
        return out;
    }

    public override async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(this.buildKey(key, category), JSON.stringify(value));
            } catch (e) {
                // localStorage quota exceeded, JSON serialization failure (cycles), etc.
                LogErrorEx({ error: e, message: (e as Error)?.message });
            }
        } else {
            await super.SetItem<T>(key, value, category);
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

/**
 * Optional manual revision applied on top of the auto-derived major*1000+minor
 * version. Bump within a single minor release if you ship a cache schema change
 * mid-version (rare — usually a hotfix). Reset back to 0 after the next minor.
 */
const MANUAL_CACHE_REVISION = 0;

/**
 * IndexedDB schema version, derived from this package's `package.json` version
 * field at build time (`scripts/generate-version.mjs` writes `version.generated.ts`).
 *
 * Encoding: `major * 1000 + minor + MANUAL_CACHE_REVISION`. Examples:
 *   - 5.30.x → 5030
 *   - 5.31.x → 5031
 *   - 6.0.x  → 6000
 *
 * **Patch releases keep the same DB version** (cache survives), so frequent
 * patch deploys don't force users into cold-cache loads. Each minor bump
 * triggers a one-time IDB `onupgradeneeded` that drops every object store —
 * stale entries from any prior schema are wiped, fresh stores recreated, and
 * caches repopulate on first use.
 *
 * This is an intentional trade: ~one slow page load per user per minor release
 * in exchange for never having to track "did this PR change cache format?" in
 * code review. MJ's LTS / monthly cadence makes the cost negligible.
 */
function computeIdbVersion(): number {
    try {
        const parts = PACKAGE_VERSION.split('.');
        const major = parseInt(parts[0], 10);
        const minor = parseInt(parts[1], 10);
        if (!Number.isFinite(major) || !Number.isFinite(minor)) {
            throw new Error(`Could not parse major.minor from version "${PACKAGE_VERSION}"`);
        }
        return major * 1000 + minor + MANUAL_CACHE_REVISION;
    } catch (e) {
        // Defensive: if version parse ever fails for some reason, use a sentinel
        // high enough to still be > any plausible past version. This forces a
        // wipe rather than silently using a stale version number that might
        // collide with a real version.
        LogErrorEx({ error: e, message: 'Failed to derive IDB version from PACKAGE_VERSION; using fallback 99999' });
        return 99999;
    }
}

const IDB_DB_VERSION = computeIdbVersion();

// Known object store names as a const tuple for type safety.
const KNOWN_OBJECT_STORES = [
    'mj:default',       // Default category
    'mj:Metadata',      // Metadata cache
    'mj:RunViewCache',  // RunView results cache
    'mj:RunQueryCache', // RunQuery results cache
    'mj:DatasetCache',  // Dataset cache
] as const;

// Type for known store names
type KnownStoreName = typeof KNOWN_OBJECT_STORES[number];

/**
 * IndexedDB schema. Values are stored natively (structured clone) — not JSON strings.
 * The `unknown` value type reflects that callers control the runtime shape via the
 * generic `SetItem<T>` / `GetItem<T>` typing on the provider.
 */
export interface MJ_MetadataDB extends DBSchema {
    'mj:default':       { key: string; value: unknown };
    'mj:Metadata':      { key: string; value: unknown };
    'mj:RunViewCache':  { key: string; value: unknown };
    'mj:RunQueryCache': { key: string; value: unknown };
    'mj:DatasetCache':  { key: string; value: unknown };
}

/**
 * IndexedDB storage provider with category support via separate object stores.
 *
 * **Native object storage**: values pass through IndexedDB's structured clone
 * algorithm — no JSON.stringify/parse round-trip. This preserves `Date`, `Map`,
 * `Set`, typed arrays, nested objects, and is significantly faster than JSON
 * (parse/serialize implemented in browser-native C++ vs. JS-level JSON).
 *
 * **Class instances lose their prototype** — store the raw data form (e.g. via
 * `entity.GetAll()` for BaseEntity). This matches how the cache layer above
 * already operates.
 *
 * **Schema upgrades** are version-driven: bumping `IDB_DB_VERSION` (auto-derived
 * from the package's minor version) fires `onupgradeneeded` on the next page
 * load, wipes all stores, and recreates them. Stale entries from any prior
 * schema are gone in one atomic transition; no backward-compat read paths.
 *
 * Known categories (mj:Metadata, mj:RunViewCache, etc.) get dedicated stores;
 * unknown categories share `mj:default` with prefixed keys.
 */
export class BrowserIndexedDBStorageProvider extends BrowserStorageProviderBase {
    private dbPromise: Promise<IDBPDatabase<MJ_MetadataDB>>;
    private _dbReady: boolean = false;

    constructor() {
        super();
        this.dbPromise = openDB<MJ_MetadataDB>(IDB_DB_NAME, IDB_DB_VERSION, {
            upgrade: (db, oldVersion, newVersion) => {
                try {
                    LogStatus(
                        `[IDBCache] Upgrading IndexedDB schema v${oldVersion} → v${newVersion} ` +
                        `(package ${PACKAGE_VERSION}). Dropping all stores; caches will repopulate on first use.`
                    );

                    // Drop every existing store. All data may have been written by prior
                    // schemas (different formats, different stores) — fresh start is safer
                    // than maintaining backward-compat read paths forever.
                    for (const storeName of Array.from(db.objectStoreNames)) {
                        db.deleteObjectStore(storeName);
                    }

                    // Recreate the known stores fresh.
                    for (const storeName of KNOWN_OBJECT_STORES) {
                        if (!db.objectStoreNames.contains(storeName)) {
                            db.createObjectStore(storeName);
                        }
                    }
                } catch (e) {
                    LogErrorEx({ error: e, message: (e as Error)?.message });
                }
            },
            blocked: (currentVersion, blockedVersion) => {
                // Another tab has the DB open at an older version, blocking our upgrade.
                // Log so devs can see why startup is stalled. Closing or reloading the
                // other tab will unblock; the user typically just refreshes anyway.
                LogStatus(
                    `[IDBCache] Upgrade from v${currentVersion} to v${blockedVersion} blocked by another tab. ` +
                    `Close other tabs to allow the upgrade to proceed.`
                );
            },
        });

        this.dbPromise.then(db => {
            this._dbReady = true;
            // Cross-tab handler: if another tab triggers an upgrade, our connection
            // becomes a liability. Close it gracefully so the upgrade isn't blocked.
            // Subsequent reads/writes will reopen at the new version.
            db.onversionchange = () => {
                LogStatus(`[IDBCache] DB schema upgraded in another tab — closing local connection.`);
                db.close();
                this._dbReady = false;
            };
        }).catch(e => {
            LogErrorEx({
                error: e,
                message: 'IndexedDB initialization failed: ' + (e as Error)?.message
            });
        });
    }

    /**
     * Whether the IDB connection has been established. Useful for tests and
     * for callers that want to skip a slow first-call open if not needed yet.
     */
    public get IsReady(): boolean {
        return this._dbReady;
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

    public override async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        try {
            const db = await this.dbPromise;
            const storeName = this.getStoreName(category);
            const storeKey = this.getStoreKey(key, category);

            const tx = db.transaction(storeName, 'readwrite');
            // Native structured clone — IDB stores the object directly. No JSON.stringify.
            await tx.objectStore(storeName).put(value as unknown, storeKey);
            await tx.done;
        } catch (e) {
            // DataCloneError surfaces here for un-cloneable values (functions, DOM refs,
            // class instances with un-cloneable internal slots, circular refs of certain
            // shapes). Log loudly — silently falling back to the in-memory base would
            // hide a real bug in the caller's data.
            LogErrorEx({ error: e, message: (e as Error)?.message });
        }
    }

    public override async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        try {
            const db = await this.dbPromise;
            const storeName = this.getStoreName(category);
            const storeKey = this.getStoreKey(key, category);

            const value = await db.transaction(storeName).objectStore(storeName).get(storeKey);
            return (value === undefined ? null : (value as T));
        } catch (e) {
            LogErrorEx({ error: e, message: (e as Error)?.message });
            return null;
        }
    }

    /**
     * Batched read using a single IndexedDB transaction. The IndexedDB engine
     * serializes transactions on the same object store, so `Promise.all([...N gets])`
     * actually pays per-transaction setup overhead (~3–10ms each in most browsers).
     * Issuing all `get()` calls inside one transaction amortizes that overhead — for
     * 85 keys, this is the difference between ~425ms of IDB bookkeeping and ~10ms.
     *
     * Inputs are deduplicated (same key requested twice → one read, one map entry).
     * Missing keys map to `null`.
     */
    public override async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        if (keys.length === 0) return out;

        try {
            const db = await this.dbPromise;
            const storeName = this.getStoreName(category);
            const uniqueKeys = Array.from(new Set(keys));
            const storeKeys = uniqueKeys.map(k => this.getStoreKey(k, category));

            // Single transaction → single commit cost. The N gets within run in
            // parallel against the same store with no per-call transaction tax.
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const promises = storeKeys.map(sk => store.get(sk));
            const values = await Promise.all(promises);
            await tx.done;

            for (let i = 0; i < uniqueKeys.length; i++) {
                const value = values[i];
                out.set(uniqueKeys[i], value === undefined ? null : (value as T));
            }
            return out;
        } catch (e) {
            LogErrorEx({ error: e, message: (e as Error)?.message });
            // On error, return null entries for every requested key so callers can
            // distinguish "I asked but got nothing" from "key not present" if they
            // need to. They both look like cache misses to the consumer.
            for (const key of new Set(keys)) {
                out.set(key, null);
            }
            return out;
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
            LogErrorEx({ error: e, message: (e as Error)?.message });
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
            LogErrorEx({ error: e, message: (e as Error)?.message });
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
            LogErrorEx({ error: e, message: (e as Error)?.message });
            return [];
        }
    }
}
