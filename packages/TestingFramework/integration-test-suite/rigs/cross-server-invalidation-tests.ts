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
import type { UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import type { MJUserSettingEntity } from '@memberjunction/core-entities';
// Side-effect import: registers generated entity subclasses so GetEntityObject<…>()
// materializes a real BaseEntity (this script doesn't go through bootstrapIntegrationClient).
import '@memberjunction/server-bootstrap-lite';
import { TestRunner, Assert, AssertEqual } from './lib/harness';

// Cross-server invalidation is fire-and-forget over Redis pub/sub — give it a window to land.
const SETTLE_MS = 2000;
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Connect an independent GraphQL client to one MJAPI endpoint (its own session). */
async function connectClient(url: string, apiKey: string): Promise<GraphQLDataProvider> {
    const provider = new GraphQLDataProvider();
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

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
