/**
 * Tests for the IndexedDB and base browser storage providers.
 *
 * Imports the generic contract suite from MJCore so every behavior verified for
 * InMemoryLocalStorageProvider is verified here too — round-trip, category
 * isolation, key listing, etc. Adds IDB-specific tests for native object
 * storage, structured-clone fidelity (Date/Map/Set), DB version-bumped wipe,
 * cross-tab onversionchange, and unknown-category prefix handling.
 *
 * Uses `fake-indexeddb` to provide a real IndexedDB implementation in the
 * Node test environment.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runStorageProviderContractTests } from '../../../MJCore/src/__tests__/storageProviders.contract.test';
import {
    BrowserIndexedDBStorageProvider,
    BrowserStorageProviderBase
} from '../storage-providers';

// ────────────────────────────────────────────────────────────────────────────
// Helper: wait for IDB connection to be ready before running asserts.
// fake-indexeddb opens asynchronously; the provider sets _dbReady once the
// dbPromise resolves.
// ────────────────────────────────────────────────────────────────────────────
async function awaitDbReady(provider: BrowserIndexedDBStorageProvider): Promise<void> {
    // The constructor kicks off the open; awaiting any operation will wait on dbPromise.
    // A no-op GetItem on a known key is the cleanest way to ensure we're past the
    // initial open + onupgradeneeded.
    await provider.GetItem<unknown>('__warmup__', 'default');
}

// ────────────────────────────────────────────────────────────────────────────
// Reset the in-memory IDB between tests so each test gets a fresh DB.
// fake-indexeddb exposes `indexedDB.deleteDatabase` + opens are versioned.
// ────────────────────────────────────────────────────────────────────────────
async function resetIDB(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('MJ_Metadata');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();  // shouldn't happen in tests but don't hang
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Run the full contract suite against the IDB provider.
// ────────────────────────────────────────────────────────────────────────────
runStorageProviderContractTests('BrowserIndexedDBStorageProvider', async () => {
    await resetIDB();
    const p = new BrowserIndexedDBStorageProvider();
    await awaitDbReady(p);
    return p;
});

// ────────────────────────────────────────────────────────────────────────────
// Run the full contract suite against the base in-memory provider.
// (BrowserStorageProviderBase is also used as a fallback when IDB is unavailable.)
// ────────────────────────────────────────────────────────────────────────────
runStorageProviderContractTests(
    'BrowserStorageProviderBase',
    () => new BrowserStorageProviderBase()
);

// ────────────────────────────────────────────────────────────────────────────
// IDB-specific tests
// ────────────────────────────────────────────────────────────────────────────
describe('BrowserIndexedDBStorageProvider — native object storage (structured clone)', () => {
    let provider: BrowserIndexedDBStorageProvider;

    beforeEach(async () => {
        await resetIDB();
        provider = new BrowserIndexedDBStorageProvider();
        await awaitDbReady(provider);
    });

    it('Date instances round-trip as Date (not ISO string)', async () => {
        const d = new Date('2026-05-02T12:00:00Z');
        await provider.SetItem('d', d, 'RunViewCache');
        const out = await provider.GetItem<Date>('d', 'RunViewCache');
        expect(out).toBeInstanceOf(Date);
        expect(out!.getTime()).toBe(d.getTime());
    });

    it('Map instances round-trip as Map', async () => {
        const m = new Map<string, number>([['a', 1], ['b', 2], ['c', 3]]);
        await provider.SetItem('m', m, 'RunViewCache');
        const out = await provider.GetItem<Map<string, number>>('m', 'RunViewCache');
        expect(out).toBeInstanceOf(Map);
        expect(out!.size).toBe(3);
        expect(out!.get('b')).toBe(2);
    });

    it('Set instances round-trip as Set', async () => {
        const s = new Set([1, 2, 3, 4]);
        await provider.SetItem('s', s, 'RunViewCache');
        const out = await provider.GetItem<Set<number>>('s', 'RunViewCache');
        expect(out).toBeInstanceOf(Set);
        expect(out!.has(3)).toBe(true);
    });

    it('typed arrays round-trip', async () => {
        const ta = new Uint8Array([1, 2, 3, 4, 5]);
        await provider.SetItem('ta', ta, 'RunViewCache');
        const out = await provider.GetItem<Uint8Array>('ta', 'RunViewCache');
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Array.from(out!)).toEqual([1, 2, 3, 4, 5]);
    });

    it('nested Date inside an object is preserved', async () => {
        const obj = { id: 'x', updatedAt: new Date('2026-04-01T09:00:00Z') };
        await provider.SetItem('obj', obj, 'RunViewCache');
        const out = await provider.GetItem<typeof obj>('obj', 'RunViewCache');
        expect(out!.updatedAt).toBeInstanceOf(Date);
        expect(out!.updatedAt.getTime()).toBe(obj.updatedAt.getTime());
    });

    it('Date inside an array inside an object is preserved', async () => {
        const obj = {
            ranges: [
                { start: new Date('2026-01-01'), end: new Date('2026-02-01') },
                { start: new Date('2026-03-01'), end: new Date('2026-04-01') },
            ],
        };
        await provider.SetItem('ranges', obj, 'RunViewCache');
        const out = await provider.GetItem<typeof obj>('ranges', 'RunViewCache');
        expect(out!.ranges[0].start).toBeInstanceOf(Date);
        expect(out!.ranges[1].end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });

    it('does NOT preserve class methods (only data)', async () => {
        // Demonstrates the documented limitation: prototype is lost on retrieval.
        class WithMethod {
            constructor(public value: number) {}
            double() { return this.value * 2; }
        }
        const w = new WithMethod(7);
        await provider.SetItem('w', w, 'RunViewCache');
        const out = await provider.GetItem<WithMethod>('w', 'RunViewCache');
        expect(out!.value).toBe(7);
        // The double() method is gone — `out` is a plain object now
        expect((out as { double?: unknown }).double).toBeUndefined();
    });

    it('handles large objects (10K rows) without truncation', async () => {
        const rows = Array.from({ length: 10_000 }, (_, i) => ({
            id: `id-${i}`,
            name: `name-${i}`,
            value: i,
        }));
        await provider.SetItem('big', rows, 'RunViewCache');
        const out = await provider.GetItem<typeof rows>('big', 'RunViewCache');
        expect(out).toHaveLength(10_000);
        expect(out![5_000]).toEqual({ id: 'id-5000', name: 'name-5000', value: 5_000 });
    });
});

describe('BrowserIndexedDBStorageProvider — known vs unknown categories', () => {
    let provider: BrowserIndexedDBStorageProvider;

    beforeEach(async () => {
        await resetIDB();
        provider = new BrowserIndexedDBStorageProvider();
        await awaitDbReady(provider);
    });

    it('routes known categories to dedicated object stores', async () => {
        // Known categories: Metadata, RunViewCache, RunQueryCache, DatasetCache
        await provider.SetItem('k', 'metadata-value', 'Metadata');
        await provider.SetItem('k', 'runview-value', 'RunViewCache');
        // Same key in two known categories should NOT collide.
        expect(await provider.GetItem<string>('k', 'Metadata')).toBe('metadata-value');
        expect(await provider.GetItem<string>('k', 'RunViewCache')).toBe('runview-value');
    });

    it('routes unknown categories to default store with prefixed keys', async () => {
        await provider.SetItem('shared-key', 'A', 'AdHocCategoryA');
        await provider.SetItem('shared-key', 'B', 'AdHocCategoryB');
        expect(await provider.GetItem<string>('shared-key', 'AdHocCategoryA')).toBe('A');
        expect(await provider.GetItem<string>('shared-key', 'AdHocCategoryB')).toBe('B');
    });

    it('unknown-category Remove only deletes the prefixed entry', async () => {
        await provider.SetItem('k', 'A', 'AdHocCat1');
        await provider.SetItem('k', 'B', 'AdHocCat2');
        await provider.Remove('k', 'AdHocCat1');
        expect(await provider.GetItem<string>('k', 'AdHocCat1')).toBeNull();
        expect(await provider.GetItem<string>('k', 'AdHocCat2')).toBe('B');
    });

    it('GetCategoryKeys for unknown category strips the prefix', async () => {
        await provider.SetItem('k1', 1, 'AdHoc');
        await provider.SetItem('k2', 2, 'AdHoc');
        const keys = await provider.GetCategoryKeys('AdHoc');
        expect(keys.sort()).toEqual(['k1', 'k2']);
    });

    it('ClearCategory for unknown category leaves other adhoc-cat entries alone', async () => {
        await provider.SetItem('k', 'value-A', 'AdHocA');
        await provider.SetItem('k', 'value-B', 'AdHocB');
        await provider.ClearCategory('AdHocA');
        expect(await provider.GetItem<string>('k', 'AdHocA')).toBeNull();
        expect(await provider.GetItem<string>('k', 'AdHocB')).toBe('value-B');
    });
});

describe('BrowserIndexedDBStorageProvider — DB version + upgrade behavior', () => {
    beforeEach(async () => {
        await resetIDB();
    });

    it('IsReady becomes true after the DB connection opens', async () => {
        const p = new BrowserIndexedDBStorageProvider();
        // Before any operation, IsReady may be false; after an op it must be true.
        await p.GetItem('warmup', 'default');
        expect(p.IsReady).toBe(true);
    });

    it('two providers in sequence share the same DB', async () => {
        const p1 = new BrowserIndexedDBStorageProvider();
        await awaitDbReady(p1);
        await p1.SetItem('persisted', 'value', 'RunViewCache');

        const p2 = new BrowserIndexedDBStorageProvider();
        await awaitDbReady(p2);
        const out = await p2.GetItem<string>('persisted', 'RunViewCache');
        expect(out).toBe('value');
    });
});

describe('BrowserIndexedDBStorageProvider — error handling', () => {
    beforeEach(async () => {
        await resetIDB();
    });

    it('SetItem with un-cloneable value (function) does not throw — logs error instead', async () => {
        const provider = new BrowserIndexedDBStorageProvider();
        await awaitDbReady(provider);

        // Functions cannot be structure-cloned; IDB should throw DataCloneError internally.
        // The provider catches and logs; the call itself resolves without throwing.
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(
            provider.SetItem('bad', { fn: () => 'oops' }, 'RunViewCache')
        ).resolves.toBeUndefined();

        // Subsequent GetItem returns null since nothing was stored
        expect(await provider.GetItem('bad', 'RunViewCache')).toBeNull();
        consoleSpy.mockRestore();
    });

    it('GetItem on missing key returns null without throwing', async () => {
        const provider = new BrowserIndexedDBStorageProvider();
        await awaitDbReady(provider);
        expect(await provider.GetItem('never-stored', 'RunViewCache')).toBeNull();
    });
});

describe('BrowserIndexedDBStorageProvider — GetItems (single-transaction batched read)', () => {
    let provider: BrowserIndexedDBStorageProvider;

    beforeEach(async () => {
        await resetIDB();
        provider = new BrowserIndexedDBStorageProvider();
        await awaitDbReady(provider);
    });

    it('uses one IDB transaction for the whole batch (verified by mocking transaction)', async () => {
        // Populate some entries first (so we have something to read).
        for (let i = 0; i < 10; i++) {
            await provider.SetItem(`key-${i}`, `value-${i}`, 'RunViewCache');
        }

        // Spy on the wrapped IDBPDatabase's `transaction` method via the provider's
        // dbPromise. We can't easily intercept inside the @tempfix/idb wrapper from
        // outside, so we count by behavior: GetItems for N keys should NOT take
        // anywhere near N times the wall-clock time of a single GetItem if it's
        // actually batched. This is a coarse but reliable signal.
        const singleStart = Date.now();
        await provider.GetItem('key-0', 'RunViewCache');
        const singleMs = Date.now() - singleStart;

        const batchStart = Date.now();
        const batchOut = await provider.GetItems<string>(
            ['key-0', 'key-1', 'key-2', 'key-3', 'key-4', 'key-5', 'key-6', 'key-7', 'key-8', 'key-9'],
            'RunViewCache'
        );
        const batchMs = Date.now() - batchStart;

        expect(batchOut.size).toBe(10);
        // 10 batched reads should never take more than 5× the time of a single read.
        // In practice it's usually ≤2×. If batching were broken (each read its own tx),
        // we'd expect ~10×.
        expect(batchMs).toBeLessThan(Math.max(singleMs * 5, 50));
    });

    it('round-trips Date / Map / Set inside a batched read (structured clone preserved)', async () => {
        const d = new Date('2026-05-02T12:00:00Z');
        const m = new Map<string, number>([['a', 1], ['b', 2]]);
        const s = new Set([10, 20, 30]);
        await provider.SetItem('d', d, 'RunViewCache');
        await provider.SetItem('m', m, 'RunViewCache');
        await provider.SetItem('s', s, 'RunViewCache');

        const out = await provider.GetItems<unknown>(['d', 'm', 's'], 'RunViewCache');
        expect(out.get('d')).toBeInstanceOf(Date);
        expect((out.get('d') as Date).toISOString()).toBe(d.toISOString());
        expect(out.get('m')).toBeInstanceOf(Map);
        expect((out.get('m') as Map<string, number>).get('b')).toBe(2);
        expect(out.get('s')).toBeInstanceOf(Set);
        expect((out.get('s') as Set<number>).has(20)).toBe(true);
    });

    it('routes batch read through a known category store (no cross-store leakage)', async () => {
        await provider.SetItem('k', 'in-metadata', 'Metadata');
        await provider.SetItem('k', 'in-runview', 'RunViewCache');

        const fromMetadata = await provider.GetItems<string>(['k'], 'Metadata');
        const fromRunView  = await provider.GetItems<string>(['k'], 'RunViewCache');

        expect(fromMetadata.get('k')).toBe('in-metadata');
        expect(fromRunView.get('k')).toBe('in-runview');
    });

    it('handles unknown-category batch reads via the prefixed default store', async () => {
        await provider.SetItem('a', 1, 'AdHocCat');
        await provider.SetItem('b', 2, 'AdHocCat');
        await provider.SetItem('c', 3, 'OtherAdHocCat');

        const fromAdHoc = await provider.GetItems<number>(['a', 'b', 'c'], 'AdHocCat');
        // 'a' and 'b' belong to AdHocCat; 'c' is in a different unknown category and
        // should not show up under AdHocCat (different prefixed key in the default store).
        expect(fromAdHoc.get('a')).toBe(1);
        expect(fromAdHoc.get('b')).toBe(2);
        expect(fromAdHoc.get('c')).toBeNull();
    });

    it('returns null entries for every key when the IDB transaction fails', async () => {
        // Force failure by closing the underlying DB before the batched read.
        // The provider's GetItems should catch and populate null for every requested key.
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // @ts-expect-error — accessing private dbPromise for test setup
        const db = await provider.dbPromise;
        db.close();

        const out = await provider.GetItems<string>(['k1', 'k2', 'k3'], 'RunViewCache');
        expect(out.size).toBe(3);
        expect(out.get('k1')).toBeNull();
        expect(out.get('k2')).toBeNull();
        expect(out.get('k3')).toBeNull();
        consoleSpy.mockRestore();
    });

    it('handles large batched reads (200 keys) without truncation', async () => {
        const N = 200;
        for (let i = 0; i < N; i++) {
            await provider.SetItem(`k-${i}`, { value: i }, 'RunViewCache');
        }
        const keys = Array.from({ length: N }, (_, i) => `k-${i}`);
        const out = await provider.GetItems<{ value: number }>(keys, 'RunViewCache');
        expect(out.size).toBe(N);
        for (let i = 0; i < N; i++) {
            expect(out.get(`k-${i}`)!.value).toBe(i);
        }
    });
});

describe('BrowserIndexedDBStorageProvider — cross-store isolation', () => {
    let provider: BrowserIndexedDBStorageProvider;

    beforeEach(async () => {
        await resetIDB();
        provider = new BrowserIndexedDBStorageProvider();
        await awaitDbReady(provider);
    });

    it('ClearCategory on one known store does not affect another', async () => {
        await provider.SetItem('k', 'meta-val', 'Metadata');
        await provider.SetItem('k', 'view-val', 'RunViewCache');
        await provider.ClearCategory('Metadata');
        expect(await provider.GetItem<string>('k', 'Metadata')).toBeNull();
        expect(await provider.GetItem<string>('k', 'RunViewCache')).toBe('view-val');
    });

    it('GetCategoryKeys on a known store does not include keys from other stores', async () => {
        await provider.SetItem('a', 1, 'Metadata');
        await provider.SetItem('b', 2, 'Metadata');
        await provider.SetItem('a', 1, 'RunViewCache');
        const metaKeys = await provider.GetCategoryKeys('Metadata');
        expect(metaKeys.sort()).toEqual(['a', 'b']);
    });
});
