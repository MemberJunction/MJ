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
import { RingCentralTelephonyService, REGISTRATION_DEADLINE_MS, type RingCentralTelephonyServiceDeps } from '../telephony/RingCentralTelephonyService.js';
import { OutboundCallRefusedError } from '../telephony/outboundCallPolicy.js';
import { CallCapacityGate } from '../telephony/telephonyCapacity.js';
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

async function harness(
    config: RingCentralTelephonyConfig = CONFIG,
    canRunAgent: (a: string, u: UserInfo) => Promise<boolean> = async () => true,
    extraDeps: Partial<RingCentralTelephonyServiceDeps> = {},
): Promise<Harness> {
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
        coAgentResolver: vi.fn(async () => 'co-agent-1') as never,
        capacity: new CallCapacityGate(100),
        ...extraDeps,
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

describe('call parity with the other carriers', () => {
    it('keeps the co-agent and the dialled agent apart, and the agent DID apart from the caller number', async () => {
        const sessionFactory = vi.fn(async () => ({}));
        const h = await harness(CONFIG, async () => true, { sessionFactory: sessionFactory as never });
        await h.invite(INVITE);

        expect(sessionFactory.mock.calls[0][0]).toMatchObject({ AgentID: 'co-agent-1', TargetAgentID: 'agent-1' });
        const start = h.engine.StartBridgeSession.mock.calls[0][0] as { Address: string; JoinMethod: string; TurnMode: string; Configuration: Record<string, unknown> };
        expect(start.Address).toBe('+18005550100');
        expect(start.Configuration['CallerNumber']).toBe('+14155550123');
        expect(start.JoinMethod).toBe('InboundRoute');
        expect(start.TurnMode).toBe('Active');
    });
});

describe('concurrent-call cap', () => {
    it('declines an inbound INVITE over the cap without starting a session', async () => {
        const full = new CallCapacityGate(1);
        full.TryAcquire();
        const h = await harness(CONFIG, async () => true, { capacity: full });
        await h.invite(INVITE);
        expect(h.handle.declineCall).toHaveBeenCalledWith('SIP-CALL-1');
        expect(h.engine.StartBridgeSession).not.toHaveBeenCalled();
    });

    it('reports an over-cap inbound call as Busy, not as a missing agent', async () => {
        const full = new CallCapacityGate(1);
        full.TryAcquire();
        const h = await harness(CONFIG, async () => true, { capacity: full });
        const result = await h.service.HandleInboundCall({ sessionId: 'SIP-CALL-1', from: '+1', to: '+18005550100' }, USER, PROVIDER);
        expect(result).toMatchObject({ accepted: false, Busy: true });
    });

    it('refuses an outbound call over the cap with a clear, coded error', async () => {
        const full = new CallCapacityGate(1);
        full.TryAcquire();
        const h = await harness(CONFIG, async () => true, { capacity: full });
        const error = await h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider()).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(OutboundCallRefusedError);
        expect((error as OutboundCallRefusedError).Code).toBe('at-capacity');
        expect((error as Error).message).toMatch(/busy/i);
    });

    it("does not spend the caller's hourly outbound budget on a call the cap refused", async () => {
        const gate = new CallCapacityGate(1);
        const held = gate.TryAcquire();
        const h = await harness({ ...CONFIG, outbound: { maxCallsPerUserPerHour: 1 } }, async () => true, { capacity: gate });
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toThrow(/busy/i);
        held?.Release();
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).resolves.toBe('SIP-CALL-1');
    });

    it('gives the slot back when the outbound gate refuses the call', async () => {
        const gate = new CallCapacityGate(1);
        const h = await harness(CONFIG, async () => false, { capacity: gate });
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toBeInstanceOf(OutboundCallRefusedError);
        expect(gate.Active).toBe(0);
    });
});

describe('SIP registration health', () => {
    it('is healthy once registered', async () => {
        const h = await harness();
        expect(h.service.GetRegistrationStatus()).toEqual({ State: 'registered', Healthy: true });
    });

    it('is unhealthy, with the reason, when registration failed (Start only logs the failure)', async () => {
        const failing = { onInvite: vi.fn(), register: vi.fn(async () => { throw new Error('403 Forbidden'); }), declineCall: vi.fn(), dispose: vi.fn() };
        const h = await harness(CONFIG, async () => true, { createHandle: (async () => failing as unknown as RingCentralSoftphoneHandle) as never });
        expect(h.service.GetRegistrationStatus()).toMatchObject({ State: 'failed', Healthy: false, Reason: '403 Forbidden' });
    });

    it('is unhealthy when the handle cannot even be created', async () => {
        const h = await harness(CONFIG, async () => true, { createHandle: (async () => { throw new Error('sdk missing'); }) as never });
        expect(h.service.GetRegistrationStatus()).toMatchObject({ State: 'failed', Healthy: false });
    });

    it('is healthy while registration is pending inside the deadline, unhealthy after it', async () => {
        let nowMs = 1_000_000;
        const never = new Promise<void>(() => undefined);
        const hanging = { onInvite: vi.fn(), register: vi.fn(() => never), declineCall: vi.fn(), dispose: vi.fn() };
        const service = new RingCentralTelephonyService(CONFIG, {
            engine: fakeEngine() as never,
            sessionFactory: vi.fn() as never,
            sessionManager: { CreateSession: vi.fn() } as never,
            createHandle: (async () => hanging as unknown as RingCentralSoftphoneHandle) as never,
            capacity: new CallCapacityGate(1),
            now: () => nowMs,
        });
        void service.Start();
        await vi.waitFor(() => expect(hanging.register).toHaveBeenCalled());

        expect(service.GetRegistrationStatus()).toEqual({ State: 'pending', Healthy: true });
        nowMs += REGISTRATION_DEADLINE_MS + 5_000;
        expect(service.GetRegistrationStatus()).toMatchObject({ State: 'pending', Healthy: false });
        expect(service.GetRegistrationStatus().Reason).toMatch(/pending for \d+s/);
    });

    it('reports not-started before Start and after dispose', async () => {
        const service = new RingCentralTelephonyService(CONFIG, { engine: fakeEngine() as never, capacity: new CallCapacityGate(1) });
        expect(service.GetRegistrationStatus()).toMatchObject({ State: 'not-started', Healthy: false });
        const h = await harness();
        h.service.dispose();
        expect(h.service.GetRegistrationStatus().State).toBe('not-started');
    });
});
