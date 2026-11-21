import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AgentWakeTriggerService } from '../AgentWakeTriggerService';

function makeUser(id: string, email: string, type: 'User' | 'Owner' = 'User'): UserInfo {
    return {
        ID: id,
        Name: email.split('@')[0],
        Email: email,
        IsActive: true,
        Type: type,
        UserRoles: [],
    } as unknown as UserInfo;
}

describe('AgentWakeTriggerService.TriggerWakeOnAgentChannelMessage', () => {
    const alice = makeUser('user-alice', 'alice@example.com');
    const bob = makeUser('user-bob', 'bob@example.com');
    const mallory = makeUser('user-mallory', 'mallory@example.com');
    const systemUser = makeUser('user-system', 'system@example.com', 'Owner');

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
    });

    function buildChannelFixture(overrides: Partial<MJAgentChannelEntity> = {}) {
        const channel = {
            ID: 'chan-1',
            Topic: 'Q3 Launch Alignment',
            ChannelStatus: 'Open' as MJAgentChannelEntity['ChannelStatus'],
            ConsecutiveAgentTurns: 0,
            MaxConsecutiveAgentTurns: 10,
            LastHumanMessageAt: null as Date | null,
            HourlyWakeCount: 0,
            HourlyWakeWindowStart: null as Date | null,
            MaxHourlyWakes: 6,
            Save: vi.fn().mockResolvedValue(true),
            Load: vi.fn().mockResolvedValue(true),
            LatestResult: null,
            ...overrides,
        } as unknown as MJAgentChannelEntity;

        const participants = [
            { ID: 'p-1', AgentChannelID: 'chan-1', UserID: alice.ID, AgentID: 'agent-cos', Role: 'Initiator' },
            { ID: 'p-2', AgentChannelID: 'chan-1', UserID: bob.ID, AgentID: 'agent-cos', Role: 'Participant' },
        ] as unknown as MJAgentChannelParticipantEntity[];

        const routineStub = {
            ID: 'routine-chan-1',
            UserID: '',
            Name: '',
            RoutineType: 'AgentWake',
            ScheduleMode: 'OneShot',
            TargetType: 'Agent',
            TargetID: '',
            Status: 'Active',
            NextRunAt: null as Date | null,
            InitialMessage: '',
            StartingPayload: '',
            Description: '',
            WakeConfiguration: null as string | null,
            WakeConfigurationObject: null as Record<string, unknown> | null,
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
            LatestResult: null,
        } as unknown as MJUserRoutineEntity;

        const md = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Agent Channels') {
                    return channel;
                }
                return routineStub;
            }),
        } as unknown as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Agent Channel Participants') {
                    return { Success: true, Results: participants };
                }
                return { Success: true, Results: [] };
            }),
        } as unknown as RunView);

        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValue({
            status: 'found',
            policy: {
                Status: 'Active',
                AllowInterAgentCoordination: true,
                Agent: 'Chief of Staff',
            } as unknown as never,
        });

        return { channel, participants, routineStub, md };
    }

    it('rejects non-participants with POLICY_DENIED and does not mutate channel or schedule wakes', async () => {
        const { channel, md } = buildChannelFixture();
        const outcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
            channelID: 'chan-1',
            senderUserID: mallory.ID,
            senderAgentID: 'agent-cos',
            messagePreview: 'Unauthorized message',
            contextUser: mallory,
            metadataProvider: md,
        });

        expect(outcome.results[0].resultCode).toBe('POLICY_DENIED');
        expect(channel.Save).not.toHaveBeenCalled();
    });

    it('wakes peer participant and increments ConsecutiveAgentTurns and HourlyWakeCount', async () => {
        const { channel, routineStub, md } = buildChannelFixture();
        const now = new Date('2026-11-20T16:00:00Z');
        const outcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
            channelID: 'chan-1',
            conversationDetailID: 'detail-1',
            senderUserID: alice.ID,
            senderAgentID: 'agent-cos',
            messagePreview: 'Can Bob confirm Friday milestones?',
            contextUser: alice,
            metadataProvider: md,
            now,
        });

        expect(outcome.pausedByGuard).toBe(false);
        expect(outcome.channelStatus).toBe('Open');
        expect(channel.ConsecutiveAgentTurns).toBe(1);
        expect(channel.HourlyWakeCount).toBe(1);
        expect(outcome.results).toHaveLength(1);
        expect(outcome.results[0].triggered).toBe(true);
        expect(outcome.results[0].targetUserID).toBe(bob.ID);
        expect(outcome.results[0].workstreamKey).toBe('channel-chan-1');
        expect(routineStub.Save).toHaveBeenCalledTimes(1);
    });

    it('pauses channel to Paused For Human when ConsecutiveAgentTurns exceeds MaxConsecutiveAgentTurns', async () => {
        const { channel, md } = buildChannelFixture({
            ConsecutiveAgentTurns: 10,
            MaxConsecutiveAgentTurns: 10,
        });
        const outcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
            channelID: 'chan-1',
            senderUserID: alice.ID,
            senderAgentID: 'agent-cos',
            messagePreview: '11th consecutive agent turn',
            contextUser: alice,
            metadataProvider: md,
        });

        expect(outcome.pausedByGuard).toBe(true);
        expect(outcome.channelStatus).toBe('Paused For Human');
        expect(outcome.results[0].resultCode).toBe('CHANNEL_PAUSED_LOOP_GUARD');
        expect(channel.ChannelStatus).toBe('Paused For Human');
    });

    it('pauses channel to Paused For Human when HourlyWakeCount exceeds MaxHourlyWakes within 1 hour', async () => {
        const now = new Date('2026-11-20T16:30:00Z');
        const { channel, md } = buildChannelFixture({
            ConsecutiveAgentTurns: 2,
            MaxConsecutiveAgentTurns: 10,
            HourlyWakeCount: 6,
            HourlyWakeWindowStart: new Date('2026-11-20T16:00:00Z'),
            MaxHourlyWakes: 6,
        });

        const outcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
            channelID: 'chan-1',
            senderUserID: alice.ID,
            senderAgentID: 'agent-cos',
            messagePreview: '7th wake in same hour',
            contextUser: alice,
            metadataProvider: md,
            now,
        });

        expect(outcome.pausedByGuard).toBe(true);
        expect(outcome.channelStatus).toBe('Paused For Human');
        expect(outcome.results[0].resultCode).toBe('CHANNEL_PAUSED_RATE_LIMIT');
        expect(channel.ChannelStatus).toBe('Paused For Human');
    });

    it('resets ConsecutiveAgentTurns and re-opens Paused For Human when a human participant replies', async () => {
        const now = new Date('2026-11-20T17:00:00Z');
        const { channel, md } = buildChannelFixture({
            ChannelStatus: 'Paused For Human',
            ConsecutiveAgentTurns: 11,
        });

        const outcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
            channelID: 'chan-1',
            senderUserID: alice.ID,
            senderAgentID: null,
            messagePreview: 'Human stepping in: approve option B.',
            contextUser: alice,
            metadataProvider: md,
            now,
        });

        expect(outcome.pausedByGuard).toBe(false);
        expect(outcome.channelStatus).toBe('Open');
        expect(channel.ConsecutiveAgentTurns).toBe(0);
        expect(channel.LastHumanMessageAt).toEqual(now);
        expect(outcome.results[0].triggered).toBe(true);
    });
});
