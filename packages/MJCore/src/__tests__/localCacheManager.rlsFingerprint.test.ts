import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import type { RunViewParams } from '../views/runView';

/**
 * Security regression coverage for the Row-Level-Security (RLS) cache leak.
 *
 * The provider auto-caches small, unfiltered RunView result sets. The per-user RLS
 * WHERE clause, however, is appended to the executed SQL AFTER the cache key would
 * otherwise have been computed. Without folding the RLS clause into the fingerprint,
 * an RLS-scoped user's read (e.g. a magic-link resource-share guest restricted to
 * `ID = '{{ScopeResourceID}}'`) collided with a cached UNSCOPED read of the same
 * entity+filter — serving rows the user's RLS should have excluded. This is a data leak.
 *
 * GenerateRunViewFingerprint now accepts the per-user RLS clause and appends a hashed
 * `rls:` segment when it is non-empty, so distinct scopes can never share a cache entry.
 * Users with no RLS clause keep producing byte-identical fingerprints (no cache churn).
 */
describe('GenerateRunViewFingerprint — RLS clause participation', () => {
    const cache = LocalCacheManager.Instance;
    const base = { EntityName: 'MJ: Applications', ExtraFilter: '', OrderBy: '' } as unknown as RunViewParams;

    it('leaves the fingerprint unchanged when no RLS clause applies (empty/undefined)', () => {
        const noArg = cache.GenerateRunViewFingerprint(base);
        const emptyString = cache.GenerateRunViewFingerprint(base, undefined, '');
        const whitespace = cache.GenerateRunViewFingerprint(base, undefined, '   ');

        expect(emptyString).toBe(noArg);
        expect(whitespace).toBe(noArg);
        expect(noArg).not.toContain('rls:');
    });

    it('produces a different fingerprint for an RLS-scoped read than an unscoped read', () => {
        const unscoped = cache.GenerateRunViewFingerprint(base);
        const scoped = cache.GenerateRunViewFingerprint(
            base,
            undefined,
            `ID = 'EB07016C-AE35-4EF9-804B-91563529A08A'`,
        );

        expect(scoped).not.toBe(unscoped);
        expect(scoped).toContain('rls:');
    });

    it('produces distinct fingerprints for two different RLS scopes', () => {
        const scopeA = cache.GenerateRunViewFingerprint(
            base,
            undefined,
            `ID = 'EB07016C-AE35-4EF9-804B-91563529A08A'`,
        );
        const scopeB = cache.GenerateRunViewFingerprint(
            base,
            undefined,
            `ID = 'A1CE195A-BFEC-419E-B995-E13E06ADBB65'`,
        );

        expect(scopeA).not.toBe(scopeB);
    });

    it('is deterministic for the same RLS clause (read/write keys match)', () => {
        const rls = `ID = 'EB07016C-AE35-4EF9-804B-91563529A08A'`;
        const first = cache.GenerateRunViewFingerprint(base, undefined, rls);
        const second = cache.GenerateRunViewFingerprint(base, undefined, rls);

        expect(first).toBe(second);
    });

    it('keeps the entity name as the first pipe segment so entity→fingerprint indexing still works', () => {
        const scoped = cache.GenerateRunViewFingerprint(
            base,
            undefined,
            `ID = 'EB07016C-AE35-4EF9-804B-91563529A08A'`,
        );
        expect(scoped.split('|')[0]).toBe('MJ: Applications');
    });
});
