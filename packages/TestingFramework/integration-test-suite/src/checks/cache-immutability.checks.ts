/**
 * cache-immutability.checks.ts — the 'cache-immutability' bundle (F1–F14).
 *
 * Proves, against the REAL server stack (live DB, real ProviderBase, real
 * LocalCacheManager, real storage provider), that cached row data cannot be corrupted by a
 * consumer — the runtime half of the freeze-on-write contract that
 * `localCacheManager.freezeOnWrite.test.ts` pins at the unit level.
 *
 * Why this needs an integration tier at all: the hazard only exists because of how three
 * layers compose. The storage provider hands back live references, `ProviderBase` returns
 * `cached.results` itself on a hit AND stores the caller's own array on a miss, and any
 * consumer holding those rows shares memory with the process-wide cache. A unit test mocks
 * at least one of those seams away. This bundle exercises the real composition.
 *
 * The bug this defends against SHIPPED: `ResolverBase` renamed `__mj_CreatedAt` to its
 * GraphQL transport alias `_mj__CreatedAt` in place, rewriting the live cache so that every
 * later reader — including non-GraphQL server code — was served rows `BaseEntity.SetMany`
 * rejects, until the process restarted. F3 replays that exact mutation and asserts both that
 * it is refused AND that the cache survived it.
 *
 * F1 is load-bearing for the whole bundle: it proves the freeze is actually ARMED in this
 * process (the storage provider shares references). Without it, every later "is frozen"
 * assertion could pass vacuously on a provider that isolates instead.
 *
 * Order matters: F2/F3/F4/F5 read the slot F1 warms (shared 'f1' UniqueFilter tag), exactly
 * like the server-cache bundle's S1→S2→S3 chain.
 */
import { RunView, RunQuery, Metadata, LocalCacheManager } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJEntityEntity, MJUserSettingEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { UniqueFilter } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck } from '@memberjunction/testing-integration';

/** Large, always-present entity — same one the server-cache bundle uses. */
const ENTITY = 'MJ: Entities';
/** Small + unfiltered so the server's auto-cache stores it (≤250 rows, no filter/sort). */
const SMALL_ENTITY = 'MJ: Query Categories';

/** Attempts `fn` and reports whether it threw a TypeError (what a frozen-object write raises). */
function throwsTypeError(fn: () => void): { threw: boolean; detail: string } {
    try {
        fn();
        return { threw: false, detail: 'no throw — the mutation SUCCEEDED against shared cache state' };
    } catch (e) {
        const isTypeError = e instanceof TypeError;
        return {
            threw: isTypeError,
            detail: isTypeError ? 'TypeError (expected)' : `threw ${e instanceof Error ? e.constructor.name : typeof e}: ${String(e)}`,
        };
    }
}

/** The ordered cache-immutability bundle. Numeric order is intentional and load-bearing. */
export const CacheImmutabilityChecks: NamedCheck[] = [
    {
        Id: 'cache-immutability.F1',
        Name: 'F1: the freeze is ARMED — storage shares references, and a cache MISS freezes the caller\'s own rows',
        Fn: async (ctx): Promise<void> => {
            // Guard against a vacuous bundle: if this process's storage provider isolated its
            // data, nothing below would be frozen and every "is frozen" check would pass for
            // the wrong reason.
            // `SharesReferences` is optional on the interface (LocalCacheManager probes providers
            // that omit it), but this harness's chain — InstrumentedLocalStorageProvider wrapping
            // InMemoryLocalStorageProvider — declares it, so assert the declaration explicitly.
            Assert(
                ctx.Storage.SharesReferences === true,
                'precondition: the integration storage provider must report SharesReferences=true ' +
                '(it wraps InMemoryLocalStorageProvider), otherwise the freeze is not armed and this bundle proves nothing'
            );

            ctx.Storage.ResetCounts();
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f1'),
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            Assert(result.Results.length > 0, 'expected rows');
            Assert(ctx.Storage.SetCount('RunViewCache') > 0, 'expected a RunViewCache write on miss (nothing was cached, so nothing would be frozen)');

            // The MISS path is the half that copy-on-read designs never close: PostRunView
            // stored the very array being returned here.
            Assert(Object.isFrozen(result.Results), 'the array returned on a cache MISS must be frozen (it IS the cached array)');
            Assert(Object.isFrozen(result.Results[0]), 'rows returned on a cache MISS must be frozen');
        }
    },
    {
        Id: 'cache-immutability.F2',
        Name: 'F2: a cache HIT hands back frozen rows and a frozen array',
        Fn: async (ctx): Promise<void> => {
            const setsBefore = ctx.Storage.SetCount('RunViewCache');
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f1'),   // same fingerprint as F1
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), setsBefore, 'F2 must be served from cache, not rewritten (otherwise this is not the hit path)');
            AssertEqual(result.ExecutionTime, 0, 'cache-served results report ExecutionTime 0');

            Assert(Object.isFrozen(result.Results), 'the array returned on a cache HIT must be frozen');
            Assert(Object.isFrozen(result.Results[0]), 'rows returned on a cache HIT must be frozen');
        }
    },
    {
        Id: 'cache-immutability.F3',
        Name: 'F3: the shipped P1 mutation (__mj_ → _mj__ rename in place) is refused AND the cache survives it',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const before = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f1'),
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(before.Success, `RunView failed: ${before.ErrorMessage}`);
            const row = before.Results[0] as Record<string, unknown>;
            Assert(row['__mj_CreatedAt'] !== undefined, 'precondition: cached rows must carry the __mj_CreatedAt column');
            const originalCreatedAt = row['__mj_CreatedAt'];

            // Exactly what FieldMapper.MapFields does in place.
            const assign = throwsTypeError(() => { row['_mj__CreatedAt'] = row['__mj_CreatedAt']; });
            Assert(assign.threw, `adding the transport alias to a cached row must throw: ${assign.detail}`);
            const remove = throwsTypeError(() => { delete row['__mj_CreatedAt']; });
            Assert(remove.threw, `deleting the DB column name from a cached row must throw: ${remove.detail}`);

            // The real payoff: the NEXT reader still gets the DB shape. This is the assertion
            // that would have caught the original P1.
            const after = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f1'),
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(after.Success, `re-read failed: ${after.ErrorMessage}`);
            const rowAfter = after.Results[0] as Record<string, unknown>;
            AssertEqual(rowAfter['__mj_CreatedAt'], originalCreatedAt, 'the cached row must still carry __mj_CreatedAt after a rejected rename');
            AssertEqual(rowAfter['_mj__CreatedAt'], undefined, 'the transport alias must NOT have leaked into the cache');
        }
    },
    {
        Id: 'cache-immutability.F4',
        Name: 'F4: array-identity mutation (push / splice / reverse / sort) on a cached result is refused',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f1'),
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            const rows = result.Results as Record<string, unknown>[];
            const originalLength = rows.length;

            // An in-place sort would silently reorder the cached slot for every later reader;
            // push/splice would change its membership.
            const pushed = throwsTypeError(() => { rows.push({ ID: 'injected' }); });
            Assert(pushed.threw, `push onto a cached array must throw: ${pushed.detail}`);
            const spliced = throwsTypeError(() => { rows.splice(0, 1); });
            Assert(spliced.threw, `splice on a cached array must throw: ${spliced.detail}`);
            const reversed = throwsTypeError(() => { rows.reverse(); });
            Assert(reversed.threw, `reverse on a cached array must throw: ${reversed.detail}`);

            AssertEqual(rows.length, originalLength, 'the cached array length must be unchanged after refused mutations');

            // The supported pattern: copy, then sort.
            const sorted = [...rows].sort((a, b) => String(a['Name']).localeCompare(String(b['Name'])));
            AssertEqual(sorted.length, originalLength, 'copy-then-sort must work and preserve row count');
        }
    },
    {
        Id: 'cache-immutability.F5',
        Name: 'F5: nested values inside a cached row are frozen (the gap a shallow copy cannot close)',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f1'),
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);

            // Find any row with a non-null object/array-valued column. Real MJ rows carry
            // these (parsed JSON columns); if this dataset happens to have none, the check
            // still asserts the top-level freeze rather than silently passing on nothing.
            let nested: object | undefined;
            for (const r of result.Results as Record<string, unknown>[]) {
                for (const v of Object.values(r)) {
                    if (v !== null && typeof v === 'object' && !(v instanceof Date)) { nested = v; break; }
                }
                if (nested) break;
            }

            if (nested) {
                Assert(Object.isFrozen(nested), 'a nested object/array inside a cached row must be frozen');
                const mutated = throwsTypeError(() => { (nested as Record<string, unknown>)['__probe'] = 1; });
                Assert(mutated.threw, `mutating a nested value inside a cached row must throw: ${mutated.detail}`);
            } else {
                Assert(Object.isFrozen(result.Results[0]), 'no nested object columns in this result set — asserting the top-level row freeze instead');
            }
        }
    },
    {
        Id: 'cache-immutability.F6',
        Name: 'F6: entity_object results are NOT frozen — the load-mutate-Save workflow still works',
        Fn: async (ctx): Promise<void> => {
            // The freeze must not leak into BaseEntity results. The entity transformation
            // builds a fresh array of fresh instances AFTER the cache store, so mutating a
            // loaded entity (the single most common MJ workflow) stays legal. If this check
            // fails, the freeze has been applied too broadly and Save() paths are broken.
            const rv = new RunView();
            const result = await rv.RunView<MJEntityEntity>({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f6'),
                ResultType: 'entity_object',
                CacheLocal: true,
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            Assert(result.Results.length > 0, 'expected rows');

            Assert(!Object.isFrozen(result.Results), 'entity_object results must hand back a MUTABLE array');
            const entity = result.Results[0];
            Assert(!Object.isFrozen(entity), 'a BaseEntity from entity_object must not be frozen');

            // Prove a real field write works (in memory only — never saved).
            const original = entity.Description;
            const wrote = throwsTypeError(() => { entity.Description = 'freeze-probe'; });
            Assert(!wrote.threw, `writing a field on a loaded entity must NOT throw (${wrote.detail})`);
            AssertEqual(entity.Description, 'freeze-probe', 'the field write must take effect');
            entity.Description = original;   // restore in memory; nothing is saved
        }
    },
    {
        Id: 'cache-immutability.F7',
        Name: 'F7: a second identical entity_object read is cache-served yet still mutable',
        Fn: async (ctx): Promise<void> => {
            const setsBefore = ctx.Storage.SetCount('RunViewCache');
            const rv = new RunView();
            const result = await rv.RunView<MJEntityEntity>({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f6'),   // same fingerprint as F6
                ResultType: 'entity_object',
                CacheLocal: true,
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), setsBefore, 'F7 must be served from the slot F6 warmed');

            // Hydrating entities from FROZEN cached rows must work. This is the seam that broke
            // in the first live run of this bundle: BaseEntity's raw-mode fast path keeps the
            // cached row BY REFERENCE and `Get()` writes back into it to memoize a converted
            // Date / rtrimmed fixed-width string — so merely READING such a field threw
            // `Cannot assign to read only property ...` on a frozen row. (That is how AI cost
            // calculation broke on `Currency`, a CHAR column.) Reading a DATE field here is the
            // regression guard; every MJ entity has __mj_CreatedAt/__mj_UpdatedAt.
            Assert(result.Results.length > 0, 'expected rows from the cached slot');
            const entity = result.Results[0];

            const readDate = throwsTypeError(() => {
                const created = entity.Get('__mj_CreatedAt');
                Assert(created instanceof Date, `__mj_CreatedAt should read back as a Date, got ${typeof created}`);
            });
            Assert(readDate.threw === false, `reading a Date field off a frozen cached row must not throw (${readDate.detail})`);

            // Repeat reads must stay stable even though the memo is skipped for frozen rows.
            const first = entity.Get('__mj_UpdatedAt') as Date;
            const second = entity.Get('__mj_UpdatedAt') as Date;
            AssertEqual(second?.getTime?.(), first?.getTime?.(), 'repeated Date reads off a frozen row must agree');

            const wrote = throwsTypeError(() => { entity.Description = 'freeze-probe-2'; });
            Assert(!wrote.threw, `entities hydrated from frozen cache rows must remain writable (${wrote.detail})`);
        }
    },
    {
        Id: 'cache-immutability.F8',
        Name: 'F8: BypassCache results are NOT frozen — declining to cache leaves the caller full ownership',
        Fn: async (ctx): Promise<void> => {
            // Freezing is scoped to data that actually becomes shared state. A query the cache
            // never stores must stay freely mutable, or the freeze would be immobilizing
            // arbitrary query results for no reason.
            ctx.Storage.ResetCounts();
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f8'),
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
            Assert(result.Results.length > 0, 'expected rows');
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), 0, 'BypassCache must not write to the cache');

            Assert(!Object.isFrozen(result.Results), 'an uncached (BypassCache) result array must stay mutable');
            const row = result.Results[0] as Record<string, unknown>;
            const wrote = throwsTypeError(() => { row['__probe'] = 1; });
            Assert(!wrote.threw, `an uncached row must stay mutable (${wrote.detail})`);
        }
    },
    {
        Id: 'cache-immutability.F9',
        Name: 'F9: the server auto-cache path (small + unfiltered, no CacheLocal) freezes when it engages',
        Fn: async (ctx): Promise<void> => {
            // The server opportunistically auto-caches small unfiltered results even without
            // CacheLocal — the path most server code hits implicitly — so it must freeze too.
            //
            // Whether it engages is environment-dependent: `shouldAutoCache` requires the
            // provider's TrustLocalCacheCompletely, which a real MJAPI sets but this harness's
            // bootstrap does not. So detect engagement from the STORAGE COUNTERS rather than
            // guessing from ExecutionTime — a sub-millisecond DB read also reports 0, which
            // would make an ExecutionTime probe claim "cache hit" for an uncached result.
            const rv = new RunView();
            ctx.Storage.ResetCounts();
            const first = await rv.RunView({ EntityName: SMALL_ENTITY, ResultType: 'simple' }, ctx.User);
            Assert(first.Success, `RunView failed: ${first.ErrorMessage}`);
            const wroteToCache = ctx.Storage.SetCount('RunViewCache') > 0;

            if (!wroteToCache) {
                // Nothing was cached ⇒ nothing is shared ⇒ correctly nothing is frozen.
                Assert(
                    !Object.isFrozen(first.Results),
                    `'${SMALL_ENTITY}' was not auto-cached here (no RunViewCache write), so its rows must NOT be frozen — ` +
                    'freezing an uncached result would immobilize data the caller solely owns'
                );
                return;
            }

            // It engaged: the stored array is the one just returned, and the warm read must
            // hand back the same frozen state.
            Assert(Object.isFrozen(first.Results), 'an auto-cached array must be frozen at the point it is stored');
            const setsAfterFirst = ctx.Storage.SetCount('RunViewCache');
            const second = await rv.RunView({ EntityName: SMALL_ENTITY, ResultType: 'simple' }, ctx.User);
            Assert(second.Success, `RunView failed: ${second.ErrorMessage}`);
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), setsAfterFirst, 'the second auto-cache read must be served from cache, not rewritten');
            Assert(Object.isFrozen(second.Results), 'an auto-cached, cache-served array must be frozen');
            Assert(Object.isFrozen(second.Results[0]), 'auto-cached, cache-served rows must be frozen');
        }
    },
    {
        Id: 'cache-immutability.F10',
        Name: 'F10: the RunQuery cache freezes when it engages',
        Fn: async (ctx): Promise<void> => {
            // Same counter-driven discipline as F9, scoped to the RunQueryCache category.
            // Pick any approved query from the live catalog rather than hardcoding a name.
            const rv = new RunView();
            const queries = await rv.RunView({
                EntityName: 'MJ: Queries',
                ExtraFilter: `Status = 'Approved'`,
                Fields: ['ID', 'Name'],
                MaxRows: 1,
                ResultType: 'simple',
            }, ctx.User);
            Assert(queries.Success, `query catalog read failed: ${queries.ErrorMessage}`);
            if (queries.Results.length === 0) {
                Assert(true, 'no Approved queries in this environment — RunQuery freeze not exercised');
                return;
            }
            const queryID = String((queries.Results[0] as Record<string, unknown>)['ID']);

            const rq = new RunQuery();
            ctx.Storage.ResetCounts();
            const firstRun = await rq.RunQuery({ QueryID: queryID }, ctx.User);
            if (!firstRun.Success || firstRun.Results.length === 0) {
                Assert(true, `query ${queryID} returned no rows / failed here — RunQuery freeze not exercised`);
                return;
            }

            if (ctx.Storage.SetCount('RunQueryCache') === 0) {
                Assert(
                    !Object.isFrozen(firstRun.Results),
                    'this query was not cached here (no RunQueryCache write), so its rows must NOT be frozen'
                );
                return;
            }

            Assert(Object.isFrozen(firstRun.Results), 'a cached RunQuery array must be frozen at the point it is stored');
            const secondRun = await rq.RunQuery({ QueryID: queryID }, ctx.User);
            Assert(secondRun.Success, `second RunQuery failed: ${secondRun.ErrorMessage}`);
            Assert(Object.isFrozen(secondRun.Results[0]), 'cache-served RunQuery rows must be frozen');
        }
    },
    {
        Id: 'cache-immutability.F11',
        Name: 'F11: a narrow-Fields request gets its OWN mutable projection, not the shared frozen rows',
        Fn: async (ctx): Promise<void> => {
            // The flip side of the freeze, and the reason it costs callers nothing: a request
            // with narrow `Fields` is served by projecting the cached full-width superset down
            // to the caller's shape, which builds FRESH per-caller row objects. Those are not
            // shared, so they are not frozen — and callers that decorate narrow projections
            // keep working. If this ever starts failing, the projection has begun handing out
            // the shared rows and the isolation reasoning needs revisiting.
            const rv = new RunView();
            const warm = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f11'),
                Fields: ['ID', 'Name', 'SchemaName'],
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(warm.Success, `RunView failed: ${warm.ErrorMessage}`);

            const hit = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f11'),   // same fingerprint
                Fields: ['ID', 'Name'],                      // narrower subset of the cached superset
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(hit.Success, `RunView failed: ${hit.ErrorMessage}`);
            Assert(hit.Results.length > 0, 'expected rows');

            const row = hit.Results[0] as Record<string, unknown>;
            const wrote = throwsTypeError(() => { row['__probe'] = 1; });
            Assert(!wrote.threw, `a projected (per-caller) row must stay mutable (${wrote.detail})`);

            // And the shared slot behind it is untouched by that write.
            const reread = await rv.RunView({
                EntityName: ENTITY,
                ExtraFilter: UniqueFilter('Name', 'f11'),
                ResultType: 'simple',
                CacheLocal: true,
            }, ctx.User);
            Assert(reread.Success, `re-read failed: ${reread.ErrorMessage}`);
            AssertEqual((reread.Results[0] as Record<string, unknown>)['__probe'], undefined, 'the projection write must not have reached the cached row');
        }
    },
    {
        Id: 'cache-immutability.F12',
        Name: 'F12 (mutation): after a save-triggered in-place slot maintenance, the slot is still frozen and correct',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            // The upsert/remove maintenance path writes through storeCachedResults, which
            // BYPASSES SetRunViewResult — a second write funnel that must freeze independently.
            // This proves the freshly-upserted row (which did not exist at first write) is
            // frozen too, driven by a real BaseEntity save event.
            //
            // No `Fields` here on purpose: a narrow-Fields read would be served as a fresh
            // per-caller projection (see F11) and could never observe the shared frozen array.
            const rv = new RunView();
            const md = new Metadata(); // global-provider-ok: integration test — single-provider process by design
            const makeParams = () => ({ EntityName: 'MJ: User Settings', ResultType: 'simple' as const });

            const baseline = await rv.RunView(makeParams(), ctx.User);
            Assert(baseline.Success, `baseline failed: ${baseline.ErrorMessage}`);
            const baselineCount = baseline.Results.length;
            // Counter watermark AFTER the baseline read (which may itself have been a
            // cache-writing miss): everything above this is not the save event's doing.
            const setsAfterBaseline = ctx.Storage.SetCount('RunViewCache');

            const setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', ctx.User);
            setting.UserID = ctx.User.ID;
            setting.Setting = `mj.integrationtest.freeze.${Date.now()}`;
            setting.Value = 'integration-test';
            Assert(await setting.Save(), `Save failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);

            try {
                // The cache maintains itself off BaseEntity events; give them time to land
                // (same 2s settle the server-cache bundle's in-place checks use).
                await new Promise(resolve => setTimeout(resolve, 2000));
                // Detect in-place maintenance from the STORAGE COUNTERS, sampled BEFORE the
                // follow-up read — event-driven maintenance (storeCachedResults → SetItem) has
                // already written by now, whereas an invalidation only writes during the read
                // itself. F9/F10 were rewritten off ExecutionTime for exactly this reason: a
                // sub-millisecond DB read also reports 0, which made that probe claim "cache
                // hit" for uncached results. Cross-slot writes during the settle could inflate
                // the counter, but misdetection is benign: the follow-up read then MISSES, and
                // the miss path freezes and returns the same post-save shape, so every
                // assertion below still holds.
                const writesDuringSettle = ctx.Storage.SetCount('RunViewCache') - setsAfterBaseline;
                const after = await rv.RunView(makeParams(), ctx.User);
                Assert(after.Success, `post-save read failed: ${after.ErrorMessage}`);

                if (writesDuringSettle > 0 && after.Results.length === baselineCount + 1) {
                    // The slot was maintained in place — this is the storeCachedResults funnel.
                    Assert(Object.isFrozen(after.Results), 'the maintained slot\'s array must be frozen');
                    const upserted = (after.Results as Record<string, unknown>[]).find(r => UUIDsEqual(r['ID'] as string, setting.ID));
                    Assert(!!upserted, 'the upserted row must be present in the maintained slot');
                    Assert(
                        Object.isFrozen(upserted),
                        'the freshly upserted row must be frozen — storeCachedResults is a SECOND write funnel that bypasses SetRunViewResult'
                    );
                    AssertEqual(upserted!['Value'], 'integration-test', 'the maintained slot must reflect the saved value');
                } else {
                    Assert(
                        true,
                        `the slot was invalidated rather than maintained in place here ` +
                        `(RunViewCache writes during settle=${writesDuringSettle}, rows=${after.Results.length} vs baseline ${baselineCount}); nothing shared to freeze`
                    );
                }
            } finally {
                await setting.Delete().catch(() => undefined);
            }
        }
    },
    {
        Id: 'cache-immutability.F13',
        Name: 'F13: cache write funnels tolerate binary payloads (varbinary rows arrive as Buffers) without throwing',
        Fn: async (ctx): Promise<void> => {
            // PR #3425 review, finding C1, now fixed — the deep-freeze skips binary values.
            // `Object.freeze` on a non-empty TypedArray THROWS ("Cannot freeze array buffer
            // views with elements"); the mssql driver returns varbinary columns as Buffer, and
            // `MJ: AI Result Cache.PromptEmbedding` is exactly that on a stock install with
            // AllowCaching=1. The freeze runs outside every try/catch on the write path, so a
            // binary-bearing row rejects SetRunViewResult — and with it RunView itself, which
            // MJ documents as never throwing. This probes the REAL LocalCacheManager and
            // storage provider in the live process; the synthetic entity name keeps the
            // AllowCaching write gate fail-open regardless of environment config, and the ttl
            // lets the probe slots expire on their own.
            Assert(
                ctx.Storage.SharesReferences === true,
                'precondition: the freeze must be armed (reference-sharing storage provider), otherwise nothing here would be frozen and this check proves nothing'
            );

            const stamp = Date.now();
            const fingerprint = `IT71-F13-binary-probe|${stamp}`;
            const nowIso = new Date().toISOString();
            const rows: Record<string, unknown>[] = [
                { ID: 'f13-1', Name: 'binary probe', PromptEmbedding: new Uint8Array([1, 2, 3]), __mj_UpdatedAt: nowIso },
            ];

            let threw: unknown = null;
            try {
                await LocalCacheManager.Instance.SetRunViewResult(
                    fingerprint,
                    { EntityName: 'IT71 F13 Probe Entity' },
                    rows,
                    nowIso,
                    undefined, undefined, undefined,
                    60_000
                );
            } catch (e) {
                threw = e;
            }
            Assert(threw === null, `a RunView cache write of binary-bearing rows must not throw (RunView is documented to never throw): ${String(threw)}`);

            const stored = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
            Assert(stored !== null, 'vacuity guard: the probe write was declined by the write gates — nothing was frozen, so this check proved nothing');
            const row = stored!.results[0] as Record<string, unknown>;
            Assert(Object.isFrozen(row), 'the probe row must still be frozen — the binary VALUE is skipped, not the whole row');
            Assert(!Object.isFrozen(row['PromptEmbedding']), 'the binary payload itself is unfreezable by spec and must be left unfrozen (accepted residual, like Date internal slots)');

            // Same hazard on the RunQuery funnel — arbitrary SQL can select varbinary.
            let queryThrew: unknown = null;
            try {
                await LocalCacheManager.Instance.SetRunQueryResult(
                    `IT71-F13-binary-query|${stamp}`,
                    'IT71 F13 binary probe query',
                    [{ ID: 'q1', Vector: new Uint8Array([4, 5]) }],
                    nowIso,
                    1, undefined, 60_000
                );
            } catch (e) {
                queryThrew = e;
            }
            Assert(queryThrew === null, `a RunQuery cache write of binary-bearing rows must not throw: ${String(queryThrew)}`);
        }
    },
    {
        Id: 'cache-immutability.F14',
        Name: 'F14: non-metadata dataset rows are frozen shared state; MJ_Metadata keeps its scaffolding exemption',
        Fn: async (ctx): Promise<void> => {
            // PR #3425 review, finding C2, now fixed — the ProviderInternalScaffolding exemption
            // is scoped to the MJ_Metadata dataset. It previously exempted EVERY dataset, but GetDatasetByName is a public API: BaseEngine.Load hands
            // `item.Results` — the live cached arrays — to every engine subclass in the process,
            // so unfrozen dataset rows re-open the original corruption class for the whole
            // dataset path. Target contract: only MJ_Metadata (whose rows the provider's own
            // metadata assembly mutates in place, by design) stays mutable.
            Assert(
                ctx.Storage.SharesReferences === true,
                'precondition: the freeze must be armed (reference-sharing storage provider)'
            );
            const md = new Metadata(); // global-provider-ok: integration test — single-provider process by design
            const rv = new RunView();

            // Data-driven: pick any live dataset that is not the metadata dataset.
            const catalog = await rv.RunView({
                EntityName: 'MJ: Datasets',
                ExtraFilter: `Name <> 'MJ_Metadata'`,
                Fields: ['ID', 'Name'],
                MaxRows: 1,
                ResultType: 'simple',
            }, ctx.User);
            Assert(catalog.Success, `dataset catalog read failed: ${catalog.ErrorMessage}`);
            if (catalog.Results.length === 0) {
                Assert(true, 'no non-metadata datasets in this environment — dataset freeze scope not exercised');
                return;
            }
            const datasetName = String((catalog.Results[0] as Record<string, unknown>)['Name']);

            const ds = await md.GetAndCacheDatasetByName(datasetName, undefined, ctx.User);
            if (!ds?.Success || !ds.Results?.length) {
                Assert(true, `dataset '${datasetName}' did not load here (${ds?.Status ?? 'no result'}) — dataset freeze scope not exercised`);
                return;
            }

            for (const item of ds.Results) {
                Assert(
                    Object.isFrozen(item.Results),
                    `dataset '${datasetName}' item '${item.Code}': the cached row array must be frozen — an unfrozen dataset array is the P1 corruption class re-opened via GetDatasetByName`
                );
                if (item.Results.length > 0) {
                    Assert(Object.isFrozen(item.Results[0]), `dataset '${datasetName}' item '${item.Code}': cached rows must be frozen`);
                }
            }

            // The metadata dataset must KEEP its exemption — PostProcessEntityMetadata sorts
            // this row array in place and attaches child collections; freezing it boots the
            // process with no metadata at all — and the process's metadata must stay healthy.
            const meta = await md.GetAndCacheDatasetByName('MJ_Metadata', undefined, ctx.User);
            if (meta?.Success && meta.Results?.length) {
                const entitiesItem = meta.Results.find(i => i.Code === 'Entities') ?? meta.Results[0];
                Assert(
                    !Object.isFrozen(entitiesItem.Results),
                    `MJ_Metadata item '${entitiesItem.Code}' must stay exempt from the freeze (provider-internal scaffolding)`
                );
            }
            Assert(md.Entities.length > 0, 'metadata must remain loaded and healthy after the dataset fetches');
        }
    },
    {
        Id: 'cache-immutability.F15',
        Name: 'F15: a plain unfiltered RunView of a metadata entity is frozen — the dataset slot must not cross-serve it',
        Fn: async (ctx): Promise<void> => {
            // PR #3425 review, finding M3. F14 above proves MJ_Metadata KEEPS its scaffolding
            // exemption; this proves the exemption does not LEAK. Those are different claims, and
            // the gap between them is what the original verification missed.
            //
            // The dataset write funnel keys its slot with the same fingerprint builder ordinary
            // reads use, passing only { EntityName, ExtraFilter }. Every shipped dataset item has
            // a NULL WhereClause, so the dataset write emitted byte-for-byte the fingerprint of an
            // unfiltered RunView of that entity — and an ordinary caller was handed the
            // deliberately-unfrozen scaffolding rows for the most-read entities in the process.
            //
            // This check exists because the earlier live soak used only FILTERED and row-limited
            // queries, which generate different keys, so it never touched the colliding slot at
            // all. An unfiltered read is the whole point — do not add a filter or MaxRows here.
            Assert(
                ctx.Storage.SharesReferences === true,
                'precondition: the freeze must be armed (reference-sharing storage provider)'
            );
            const md = new Metadata(); // global-provider-ok: integration test — single-provider process by design
            const rv = new RunView();

            // Warm the metadata dataset first, so its (exempt, unfrozen) slot is definitely
            // present. If the keys still collided, the read below would be served from it.
            const meta = await md.GetAndCacheDatasetByName('MJ_Metadata', undefined, ctx.User);
            Assert(!!meta?.Success, `MJ_Metadata dataset must load: ${meta?.Status ?? 'no result'}`);

            for (const entityName of [ENTITY, 'MJ: Entity Fields']) {
                const result = await rv.RunView({ EntityName: entityName, ResultType: 'simple' }, ctx.User);
                Assert(result.Success, `unfiltered read of '${entityName}' failed: ${result.ErrorMessage}`);
                if (result.Results.length === 0) {
                    continue;
                }
                Assert(
                    Object.isFrozen(result.Results),
                    `an unfiltered RunView of '${entityName}' returned an UNFROZEN array — it is being served the MJ_Metadata dataset's scaffolding slot, so the freeze does not protect the hottest entities in the process`
                );
                Assert(
                    Object.isFrozen(result.Results[0]),
                    `an unfiltered RunView of '${entityName}' returned unfrozen rows — same scaffolding-slot collision`
                );
            }

            // ...and the metadata dataset still holds its own, exempt slot afterwards. This is the
            // reverse direction of the same collision: an ordinary read repopulating a shared slot
            // would store it FROZEN, and the next metadata refresh would throw while rearranging it.
            const metaAfter = await md.GetAndCacheDatasetByName('MJ_Metadata', undefined, ctx.User);
            if (metaAfter?.Success && metaAfter.Results?.length) {
                const entitiesItem = metaAfter.Results.find(i => i.Code === 'Entities') ?? metaAfter.Results[0];
                Assert(
                    !Object.isFrozen(entitiesItem.Results),
                    `MJ_Metadata item '${entitiesItem.Code}' lost its exemption after an ordinary read — the two are still sharing a cache slot`
                );
            }
            Assert(md.Entities.length > 0, 'metadata must remain loaded and healthy');
        }
    }
];

for (const check of CacheImmutabilityChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
