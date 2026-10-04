import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { BaseTelephonyBridge, ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';
import type { IVonageVoiceLike, VonageCreateCallParams } from '@memberjunction/ai-bridge-vonage';

const runViewMock = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunView: class {
        public RunView = runViewMock;
    },
}));

import { VonageTelephonyService, type VonageTelephonyServiceDeps } from '../telephony/VonageTelephonyService.js';
import { VonageCallMediaRegistry } from '../telephony/vonageMediaRegistry.js';
import { CallEndObserverSdk } from '../telephony/callEndObserver.js';
import { OutboundCallRefusedError } from '../telephony/outboundCallPolicy.js';
import type { VonageTelephonyConfig } from '../types.js';

const CONFIG: VonageTelephonyConfig = {
    mediaPublicUrl: 'wss://api.test/telephony/vonage/media',
    eventUrl: 'https://api.test/telephony/vonage/event',
    signatureSecret: 's',
};
const USER = { ID: 'user-1' } as unknown as UserInfo;
const PROVIDER_ID = 'PROV-V';
const IDENTITY = { ID: 'ident-1', AgentID: 'agent-1', ProviderID: PROVIDER_ID, IsActive: true, IdentityValue: '+18005550100' };

function dbProvider(identity: typeof IDENTITY | null = IDENTITY): IMetadataProvider {
    return {
        GetEntityObject: async () => ({ ...(identity ?? {}), Load: async () => identity !== null, IsActive: identity?.IsActive ?? false }),
    } as unknown as IMetadataProvider;
}

function fakeEngine() {
    return {
        Config: vi.fn(async () => undefined),
        ProviderByDriverClass: vi.fn(() => ({ ID: PROVIDER_ID })),
        ProviderByName: vi.fn(() => undefined),
        StartBridgeSession: vi.fn(async () => ({ SessionBridgeID: 'SB1', RoomKey: 'UUID-1' })),
        StopBridgeSession: vi.fn(async () => true),
    };
}

interface Harness {
    service: VonageTelephonyService;
    registry: VonageCallMediaRegistry;
    engine: ReturnType<typeof fakeEngine>;
    voice: { CreateCall: ReturnType<typeof vi.fn>; HangupCall: ReturnType<typeof vi.fn>; TransferCall: ReturnType<typeof vi.fn>; SendDtmf: ReturnType<typeof vi.fn> };
}

function harness(config: VonageTelephonyConfig = CONFIG, overrides: Partial<VonageTelephonyServiceDeps> = {}, registryOptions = {}): Harness {
    const registry = new VonageCallMediaRegistry(registryOptions);
    const engine = fakeEngine();
    const voice = {
        CreateCall: vi.fn(async () => 'UUID-1'),
        HangupCall: vi.fn(async () => undefined),
        TransferCall: vi.fn(async () => undefined),
        SendDtmf: vi.fn(async () => undefined),
    };
    const service = new VonageTelephonyService(config, registry, {
        engine: engine as never,
        sessionFactory: vi.fn(async () => ({})) as never,
        sessionManager: { CreateSession: vi.fn(async () => ({ ID: 'AS1' })) } as never,
        voice: voice as IVonageVoiceLike,
        canRunAgent: async () => true,
        ...overrides,
    });
    return { service, registry, engine, voice };
}

const INBOUND = { callId: 'CALL-1', from: '14155550123', to: '18005550100' };

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [IDENTITY] });
});

afterEach(() => {
    vi.useRealTimers();
});

/** Builds the SDK this service would hand to the driver, as the engine does. */
function boundSdk(service: VonageTelephonyService): ITelephonyCallSdk {
    const setSdkFactory = vi.fn();
    service.BuildBindSdk()({ SetSdkFactory: setSdkFactory } as unknown as BaseTelephonyBridge);
    return (setSdkFactory.mock.calls[0][0] as () => ITelephonyCallSdk)();
}

describe('VonageTelephonyService.buildBindSdk', () => {
    it('binds a call-end-observing SDK factory onto the telephony driver', () => {
        const { service } = harness();
        expect(boundSdk(service)).toBeInstanceOf(CallEndObserverSdk);
    });
});

describe('HandleInboundCall — answers without waiting for the session', () => {
    it('returns accepted + a media token while the session is still starting; the token authenticates the call\'s socket', async () => {
        const h = harness();
        let release!: (v: { SessionBridgeID: string; RoomKey: string }) => void;
        h.engine.StartBridgeSession.mockReturnValue(new Promise((r) => (release = r)));

        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());

        expect(result.accepted).toBe(true);
        expect(result.MediaToken).toMatch(/^[0-9a-f]{64}$/);
        const sock = { sendBinary: vi.fn(), sendText: vi.fn(), close: vi.fn() };
        expect(h.registry.TryAttachSocket({ CallUuid: 'CALL-1' }, result.MediaToken, sock)).toEqual({ Ok: true, CallKey: 'CALL-1' });

        release({ SessionBridgeID: 'SB1', RoomKey: 'CALL-1' });
        await result.Started;
        expect(h.engine.StartBridgeSession).toHaveBeenCalledTimes(1);
    });

    it('rejects (never throws) when no agent identity matches, registering nothing', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const h = harness();
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        expect(result.accepted).toBe(false);
        expect(h.registry.IsExpected('CALL-1')).toBe(false);
    });

    it('when the background start FAILS: hangs the call up at the carrier and frees its state', async () => {
        const h = harness();
        h.engine.StartBridgeSession.mockRejectedValue(new Error('model unavailable'));
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;
        expect(h.voice.HangupCall).toHaveBeenCalledWith('CALL-1');
        expect(h.registry.HasCall('CALL-1')).toBe(false);
    });
});

describe('call events end the session', () => {
    async function liveCall(h: Harness): Promise<void> {
        h.engine.StartBridgeSession.mockResolvedValue({ SessionBridgeID: 'SB1', RoomKey: 'CALL-1' });
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;
    }

    it.each(['completed', 'busy', 'failed', 'rejected', 'timeout', 'cancelled', 'unanswered'])('stops the bridge session on terminal status %s', async (status) => {
        const h = harness();
        await liveCall(h);
        await h.service.HandleCallEvent('CALL-1', status);
        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
        expect(h.registry.HasCall('CALL-1')).toBe(false);
    });

    it.each(['started', 'ringing', 'answered', 'human', 'unknown-new-status', undefined])('does NOT stop the session on non-terminal status %s', async (status) => {
        const h = harness();
        await liveCall(h);
        await h.service.HandleCallEvent('CALL-1', status);
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
    });

    it('a terminal event that races the session start is honoured the moment the session attaches', async () => {
        const h = harness();
        let release!: (v: { SessionBridgeID: string; RoomKey: string }) => void;
        h.engine.StartBridgeSession.mockReturnValue(new Promise((r) => (release = r)));
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());

        await h.service.HandleCallEvent('CALL-1', 'completed');
        release({ SessionBridgeID: 'SB1', RoomKey: 'CALL-1' });
        await result.Started;

        expect(h.engine.StopBridgeSession).toHaveBeenCalledTimes(1);
    });

    it("hangs up on a 'machine' status by default", async () => {
        const h = harness();
        await liveCall(h);
        await h.service.HandleCallEvent('CALL-1', 'machine');
        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'Explicit', USER, expect.anything());
    });

    it("leaves the call up on a 'machine' status when onMachine is 'continue'", async () => {
        const h = harness({ ...CONFIG, onMachine: 'continue' });
        await liveCall(h);
        await h.service.HandleCallEvent('CALL-1', 'machine');
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
    });
});

describe('maximum call length', () => {
    it('stops the session when the cap elapses', async () => {
        vi.useFakeTimers();
        const h = harness({ ...CONFIG, maxCallSeconds: 60 });
        h.engine.StartBridgeSession.mockResolvedValue({ SessionBridgeID: 'SB1', RoomKey: 'CALL-1' });
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;

        await vi.advanceTimersByTimeAsync(61_000);

        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
    });

    it('the timer is cleared when the call ends through the SDK (MJ hang-up)', async () => {
        vi.useFakeTimers();
        const h = harness({ ...CONFIG, maxCallSeconds: 60 });
        h.engine.StartBridgeSession.mockResolvedValue({ SessionBridgeID: 'SB1', RoomKey: 'CALL-1' });
        const result = await h.service.HandleInboundCall(INBOUND, USER, dbProvider());
        await result.Started;

        await boundSdk(h.service).hangup('CALL-1');

        await vi.advanceTimersByTimeAsync(120_000);
        expect(h.engine.StopBridgeSession).not.toHaveBeenCalled();
    });
});

describe('PlaceOutboundCall — gated', () => {
    it('refuses (and never opens a session) when the caller may not run the agent', async () => {
        const h = harness(CONFIG, { canRunAgent: async () => false });
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toBeInstanceOf(OutboundCallRefusedError);
        expect(h.engine.StartBridgeSession).not.toHaveBeenCalled();
    });

    it.each(['+19765551234', '+442071838750', 'not-a-number'])('refuses destination %s', async (to) => {
        const h = harness();
        await expect(h.service.PlaceOutboundCall('ident-1', to, USER, dbProvider())).rejects.toBeInstanceOf(OutboundCallRefusedError);
    });

    it('places an authorized call and arms the cap', async () => {
        vi.useFakeTimers();
        const h = harness({ ...CONFIG, maxCallSeconds: 60 });
        const callId = await h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider());
        expect(callId).toBe('UUID-1');
        await vi.advanceTimersByTimeAsync(61_000);
        expect(h.engine.StopBridgeSession).toHaveBeenCalledTimes(1);
    });
});

describe('outbound audio (the correlation fix): the bridge reaches the media socket', () => {
    /** Pulls the correlation id + token the NCCO told Vonage to put on the websocket URI. */
    function mediaClaim(params: VonageCreateCallParams): { cid: string; token: string } {
        const connect = params.Ncco[0] as unknown as { endpoint: Array<{ uri: string }> };
        const uri = new URL(connect.endpoint[0].uri);
        return { cid: uri.searchParams.get('mj_cid') as string, token: uri.searchParams.get('mj_token') as string };
    }

    it('the outbound NCCO carries an mj_cid and mj_token — and the machine-detection setting', async () => {
        const h = harness();
        await boundSdk(h.service).dial('+14155550123', '+18005550100');

        const params = h.voice.CreateCall.mock.calls[0][0] as VonageCreateCallParams;
        const { cid, token } = mediaClaim(params);
        expect(cid).toMatch(/^[0-9a-f-]{36}$/);
        expect(token).toMatch(/^[0-9a-f]{64}$/);
        expect(params.MachineDetection).toBe('hangup');
        expect(params.EventUrl).toBe('https://api.test/telephony/vonage/event');
    });

    it('socket connects BEFORE createCall resolves: it is accepted by correlation id, and agent audio reaches it once the UUID is bound', async () => {
        const h = harness();
        const socket = { sendBinary: vi.fn(), sendText: vi.fn(), close: vi.fn() };
        h.voice.CreateCall.mockImplementation(async (params: VonageCreateCallParams) => {
            const { cid, token } = mediaClaim(params);
            // Vonage opens the websocket while the createCall response is still in flight.
            expect(h.registry.TryAttachSocket({ CorrelationId: cid }, token, socket).Ok).toBe(true);
            return 'UUID-RACE';
        });

        const sdk = boundSdk(h.service);
        const callId = await sdk.dial('+14155550123', '+18005550100');
        sdk.sendAudioFrame(new ArrayBuffer(320));

        expect(callId).toBe('UUID-RACE');
        expect(socket.sendBinary).toHaveBeenCalledTimes(1);
    });

    it('socket connects AFTER createCall resolves: still accepted, and audio produced before that is flushed to it', async () => {
        const h = harness();
        let claim: { cid: string; token: string } | undefined;
        h.voice.CreateCall.mockImplementation(async (params: VonageCreateCallParams) => {
            claim = mediaClaim(params);
            return 'UUID-LATE';
        });
        const sdk = boundSdk(h.service);
        await sdk.dial('+14155550123', '+18005550100');
        sdk.sendAudioFrame(new ArrayBuffer(320)); // the agent starts talking before the socket exists

        const socket = { sendBinary: vi.fn(), sendText: vi.fn(), close: vi.fn() };
        expect(h.registry.TryAttachSocket({ CorrelationId: claim?.cid }, claim?.token, socket)).toEqual({ Ok: true, CallKey: 'UUID-LATE' });
        expect(socket.sendBinary).toHaveBeenCalledTimes(1);
    });

    it('a failed createCall abandons the expectation (nothing can attach to it afterwards)', async () => {
        const h = harness();
        let claim: { cid: string; token: string } | undefined;
        h.voice.CreateCall.mockImplementation(async (params: VonageCreateCallParams) => {
            claim = mediaClaim(params);
            throw new Error('vonage 429');
        });
        await expect(boundSdk(h.service).dial('+14155550123', '+18005550100')).rejects.toThrow('vonage 429');
        const socket = { sendBinary: vi.fn(), sendText: vi.fn(), close: vi.fn() };
        expect(h.registry.TryAttachSocket({ CorrelationId: claim?.cid }, claim?.token, socket).Ok).toBe(false);
    });

    it('a terminal event that arrives right after createCall resolves — before the session attaches — still ends the call', async () => {
        const h = harness();
        let release!: (v: { SessionBridgeID: string; RoomKey: string }) => void;
        h.engine.StartBridgeSession.mockImplementation(async (args: { BindSdk: (d: BaseTelephonyBridge) => void }) => {
            // Emulate the engine: connect the driver (dial → createCall → UUID bound), THEN finish starting later.
            const setSdkFactory = vi.fn();
            args.BindSdk({ SetSdkFactory: setSdkFactory } as unknown as BaseTelephonyBridge);
            await (setSdkFactory.mock.calls[0][0] as () => ITelephonyCallSdk)().dial('+14155550123', '+18005550100');
            return new Promise((r) => (release = r));
        });
        const placing = h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider());
        await vi.waitFor(() => expect(h.voice.CreateCall).toHaveBeenCalled());
        await vi.waitFor(() => expect(release).toBeDefined());

        await h.service.HandleCallEvent('UUID-1', 'busy'); // the callee rejected the call immediately
        release({ SessionBridgeID: 'SB1', RoomKey: 'UUID-1' });
        await placing;

        expect(h.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
    });
});
