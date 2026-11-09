import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { TeamsMeetingsService, type TeamsMeetingsServiceDeps } from '../telephony/TeamsMeetingsService.js';
import { TeamsAcsMediaRegistry } from '../telephony/teamsAcsMediaRegistry.js';
import { RealTeamsBindings, type RealGraphCallsClient } from '@memberjunction/ai-bridge-teams';
import type { BaseRealtimeBridge, BridgeDisconnectReason } from '@memberjunction/ai-bridge-base';
import type { StartBridgeSessionParams } from '@memberjunction/ai-bridge-server';
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

const USER = { ID: 'user-1' } as unknown as UserInfo;
const JOIN_URL = 'https://teams.microsoft.com/l/meetup-join/x';

/** One row of the fake `MJ: AI Agent Sessions` table. */
interface SessionRecord {
    Status: string;
    ClosedAt?: Date | null;
    CloseReason?: string | null;
}

/** A metadata provider over a fake `MJ: AI Agent Sessions` table, with one active Teams agent identity. */
function fakeProvider(sessions: Map<string, SessionRecord>): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: AI Bridge Agent Identities') {
                return { Load: async () => true, IsActive: true, AgentID: 'agent-1' };
            }
            const row = {
                ID: '',
                Status: '',
                ClosedAt: null as Date | null,
                CloseReason: null as string | null,
                Load: async (id: string) => {
                    const stored = sessions.get(id);
                    if (!stored) {
                        return false;
                    }
                    Object.assign(row, { ClosedAt: null, CloseReason: null }, stored, { ID: id });
                    return true;
                },
                Save: async () => {
                    sessions.set(row.ID, { Status: row.Status, ClosedAt: row.ClosedAt, CloseReason: row.CloseReason });
                    return true;
                },
            };
            return row;
        }),
    } as unknown as IMetadataProvider;
}

/** A Teams service over a fake bridge engine and session table, joining one meeting as `agent-1`. */
function setupTeamsJoin() {
    const sessions = new Map<string, SessionRecord>();
    const started: StartBridgeSessionParams[] = [];
    const engine = {
        Config: vi.fn(async () => undefined),
        ProviderByDriverClass: vi.fn(() => ({ ID: 'teams-provider', Name: 'Microsoft Teams' })),
        ProviderByName: vi.fn(() => undefined),
        StartBridgeSession: vi.fn(async (params: StartBridgeSessionParams) => {
            started.push(params);
            return { SessionBridgeID: 'bridge-1', RoomKey: 'call-1' };
        }),
    };
    const sessionManager = {
        CreateSession: vi.fn(async () => {
            sessions.set('session-1', { Status: 'Active' });
            return { ID: 'session-1' };
        }),
    };
    const service = new TeamsMeetingsService(CONFIG, new TeamsAcsMediaRegistry(), {
        engine: engine as unknown as TeamsMeetingsServiceDeps['engine'],
        sessionFactory: vi.fn(async () => ({ Close: vi.fn() })) as unknown as TeamsMeetingsServiceDeps['sessionFactory'],
        sessionManager: sessionManager as unknown as TeamsMeetingsServiceDeps['sessionManager'],
        graphClientFactory: () => ({}) as unknown as RealGraphCallsClient,
    });
    const provider = fakeProvider(sessions);
    return {
        service,
        sessions,
        provider,
        join: () => service.JoinMeetingByUrl('identity-1', JOIN_URL, USER, provider),
        /** What the bridge engine does once a bridge has ended, whatever ended it: it runs the start's end-of-session hook. */
        endBridge: async (reason: BridgeDisconnectReason): Promise<void> => {
            await started[0]?.OnSessionEnded?.(reason);
        },
    };
}

describe('TeamsMeetingsService: the agent session closes when the bridge ends', () => {
    it.each([
        ['Explicit', 'Explicit'],
        ['HostEnded', 'Explicit'],
        ['Error', 'Error'],
        ['Janitor', 'Janitor'],
        ['Shutdown', 'Shutdown'],
    ] as const)('closes the session the join created as soon as its bridge ends (%s), as %s', async (bridgeReason, closeReason) => {
        const t = setupTeamsJoin();
        expect((await t.join()).accepted).toBe(true);
        expect(t.sessions.get('session-1')?.Status).toBe('Active');

        await t.endBridge(bridgeReason);

        expect(t.sessions.get('session-1')).toMatchObject({ Status: 'Closed', CloseReason: closeReason });
        expect(t.sessions.get('session-1')?.ClosedAt).toBeInstanceOf(Date);
    });

    it('leaves open a session the caller passed in (a scheduled join)', async () => {
        const t = setupTeamsJoin();
        t.sessions.set('scheduled-session', { Status: 'Idle' });

        const params = await t.service.BuildScheduledStartParams({
            agentID: 'agent-1',
            joinUrl: JOIN_URL,
            agentSessionID: 'scheduled-session',
            contextUser: USER,
            provider: t.provider,
        });
        await params.OnSessionEnded?.('HostEnded');

        expect(params.AgentSessionID).toBe('scheduled-session');
        expect(t.sessions.get('scheduled-session')).toEqual({ Status: 'Idle' });
    });
});
