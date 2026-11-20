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
 * ownership checks only call Validate() or the action's own code, so that user needs no permissions.
 * The bundle creates the context user's Chief of Staff policy and deletes it in teardown; when one
 * already exists the bundle is reference-only toward it and the policy checks (COS6–COS8) skip.
 */
import { BaseEntity, CompositeKey, RunView } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJAgentChannelEntity,
    MJConversationDetailEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, ActionResult, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RunUserRoutineNowAction } from '@memberjunction/scheduling-engine';
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

interface ChiefOfStaffFixture {
    AgentID: string;
    CalcActionID: string;
    OtherUser: UserInfo | null;
    /** The bundle's own policy row; null when the context user already had one (reference-only: never modified). */
    PolicyID: string | null;
    PolicyCreatedByBundle: boolean;
    CreatedRoutineIds: string[];
    CreatedRequestIds: string[];
    CreatedSuggestionIds: string[];
    CreatedChannelIds: string[];
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

/**
 * True when the bundle owns a policy row it may change. When the context user already had a Chief
 * of Staff policy the bundle is reference-only toward it, so the policy checks report a skip.
 */
function ownsPolicy(checkId: string): boolean {
    if (!fx().PolicyID) {
        console.warn(`  ⚠ ${checkId} SKIPPED — the context user already has a Chief of Staff policy; this bundle never modifies pre-existing rows.`);
        return false;
    }
    return true;
}

async function loadPolicy(ctx: IntegrationCheckContext): Promise<MJAIAgentUserPolicyEntity> {
    const policy = await prov(ctx).GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', ctx.User);
    Assert(await policy.Load(fx().PolicyID!), 'could not load the bundle policy');
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
        Name: "COS4: Run User Routine Now's own ownership check refuses a routine the caller does not own, and runs nothing",
        Fn: async (ctx) => {
            const other = otherUser('COS4');
            if (!other) return;
            const routine = await makeOneShot(ctx, 'COS4 not yours');
            // Call the action's own code, not the engine: the engine refuses a user with no action
            // permission before the action runs, which would never exercise the ownership check.
            const params = new RunActionParams();
            params.ContextUser = other;
            params.Provider = ctx.Provider;
            params.Params = [input('RoutineID', routine.ID)];
            const action = new RunUserRoutineNowAction() as unknown as { InternalRunAction(p: RunActionParams): Promise<ActionResultSimple> };
            const result = await action.InternalRunAction(params);
            Assert(!result.Success, "running another user's routine must fail");
            Assert(result.ResultCode === 'NOT_OWNER' || result.ResultCode === 'ROUTINE_NOT_FOUND',
                `expected NOT_OWNER or ROUTINE_NOT_FOUND, got ${result.ResultCode} (${result.Message})`);
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
            let status = '';
            const statusDeadline = Date.now() + 30000;
            do {
                status = String((await runStatus(runs[0].ID, ctx.User)) ?? '');
                if (status === 'Running') await settle(500);
            } while (status === 'Running' && Date.now() < statusDeadline);
            AssertEqual(status, 'Success', 'the background run must succeed');

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
            if (!ownsPolicy('COS6')) return;
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
            if (!ownsPolicy('COS7')) return;
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
            if (!ownsPolicy('COS8')) return;
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
    // ── Extensible Skills Core Layer (COS9–COS12) ───────────────────────────────────────
    {
        Id: 'chief-of-staff.COS9',
        Name: 'COS9: Chief of Staff has zero raw SQL / generic CRUD actions and Get My Agent Context + Assemble My Briefing run cleanly',
        Fn: async (ctx) => {
            const banned = new Set([
                'run ad-hoc query',
                'create record',
                'update record',
                'delete record',
                'get record',
            ]);
            const agentActions = AIEngine.Instance.AgentActions.filter((aa) =>
                UUIDsEqual(aa.AgentID, fx().AgentID) && aa.Status === 'Active'
            );
            const bannedFound = agentActions
                .map((aa) => ActionEngineServer.Instance.Actions.find((a) => UUIDsEqual(a.ID, aa.ActionID))?.Name ?? '')
                .filter((name) => banned.has(name.trim().toLowerCase()));
            AssertEqual(bannedFound.length, 0, `Chief of Staff must not hold raw SQL or generic CRUD actions, found: ${bannedFound.join(', ')}`);

            const ctxRes = await runAction(ctx, 'Get My Agent Context', ctx.User, [input('AgentName', CHIEF_OF_STAFF)]);
            Assert(ctxRes.Success, `Get My Agent Context failed: ${ctxRes.Message}`);
            const ctxData = JSON.parse(ctxRes.Message ?? '{}') as { Agent?: { Name?: string } };
            AssertEqual(ctxData.Agent?.Name, CHIEF_OF_STAFF, 'Get My Agent Context must return Chief of Staff');

            const briefRes = await runAction(ctx, 'Assemble My Briefing', ctx.User, [
                input('AgentName', CHIEF_OF_STAFF),
                input('HorizonDays', 7),
            ]);
            Assert(briefRes.Success, `Assemble My Briefing failed: ${briefRes.Message}`);
            const briefData = JSON.parse(briefRes.Message ?? '{}') as { Core?: unknown; SkillBriefings?: unknown[] };
            Assert(!!briefData.Core && Array.isArray(briefData.SkillBriefings), 'Assemble My Briefing must return Core + SkillBriefings');
        }
    },
    {
        Id: 'chief-of-staff.COS10',
        Name: 'COS10: Offered Rhythms & Suggestions lifecycle (list, enable with confirmation, decline dedup, cancel)',
        Fn: async (ctx) => {
            const listRes = await runAction(ctx, 'List Available Rhythms', ctx.User, [input('AgentName', CHIEF_OF_STAFF)]);
            Assert(listRes.Success, `List Available Rhythms failed: ${listRes.Message}`);
            const listed = JSON.parse(listRes.Message ?? '{}') as { Rhythms?: Array<{ WorkstreamKey: string }> };
            Assert(
                Boolean(listed.Rhythms?.some((r) => r.WorkstreamKey === 'calendar-daily-review')),
                'List Available Rhythms must include seeded calendar-daily-review template'
            );

            const enableRes = await runAction(ctx, 'Enable Agent Rhythm', ctx.User, [
                input('AgentName', CHIEF_OF_STAFF),
                input('WorkstreamKey', 'calendar-daily-review'),
                input('Timezone', 'America/Chicago'),
                input('ConfirmedByUser', true),
            ]);
            Assert(enableRes.Success, `Enable Agent Rhythm failed: ${enableRes.Message}`);
            const enabled = JSON.parse(enableRes.Message ?? '{}') as { RoutineID?: string; Status?: string };
            Assert(!!enabled.RoutineID, 'Enable Agent Rhythm must return RoutineID');
            fx().CreatedRoutineIds.push(enabled.RoutineID!);
            AssertEqual(enabled.Status, 'Active', 'Enabled rhythm routine must be Active');

            const cancelRes = await runAction(ctx, 'Cancel Agent Wake', ctx.User, [
                input('RoutineID', enabled.RoutineID!),
                input('Reason', `COS10 cleanup ${TAG}`),
            ]);
            Assert(cancelRes.Success, `Cancel Agent Wake failed: ${cancelRes.Message}`);

            const testKey = `it157-sug-${Date.now()}`;
            const offerRes = await runAction(ctx, 'Manage Agent Suggestions', ctx.User, [
                input('Operation', 'RecordOffer'),
                input('Kind', 'Rhythm'),
                input('TargetKey', testKey),
                input('Summary', `Integration suggestion ${TAG}`),
            ]);
            Assert(offerRes.Success, `RecordOffer failed: ${offerRes.Message}`);
            const offered = JSON.parse(offerRes.Message ?? '{}') as { SuggestionID?: string };
            if (offered.SuggestionID) fx().CreatedSuggestionIds.push(offered.SuggestionID);

            const declineRes = await runAction(ctx, 'Manage Agent Suggestions', ctx.User, [
                input('Operation', 'Respond'),
                input('TargetKey', testKey),
                input('Status', 'Declined'),
            ]);
            Assert(declineRes.Success, `Respond Declined failed: ${declineRes.Message}`);

            const reofferRes = await runAction(ctx, 'Manage Agent Suggestions', ctx.User, [
                input('Operation', 'RecordOffer'),
                input('Kind', 'Rhythm'),
                input('TargetKey', testKey),
                input('Summary', 'Should not re-offer'),
            ]);
            const reofferCode = reofferRes.Result?.ResultCode ?? reofferRes.ResultCode;
            AssertEqual(reofferCode, 'ALREADY_DECLINED', `expected ALREADY_DECLINED, got ${reofferCode}`);
        }
    },
    {
        Id: 'chief-of-staff.COS11',
        Name: 'COS11: Agent Channel open, loop-guard pause, and direct human intervention reset',
        Fn: async (ctx) => {
            const other = otherUser('COS11');
            if (!other || !ownsPolicy('COS11')) return;

            const pol = await loadPolicy(ctx);
            pol.CoordinationMode = 'Autonomous';
            pol.AllowInterAgentCoordination = true;
            pol.Status = 'Active';
            Assert(await pol.Save(), `updating policy to Autonomous failed: ${pol.LatestResult?.CompleteMessage}`);

            const openRes = await runAction(ctx, 'Open Agent Channel', ctx.User, [
                input('Topic', `COS11 Channel ${TAG}`),
                input('TargetUserIDs', other.ID),
                input('InitialMessage', 'Opening coordination check from IT157.'),
                input('MaxConsecutiveAgentTurns', 1),
            ]);
            Assert(openRes.Success, `Open Agent Channel failed: ${openRes.Message}`);
            const opened = JSON.parse(openRes.Message ?? '{}') as { ChannelID?: string };
            Assert(!!opened.ChannelID, 'Open Agent Channel must return ChannelID');
            const channelId = opened.ChannelID!;
            fx().CreatedChannelIds.push(channelId);

            // Simulate two agent turns hitting MaxConsecutiveAgentTurns = 1 → Paused For Human
            const agentReplyRun = new RunActionParams();
            agentReplyRun.Action = ActionEngineServer.Instance.Actions.find((a) => a.Name === 'Reply In Agent Channel')!;
            agentReplyRun.ContextUser = ctx.User;
            agentReplyRun.Context = { AgentID: fx().AgentID };
            agentReplyRun.Filters = [];
            agentReplyRun.Params = [
                input('ChannelID', channelId),
                input('Message', 'Agent turn 1'),
            ];
            const turn1 = await ActionEngineServer.Instance.RunAction(agentReplyRun);
            Assert(turn1.Success, `Agent turn 1 failed: ${turn1.Message}`);

            const agentReplyRun2 = new RunActionParams();
            agentReplyRun2.Action = agentReplyRun.Action;
            agentReplyRun2.ContextUser = ctx.User;
            agentReplyRun2.Context = { AgentID: fx().AgentID };
            agentReplyRun2.Filters = [];
            agentReplyRun2.Params = [
                input('ChannelID', channelId),
                input('Message', 'Agent turn 2 triggers loop guard'),
            ];
            const turn2 = await ActionEngineServer.Instance.RunAction(agentReplyRun2);
            const turn2Code = turn2.Result?.ResultCode ?? turn2.ResultCode;
            AssertEqual(turn2Code, 'CHANNEL_PAUSED_LOOP_GUARD', `expected CHANNEL_PAUSED_LOOP_GUARD, got ${turn2Code}`);

            // Direct human reply via ConversationDetail must reset ConsecutiveAgentTurns = 0 and re-open channel
            const humanDetail = await prov(ctx).GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
            humanDetail.NewRecord();
            humanDetail.ConversationID = channelId;
            humanDetail.UserID = ctx.User.ID;
            humanDetail.AgentID = null;
            humanDetail.Role = 'User';
            humanDetail.Message = 'Human stepping in to resume coordination.';
            Assert(await humanDetail.Save(), `human ConversationDetail save failed: ${humanDetail.LatestResult?.CompleteMessage}`);

            const reloaded = await prov(ctx).GetEntityObject<MJAgentChannelEntity>('MJ: Agent Channels', ctx.User);
            Assert(await reloaded.Load(channelId), 'could not reload Agent Channel');
            AssertEqual(reloaded.ChannelStatus, 'Open', 'Human reply must re-open Paused For Human channel');
            AssertEqual(reloaded.ConsecutiveAgentTurns, 0, 'Human reply must reset ConsecutiveAgentTurns to 0');
        }
    },
    {
        Id: 'chief-of-staff.COS12',
        Name: 'COS12: Schedule Next Agent Wake blocks autonomous creation of new Recurring routines without user confirmation',
        Fn: async (ctx) => {
            const action = ActionEngineServer.Instance.Actions.find((a) => a.Name === 'Schedule Next Agent Wake');
            Assert(!!action, 'need Schedule Next Agent Wake action');
            const run = new RunActionParams();
            run.Action = action!;
            run.ContextUser = ctx.User;
            run.Context = { AgentID: fx().AgentID };
            run.Filters = [];
            run.Params = [
                input('AgentName', CHIEF_OF_STAFF),
                input('ScheduleMode', 'Recurring'),
                input('CronExpression', '0 9 * * 1-5'),
                input('WorkstreamKey', `cos12-unconfirmed-${Date.now()}`),
                input('WakeReason', 'Should require confirmation'),
            ];
            const result = await ActionEngineServer.Instance.RunAction(run);
            if (result.LogEntry?.ID) fx().CreatedLogIds.push(result.LogEntry.ID);
            const code = result.Result?.ResultCode ?? result.ResultCode;
            AssertEqual(code, 'APPROVAL_REQUIRED', `expected APPROVAL_REQUIRED, got ${code} (${result.Message})`);
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
    r.StartingPayload = JSON.stringify({ Expression: '6*7' });
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

async function runStatus(runId: string, user: UserInfo): Promise<string | null> {
    const result = await new RunView().RunView<{ Status: string }>({
        EntityName: 'MJ: User Routine Runs', ExtraFilter: `ID='${runId}'`, Fields: ['Status'], ResultType: 'simple', BypassCache: true,
    }, user);
    return result.Success && result.Results.length === 1 ? result.Results[0].Status : null;
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
        let policyID: string | null = null;
        if (!(existing.Success && existing.Results.length > 0)) {
            policy.NewRecord();
            policy.AgentID = agent!.ID;
            policy.UserID = user.ID;
            policy.Status = 'Active';
            Assert(await policy.Save(), `creating the bundle policy failed: ${policy.LatestResult?.CompleteMessage}`);
            createdByBundle = true;
            policyID = policy.ID;
        }

        fixture = {
            AgentID: agent!.ID,
            CalcActionID: calc!.ID,
            OtherUser: findUserByEmail(UserCache.Instance.Users, SEEDED_NOGRANT_EMAIL) ?? null,
            PolicyID: policyID,
            PolicyCreatedByBundle: createdByBundle,
            CreatedRoutineIds: [],
            CreatedRequestIds: [],
            CreatedSuggestionIds: [],
            CreatedChannelIds: [],
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
        for (const id of f.CreatedSuggestionIds) await del('MJ: AI Agent Suggestions', id);
        for (const channelId of f.CreatedChannelIds) {
            try {
                const details = await new RunView().RunView<{ ID: string }>({
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: `ConversationID='${channelId}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    BypassCache: true,
                }, user);
                for (const d of details.Results ?? []) await del('MJ: Conversation Details', d.ID);
                const parts = await new RunView().RunView<{ ID: string }>({
                    EntityName: 'MJ: Agent Channel Participants',
                    ExtraFilter: `AgentChannelID='${channelId}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    BypassCache: true,
                }, user);
                for (const p of parts.Results ?? []) await del('MJ: Agent Channel Participants', p.ID);
                await del('MJ: Agent Channels', channelId);
            } catch { /* best-effort cleanup */ }
        }
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

        if (f.PolicyCreatedByBundle && f.PolicyID) {
            await del('MJ: AI Agent User Policies', f.PolicyID);
            AgentUserPolicyEngine.Instance.ClearCache(f.AgentID, user.ID);
        }
        fixture = null;
    }
});
