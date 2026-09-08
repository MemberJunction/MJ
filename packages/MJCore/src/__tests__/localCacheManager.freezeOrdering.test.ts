/**
 * The freeze must land with NO await window after the decision to cache
 * (PR #3425 review, finding M6 and the ordering half of the blocker).
 *
 * Both write funnels used to run two awaited housekeeping steps —
 * `enforcePerEntityMemoryLimit` and `evictIfNeeded` — BETWEEN deciding to cache a row set and
 * freezing it. Every await is a yield point, and the row set in question is the caller's own
 * array, which the caller is simultaneously using:
 *
 *   - `GenericDatabaseProvider`'s smart-cache stale leg fires `SetRunViewResult` WITHOUT
 *     awaiting it and then awaits `TransformSimpleObjectToEntityObject` on that same array, so
 *     the freeze can land in the middle of entity construction. `BaseEntity.LoadFromData`
 *     samples `Object.isFrozen(this._raw)` exactly once, at the start — a freeze arriving after
 *     that sample leaves the record believing its row is writable, and the next READ of a date
 *     or fixed-width field throws while trying to memoize the conversion.
 *   - The query cache had the same shape, with the opposite failure: a caller mutating its rows
 *     during the window mutates them BEFORE the freeze, so the corrupted rows are what gets
 *     stored — silently, which is exactly what freeze-on-write exists to prevent.
 *
 * The fix moves the freeze to immediately after the only gate that can DECLINE the write (the
 * synchronous oversized-entry check), and before the two awaited eviction steps — neither of
 * which can cancel the write; they only evict OTHER entries to make room.
 *
 * These tests pin it structurally rather than by trying to lose a race: everything up to and
 * including the freeze is synchronous, so the rows are frozen by the time the write funnel
 * returns its promise — before any caller could interleave.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { RunViewParams } from '../views/runView';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

const PARAMS: RunViewParams = { EntityName: 'Ordering Entity' };

function makeRows(count = 2): Record<string, unknown>[] {
    return Array.from({ length: count }, (_, i) => ({
        ID: `row-${i}`,
        Name: `Name ${i}`,
        __mj_UpdatedAt: '2026-01-02T00:00:00.000Z',
    }));
}

async function initCache(config?: { maxSizeBytes?: number; maxEntryPercentOfCache?: number }): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const mgr = LocalCacheManager.Instance;
    await mgr.Initialize(new MockCacheStorageProvider(), {
        enabled: true,
        maxSizeBytes: config?.maxSizeBytes ?? 50 * 1024 * 1024,
        maxEntryPercentOfCache: config?.maxEntryPercentOfCache ?? 25,
        defaultTTLMs: 5 * 60 * 1000,
        evictionPolicy: 'lru',
    });
    return mgr;
}

describe('freeze-on-write ordering — no await window between decision and freeze', () => {
    beforeEach(() => {
        resetLocalCacheManager();
    });

    test('SetRunViewResult freezes before it yields to the event loop', async () => {
        const mgr = await initCache();
        const rows = makeRows();

        // Deliberately NOT awaited: this is exactly what the smart-cache stale leg does.
        const pending = mgr.SetRunViewResult('fp-view', PARAMS, rows, '2026-01-02T00:00:00.000Z');

        // If any await preceded the freeze, control would be back here with the rows still
        // mutable — the window in which a caller can be handed unfrozen shared state.
        expect(Object.isFrozen(rows)).toBe(true);
        expect(Object.isFrozen(rows[0])).toBe(true);

        await pending;
        expect(Object.isFrozen(rows)).toBe(true);
    });

    test('SetRunQueryResult freezes before it yields to the event loop', async () => {
        const mgr = await initCache();
        const rows = makeRows();

        const pending = mgr.SetRunQueryResult('fp-query', 'Some Query', rows, '2026-01-02T00:00:00.000Z');

        expect(Object.isFrozen(rows)).toBe(true);
        expect(Object.isFrozen(rows[0])).toBe(true);

        await pending;
    });

    test('a row set the cache DECLINES stays mutable for its caller', async () => {
        // The one gate that can refuse the write is the synchronous oversized-entry check, and
        // it must still run BEFORE the freeze: a result we never cache is not shared state, so
        // immobilizing the caller's own rows would be a pure regression.
        const mgr = await initCache({ maxSizeBytes: 1024, maxEntryPercentOfCache: 1 });
        const rows = makeRows(500);

        await mgr.SetRunViewResult('fp-oversized', PARAMS, rows, '2026-01-02T00:00:00.000Z');

        expect(Object.isFrozen(rows)).toBe(false);
        expect(await mgr.GetRunViewResult('fp-oversized')).toBeNull();
    });

    test('the scaffolding exemption still leaves rows mutable', async () => {
        // Metadata bootstrap mutates its rows in place by design; the ordering change must not
        // start freezing them.
        const mgr = await initCache();
        const rows = makeRows();

        await mgr.SetRunViewResult(
            'fp-scaffold', PARAMS, rows, '2026-01-02T00:00:00.000Z',
            undefined, undefined, undefined, undefined,
            { ProviderInternalScaffolding: true }
        );

        expect(Object.isFrozen(rows)).toBe(false);
    });

    test('the stored entry is still readable and correct after the reordering', async () => {
        const mgr = await initCache();
        await mgr.SetRunViewResult('fp-readback', PARAMS, makeRows(3), '2026-01-02T00:00:00.000Z');

        const cached = await mgr.GetRunViewResult('fp-readback');
        expect(cached).not.toBeNull();
        expect(cached!.results).toHaveLength(3);
        expect(Object.isFrozen(cached!.results)).toBe(true);
    });
});
