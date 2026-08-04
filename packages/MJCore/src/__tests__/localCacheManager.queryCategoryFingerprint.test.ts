import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';

/**
 * Regression coverage for B46 — the RunQuery fingerprint ignored the query's category.
 *
 * Query names are unique only WITHIN a category: two queries named 'Revenue Summary' can
 * legitimately exist under '/Finance/' and '/Sales/'. Before B46 the fingerprint was
 * `QueryName|QueryID|Params[|Connection]`, so a by-name request for either query landed on the
 * SAME cache slot — whichever ran first had its rows served for the other. The fingerprint now
 * carries the FULL category path as a distinguishing segment:
 * `QueryName|QueryID|Category|Params[|Connection]`, normalized to '_' when absent so
 * uncategorized and runtime-created queries keep a stable key.
 *
 * The category passed by production callers is the RESOLVED query's canonical CategoryPath when
 * metadata resolves (ProviderBase.ResolveQueryCacheAuthorization / GenericDatabaseProvider's
 * resolveQuery), falling back to the caller-stated params.CategoryPath — these tests pin the
 * fingerprint contract itself.
 */
describe('GenerateRunQueryFingerprint — category path participation (B46)', () => {
    const cache = LocalCacheManager.Instance;
    const QID = 'AAAAAAAA-1111-2222-3333-444444444444';

    it('same-named queries in DIFFERENT categories get DIFFERENT fingerprints', () => {
        const finance = cache.GenerateRunQueryFingerprint(undefined, 'Revenue Summary', {}, undefined, '/Finance/');
        const sales = cache.GenerateRunQueryFingerprint(undefined, 'Revenue Summary', {}, undefined, '/Sales/');
        expect(finance).not.toBe(sales);
    });

    it('the category segment sits between the ID and the params (documented layout)', () => {
        const fp = cache.GenerateRunQueryFingerprint(QID, 'Revenue Summary', { year: 2026 }, undefined, '/Finance/');
        expect(fp).toBe(`Revenue Summary|${QID}|/finance/|{"year":2026}`);
    });

    it("no category normalizes to '_' — uncategorized and runtime-created queries keep a stable key", () => {
        const missing = cache.GenerateRunQueryFingerprint(QID, 'Q', {});
        const empty = cache.GenerateRunQueryFingerprint(QID, 'Q', {}, undefined, '');
        const blank = cache.GenerateRunQueryFingerprint(QID, 'Q', {}, undefined, '   ');
        expect(missing).toBe(`Q|${QID}|_|{}`);
        expect(empty).toBe(missing);
        expect(blank).toBe(missing);
    });

    it('category comparison is case- and whitespace-insensitive (mirrors resolveQuery matching)', () => {
        const a = cache.GenerateRunQueryFingerprint(QID, 'Q', {}, undefined, '/Finance/');
        const b = cache.GenerateRunQueryFingerprint(QID, 'Q', {}, undefined, ' /FINANCE/ ');
        expect(a).toBe(b);
    });

    it('the connection prefix still terminates the fingerprint when present', () => {
        const fp = cache.GenerateRunQueryFingerprint(QID, 'Q', {}, 'sqlserver://host:1433/db', '/Finance/');
        expect(fp).toBe(`Q|${QID}|/finance/|{}|sqlserver://host:1433/db`);
    });

    it('categorized vs uncategorized requests for the SAME query name never collide', () => {
        const categorized = cache.GenerateRunQueryFingerprint(undefined, 'Q', {}, undefined, '/Finance/');
        const uncategorized = cache.GenerateRunQueryFingerprint(undefined, 'Q', {});
        expect(categorized).not.toBe(uncategorized);
    });

    it('same query + same category is stable across calls (self-consistent → cacheable)', () => {
        const a = cache.GenerateRunQueryFingerprint(QID, 'Q', { p: 1 }, 'conn', '/Finance/');
        const b = cache.GenerateRunQueryFingerprint(QID, 'Q', { p: 1 }, 'conn', '/Finance/');
        expect(a).toBe(b);
    });
});
