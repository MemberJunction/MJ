/**
 * In-place slot maintenance (UpsertSingleEntity / RemoveSingleEntity / ApplyRowChanges) on a
 * reference-sharing provider deep-freezes only the rows that changed. Rows carried forward from
 * a slot that a complete freeze walk already covered are not walked again, so the freeze cost of
 * one save does not grow with the size of the cached result.
 */

import { describe, test, expect, vi } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import { RunViewParams } from '../views/runView';
import { ILocalStorageProvider } from '../generic/interfaces';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

const FINGERPRINT = 'Test Entity|||||||';
const PARAMS: RunViewParams = { EntityName: 'Test Entity' };
const MAX_UPDATED = '2026-01-04T00:00:00.000Z';
const SMALL_SLOT_ROWS = 200;
const LARGE_SLOT_ROWS = 2_000;

type Row = { ID: string; Name: string; __mj_UpdatedAt: string; Settings: { Theme: string } };

function makeRow(id: string): Row {
    return { ID: id, Name: `Row ${id}`, __mj_UpdatedAt: MAX_UPDATED, Settings: { Theme: 'dark' } };
}

/** Rows with one nested object each. */
function makeRows(count: number): Row[] {
    return Array.from({ length: count }, (_, i) => makeRow(`row-${i}`));
}

function keyOf(id: string): CompositeKey {
    return CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', id)]);
}

async function initCache(storage: ILocalStorageProvider): Promise<LocalCacheManager> {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
    const mgr = LocalCacheManager.Instance;
    await mgr.Initialize(storage, {
        enabled: true,
        maxSizeBytes: 50 * 1024 * 1024,
        defaultTTLMs: 5 * 60 * 1000,
        evictionPolicy: 'lru',
    });
    return mgr;
}

/** Runs `fn` and returns how many times `Object.freeze` was called while it ran. */
async function countFreezes(fn: () => Promise<unknown>): Promise<number> {
    const spy = vi.spyOn(Object, 'freeze');
    try {
        await fn();
        return spy.mock.calls.length;
    } finally {
        spy.mockRestore();
    }
}

async function cachedRows(mgr: LocalCacheManager): Promise<Row[]> {
    const cached = await mgr.GetRunViewResult(FINGERPRINT);
    expect(cached).not.toBeNull();
    return cached!.results as Row[];
}

function expectDeepFrozen(rows: Row[]): void {
    expect(Object.isFrozen(rows)).toBe(true);
    for (const row of rows) {
        expect(Object.isFrozen(row)).toBe(true);
        expect(Object.isFrozen(row.Settings)).toBe(true);
    }
}

/**
 * Stores a slot of `slotRows` rows on a fresh cache, runs `change` against it and returns how many
 * times `Object.freeze` was called during `change`.
 */
async function freezesForChange(
    slotRows: number,
    change: (mgr: LocalCacheManager) => Promise<unknown>
): Promise<number> {
    const storage = new MockCacheStorageProvider();
    try {
        const mgr = await initCache(storage);
        await mgr.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(slotRows), MAX_UPDATED);
        return await countFreezes(() => change(mgr));
    } finally {
        storage.clearAll();
    }
}

/** Freeze calls for the same change on a small and a large slot. */
async function freezesAtTwoSlotSizes(change: (mgr: LocalCacheManager) => Promise<unknown>): Promise<[number, number]> {
    return [await freezesForChange(SMALL_SLOT_ROWS, change), await freezesForChange(LARGE_SLOT_ROWS, change)];
}

describe('LocalCacheManager in-place update freezes only the changed rows', () => {
    test('an upsert freezes the same number of objects whatever the slot size', async () => {
        const [addSmall, addLarge] = await freezesAtTwoSlotSizes(mgr =>
            mgr.UpsertSingleEntity(FINGERPRINT, makeRow('new'), keyOf('new'), MAX_UPDATED)
        );
        expect(addLarge).toBe(addSmall);

        const [replaceSmall, replaceLarge] = await freezesAtTwoSlotSizes(mgr =>
            mgr.UpsertSingleEntity(FINGERPRINT, makeRow('row-7'), keyOf('row-7'), MAX_UPDATED)
        );
        expect(replaceLarge).toBe(replaceSmall);
    });

    test('a removal freezes the same number of objects whatever the slot size', async () => {
        const [small, large] = await freezesAtTwoSlotSizes(mgr =>
            mgr.RemoveSingleEntity(FINGERPRINT, keyOf('row-8'), MAX_UPDATED)
        );
        expect(large).toBe(small);
    });

    test('several changes in one ApplyRowChanges freeze the same number of objects whatever the slot size', async () => {
        const [small, large] = await freezesAtTwoSlotSizes(mgr =>
            mgr.ApplyRowChanges(
                FINGERPRINT,
                [
                    { Key: keyOf('a'), Row: makeRow('a') },
                    { Key: keyOf('b'), Row: makeRow('b') },
                    { Key: keyOf('row-1'), Row: null },
                ],
                MAX_UPDATED
            )
        );
        expect(large).toBe(small);
    });

    test('an upserted row that the caller froze shallowly has its nested values frozen', async () => {
        const storage = new MockCacheStorageProvider();
        const mgr = await initCache(storage);
        await mgr.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(SMALL_SLOT_ROWS), MAX_UPDATED);

        const added = Object.freeze(makeRow('new'));
        expect(await mgr.UpsertSingleEntity(FINGERPRINT, added, keyOf('new'), MAX_UPDATED)).toBe(true);

        expect(Object.isFrozen(added.Settings)).toBe(true);
        expectDeepFrozen(await cachedRows(mgr));
        storage.clearAll();
    });

    test('ApplyDifferentialUpdate freezes the same number of objects whatever the slot size', async () => {
        const [small, large] = await freezesAtTwoSlotSizes(mgr =>
            mgr.ApplyDifferentialUpdate(
                FINGERPRINT,
                PARAMS,
                [makeRow('row-3'), makeRow('added-diff')],
                [keyOf('row-1').ToConcatenatedString()],
                'ID',
                '2026-02-01T00:00:00.000Z'
            )
        );
        expect(large).toBe(small);
    });

    test('sharing a saved row across multiple cached fingerprints deep-freezes the row subtree only once', async () => {
        const storage = new MockCacheStorageProvider();
        const mgr = await initCache(storage);
        const fpA = 'Test Entity||OrderByA|||||';
        const fpB = 'Test Entity||OrderByB|||||';
        await mgr.SetRunViewResult(fpA, { EntityName: 'Test Entity', OrderBy: 'Name ASC' }, makeRows(SMALL_SLOT_ROWS), MAX_UPDATED);
        await mgr.SetRunViewResult(fpB, { EntityName: 'Test Entity', OrderBy: 'Name DESC' }, makeRows(SMALL_SLOT_ROWS), MAX_UPDATED);

        const sharedSavedRow = makeRow('shared-row');
        const firstSlotFreezes = await countFreezes(() =>
            mgr.UpsertSingleEntity(fpA, sharedSavedRow, keyOf('shared-row'), MAX_UPDATED)
        );
        const secondSlotFreezes = await countFreezes(() =>
            mgr.UpsertSingleEntity(fpB, sharedSavedRow, keyOf('shared-row'), MAX_UPDATED)
        );

        // First slot freezes [results, envelope, sharedSavedRow, sharedSavedRow.Settings] (4 objects);
        // second slot skips the already deeply-frozen row subtree and freezes only [results, envelope] (2 objects).
        expect(firstSlotFreezes).toBe(4);
        expect(secondSlotFreezes).toBe(2);
        storage.clearAll();
    });

    test('deep-freeze walks do not allocate intermediate Object.values arrays', async () => {
        const storage = new MockCacheStorageProvider();
        const mgr = await initCache(storage);
        const valuesSpy = vi.spyOn(Object, 'values');
        try {
            await mgr.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(SMALL_SLOT_ROWS), MAX_UPDATED);
            await mgr.UpsertSingleEntity(FINGERPRINT, makeRow('extra'), keyOf('extra'), MAX_UPDATED);
            expect(valuesSpy).not.toHaveBeenCalled();
        } finally {
            valuesSpy.mockRestore();
            storage.clearAll();
        }
    });

    test('a failed partial walk does not mark unfinished subtrees as deeply frozen', async () => {
        const storage = new MockCacheStorageProvider();
        const mgr = await initCache(storage);

        const sharedChild: { Theme: string; Extra?: { Nested: boolean } } = { Theme: 'dark' };
        const hostile = new Proxy({}, {
            preventExtensions() { throw new Error('hostile value refuses to freeze'); },
        });
        // `hostile` throws before `Extra` is added or visited on a later reuse if `sharedChild` were
        // prematurely committed to deeplyFrozenCacheObjects on a failed walk.
        const badRow = { ID: 'bad', Bad: hostile, Child: sharedChild, __mj_UpdatedAt: MAX_UPDATED };
        await mgr.SetRunViewResult(FINGERPRINT, PARAMS, [badRow], MAX_UPDATED);

        expect(Object.isFrozen(sharedChild)).toBe(false);
        sharedChild.Extra = { Nested: true };

        const goodFp = 'Test Entity||Good|||||';
        await mgr.SetRunViewResult(goodFp, PARAMS, [{ ID: 'good', Child: sharedChild, __mj_UpdatedAt: MAX_UPDATED }], MAX_UPDATED);
        expect(Object.isFrozen(sharedChild)).toBe(true);
        expect(Object.isFrozen(sharedChild.Extra)).toBe(true);
        storage.clearAll();
    });
});
