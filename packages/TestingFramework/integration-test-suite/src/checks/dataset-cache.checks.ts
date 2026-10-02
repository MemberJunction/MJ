/**
 * dataset-cache.checks.ts — the 'dataset-cache' bundle (DS1/DS2).
 *
 * Exercises the dataset cache through ProviderBase.GetAndCacheDatasetByName: a cold call
 * populates the cache, a warm call serves the same dataset, and the status APIs
 * (IsDatasetCached / IsDatasetCacheUpToDate) agree with the cached state.
 *
 * Assertions are BEHAVIORAL, not instrumented-counter based — VERIFIED against the live server:
 * the dataset cache writes through the provider's OWN LocalStorageProvider (ProviderBase.
 * CacheDataset, into ProviderBase.DatasetCacheCategory), which is a DIFFERENT storage from the
 * InstrumentedLocalStorageProvider installed on LocalCacheManager. So the instrumented
 * RunViewCache counters never observe dataset writes on this transport, and the honest
 * proof is the cache's observable behavior, not a counter. (Aggregates DO flow through
 * LocalCacheManager and are counter-checked — see aggregates-cache.checks.ts.)
 *
 * DS1–DS3 assert the cache's STATE: that it was populated, that the status APIs agree, that a clear
 * flips them back. None of them can tell a warm call that was SERVED from one that silently
 * refetched — DS1 compares row counts between the two calls, which match either way. That blind
 * spot is why the warm-serve path could be dead from `987a126aab` (2026-05-02) until
 * `ProviderBase.DatasetCacheCategory`: the read named a category the writes did not, so it missed
 * on every transport, refetched, and every assertion here still passed. DS4 closes it.
 *
 * Fixture: an EXISTING dataset name (default 'MJ_Metadata', a real seeded dataset). No row
 * mutation — purely read-and-observe. Read the name from the selector config when present.
 */
import { Metadata } from '@memberjunction/core';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const DEFAULT_DATASET = 'MJ_Metadata';

/** The dataset name for this run: selector config `datasetName`, else the default. */
function datasetName(ctx: IntegrationCheckContext): string {
    const fromConfig = ctx.Config?.datasetName;
    return typeof fromConfig === 'string' && fromConfig.length > 0 ? fromConfig : DEFAULT_DATASET;
}

/** DS1: a cold fetch populates the dataset cache (false→true); a warm fetch serves the same dataset. */
export async function CheckDs1ColdThenWarm(ctx: IntegrationCheckContext): Promise<void> {
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

/** @deprecated Use {@link CheckDs1ColdThenWarm}. */
export async function CheckDs1_ColdThenWarm(ctx: IntegrationCheckContext): Promise<void> {
    return CheckDs1ColdThenWarm(ctx);
}

/** DS2: the status APIs agree with the (now-warm) cache state. */
export async function CheckDs2StatusApis(ctx: IntegrationCheckContext): Promise<void> {
    const md = new Metadata(); // global-provider-ok: dedicated single-provider process (D1)
    const name = datasetName(ctx);
    Assert(await md.IsDatasetCached(name), 'IsDatasetCached should be true after a warm fetch (DS1 ran first)');
    Assert(await md.IsDatasetCacheUpToDate(name), 'IsDatasetCacheUpToDate should be true immediately after caching');
}

/** @deprecated Use {@link CheckDs2StatusApis}. */
export async function CheckDs2_StatusApis(ctx: IntegrationCheckContext): Promise<void> {
    return CheckDs2StatusApis(ctx);
}

/**
 * DS3: the NEGATIVE transition. DS1/DS2 only prove the positive (cached → true). After
 * ClearDatasetCache the status APIs must flip back: IsDatasetCached false AND
 * IsDatasetCacheUpToDate false (a cleared dataset must never masquerade as up-to-date —
 * a stale "up to date" would suppress the refetch and serve nothing / stale data).
 */
export async function CheckDs3ClearMakesUncachedAndStale(ctx: IntegrationCheckContext): Promise<void> {
    const md = new Metadata(); // global-provider-ok: dedicated single-provider process (D1)
    const name = datasetName(ctx);
    // Be self-sufficient: ensure it is cached first (DS1 typically ran, but don't rely on it).
    await md.GetAndCacheDatasetByName(name, undefined, ctx.User);
    Assert(await md.IsDatasetCached(name), 'precondition: dataset must be cached before the clear');

    await md.ClearDatasetCache(name);
    Assert(!(await md.IsDatasetCached(name)), 'ClearDatasetCache must make IsDatasetCached false');
    Assert(!(await md.IsDatasetCacheUpToDate(name)), 'a cleared (absent) dataset must report NOT up-to-date, never true');
}

/** @deprecated Use {@link CheckDs3ClearMakesUncachedAndStale}. */
export async function CheckDs3_ClearMakesUncachedAndStale(ctx: IntegrationCheckContext): Promise<void> {
    return CheckDs3ClearMakesUncachedAndStale(ctx);
}

/**
 * DS4: the warm call is served from the cache rather than silently refetched.
 *
 * Told apart from outside the provider by making the cached copy distinguishable from what the
 * server would return: a sentinel is written into the cached blob's `Status`, and the warm call must
 * return it. The server's own status coming back means the cache missed.
 *
 * The sentinel leaves every per-entity row count untouched. Freshness compares those counts against
 * the server to catch pure deletes, so changing one would invalidate the cache and the check would
 * say nothing about serving.
 *
 * Clears the cache in a `finally`, so no sentinel-bearing copy is left for the metadata bootstrap or
 * a later bundle to read.
 */
export async function CheckDs4WarmIsServedFromCache(ctx: IntegrationCheckContext): Promise<void> {
    const md = new Metadata(); // global-provider-ok: dedicated single-provider process (D1)
    const name = datasetName(ctx);

    await md.ClearDatasetCache(name);
    const cold = await md.GetAndCacheDatasetByName(name, undefined, ctx.User);
    Assert(cold != null && cold.Success, `cold GetAndCacheDatasetByName('${name}') failed`);

    try {
        const cached = await md.GetCachedDataset(name);
        Assert(cached != null, 'the cold fetch must have written a cached copy to read back');

        const sentinel = `ds4-served-from-cache-${Date.now()}`;
        Assert(cached.Status !== sentinel, 'the sentinel must differ from what is already cached');
        cached.Status = sentinel;
        // A cached blob that has been through a JSON transport carries LatestUpdateDate as a string,
        // and CacheDataset calls .toISOString() on it. Normalize so re-caching a read-back copy is
        // transport-independent; production only ever re-caches a fresh server result.
        cached.LatestUpdateDate = new Date(cached.LatestUpdateDate);
        // No filters, so the key is the one the cold fetch above wrote.
        await md.CacheDataset(name, undefined, cached);

        const warm = await md.GetAndCacheDatasetByName(name, undefined, ctx.User);
        Assert(warm != null && warm.Success, 'warm GetAndCacheDatasetByName failed');
        AssertEqual(warm.Status, sentinel,
            'the warm fetch must be SERVED from the dataset cache — a different Status means it missed and refetched from the server');
        AssertEqual(warm.Results.length, cold.Results.length, 'the served copy must hold the same items as the cold fetch');
    } finally {
        // Never leave the sentinel behind, even if an assertion above failed.
        await md.ClearDatasetCache(name);
    }
}

/** The ordered 'dataset-cache' bundle. DS1 warms the cache that DS2 then inspects; DS3 clears it. */
export const DatasetCacheChecks: NamedCheck[] = [
    {
        Id: 'dataset-cache.DS1',
        Name: 'DS1: cold fetch populates the dataset cache (false→true); warm fetch serves the same dataset',
        Fn: CheckDs1ColdThenWarm
    },
    {
        Id: 'dataset-cache.DS2',
        Name: 'DS2: IsDatasetCached / IsDatasetCacheUpToDate agree with the warm cache state',
        Fn: CheckDs2StatusApis
    },
    {
        Id: 'dataset-cache.DS3',
        Name: 'DS3: ClearDatasetCache flips both status APIs back to false (a cleared dataset is never up-to-date)',
        Fn: CheckDs3ClearMakesUncachedAndStale
    },
    {
        Id: 'dataset-cache.DS4',
        Name: 'DS4: the warm fetch is served FROM the cache, not silently refetched (sentinel in the cached copy)',
        Fn: CheckDs4WarmIsServedFromCache
    }
];

for (const check of DatasetCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
