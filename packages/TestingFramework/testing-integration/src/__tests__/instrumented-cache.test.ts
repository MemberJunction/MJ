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

    it('reports the inner store\'s SupportsCrossProcessPersistence', () => {
        expect(provider.SupportsCrossProcessPersistence).toBe(false);
        const persistent = Object.assign(new InMemoryLocalStorageProvider(), { SupportsCrossProcessPersistence: true });
        expect(new InstrumentedLocalStorageProvider(persistent).SupportsCrossProcessPersistence).toBe(true);
    });

    it('counts SetItem globally and per-category', async () => {
        await provider.SetItem('k', 'v', 'RunViewCache');
        expect(provider.SetItemCount).toBe(1);
        expect(provider.SetCount('RunViewCache')).toBe(1);
        expect(provider.SetCount('Other')).toBe(0);
    });

    it('counts SetItem per key, and ResetCounts clears it', async () => {
        await provider.SetItem('a', 'v', 'RunViewCache');
        await provider.SetItem('a', 'w', 'RunViewCache');
        await provider.SetItem('b', 'v', 'RunViewCache');
        expect(provider.SetCountForKey('a')).toBe(2);
        expect(provider.SetCountForKey('b')).toBe(1);
        expect(provider.SetCountForKey('c')).toBe(0);
        provider.ResetCounts();
        expect(provider.SetCountForKey('a')).toBe(0);
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

    it('exposes the optional shared-store members only when the inner provider has them', async () => {
        expect(provider.WithKeyLock).toBeUndefined();
        expect(provider.TryAcquireLease).toBeUndefined();

        const shared = new InMemoryLocalStorageProvider() as InMemoryLocalStorageProvider & {
            TryAcquireLease: (name: string, ttlMs: number) => Promise<boolean>;
            WithKeyLock: <T>(key: string, category: string, work: () => Promise<T>) => Promise<T>;
        };
        const leases: Array<[string, number]> = [];
        shared.TryAcquireLease = async (name, ttlMs) => { leases.push([name, ttlMs]); return leases.length === 1; };
        shared.WithKeyLock = async (_key, _category, work) => work();
        const wrapped = new InstrumentedLocalStorageProvider(shared);

        expect(await wrapped.TryAcquireLease!('sweep:X', 500)).toBe(true);
        expect(await wrapped.TryAcquireLease!('sweep:X', 500)).toBe(false);
        expect(leases).toEqual([['sweep:X', 500], ['sweep:X', 500]]);
        expect(await wrapped.WithKeyLock!('k', 'cat', async () => 42)).toBe(42);
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
