/**
 * dataset-cache.checks.ts — the 'dataset-cache' bundle (DS1/DS2).
 *
 * Exercises the dataset cache through ProviderBase.GetAndCacheDatasetByName: a cold call
 * populates the cache, a warm call serves the same dataset, and the status APIs
 * (IsDatasetCached / IsDatasetCacheUpToDate) agree with the cached state.
 *
 * Assertions are BEHAVIORAL (the IsDatasetCached false→true transition, warm consistency,
 * status APIs), not instrumented-counter based — VERIFIED against the live server: the
 * dataset cache writes through the provider's OWN LocalStorageProvider (ProviderBase.
 * CacheDataset → SetItem with no category), which is a DIFFERENT storage from the
 * InstrumentedLocalStorageProvider installed on LocalCacheManager. So the instrumented
 * RunViewCache counters never observe dataset writes on this transport, and the honest
 * proof is the cache's observable behavior, not a counter. (Aggregates DO flow through
 * LocalCacheManager and are counter-checked — see aggregates-cache.checks.ts.)
 *
 * Fixture: an EXISTING dataset name (default 'MJ_Metadata', a real seeded dataset). No row
 * mutation — purely read-and-observe. Read the name from the selector config when present.
 */
import { Metadata } from '@memberjunction/core';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const DEFAULT_DATASET = 'MJ_Metadata';

/** The dataset name for this run: selector config `datasetName`, else the default. */
function datasetName(ctx: IntegrationCheckContext): string {
    const fromConfig = ctx.Config?.datasetName;
    return typeof fromConfig === 'string' && fromConfig.length > 0 ? fromConfig : DEFAULT_DATASET;
}

/** DS1: a cold fetch populates the dataset cache (false→true); a warm fetch serves the same dataset. */
export async function CheckDs1_ColdThenWarm(ctx: IntegrationCheckContext): Promise<void> {
    const md = new Metadata(); // global-provider-ok: integration test owns its single-provider process (D1)
    const name = datasetName(ctx);

    // Cold precondition: clear, then confirm the dataset is not cached.
    await md.ClearDatasetCache(name);
    Assert(!(await md.IsDatasetCached(name)), `dataset '${name}' must be uncached after ClearDatasetCache`);

    // Cold fetch: must succeed, return rows, and POPULATE the cache (the false→true transition
    // is the observable proof that the cold path wrote the dataset cache).
    const cold = await md.GetAndCacheDatasetByName(name, undefined, ctx.User);
    Assert(cold != null && cold.Success, `cold GetAndCacheDatasetByName('${name}') failed — is the dataset seeded?`);
    Assert(cold.Results.length > 0, `dataset '${name}' returned no items`);
    Assert(await md.IsDatasetCached(name), 'cold fetch must populate the dataset cache (IsDatasetCached false→true)');

    // Warm fetch: serves the same dataset (same item count) without error.
    const warm = await md.GetAndCacheDatasetByName(name, undefined, ctx.User);
    Assert(warm != null && warm.Success, 'warm GetAndCacheDatasetByName failed');
    AssertEqual(warm.Results.length, cold.Results.length, 'warm fetch must serve the same dataset as the cold fetch');
}

/** DS2: the status APIs agree with the (now-warm) cache state. */
export async function CheckDs2_StatusApis(ctx: IntegrationCheckContext): Promise<void> {
    const md = new Metadata(); // global-provider-ok: dedicated single-provider process (D1)
    const name = datasetName(ctx);
    Assert(await md.IsDatasetCached(name), 'IsDatasetCached should be true after a warm fetch (DS1 ran first)');
    Assert(await md.IsDatasetCacheUpToDate(name), 'IsDatasetCacheUpToDate should be true immediately after caching');
}

/**
 * DS3: the NEGATIVE transition. DS1/DS2 only prove the positive (cached → true). After
 * ClearDatasetCache the status APIs must flip back: IsDatasetCached false AND
 * IsDatasetCacheUpToDate false (a cleared dataset must never masquerade as up-to-date —
 * a stale "up to date" would suppress the refetch and serve nothing / stale data).
 */
export async function CheckDs3_ClearMakesUncachedAndStale(ctx: IntegrationCheckContext): Promise<void> {
    const md = new Metadata(); // global-provider-ok: dedicated single-provider process (D1)
    const name = datasetName(ctx);
    // Be self-sufficient: ensure it is cached first (DS1 typically ran, but don't rely on it).
    await md.GetAndCacheDatasetByName(name, undefined, ctx.User);
    Assert(await md.IsDatasetCached(name), 'precondition: dataset must be cached before the clear');

    await md.ClearDatasetCache(name);
    Assert(!(await md.IsDatasetCached(name)), 'ClearDatasetCache must make IsDatasetCached false');
    Assert(!(await md.IsDatasetCacheUpToDate(name)), 'a cleared (absent) dataset must report NOT up-to-date, never true');
}

/** The ordered 'dataset-cache' bundle. DS1 warms the cache that DS2 then inspects; DS3 clears it. */
export const DatasetCacheChecks: NamedCheck[] = [
    {
        Id: 'dataset-cache.DS1',
        Name: 'DS1: cold fetch populates the dataset cache (false→true); warm fetch serves the same dataset',
        Fn: CheckDs1_ColdThenWarm
    },
    {
        Id: 'dataset-cache.DS2',
        Name: 'DS2: IsDatasetCached / IsDatasetCacheUpToDate agree with the warm cache state',
        Fn: CheckDs2_StatusApis
    },
    {
        Id: 'dataset-cache.DS3',
        Name: 'DS3: ClearDatasetCache flips both status APIs back to false (a cleared dataset is never up-to-date)',
        Fn: CheckDs3_ClearMakesUncachedAndStale
    }
];

for (const check of DatasetCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
