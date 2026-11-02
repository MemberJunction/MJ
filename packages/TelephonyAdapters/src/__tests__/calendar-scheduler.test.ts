import { describe, it, expect, vi, afterEach } from 'vitest';
import { MSGraphProvider } from '@memberjunction/communication-ms-graph';
import { GraphCalendarSource } from '@memberjunction/ai-bridge-server';
import type { MJAIBridgeAgentIdentityEntity, MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { BuildCalendarSourceResolver } from '../telephony/calendar-scheduler.js';
import type { TeamsMeetingsConfig } from '../types.js';

const identity = { IdentityValue: 'sage@org.com' } as MJAIBridgeAgentIdentityEntity;
const teams = { DriverClass: 'TeamsBridge' } as MJAIBridgeProviderEntity;
const zoom = { DriverClass: 'ZoomBridge' } as MJAIBridgeProviderEntity;

afterEach(() => vi.restoreAllMocks());

describe('BuildCalendarSourceResolver', () => {
    it("reads a Teams identity's calendar through the MS Graph provider, with the bot token and no fallback", async () => {
        const sync = vi.spyOn(MSGraphProvider.prototype, 'SyncEvents').mockResolvedValue({ Success: true, Changes: [], NextSyncToken: 'delta-1' });
        const source = BuildCalendarSourceResolver({ botAccessToken: 'bot-token' } as TeamsMeetingsConfig)(identity, teams);

        expect(source).toBeInstanceOf(GraphCalendarSource);
        const poll = await source!.ListUpcomingInvites('sage@org.com');
        expect(poll.NextCursor).toBe('delta-1');
        expect(sync.mock.calls[0][0].Target).toEqual({ Identifier: 'sage@org.com' });
        expect(sync.mock.calls[0][1]).toEqual({ accessToken: 'bot-token', disableEnvironmentFallback: true });
    });

    it('binds nothing for a Teams identity when there is no bot token', () => {
        expect(BuildCalendarSourceResolver({} as TeamsMeetingsConfig)(identity, teams)).toBeNull();
    });

    it('binds nothing for other platforms', () => {
        expect(BuildCalendarSourceResolver({ botAccessToken: 'bot-token' } as TeamsMeetingsConfig)(identity, zoom)).toBeNull();
    });
});
