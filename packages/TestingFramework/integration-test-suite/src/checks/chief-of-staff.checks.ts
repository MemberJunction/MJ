/**
 * chief-of-staff.checks.ts — the 'chief-of-staff' bundle (COS1–COS8): deterministic integration
 * checks for the Chief of Staff's MJ-core layers, against the real database. No LLM calls, and no
 * dependency on any Open App: every fixture is an MJ core row (`MJ: AI Agent User Policies`,
 * `MJ: AI Agent Requests`, `MJ: User Routines`), and the routine target is the core
 * 'Calculate Expression' action.
 *
 * What it proves:
 *   - ownership guards on policies and requests (a non-Owner user cannot write another user's row);
 *   - `Run User Routine Now` refuses a routine the caller does not own, and runs an owned one-shot
 *     without spending its schedule;
 *   - the AgentUserPolicyEngine cache follows an entity save (a Governance edit reaches the agent);
 *   - `Manage My Email Inbox and Drafts` queues the approval for a Send BEFORE any mail provider is
 *     consulted, and DraftOnly refuses a Send without queueing anything.
 *
 * The "other user" is the seeded no-grant user from metadata-optional/integration-test/users; the
 * ownership checks only call Validate(), so that user needs no permissions. The context user's own
 * Chief of Staff policy is created if absent (deleted in teardown) or snapshotted and restored.
 */
import { BaseEntity, CompositeKey, RunView } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, ActionResult, RunActionParams } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    SEEDED_NOGRANT_EMAIL,
    findUserByEmail,
    settle,
} from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

const TAG = '(mj-integration-test — safe to delete)';
const SUBJECT_TAG = `mj-cos-it-${Date.now()}`;
const CHIEF_OF_STAFF = 'Chief of Staff';

/** Snapshot of the context user's policy fields this bundle changes, so teardown can restore them. */
interface PolicySnapshot {
    EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
    RequireApprovalForExternalComms: boolean;
    Status: MJAIAgentUserPolicyEntity['Status'];
}

interface ChiefOfStaffFixture {
    AgentID: string;
    CalcActionID: string;
    OtherUser: UserInfo | null;
    PolicyID: string;
    PolicyCreatedByBundle: boolean;
    PolicySnapshot: PolicySnapshot | null;
    CreatedRoutineIds: string[];
    CreatedRequestIds: string[];
    CreatedLogIds: string[];
}

let fixture: ChiefOfStaffFixture | null = null;

function fx(): ChiefOfStaffFixture {
    Assert(fixture != null, 'chief-of-staff fixture missing (bundle Setup did not run)');
    return fixture!;
}

function prov(ctx: IntegrationCheckContext): DatabaseProviderBase {
    return ctx.Provider as unknown as DatabaseProviderBase;
}

/** The seeded no-grant user, or null with a visible skip note when the integration users were not pushed. */
function otherUser(checkId: string): UserInfo | null {
    const user = fx().OtherUser;
    if (!user) {
        console.warn(`  ⚠ ${checkId} SKIPPED — seeded user '${SEEDED_NOGRANT_EMAIL}' not in the user cache (push metadata-optional/integration-test).`);
    }
    return user;
}

function errorSources(result: { Errors: Array<{ Source: string }> }): string[] {
    return result.Errors.map((e) => e.Source);
}

async function runAction(ctx: IntegrationCheckContext, actionName: string, user: UserInfo, params: ActionParam[]): Promise<ActionResult> {
    const action = ActionEngineServer.Instance.Actions.find((a) => a.Name === actionName && a.Status === 'Active');
    Assert(!!action, `need the '${actionName}' action (Active) in the instance`);
    const run = new RunActionParams();
    run.Action = action!;
    run.ContextUser = user;
    run.Params = params;
    run.Filters = [];
    const result = await ActionEngineServer.Instance.RunAction(run);
    if (result.LogEntry?.ID) {
        fx().CreatedLogIds.push(result.LogEntry.ID);
    }
    return result;
}

function input(name: string, value: unknown): ActionParam {
    return { Name: name, Type: 'Input', Value: value } as ActionParam;
}

async function loadPolicy(ctx: IntegrationCheckContext): Promise<MJAIAgentUserPolicyEntity> {
    const policy = await prov(ctx).GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', ctx.User);
    Assert(await policy.Load(fx().PolicyID), 'could not load the bundle policy');
    return policy;
}

async function setPolicyEmail(ctx: IntegrationCheckContext, mode: MJAIAgentUserPolicyEntity['EmailChannelMode'], requireApproval: boolean): Promise<void> {
    const policy = await loadPolicy(ctx);
    policy.EmailChannelMode = mode;
    policy.RequireApprovalForExternalComms = requireApproval;
    policy.Status = 'Active';
    Assert(await policy.Save(), `saving the bundle policy failed: ${policy.LatestResult?.CompleteMessage}`);
}

async function requestsWithSubjectTag(user: UserInfo): Promise<Array<{ ID: string }>> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: AI Agent Requests',
        ExtraFilter: `Comments LIKE '%${SUBJECT_TAG}%'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    Assert(result.Success, `RunView(requests) failed: ${result.ErrorMessage}`);
    return result.Results;
}

export const ChiefOfStaffChecks: NamedCheck[] = [
    // ── Ownership guards (Validate only — nothing is written) ──────────────────────────
    {
        Id: 'chief-of-staff.COS1',
        Name: "COS1: a non-Owner user cannot save another user's agent policy",
        Fn: async (ctx) => {
            const other = otherUser('COS1');
            if (!other) return;
            const policy = await prov(ctx).GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', other);
            policy.NewRecord();
            policy.AgentID = fx().AgentID;
            policy.UserID = ctx.User.ID;
            const sources = errorSources(policy.Validate());
            Assert(sources.includes('UserID'), `expected an ownership error on UserID, got [${sources.join(', ')}]`);
        }
    },
    {
        Id: 'chief-of-staff.COS2',
        Name: 'COS2: a non-Owner user may write their own policy (no ownership error)',
        Fn: async (ctx) => {
            const other = otherUser('COS2');
            if (!other) return;
            const policy = await prov(ctx).GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', other);
            policy.NewRecord();
            policy.AgentID = fx().AgentID;
            policy.UserID = other.ID;
            const sources = errorSources(policy.Validate());
            Assert(!sources.includes('UserID'), `own policy must pass the ownership gate, got [${sources.join(', ')}]`);
        }
    },
    {
        Id: 'chief-of-staff.COS3',
        Name: 'COS3: a non-Owner user cannot create an agent request for someone else, but can for themselves',
        Fn: async (ctx) => {
            const other = otherUser('COS3');
            if (!other) return;
            const forSomeoneElse = await prov(ctx).GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', other);
            forSomeoneElse.NewRecord();
            forSomeoneElse.AgentID = fx().AgentID;
            forSomeoneElse.RequestForUserID = ctx.User.ID;
            forSomeoneElse.Request = `ownership probe ${TAG}`;
            forSomeoneElse.RequestedAt = new Date();
            forSomeoneElse.Status = 'Requested';
            const blocked = errorSources(forSomeoneElse.Validate());
            Assert(blocked.includes('RequestForUserID'), `expected an ownership error on RequestForUserID, got [${blocked.join(', ')}]`);

            const forSelf = await prov(ctx).GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', other);
            forSelf.NewRecord();
            forSelf.AgentID = fx().AgentID;
            forSelf.RequestForUserID = other.ID;
            forSelf.Request = `ownership probe ${TAG}`;
            forSelf.RequestedAt = new Date();
            forSelf.Status = 'Requested';
            const allowed = errorSources(forSelf.Validate());
            Assert(!allowed.includes('RequestForUserID'), `own request must pass the ownership gate, got [${allowed.join(', ')}]`);
        }
    },
    // ── Run User Routine Now ────────────────────────────────────────────────────────────
    {
        Id: 'chief-of-staff.COS4',
        Name: "COS4: Run User Routine Now refuses a routine the caller does not own, and runs nothing",
        Fn: async (ctx) => {
            const other = otherUser('COS4');
            if (!other) return;
            const routine = await makeOneShot(ctx, 'COS4 not yours');
            const result = await runAction(ctx, 'Run User Routine Now', other, [input('RoutineID', routine.ID)]);
            Assert(!result.Success, "running another user's routine must fail");
            const code = String(result.Result?.ResultCode ?? result.ResultCode);
            Assert(code === 'NOT_OWNER' || code === 'ROUTINE_NOT_FOUND',
                `expected NOT_OWNER or ROUTINE_NOT_FOUND, got ${code} (${result.Message})`);
            await settle(1500);
            AssertEqual((await routineRuns(routine.ID, ctx.User)).length, 0, 'a refused run must leave no run row');
        }
    },
    {
        Id: 'chief-of-staff.COS5',
        Name: 'COS5: Run User Routine Now runs an owned one-shot in the background and keeps its scheduled time',
        Fn: async (ctx) => {
            const routine = await makeOneShot(ctx, 'COS5 mine');
            const stored = new Date(String((await routineRow(routine.ID, ctx.User)).NextRunAt)).getTime();

            const result = await runAction(ctx, 'Run User Routine Now', ctx.User, [input('RoutineID', routine.ID)]);
            Assert(result.Success, `Run User Routine Now failed: ${result.Message}`);

            const deadline = Date.now() + 30000;
            let runs = await routineRuns(routine.ID, ctx.User);
            while (runs.length === 0 && Date.now() < deadline) {
                await settle(500);
                runs = await routineRuns(routine.ID, ctx.User);
            }
            AssertEqual(runs.length, 1, 'the background run must leave exactly one run row');

            const after = await routineRow(routine.ID, ctx.User);
            AssertEqual(String(after.Status), 'Active', 'the one-shot must stay Active');
            AssertEqual(new Date(String(after.NextRunAt)).getTime(), stored, 'NextRunAt must be unchanged');
        }
    },
    // ── Policy cache follows the entity layer ──────────────────────────────────────────
    {
        Id: 'chief-of-staff.COS6',
        Name: 'COS6: a policy saved through the entity layer replaces the cached copy in the policy engine',
        Fn: async (ctx) => {
            await setPolicyEmail(ctx, 'DraftOnly', true);
            const cached = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(fx().AgentID, ctx.User.ID, ctx.User, true);
            AssertEqual(cached?.EmailChannelMode, 'DraftOnly', 'the engine must start from DraftOnly');

            await setPolicyEmail(ctx, 'SendAsUser', true);
            await settle(200);
            const after = AgentUserPolicyEngine.Instance.GetCachedPolicy(fx().AgentID, ctx.User.ID);
            AssertEqual(after?.EmailChannelMode, 'SendAsUser', 'the cached policy must follow the save without a reload');
        }
    },
    // ── Email: approval before transport ────────────────────────────────────────────────
    {
        Id: 'chief-of-staff.COS7',
        Name: 'COS7: a Send under SendAsUser with approval required queues the approval before any mail provider is consulted',
        Fn: async (ctx) => {
            await setPolicyEmail(ctx, 'SendAsUser', true);
            const result = await runAction(ctx, 'Manage My Email Inbox and Drafts', ctx.User, [
                input('AgentName', CHIEF_OF_STAFF),
                input('Operation', 'Send'),
                input('To', 'it-cos-recipient@integration.test'),
                input('Subject', `Status update ${SUBJECT_TAG}`),
                input('Body', `Integration test body ${TAG}`),
            ]);
            const code = result.Result?.ResultCode ?? result.ResultCode;
            AssertEqual(code, 'APPROVAL_REQUIRED', `expected APPROVAL_REQUIRED, got ${code} (${result.Message})`);

            const requests = await requestsWithSubjectTag(ctx.User);
            for (const r of requests) fx().CreatedRequestIds.push(r.ID);
            AssertEqual(requests.length, 1, 'exactly one approval request must be queued');

            const req = await prov(ctx).GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', ctx.User);
            Assert(await req.Load(requests[0].ID), 'could not load the queued request');
            Assert(UUIDsEqual(req.RequestForUserID, ctx.User.ID), 'the request must be for the calling user');
            AssertEqual(req.Status, 'Requested', 'the request must be waiting');
            const payload = JSON.parse(req.Comments ?? '{}') as Record<string, unknown>;
            AssertEqual(payload['To'], 'it-cos-recipient@integration.test', 'the draft travels in Comments');
            AssertEqual(payload['Operation'], 'Send', 'the operation is recorded for the resume');
        }
    },
    {
        Id: 'chief-of-staff.COS8',
        Name: 'COS8: under DraftOnly a Send is refused by policy and queues nothing',
        Fn: async (ctx) => {
            await setPolicyEmail(ctx, 'DraftOnly', true);
            const before = (await requestsWithSubjectTag(ctx.User)).length;
            const result = await runAction(ctx, 'Manage My Email Inbox and Drafts', ctx.User, [
                input('AgentName', CHIEF_OF_STAFF),
                input('Operation', 'Send'),
                input('To', 'it-cos-recipient@integration.test'),
                input('Subject', `Refused ${SUBJECT_TAG}`),
                input('Body', `Integration test body ${TAG}`),
            ]);
            const code = result.Result?.ResultCode ?? result.ResultCode;
            AssertEqual(code, 'POLICY_DENIED', `expected POLICY_DENIED, got ${code} (${result.Message})`);
            AssertEqual((await requestsWithSubjectTag(ctx.User)).length, before, 'no approval may be queued under DraftOnly');
        }
    },
];

async function makeOneShot(ctx: IntegrationCheckContext, name: string): Promise<MJUserRoutineEntity> {
    const r = await prov(ctx).GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', ctx.User);
    r.NewRecord();
    r.Name = `${name} ${TAG}`;
    r.Description = `Chief of Staff integration routine ${TAG}`;
    r.UserID = ctx.User.ID;
    r.Status = 'Active';
    r.RoutineType = 'Scheduled';
    r.ScheduleMode = 'OneShot';
    r.TargetType = 'Action';
    r.TargetID = fx().CalcActionID;
    r.CronExpression = null;
    r.Timezone = 'UTC';
    r.NextRunAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    Assert(await r.Save(), `creating routine "${name}" failed: ${r.LatestResult?.CompleteMessage}`);
    fx().CreatedRoutineIds.push(r.ID);
    return r;
}

async function routineRow(id: string, user: UserInfo): Promise<Record<string, unknown>> {
    const result = await new RunView().RunView<Record<string, unknown>>({
        EntityName: 'MJ: User Routines', ExtraFilter: `ID='${id}'`, ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success && result.Results.length === 1, `routine ${id} not found`);
    return result.Results[0];
}

async function routineRuns(routineId: string, user: UserInfo): Promise<Array<{ ID: string }>> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: User Routine Runs', ExtraFilter: `RoutineID='${routineId}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success, `RunView(runs) failed: ${result.ErrorMessage}`);
    return result.Results;
}

for (const check of ChiefOfStaffChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('chief-of-staff', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const user = ctx.User;
        await ActionEngineServer.Instance.Config(false, user);
        await AIEngine.Instance.Config(false, user);

        const calc = ActionEngineServer.Instance.Actions.find((a) => a.Name === 'Calculate Expression' && a.Status === 'Active');
        Assert(!!calc, "need the core 'Calculate Expression' action (Active) for the routine fixture");
        const agent = AIEngine.Instance.Agents.find((a) => (a.Name ?? '').trim().toLowerCase() === CHIEF_OF_STAFF.toLowerCase());
        Assert(!!agent, "need the 'Chief of Staff' agent in the instance");

        const policy = await prov(ctx).GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', user);
        const existing = await new RunView().RunView<{ ID: string }>({
            EntityName: 'MJ: AI Agent User Policies',
            ExtraFilter: `AgentID='${agent!.ID}' AND UserID='${user.ID}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        }, user);
        let createdByBundle = false;
        let snapshot: PolicySnapshot | null = null;
        if (existing.Success && existing.Results.length > 0) {
            Assert(await policy.Load(existing.Results[0].ID), 'could not load the existing policy');
            snapshot = { EmailChannelMode: policy.EmailChannelMode, RequireApprovalForExternalComms: policy.RequireApprovalForExternalComms, Status: policy.Status };
        } else {
            policy.NewRecord();
            policy.AgentID = agent!.ID;
            policy.UserID = user.ID;
            policy.Status = 'Active';
            Assert(await policy.Save(), `creating the bundle policy failed: ${policy.LatestResult?.CompleteMessage}`);
            createdByBundle = true;
        }

        fixture = {
            AgentID: agent!.ID,
            CalcActionID: calc!.ID,
            OtherUser: findUserByEmail(UserCache.Instance.Users, SEEDED_NOGRANT_EMAIL) ?? null,
            PolicyID: policy.ID,
            PolicyCreatedByBundle: createdByBundle,
            PolicySnapshot: snapshot,
            CreatedRoutineIds: [],
            CreatedRequestIds: [],
            CreatedLogIds: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        if (!f) return;
        const provider = prov(ctx);
        const user = ctx.User;
        const del = async (entityName: string, id: string) => {
            try {
                const e = await provider.GetEntityObject<BaseEntity>(entityName, user);
                if (await e.InnerLoad(CompositeKey.FromID(id))) await e.Delete();
            } catch { /* best-effort cleanup */ }
        };

        for (const id of f.CreatedRequestIds) await del('MJ: AI Agent Requests', id);
        try {
            for (const r of await requestsWithSubjectTag(user)) await del('MJ: AI Agent Requests', r.ID);
        } catch { /* best-effort cleanup */ }

        for (const routineId of f.CreatedRoutineIds) {
            try {
                const runs = await new RunView().RunView<{ ID: string; ActionExecutionLogID: string | null }>({
                    EntityName: 'MJ: User Routine Runs', ExtraFilter: `RoutineID='${routineId}'`,
                    Fields: ['ID', 'ActionExecutionLogID'], ResultType: 'simple', BypassCache: true,
                }, user);
                for (const run of runs.Results ?? []) {
                    try {
                        await provider.ExecuteSQL(
                            `DELETE FROM ${provider.Dialect.QuoteSchema(provider.MJCoreSchemaName, 'UserNotification')} WHERE ${provider.Dialect.QuoteIdentifier('ResourceConfiguration')} LIKE ${provider.Dialect.QuoteStringLiteral(`%${run.ID}%`)}`,
                            [],
                            { isMutation: true, description: 'chief-of-staff: cleanup routine notifications' },
                            user
                        );
                    } catch { /* best-effort cleanup */ }
                    await del('MJ: User Routine Runs', run.ID);
                    if (run.ActionExecutionLogID) await del('MJ: Action Execution Logs', run.ActionExecutionLogID);
                }
            } catch { /* best-effort cleanup */ }
            await del('MJ: User Routines', routineId);
        }
        for (const id of f.CreatedLogIds) await del('MJ: Action Execution Logs', id);

        if (f.PolicyCreatedByBundle) {
            await del('MJ: AI Agent User Policies', f.PolicyID);
            AgentUserPolicyEngine.Instance.ClearCache(f.AgentID, user.ID);
        } else if (f.PolicySnapshot) {
            try {
                const policy = await provider.GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', user);
                if (await policy.Load(f.PolicyID)) {
                    policy.EmailChannelMode = f.PolicySnapshot.EmailChannelMode;
                    policy.RequireApprovalForExternalComms = f.PolicySnapshot.RequireApprovalForExternalComms;
                    policy.Status = f.PolicySnapshot.Status;
                    await policy.Save();
                }
            } catch { /* best-effort restore */ }
        }
        fixture = null;
    }
});
