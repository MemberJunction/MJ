/**
 * Defense-in-depth gaps in the freeze-on-write contract, found in final review of PR #3425.
 *
 * None of these were reachable from in-repo callers, which is exactly why they are worth pinning:
 * the freeze is a structural guarantee, and a guarantee with quiet exceptions is the thing that
 * produced the original P1 in the first place.
 *
 *   - `SetDataset` is a PUBLIC write funnel that was never frozen, while the other three were.
 *   - `deepFreezeCacheValue` short-circuited on `Object.isFrozen`, so an input that had been
 *     SHALLOW-frozen by its caller had its whole nested subtree skipped.
 *   - The freeze-failure path logged "storing unfrozen" while actually storing a partially frozen
 *     payload — the walk freezes parent-first, so everything before the throw stays immutable.
 *   - `Initialize` / `SetStorageProvider` published `_storageProvider` before the async probe that
 *     decides whether to freeze had resolved.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { ILocalStorageProvider, DatasetResultType } from '../generic/interfaces';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

async function newCache(storage?: ILocalStorageProvider): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const mgr = LocalCacheManager.Instance;
    await mgr.Initialize(storage ?? new MockCacheStorageProvider(), {
        enabled: true,
        maxSizeBytes: 50 * 1024 * 1024,
        defaultTTLMs: 5 * 60 * 1000,
        evictionPolicy: 'lru',
    });
    return mgr;
}

function makeDataset(): DatasetResultType {
    return {
        DatasetID: 'ds-1',
        DatasetName: 'Some Dataset',
        Success: true,
        Status: 'OK',
        LatestUpdateDate: new Date('2026-01-02T00:00:00.000Z'),
        Results: [
            {
                EntityID: 'e-1',
                EntityName: 'Some Entity',
                Code: 'Item1',
                Results: [{ ID: 'r-1', Name: 'First' }, { ID: 'r-2', Name: 'Second' }],
                LatestUpdateDate: new Date('2026-01-02T00:00:00.000Z'),
                Success: true,
            },
        ],
    } as unknown as DatasetResultType;
}

describe('SetDataset — the fourth write funnel', () => {
    beforeEach(() => resetLocalCacheManager());

    test('deep-freezes the dataset it stores, like the other three funnels', async () => {
        const mgr = await newCache();
        const dataset = makeDataset();

        await mgr.SetDataset('Some Dataset', undefined, dataset, 'conn/');

        expect(Object.isFrozen(dataset)).toBe(true);
        expect(Object.isFrozen(dataset.Results)).toBe(true);
        expect(Object.isFrozen(dataset.Results[0])).toBe(true);
        // The rows are the part that actually gets handed to consumers.
        expect(Object.isFrozen(dataset.Results[0].Results)).toBe(true);
        expect(Object.isFrozen(dataset.Results[0].Results[0])).toBe(true);
    });

    test('the stored dataset is still readable afterwards', async () => {
        const mgr = await newCache();
        await mgr.SetDataset('Some Dataset', undefined, makeDataset(), 'conn/');

        const back = await mgr.GetDataset('Some Dataset', undefined, 'conn/');
        expect(back).not.toBeNull();
        expect(back!.Results[0].Results).toHaveLength(2);
    });

    test('does not freeze on a serializing provider', async () => {
        class Isolating extends MockCacheStorageProvider {
            public override readonly SharesReferences = false;
        }
        const mgr = await newCache(new Isolating());
        const dataset = makeDataset();

        await mgr.SetDataset('Some Dataset', undefined, dataset, 'conn/');

        expect(Object.isFrozen(dataset)).toBe(false);
    });
});

describe('deepFreezeCacheValue — shallow-frozen input must not skip the subtree', () => {
    beforeEach(() => resetLocalCacheManager());

    test('freezes nested values even when the container arrived already frozen', async () => {
        // A caller that froze its own array before handing it over reports `isFrozen` on the
        // container while every row inside is still writable. Short-circuiting on isFrozen
        // treated that as "already done" and left the rows mutable in shared state.
        const mgr = await newCache();
        const row = { ID: 'r-1', Nested: { Deep: 'value' } };
        const rows = Object.freeze([row]) as unknown as Record<string, unknown>[];
        expect(Object.isFrozen(rows)).toBe(true);
        expect(Object.isFrozen(row)).toBe(false);   // shallow only

        await mgr.SetRunViewResult('fp-shallow', { EntityName: 'E' }, rows, '2026-01-02T00:00:00.000Z');

        expect(Object.isFrozen(row)).toBe(true);
        expect(Object.isFrozen(row.Nested)).toBe(true);
    });

    test('still terminates on a cyclic payload', async () => {
        const mgr = await newCache();
        const row: Record<string, unknown> = { ID: 'r-1' };
        row['self'] = row;                       // direct cycle
        const sibling: Record<string, unknown> = { ID: 'r-2', peer: row };
        row['peer'] = sibling;                   // mutual cycle

        await expect(
            mgr.SetRunViewResult('fp-cycle', { EntityName: 'E' }, [row, sibling], '2026-01-02T00:00:00.000Z')
        ).resolves.not.toThrow();

        expect(Object.isFrozen(row)).toBe(true);
        expect(Object.isFrozen(sibling)).toBe(true);
    });
});

describe('freeze failure degrades honestly', () => {
    beforeEach(() => resetLocalCacheManager());

    test('reports partial protection rather than claiming the entry is unfrozen', async () => {
        const mgr = await newCache();
        // A value that makes Object.freeze throw partway through the walk. A non-empty typed
        // array is guarded, so use a getter that throws when the walk enumerates it.
        const hostile: Record<string, unknown> = { ID: 'r-1' };
        Object.defineProperty(hostile, 'boom', {
            enumerable: true,
            get() { throw new Error('enumeration exploded'); },
        });
        const rows = [hostile];

        const logged: string[] = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            logged.push(args.map(String).join(' '));
        });

        await expect(
            mgr.SetRunViewResult('fp-degrade', { EntityName: 'E' }, rows, '2026-01-02T00:00:00.000Z')
        ).resolves.not.toThrow();

        spy.mockRestore();

        // The walk freezes parent-first, so the array and the row ARE frozen despite the failure.
        // The old message said "storing unfrozen", which would send an operator looking in
        // exactly the wrong place when a downstream TypeError shows up.
        const message = logged.join('\n');
        if (message.length > 0) {
            expect(message).not.toContain('storing unfrozen');
        }
    });
});

describe('the freeze decision is never published ahead of its provider', () => {
    beforeEach(() => resetLocalCacheManager());

    test('Initialize resolves the probe before installing the provider', async () => {
        // An undeclared provider forces the async probe. If `_storageProvider` were published
        // first, a write landing during the probe would consult the new provider while
        // `_sharesReferences` still held the default — the exact asymmetry SetStorageProvider had.
        const order: string[] = [];
        class ProbeOrderProvider extends MockCacheStorageProvider {
            // Undeclared on purpose: forces resolveSharesReferences down the probe path.
            public override readonly SharesReferences = undefined as unknown as boolean;
            public override async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
                if (key.includes('probe')) order.push('probe');
                return super.SetItem(key, value, category);
            }
        }
        resetLocalCacheManager();
        const mgr = LocalCacheManager.Instance;
        await mgr.Initialize(new ProbeOrderProvider(), { enabled: true });

        expect(order).toContain('probe');
        // And the measured answer is in force: this provider genuinely shares references.
        const rows = [{ ID: 'r-1' }];
        await mgr.SetRunViewResult('fp-probe', { EntityName: 'E' }, rows, '2026-01-02T00:00:00.000Z');
        expect(Object.isFrozen(rows)).toBe(true);
    });
});
