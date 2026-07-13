/**
 * Tests for the Query Browser's STORED-QUERY execution helpers
 * (`QueryBrowser/query-execution-helpers.ts`).
 *
 * These pure helpers back the bounded execution tools (RunStoredQuery /
 * PageQueryResults / GetQueryMetadata). They MUST: never throw on untrusted
 * input, never allow more than the hard cap of rows through, and produce
 * correct 1-based-page → 0-based-StartRow paging math.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_QUERY_MAX_ROWS,
    QUERY_MAX_ROWS_HARD_CAP,
    DEFAULT_QUERY_PAGE_SIZE,
    normalizeMaxRows,
    normalizePageNumber,
    computePaging,
    boundResultRows,
    normalizeQueryParameters,
    resolveTotalRowCount,
} from '../QueryBrowser/query-execution-helpers';

describe('query-execution-helpers', () => {
    describe('normalizeMaxRows', () => {
        it('returns the default when input is missing', () => {
            expect(normalizeMaxRows(undefined)).toBe(DEFAULT_QUERY_MAX_ROWS);
            expect(normalizeMaxRows(null)).toBe(DEFAULT_QUERY_MAX_ROWS);
        });

        it('returns the default for non-numeric / NaN input', () => {
            expect(normalizeMaxRows('abc')).toBe(DEFAULT_QUERY_MAX_ROWS);
            expect(normalizeMaxRows({})).toBe(DEFAULT_QUERY_MAX_ROWS);
        });

        it('returns the default for zero or negative input', () => {
            expect(normalizeMaxRows(0)).toBe(DEFAULT_QUERY_MAX_ROWS);
            expect(normalizeMaxRows(-5)).toBe(DEFAULT_QUERY_MAX_ROWS);
        });

        it('passes through a valid value within bounds', () => {
            expect(normalizeMaxRows(10)).toBe(10);
            expect(normalizeMaxRows('25')).toBe(25);
        });

        it('floors fractional values', () => {
            expect(normalizeMaxRows(12.9)).toBe(12);
        });

        it('clamps DOWN to the hard cap and NEVER exceeds it', () => {
            expect(normalizeMaxRows(QUERY_MAX_ROWS_HARD_CAP + 1)).toBe(QUERY_MAX_ROWS_HARD_CAP);
            expect(normalizeMaxRows(10000)).toBe(QUERY_MAX_ROWS_HARD_CAP);
            expect(normalizeMaxRows(Number.POSITIVE_INFINITY)).toBe(DEFAULT_QUERY_MAX_ROWS);
        });

        it('never returns more than the hard cap even when the default exceeds it', () => {
            // pathological: caller default above the cap must still be capped
            expect(normalizeMaxRows(undefined, 9999)).toBe(QUERY_MAX_ROWS_HARD_CAP);
        });
    });

    describe('normalizePageNumber', () => {
        it('defaults missing / invalid / sub-1 input to page 1', () => {
            expect(normalizePageNumber(undefined)).toBe(1);
            expect(normalizePageNumber('xyz')).toBe(1);
            expect(normalizePageNumber(0)).toBe(1);
            expect(normalizePageNumber(-3)).toBe(1);
        });

        it('passes through and floors valid pages', () => {
            expect(normalizePageNumber(1)).toBe(1);
            expect(normalizePageNumber('4')).toBe(4);
            expect(normalizePageNumber(3.7)).toBe(3);
        });
    });

    describe('computePaging', () => {
        it('computes a 0-based StartRow from a 1-based page', () => {
            expect(computePaging(1, 50)).toEqual({ startRow: 0, pageNumber: 1, pageSize: 50 });
            expect(computePaging(2, 50)).toEqual({ startRow: 50, pageNumber: 2, pageSize: 50 });
            expect(computePaging(3, 20)).toEqual({ startRow: 40, pageNumber: 3, pageSize: 20 });
        });

        it('uses the default page size when PageSize is omitted', () => {
            expect(computePaging(2, undefined)).toEqual({
                startRow: DEFAULT_QUERY_PAGE_SIZE,
                pageNumber: 2,
                pageSize: DEFAULT_QUERY_PAGE_SIZE,
            });
        });

        it('caps the page size at the hard cap (StartRow follows the capped size)', () => {
            const r = computePaging(2, 10000);
            expect(r.pageSize).toBe(QUERY_MAX_ROWS_HARD_CAP);
            expect(r.startRow).toBe(QUERY_MAX_ROWS_HARD_CAP);
        });

        it('treats invalid page input as page 1 (StartRow 0)', () => {
            expect(computePaging('bad', 25)).toEqual({ startRow: 0, pageNumber: 1, pageSize: 25 });
        });
    });

    describe('boundResultRows', () => {
        const rows = Array.from({ length: 500 }, (_, i) => i);

        it('returns an empty array for null / undefined / non-array input', () => {
            expect(boundResultRows(null, 50)).toEqual([]);
            expect(boundResultRows(undefined, 50)).toEqual([]);
            expect(boundResultRows('nope' as unknown as number[], 50)).toEqual([]);
        });

        it('slices to the cap and NEVER returns more', () => {
            expect(boundResultRows(rows, 50)).toHaveLength(50);
            expect(boundResultRows(rows, 200)).toHaveLength(200);
        });

        it('returns all rows when under the cap', () => {
            expect(boundResultRows([1, 2, 3], 50)).toEqual([1, 2, 3]);
        });

        it('returns a NEW array (does not mutate the input)', () => {
            const input = [1, 2, 3];
            const out = boundResultRows(input, 2);
            expect(out).not.toBe(input);
            expect(input).toHaveLength(3);
        });

        it('treats a negative/NaN cap defensively (falls back to the hard cap)', () => {
            expect(boundResultRows(rows, Number.NaN)).toHaveLength(QUERY_MAX_ROWS_HARD_CAP);
        });

        it('handles a zero cap as an empty result', () => {
            expect(boundResultRows(rows, 0)).toEqual([]);
        });
    });

    describe('normalizeQueryParameters', () => {
        it('returns undefined for non-object input', () => {
            expect(normalizeQueryParameters(undefined)).toBeUndefined();
            expect(normalizeQueryParameters(null)).toBeUndefined();
            expect(normalizeQueryParameters('x')).toBeUndefined();
            expect(normalizeQueryParameters(42)).toBeUndefined();
        });

        it('returns undefined for arrays (not a valid params shape)', () => {
            expect(normalizeQueryParameters([1, 2])).toBeUndefined();
        });

        it('returns undefined for an empty object', () => {
            expect(normalizeQueryParameters({})).toBeUndefined();
        });

        it('shallow-copies own enumerable keys', () => {
            const input = { region: 'US', year: 2024 };
            const out = normalizeQueryParameters(input);
            expect(out).toEqual({ region: 'US', year: 2024 });
            expect(out).not.toBe(input);
        });

        it('passes values through untouched (server validates/coerces)', () => {
            const out = normalizeQueryParameters({ flag: true, list: [1, 2], nested: { a: 1 } });
            expect(out).toEqual({ flag: true, list: [1, 2], nested: { a: 1 } });
        });
    });

    describe('resolveTotalRowCount', () => {
        it('returns the provider TotalRowCount when it is a valid non-negative number', () => {
            // The whole point: the true total can EXCEED the bounded returned count.
            expect(resolveTotalRowCount(1234, 50)).toBe(1234);
            expect(resolveTotalRowCount(0, 0)).toBe(0);
        });

        it('returns the total even when it equals the returned count (unbounded run)', () => {
            expect(resolveTotalRowCount(7, 7)).toBe(7);
        });

        it('floors a fractional total', () => {
            expect(resolveTotalRowCount(99.9, 10)).toBe(99);
        });

        it('coerces a numeric-string total', () => {
            expect(resolveTotalRowCount('500', 50)).toBe(500);
        });

        it('falls back to the returned count when the total is missing / non-numeric', () => {
            expect(resolveTotalRowCount(undefined, 42)).toBe(42);
            expect(resolveTotalRowCount(null, 42)).toBe(42);
            expect(resolveTotalRowCount('abc', 42)).toBe(42);
            expect(resolveTotalRowCount(Number.NaN, 42)).toBe(42);
        });

        it('falls back to the returned count when the total is negative', () => {
            expect(resolveTotalRowCount(-1, 25)).toBe(25);
        });

        it('falls back to 0 when BOTH total and returned count are invalid', () => {
            expect(resolveTotalRowCount(undefined, Number.NaN)).toBe(0);
            expect(resolveTotalRowCount('x', -3)).toBe(0);
        });

        it('floors a fractional fallback returned count', () => {
            expect(resolveTotalRowCount(undefined, 10.8)).toBe(10);
        });
    });
});
