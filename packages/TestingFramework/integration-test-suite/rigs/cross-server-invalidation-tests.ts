/**
 * cross-server-invalidation-tests.ts — proves that a BaseEntity.Save() in MJAPI
 * process A invalidates the cached read in MJAPI process B via the shared
 * Redis-backed LocalCacheManager (RedisLocalStorageProvider pub/sub).
 *
 * This is the ONE check class that fundamentally needs TWO processes — it cannot be
 * expressed in a single-process suite — so it is a standalone script (D1/D8), gated
 * behind RUN_CROSS_SERVER=1 and run only when the topology is provisioned:
 *   - two MJAPI processes (A, B) pointed at the SAME database AND the SAME Redis
 *     instance (each started with REDIS_URL set so it hot-swaps LocalCacheManager to
 *     RedisLocalStorageProvider at startup — packages/MJServer/src/index.ts), and
 *   - MJAPI_A_URL / MJAPI_B_URL / MJ_API_KEY in the environment.
 *
 * The transport under test (RedisLocalStorageProvider pub/sub → LocalCacheManager
 * DispatchCacheChange → remote-invalidate BaseEntity event) is EXISTING framework
 * behavior; this script exercises it end-to-end, it does not implement it. Because it
 * requires Redis + two servers, run-all.ts only includes it when RUN_CROSS_SERVER=1
 * (never in the blocking PR gate).
 *
 * Exit contract (harness standard): 0 all passed · 1 failures · 2 bootstrap/connectivity error.
 */
import { RunView } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import type { MJActionCategoryEntity, MJEntityEntity, MJUserSettingEntity } from '@memberjunction/core-entities';
// Side-effect import: registers generated entity subclasses so GetEntityObject<…>()
// materializes a real BaseEntity (this script doesn't go through bootstrapIntegrationClient).
import '@memberjunction/server-bootstrap-lite';
import { TestRunner, Assert, AssertEqual } from './lib/harness';

// Cross-server invalidation is fire-and-forget over Redis pub/sub — give it a window to land.
const SETTLE_MS = 2000;
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A GraphQLDataProvider that is NOT the process singleton. The constructor returns the singleton
 * whenever one exists, so without this both "clients" were one object and every request — A's
 * included — went to whichever server was configured last. (Same technique as fls-client.checks.)
 */
function newSeparateProvider(): GraphQLDataProvider {
    const key = '___SINGLETON__GraphQLDataProvider';
    const store = GetGlobalObjectStore();
    const singleton = store?.[key];
    if (store) delete store[key];
    try {
        return new GraphQLDataProvider();
    } finally {
        if (store) store[key] = singleton;
    }
}

/** Connect an independent GraphQL client to one MJAPI endpoint (its own session). */
async function connectClient(url: string, apiKey: string): Promise<GraphQLDataProvider> {
    const provider = newSeparateProvider();
    const config = new GraphQLProviderConfigData('', url, '', async () => '', '__mj', undefined, undefined, apiKey);
    // separateConnection=true → this provider does NOT share session/connection state with any other,
    // so the two clients are genuinely talking to two distinct servers.
    await provider.Config(config, undefined, true);
    return provider;
}

/**
 * Count `MJ: User Settings` rows tagged with `tag` via the given provider. CacheLocal:true
 * engages the client smart-cache so the read exercises the end-to-end freshness path
 * (client smart-cache-check against THAT server's cache, which the cross-server flow invalidates).
 */
async function countTagged(provider: GraphQLDataProvider, user: UserInfo, tag: string): Promise<number> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView({
        EntityName: 'MJ: User Settings',
        ExtraFilter: `Setting = '${tag}'`,
        Fields: ['ID', 'Setting'],
        CacheLocal: true,
        ResultType: 'simple'
    }, user);
    if (!res.Success) {
        throw new Error(`RunView (count '${tag}') failed: ${res.ErrorMessage}`);
    }
    return res.Results?.length ?? 0;
}

/**
 * Rows B returns for `MJ: AI Models` with no MaxRows. The server caps such a read at the entity's
 * `UserViewMaxRows`, taken from ITS in-memory metadata — so the count shows which metadata B holds.
 * A textually unique filter per call keeps every cache layer out of the answer.
 */
async function modelRowsServedBy(provider: GraphQLDataProvider, user: UserInfo): Promise<number> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView({
        EntityName: 'MJ: AI Models',
        ExtraFilter: `Name <> 'xs-${Date.now()}-${Math.random().toString(36).slice(2)}'`,
        Fields: ['ID'],
        ResultType: 'simple',
    }, user);
    if (!res.Success) {
        throw new Error(`RunView (MJ: AI Models) failed: ${res.ErrorMessage}`);
    }
    return res.Results?.length ?? 0;
}

/**
 * IDs of every `MJ: Action Categories` row the given server returns for an unfiltered read. An
 * unfiltered read is served from a slot the server keeps up to date in place, so this shows the
 * rows that server's cache holds after a peer's change arrived.
 */
async function categoryIdsServedBy(provider: GraphQLDataProvider, user: UserInfo): Promise<Set<string>> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Action Categories',
        Fields: ['ID'],
        IgnoreMaxRows: true,
        ResultType: 'simple',
    }, user);
    if (!res.Success) {
        throw new Error(`RunView (MJ: Action Categories) failed: ${res.ErrorMessage}`);
    }
    return new Set(res.Results.map(r => r.ID.toUpperCase()));
}

/** Polls until `predicate` holds or the timeout passes; returns the elapsed ms, or null. */
async function waitUntil(predicate: () => Promise<boolean>, timeoutMs: number): Promise<number | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await predicate()) return Date.now() - started;
        await sleep(250);
    }
    return null;
}

/**
 * Sets `MJ: AI Models`' UserViewMaxRows through the given server and returns the previous value.
 * The record is created with `provider.GetEntityObject` so its Save goes to THAT server: rows
 * returned by a RunView save through the process-wide provider, which is whichever client
 * connected last — an earlier version of this check saved through B by accident.
 */
async function setModelsMaxRows(provider: GraphQLDataProvider, user: UserInfo, value: number | null): Promise<number | null> {
    const modelsEntityId = provider.EntityByName('MJ: AI Models')?.ID;
    if (!modelsEntityId) {
        throw new Error(`'MJ: AI Models' is not in the metadata of ${provider.InstanceConnectionString}`);
    }
    const entity = await provider.GetEntityObject<MJEntityEntity>('MJ: Entities', user);
    Assert(await entity.Load(modelsEntityId), `could not load the 'MJ: AI Models' entity row: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
    const previous = entity.UserViewMaxRows;
    entity.UserViewMaxRows = value;
    Assert(await entity.Save(), `saving UserViewMaxRows=${value} failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return previous;
}

async function main(): Promise<void> {
    const aUrl = process.env.MJAPI_A_URL;
    const bUrl = process.env.MJAPI_B_URL;
    const apiKey = process.env.MJ_API_KEY;
    if (!aUrl || !bUrl || !apiKey) {
        throw new Error(
            'Cross-server test requires MJAPI_A_URL, MJAPI_B_URL, and MJ_API_KEY — two MJAPI ' +
            'processes sharing one DB + one Redis (REDIS_URL set on both).'
        );
    }

    const a = await connectClient(aUrl, apiKey);
    const b = await connectClient(bUrl, apiKey);
    Assert(a !== b, 'the two clients must be distinct provider instances');
    const userA = a.CurrentUser;
    const userB = b.CurrentUser;
    Assert(!!userA && !!userB, 'Both clients must resolve a current user from MJ_API_KEY');

    const tag = `mj.xserver.${userA.ID}`;
    const suite = new TestRunner('Cross-Server Redis Invalidation');

    suite.Test('XS1: B serves a consistent cacheable read after A and B both read the same slot', async () => {
        await countTagged(a, userA, tag); // warm via A
        const r = await countTagged(b, userB, tag); // B reads its own slot off the shared backend
        Assert(r >= 0, 'B read should succeed');
    });

    suite.Test('XS2: a Save in A invalidates the cached read in B', async () => {
        const before = await countTagged(b, userB, tag); // B caches the (empty) slot
        const setting = await a.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', userA);
        setting.UserID = userA.ID;
        setting.Setting = tag;
        setting.Value = 'integration-test';
        Assert(await setting.Save(), `Save in A failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
        try {
            await sleep(SETTLE_MS); // let the fire-and-forget cross-server invalidation land in B
            const after = await countTagged(b, userB, tag);
            AssertEqual(after, before + 1, "B must observe A's write after cross-server invalidation (stale slot must NOT be served)");
        } finally {
            // Always clean up our mutation, even if the assertion above threw.
            Assert(await setting.Delete(), `Cleanup delete in A failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
    });

    suite.Test('XS3: a metadata change saved through A reaches B through the shared-cache notice', async () => {
        // B must be started with METADATA_CACHE_REFRESH_INTERVAL far above this test's timeout, so its
        // periodic poll cannot be what delivers the change.
        const cap = 3;
        const baseline = await modelRowsServedBy(b, userB);
        Assert(baseline > cap, `precondition: B serves more than ${cap} models (got ${baseline})`);
        const previous = await setModelsMaxRows(a, userA, cap);
        try {
            const elapsed = await waitUntil(async () => (await modelRowsServedBy(b, userB)) === cap, 20000);
            console.log(`      → B applied UserViewMaxRows=${cap} ${elapsed === null ? 'never (20 s)' : `after ${elapsed} ms`}`);
            Assert(elapsed !== null, 'B must adopt the metadata change A saved, without waiting for its periodic poll');
        } finally {
            await setModelsMaxRows(a, userA, previous);
            const restored = await waitUntil(async () => (await modelRowsServedBy(b, userB)) === baseline, 20000);
            console.log(`      → B restored in ${restored ?? 'never (20 s)'} ms`);
        }
    });

    suite.Test('XS4: a transaction group saved through A leaves B serving every row of it, and none after a group of deletes', async () => {
        await categoryIdsServedBy(b, userB); // B caches the slot before A's group changes it
        const group = await a.CreateTransactionGroup();
        const categories: MJActionCategoryEntity[] = [];
        for (let i = 0; i < 3; i++) {
            const category = await a.GetEntityObject<MJActionCategoryEntity>('MJ: Action Categories', userA);
            category.NewRecord();
            category.Name = `XS4 group ${i} ${Date.now()} (mj-integration-test — safe to delete)`;
            category.Status = 'Active';
            category.TransactionGroup = group;
            Assert(await category.Save(), `queueing a category in A failed: ${category.LatestResult?.CompleteMessage ?? 'unknown'}`);
            categories.push(category);
        }
        Assert(await group.Submit(), 'the transaction group in A failed to submit');
        const ids = categories.map(c => c.ID.toUpperCase());
        let deleted = false;
        try {
            const arrived = await waitUntil(async () => {
                const served = await categoryIdsServedBy(b, userB);
                return ids.every(id => served.has(id));
            }, 10000);
            console.log(`      → B served all ${ids.length} rows of A's group ${arrived === null ? 'never (10 s)' : `after ${arrived} ms`}`);
            Assert(arrived !== null, "B must serve every row of A's transaction group");

            const deletes = await a.CreateTransactionGroup();
            for (const category of categories) {
                category.TransactionGroup = deletes;
                Assert(await category.Delete(), `queueing a delete in A failed: ${category.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
            Assert(await deletes.Submit(), 'the group of deletes in A failed to submit');
            deleted = true;
            const gone = await waitUntil(async () => {
                const served = await categoryIdsServedBy(b, userB);
                return ids.every(id => !served.has(id));
            }, 10000);
            console.log(`      → B dropped all ${ids.length} rows ${gone === null ? 'never (10 s)' : `after ${gone} ms`}`);
            Assert(gone !== null, "B must stop serving the rows A's group of deletes removed");
        } finally {
            if (!deleted) {
                // Through a new group: each entity still points at the submitted one, which would take
                // a plain Delete() and never run it.
                const cleanup = await a.CreateTransactionGroup();
                for (const category of categories) {
                    category.TransactionGroup = cleanup;
                    await category.Delete();
                }
                await cleanup.Submit();
            }
        }
    });

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
