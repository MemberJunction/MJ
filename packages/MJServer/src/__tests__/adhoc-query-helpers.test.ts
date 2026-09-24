import { describe, it, expect } from 'vitest';
import { ExactTotalFromPage, ResolveAdhocTotalRowCount } from '../resolvers/adhoc-query-helpers';

describe('exactTotalFromPage', () => {
    it('returns the row count when not paging (maxRows null) — the query was uncapped', () => {
        expect(ExactTotalFromPage(0, 47, null)).toBe(47);
        expect(ExactTotalFromPage(0, 0, null)).toBe(0);
    });

    it('returns startRow + pageLength for a SHORT page (fewer rows than the page size)', () => {
        expect(ExactTotalFromPage(0, 47, 100)).toBe(47);   // page 1, short → exact total
        expect(ExactTotalFromPage(200, 30, 100)).toBe(230); // page 3, short last page
        expect(ExactTotalFromPage(100, 0, 100)).toBe(100);  // empty page past the end
    });

    it('returns null for a FULL page — a COUNT is required because more rows may exist', () => {
        expect(ExactTotalFromPage(0, 100, 100)).toBeNull();
        expect(ExactTotalFromPage(500, 100, 100)).toBeNull();
    });

    it('treats an over-full page defensively as "needs count" (should not occur with OFFSET/FETCH)', () => {
        expect(ExactTotalFromPage(0, 150, 100)).toBeNull();
    });
});

describe('resolveAdhocTotalRowCount', () => {
    it('reads TotalRowCount from the count recordset', () => {
        expect(ResolveAdhocTotalRowCount([{ TotalRowCount: 2087 }], 100)).toBe(2087);
        expect(ResolveAdhocTotalRowCount([{ TotalRowCount: 0 }], 100)).toBe(0);
    });

    it('floors a fractional/stringified count', () => {
        expect(ResolveAdhocTotalRowCount([{ TotalRowCount: 42.9 }], 0)).toBe(42);
        expect(ResolveAdhocTotalRowCount([{ TotalRowCount: '2087' as unknown as number }], 0)).toBe(2087);
    });

    it('falls back when the count is absent, empty, null, or malformed', () => {
        expect(ResolveAdhocTotalRowCount(null, 100)).toBe(100);
        expect(ResolveAdhocTotalRowCount(undefined, 100)).toBe(100);
        expect(ResolveAdhocTotalRowCount([], 100)).toBe(100);
        expect(ResolveAdhocTotalRowCount([{}], 100)).toBe(100);
        expect(ResolveAdhocTotalRowCount([{ TotalRowCount: null }], 100)).toBe(100);
    });

    it('falls back on non-finite or negative counts (never reports a misleading total)', () => {
        expect(ResolveAdhocTotalRowCount([{ TotalRowCount: Number.NaN }], 100)).toBe(100);
        expect(ResolveAdhocTotalRowCount([{ TotalRowCount: -5 }], 100)).toBe(100);
        expect(ResolveAdhocTotalRowCount([{ TotalRowCount: Infinity }], 100)).toBe(100);
    });
});
