/**
 * server-cache.checks.ts — the 'server-cache' bundle (S1–S26).
 *
 * PORTED VERBATIM from packages/MJServer/integration-test-scripts/server-cache-tests.ts.
 * Each check's body, its UniqueFilter tags (S1/S2/S3 share 's1'), and its display
 * Name are unchanged from the original `suite.Test(...)` calls — only the
 * registration wrapper differs (IntegrationCheckRegistry.Register instead of
 * suite.Test). Both the IntegrationTestDriver and the transitional tsx script
 * resolve these from the one registry (single source of truth).
 *
 * The three mutation checks (S17/S23/S24) carry `RequiresMutation: true` instead of
 * the original `if (process.env.RUN_MUTATION_TESTS === '1')` registration gate; the
 * driver/script filter them out unless the run opts into mutation. Checks are
 * registered in numeric order; order is load-bearing only for the S1→S2→S3 shared
 * 's1' slot, which numeric order preserves.
 */
import { RunView, BaseEntity, CompositeKey, Metadata, EntityPermissionType } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type { MJEntityEntity, MJUserSettingEntity, MJUserViewEntity, MJQueryEntity, MJQueryCategoryEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Assert, AssertEqual, AssertRowShape, AssertKeysInclude, RowKeys } from '../test-runner';
import { UniqueFilter } from '../instrumented-cache';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck } from '../check';

const ENTITY = 'MJ: Entities';
const SMALL_ENTITY = 'MJ: Query Categories';

/** The ordered server-cache bundle. Numeric order is intentional and load-bearing. */
export const ServerCacheChecks: NamedCheck[] = [
    {
        Id: 'server-cache.S1',
        Name: 'S1: cache MISS with narrow Fields returns ONLY the requested columns',
        Fn: async (ctx): Promise<void> => {
            ctx.Storage.ResetCounts();
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 's1'),
                Fields: ['Name', 'SchemaName'],
                ResultType: 'simple'
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            Assert(result.Results.length > 100, `expected 100+ entities, got ${result.Results.length}`);
            AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'miss-path row shape (requested fields + PK)');
            Assert(ctx.Storage.SetCount('RunViewCache') > 0, 'expected a RunViewCache write on miss (SetItem not called)');
        }
    },
    {
        Id: 'server-cache.S2',
        Name: 'S2: subsequent HIT with the same Fields returns the identical shape (miss/hit symmetry)',
        Fn: async (ctx): Promise<void> => {
            const params = {
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 's1'), // same fingerprint as S1
                Fields: ['Name', 'SchemaName'],
                ResultType: 'simple' as const
            };
            const setsBefore = ctx.Storage.SetCount('RunViewCache');
            const rv = new RunView();
            const result = await rv.RunView(params, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'hit-path row shape (requested fields + PK)');
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), setsBefore, 'hit must not rewrite the cache');
            AssertEqual(result.ExecutionTime, 0, 'cache-served results report ExecutionTime 0');
        }
    },
    {
        Id: 'server-cache.S3',
        Name: 'S3: HIT with a DIFFERENT field subset is served from the same superset entry',
        Fn: async (ctx): Promise<void> => {
            const setsBefore = ctx.Storage.SetCount('RunViewCache');
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 's1'), // same fingerprint as S1/S2
                Fields: ['ID', 'Name', 'Description', 'BaseView'],
                ResultType: 'simple'
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            AssertRowShape(result.Results[0], ['ID', 'Name', 'Description', 'BaseView'], 'wider-subset hit shape');
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), setsBefore, 'superset entry serves any subset without a rewrite');
        }
    },
    {
        Id: 'server-cache.S4',
        Name: 'S4: no Fields requested returns the full entity width (pass-through)',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 's4'),
                ResultType: 'simple'
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            const keyCount = RowKeys(result.Results[0]).length;
            Assert(keyCount > 20, `expected full-width rows (20+ columns), got ${keyCount}`);
        }
    },
    {
        Id: 'server-cache.S5',
        Name: 'S5: Fields matching is case-insensitive; original column casing is preserved',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 's5'),
                Fields: ['name', 'schemaname'],
                ResultType: 'simple'
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'case-insensitive projection (requested fields + PK)');
            Assert(Object.keys(result.Results[0]).includes('Name'), 'original casing (Name) must be preserved');
        }
    },
    {
        Id: 'server-cache.S6',
        Name: 'S6: entity_object results are full BaseEntity instances even when a simple superset is cached',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 's6');
            // Warm the cache with a narrow simple query first
            const warm = await rv.RunView({ EntityName: SMALL_ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }, ctx.User);
            Assert(warm.Success, `warm failed: ${warm.ErrorMessage}`);
            // Now request entity objects for the same fingerprint
            const result = await rv.RunView<BaseEntity>({
                EntityName: SMALL_ENTITY,
                ExtraFilter: filter,
                ResultType: 'entity_object'
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            Assert(result.Results.length > 0, 'expected at least one query category');
            const first = result.Results[0];
            Assert(first instanceof BaseEntity, 'entity_object results must be BaseEntity instances');
            const all = first.GetAll();
            AssertKeysInclude(all, ['ID', 'Name'], 'entity object must carry full field set');
        }
    },
    {
        Id: 'server-cache.S7',
        Name: 'S7: BypassCache skips the cache entirely and respects narrow Fields end-to-end',
        Fn: async (ctx): Promise<void> => {
            const setsBefore = ctx.Storage.SetCount('RunViewCache');
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 's7'),
                Fields: ['Name'],
                ResultType: 'simple',
                BypassCache: true
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            // The direct (non-cached) SQL path always includes the primary key alongside
            // explicitly requested Fields — so BypassCache narrow queries carry ID too.
            // (The cached path projects to EXACTLY the requested fields; see README.)
            AssertRowShape(result.Results[0], ['ID', 'Name'], 'BypassCache narrow shape (requested fields + PK)');
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), setsBefore, 'BypassCache must not write the cache');
        }
    },
    {
        Id: 'server-cache.S8',
        Name: 'S8: TotalRowCount parity between cache miss and cache hit',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const params = {
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 's8'),
                Fields: ['Name'],
                ResultType: 'simple' as const
            };
            const miss = await rv.RunView({ ...params }, ctx.User);
            Assert(miss.Success, `miss failed: ${miss.ErrorMessage}`);
            const hit = await rv.RunView({ ...params }, ctx.User);
            Assert(hit.Success, `hit failed: ${hit.ErrorMessage}`);
            AssertEqual(hit.TotalRowCount, miss.TotalRowCount, 'TotalRowCount must be preserved through the cache');
            AssertEqual(hit.Results.length, miss.Results.length, 'row counts must match across miss/hit');
        }
    },
    {
        Id: 'server-cache.S9',
        Name: 'S9: batch RunViews projects each result to its OWN param Fields',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const results = await rv.RunViews([
                { EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's9a'), Fields: ['Name', 'SchemaName'], ResultType: 'simple' },
                { EntityName: SMALL_ENTITY, ExtraFilter: UniqueFilter('Name', 's9b'), Fields: ['ID', 'Name'], ResultType: 'simple' }
            ], ctx.User);
            AssertEqual(results.length, 2, 'two results expected');
            Assert(results[0].Success && results[1].Success, 'both batch results must succeed');
            AssertRowShape(results[0].Results[0], ['ID', 'Name', 'SchemaName'], 'batch index 0 shape');
            AssertRowShape(results[1].Results[0], ['ID', 'Name'], 'batch index 1 shape');
        }
    },
    {
        Id: 'server-cache.S10',
        Name: 'S10: mixed HIT+MISS batch — warm index projected from cache, cold index projected from DB',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const warmFilter = UniqueFilter('Name', 's10-warm');
            const warm = await rv.RunView({ EntityName: ENTITY, ExtraFilter: warmFilter, Fields: ['Name'], ResultType: 'simple' }, ctx.User);
            Assert(warm.Success, `warm failed: ${warm.ErrorMessage}`);
            const results = await rv.RunViews([
                { EntityName: ENTITY, ExtraFilter: warmFilter, Fields: ['Name', 'Description'], ResultType: 'simple' }, // HIT, wider subset
                { EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's10-cold'), Fields: ['Name', 'BaseTable'], ResultType: 'simple' } // MISS
            ], ctx.User);
            Assert(results[0].Success && results[1].Success, 'both batch results must succeed');
            AssertRowShape(results[0].Results[0], ['ID', 'Name', 'Description'], 'hit index shape (from cached superset)');
            AssertRowShape(results[1].Results[0], ['ID', 'Name', 'BaseTable'], 'miss index shape (projected from DB result)');
        }
    },
    {
        Id: 'server-cache.S11',
        Name: 'S11: linger-window callers with DIFFERENT Fields each get their own shape',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 's11');
            const a = await rv.RunViews([{ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }], ctx.User);
            // Within the 5s linger window — would have shared A's slot under the old Fields-less dedup key
            const b = await rv.RunViews([{ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name', 'Description'], ResultType: 'simple' }], ctx.User);
            Assert(a[0].Success && b[0].Success, 'both calls must succeed');
            AssertRowShape(a[0].Results[0], ['ID', 'Name'], 'first caller shape');
            AssertRowShape(b[0].Results[0], ['ID', 'Name', 'Description'], 'second caller must NOT inherit the first caller\'s narrower shape');
        }
    },
    {
        Id: 'server-cache.S12',
        Name: 'S12: linger-window callers with DIFFERENT ResultType each get their own representation',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 's12');
            const simple = await rv.RunViews([{ EntityName: SMALL_ENTITY, ExtraFilter: filter, ResultType: 'simple' }], ctx.User);
            const entityObj = await rv.RunViews([{ EntityName: SMALL_ENTITY, ExtraFilter: filter, ResultType: 'entity_object' }], ctx.User);
            Assert(simple[0].Success && entityObj[0].Success, 'both calls must succeed');
            Assert(!(simple[0].Results[0] instanceof BaseEntity), 'simple caller must receive plain rows');
            Assert(entityObj[0].Results[0] instanceof BaseEntity, 'entity_object caller must receive BaseEntity instances');
        }
    },
    {
        Id: 'server-cache.S13',
        Name: 'S13: identical repeat within the linger window is served without touching storage',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            // NOTE: the pipeline mutates params objects in place (Fields gets widened on
            // cacheable calls) — every call must construct FRESH param objects.
            const makeParams = () => [{ EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's13'), Fields: ['Name'], ResultType: 'simple' as const }];
            const a = await rv.RunViews(makeParams(), ctx.User);
            Assert(a[0].Success, `first call failed: ${a[0].ErrorMessage}`);
            ctx.Storage.ResetCounts();
            const b = await rv.RunViews(makeParams(), ctx.User);
            Assert(b[0].Success, `second call failed: ${b[0].ErrorMessage}`);
            AssertRowShape(b[0].Results[0], ['ID', 'Name'], 'linger-served shape');
            AssertEqual(ctx.Storage.GetCount('RunViewCache') + ctx.Storage.SetCount('RunViewCache'), 0,
                'linger hit must be served from the in-flight dedup slot, not from cache storage');
        }
    },
    {
        Id: 'server-cache.S14',
        Name: 'S14: different ExtraFilter values produce independent cache entries',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const a = await rv.RunView({
                EntityName: ENTITY, ExtraFilter: `Name LIKE 'MJ: A%' AND ${UniqueFilter('Name', 's14')}`,
                Fields: ['Name'], ResultType: 'simple'
            }, ctx.User);
            const b = await rv.RunView({
                EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's14'),
                Fields: ['Name'], ResultType: 'simple'
            }, ctx.User);
            Assert(a.Success && b.Success, 'both calls must succeed');
            Assert(a.Results.length > 0, 'expected at least one entity starting with MJ: A');
            Assert(a.Results.length < b.Results.length, 'narrower filter must return fewer rows than the all-rows filter');
            Assert(a.Results.every(r => String(r.Name).toUpperCase().startsWith('MJ: A')), 'filtered entry must only contain MJ: A-names');
        }
    },
    {
        Id: 'server-cache.S15',
        Name: 'S15: OrderBy is honored on both miss and hit',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const params = {
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 's15'),
                OrderBy: 'Name ASC',
                Fields: ['Name'],
                ResultType: 'simple' as const
            };
            const isSorted = (rows: Record<string, unknown>[]): boolean =>
                rows.every((r, i) => i === 0 || String(rows[i - 1].Name).localeCompare(String(r.Name)) <= 0);
            const miss = await rv.RunView(params, ctx.User);
            Assert(miss.Success && isSorted(miss.Results), 'miss-path results must be sorted by Name');
            const hit = await rv.RunView(params, ctx.User);
            Assert(hit.Success && isSorted(hit.Results), 'hit-path results must be sorted by Name');
            AssertEqual(hit.Results.length, miss.Results.length, 'hit and miss row counts must match');
        }
    },
    {
        Id: 'server-cache.S16',
        Name: 'S16: MaxRows limits rows and fingerprints separately from the unlimited query',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 's16');
            const limited = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], MaxRows: 10, ResultType: 'simple' }, ctx.User);
            Assert(limited.Success, `limited failed: ${limited.ErrorMessage}`);
            AssertEqual(limited.Results.length, 10, 'MaxRows 10 must return exactly 10 rows');
            const unlimited = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }, ctx.User);
            Assert(unlimited.Success && unlimited.Results.length > 10, 'unlimited query must not be served from the MaxRows-10 entry');
        }
    },
    {
        Id: 'server-cache.S17',
        Name: 'S17 (mutation): save invalidates the filtered cache entry; delete removes the row again',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const settingName = `mj.integrationtest.cache.${Date.now()}`;
            const filter = `UserID = '${ctx.User.ID}' AND Setting = '${settingName}'`;
            const params = { EntityName: 'MJ: User Settings', ExtraFilter: filter, Fields: ['ID', 'Setting', 'Value'], ResultType: 'simple' as const };

            const before = await rv.RunView(params, ctx.User);
            Assert(before.Success, `pre-query failed: ${before.ErrorMessage}`);
            AssertEqual(before.Results.length, 0, 'setting must not exist yet');

            const setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', ctx.User);
            setting.UserID = ctx.User.ID;
            setting.Setting = settingName;
            setting.Value = 'integration-test';
            const saved = await setting.Save();
            Assert(saved, `Save failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
            // BaseEntity-event-driven cache invalidation is fire-and-forget; under load
            // (e.g. deferred background engine startup) it can take a moment to land
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
                const after = await rv.RunView(params, ctx.User);
                Assert(after.Success, `post-save query failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, 1, 'save must invalidate the cached (empty) filtered entry');
                AssertEqual(String(after.Results[0].Setting), settingName, 'returned row must be the saved setting');
            } finally {
                const deleted = await setting.Delete();
                Assert(deleted, `Delete failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }

            // Delete-driven invalidation is fire-and-forget too
            await new Promise(resolve => setTimeout(resolve, 2000));
            const final = await rv.RunView(params, ctx.User);
            Assert(final.Success, `post-delete query failed: ${final.ErrorMessage}`);
            AssertEqual(final.Results.length, 0, 'delete must invalidate the cache so the row disappears');
        }
    },
    {
        Id: 'server-cache.S18',
        Name: 'S18: AfterKey keyset pages never touch the cache and never poison the entity+filter slot',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 's18');
            // Page 1: a normal MaxRows query (cacheable, fingerprints separately via MaxRows)
            const page1 = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, OrderBy: 'ID ASC', Fields: ['ID', 'Name'], MaxRows: 50, ResultType: 'simple' }, ctx.User);
            Assert(page1.Success && page1.Results.length === 50, `page1 expected 50 rows, got ${page1.Results.length}`);
            const lastID = String(page1.Results[page1.Results.length - 1].ID);

            // Page 2: keyset — must not read OR write the cache
            const setsBefore = ctx.Storage.SetCount('RunViewCache');
            const page2 = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, OrderBy: 'ID ASC', Fields: ['ID', 'Name'], MaxRows: 50, AfterKey: CompositeKey.FromID(lastID), ResultType: 'simple' }, ctx.User);
            Assert(page2.Success && page2.Results.length === 50, `page2 expected 50 rows, got ${page2?.Results?.length}`);
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), setsBefore, 'keyset page must not write the cache');
            const page1IDs = new Set(page1.Results.map(r => String(r.ID).toLowerCase()));
            Assert(page2.Results.every(r => !page1IDs.has(String(r.ID).toLowerCase())), 'keyset pages must not overlap');

            // The entity+filter slot must NOT have been poisoned by the keyset page:
            // an unlimited full-width query must return all rows, all columns
            const full = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, ResultType: 'simple' }, ctx.User);
            Assert(full.Success && full.Results.length > 100, `full query must see all rows, got ${full.Results.length}`);
            Assert(RowKeys(full.Results[0]).length > 20, 'full query must see all columns (no keyset-page poisoning)');
        }
    },
    {
        Id: 'server-cache.S19',
        Name: 'S19: count_only returns TotalRowCount with zero rows and never poisons the row cache',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 's19');
            const count = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, ResultType: 'count_only' }, ctx.User);
            Assert(count.Success, `count_only failed: ${count.ErrorMessage}`);
            AssertEqual(count.Results.length, 0, 'count_only must return no rows');
            Assert(count.TotalRowCount > 100, `count_only TotalRowCount expected 100+, got ${count.TotalRowCount}`);

            // The same entity+filter must still serve full rows afterwards (no empty-poisoning)
            const rows = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }, ctx.User);
            Assert(rows.Success && rows.Results.length === count.TotalRowCount, 'row query after count_only must see all rows');
        }
    },
    {
        Id: 'server-cache.S20',
        Name: 'S20: BypassCache poisoning regression — full-width query after a narrow bypass stays full-width',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const filter = UniqueFilter('Name', 's20');
            const bypass = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple', BypassCache: true }, ctx.User);
            Assert(bypass.Success, `bypass failed: ${bypass.ErrorMessage}`);
            const full = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, ResultType: 'simple' }, ctx.User);
            Assert(full.Success, `full failed: ${full.ErrorMessage}`);
            Assert(RowKeys(full.Results[0]).length > 20,
                `full-width query must not be served from a bypass-written narrow entry (got ${RowKeys(full.Results[0]).length} columns)`);
        }
    },
    {
        Id: 'server-cache.S21',
        Name: 'S21: entity_object ignores narrow Fields — instances always carry the full field set',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const result = await rv.RunView<BaseEntity>({
                EntityName: SMALL_ENTITY,
                ExtraFilter: UniqueFilter('Name', 's21'),
                Fields: ['Name'],
                ResultType: 'entity_object'
            }, ctx.User);
            Assert(result.Success && result.Results.length > 0, `RunView failed: ${result.ErrorMessage}`);
            const all = result.Results[0].GetAll();
            AssertKeysInclude(all, ['ID', 'Name'], 'entity object must carry full fields despite narrow request');
        }
    },
    {
        Id: 'server-cache.S22',
        Name: 'S22: concurrent identical RunViews share one execution (in-flight dedup)',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const makeParams = () => [{ EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's22'), Fields: ['Name'], ResultType: 'simple' as const }];
            ctx.Storage.ResetCounts();
            const results = await Promise.all([1, 2, 3, 4, 5].map(() => rv.RunViews(makeParams(), ctx.User)));
            Assert(results.every(r => r[0].Success), 'all concurrent calls must succeed');
            const lengths = new Set(results.map(r => r[0].Results.length));
            AssertEqual(lengths.size, 1, 'all concurrent callers must see the same row count');
            Assert(ctx.Storage.SetCount('RunViewCache') <= 1, `5 concurrent identical calls must produce at most one cache write, got ${ctx.Storage.SetCount('RunViewCache')}`);
        }
    },
    {
        Id: 'server-cache.S23',
        Name: 'S23 (mutation): unfiltered auto-maintained cache upserts on save and removes on delete IN PLACE',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const makeParams = () => ({ EntityName: 'MJ: User Settings', Fields: ['ID', 'Setting'], ResultType: 'simple' as const });
            const baseline = await rv.RunView(makeParams(), ctx.User);
            Assert(baseline.Success, `baseline failed: ${baseline.ErrorMessage}`);
            const baselineCount = baseline.Results.length;

            const setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', ctx.User);
            setting.UserID = ctx.User.ID;
            setting.Setting = `mj.integrationtest.upsert.${Date.now()}`;
            setting.Value = 'integration-test';
            Assert(await setting.Save(), `Save failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const after = await rv.RunView(makeParams(), ctx.User);
                Assert(after.Success, `post-save failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, baselineCount + 1, 'unfiltered cache must upsert the new row in place');
                AssertEqual(after.ExecutionTime, 0, 'post-save read must still be served from cache (in-place upsert, no DB)');
            } finally {
                Assert(await setting.Delete(), `Delete failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            const final2 = await rv.RunView(makeParams(), ctx.User);
            Assert(final2.Success, `post-delete failed: ${final2.ErrorMessage}`);
            AssertEqual(final2.Results.length, baselineCount, 'unfiltered cache must remove the deleted row in place');
            AssertEqual(final2.ExecutionTime, 0, 'post-delete read must still be served from cache (in-place removal, no DB)');
        }
    },
    {
        Id: 'server-cache.S24',
        Name: 'S24 (mutation): AllowCaching=false entities never touch the cache — flipped live and restored',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const entityInfo = md.EntityByName(SMALL_ENTITY);
            Assert(!!entityInfo, `${SMALL_ENTITY} must exist`);
            const entityRecord = await md.GetEntityObject<MJEntityEntity>('MJ: Entities', ctx.User);
            Assert(await entityRecord.Load(entityInfo!.ID), 'entity record must load');
            Assert(entityRecord.AllowCaching === true, 'precondition: entity allows caching');

            entityRecord.AllowCaching = false;
            Assert(await entityRecord.Save(), `flip save failed: ${entityRecord.LatestResult?.CompleteMessage}`);
            try {
                await Metadata.Provider.Refresh(); // provider must see the new flag // global-provider-ok: integration test script — single-provider process by design
                Assert(md.EntityByName(SMALL_ENTITY)?.AllowCaching === false, 'metadata must reflect AllowCaching=false');

                ctx.Storage.ResetCounts();
                const first = await rv.RunView({
                    EntityName: SMALL_ENTITY,
                    ExtraFilter: UniqueFilter('Name', 's24'),
                    Fields: ['Name'],
                    ResultType: 'simple'
                }, ctx.User);
                Assert(first.Success && first.Results.length > 0, `first failed: ${first.ErrorMessage}`);
                // Direct (non-cached) path: requested fields + PK, no widening
                AssertRowShape(first.Results[0], ['ID', 'Name'], 'no-cache entity shape (requested + PK, never widened)');
                AssertEqual(ctx.Storage.SetCount('RunViewCache'), 0, 'no-cache entity must never write the cache');
                AssertEqual(ctx.Storage.GetCount('RunViewCache'), 0, 'no-cache entity must never read the cache');

                const second = await rv.RunView({
                    EntityName: SMALL_ENTITY,
                    ExtraFilter: UniqueFilter('Name', 's24'),
                    Fields: ['Name'],
                    ResultType: 'simple'
                }, ctx.User);
                Assert(second.Success, `second failed: ${second.ErrorMessage}`);
                AssertEqual(ctx.Storage.SetCount('RunViewCache') + ctx.Storage.GetCount('RunViewCache'), 0,
                    'repeat queries on a no-cache entity must keep hitting the DB, never the cache');
            } finally {
                entityRecord.AllowCaching = true;
                Assert(await entityRecord.Save(), `restore save failed: ${entityRecord.LatestResult?.CompleteMessage}`);
                await Metadata.Provider.Refresh(); // global-provider-ok: integration test script — single-provider process by design
            }
            Assert(md.EntityByName(SMALL_ENTITY)?.AllowCaching === true, 'flag must be restored');
        }
    },
    {
        Id: 'server-cache.S25',
        Name: 'S25: TrustServerCacheCompletely=false entities never touch the server cache (real metadata, read-only)',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            // 'MJ: Audit Logs' has AllowCaching=true but TrustServerCacheCompletely=false in
            // this DB (rows arrive via raw SQL, so event-driven invalidation cannot be
            // trusted) — a DIFFERENT eligibility branch than AllowCaching (S24).
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const info = md.EntityByName('MJ: Audit Logs');
            Assert(!!info, 'MJ: Audit Logs must exist');
            Assert(info!.AllowCaching === true && info!.TrustServerCacheCompletely === false,
                `precondition: AllowCaching=true + TrustServerCacheCompletely=false (got ${info!.AllowCaching}/${info!.TrustServerCacheCompletely})`);

            ctx.Storage.ResetCounts();
            const first = await rv.RunView({
                EntityName: 'MJ: Audit Logs',
                ExtraFilter: "'tag-s25' <> 'never'",
                Fields: ['ID'],
                MaxRows: 5,
                ResultType: 'simple'
            }, ctx.User);
            Assert(first.Success, `first failed: ${first.ErrorMessage}`);
            const second = await rv.RunView({
                EntityName: 'MJ: Audit Logs',
                ExtraFilter: "'tag-s25' <> 'never'",
                Fields: ['ID'],
                MaxRows: 5,
                ResultType: 'simple'
            }, ctx.User);
            Assert(second.Success, `second failed: ${second.ErrorMessage}`);
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), 0, 'Trust=0 entity must never write the server cache');
            AssertEqual(ctx.Storage.GetCount('RunViewCache'), 0, 'Trust=0 entity must never read the server cache');
        }
    },
    {
        Id: 'server-cache.S26',
        Name: 'S26: MJ: Record Changes is hardcoded cache-exempt (rows arrive via raw SQL)',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            ctx.Storage.ResetCounts();
            const result = await rv.RunView({
                EntityName: 'MJ: Record Changes',
                ExtraFilter: "'tag-s26' <> 'never'",
                Fields: ['ID'],
                MaxRows: 5,
                ResultType: 'simple'
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            AssertEqual(ctx.Storage.SetCount('RunViewCache') + ctx.Storage.GetCount('RunViewCache'), 0,
                'Record Changes must never touch the cache regardless of its flags');
        }
    },
    {
        Id: 'server-cache.S27',
        Name: 'S27: OrderBy is part of the cache identity — ASC and DESC on the same entity+filter never cross-serve',
        Fn: async (ctx): Promise<void> => {
            // S15 exercises ONE OrderBy across miss+hit; nothing yet proves two DIFFERENT
            // OrderBy values keep independent slots. OrderBy IS in the fingerprint, so a DESC
            // read must not be served the ASC-ordered cached rows.
            const rv = new RunView();
            const filter = UniqueFilter('Name', 's27');
            const asc = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, OrderBy: 'Name ASC', Fields: ['Name'], ResultType: 'simple' }, ctx.User);
            Assert(asc.Success, `asc failed: ${asc.ErrorMessage}`);
            const desc = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, OrderBy: 'Name DESC', Fields: ['Name'], ResultType: 'simple' }, ctx.User);
            Assert(desc.Success, `desc failed: ${desc.ErrorMessage}`);
            AssertEqual(desc.Results.length, asc.Results.length, 'ASC and DESC must return the same row set');
            Assert(desc.Results.length > 1, 'need 2+ rows to prove ordering');
            const isDescending = desc.Results.every((r, i) => i === 0 || String(desc.Results[i - 1].Name).localeCompare(String(r.Name)) >= 0);
            Assert(isDescending, 'OrderBy cross-serve: DESC results were not descending — likely served the ASC-ordered slot');
        }
    },
    {
        Id: 'server-cache.S28',
        Name: 'S28: IgnoreMaxRows returns all rows (skips the entity UserViewMaxRows cap) even when the capped query was cached first',
        Fn: async (ctx): Promise<void> => {
            // IgnoreMaxRows skips the entity-level UserViewMaxRows TOP cap, so a request with
            // IgnoreMaxRows must return all matching rows regardless of whether the capped
            // (default) query for the same entity was cached first. Discover a capped entity
            // whose true row count exceeds its cap; skip-pass (degrade gracefully) when none
            // exists on this DB.
            const rv = new RunView();
            const capped = await rv.RunView<{ Name: string; UserViewMaxRows: number }>({
                EntityName: 'MJ: Entities',
                ExtraFilter: 'UserViewMaxRows > 0',
                Fields: ['Name', 'UserViewMaxRows'],
                ResultType: 'simple'
            }, ctx.User);
            Assert(capped.Success, `capped-entity discovery failed: ${capped.ErrorMessage}`);
            if (capped.Results.length === 0) {
                console.warn('  ⚠ S28 SKIPPED — no entity has UserViewMaxRows > 0 on this DB (collision is latent here).');
                return;
            }
            // One batch of count_only (BypassCache → true DB counts, no cache interaction).
            const counts = await rv.RunViews(
                capped.Results.map(e => ({ EntityName: e.Name, ResultType: 'count_only' as const, BypassCache: true })),
                ctx.User
            );
            const idx = counts.findIndex((c, i) => c.Success && c.TotalRowCount > capped.Results[i].UserViewMaxRows);
            if (idx < 0) {
                console.warn('  ⚠ S28 SKIPPED — no capped entity exceeds its UserViewMaxRows on this DB (divergence not observable).');
                return;
            }
            const target = capped.Results[idx];
            const cap = target.UserViewMaxRows;

            // Warm the shared slot with the capped query (returns TOP <cap> rows).
            const cappedRun = await rv.RunView({ EntityName: target.Name, ResultType: 'simple' }, ctx.User);
            Assert(cappedRun.Success, `capped run failed: ${cappedRun.ErrorMessage}`);
            // IgnoreMaxRows:true — SAME fingerprint ⇒ must NOT be served the capped slot.
            const ignoreRun = await rv.RunView({ EntityName: target.Name, IgnoreMaxRows: true, ResultType: 'simple' }, ctx.User);
            Assert(ignoreRun.Success, `IgnoreMaxRows run failed: ${ignoreRun.ErrorMessage}`);
            Assert(ignoreRun.Results.length > cap,
                `IgnoreMaxRows on '${target.Name}' (true count ${counts[idx].TotalRowCount}, cap ${cap}) returned only ` +
                `${ignoreRun.Results.length} rows`);
        }
    },
    {
        Id: 'server-cache.S29',
        Name: 'S29 (mutation): a stored view honors its own WhereClause through the cache (a filtered view and the plain entity query do not cross-serve)',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            // A stored view carries its own WhereClause. This check verifies that after the
            // cache is warmed with a plain unfiltered read of the entity, running a filtered
            // stored view still returns only rows matching the view's WhereClause. Self-contained:
            // creates and deletes a throwaway view, so no real data is touched.
            const md = new Metadata(); // global-provider-ok: integration test — single-provider process by design
            const rv = new RunView();
            const filter = "Name LIKE 'MJ: A%'";

            // Portability guard: the filter must discriminate on this DB (some, but not all, rows match).
            const matching = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, ResultType: 'count_only', BypassCache: true }, ctx.User);
            const all = await rv.RunView({ EntityName: ENTITY, ResultType: 'count_only', BypassCache: true }, ctx.User);
            Assert(matching.Success && all.Success, 'count probes must succeed');
            if (matching.TotalRowCount === 0 || matching.TotalRowCount >= all.TotalRowCount) {
                console.warn(`  ⚠ S29 SKIPPED — "${filter}" does not discriminate on this DB (${matching.TotalRowCount}/${all.TotalRowCount}).`);
                return;
            }

            const entityInfo = md.EntityByName(ENTITY);
            Assert(!!entityInfo, `${ENTITY} must exist`);
            const view = await md.GetEntityObject<MJUserViewEntity>('MJ: User Views', ctx.User);
            view.Name = `zzz-integrationtest-view-${Date.now()}`;
            view.UserID = ctx.User.ID;
            view.EntityID = entityInfo!.ID;
            view.WhereClause = filter;
            view.CustomWhereClause = true;
            Assert(await view.Save(), `view fixture save failed: ${view.LatestResult?.CompleteMessage ?? 'unknown'}`);

            try {
                // Warm the UNFILTERED slot (a plain entity read, common anywhere in the app).
                const plain = await rv.RunView<{ Name: string }>({ EntityName: ENTITY, ResultType: 'simple' }, ctx.User);
                Assert(plain.Success, `plain warm failed: ${plain.ErrorMessage}`);

                // Run the stored view (realistic shape: EntityName + ViewID). It must honor its
                // own WhereClause, NOT be served the plain unfiltered slot.
                const viewRun = await rv.RunView<{ Name: string }>({ EntityName: ENTITY, ViewID: view.ID, ResultType: 'simple' }, ctx.User);
                Assert(viewRun.Success, `view run failed: ${viewRun.ErrorMessage}`);
                const offFilter = viewRun.Results.filter(r => !String(r.Name).startsWith('MJ: A')).length;
                Assert(offFilter === 0,
                    `stored view returned ${offFilter} rows not matching its WhereClause "${filter}"`);
                Assert(viewRun.Results.length < plain.Results.length,
                    `stored view returned ${viewRun.Results.length} rows, same as the unfiltered query (${plain.Results.length})`);
            } finally {
                Assert(await view.Delete(), `view fixture delete failed: ${view.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
        }
    },
    {
        Id: 'server-cache.S30',
        Name: 'S30 (mutation): renaming a parent record refreshes cached child rows that denormalize its name',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            // View rows can carry denormalized fields from related entities (MJ: Queries rows
            // carry the parent Category name). This check verifies that after renaming the parent
            // category, cached child rows reflect the new name. Self-contained: creates and
            // deletes a throwaway Category + Query, so no real data is touched.
            const md = new Metadata(); // global-provider-ok: integration test — single-provider process by design
            const rv = new RunView();

            const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', ctx.User);
            category.Name = `zzz-integrationtest-cat-${Date.now()}`;
            category.UserID = ctx.User.ID;
            Assert(await category.Save(), `category fixture save failed: ${category.LatestResult?.CompleteMessage ?? 'unknown'}`);
            const originalName = category.Name;

            const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', ctx.User);
            query.Name = `zzz-integrationtest-query-${Date.now()}`;
            query.CategoryID = category.ID;
            query.SQL = 'SELECT 1 AS X';
            query.Status = 'Approved';
            Assert(await query.Save(), `query fixture save failed: ${query.LatestResult?.CompleteMessage ?? 'unknown'}`);

            const params = () => ({ EntityName: 'MJ: Queries', ExtraFilter: `CategoryID='${category.ID}'`, Fields: ['Name', 'Category'], ResultType: 'simple' as const });
            try {
                // Warm the child (Queries) cache — rows denormalize Category='<originalName>'.
                const warm = await rv.RunView<{ Name: string; Category: string }>(params(), ctx.User);
                Assert(warm.Success && warm.Results.length === 1, `warm failed: ${warm.ErrorMessage}`);
                AssertEqual(warm.Results[0].Category, originalName, 'precondition: cached row denormalizes the original category name');

                // Rename the PARENT category.
                const renamed = `${originalName}-renamed`;
                category.Name = renamed;
                Assert(await category.Save(), `category rename failed: ${category.LatestResult?.CompleteMessage ?? 'unknown'}`);
                await new Promise(resolve => setTimeout(resolve, 2500)); // let event-driven invalidation settle

                // Ground truth: the child view now denormalizes the new name in the DB.
                const truth = await rv.RunView<{ Category: string }>({ ...params(), BypassCache: true }, ctx.User);
                Assert(truth.Success, `truth query failed: ${truth.ErrorMessage}`);
                AssertEqual(truth.Results[0]?.Category, renamed, 'sanity: the DB view reflects the rename');

                // The cached child query must reflect the renamed parent (freshness guarantee).
                const after = await rv.RunView<{ Category: string }>(params(), ctx.User);
                Assert(after.Success, `post-rename query failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results[0]?.Category, renamed,
                    `cached child row still shows '${after.Results[0]?.Category}' after the parent was renamed to '${renamed}'`);
            } finally {
                await query.Delete();
                await category.Delete();
            }
        }
    },
    {
        Id: 'server-cache.S31',
        Name: 'S31 (security): a user lacking read permission is never served cached rows (read-permission is enforced regardless of cache state)',
        Fn: async (ctx): Promise<void> => {
            // A user without read permission on an entity must never receive its rows, whether the
            // read is served from the database or from the cache. Discover an (A can-read /
            // B cannot-read) pair on a cacheable, RLS-free entity (prefer one with rows), warm the
            // slot as A, and verify B is still denied via the cache path. Skip-pass (degrade
            // gracefully) when no such pair exists on this DB.
            const md = new Metadata(); // global-provider-ok: integration test — single-provider process by design
            const users: UserInfo[] = UserCache.Instance.Users ?? [];
            const rv = new RunView();

            const candidates: Array<{ a: UserInfo; b: UserInfo; e: string }> = [];
            for (const entity of md.Entities) {
                if (!entity.AllowCaching || entity.TrustServerCacheCompletely === false) continue;
                for (const ua of users) {
                    if (!entity.GetUserPermisions(ua)?.CanRead) continue;
                    if (entity.GetUserRowLevelSecurityWhereClause(ua, EntityPermissionType.Read, '') !== '') continue;
                    for (const ub of users) {
                        if (ua === ub || entity.GetUserPermisions(ub)?.CanRead) continue;
                        if (entity.GetUserRowLevelSecurityWhereClause(ub, EntityPermissionType.Read, '') !== '') continue;
                        candidates.push({ a: ua, b: ub, e: entity.Name });
                    }
                }
            }
            if (candidates.length === 0) {
                console.warn('  ⚠ S31 SKIPPED — no (A can-read / B cannot-read) pair on a cacheable RLS-free entity on this DB.');
                return;
            }
            // Prefer a row-bearing entity (bounded probe) so the bypass leaks real data.
            let chosen = candidates[0];
            for (const c of candidates.slice(0, 20)) {
                const cnt = await rv.RunView({ EntityName: c.e, ResultType: 'count_only', BypassCache: true }, c.a);
                if (cnt.Success && cnt.TotalRowCount > 0) { chosen = c; break; }
            }
            const { a: A, b: B, e: E } = chosen;
            const filter = `'s31' <> 'zzz-marker'`; // always-true unique cold slot

            // Precondition: B is genuinely denied a direct (uncached) read.
            const bCold = await rv.RunView({ EntityName: E, ExtraFilter: filter, ResultType: 'simple', BypassCache: true }, B);
            Assert(!bCold.Success, `precondition: user '${B.Email}' must be denied read on '${E}' (got Success=${bCold.Success})`);

            // A warms the shared cache slot; then B reads via the cache path.
            const aWarm = await rv.RunView({ EntityName: E, ExtraFilter: filter, ResultType: 'simple' }, A);
            Assert(aWarm.Success, `user A warm read failed: ${aWarm.ErrorMessage}`);
            const bWarm = await rv.RunView({ EntityName: E, ExtraFilter: filter, ResultType: 'simple' }, B);

            Assert(!bWarm.Success,
                `user '${B.Email}' has no read permission on '${E}' yet was served ${bWarm.Results.length} rows via the cache ` +
                `(cache-hit=${bWarm.ExecutionTime === 0}) after user '${A.Email}' warmed it`);
        }
    }
];

for (const check of ServerCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
