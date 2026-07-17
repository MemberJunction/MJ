import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import type { RunViewParams } from '../views/runView';

/**
 * Regression coverage for the stored-view cross-serve bug (integration check server-cache S29).
 *
 * GenerateRunViewFingerprint is the key used by both the local result cache AND the dedup/linger
 * layer in ProviderBase. It originally EXCLUDED ViewID/ViewName on the (false) assumption that a
 * view is just a container for entity+filter+orderBy. But a saved view carries its own server-side
 * WhereClause that is NOT reflected in params.ExtraFilter — so a filtered view and a plain
 * unfiltered read of the same entity produced identical fingerprints and cross-served: the view was
 * handed the unfiltered slot and returned rows outside its own WhereClause. The fingerprint now
 * appends a `vw:` segment when a view identifier is present.
 */
describe('GenerateRunViewFingerprint — stored-view identity participation', () => {
    const cache = LocalCacheManager.Instance;
    const base = { EntityName: 'MJ: Entities' } as unknown as RunViewParams;

    it('a plain entity read (no view) has NO vw: segment — pre-existing fingerprint unchanged', () => {
        const fp = cache.GenerateRunViewFingerprint(base);
        expect(fp).not.toContain('vw:');
    });

    it('a filtered view does NOT collide with a plain unfiltered read of the same entity', () => {
        const plain = cache.GenerateRunViewFingerprint(base);
        const view = cache.GenerateRunViewFingerprint({ ...base, ViewID: 'AAAAAAAA-1111-2222-3333-444444444444' } as RunViewParams);
        expect(view).not.toBe(plain);
        expect(view).toContain('vw:AAAAAAAA-1111-2222-3333-444444444444');
    });

    it('two different views on the same entity get distinct fingerprints', () => {
        const a = cache.GenerateRunViewFingerprint({ ...base, ViewID: 'AAAAAAAA-1111-2222-3333-444444444444' } as RunViewParams);
        const b = cache.GenerateRunViewFingerprint({ ...base, ViewID: 'BBBBBBBB-1111-2222-3333-444444444444' } as RunViewParams);
        expect(a).not.toBe(b);
    });

    it('the same view produces a stable fingerprint (self-consistent → still cacheable)', () => {
        const p = { ...base, ViewID: 'AAAAAAAA-1111-2222-3333-444444444444' } as RunViewParams;
        expect(cache.GenerateRunViewFingerprint(p)).toBe(cache.GenerateRunViewFingerprint(p));
    });

    it('keys on ViewName when ViewID is absent', () => {
        const fp = cache.GenerateRunViewFingerprint({ ...base, ViewName: 'My Saved View' } as RunViewParams);
        expect(fp).toContain('vw:My Saved View');
    });
});
