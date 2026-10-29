/**
 * runquery-cache.checks.ts — the 'runquery-cache' bundle (Q1–Q21) + its fixtures.
 *
 * PORTED VERBATIM from packages/MJServer/integration-test-scripts/runquery-cache-tests.ts.
 * Unlike the cache suites, this bundle needs self-contained fixtures: one Query
 * Category and two Queries (TTL-mode + smart-validation-mode), wired through the standard
 * `BundleLifecycle` (RegisterLifecycle below, backed by `createRunQueryFixtures` /
 * `teardownRunQueryFixtures`) so BOTH the IntegrationTestDriver and the tsx dispatcher run
 * Setup + Teardown inside ONE try/finally — Teardown is guaranteed even on a mid-Setup crash.
 * The fixtures are threaded onto ctx.Fixtures; each Q-check reads them from there.
 *
 * The whole bundle mutates the DB by design (creates/deletes MJ: User Settings rows
 * the fixture queries count), so the Q-checks are NOT RequiresMutation-gated — they
 * always run when the runquery-cache bundle is selected. Static RunView/RunQuery
 * imports replace the original in-function `await import(...)` (MJ rule: no dynamic import).
 */
import { RunView, RunQuery, Metadata, UserInfo } from '@memberjunction/core';
import type { IRunQueryProvider, RunQueryResult, DatabaseProviderBase } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import type { MJQueryCategoryEntity, MJQueryEntity, MJQueryEntityEntity, MJQueryParameterEntity, MJQuerySQLEntity, MJUserSettingEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, SkipCheck } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, RunQueryFixtures } from '@memberjunction/testing-integration';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';

/** All fixture-mutated settings share this prefix so teardown can sweep leftovers. */
export const RUNQUERY_SETTING_PREFIX = 'mj.integrationtest.rq';

function Sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** The seeded role-less principal (shared with the permission-engine bundle's PE9/PE10). */
export const NOGRANT_EMAIL = 'it-nogrant@integration.test';

let noGrantMemo: { User: UserInfo | undefined } | undefined;

/**
 * Load the seeded role-less user as a real `UserInfo` for Q12. Role-less by definition, so the
 * reconstructed principal needs no UserRoles rows — an empty roles array IS the fixture's shape
 * (asserted). Returns undefined (⇒ Q12 skips) when the seed has not been pushed or is unusable.
 */
async function loadNoGrantUser(ctx: { User: UserInfo; Provider: import('@memberjunction/core').IMetadataProvider }): Promise<UserInfo | undefined> {
    if (noGrantMemo !== undefined) {
        return noGrantMemo.User;
    }
    const rv = new RunView();
    const userResult = await rv.RunView<{ ID: string; Name: string; Email: string; Type: string; IsActive: boolean }>({
        EntityName: 'MJ: Users',
        ExtraFilter: `Email='${NOGRANT_EMAIL}'`,
        Fields: ['ID', 'Name', 'Email', 'Type', 'IsActive'],
        ResultType: 'simple'
    }, ctx.User);
    if (!userResult.Success || userResult.Results.length === 0) {
        noGrantMemo = { User: undefined };
        return undefined;
    }
    const row = userResult.Results[0];
    const roleCheck = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: User Roles',
        ExtraFilter: `UserID='${row.ID}'`,
        Fields: ['ID'],
        ResultType: 'simple'
    }, ctx.User);
    if (roleCheck.Success && roleCheck.Results.length > 0) {
        // The fixture's entire meaning is "zero roles" — a role would silently flip Q12's
        // preconditions, so refuse to use it rather than produce a confusing failure downstream.
        console.warn(`  ⚠ '${NOGRANT_EMAIL}' has ${roleCheck.Results.length} role(s) — fixture invalid, Q12 will skip`);
        noGrantMemo = { User: undefined };
        return undefined;
    }
    const user = new UserInfo(ctx.Provider, { ID: row.ID, Name: row.Name, Email: row.Email, Type: row.Type, IsActive: row.IsActive, UserRoles: [] });
    noGrantMemo = { User: user };
    return user;
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
export async function CreateRunQueryFixtures(ctx: IntegrationCheckContext): Promise<RunQueryFixtures> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const schema = ctx.Schema ?? '__mj';
    const user = ctx.User;

    // Publish the fixture handle on the context UP-FRONT and populate each field as its record
    // is created — so a mid-Setup crash (e.g. the second query save failing) still leaves teardown a
    // handle referencing whatever was already created, instead of orphaning it. Consumers only read
    // the handle after a SUCCESSFUL Setup (all three fields present), so the up-front partial is safe.
    const fixtures = (ctx.Fixtures = {} as RunQueryFixtures);

    const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', user);
    category.Name = `Integration Test Queries ${Date.now()}`;
    category.UserID = user.ID;
    if (!await category.Save()) {
        throw new Error(`Fixture category save failed: ${category.LatestResult?.CompleteMessage}`);
    }
    fixtures.Category = category;

    const countSQL = `SELECT COUNT(*) AS SettingCount FROM ${schema}.vwUserSettings WHERE Setting LIKE '${RUNQUERY_SETTING_PREFIX}%'`;

    const ttlQuery = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    ttlQuery.Name = `CacheTest TTL ${Date.now()}`;
    ttlQuery.CategoryID = category.ID;
    ttlQuery.SQL = countSQL;
    ttlQuery.Status = 'Approved';
    if (!await ttlQuery.Save(FixtureQuerySaveOptions())) {
        throw new Error(`TTL fixture query save failed: ${ttlQuery.LatestResult?.CompleteMessage}`);
    }
    fixtures.TtlQuery = ttlQuery;

    const validatedQuery = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    validatedQuery.Name = `CacheTest Validated ${Date.now()}`;
    validatedQuery.CategoryID = category.ID;
    validatedQuery.SQL = countSQL;
    validatedQuery.Status = 'Approved';
    // Column aliases quoted through the dialect, not with T-SQL brackets. `CacheValidationSQL` is
    // executed verbatim against whichever backend is running, so `AS [MaxUpdatedAt]` fails on
    // PostgreSQL with `syntax error at or near "["` — and because that SQL is the cache VALIDATOR,
    // the failure is reported as `cacheStatus: error` rather than as a broken fixture, which reads
    // like the cache logic is wrong when it is the fixture that never ran.
    //
    // `__mj_UpdatedAt` is quoted for a second, separate reason: the PostgreSQL auto-quoting
    // tokenizer deliberately leaves `__mj_`-prefixed words alone, so an unquoted reference folds to
    // `__mj_updatedat` — and the shipped PG baseline creates that column case-preserved. Spelling
    // it out here does not depend on that rule either way.
    const q = (ctx.Provider as unknown as DatabaseProviderBase).Dialect;
    validatedQuery.CacheValidationSQL =
        `SELECT MAX(${q.QuoteIdentifier('__mj_UpdatedAt')}) AS ${q.QuoteIdentifier('MaxUpdatedAt')}, ` +
        `COUNT(*) AS ${q.QuoteIdentifier('RowCount')} ` +
        `FROM ${schema}.vwUserSettings WHERE Setting LIKE '${RUNQUERY_SETTING_PREFIX}%'`;
    if (!await validatedQuery.Save(FixtureQuerySaveOptions())) {
        throw new Error(`Validated fixture query save failed: ${validatedQuery.LatestResult?.CompleteMessage}`);
    }
    fixtures.ValidatedQuery = validatedQuery;

    // Force the QueryEngine to see the fixtures (resolveQuery reads its cache)
    await QueryEngine.Instance.Config(true, user);

    return fixtures;
}

/** @deprecated Use {@link CreateRunQueryFixtures}. */
export async function createRunQueryFixtures(ctx: IntegrationCheckContext): Promise<RunQueryFixtures> {
    return CreateRunQueryFixtures(ctx);
}

/**
 * Best-effort teardown — sweep leftover settings, then delete whatever queries/category were
 * created in FK-safe order. Partial-safe (R4): a mid-Setup crash may have created only some of
 * the fixture records, so each is guarded before delete.
 */
export async function TeardownRunQueryFixtures(ctx: IntegrationCheckContext, fixtures: RunQueryFixtures): Promise<void> {
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
        if (fixtures?.ValidatedQuery) {
            await fixtures.ValidatedQuery.Delete();
        }
        if (fixtures?.TtlQuery) {
            await fixtures.TtlQuery.Delete();
        }
        if (fixtures?.Category) {
            await fixtures.Category.Delete();
        }
    } catch (e) {
        console.error(`Teardown warning: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** @deprecated Use {@link TeardownRunQueryFixtures}. */
export async function teardownRunQueryFixtures(ctx: IntegrationCheckContext, fixtures: RunQueryFixtures): Promise<void> {
    return TeardownRunQueryFixtures(ctx, fixtures);
}

// ── Query-definition checks (Q13–Q19): helpers ───────────────────────────────────────────────

/** Time for QueryEngine to apply a local save, which it does asynchronously. */
const ENGINE_SETTLE_MS = 300;

/**
 * The result-deletion settle window this bundle installs on QueryEngine for its own duration (see
 * the lifecycle at the bottom of this file); the shipped default is 3s.
 *
 * Kept well above zero on purpose. The window is what makes an edit delete a query's slots ONCE
 * rather than once per save in the burst, and collapsing it to near-nothing would change that
 * behavior rather than just speed it up. 750ms still coalesces the saves a check issues
 * back-to-back while costing a quarter of what the shipped default costs to wait out.
 */
const ENGINE_DELETION_SETTLE_MS = 750;

/**
 * How long a check waits for QueryEngine to have deleted an edited query's cached results: the
 * engine waits {@link ENGINE_DELETION_SETTLE_MS} after the last result-affecting save. Creating a
 * query counts, so a check waits this long after creating its fixtures before warming a slot, or
 * that deletion could remove the warmed slot mid-check.
 *
 * Derived from the engine window rather than hardcoded: the two have to move together, and when
 * this was a literal 3500 against a literal 3000 inside QueryEngine, nothing said so. The margin
 * absorbs the save round-trip between the write landing and the timer arming.
 */
const DEFINITION_SETTLE_MS = ENGINE_DELETION_SETTLE_MS + 500;

/**
 * A throwaway query in the fixture category whose SQL returns a `Marker` column, so a check can
 * tell which version of the SQL produced the rows it got. Saved without AI enrichment.
 */
async function createMarkerQuery(ctx: IntegrationCheckContext, label: string, sql: string, reusable = false): Promise<MJQueryEntity> {
    const { Category } = requireFixtures(ctx);
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', ctx.User);
    query.Name = `CacheTest Def ${label} ${Date.now()}`;
    query.CategoryID = Category.ID;
    query.SQL = sql;
    query.Status = 'Approved';
    query.Reusable = reusable;
    Assert(await query.Save(FixtureQuerySaveOptions()), `${label} fixture save failed: ${query.LatestResult?.CompleteMessage}`);
    return query;
}

/** Applies `edit` to `query`, saves it the way the fixtures are saved, and lets the engine catch up. */
async function editQuery(query: MJQueryEntity, edit: (q: MJQueryEntity) => void): Promise<void> {
    edit(query);
    Assert(await query.Save(FixtureQuerySaveOptions()), `query edit failed: ${query.LatestResult?.CompleteMessage}`);
    await Sleep(ENGINE_SETTLE_MS);
}

/** One `CacheLocal` run; fresh params object per call. */
async function runCached(ctx: IntegrationCheckContext, identity: { QueryID?: string; QueryName?: string; CategoryPath?: string }, parameters?: Record<string, string>): Promise<RunQueryResult> {
    const result = await new RunQuery().RunQuery({ ...identity, CacheLocal: true, ...(parameters ? { Parameters: parameters } : {}) }, ctx.User);
    Assert(result.Success, `run failed: ${result.ErrorMessage}`);
    await Sleep(50); // the slot write is fire-and-forget
    return result;
}

/** The `Marker` the rows report: which SQL produced them. */
function markerOf(result: RunQueryResult): string {
    return String(result.Results[0]?.Marker);
}

/** Warms a slot and proves the next run is served from it, so a later miss means something. */
async function warmAndProveHit(ctx: IntegrationCheckContext, identity: { QueryID?: string; QueryName?: string }, expectedMarker: string, parameters?: Record<string, string>): Promise<void> {
    const first = await runCached(ctx, identity, parameters);
    AssertEqual(markerOf(first), expectedMarker, 'the first run must execute the current SQL');
    const second = await runCached(ctx, identity, parameters);
    AssertEqual(second.CacheHit, true, 'precondition: the repeat run must be served from the slot');
}

/** RunQuery slots in storage that belong to `queryID` (fingerprints carry the resolved ID). */
async function slotsOf(ctx: IntegrationCheckContext, queryID: string): Promise<string[]> {
    const id = queryID.toLowerCase();
    const keys = await ctx.Storage.GetCategoryKeys('RunQueryCache');
    return keys.filter(key => key.toLowerCase().includes(id));
}

/** Best-effort delete for check-local fixtures; never throws. */
async function deleteQuietly(record: { Delete(): Promise<boolean> } | undefined): Promise<void> {
    if (record) {
        await record.Delete().catch(() => false);
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
            // Own Parameters tag → own slot. A request by name reaches the same slot as one by ID
            // (the fingerprint uses the resolved query), and Q2 already wrote that slot with no TTL;
            // the TTL lives on the slot, not the request.
            const params = { QueryName: TtlQuery.Name, CacheLocal: true, CacheLocalTTL: 1200, Parameters: { scope: 'q3' } };
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
            Assert(await broken.Save(FixtureQuerySaveOptions()), `broken fixture save failed: ${broken.LatestResult?.CompleteMessage}`);
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
    },
    {
        Id: 'runquery-cache.Q10',
        Name: 'Q10: a TTL slot serves byte-identical row DATA on the hit (not just a matching row count)',
        Fn: async (ctx): Promise<void> => {
            // Q2 proves the hit's row COUNT matches and CacheHit/ExecutionTime; nothing yet
            // proves the served row DATA is faithful (a projection/serialization regression
            // could match counts while corrupting values). Own Parameters tag → own slot.
            const { TtlQuery } = requireFixtures(ctx);
            const rq = new RunQuery();
            const params = { QueryID: TtlQuery.ID, CacheLocal: true, Parameters: { scope: 'q10' } };
            const miss = await rq.RunQuery({ ...params }, ctx.User);
            Assert(miss.Success, `miss failed: ${miss.ErrorMessage}`);
            const hit = await rq.RunQuery({ ...params }, ctx.User);
            Assert(hit.Success, `hit failed: ${hit.ErrorMessage}`);
            AssertEqual(hit.CacheHit, true, 'second call must be a TTL cache hit');
            AssertEqual(JSON.stringify(hit.Results), JSON.stringify(miss.Results),
                'the cached slot must serve byte-identical row data to the miss');
        }
    },
    {
        Id: 'runquery-cache.Q11',
        Name: 'Q11: BREAK ATTEMPT (B46) — same-named queries in DIFFERENT categories must not share a cache slot',
        Fn: async (ctx): Promise<void> => {
            // Query names are unique only WITHIN a category. Before B46 the RunQuery fingerprint
            // was `Name|ID|Params` — a by-name request for '/A/Collide' and '/B/Collide' landed on
            // ONE slot, so whichever ran first had its rows served for the other. The fingerprint
            // now carries the resolved query's full CategoryPath. This check builds the collision
            // shape directly: two queries, one shared name, two categories, DISTINGUISHABLE rows.
            const { Category } = requireFixtures(ctx);
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const rq = new RunQuery();
            const stamp = Date.now();
            const sharedName = `CacheTest Collide ${stamp}`;

            const categoryB = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', ctx.User);
            categoryB.Name = `Integration Test Queries B ${stamp}`;
            categoryB.UserID = ctx.User.ID;
            Assert(await categoryB.Save(), `category B save failed: ${categoryB.LatestResult?.CompleteMessage}`);
            let queryA: MJQueryEntity | undefined;
            let queryB: MJQueryEntity | undefined;
            try {
                queryA = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', ctx.User);
                queryA.Name = sharedName;
                queryA.CategoryID = Category.ID;
                queryA.SQL = `SELECT 'A' AS Slot`;
                queryA.Status = 'Approved';
                Assert(await queryA.Save(FixtureQuerySaveOptions()), `query A save failed: ${queryA.LatestResult?.CompleteMessage}`);

                queryB = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', ctx.User);
                queryB.Name = sharedName;
                queryB.CategoryID = categoryB.ID;
                queryB.SQL = `SELECT 'B' AS Slot`;
                queryB.Status = 'Approved';
                Assert(await queryB.Save(FixtureQuerySaveOptions()), `query B save failed: ${queryB.LatestResult?.CompleteMessage}`);

                // resolveQuery reads the QueryEngine cache — refresh so both fixtures resolve,
                // then take each query's CANONICAL CategoryPath from the engine (guarantees the
                // format resolveQuery compares against, rather than hand-assembling '/Name/').
                await QueryEngine.Instance.Config(true, ctx.User);
                const engineA = QueryEngine.Instance.Queries.find(q => UUIDsEqual(q.ID, queryA!.ID));
                const engineB = QueryEngine.Instance.Queries.find(q => UUIDsEqual(q.ID, queryB!.ID));
                Assert(!!engineA && !!engineB, 'both collide queries must resolve in the QueryEngine after refresh');
                Assert(engineA!.CategoryPath !== engineB!.CategoryPath,
                    `precondition: the two categories must yield distinct paths (both='${engineA!.CategoryPath}')`);

                const runA = await rq.RunQuery({ QueryName: sharedName, CategoryPath: engineA!.CategoryPath, CacheLocal: true }, ctx.User);
                Assert(runA.Success, `run A failed: ${runA.ErrorMessage}`);
                AssertEqual(String(runA.Results[0].Slot), 'A', 'category-A request must execute query A');

                // THE COLLISION PROBE: same name, category B, within category-A's slot TTL.
                // Pre-B46 this was served query A's cached rows (Slot='A') as a cache hit.
                const runB = await rq.RunQuery({ QueryName: sharedName, CategoryPath: engineB!.CategoryPath, CacheLocal: true }, ctx.User);
                Assert(runB.Success, `run B failed: ${runB.ErrorMessage}`);
                AssertEqual(String(runB.Results[0].Slot), 'B',
                    "category-B request must execute query B — serving 'A' means the fingerprint ignored the category (B46)");

                // Both slots must now coexist independently: repeats hit their OWN slot.
                const hitA = await rq.RunQuery({ QueryName: sharedName, CategoryPath: engineA!.CategoryPath, CacheLocal: true }, ctx.User);
                const hitB = await rq.RunQuery({ QueryName: sharedName, CategoryPath: engineB!.CategoryPath, CacheLocal: true }, ctx.User);
                AssertEqual(hitA.CacheHit, true, 'repeat category-A request must hit its own slot');
                AssertEqual(hitB.CacheHit, true, 'repeat category-B request must hit its own slot');
                AssertEqual(String(hitA.Results[0].Slot), 'A', 'category-A slot must still serve A rows');
                AssertEqual(String(hitB.Results[0].Slot), 'B', 'category-B slot must still serve B rows');
            } finally {
                if (queryB) { await queryB.Delete(); }
                if (queryA) { await queryA.Delete(); }
                await categoryB.Delete();
            }
        }
    },
    {
        Id: 'runquery-cache.Q12',
        Name: 'Q12: BREAK ATTEMPT (B45) — a cache HIT must enforce the SAME permissions as a cache MISS',
        Fn: async (ctx): Promise<void> => {
            // B45: the TTL gate authorized with the roles-only QueryInfo.UserCanRun while the miss
            // path (ValidateQueryForExecution) enforces the FULL MJQueryEntityExtended.UserCanRun
            // (roles + entity CanRead + composition). Wedge shape: a query with NO explicit run
            // permissions (roles-only says YES to everyone) over an entity the seeded role-less
            // user cannot read (full check says NO). A warmed slot must NOT be served to that user.
            const noGrant = await loadNoGrantUser(ctx);
            if (!noGrant) {
                SkipCheck(`seeded role-less user '${NOGRANT_EMAIL}' not found (or has roles, which invalidates the fixture). Seed with: npx mj sync push --dir=metadata-optional/integration-test`);
            }
            const { Category } = requireFixtures(ctx);
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const rq = new RunQuery();
            const settingsEntity = md.EntityByName('MJ: User Settings');
            Assert(!!settingsEntity, "entity 'MJ: User Settings' must exist");

            let query: MJQueryEntity | undefined;
            let bridge: MJQueryEntityEntity | undefined;
            try {
                query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', ctx.User);
                query.Name = `CacheTest Perm ${Date.now()}`;
                query.CategoryID = Category.ID;
                query.SQL = `SELECT COUNT(*) AS SettingCount FROM ${ctx.Schema ?? '__mj'}.vwUserSettings WHERE Setting LIKE '${RUNQUERY_SETTING_PREFIX}%'`;
                query.Status = 'Approved';
                Assert(await query.Save(FixtureQuerySaveOptions()), `perm fixture query save failed: ${query.LatestResult?.CompleteMessage}`);

                // The Query Entities bridge row is what makes the FULL check consult entity
                // CanRead — without it both checks trivially allow and the check is vacuous.
                bridge = await md.GetEntityObject<MJQueryEntityEntity>('MJ: Query Entities', ctx.User);
                bridge.QueryID = query.ID;
                bridge.EntityID = settingsEntity!.ID;
                Assert(await bridge.Save(), `query-entity bridge save failed: ${bridge.LatestResult?.CompleteMessage}`);

                await QueryEngine.Instance.Config(true, ctx.User);
                const engineQ = QueryEngine.Instance.Queries.find(q => UUIDsEqual(q.ID, query!.ID));
                Assert(!!engineQ, 'perm fixture query must resolve in the QueryEngine after refresh');

                // ANTI-VACUITY preconditions — this pins the PARITY GAP, not a generic deny:
                // roles-only WOULD serve the role-less user; the full check refuses.
                Assert(engineQ!.UserHasRunPermissions(noGrant), 'precondition: roles-only check must PASS for the role-less user (open default)');
                AssertEqual(engineQ!.UserCanRun(noGrant).canRun, false, 'precondition: FULL check must DENY the role-less user (entity CanRead)');
                AssertEqual(engineQ!.UserCanRun(ctx.User).canRun, true, 'precondition: the context user must be fully authorized');

                // Make the query resolvable in the PROVIDER metadata cache too — the pre-B45
                // roles-only gate read this.Queries, so without this refresh a regression to it
                // would hide behind "unresolvable ⇒ warmer tie-break ⇒ deny" and never go red.
                await ctx.Provider.Refresh();

                // Warm the slot as the fully-authorized context user and prove it serves.
                const warm = await rq.RunQuery({ QueryID: query.ID, CacheLocal: true }, ctx.User);
                Assert(warm.Success, `warm failed: ${warm.ErrorMessage}`);
                const hit = await rq.RunQuery({ QueryID: query.ID, CacheLocal: true }, ctx.User);
                AssertEqual(hit.CacheHit, true, 'the warmed slot must serve the authorized warmer');

                // THE PARITY PROBE: the role-less user requests the warmed slot. Serving cached
                // rows here is the B45 leak — the miss path would have denied this exact request.
                let denied: RunQueryResult | undefined;
                let threw = false;
                try {
                    denied = await rq.RunQuery({ QueryID: query.ID, CacheLocal: true }, noGrant);
                } catch {
                    threw = true; // a thrown permission error is an acceptable deny surface
                }
                if (!threw) {
                    Assert(denied!.CacheHit !== true,
                        'SECURITY: the warmed slot was served to a user the miss path would deny (B45 — hit easier than miss)');
                    AssertEqual(denied!.Success, false,
                        'the role-less request must fail with a permission error, exactly as a cache miss would');
                }
            } finally {
                if (bridge) { await bridge.Delete(); }
                if (query) { await query.Delete(); }
            }
        }
    },
    {
        Id: 'runquery-cache.Q13',
        Name: "Q13: after a query's SQL is edited, the next CacheLocal run misses and returns the new SQL's rows",
        Fn: async (ctx): Promise<void> => {
            let query: MJQueryEntity | undefined;
            try {
                query = await createMarkerQuery(ctx, 'Q13', `SELECT 'v1' AS Marker`);
                await Sleep(DEFINITION_SETTLE_MS);
                await warmAndProveHit(ctx, { QueryID: query.ID }, 'v1');

                await editQuery(query, q => { q.SQL = `SELECT 'v2' AS Marker`; });
                const afterEdit = await runCached(ctx, { QueryID: query.ID });
                Assert(afterEdit.CacheHit !== true, 'the slot from the old SQL must not be served after the edit');
                AssertEqual(markerOf(afterEdit), 'v2', 'the run after the edit must return the new SQL\'s rows');
                const again = await runCached(ctx, { QueryID: query.ID });
                AssertEqual(again.CacheHit, true, 'the rewritten slot must serve the next run');
                AssertEqual(markerOf(again), 'v2', 'the rewritten slot must hold the new SQL\'s rows');
            } finally {
                await deleteQuietly(query);
            }
        }
    },
    {
        Id: 'runquery-cache.Q14',
        Name: 'Q14: a description-only edit leaves the cached results in place (no over-invalidation)',
        Fn: async (ctx): Promise<void> => {
            let query: MJQueryEntity | undefined;
            try {
                query = await createMarkerQuery(ctx, 'Q14', `SELECT 'v1' AS Marker`);
                await Sleep(DEFINITION_SETTLE_MS);
                await warmAndProveHit(ctx, { QueryID: query.ID }, 'v1');

                await editQuery(query, q => { q.Description = `Reworded ${Date.now()}`; });
                // Outlive the settle window, so a deletion wrongly triggered by the edit would have run.
                await Sleep(DEFINITION_SETTLE_MS);
                const afterEdit = await runCached(ctx, { QueryID: query.ID });
                AssertEqual(afterEdit.CacheHit, true, 'a description edit must not stop the slot from being served');
                AssertEqual(markerOf(afterEdit), 'v1', 'the served rows must be the cached ones');
            } finally {
                await deleteQuietly(query);
            }
        }
    },
    {
        Id: 'runquery-cache.Q15',
        Name: "Q15: editing a parameter's ValidationFilters (which transforms the value) makes the next run miss",
        Fn: async (ctx): Promise<void> => {
            let query: MJQueryEntity | undefined;
            try {
                query = await createMarkerQuery(ctx, 'Q15', `SELECT {{ Tag | sqlString }} AS Marker`);
                await Sleep(DEFINITION_SETTLE_MS);
                const parameterRow = QueryEngine.Instance.GetQueryParameters(query.ID).find(p => p.Name === 'Tag');
                Assert(!!parameterRow, 'precondition: extraction must have created the Tag parameter');
                await warmAndProveHit(ctx, { QueryID: query.ID }, 'abc', { Tag: 'abc' });

                const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
                const parameter = await md.GetEntityObject<MJQueryParameterEntity>('MJ: Query Parameters', ctx.User);
                Assert(await parameter.Load(parameterRow!.ID), 'parameter load failed');
                parameter.ValidationFilters = JSON.stringify([{ name: 'upper' }]);
                Assert(await parameter.Save(), `parameter save failed: ${parameter.LatestResult?.CompleteMessage}`);
                await Sleep(ENGINE_SETTLE_MS);

                const afterEdit = await runCached(ctx, { QueryID: query.ID }, { Tag: 'abc' });
                Assert(afterEdit.CacheHit !== true, 'the slot from the old parameter definition must not be served');
                AssertEqual(markerOf(afterEdit), 'ABC', 'the new validation filter must apply');
            } finally {
                await deleteQuietly(query);
            }
        }
    },
    {
        Id: 'runquery-cache.Q16',
        Name: "Q16: editing a composed query's SQL makes the composing query's next run miss",
        Fn: async (ctx): Promise<void> => {
            let inner: MJQueryEntity | undefined;
            let outer: MJQueryEntity | undefined;
            try {
                inner = await createMarkerQuery(ctx, 'Q16 inner', `SELECT 'b1' AS Marker`, true);
                await Sleep(ENGINE_SETTLE_MS);
                const innerPath = QueryEngine.Instance.FindQueryByID(inner.ID)?.CategoryPath;
                Assert(!!innerPath, 'precondition: the inner query must resolve in the QueryEngine');
                outer = await createMarkerQuery(ctx, 'Q16 outer', `SELECT b.Marker FROM {{query:"${innerPath}/${inner.Name}"}} b`);
                await Sleep(DEFINITION_SETTLE_MS);
                const dependsOnInner = QueryEngine.Instance.Dependencies.some(d => UUIDsEqual(d.QueryID, outer!.ID) && UUIDsEqual(d.DependsOnQueryID, inner!.ID));
                Assert(dependsOnInner, 'precondition: extraction must record the composition dependency');
                await warmAndProveHit(ctx, { QueryID: outer.ID }, 'b1');

                await editQuery(inner, q => { q.SQL = `SELECT 'b2' AS Marker`; });
                const afterEdit = await runCached(ctx, { QueryID: outer.ID });
                Assert(afterEdit.CacheHit !== true, 'the composing query\'s slot must not be served after the composed query changed');
                AssertEqual(markerOf(afterEdit), 'b2', 'the composing query must return the composed query\'s new rows');
            } finally {
                await deleteQuietly(outer);
                await deleteQuietly(inner);
            }
        }
    },
    {
        Id: 'runquery-cache.Q17',
        Name: 'Q17: a query requested by ID, by name and by both shares one slot, and an SQL edit reaches all three',
        Fn: async (ctx): Promise<void> => {
            let query: MJQueryEntity | undefined;
            try {
                query = await createMarkerQuery(ctx, 'Q17', `SELECT 'v1' AS Marker`);
                await Sleep(DEFINITION_SETTLE_MS);
                const identities = [{ QueryID: query.ID }, { QueryName: query.Name }, { QueryID: query.ID, QueryName: query.Name }];

                const first = await runCached(ctx, identities[0]);
                AssertEqual(markerOf(first), 'v1', 'the first run must execute the SQL');
                for (const identity of identities.slice(1)) {
                    const hit = await runCached(ctx, identity);
                    AssertEqual(hit.CacheHit, true, `a request by ${Object.keys(identity).join('+')} must reach the slot the request by ID wrote`);
                }

                await editQuery(query, q => { q.SQL = `SELECT 'v2' AS Marker`; });
                for (const identity of identities) {
                    const afterEdit = await runCached(ctx, identity);
                    AssertEqual(markerOf(afterEdit), 'v2', `a request by ${Object.keys(identity).join('+')} must get the new SQL's rows after the edit`);
                }
            } finally {
                await deleteQuietly(query);
            }
        }
    },
    {
        Id: 'runquery-cache.Q18',
        Name: "Q18: saving the query's SQL variant for the current platform makes the next run miss",
        Fn: async (ctx): Promise<void> => {
            let query: MJQueryEntity | undefined;
            let variant: MJQuerySQLEntity | undefined;
            try {
                query = await createMarkerQuery(ctx, 'Q18', `SELECT 'base' AS Marker`);
                await Sleep(DEFINITION_SETTLE_MS);
                await warmAndProveHit(ctx, { QueryID: query.ID }, 'base');

                const platform = (ctx.Provider as unknown as DatabaseProviderBase).PlatformKey;
                const dialect = QueryEngine.Instance.SQLDialects.find(d => d.PlatformKey === platform);
                Assert(!!dialect, `precondition: an SQL dialect row must exist for platform '${platform}'`);
                const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
                variant = await md.GetEntityObject<MJQuerySQLEntity>('MJ: Query SQLs', ctx.User);
                variant.QueryID = query.ID;
                variant.SQLDialectID = dialect!.ID;
                variant.SQL = `SELECT 'dialect' AS Marker`;
                Assert(await variant.Save(FixtureQuerySaveOptions()), `variant save failed: ${variant.LatestResult?.CompleteMessage}`);
                await Sleep(ENGINE_SETTLE_MS);

                const afterEdit = await runCached(ctx, { QueryID: query.ID });
                Assert(afterEdit.CacheHit !== true, 'the slot from the base SQL must not be served once a platform variant exists');
                AssertEqual(markerOf(afterEdit), 'dialect', 'the platform variant must run');
            } finally {
                await deleteQuietly(variant);
                await deleteQuietly(query);
            }
        }
    },
    {
        Id: 'runquery-cache.Q19',
        Name: "Q19: once an SQL edit settles, the query's old slots are deleted from storage",
        Fn: async (ctx): Promise<void> => {
            let query: MJQueryEntity | undefined;
            try {
                query = await createMarkerQuery(ctx, 'Q19', `SELECT 'v1' AS Marker`);
                await Sleep(DEFINITION_SETTLE_MS);
                await runCached(ctx, { QueryID: query.ID }, { scope: 'a' });
                await runCached(ctx, { QueryID: query.ID }, { scope: 'b' });
                AssertEqual((await slotsOf(ctx, query.ID)).length, 2, 'precondition: two slots of the query must be stored');

                await editQuery(query, q => { q.SQL = `SELECT 'v2' AS Marker`; });
                await Sleep(DEFINITION_SETTLE_MS);

                AssertEqual((await slotsOf(ctx, query.ID)).length, 0, 'the edited query\'s slots must be deleted once the edit settles');
            } finally {
                await deleteQuietly(query);
            }
        }
    },
    {
        Id: 'runquery-cache.Q20',
        Name: "Q20: smart validation answers stale with fresh rows when the client's slot came from another query definition, even though CacheValidationSQL reports the data unchanged",
        Fn: async (ctx): Promise<void> => {
            const { ValidatedQuery } = requireFixtures(ctx);
            const provider = Metadata.Provider as unknown as IRunQueryProvider; // global-provider-ok: integration test script — single-provider process by design
            const params = () => ({ QueryID: ValidatedQuery.ID });

            const fresh = await provider.RunQueriesWithCacheCheck!([{ params: params() }], ctx.User);
            const serverHash = fresh.results[0]?.definitionHash;
            Assert(!!serverHash, 'the server must return its definition hash with fresh rows, for the client to store');
            const stamp = { maxUpdatedAt: fresh.results[0].maxUpdatedAt ?? '', rowCount: fresh.results[0].rowCount ?? 0 };

            const current = await provider.RunQueriesWithCacheCheck!([{ params: params(), cacheStatus: { ...stamp, definitionHash: serverHash } }], ctx.User);
            AssertEqual(current.results[0]?.status, 'current', 'precondition: the same data and the same definition must validate as current');

            for (const clientHash of [`${serverHash}-older`, '']) {
                const stale = await provider.RunQueriesWithCacheCheck!([{ params: params(), cacheStatus: { ...stamp, definitionHash: clientHash } }], ctx.User);
                AssertEqual(stale.results[0]?.status, 'stale', `a slot written under definition '${clientHash}' must be stale, whatever the data says`);
                Assert(Array.isArray(stale.results[0]?.results), 'a stale answer must carry fresh rows');
                AssertEqual(stale.results[0]?.definitionHash, serverHash, 'a stale answer must carry the server\'s hash');
            }
        }
    },
    {
        Id: 'runquery-cache.Q21',
        Name: 'Q21: a client that sends no definition hash (an older release) gets the data-only validation it always got',
        Fn: async (ctx): Promise<void> => {
            const { ValidatedQuery } = requireFixtures(ctx);
            const provider = Metadata.Provider as unknown as IRunQueryProvider; // global-provider-ok: integration test script — single-provider process by design
            const fresh = await provider.RunQueriesWithCacheCheck!([{ params: { QueryID: ValidatedQuery.ID } }], ctx.User);
            const stamp = { maxUpdatedAt: fresh.results[0]?.maxUpdatedAt ?? '', rowCount: fresh.results[0]?.rowCount ?? 0 };

            const response = await provider.RunQueriesWithCacheCheck!([{ params: { QueryID: ValidatedQuery.ID }, cacheStatus: stamp }], ctx.User);
            AssertEqual(response.results[0]?.status, 'current', 'without a definition hash, unchanged data must still validate as current');
        }
    }
];

for (const check of RunQueryCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// The bundle's shared Query/Category fixtures, run through the generic bundle-lifecycle hook so the
// driver and the dispatcher script create/tear them down identically (was a hardcoded driver special-case).
//
// The lifecycle also collapses QueryEngine's result-deletion settle window for the duration of this
// bundle. That window is a real product behavior — it makes the deletion run once per edit instead
// of once per save in the burst — but its DURATION is not what any check here asserts, and at the
// 3s default every check that creates a fixture or edits a query has to sleep past it (8 sites at
// DEFINITION_SETTLE_MS, ~28s a run). Collapsing it shortens the sleeps without changing what is
// tested: the deletion still happens, still once, still after the burst settles.
//
// Restored in Teardown rather than left set, because the static is process-global and the bundles
// that follow must see shipped behavior. Captured rather than assumed to be the default, so a
// harness that already lowered it is not silently overwritten.
let priorSettleMs: number | undefined;

IntegrationCheckRegistry.Instance.RegisterLifecycle('runquery-cache', {
    Setup: async ctx => {
        priorSettleMs = QueryEngine.DefaultDefinitionEditSettleMs;
        QueryEngine.DefaultDefinitionEditSettleMs = ENGINE_DELETION_SETTLE_MS;
        ctx.Fixtures = await CreateRunQueryFixtures(ctx);
        // Creating the fixtures is itself a result-affecting save, so it arms the slot-deletion
        // timer. Wait it out HERE, once, so the deletion has already happened before the first
        // check warms a slot.
        //
        // This is the actual fix for a race that predates the settable window. At the shipped
        // 3000ms the deletion landed 2.2-3.2s into the run — right on top of Q5, which is the
        // measured cause of that bundle's ~0.7% flake (6 failures in ~840 runs). Only Q13+ waited
        // the window out; Q1-Q12 just hoped to miss it. Shortening the window WITHOUT this wait
        // does not fix that, it only moves the collision earlier: at 750ms it lands on Q1/Q2
        // instead, which is exactly what CI caught on the first run of this branch
        // (`Q2: TTL-served results report ExecutionTime 0 — expected 0, got 4`).
        //
        // Paid once per bundle, and only affordable because the window is now short: at the
        // shipped 3000ms this same wait would cost 3.5s.
        await Sleep(DEFINITION_SETTLE_MS);
    },
    Teardown: async ctx => {
        if (priorSettleMs !== undefined) {
            QueryEngine.DefaultDefinitionEditSettleMs = priorSettleMs;
            priorSettleMs = undefined;
        }
        if (ctx.Fixtures) {
            await TeardownRunQueryFixtures(ctx, ctx.Fixtures);
            ctx.Fixtures = undefined;
        }
    }
});
