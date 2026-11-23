import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunActionParams } from '@memberjunction/actions-base';
import { AuthorizationInfo, IMetadataProvider, LimitsConfigResolver, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRhythmTemplateEntity,
    MJAIAgentSuggestionEntity,
    MJAIAgentUserPolicyEntity,
    MJAgentChannelEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import {
    AgentUserPolicyEngine,
    MJAIAgentEntityExtended,
    TypedActionPolicyGuard,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { AgentWakeTriggerService } from '@memberjunction/ai-agents';
import { UserCache } from '@memberjunction/generic-database-provider';
import { ScheduleNextAgentWakeAction } from '../custom/ai/schedule-next-agent-wake.action';
import { SendInterAgentRequestAction } from '../custom/ai/send-inter-agent-request.action';
import {
    AssembleMyBriefingAction,
    CancelAgentWakeAction,
    FindColleagueAction,
    GetMyAgentContextAction,
    ListMyAgentRoutinesAction,
} from '../custom/ai/chief-of-staff-core-reads.action';
import {
    EnableAgentRhythmAction,
    ListAvailableRhythmsAction,
    ManageAgentSuggestionsAction,
} from '../custom/ai/chief-of-staff-rhythms-suggestions.action';
import {
    GetAgentChannelAction,
    OpenAgentChannelAction,
    ReplyInAgentChannelAction,
} from '../custom/ai/agent-channel.action';

const alice = {
    ID: 'user-alice',
    Name: 'Alice Executive',
    FirstName: 'Alice',
    LastName: 'Executive',
    Email: 'alice@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
} as Partial<UserInfo> as UserInfo;

const bob = {
    ID: 'user-bob',
    Name: 'Bob Manager',
    FirstName: 'Bob',
    LastName: 'Manager',
    Email: 'bob@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
} as Partial<UserInfo> as UserInfo;

const systemUser = {
    ID: 'user-system',
    Name: 'System',
    Email: 'system@example.com',
    IsActive: true,
    Type: 'Owner',
    UserRoles: [],
} as Partial<UserInfo> as UserInfo;

const cosAgent = {
    ID: 'agent-cos',
    Name: 'Chief of Staff',
    AcceptsSkills: 'All',
    SkillActivationMode: 'Auto',
} as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

interface ActionRunnerHarness {
    InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; ResultCode?: string; Message?: string }>;
}

function callAction(
    action: ActionRunnerHarness,
    params: RunActionParams
) {
    return action.InternalRunAction(params);
}

describe('Chief of Staff Extensible Skills — Typed Core Actions, Rhythms, Suggestions & Agent Channels', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        AgentUserPolicyEngine.Instance.ClearCache();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([cosAgent]);
        vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockReturnValue(true);
        vi.spyOn(AIEngine.Instance, 'AgentSkills', 'get').mockReturnValue([]);
        vi.spyOn(AIEngine.Instance, 'Skills', 'get').mockReturnValue([]);
        vi.spyOn(TypedActionPolicyGuard, 'CheckEntityAccess').mockResolvedValue({
            Allowed: true,
            Active: false,
            DeniedFieldPatterns: [],
        });
    });

    it('ScheduleNextAgentWakeAction rejects self-attested ConfirmedByUser and fake RhythmTemplateID in agent context, and succeeds with a real Approved ConfirmedApprovalRequestID', async () => {
        const activeTemplate = {
            ID: 'tpl-active-1',
            AgentID: cosAgent.ID,
            Status: 'Active',
        } as Partial<MJAIAgentRhythmTemplateEntity> as MJAIAgentRhythmTemplateEntity;
        const approvedRequest = {
            ID: 'req-approved-1',
            AgentID: cosAgent.ID,
            RequestForUserID: alice.ID,
            Status: 'Approved',
        };

        const runViewSpy = vi.fn(async (p: { EntityName: string; ExtraFilter?: string }) => {
            if (p.EntityName === 'MJ: AI Agent Rhythm Templates') {
                if (p.ExtraFilter?.includes('tpl-active-1')) {
                    return { Success: true, Results: [activeTemplate] };
                }
                return { Success: true, Results: [] };
            }
            if (p.EntityName === 'MJ: AI Agent Requests') {
                if (p.ExtraFilter?.includes('req-approved-1')) {
                    return { Success: true, Results: [approvedRequest] };
                }
                return { Success: true, Results: [] };
            }
            if (p.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'pol-alice-cos',
                            AgentID: cosAgent.ID,
                            UserID: alice.ID,
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: runViewSpy,
        } as Partial<RunView> as RunView);

        const routineStub = {
            ID: 'routine-approved-1',
            Save: vi.fn().mockResolvedValue(true),
            NextRunAt: null,
        } as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;
        const md = {
            GetEntityObject: vi.fn().mockResolvedValue(routineStub),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        // 1. No approval at all -> APPROVAL_REQUIRED
        const unconfirmed = await callAction(new ScheduleNextAgentWakeAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'ScheduleMode', Type: 'Input', Value: 'Recurring' },
                { Name: 'CronExpression', Type: 'Input', Value: '0 8 * * 1-5' },
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'unrequested-rhythm' },
                { Name: 'WakeReason', Type: 'Input', Value: 'Auto-created rhythm' },
            ],
        });
        expect(unconfirmed.Success).toBe(false);
        expect(unconfirmed.ResultCode).toBe('APPROVAL_REQUIRED');

        // 2. Self-attested ConfirmedByUser=true alone -> STILL rejected in agent context!
        const selfAttested = await callAction(new ScheduleNextAgentWakeAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'ScheduleMode', Type: 'Input', Value: 'Recurring' },
                { Name: 'CronExpression', Type: 'Input', Value: '0 8 * * 1-5' },
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'self-attested-rhythm' },
                { Name: 'WakeReason', Type: 'Input', Value: 'Self-attested recurring wake' },
                { Name: 'ConfirmedByUser', Type: 'Input', Value: true },
            ],
        });
        expect(selfAttested.Success).toBe(false);
        expect(selfAttested.ResultCode).toBe('APPROVAL_REQUIRED');

        // 3. Fake/non-existent RhythmTemplateID -> rejected with VALIDATION_ERROR
        const fakeTemplate = await callAction(new ScheduleNextAgentWakeAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'ScheduleMode', Type: 'Input', Value: 'Recurring' },
                { Name: 'CronExpression', Type: 'Input', Value: '0 8 * * 1-5' },
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'spoofed-tpl' },
                { Name: 'WakeReason', Type: 'Input', Value: 'Spoofed template' },
                { Name: 'RhythmTemplateID', Type: 'Input', Value: 'fake-template-id' },
                { Name: 'ConfirmedApprovalRequestID', Type: 'Input', Value: 'req-approved-1' },
            ],
        });
        expect(fakeTemplate.Success).toBe(false);
        expect(fakeTemplate.ResultCode).toBe('VALIDATION_ERROR');

        // 4. Real Active RhythmTemplateID WITHOUT Approved ConfirmedApprovalRequestID -> STILL rejected!
        const templateWithoutApproval = await callAction(new ScheduleNextAgentWakeAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'ScheduleMode', Type: 'Input', Value: 'Recurring' },
                { Name: 'CronExpression', Type: 'Input', Value: '0 8 * * 1-5' },
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'tpl-no-approval' },
                { Name: 'WakeReason', Type: 'Input', Value: 'Template without approval' },
                { Name: 'RhythmTemplateID', Type: 'Input', Value: 'tpl-active-1' },
            ],
        });
        expect(templateWithoutApproval.Success).toBe(false);
        expect(templateWithoutApproval.ResultCode).toBe('APPROVAL_REQUIRED');

        // 5. Real Active RhythmTemplateID + real server-verified Approved ConfirmedApprovalRequestID -> SUCCEEDS!
        const approved = await callAction(new ScheduleNextAgentWakeAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'ScheduleMode', Type: 'Input', Value: 'Recurring' },
                { Name: 'CronExpression', Type: 'Input', Value: '0 8 * * 1-5' },
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'approved-rhythm' },
                { Name: 'WakeReason', Type: 'Input', Value: 'User-approved recurring wake' },
                { Name: 'RhythmTemplateID', Type: 'Input', Value: 'tpl-active-1' },
                { Name: 'ConfirmedApprovalRequestID', Type: 'Input', Value: 'req-approved-1' },
            ],
        });
        expect(approved.Success).toBe(true);
        expect(routineStub.Save).toHaveBeenCalledTimes(1);
    });

    it('SendInterAgentRequestAction enforces Coordinator APPROVAL_REQUIRED during autonomous agent runs', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [{ ID: bob.ID, IsActive: true }] }),
        } as Partial<RunView> as RunView);
        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValue({
            status: 'found',
            policy: {
                Status: 'Active',
                CoordinationMode: 'Coordinator',
                AllowInterAgentCoordination: true,
            } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity,
        });

        const res = await callAction(new SendInterAgentRequestAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: {} as IMetadataProvider,
            Filters: [],
            Params: [
                { Name: 'TargetUserID', Type: 'Input', Value: bob.ID },
                { Name: 'Subject', Type: 'Input', Value: 'Status check' },
                { Name: 'Message', Type: 'Input', Value: 'Need update on launch.' },
            ],
        });

        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('APPROVAL_REQUIRED');
    });

    it('AssembleMyBriefingAction fans out in parallel across Briefing-role skill actions and tolerates partial failures', async () => {
        vi.spyOn(ActionEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'GetBriefingActionsForAgent').mockReturnValue([
            { skill: { ID: 's-tasks', Name: 'Chief of Staff Tasks & To-dos' } as never, actionID: 'act-tasks-brief' },
            { skill: { ID: 's-plan', Name: 'Strategic Plan & OKRs' } as never, actionID: 'act-plan-brief' },
        ]);
        vi.spyOn(ActionEngineServer.Instance, 'Actions', 'get').mockReturnValue([
            { ID: 'act-tasks-brief', Name: 'Get My Tasks Briefing' } as never,
            { ID: 'act-plan-brief', Name: 'Get My Planning Briefing' } as never,
        ]);
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockImplementation(async (p) => {
            if (p.Action.ID === 'act-tasks-brief') {
                return {
                    Success: true,
                    Message: JSON.stringify({ OverdueCount: 2 }),
                    Result: { Success: true, ResultCode: 'SUCCESS' },
                    Params: [],
                } as never;
            }
            return {
                Success: false,
                Message: 'No active plan',
                Result: { Success: false, ResultCode: 'NO_ACTIVE_PLAN' },
                Params: [],
            } as never;
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
        } as Partial<RunView> as RunView);

        const res = await callAction(new AssembleMyBriefingAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [{ Name: 'HorizonDays', Type: 'Input', Value: 7 }],
        });

        expect(res.Success).toBe(true);
        const parsed = JSON.parse(res.Message!);
        expect(parsed.SkillBriefings).toHaveLength(2);
        expect(parsed.SkillBriefings[0]).toMatchObject({
            SkillName: 'Chief of Staff Tasks & To-dos',
            Success: true,
            Data: { OverdueCount: 2 },
        });
        expect(parsed.SkillBriefings[1]).toMatchObject({
            SkillName: 'Strategic Plan & OKRs',
            Success: false,
            ResultCode: 'NO_ACTIVE_PLAN',
        });
    });

    it('AssembleMyBriefingAction captures structured Output parameters from briefing contributors', async () => {
        vi.spyOn(AIEngine.Instance, 'GetBriefingActionsForAgent').mockReturnValue([
            { skill: { ID: 'sk-tasks', Name: 'Chief of Staff Tasks & To-dos' } as never, actionID: 'act-tasks-brief' },
        ]);
        vi.spyOn(ActionEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ActionEngineServer.Instance, 'Actions', 'get').mockReturnValue([
            { ID: 'act-tasks-brief', Name: 'Get My Tasks Briefing' } as never,
        ]);
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockResolvedValue({
            Success: true,
            Message: 'Tasks briefing: 1 overdue.',
            Result: { Success: true, ResultCode: 'SUCCESS' },
            Params: [
                { Name: 'HorizonDays', Type: 'Input', Value: 7 },
                {
                    Name: 'Briefing',
                    Type: 'Output',
                    Value: JSON.stringify({ Overdue: [{ ID: 't-1', Name: 'Board Deck' }] }),
                },
            ],
        } as never);
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
        } as Partial<RunView> as RunView);

        const res = await callAction(new AssembleMyBriefingAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [{ Name: 'HorizonDays', Type: 'Input', Value: 7 }],
        });

        expect(res.Success).toBe(true);
        const parsed = JSON.parse(res.Message!);
        expect(parsed.SkillBriefings[0].Data).toMatchObject({
            Summary: 'Tasks briefing: 1 overdue.',
            Briefing: { Overdue: [{ ID: 't-1', Name: 'Board Deck' }] },
        });
    });

    it('AssembleMyBriefingAction enforces per-contributor timeout without stalling peers and truncates oversized payloads', async () => {
        vi.spyOn(ActionEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'GetBriefingActionsForAgent').mockReturnValue([
            { skill: { ID: 'sk-slow', Name: 'Slow Skill' } as never, actionID: 'act-slow' },
            { skill: { ID: 'sk-big', Name: 'Verbose Skill' } as never, actionID: 'act-big' },
        ]);
        vi.spyOn(ActionEngineServer.Instance, 'Actions', 'get').mockReturnValue([
            { ID: 'act-slow', Name: 'Slow Briefing' } as never,
            { ID: 'act-big', Name: 'Verbose Briefing' } as never,
        ]);
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockImplementation(async (p) => {
            if (p.Action.ID === 'act-slow') {
                return await new Promise((resolve) =>
                    setTimeout(
                        () =>
                            resolve({
                                Success: true,
                                Message: JSON.stringify({ TooLate: true }),
                                Result: { Success: true, ResultCode: 'SUCCESS' },
                                Params: [],
                            } as never),
                        500
                    )
                );
            }
            return {
                Success: true,
                Message: JSON.stringify({ Items: 'X'.repeat(500) }),
                Result: { Success: true, ResultCode: 'SUCCESS' },
                Params: [],
            } as never;
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
        } as Partial<RunView> as RunView);

        const res = await callAction(new AssembleMyBriefingAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [
                { Name: 'HorizonDays', Type: 'Input', Value: 7 },
                { Name: 'ContributorTimeoutMs', Type: 'Input', Value: 30 },
                { Name: 'MaxContributorChars', Type: 'Input', Value: 120 },
            ],
        });

        expect(res.Success).toBe(true);
        const parsed = JSON.parse(res.Message!);
        expect(parsed.SkillBriefings).toHaveLength(2);
        expect(parsed.SkillBriefings[0]).toMatchObject({
            SkillName: 'Slow Skill',
            Success: false,
            ResultCode: 'TIMEOUT',
            Data: null,
        });
        expect(parsed.SkillBriefings[0].Error).toContain('timed out');

        expect(parsed.SkillBriefings[1]).toMatchObject({
            SkillName: 'Verbose Skill',
            Success: true,
        });
        expect(parsed.SkillBriefings[1].Data).toMatchObject({
            Truncated: true,
        });
        expect(parsed.SkillBriefings[1].Data.OriginalChars).toBeGreaterThan(500);
        expect(parsed.SkillBriefings[1].Data.Preview).toHaveLength(120);
    });

    it('ListAvailableRhythms excludes declined suggestions and EnableAgentRhythm materializes an active recurring routine', async () => {
        const template = {
            ID: 'tpl-1',
            AgentID: cosAgent.ID,
            SkillID: null,
            Name: 'Daily Calendar Guard',
            WorkstreamKey: 'calendar-daily-review',
            Description: 'Check conflicts',
            DefaultCronExpression: '30 7 * * 1-5',
            DefaultWakeGate: null,
            WakeReason: 'Check calendar',
            OfferAt: 'Onboarding',
            Status: 'Active',
            Skill: null,
        } as Partial<MJAIAgentRhythmTemplateEntity> as MJAIAgentRhythmTemplateEntity;

        const declinedTemplate = {
            ...template,
            ID: 'tpl-2',
            Name: 'Declined Rhythm',
            WorkstreamKey: 'declined-key',
        } as Partial<MJAIAgentRhythmTemplateEntity> as MJAIAgentRhythmTemplateEntity;

        const declinedSuggestion = {
            ID: 'sug-1',
            TargetKey: 'declined-key',
            Status: 'Declined',
            Save: vi.fn().mockResolvedValue(true),
        } as Partial<MJAIAgentSuggestionEntity> as MJAIAgentSuggestionEntity;

        const approvedReq = {
            ID: 'req-rhythm-approved-1',
            AgentID: cosAgent.ID,
            RequestForUserID: alice.ID,
            Status: 'Approved',
        };

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (p: { EntityName: string; ExtraFilter?: string }) => {
                if (p.EntityName === 'MJ: AI Agent Rhythm Templates') {
                    return { Success: true, Results: [template, declinedTemplate] };
                }
                if (p.EntityName === 'MJ: AI Agent Suggestions') {
                    return { Success: true, Results: [declinedSuggestion] };
                }
                if (p.EntityName === 'MJ: AI Agent Requests') {
                    if (p.ExtraFilter?.includes('req-rhythm-approved-1')) {
                        return { Success: true, Results: [approvedReq] };
                    }
                    return { Success: true, Results: [] };
                }
                if (p.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'pol-alice-cos',
                                AgentID: cosAgent.ID,
                                UserID: alice.ID,
                                Status: 'Active',
                                AllowInterAgentCoordination: true,
                                EmailChannelMode: 'DraftOnly',
                                Agent: 'Chief of Staff',
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }),
        } as Partial<RunView> as RunView);

        const listRes = await callAction(new ListAvailableRhythmsAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [],
        });
        expect(listRes.Success).toBe(true);
        const listed = JSON.parse(listRes.Message!);
        expect(listed.Rhythms.map((r: { WorkstreamKey: string }) => r.WorkstreamKey)).toEqual([
            'calendar-daily-review',
        ]);

        // Enabling during an agent call without ConfirmedApprovalRequestID (even with self-attested ConfirmedByUser=true!) must fail
        const blockedEnable = await callAction(new EnableAgentRhythmAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Filters: [],
            Params: [
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'calendar-daily-review' },
                { Name: 'ConfirmedByUser', Type: 'Input', Value: true },
            ],
        });
        expect(blockedEnable.Success).toBe(false);
        expect(blockedEnable.ResultCode).toBe('APPROVAL_REQUIRED');

        const routineStub = {
            ID: 'routine-new-1',
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
            WakeConfigurationObject: null,
        } as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;
        const md = {
            GetEntityObject: vi.fn().mockResolvedValue(routineStub),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        // With a real server-verified Approved ConfirmedApprovalRequestID, agent call succeeds!
        const enabledRes = await callAction(new EnableAgentRhythmAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'calendar-daily-review' },
                { Name: 'Timezone', Type: 'Input', Value: 'America/Chicago' },
                { Name: 'ConfirmedApprovalRequestID', Type: 'Input', Value: 'req-rhythm-approved-1' },
            ],
        });
        expect(enabledRes.Success).toBe(true);
        expect(routineStub.ScheduleMode).toBe('Recurring');
        expect(routineStub.CronExpression).toBe('30 7 * * 1-5');
        expect(routineStub.Timezone).toBe('America/Chicago');

        // Direct human/UI call (no Context.AgentID) succeeds cleanly without requiring ConfirmedApprovalRequestID
        const humanRes = await callAction(new EnableAgentRhythmAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'calendar-daily-review' },
                { Name: 'Timezone', Type: 'Input', Value: 'America/Chicago' },
            ],
        });
        expect(humanRes.Success).toBe(true);
    });

    it('ManageAgentSuggestions blocks re-offering a previously declined suggestion with ALREADY_DECLINED', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: [
                    {
                        ID: 'sug-declined',
                        TargetKey: 'tasks-daily-triage',
                        Status: 'Declined',
                        RespondedAt: new Date('2026-11-19T12:00:00Z'),
                    },
                ],
            }),
        } as Partial<RunView> as RunView);

        const res = await callAction(new ManageAgentSuggestionsAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [
                { Name: 'Operation', Type: 'Input', Value: 'RecordOffer' },
                { Name: 'Kind', Type: 'Input', Value: 'Rhythm' },
                { Name: 'TargetKey', Type: 'Input', Value: 'tasks-daily-triage' },
                { Name: 'Summary', Type: 'Input', Value: 'Offer daily task triage' },
            ],
        });

        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('ALREADY_DECLINED');
    });

    it('OpenAgentChannel enforces Observer/Coordinator policies and opens channel + wakes peers in Autonomous mode', async () => {
        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
            status: 'found',
            policy: {
                Status: 'Active',
                CoordinationMode: 'Observer',
                AllowInterAgentCoordination: true,
            } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity,
        });

        const obsRes = await callAction(new OpenAgentChannelAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Filters: [],
            Params: [
                { Name: 'Topic', Type: 'Input', Value: 'Release sync' },
                { Name: 'TargetUserIDs', Type: 'Input', Value: bob.ID },
                { Name: 'InitialMessage', Type: 'Input', Value: 'Align on Q4 dates.' },
            ],
        });
        expect(obsRes.Success).toBe(false);
        expect(obsRes.ResultCode).toBe('POLICY_DENIED');

        // Now Autonomous mode succeeds
        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
            status: 'found',
            policy: {
                Status: 'Active',
                CoordinationMode: 'Autonomous',
                AllowInterAgentCoordination: true,
            } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity,
        });

        const savedEntities: string[] = [];
        const md = {
            GetEntityObject: vi.fn(async (name: string) => ({
                ID: `${name}-1`,
                NewRecord: vi.fn(),
                Save: vi.fn(async () => {
                    savedEntities.push(name);
                    return true;
                }),
                LatestResult: null,
            })),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [bob] }),
        } as Partial<RunView> as RunView);

        const wakeSpy = vi
            .spyOn(AgentWakeTriggerService.Instance, 'TriggerWakeOnAgentChannelMessage')
            .mockResolvedValue({
                channelID: 'MJ: Agent Channels-1',
                channelStatus: 'Open',
                pausedByGuard: false,
                pauseReason: null,
                results: [],
            });

        const openRes = await callAction(new OpenAgentChannelAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'Topic', Type: 'Input', Value: 'Release sync' },
                { Name: 'TargetUserIDs', Type: 'Input', Value: bob.ID },
                { Name: 'InitialMessage', Type: 'Input', Value: 'Align on Q4 dates.' },
            ],
        });

        expect(openRes.Success).toBe(true);
        expect(savedEntities).toEqual([
            'MJ: Agent Channels',
            'MJ: Agent Channel Participants',
            'MJ: Agent Channel Participants',
            'MJ: Conversation Details',
        ]);
        expect(wakeSpy).toHaveBeenCalledTimes(1);
    });

    it('OpenAgentChannelAction and SendInterAgentRequestAction support same-user sibling agent coordination (e.g., Pepper <-> Cato) without TargetUserID or external approval', async () => {
        const pepperAgent = { ...cosAgent, ID: 'agent-pepper', Name: 'Pepper' } as typeof cosAgent;
        const catoAgent = {
            ...cosAgent,
            ID: 'agent-cato',
            Name: 'Cato',
            BaseAgentID: cosAgent.ID,
            OwnerUserID: alice.ID,
        } as typeof cosAgent;
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([cosAgent, pepperAgent, catoAgent]);
        vi.spyOn(AIEngine.Instance, 'CanUserViewAgent').mockReturnValue(true);
        vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockReturnValue(true);
        vi.spyOn(AIEngine.Instance, 'ResolveAgentRequestTypeID').mockResolvedValue('req-type-approval');
        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValue({
            status: 'found',
            policy: {
                Status: 'Active',
                AllowInterAgentCoordination: true,
                CoordinationMode: 'Coordinator',
            } as unknown as never,
        });

        const savedParticipants: Array<{ AgentID?: string; UserID?: string; Role?: string }> = [];
        const md = {
            GetEntityObject: vi.fn(async (name: string) => {
                const record: Record<string, unknown> = {
                    ID: `${name}-sibling-1`,
                    NewRecord: vi.fn(),
                    Save: vi.fn(async () => {
                        if (name === 'MJ: Agent Channel Participants') {
                            savedParticipants.push({
                                AgentID: record['AgentID'] as string,
                                UserID: record['UserID'] as string,
                                Role: record['Role'] as string,
                            });
                        }
                        return true;
                    }),
                    LatestResult: null,
                };
                return record;
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        vi.spyOn(AgentWakeTriggerService.Instance, 'TriggerWakeOnAgentChannelMessage').mockResolvedValue({
            channelID: 'MJ: Agent Channels-sibling-1',
            channelStatus: 'Open',
            pausedByGuard: false,
            pauseReason: null,
            results: [],
        });

        // 1) Open Agent Channel with TargetAgentName='Cato' and NO TargetUserIDs under Coordinator policy
        const chanRes = await callAction(new OpenAgentChannelAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: pepperAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'Topic', Type: 'Input', Value: 'R&D Spend Socratic Stress-Test' },
                { Name: 'TargetAgentName', Type: 'Input', Value: 'Cato' },
                { Name: 'InitialMessage', Type: 'Input', Value: 'Greetings Cato — poke holes in doubling R&D.' },
            ],
        });
        expect(chanRes.Success).toBe(true);
        expect(savedParticipants).toEqual([
            { UserID: alice.ID, AgentID: pepperAgent.ID, Role: 'Initiator' },
            { UserID: alice.ID, AgentID: catoAgent.ID, Role: 'Participant' },
        ]);

        // 2) Send Inter-Agent Request with TargetAgentName='Cato' and NO TargetUserID (exact Step 10 shape)
        const reqRes = await callAction(new SendInterAgentRequestAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: pepperAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'TargetAgentID', Type: 'Input', Value: catoAgent.ID },
                { Name: 'TargetAgentName', Type: 'Input', Value: 'Cato' },
                { Name: 'Subject', Type: 'Input', Value: 'Strategic Stress-Test Demonstration' },
                { Name: 'RequestBody', Type: 'Input', Value: 'Provide a Socratic critique.' },
            ],
        });
        expect(reqRes.Success).toBe(true);
    });

    it('CR-CHANNEL-CEILING-BYPASS: OpenAgentChannel enforces deployment and user-policy ceilings, allows tightening, and permits authorized ceiling overrides', async () => {
        const makeChannelMd = () => {
            const capturedChannels: Array<Partial<MJAgentChannelEntity>> = [];
            const adminAuth: Partial<AuthorizationInfo> = {
                ID: 'auth-manage-agents',
                Name: 'AI: Manage Agents',
                ParentID: null,
                UserCanExecute: (u: UserInfo) => u.UserRoles.some((r) => r.RoleID === 'role-manage-agents'),
            };
            const md: Partial<IMetadataProvider> = {
                Authorizations: [adminAuth as AuthorizationInfo],
                GetEntityObject: vi.fn(async (name: string) => {
                    if (name === 'MJ: Agent Channels') {
                        const chan: Partial<MJAgentChannelEntity> = {
                            ID: 'chan-ceiling-test',
                            NewRecord: vi.fn(),
                            Save: vi.fn(async () => {
                                capturedChannels.push(chan);
                                return true;
                            }),
                        };
                        return chan as never;
                    }
                    return {
                        ID: `${name}-1`,
                        NewRecord: vi.fn(),
                        Save: vi.fn(async () => true),
                    } as never;
                }),
            };
            return { md: md as IMetadataProvider, capturedChannels };
        };

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [bob] }),
        } as Partial<RunView> as RunView);
        vi.spyOn(AgentWakeTriggerService.Instance, 'TriggerWakeOnAgentChannelMessage').mockResolvedValue({
            channelID: 'chan-ceiling-test',
            channelStatus: 'Open',
            pausedByGuard: false,
            pauseReason: null,
            results: [],
        });

        try {
            // 1) Ordinary coordination-enabled user cannot exceed deployment (MjConfig) ceiling
            LimitsConfigResolver.Instance.RegisterMjConfigLimits({
                AgentChannelConsecutiveTurns: 25,
                AgentChannelWakesPerHour: 12,
            });
            vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
                status: 'found',
                policy: {
                    Status: 'Active',
                    CoordinationMode: 'Autonomous',
                    AllowInterAgentCoordination: true,
                } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity,
            });
            const fixture1 = makeChannelMd();
            const res1 = await callAction(new OpenAgentChannelAction() as never, {
                Action: {} as RunActionParams['Action'],
                ContextUser: alice,
                Context: { AgentID: cosAgent.ID },
                Provider: fixture1.md,
                Filters: [],
                Params: [
                    { Name: 'Topic', Type: 'Input', Value: 'Ceiling clamp test 1' },
                    { Name: 'TargetUserIDs', Type: 'Input', Value: bob.ID },
                    { Name: 'InitialMessage', Type: 'Input', Value: 'Attempt widening above deployment' },
                    { Name: 'MaxConsecutiveAgentTurns', Type: 'Input', Value: 9999 },
                    { Name: 'MaxHourlyWakes', Type: 'Input', Value: 5000 },
                ],
            });
            expect(res1.Success).toBe(true);
            expect(fixture1.capturedChannels[0]?.MaxConsecutiveAgentTurns).toBe(25);
            expect(fixture1.capturedChannels[0]?.MaxHourlyWakes).toBe(12);

            // 2) Ordinary user cannot exceed tighter UserAgentPolicy ceiling
            vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
                status: 'found',
                policy: {
                    Status: 'Active',
                    CoordinationMode: 'Autonomous',
                    AllowInterAgentCoordination: true,
                    InstructionsOverride: '<!-- mj-limits: {"AgentChannelConsecutiveTurns": 7, "AgentChannelWakesPerHour": 4} -->',
                } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity,
            });
            const fixture2 = makeChannelMd();
            const res2 = await callAction(new OpenAgentChannelAction() as never, {
                Action: {} as RunActionParams['Action'],
                ContextUser: alice,
                Context: { AgentID: cosAgent.ID },
                Provider: fixture2.md,
                Filters: [],
                Params: [
                    { Name: 'Topic', Type: 'Input', Value: 'Ceiling clamp test 2' },
                    { Name: 'TargetUserIDs', Type: 'Input', Value: bob.ID },
                    { Name: 'InitialMessage', Type: 'Input', Value: 'Attempt widening above user policy' },
                    { Name: 'MaxConsecutiveAgentTurns', Type: 'Input', Value: 20 },
                    { Name: 'MaxHourlyWakes', Type: 'Input', Value: 10 },
                ],
            });
            expect(res2.Success).toBe(true);
            expect(fixture2.capturedChannels[0]?.MaxConsecutiveAgentTurns).toBe(7);
            expect(fixture2.capturedChannels[0]?.MaxHourlyWakes).toBe(4);

            // 3) Tightening below defaults/policy remains effective for ordinary user
            vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
                status: 'found',
                policy: {
                    Status: 'Active',
                    CoordinationMode: 'Autonomous',
                    AllowInterAgentCoordination: true,
                    InstructionsOverride: '<!-- mj-limits: {"AgentChannelConsecutiveTurns": 15, "AgentChannelWakesPerHour": 10} -->',
                } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity,
            });
            const fixture3 = makeChannelMd();
            const res3 = await callAction(new OpenAgentChannelAction() as never, {
                Action: {} as RunActionParams['Action'],
                ContextUser: alice,
                Context: { AgentID: cosAgent.ID },
                Provider: fixture3.md,
                Filters: [],
                Params: [
                    { Name: 'Topic', Type: 'Input', Value: 'Tightening test' },
                    { Name: 'TargetUserIDs', Type: 'Input', Value: bob.ID },
                    { Name: 'InitialMessage', Type: 'Input', Value: 'Tighten below defaults' },
                    { Name: 'MaxConsecutiveAgentTurns', Type: 'Input', Value: 3 },
                    { Name: 'MaxHourlyWakes', Type: 'Input', Value: 2 },
                ],
            });
            expect(res3.Success).toBe(true);
            expect(fixture3.capturedChannels[0]?.MaxConsecutiveAgentTurns).toBe(3);
            expect(fixture3.capturedChannels[0]?.MaxHourlyWakes).toBe(2);

            // 4) Explicitly authorized caller ('AI: Manage Agents') can override ceilings following policy
            const authorizedUser: UserInfo = {
                ...alice,
                ID: 'user-agent-admin',
                UserRoles: [{ RoleID: 'role-manage-agents', Role: 'AI Manager' } as UserInfo['UserRoles'][number]],
            } as UserInfo;
            vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
                status: 'found',
                policy: {
                    Status: 'Active',
                    CoordinationMode: 'Autonomous',
                    AllowInterAgentCoordination: true,
                    InstructionsOverride: '<!-- mj-limits: {"AgentChannelConsecutiveTurns": 7, "AgentChannelWakesPerHour": 4} -->',
                } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity,
            });
            const fixture4 = makeChannelMd();
            const res4 = await callAction(new OpenAgentChannelAction() as never, {
                Action: {} as RunActionParams['Action'],
                ContextUser: authorizedUser,
                Context: { AgentID: cosAgent.ID },
                Provider: fixture4.md,
                Filters: [],
                Params: [
                    { Name: 'Topic', Type: 'Input', Value: 'Authorized override test' },
                    { Name: 'TargetUserIDs', Type: 'Input', Value: bob.ID },
                    { Name: 'InitialMessage', Type: 'Input', Value: 'Authorized raise' },
                    { Name: 'MaxConsecutiveAgentTurns', Type: 'Input', Value: 150 },
                    { Name: 'MaxHourlyWakes', Type: 'Input', Value: 80 },
                ],
            });
            expect(res4.Success).toBe(true);
            expect(fixture4.capturedChannels[0]?.MaxConsecutiveAgentTurns).toBe(150);
            expect(fixture4.capturedChannels[0]?.MaxHourlyWakes).toBe(80);
        } finally {
            LimitsConfigResolver.Instance.ClearMjConfigLimits();
        }
    });

    it('ReplyInAgentChannel blocks agents from posting when channel is Paused For Human', async () => {
        const pausedChannel = {
            ID: 'chan-paused',
            Topic: 'Paused thread',
            ChannelStatus: 'Paused For Human',
            Load: vi.fn().mockResolvedValue(true),
        } as Partial<MJAgentChannelEntity> as MJAgentChannelEntity;

        const md = {
            GetEntityObject: vi.fn().mockResolvedValue(pausedChannel),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [{ ID: 'part-1', UserID: alice.ID }] }),
        } as Partial<RunView> as RunView);

        const res = await callAction(new ReplyInAgentChannelAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'ChannelID', Type: 'Input', Value: 'chan-paused' },
                { Name: 'Message', Type: 'Input', Value: 'Trying to post while paused' },
            ],
        });

        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('CHANNEL_PAUSED_LOOP_GUARD');
    });

    it('GetAgentChannel blocks non-participants and Core read/cancel actions work cleanly', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
        } as Partial<RunView> as RunView);

        const deniedChannel = await callAction(new GetAgentChannelAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [{ Name: 'ChannelID', Type: 'Input', Value: 'chan-secret' }],
        });
        expect(deniedChannel.Success).toBe(false);
        expect(deniedChannel.ResultCode).toBe('POLICY_DENIED');

        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValue({
            status: 'none',
            policy: null,
        });
        const ctxRes = await callAction(new GetMyAgentContextAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [],
        });
        expect(ctxRes.Success).toBe(true);

        const routinesRes = await callAction(new ListMyAgentRoutinesAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [],
        });
        expect(routinesRes.Success).toBe(true);

        const cancelMissing = await callAction(new CancelAgentWakeAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [{ Name: 'WorkstreamKey', Type: 'Input', Value: 'does-not-exist' }],
        });
        expect(cancelMissing.Success).toBe(false);
        expect(cancelMissing.ResultCode).toBe('NOT_FOUND');

        const colleagueRes = await callAction(new FindColleagueAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [{ Name: 'Query', Type: 'Input', Value: 'bob' }],
        });
        expect(colleagueRes.Success).toBe(true);
    });

    it('EnableAgentRhythmAction seeds AgentConfigurationID from template default and supports ModelTier override', async () => {
        const fastCfgID = '3A1C5A15-8DAA-44E5-A098-F20085E6C93F';
        const highPowerCfgID = 'B6B9D780-52B2-431B-93AB-AC83FEF78553';

        interface RhythmTemplateStub {
            ID: string;
            AgentID: string;
            SkillID: string | null;
            Name: string;
            WorkstreamKey: string;
            Description: string;
            DefaultCronExpression: string;
            DefaultWakeGate: string | null;
            WakeReason: string;
            OfferAt: MJAIAgentRhythmTemplateEntity['OfferAt'];
            Status: MJAIAgentRhythmTemplateEntity['Status'];
            DefaultAgentConfigurationID: string | null;
            DefaultAgentConfiguration: string | null;
            Skill: string | null;
        }
        const template: RhythmTemplateStub = {
            ID: 'tpl-tier-1',
            AgentID: cosAgent.ID,
            SkillID: null,
            Name: 'Daily Calendar Guard & Conflict Check',
            WorkstreamKey: 'calendar-daily-review',
            Description: 'Daily conflict check',
            DefaultCronExpression: '15 7 * * 1-5',
            DefaultWakeGate: null,
            WakeReason: 'Check calendar',
            OfferAt: 'Onboarding',
            Status: 'Active',
            DefaultAgentConfigurationID: fastCfgID,
            DefaultAgentConfiguration: 'Fast',
            Skill: null,
        };

        const savedRoutines: Array<{ AgentConfigurationID: string | null }> = [];
        const routineStub = {
            ID: 'routine-tier-1',
            UserID: alice.ID,
            TargetID: cosAgent.ID,
            RoutineType: 'AgentWake',
            AgentConfigurationID: null as string | null,
            NewRecord: vi.fn(),
            Save: vi.fn(async () => {
                savedRoutines.push({
                    AgentConfigurationID: routineStub.AgentConfigurationID,
                });
                return true;
            }),
            WakeConfigurationObject: null as MJUserRoutineEntity['WakeConfigurationObject'],
        };

        let routineExists = false;
        class TierStubRunView extends RunView {
            public override RunView = vi.fn(async (p: { EntityName: string; ExtraFilter?: string }) => {
                if (p.EntityName === 'MJ: AI Agent Rhythm Templates') {
                    return { Success: true, Results: [template] };
                }
                if (p.EntityName === 'MJ: User Routines') {
                    return { Success: true, Results: routineExists ? [routineStub] : [] };
                }
                if (p.EntityName === 'MJ: AI Configurations') {
                    if (p.ExtraFilter?.includes("Name='High Power'")) {
                        return {
                            Success: true,
                            Results: [{ ID: highPowerCfgID, Name: 'High Power', Status: 'Active' }],
                        };
                    }
                    return {
                        Success: true,
                        Results: [{ ID: fastCfgID, Name: 'Fast', Status: 'Active' }],
                    };
                }
                if (p.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'pol-alice-cos',
                                AgentID: cosAgent.ID,
                                UserID: alice.ID,
                                Status: 'Active',
                                AllowInterAgentCoordination: true,
                                EmailChannelMode: 'DraftOnly',
                                Agent: 'Chief of Staff',
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }) as RunView['RunView'];
        }
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(new TierStubRunView());

        const md = {
            GetEntityObject: vi.fn().mockResolvedValue(routineStub),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        // First call: creation seeds AgentConfigurationID from template.DefaultAgentConfigurationID
        const seededRes = await callAction(new EnableAgentRhythmAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Provider: md,
            Filters: [],
            Params: [{ Name: 'WorkstreamKey', Type: 'Input', Value: 'calendar-daily-review' }],
        });
        expect(seededRes.Success).toBe(true);
        expect(routineStub.AgentConfigurationID).toBe(fastCfgID);
        expect(JSON.parse(seededRes.Message!).AgentConfigurationID).toBe(fastCfgID);

        // Second call: user overrides existing routine to High tier ('High Power')
        routineExists = true;
        routineStub.WakeConfigurationObject = { workstreamKey: 'calendar-daily-review' };
        const overrideRes = await callAction(new EnableAgentRhythmAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'calendar-daily-review' },
                { Name: 'ModelTier', Type: 'Input', Value: 'High' },
            ],
        });
        expect(overrideRes.Success).toBe(true);
        expect(routineStub.AgentConfigurationID).toBe(highPowerCfgID);
        expect(JSON.parse(overrideRes.Message!).AgentConfigurationID).toBe(highPowerCfgID);
        expect(savedRoutines).toHaveLength(2);
    });

    it('EnableAgentRhythmAction and ListAvailableRhythmsAction fall back to catalog configuration when template DefaultAgentConfigurationID is null in DB', async () => {
        const highPowerCfgID = 'B6B9D780-52B2-431B-93AB-AC83FEF78553';
        const unseededTemplate = {
            ID: 'tpl-unseeded-growth',
            AgentID: cosAgent.ID,
            SkillID: null,
            Name: 'Growth Coaching & Career Development Review',
            WorkstreamKey: 'growth-coaching',
            Description: 'Coaching review',
            DefaultCronExpression: '0 10 15 * *',
            DefaultWakeGate: null,
            WakeReason: 'Run growth coaching review',
            OfferAt: 'Both',
            Status: 'Active',
            DefaultAgentConfigurationID: null,
            DefaultAgentConfiguration: null,
            Skill: null,
        };

        const routineStub = {
            ID: 'routine-growth-1',
            UserID: alice.ID,
            TargetID: cosAgent.ID,
            RoutineType: 'AgentWake',
            AgentConfigurationID: null as string | null,
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
            WakeConfigurationObject: null as MJUserRoutineEntity['WakeConfigurationObject'],
        };

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (p: { EntityName: string }) => {
                if (p.EntityName === 'MJ: AI Agent Rhythm Templates') {
                    return { Success: true, Results: [unseededTemplate] };
                }
                if (p.EntityName === 'MJ: AI Configurations') {
                    return { Success: true, Results: [{ ID: highPowerCfgID, Name: 'High Power', Status: 'Active' }] };
                }
                if (p.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'pol-alice-cos',
                                AgentID: cosAgent.ID,
                                UserID: alice.ID,
                                Status: 'Active',
                                AllowInterAgentCoordination: true,
                                EmailChannelMode: 'DraftOnly',
                                Agent: 'Chief of Staff',
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }),
        } as Partial<RunView> as RunView);

        const listRes = await callAction(new ListAvailableRhythmsAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [],
        });
        expect(listRes.Success).toBe(true);
        const listed = JSON.parse(listRes.Message!);
        expect(listed.Rhythms[0].DefaultAgentConfigurationID).toBe(highPowerCfgID);
        expect(listed.Rhythms[0].DefaultAgentConfiguration).toBe('High Power');
        expect(listed.Rhythms[0].DefaultModelTier).toBe('High');

        const md = {
            GetEntityObject: vi.fn().mockResolvedValue(routineStub),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const enabledRes = await callAction(new EnableAgentRhythmAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Provider: md,
            Filters: [],
            Params: [{ Name: 'WorkstreamKey', Type: 'Input', Value: 'growth-coaching' }],
        });
        expect(enabledRes.Success).toBe(true);
        expect(routineStub.AgentConfigurationID).toBe(highPowerCfgID);
        expect(JSON.parse(enabledRes.Message!).AgentConfigurationID).toBe(highPowerCfgID);
    });

    it('AssembleMyBriefingAction includes Team section for managers with direct reports and omits Team for individual contributors', async () => {
        vi.spyOn(ActionEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'GetBriefingActionsForAgent').mockReturnValue([]);
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (p: { EntityName: string; ExtraFilter?: string }) => {
                if (p.EntityName === 'MJ: Users' && p.ExtraFilter?.includes(alice.ID)) {
                    return {
                        Success: true,
                        Results: [{ ID: alice.ID, EmployeeID: 'emp-alice', Email: alice.Email, IsActive: true }],
                    };
                }
                if (p.EntityName === 'MJ: Employees' && p.ExtraFilter?.includes("SupervisorID='emp-alice'")) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'emp-bob',
                                FirstName: 'Bob',
                                LastName: 'Manager',
                                Email: 'bob@example.com',
                                Title: 'Engineer',
                                SupervisorID: 'emp-alice',
                                Active: true,
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }),
        } as Partial<RunView> as RunView);

        const managerBriefingRes = await callAction(new AssembleMyBriefingAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Filters: [],
            Params: [{ Name: 'HorizonDays', Type: 'Input', Value: 7 }],
        });
        expect(managerBriefingRes.Success).toBe(true);
        const managerPayload = JSON.parse(managerBriefingRes.Message!) as {
            Team?: { DirectReportCount: number; DirectReports: Array<{ Email: string }> };
        };
        expect(managerPayload.Team).toBeDefined();
        expect(managerPayload.Team?.DirectReportCount).toBe(1);
        expect(managerPayload.Team?.DirectReports[0]?.Email).toBe('bob@example.com');

        const icBriefingRes = await callAction(new AssembleMyBriefingAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: bob,
            Filters: [],
            Params: [{ Name: 'HorizonDays', Type: 'Input', Value: 7 }],
        });
        expect(icBriefingRes.Success).toBe(true);
        const icPayload = JSON.parse(icBriefingRes.Message!) as { Team?: { DirectReportCount: number } };
        expect('Team' in icPayload).toBe(false);
    });
});
