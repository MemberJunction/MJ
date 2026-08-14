/**
 * Dataset cache slots must not share a key with ordinary RunView slots
 * (PR #3425 review, finding M3).
 *
 * `GetDatasetByName` keys its write-through cache with the SAME builder ordinary reads use,
 * passing only `{ EntityName, ExtraFilter }`. Every shipped metadata dataset item has a NULL
 * `WhereClause`, and no RLS clause or view identity is supplied, so it emits byte-for-byte the
 * fingerprint of a plain unfiltered `RunView` of that entity:
 *
 *     MJ: Entities|_|_|-1|0|_|_|<connection>
 *
 * Two consequences, both live:
 *
 *  1. The `MJ_Metadata` dataset writes its rows with `ProviderInternalScaffolding` — deliberately
 *     UNFROZEN, because metadata bootstrap rearranges them in place. Sharing the key means a
 *     plain `RunView('MJ: Entities')` is served that exempt slot, so the headline protection of
 *     this PR does not reach the most frequently read entities in the process.
 *  2. The reverse: if that slot is evicted, an ordinary query repopulates it FROZEN, and the next
 *     metadata refresh throws while rearranging it.
 *
 * There is a latent third hazard the namespace also closes: a dataset item may specify a narrow
 * `Columns` list, in which case its rows are a COLUMN PROJECTION, while a RunView slot is always
 * the full field set. All 41 shipped items currently have `Columns = NULL` (so `SELECT *`), which
 * is why this has not yet been observed as a shape bug.
 */

import { describe, test, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { RunViewParams } from '../views/runView';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

async function newCache(): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const mgr = LocalCacheManager.Instance;
    await mgr.Initialize(new MockCacheStorageProvider(), {
        enabled: true,
        maxSizeBytes: 50 * 1024 * 1024,
        defaultTTLMs: 5 * 60 * 1000,
        evictionPolicy: 'lru',
    });
    return mgr;
}

const CONN = 'mssql://localhost:1433/MJ_Dev/';
const ENTITY = 'MJ: Entities';
const plainParams = (): RunViewParams => ({ EntityName: ENTITY });

describe('GenerateRunViewFingerprint — dataset namespace', () => {
    test('a dataset read and a plain unfiltered read no longer collide', async () => {
        const cache = await newCache();

        const plain = cache.GenerateRunViewFingerprint(plainParams(), CONN);
        const dataset = cache.GenerateRunViewFingerprint(plainParams(), CONN, undefined, 'MJ_Metadata/Entities');

        expect(dataset).not.toBe(plain);
    });

    test('the plain fingerprint is byte-for-byte unchanged (no cache invalidation for normal reads)', async () => {
        const cache = await newCache();

        // The dataset segment is appended ONLY when supplied, so every existing slot keeps its key.
        expect(cache.GenerateRunViewFingerprint(plainParams(), CONN))
            .toBe(`${ENTITY}|_|_|-1|0|_|_|${CONN}`);
    });

    test('the same dataset item is stable across calls (dataset reads still hit dataset writes)', async () => {
        const cache = await newCache();

        const a = cache.GenerateRunViewFingerprint(plainParams(), CONN, undefined, 'MJ_Metadata/Entities');
        const b = cache.GenerateRunViewFingerprint(plainParams(), CONN, undefined, 'MJ_Metadata/Entities');

        expect(a).toBe(b);
    });

    test('different dataset items over the same entity get different slots', async () => {
        const cache = await newCache();

        const a = cache.GenerateRunViewFingerprint(plainParams(), CONN, undefined, 'MJ_Metadata/Entities');
        const b = cache.GenerateRunViewFingerprint(plainParams(), CONN, undefined, 'Other_Dataset/Entities');

        expect(a).not.toBe(b);
    });

    test('the dataset segment composes with the RLS segment rather than replacing it', async () => {
        const cache = await newCache();

        const noRls = cache.GenerateRunViewFingerprint(plainParams(), CONN, undefined, 'MJ_Metadata/Entities');
        const withRls = cache.GenerateRunViewFingerprint(plainParams(), CONN, 'TenantID = 5', 'MJ_Metadata/Entities');

        expect(withRls).not.toBe(noRls);
        expect(withRls).toContain('ds:MJ_Metadata/Entities');
        expect(withRls).toContain('rls:');
    });

    test('a scaffolding-exempt dataset slot is not served to a plain RunView of the same entity', async () => {
        // The end-to-end shape of the bug, at the cache layer: write the dataset slot exempt
        // (unfrozen), then look up the way an ordinary read does. It must MISS.
        const cache = await newCache();
        const datasetFp = cache.GenerateRunViewFingerprint(plainParams(), CONN, undefined, 'MJ_Metadata/Entities');
        const rows = [{ ID: 'e-1', Name: 'Entity One' }];

        await cache.SetRunViewResult(
            datasetFp, plainParams(), rows, '2026-01-02T00:00:00.000Z',
            undefined, undefined, undefined, undefined,
            { ProviderInternalScaffolding: true }
        );

        // Scaffolding rows stay mutable for metadata bootstrap...
        expect(Object.isFrozen(rows)).toBe(false);
        // ...and an ordinary read does not find them.
        expect(await cache.GetRunViewResult(cache.GenerateRunViewFingerprint(plainParams(), CONN))).toBeNull();
        // ...while the dataset's own read still does.
        expect(await cache.GetRunViewResult(datasetFp)).not.toBeNull();
    });

    test('a plain read of the same entity gets its own, frozen slot', async () => {
        const cache = await newCache();
        const datasetFp = cache.GenerateRunViewFingerprint(plainParams(), CONN, undefined, 'MJ_Metadata/Entities');
        await cache.SetRunViewResult(
            datasetFp, plainParams(), [{ ID: 'e-1' }], '2026-01-02T00:00:00.000Z',
            undefined, undefined, undefined, undefined, { ProviderInternalScaffolding: true }
        );

        const plainFp = cache.GenerateRunViewFingerprint(plainParams(), CONN);
        const plainRows = [{ ID: 'e-1', Name: 'Entity One' }];
        await cache.SetRunViewResult(plainFp, plainParams(), plainRows, '2026-01-02T00:00:00.000Z');

        // The protection this PR exists for now reaches metadata entities.
        expect(Object.isFrozen(plainRows)).toBe(true);
        const served = await cache.GetRunViewResult(plainFp);
        expect(Object.isFrozen(served!.results)).toBe(true);
    });
});
