/**
 * client-cache.checks.ts — the 'client-cache' bundle (C1–C12).
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
import { RunView, RunQuery, BaseEntity, Metadata } from '@memberjunction/core';
import type { MJUserSettingEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, AssertRowShape, RowKeys } from '../test-runner';
import { UniqueFilter } from '../instrumented-cache';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck } from '../check';

const ENTITY = 'MJ: Entities';
const SMALL_ENTITY = 'MJ: Query Categories';

function Sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
            await Sleep(5200);
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

            await Sleep(5200); // outlive the dedup linger window
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

            await Sleep(5200); // outlive linger; second call validates the slot and re-materializes
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
            Assert(count.TotalRowCount > 100, `count_only TotalRowCount expected 100+, got ${count.TotalRowCount}`);
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
                await Sleep(5500); // outlive linger so the next call truly revalidates the slot
                const after = await rv.RunView(makeParams());
                Assert(after.Success, `post-save query failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, 1, 'slot revalidation must surface the saved row');
                AssertRowShape(after.Results[0], ['ID', 'Setting'], 'revalidated rows must match the slot shape');
            } finally {
                Assert(await setting.Delete(), `client-side Delete must succeed: ${setting.LatestResult?.CompleteMessage ?? ''}`);
            }
            await Sleep(5500);
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
            const queries = await rv.RunView({
                EntityName: 'MJ: Queries',
                ExtraFilter: "Status = 'Approved' AND SQL IS NOT NULL",
                Fields: ['ID', 'Name'],
                MaxRows: 1,
                ResultType: 'simple'
            });
            Assert(queries.Success && queries.Results.length === 1, 'need at least one approved query in the DB');
            const queryId = String(queries.Results[0].ID);

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
            // 'MJ: Audit Logs' has TrustServerCacheCompletely=false: the server refuses to
            // cache it (raw-SQL inserts make event invalidation untrustworthy). Because the
            // entity is cache-INELIGIBLE, Fields are never widened — so the response only
            // carries a maxUpdatedAt stamp when the caller requests __mj_UpdatedAt. The
            // client write gate correctly refuses to store unvalidatable (stamp-less) slots.

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

            await Sleep(5200); // outlive linger so the second call truly revalidates
            const second = await rv.RunView({ ...params });
            Assert(second.Success, `second failed: ${second.ErrorMessage}`);
            AssertEqual(second.Results.length, first.Results.length, 'revalidated results must match');
        }
    }
];

for (const check of ClientCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
