/**
 * realtime-session-guard.checks.ts — the 'realtime-session-guard' bundle (RSG1–RSG2).
 *
 * TRANSPORT: **SERVER** (in-process, SQL provider). This is the doctrine's "no client surface" exception
 * and it is narrow on purpose: the only thing here that cannot be done over the wire is *writing*
 * server-decided session state, because `MJAIAgentSessionEntityServer` refuses every writer that is not
 * inside `RunWithTrustedSessionConfigWrites` — the session's owner over the wire included. Everything
 * else about realtime session verification is driven over the wire by `realtime-session-verification`
 * (client transport, sequenced after this bundle: the first client bundle rebinds the process-global
 * provider, so server bundles must come first — issue #3251).
 *
 * | Check | Proves |
 * |---|---|
 * | RSG1 | the guard, in-process: the owner's direct Save cannot forge `identityVerification` or move `maxSessionDeadlineIso`; an ordinary Config edit still works; a trusted write succeeds |
 * | RSG2 | seeds the two sessions the wire bundle needs (a deadline + policy snapshot; a business-domain-only policy) and hands their ids over via `realtime-session-fixtures-state` |
 *
 * The seeded rows are deliberately NOT deleted here: the wire bundle uses them next and deletes them in
 * its Teardown. A run that never reaches the wire bundle (MJAPI down) leaves two tagged rows, which the
 * next RSG2 sweeps before seeding. Both checks write, so both are `RequiresMutation`.
 *
 * NOTE: could not be executed where it was authored (no database); it type-checks and is registered.
 */
import { BaseEntity, Metadata, ProviderType, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal } from '@memberjunction/global';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { RunWithTrustedSessionConfigWrites } from '@memberjunction/core-entities-server';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    REALTIME_SESSION_FIXTURE_TAG,
    SEEDED_UNVERIFIED_MAX_SECONDS,
    SEEDED_VERIFIED_MAX_SECONDS,
    SetSeededRealtimeSessions,
} from './realtime-session-fixtures-state';

const SESSION_ENTITY = 'MJ: AI Agent Sessions';

/** Whether the server-side session guard is the registered subclass for this process. */
function sessionGuardActive(ctx: IntegrationCheckContext): boolean {
    if (ctx.Provider.ProviderType === ProviderType.Network) {
        return true;
    }
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, SESSION_ENTITY);
    const subclass: unknown = registration?.SubClass;
    return typeof subclass === 'function' && /Server/.test((subclass as { name: string }).name);
}

async function firstAgentID(user: UserInfo): Promise<string | undefined> {
    const r = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
        user,
    );
    return r.Success ? r.Results?.[0]?.ID : undefined;
}

/** Creates (does not save) a tagged session owned by the context user. */
async function newSession(ctx: IntegrationCheckContext, agentID: string, config: Record<string, unknown>): Promise<MJAIAgentSessionEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const session = await md.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, ctx.User);
    session.NewRecord();
    session.AgentID = agentID;
    session.UserID = ctx.User.ID;
    session.Status = 'Active';
    session.LastActiveAt = new Date();
    session.Config_ = JSON.stringify({ tag: REALTIME_SESSION_FIXTURE_TAG, ...config });
    return session;
}

/** Saves a session carrying server-decided keys, the only way that is allowed: inside the trusted scope. */
async function saveTrusted(session: MJAIAgentSessionEntity): Promise<void> {
    const saved = await RunWithTrustedSessionConfigWrites(() => session.Save());
    Assert(saved, `trusted session save failed: ${session.LatestResult?.CompleteMessage}`);
}

async function reload(sessionId: string, user: UserInfo): Promise<MJAIAgentSessionEntity> {
    const r = await new RunView().RunView<MJAIAgentSessionEntity>(
        { EntityName: SESSION_ENTITY, ExtraFilter: `ID='${sessionId}'`, ResultType: 'entity_object', BypassCache: true },
        user,
    );
    const row = r.Results?.[0];
    Assert(r.Success && !!row, `session ${sessionId} did not read back: ${r.ErrorMessage ?? 'no row'}`);
    return row!;
}

function configOf(session: MJAIAgentSessionEntity): Record<string, unknown> {
    return JSON.parse(session.Config_ ?? '{}') as Record<string, unknown>;
}

/** Deletes tagged fixture sessions a previous run left behind (a run that never reached the wire bundle). */
async function sweepLeftovers(ctx: IntegrationCheckContext): Promise<number> {
    const r = await new RunView().RunView<MJAIAgentSessionEntity>(
        {
            EntityName: SESSION_ENTITY,
            ExtraFilter: `Config LIKE '%${EscapeSQLString(REALTIME_SESSION_FIXTURE_TAG)}%' AND Config LIKE '%realtime-session-verification%'`,
            ResultType: 'entity_object',
            BypassCache: true,
        },
        ctx.User,
    );
    let swept = 0;
    for (const row of r.Success ? (r.Results ?? []) : []) {
        if (await row.Delete()) {
            swept++;
        }
    }
    return swept;
}

export const RealtimeSessionGuardChecks: NamedCheck[] = [
    {
        Id: 'realtime-session-guard.RSG1',
        Name: 'RSG1: the owner cannot forge verification state or the deadline with a direct Save; trusted writes and ordinary edits work',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (!sessionGuardActive(ctx)) {
                console.warn('  ⚠ realtime-session-guard.RSG1 SKIPPED — MJAIAgentSessionEntityServer is not registered in this process');
                return;
            }
            const agentID = await firstAgentID(ctx.User);
            if (!agentID) {
                console.warn('  ⚠ realtime-session-guard.RSG1 SKIPPED — no MJ: AI Agents row available to anchor a session fixture');
                return;
            }
            const session = await newSession(ctx, agentID, { purpose: 'realtime-session-guard RSG1' });
            try {
                Assert(await session.Save(), `an ordinary (untrusted) create was refused: ${session.LatestResult?.CompleteMessage}`);

                // 1. Forging a verified identity is refused and leaves nothing behind.
                const forged = await reload(session.ID, ctx.User);
                forged.Config_ = JSON.stringify({
                    ...configOf(forged),
                    identityVerification: { SendCount: 0, Verified: { Email: 'forged@mj-integration-test.example', Name: 'Forged', VerifiedAt: new Date().toISOString(), Method: 'link' } },
                });
                Assert(!(await forged.Save()), 'the owner forged Config.identityVerification with a direct Save');
                Assert(!('identityVerification' in configOf(await reload(session.ID, ctx.User))), 'a refused forge left verification state behind');

                // 2. Moving the deadline is refused.
                const moved = await reload(session.ID, ctx.User);
                moved.Config_ = JSON.stringify({ ...configOf(moved), maxSessionDeadlineIso: new Date(Date.now() + 86_400_000).toISOString() });
                Assert(!(await moved.Save()), 'the owner moved Config.maxSessionDeadlineIso with a direct Save');

                // 3. A trusted write (the server's own path) succeeds…
                const trusted = await reload(session.ID, ctx.User);
                const deadline = new Date(Date.now() + 3_600_000).toISOString();
                trusted.Config_ = JSON.stringify({ ...configOf(trusted), maxSessionDeadlineIso: deadline });
                await saveTrusted(trusted);
                AssertEqual(configOf(await reload(session.ID, ctx.User))['maxSessionDeadlineIso'], deadline, 'the trusted write persisted');

                // 4. …and an ordinary Config edit on a row that carries protected keys is NOT blocked.
                const benign = await reload(session.ID, ctx.User);
                benign.Config_ = JSON.stringify({ ...configOf(benign), uiHint: 'rsg1' });
                Assert(await benign.Save(), `an ordinary Config edit was refused: ${benign.LatestResult?.CompleteMessage}`);
                AssertEqual(configOf(await reload(session.ID, ctx.User))['maxSessionDeadlineIso'], deadline, 'the ordinary edit left the protected key intact');
            } finally {
                if (session.IsSaved) {
                    await session.Delete().catch(() => undefined);
                }
            }
        },
    },
    {
        Id: 'realtime-session-guard.RSG2',
        Name: 'RSG2: seed the server-decided session fixtures the wire verification bundle needs (trusted write)',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const agentID = await firstAgentID(ctx.User);
            if (!agentID) {
                console.warn('  ⚠ realtime-session-guard.RSG2 SKIPPED — no MJ: AI Agents row available to anchor a session fixture');
                return;
            }
            const swept = await sweepLeftovers(ctx);
            if (swept > 0) {
                console.log(`      → swept ${swept} leftover fixture session(s) from an earlier run`);
            }
            const deadlineIso = new Date(Date.now() + SEEDED_UNVERIFIED_MAX_SECONDS * 1000).toISOString();

            // The shape of a session minted with a verification policy and an unverified cap — written by hand
            // (not built by server code) so a change to the stored shape fails here instead of passing silently.
            const capped = await newSession(ctx, agentID, {
                purpose: 'realtime-session-verification (capped)',
                maxSessionDeadlineIso: deadlineIso,
                identityVerification: {
                    SendCount: 0,
                    Policy: { unverifiedMaxSeconds: SEEDED_UNVERIFIED_MAX_SECONDS, verifiedMaxSeconds: SEEDED_VERIFIED_MAX_SECONDS },
                },
            });
            await saveTrusted(capped);
            const businessOnly = await newSession(ctx, agentID, {
                purpose: 'realtime-session-verification (business-only)',
                identityVerification: { SendCount: 0, Policy: { requireBusinessDomain: true } },
            });
            await saveTrusted(businessOnly);

            const cappedConfig = configOf(await reload(capped.ID, ctx.User));
            AssertEqual(cappedConfig['maxSessionDeadlineIso'], deadlineIso, 'the seeded deadline persisted');
            Assert('identityVerification' in configOf(await reload(businessOnly.ID, ctx.User)), 'the seeded policy snapshot persisted');

            SetSeededRealtimeSessions({
                Capped: { SessionID: capped.ID, DeadlineIso: deadlineIso },
                BusinessOnly: { SessionID: businessOnly.ID },
            });
            console.log(`      → seeded sessions ${capped.ID} (capped) and ${businessOnly.ID} (business-only) for the wire bundle`);
        },
    },
];

for (const check of RealtimeSessionGuardChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
