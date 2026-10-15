/**
 * Mock Cache Storage Provider for Testing
 * Provides in-memory storage for LocalCacheManager tests without requiring actual storage backends
 */

import { ILocalStorageProvider } from '../../generic/interfaces';
import { CacheCategory } from '../../generic/localCacheManager';

/**
 * Simple in-memory implementation of ILocalStorageProvider for testing
 */
export class MockCacheStorageProvider implements ILocalStorageProvider {
    /**
     * `true` — SetItem stores the value as-is (no JSON round-trip), so this mock has the
     * same reference-sharing semantics as the production in-memory provider. That is
     * deliberate: it keeps the cache's defensive freeze ACTIVE under unit tests, so a
     * regression that mutates cached rows fails in CI rather than in production.
     */
    public readonly SharesReferences = true;

    private storage: Map<string, Map<string, unknown>> = new Map();
    private _getCallCount = 0;
    private _setCallCount = 0;
    private _removeCallCount = 0;
    private _simulateDelay = 0;
    private _simulateFailure = false;

    constructor() {
        // Initialize storage for each category
        this.storage.set(CacheCategory.RunViewCache, new Map());
        this.storage.set(CacheCategory.RunQueryCache, new Map());
        this.storage.set(CacheCategory.DatasetCache, new Map());
        this.storage.set(CacheCategory.Metadata, new Map());
        this.storage.set(CacheCategory.Default, new Map());
    }

    async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        this._getCallCount++;

        if (this._simulateDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this._simulateDelay));
        }

        if (this._simulateFailure) {
            throw new Error('Simulated storage failure');
        }

        const cat = category || CacheCategory.Default;
        const value = this.storage.get(cat)?.get(key);
        // the caller names the stored type, exactly as InMemoryLocalStorageProvider.GetItem does
        return value === undefined ? null : (value as T);
    }

    async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        // Batched read mirroring GetItem semantics (one entry per unique key) —
        // required by LocalCacheManager.GetRunViewResults (smart-cache flow).
        const out = new Map<string, T | null>();
        for (const key of new Set(keys)) {
            out.set(key, await this.GetItem<T>(key, category));
        }
        return out;
    }

    async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        this._setCallCount++;

        if (this._simulateDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this._simulateDelay));
        }

        if (this._simulateFailure) {
            throw new Error('Simulated storage failure');
        }

        const cat = category || CacheCategory.Default;
        let categoryStorage = this.storage.get(cat);
        if (!categoryStorage) {
            categoryStorage = new Map();
            this.storage.set(cat, categoryStorage);
        }
        categoryStorage.set(key, value);
    }

    async Remove(key: string, category?: string): Promise<void> {
        this._removeCallCount++;

        if (this._simulateDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this._simulateDelay));
        }

        if (this._simulateFailure) {
            throw new Error('Simulated storage failure');
        }

        const cat = category || CacheCategory.Default;
        const categoryStorage = this.storage.get(cat);
        categoryStorage?.delete(key);
    }

    async ClearCategory(category: string): Promise<void> {
        const categoryStorage = this.storage.get(category);
        categoryStorage?.clear();
    }

    async GetCategoryKeys(category: string): Promise<string[]> {
        const categoryStorage = this.storage.get(category);
        return categoryStorage ? Array.from(categoryStorage.keys()) : [];
    }

    // Test helper methods
    public get getCallCount(): number {
        return this._getCallCount;
    }

    public get setCallCount(): number {
        return this._setCallCount;
    }

    public get removeCallCount(): number {
        return this._removeCallCount;
    }

    public resetCallCounts(): void {
        this._getCallCount = 0;
        this._setCallCount = 0;
        this._removeCallCount = 0;
    }

    public setSimulateDelay(ms: number): void {
        this._simulateDelay = ms;
    }

    public setSimulateFailure(fail: boolean): void {
        this._simulateFailure = fail;
    }

    public clearAll(): void {
        for (const categoryStorage of this.storage.values()) {
            categoryStorage.clear();
        }
    }

    public getStorageSize(category: string): number {
        return this.storage.get(category)?.size || 0;
    }

    /**
     * Writes a value straight into storage, bypassing call counting, delay and failure simulation (test setup).
     * The value is stored as given, the way {@link SetItem} stores it.
     */
    public SetDirect<T>(key: string, value: T, category: string): void {
        let categoryStorage = this.storage.get(category);
        if (!categoryStorage) {
            categoryStorage = new Map();
            this.storage.set(category, categoryStorage);
        }
        categoryStorage.set(key, value);
    }

    /**
     * Reads a value straight from storage, bypassing call counting, delay and failure simulation (test
     * verification). The caller names the stored type, as with {@link GetItem}.
     */
    public GetDirect<T = unknown>(key: string, category: string): T | null {
        const value = this.storage.get(category)?.get(key);
        return value === undefined ? null : (value as T);
    }
}
