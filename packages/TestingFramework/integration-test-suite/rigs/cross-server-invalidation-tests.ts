/**
 * cross-server-invalidation-tests.ts — proves that a BaseEntity.Save() in MJAPI
 * process A invalidates the cached read in MJAPI process B via the shared
 * Redis-backed LocalCacheManager (RedisLocalStorageProvider pub/sub).
 *
 * Two halves, and they fail differently:
 *   - INVALIDATION (XS1–XS4) — does B stop serving a stale slot (or stale metadata) after A writes?
 *   - PAYLOAD (XS5–XS7) — when B APPLIES a data-carrying event, do the rows stay real
 *     BaseEntity instances? Row counts cannot see this: `results.length` is correct on
 *     prototype-less JSON, which is exactly how #3777 shipped past XS1/XS2 and broke
 *     every RunQuery in production with `query.UserCanRun is not a function`.
 *
 * This is the ONE check class that fundamentally needs TWO processes — it cannot be
 * expressed in a single-process suite — so it is a standalone script (D1/D8), gated
 * behind RUN_CROSS_SERVER=1 and run only when the topology is provisioned:
 *   - two MJAPI processes (A, B) pointed at the SAME database AND the SAME Redis
 *     instance (each started with REDIS_URL set so it hot-swaps LocalCacheManager to
 *     RedisLocalStorageProvider at startup — packages/MJServer/src/index.ts), and
 *   - MJAPI_A_URL / MJAPI_B_URL / MJ_API_KEY in the environment.
 *
 * The transport under test (RedisLocalStorageProvider pub/sub → LocalCacheManager
 * DispatchCacheChange → remote-invalidate BaseEntity event) is EXISTING framework
 * behavior; this script exercises it end-to-end, it does not implement it. Because it
 * requires Redis + two servers, run-all.ts only includes it when RUN_CROSS_SERVER=1
 * (never in the blocking PR gate).
 *
 * Exit contract (harness standard): 0 all passed · 1 failures · 2 bootstrap/connectivity error.
 */
import { RunView } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import type { MJActionCategoryEntity, MJEntityEntity, MJUserSettingEntity, MJQueryEntity } from '@memberjunction/core-entities';
// Side-effect import: registers generated entity subclasses so GetEntityObject<…>()
// materializes a real BaseEntity (this script doesn't go through bootstrapIntegrationClient).
import '@memberjunction/server-bootstrap-lite';
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { LooksLikePoisonedEngine } from './lib/cross-server-signatures';

// Cross-server invalidation is fire-and-forget over Redis pub/sub — give it a window to land.
const SETTLE_MS = 2000;
// XS5–XS7 assert that B STAYS healthy after A's write, which one sample cannot show, so they keep
// exercising B for this long (see watchBAfterWrite).
const PAYLOAD_WATCH_MS = 10_000;
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A GraphQLDataProvider that is NOT the process singleton. The constructor returns the singleton
 * whenever one exists, so without this both "clients" were one object and every request — A's
 * included — went to whichever server was configured last. (Same technique as fls-client.checks.)
 */
function newSeparateProvider(): GraphQLDataProvider {
    const key = '___SINGLETON__GraphQLDataProvider';
    const store = GetGlobalObjectStore();
    const singleton = store?.[key];
    if (store) delete store[key];
    try {
        return new GraphQLDataProvider();
    } finally {
        if (store) store[key] = singleton;
    }
}

/** Connect an independent GraphQL client to one MJAPI endpoint (its own session). */
async function connectClient(url: string, apiKey: string): Promise<GraphQLDataProvider> {
    const provider = newSeparateProvider();
    const config = new GraphQLProviderConfigData('', url, '', async () => '', '__mj', undefined, undefined, apiKey);
    // separateConnection=true → this provider does NOT share session/connection state with any other,
    // so the two clients are genuinely talking to two distinct servers.
    await provider.Config(config, undefined, true);
    return provider;
}

/**
 * Count `MJ: User Settings` rows tagged with `tag` via the given provider. CacheLocal:true
 * engages the client smart-cache so the read exercises the end-to-end freshness path
 * (client smart-cache-check against THAT server's cache, which the cross-server flow invalidates).
 */
async function countTagged(provider: GraphQLDataProvider, user: UserInfo, tag: string): Promise<number> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView({
        EntityName: 'MJ: User Settings',
        ExtraFilter: `Setting = '${tag}'`,
        Fields: ['ID', 'Setting'],
        CacheLocal: true,
        ResultType: 'simple'
    }, user);
    if (!res.Success) {
        throw new Error(`RunView (count '${tag}') failed: ${res.ErrorMessage}`);
    }
    return res.Results?.length ?? 0;
}

/**
 * Attempt a RunQuery through `provider`, returning the failure text rather than throwing.
 *
 * XS5–XS7 care about *how* a query fails, not merely that it did: a poisoned engine surfaces as a
 * TypeError naming a missing entity METHOD, while an unrelated problem (bad parameters, a query
 * whose SQL no longer compiles) surfaces as an ordinary query error. Swallowing the distinction
 * would let this bundle go green against the very defect it exists to catch.
 */
async function tryRunQuery(
    provider: GraphQLDataProvider,
    user: UserInfo,
    params: { QueryID?: string; QueryName?: string }
): Promise<{ ok: boolean; error: string }> {
    try {
        const res = await provider.RunQuery(params, user);
        return { ok: !!res?.Success, error: res?.ErrorMessage ?? '' };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Find a query this server can actually execute right now, so XS5–XS7 assert against a known-good
 * baseline instead of blaming the cross-server path for a query that was already broken.
 *
 * Tries candidates in turn because catalog queries carry required parameters we cannot infer here;
 * the first one that succeeds unparameterised becomes the probe. Returning null is a BOOTSTRAP
 * condition (exit 2), never a test failure — "no runnable query exists" says nothing about Redis.
 */
async function pickRunnableQuery(
    provider: GraphQLDataProvider,
    user: UserInfo,
    maxAttempts = 8
): Promise<{ ID: string; Name: string } | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<{ ID: string; Name: string; Description: string | null }>({
        EntityName: 'MJ: Queries',
        ExtraFilter: `Status = 'Approved'`,
        Fields: ['ID', 'Name', 'Description'],
        OrderBy: 'Name',
        ResultType: 'simple'
    }, user);
    if (!res.Success) {
        throw new Error(`Could not list MJ: Queries: ${res.ErrorMessage}`);
    }
    // Prefer a query with a non-empty Description. `MJQueryEntityServer.Save` NULLs
    // EmbeddingVector/EmbeddingModelID when Description is blank — a side effect the restore
    // below cannot undo, so keep the probe off those rows when any alternative exists.
    // Filtered client-side rather than in ExtraFilter to stay dialect-agnostic.
    const rows = res.Results ?? [];
    const ordered = [
        ...rows.filter(r => (r.Description ?? '').trim().length > 0),
        ...rows.filter(r => (r.Description ?? '').trim().length === 0)
    ];
    const errors: string[] = [];
    for (const row of ordered.slice(0, maxAttempts)) {
        const attempt = await tryRunQuery(provider, user, { QueryID: row.ID });
        if (attempt.ok) {
            return { ID: row.ID, Name: row.Name };
        }
        errors.push(`${row.Name}: ${attempt.error}`);
    }

    // CRITICAL distinction. "Nothing ran" has two very different causes, and treating them
    // alike is how this rig would report the defect it exists to catch as a setup problem.
    //
    // Observed on a pre-#3777 build: the engine is ALREADY poisoned by the time the probe
    // runs — these servers have been publishing cross-server events since startup — so every
    // candidate fails with `query.UserCanRun is not a function`. Reporting that as "seed a
    // runnable query" is exactly backwards: it is the bug, at full severity, and it means
    // RunQuery is dead process-wide.
    if (errors.length > 0 && errors.every(e => LooksLikePoisonedEngine(e))) {
        throw new Error(
            'EVERY approved query failed with a missing entity METHOD, which is the #3777 ' +
            'signature: this server\'s cached MJ: Queries array holds plain JSON, not BaseEntity ' +
            'instances, so RunQuery is broken process-wide. This is a FAILURE, not a missing ' +
            `fixture.\n  ${errors.slice(0, 3).join('\n  ')}`
        );
    }
    return null;
}

/**
 * Rows B returns for `MJ: AI Models` with no MaxRows. The server caps such a read at the entity's
 * `UserViewMaxRows`, taken from ITS in-memory metadata — so the count shows which metadata B holds.
 * A textually unique filter per call keeps every cache layer out of the answer.
 */
async function modelRowsServedBy(provider: GraphQLDataProvider, user: UserInfo): Promise<number> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView({
        EntityName: 'MJ: AI Models',
        ExtraFilter: `Name <> 'xs-${Date.now()}-${Math.random().toString(36).slice(2)}'`,
        Fields: ['ID'],
        ResultType: 'simple',
    }, user);
    if (!res.Success) {
        throw new Error(`RunView (MJ: AI Models) failed: ${res.ErrorMessage}`);
    }
    return res.Results?.length ?? 0;
}

/**
 * IDs of every `MJ: Action Categories` row the given server returns for an unfiltered read. An
 * unfiltered read is served from a slot the server keeps up to date in place, so this shows the
 * rows that server's cache holds after a peer's change arrived.
 */
async function categoryIdsServedBy(provider: GraphQLDataProvider, user: UserInfo): Promise<Set<string>> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Action Categories',
        Fields: ['ID'],
        IgnoreMaxRows: true,
        ResultType: 'simple',
    }, user);
    if (!res.Success) {
        throw new Error(`RunView (MJ: Action Categories) failed: ${res.ErrorMessage}`);
    }
    return new Set(res.Results.map(r => r.ID.toUpperCase()));
}

/** Polls until `predicate` holds or the timeout passes; returns the elapsed ms, or null. */
async function waitUntil(predicate: () => Promise<boolean>, timeoutMs: number): Promise<number | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await predicate()) return Date.now() - started;
        await sleep(250);
    }
    return null;
}

/**
 * Sets `MJ: AI Models`' UserViewMaxRows through the given server and returns the previous value.
 * The record is created with `provider.GetEntityObject` so its Save goes to THAT server: rows
 * returned by a RunView save through the process-wide provider, which is whichever client
 * connected last — an earlier version of this check saved through B by accident.
 */
async function setModelsMaxRows(provider: GraphQLDataProvider, user: UserInfo, value: number | null): Promise<number | null> {
    const modelsEntityId = provider.EntityByName('MJ: AI Models')?.ID;
    if (!modelsEntityId) {
        throw new Error(`'MJ: AI Models' is not in the metadata of ${provider.InstanceConnectionString}`);
    }
    const entity = await provider.GetEntityObject<MJEntityEntity>('MJ: Entities', user);
    Assert(await entity.Load(modelsEntityId), `could not load the 'MJ: AI Models' entity row: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
    const previous = entity.UserViewMaxRows;
    entity.UserViewMaxRows = value;
    Assert(await entity.Save(), `saving UserViewMaxRows=${value} failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return previous;
}

async function main(): Promise<void> {
    const aUrl = process.env.MJAPI_A_URL;
    const bUrl = process.env.MJAPI_B_URL;
    const apiKey = process.env.MJ_API_KEY;
    if (!aUrl || !bUrl || !apiKey) {
        throw new Error(
            'Cross-server test requires MJAPI_A_URL, MJAPI_B_URL, and MJ_API_KEY — two MJAPI ' +
            'processes sharing one DB + one Redis (REDIS_URL set on both).'
        );
    }

    const a = await connectClient(aUrl, apiKey);
    const b = await connectClient(bUrl, apiKey);
    Assert(a !== b, 'the two clients must be distinct provider instances');
    const userA = a.CurrentUser;
    const userB = b.CurrentUser;
    Assert(!!userA && !!userB, 'Both clients must resolve a current user from MJ_API_KEY');

    const tag = `mj.xserver.${userA.ID}`;
    const suite = new TestRunner('Cross-Server Redis Invalidation');

    suite.Test('XS1: B serves a consistent cacheable read after A and B both read the same slot', async () => {
        await countTagged(a, userA, tag); // warm via A
        const r = await countTagged(b, userB, tag); // B reads its own slot off the shared backend
        Assert(r >= 0, 'B read should succeed');
    });

    suite.Test('XS2: a Save in A invalidates the cached read in B', async () => {
        const before = await countTagged(b, userB, tag); // B caches the (empty) slot
        const setting = await a.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', userA);
        setting.UserID = userA.ID;
        setting.Setting = tag;
        setting.Value = 'integration-test';
        Assert(await setting.Save(), `Save in A failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
        try {
            await sleep(SETTLE_MS); // let the fire-and-forget cross-server invalidation land in B
            const after = await countTagged(b, userB, tag);
            AssertEqual(after, before + 1, "B must observe A's write after cross-server invalidation (stale slot must NOT be served)");
        } finally {
            // Always clean up our mutation, even if the assertion above threw.
            Assert(await setting.Delete(), `Cleanup delete in A failed: ${setting.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
    });

    suite.Test('XS3: a metadata change saved through A reaches B through the shared-cache notice', async () => {
        // B must be started with METADATA_CACHE_REFRESH_INTERVAL far above this test's timeout, so its
        // periodic poll cannot be what delivers the change.
        const cap = 3;
        const baseline = await modelRowsServedBy(b, userB);
        Assert(baseline > cap, `precondition: B serves more than ${cap} models (got ${baseline})`);
        const previous = await setModelsMaxRows(a, userA, cap);
        try {
            const elapsed = await waitUntil(async () => (await modelRowsServedBy(b, userB)) === cap, 20000);
            console.log(`      → B applied UserViewMaxRows=${cap} ${elapsed === null ? 'never (20 s)' : `after ${elapsed} ms`}`);
            Assert(elapsed !== null, 'B must adopt the metadata change A saved, without waiting for its periodic poll');
        } finally {
            await setModelsMaxRows(a, userA, previous);
            const restored = await waitUntil(async () => (await modelRowsServedBy(b, userB)) === baseline, 20000);
            console.log(`      → B restored in ${restored ?? 'never (20 s)'} ms`);
        }
    });

    suite.Test('XS4: a transaction group saved through A leaves B serving every row of it, and none after a group of deletes', async () => {
        await categoryIdsServedBy(b, userB); // B caches the slot before A's group changes it
        const group = await a.CreateTransactionGroup();
        const categories: MJActionCategoryEntity[] = [];
        for (let i = 0; i < 3; i++) {
            const category = await a.GetEntityObject<MJActionCategoryEntity>('MJ: Action Categories', userA);
            category.NewRecord();
            category.Name = `XS4 group ${i} ${Date.now()} (mj-integration-test — safe to delete)`;
            category.Status = 'Active';
            category.TransactionGroup = group;
            Assert(await category.Save(), `queueing a category in A failed: ${category.LatestResult?.CompleteMessage ?? 'unknown'}`);
            categories.push(category);
        }
        Assert(await group.Submit(), 'the transaction group in A failed to submit');
        const ids = categories.map(c => c.ID.toUpperCase());
        let deleted = false;
        try {
            const arrived = await waitUntil(async () => {
                const served = await categoryIdsServedBy(b, userB);
                return ids.every(id => served.has(id));
            }, 10000);
            console.log(`      → B served all ${ids.length} rows of A's group ${arrived === null ? 'never (10 s)' : `after ${arrived} ms`}`);
            Assert(arrived !== null, "B must serve every row of A's transaction group");

            const deletes = await a.CreateTransactionGroup();
            for (const category of categories) {
                category.TransactionGroup = deletes;
                Assert(await category.Delete(), `queueing a delete in A failed: ${category.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
            Assert(await deletes.Submit(), 'the group of deletes in A failed to submit');
            deleted = true;
            const gone = await waitUntil(async () => {
                const served = await categoryIdsServedBy(b, userB);
                return ids.every(id => !served.has(id));
            }, 10000);
            console.log(`      → B dropped all ${ids.length} rows ${gone === null ? 'never (10 s)' : `after ${gone} ms`}`);
            Assert(gone !== null, "B must stop serving the rows A's group of deletes removed");
        } finally {
            if (!deleted) {
                // Through a new group: each entity still points at the submitted one, which would take
                // a plain Delete() and never run it.
                const cleanup = await a.CreateTransactionGroup();
                for (const category of categories) {
                    category.TransactionGroup = cleanup;
                    await category.Delete();
                }
                await cleanup.Submit();
            }
        }
    });

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // XS5–XS7: the payload half of the cross-server contract.
    //
    // XS1–XS4 above prove INVALIDATION — "does B stop serving stale data?" — by counting rows.
    // That is structurally blind to the defect fixed in #3777, because a row COUNT is correct on
    // plain JSON: `results.length` does not care about prototypes. The bug lived one layer down.
    //
    // `BaseEngine.OnExternalCacheChange` used to assign a cache-change payload's rows straight into
    // the engine property:
    //
    //     const parsed = JSON.parse(event.Data);
    //     this.HandleSingleViewResult(config, { Results: parsed.results, ... });   // plain objects
    //
    // Cache payloads are serialized, so for any `entity_object` config — the DEFAULT, and what
    // `QueryEngine` uses for `MJ: Queries` (`CacheLocal: true`) — that silently replaced live
    // BaseEntity instances with prototype-less objects. Reads still worked. Method calls did not,
    // and every RunQuery calls one: `ValidateQueryForExecution` → `query.UserCanRun(user)`.
    //
    // Production symptom, observed on a Redis-backed Skip deployment: every Skip Monitoring
    // dashboard rendered empty while MJAPI logged `TypeError: query.UserCanRun is not a function`.
    // Redis-only, because `CacheChangedEvent` is published solely by RedisLocalStorageProvider.
    //
    // These three drive that path from the OUTSIDE — a write in A, then real work in B — so they
    // need no access to B's engine internals and would have failed on the pre-#3777 build.
    // ────────────────────────────────────────────────────────────────────────────────────────────

    const probe = await pickRunnableQuery(b, userB);
    if (!probe) {
        // Bootstrap condition, not a failure: with no executable query there is nothing to poison.
        throw new Error(
            'No approved MJ: Query executed successfully unparameterised, so XS5–XS7 have no probe. ' +
            'Seed a runnable query or widen pickRunnableQuery(); this says nothing about Redis.'
        );
    }

    /**
     * Force `MJ: Queries` to publish a data-carrying cross-server event from A.
     *
     * An unfiltered, unlimited slot is MAINTAINED in place rather than invalidated (see the
     * cache-gauntlet bundle's slot matrix), so the save publishes `Action: 'set'` WITH `Data` —
     * precisely the branch that pre-#3777 applied without materializing.
     *
     * `Feedback` is the mutation target for a specific reason. `MJQueryEntityServer.Save`
     * gates two expensive side effects on WHICH field is dirty:
     *
     *     shouldExtractData      = !IsSaved || sqlField.Dirty
     *     shouldGenerateEmbedding = !IsSaved || nameField.Dirty
     *                                        || descriptionField.Dirty
     *                                        || userQuestionField.Dirty
     *
     * Dirtying Name/Description/UserQuestion calls GenerateCompositeEmbedding(), which fails
     * outright wherever no embedding model is configured — turning this rig RED for an
     * environment reason that has nothing to do with cross-server caching. Dirtying SQL
     * triggers parameter extraction and dialect conversion. `Feedback` trips neither, so the
     * save is a pure row-version bump: it publishes the event and changes nothing that any
     * other check observes. The original value is always restored.
     */
    async function publishQueriesChangeFromA(marker: string): Promise<() => Promise<void>> {
        const q = await a.GetEntityObject<MJQueryEntity>('MJ: Queries', userA);
        Assert(await q.Load(probe!.ID), `Could not load query ${probe!.Name} in A`);
        const original = q.Feedback;
        q.Feedback = `${original ?? ''} ${marker}`.trim();
        Assert(await q.Save(), `Save of MJ: Queries in A failed: ${q.LatestResult?.CompleteMessage ?? 'unknown'}`);
        return async () => {
            const restore = await a.GetEntityObject<MJQueryEntity>('MJ: Queries', userA);
            if (await restore.Load(probe!.ID)) {
                restore.Feedback = original;
                await restore.Save();
            }
        };
    }

    /**
     * Keeps running a query on B for PAYLOAD_WATCH_MS after A's write and returns the first
     * failure, or the last success.
     *
     * Nothing outside B can tell when A's event has been applied there. A cached read is no
     * signal: the client's smart-cache check compares against the DATABASE, which A has already
     * updated, so B would show A's write whether or not the event arrived. So instead of sampling
     * once after a guessed delay, B is exercised throughout a window of several times SETTLE_MS, and
     * the first failure ends the wait early. A pass means B stayed healthy for the whole window.
     */
    async function watchBAfterWrite(params: { QueryID?: string; QueryName?: string }): Promise<{ ok: boolean; error: string }> {
        let last = { ok: true, error: '' };
        await waitUntil(async () => {
            last = await tryRunQuery(b, userB, params);
            return !last.ok;
        }, PAYLOAD_WATCH_MS);
        return last;
    }

    suite.Test('XS5: after a MJ: Queries write in A, B can still EXECUTE a query (entity methods survive the payload)', async () => {
        const baseline = await tryRunQuery(b, userB, { QueryID: probe.ID });
        Assert(baseline.ok, `Pre-condition: B must be able to run "${probe.Name}" before the write (${baseline.error})`);

        const restore = await publishQueriesChangeFromA('[mj-xserver-xs5]');
        try {
            const after = await watchBAfterWrite({ QueryID: probe.ID });
            Assert(
                after.ok,
                LooksLikePoisonedEngine(after.error)
                    ? `B's cached MJ: Queries array was overwritten with plain JSON by the cross-server ` +
                      `payload — entity methods are gone. This is the #3777 regression: ${after.error}`
                    : `B failed to run "${probe.Name}" after A's write for an unrelated reason: ${after.error}`
            );
        } finally {
            await restore();
        }
    });

    suite.Test('XS6: name-based query resolution in B also survives the cross-server payload', async () => {
        // Same poisoned array, different lookup path: resolving by Name walks the cached collection
        // rather than hitting an ID index, so it can fail where the ID path happens to succeed.
        const baseline = await tryRunQuery(b, userB, { QueryName: probe.Name });
        Assert(baseline.ok, `Pre-condition: B must resolve "${probe.Name}" by name before the write (${baseline.error})`);

        const restore = await publishQueriesChangeFromA('[mj-xserver-xs6]');
        try {
            const after = await watchBAfterWrite({ QueryName: probe.Name });
            Assert(
                after.ok,
                LooksLikePoisonedEngine(after.error)
                    ? `Name-based resolution hit the same poisoned array (#3777): ${after.error}`
                    : `B failed name-based resolution after A's write for an unrelated reason: ${after.error}`
            );
        } finally {
            await restore();
        }
    });

    suite.Test('XS7: B stays healthy across rapid successive writes in A (overlapping events must not leave it poisoned)', async () => {
        // The fix claims a refresh generation (beginConfigRefresh / isLatestConfigRefresh) because
        // materialization is async: without it two overlapping events can resolve out of order and
        // the STALE one assigns last. A single write cannot expose that; three back-to-back can.
        const restores: Array<() => Promise<void>> = [];
        try {
            for (let i = 0; i < 3; i++) {
                restores.push(await publishQueriesChangeFromA(`[mj-xserver-xs7-${i}]`));
            }
            // The window starts after the third write, so it covers all three events settling,
            // in whatever order they arrive.
            const after = await watchBAfterWrite({ QueryID: probe.ID });
            Assert(
                after.ok,
                LooksLikePoisonedEngine(after.error)
                    ? `B was left poisoned after overlapping cross-server events — a stale payload ` +
                      `won the race (#3777 generation guard): ${after.error}`
                    : `B failed after rapid writes for an unrelated reason: ${after.error}`
            );
        } finally {
            // Restore in reverse so the earliest snapshot is the one that lands.
            for (const restore of restores.reverse()) {
                await restore();
            }
        }
    });

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
