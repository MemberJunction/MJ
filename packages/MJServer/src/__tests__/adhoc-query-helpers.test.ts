import { describe, it, expect } from 'vitest';
import { exactTotalFromPage, resolveAdhocTotalRowCount } from '../resolvers/adhoc-query-helpers';

describe('exactTotalFromPage', () => {
    it('returns the row count when not paging (maxRows null) — the query was uncapped', () => {
        expect(exactTotalFromPage(0, 47, null)).toBe(47);
        expect(exactTotalFromPage(0, 0, null)).toBe(0);
    });

    it('returns startRow + pageLength for a SHORT page (fewer rows than the page size)', () => {
        expect(exactTotalFromPage(0, 47, 100)).toBe(47);   // page 1, short → exact total
        expect(exactTotalFromPage(200, 30, 100)).toBe(230); // page 3, short last page
        expect(exactTotalFromPage(100, 0, 100)).toBe(100);  // empty page past the end
    });

    it('returns null for a FULL page — a COUNT is required because more rows may exist', () => {
        expect(exactTotalFromPage(0, 100, 100)).toBeNull();
        expect(exactTotalFromPage(500, 100, 100)).toBeNull();
    });

    it('treats an over-full page defensively as "needs count" (should not occur with OFFSET/FETCH)', () => {
        expect(exactTotalFromPage(0, 150, 100)).toBeNull();
    });
});

describe('resolveAdhocTotalRowCount', () => {
    it('reads TotalRowCount from the count recordset', () => {
        expect(resolveAdhocTotalRowCount([{ TotalRowCount: 2087 }], 100)).toBe(2087);
        expect(resolveAdhocTotalRowCount([{ TotalRowCount: 0 }], 100)).toBe(0);
    });

    it('floors a fractional/stringified count', () => {
        expect(resolveAdhocTotalRowCount([{ TotalRowCount: 42.9 }], 0)).toBe(42);
        expect(resolveAdhocTotalRowCount([{ TotalRowCount: '2087' as unknown as number }], 0)).toBe(2087);
    });

    it('falls back when the count is absent, empty, null, or malformed', () => {
        expect(resolveAdhocTotalRowCount(null, 100)).toBe(100);
        expect(resolveAdhocTotalRowCount(undefined, 100)).toBe(100);
        expect(resolveAdhocTotalRowCount([], 100)).toBe(100);
        expect(resolveAdhocTotalRowCount([{}], 100)).toBe(100);
        expect(resolveAdhocTotalRowCount([{ TotalRowCount: null }], 100)).toBe(100);
    });

    it('falls back on non-finite or negative counts (never reports a misleading total)', () => {
        expect(resolveAdhocTotalRowCount([{ TotalRowCount: Number.NaN }], 100)).toBe(100);
        expect(resolveAdhocTotalRowCount([{ TotalRowCount: -5 }], 100)).toBe(100);
        expect(resolveAdhocTotalRowCount([{ TotalRowCount: Infinity }], 100)).toBe(100);
    });
});
