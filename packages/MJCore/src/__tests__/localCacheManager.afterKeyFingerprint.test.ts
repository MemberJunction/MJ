import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { CompositeKey } from '../generic/compositeKey';
import type { RunViewParams } from '../views/runView';

/**
 * Regression coverage for the keyset (AfterKey) pagination infinite-loop bug.
 *
 * GenerateRunViewFingerprint is the key used by both the local result cache AND the
 * dedup/linger layer in ProviderBase. It originally omitted AfterKey, so sequential
 * keyset pages — identical in every param except the seek cursor — produced the same
 * fingerprint. The dedup linger window then returned page N's result for page N+1,
 * freezing the cursor and looping forever (observed against the 2k-row Members entity).
 */
describe('GenerateRunViewFingerprint — AfterKey (keyset) participation', () => {
    const cache = LocalCacheManager.Instance;
    const base = { EntityName: 'Members', OrderBy: 'ID', MaxRows: 50 } as unknown as RunViewParams;

    it('produces distinct fingerprints for different AfterKey seek cursors', () => {
        const page2 = cache.GenerateRunViewFingerprint({
            ...base,
            AfterKey: CompositeKey.FromKeyValuePair('ID', '61D4CB4C-0B10-44D7-984E-0643338C1AE3'),
        } as RunViewParams);
        const page3 = cache.GenerateRunViewFingerprint({
            ...base,
            AfterKey: CompositeKey.FromKeyValuePair('ID', 'B6990264-B95B-4CAC-9A7A-0DADD1AF9F21'),
        } as RunViewParams);

        expect(page2).not.toBe(page3);
    });

    it('leaves non-keyset fingerprints unchanged (no AfterKey segment when absent)', () => {
        const fp = cache.GenerateRunViewFingerprint(base);
        expect(fp).not.toContain('ak:');
    });

    it('includes the seek cursor value in the fingerprint when AfterKey is present', () => {
        const fp = cache.GenerateRunViewFingerprint({
            ...base,
            AfterKey: CompositeKey.FromKeyValuePair('ID', 'B6990264-B95B-4CAC-9A7A-0DADD1AF9F21'),
        } as RunViewParams);
        expect(fp).toContain('ak:ID=B6990264-B95B-4CAC-9A7A-0DADD1AF9F21');
    });
});
