import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        private store = new Map<string, string>();
        getString(k: string): string | undefined { return this.store.get(k); }
        set(k: string, v: string): void { this.store.set(k, v); }
        delete(k: string): void { this.store.delete(k); }
        getAllKeys(): string[] { return Array.from(this.store.keys()); }
        clearAll(): void { this.store.clear(); }
    },
}));

import { MMKVStorageProvider } from '../providers/mmkv-storage-provider';

describe('MMKVStorageProvider', () => {
    it('declares a store that outlives the app process, so the metadata snapshot is saved to it', () => {
        expect(new MMKVStorageProvider().SupportsCrossProcessPersistence).toBe(true);
    });

    it('wipes all stored items and category indexes when ClearAll() is called', async () => {
        const provider = new MMKVStorageProvider();
        await provider.SetItem('k1', { a: 1 }, 'datasets');
        expect(await provider.GetItem('k1', 'datasets')).toEqual({ a: 1 });
        provider.ClearAll();
        expect(await provider.GetItem('k1', 'datasets')).toBeNull();
        expect(await provider.GetCategoryKeys('datasets')).toEqual([]);
    });
});
