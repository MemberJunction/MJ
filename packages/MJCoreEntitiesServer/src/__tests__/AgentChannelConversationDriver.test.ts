import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    BaseEntity,
    IMetadataProvider,
    RunView,
    UserInfo,
    ValidationResult,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    MJAgentChannelEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { AgentChannelConversationDriver } from '../custom/AgentChannelConversationDriver.server';

const alice = { ID: 'user-alice', Name: 'Alice', Email: 'alice@example.com', Type: 'User', UserRoles: [] } as unknown as UserInfo;
const systemUser = { ID: 'user-sys', Name: 'System', Email: 'sys@example.com', Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

describe('AgentChannelConversationDriver', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u) => u?.ID === systemUser.ID
        );
    });

    it('validates Topic, MaxConsecutiveAgentTurns, and MaxHourlyWakes bounds', () => {
        const driver = new AgentChannelConversationDriver();
        const invalidEntity = {
            EntityInfo: { Name: 'MJ: Agent Channels' },
            Topic: '   ',
            MaxConsecutiveAgentTurns: 0,
            MaxHourlyWakes: 0,
        } as unknown as BaseEntity;

        const result = new ValidationResult();
        driver.Validate(invalidEntity, result, alice);

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual([
            'Topic',
            'MaxConsecutiveAgentTurns',
            'MaxHourlyWakes',
        ]);
    });

    it('CheckParticipantCanPost refuses non-participants and allows enrolled participants', async () => {
        const convStub = {
            ID: 'chan-1',
            TypeID: BUILT_IN_CONVERSATION_TYPE_IDS.AGENT_CHANNEL,
            Load: vi.fn().mockResolvedValue(true),
        } as unknown as MJConversationEntity;

        const provider = {
            ProviderType: 'Database',
            GetEntityObject: vi.fn().mockResolvedValue(convStub),
        } as unknown as IMetadataProvider;

        const runViewMock = vi
            .fn()
            .mockResolvedValueOnce({ Success: true, Results: [] })
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'part-1' }] });

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: runViewMock,
        } as unknown as RunView);

        const refused = await AgentChannelConversationDriver.CheckParticipantCanPost(provider, 'chan-1', alice);
        expect(refused).toContain('not a participant');

        const allowed = await AgentChannelConversationDriver.CheckParticipantCanPost(provider, 'chan-1', alice);
        expect(allowed).toBeNull();
    });

    it('HandleHumanMessagePosted resets ConsecutiveAgentTurns and re-opens Paused For Human channels', async () => {
        const now = new Date('2026-11-20T18:00:00Z');
        const convStub = {
            ID: 'chan-1',
            TypeID: BUILT_IN_CONVERSATION_TYPE_IDS.AGENT_CHANNEL,
            Load: vi.fn().mockResolvedValue(true),
        } as unknown as MJConversationEntity;
        const chanStub = {
            ID: 'chan-1',
            ChannelStatus: 'Paused For Human' as MJAgentChannelEntity['ChannelStatus'],
            ConsecutiveAgentTurns: 10,
            LastHumanMessageAt: null as Date | null,
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            LatestResult: null,
        } as unknown as MJAgentChannelEntity;

        const provider = {
            ProviderType: 'Database',
            GetEntityObject: vi.fn(async (name: string) =>
                name === 'MJ: Conversations' ? convStub : chanStub
            ),
        } as unknown as IMetadataProvider;

        const res = await AgentChannelConversationDriver.HandleHumanMessagePosted(provider, 'chan-1', alice, now);
        expect(res.isAgentChannel).toBe(true);
        expect(res.updated).toBe(true);
        expect(res.reopenedFromPause).toBe(true);
        expect(res.channelStatus).toBe('Open');
        expect(chanStub.ConsecutiveAgentTurns).toBe(0);
        expect(chanStub.LastHumanMessageAt).toEqual(now);
        expect(chanStub.Save).toHaveBeenCalledTimes(1);
    });
});
