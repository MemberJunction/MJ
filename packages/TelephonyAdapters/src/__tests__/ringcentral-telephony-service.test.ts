import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { InboundInviteInfo, RingCentralSoftphoneHandle } from '@memberjunction/ai-bridge-ringcentral';

const runViewMock = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunView: class {
        public RunView = runViewMock;
    },
}));
vi.mock('../telephony/runAsIdentity.js', () => ({ ResolveInboundContext: vi.fn() }));

import { LogError } from '@memberjunction/core';
import { ResolveInboundContext } from '../telephony/runAsIdentity.js';
import { RingCentralTelephonyService } from '../telephony/RingCentralTelephonyService.js';
import { OutboundCallRefusedError } from '../telephony/outboundCallPolicy.js';
import type { RingCentralTelephonyConfig } from '../types.js';

const CONFIG: RingCentralTelephonyConfig = {
    sipDomain: 'sip.ringcentral.com',
    sipOutboundProxy: 'sip10.ringcentral.com:5096',
    sipUsername: 'u',
    sipPassword: 'p',
    sipAuthorizationId: 'a',
    inboundRunAsUserEmail: 'phone-bot@acme.com',
};
const USER = { ID: 'user-1' } as unknown as UserInfo;
const PROVIDER = {} as unknown as IMetadataProvider;
const PROVIDER_ID = 'PROV-RC';
const IDENTITY = { ID: 'ident-1', AgentID: 'agent-1', ProviderID: PROVIDER_ID, IsActive: true, IdentityValue: '+18005550100' };

function dbProvider(): IMetadataProvider {
    return { GetEntityObject: async () => ({ ...IDENTITY, Load: async () => true }) } as unknown as IMetadataProvider;
}

function fakeEngine() {
    return {
        Config: vi.fn(async () => undefined),
        ProviderByDriverClass: vi.fn(() => ({ ID: PROVIDER_ID })),
        ProviderByName: vi.fn(() => undefined),
        StartBridgeSession: vi.fn(async () => ({ SessionBridgeID: 'SB1', RoomKey: 'SIP-CALL-1' })),
        StopBridgeSession: vi.fn(async () => true),
    };
}

interface Harness {
    service: RingCentralTelephonyService;
    engine: ReturnType<typeof fakeEngine>;
    handle: { onInvite: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn>; declineCall: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
    invite: (info: InboundInviteInfo) => Promise<void>;
}

async function harness(config: RingCentralTelephonyConfig = CONFIG, canRunAgent: (a: string, u: UserInfo) => Promise<boolean> = async () => true): Promise<Harness> {
    const engine = fakeEngine();
    let inviteListener: ((info: InboundInviteInfo) => void) | undefined;
    const handle = {
        onInvite: vi.fn((cb: (info: InboundInviteInfo) => void) => {
            inviteListener = cb;
        }),
        register: vi.fn(async () => undefined),
        declineCall: vi.fn(async () => undefined),
        dispose: vi.fn(),
    };
    const service = new RingCentralTelephonyService(config, {
        engine: engine as never,
        sessionFactory: vi.fn(async () => ({})) as never,
        sessionManager: { CreateSession: vi.fn(async () => ({ ID: 'AS1' })) } as never,
        createHandle: (async () => handle as unknown as RingCentralSoftphoneHandle) as never,
        canRunAgent,
    });
    await service.Start();
    return {
        service,
        engine,
        handle,
        invite: async (info) => {
            inviteListener?.(info);
            await vi.waitFor(() => expect(handle.declineCall.mock.calls.length + engine.StartBridgeSession.mock.calls.length).toBeGreaterThan(0));
        },
    };
}

const INVITE: InboundInviteInfo = { callId: 'SIP-CALL-1', from: '+14155550123', to: '+18005550100' };

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [IDENTITY] });
    vi.mocked(LogError).mockClear();
    vi.mocked(ResolveInboundContext).mockReset();
    vi.mocked(ResolveInboundContext).mockReturnValue({ Ok: true, User: USER, Provider: PROVIDER });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('inbound INVITE', () => {
    it('declines the INVITE and logs the dialed number when there is no usable run-as user (no System/Owner fallback)', async () => {
        vi.mocked(ResolveInboundContext).mockReturnValue({ Ok: false, Reason: 'telephony.inboundRunAsUserEmail is not configured' });
        const h = await harness();

        await h.invite(INVITE);

        expect(h.handle.declineCall).toHaveBeenCalledWith('SIP-CALL-1');
        expect(h.engine.StartBridgeSession).not.toHaveBeenCalled();
        const logged = String(vi.mocked(LogError).mock.calls[0][0]);
        expect(logged).toContain('+18005550100');
        expect(logged).toContain('inboundRunAsUserEmail');
    });

    it('resolves the run-as user from the configured email', async () => {
        const h = await harness();
        await h.invite(INVITE);
        expect(ResolveInboundContext).toHaveBeenCalledWith('phone-bot@acme.com');
    });

    it('starts the session as the configured run-as user when admitted', async () => {
        const h = await harness();
        await h.invite(INVITE);
        const args = h.engine.StartBridgeSession.mock.calls[0][0] as { ContextUser: UserInfo; Direction: string };
        expect(args.ContextUser).toBe(USER);
        expect(args.Direction).toBe('Inbound');
        expect(h.handle.declineCall).not.toHaveBeenCalled();
    });

    it('declines when no agent identity matches the dialed number', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const h = await harness();
        await h.invite(INVITE);
        expect(h.handle.declineCall).toHaveBeenCalledWith('SIP-CALL-1');
    });
});

describe('maximum call length', () => {
    it('stops a live call when the cap elapses', async () => {
        const h = await harness({ ...CONFIG, maxCallSeconds: 60 });
        vi.useFakeTimers();
        await h.service.HandleInboundCall({ sessionId: 'SIP-CALL-1', from: '+1', to: '+18005550100' }, USER, PROVIDER);

        await vi.advanceTimersByTimeAsync(61_000);

        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, PROVIDER);
    });

    it('dispose clears the timer', async () => {
        const h = await harness({ ...CONFIG, maxCallSeconds: 60 });
        vi.useFakeTimers();
        await h.service.HandleInboundCall({ sessionId: 'SIP-CALL-1', from: '+1', to: '+18005550100' }, USER, PROVIDER);
        h.service.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('PlaceOutboundCall — gated', () => {
    it('refuses when the caller may not run the agent', async () => {
        const h = await harness(CONFIG, async () => false);
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toBeInstanceOf(OutboundCallRefusedError);
        expect(h.engine.StartBridgeSession).not.toHaveBeenCalled();
    });

    it.each(['+19005551234', '+442071838750', 'garbage'])('refuses destination %s', async (to) => {
        const h = await harness();
        await expect(h.service.PlaceOutboundCall('ident-1', to, USER, dbProvider())).rejects.toBeInstanceOf(OutboundCallRefusedError);
    });

    it('places an authorized call and returns the session id', async () => {
        const h = await harness();
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).resolves.toBe('SIP-CALL-1');
    });
});
