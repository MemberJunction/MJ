import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { BaseTelephonyBridge, ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';
import type { ITwilioRestLike } from '@memberjunction/ai-bridge-twilio';

const runViewMock = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunView: class {
        public RunView = runViewMock;
    },
}));

import { TwilioTelephonyService, type TwilioTelephonyServiceDeps } from '../telephony/TwilioTelephonyService.js';
import { TwilioCallMediaRegistry } from '../telephony/twilioMediaRegistry.js';
import { CallEndObserverSdk } from '../telephony/callEndObserver.js';
import { OutboundCallRefusedError } from '../telephony/outboundCallPolicy.js';
import type { TwilioTelephonyConfig } from '../types.js';

const CONFIG: TwilioTelephonyConfig = {
    accountSid: 'AC1',
    authToken: 'tok',
    streamPublicUrl: 'wss://api.test/telephony/twilio/media',
    statusCallbackUrl: 'https://api.test/telephony/twilio/status',
    amdStatusCallbackUrl: 'https://api.test/telephony/twilio/amd',
};

const USER = { ID: 'user-1' } as unknown as UserInfo;
const PROVIDER_ID = 'PROV-1';

const IDENTITY = { ID: 'ident-1', AgentID: 'agent-1', ProviderID: PROVIDER_ID, IsActive: true, IdentityValue: '+18005550100' };

function dbProvider(identity: typeof IDENTITY | null = IDENTITY): IMetadataProvider {
    return {
        GetEntityObject: async () => ({
            ...(identity ?? {}),
            Load: async () => identity !== null,
            IsActive: identity?.IsActive ?? false,
        }),
    } as unknown as IMetadataProvider;
}

interface Harness {
    service: TwilioTelephonyService;
    registry: TwilioCallMediaRegistry;
    engine: ReturnType<typeof fakeEngine>;
    rest: { CreateCall: ReturnType<typeof vi.fn>; UpdateCall: ReturnType<typeof vi.fn> };
    sessionFactory: ReturnType<typeof vi.fn>;
}

function fakeEngine() {
    return {
        Config: vi.fn(async () => undefined),
        ProviderByDriverClass: vi.fn(() => ({ ID: PROVIDER_ID })),
        ProviderByName: vi.fn(() => undefined),
        StartBridgeSession: vi.fn(async () => ({ SessionBridgeID: 'SB1', RoomKey: 'CA1' })),
        StopBridgeSession: vi.fn(async () => true),
    };
}

function harness(config: TwilioTelephonyConfig = CONFIG, overrides: Partial<TwilioTelephonyServiceDeps> = {}, registryOptions = {}): Harness {
    const registry = new TwilioCallMediaRegistry(registryOptions);
    const engine = fakeEngine();
    const rest = { CreateCall: vi.fn(async () => 'CA-NEW'), UpdateCall: vi.fn(async () => undefined) };
    const sessionFactory = vi.fn(async () => ({}));
    const service = new TwilioTelephonyService(config, registry, {
        engine: engine as never,
        sessionFactory: sessionFactory as never,
        sessionManager: { CreateSession: vi.fn(async () => ({ ID: 'AS1' })) } as never,
        rest: rest as ITwilioRestLike,
        canRunAgent: async () => true,
        ...overrides,
    });
    return { service, registry, engine, rest, sessionFactory };
}

const INBOUND = { callSid: 'CA1', from: '+14155550123', to: '+18005550100' };

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [IDENTITY] });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('TwilioTelephonyService.buildBindSdk', () => {
    it('binds a call-end-observing SDK factory onto the telephony driver', () => {
        const { service } = harness();
        const setSdkFactory = vi.fn();
        const fakeDriver = { SetSdkFactory: setSdkFactory } as unknown as BaseTelephonyBridge;

        service.buildBindSdk()(fakeDriver);

        expect(setSdkFactory).toHaveBeenCalledTimes(1);
        const factory = setSdkFactory.mock.calls[0][0] as () => unknown;
        expect(factory()).toBeInstanceOf(CallEndObserverSdk);
    });
});

describe('HandleInboundCall — answers without waiting for the session', () => {
    it('returns accepted + a media token while StartBridgeSession is still pending, and the token authenticates the call\'s socket', async () => {
        const h = harness();
        let release!: (v: { SessionBridgeID: string; RoomKey: string }) => void;
        h.engine.StartBridgeSession.mockReturnValue(new Promise((r) => (release = r)));

        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());

        expect(result.accepted).toBe(true);
        expect(result.MediaToken).toMatch(/^[0-9a-f]{64}$/);
        expect(h.engine.StartBridgeSession).not.toHaveBeenCalled(); // not even reached yet / still pending — we did not wait for it
        const sock = { send: vi.fn(), close: vi.fn() };
        expect(h.registry.TryAttachSocket('CA1', result.MediaToken, sock, 'MZ1')).toEqual({ Ok: true });

        release({ SessionBridgeID: 'SB1', RoomKey: 'CA1' });
        await result.Started;
        expect(h.engine.StartBridgeSession).toHaveBeenCalledTimes(1);
    });

    it('registers the expectation under the call SID BEFORE returning, so a socket that connects early is accepted', async () => {
        const h = harness();
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        expect(h.registry.IsExpected('CA1')).toBe(true);
        await result.Started;
    });

    it('rejects (never throws) when no agent identity matches the dialed number, registering nothing', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const h = harness();
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        expect(result.accepted).toBe(false);
        expect(result.MediaToken).toBeUndefined();
        expect(h.registry.IsExpected('CA1')).toBe(false);
        expect(h.engine.StartBridgeSession).not.toHaveBeenCalled();
    });

    it('reports an internal error as a rejection rather than throwing', async () => {
        const h = harness();
        h.engine.Config.mockRejectedValue(new Error('db down'));
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        expect(result.accepted).toBe(false);
    });

    it('when the background start FAILS: logs, hangs the call up at the carrier and frees its state', async () => {
        const h = harness();
        h.engine.StartBridgeSession.mockRejectedValue(new Error('model unavailable'));

        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;

        expect(h.rest.UpdateCall).toHaveBeenCalledWith('CA1', { Status: 'completed' });
        expect(h.registry.HasCall('CA1')).toBe(false);
        expect(h.registry.IsExpected('CA1')).toBe(false);
    });

    it('a failed carrier hang-up during cleanup is logged, not thrown', async () => {
        const h = harness();
        h.engine.StartBridgeSession.mockRejectedValue(new Error('model unavailable'));
        h.rest.UpdateCall.mockRejectedValue(new Error('twilio 500'));
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await expect(result.Started).resolves.toBeUndefined();
    });
});

describe('status callbacks end the session', () => {
    async function startedCall(h: Harness): Promise<void> {
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;
    }

    it.each(['completed', 'busy', 'failed', 'no-answer', 'canceled'])('stops the bridge session on terminal status %s', async (status) => {
        const h = harness();
        await startedCall(h);

        await h.service.HandleStatusCallback('CA1', status);

        expect(h.engine.StopBridgeSession).toHaveBeenCalledTimes(1);
        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
        expect(h.registry.HasCall('CA1')).toBe(false);
    });

    it.each(['queued', 'initiated', 'ringing', 'in-progress', 'something-new', undefined])('does NOT stop the session on non-terminal status %s', async (status) => {
        const h = harness();
        await startedCall(h);
        await h.service.HandleStatusCallback('CA1', status);
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
    });

    it('ignores a terminal status for a call it does not know', async () => {
        const h = harness();
        await h.service.HandleStatusCallback('CA-UNKNOWN', 'completed');
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
    });

    it('a terminal status that races the session start is honoured the moment the session attaches', async () => {
        const h = harness();
        let release!: (v: { SessionBridgeID: string; RoomKey: string }) => void;
        h.engine.StartBridgeSession.mockReturnValue(new Promise((r) => (release = r)));
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());

        await h.service.HandleStatusCallback('CA1', 'completed'); // arrives while the session is still starting
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();

        release({ SessionBridgeID: 'SB1', RoomKey: 'CA1' });
        await result.Started;

        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
    });
});

describe('answering-machine detection', () => {
    async function startedCall(h: Harness): Promise<void> {
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;
    }

    it.each(['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax'])('hangs up (stops the session) when AnsweredBy is %s, by default', async (answeredBy) => {
        const h = harness();
        await startedCall(h);
        await h.service.HandleAnsweringMachine('CA1', answeredBy);
        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'Explicit', USER, expect.anything());
    });

    it.each(['human', 'unknown', undefined])('leaves the call up for AnsweredBy %s', async (answeredBy) => {
        const h = harness();
        await startedCall(h);
        await h.service.HandleAnsweringMachine('CA1', answeredBy);
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
    });

    it("leaves the call up on a machine when onMachine is 'continue'", async () => {
        const h = harness({ ...CONFIG, onMachine: 'continue' });
        await startedCall(h);
        await h.service.HandleAnsweringMachine('CA1', 'machine_start');
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
    });
});

describe('maximum call length', () => {
    async function liveCall(h: Harness): Promise<void> {
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;
    }

    it('stops the session when the cap elapses', async () => {
        vi.useFakeTimers();
        const h = harness({ ...CONFIG, maxCallSeconds: 60 });
        await liveCall(h);

        await vi.advanceTimersByTimeAsync(59_000);
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2_000);

        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
    });

    it('the timer is cleared when the call ends through the SDK (MJ hang-up), so it never fires and no timer is left', async () => {
        vi.useFakeTimers();
        const h = harness({ ...CONFIG, maxCallSeconds: 60 });
        await liveCall(h);
        const timersWhileLive = vi.getTimerCount();
        expect(timersWhileLive).toBeGreaterThan(0);

        // The engine tears a session down by calling sdk.hangup(callId) on the SDK this service bound.
        const setSdkFactory = vi.fn();
        h.service.BuildBindSdk()({ SetSdkFactory: setSdkFactory } as unknown as BaseTelephonyBridge);
        const sdk = (setSdkFactory.mock.calls[0][0] as () => ITelephonyCallSdk)();
        await sdk.hangup('CA1');

        expect(h.rest.UpdateCall).toHaveBeenCalledWith('CA1', { Status: 'completed' });
        expect(vi.getTimerCount()).toBeLessThan(timersWhileLive);
        await vi.advanceTimersByTimeAsync(120_000);
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
    });

    it('Dispose clears every timer the service holds', async () => {
        vi.useFakeTimers();
        const h = harness({ ...CONFIG, maxCallSeconds: 60 });
        await liveCall(h);
        h.service.Dispose();
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('media socket never connects', () => {
    it('ends the session once the connect TTL elapses', async () => {
        vi.useFakeTimers();
        const h = harness(CONFIG, {}, { ExpectationTtlMs: 5000 });
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;

        await vi.advanceTimersByTimeAsync(5001);

        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
        expect(h.registry.HasCall('CA1')).toBe(false);
    });
});

describe('PlaceOutboundCall — gated', () => {
    it('refuses (and never opens a session or touches the carrier) when the caller may not run the agent', async () => {
        const h = harness(CONFIG, { canRunAgent: async () => false });
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toBeInstanceOf(OutboundCallRefusedError);
        expect(h.sessionFactory).not.toHaveBeenCalled();
        expect(h.engine.StartBridgeSession).not.toHaveBeenCalled();
    });

    it.each(['+19005551234', '+442071838750', '4155550123'])('refuses destination %s', async (to) => {
        const h = harness();
        await expect(h.service.PlaceOutboundCall('ident-1', to, USER, dbProvider())).rejects.toBeInstanceOf(OutboundCallRefusedError);
        expect(h.engine.StartBridgeSession).not.toHaveBeenCalled();
    });

    it('refuses once the hourly budget is spent', async () => {
        const h = harness({ ...CONFIG, outbound: { maxCallsPerUserPerHour: 1 } });
        h.engine.StartBridgeSession.mockResolvedValue({ SessionBridgeID: 'SB1', RoomKey: 'CA-OUT' });
        await h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider());
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toThrow(/limit/i);
    });

    it('refuses an identity that belongs to another carrier', async () => {
        const h = harness();
        const foreign = { ...IDENTITY, ProviderID: 'SOMEONE-ELSE' };
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider(foreign))).rejects.toBeInstanceOf(OutboundCallRefusedError);
    });

    it('still reports an unknown / inactive identity as an ordinary error', async () => {
        const h = harness();
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider(null))).rejects.toThrow(/not found or inactive/);
    });

    it('places an authorized call: dials the TRIMMED number from the identity\'s number and returns the call SID', async () => {
        const h = harness();
        const sid = await h.service.PlaceOutboundCall('ident-1', ' +14155550123 ', USER, dbProvider());

        expect(sid).toBe('CA1');
        const args = h.engine.StartBridgeSession.mock.calls[0][0] as { Address: string; Direction: string; Configuration: Record<string, unknown> };
        expect(args.Address).toBe('+14155550123');
        expect(args.Direction).toBe('Outbound');
        expect(args.Configuration['FromNumber']).toBe('+18005550100');
    });

    it('arms the call-length cap for the placed call', async () => {
        vi.useFakeTimers();
        const h = harness({ ...CONFIG, maxCallSeconds: 60 });
        await h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider());
        await vi.advanceTimersByTimeAsync(61_000);
        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
    });
});
