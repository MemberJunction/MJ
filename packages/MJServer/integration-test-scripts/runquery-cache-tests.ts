/**
 * runquery-cache-tests.ts — live integration tests for RunQuery result caching.
 *
 * RunQuery caching is opt-in via RunQueryParams.CacheLocal and stores results in
 * the LocalCacheManager 'RunQueryCache' category, fingerprinted by
 * QueryID|QueryName|Parameters(+MaxRows/StartRow)|Connection. Two modes:
 *  - TTL mode (Query has no CacheValidationSQL): slots served until expiry
 *    (CacheLocalTTL override, else the LocalCacheManager default)
 *  - Smart validation (Query.CacheValidationSQL configured): the provider's
 *    RunQueriesWithCacheCheck validates a caller-supplied cacheStatus
 *    (maxUpdatedAt + rowCount) and answers current / stale(+fresh rows) /
 *    no_validation(+fresh rows)
 *
 * SELF-CONTAINED FIXTURES: this suite CREATES its own Query records (category
 * "Integration Test Queries") at bootstrap and DELETES them in teardown. It also
 * creates/deletes "MJ: User Settings" rows to mutate the data its fixture queries
 * count. Run it knowingly — it writes to the database (and cleans up after itself).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/runquery-cache-tests.ts
 *
 * Exit code: 0 = all passed, 1 = failures, 2 = bootstrap error.
 */
import sql from 'mssql';
import {
    LoadEnv, LoadDbConfig, TestRunner, Assert, AssertEqual,
    InstrumentedLocalStorageProvider
} from './lib/harness';
import {
    InMemoryLocalStorageProvider, LocalCacheManager, Metadata, RunQuery, UserInfo
} from '@memberjunction/core';
import type { IRunQueryProvider } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import { QueryEngine } from '@memberjunction/core-entities';
import type { QueryCategoryEntity, QueryEntity, UserSettingEntity } from '@memberjunction/core-entities';

const SETTING_PREFIX = 'mj.integrationtest.rq';

interface Ctx {
    pool: sql.ConnectionPool;
    user: UserInfo;
    storage: InstrumentedLocalStorageProvider;
    category: QueryCategoryEntity;
    ttlQuery: QueryEntity;        // no CacheValidationSQL → TTL mode
    validatedQuery: QueryEntity;  // CacheValidationSQL → smart validation mode
}

async function bootstrap(): Promise<Ctx> {
    LoadEnv();
    const db = await LoadDbConfig();
    const pool = await new sql.ConnectionPool({
        server: db.Host, port: db.Port, user: db.User, password: db.Password,
        database: db.Database, options: { encrypt: false, trustServerCertificate: true }
    }).connect();

    const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
    await LocalCacheManager.Instance.Initialize(storage, { verboseLogging: false });

    await setupSQLServerClient(new SQLServerProviderConfigData(pool, db.Schema));
    await UserCache.Instance.Refresh(pool);
    const email = process.env.MJ_TEST_USER_EMAIL?.toLowerCase();
    const user =
        (email ? UserCache.Users.find(u => u.Email?.toLowerCase() === email) : undefined)
        ?? UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner')
        ?? UserCache.Users[0];
    if (!user) throw new Error('No context user found in UserCache.');

    // ── Fixtures ──────────────────────────────────────────────────────────────
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design

    const category = await md.GetEntityObject<QueryCategoryEntity>('MJ: Query Categories', user);
    category.Name = `Integration Test Queries ${Date.now()}`;
    category.UserID = user.ID;
    if (!await category.Save()) {
        throw new Error(`Fixture category save failed: ${category.LatestResult?.CompleteMessage}`);
    }

    const countSQL = `SELECT COUNT(*) AS SettingCount FROM ${db.Schema}.vwUserSettings WHERE Setting LIKE '${SETTING_PREFIX}%'`;

    const ttlQuery = await md.GetEntityObject<QueryEntity>('MJ: Queries', user);
    ttlQuery.Name = `CacheTest TTL ${Date.now()}`;
    ttlQuery.CategoryID = category.ID;
    ttlQuery.SQL = countSQL;
    ttlQuery.Status = 'Approved';
    if (!await ttlQuery.Save()) {
        throw new Error(`TTL fixture query save failed: ${ttlQuery.LatestResult?.CompleteMessage}`);
    }

    const validatedQuery = await md.GetEntityObject<QueryEntity>('MJ: Queries', user);
    validatedQuery.Name = `CacheTest Validated ${Date.now()}`;
    validatedQuery.CategoryID = category.ID;
    validatedQuery.SQL = countSQL;
    validatedQuery.Status = 'Approved';
    validatedQuery.CacheValidationSQL =
        `SELECT MAX(__mj_UpdatedAt) AS [MaxUpdatedAt], COUNT(*) AS [RowCount] FROM ${db.Schema}.vwUserSettings WHERE Setting LIKE '${SETTING_PREFIX}%'`;
    if (!await validatedQuery.Save()) {
        throw new Error(`Validated fixture query save failed: ${validatedQuery.LatestResult?.CompleteMessage}`);
    }

    // Force the QueryEngine to see the fixtures (resolveQuery reads its cache)
    await QueryEngine.Instance.Config(true, user);

    return { pool, user, storage, category, ttlQuery, validatedQuery };
}

async function teardown(ctx: Ctx): Promise<void> {
    // Best-effort cleanup — fixtures first, then any leftover settings rows
    try {
        const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
        const rv = new (await import('@memberjunction/core')).RunView();
        const leftovers = await rv.RunView<UserSettingEntity>({
            EntityName: 'MJ: User Settings',
            ExtraFilter: `Setting LIKE '${SETTING_PREFIX}%'`,
            ResultType: 'entity_object',
            BypassCache: true
        }, ctx.user);
        for (const row of leftovers.Results) {
            await row.Delete();
        }
        await ctx.validatedQuery.Delete();
        await ctx.ttlQuery.Delete();
        await ctx.category.Delete();
        void md; // md kept for symmetry; entity objects above carry their own provider
    } catch (e) {
        console.error(`Teardown warning: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function createSetting(user: UserInfo, tag: string): Promise<UserSettingEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings', user);
    setting.UserID = user.ID;
    setting.Setting = `${SETTING_PREFIX}.${tag}.${Date.now()}`;
    setting.Value = 'rq-test';
    Assert(await setting.Save(), `setting save failed: ${setting.LatestResult?.CompleteMessage}`);
    return setting;
}

function Sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
    const ctx = await bootstrap();
    const { user, storage, ttlQuery, validatedQuery } = ctx;
    const rq = new RunQuery();
    const suite = new TestRunner('RunQuery result caching (server provider, live SQL Server)');

    suite.Test('Q1: no CacheLocal → the RunQuery cache is never touched', async () => {
        storage.ResetCounts();
        const a = await rq.RunQuery({ QueryID: ttlQuery.ID }, user);
        const b = await rq.RunQuery({ QueryID: ttlQuery.ID }, user);
        Assert(a.Success && b.Success, `runs failed: ${a.ErrorMessage || b.ErrorMessage}`);
        AssertEqual(storage.SetCount('RunQueryCache'), 0, 'no slot writes without CacheLocal');
        AssertEqual(storage.GetCount('RunQueryCache'), 0, 'no slot reads without CacheLocal');
    });

    suite.Test('Q2: CacheLocal TTL mode — miss writes a slot, repeat serves from it with zero execution', async () => {
        storage.ResetCounts();
        const miss = await rq.RunQuery({ QueryID: ttlQuery.ID, CacheLocal: true }, user);
        Assert(miss.Success, `miss failed: ${miss.ErrorMessage}`);
        await Sleep(200); // slot write is fire-and-forget
        Assert(storage.SetCount('RunQueryCache') > 0, 'miss must write a RunQueryCache slot');

        const setsBefore = storage.SetCount('RunQueryCache');
        const hit = await rq.RunQuery({ QueryID: ttlQuery.ID, CacheLocal: true }, user);
        Assert(hit.Success, `hit failed: ${hit.ErrorMessage}`);
        AssertEqual(hit.ExecutionTime, 0, 'TTL-served results report ExecutionTime 0');
        AssertEqual(hit.CacheHit, true, 'TTL-served results report CacheHit true');
        AssertEqual(hit.Results.length, miss.Results.length, 'served rows must match');
        AssertEqual(storage.SetCount('RunQueryCache'), setsBefore, 'a hit must not rewrite the slot');
    });

    suite.Test('Q3: CacheLocalTTL expiry — an expired slot re-executes and rewrites', async () => {
        const params = { QueryName: ttlQuery.Name, CacheLocal: true, CacheLocalTTL: 1200 };
        const first = await rq.RunQuery({ ...params }, user);
        Assert(first.Success, `first failed: ${first.ErrorMessage}`);
        await Sleep(1700); // outlive the TTL
        storage.ResetCounts();
        const second = await rq.RunQuery({ ...params }, user);
        Assert(second.Success, `second failed: ${second.ErrorMessage}`);
        Assert(second.CacheHit !== true, 'expired slot must NOT be served as a cache hit');
        await Sleep(200);
        Assert(storage.SetCount('RunQueryCache') > 0, 'expired slot must be rewritten after re-execution');
    });

    suite.Test('Q4: BREAK ATTEMPT — MaxRows must fingerprint separately (no cross-shape serving)', async () => {
        const filterAll = await rq.RunQuery({ QueryID: ttlQuery.ID, CacheLocal: true }, user);
        Assert(filterAll.Success, `unlimited failed: ${filterAll.ErrorMessage}`);
        // Same query + MaxRows 1 within the slot TTL — under a fingerprint that ignored
        // MaxRows this would be served the unlimited slot verbatim
        const limited = await rq.RunQuery({ QueryID: ttlQuery.ID, CacheLocal: true, MaxRows: 1 }, user);
        Assert(limited.Success, `limited failed: ${limited.ErrorMessage}`);
        Assert(limited.CacheHit !== true, 'different MaxRows must NOT hit the unlimited slot');
    });

    suite.Test('Q5: TTL mode serves stale-by-design within the TTL, fresh after expiry', async () => {
        // Own Parameters tag → own fingerprint slot (Q2/Q4 already created a default-TTL
        // slot for the bare-params fingerprint; TTL lives on the slot, not the request)
        const params = { QueryID: ttlQuery.ID, CacheLocal: true, CacheLocalTTL: 2500, Parameters: { scope: 'q5' } };
        const before = await rq.RunQuery({ ...params }, user);
        Assert(before.Success, `before failed: ${before.ErrorMessage}`);
        const baseline = Number(before.Results[0].SettingCount);

        const setting = await createSetting(user, 'q5');
        try {
            // Within TTL: documented behavior — the slot serves the stale count
            const during = await rq.RunQuery({ ...params }, user);
            AssertEqual(Number(during.Results[0].SettingCount), baseline,
                'within the TTL the cached (stale) count is served — documented TTL semantics');
            AssertEqual(during.CacheHit, true, 'within-TTL read must be a cache hit');

            await Sleep(3000); // outlive TTL
            const after = await rq.RunQuery({ ...params }, user);
            Assert(after.CacheHit !== true, 'post-expiry read must NOT be a cache hit');
            AssertEqual(Number(after.Results[0].SettingCount), baseline + 1,
                'after TTL expiry the fresh count must appear');
        } finally {
            await setting.Delete();
        }
    });

    suite.Test('Q6: smart validation — current vs stale via CacheValidationSQL (in-process provider call)', async () => {
        // Drive RunQueriesWithCacheCheck directly with a synthetic cacheStatus, the way
        // a client transport does. First learn the true current status:
        const provider = Metadata.Provider as unknown as IRunQueryProvider; // global-provider-ok: integration test script — single-provider process by design
        Assert(typeof provider.RunQueriesWithCacheCheck === 'function', 'provider must implement RunQueriesWithCacheCheck');

        const fresh = await provider.RunQueriesWithCacheCheck!([
            { params: { QueryID: validatedQuery.ID } } // no cacheStatus → stale + fresh rows
        ], user);
        Assert(fresh.success && fresh.results[0]?.status === 'stale', `expected stale for no-cacheStatus, got ${fresh.results[0]?.status}`);
        const trueMax = fresh.results[0].maxUpdatedAt ?? '';
        const trueCount = fresh.results[0].rowCount ?? 0;

        // Matching status → current (no data transferred)
        const current = await provider.RunQueriesWithCacheCheck!([
            { params: { QueryID: validatedQuery.ID }, cacheStatus: { maxUpdatedAt: trueMax, rowCount: trueCount } }
        ], user);
        AssertEqual(current.results[0]?.status, 'current', 'matching cacheStatus must validate as current');
        Assert(!current.results[0]?.results, 'current responses must carry no rows');

        // Mutate the underlying data → same cacheStatus must now be stale with fresh rows
        const setting = await createSetting(user, 'q6');
        try {
            const stale = await provider.RunQueriesWithCacheCheck!([
                { params: { QueryID: validatedQuery.ID }, cacheStatus: { maxUpdatedAt: trueMax, rowCount: trueCount } }
            ], user);
            AssertEqual(stale.results[0]?.status, 'stale', 'changed data must invalidate the cacheStatus');
            Assert(Array.isArray(stale.results[0]?.results), 'stale responses must carry fresh rows');
        } finally {
            await setting.Delete();
        }
    });

    suite.Test('Q7: queries WITHOUT CacheValidationSQL answer no_validation with fresh rows', async () => {
        const provider = Metadata.Provider as unknown as IRunQueryProvider; // global-provider-ok: integration test script — single-provider process by design
        const response = await provider.RunQueriesWithCacheCheck!([
            { params: { QueryID: ttlQuery.ID }, cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00Z', rowCount: 0 } }
        ], user);
        AssertEqual(response.results[0]?.status, 'no_validation', 'no CacheValidationSQL → no_validation');
        Assert(Array.isArray(response.results[0]?.results), 'no_validation responses must carry fresh rows');
    });

    suite.Test('Q8: BREAK ATTEMPT — failed executions are never cached', async () => {
        const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
        const broken = await md.GetEntityObject<QueryEntity>('MJ: Queries', user);
        broken.Name = `CacheTest Broken ${Date.now()}`;
        broken.CategoryID = ctx.category.ID;
        broken.SQL = 'SELECT FROM nowhere_at_all';
        broken.Status = 'Approved';
        Assert(await broken.Save(), `broken fixture save failed: ${broken.LatestResult?.CompleteMessage}`);
        try {
            await QueryEngine.Instance.Config(true, user);
            storage.ResetCounts();
            const result = await rq.RunQuery({ QueryID: broken.ID, CacheLocal: true }, user);
            Assert(!result.Success, 'broken SQL must fail');
            await Sleep(300);
            AssertEqual(storage.SetCount('RunQueryCache'), 0, 'failed executions must not write cache slots');
        } finally {
            await broken.Delete();
        }
    });

    suite.Test('Q9: BREAK ATTEMPT — parameter objects with different key ORDER are equivalent or safely separate', async () => {
        // The fingerprint JSON-stringifies Parameters — key order produces different
        // fingerprints for semantically identical requests. That must never produce
        // WRONG results (worst case: a redundant slot). Both calls must be correct.
        const a = await rq.RunQuery({ QueryID: ttlQuery.ID, CacheLocal: true, Parameters: { x: 1, y: 2 } }, user);
        const b = await rq.RunQuery({ QueryID: ttlQuery.ID, CacheLocal: true, Parameters: { y: 2, x: 1 } }, user);
        Assert(a.Success && b.Success, `runs failed: ${a.ErrorMessage || b.ErrorMessage}`);
        AssertEqual(a.Results.length, b.Results.length, 'identical parameters must produce identical results regardless of key order');
    });

    const failures = await suite.Run();
    await teardown(ctx);
    await ctx.pool.close();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(async err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
