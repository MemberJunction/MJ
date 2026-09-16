import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import type { RunViewParams } from '../views/runView';

/**
 * Regression coverage for dataset items sharing a cache slot with ordinary reads.
 *
 * GenerateRunViewFingerprint is the key for the local result cache. `GetDatasetByName` caches
 * each dataset ITEM through this same builder, passing only entity + the item's WhereClause —
 * and every shipped item has a NULL WhereClause, so a dataset item and a plain unfiltered read
 * of the same entity produced the identical key and silently shared one slot. The dataset was
 * then served whatever an ordinary read had left there, which can include rows deleted since:
 * observed as a cached MJ_Metadata dataset holding 51 'MJ: Query Entities' rows while the
 * database held 48.
 */
describe('GenerateRunViewFingerprint — dataset namespace', () => {
    const cache = LocalCacheManager.Instance;
    const params = { EntityName: 'MJ: Query Entities' } as unknown as RunViewParams;

    it('separates a dataset item from a plain read of the same entity', () => {
        const plainRead = cache.GenerateRunViewFingerprint(params, 'conn');
        const datasetItem = cache.GenerateRunViewFingerprint(params, 'conn', undefined, 'MJ_Metadata/QueryEntities');

        expect(datasetItem).not.toBe(plainRead);
        expect(datasetItem).toContain('ds:MJ_Metadata/QueryEntities');
    });

    it('separates two dataset items over the same entity', () => {
        const a = cache.GenerateRunViewFingerprint(params, 'conn', undefined, 'MJ_Metadata/QueryEntities');
        const b = cache.GenerateRunViewFingerprint(params, 'conn', undefined, 'Other_Dataset/QueryEntities');

        expect(a).not.toBe(b);
    });

    it('leaves an ordinary read byte-identical, so no existing cache entry is invalidated', () => {
        const withoutSegment = cache.GenerateRunViewFingerprint(params, 'conn');
        const withEmptySegment = cache.GenerateRunViewFingerprint(params, 'conn', undefined, '   ');

        expect(withoutSegment).toBe(withEmptySegment);
        expect(withoutSegment).not.toContain('ds:');
    });
});
