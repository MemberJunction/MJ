/**
 * Test for BaseSearchProvider.GetAvailableProviders (P5.5 dropdown helper).
 */
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import type { SearchSource, SearchFilters, SearchResultItem } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

class TestStorageProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'storage';
    public async Search(
        _query: string,
        _topK: number,
        _filters: SearchFilters | undefined,
        _contextUser: UserInfo,
    ): Promise<SearchResultItem[]> {
        return [];
    }
}

class TestVectorProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'vector';
    public async Search(
        _query: string,
        _topK: number,
        _filters: SearchFilters | undefined,
        _contextUser: UserInfo,
    ): Promise<SearchResultItem[]> {
        return [];
    }
}

describe('BaseSearchProvider.GetAvailableProviders (P5.5)', () => {
    it('introspects manually-registered subclasses and reports DriverClass + SourceType', () => {
        // Register two distinct providers against the real ClassFactory
        MJGlobal.Instance.ClassFactory.Register(BaseSearchProvider, TestStorageProvider, 'TestStorageProvider', 0);
        MJGlobal.Instance.ClassFactory.Register(BaseSearchProvider, TestVectorProvider, 'TestVectorProvider', 0);

        const list = BaseSearchProvider.GetAvailableProviders();
        const storage = list.find(e => e.DriverClass === 'TestStorageProvider');
        const vector = list.find(e => e.DriverClass === 'TestVectorProvider');

        expect(storage).toBeDefined();
        expect(storage?.SourceType).toBe('storage');
        expect(vector).toBeDefined();
        expect(vector?.SourceType).toBe('vector');

        // Sorted by DriverClass — TestStorageProvider comes before TestVectorProvider alphabetically
        const storageIdx = list.findIndex(e => e.DriverClass === 'TestStorageProvider');
        const vectorIdx = list.findIndex(e => e.DriverClass === 'TestVectorProvider');
        expect(storageIdx).toBeLessThan(vectorIdx);
    });
});
