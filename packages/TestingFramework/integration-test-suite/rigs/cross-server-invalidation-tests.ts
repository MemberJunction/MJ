/**
 * cross-server-invalidation-tests.ts — proves that a BaseEntity.Save() in MJAPI
 * process A invalidates the cached read in MJAPI process B via the shared
 * Redis-backed LocalCacheManager (RedisLocalStorageProvider pub/sub).
 *
 * Two halves, and they fail differently:
 *   - INVALIDATION (XS1/XS2) — does B stop serving a stale slot after A writes?
 *   - PAYLOAD (XS3-XS5) — when B APPLIES a data-carrying event, do the rows stay real
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
import type { UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import type { MJUserSettingEntity, MJQueryEntity } from '@memberjunction/core-entities';
// Side-effect import: registers generated entity subclasses so GetEntityObject<…>()
// materializes a real BaseEntity (this script doesn't go through bootstrapIntegrationClient).
import '@memberjunction/server-bootstrap-lite';
import { TestRunner, Assert, AssertEqual } from './lib/harness';

// Cross-server invalidation is fire-and-forget over Redis pub/sub — give it a window to land.
const SETTLE_MS = 2000;
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Connect an independent GraphQL client to one MJAPI endpoint (its own session). */
async function connectClient(url: string, apiKey: string): Promise<GraphQLDataProvider> {
    const provider = new GraphQLDataProvider();
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
 * XS3–XS5 care about *how* a query fails, not merely that it did: a poisoned engine surfaces as a
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
 * The signature of a BaseEngine cached array that has been overwritten with plain JSON.
 *
 * Deserialized rows carry the DATA but not the PROTOTYPE, so field reads keep working while any
 * METHOD call throws `... is not a function`. `MJQueryEntityExtended.UserCanRun` is the one every
 * RunQuery goes through (`GenericDatabaseProvider.ValidateQueryForExecution`), which is why the
 * production symptom was `TypeError: query.UserCanRun is not a function` on every dashboard tile.
 */
function looksLikePoisonedEngine(error: string): boolean {
    return /is not a function/i.test(error);
}

/**
 * Find a query this server can actually execute right now, so XS3–XS5 assert against a known-good
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
    if (errors.length > 0 && errors.every(e => looksLikePoisonedEngine(e))) {
        throw new Error(
            'EVERY approved query failed with a missing entity METHOD, which is the #3777 ' +
            'signature: this server\'s cached MJ: Queries array holds plain JSON, not BaseEntity ' +
            'instances, so RunQuery is broken process-wide. This is a FAILURE, not a missing ' +
            `fixture.\n  ${errors.slice(0, 3).join('\n  ')}`
        );
    }
    return null;
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

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // XS3–XS5: the payload half of the cross-server contract.
    //
    // XS1/XS2 above prove INVALIDATION — "does B stop serving a stale slot?" — by counting rows.
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
            'No approved MJ: Query executed successfully unparameterised, so XS3–XS5 have no probe. ' +
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

    suite.Test('XS3: after a MJ: Queries write in A, B can still EXECUTE a query (entity methods survive the payload)', async () => {
        const baseline = await tryRunQuery(b, userB, { QueryID: probe.ID });
        Assert(baseline.ok, `Pre-condition: B must be able to run "${probe.Name}" before the write (${baseline.error})`);

        const restore = await publishQueriesChangeFromA('[mj-xserver-xs3]');
        try {
            await sleep(SETTLE_MS); // let the cross-server payload land in B
            const after = await tryRunQuery(b, userB, { QueryID: probe.ID });
            Assert(
                after.ok,
                looksLikePoisonedEngine(after.error)
                    ? `B's cached MJ: Queries array was overwritten with plain JSON by the cross-server ` +
                      `payload — entity methods are gone. This is the #3777 regression: ${after.error}`
                    : `B failed to run "${probe.Name}" after A's write for an unrelated reason: ${after.error}`
            );
        } finally {
            await restore();
        }
    });

    suite.Test('XS4: name-based query resolution in B also survives the cross-server payload', async () => {
        // Same poisoned array, different lookup path: resolving by Name walks the cached collection
        // rather than hitting an ID index, so it can fail where the ID path happens to succeed.
        const baseline = await tryRunQuery(b, userB, { QueryName: probe.Name });
        Assert(baseline.ok, `Pre-condition: B must resolve "${probe.Name}" by name before the write (${baseline.error})`);

        const restore = await publishQueriesChangeFromA('[mj-xserver-xs4]');
        try {
            await sleep(SETTLE_MS);
            const after = await tryRunQuery(b, userB, { QueryName: probe.Name });
            Assert(
                after.ok,
                looksLikePoisonedEngine(after.error)
                    ? `Name-based resolution hit the same poisoned array (#3777): ${after.error}`
                    : `B failed name-based resolution after A's write for an unrelated reason: ${after.error}`
            );
        } finally {
            await restore();
        }
    });

    suite.Test('XS5: B stays healthy across rapid successive writes in A (overlapping events must not leave it poisoned)', async () => {
        // The fix claims a refresh generation (beginConfigRefresh / isLatestConfigRefresh) because
        // materialization is async: without it two overlapping events can resolve out of order and
        // the STALE one assigns last. A single write cannot expose that; three back-to-back can.
        const restores: Array<() => Promise<void>> = [];
        try {
            for (let i = 0; i < 3; i++) {
                restores.push(await publishQueriesChangeFromA(`[mj-xserver-xs5-${i}]`));
            }
            await sleep(SETTLE_MS * 2); // all three events must settle, in whatever order they arrive
            const after = await tryRunQuery(b, userB, { QueryID: probe.ID });
            Assert(
                after.ok,
                looksLikePoisonedEngine(after.error)
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
