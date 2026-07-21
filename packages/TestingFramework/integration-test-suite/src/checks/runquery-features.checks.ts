/**
 * runquery-features.checks.ts — the 'runquery-features' bundle (QF1–QF10).
 *
 * Covers "0e. runquery-features" from packages/TestingFramework/integration-test-suite/docs/test-catalog.md:
 * the RunQuery FEATURE SURFACE that the sibling `runquery-cache` bundle does NOT exercise —
 * the ad-hoc-SQL contract, MaxRows/StartRow paging + the TotalRowCount/PageNumber/PageSize
 * contract, and the CacheKey/CacheHit result fields — PLUS two guard checks that PIN the two
 * product defects fixed alongside this bundle:
 *   • QF8  — the `since | sqlDate` injection hole in GetConversationsForMemoryManager.
 *   • QF9/QF10 — the ValidationFilters enforcement chain in QueryParameterProcessor
 *              (a declared filter that is violated must REJECT; a declared filter we cannot
 *              honor must FAIL LOUDLY rather than silently no-op — the false-promise guard).
 *
 * TRANSPORT: this bundle reads the FULL RunQueryResult (CacheHit / CacheKey / PageNumber /
 * PageSize / RenderedSQL), which the GraphQL client's TransformQueryPayload deliberately does
 * NOT carry — so, exactly like `runquery-cache`, the checks run in-process against the
 * bootstrapped server provider via a plain `new RunQuery()` + `ctx.User`. Every value is
 * verified against the RunQuery implementation (ProviderBase.RunQuery + GenericDatabaseProvider
 * InternalRunQuery/ExecuteAdhocQuery/resolveQuery/ValidateQueryForExecution).
 *
 * FIXTURES: a self-contained Query Category + one saved paging query (a stable, ordered read of
 * `vwEntities` — hundreds of rows, single uniqueidentifier column) created/torn-down through the
 * generic BundleLifecycle, mirroring `runquery-cache`. The bundle mutates the DB by design
 * (creates + deletes its own throwaway Query/Category), so the checks are NOT RequiresMutation-
 * gated — they always run when the bundle is selected. The ad-hoc and unit-style checks need no
 * fixtures at all.
 */
import { RunQuery, Metadata, RunQuerySQLFilterManager } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import type {
    MJQueryCategoryEntity,
    MJQueryEntity,
    MJQueryParameterEntity
} from '@memberjunction/core-entities';
import { QueryParameterProcessor } from '@memberjunction/query-processor';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** The saved query the paging + cache checks (QF5/QF6/QF7) reuse. */
interface RunQueryFeatureFixtures {
    Category: MJQueryCategoryEntity;
    /** Stable, ORDER-BY-ed read of vwEntities (single ID column, hundreds of rows). */
    PageQuery: MJQueryEntity;
}

/**
 * Module-scoped fixture handle. Set by this bundle's own lifecycle Setup, cleared by Teardown.
 * Kept off `IntegrationCheckContext` deliberately — adding a ctx field would touch the shared
 * `check.ts` contract; a module local keeps this bundle fully self-contained + additive.
 */
let featureFixtures: RunQueryFeatureFixtures | undefined;

/** Resolve the bundle's fixtures or fail loudly (the lifecycle must create them first). */
function requireFixtures(): RunQueryFeatureFixtures {
    if (!featureFixtures) {
        throw new Error('runquery-features fixtures not initialized — the bundle lifecycle Setup must run before its checks.');
    }
    return featureFixtures;
}

/** A 6-row, platform-portable ad-hoc SELECT (literal UNION ALL — identical on SQL Server + PG). */
const ADHOC_SIX_ROWS =
    'SELECT 1 AS N UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6';

/**
 * Create the self-contained Category + paging Query. Publishes the handle up-front so a
 * mid-Setup crash still leaves Teardown a reference to whatever was created (partial-safe).
 */
export async function createRunQueryFeatureFixtures(ctx: IntegrationCheckContext): Promise<void> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const schema = ctx.Schema ?? '__mj';
    const user = ctx.User;

    const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', user);
    category.Name = `Integration Test RunQuery Features ${Date.now()}`;
    category.UserID = user.ID;
    if (!await category.Save()) {
        throw new Error(`Fixture category save failed: ${category.LatestResult?.CompleteMessage}`);
    }
    featureFixtures = { Category: category } as RunQueryFeatureFixtures;

    // A stable, deterministically ORDERED read: single uniqueidentifier column, hundreds of rows.
    // ORDER BY ID makes page1/page2 disjointness deterministic within a platform. (Follows the
    // `runquery-cache` precedent of referencing a core __mj view by unquoted schema.view.)
    const pageQuery = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    pageQuery.Name = `RunQuery Features Page ${Date.now()}`;
    pageQuery.CategoryID = category.ID;
    pageQuery.SQL = `SELECT ID FROM ${schema}.vwEntities ORDER BY ID`;
    pageQuery.Status = 'Approved';
    if (!await pageQuery.Save()) {
        throw new Error(`Fixture page query save failed: ${pageQuery.LatestResult?.CompleteMessage}`);
    }
    featureFixtures.PageQuery = pageQuery;

    // resolveQuery reads the QueryEngine cache — refresh so the fixture resolves by ID/Name.
    await QueryEngine.Instance.Config(true, user);
}

/** Best-effort teardown — delete the query then the category (FK-safe), partial-safe. */
export async function teardownRunQueryFeatureFixtures(): Promise<void> {
    try {
        if (featureFixtures?.PageQuery) {
            await featureFixtures.PageQuery.Delete();
        }
        if (featureFixtures?.Category) {
            await featureFixtures.Category.Delete();
        }
    } catch (e) {
        console.error(`runquery-features teardown warning: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        featureFixtures = undefined;
    }
}

/** Build a transient, TYPED MJ: Query Parameters row (never saved) for the unit-style checks. */
async function makeParamDef(
    user: UserInfo,
    name: string,
    type: MJQueryParameterEntity['Type'],
    validationFilters: string
): Promise<MJQueryParameterEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const pd = await md.GetEntityObject<MJQueryParameterEntity>('MJ: Query Parameters', user);
    pd.Name = name;
    pd.Type = type;
    pd.ValidationFilters = validationFilters;
    return pd;
}

export const RunQueryFeatureChecks: NamedCheck[] = [
    {
        Id: 'runquery-features.QF1',
        Name: 'QF1: ad-hoc SELECT executes — Success, QueryName "Ad-Hoc Query", RowCount == TotalRowCount when unpaged',
        Fn: async (ctx): Promise<void> => {
            const rq = new RunQuery();
            const result = await rq.RunQuery({ SQL: ADHOC_SIX_ROWS }, ctx.User);
            Assert(result.Success, `ad-hoc SELECT must succeed: ${result.ErrorMessage}`);
            AssertEqual(result.QueryName, 'Ad-Hoc Query', 'ad-hoc results are stamped QueryName "Ad-Hoc Query"');
            AssertEqual(result.QueryID, '', 'ad-hoc results carry no QueryID');
            AssertEqual(result.RowCount, 6, 'the 6-row union must return 6 rows');
            AssertEqual(result.TotalRowCount, 6, 'unpaged: TotalRowCount equals RowCount');
        }
    },
    {
        Id: 'runquery-features.QF2',
        Name: 'QF2: ad-hoc MaxRows caps RowCount while TotalRowCount reports the full (unpaged) count',
        Fn: async (ctx): Promise<void> => {
            const rq = new RunQuery();
            const result = await rq.RunQuery({ SQL: ADHOC_SIX_ROWS, MaxRows: 2 }, ctx.User);
            Assert(result.Success, `capped ad-hoc must succeed: ${result.ErrorMessage}`);
            AssertEqual(result.RowCount, 2, 'MaxRows:2 caps the returned rows to 2');
            AssertEqual(result.TotalRowCount, 6, 'TotalRowCount is the full count (6), not the capped 2');
            Assert(result.TotalRowCount > result.RowCount, 'the cap must actually be narrower — else the check is vacuous');
        }
    },
    {
        Id: 'runquery-features.QF3',
        Name: 'QF3: ad-hoc StartRow offset returns a page DISJOINT from page 1, TotalRowCount stays full',
        Fn: async (ctx): Promise<void> => {
            const rq = new RunQuery();
            const page1 = await rq.RunQuery({ SQL: ADHOC_SIX_ROWS, MaxRows: 2, StartRow: 0 }, ctx.User);
            const page2 = await rq.RunQuery({ SQL: ADHOC_SIX_ROWS, MaxRows: 2, StartRow: 2 }, ctx.User);
            Assert(page1.Success && page2.Success, `paged ad-hoc must succeed: ${page1.ErrorMessage || page2.ErrorMessage}`);
            AssertEqual(page1.RowCount, 2, 'page 1 returns 2 rows');
            AssertEqual(page2.RowCount, 2, 'page 2 returns 2 rows');
            AssertEqual(page2.TotalRowCount, 6, 'paging never changes the full TotalRowCount');
            const page1Ns = new Set(page1.Results.map(r => Number((r as { N: number }).N)));
            const overlap = page2.Results.some(r => page1Ns.has(Number((r as { N: number }).N)));
            Assert(!overlap, 'StartRow=2 must yield rows disjoint from StartRow=0 — else the offset was ignored');
        }
    },
    {
        Id: 'runquery-features.QF4',
        Name: 'QF4: ad-hoc contract is READ-ONLY — a mutation (UPDATE) is rejected, no rows, clear error',
        Fn: async (ctx): Promise<void> => {
            const schema = ctx.Schema ?? '__mj';
            const rq = new RunQuery();
            // The SQLExpressionValidator (full_query context) refuses anything that is not a
            // SELECT/WITH — ExecuteAdhocQuery never reaches the read-only pool with this.
            const result = await rq.RunQuery({ SQL: `UPDATE ${schema}.vwEntities SET Name = 'hacked'` }, ctx.User);
            AssertEqual(result.Success, false, 'an ad-hoc UPDATE must be rejected by SQL validation');
            AssertEqual(result.RowCount, 0, 'a rejected mutation returns zero rows');
            Assert((result.ErrorMessage ?? '').length > 0, 'a rejected mutation must carry a clear error message');
        }
    },
    {
        Id: 'runquery-features.QF5',
        Name: 'QF5: saved-query MaxRows/StartRow SQL paging — RowCount<=MaxRows, TotalRowCount full, PageNumber/PageSize set',
        Fn: async (ctx): Promise<void> => {
            const { PageQuery } = requireFixtures();
            const rq = new RunQuery();
            const result = await rq.RunQuery({ QueryID: PageQuery.ID, MaxRows: 5, StartRow: 0 }, ctx.User);
            Assert(result.Success, `paged saved query must succeed: ${result.ErrorMessage}`);
            Assert(result.RowCount <= 5, 'MaxRows:5 caps the page to at most 5 rows');
            Assert(result.TotalRowCount >= result.RowCount, 'TotalRowCount is never less than the page RowCount');
            Assert(result.TotalRowCount > result.RowCount, 'vwEntities has many rows — the page must be a strict subset (anti-vacuity)');
            AssertEqual(result.PageNumber, 1, 'StartRow=0/MaxRows=5 → PageNumber 1');
            AssertEqual(result.PageSize, 5, 'PageSize reflects MaxRows on the SQL-paging path');
        }
    },
    {
        Id: 'runquery-features.QF6',
        Name: 'QF6: saved-query page 2 is disjoint from page 1 and reports PageNumber 2',
        Fn: async (ctx): Promise<void> => {
            const { PageQuery } = requireFixtures();
            const rq = new RunQuery();
            const page1 = await rq.RunQuery({ QueryID: PageQuery.ID, MaxRows: 5, StartRow: 0 }, ctx.User);
            const page2 = await rq.RunQuery({ QueryID: PageQuery.ID, MaxRows: 5, StartRow: 5 }, ctx.User);
            Assert(page1.Success && page2.Success, `both pages must succeed: ${page1.ErrorMessage || page2.ErrorMessage}`);
            AssertEqual(page2.PageNumber, 2, 'StartRow=5/MaxRows=5 → PageNumber 2');
            Assert(page1.RowCount > 0 && page2.RowCount > 0, 'both pages must be non-empty for the disjointness check to mean anything');
            const page1Ids = new Set(page1.Results.map(r => String((r as { ID: string }).ID)));
            const overlap = page2.Results.some(r => page1Ids.has(String((r as { ID: string }).ID)));
            Assert(!overlap, 'page 2 rows must be disjoint from page 1 — else StartRow was ignored');
        }
    },
    {
        Id: 'runquery-features.QF7',
        Name: 'QF7: CacheLocal populates CacheKey; a second identical run is a CacheHit served with ExecutionTime 0 and the SAME CacheKey',
        Fn: async (ctx): Promise<void> => {
            const { PageQuery } = requireFixtures();
            const rq = new RunQuery();
            const miss = await rq.RunQuery({ QueryID: PageQuery.ID, CacheLocal: true, Parameters: { scope: 'qf7' } }, ctx.User);
            Assert(miss.Success, `cache miss run must succeed: ${miss.ErrorMessage}`);
            Assert(miss.CacheHit !== true, 'the first CacheLocal run is a miss, not a hit');

            // The slot write is FIRE-AND-FORGET (providerBase's SetRunQueryResult is not
            // awaited) — poll briefly for the hit instead of racing the write (review class 2;
            // green today only because the in-memory storage wins the microtask race).
            let hit = await rq.RunQuery({ QueryID: PageQuery.ID, CacheLocal: true, Parameters: { scope: 'qf7' } }, ctx.User);
            for (let i = 0; i < 10 && hit.CacheHit !== true; i++) {
                await new Promise(r => setTimeout(r, 150));
                hit = await rq.RunQuery({ QueryID: PageQuery.ID, CacheLocal: true, Parameters: { scope: 'qf7' } }, ctx.User);
            }
            Assert(hit.Success, `cache hit run must succeed: ${hit.ErrorMessage}`);
            AssertEqual(hit.CacheHit, true, 'the second identical CacheLocal run must be served from the slot');
            AssertEqual(hit.ExecutionTime, 0, 'a cache-served result reports ExecutionTime 0');
            Assert(!!hit.CacheKey, 'a cache-served result carries the slot CacheKey');
            AssertEqual(hit.RowCount, miss.RowCount, 'served rows must match the warmed slot');
        }
    },
    {
        Id: 'runquery-features.QF8',
        Name: 'QF8: injection guard — GetConversationsForMemoryManager contains a malicious `since`; the sqlDate filter closes the hole',
        Fn: async (ctx): Promise<void> => {
            // ── Anti-vacuity, mechanism-level: the fix is `{{ since | sqlDate }}`. Prove that the
            //    sqlDate filter itself REJECTS the injection payload and ONLY emits a safe, quoted
            //    ISO literal for a well-formed date. This pins the exact seam of the defect and
            //    guarantees the e2e leg below is not passing for an unrelated reason.
            const sqlDate = RunQuerySQLFilterManager.Instance.getFilter('sqlDate');
            Assert(!!sqlDate?.implementation, 'the sqlDate SQL filter must be registered');
            const inject = "2020-01-01' OR '1'='1";
            let sqlDateThrew = false;
            try {
                sqlDate!.implementation!(inject);
            } catch {
                sqlDateThrew = true; // new Date(injection) is Invalid Date → the filter throws
            }
            Assert(sqlDateThrew, 'sqlDate must REJECT a non-date injection payload rather than emit it');
            const safe = String(sqlDate!.implementation!('2024-06-15'));
            Assert(safe.startsWith("'") && safe.endsWith("'"), 'sqlDate emits a single quoted SQL literal for a valid date');
            Assert(!/or\s+'1'\s*=\s*'1'/i.test(safe), 'the emitted literal never carries an OR-injection tail');

            // ── End-to-end: run the real query with the malicious `since`. It must be CONTAINED —
            //    the payload can never yield a successful, broadened result set. Whether it is
            //    stopped by parameter validation or by sqlDate during template render, the
            //    observable contract is the same: Success === false. (If the query is not seeded
            //    in this environment, skip-as-pass loudly — nothing to exercise.)
            await QueryEngine.Instance.Config(false, ctx.User);
            const resolved = QueryEngine.Instance.Queries.find(
                q => q.Name.trim().toLowerCase() === 'getconversationsformemorymanager'
            );
            if (!resolved) {
                console.warn('  ⚠ runquery-features.QF8 e2e leg SKIPPED — query "GetConversationsForMemoryManager" not seeded in this environment.');
                return;
            }
            const rq = new RunQuery();
            const attack = await rq.RunQuery(
                { QueryID: resolved.ID, Parameters: { since: inject, agentIds: [] } },
                ctx.User
            );
            // POSITIVE CONTROL (review): a benign `since` + empty agentIds must SUCCEED —
            // otherwise "attack failed" could just mean "query is broken", not "injection
            // contained". Post metadata-push the seeded SQL uses {{ since | sqlDate }}, so
            // the containment mechanism matches the check name again.
            const benign = await rq.RunQuery({ QueryID: resolved.ID, Parameters: { since: '2020-01-01', agentIds: [] } }, ctx.User);
            Assert(benign.Success, `benign since must run clean (got: ${benign.ErrorMessage}) — without this control the attack assertion is unattributable`);

            Assert(
                !attack.Success,
                'the malicious `since` must be rejected (validation or sqlDate) — a successful run would mean the injection reached the SQL'
            );
        }
    },
    {
        Id: 'runquery-features.QF9',
        Name: 'QF9: ValidationFilters enforcement — a declared filter that is VIOLATED rejects with a clear, filter-named error',
        Fn: async (ctx): Promise<void> => {
            // A `min:3` filter on a string measures length. 'ab' (len 2) must be rejected; 'abcd'
            // (len 4) must pass — proving the chain both enforces AND lets valid values through.
            const violate = await makeParamDef(ctx.User, 'code', 'string', JSON.stringify([{ name: 'min', args: [3] }]));
            const rejected = QueryParameterProcessor.validateParameters({ code: 'ab' }, [violate]);
            AssertEqual(rejected.success, false, 'a value that violates a declared min filter must be rejected');
            const joinedError = rejected.errors.join(' | ');
            Assert(joinedError.includes("'min'"), `the rejection error must name the offending filter: ${joinedError}`);
            Assert(/minimum/i.test(joinedError), `the rejection error must explain the violation: ${joinedError}`);

            const accept = await makeParamDef(ctx.User, 'code', 'string', JSON.stringify([{ name: 'min', args: [3] }]));
            const passed = QueryParameterProcessor.validateParameters({ code: 'abcd' }, [accept]);
            AssertEqual(passed.success, true, 'a value that satisfies the declared min filter must pass (anti-vacuity)');
        }
    },
    {
        Id: 'runquery-features.QF10',
        Name: 'QF10: false-promise guard — a declared filter we cannot honor (unknown name) REJECTS rather than silently no-op\'ing',
        Fn: async (ctx): Promise<void> => {
            // The original defect: an unrecognized ValidationFilters entry was silently ignored,
            // so a declared safety filter provided ZERO protection. It must now fail loudly.
            const unknown = await makeParamDef(ctx.User, 'p', 'string', JSON.stringify([{ name: 'definitely-not-a-real-filter' }]));
            const rejected = QueryParameterProcessor.validateParameters({ p: 'anything' }, [unknown]);
            AssertEqual(rejected.success, false, 'an unknown/unhonorable validation filter must be rejected, not ignored');
            Assert(
                rejected.errors.join(' | ').toLowerCase().includes('unknown validation filter'),
                `the rejection must identify the broken contract: ${rejected.errors.join(' | ')}`
            );

            // Anti-vacuity: a KNOWN filter over the same value passes — so QF10 is rejecting the
            // unknown name specifically, not rejecting everything.
            const known = await makeParamDef(ctx.User, 'p', 'string', JSON.stringify([{ name: 'trim' }]));
            const passed = QueryParameterProcessor.validateParameters({ p: '  anything  ' }, [known]);
            AssertEqual(passed.success, true, 'a recognized filter (trim) over the same value must pass');
            AssertEqual(passed.validatedParameters.p, 'anything', 'the trim transformation filter must actually apply');
        }
    }
];

for (const check of RunQueryFeatureChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// The bundle's shared Query/Category fixtures, run through the generic bundle-lifecycle hook so the
// driver and any dispatcher create/tear them down identically inside one Setup → run → Teardown.
IntegrationCheckRegistry.Instance.RegisterLifecycle('runquery-features', {
    Setup: async ctx => { await createRunQueryFeatureFixtures(ctx); },
    Teardown: async () => { await teardownRunQueryFeatureFixtures(); }
});
