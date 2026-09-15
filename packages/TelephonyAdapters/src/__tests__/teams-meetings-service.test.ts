import { describe, it, expect, vi } from 'vitest';
import { TeamsMeetingsService } from '../telephony/TeamsMeetingsService.js';
import { TeamsAcsMediaRegistry } from '../telephony/teamsAcsMediaRegistry.js';
import { RealTeamsBindings } from '@memberjunction/ai-bridge-teams';
import type { BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import type { TeamsMeetingsConfig } from '../types.js';

const CONFIG: TeamsMeetingsConfig = {
    enabled: true,
    tenantId: 'tenant-1',
    botAccessToken: 'tok',
    notificationClientState: 'secret',
    acsSampleRate: 16000,
    modelSampleRate: 16000,
};

describe('TeamsMeetingsService.buildBindSdk', () => {
    it('binds a RealTeamsBindings factory onto the Teams driver', () => {
        const service = new TeamsMeetingsService(CONFIG, new TeamsAcsMediaRegistry());
        const setSdkFactory = vi.fn();
        const fakeDriver = { SetSdkFactory: setSdkFactory } as unknown as BaseRealtimeBridge;
        const graphClient = { CreateCall: vi.fn() } as unknown as Parameters<typeof service.buildBindSdk>[0];

        service.buildBindSdk(graphClient)(fakeDriver);

        expect(setSdkFactory).toHaveBeenCalledTimes(1);
        const factory = setSdkFactory.mock.calls[0][0] as () => unknown;
        expect(typeof factory).toBe('function');
        expect(factory()).toBeInstanceOf(RealTeamsBindings);
    });
});

describe('TeamsMeetingsService.JoinMeetingByUrl', () => {
    it('returns accepted=false (never throws) when the agent identity is missing', async () => {
        const provider = {
            GetEntityObject: vi.fn().mockResolvedValue({ Load: vi.fn().mockResolvedValue(false), IsActive: false }),
        };
        const service = new TeamsMeetingsService(CONFIG, new TeamsAcsMediaRegistry());
        const result = await service.JoinMeetingByUrl(
            'identity-1',
            'https://teams.microsoft.com/l/meetup-join/x',
            { ID: 'u1' } as never,
            provider as never,
        );
        expect(result.accepted).toBe(false);
        expect(result.reason).toMatch(/not found or inactive/i);
    });
});

describe('TeamsMeetingsService notification drive helpers', () => {
    it('tears down the call + registry on call-ended (no throw when no client registered)', () => {
        const registry = new TeamsAcsMediaRegistry();
        registry.RegisterCall('call-1');
        expect(registry.HasCall('call-1')).toBe(true);
        const service = new TeamsMeetingsService(CONFIG, registry);

        service.DriveCallEnded('call-1');
        expect(registry.HasCall('call-1')).toBe(false);
        expect(() => service.DriveParticipantsUpdated('unknown', [{ id: 'p1' }])).not.toThrow();
    });
});
