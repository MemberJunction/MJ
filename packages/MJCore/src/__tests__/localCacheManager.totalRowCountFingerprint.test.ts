import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import type { RunViewParams } from '../views/runView';

/**
 * Regression coverage for the TotalRowCount cross-serve bug introduced by narrowing when the
 * provider computes a COUNT.
 *
 * The provider now computes a TRUE total only for OFFSET-paginated reads, ResultType='count_only',
 * and explicit ReturnTotalRowCount opt-ins. Every other read reports TotalRowCount = the number of
 * rows it actually returned. That makes TotalRowCount semantics a property of the REQUEST — so two
 * requests that differ only on that axis must not share a cache slot.
 *
 * Two collisions this closes. Both were harmless before the narrowing (every variant returned the
 * same true count, so sharing a slot was invisible) and became order-dependent after it — whichever
 * variant ran first decided what the other one saw:
 *
 *   1. `{MaxRows:500}` vs `{MaxRows:500, StartRow:0}`. The numeric startRow segment is
 *      `params.StartRow ?? 0`, so these are byte-identical, but only the second is "paginated"
 *      (pagination requires StartRow !== undefined) and therefore gets the true count.
 *   2. `{…, ReturnTotalRowCount:true}` vs the same params without it — the opt-in was not
 *      represented in the key at all.
 *
 * The `trc:` segment is appended only when the request is paginated or opted in, so the
 * overwhelmingly common plain read keeps producing the exact pre-existing fingerprint and no
 * existing cache entries are invalidated.
 */
describe('GenerateRunViewFingerprint — TotalRowCount semantics participation', () => {
    const cache = LocalCacheManager.Instance;
    const base = { EntityName: 'MJ: Entities', MaxRows: 500 } as unknown as RunViewParams;

    it('a plain capped read has NO trc: segment — pre-existing fingerprint unchanged', () => {
        expect(cache.GenerateRunViewFingerprint(base)).not.toContain('trc:');
    });

    it('collision 1: StartRow:0 does NOT collide with an omitted StartRow', () => {
        const nonPaginated = cache.GenerateRunViewFingerprint(base);
        const paginated = cache.GenerateRunViewFingerprint({ ...base, StartRow: 0 } as RunViewParams);
        expect(paginated).not.toBe(nonPaginated);
        expect(paginated).toContain('trc:pg');
    });

    it('collision 2: ReturnTotalRowCount:true does NOT collide with the same params without it', () => {
        const plain = cache.GenerateRunViewFingerprint(base);
        const optedIn = cache.GenerateRunViewFingerprint({ ...base, ReturnTotalRowCount: true } as RunViewParams);
        expect(optedIn).not.toBe(plain);
        expect(optedIn).toContain('trc:');
    });

    it('ReturnTotalRowCount:false is treated as the plain case — no invalidation of existing entries', () => {
        const plain = cache.GenerateRunViewFingerprint(base);
        expect(cache.GenerateRunViewFingerprint({ ...base, ReturnTotalRowCount: false } as RunViewParams)).toBe(plain);
    });

    it('a paginated read and a paginated + opted-in read are distinct', () => {
        const paginated = cache.GenerateRunViewFingerprint({ ...base, StartRow: 0 } as RunViewParams);
        const both = cache.GenerateRunViewFingerprint({ ...base, StartRow: 0, ReturnTotalRowCount: true } as RunViewParams);
        expect(both).not.toBe(paginated);
    });

    it('MaxRows alone is not pagination: MaxRows:0 with StartRow:0 stays in the plain lane', () => {
        // The provider's pagination predicate requires MaxRows > 0, so this is NOT paginated
        // and must not claim the paginated slot.
        const fp = cache.GenerateRunViewFingerprint({ EntityName: 'MJ: Entities', MaxRows: 0, StartRow: 0 } as RunViewParams);
        expect(fp).not.toContain('trc:');
    });

    it('keyset (AfterKey) reads are not OFFSET-paginated and stay in the plain lane', () => {
        const fp = cache.GenerateRunViewFingerprint({
            EntityName: 'MJ: Entities',
            MaxRows: 500,
            StartRow: 0,
            AfterKey: { ToString: () => 'ID|abc' },
        } as unknown as RunViewParams);
        expect(fp).not.toContain('trc:pg');
    });

    it('the same request produces a stable fingerprint (self-consistent → still cacheable)', () => {
        const p = { ...base, ReturnTotalRowCount: true } as RunViewParams;
        expect(cache.GenerateRunViewFingerprint(p)).toBe(cache.GenerateRunViewFingerprint(p));
    });
});
