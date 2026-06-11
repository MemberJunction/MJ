/**
 * client-cache-tests.ts — live integration tests for CLIENT-side RunView caching.
 *
 * Connects to a RUNNING MJAPI instance the way a browser client does — via
 * GraphQLDataProvider — but from Node: authentication uses the system API key
 * (x-mj-api-key, MJ_API_KEY in .env) and the cache is backed by an in-memory
 * ILocalStorageProvider (the same fallback GraphQLDataProvider itself selects
 * when IndexedDB is unavailable), wrapped with counters so tests can observe
 * client cache traffic.
 *
 * Client providers have TrustLocalCacheCompletely = false, so caching is opt-in
 * per query via CacheLocal: the smart-cache-check flow sends each entry's
 * maxUpdatedAt/rowCount fingerprint to the server, which answers current/stale.
 * This suite verifies the per-Fields client cache slots (the `|f:` fingerprint),
 * end-to-end shape correctness through the GraphQL transport, dedup/linger keying,
 * and entity_object materialization client-side.
 *
 * PREREQUISITE: MJAPI must be running (npm run start in packages/MJAPI). The
 * endpoint is resolved from env: MJAPI_URL, or http://localhost:{GRAPHQL_PORT}{GRAPHQL_ROOT_PATH}.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/client-cache-tests.ts
 *
 * Exit code: 0 = all passed, 1 = failures, 2 = bootstrap/connectivity error.
 */
import {
    LoadEnv, LoadClientConfig, TestRunner, Assert, AssertEqual, AssertRowShape,
    InstrumentedLocalStorageProvider, UniqueFilter, RowKeys
} from './lib/harness';
import {
    BaseEntity, InMemoryLocalStorageProvider, LocalCacheManager, RunView
} from '@memberjunction/core';
import { GraphQLProviderConfigData, setupGraphQLClient } from '@memberjunction/graphql-dataprovider';

const ENTITY = 'MJ: Entities';
const SMALL_ENTITY = 'MJ: Query Categories';

function Sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fail fast with a clear message when MJAPI isn't reachable. */
async function preflight(url: string, apiKey: string): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
            body: JSON.stringify({ query: '{ __typename }' }),
            signal: AbortSignal.timeout(5000)
        });
    } catch (error) {
        throw new Error(
            `MJAPI is not reachable at ${url} (${error instanceof Error ? error.message : String(error)}). ` +
            `Start it first: cd packages/MJAPI && npm run start`
        );
    }
    if (!response.ok) {
        throw new Error(`MJAPI at ${url} answered HTTP ${response.status} — check MJ_API_KEY and server logs.`);
    }
}

async function bootstrap(): Promise<InstrumentedLocalStorageProvider> {
    LoadEnv();
    const client = LoadClientConfig();
    await preflight(client.Url, client.MJAPIKey);

    const config = new GraphQLProviderConfigData(
        '',                 // JWT token — unused; the system API key authenticates us
        client.Url,
        '',                 // wsurl — no subscriptions needed for this suite
        async () => '',     // refreshTokenFunction — stub; API key auth never refreshes
        '__mj',
        undefined,
        undefined,
        client.MJAPIKey     // mjAPIKey → sent as x-mj-api-key on every request
    );
    await setupGraphQLClient(config);

    // GraphQLDataProvider would lazily fall back to InMemoryLocalStorageProvider
    // under Node anyway (no IndexedDB); we construct it explicitly and wrap it so
    // tests can observe cache reads/writes, then initialize LocalCacheManager the
    // way the browser shell does at startup.
    const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
    await LocalCacheManager.Instance.Initialize(storage, { verboseLogging: false });
    return storage;
}

async function main(): Promise<void> {
    const storage = await bootstrap();
    const rv = new RunView();
    const suite = new TestRunner('Client-side RunView caching (GraphQLDataProvider → live MJAPI)');

    // ── Transport-level shape correctness (no client caching) ─────────────────

    suite.Test('C1: plain RunView (no CacheLocal) with narrow Fields returns only those columns', async () => {
        const result = await rv.RunView({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 'c1'),
            Fields: ['Name', 'SchemaName'],
            ResultType: 'simple'
        });
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        Assert(result.Results.length > 100, `expected 100+ entities, got ${result.Results.length}`);
        AssertRowShape(result.Results[0], ['Name', 'SchemaName'], 'narrow shape through GraphQL transport');
    });

    suite.Test('C2: identical narrow request twice in a row keeps the identical shape (server hit/miss symmetry over the wire)', async () => {
        const params = {
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 'c2'),
            Fields: ['Name', 'BaseView'],
            ResultType: 'simple' as const
        };
        const first = await rv.RunView(params);
        // Outlive the client-side dedup linger window so the second call truly
        // round-trips to the server (exercising the server cache hit path).
        await Sleep(5200);
        const second = await rv.RunView(params);
        Assert(first.Success && second.Success, 'both calls must succeed');
        AssertRowShape(first.Results[0], ['Name', 'BaseView'], 'first (server miss) shape');
        AssertRowShape(second.Results[0], ['Name', 'BaseView'], 'second (server hit) shape');
        AssertEqual(second.Results.length, first.Results.length, 'row counts must match across server miss/hit');
    });

    // ── CacheLocal smart-cache: per-Fields client slots ────────────────────────

    suite.Test('C3: CacheLocal MISS stores a client cache slot; repeat is validated current and served locally', async () => {
        const params = {
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 'c3'),
            Fields: ['Name', 'SchemaName'],
            ResultType: 'simple' as const,
            CacheLocal: true
        };
        storage.ResetCounts();
        const first = await rv.RunView(params);
        Assert(first.Success, `first call failed: ${first.ErrorMessage}`);
        AssertRowShape(first.Results[0], ['Name', 'SchemaName'], 'first-call shape');
        await Sleep(300); // the stale-path client cache write is fire-and-forget
        Assert(storage.SetItemCount > 0, 'first CacheLocal call must write a client cache slot');

        await Sleep(5200); // outlive the dedup linger window
        const setsBefore = storage.SetItemCount;
        storage.GetItemsCount = 0;
        const second = await rv.RunView(params);
        Assert(second.Success, `second call failed: ${second.ErrorMessage}`);
        AssertRowShape(second.Results[0], ['Name', 'SchemaName'], 'second-call shape');
        AssertEqual(second.Results.length, first.Results.length, 'row counts must match');
        Assert(storage.GetItemsCount > 0, 'second call must read the client cache slot');
        AssertEqual(storage.SetItemCount, setsBefore, 'a current slot must not be rewritten');
    });

    suite.Test('C4: a DIFFERENT field subset gets its OWN client slot — no cross-subset serving (the |f: fingerprint fix)', async () => {
        const setsBefore = storage.SetItemCount;
        const result = await rv.RunView({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 'c3'), // same entity+filter as C3's slot
            Fields: ['Name', 'Description'],          // different subset
            ResultType: 'simple',
            CacheLocal: true
        });
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        // Under the old Fields-agnostic client fingerprint, C3's narrow slot would have
        // validated as 'current' for this request and silently served rows WITHOUT
        // Description. The per-Fields slot forces a fresh fetch with the right columns.
        AssertRowShape(result.Results[0], ['Name', 'Description'], 'own-slot shape must include Description');
        await Sleep(300); // fire-and-forget slot write
        Assert(storage.SetItemCount > setsBefore, 'the new subset must write its own client slot');
    });

    suite.Test('C5: a no-Fields (full width) CacheLocal request is not served from a narrow slot', async () => {
        const result = await rv.RunView({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 'c3'), // same entity+filter again
            ResultType: 'simple',
            CacheLocal: true
        });
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        const keyCount = RowKeys(result.Results[0]).length;
        Assert(keyCount > 20, `expected full-width rows (20+ columns), got ${keyCount} — narrow slot must not satisfy '*'`);
    });

    // ── ResultType behaviors over the client pipeline ─────────────────────────

    suite.Test('C6: entity_object results materialize as BaseEntity instances client-side (with CacheLocal)', async () => {
        const params = {
            EntityName: SMALL_ENTITY,
            ExtraFilter: UniqueFilter('Name', 'c6'),
            ResultType: 'entity_object' as const,
            CacheLocal: true
        };
        const first = await rv.RunView<BaseEntity>(params);
        Assert(first.Success, `first call failed: ${first.ErrorMessage}`);
        Assert(first.Results.length > 0, 'expected at least one query category');
        Assert(first.Results[0] instanceof BaseEntity, 'entity_object results must be BaseEntity instances');

        await Sleep(5200); // outlive linger; second call validates the slot and re-materializes
        const second = await rv.RunView<BaseEntity>(params);
        Assert(second.Success, `second call failed: ${second.ErrorMessage}`);
        Assert(second.Results[0] instanceof BaseEntity, 'cache-served entity_object results must re-materialize as BaseEntity');
    });

    suite.Test('C7: linger-window callers with DIFFERENT Fields each get their own shape (client dedup keying)', async () => {
        const filter = UniqueFilter('Name', 'c7');
        const a = await rv.RunViews([{ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }]);
        const b = await rv.RunViews([{ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name', 'Description'], ResultType: 'simple' }]);
        Assert(a[0].Success && b[0].Success, 'both calls must succeed');
        AssertRowShape(a[0].Results[0], ['Name'], 'first caller shape');
        AssertRowShape(b[0].Results[0], ['Name', 'Description'], 'second caller must NOT inherit the first caller\'s narrower shape');
    });

    suite.Test('C8: batch RunViews with mixed CacheLocal projects each result to its own param', async () => {
        const results = await rv.RunViews([
            { EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 'c8a'), Fields: ['Name', 'SchemaName'], ResultType: 'simple', CacheLocal: true },
            { EntityName: SMALL_ENTITY, ExtraFilter: UniqueFilter('Name', 'c8b'), Fields: ['ID', 'Name'], ResultType: 'simple' }
        ]);
        AssertEqual(results.length, 2, 'two results expected');
        Assert(results[0].Success && results[1].Success, 'both batch results must succeed');
        AssertRowShape(results[0].Results[0], ['Name', 'SchemaName'], 'batch index 0 shape (CacheLocal)');
        AssertRowShape(results[1].Results[0], ['ID', 'Name'], 'batch index 1 shape (no caching)');
    });

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
