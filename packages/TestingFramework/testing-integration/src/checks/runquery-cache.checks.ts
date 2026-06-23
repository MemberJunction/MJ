/**
 * runquery-cache.checks.ts — the 'runquery-cache' bundle (Q1–Q9) + its fixtures.
 *
 * PORTED VERBATIM from packages/MJServer/integration-test-scripts/runquery-cache-tests.ts.
 * Unlike the cache suites, this bundle needs self-contained fixtures: one Query
 * Category and two Queries (TTL-mode + smart-validation-mode). `createRunQueryFixtures`
 * / `teardownRunQueryFixtures` lift the original bootstrap/teardown so BOTH the
 * IntegrationTestDriver (driver-level try/finally) and the tsx script create and
 * tear them down identically. The fixtures are threaded onto ctx.Fixtures; each
 * Q-check reads them from there.
 *
 * The whole bundle mutates the DB by design (creates/deletes MJ: User Settings rows
 * the fixture queries count), so the Q-checks are NOT RequiresMutation-gated — they
 * always run when the runquery-cache bundle is selected. Static RunView/RunQuery
 * imports replace the original in-function `await import(...)` (MJ rule: no dynamic import).
 */
import { RunView, RunQuery, Metadata } from '@memberjunction/core';
import type { IRunQueryProvider, UserInfo } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import type { MJQueryCategoryEntity, MJQueryEntity, MJUserSettingEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext, RunQueryFixtures } from '../check';

/** All fixture-mutated settings share this prefix so teardown can sweep leftovers. */
export const RUNQUERY_SETTING_PREFIX = 'mj.integrationtest.rq';

function Sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Resolve the bundle's fixtures or fail loudly (driver/script must create them first). */
function requireFixtures(ctx: IntegrationCheckContext): RunQueryFixtures {
    if (!ctx.Fixtures) {
        throw new Error('RunQuery fixtures not initialized — they must be created before the runquery-cache bundle runs.');
    }
    return ctx.Fixtures;
}

/** Create a SETTING_PREFIX-tagged MJ: User Settings row so fixture queries can count it. */
async function createSetting(user: UserInfo, tag: string): Promise<MJUserSettingEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', user);
    setting.UserID = user.ID;
    setting.Setting = `${RUNQUERY_SETTING_PREFIX}.${tag}.${Date.now()}`;
    setting.Value = 'rq-test';
    Assert(await setting.Save(), `setting save failed: ${setting.LatestResult?.CompleteMessage}`);
    return setting;
}

/**
 * Create the self-contained Query/Category fixtures (lifted from the original
 * bootstrap). Forces QueryEngine to refresh so resolveQuery sees them.
 */
export async function createRunQueryFixtures(ctx: IntegrationCheckContext): Promise<RunQueryFixtures> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const schema = ctx.Schema ?? '__mj';
    const user = ctx.User;

    const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', user);
    category.Name = `Integration Test Queries ${Date.now()}`;
    category.UserID = user.ID;
    if (!await category.Save()) {
        throw new Error(`Fixture category save failed: ${category.LatestResult?.CompleteMessage}`);
    }

    const countSQL = `SELECT COUNT(*) AS SettingCount FROM ${schema}.vwUserSettings WHERE Setting LIKE '${RUNQUERY_SETTING_PREFIX}%'`;

    const ttlQuery = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    ttlQuery.Name = `CacheTest TTL ${Date.now()}`;
    ttlQuery.CategoryID = category.ID;
    ttlQuery.SQL = countSQL;
    ttlQuery.Status = 'Approved';
    if (!await ttlQuery.Save()) {
        throw new Error(`TTL fixture query save failed: ${ttlQuery.LatestResult?.CompleteMessage}`);
    }

    const validatedQuery = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    validatedQuery.Name = `CacheTest Validated ${Date.now()}`;
    validatedQuery.CategoryID = category.ID;
    validatedQuery.SQL = countSQL;
    validatedQuery.Status = 'Approved';
    validatedQuery.CacheValidationSQL =
        `SELECT MAX(__mj_UpdatedAt) AS [MaxUpdatedAt], COUNT(*) AS [RowCount] FROM ${schema}.vwUserSettings WHERE Setting LIKE '${RUNQUERY_SETTING_PREFIX}%'`;
    if (!await validatedQuery.Save()) {
        throw new Error(`Validated fixture query save failed: ${validatedQuery.LatestResult?.CompleteMessage}`);
    }

    // Force the QueryEngine to see the fixtures (resolveQuery reads its cache)
    await QueryEngine.Instance.Config(true, user);

    return { Category: category, TtlQuery: ttlQuery, ValidatedQuery: validatedQuery };
}

/** Best-effort teardown — sweep leftover settings, then delete queries + category in FK-safe order. */
export async function teardownRunQueryFixtures(ctx: IntegrationCheckContext, fixtures: RunQueryFixtures): Promise<void> {
    try {
        const rv = new RunView();
        const leftovers = await rv.RunView<MJUserSettingEntity>({
            EntityName: 'MJ: User Settings',
            ExtraFilter: `Setting LIKE '${RUNQUERY_SETTING_PREFIX}%'`,
            ResultType: 'entity_object',
            BypassCache: true
        }, ctx.User);
        for (const row of leftovers.Results) {
            await row.Delete();
        }
        await fixtures.ValidatedQuery.Delete();
        await fixtures.TtlQuery.Delete();
        await fixtures.Category.Delete();
    } catch (e) {
        console.error(`Teardown warning: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** The ordered runquery-cache bundle. The whole bundle mutates the DB by design. */
export const RunQueryCacheChecks: NamedCheck[] = [
    {
        Id: 'runquery-cache.Q1',
        Name: 'Q1: no CacheLocal → the RunQuery cache is never touched',
        Fn: async (ctx): Promise<void> => {
            const { TtlQuery } = requireFixtures(ctx);
            const rq = new RunQuery();
            ctx.Storage.ResetCounts();
            const a = await rq.RunQuery({ QueryID: TtlQuery.ID }, ctx.User);
            const b = await rq.RunQuery({ QueryID: TtlQuery.ID }, ctx.User);
            Assert(a.Success && b.Success, `runs failed: ${a.ErrorMessage || b.ErrorMessage}`);
            AssertEqual(ctx.Storage.SetCount('RunQueryCache'), 0, 'no slot writes without CacheLocal');
            AssertEqual(ctx.Storage.GetCount('RunQueryCache'), 0, 'no slot reads without CacheLocal');
        }
    },
    {
        Id: 'runquery-cache.Q2',
        Name: 'Q2: CacheLocal TTL mode — miss writes a slot, repeat serves from it with zero execution',
        Fn: async (ctx): Promise<void> => {
            const { TtlQuery } = requireFixtures(ctx);
            const rq = new RunQuery();
            ctx.Storage.ResetCounts();
            const miss = await rq.RunQuery({ QueryID: TtlQuery.ID, CacheLocal: true }, ctx.User);
            Assert(miss.Success, `miss failed: ${miss.ErrorMessage}`);
            await Sleep(200); // slot write is fire-and-forget
            Assert(ctx.Storage.SetCount('RunQueryCache') > 0, 'miss must write a RunQueryCache slot');

            const setsBefore = ctx.Storage.SetCount('RunQueryCache');
            const hit = await rq.RunQuery({ QueryID: TtlQuery.ID, CacheLocal: true }, ctx.User);
            Assert(hit.Success, `hit failed: ${hit.ErrorMessage}`);
            AssertEqual(hit.ExecutionTime, 0, 'TTL-served results report ExecutionTime 0');
            AssertEqual(hit.CacheHit, true, 'TTL-served results report CacheHit true');
            AssertEqual(hit.Results.length, miss.Results.length, 'served rows must match');
            AssertEqual(ctx.Storage.SetCount('RunQueryCache'), setsBefore, 'a hit must not rewrite the slot');
        }
    },
    {
        Id: 'runquery-cache.Q3',
        Name: 'Q3: CacheLocalTTL expiry — an expired slot re-executes and rewrites',
        Fn: async (ctx): Promise<void> => {
            const { TtlQuery } = requireFixtures(ctx);
            const rq = new RunQuery();
            const params = { QueryName: TtlQuery.Name, CacheLocal: true, CacheLocalTTL: 1200 };
            const first = await rq.RunQuery({ ...params }, ctx.User);
            Assert(first.Success, `first failed: ${first.ErrorMessage}`);
            await Sleep(1700); // outlive the TTL
            ctx.Storage.ResetCounts();
            const second = await rq.RunQuery({ ...params }, ctx.User);
            Assert(second.Success, `second failed: ${second.ErrorMessage}`);
            Assert(second.CacheHit !== true, 'expired slot must NOT be served as a cache hit');
            await Sleep(200);
            Assert(ctx.Storage.SetCount('RunQueryCache') > 0, 'expired slot must be rewritten after re-execution');
        }
    },
    {
        Id: 'runquery-cache.Q4',
        Name: 'Q4: BREAK ATTEMPT — MaxRows must fingerprint separately (no cross-shape serving)',
        Fn: async (ctx): Promise<void> => {
            const { TtlQuery } = requireFixtures(ctx);
            const rq = new RunQuery();
            const filterAll = await rq.RunQuery({ QueryID: TtlQuery.ID, CacheLocal: true }, ctx.User);
            Assert(filterAll.Success, `unlimited failed: ${filterAll.ErrorMessage}`);
            // Same query + MaxRows 1 within the slot TTL — under a fingerprint that ignored
            // MaxRows this would be served the unlimited slot verbatim
            const limited = await rq.RunQuery({ QueryID: TtlQuery.ID, CacheLocal: true, MaxRows: 1 }, ctx.User);
            Assert(limited.Success, `limited failed: ${limited.ErrorMessage}`);
            Assert(limited.CacheHit !== true, 'different MaxRows must NOT hit the unlimited slot');
        }
    },
    {
        Id: 'runquery-cache.Q5',
        Name: 'Q5: TTL mode serves stale-by-design within the TTL, fresh after expiry',
        Fn: async (ctx): Promise<void> => {
            const { TtlQuery } = requireFixtures(ctx);
            const rq = new RunQuery();
            // Own Parameters tag → own fingerprint slot (Q2/Q4 already created a default-TTL
            // slot for the bare-params fingerprint; TTL lives on the slot, not the request)
            const params = { QueryID: TtlQuery.ID, CacheLocal: true, CacheLocalTTL: 2500, Parameters: { scope: 'q5' } };
            const before = await rq.RunQuery({ ...params }, ctx.User);
            Assert(before.Success, `before failed: ${before.ErrorMessage}`);
            const baseline = Number(before.Results[0].SettingCount);

            const setting = await createSetting(ctx.User, 'q5');
            try {
                // Within TTL: documented behavior — the slot serves the stale count
                const during = await rq.RunQuery({ ...params }, ctx.User);
                AssertEqual(Number(during.Results[0].SettingCount), baseline,
                    'within the TTL the cached (stale) count is served — documented TTL semantics');
                AssertEqual(during.CacheHit, true, 'within-TTL read must be a cache hit');

                await Sleep(3000); // outlive TTL
                const after = await rq.RunQuery({ ...params }, ctx.User);
                Assert(after.CacheHit !== true, 'post-expiry read must NOT be a cache hit');
                AssertEqual(Number(after.Results[0].SettingCount), baseline + 1,
                    'after TTL expiry the fresh count must appear');
            } finally {
                await setting.Delete();
            }
        }
    },
    {
        Id: 'runquery-cache.Q6',
        Name: 'Q6: smart validation — current vs stale via CacheValidationSQL (in-process provider call)',
        Fn: async (ctx): Promise<void> => {
            const { ValidatedQuery } = requireFixtures(ctx);
            // Drive RunQueriesWithCacheCheck directly with a synthetic cacheStatus, the way
            // a client transport does. First learn the true current status:
            const provider = Metadata.Provider as unknown as IRunQueryProvider; // global-provider-ok: integration test script — single-provider process by design
            Assert(typeof provider.RunQueriesWithCacheCheck === 'function', 'provider must implement RunQueriesWithCacheCheck');

            const fresh = await provider.RunQueriesWithCacheCheck!([
                { params: { QueryID: ValidatedQuery.ID } } // no cacheStatus → stale + fresh rows
            ], ctx.User);
            Assert(fresh.success && fresh.results[0]?.status === 'stale', `expected stale for no-cacheStatus, got ${fresh.results[0]?.status}`);
            const trueMax = fresh.results[0].maxUpdatedAt ?? '';
            const trueCount = fresh.results[0].rowCount ?? 0;

            // Matching status → current (no data transferred)
            const current = await provider.RunQueriesWithCacheCheck!([
                { params: { QueryID: ValidatedQuery.ID }, cacheStatus: { maxUpdatedAt: trueMax, rowCount: trueCount } }
            ], ctx.User);
            AssertEqual(current.results[0]?.status, 'current', 'matching cacheStatus must validate as current');
            Assert(!current.results[0]?.results, 'current responses must carry no rows');

            // Mutate the underlying data → same cacheStatus must now be stale with fresh rows
            const setting = await createSetting(ctx.User, 'q6');
            try {
                const stale = await provider.RunQueriesWithCacheCheck!([
                    { params: { QueryID: ValidatedQuery.ID }, cacheStatus: { maxUpdatedAt: trueMax, rowCount: trueCount } }
                ], ctx.User);
                AssertEqual(stale.results[0]?.status, 'stale', 'changed data must invalidate the cacheStatus');
                Assert(Array.isArray(stale.results[0]?.results), 'stale responses must carry fresh rows');
            } finally {
                await setting.Delete();
            }
        }
    },
    {
        Id: 'runquery-cache.Q7',
        Name: 'Q7: queries WITHOUT CacheValidationSQL answer no_validation with fresh rows',
        Fn: async (ctx): Promise<void> => {
            const { TtlQuery } = requireFixtures(ctx);
            const provider = Metadata.Provider as unknown as IRunQueryProvider; // global-provider-ok: integration test script — single-provider process by design
            const response = await provider.RunQueriesWithCacheCheck!([
                { params: { QueryID: TtlQuery.ID }, cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00Z', rowCount: 0 } }
            ], ctx.User);
            AssertEqual(response.results[0]?.status, 'no_validation', 'no CacheValidationSQL → no_validation');
            Assert(Array.isArray(response.results[0]?.results), 'no_validation responses must carry fresh rows');
        }
    },
    {
        Id: 'runquery-cache.Q8',
        Name: 'Q8: BREAK ATTEMPT — failed executions are never cached',
        Fn: async (ctx): Promise<void> => {
            const { Category } = requireFixtures(ctx);
            const rq = new RunQuery();
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const broken = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', ctx.User);
            broken.Name = `CacheTest Broken ${Date.now()}`;
            broken.CategoryID = Category.ID;
            broken.SQL = 'SELECT FROM nowhere_at_all';
            broken.Status = 'Approved';
            Assert(await broken.Save(), `broken fixture save failed: ${broken.LatestResult?.CompleteMessage}`);
            try {
                await QueryEngine.Instance.Config(true, ctx.User);
                ctx.Storage.ResetCounts();
                const result = await rq.RunQuery({ QueryID: broken.ID, CacheLocal: true }, ctx.User);
                Assert(!result.Success, 'broken SQL must fail');
                await Sleep(300);
                AssertEqual(ctx.Storage.SetCount('RunQueryCache'), 0, 'failed executions must not write cache slots');
            } finally {
                await broken.Delete();
            }
        }
    },
    {
        Id: 'runquery-cache.Q9',
        Name: 'Q9: BREAK ATTEMPT — parameter objects with different key ORDER are equivalent or safely separate',
        Fn: async (ctx): Promise<void> => {
            const { TtlQuery } = requireFixtures(ctx);
            const rq = new RunQuery();
            // The fingerprint JSON-stringifies Parameters — key order produces different
            // fingerprints for semantically identical requests. That must never produce
            // WRONG results (worst case: a redundant slot). Both calls must be correct.
            const a = await rq.RunQuery({ QueryID: TtlQuery.ID, CacheLocal: true, Parameters: { x: 1, y: 2 } }, ctx.User);
            const b = await rq.RunQuery({ QueryID: TtlQuery.ID, CacheLocal: true, Parameters: { y: 2, x: 1 } }, ctx.User);
            Assert(a.Success && b.Success, `runs failed: ${a.ErrorMessage || b.ErrorMessage}`);
            AssertEqual(a.Results.length, b.Results.length, 'identical parameters must produce identical results regardless of key order');
        }
    }
];

for (const check of RunQueryCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
