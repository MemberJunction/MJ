import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunActionParams } from '@memberjunction/actions-base';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJAgentChannelEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { TypedActionPolicyGuard } from '@memberjunction/ai-core-plus';
import { AgentWakeTriggerService } from '@memberjunction/ai-agents';
import { UserCache } from '@memberjunction/generic-database-provider';
import { ReplyInAgentChannelAction } from '../custom/ai/agent-channel.action';

const alice = {
    ID: '7F9B1C2D-3E4F-4A5B-8C6D-7E8F9A0B1C2D',
    Name: 'Alice Executive',
    Email: 'alice@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
} as Partial<UserInfo> as UserInfo;

const systemUser = {
    ID: '11111111-2222-4333-8444-555555555555',
    Name: 'System',
    Email: 'system@example.com',
    IsActive: true,
    Type: 'Owner',
    UserRoles: [],
} as Partial<UserInfo> as UserInfo;

const pepperAgentId = 'A1B2C3D4-E5F6-4789-8ABC-DEF012345678';
const catoAgentId = 'B2C3D4E5-F6A7-4890-9BCD-EF0123456789';

interface ActionRunnerHarness {
    InternalRunAction: (p: RunActionParams) => Promise<{
        Success: boolean;
        ResultCode?: string;
        Message?: string;
        Params: RunActionParams['Params'];
    }>;
}

function callAction(action: ActionRunnerHarness, params: RunActionParams) {
    return action.InternalRunAction(params);
}

describe('ReplyInAgentChannelAction — ResolveChannel behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(TypedActionPolicyGuard, 'CheckEntityAccess').mockResolvedValue({
            Allowed: true,
            ResultCode: 'ALLOWED',
            Message: 'Allowed',
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: [{ ID: 'part-alice', UserID: alice.ID }],
            }),
        } as Partial<RunView> as RunView);
    });

    it('wakes peer participant agents when ResolveChannel is false (default)', async () => {
        const channel: Partial<MJAgentChannelEntity> = {
            ID: 'C1111111-2222-4333-8444-555555555555',
            Topic: 'Q4 Strategic Plan Stress-Test',
            ChannelStatus: 'Open',
            ResolvedAt: null,
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
        };
        const detail: Partial<MJConversationDetailEntity> & { MarkServerAuthoredReply?: () => void } = {
            ID: 'D1111111-2222-4333-8444-555555555555',
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
            MarkServerAuthoredReply: vi.fn(),
        };

        const md = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Agent Channels') return channel as never;
                if (entityName === 'MJ: Conversation Details') return detail as never;
                throw new Error(`Unexpected entity: ${entityName}`);
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const wakeSpy = vi
            .spyOn(AgentWakeTriggerService.Instance, 'TriggerWakeOnAgentChannelMessage')
            .mockResolvedValue({
                channelID: channel.ID!,
                channelStatus: 'Open',
                pausedByGuard: false,
                pauseReason: null,
                results: [
                    {
                        recipientUserID: alice.ID,
                        recipientAgentID: catoAgentId,
                        triggered: true,
                        routineID: 'routine-cato-wake',
                        reason: 'Scheduled immediate wake',
                    },
                ],
            });

        const res = await callAction(new ReplyInAgentChannelAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: pepperAgentId },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'ChannelID', Type: 'Input', Value: channel.ID },
                { Name: 'Message', Type: 'Input', Value: 'What risks do you see in EMEA churn?' },
            ],
        });

        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(wakeSpy).toHaveBeenCalledTimes(1);
        expect(channel.Save).not.toHaveBeenCalled();

        const payload = JSON.parse(res.Message ?? '{}') as {
            ChannelStatus: string;
            PausedByGuard: boolean;
            PauseReason: string | null;
            WakeResults: unknown[];
        };
        expect(payload.ChannelStatus).toBe('Open');
        expect(payload.PausedByGuard).toBe(false);
        expect(payload.PauseReason).toBeNull();
        expect(payload.WakeResults).toHaveLength(1);
    });

    it('resolves the channel immediately without calling TriggerWakeOnAgentChannelMessage when ResolveChannel is true', async () => {
        const channel: Partial<MJAgentChannelEntity> = {
            ID: 'C2222222-2222-4333-8444-555555555555',
            Topic: 'Q4 Strategic Plan Stress-Test',
            ChannelStatus: 'Open',
            ResolvedAt: null,
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
        };
        const detail: Partial<MJConversationDetailEntity> & { MarkServerAuthoredReply?: () => void } = {
            ID: 'D2222222-2222-4333-8444-555555555555',
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
            MarkServerAuthoredReply: vi.fn(),
        };

        const md = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Agent Channels') return channel as never;
                if (entityName === 'MJ: Conversation Details') return detail as never;
                throw new Error(`Unexpected entity: ${entityName}`);
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const wakeSpy = vi.spyOn(AgentWakeTriggerService.Instance, 'TriggerWakeOnAgentChannelMessage');

        const res = await callAction(new ReplyInAgentChannelAction() as never, {
            Action: {} as RunActionParams['Action'],
            ContextUser: alice,
            Context: { AgentID: catoAgentId },
            Provider: md,
            Filters: [],
            Params: [
                { Name: 'ChannelID', Type: 'Input', Value: channel.ID },
                { Name: 'Message', Type: 'Input', Value: 'Agreed on the mitigation plan — closing thread.' },
                { Name: 'ResolveChannel', Type: 'Input', Value: true },
            ],
        });

        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(detail.Save).toHaveBeenCalledTimes(1);
        expect(channel.ChannelStatus).toBe('Resolved');
        expect(channel.ResolvedAt).toBeInstanceOf(Date);
        expect(channel.Save).toHaveBeenCalledTimes(1);
        expect(wakeSpy).not.toHaveBeenCalled();

        const payload = JSON.parse(res.Message ?? '{}') as {
            ChannelID: string;
            ConversationDetailID: string;
            ChannelStatus: string;
            PausedByGuard: boolean;
            PauseReason: string | null;
            WakeResults: unknown[];
        };
        expect(payload.ChannelID).toBe(channel.ID);
        expect(payload.ConversationDetailID).toBe(detail.ID);
        expect(payload.ChannelStatus).toBe('Resolved');
        expect(payload.PausedByGuard).toBe(false);
        expect(payload.PauseReason).toBeNull();
        expect(payload.WakeResults).toEqual([]);
    });
});
