/**
 * client-cache.checks.ts — the 'client-cache' bundle (C1–C14).
 *
 * PORTED VERBATIM from packages/MJServer/integration-test-scripts/client-cache-tests.ts.
 * These run against a RUNNING MJAPI via GraphQLDataProvider (client transport,
 * TrustLocalCacheCompletely=false, CacheLocal opt-in). The client context is built
 * by bootstrapIntegrationClient (which preflights MJAPI), so checks here call
 * rv.RunView(params) WITHOUT a context user — the provider establishes the user.
 *
 * Only difference from the original bodies: C11 uses a static `RunQuery` import
 * instead of the original in-function `await import('@memberjunction/core')` (MJ
 * rule: no dynamic import()). C10 carries `RequiresMutation: true` in place of the
 * original `if (process.env.RUN_MUTATION_TESTS === '1')` gate.
 */
import {
    BaseEngine,
    BaseEnginePropertyConfig,
    RunView,
    RunQuery,
    BaseEntity,
    LocalCacheManager,
    Metadata,
    ProviderBase,
} from '@memberjunction/core';
import type {
    AggregateExpression,
    CachedRunViewData,
    IMetadataProvider,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import { uuidv4 } from '@memberjunction/global';
import type { MJActionCategoryEntity, MJQueryCategoryEntity, MJQueryEntity, MJUserSettingEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, AssertRowShape, RowKeys } from '@memberjunction/testing-integration';
import { UniqueFilter } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';

const ENTITY = 'MJ: Entities';
const SMALL_ENTITY = 'MJ: Query Categories';

/**
 * The client dedup linger window this bundle installs for its own duration (see the lifecycle at
 * the bottom of this file). `ProviderBase.DedupLingerMs` ships at 5000ms, and seven checks here
 * sleep past it so a later call truly revalidates rather than replaying the lingering result —
 * 37s of a run spent waiting out a constant.
 *
 * NOT lowered to near-zero, for a specific reason: C7 ("linger-window callers with DIFFERENT
 * Fields each get their own shape") asserts behaviour INSIDE the window, so a window shorter than
 * its two back-to-back RunViews would change what that check tests rather than speed it up. Those
 * calls are milliseconds apart, so 1500ms leaves roughly fifteen times the margin they need while
 * still cutting each outlive-sleep from 5.2s to 2s.
 */
const BUNDLE_DEDUP_LINGER_MS = 1500;

/**
 * How long a check waits to be certain the linger window has passed. Derived from the window
 * rather than hardcoded — when these were literal 5200s against a literal 5000 inside
 * ProviderBase, nothing said the two had to move together.
 */
const OUTLIVE_LINGER_MS = BUNDLE_DEDUP_LINGER_MS + 500;

function Sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** The entity C14 writes in one client transaction group. */
const GROUP_ENTITY = 'MJ: Action Categories';

/** How many rows C14 saves in one client transaction group. */
const GROUP_ROWS = 3;

/** Row IDs a client slot holds, upper-cased, or null when the slot is not stored. */
async function clientSlotIds(ctx: IntegrationCheckContext, fingerprint: string): Promise<string[] | null> {
    const stored = await ctx.Storage.GetItem<{ results: Array<{ ID: string }> }>(fingerprint, 'RunViewCache');
    return stored ? stored.results.map(r => r.ID.toUpperCase()).sort() : null;
}

/** Captured GraphQL wire operation sent through `GraphQLDataProvider.ExecuteGQL`. */
interface WireCall {
    query: string;
    variables: Record<string, string | number | boolean | object | null | undefined> | null | undefined;
}

/**
 * Wraps `ctx.Provider.ExecuteGQL` for the duration of `fn`, recording every GraphQL network
 * call sent over the wire and restoring the original method in `finally`.
 */
async function withWireSpy<T>(
    ctx: IntegrationCheckContext,
    fn: (calls: WireCall[]) => Promise<T>
): Promise<{ result: T; calls: WireCall[] }> {
    const provider = ctx.Provider as GraphQLDataProvider;
    const originalExecuteGQL: typeof provider.ExecuteGQL = provider.ExecuteGQL.bind(provider);
    const calls: WireCall[] = [];
    const wrapped: typeof provider.ExecuteGQL = async (query, variables, refreshTokenIfNeeded, options) => {
        calls.push({ query, variables });
        return originalExecuteGQL(query, variables, refreshTokenIfNeeded, options);
    };
    provider.ExecuteGQL = wrapped;
    try {
        const result = await fn(calls);
        return { result, calls };
    } finally {
        provider.ExecuteGQL = originalExecuteGQL;
    }
}

/** Filters captured wire calls whose GraphQL query text contains `operationSubstring`. */
function callsMatching(calls: ReadonlyArray<WireCall>, operationSubstring: string): WireCall[] {
    return calls.filter(c => c.query.includes(operationSubstring));
}

/**
 * Computes the client-side `RunViewCache` fingerprint matching `ProviderBase.clientCacheFingerprint`:
 * `${GenerateRunViewFingerprint(params, connectionPrefix)}|f:${normalizedFields}`.
 */
function clientRunViewFingerprint(ctx: IntegrationCheckContext, params: RunViewParams): string {
    const base = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, ctx.Provider.InstanceConnectionString);
    const fieldsKey = params.Fields && params.Fields.length > 0 && params.ResultType !== 'entity_object'
        ? params.Fields.map(f => f.trim().toLowerCase()).sort().join(',')
        : '*';
    return `${base}|f:${fieldsKey}`;
}

/**
 * Minimal `BaseEngine` subclass used by C16 and C17 to exercise browser-refresh (`F5`) engine
 * re-initialization against persistent `LocalCacheManager` storage.
 */
class TestF5Engine extends BaseEngine<TestF5Engine> {
    public Categories: MJActionCategoryEntity[] = [];
    public QueryCategories: Array<Record<string, string | number | boolean | null>> = [];
    private static _categoryFilter: string = '';
    private static _queryCategoryFilter: string = '';

    public static get Instance(): TestF5Engine {
        return super.getInstance<TestF5Engine>();
    }

    public static ConfigureFilters(categoryFilter: string, queryCategoryFilter: string): void {
        TestF5Engine._categoryFilter = categoryFilter;
        TestF5Engine._queryCategoryFilter = queryCategoryFilter;
    }

    /**
     * Simulates a browser refresh (`F5`): evicts the in-memory `TestF5Engine` singleton from the
     * global object store and connection registry so the next `TestF5Engine.Instance` constructs a
     * brand-new engine with empty arrays (`Loaded === false`), while `LocalCacheManager` / `ctx.Storage`
     * (simulating IndexedDB) remains intact across the reload.
     */
    public static SimulateBrowserF5(connectionKey: string): TestF5Engine {
        const current = TestF5Engine.Instance;
        const store = current.GetGlobalObjectStore();
        if (store) {
            delete store[current.GlobalKey];
        }
        BaseEngine.RemoveConnectionInstances(connectionKey);
        return TestF5Engine.Instance;
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                PropertyName: 'Categories',
                EntityName: GROUP_ENTITY,
                Filter: TestF5Engine._categoryFilter,
                CacheLocal: true,
                AutoRefresh: false,
                AddToObject: true,
            },
            {
                Type: 'entity',
                PropertyName: 'QueryCategories',
                EntityName: SMALL_ENTITY,
                Filter: TestF5Engine._queryCategoryFilter,
                ResultType: 'simple',
                CacheLocal: true,
                AutoRefresh: false,
                AddToObject: true,
            },
        ];
        await this.Load(configs, provider ?? Metadata.Provider, forceRefresh, contextUser);
    }
}

/** The ordered client-cache bundle. Numeric order is intentional and load-bearing (C3→C4→C5 share 'c3'). */
export const ClientCacheChecks: NamedCheck[] = [
    {
        Id: 'client-cache.C1',
        Name: 'C1: plain RunView (no CacheLocal) with narrow Fields returns only those columns',
        Fn: async (): Promise<void> => {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c1'),
                Fields: ['Name', 'SchemaName'],
                ResultType: 'simple'
            });
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            Assert(result.Results.length > 100, `expected 100+ entities, got ${result.Results.length}`);
            AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'narrow shape through GraphQL transport (requested fields + PK)');
        }
    },
    {
        Id: 'client-cache.C2',
        Name: 'C2: identical narrow request twice in a row keeps the identical shape (server hit/miss symmetry over the wire)',
        Fn: async (): Promise<void> => {
            const rv = new RunView();
            const params = {
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c2'),
                Fields: ['Name', 'BaseView'],
                ResultType: 'simple' as const
            };
            const first = await rv.RunView(params);
            // Outlive the client-side dedup linger window so the second call truly
            // round-trips to the server (exercising the server cache hit path).
            await Sleep(OUTLIVE_LINGER_MS);
            const second = await rv.RunView(params);
            Assert(first.Success && second.Success, 'both calls must succeed');
            AssertRowShape(first.Results[0], ['ID', 'Name', 'BaseView'], 'first (server miss) shape');
            AssertRowShape(second.Results[0], ['ID', 'Name', 'BaseView'], 'second (server hit) shape');
            AssertEqual(second.Results.length, first.Results.length, 'row counts must match across server miss/hit');
        }
    },
    {
        Id: 'client-cache.C3',
        Name: 'C3: CacheLocal MISS stores a client cache slot; repeat is validated current and served locally',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const params = {
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c3'),
                Fields: ['Name', 'SchemaName'],
                ResultType: 'simple' as const,
                CacheLocal: true
            };
            ctx.Storage.ResetCounts();
            const first = await rv.RunView(params);
            Assert(first.Success, `first call failed: ${first.ErrorMessage}`);
            AssertRowShape(first.Results[0], ['ID', 'Name', 'SchemaName'], 'first-call shape (requested fields + PK)');
            await Sleep(300); // the stale-path client cache write is fire-and-forget
            Assert(ctx.Storage.SetItemCount > 0, 'first CacheLocal call must write a client cache slot');

            await Sleep(OUTLIVE_LINGER_MS); // outlive the dedup linger window
            const setsBefore = ctx.Storage.SetItemCount;
            ctx.Storage.GetItemsCount = 0;
            const second = await rv.RunView(params);
            Assert(second.Success, `second call failed: ${second.ErrorMessage}`);
            AssertRowShape(second.Results[0], ['ID', 'Name', 'SchemaName'], 'second-call shape');
            AssertEqual(second.Results.length, first.Results.length, 'row counts must match');
            Assert(ctx.Storage.GetItemsCount > 0, 'second call must read the client cache slot');
            AssertEqual(ctx.Storage.SetItemCount, setsBefore, 'a current slot must not be rewritten');
        }
    },
    {
        Id: 'client-cache.C4',
        Name: 'C4: a DIFFERENT field subset gets its OWN client slot — no cross-subset serving (the |f: fingerprint fix)',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const setsBefore = ctx.Storage.SetItemCount;
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
            AssertRowShape(result.Results[0], ['ID', 'Name', 'Description'], 'own-slot shape must include Description');
            await Sleep(300); // fire-and-forget slot write
            Assert(ctx.Storage.SetItemCount > setsBefore, 'the new subset must write its own client slot');
        }
    },
    {
        Id: 'client-cache.C5',
        Name: 'C5: a no-Fields (full width) CacheLocal request is not served from a narrow slot',
        Fn: async (): Promise<void> => {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c3'), // same entity+filter again
                ResultType: 'simple',
                CacheLocal: true
            });
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            const keyCount = RowKeys(result.Results[0]).length;
            Assert(keyCount > 20, `expected full-width rows (20+ columns), got ${keyCount} — narrow slot must not satisfy '*'`);
        }
    },
    {
        Id: 'client-cache.C6',
        Name: 'C6: entity_object results materialize as BaseEntity instances client-side (with CacheLocal)',
        Fn: async (): Promise<void> => {
            const rv = new RunView();
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

            await Sleep(OUTLIVE_LINGER_MS); // outlive linger; second call validates the slot and re-materializes
            const second = await rv.RunView<BaseEntity>(params);
            Assert(second.Success, `second call failed: ${second.ErrorMessage}`);
            Assert(second.Results[0] instanceof BaseEntity, 'cache-served entity_object results must re-materialize as BaseEntity');
        }
    },
    {
        Id: 'client-cache.C7',
        Name: 'C7: linger-window callers with DIFFERENT Fields each get their own shape (client dedup keying)',
        Fn: async (): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 'c7');
            const a = await rv.RunViews([{ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }]);
            const b = await rv.RunViews([{ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name', 'Description'], ResultType: 'simple' }]);
            Assert(a[0].Success && b[0].Success, 'both calls must succeed');
            AssertRowShape(a[0].Results[0], ['ID', 'Name'], 'first caller shape');
            AssertRowShape(b[0].Results[0], ['ID', 'Name', 'Description'], 'second caller must NOT inherit the first caller\'s narrower shape');
        }
    },
    {
        Id: 'client-cache.C8',
        Name: 'C8: batch RunViews with mixed CacheLocal projects each result to its own param',
        Fn: async (): Promise<void> => {
            const rv = new RunView();
            const results = await rv.RunViews([
                { EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 'c8a'), Fields: ['Name', 'SchemaName'], ResultType: 'simple', CacheLocal: true },
                { EntityName: SMALL_ENTITY, ExtraFilter: UniqueFilter('Name', 'c8b'), Fields: ['ID', 'Name'], ResultType: 'simple' }
            ]);
            AssertEqual(results.length, 2, 'two results expected');
            Assert(results[0].Success && results[1].Success, 'both batch results must succeed');
            AssertRowShape(results[0].Results[0], ['ID', 'Name', 'SchemaName'], 'batch index 0 shape (CacheLocal)');
            AssertRowShape(results[1].Results[0], ['ID', 'Name'], 'batch index 1 shape (no caching)');
        }
    },
    {
        Id: 'client-cache.C9',
        Name: 'C9: count_only works over the GraphQL transport (TotalRowCount, zero rows)',
        Fn: async (): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 'c9');
            const count = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, ResultType: 'count_only' });
            Assert(count.Success, `count_only failed: ${count.ErrorMessage}`);
            AssertEqual(count.Results.length, 0, 'count_only must return no rows');
            Assert((count.TotalRowCount ?? 0) > 100, `count_only TotalRowCount expected 100+, got ${(count.TotalRowCount ?? 0)}`);
            // And it must not poison the row cache for the same entity+filter
            const rows = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' });
            Assert(rows.Success && rows.Results.length === count.TotalRowCount, 'row query after count_only must see all rows');
        }
    },
    {
        Id: 'client-cache.C10',
        Name: 'C10 (mutation): client CacheLocal slot refreshes after save and drops the row after delete (revalidation round trip)',
        RequiresMutation: true,
        Fn: async (): Promise<void> => {
            const rv = new RunView();
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const settingPrefix = `mj.integrationtest.client.${Date.now()}`;
            const makeParams = () => ({
                EntityName: 'MJ: User Settings',
                ExtraFilter: `Setting LIKE '${settingPrefix}%'`,
                Fields: ['ID', 'Setting'],
                ResultType: 'simple' as const,
                CacheLocal: true
            });
            const before = await rv.RunView(makeParams());
            Assert(before.Success, `pre-query failed: ${before.ErrorMessage}`);
            AssertEqual(before.Results.length, 0, 'setting must not exist yet');
            await Sleep(500); // let the slot write land

            // Save through the SAME client (a real GraphQL mutation end-to-end)
            const setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
            setting.UserID = md.CurrentUser.ID;
            setting.Setting = `${settingPrefix}.a`;
            setting.Value = 'integration-test';
            Assert(await setting.Save(), `client-side Save must succeed: ${setting.LatestResult?.CompleteMessage ?? ''}`);
            try {
                await Sleep(OUTLIVE_LINGER_MS); // outlive linger so the next call truly revalidates the slot
                const after = await rv.RunView(makeParams());
                Assert(after.Success, `post-save query failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, 1, 'slot revalidation must surface the saved row');
                AssertRowShape(after.Results[0], ['ID', 'Setting'], 'revalidated rows must match the slot shape');
            } finally {
                Assert(await setting.Delete(), `client-side Delete must succeed: ${setting.LatestResult?.CompleteMessage ?? ''}`);
            }
            await Sleep(OUTLIVE_LINGER_MS);
            const final = await rv.RunView(makeParams());
            Assert(final.Success, `post-delete query failed: ${final.ErrorMessage}`);
            AssertEqual(final.Results.length, 0, 'slot revalidation must drop the deleted row');
        }
    },
    {
        Id: 'client-cache.C11',
        Name: 'C11: client RunQuery with CacheLocal — slot written, repeat revalidates over GraphQL',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            // Use any existing approved query in the DB (the client RunQuery cache is
            // query-agnostic; we assert the caching mechanics, not the data)
            const queries = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: Queries',
                ExtraFilter: "Status = 'Approved' AND SQL IS NOT NULL",
                Fields: ['ID', 'Name'],
                MaxRows: 20,
                ResultType: 'simple'
            });
            Assert(queries.Success && queries.Results.length > 0, 'need at least one approved query in the DB');

            // Find an approved query without required parameters so parameterless RunQuery succeeds
            const requiredParams = await rv.RunView<{ QueryID: string }>({
                EntityName: 'MJ: Query Parameters',
                ExtraFilter: "IsRequired = 1",
                Fields: ['QueryID'],
                ResultType: 'simple'
            });
            const queriesWithReqParams = new Set(
                requiredParams.Success ? requiredParams.Results.map(r => String(r.QueryID).toLowerCase()) : []
            );
            const candidate = queries.Results.find(q => !queriesWithReqParams.has(String(q.ID).toLowerCase()));
            Assert(candidate !== undefined, 'need at least one approved query without required parameters in the DB');
            if (!candidate) throw new Error('need at least one approved query without required parameters in the DB');
            const queryId = String(candidate.ID);

            const rq = new RunQuery();
            ctx.Storage.ResetCounts();
            const first = await rq.RunQuery({ QueryID: queryId, CacheLocal: true, MaxRows: 5 });
            Assert(first.Success, `first run failed: ${first.ErrorMessage}`);
            await Sleep(300); // slot write is fire-and-forget
            Assert(ctx.Storage.SetCount('RunQueryCache') > 0, 'first CacheLocal run must write a client RunQueryCache slot');

            const second = await rq.RunQuery({ QueryID: queryId, CacheLocal: true, MaxRows: 5 });
            Assert(second.Success, `second run failed: ${second.ErrorMessage}`);
            AssertEqual(second.Results.length, first.Results.length,
                'revalidated results must match (current → slot, stale/no_validation → fresh rows)');
        }
    },
    {
        Id: 'client-cache.C12',
        Name: 'C12: Trust=0 entities — server never caches; client slots only when the result carries a validation timestamp',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            // 'MJ: Audit Logs' ships TrustServerCacheCompletely=false, so the server refuses to
            // cache it (event-driven invalidation is untrustworthy for it). It also ships
            // AllowCaching=false, which would make the client refuse every slot before the
            // behaviour under test is reached. This check therefore enables caching on the
            // client's IN-MEMORY metadata only, for its own duration, and restores it; the
            // server's metadata and the database are untouched. Because the entity is
            // cache-INELIGIBLE on the server, Fields are never widened — so the response only
            // carries a maxUpdatedAt stamp when the caller requests __mj_UpdatedAt, and the
            // client write gate correctly refuses to store unvalidatable (stamp-less) slots.
            const info = new Metadata().EntityByName('MJ: Audit Logs'); // global-provider-ok: integration test script — single-provider process by design
            Assert(!!info, 'MJ: Audit Logs must exist');
            Assert(info!.TrustServerCacheCompletely === false,
                `precondition: TrustServerCacheCompletely=false (got ${info!.TrustServerCacheCompletely})`);
            const originalAllowCaching = info!.AllowCaching;
            info!.AllowCaching = true;
            try {
                // Narrow request WITHOUT the timestamp → no slot (defensive gate)
                ctx.Storage.ResetCounts();
                const narrow = await rv.RunView({
                    EntityName: 'MJ: Audit Logs',
                    ExtraFilter: "'tag-c12a' <> 'never'",
                    Fields: ['ID'],
                    MaxRows: 5,
                    ResultType: 'simple' as const,
                    CacheLocal: true
                });
                Assert(narrow.Success, `narrow failed: ${narrow.ErrorMessage}`);
                await Sleep(300);
                AssertEqual(ctx.Storage.SetCount('RunViewCache'), 0,
                    'a stamp-less response must NOT be cached (it could never validate later)');

                // Request WITH the timestamp → slot written and revalidation works
                const params = {
                    EntityName: 'MJ: Audit Logs',
                    ExtraFilter: "'tag-c12b' <> 'never'",
                    Fields: ['ID', '__mj_UpdatedAt'],
                    MaxRows: 5,
                    ResultType: 'simple' as const,
                    CacheLocal: true
                };
                const first = await rv.RunView({ ...params });
                Assert(first.Success, `first failed: ${first.ErrorMessage}`);
                await Sleep(300);
                Assert(ctx.Storage.SetCount('RunViewCache') > 0,
                    'a stamped response must be cached (client validation is DB-checked per request, independent of Trust)');

                await Sleep(OUTLIVE_LINGER_MS); // outlive linger so the second call truly revalidates
                const second = await rv.RunView({ ...params });
                Assert(second.Success, `second failed: ${second.ErrorMessage}`);
                AssertEqual(second.Results.length, first.Results.length, 'revalidated results must match');
            } finally {
                info!.AllowCaching = originalAllowCaching;
            }
        }
    },
    {
        Id: 'client-cache.C13',
        Name: 'C13: AggregateResults are returned in the caller\'s requested order over the GraphQL/client transport',
        Fn: async (): Promise<void> => {
            // Client-transport aggregate coverage: AggregateResults must be returned in the
            // caller's requested order (interfaces.ts: "same order as input Aggregates array"),
            // including when a semantically-equivalent view with a different Aggregates[] order
            // was cached first. Warm with [A,B], read with [B,A], assert the second caller's order.
            const rv = new RunView();
            const A: AggregateExpression = { expression: 'COUNT(*)', alias: 'Cnt' };
            const B: AggregateExpression = { expression: 'MAX(__mj_UpdatedAt)', alias: 'MaxUpd' };
            const filter = UniqueFilter('Name', 'c13');

            const warm = await rv.RunView({ EntityName: SMALL_ENTITY, ExtraFilter: filter, Aggregates: [A, B], ResultType: 'simple', CacheLocal: true });
            Assert(warm.Success, `warm failed: ${warm.ErrorMessage}`);
            await Sleep(OUTLIVE_LINGER_MS); // outlive linger so the reversed read truly revalidates the slot

            const reversed = await rv.RunView({ EntityName: SMALL_ENTITY, ExtraFilter: filter, Aggregates: [B, A], ResultType: 'simple', CacheLocal: true });
            Assert(reversed.Success, `reversed failed: ${reversed.ErrorMessage}`);
            Assert(reversed.AggregateResults != null && reversed.AggregateResults.length === 2, 'reversed run must return two AggregateResults');
            AssertEqual(reversed.AggregateResults![0].alias, B.alias!, 'ORDER CONTRACT: AggregateResults[0] must be the caller\'s FIRST requested aggregate');
            AssertEqual(reversed.AggregateResults![1].alias, A.alias!, 'ORDER CONTRACT: AggregateResults[1] must be the caller\'s SECOND requested aggregate');
        }
    },
    {
        Id: 'client-cache.C14',
        Name: 'C14 (mutation): a transaction group submitted from the client rewrites the client\'s cached slot once',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const params: RunViewParams = { EntityName: GROUP_ENTITY, IgnoreMaxRows: true };
            // A private, connection-shaped slot, stored empty, so only this check's rows reach it.
            const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, `it-c14://${uuidv4()}/`);
            await LocalCacheManager.Instance.SetRunViewResult(fingerprint, params, [], '');
            AssertEqual(JSON.stringify(await clientSlotIds(ctx, fingerprint)), '[]', 'precondition: the client slot is stored and empty');
            const writesBefore = ctx.Storage.SetCountForKey(fingerprint);

            const group = await md.CreateTransactionGroup();
            const categories: MJActionCategoryEntity[] = [];
            for (let i = 0; i < GROUP_ROWS; i++) {
                const category = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
                category.NewRecord();
                category.Name = `C14 client group ${i} ${uuidv4()} (mj-integration-test — safe to delete)`;
                category.Status = 'Active';
                category.TransactionGroup = group;
                Assert(await category.Save(), `queueing a category failed: ${category.LatestResult?.CompleteMessage ?? ''}`);
                categories.push(category);
            }
            let submitted = false;
            try {
                Assert(await group.Submit(), 'the client transaction group failed to submit');
                submitted = true;
                const ids = categories.map(c => c.ID.toUpperCase()).sort();
                let stored = await clientSlotIds(ctx, fingerprint);
                for (let waited = 0; JSON.stringify(stored) !== JSON.stringify(ids) && waited < 5000; waited += 50) {
                    await Sleep(50);
                    stored = await clientSlotIds(ctx, fingerprint);
                }
                AssertEqual(JSON.stringify(stored), JSON.stringify(ids), 'the client slot holds every row the group saved');
                await Sleep(1000); // count any write that lands a moment later as well
                AssertEqual(ctx.Storage.SetCountForKey(fingerprint) - writesBefore, 1, `the client slot is written once for the group of ${GROUP_ROWS} rows`);
            } finally {
                if (submitted) {
                    // Through a new group: each entity still points at the submitted one, which would take
                    // a plain Delete() and never run it.
                    const deletes = await md.CreateTransactionGroup();
                    for (const category of categories) {
                        category.TransactionGroup = deletes;
                        Assert(await category.Delete(), `queueing a client-side delete failed: ${category.LatestResult?.CompleteMessage ?? ''}`);
                    }
                    Assert(await deletes.Submit(), 'the client group of deletes failed to submit');
                }
                await LocalCacheManager.Instance.InvalidateRunViewResult(fingerprint);
            }
        }
    },
    {
        Id: 'client-cache.C15',
        Name: 'C15: simulated F5 metadata dataset refresh (MJ_Metadata) validates via status check with 0 GetDatasetByName wire calls',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            // 1. Cold boot: clear MJ_Metadata from the provider's dataset storage and warm it once
            await ctx.Provider.ClearDatasetCache('MJ_Metadata');
            AssertEqual(await ctx.Provider.IsDatasetCached('MJ_Metadata'), false, 'precondition: MJ_Metadata dataset cache cleared');

            const coldDataset = await ctx.Provider.GetAndCacheDatasetByName('MJ_Metadata');
            Assert(coldDataset?.Success === true && coldDataset.Results.length > 0, 'cold GetAndCacheDatasetByName(MJ_Metadata) must succeed');
            AssertEqual(await ctx.Provider.IsDatasetCached('MJ_Metadata'), true, 'MJ_Metadata must be cached locally after cold boot');

            // 2. Simulated F5 reload: dataset is already in LocalStorageProvider; verify revalidation uses only GetDatasetStatusByName
            const { result: warmDataset, calls } = await withWireSpy(ctx, async () => {
                const ds = await ctx.Provider.GetAndCacheDatasetByName('MJ_Metadata');
                const refreshed = await ctx.Provider.RefreshRemoteMetadataTimestamps();
                Assert(refreshed, 'RefreshRemoteMetadataTimestamps must succeed on warm F5');
                AssertEqual(ctx.Provider.LocalMetadataObsolete(), false, 'LocalMetadataObsolete must be false when server timestamps match');
                return ds;
            });

            Assert(warmDataset?.Success === true, 'warm F5 GetAndCacheDatasetByName(MJ_Metadata) must succeed');
            AssertEqual(warmDataset.Results.length, coldDataset.Results.length, 'warm F5 dataset item count must match cold dataset');
            Assert(
                callsMatching(calls, 'GetDatasetStatusByName').length >= 1,
                'warm F5 must issue lightweight GetDatasetStatusByName check'
            );
            AssertEqual(
                callsMatching(calls, 'GetDatasetByName').length,
                0,
                'warm F5 must NOT re-download the full MJ_Metadata dataset via GetDatasetByName'
            );
        }
    },
    {
        Id: 'client-cache.C16',
        Name: 'C16: simulated F5 BaseEngine.Config(false) warm reload hydrates entity & simple configs with 0 storage rewrites',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const seed = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
            seed.NewRecord();
            seed.Name = `C16 F5 seed ${uuidv4()} (mj-integration-test — safe to delete)`;
            seed.Status = 'Active';
            Assert(await seed.Save(), `seed category save failed: ${seed.LatestResult?.CompleteMessage ?? ''}`);

            const catFilter = `ID = '${seed.ID}'`;
            const qCatFilter = UniqueFilter('Name', 'c16');
            const catParams: RunViewParams = {
                EntityName: GROUP_ENTITY,
                ExtraFilter: catFilter,
                IgnoreMaxRows: true,
                ResultType: 'entity_object',
                CacheLocal: true,
            };
            const qCatParams: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: qCatFilter,
                IgnoreMaxRows: true,
                ResultType: 'simple',
                CacheLocal: true,
            };
            const catFp = clientRunViewFingerprint(ctx, catParams);
            const qCatFp = clientRunViewFingerprint(ctx, qCatParams);

            try {
                // 1. Cold boot of TestF5Engine
                const coldEngine = TestF5Engine.SimulateBrowserF5(ctx.Provider.InstanceConnectionString);
                TestF5Engine.ConfigureFilters(catFilter, qCatFilter);
                await coldEngine.Config(false, undefined, ctx.Provider);
                await Sleep(300); // allow background cache writes to settle

                AssertEqual(coldEngine.Categories.length, 1, 'cold engine must load the seeded category');
                Assert(coldEngine.Categories[0] instanceof BaseEntity, 'cold engine Categories must be BaseEntity instances');
                Assert(coldEngine.QueryCategories.length > 0, 'cold engine must load QueryCategories');

                const catWritesAfterCold = ctx.Storage.SetCountForKey(catFp);
                const qCatWritesAfterCold = ctx.Storage.SetCountForKey(qCatFp);
                Assert(catWritesAfterCold >= 1, 'cold engine load must write Categories slot');
                Assert(qCatWritesAfterCold >= 1, 'cold engine load must write QueryCategories slot');

                // 2. Simulated Browser F5: evict singleton in-memory state while LocalCacheManager persists
                await Sleep(OUTLIVE_LINGER_MS);
                const f5Engine = TestF5Engine.SimulateBrowserF5(ctx.Provider.InstanceConnectionString);
                Assert(f5Engine !== coldEngine, 'SimulateBrowserF5 must construct a fresh engine instance');
                AssertEqual(f5Engine.Categories.length, 0, 'fresh F5 engine instance starts with empty Categories');
                AssertEqual(f5Engine.QueryCategories.length, 0, 'fresh F5 engine instance starts with empty QueryCategories');

                const { calls } = await withWireSpy(ctx, async () => {
                    await f5Engine.Config(false, undefined, ctx.Provider);
                });
                await Sleep(300);

                AssertEqual(
                    callsMatching(calls, 'RunViewsWithCacheCheck').length,
                    1,
                    'F5 engine reload must validate both configs in a single batched RunViewsWithCacheCheck wire call'
                );
                AssertEqual(
                    ctx.Storage.SetCountForKey(catFp),
                    catWritesAfterCold,
                    'current Categories slot must NOT be rewritten on F5'
                );
                AssertEqual(
                    ctx.Storage.SetCountForKey(qCatFp),
                    qCatWritesAfterCold,
                    'current QueryCategories slot must NOT be rewritten on F5'
                );
                AssertEqual(f5Engine.Categories.length, 1, 'F5 engine must hydrate Categories from local cache');
                Assert(f5Engine.Categories[0] instanceof BaseEntity, 'F5 engine Categories must re-materialize as BaseEntity');
                AssertEqual(f5Engine.Categories[0].ID.toUpperCase(), seed.ID.toUpperCase(), 'hydrated category ID must match');
                AssertEqual(
                    f5Engine.QueryCategories.length,
                    coldEngine.QueryCategories.length,
                    'F5 engine QueryCategories count must match cold load'
                );
            } finally {
                await seed.Delete();
                await LocalCacheManager.Instance.InvalidateRunViewResult(catFp);
                await LocalCacheManager.Instance.InvalidateRunViewResult(qCatFp);
            }
        }
    },
    {
        Id: 'client-cache.C17',
        Name: 'C17: simulated F5 BaseEngine.Config(false) after out-of-band server mutation merges differential delta in place',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const prefix = `C17-diff-${uuidv4()}`;
            const catFilter = `Name LIKE '${prefix}%'`;
            const qCatFilter = UniqueFilter('Name', 'c17');
            const catParams: RunViewParams = {
                EntityName: GROUP_ENTITY,
                ExtraFilter: catFilter,
                IgnoreMaxRows: true,
                ResultType: 'entity_object',
                CacheLocal: true,
            };
            const catFp = clientRunViewFingerprint(ctx, catParams);
            const qCatFp = clientRunViewFingerprint(ctx, {
                EntityName: SMALL_ENTITY,
                ExtraFilter: qCatFilter,
                IgnoreMaxRows: true,
                ResultType: 'simple',
                CacheLocal: true,
            });

            const catA = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
            catA.NewRecord();
            catA.Name = `${prefix}-A (mj-integration-test — safe to delete)`;
            catA.Description = 'Initial A';
            catA.Status = 'Active';
            Assert(await catA.Save(), `catA save failed: ${catA.LatestResult?.CompleteMessage ?? ''}`);

            const catB = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
            catB.NewRecord();
            catB.Name = `${prefix}-B (mj-integration-test — safe to delete)`;
            catB.Description = 'Initial B';
            catB.Status = 'Active';
            Assert(await catB.Save(), `catB save failed: ${catB.LatestResult?.CompleteMessage ?? ''}`);

            let catC: MJActionCategoryEntity | null = null;
            try {
                // 1. Cold boot of TestF5Engine with 2 rows (catA, catB)
                const coldEngine = TestF5Engine.SimulateBrowserF5(ctx.Provider.InstanceConnectionString);
                TestF5Engine.ConfigureFilters(catFilter, qCatFilter);
                await coldEngine.Config(false, undefined, ctx.Provider);
                await Sleep(300);

                AssertEqual(coldEngine.Categories.length, 2, 'cold engine must load 2 initial categories');
                const preMutationSlot = await LocalCacheManager.Instance.GetRunViewResult(catFp);
                Assert(preMutationSlot !== null && preMutationSlot.rowCount === 2, 'pre-mutation client slot must hold 2 rows');
                if (!preMutationSlot) {
                    throw new Error('pre-mutation client slot missing');
                }

                // 2. Simulate an out-of-band server mutation (another user updates catB and inserts catC while
                // this browser's IndexedDB still holds preMutationSlot).
                await Sleep(50);
                catB.Description = 'Updated B out-of-band';
                Assert(await catB.Save(), `catB update failed: ${catB.LatestResult?.CompleteMessage ?? ''}`);

                catC = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
                catC.NewRecord();
                catC.Name = `${prefix}-C (mj-integration-test — safe to delete)`;
                catC.Description = 'Inserted C out-of-band';
                catC.Status = 'Active';
                Assert(await catC.Save(), `catC save failed: ${catC.LatestResult?.CompleteMessage ?? ''}`);

                // Restore the client's pre-mutation slot so the client's IndexedDB reflects the state
                // prior to the out-of-band server writes.
                await LocalCacheManager.Instance.SetRunViewResult(
                    catFp,
                    catParams,
                    preMutationSlot.results,
                    preMutationSlot.maxUpdatedAt,
                    preMutationSlot.aggregateResults,
                    preMutationSlot.totalRowCount,
                    ctx.Provider
                );

                // 3. Simulated F5 reload: engine sends preMutationSlot cacheStatus and merges differential/updated state
                await Sleep(OUTLIVE_LINGER_MS);
                const f5Engine = TestF5Engine.SimulateBrowserF5(ctx.Provider.InstanceConnectionString);
                const { calls } = await withWireSpy(ctx, async () => {
                    await f5Engine.Config(false, undefined, ctx.Provider);
                });
                await Sleep(300);

                AssertEqual(callsMatching(calls, 'RunViewsWithCacheCheck').length, 1, 'F5 reload must use RunViewsWithCacheCheck');
                AssertEqual(f5Engine.Categories.length, 3, 'F5 engine must hold all 3 categories after differential merge');
                const hydratedB = f5Engine.Categories.find(c => c.ID.toUpperCase() === catB.ID.toUpperCase());
                const hydratedC = f5Engine.Categories.find(c => c.ID.toUpperCase() === catC!.ID.toUpperCase());
                Assert(hydratedB !== undefined, 'updated catB must be present after F5 merge');
                AssertEqual(hydratedB?.Description, 'Updated B out-of-band', 'catB Description must reflect server update');
                Assert(hydratedC !== undefined, 'newly inserted catC must be present after F5 merge');
            } finally {
                if (catC) {
                    await catC.Delete();
                }
                await catB.Delete();
                await catA.Delete();
                await LocalCacheManager.Instance.InvalidateRunViewResult(catFp);
                await LocalCacheManager.Instance.InvalidateRunViewResult(qCatFp);
            }
        }
    },
    {
        Id: 'client-cache.C18',
        Name: 'C18: simulated F5 RunQuery with CacheLocal validates status=current on 2nd call and refreshes after out-of-band server mutation',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const md = new Metadata();
            const rq = new RunQuery();
            const schema = ctx.Schema ?? '__mj';
            const prefix = `mj-it-c18-${uuidv4()}`;

            const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories');
            category.NewRecord();
            category.Name = `Integration Test C18 ${Date.now()}`;
            category.UserID = md.CurrentUser?.ID ?? ctx.User?.ID ?? null;
            Assert(await category.Save(), `C18 query category save failed: ${category.LatestResult?.CompleteMessage ?? ''}`);

            const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries');
            query.NewRecord();
            query.Name = `${prefix}-query`;
            query.CategoryID = category.ID;
            query.SQL = `SELECT ID, Name, __mj_UpdatedAt FROM ${schema}.vwActionCategories WHERE Name LIKE '${prefix}%'`;
            query.CacheValidationSQL =
                `SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS TotalRows ` +
                `FROM ${schema}.vwActionCategories WHERE Name LIKE '${prefix}%'`;
            query.Status = 'Approved';
            Assert(await query.Save(FixtureQuerySaveOptions()), `C18 query save failed: ${query.LatestResult?.CompleteMessage ?? ''}`);

            const rowA = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
            rowA.NewRecord();
            rowA.Name = `${prefix}-A (mj-integration-test — safe to delete)`;
            rowA.Status = 'Active';
            Assert(await rowA.Save(), `C18 rowA save failed: ${rowA.LatestResult?.CompleteMessage ?? ''}`);

            let rowB: MJActionCategoryEntity | undefined;
            const queryParams = { QueryID: query.ID, CacheLocal: true };
            let fingerprint = '';

            try {
                // Allow server-side QueryEngine auto-refresh to pick up the newly saved query
                await Sleep(400);
                await LocalCacheManager.Instance.InvalidateRunQueryResultsForQuery(query.ID);

                // 1. Cold RunQuery with CacheLocal: true — routes through RunQueriesWithCacheCheck
                // and stamps maxUpdatedAt + rowCount + definitionHash on the first fetch
                ctx.Storage.ResetCounts();
                const { result: first, calls: coldCalls } = await withWireSpy(ctx, async () => {
                    return rq.RunQuery(queryParams);
                });
                Assert(first.Success, `cold RunQuery failed: ${first.ErrorMessage}`);
                AssertEqual(first.Results.length, 1, 'cold RunQuery must return rowA');
                AssertEqual(
                    callsMatching(coldCalls, 'RunQueriesWithCacheCheck').length,
                    1,
                    'cold CacheLocal RunQuery must route through RunQueriesWithCacheCheck so the slot is stamped on first fetch'
                );
                await Sleep(300);

                fingerprint = first.CacheKey ?? '';
                Assert(fingerprint.length > 0, 'cold CacheLocal RunQuery must return its CacheKey fingerprint');
                const writesAfterCold = ctx.Storage.SetCount('RunQueryCache');
                Assert(writesAfterCold >= 1, 'cold CacheLocal RunQuery must write a client RunQueryCache slot');
                const preMutationSlot = await LocalCacheManager.Instance.GetRunQueryResult(fingerprint);
                Assert(preMutationSlot !== null && !!preMutationSlot.maxUpdatedAt, 'cold slot must have a non-empty maxUpdatedAt stamp');
                if (!preMutationSlot) {
                    throw new Error('cold RunQueryCache slot missing');
                }

                // 2. Simulated F5 (first repeat call after cold boot): must validate via RunQueriesWithCacheCheck
                // and receive status='current' without re-running SQL or rewriting the client slot.
                const { result: second, calls: warmCalls } = await withWireSpy(ctx, async () => {
                    return rq.RunQuery(queryParams);
                });
                await Sleep(300);

                Assert(second.Success, `warm F5 RunQuery failed: ${second.ErrorMessage}`);
                AssertEqual(second.CacheHit, true, 'warm F5 RunQuery must be served from the local slot (CacheHit=true)');
                AssertEqual(second.Results.length, 1, 'warm F5 RunQuery row count must match cold run');
                AssertEqual(
                    callsMatching(warmCalls, 'RunQueriesWithCacheCheck').length,
                    1,
                    'warm F5 RunQuery must validate via RunQueriesWithCacheCheck'
                );
                AssertEqual(
                    callsMatching(warmCalls, 'GetQueryData').length,
                    0,
                    'warm F5 RunQuery must NOT fall back to unvalidated GetQueryData'
                );
                AssertEqual(
                    ctx.Storage.SetCount('RunQueryCache'),
                    writesAfterCold,
                    'warm F5 RunQuery must validate as current on the 2nd call without rewriting the RunQueryCache slot'
                );

                // 3. Out-of-band server mutation: insert rowB, restore pre-mutation client slot, and verify F5 refreshes
                await Sleep(50);
                rowB = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
                rowB.NewRecord();
                rowB.Name = `${prefix}-B (mj-integration-test — safe to delete)`;
                rowB.Status = 'Active';
                Assert(await rowB.Save(), `C18 rowB save failed: ${rowB.LatestResult?.CompleteMessage ?? ''}`);

                await LocalCacheManager.Instance.SetRunQueryResult(
                    fingerprint,
                    query.Name,
                    preMutationSlot.results,
                    preMutationSlot.maxUpdatedAt,
                    preMutationSlot.rowCount,
                    query.ID,
                    undefined,
                    md.CurrentUser?.ID ?? ctx.User?.ID,
                    preMutationSlot.definitionHash ? { QueryID: query.ID, Hash: preMutationSlot.definitionHash } : undefined
                );

                const writesBeforeStaleF5 = ctx.Storage.SetCount('RunQueryCache');
                const third = await rq.RunQuery(queryParams);
                await Sleep(300);

                Assert(third.Success, `post-mutation F5 RunQuery failed: ${third.ErrorMessage}`);
                AssertEqual(third.Results.length, 2, 'post-mutation F5 RunQuery must return both rowA and rowB');
                Assert(
                    ctx.Storage.SetCount('RunQueryCache') > writesBeforeStaleF5,
                    'post-mutation F5 RunQuery must rewrite the RunQueryCache slot with fresh rows'
                );
            } finally {
                if (rowB) {
                    await rowB.Delete();
                }
                await rowA.Delete();
                await query.Delete();
                await category.Delete();
                await LocalCacheManager.Instance.InvalidateRunQueryResult(fingerprint);
                await LocalCacheManager.Instance.InvalidateRunQueryResultsForQuery(query.ID);
            }
        }
    },
    {
        Id: 'client-cache.C19',
        Name: 'C19: server-warmed cross-client sharing — Tab B cold CacheLocal request is served from MJAPI server cache warmed by Tab A',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const sharedFilter = UniqueFilter('Name', 'c19');
            const tabAParams: RunViewParams = {
                EntityName: ENTITY,
                ExtraFilter: sharedFilter,
                Fields: ['Name', 'BaseView'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const tabBParamsNarrower: RunViewParams = {
                EntityName: ENTITY,
                ExtraFilter: sharedFilter,
                Fields: ['Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const fpA = clientRunViewFingerprint(ctx, tabAParams);
            const fpBNarrow = clientRunViewFingerprint(ctx, tabBParamsNarrower);

            try {
                // 1. Tab A cold call: warms MJAPI's server-side full-width superset slot for `sharedFilter`
                const tabA = await rv.RunView(tabAParams);
                Assert(tabA.Success && tabA.Results.length > 100, `Tab A RunView failed: ${tabA.ErrorMessage}`);
                AssertRowShape(tabA.Results[0], ['ID', 'Name', 'BaseView'], 'Tab A row shape');
                await Sleep(300);

                // 2. Simulate Tab B (fresh browser profile with empty local IndexedDB hitting the warm server)
                await LocalCacheManager.Instance.InvalidateRunViewResult(fpA);
                await LocalCacheManager.Instance.InvalidateRunViewResult(fpBNarrow);
                await Sleep(OUTLIVE_LINGER_MS);

                const writesBeforeTabB = ctx.Storage.SetCountForKey(fpA);
                const { result: tabB, calls } = await withWireSpy(ctx, async () => {
                    return rv.RunView(tabAParams);
                });
                await Sleep(300);

                Assert(tabB.Success, `Tab B RunView failed: ${tabB.ErrorMessage}`);
                AssertEqual(tabB.Results.length, tabA.Results.length, 'Tab B row count must match Tab A');
                AssertRowShape(tabB.Results[0], ['ID', 'Name', 'BaseView'], 'Tab B row shape from server cache');
                AssertEqual(callsMatching(calls, 'RunViewsWithCacheCheck').length, 1, 'Tab B must route through RunViewsWithCacheCheck');
                Assert(ctx.Storage.SetCountForKey(fpA) > writesBeforeTabB, 'Tab B must populate its own local cache slot');

                // 3. Tab B requests a DIFFERENT narrower field projection on the same server-warmed entity+filter
                const tabBNarrow = await rv.RunView(tabBParamsNarrower);
                Assert(tabBNarrow.Success, `Tab B narrower RunView failed: ${tabBNarrow.ErrorMessage}`);
                AssertEqual(tabBNarrow.Results.length, tabA.Results.length, 'Tab B narrower projection count must match');
                AssertRowShape(tabBNarrow.Results[0], ['ID', 'Name'], 'Tab B narrower projection must be projected to [ID, Name]');
            } finally {
                await LocalCacheManager.Instance.InvalidateRunViewResult(fpA);
                await LocalCacheManager.Instance.InvalidateRunViewResult(fpBNarrow);
            }
        }
    },
    {
        Id: 'client-cache.C20',
        Name: 'C20: pure row deletion (MAX(__mj_UpdatedAt) unchanged, rowCount decremented) invalidates stale client slot on F5',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const rv = new RunView();
            const prefix = `C20-del-${uuidv4()}`;
            const filter = `Name LIKE '${prefix}%'`;
            const params: RunViewParams = {
                EntityName: GROUP_ENTITY,
                ExtraFilter: filter,
                Fields: ['ID', 'Name', '__mj_UpdatedAt'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const fp = clientRunViewFingerprint(ctx, params);

            // Create olderRow first, then newerRow 50ms later so MAX(__mj_UpdatedAt) belongs to newerRow.
            // Deleting olderRow leaves MAX(__mj_UpdatedAt) unchanged while rowCount drops from 2 to 1!
            const olderRow = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
            olderRow.NewRecord();
            olderRow.Name = `${prefix}-older (mj-integration-test — safe to delete)`;
            olderRow.Status = 'Active';
            Assert(await olderRow.Save(), `olderRow save failed: ${olderRow.LatestResult?.CompleteMessage ?? ''}`);

            await Sleep(50);

            const newerRow = await md.GetEntityObject<MJActionCategoryEntity>(GROUP_ENTITY);
            newerRow.NewRecord();
            newerRow.Name = `${prefix}-newer (mj-integration-test — safe to delete)`;
            newerRow.Status = 'Active';
            Assert(await newerRow.Save(), `newerRow save failed: ${newerRow.LatestResult?.CompleteMessage ?? ''}`);

            let olderDeleted = false;
            try {
                const warm = await rv.RunView<{ ID: string; Name: string }>(params);
                Assert(warm.Success && warm.Results.length === 2, 'warm RunView must return both rows');
                await Sleep(300);

                const preDeleteSlot = await LocalCacheManager.Instance.GetRunViewResult(fp);
                Assert(preDeleteSlot !== null && preDeleteSlot.rowCount === 2, 'pre-delete slot must hold 2 rows');
                if (!preDeleteSlot) {
                    throw new Error('pre-delete slot missing');
                }

                // Delete olderRow on the server, then restore preDeleteSlot in the client's LocalCacheManager
                // to simulate an out-of-band delete that happened before the user pressed F5.
                Assert(await olderRow.Delete(), `olderRow delete failed: ${olderRow.LatestResult?.CompleteMessage ?? ''}`);
                olderDeleted = true;

                await LocalCacheManager.Instance.SetRunViewResult(
                    fp,
                    params,
                    preDeleteSlot.results,
                    preDeleteSlot.maxUpdatedAt,
                    preDeleteSlot.aggregateResults,
                    preDeleteSlot.totalRowCount,
                    ctx.Provider
                );

                await Sleep(OUTLIVE_LINGER_MS);
                const afterF5 = await rv.RunView<{ ID: string; Name: string }>(params);
                Assert(afterF5.Success, `post-delete F5 RunView failed: ${afterF5.ErrorMessage}`);
                AssertEqual(
                    afterF5.Results.length,
                    1,
                    'pure delete must be detected via rowCount mismatch even when MAX(__mj_UpdatedAt) did not advance'
                );
                AssertEqual(
                    afterF5.Results[0].ID.toUpperCase(),
                    newerRow.ID.toUpperCase(),
                    'surviving row must be newerRow'
                );
            } finally {
                if (!olderDeleted) {
                    await olderRow.Delete();
                }
                await newerRow.Delete();
                await LocalCacheManager.Instance.InvalidateRunViewResult(fp);
            }
        }
    },
    {
        Id: 'client-cache.C21',
        Name: 'C21: mixed-batch RunViewsWithCacheCheck (current + stale + cold miss in one round-trip) updates only non-current slots',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const paramsCurrent: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c21-current'),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const paramsStale: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c21-stale'),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const paramsCold: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c21-cold'),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };

            const fpCurrent = clientRunViewFingerprint(ctx, paramsCurrent);
            const fpStale = clientRunViewFingerprint(ctx, paramsStale);
            const fpCold = clientRunViewFingerprint(ctx, paramsCold);

            try {
                // Warm current and stale slots; leave cold uncached
                const warmRes = await rv.RunViews([paramsCurrent, paramsStale]);
                Assert(warmRes[0].Success && warmRes[1].Success, 'warming current and stale views must succeed');
                await Sleep(300);

                // Backdate paramsStale's local slot so the server classifies it as stale/differential
                await LocalCacheManager.Instance.SetRunViewResult(
                    fpStale,
                    paramsStale,
                    [],
                    '2000-01-01T00:00:00.000Z',
                    undefined,
                    0,
                    ctx.Provider
                );
                await LocalCacheManager.Instance.InvalidateRunViewResult(fpCold);

                await Sleep(OUTLIVE_LINGER_MS);
                const writesBeforeCurrent = ctx.Storage.SetCountForKey(fpCurrent);
                const writesBeforeStale = ctx.Storage.SetCountForKey(fpStale);
                const writesBeforeCold = ctx.Storage.SetCountForKey(fpCold);

                const { result: batchResults, calls } = await withWireSpy(ctx, async () => {
                    return rv.RunViews([paramsCurrent, paramsStale, paramsCold]);
                });
                await Sleep(300);

                AssertEqual(
                    callsMatching(calls, 'RunViewsWithCacheCheck').length,
                    1,
                    'all 3 mixed views must execute in a single RunViewsWithCacheCheck wire call'
                );
                Assert(
                    batchResults[0].Success && batchResults[1].Success && batchResults[2].Success,
                    'all 3 mixed batch views must succeed'
                );
                AssertEqual(
                    batchResults[0].Results.length,
                    warmRes[0].Results.length,
                    'current leg must return full cached rows'
                );
                AssertEqual(
                    batchResults[1].Results.length,
                    warmRes[1].Results.length,
                    'stale leg must refresh to full server rows'
                );
                AssertEqual(
                    batchResults[2].Results.length,
                    warmRes[0].Results.length,
                    'cold leg must fetch full server rows'
                );
                AssertEqual(
                    ctx.Storage.SetCountForKey(fpCurrent),
                    writesBeforeCurrent,
                    'current leg slot must NOT be rewritten'
                );
                Assert(
                    ctx.Storage.SetCountForKey(fpStale) > writesBeforeStale,
                    'stale leg slot must be updated in storage'
                );
                Assert(
                    ctx.Storage.SetCountForKey(fpCold) > writesBeforeCold,
                    'cold leg slot must be written to storage'
                );
            } finally {
                await LocalCacheManager.Instance.InvalidateRunViewResult(fpCurrent);
                await LocalCacheManager.Instance.InvalidateRunViewResult(fpStale);
                await LocalCacheManager.Instance.InvalidateRunViewResult(fpCold);
            }
        }
    },
    {
        Id: 'client-cache.C22',
        Name: 'C22: client monotonicity guard — future-stamped client cacheStatus evicts stale server cache and reconciles against SQL',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const params: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c22'),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const fp = clientRunViewFingerprint(ctx, params);

            try {
                const warm = await rv.RunView<{ ID: string; Name: string }>(params);
                Assert(warm.Success && warm.Results.length > 0, `warm failed: ${warm.ErrorMessage}`);
                await Sleep(300);

                // Inject a future timestamp (+60s) and an extra synthetic row into the client slot.
                // When sent to MJAPI, resolveFromServerCache triggers SmartCache MONOTONICITY-EVICT,
                // evicting the server cache slot and routing to SQL validation, which sees the true
                // SQL rowCount/maxUpdatedAt and heals the client slot back to the authoritative rows.
                const futureIso = new Date(Date.now() + 60_000).toISOString();
                const syntheticRows = [
                    ...warm.Results,
                    { ID: '00000000-0000-0000-0000-000000000022', Name: 'Synthetic Future Row' },
                ];
                await LocalCacheManager.Instance.SetRunViewResult(
                    fp,
                    params,
                    syntheticRows,
                    futureIso,
                    undefined,
                    syntheticRows.length,
                    ctx.Provider
                );

                await Sleep(OUTLIVE_LINGER_MS);
                const reconciled = await rv.RunView<{ ID: string; Name: string }>(params);
                await Sleep(300);

                Assert(reconciled.Success, `reconciled RunView failed: ${reconciled.ErrorMessage}`);
                AssertEqual(
                    reconciled.Results.length,
                    warm.Results.length,
                    'monotonicity guard + DB reconciliation must heal the client slot back to true SQL row count'
                );
                Assert(
                    !reconciled.Results.some(r => r.ID === '00000000-0000-0000-0000-000000000022'),
                    'synthetic row must be purged after SQL reconciliation'
                );
            } finally {
                await LocalCacheManager.Instance.InvalidateRunViewResult(fp);
            }
        }
    },
    {
        Id: 'client-cache.C23',
        Name: 'C23: schema-hash drift across F5 (CachedRunViewData.schemaHash mismatch) self-heals by evicting stale-schema slot',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const params: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c23'),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const fp = clientRunViewFingerprint(ctx, params);

            try {
                const warm = await rv.RunView<{ ID: string; Name: string }>(params);
                Assert(warm.Success && warm.Results.length > 0, `warm failed: ${warm.ErrorMessage}`);
                await Sleep(300);

                const stored = await ctx.Storage.GetItem<CachedRunViewData>(fp, 'RunViewCache');
                Assert(stored !== null && typeof stored.schemaHash === 'string' && stored.schemaHash.length > 0, 'warm slot must carry a schemaHash');
                if (!stored) {
                    throw new Error('warm slot missing from RunViewCache');
                }
                const validSchemaHash = stored.schemaHash;

                // Simulate a browser returning on F5 after a migration + CodeGen altered the entity's columns:
                // the IndexedDB entry has an older schemaHash and a sentinel row.
                const driftedPayload: CachedRunViewData = {
                    ...stored,
                    results: [{ ID: '00000000-0000-0000-0000-000000000023', Name: 'Stale Schema Row' }],
                    schemaHash: 'pre-migration-stale-schema-hash',
                    schemaStamp: '2000-01-01T00:00:00.000Z',
                };
                await ctx.Storage.SetItem(fp, driftedPayload, 'RunViewCache');

                await Sleep(OUTLIVE_LINGER_MS);
                const healed = await rv.RunView<{ ID: string; Name: string }>(params);
                await Sleep(300);

                Assert(healed.Success, `healed RunView failed: ${healed.ErrorMessage}`);
                AssertEqual(healed.Results.length, warm.Results.length, 'schema-drifted slot must be rejected and refetched in full');
                Assert(
                    !healed.Results.some(r => r.ID === '00000000-0000-0000-0000-000000000023'),
                    'stale schema sentinel row must not be served'
                );

                const rewritten = await ctx.Storage.GetItem<CachedRunViewData>(fp, 'RunViewCache');
                AssertEqual(rewritten?.schemaHash, validSchemaHash, 'healed slot must be rewritten under the current schemaHash');
            } finally {
                await LocalCacheManager.Instance.InvalidateRunViewResult(fp);
            }
        }
    },
    {
        Id: 'client-cache.C24',
        Name: 'C24: concurrent RunView calls within CoalesceWindowMs merge into a single RunViewsWithCacheCheck wire call',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const priorCoalesceMs = ProviderBase.CoalesceWindowMs;
            ProviderBase.CoalesceWindowMs = 25;

            const paramsA: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c24-a'),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const paramsB: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c24-b'),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const paramsC: RunViewParams = {
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c24-c'),
                Fields: ['ID', 'Name'],
                MaxRows: 5,
                ResultType: 'simple',
                CacheLocal: true,
            };

            try {
                const { result: [resA, resB, resC], calls } = await withWireSpy(ctx, async () => {
                    return Promise.all([
                        rv.RunView(paramsA),
                        rv.RunView(paramsB),
                        rv.RunView(paramsC),
                    ]);
                });
                await Sleep(300);

                Assert(resA.Success && resB.Success && resC.Success, 'all 3 coalesced RunView calls must succeed');
                Assert(resA.Results.length > 0 && resB.Results.length > 0 && resC.Results.length === 5, 'each caller must receive its own slice of results');
                AssertEqual(
                    callsMatching(calls, 'RunViewsWithCacheCheck').length,
                    1,
                    '3 concurrent RunView calls within CoalesceWindowMs must merge into 1 RunViewsWithCacheCheck wire call'
                );
            } finally {
                ProviderBase.CoalesceWindowMs = priorCoalesceMs;
                await LocalCacheManager.Instance.InvalidateRunViewResult(clientRunViewFingerprint(ctx, paramsA));
                await LocalCacheManager.Instance.InvalidateRunViewResult(clientRunViewFingerprint(ctx, paramsB));
                await LocalCacheManager.Instance.InvalidateRunViewResult(clientRunViewFingerprint(ctx, paramsC));
            }
        }
    },
    {
        Id: 'client-cache.C25',
        Name: 'C25: concurrent GetDatasetStatusByName calls coalesce into a single GetMultipleDatasetStatusByName wire call',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const { result: [statusA, statusB], calls } = await withWireSpy(ctx, async () => {
                // Enqueue a non-MJ_Metadata status request first so _datasetStatusQueue is non-empty when
                // the second request arrives within the 10ms coalescing window, batching both into one
                // GetMultipleDatasetStatusByName GraphQL query.
                return Promise.all([
                    ctx.Provider.GetDatasetStatusByName('Template_Metadata'),
                    ctx.Provider.GetDatasetStatusByName('MJ_Metadata'),
                ]);
            });

            Assert(statusB?.Success === true, 'MJ_Metadata status check in coalesced batch must succeed');
            AssertEqual(statusB.DatasetName, 'MJ_Metadata', 'second caller must receive MJ_Metadata status');
            AssertEqual(statusA?.DatasetName, 'Template_Metadata', 'first caller must receive Template_Metadata status');
            AssertEqual(
                callsMatching(calls, 'GetMultipleDatasetStatusByName').length,
                1,
                'concurrent dataset status checks must coalesce into a single GetMultipleDatasetStatusByName wire call'
            );
            AssertEqual(
                callsMatching(calls, 'query GetDatasetStatusByName(').length,
                0,
                'coalesced dataset status checks must NOT send individual GetDatasetStatusByName queries'
            );
        }
    },
    {
        Id: 'client-cache.C26',
        Name: 'C26: BypassCache=true bypasses a warm client slot and forces a fresh database read over the wire',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const rv = new RunView();
            const params: RunViewParams = {
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 'c26'),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                CacheLocal: true,
            };
            const fp = clientRunViewFingerprint(ctx, params);

            try {
                const warm = await rv.RunView<{ ID: string; Name: string }>(params);
                Assert(warm.Success && warm.Results.length > 0, `warm failed: ${warm.ErrorMessage}`);
                await Sleep(300);

                const slot = await LocalCacheManager.Instance.GetRunViewResult(fp);
                Assert(slot !== null, 'warm slot must exist');
                if (!slot) {
                    throw new Error('warm slot missing');
                }

                // Tamper with the first row's Name in the local slot while preserving rowCount and maxUpdatedAt
                // so a normal CacheLocal=true read validates as 'current' and returns the tampered local value.
                const tamperedRows = (slot.results as Array<{ ID: string; Name: string }>).map((r, idx) =>
                    idx === 0 ? { ...r, Name: 'TAMPERED_LOCAL_CACHE_NAME' } : { ...r }
                );
                await LocalCacheManager.Instance.SetRunViewResult(
                    fp,
                    params,
                    tamperedRows,
                    slot.maxUpdatedAt,
                    slot.aggregateResults,
                    slot.totalRowCount,
                    ctx.Provider
                );

                await Sleep(OUTLIVE_LINGER_MS);
                const fromWarmSlot = await rv.RunView<{ ID: string; Name: string }>(params);
                Assert(fromWarmSlot.Success, `warm-slot read failed: ${fromWarmSlot.ErrorMessage}`);
                AssertEqual(
                    fromWarmSlot.Results[0].Name,
                    'TAMPERED_LOCAL_CACHE_NAME',
                    'precondition: normal CacheLocal read serves the local slot when maxUpdatedAt and rowCount match'
                );

                await Sleep(OUTLIVE_LINGER_MS);
                const bypassed = await rv.RunView<{ ID: string; Name: string }>({
                    ...params,
                    BypassCache: true,
                });
                Assert(bypassed.Success, `BypassCache read failed: ${bypassed.ErrorMessage}`);
                AssertEqual(
                    bypassed.Results[0].Name,
                    warm.Results[0].Name,
                    'BypassCache: true must bypass the local slot and return fresh authoritative data from the server'
                );
            } finally {
                await LocalCacheManager.Instance.InvalidateRunViewResult(fp);
            }
        }
    }
];

for (const check of ClientCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// Installs the shortened dedup linger window for this bundle only, and puts the shipped value
// back afterwards: `ProviderBase.DedupLingerMs` is process-global, and the bundles that follow
// must see shipped behaviour. The prior value is captured rather than assumed to be 5000, so a
// harness that already changed it is not silently overwritten. Mirrors the runquery-cache
// lifecycle, which does the same for QueryEngine's result-deletion window.
let priorDedupLingerMs: number | undefined;

IntegrationCheckRegistry.Instance.RegisterLifecycle('client-cache', {
    Setup: async () => {
        priorDedupLingerMs = ProviderBase.DedupLingerMs;
        ProviderBase.DedupLingerMs = BUNDLE_DEDUP_LINGER_MS;
    },
    Teardown: async () => {
        if (priorDedupLingerMs !== undefined) {
            ProviderBase.DedupLingerMs = priorDedupLingerMs;
            priorDedupLingerMs = undefined;
        }
    }
});
