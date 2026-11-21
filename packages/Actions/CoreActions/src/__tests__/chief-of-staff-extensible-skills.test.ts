import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunActionParams } from '@memberjunction/actions-base';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
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
} as unknown as UserInfo;

const bob = {
    ID: 'user-bob',
    Name: 'Bob Manager',
    FirstName: 'Bob',
    LastName: 'Manager',
    Email: 'bob@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
} as unknown as UserInfo;

const systemUser = {
    ID: 'user-system',
    Name: 'System',
    Email: 'system@example.com',
    IsActive: true,
    Type: 'Owner',
    UserRoles: [],
} as unknown as UserInfo;

const cosAgent = {
    ID: 'agent-cos',
    Name: 'Chief of Staff',
    AcceptsSkills: 'All',
    SkillActivationMode: 'Auto',
} as unknown as MJAIAgentEntityExtended;

function callAction(
    action: { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; ResultCode?: string; Message?: string }> },
    params: RunActionParams
) {
    return (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; ResultCode?: string; Message?: string }> }).InternalRunAction(params);
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

    it('ScheduleNextAgentWakeAction blocks autonomous Recurring creation without RhythmTemplateID or ConfirmedByUser', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
        } as unknown as RunView);

        const res = await callAction(new ScheduleNextAgentWakeAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: {} as IMetadataProvider,
            Filters: [],
            Params: [
                { Name: 'ScheduleMode', Type: 'Input', Value: 'Recurring' },
                { Name: 'CronExpression', Type: 'Input', Value: '0 8 * * 1-5' },
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'unrequested-rhythm' },
                { Name: 'WakeReason', Type: 'Input', Value: 'Auto-created rhythm' },
            ],
        });

        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('APPROVAL_REQUIRED');
    });

    it('SendInterAgentRequestAction enforces Coordinator APPROVAL_REQUIRED during autonomous agent runs', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [{ ID: bob.ID, IsActive: true }] }),
        } as unknown as RunView);
        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValue({
            status: 'found',
            policy: {
                Status: 'Active',
                CoordinationMode: 'Coordinator',
                AllowInterAgentCoordination: true,
            } as unknown as MJAIAgentUserPolicyEntity,
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
        } as unknown as RunView);

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
        } as unknown as RunView);

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
        } as unknown as MJAIAgentRhythmTemplateEntity;

        const declinedTemplate = {
            ...template,
            ID: 'tpl-2',
            Name: 'Declined Rhythm',
            WorkstreamKey: 'declined-key',
        } as unknown as MJAIAgentRhythmTemplateEntity;

        const declinedSuggestion = {
            ID: 'sug-1',
            TargetKey: 'declined-key',
            Status: 'Declined',
            Save: vi.fn().mockResolvedValue(true),
        } as unknown as MJAIAgentSuggestionEntity;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (p: { EntityName: string }) => {
                if (p.EntityName === 'MJ: AI Agent Rhythm Templates') {
                    return { Success: true, Results: [template, declinedTemplate] };
                }
                if (p.EntityName === 'MJ: AI Agent Suggestions') {
                    return { Success: true, Results: [declinedSuggestion] };
                }
                return { Success: true, Results: [] };
            }),
        } as unknown as RunView);

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

        // Enabling during an agent call without ConfirmedByUser must fail with APPROVAL_REQUIRED
        const blockedEnable = await callAction(new EnableAgentRhythmAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Filters: [],
            Params: [{ Name: 'WorkstreamKey', Type: 'Input', Value: 'calendar-daily-review' }],
        });
        expect(blockedEnable.Success).toBe(false);
        expect(blockedEnable.ResultCode).toBe('APPROVAL_REQUIRED');

        const routineStub = {
            ID: 'routine-new-1',
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
            WakeConfigurationObject: null,
        } as unknown as MJUserRoutineEntity;
        const md = {
            GetEntityObject: vi.fn().mockResolvedValue(routineStub),
        } as unknown as IMetadataProvider;

        const enabledRes = await callAction(new EnableAgentRhythmAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: cosAgent.ID },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'WorkstreamKey', Type: 'Input', Value: 'calendar-daily-review' },
                { Name: 'Timezone', Type: 'Input', Value: 'America/Chicago' },
                { Name: 'ConfirmedByUser', Type: 'Input', Value: true },
            ],
        });
        expect(enabledRes.Success).toBe(true);
        expect(routineStub.ScheduleMode).toBe('Recurring');
        expect(routineStub.CronExpression).toBe('30 7 * * 1-5');
        expect(routineStub.Timezone).toBe('America/Chicago');
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
        } as unknown as RunView);

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
            } as unknown as MJAIAgentUserPolicyEntity,
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
            } as unknown as MJAIAgentUserPolicyEntity,
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
        } as unknown as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [bob] }),
        } as unknown as RunView);

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

    it('ReplyInAgentChannel blocks agents from posting when channel is Paused For Human', async () => {
        const pausedChannel = {
            ID: 'chan-paused',
            Topic: 'Paused thread',
            ChannelStatus: 'Paused For Human',
            Load: vi.fn().mockResolvedValue(true),
        } as unknown as MJAgentChannelEntity;

        const md = {
            GetEntityObject: vi.fn().mockResolvedValue(pausedChannel),
        } as unknown as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [{ ID: 'part-1', UserID: alice.ID }] }),
        } as unknown as RunView);

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
        } as unknown as RunView);

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
});
