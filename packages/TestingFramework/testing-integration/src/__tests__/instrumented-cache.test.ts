import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryLocalStorageProvider } from '@memberjunction/core';
import { InstrumentedLocalStorageProvider, UniqueFilter } from '../instrumented-cache';

describe('InstrumentedLocalStorageProvider', () => {
    let inner: InMemoryLocalStorageProvider;
    let provider: InstrumentedLocalStorageProvider;

    beforeEach(() => {
        inner = new InMemoryLocalStorageProvider();
        provider = new InstrumentedLocalStorageProvider(inner);
    });

    it('counts SetItem globally and per-category', async () => {
        await provider.SetItem('k', 'v', 'RunViewCache');
        expect(provider.SetItemCount).toBe(1);
        expect(provider.SetCount('RunViewCache')).toBe(1);
        expect(provider.SetCount('Other')).toBe(0);
    });

    it('counts GetItem and GetItems separately and per-category', async () => {
        await provider.GetItem('k', 'RunViewCache');
        await provider.GetItems(['a', 'b'], 'RunViewCache');
        expect(provider.GetItemCount).toBe(1);
        expect(provider.GetItemsCount).toBe(1);
        expect(provider.GetCount('RunViewCache')).toBe(2);
    });

    it('Remove bumps only RemoveCount', async () => {
        await provider.Remove('k', 'RunViewCache');
        expect(provider.RemoveCount).toBe(1);
        expect(provider.SetCount('RunViewCache')).toBe(0);
        expect(provider.GetCount('RunViewCache')).toBe(0);
    });

    it('keys an undefined category as "default"', async () => {
        await provider.SetItem('k', 'v');
        expect(provider.SetCount('default')).toBe(1);
    });

    it('ResetCounts zeroes all globals and clears per-category tallies', async () => {
        await provider.SetItem('k', 'v', 'RunViewCache');
        await provider.GetItem('k', 'RunViewCache');
        provider.ResetCounts();
        expect(provider.SetItemCount).toBe(0);
        expect(provider.GetItemCount).toBe(0);
        expect(provider.SetCount('RunViewCache')).toBe(0);
        expect(provider.GetCount('RunViewCache')).toBe(0);
    });

    it('delegates the stored value to the inner provider', async () => {
        await provider.SetItem('k', 'hello', 'cat');
        expect(await provider.GetItem<string>('k', 'cat')).toBe('hello');
    });
});

describe('UniqueFilter', () => {
    it('produces a textually-unique always-true filter per tag', () => {
        expect(UniqueFilter('Name', 's1')).toBe("Name <> 'zzz-cache-test-s1'");
        expect(UniqueFilter('Name', 's2')).not.toBe(UniqueFilter('Name', 's1'));
    });
});
