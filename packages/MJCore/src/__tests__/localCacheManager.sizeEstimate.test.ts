/**
 * Tests for LocalCacheManager.estimateResultsSize (Wave 2 #5).
 *
 * The size estimate switched from a full `JSON.stringify(entireArray)` to a random-sample
 * average × row count. These tests verify the contract: 0 for empty, full-measure for tiny
 * sets, sample-scaled for large sets, monotonic-ish with row count, and never throwing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

type Internal = { estimateResultsSize: (results: unknown[] | null | undefined) => number };
const asInternal = (cm: LocalCacheManager) => cm as unknown as Internal;

describe('LocalCacheManager.estimateResultsSize', () => {
    let cm: LocalCacheManager;
    beforeEach(() => {
        resetLocalCacheManager();
        cm = LocalCacheManager.Instance;
    });

    it('returns 0 for empty / null / undefined', () => {
        expect(asInternal(cm).estimateResultsSize([])).toBe(0);
        expect(asInternal(cm).estimateResultsSize(null)).toBe(0);
        expect(asInternal(cm).estimateResultsSize(undefined)).toBe(0);
    });

    it('measures every row when the set is tiny (<= 3 rows)', () => {
        const rows = [{ ID: '1', Name: 'A' }, { ID: '2', Name: 'B' }];
        // Exact: sum of stringified lengths * 2
        const expected = rows.reduce((acc, r) => acc + JSON.stringify(r).length, 0) * 2;
        expect(asInternal(cm).estimateResultsSize(rows)).toBe(expected);
    });

    it('produces a positive estimate that scales with row count for large homogeneous sets', () => {
        const row = () => ({ ID: 'abc', Name: 'Widget', Description: 'a fairly long description string' });
        const small = Array.from({ length: 100 }, row);
        const large = Array.from({ length: 1000 }, row);

        const sSmall = asInternal(cm).estimateResultsSize(small);
        const sLarge = asInternal(cm).estimateResultsSize(large);

        expect(sSmall).toBeGreaterThan(0);
        // ~10x the rows → ~10x the estimate (homogeneous rows, allow generous tolerance)
        expect(sLarge).toBeGreaterThan(sSmall * 7);
        expect(sLarge).toBeLessThan(sSmall * 13);
    });

    it('is close to the true serialized size for homogeneous rows', () => {
        const rows = Array.from({ length: 500 }, (_, i) => ({ ID: String(i), Name: 'Widget ' + i }));
        const trueSize = rows.reduce((acc, r) => acc + JSON.stringify(r).length, 0) * 2;
        const est = asInternal(cm).estimateResultsSize(rows);
        // Sampling estimate should land within ~25% of the true total for homogeneous data.
        expect(est).toBeGreaterThan(trueSize * 0.75);
        expect(est).toBeLessThan(trueSize * 1.25);
    });

    it('does not throw on rows with nested objects/arrays', () => {
        const rows = Array.from({ length: 50 }, (_, i) => ({ ID: i, nested: { a: [1, 2, 3], b: 'x' } }));
        expect(() => asInternal(cm).estimateResultsSize(rows)).not.toThrow();
        expect(asInternal(cm).estimateResultsSize(rows)).toBeGreaterThan(0);
    });
});
