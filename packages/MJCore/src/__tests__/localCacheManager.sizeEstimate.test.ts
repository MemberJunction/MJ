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

    it('does not throw on a circular-reference row and returns a finite non-negative number (Fix 4)', () => {
        // A circular row makes JSON.stringify throw. Because rows are sampled at random, an
        // unguarded throw would be non-deterministic. Eviction sizing is approximate and must
        // never affect correctness, so it must never throw. Build a large set (forces the
        // sampling path) where one row is circular.
        const circular: Record<string, unknown> = { ID: 'c', Name: 'loop' };
        circular.self = circular;
        const rows: Record<string, unknown>[] = Array.from({ length: 200 }, (_, i) => ({ ID: String(i), Name: 'Widget' }));
        rows[100] = circular;

        let result = 0;
        expect(() => { result = asInternal(cm).estimateResultsSize(rows); }).not.toThrow();
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it('does not throw when EVERY sampled row is circular (small-set full-measure path)', () => {
        const mk = () => { const o: Record<string, unknown> = { ID: 'x' }; o.self = o; return o; };
        const rows = [mk(), mk(), mk()]; // <= 3 rows → full-measure branch, all circular
        let result = -1;
        expect(() => { result = asInternal(cm).estimateResultsSize(rows); }).not.toThrow();
        expect(result).toBe(0); // each row contributes 0 on stringify failure
    });

    // ---------------------------------------------------------------------------------------------
    // Additional edge coverage (non-overlapping with the cases above):
    //   - the exact full-measure ↔ sampling boundary (3 rows vs 4 rows)
    //   - rows carrying `undefined` field values (JSON.stringify drops them — never throws)
    //   - a single very wide row
    //   - a very large N (sampling path scales linearly, no overflow, finite)
    // ---------------------------------------------------------------------------------------------

    it('exactly 3 rows uses the full-measure branch (deterministic, exact size)', () => {
        // sampleCount = min(3, max(3, ceil(3*0.1)=1)) = 3 >= 3 → full measure (no Math.random).
        const rows = [{ ID: '1', V: 'aaaa' }, { ID: '2', V: 'bbbb' }, { ID: '3', V: 'cccc' }];
        const expected = rows.reduce((acc, r) => acc + JSON.stringify(r).length, 0) * 2;
        // Deterministic because it never enters the random-sampling branch.
        expect(asInternal(cm).estimateResultsSize(rows)).toBe(expected);
        expect(asInternal(cm).estimateResultsSize(rows)).toBe(expected); // repeatable
    });

    it('4 rows crosses into the sampling branch but still lands near the true size for homogeneous data', () => {
        // sampleCount = min(4, max(3, ceil(4*0.1)=1)) = 3 < 4 → sampling path.
        const rows = Array.from({ length: 4 }, (_, i) => ({ ID: String(i), V: 'fixed-width-value' }));
        const trueSize = rows.reduce((acc, r) => acc + JSON.stringify(r).length, 0) * 2;
        const est = asInternal(cm).estimateResultsSize(rows);
        // All rows are identical width, so any 3-of-4 sample averages to the exact per-row size.
        expect(est).toBe(trueSize);
    });

    it('handles rows with undefined field values without throwing (stringify omits them)', () => {
        const rows = Array.from({ length: 100 }, (_, i) => ({ ID: String(i), maybe: undefined, Name: 'X' }));
        let result = 0;
        expect(() => { result = asInternal(cm).estimateResultsSize(rows); }).not.toThrow();
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThan(0);
    });

    it('handles a single very wide row (full-measure, scaled x2)', () => {
        const wide: Record<string, string> = {};
        for (let i = 0; i < 500; i++) wide['col' + i] = 'value-' + i;
        const expected = JSON.stringify(wide).length * 2;
        expect(asInternal(cm).estimateResultsSize([wide])).toBe(expected);
    });

    it('produces a finite, positive, linearly-scaling estimate for a very large N', () => {
        const row = () => ({ ID: 'abcdef', Name: 'Widget', Note: 'some moderately sized note field' });
        const n = 100_000;
        const rows = Array.from({ length: n }, row);
        const perRow = JSON.stringify(row()).length;
        const est = asInternal(cm).estimateResultsSize(rows);
        expect(Number.isFinite(est)).toBe(true);
        // Homogeneous rows → estimate ≈ perRow * n * 2; allow generous sampling tolerance.
        expect(est).toBeGreaterThan(perRow * n * 2 * 0.8);
        expect(est).toBeLessThan(perRow * n * 2 * 1.2);
    });
});
