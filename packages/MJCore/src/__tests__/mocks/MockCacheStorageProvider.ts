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
    private storage: Map<string, Map<string, string>> = new Map();
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

    async GetItem(key: string, category?: string): Promise<string | null> {
        this._getCallCount++;

        if (this._simulateDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this._simulateDelay));
        }

        if (this._simulateFailure) {
            throw new Error('Simulated storage failure');
        }

        const cat = category || CacheCategory.Default;
        const categoryStorage = this.storage.get(cat);
        return categoryStorage?.get(key) ?? null;
    }

    async SetItem(key: string, value: string, category?: string): Promise<void> {
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
        return this.storage.get(category)?.size ?? 0;
    }

    /**
     * Directly set a value in storage (for test setup)
     */
    public setDirect(key: string, value: string, category: string): void {
        let categoryStorage = this.storage.get(category);
        if (!categoryStorage) {
            categoryStorage = new Map();
            this.storage.set(category, categoryStorage);
        }
        categoryStorage.set(key, value);
    }

    /**
     * Directly get a value from storage (for test verification)
     */
    public getDirect(key: string, category: string): string | null {
        return this.storage.get(category)?.get(key) ?? null;
    }
}
