import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import type { RunViewParams } from '../views/runView';

/**
 * Regression coverage for the IgnoreMaxRows cache cross-serve bug (integration check server-cache S28).
 *
 * GenerateRunViewFingerprint is the key used by both the local result cache AND the dedup/linger layer
 * in ProviderBase. IgnoreMaxRows skips the entity-level UserViewMaxRows TOP cap, so a request carrying
 * it returns a DIFFERENT (larger) row set than the otherwise-identical default (capped) query for the
 * same entity+filter. Without an `imr:` segment the two collide on one slot and the capped result gets
 * served to an IgnoreMaxRows caller (or vice-versa). The fingerprint now appends `imr:1` when — and
 * only when — IgnoreMaxRows is true, so the common (capped) case keeps producing the exact pre-existing
 * fingerprint and no existing cache entries are invalidated.
 */
describe('GenerateRunViewFingerprint — IgnoreMaxRows participation', () => {
    const cache = LocalCacheManager.Instance;
    const base = { EntityName: 'MJ: Entities' } as unknown as RunViewParams;

    it('a default (capped) read has NO imr: segment — pre-existing fingerprint unchanged', () => {
        const fp = cache.GenerateRunViewFingerprint(base);
        expect(fp).not.toContain('imr:');
    });

    it('IgnoreMaxRows=false leaves the fingerprint identical to the unset (capped) case', () => {
        const capped = cache.GenerateRunViewFingerprint(base);
        const explicitFalse = cache.GenerateRunViewFingerprint({ ...base, IgnoreMaxRows: false } as RunViewParams);
        expect(explicitFalse).toBe(capped);
        expect(explicitFalse).not.toContain('imr:');
    });

    it('an IgnoreMaxRows read does NOT collide with the otherwise-identical capped read', () => {
        const capped = cache.GenerateRunViewFingerprint(base);
        const uncapped = cache.GenerateRunViewFingerprint({ ...base, IgnoreMaxRows: true } as RunViewParams);
        expect(uncapped).not.toBe(capped);
        expect(uncapped).toContain('imr:1');
    });

    it('the same IgnoreMaxRows request produces a stable fingerprint (self-consistent → still cacheable)', () => {
        const p = { ...base, IgnoreMaxRows: true } as RunViewParams;
        expect(cache.GenerateRunViewFingerprint(p)).toBe(cache.GenerateRunViewFingerprint(p));
    });
});
