import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { LiveKitRoomWebhookEvent } from '@memberjunction/livekit-room-server';

const runViewMock = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunView: class {
        public RunView = runViewMock;
    },
}));

import { LogError } from '@memberjunction/core';
import { LiveKitSipTelephonyService, type LiveKitSipTelephonyServiceDeps } from '../telephony/LiveKitSipTelephonyService.js';
import { CallCapacityGate } from '../telephony/telephonyCapacity.js';
import { OutboundCallRefusedError } from '../telephony/outboundCallPolicy.js';
import type { LiveKitSipSettings } from '../types.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const PROVIDER_ID = 'LK-PROVIDER';
const IDENTITY = { ID: 'ident-1', AgentID: 'agent-1', ProviderID: PROVIDER_ID, IsActive: true, IdentityValue: '+18005550100' };

function dbProvider(identity: typeof IDENTITY | null = IDENTITY): IMetadataProvider {
    return {
        GetEntityObject: async () => ({ ...(identity ?? {}), Load: async () => identity !== null, IsActive: identity?.IsActive ?? false }),
    } as unknown as IMetadataProvider;
}

const CONFIG: LiveKitSipSettings = { outboundTrunkId: 'ST_out', outboundFromNumber: '+18005550100', maxCallSeconds: 60 };

function inboundEvent(over: Partial<LiveKitRoomWebhookEvent> = {}): LiveKitRoomWebhookEvent {
    return {
        Event: 'participant_joined',
        RoomName: 'call-abc',
        ParticipantIdentity: 'sip_+14155550123',
        IsSipParticipant: true,
        CallerNumber: '+14155550123',
        DialedNumber: '+18005550100',
        SipCallID: 'SCL_1',
        ...over,
    };
}

function harness(config: LiveKitSipSettings = CONFIG, overrides: Partial<LiveKitSipTelephonyServiceDeps> = {}) {
    const sip = {
        ListParticipants: vi.fn(async () => [
            { Identity: 'sip_+14155550123', Name: '', IsSip: true, IsConnected: true, Attributes: {} },
            { Identity: 'user-9', Name: '', IsSip: false, IsConnected: true, Attributes: {} },
        ]),
        RemoveParticipant: vi.fn(async () => undefined),
        DialIntoRoom: vi.fn(async () => undefined),
        OutboundTrunkExists: vi.fn(async () => true),
        ListOutboundTrunks: vi.fn(async () => [
            { TrunkID: 'ST_out', Name: 'Outbound', Numbers: ['+18005550100', '+18005559999'] },
        ]),
        EnsureInboundRouting: vi.fn(async () => ({ TrunkID: 'ST_in', DispatchRuleID: 'SDR', CreatedTrunk: true, CreatedDispatchRule: true })),
        IsParticipantPresent: vi.fn(async () => true),
    };
    const engine = { Config: vi.fn(async () => undefined), ProviderByDriverClass: vi.fn(() => ({ ID: PROVIDER_ID })) };
    const coordinator = { StopAgentRoomSession: vi.fn(async () => true), StartAgentRoomSession: vi.fn() };
    const handoff = { Configure: vi.fn(), Deps: {}, RequestHandoff: vi.fn(), AgentReadyToLeave: vi.fn(), CancelRoom: vi.fn() };
    const starter = {
        Start: vi.fn(async () => ({ SessionBridgeID: 'SB1', AgentSessionID: 'AS1', ConversationID: 'CONV1' })),
        StartRoomAgent: vi.fn(async () => ({ SessionBridgeID: 'SB2' })),
    };
    const capacity = new CallCapacityGate(2);
    const service = new LiveKitSipTelephonyService(config, {
        sip: sip as never,
        engine: engine as never,
        coordinator: coordinator as never,
        handoff: handoff as never,
        starter: starter as never,
        capacity,
        canRunAgent: async () => true,
        ...overrides,
    });
    return { service, sip, engine, coordinator, handoff, starter, capacity };
}

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [IDENTITY] });
    vi.mocked(LogError).mockClear();
});
afterEach(() => vi.useRealTimers());

describe('construction', () => {
    it('gives the handoff engine presence checks, a dialer for the outbound trunk, and a way to start another agent in a room', async () => {
        const h = harness({ ...CONFIG, numbers: ['+18005558888'] });
        expect(h.handoff.Configure).toHaveBeenCalledTimes(1);
        const wired = h.handoff.Configure.mock.calls[0][0];
        expect(wired.Presence).toBe(h.sip);

        // Omitted FromNumber falls back to config.outboundFromNumber
        await wired.Dialer.DialIntoRoom({ RoomName: 'call-abc', Number: '+14155550199', ParticipantIdentity: 'sip-handoff-1', DisplayName: 'Dana', RingTimeoutSeconds: 30 });
        expect(h.sip.DialIntoRoom).toHaveBeenCalledWith(expect.objectContaining({ TrunkID: 'ST_out', FromNumber: '+18005550100', Number: '+14155550199', WaitUntilAnswered: true }));

        // Empty / whitespace FromNumber treated as unset and falls back to config.outboundFromNumber
        await wired.Dialer.DialIntoRoom({ RoomName: 'call-abc', Number: '+14155550199', ParticipantIdentity: 'sip-handoff-empty', DisplayName: 'Dana', FromNumber: '   ' });
        expect(h.sip.DialIntoRoom).toHaveBeenCalledWith(expect.objectContaining({ TrunkID: 'ST_out', FromNumber: '+18005550100', Number: '+14155550199', WaitUntilAnswered: true }));

        // Owned FromNumber on trunk passes validation
        await wired.Dialer.DialIntoRoom({ RoomName: 'call-abc', Number: '+14155550199', ParticipantIdentity: 'sip-handoff-2', DisplayName: 'Dana', FromNumber: '+18005559999' });
        expect(h.sip.DialIntoRoom).toHaveBeenCalledWith(expect.objectContaining({ TrunkID: 'ST_out', FromNumber: '+18005559999', Number: '+14155550199', WaitUntilAnswered: true }));

        // Owned FromNumber in config.numbers passes validation
        await wired.Dialer.DialIntoRoom({ RoomName: 'call-abc', Number: '+14155550199', ParticipantIdentity: 'sip-handoff-cfg', DisplayName: 'Dana', FromNumber: '+18005558888' });
        expect(h.sip.DialIntoRoom).toHaveBeenCalledWith(expect.objectContaining({ TrunkID: 'ST_out', FromNumber: '+18005558888', Number: '+14155550199', WaitUntilAnswered: true }));

        // Dynamic refresh on cache miss: newly added trunk number is picked up without restarting
        h.sip.ListOutboundTrunks.mockResolvedValueOnce([
            { TrunkID: 'ST_out', Name: 'Outbound', Numbers: ['+18005550100', '+18005559999', '+18005557777'] },
        ]);
        await wired.Dialer.DialIntoRoom({ RoomName: 'call-abc', Number: '+14155550199', ParticipantIdentity: 'sip-handoff-refresh', DisplayName: 'Dana', FromNumber: '+18005557777' });
        expect(h.sip.DialIntoRoom).toHaveBeenCalledWith(expect.objectContaining({ TrunkID: 'ST_out', FromNumber: '+18005557777', Number: '+14155550199', WaitUntilAnswered: true }));

        // Malformed FromNumber throws
        await expect(
            wired.Dialer.DialIntoRoom({ RoomName: 'call-abc', Number: '+14155550199', ParticipantIdentity: 'sip-handoff-err', DisplayName: 'Dana', FromNumber: 'not-e164' }),
        ).rejects.toThrow(/not a valid E.164 phone number/);

        // Not-owned FromNumber throws
        await expect(
            wired.Dialer.DialIntoRoom({ RoomName: 'call-abc', Number: '+14155550199', ParticipantIdentity: 'sip-handoff-err2', DisplayName: 'Dana', FromNumber: '+14155550000' }),
        ).rejects.toThrow(/not owned by this organization/);

        await wired.AgentStarter({ RoomName: 'call-abc', AgentID: 'a2', AgentName: 'Rex' });
        expect(h.starter.StartRoomAgent).toHaveBeenCalled();
    });

    it('offers no dialer when no outbound trunk is configured', () => {
        const h = harness({});
        expect(h.handoff.Configure.mock.calls[0][0].Dialer).toBeUndefined();
    });
});

describe('inbound calls', () => {
    it('routes a SIP participant joining a call room to the agent identity for the dialed number and starts its session', async () => {
        const h = harness();
        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result.accepted).toBe(true);
        await result.Started;
        expect(runViewMock.mock.calls[0][0].ExtraFilter).toContain(`IdentityValue='+18005550100'`);
        expect(runViewMock.mock.calls[0][0].ExtraFilter).toContain(`ProviderID='${PROVIDER_ID}'`);
        expect(h.starter.Start).toHaveBeenCalledWith(
            expect.objectContaining({
                RoomName: 'call-abc',
                Agent: { AgentID: 'agent-1' },
                Channel: 'phone',
                Direction: 'Inbound',
                RemoteNumber: '+14155550123',
                DialedNumber: '+18005550100',
                ContextUser: USER,
            }),
        );
        expect(h.capacity.Active).toBe(1); // the lease is handed to the starter, which releases it when the session ends
    });

    it('ignores events that are not a phone call arriving', async () => {
        const h = harness();
        const provider = dbProvider();
        for (const event of [
            inboundEvent({ Event: 'participant_left' }),
            inboundEvent({ IsSipParticipant: false }),
            inboundEvent({ RoomName: 'meeting-room-1' }),
        ]) {
            expect((await h.service.HandleWebhookEvent(event, USER, provider)).accepted).toBe(false);
        }
        expect(h.starter.Start).not.toHaveBeenCalled();
        expect(h.sip.RemoveParticipant).not.toHaveBeenCalled();
    });

    it('honours a configured room prefix', async () => {
        const h = harness({ ...CONFIG, roomPrefix: 'phone-' });
        expect((await h.service.HandleWebhookEvent(inboundEvent({ RoomName: 'call-abc' }), USER, dbProvider())).accepted).toBe(false);
        expect((await h.service.HandleWebhookEvent(inboundEvent({ RoomName: 'phone-abc' }), USER, dbProvider())).accepted).toBe(true);
    });

    it('starts nothing for a repeated webhook or a second phone leg in the same room', async () => {
        const h = harness();
        const provider = dbProvider();
        const first = await h.service.HandleWebhookEvent(inboundEvent(), USER, provider);
        await first.Started;
        const repeat = await h.service.HandleWebhookEvent(inboundEvent(), USER, provider);
        const secondLeg = await h.service.HandleWebhookEvent(inboundEvent({ ParticipantIdentity: 'sip-handoff-1' }), USER, provider);
        expect(repeat).toEqual({ accepted: false, reason: 'already handled' });
        expect(secondLeg.reason).toBe('already handled');
        expect(h.starter.Start).toHaveBeenCalledTimes(1);
    });

    it('treats the room as new again once LiveKit says it finished', async () => {
        const h = harness();
        const provider = dbProvider();
        await (await h.service.HandleWebhookEvent(inboundEvent(), USER, provider)).Started;
        await h.service.HandleWebhookEvent(inboundEvent({ Event: 'room_finished', IsSipParticipant: false }), USER, provider);
        expect((await h.service.HandleWebhookEvent(inboundEvent(), USER, provider)).accepted).toBe(true);
    });

    it('hangs up a call whose dialed number has no agent identity', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const h = harness();
        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result.accepted).toBe(false);
        expect(result.reason).toContain('No active agent identity');
        expect(h.sip.RemoveParticipant).toHaveBeenCalledWith('call-abc', 'sip_+14155550123');
        expect(h.starter.Start).not.toHaveBeenCalled();
        expect(h.capacity.Active).toBe(0);
    });

    it('hangs up a call when the server is at its concurrent-call cap, and says it was only busy', async () => {
        const h = harness();
        h.capacity.TryAcquire();
        h.capacity.TryAcquire();
        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result).toMatchObject({ accepted: false, Busy: true });
        expect(h.sip.RemoveParticipant).toHaveBeenCalledWith('call-abc', 'sip_+14155550123');
        expect(h.starter.Start).not.toHaveBeenCalled();
    });

    it('hangs up the phone leg when the agent session cannot start, and never lets that reject', async () => {
        const h = harness();
        h.starter.Start.mockRejectedValueOnce(new Error('model session failed'));
        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result.accepted).toBe(true);
        await expect(result.Started).resolves.toBeUndefined();
        expect(h.sip.RemoveParticipant).toHaveBeenCalledWith('call-abc', 'sip_+14155550123'); // the SIP leg only, not the human
        expect(h.sip.RemoveParticipant).not.toHaveBeenCalledWith('call-abc', 'user-9');
    });

    it('turns an unexpected failure into a refusal and a hang-up instead of throwing', async () => {
        const h = harness();
        h.engine.Config.mockRejectedValueOnce(new Error('metadata not loaded'));
        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result).toEqual({ accepted: false, reason: 'Internal error starting the agent.' });
        expect(h.sip.RemoveParticipant).toHaveBeenCalledWith('call-abc', 'sip_+14155550123');
    });

    it('refuses to admit a call when there is no LiveKit provider row', async () => {
        const h = harness();
        h.engine.ProviderByDriverClass.mockReturnValueOnce(undefined as never);
        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result.accepted).toBe(false);
        expect(h.starter.Start).not.toHaveBeenCalled();
    });

    it('hangs up a call that cannot be admitted at all (no run-as user), once', async () => {
        const h = harness();
        await h.service.RefuseInboundCall(inboundEvent());
        await h.service.RefuseInboundCall(inboundEvent());
        expect(h.sip.RemoveParticipant).toHaveBeenCalledTimes(1);
        await h.service.RefuseInboundCall(inboundEvent({ RoomName: 'not-a-call' }));
        expect(h.sip.RemoveParticipant).toHaveBeenCalledTimes(1);
    });

    it('ends the agent and hangs up the phone leg at the maximum call length', async () => {
        vi.useFakeTimers();
        const h = harness();
        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        await result.Started;
        await vi.advanceTimersByTimeAsync(61_000);
        expect(h.coordinator.StopAgentRoomSession).toHaveBeenCalledWith('SB1', 'HostEnded', USER, expect.anything());
        expect(h.sip.RemoveParticipant).toHaveBeenCalledWith('call-abc', 'sip_+14155550123');
        expect(h.sip.RemoveParticipant).not.toHaveBeenCalledWith('call-abc', 'user-9');
        h.service.Dispose();
    });
});

describe('outbound calls', () => {
    it('needs an outbound trunk', async () => {
        const h = harness({});
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toThrow(/outboundTrunkId/);
    });

    it('starts the agent in a new room, then dials the number into it through the outbound trunk', async () => {
        const h = harness();
        const room = await h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider());
        expect(room).toMatch(/^call-out-/);
        expect(h.starter.Start).toHaveBeenCalledWith(expect.objectContaining({ RoomName: room, Agent: { AgentID: 'agent-1' }, Direction: 'Outbound', Channel: 'phone', RemoteNumber: '+14155550123' }));
        expect(h.sip.DialIntoRoom).toHaveBeenCalledWith(
            expect.objectContaining({ RoomName: room, TrunkID: 'ST_out', Number: '+14155550123', FromNumber: '+18005550100', WaitUntilAnswered: true }),
        );
        expect(h.starter.Start.mock.invocationCallOrder[0]).toBeLessThan(h.sip.DialIntoRoom.mock.invocationCallOrder[0]);
        expect(h.capacity.Active).toBe(1);
    });

    it('does not start an inbound handler for the room it just created', async () => {
        const h = harness();
        const room = await h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider());
        const result = await h.service.HandleWebhookEvent(inboundEvent({ RoomName: room }), USER, dbProvider());
        expect(result.reason).toBe('already handled');
    });

    it('refuses a destination outside the allowed ranges, and gives the slot back', async () => {
        const h = harness();
        await expect(h.service.PlaceOutboundCall('ident-1', '+442071838750', USER, dbProvider())).rejects.toBeInstanceOf(OutboundCallRefusedError);
        expect(h.capacity.Active).toBe(0);
        expect(h.starter.Start).not.toHaveBeenCalled();
    });

    it('refuses with a clear message when every line is busy', async () => {
        const h = harness();
        h.capacity.TryAcquire();
        h.capacity.TryAcquire();
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toMatchObject({ Code: 'at-capacity' });
    });

    it('refuses an identity that does not exist or is inactive', async () => {
        const h = harness();
        await expect(h.service.PlaceOutboundCall('ident-x', '+14155550123', USER, dbProvider(null))).rejects.toThrow(/not found or inactive/);
        expect(h.capacity.Active).toBe(0);
    });

    it('refuses an identity that belongs to another provider', async () => {
        const h = harness();
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider({ ...IDENTITY, ProviderID: 'OTHER' }))).rejects.toMatchObject({ Code: 'wrong-carrier' });
        expect(h.capacity.Active).toBe(0);
    });

    it('stops the agent and reports a failure when the number does not answer', async () => {
        const h = harness();
        h.sip.DialIntoRoom.mockRejectedValueOnce(new Error('486 busy'));
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toThrow(/not answered/);
        expect(h.coordinator.StopAgentRoomSession).toHaveBeenCalledWith('SB1', 'Error', USER, expect.anything());
    });

    it('releases the slot when the agent cannot start (the starter owns the release)', async () => {
        const h = harness();
        h.starter.Start.mockImplementationOnce(async (args: { Lease?: { Release: () => void } }) => {
            args.Lease?.Release();
            throw new Error('model session failed');
        });
        await expect(h.service.PlaceOutboundCall('ident-1', '+14155550123', USER, dbProvider())).rejects.toThrow('model session failed');
        expect(h.capacity.Active).toBe(0);
        expect(h.sip.DialIntoRoom).not.toHaveBeenCalled();
    });
});

describe('Initialize', () => {
    it('provisions inbound routing for the configured numbers when asked to', async () => {
        const h = harness({ ...CONFIG, numbers: ['+18005550100'], autoProvision: true, allowedAddresses: ['54.172.60.0/30'] });
        await h.service.Initialize();
        expect(h.sip.EnsureInboundRouting).toHaveBeenCalledWith({ Numbers: ['+18005550100'], RoomPrefix: 'call-', AllowedAddresses: ['54.172.60.0/30'] });
    });

    it('does not touch LiveKit routing unless autoProvision is set', async () => {
        const h = harness({ ...CONFIG, numbers: ['+18005550100'] });
        await h.service.Initialize();
        expect(h.sip.EnsureInboundRouting).not.toHaveBeenCalled();
    });

    it('logs a configured outbound trunk that LiveKit does not have', async () => {
        const h = harness();
        h.sip.OutboundTrunkExists.mockResolvedValueOnce(false);
        await h.service.Initialize();
        expect(vi.mocked(LogError).mock.calls.map((c) => String(c[0])).join('\n')).toContain("outboundTrunkId 'ST_out' was not found");
    });

    it('reports carrier configuration problems', async () => {
        const h = harness({ ...CONFIG, carrier: { type: 'twilio-elastic-sip' } });
        await h.service.Initialize();
        expect(vi.mocked(LogError).mock.calls.map((c) => String(c[0])).join('\n')).toContain('originationUri');
    });

    it('never throws when LiveKit cannot be reached at startup', async () => {
        const h = harness({ ...CONFIG, numbers: ['+18005550100'], autoProvision: true });
        h.sip.OutboundTrunkExists.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        await expect(h.service.Initialize()).resolves.toBeUndefined();
        expect(vi.mocked(LogError).mock.calls.map((c) => String(c[0])).join('\n')).toContain('ECONNREFUSED');
    });
});

describe('custom inbound handler', () => {
    it('delegates to injected inboundHandler when it handles the call', async () => {
        const h = harness();
        const customHandler = {
            HandleInboundCall: vi.fn().mockResolvedValue({
                Handled: true,
                Outcome: { accepted: true },
            }),
        };
        h.service.SetInboundHandler(customHandler);

        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result).toEqual({ accepted: true });
        expect(customHandler.HandleInboundCall).toHaveBeenCalledWith(
            expect.objectContaining({
                DialedNumber: '+18005550100',
                CallerNumber: '+14155550123',
                RoomName: 'call-abc',
            })
        );
        // Default agent identity lookup was bypassed
        expect(h.starter.Start).not.toHaveBeenCalled();
    });

    it('falls back to default agent lookup when custom handler returns Handled: false', async () => {
        const h = harness();
        const customHandler = {
            HandleInboundCall: vi.fn().mockResolvedValue({
                Handled: false,
            }),
        };
        h.service.SetInboundHandler(customHandler);

        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result.accepted).toBe(true);
        expect(customHandler.HandleInboundCall).toHaveBeenCalled();
        expect(h.starter.Start).toHaveBeenCalled();
    });

    it('treats Handled: true without Outcome as terminal and returns default accepted: true without falling back', async () => {
        const h = harness();
        const customHandler = {
            HandleInboundCall: vi.fn().mockResolvedValue({
                Handled: true,
            }),
        };
        h.service.SetInboundHandler(customHandler);

        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result).toEqual({ accepted: true });
        expect(customHandler.HandleInboundCall).toHaveBeenCalled();
        expect(h.starter.Start).not.toHaveBeenCalled();
    });

    it('fails closed and hangs up when custom handler throws an error', async () => {
        const h = harness();
        const customHandler = {
            HandleInboundCall: vi.fn().mockRejectedValue(new Error('Ingress exploded')),
        };
        h.service.SetInboundHandler(customHandler);

        const result = await h.service.HandleWebhookEvent(inboundEvent(), USER, dbProvider());
        expect(result.accepted).toBe(false);
        expect(result.reason).toContain('Ingress exploded');
        expect(customHandler.HandleInboundCall).toHaveBeenCalled();
        expect(h.sip.RemoveParticipant).toHaveBeenCalledWith('call-abc', 'sip_+14155550123');
        expect(h.starter.Start).not.toHaveBeenCalled();
    });

    it('invokes HandleRoomFinished on room_finished webhook event', async () => {
        const h = harness();
        const customHandler = {
            HandleInboundCall: vi.fn(),
            HandleRoomFinished: vi.fn().mockResolvedValue(undefined),
        };
        h.service.SetInboundHandler(customHandler);

        const finishedEvent: LiveKitRoomWebhookEvent = {
            Event: 'room_finished',
            RoomName: 'call-finish-1',
            RoomSid: 'sid-1',
            ParticipantIdentity: 'part-1',
            IsSipParticipant: true,
        };

        const result = await h.service.HandleWebhookEvent(finishedEvent, USER, dbProvider());
        expect(result).toEqual({ accepted: false, reason: 'room finished' });
        expect(customHandler.HandleRoomFinished).toHaveBeenCalledWith('call-finish-1', USER, expect.anything());
    });

    it('exposes HangUpParticipant and HangUpRoom', async () => {
        const h = harness();
        h.sip.ListParticipants.mockResolvedValueOnce([{ Identity: 'p-1', IsSip: true }, { Identity: 'p-2', IsSip: false }]);
        await h.service.HangUpParticipant('call-room', 'sip-part');
        expect(h.sip.RemoveParticipant).toHaveBeenCalledWith('call-room', 'sip-part');

        await h.service.HangUpRoom('call-room');
        expect(h.sip.RemoveParticipant).toHaveBeenCalledWith('call-room', 'p-1');
        expect(h.sip.RemoveParticipant).not.toHaveBeenCalledWith('call-room', 'p-2');
    });
});


