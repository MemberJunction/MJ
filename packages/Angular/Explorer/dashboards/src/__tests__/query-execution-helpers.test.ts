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
    NormalizeMaxRows,
    NormalizePageNumber,
    ComputePaging,
    BoundResultRows,
    NormalizeQueryParameters,
    ResolveTotalRowCount,
} from '../QueryBrowser/query-execution-helpers';

describe('query-execution-helpers', () => {
    describe('normalizeMaxRows', () => {
        it('returns the default when input is missing', () => {
            expect(NormalizeMaxRows(undefined)).toBe(DEFAULT_QUERY_MAX_ROWS);
            expect(NormalizeMaxRows(null)).toBe(DEFAULT_QUERY_MAX_ROWS);
        });

        it('returns the default for non-numeric / NaN input', () => {
            expect(NormalizeMaxRows('abc')).toBe(DEFAULT_QUERY_MAX_ROWS);
            expect(NormalizeMaxRows({})).toBe(DEFAULT_QUERY_MAX_ROWS);
        });

        it('returns the default for zero or negative input', () => {
            expect(NormalizeMaxRows(0)).toBe(DEFAULT_QUERY_MAX_ROWS);
            expect(NormalizeMaxRows(-5)).toBe(DEFAULT_QUERY_MAX_ROWS);
        });

        it('passes through a valid value within bounds', () => {
            expect(NormalizeMaxRows(10)).toBe(10);
            expect(NormalizeMaxRows('25')).toBe(25);
        });

        it('floors fractional values', () => {
            expect(NormalizeMaxRows(12.9)).toBe(12);
        });

        it('clamps DOWN to the hard cap and NEVER exceeds it', () => {
            expect(NormalizeMaxRows(QUERY_MAX_ROWS_HARD_CAP + 1)).toBe(QUERY_MAX_ROWS_HARD_CAP);
            expect(NormalizeMaxRows(10000)).toBe(QUERY_MAX_ROWS_HARD_CAP);
            expect(NormalizeMaxRows(Number.POSITIVE_INFINITY)).toBe(DEFAULT_QUERY_MAX_ROWS);
        });

        it('never returns more than the hard cap even when the default exceeds it', () => {
            // pathological: caller default above the cap must still be capped
            expect(NormalizeMaxRows(undefined, 9999)).toBe(QUERY_MAX_ROWS_HARD_CAP);
        });
    });

    describe('normalizePageNumber', () => {
        it('defaults missing / invalid / sub-1 input to page 1', () => {
            expect(NormalizePageNumber(undefined)).toBe(1);
            expect(NormalizePageNumber('xyz')).toBe(1);
            expect(NormalizePageNumber(0)).toBe(1);
            expect(NormalizePageNumber(-3)).toBe(1);
        });

        it('passes through and floors valid pages', () => {
            expect(NormalizePageNumber(1)).toBe(1);
            expect(NormalizePageNumber('4')).toBe(4);
            expect(NormalizePageNumber(3.7)).toBe(3);
        });
    });

    describe('computePaging', () => {
        it('computes a 0-based StartRow from a 1-based page', () => {
            expect(ComputePaging(1, 50)).toEqual({ startRow: 0, pageNumber: 1, pageSize: 50 });
            expect(ComputePaging(2, 50)).toEqual({ startRow: 50, pageNumber: 2, pageSize: 50 });
            expect(ComputePaging(3, 20)).toEqual({ startRow: 40, pageNumber: 3, pageSize: 20 });
        });

        it('uses the default page size when PageSize is omitted', () => {
            expect(ComputePaging(2, undefined)).toEqual({
                startRow: DEFAULT_QUERY_PAGE_SIZE,
                pageNumber: 2,
                pageSize: DEFAULT_QUERY_PAGE_SIZE,
            });
        });

        it('caps the page size at the hard cap (StartRow follows the capped size)', () => {
            const r = ComputePaging(2, 10000);
            expect(r.pageSize).toBe(QUERY_MAX_ROWS_HARD_CAP);
            expect(r.startRow).toBe(QUERY_MAX_ROWS_HARD_CAP);
        });

        it('treats invalid page input as page 1 (StartRow 0)', () => {
            expect(ComputePaging('bad', 25)).toEqual({ startRow: 0, pageNumber: 1, pageSize: 25 });
        });
    });

    describe('boundResultRows', () => {
        const rows = Array.from({ length: 500 }, (_, i) => i);

        it('returns an empty array for null / undefined / non-array input', () => {
            expect(BoundResultRows(null, 50)).toEqual([]);
            expect(BoundResultRows(undefined, 50)).toEqual([]);
            expect(BoundResultRows('nope' as unknown as number[], 50)).toEqual([]);
        });

        it('slices to the cap and NEVER returns more', () => {
            expect(BoundResultRows(rows, 50)).toHaveLength(50);
            expect(BoundResultRows(rows, 200)).toHaveLength(200);
        });

        it('returns all rows when under the cap', () => {
            expect(BoundResultRows([1, 2, 3], 50)).toEqual([1, 2, 3]);
        });

        it('returns a NEW array (does not mutate the input)', () => {
            const input = [1, 2, 3];
            const out = BoundResultRows(input, 2);
            expect(out).not.toBe(input);
            expect(input).toHaveLength(3);
        });

        it('treats a negative/NaN cap defensively (falls back to the hard cap)', () => {
            expect(BoundResultRows(rows, Number.NaN)).toHaveLength(QUERY_MAX_ROWS_HARD_CAP);
        });

        it('handles a zero cap as an empty result', () => {
            expect(BoundResultRows(rows, 0)).toEqual([]);
        });
    });

    describe('normalizeQueryParameters', () => {
        it('returns undefined for non-object input', () => {
            expect(NormalizeQueryParameters(undefined)).toBeUndefined();
            expect(NormalizeQueryParameters(null)).toBeUndefined();
            expect(NormalizeQueryParameters('x')).toBeUndefined();
            expect(NormalizeQueryParameters(42)).toBeUndefined();
        });

        it('returns undefined for arrays (not a valid params shape)', () => {
            expect(NormalizeQueryParameters([1, 2])).toBeUndefined();
        });

        it('returns undefined for an empty object', () => {
            expect(NormalizeQueryParameters({})).toBeUndefined();
        });

        it('shallow-copies own enumerable keys', () => {
            const input = { region: 'US', year: 2024 };
            const out = NormalizeQueryParameters(input);
            expect(out).toEqual({ region: 'US', year: 2024 });
            expect(out).not.toBe(input);
        });

        it('passes values through untouched (server validates/coerces)', () => {
            const out = NormalizeQueryParameters({ flag: true, list: [1, 2], nested: { a: 1 } });
            expect(out).toEqual({ flag: true, list: [1, 2], nested: { a: 1 } });
        });
    });

    describe('resolveTotalRowCount', () => {
        it('returns the provider TotalRowCount when it is a valid non-negative number', () => {
            // The whole point: the true total can EXCEED the bounded returned count.
            expect(ResolveTotalRowCount(1234, 50)).toBe(1234);
            expect(ResolveTotalRowCount(0, 0)).toBe(0);
        });

        it('returns the total even when it equals the returned count (unbounded run)', () => {
            expect(ResolveTotalRowCount(7, 7)).toBe(7);
        });

        it('floors a fractional total', () => {
            expect(ResolveTotalRowCount(99.9, 10)).toBe(99);
        });

        it('coerces a numeric-string total', () => {
            expect(ResolveTotalRowCount('500', 50)).toBe(500);
        });

        it('falls back to the returned count when the total is missing / non-numeric', () => {
            expect(ResolveTotalRowCount(undefined, 42)).toBe(42);
            expect(ResolveTotalRowCount(null, 42)).toBe(42);
            expect(ResolveTotalRowCount('abc', 42)).toBe(42);
            expect(ResolveTotalRowCount(Number.NaN, 42)).toBe(42);
        });

        it('falls back to the returned count when the total is negative', () => {
            expect(ResolveTotalRowCount(-1, 25)).toBe(25);
        });

        it('falls back to 0 when BOTH total and returned count are invalid', () => {
            expect(ResolveTotalRowCount(undefined, Number.NaN)).toBe(0);
            expect(ResolveTotalRowCount('x', -3)).toBe(0);
        });

        it('floors a fractional fallback returned count', () => {
            expect(ResolveTotalRowCount(undefined, 10.8)).toBe(10);
        });
    });
});
