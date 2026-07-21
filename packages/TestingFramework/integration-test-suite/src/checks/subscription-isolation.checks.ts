/**
 * subscription-isolation.checks.ts — the 'subscription-isolation' bundle (SI1–SI2): live proof of
 * PUB/SUB CHANNEL ISOLATION for MJ's GraphQL subscriptions (test-catalog Domain 3, SEC6/SEC7).
 *
 * TRANSPORT: **CLIENT** (needs a live MJAPI), parked exactly like `remote-op-wire-progress` — the
 * client dispatcher skips the whole bundle cleanly when MJAPI is unreachable (Setup creates its
 * fixtures over the wire, so an unreachable server fails Setup and the bundle is parked).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS (AND IS NOT) HEADLESSLY REACHABLE — READ THIS
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * MJ has three subscription channels, with three DIFFERENT isolation postures (all filters are
 * INLINE arrow functions inside `@Subscription` decorators in `@memberjunction/server`, none of them
 * separately exported):
 *
 *   1. `RemoteOperationProgress` — filter `payload.ChannelId === args.channelId`, where `channelId`
 *      is a fresh **unguessable per-call UUID** the client mints for each operation. This is the
 *      CORRECTLY-isolated channel: the routing key is a per-invocation secret, not a stable user
 *      identifier. THIS is the only channel a headless client can prove non-vacuously — SI1 does.
 *   2. `statusUpdates` (PUSH_STATUS_UPDATES) — filter `payload.sessionId === args.sessionId`, where
 *      `args.sessionId` is a **client-supplied subscription variable that the server trusts without
 *      checking the connected identity** (the WS connection's own `sessionId` is hard-wired to the
 *      string `'default'`). ⚠ SECURITY FINDING (SEC6): a subscriber that supplies ANOTHER user's
 *      sessionId is delivered that user's payloads. Proving this needs TWO authenticated identities on
 *      one live socket — the integration client authenticates with a SINGLE system API key, so this
 *      cross-user leak is NOT reproducible here.
 *   3. `cacheInvalidation` — ⚠ SECURITY FINDING (SEC7): **NO filter at all**. Every connected browser
 *      receives every tenant's entity-change payloads, and the payload carries `RecordData`
 *      (a full `GetAll()` of the saved row) — a cross-tenant row-content broadcast.
 *
 * The server-side filters for (2) and (3) cannot be imported into a check file: `@memberjunction/server`
 * VALIDATES DB config at MODULE LOAD and throws when it is absent, which would crash THIS package's own
 * registry unit tests (they enumerate the barrel with no DB configured). So SI2 documents (2)+(3) as a
 * loud, precise OMISSION rather than asserting something vacuous. See its body for the exact anchors.
 *
 * SI1 is the substance: a real, non-vacuous, over-the-wire proof of channel #1's isolation.
 *
 * FIXTURES: created over the wire in Setup (2 Action Categories + a 0-effect FieldRules Record Process,
 * mirroring the `remote-op-wire-progress` fixtures) and torn down after. Held in a module-level handle
 * so the bundle does not have to widen the shared `IntegrationCheckContext` contract.
 */
import { RunView } from '@memberjunction/core';
import type { RemoteOpProgress } from '@memberjunction/core';
import {
    MJActionCategoryEntity,
    MJRecordProcessEntity,
    MJProcessRunEntity,
    RecordProcessRunNowOperation
} from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const ACT_ENTITY = 'MJ: Action Categories';
const PREFIX = 'mj-subscription-isolation';
const TEST_TAG = '(mj-integration-test — safe to delete)';

/**
 * The bundle's over-the-wire fixtures, held at module scope (Setup populates, checks read, Teardown
 * clears) so the bundle need not add a typed field to the shared `IntegrationCheckContext`. Bundles
 * run sequentially, so a single module-level handle is safe (mirrors permission-engine's memo).
 */
let fixture: { RpId: string; CatIds: string[] } | null = null;

/** Loud, uniform skip-as-pass note. Returns false so a caller can `if (!skip(...)) return;`. */
function skipNote(checkId: string, reason: string): false {
    console.warn(`  ⚠ subscription-isolation.${checkId} SKIPPED — ${reason}`);
    return false;
}

/** Collected progress for one operation, with the discriminators SI1 uses to detect cross-channel leaks. */
interface OpProbe {
    Label: string;
    ExpectedProcessed: number;
    Events: RemoteOpProgress[];
    Processed?: number;
}

/**
 * Run one RemoteOperation (RecordProcess.RunNow, dry-run) over the wire against a fixed set of record
 * ids, collecting every progress event its OWN `onProgress` callback receives. If the server's
 * per-channel filter is honest, this callback receives ONLY events for this invocation's channel.
 */
async function runOp(rpId: string, recordIds: string[], label: string): Promise<OpProbe> {
    const probe: OpProbe = { Label: label, ExpectedProcessed: recordIds.length, Events: [] };
    const result = await new RecordProcessRunNowOperation().Execute(
        { recordProcessID: rpId, dryRun: true, scope: { Kind: 'records', RecordIDs: recordIds } },
        { onProgress: (p) => probe.Events.push(p) }
    );
    Assert(result.Success, `op '${label}' failed over the wire: ${result.ErrorMessage}`);
    probe.Processed = result.Output?.processed;
    return probe;
}

/** The set of distinct `Handle`s present across an op's events (a run-scoped id → per-channel marker). */
function handlesOf(probe: OpProbe): Set<string> {
    return new Set(probe.Events.map(e => e.Handle).filter((h): h is string => typeof h === 'string' && h.length > 0));
}

/** The set of distinct `Total`s present across an op's events (the record count → per-op marker). */
function totalsOf(probe: OpProbe): Set<number> {
    return new Set(probe.Events.map(e => e.Total).filter((t): t is number => typeof t === 'number'));
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// checks
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * SI1 ★ — RemoteOperationProgress channel isolation over the REAL wire.
 *
 * Two RemoteOperations are fired CONCURRENTLY, each processing a DIFFERENT number of records (1 vs 2)
 * and each with its own `onProgress` collector. The server publishes both ops' progress onto the one
 * shared `RemoteOperationProgress` topic; the inline filter `payload.ChannelId === args.channelId`
 * must route each op's events ONLY to that op's subscription. The proof is by CONTRADICTION: if the
 * filter leaked (e.g. broadcast to all subscribers), one op's collector would receive events bearing
 * the OTHER op's discriminator.
 *
 * Two independent, non-vacuous assertions:
 *   (a) RESULT ROUTING — each caller's `Output.processed` equals its OWN record count (1 vs 2), proving
 *       the mutation result returned to the right caller (this leg never degrades).
 *   (b) PROGRESS ISOLATION — each collector's events carry ONLY that op's discriminator. Preferred
 *       discriminator is `Handle` (the per-run ProcessRunID); falls back to `Total` (the record count).
 *       If the server emits progress with NEITHER discriminator, (b) skips-as-pass with a loud note
 *       while (a) still stands — never a vacuous pass, never a false failure.
 */
export async function CheckSi1_RemoteOpChannelIsolation(ctx: IntegrationCheckContext): Promise<void> {
    if (!fixture) {
        skipNote('SI1', 'fixture missing (bundle Setup did not run — MJAPI likely unreachable)');
        return;
    }
    const { RpId, CatIds } = fixture;
    Assert(CatIds.length >= 2, `need >= 2 fixture records, have ${CatIds.length}`);

    // Concurrent so BOTH subscriptions are open while BOTH ops publish — the only way a cross-channel
    // leak becomes observable.
    const [opA, opB] = await Promise.all([
        runOp(RpId, [CatIds[0]], 'A(1 record)'),
        runOp(RpId, [CatIds[0], CatIds[1]], 'B(2 records)')
    ]);

    // (a) result routing — each caller got its OWN processed count back.
    AssertEqual(opA.Processed, 1, `op A processed count mis-routed over the wire: ${opA.Processed}`);
    AssertEqual(opB.Processed, 2, `op B processed count mis-routed over the wire: ${opB.Processed}`);

    Assert(opA.Events.length >= 1, `op A received no progress events (${opA.Events.length})`);
    Assert(opB.Events.length >= 1, `op B received no progress events (${opB.Events.length})`);
    for (const e of [...opA.Events, ...opB.Events]) {
        AssertEqual(e.OperationKey, 'RecordProcess.RunNow', `unexpected progress OperationKey: ${e.OperationKey}`);
    }

    // (b) progress isolation — prefer Handle, then Total.
    const handlesA = handlesOf(opA);
    const handlesB = handlesOf(opB);
    if (handlesA.size > 0 && handlesB.size > 0) {
        AssertEqual(handlesA.size, 1, `op A saw ${handlesA.size} distinct run Handles — foreign progress leaked into its channel (SECURITY): ${[...handlesA].join(', ')}`);
        AssertEqual(handlesB.size, 1, `op B saw ${handlesB.size} distinct run Handles — foreign progress leaked into its channel (SECURITY): ${[...handlesB].join(', ')}`);
        const [ha] = [...handlesA];
        const [hb] = [...handlesB];
        Assert(ha !== hb, `both ops reported the SAME run Handle '${ha}' — cannot prove channel separation`);
        Assert(!handlesB.has(ha) && !handlesA.has(hb), `an op received the OTHER op's run Handle — channel filter leaked (SECURITY)`);
        console.log(`      → concurrent ops isolated by channel: A.Handle=${ha} B.Handle=${hb}; processed 1 vs 2 correctly routed`);
        return;
    }

    const totalsA = totalsOf(opA);
    const totalsB = totalsOf(opB);
    if (totalsA.size > 0 && totalsB.size > 0) {
        Assert(!totalsA.has(2), `op A (1 record) received a progress event with Total=2 — op B's progress leaked into A's channel (SECURITY)`);
        Assert(!totalsB.has(1), `op B (2 records) received a progress event with Total=1 — op A's progress leaked into B's channel (SECURITY)`);
        console.log(`      → concurrent ops isolated by Total: A.totals={${[...totalsA]}} B.totals={${[...totalsB]}}; result routing 1 vs 2 correct`);
        return;
    }

    skipNote('SI1', 'progress events carried neither Handle nor Total — cannot discriminate channels; result-routing leg (a) passed');
}

/**
 * SI2 — DOCUMENTED OMISSION: the cross-USER `statusUpdates` leak (SEC6) and the unfiltered
 * `cacheInvalidation` broadcast (SEC7) are NOT headlessly reproducible here. This check does not
 * assert against a fabricated surface — it records precisely WHY, so the gap is visible in every run
 * and a future harness (a real dual-identity WS rig) knows exactly what to build. It is a skip-as-pass
 * marker for a GENUINE gap, not a filler assertion.
 *
 * THE TWO FINDINGS (research-confirmed against `@memberjunction/server`):
 *   • SEC6 — `PushStatusResolver.statusUpdates` filters `payload.sessionId === args.sessionId`, trusting
 *     the CLIENT-SUPPLIED `sessionId` subscription variable. The WS connection context's own sessionId
 *     is hard-wired to `'default'` (context.ts `getUserPayload` is called with an undefined sessionId),
 *     so the server never compares against the authenticated identity. A subscriber that passes another
 *     user's sessionId (`GraphQLDataProvider.PushStatusUpdates(<victim sessionId>)`) receives that
 *     user's payloads. Reproduction needs TWO authenticated identities on one live socket; the
 *     integration client authenticates with a SINGLE system API key, so it cannot mint a second victim.
 *   • SEC7 — `CacheInvalidationResolver.cacheInvalidation` has NO `filter`; every connected browser
 *     receives every tenant's entity-change events, and the payload includes `RecordData`
 *     (a full `GetAll()` of the mutated row). Characterizing the cross-tenant broadcast requires two
 *     authenticated sockets on distinct tenants — again beyond the single-identity client transport.
 *
 * WHY NOT ASSERT THE FILTERS DIRECTLY: both filters are inline arrow functions inside `@Subscription`
 * decorators in `@memberjunction/server` (not separately exported). Importing that package into a check
 * file is impossible — its barrel validates DB config at module load and throws when absent, which
 * would crash this package's registry unit tests (they import the barrel with no DB configured). SI1
 * already exercises the ONE channel (`RemoteOperationProgress`) whose isolation IS reachable over the
 * wire; these two remain a documented live-WS omission.
 */
export async function CheckSi2_ServerFilterOmission(ctx: IntegrationCheckContext): Promise<void> {
    skipNote('SI2',
        'cross-user statusUpdates leak (SEC6) + unfiltered cacheInvalidation broadcast (SEC7) require a ' +
        'dual-identity live WebSocket; the single-system-API-key client transport cannot reproduce them, ' +
        'and the inline server filters are un-importable (the @memberjunction/server barrel throws on ' +
        'config-less module load). See this check\'s doc comment for the exact anchors. SI1 covers the ' +
        'RemoteOperationProgress channel, which IS wire-reachable.');
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// registration
// ─────────────────────────────────────────────────────────────────────────────────────────

export const SubscriptionIsolationChecks: NamedCheck[] = [
    { Id: 'subscription-isolation.SI1', Name: 'SI1: concurrent RemoteOperationProgress channels stay isolated over the wire (no cross-channel progress leak)', Fn: CheckSi1_RemoteOpChannelIsolation },
    { Id: 'subscription-isolation.SI2', Name: 'SI2: cross-user statusUpdates + unfiltered cacheInvalidation are a documented live-WS omission (SEC6/SEC7)', Fn: CheckSi2_ServerFilterOmission }
];

for (const check of SubscriptionIsolationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/**
 * Bundle lifecycle (client transport). Setup creates the fixtures over the wire — 2 Action Categories
 * plus a 0-effect FieldRules Record Process (mirrors `remote-op-wire-progress`). A mid-Setup crash
 * leaves the module-level handle populated so Teardown can sweep partials. Teardown deletes the process
 * runs + details it produced, then the Record Process and the categories, best-effort.
 */
IntegrationCheckRegistry.Instance.RegisterLifecycle('subscription-isolation', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const provider = ctx.Provider;
        const user = ctx.User;
        const entityID = provider.EntityByName(ACT_ENTITY)!.ID;
        const catIds: string[] = [];
        fixture = { RpId: '', CatIds: catIds };
        for (const n of [1, 2]) {
            const cat = await provider.GetEntityObject<MJActionCategoryEntity>(ACT_ENTITY, user);
            cat.NewRecord();
            cat.Name = `${PREFIX}-cat-${n}`;
            cat.Status = 'Active';
            Assert(await cat.Save(), `creating fixture category ${n} failed: ${cat.LatestResult?.CompleteMessage}`);
            catIds.push(cat.ID);
        }
        const ruleSet = { Rules: [{ TargetField: 'Description', Source: { Kind: 'formula', Expression: "fields.Name + ' — iso'" } }] };
        const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', user);
        rp.NewRecord();
        rp.Name = `${PREFIX}-record-process ${TEST_TAG}`;
        rp.EntityID = entityID;
        rp.Status = 'Active';
        rp.WorkType = 'FieldRules';
        rp.ScopeType = 'Filter';
        rp.ScopeFilter = '1 = 0';
        rp.Configuration = JSON.stringify(ruleSet);
        rp.BatchSize = 10;
        Assert(await rp.Save(), `creating the FieldRules Record Process failed: ${rp.LatestResult?.CompleteMessage}`);
        fixture.RpId = rp.ID;
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) {
            return;
        }
        const provider = ctx.Provider;
        const user = ctx.User;
        if (fixture.RpId) {
            const runRes = await new RunView().RunView<MJProcessRunEntity>(
                { EntityName: 'MJ: Process Runs', ExtraFilter: `RecordProcessID='${fixture.RpId}'`, ResultType: 'entity_object' }, user
            );
            for (const run of runRes.Results ?? []) {
                const details = await new RunView().RunView<MJProcessRunEntity>(
                    { EntityName: 'MJ: Process Run Details', ExtraFilter: `ProcessRunID='${run.ID}'`, ResultType: 'entity_object' }, user
                );
                for (const d of details.Results ?? []) {
                    await d.Delete().catch(() => undefined);
                }
                await run.Delete().catch(() => undefined);
            }
            const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', user);
            if (await rp.Load(fixture.RpId)) {
                await rp.Delete().catch(() => undefined);
            }
        }
        for (const id of fixture.CatIds) {
            const cat = await provider.GetEntityObject<MJActionCategoryEntity>(ACT_ENTITY, user);
            if (await cat.Load(id)) {
                await cat.Delete().catch(() => undefined);
            }
        }
        fixture = null;
    }
});
