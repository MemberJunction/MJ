import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { IRealtimeSession } from '@memberjunction/ai';
import type { BridgeLocalToolHandler, BridgeRealtimeRuntime } from '@memberjunction/ai-agents';

const runtimes = vi.hoisted(() => new Map<unknown, unknown>());

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));
vi.mock('@memberjunction/ai-agents', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-agents')>()),
    GetBridgeRealtimeRuntime: (session: unknown) => runtimes.get(session),
}));

import { LogError } from '@memberjunction/core';
import { ResolveOutboundPolicy } from '../telephony/outboundCallPolicy.js';
import { CallCapacityGate } from '../telephony/telephonyCapacity.js';
import { CALL_CONTROL_SETTLE_MS } from '../telephony/telephonyCallTools.js';
import {
    AuthorizeOutboundCallOrRelease,
    BuildTelephonyCallConfiguration,
    TelephonyCallSessionStarter,
    type TelephonyCallStartArgs,
} from '../telephony/telephonyCallSession.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const IDENTITY = { AgentID: 'target-agent', IdentityValue: '+18005550100' };

interface FakeRuntime {
    CancelInFlightDelegations: ReturnType<typeof vi.fn>;
    SetLocalToolHandler: ReturnType<typeof vi.fn>;
}

function fakeSession(cancelled = 0): { session: IRealtimeSession; runtime: FakeRuntime; close: ReturnType<typeof vi.fn> } {
    const close = vi.fn(async () => undefined);
    const session = { Close: close, SendContextNote: vi.fn() } as unknown as IRealtimeSession;
    const runtime: FakeRuntime = { CancelInFlightDelegations: vi.fn(() => cancelled), SetLocalToolHandler: vi.fn() };
    runtimes.set(session, runtime as unknown as BridgeRealtimeRuntime);
    return { session, runtime, close };
}

/** A provider whose `MJ: AI Agent Sessions` rows record what was saved. */
function fakeDb() {
    const saved: Array<Record<string, unknown>> = [];
    const provider = {
        GetEntityObject: vi.fn(async () => {
            const row: Record<string, unknown> = {
                Status: 'Active',
                Load: async () => true,
                Save: async () => {
                    saved.push({ Status: row['Status'], CloseReason: row['CloseReason'], ClosedAt: row['ClosedAt'] });
                    return true;
                },
            };
            return row;
        }),
    } as unknown as IMetadataProvider;
    return { provider, saved };
}

interface Setup {
    starter: TelephonyCallSessionStarter;
    engine: { Config: ReturnType<typeof vi.fn>; StartBridgeSession: ReturnType<typeof vi.fn>; StopBridgeSession: ReturnType<typeof vi.fn> };
    sessionFactory: ReturnType<typeof vi.fn>;
    sessions: ReturnType<typeof fakeSession>[];
    coAgentResolver: ReturnType<typeof vi.fn>;
    db: ReturnType<typeof fakeDb>;
    gate: CallCapacityGate;
    args: (overrides?: Partial<TelephonyCallStartArgs>) => TelephonyCallStartArgs;
    active: { SessionBridgeID: string; RoomKey: string; Bridge: { TransferCall: ReturnType<typeof vi.fn>; SendDTMF: ReturnType<typeof vi.fn> }; RealtimeSession?: IRealtimeSession };
}

function setup(features: Record<string, boolean> = { CallTransfer: true, DTMF: true }): Setup {
    const sessions: ReturnType<typeof fakeSession>[] = [];
    const sessionFactory = vi.fn(async () => {
        const made = fakeSession(2);
        sessions.push(made);
        return made.session;
    });
    const active: Setup['active'] = { SessionBridgeID: 'SB1', RoomKey: 'CA1', Bridge: { TransferCall: vi.fn(async () => undefined), SendDTMF: vi.fn(async () => undefined) } };
    const engine = {
        Config: vi.fn(async () => undefined),
        StartBridgeSession: vi.fn(async (p: { RealtimeSession: IRealtimeSession }) => {
            active.RealtimeSession = p.RealtimeSession;
            return active;
        }),
        StopBridgeSession: vi.fn(async () => true),
    };
    const coAgentResolver = vi.fn(async () => 'co-agent');
    const db = fakeDb();
    const gate = new CallCapacityGate(2);
    const starter = new TelephonyCallSessionStarter({
        Engine: engine as never,
        SessionFactory: sessionFactory as never,
        SessionManager: { CreateSession: vi.fn(async () => ({ ID: 'AS1', ConversationID: 'CONV1' })) } as never,
        CoAgentResolver: coAgentResolver as never,
        CallerResolver: { ResolveCaller: vi.fn(async () => ({ Verified: false })) },
        OutboundPolicy: ResolveOutboundPolicy(),
    });
    const args = (overrides: Partial<TelephonyCallStartArgs> = {}): TelephonyCallStartArgs => ({
        ResolveProvider: () => ({ ID: 'PROV', SupportedFeaturesObject: features }) as never,
        Identity: IDENTITY,
        Direction: 'Inbound',
        RemoteNumber: '+14155550123',
        Configuration: BuildTelephonyCallConfiguration({ Direction: 'Inbound', CallerNumber: '+14155550123', InboundCallId: 'CA1' }),
        BindSdk: vi.fn(),
        ContextUser: USER,
        MetadataProvider: db.provider,
        Lease: gate.TryAcquire() as never,
        ...overrides,
    });
    return { starter, engine, sessionFactory, sessions, coAgentResolver, db, gate, args, active };
}

beforeEach(() => runtimes.clear());
afterEach(() => vi.useRealTimers());

describe('BuildTelephonyCallConfiguration', () => {
    it('keeps the agent number and the caller number apart', () => {
        const inbound = BuildTelephonyCallConfiguration({ Direction: 'Inbound', CallerNumber: '+1415', InboundCallId: 'CA1' });
        expect(inbound).toMatchObject({ Direction: 'Inbound', CallerNumber: '+1415', InboundCallId: 'CA1' });
        expect(inbound['FromNumber']).toBeUndefined();

        const outbound = BuildTelephonyCallConfiguration({ Direction: 'Outbound', AgentNumber: '+1800', Extra: { CarrierSampleRate: 16000 } });
        expect(outbound).toMatchObject({ Direction: 'Outbound', FromNumber: '+1800', CarrierSampleRate: 16000 });
        expect(outbound['CallerNumber']).toBeUndefined();
    });
});

describe('TelephonyCallSessionStarter.Start — agents', () => {
    it('resolves the co-agent through the shared chain and keeps it distinct from the dialled (target) agent', async () => {
        const s = setup();
        await s.starter.Start(s.args());

        expect(s.coAgentResolver).toHaveBeenCalledWith('target-agent', undefined, USER, s.db.provider);
        const factoryArgs = s.sessionFactory.mock.calls[0][0] as Record<string, unknown>;
        expect(factoryArgs['AgentID']).toBe('co-agent');
        expect(factoryArgs['TargetAgentID']).toBe('target-agent');
        const start = s.engine.StartBridgeSession.mock.calls[0][0] as Record<string, unknown>;
        expect(start['AgentID']).toBe('co-agent');
        expect(start['TargetAgentID']).toBe('target-agent');
    });

    it("ties the model session to the call's own conversation and agent session", async () => {
        const s = setup();
        await s.starter.Start(s.args());
        expect(s.sessionFactory.mock.calls[0][0]).toMatchObject({ AgentSessionID: 'AS1', ConversationID: 'CONV1' });
    });

    it('gives the model the phone framing, the caller number and an unverified-caller warning', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const framing = (s.sessionFactory.mock.calls[0][0] as { HostFraming: string }).HostFraming;
        expect(framing).toContain('+14155550123');
        expect(framing).toMatch(/UNVERIFIED/);
    });

    it('offers only the call-control tools the carrier supports', async () => {
        const s = setup({ CallTransfer: false, DTMF: true });
        await s.starter.Start(s.args());
        const tools = (s.sessionFactory.mock.calls[0][0] as { HostTools: Array<{ Name: string }> }).HostTools.map((t) => t.Name);
        expect(tools).toEqual(['send_dtmf', 'end_call']);
    });
});

describe('TelephonyCallSessionStarter.Start — the bridge row', () => {
    it("uses the agent's DID as the address and the caller as caller number, and stamps an inbound, active row", async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const start = s.engine.StartBridgeSession.mock.calls[0][0] as Record<string, unknown> & { Configuration: Record<string, unknown> };
        expect(start['Address']).toBe('+18005550100');
        expect(start.Configuration['CallerNumber']).toBe('+14155550123');
        expect(start['JoinMethod']).toBe('InboundRoute');
        expect(start['TurnMode']).toBe('Active');
        expect(start['Direction']).toBe('Inbound');
    });

    it('addresses an outbound call at the number being dialled', async () => {
        const s = setup();
        await s.starter.Start(s.args({ Direction: 'Outbound', RemoteNumber: '+14155550999', Configuration: BuildTelephonyCallConfiguration({ Direction: 'Outbound', AgentNumber: '+18005550100' }) }));
        const start = s.engine.StartBridgeSession.mock.calls[0][0] as Record<string, unknown>;
        expect(start['Address']).toBe('+14155550999');
        expect(start['JoinMethod']).toBe('OnDemand');
        expect(start['TurnMode']).toBe('Active');
    });

    it("writes the transcript to the call's own conversation, attributed to the dialled agent", async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const sink = (s.engine.StartBridgeSession.mock.calls[0][0] as { TranscriptSink?: unknown }).TranscriptSink;
        expect(typeof sink).toBe('function');
    });

    it('returns the call id and bridge session id', async () => {
        const s = setup();
        expect(await s.starter.Start(s.args())).toEqual({ RoomKey: 'CA1', SessionBridgeID: 'SB1' });
    });
});

describe('TelephonyCallSessionStarter.Start — in-call behaviour', () => {
    it('binds the call-control tools onto the model session', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const handler = s.sessions[0].runtime.SetLocalToolHandler.mock.calls[0][0] as BridgeLocalToolHandler;
        expect(handler.Handles('transfer_call')).toBe(true);
    });

    it('cancels in-flight delegations when the caller talks over the agent', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const onBargeIn = (s.engine.StartBridgeSession.mock.calls[0][0] as { OnBargeIn: () => void }).OnBargeIn;
        onBargeIn();
        expect(s.sessions[0].runtime.CancelInFlightDelegations).toHaveBeenCalledTimes(1);
    });

    it('barge-in with no delegation running is harmless', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        runtimes.clear();
        const onBargeIn = (s.engine.StartBridgeSession.mock.calls[0][0] as { OnBargeIn: () => void }).OnBargeIn;
        expect(() => onBargeIn()).not.toThrow();
    });

    it('re-opens the model session on recovery, carrying the conversation so far and re-binding the tools', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const recover = (s.engine.StartBridgeSession.mock.calls[0][0] as { RecoverRealtimeSession: (r: { PriorTranscript: string; Attempt: number; Reason: string }) => Promise<IRealtimeSession> }).RecoverRealtimeSession;

        const reopened = await recover({ PriorTranscript: 'User: hi\nAssistant: hello', Attempt: 1, Reason: 'closed' });

        expect(s.sessionFactory).toHaveBeenCalledTimes(2);
        expect(s.sessionFactory.mock.calls[1][0]).toMatchObject({ AgentID: 'co-agent', TargetAgentID: 'target-agent', PriorTranscript: 'User: hi\nAssistant: hello' });
        expect(reopened).toBe(s.sessions[1].session);
        expect(s.sessions[1].runtime.SetLocalToolHandler).toHaveBeenCalledTimes(1);
    });

    it('end_call stops the bridge session after the goodbye settles', async () => {
        vi.useFakeTimers();
        const s = setup();
        await s.starter.Start(s.args());
        const handler = s.sessions[0].runtime.SetLocalToolHandler.mock.calls[0][0] as BridgeLocalToolHandler;

        await handler.Execute({ CallID: 'c', ToolName: 'end_call', Arguments: '{"reason":"done"}' });
        expect(s.engine.StopBridgeSession).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(CALL_CONTROL_SETTLE_MS + 1);

        expect(s.engine.StopBridgeSession).toHaveBeenCalledWith('SB1', 'Explicit', USER, s.db.provider);
    });

    it('transfer_call and send_dtmf act on the live bridge', async () => {
        vi.useFakeTimers();
        const s = setup();
        await s.starter.Start(s.args());
        const handler = s.sessions[0].runtime.SetLocalToolHandler.mock.calls[0][0] as BridgeLocalToolHandler;

        await handler.Execute({ CallID: 'c', ToolName: 'send_dtmf', Arguments: '{"digits":"12#"}' });
        expect(s.active.Bridge.SendDTMF).toHaveBeenCalledWith('12#');

        await handler.Execute({ CallID: 'c', ToolName: 'transfer_call', Arguments: '{"destination":"+14155550199"}' });
        await vi.advanceTimersByTimeAsync(CALL_CONTROL_SETTLE_MS + 1);
        expect(s.active.Bridge.TransferCall).toHaveBeenCalledWith('+14155550199');
    });

    it('says so when the model session has no bridge runtime to carry the tools', async () => {
        const s = setup();
        s.sessionFactory.mockImplementationOnce(async () => ({ Close: vi.fn() }));
        await s.starter.Start(s.args());
        expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('no bridge runtime'));
    });
});

describe('TelephonyCallSessionStarter.Start — cleanup', () => {
    it('releases the capacity slot and closes the agent-session row when the call ends', async () => {
        const s = setup();
        const lease = s.gate.TryAcquire();
        expect(s.gate.Active).toBeGreaterThan(0);
        const args = s.args({ Lease: lease as never });
        await s.starter.Start(args);
        const onEnded = (s.engine.StartBridgeSession.mock.calls[0][0] as { OnSessionEnded: (r: string) => Promise<void> }).OnSessionEnded;

        const before = s.gate.Active;
        await onEnded('HostEnded');

        expect(s.gate.Active).toBe(before - 1);
        expect(s.db.saved).toContainEqual(expect.objectContaining({ Status: 'Closed', CloseReason: 'Explicit' }));
    });

    it('maps an errored end onto the Error close reason', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const onEnded = (s.engine.StartBridgeSession.mock.calls[0][0] as { OnSessionEnded: (r: string) => Promise<void> }).OnSessionEnded;
        await onEnded('Error');
        expect(s.db.saved).toContainEqual(expect.objectContaining({ CloseReason: 'Error' }));
    });

    it('on a failed start: releases the slot, closes the agent session and the model session, and rethrows', async () => {
        const s = setup();
        const args = s.args();
        s.engine.StartBridgeSession.mockRejectedValue(new Error('connect failed'));

        await expect(s.starter.Start(args)).rejects.toThrow('connect failed');

        expect(s.gate.Active).toBe(0);
        expect(s.sessions[0].close).toHaveBeenCalled();
        expect(s.db.saved).toContainEqual(expect.objectContaining({ Status: 'Closed', CloseReason: 'Error' }));
    });

    it('releases the slot when the co-agent cannot be resolved', async () => {
        const s = setup();
        s.coAgentResolver.mockRejectedValue(new Error('no co-agent'));
        const args = s.args();
        await expect(s.starter.Start(args)).rejects.toThrow('no co-agent');
        expect(s.gate.Active).toBe(0);
        expect(s.sessionFactory).not.toHaveBeenCalled();
    });

    it('releases the slot when the carrier provider row is missing', async () => {
        const s = setup();
        const args = s.args({ ResolveProvider: () => { throw new Error('No active provider row'); } });
        await expect(s.starter.Start(args)).rejects.toThrow('No active provider row');
        expect(s.gate.Active).toBe(0);
    });

    it('a failure while closing the agent-session row is logged, not thrown', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const onEnded = (s.engine.StartBridgeSession.mock.calls[0][0] as { OnSessionEnded: (r: string) => Promise<void> }).OnSessionEnded;
        vi.mocked(s.db.provider.GetEntityObject).mockRejectedValue(new Error('db down'));
        await expect(onEnded('HostEnded')).resolves.toBeUndefined();
    });
});

describe('AuthorizeOutboundCallOrRelease', () => {
    const request = { User: USER, AgentIdentity: { ID: 'i', AgentID: 'a', ProviderID: 'P', IsActive: true }, CarrierProviderID: 'P', ToNumber: '+14155550123' };
    const guard = (canRun: boolean) => ({
        Policy: ResolveOutboundPolicy(),
        Limiter: { TryConsume: () => true } as never,
        CanRunAgent: async () => canRun,
    });

    it('keeps the slot when the call is allowed', async () => {
        const gate = new CallCapacityGate(1);
        const lease = gate.TryAcquire();
        const verdict = await AuthorizeOutboundCallOrRelease(request, guard(true), lease as never);
        expect(verdict.Allowed).toBe(true);
        expect(gate.Active).toBe(1);
    });

    it('gives the slot back when the gate refuses the call', async () => {
        const gate = new CallCapacityGate(1);
        const lease = gate.TryAcquire();
        const verdict = await AuthorizeOutboundCallOrRelease(request, guard(false), lease as never);
        expect(verdict.Allowed).toBe(false);
        expect(gate.Active).toBe(0);
    });

    it('gives the slot back when the gate throws', async () => {
        const gate = new CallCapacityGate(1);
        const lease = gate.TryAcquire();
        const throwing = { ...guard(true), CanRunAgent: async () => { throw new Error('perm lookup failed'); } };
        await expect(AuthorizeOutboundCallOrRelease(request, throwing, lease as never)).rejects.toThrow('perm lookup failed');
        expect(gate.Active).toBe(0);
    });
});
