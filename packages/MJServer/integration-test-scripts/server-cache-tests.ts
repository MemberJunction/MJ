/**
 * server-cache-tests.ts — live integration tests for SERVER-side RunView caching.
 *
 * Bootstraps SQLServerDataProvider against the real dev database exactly the way
 * MJAPI does (setupSQLServerClient, with LocalCacheManager initialized on an
 * instrumented in-memory storage provider), then exercises the full caching
 * pipeline: superset cache writes, per-caller Fields projection on hit AND miss,
 * batch mixed hit/miss, request dedup/linger keying by Fields/ResultType,
 * BypassCache, fingerprint separation, and (optionally, gated) save/delete
 * cache invalidation.
 *
 * Server-side providers have TrustLocalCacheCompletely = true, so every cacheable
 * RunView reads/writes the cache without explicit CacheLocal — this suite verifies
 * that behavior end to end against live SQL Server.
 *
 * USAGE (from the repo root — cwd-relative .env / mj.config.cjs must resolve):
 *   npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts
 *
 * Optional:
 *   RUN_MUTATION_TESTS=1  — also run the save/delete invalidation test, which
 *                           creates and then deletes one "MJ: User Settings" row
 *                           for the context user. Off by default.
 *
 * Exit code: 0 = all passed, 1 = failures, 2 = bootstrap error.
 */
import sql from 'mssql';
import {
    LoadEnv, LoadDbConfig, TestRunner, Assert, AssertEqual, AssertRowShape,
    AssertKeysInclude, InstrumentedLocalStorageProvider, UniqueFilter, RowKeys
} from './lib/harness';
import {
    BaseEntity, CompositeKey, InMemoryLocalStorageProvider, LocalCacheManager, Metadata, RunView, UserInfo
} from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
// Registers entity subclasses on the ClassFactory (needed for entity_object tests)
import '@memberjunction/server-bootstrap-lite';
import type { EntityEntity, UserSettingEntity } from '@memberjunction/core-entities';

const ENTITY = 'MJ: Entities';
const SMALL_ENTITY = 'MJ: Query Categories';

interface Ctx {
    pool: sql.ConnectionPool;
    user: UserInfo;
    storage: InstrumentedLocalStorageProvider;
}

async function bootstrap(): Promise<Ctx> {
    LoadEnv();
    const db = await LoadDbConfig();
    const pool = await new sql.ConnectionPool({
        server: db.Host,
        port: db.Port,
        user: db.User,
        password: db.Password,
        database: db.Database,
        options: { encrypt: false, trustServerCertificate: true }
    }).connect();

    // Initialize LocalCacheManager BEFORE provider setup — Initialize is first-caller-wins,
    // so this preempts StartupManager's own call and every cache read/write flows through
    // the instrumented wrapper from the very first query. Initializing AFTER setup is a
    // silent no-op: caching still works, but against the provider's own storage, and the
    // instrumented counters never see any traffic.
    const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
    await LocalCacheManager.Instance.Initialize(storage, { verboseLogging: false });

    await setupSQLServerClient(new SQLServerProviderConfigData(pool, db.Schema));
    await UserCache.Instance.Refresh(pool);

    const email = process.env.MJ_TEST_USER_EMAIL?.toLowerCase();
    const user =
        (email ? UserCache.Users.find(u => u.Email?.toLowerCase() === email) : undefined)
        ?? UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner')
        ?? UserCache.Users[0];
    if (!user) {
        throw new Error('No context user found in UserCache. Set MJ_TEST_USER_EMAIL in .env.');
    }

    return { pool, user, storage };
}

async function main(): Promise<void> {
    const ctx = await bootstrap();
    const { user, storage } = ctx;
    const rv = new RunView();
    const suite = new TestRunner('Server-side RunView caching (SQLServerDataProvider, TrustLocalCacheCompletely)');

    // ── Core defect regression: Fields projection on miss and hit ─────────────

    suite.Test('S1: cache MISS with narrow Fields returns ONLY the requested columns', async () => {
        storage.ResetCounts();
        const result = await rv.RunView({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's1'),
            Fields: ['Name', 'SchemaName'],
            ResultType: 'simple'
        }, user);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        Assert(result.Results.length > 100, `expected 100+ entities, got ${result.Results.length}`);
        AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'miss-path row shape (requested fields + PK)');
        Assert(storage.SetCount('RunViewCache') > 0, 'expected a RunViewCache write on miss (SetItem not called)');
    });

    suite.Test('S2: subsequent HIT with the same Fields returns the identical shape (miss/hit symmetry)', async () => {
        const params = {
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's1'), // same fingerprint as S1
            Fields: ['Name', 'SchemaName'],
            ResultType: 'simple' as const
        };
        const setsBefore = storage.SetCount('RunViewCache');
        const result = await rv.RunView(params, user);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'hit-path row shape (requested fields + PK)');
        AssertEqual(storage.SetCount('RunViewCache'), setsBefore, 'hit must not rewrite the cache');
        AssertEqual(result.ExecutionTime, 0, 'cache-served results report ExecutionTime 0');
    });

    suite.Test('S3: HIT with a DIFFERENT field subset is served from the same superset entry', async () => {
        const setsBefore = storage.SetCount('RunViewCache');
        const result = await rv.RunView({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's1'), // same fingerprint as S1/S2
            Fields: ['ID', 'Name', 'Description', 'BaseView'],
            ResultType: 'simple'
        }, user);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        AssertRowShape(result.Results[0], ['ID', 'Name', 'Description', 'BaseView'], 'wider-subset hit shape');
        AssertEqual(storage.SetCount('RunViewCache'), setsBefore, 'superset entry serves any subset without a rewrite');
    });

    suite.Test('S4: no Fields requested returns the full entity width (pass-through)', async () => {
        const result = await rv.RunView({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's4'),
            ResultType: 'simple'
        }, user);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        const keyCount = RowKeys(result.Results[0]).length;
        Assert(keyCount > 20, `expected full-width rows (20+ columns), got ${keyCount}`);
    });

    suite.Test('S5: Fields matching is case-insensitive; original column casing is preserved', async () => {
        const result = await rv.RunView({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's5'),
            Fields: ['name', 'schemaname'],
            ResultType: 'simple'
        }, user);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'case-insensitive projection (requested fields + PK)');
        Assert(Object.keys(result.Results[0]).includes('Name'), 'original casing (Name) must be preserved');
    });

    // ── ResultType behaviors ───────────────────────────────────────────────────

    suite.Test('S6: entity_object results are full BaseEntity instances even when a simple superset is cached', async () => {
        const filter = UniqueFilter('Name', 's6');
        // Warm the cache with a narrow simple query first
        const warm = await rv.RunView({ EntityName: SMALL_ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }, user);
        Assert(warm.Success, `warm failed: ${warm.ErrorMessage}`);
        // Now request entity objects for the same fingerprint
        const result = await rv.RunView<BaseEntity>({
            EntityName: SMALL_ENTITY,
            ExtraFilter: filter,
            ResultType: 'entity_object'
        }, user);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        Assert(result.Results.length > 0, 'expected at least one query category');
        const first = result.Results[0];
        Assert(first instanceof BaseEntity, 'entity_object results must be BaseEntity instances');
        const all = first.GetAll();
        AssertKeysInclude(all, ['ID', 'Name'], 'entity object must carry full field set');
    });

    suite.Test('S7: BypassCache skips the cache entirely and respects narrow Fields end-to-end', async () => {
        const setsBefore = storage.SetCount('RunViewCache');
        const result = await rv.RunView({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's7'),
            Fields: ['Name'],
            ResultType: 'simple',
            BypassCache: true
        }, user);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        // The direct (non-cached) SQL path always includes the primary key alongside
        // explicitly requested Fields — so BypassCache narrow queries carry ID too.
        // (The cached path projects to EXACTLY the requested fields; see README.)
        AssertRowShape(result.Results[0], ['ID', 'Name'], 'BypassCache narrow shape (requested fields + PK)');
        AssertEqual(storage.SetCount('RunViewCache'), setsBefore, 'BypassCache must not write the cache');
    });

    suite.Test('S8: TotalRowCount parity between cache miss and cache hit', async () => {
        const params = {
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's8'),
            Fields: ['Name'],
            ResultType: 'simple' as const
        };
        const miss = await rv.RunView({ ...params }, user);
        Assert(miss.Success, `miss failed: ${miss.ErrorMessage}`);
        const hit = await rv.RunView({ ...params }, user);
        Assert(hit.Success, `hit failed: ${hit.ErrorMessage}`);
        AssertEqual(hit.TotalRowCount, miss.TotalRowCount, 'TotalRowCount must be preserved through the cache');
        AssertEqual(hit.Results.length, miss.Results.length, 'row counts must match across miss/hit');
    });

    // ── Batch (RunViews) behaviors ─────────────────────────────────────────────

    suite.Test('S9: batch RunViews projects each result to its OWN param Fields', async () => {
        const results = await rv.RunViews([
            { EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's9a'), Fields: ['Name', 'SchemaName'], ResultType: 'simple' },
            { EntityName: SMALL_ENTITY, ExtraFilter: UniqueFilter('Name', 's9b'), Fields: ['ID', 'Name'], ResultType: 'simple' }
        ], user);
        AssertEqual(results.length, 2, 'two results expected');
        Assert(results[0].Success && results[1].Success, 'both batch results must succeed');
        AssertRowShape(results[0].Results[0], ['ID', 'Name', 'SchemaName'], 'batch index 0 shape');
        AssertRowShape(results[1].Results[0], ['ID', 'Name'], 'batch index 1 shape');
    });

    suite.Test('S10: mixed HIT+MISS batch — warm index projected from cache, cold index projected from DB', async () => {
        const warmFilter = UniqueFilter('Name', 's10-warm');
        const warm = await rv.RunView({ EntityName: ENTITY, ExtraFilter: warmFilter, Fields: ['Name'], ResultType: 'simple' }, user);
        Assert(warm.Success, `warm failed: ${warm.ErrorMessage}`);
        const results = await rv.RunViews([
            { EntityName: ENTITY, ExtraFilter: warmFilter, Fields: ['Name', 'Description'], ResultType: 'simple' }, // HIT, wider subset
            { EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's10-cold'), Fields: ['Name', 'BaseTable'], ResultType: 'simple' } // MISS
        ], user);
        Assert(results[0].Success && results[1].Success, 'both batch results must succeed');
        AssertRowShape(results[0].Results[0], ['ID', 'Name', 'Description'], 'hit index shape (from cached superset)');
        AssertRowShape(results[1].Results[0], ['ID', 'Name', 'BaseTable'], 'miss index shape (projected from DB result)');
    });

    // ── Dedup / linger keying (Fields + ResultType in the dedup key) ──────────

    suite.Test('S11: linger-window callers with DIFFERENT Fields each get their own shape', async () => {
        const filter = UniqueFilter('Name', 's11');
        const a = await rv.RunViews([{ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }], user);
        // Within the 5s linger window — would have shared A's slot under the old Fields-less dedup key
        const b = await rv.RunViews([{ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name', 'Description'], ResultType: 'simple' }], user);
        Assert(a[0].Success && b[0].Success, 'both calls must succeed');
        AssertRowShape(a[0].Results[0], ['ID', 'Name'], 'first caller shape');
        AssertRowShape(b[0].Results[0], ['ID', 'Name', 'Description'], 'second caller must NOT inherit the first caller\'s narrower shape');
    });

    suite.Test('S12: linger-window callers with DIFFERENT ResultType each get their own representation', async () => {
        const filter = UniqueFilter('Name', 's12');
        const simple = await rv.RunViews([{ EntityName: SMALL_ENTITY, ExtraFilter: filter, ResultType: 'simple' }], user);
        const entityObj = await rv.RunViews([{ EntityName: SMALL_ENTITY, ExtraFilter: filter, ResultType: 'entity_object' }], user);
        Assert(simple[0].Success && entityObj[0].Success, 'both calls must succeed');
        Assert(!(simple[0].Results[0] instanceof BaseEntity), 'simple caller must receive plain rows');
        Assert(entityObj[0].Results[0] instanceof BaseEntity, 'entity_object caller must receive BaseEntity instances');
    });

    suite.Test('S13: identical repeat within the linger window is served without touching storage', async () => {
        // NOTE: the pipeline mutates params objects in place (Fields gets widened on
        // cacheable calls) — every call must construct FRESH param objects.
        const makeParams = () => [{ EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's13'), Fields: ['Name'], ResultType: 'simple' as const }];
        const a = await rv.RunViews(makeParams(), user);
        Assert(a[0].Success, `first call failed: ${a[0].ErrorMessage}`);
        storage.ResetCounts();
        const b = await rv.RunViews(makeParams(), user);
        Assert(b[0].Success, `second call failed: ${b[0].ErrorMessage}`);
        AssertRowShape(b[0].Results[0], ['ID', 'Name'], 'linger-served shape');
        AssertEqual(storage.GetCount('RunViewCache') + storage.SetCount('RunViewCache'), 0,
            'linger hit must be served from the in-flight dedup slot, not from cache storage');
    });

    // ── Fingerprint separation ────────────────────────────────────────────────

    suite.Test('S14: different ExtraFilter values produce independent cache entries', async () => {
        const a = await rv.RunView({
            EntityName: ENTITY, ExtraFilter: `Name LIKE 'MJ: A%' AND ${UniqueFilter('Name', 's14')}`,
            Fields: ['Name'], ResultType: 'simple'
        }, user);
        const b = await rv.RunView({
            EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's14'),
            Fields: ['Name'], ResultType: 'simple'
        }, user);
        Assert(a.Success && b.Success, 'both calls must succeed');
        Assert(a.Results.length > 0, 'expected at least one entity starting with MJ: A');
        Assert(a.Results.length < b.Results.length, 'narrower filter must return fewer rows than the all-rows filter');
        Assert(a.Results.every(r => String(r.Name).toUpperCase().startsWith('MJ: A')), 'filtered entry must only contain MJ: A-names');
    });

    suite.Test('S15: OrderBy is honored on both miss and hit', async () => {
        const params = {
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's15'),
            OrderBy: 'Name ASC',
            Fields: ['Name'],
            ResultType: 'simple' as const
        };
        const isSorted = (rows: Record<string, unknown>[]): boolean =>
            rows.every((r, i) => i === 0 || String(rows[i - 1].Name).localeCompare(String(r.Name)) <= 0);
        const miss = await rv.RunView(params, user);
        Assert(miss.Success && isSorted(miss.Results), 'miss-path results must be sorted by Name');
        const hit = await rv.RunView(params, user);
        Assert(hit.Success && isSorted(hit.Results), 'hit-path results must be sorted by Name');
        AssertEqual(hit.Results.length, miss.Results.length, 'hit and miss row counts must match');
    });

    suite.Test('S16: MaxRows limits rows and fingerprints separately from the unlimited query', async () => {
        const filter = UniqueFilter('Name', 's16');
        const limited = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], MaxRows: 10, ResultType: 'simple' }, user);
        Assert(limited.Success, `limited failed: ${limited.ErrorMessage}`);
        AssertEqual(limited.Results.length, 10, 'MaxRows 10 must return exactly 10 rows');
        const unlimited = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }, user);
        Assert(unlimited.Success && unlimited.Results.length > 10, 'unlimited query must not be served from the MaxRows-10 entry');
    });

    // ── Mutation-gated: cache invalidation via BaseEntity save/delete ─────────

    if (process.env.RUN_MUTATION_TESTS === '1') {
        suite.Test('S17 (mutation): save invalidates the filtered cache entry; delete removes the row again', async () => {
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const settingName = `mj.integrationtest.cache.${Date.now()}`;
            const filter = `UserID = '${user.ID}' AND Setting = '${settingName}'`;
            const params = { EntityName: 'MJ: User Settings', ExtraFilter: filter, Fields: ['ID', 'Setting', 'Value'], ResultType: 'simple' as const };

            const before = await rv.RunView(params, user);
            Assert(before.Success, `pre-query failed: ${before.ErrorMessage}`);
            AssertEqual(before.Results.length, 0, 'setting must not exist yet');

            const setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings', user);
            setting.UserID = user.ID;
            setting.Setting = settingName;
            setting.Value = 'integration-test';
            const saved = await setting.Save();
            Assert(saved, `Save failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
            // BaseEntity-event-driven cache invalidation is fire-and-forget; under load
            // (e.g. deferred background engine startup) it can take a moment to land
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
                const after = await rv.RunView(params, user);
                Assert(after.Success, `post-save query failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, 1, 'save must invalidate the cached (empty) filtered entry');
                AssertEqual(String(after.Results[0].Setting), settingName, 'returned row must be the saved setting');
            } finally {
                const deleted = await setting.Delete();
                Assert(deleted, `Delete failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }

            // Delete-driven invalidation is fire-and-forget too
            await new Promise(resolve => setTimeout(resolve, 2000));
            const final = await rv.RunView(params, user);
            Assert(final.Success, `post-delete query failed: ${final.ErrorMessage}`);
            AssertEqual(final.Results.length, 0, 'delete must invalidate the cache so the row disappears');
        });

        suite.Test('S23 (mutation): unfiltered auto-maintained cache upserts on save and removes on delete IN PLACE', async () => {
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const makeParams = () => ({ EntityName: 'MJ: User Settings', Fields: ['ID', 'Setting'], ResultType: 'simple' as const });
            const baseline = await rv.RunView(makeParams(), user);
            Assert(baseline.Success, `baseline failed: ${baseline.ErrorMessage}`);
            const baselineCount = baseline.Results.length;

            const setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings', user);
            setting.UserID = user.ID;
            setting.Setting = `mj.integrationtest.upsert.${Date.now()}`;
            setting.Value = 'integration-test';
            Assert(await setting.Save(), `Save failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const after = await rv.RunView(makeParams(), user);
                Assert(after.Success, `post-save failed: ${after.ErrorMessage}`);
                AssertEqual(after.Results.length, baselineCount + 1, 'unfiltered cache must upsert the new row in place');
                AssertEqual(after.ExecutionTime, 0, 'post-save read must still be served from cache (in-place upsert, no DB)');
            } finally {
                Assert(await setting.Delete(), `Delete failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            const final2 = await rv.RunView(makeParams(), user);
            Assert(final2.Success, `post-delete failed: ${final2.ErrorMessage}`);
            AssertEqual(final2.Results.length, baselineCount, 'unfiltered cache must remove the deleted row in place');
            AssertEqual(final2.ExecutionTime, 0, 'post-delete read must still be served from cache (in-place removal, no DB)');
        });

        suite.Test('S24 (mutation): AllowCaching=false entities never touch the cache — flipped live and restored', async () => {
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const entityInfo = md.EntityByName(SMALL_ENTITY);
            Assert(!!entityInfo, `${SMALL_ENTITY} must exist`);
            const entityRecord = await md.GetEntityObject<EntityEntity>('MJ: Entities', user);
            Assert(await entityRecord.Load(entityInfo!.ID), 'entity record must load');
            Assert(entityRecord.AllowCaching === true, 'precondition: entity allows caching');

            entityRecord.AllowCaching = false;
            Assert(await entityRecord.Save(), `flip save failed: ${entityRecord.LatestResult?.CompleteMessage}`);
            try {
                await Metadata.Provider.Refresh(); // provider must see the new flag // global-provider-ok: integration test script — single-provider process by design
                Assert(md.EntityByName(SMALL_ENTITY)?.AllowCaching === false, 'metadata must reflect AllowCaching=false');

                storage.ResetCounts();
                const first = await rv.RunView({
                    EntityName: SMALL_ENTITY,
                    ExtraFilter: UniqueFilter('Name', 's24'),
                    Fields: ['Name'],
                    ResultType: 'simple'
                }, user);
                Assert(first.Success && first.Results.length > 0, `first failed: ${first.ErrorMessage}`);
                // Direct (non-cached) path: requested fields + PK, no widening
                AssertRowShape(first.Results[0], ['ID', 'Name'], 'no-cache entity shape (requested + PK, never widened)');
                AssertEqual(storage.SetCount('RunViewCache'), 0, 'no-cache entity must never write the cache');
                AssertEqual(storage.GetCount('RunViewCache'), 0, 'no-cache entity must never read the cache');

                const second = await rv.RunView({
                    EntityName: SMALL_ENTITY,
                    ExtraFilter: UniqueFilter('Name', 's24'),
                    Fields: ['Name'],
                    ResultType: 'simple'
                }, user);
                Assert(second.Success, `second failed: ${second.ErrorMessage}`);
                AssertEqual(storage.SetCount('RunViewCache') + storage.GetCount('RunViewCache'), 0,
                    'repeat queries on a no-cache entity must keep hitting the DB, never the cache');
            } finally {
                entityRecord.AllowCaching = true;
                Assert(await entityRecord.Save(), `restore save failed: ${entityRecord.LatestResult?.CompleteMessage}`);
                await Metadata.Provider.Refresh(); // global-provider-ok: integration test script — single-provider process by design
            }
            Assert(md.EntityByName(SMALL_ENTITY)?.AllowCaching === true, 'flag must be restored');
        });
    }



    suite.Test('S18: AfterKey keyset pages never touch the cache and never poison the entity+filter slot', async () => {
        const filter = UniqueFilter('Name', 's18');
        // Page 1: a normal MaxRows query (cacheable, fingerprints separately via MaxRows)
        const page1 = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, OrderBy: 'ID ASC', Fields: ['ID', 'Name'], MaxRows: 50, ResultType: 'simple' }, user);
        Assert(page1.Success && page1.Results.length === 50, `page1 expected 50 rows, got ${page1.Results.length}`);
        const lastID = String(page1.Results[page1.Results.length - 1].ID);

        // Page 2: keyset — must not read OR write the cache
        const setsBefore = storage.SetCount('RunViewCache');
        const page2 = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, OrderBy: 'ID ASC', Fields: ['ID', 'Name'], MaxRows: 50, AfterKey: CompositeKey.FromID(lastID), ResultType: 'simple' }, user);
        Assert(page2.Success && page2.Results.length === 50, `page2 expected 50 rows, got ${page2?.Results?.length}`);
        AssertEqual(storage.SetCount('RunViewCache'), setsBefore, 'keyset page must not write the cache');
        const page1IDs = new Set(page1.Results.map(r => String(r.ID).toLowerCase()));
        Assert(page2.Results.every(r => !page1IDs.has(String(r.ID).toLowerCase())), 'keyset pages must not overlap');

        // The entity+filter slot must NOT have been poisoned by the keyset page:
        // an unlimited full-width query must return all rows, all columns
        const full = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, ResultType: 'simple' }, user);
        Assert(full.Success && full.Results.length > 100, `full query must see all rows, got ${full.Results.length}`);
        Assert(RowKeys(full.Results[0]).length > 20, 'full query must see all columns (no keyset-page poisoning)');
    });

    suite.Test('S19: count_only returns TotalRowCount with zero rows and never poisons the row cache', async () => {
        const filter = UniqueFilter('Name', 's19');
        const count = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, ResultType: 'count_only' }, user);
        Assert(count.Success, `count_only failed: ${count.ErrorMessage}`);
        AssertEqual(count.Results.length, 0, 'count_only must return no rows');
        Assert(count.TotalRowCount > 100, `count_only TotalRowCount expected 100+, got ${count.TotalRowCount}`);

        // The same entity+filter must still serve full rows afterwards (no empty-poisoning)
        const rows = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple' }, user);
        Assert(rows.Success && rows.Results.length === count.TotalRowCount, 'row query after count_only must see all rows');
    });

    suite.Test('S20: BypassCache poisoning regression — full-width query after a narrow bypass stays full-width', async () => {
        const filter = UniqueFilter('Name', 's20');
        const bypass = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, Fields: ['Name'], ResultType: 'simple', BypassCache: true }, user);
        Assert(bypass.Success, `bypass failed: ${bypass.ErrorMessage}`);
        const full = await rv.RunView({ EntityName: ENTITY, ExtraFilter: filter, ResultType: 'simple' }, user);
        Assert(full.Success, `full failed: ${full.ErrorMessage}`);
        Assert(RowKeys(full.Results[0]).length > 20,
            `full-width query must not be served from a bypass-written narrow entry (got ${RowKeys(full.Results[0]).length} columns)`);
    });

    suite.Test('S21: entity_object ignores narrow Fields — instances always carry the full field set', async () => {
        const result = await rv.RunView<BaseEntity>({
            EntityName: SMALL_ENTITY,
            ExtraFilter: UniqueFilter('Name', 's21'),
            Fields: ['Name'],
            ResultType: 'entity_object'
        }, user);
        Assert(result.Success && result.Results.length > 0, `RunView failed: ${result.ErrorMessage}`);
        const all = result.Results[0].GetAll();
        AssertKeysInclude(all, ['ID', 'Name'], 'entity object must carry full fields despite narrow request');
    });

    suite.Test('S22: concurrent identical RunViews share one execution (in-flight dedup)', async () => {
        const makeParams = () => [{ EntityName: ENTITY, ExtraFilter: UniqueFilter('Name', 's22'), Fields: ['Name'], ResultType: 'simple' as const }];
        storage.ResetCounts();
        const results = await Promise.all([1, 2, 3, 4, 5].map(() => rv.RunViews(makeParams(), user)));
        Assert(results.every(r => r[0].Success), 'all concurrent calls must succeed');
        const lengths = new Set(results.map(r => r[0].Results.length));
        AssertEqual(lengths.size, 1, 'all concurrent callers must see the same row count');
        Assert(storage.SetCount('RunViewCache') <= 1, `5 concurrent identical calls must produce at most one cache write, got ${storage.SetCount('RunViewCache')}`);
    });


    suite.Test('S25: TrustServerCacheCompletely=false entities never touch the server cache (real metadata, read-only)', async () => {
        // 'MJ: Audit Logs' has AllowCaching=true but TrustServerCacheCompletely=false in
        // this DB (rows arrive via raw SQL, so event-driven invalidation cannot be
        // trusted) — a DIFFERENT eligibility branch than AllowCaching (S24).
        const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
        const info = md.EntityByName('MJ: Audit Logs');
        Assert(!!info, 'MJ: Audit Logs must exist');
        Assert(info!.AllowCaching === true && info!.TrustServerCacheCompletely === false,
            `precondition: AllowCaching=true + TrustServerCacheCompletely=false (got ${info!.AllowCaching}/${info!.TrustServerCacheCompletely})`);

        storage.ResetCounts();
        const first = await rv.RunView({
            EntityName: 'MJ: Audit Logs',
            ExtraFilter: "'tag-s25' <> 'never'",
            Fields: ['ID'],
            MaxRows: 5,
            ResultType: 'simple'
        }, user);
        Assert(first.Success, `first failed: ${first.ErrorMessage}`);
        const second = await rv.RunView({
            EntityName: 'MJ: Audit Logs',
            ExtraFilter: "'tag-s25' <> 'never'",
            Fields: ['ID'],
            MaxRows: 5,
            ResultType: 'simple'
        }, user);
        Assert(second.Success, `second failed: ${second.ErrorMessage}`);
        AssertEqual(storage.SetCount('RunViewCache'), 0, 'Trust=0 entity must never write the server cache');
        AssertEqual(storage.GetCount('RunViewCache'), 0, 'Trust=0 entity must never read the server cache');
    });

    suite.Test('S26: MJ: Record Changes is hardcoded cache-exempt (rows arrive via raw SQL)', async () => {
        storage.ResetCounts();
        const result = await rv.RunView({
            EntityName: 'MJ: Record Changes',
            ExtraFilter: "'tag-s26' <> 'never'",
            Fields: ['ID'],
            MaxRows: 5,
            ResultType: 'simple'
        }, user);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        AssertEqual(storage.SetCount('RunViewCache') + storage.GetCount('RunViewCache'), 0,
            'Record Changes must never touch the cache regardless of its flags');
    });

    const failures = await suite.Run();
    await ctx.pool.close();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
