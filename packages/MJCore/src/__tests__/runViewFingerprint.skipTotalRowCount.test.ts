import { describe, expect, it } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { RunViewParams } from '../views/runView';

/**
 * `SkipTotalRowCount` changes what a result CARRIES (TotalRowCount is not counted), so a call with
 * the flag and an otherwise identical call without it must not share a cache slot — else one is
 * served the other's TotalRowCount.
 */
describe('RunView fingerprint — SkipTotalRowCount', () => {
    const base: RunViewParams = { EntityName: 'MJ: AI Models', ExtraFilter: "Name='x'", MaxRows: 1 };
    const fp = (p: RunViewParams) => LocalCacheManager.Instance.GenerateRunViewFingerprint(p);

    it('a call that skips the count gets its own slot', () => {
        expect(fp({ ...base, SkipTotalRowCount: true })).not.toBe(fp(base));
        expect(fp({ ...base, SkipTotalRowCount: true }).split('|')).toContain('strc:1');
    });

    it('leaves every existing fingerprint byte-for-byte unchanged', () => {
        expect(fp({ ...base, SkipTotalRowCount: false })).toBe(fp(base));
        expect(fp(base).split('|')).not.toContain('strc:1');
    });
});
