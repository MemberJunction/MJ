/**
 * scoped-anon-elevation.checks.ts — the 'scoped-anon-elevation' bundle (SA1–SA5).
 *
 * MJ issue #3371: the realtime relayed-tool path ran delegated work as the anonymous magic-link
 * visitor, whose role deliberately holds no grants on the AI run entities — so a scoped anonymous
 * session could not run an agent, and its observability runs were silently never created,
 * accumulated, or finalized. The fix (MJServer's `resolveScopedAnonymousRunUser`) swaps the AI-run
 * work onto the system user once ownership is proven.
 *
 * WHAT THIS BUNDLE PROVES — the permission-reality contract the fix rests on, against the real
 * database and the real role-driven permission engine, on BOTH sides of the identity swap:
 *  - SA1: a scoped anonymous principal (synthesized exactly as `buildMagicLinkSessionUser` does —
 *    zero roles) is DENIED Create on `MJ: AI Agent Runs` (the premise; if a deployment ever grants
 *    this, the elevation is moot and this fails loudly),
 *  - SA2: the elevation target exists and is sufficient — the real `UserCache` serves a system
 *    user whose role grants carry Create/Read/Update on the AI run entities,
 *  - SA3: an `AIAgentRun` written under the system user with `UserID` stamped to the VISITOR saves
 *    — elevation preserves visitor attribution (the `createCoAgentRun` shape),
 *  - SA4: finalize CONTRAST through the real `RealtimeClientSessionService.FinalizeCoAgentRun` —
 *    under the anonymous principal the run silently stays `Running` (the pre-fix symptom); under
 *    the system user it lands `Completed`,
 *  - SA5: usage CONTRAST through `AccumulatePromptRunUsage` — deltas are dropped under the
 *    anonymous principal (the "usage delta dropped" log symptom) and accumulate under the system
 *    user.
 *
 * WHAT IT DOES NOT RE-PROVE — the elevation ROUTING (which resolver/SessionManager seams swap the
 * identity, the widget-guest exclusion, fail-closed) is pinned by MJServer's unit tests
 * (`widgetGuestElevation.test.ts`, `RealtimeClientSessionResolver.test.ts`, `SessionManager.test.ts`);
 * importing `@memberjunction/server` here would couple this suite's loadability to server config
 * evaluation at import time, for coverage the unit tier already owns. The JWT→principal build is
 * likewise covered by MJServer's `magicLink.test.ts` — SA checks synthesize its exact output.
 *
 * Every fixture row is created and deleted (system-user, best-effort) inside the same check's
 * finally block, so the bundle is self-cleaning and needs no shared lifecycle.
 */
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJAIAgentRunEntity, MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { RealtimeClientSessionService } from '@memberjunction/ai-agents';
import { Assert, AssertEqual, IntegrationCheckRegistry, NamedCheck } from '@memberjunction/testing-integration';

/** The per-session resource-scope id a scoped anonymous invite carries (any UUID works — the scope's presence is what gates elevation). */
const SCOPE_RESOURCE_ID = 'A3371000-0000-4000-8000-000000000001';

/**
 * Synthesizes the scoped anonymous magic-link principal exactly as MJServer's
 * `buildMagicLinkSessionUser` does for an `mj_anon` token whose claimed role resolves to nothing:
 * a FRESH UserInfo over a real user record with ZERO roles, `IsMagicLinkAnonymous`, and a
 * `MagicLinkScope`. Zero roles ⇒ the role-driven permission engine denies every entity action —
 * the worst-case (and default) anonymous grant surface.
 */
function makeScopedAnonPrincipal(base: UserInfo): UserInfo {
    const md = Metadata.Provider; // global-provider-ok: integration test script — single-provider process by design
    const anon = new UserInfo(md, { ...base, _UserRoles: undefined, UserRoles: [] });
    anon.IsMagicLinkAnonymous = true;
    anon.MagicLinkScope = { ResourceID: SCOPE_RESOURCE_ID };
    return anon;
}

/** Simple-typed first-row ID lookup (RunView never throws; empty ⇒ undefined). */
async function firstID(entity: string, user: UserInfo): Promise<string | undefined> {
    const r = await new RunView().RunView<{ ID: string }>(
        { EntityName: entity, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, user,
    );
    return r.Success ? r.Results?.[0]?.ID : undefined;
}

/** The system user, or undefined when this deployment's user cache holds none. */
function systemUser(): UserInfo | undefined {
    return UserCache.Instance.GetSystemUser() ?? undefined;
}

/** Creates (unsaved) a minimal valid `MJ: AI Agent Runs` fixture entity under `user`. */
async function buildAgentRunFixture(user: UserInfo, agentID: string): Promise<MJAIAgentRunEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const run = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', user);
    run.NewRecord();
    run.AgentID = agentID;
    run.Status = 'Running';
    run.StartedAt = new Date();
    return run;
}

/**
 * Best-effort fixture cleanup — logged, never thrown.
 *
 * @param cleanupUser The principal to delete under: normally the system user, but callers on an
 * anomalous path may pass whichever principal created the row, so cleanup never depends on the
 * system user being resolvable.
 */
async function deleteFixture(
    entityName: 'MJ: AI Agent Runs' | 'MJ: AI Prompt Runs',
    id: string,
    cleanupUser: UserInfo,
): Promise<void> {
    try {
        const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
        const record = await md.GetEntityObject<MJAIAgentRunEntity | MJAIPromptRunEntity>(entityName, cleanupUser);
        if (await record.Load(id) && !(await record.Delete())) {
            console.warn(`  ⚠ scoped-anon-elevation: fixture Delete failed for ${entityName} ${id}: `
                + `${record.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    } catch (error) {
        console.warn(`  ⚠ scoped-anon-elevation: could not clean up ${entityName} fixture ${id}: `
            + `${error instanceof Error ? error.message : String(error)}`);
    }
}

/** Saves and returns the failure message from a Save that is EXPECTED to be denied ('' on success). */
async function attemptDeniedSave(entity: MJAIAgentRunEntity | MJAIPromptRunEntity): Promise<{ saved: boolean; message: string }> {
    try {
        const saved = await entity.Save();
        return { saved, message: saved ? '' : entity.LatestResult?.CompleteMessage ?? '(no failure message)' };
    } catch (error) {
        return { saved: false, message: error instanceof Error ? error.message : String(error) };
    }
}

export const ScopedAnonElevationChecks: NamedCheck[] = [
    {
        Id: 'scoped-anon-elevation.SA1',
        Name: 'SA1: a scoped anonymous principal (zero roles) is DENIED Create on MJ: AI Agent Runs',
        Fn: async (ctx): Promise<void> => {
            const agentID = await firstID('MJ: AI Agents', ctx.User);
            if (!agentID) {
                console.warn('  ⚠ scoped-anon-elevation.SA1 SKIPPED — no MJ: AI Agents seeded in this deployment');
                return;
            }
            const anon = makeScopedAnonPrincipal(ctx.User);
            const run = await buildAgentRunFixture(anon, agentID);
            const { saved, message } = await attemptDeniedSave(run);
            if (saved) {
                // Premise broken — this deployment grants an anonymous, role-less principal Create on
                // the AI run entities. Clean the accidental row up before failing loudly, falling back
                // to the principal that just created it so an unresolvable system user can't strand it.
                await deleteFixture('MJ: AI Agent Runs', run.ID, systemUser() ?? anon);
                Assert(false, 'a zero-role scoped anonymous principal was ALLOWED to create an MJ: AI Agent Runs row — '
                    + 'the permission premise behind scoped-anonymous elevation (issue #3371) does not hold here');
            }
            Assert(/permission/i.test(message),
                `expected a permission denial for the anonymous principal, got: ${message}`);
            console.log('      → anonymous Create on MJ: AI Agent Runs denied by the real permission engine');
        },
    },
    {
        Id: 'scoped-anon-elevation.SA2',
        Name: 'SA2: the elevation target exists — UserCache serves a system user with AI-run-entity grants',
        Fn: async (ctx): Promise<void> => {
            const sys = systemUser();
            Assert(!!sys, 'UserCache.GetSystemUser() returned nothing — scoped-anonymous elevation would fail closed '
                + 'on every request in this deployment (no system user seeded/cached)');
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            for (const entityName of ['MJ: AI Agent Runs', 'MJ: AI Prompt Runs', 'MJ: AI Agent Run Steps']) {
                const info = md.EntityByName(entityName);
                Assert(!!info, `entity '${entityName}' not found in metadata`);
                const perms = info!.GetUserPermisions(sys!);
                Assert(perms?.CanCreate === true && perms?.CanRead === true && perms?.CanUpdate === true,
                    `the system user lacks Create/Read/Update on '${entityName}' — elevated realtime observability would still fail `
                    + `(got Create=${perms?.CanCreate}, Read=${perms?.CanRead}, Update=${perms?.CanUpdate})`);
            }
            console.log(`      → system user '${sys!.Email}' holds Create/Read/Update on all three AI run entities`);
        },
    },
    {
        Id: 'scoped-anon-elevation.SA3',
        Name: 'SA3: an AIAgentRun written under the SYSTEM user keeps VISITOR attribution (UserID stamp)',
        Fn: async (ctx): Promise<void> => {
            const sys = systemUser();
            const agentID = await firstID('MJ: AI Agents', ctx.User);
            if (!sys || !agentID) {
                console.warn('  ⚠ scoped-anon-elevation.SA3 SKIPPED — needs a system user and a seeded MJ: AI Agents row');
                return;
            }
            const run = await buildAgentRunFixture(sys, agentID);
            // The elevated write stamps the VISITOR as the run owner — the createCoAgentRun /
            // delegated-run shape (`input.UserID || contextUser.ID` with the visitor's id threaded).
            run.UserID = ctx.User.ID;
            let runID: string | undefined;
            try {
                Assert(await run.Save(),
                    `elevated AIAgentRun create failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                runID = run.ID;
                const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
                const reloaded = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', sys);
                Assert(await reloaded.Load(runID), `could not reload the fixture run ${runID}`);
                Assert(UUIDsEqual(reloaded.UserID ?? '', ctx.User.ID),
                    `elevated run lost visitor attribution: UserID is ${reloaded.UserID}, expected ${ctx.User.ID}`);
                console.log('      → system-user write succeeded with the visitor stamped as run owner');
            } finally {
                if (runID) {
                    await deleteFixture('MJ: AI Agent Runs', runID, sys);
                }
            }
        },
    },
    {
        Id: 'scoped-anon-elevation.SA4',
        Name: 'SA4: FinalizeCoAgentRun contrast — silent no-op as the anonymous caller, Completed as the system user',
        Fn: async (ctx): Promise<void> => {
            const sys = systemUser();
            const agentID = await firstID('MJ: AI Agents', ctx.User);
            if (!sys || !agentID) {
                console.warn('  ⚠ scoped-anon-elevation.SA4 SKIPPED — needs a system user and a seeded MJ: AI Agents row');
                return;
            }
            const run = await buildAgentRunFixture(sys, agentID);
            let runID: string | undefined;
            try {
                Assert(await run.Save(), `fixture AIAgentRun create failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                runID = run.ID;
                const svc = new RealtimeClientSessionService();
                const anon = makeScopedAnonPrincipal(ctx.User);
                const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design

                // Pre-fix reality: finalizing under the anonymous principal cannot even LOAD the run —
                // the tolerant helper skips silently (or the permission engine throws; either way, no write).
                try {
                    await svc.FinalizeCoAgentRun(runID, null, anon, ctx.Provider, true, null);
                } catch {
                    // a thrown permission denial is an acceptable shape of "did nothing"
                }
                const afterAnon = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', sys);
                Assert(await afterAnon.Load(runID), `could not reload the fixture run ${runID}`);
                AssertEqual(afterAnon.Status, 'Running',
                    'finalize under the anonymous principal should be a silent no-op, but the run status changed');

                // The fix's identity: finalizing under the system user completes the run.
                await svc.FinalizeCoAgentRun(runID, null, sys, ctx.Provider, true, null);
                const afterSys = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', sys);
                Assert(await afterSys.Load(runID), `could not reload the fixture run ${runID}`);
                AssertEqual(afterSys.Status, 'Completed', 'finalize under the system user should complete the run');
                AssertEqual(afterSys.Success, true, 'finalize under the system user should stamp Success');
                console.log('      → finalize no-ops as the anonymous caller and lands Completed as the system user');
            } finally {
                if (runID) {
                    await deleteFixture('MJ: AI Agent Runs', runID, sys);
                }
            }
        },
    },
    {
        Id: 'scoped-anon-elevation.SA5',
        Name: 'SA5: AccumulatePromptRunUsage contrast — deltas dropped as the anonymous caller, accumulated as the system user',
        Fn: async (ctx): Promise<void> => {
            const sys = systemUser();
            const [promptID, modelID, vendorID] = await Promise.all([
                firstID('MJ: AI Prompts', ctx.User),
                firstID('MJ: AI Models', ctx.User),
                firstID('MJ: AI Vendors', ctx.User),
            ]);
            if (!sys || !promptID || !modelID || !vendorID) {
                console.warn('  ⚠ scoped-anon-elevation.SA5 SKIPPED — needs a system user plus seeded AI Prompts/Models/Vendors');
                return;
            }
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const promptRun = await md.GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', sys);
            promptRun.NewRecord();
            promptRun.PromptID = promptID;
            promptRun.ModelID = modelID;
            promptRun.VendorID = vendorID;
            promptRun.RunAt = new Date();
            promptRun.RunType = 'Single';
            promptRun.Status = 'Running';
            let promptRunID: string | undefined;
            try {
                Assert(await promptRun.Save(),
                    `fixture AIPromptRun create failed: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                promptRunID = promptRun.ID;
                const svc = new RealtimeClientSessionService();
                const anon = makeScopedAnonPrincipal(ctx.User);

                // Pre-fix reality: the usage delta is DROPPED under the anonymous principal.
                let anonResult = false;
                try {
                    anonResult = await svc.AccumulatePromptRunUsage(promptRunID, 100, 25, anon, ctx.Provider);
                } catch {
                    // a thrown permission denial is an acceptable shape of "dropped"
                }
                Assert(anonResult === false, 'usage accumulation under the anonymous principal should report failure');
                const afterAnon = await md.GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', sys);
                Assert(await afterAnon.Load(promptRunID), `could not reload the fixture prompt run ${promptRunID}`);
                Assert(!afterAnon.TokensPrompt && !afterAnon.TokensCompletion,
                    `usage delta landed under the anonymous principal (TokensPrompt=${afterAnon.TokensPrompt}) — expected it dropped`);

                // The fix's identity: the delta accumulates under the system user.
                Assert(await svc.AccumulatePromptRunUsage(promptRunID, 100, 25, sys, ctx.Provider),
                    'usage accumulation under the system user should succeed');
                const afterSys = await md.GetEntityObject<MJAIPromptRunEntity>('MJ: AI Prompt Runs', sys);
                Assert(await afterSys.Load(promptRunID), `could not reload the fixture prompt run ${promptRunID}`);
                AssertEqual(afterSys.TokensPrompt, 100, 'TokensPrompt should accumulate under the system user');
                AssertEqual(afterSys.TokensCompletion, 25, 'TokensCompletion should accumulate under the system user');
                console.log('      → usage delta dropped as the anonymous caller and accumulated as the system user');
            } finally {
                if (promptRunID) {
                    await deleteFixture('MJ: AI Prompt Runs', promptRunID, sys);
                }
            }
        },
    },
];

for (const check of ScopedAnonElevationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
