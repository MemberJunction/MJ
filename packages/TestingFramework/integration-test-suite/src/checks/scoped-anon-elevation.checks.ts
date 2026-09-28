/**
 * scoped-anon-elevation.checks.ts — the 'scoped-anon-elevation' bundle (SA1–SA6).
 *
 * MJ issue #3371: the realtime relayed-tool path ran delegated work as the anonymous magic-link
 * visitor, whose role deliberately holds no grants on the AI run entities — so a scoped anonymous
 * session could not run an agent, and its observability runs were silently never created,
 * accumulated, or finalized. The fix (MJServer's `ResolveScopedAnonymousRunUser`) swaps the AI-run
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
 *    user,
 *  - SA6 (MJ#4791): the elevation's BOUNDARY — hidden `realtime_tool_execution` conversation
 *    details must NOT be elevated. On a conversation owned by the core-seeded magic-link
 *    Anonymous user, the conversation owner gate (`MJConversationDetailEntityExtended`) refuses
 *    the row written as the system user AND reports why; written as the visitor principal
 *    (Anonymous + a synthesized claimed `UI` role, as `buildMagicLinkSessionUser` builds it), the
 *    same row saves.
 *
 * WHAT IT DOES NOT RE-PROVE — the elevation ROUTING (which resolver/SessionManager seams swap the
 * identity, the widget-guest exclusion, fail-closed) is pinned by MJServer's unit tests
 * (`widgetGuestElevation.test.ts`, `RealtimeClientSessionResolver.test.ts`, `SessionManager.test.ts`);
 * importing `@memberjunction/server` here would couple this suite's loadability to server config
 * evaluation at import time, for coverage the unit tier already owns. The JWT→principal build is
 * likewise covered by MJServer's `magicLink.test.ts` — SA checks synthesize its exact output.
 *
 * Every fixture row is created and deleted (best-effort) inside the same check's finally block, so
 * the bundle is self-cleaning and needs no shared lifecycle. SA1–SA5 clean up as the system user;
 * SA6 cleans up as the visitor principal that owns its conversation, because the owner gate
 * refuses the system user's Delete exactly as it refuses its Save.
 */
import { Metadata, RoleInfo, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRunEntity,
    MJAIPromptRunEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RealtimeClientSessionService } from '@memberjunction/ai-agents';
import { Assert, AssertEqual, IntegrationCheckRegistry, NamedCheck } from '@memberjunction/testing-integration';

/** The reason `MJConversationDetailEntityExtended`'s owner gate records for a non-owner without a grant. */
const CONVERSATION_ACCESS_DENIED = 'You do not have access to this conversation.';

/** The per-session resource-scope id a scoped anonymous invite carries (any UUID works — the scope's presence is what gates elevation). */
const SCOPE_RESOURCE_ID = 'A3371000-0000-4000-8000-000000000001';

/** Email of the shared magic-link Anonymous user core MJ seeds (V202606071200__v5.40.x__Magic_Link.sql). */
const MAGIC_LINK_ANONYMOUS_EMAIL = 'anonymous@magic-link.local';

/** The core role SA6's visitor token claims — core grants it Create on `MJ: Conversation Details` with no RLS. */
const VISITOR_CLAIMED_ROLE = 'UI';

/**
 * Synthesizes the scoped anonymous magic-link principal exactly as MJServer's
 * `buildMagicLinkSessionUser` does for an `mj_anon` token: a FRESH UserInfo over `base` whose
 * roles are ONLY the token's claimed roles (never the record's DB roles), plus
 * `IsMagicLinkAnonymous` and a `MagicLinkScope`.
 *
 * @param claimedRoles The roles the token's claim resolved to. Empty (SA1) is the claim that
 * resolves to nothing — zero roles, so the role-driven permission engine denies every entity action,
 * the worst-case (and default) anonymous grant surface.
 */
function makeScopedAnonPrincipal(base: UserInfo, claimedRoles: RoleInfo[] = []): UserInfo {
    const md = Metadata.Provider; // global-provider-ok: integration test script — single-provider process by design
    const anon = new UserInfo(md, {
        ...base,
        _UserRoles: undefined,
        UserRoles: claimedRoles.map((role) => ({ UserID: base.ID, RoleID: role.ID, RoleName: role.Name })),
    });
    anon.IsMagicLinkAnonymous = true;
    anon.MagicLinkScope = { ResourceID: SCOPE_RESOURCE_ID };
    return anon;
}

/** The core-seeded magic-link Anonymous user, or undefined when this deployment does not carry it. */
function findMagicLinkAnonymousUser(): UserInfo | undefined {
    return UserCache.Instance.Users.find((u) => u.Email?.trim().toLowerCase() === MAGIC_LINK_ANONYMOUS_EMAIL);
}

/** A role by name, resolved from `Metadata.Provider.Roles` the way `buildMagicLinkSessionUser` resolves a claim. */
function findRoleByName(name: string): RoleInfo | undefined {
    const md = Metadata.Provider; // global-provider-ok: integration test script — single-provider process by design
    return md?.Roles.find((r) => r.Name?.trim().toLowerCase() === name.trim().toLowerCase());
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
 * Creates (unsaved) the hidden tool-execution turn `persistDirectActionTurn` writes, under `user`.
 * The same field values are built for every principal SA6 tries, so the principal is the only
 * difference between the refused save and the accepted one.
 */
async function buildHiddenToolTurnFixture(
    user: UserInfo,
    conversationID: string,
    ownerID: string,
): Promise<MJConversationDetailEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', user);
    detail.NewRecord();
    detail.ConversationID = conversationID;
    detail.Role = 'AI';
    detail.HiddenToUser = true;
    detail.UserID = ownerID;
    detail.Status = 'Complete';
    detail.Message = JSON.stringify({
        type: 'realtime_tool_execution',
        callId: null,
        toolName: 'scoped-anon-elevation.SA6',
        argsJson: null,
        resultJson: null,
        success: true,
        durationMs: 0,
    });
    return detail;
}

/**
 * Best-effort fixture cleanup — logged, never thrown.
 *
 * @param cleanupUser The principal to delete under: normally the system user, but callers on an
 * anomalous path may pass whichever principal created the row, so cleanup never depends on the
 * system user being resolvable.
 */
async function deleteFixture(
    entityName: 'MJ: AI Agent Runs' | 'MJ: AI Prompt Runs' | 'MJ: Conversation Details' | 'MJ: Conversations',
    id: string,
    cleanupUser: UserInfo,
): Promise<void> {
    try {
        const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
        const record = await md.GetEntityObject<
            MJAIAgentRunEntity | MJAIPromptRunEntity | MJConversationDetailEntity | MJConversationEntity
        >(entityName, cleanupUser);
        if (await record.Load(id) && !(await record.Delete())) {
            console.warn(`  ⚠ scoped-anon-elevation: fixture Delete failed for ${entityName} ${id}: `
                + `${record.LatestResult?.CompleteMessage ?? '(Delete returned false with no LatestResult)'}`);
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
    {
        Id: 'scoped-anon-elevation.SA6',
        Name: 'SA6: a hidden realtime tool-execution turn is REFUSED (with a reason) as the system user and saved as the visitor who owns the conversation',
        /**
         * The contract behind MJ#4791. The realtime resolver used to write these rows as the
         * elevated system user; the conversation owner gate refused it, and — because the gate's
         * denial was dropped on a new record — `Save()` returned false with a NULL `LatestResult`.
         *
         * PRINCIPALS — built the way production builds them, independent of `ctx.User` (which is
         * itself the system user in the standard tier):
         *  - OWNER: the core-seeded magic-link Anonymous user, synthesized as `buildMagicLinkSessionUser`
         *    does for an `mj_anon` token claiming core's `UI` role (fresh UserInfo, synthesized role,
         *    `IsMagicLinkAnonymous`, `MagicLinkScope`). `UI` grants Create/Read/Update/Delete on both
         *    `MJ: Conversations` and `MJ: Conversation Details` with no RLS filter, so this one
         *    principal creates the conversation (as the visitor does in production — the Conversations
         *    entity has no owner gate, so the system user could too, but that would not be faithful),
         *    writes the accepted row, and deletes every fixture row.
         *  - REFUSED WRITER: the system user — a non-owner with no Resource Permission grant.
         *
         * SKIPPED only when this deployment lacks the system user, the Anonymous user, or the `UI` role.
         */
        Fn: async (): Promise<void> => {
            const sys = systemUser();
            const anonymousUser = findMagicLinkAnonymousUser();
            const claimedRole = findRoleByName(VISITOR_CLAIMED_ROLE);
            if (!sys || !anonymousUser || !claimedRole) {
                console.warn('  ⚠ scoped-anon-elevation.SA6 SKIPPED — needs a system user, the magic-link Anonymous user '
                    + `(${MAGIC_LINK_ANONYMOUS_EMAIL}) and the '${VISITOR_CLAIMED_ROLE}' role`);
                return;
            }
            const owner = makeScopedAnonPrincipal(anonymousUser, [claimedRole]);
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', owner);
            conversation.NewRecord();
            conversation.Name = 'scoped-anon-elevation.SA6 fixture';
            conversation.UserID = owner.ID;
            let conversationID: string | undefined;
            const detailIDs: string[] = [];
            try {
                Assert(await conversation.Save(),
                    `creating the SA6 fixture conversation as the visitor principal failed: `
                    + `${conversation.LatestResult?.CompleteMessage ?? '(Save returned false with no LatestResult)'}`);
                conversationID = conversation.ID;

                // Pre-fix write principal: the system user is refused by the owner gate, and the
                // refusal is REPORTED (it used to leave a NULL LatestResult — "unknown error").
                const asSystem = await buildHiddenToolTurnFixture(sys, conversationID, owner.ID);
                const systemSaved = await asSystem.Save();
                if (systemSaved) {
                    detailIDs.push(asSystem.ID);
                }
                Assert(!systemSaved, 'the system user was ALLOWED to write a hidden tool turn on a conversation it does not own — '
                    + 'the owner gate premise behind MJ#4791 does not hold here');
                Assert(asSystem.LatestResult !== null && asSystem.LatestResult !== undefined,
                    'the system user\'s refused save left LatestResult null — the owner gate\'s denial was dropped again (MJ#4791)');
                AssertEqual(asSystem.LatestResult?.CompleteMessage, CONVERSATION_ACCESS_DENIED,
                    'the system user\'s refused save should carry the owner gate\'s denial reason');

                // The fix's principal: the visitor who owns the conversation writes the same row.
                const asOwner = await buildHiddenToolTurnFixture(owner, conversationID, owner.ID);
                const ownerSaved = await asOwner.Save();
                if (ownerSaved) {
                    detailIDs.push(asOwner.ID);
                }
                Assert(ownerSaved,
                    `saving the hidden tool turn as the visitor principal (conversation owner) failed: `
                    + `${asOwner.LatestResult?.CompleteMessage ?? '(Save returned false with no LatestResult)'}`);
                console.log('      → hidden tool turn refused with a reason as the system user, saved as the '
                    + `visitor (Anonymous + claimed '${VISITOR_CLAIMED_ROLE}') who owns the conversation`);
            } finally {
                // As the owner: the owner gate refuses the system user's Delete just as it refuses its
                // Save, and the claimed UI role grants Delete on both entities.
                for (const detailID of detailIDs) {
                    await deleteFixture('MJ: Conversation Details', detailID, owner);
                }
                if (conversationID) {
                    await deleteFixture('MJ: Conversations', conversationID, owner);
                }
            }
        },
    },
];

for (const check of ScopedAnonElevationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
