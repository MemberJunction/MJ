import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { IRealtimeSession } from '@memberjunction/ai';
import type { BridgeLocalToolHandler, BridgeRealtimeRuntime } from '@memberjunction/ai-agents';
import type { AgentRoomHostOptions, HandoffRequest, RoomHandoffAgentContext } from '@memberjunction/livekit-room-server';

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

import { ResolveOutboundPolicy, type TransferTarget } from '../telephony/outboundCallPolicy.js';
import { CallCapacityGate } from '../telephony/telephonyCapacity.js';
import { TRANSFER_CALL_TOOL } from '../telephony/telephonyCallTools.js';
import { RoomCallSessionStarter, type RoomCallStartArgs } from '../telephony/roomCallSession.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const TARGETS: TransferTarget[] = [{ Kind: 'user', Name: 'Billing team', UserEmail: 'dana@example.com' }];

interface FakeRuntime {
    CancelInFlightDelegations: ReturnType<typeof vi.fn>;
    CancelPendingNarration: ReturnType<typeof vi.fn>;
    SetLocalToolHandler: ReturnType<typeof vi.fn>;
}

function fakeSession() {
    const close = vi.fn(async () => undefined);
    const session = { Close: close, SendContextNote: vi.fn() } as unknown as IRealtimeSession;
    const runtime: FakeRuntime = { CancelInFlightDelegations: vi.fn(() => 3), CancelPendingNarration: vi.fn(), SetLocalToolHandler: vi.fn() };
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
                    saved.push({ Status: row['Status'], CloseReason: row['CloseReason'] });
                    return true;
                },
            };
            return row;
        }),
    } as unknown as IMetadataProvider;
    return { provider, saved };
}

function setup(engineDeps: Record<string, unknown> = { Presence: { IsParticipantPresent: async () => true } }) {
    const db = fakeDb();
    const models: ReturnType<typeof fakeSession>[] = [];
    const hostCalls: AgentRoomHostOptions[] = [];
    const startParams: Array<Record<string, unknown>> = [];
    let bridgeSeq = 0;
    const coordinator = {
        StartAgentRoomSession: vi.fn(async (params: { Host?: AgentRoomHostOptions } & Record<string, unknown>) => {
            startParams.push(params);
            hostCalls.push(params.Host as AgentRoomHostOptions);
            const model = fakeSession();
            models.push(model);
            params.Host?.OnModelSession?.(model.session);
            return { SessionBridgeID: `bridge-${++bridgeSeq}`, RoomName: String(params.RoomName), ServerUrl: 'wss://x' };
        }),
        StopAgentRoomSession: vi.fn(async () => true),
    };
    const engine = {
        RequestHandoff: vi.fn((_agent: RoomHandoffAgentContext, _request: HandoffRequest) => ({ Ok: true as const, Status: 'offered' as const })),
        AgentReadyToLeave: vi.fn(() => true),
        CancelRoom: vi.fn(),
        Deps: engineDeps,
    };
    const sessionManager = { CreateSession: vi.fn(async (input: { conversationID?: string }) => ({ ID: `AS${bridgeSeq + 1}`, ConversationID: input.conversationID ?? 'CONV1' })) };
    const gate = new CallCapacityGate(2);
    const starter = new RoomCallSessionStarter({
        Coordinator: coordinator as never,
        SessionManager: sessionManager as never,
        CoAgentResolver: vi.fn(async () => 'co-agent') as never,
        CallerResolver: { ResolveCaller: vi.fn(async () => ({ Verified: false })) },
        Engine: engine as never,
        Targets: TARGETS,
        Destinations: { Policy: ResolveOutboundPolicy(), Directory: { FindByEmail: () => ({ ID: 'u-dana', IsActive: true }) as never, GetSystemUser: () => undefined } },
        Capacity: gate,
        AgentNameResolver: vi.fn(async () => 'Sage'),
    });
    const args = (over: Partial<RoomCallStartArgs> = {}): RoomCallStartArgs => ({
        RoomName: 'call-1',
        Agent: { AgentID: 'target-agent', Name: 'Sage' },
        Channel: 'phone',
        Direction: 'Inbound',
        RemoteNumber: '+14155550123',
        DialedNumber: '+18005550100',
        Lease: null,
        ContextUser: USER,
        MetadataProvider: db.provider,
        ...over,
    });
    return { starter, coordinator, engine, sessionManager, gate, db, models, hostCalls, startParams, args };
}

beforeEach(() => runtimes.clear());

describe('RoomCallSessionStarter.Start', () => {
    it('resolves the co-agent through the chain and keeps it distinct from the dialled (target) agent', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        expect(s.sessionManager.CreateSession).toHaveBeenCalledWith({ agentID: 'co-agent', userID: 'user-1', conversationID: undefined }, USER, expect.anything());
        expect(s.startParams[0]).toMatchObject({ AgentID: 'co-agent', TargetAgentID: 'target-agent', AgentName: 'Sage', RoomName: 'call-1', TurnMode: 'Active' });
    });

    it('starts an inbound phone call as an inbound route, and a web room as on-demand', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        await s.starter.Start(s.args({ RoomName: 'web-1', Channel: 'web', RemoteNumber: undefined }));
        expect(s.hostCalls[0]).toMatchObject({ JoinMethod: 'InboundRoute', Direction: 'Inbound', RecoverModelSession: true });
        expect(s.hostCalls[1]).toMatchObject({ JoinMethod: 'OnDemand' });
    });

    it('frames the call for the model and offers the handoff tools the server can act on', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const host = s.hostCalls[0];
        expect(host.HostFraming).toContain('live telephone call');
        expect(host.HostFraming).toContain('UNVERIFIED');
        expect(host.HostTools?.map((t) => t.Name)).toContain(TRANSFER_CALL_TOOL);
    });

    it('offers no transfer tool when the server cannot bring anyone into a room', async () => {
        const s = setup({});
        await s.starter.Start(s.args());
        expect(s.hostCalls[0].HostTools?.map((t) => t.Name)).not.toContain(TRANSFER_CALL_TOOL);
    });

    it('writes the transcript to the call\'s own conversation', async () => {
        const s = setup();
        const started = await s.starter.Start(s.args());
        expect(started.ConversationID).toBe('CONV1');
        expect(s.hostCalls[0].ConversationID).toBe('CONV1');
        expect(s.hostCalls[0].TranscriptSink).toBeTypeOf('function');
    });

    it('attaches the tool handler to every model session it is given, including a re-opened one', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        const second = fakeSession();
        s.hostCalls[0].OnModelSession?.(second.session);
        expect(s.models[0].runtime.SetLocalToolHandler).toHaveBeenCalledTimes(1);
        expect(second.runtime.SetLocalToolHandler).toHaveBeenCalledTimes(1);
        const handler = s.models[0].runtime.SetLocalToolHandler.mock.calls[0][0] as BridgeLocalToolHandler;
        expect(handler.Handles(TRANSFER_CALL_TOOL)).toBe(true);
    });

    it('drops queued narration on a talk-over but leaves delegated work running', async () => {
        const s = setup();
        await s.starter.Start(s.args());
        s.hostCalls[0].OnBargeIn?.();
        expect(s.models[0].runtime.CancelPendingNarration).toHaveBeenCalled();
        expect(s.models[0].runtime.CancelInFlightDelegations).not.toHaveBeenCalled();
    });

    describe('the transfer tool, as the model uses it', () => {
        it('requests the handoff on behalf of THIS agent, with a way to tell the model and a way to leave', async () => {
            const s = setup();
            await s.starter.Start(s.args());
            const handler = s.models[0].runtime.SetLocalToolHandler.mock.calls[0][0] as BridgeLocalToolHandler;
            const out = JSON.parse(await handler.Execute({ CallID: 'c', ToolName: TRANSFER_CALL_TOOL, Arguments: JSON.stringify({ target: 'Billing team', summary: 'Wants a refund' }) }));
            expect(out).toMatchObject({ ok: true, status: 'offered' });

            const [agent, request] = s.engine.RequestHandoff.mock.calls[0];
            expect(request).toEqual({ Mode: 'warm', Summary: 'Wants a refund', Destination: { Kind: 'user', UserID: 'u-dana', DisplayName: 'Billing team' } });
            expect(agent).toMatchObject({ RoomName: 'call-1', AgentName: 'Sage', CallerLabel: expect.stringMatching(/^Phone caller \*+0123$/) });

            agent.NotifyModel('[handoff] hello');
            expect((s.models[0].session.SendContextNote as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('[handoff] hello');
            await agent.LeaveRoom();
            expect(s.coordinator.StopAgentRoomSession).toHaveBeenCalledWith('bridge-1', 'Explicit', USER, expect.anything());
        });

        it('masks the caller\'s number in the label it shows people', async () => {
            const s = setup();
            await s.starter.Start(s.args());
            const handler = s.models[0].runtime.SetLocalToolHandler.mock.calls[0][0] as BridgeLocalToolHandler;
            await handler.Execute({ CallID: 'c', ToolName: TRANSFER_CALL_TOOL, Arguments: JSON.stringify({ target: 'Billing team', summary: 's' }) });
            const label = s.engine.RequestHandoff.mock.calls[0][0].CallerLabel;
            expect(label).not.toContain('+14155550123');
            expect(label).toContain('0123');
        });
    });

    describe('end_call', () => {
        it('stops the agent and hangs up the phone leg', async () => {
            vi.useFakeTimers();
            try {
                const s = setup();
                const hangUp = vi.fn(async () => undefined);
                await s.starter.Start(s.args({ HangUp: hangUp }));
                const handler = s.models[0].runtime.SetLocalToolHandler.mock.calls[0][0] as BridgeLocalToolHandler;
                await handler.Execute({ CallID: 'c', ToolName: 'end_call', Arguments: '{"reason":"done"}' });
                await vi.advanceTimersByTimeAsync(4000);
                expect(s.coordinator.StopAgentRoomSession).toHaveBeenCalledWith('bridge-1', 'Explicit', USER, expect.anything());
                expect(hangUp).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('cleanup', () => {
        it('releases the slot, closes the agent-session row, withdraws a waiting handoff and runs the end hook when the session ends', async () => {
            const s = setup();
            const onEnded = vi.fn();
            const lease = s.gate.TryAcquire();
            expect(s.gate.Active).toBe(1);
            await s.starter.Start(s.args({ Lease: lease, OnEnded: onEnded }));
            await s.hostCalls[0].OnSessionEnded?.('Explicit');
            expect(s.gate.Active).toBe(0);
            expect(s.engine.CancelRoom).toHaveBeenCalledWith('call-1');
            expect(s.db.saved).toEqual([{ Status: 'Closed', CloseReason: 'Explicit' }]);
            expect(onEnded).toHaveBeenCalledWith('Explicit');
        });

        it('releases the slot, closes the row and closes the model session when the start fails', async () => {
            const s = setup();
            s.coordinator.StartAgentRoomSession.mockImplementationOnce(async (params: { Host?: AgentRoomHostOptions }) => {
                const model = fakeSession();
                s.models.push(model);
                params.Host?.OnModelSession?.(model.session);
                throw new Error('LiveKit is down');
            });
            const lease = s.gate.TryAcquire();
            await expect(s.starter.Start(s.args({ Lease: lease }))).rejects.toThrow('LiveKit is down');
            expect(s.gate.Active).toBe(0);
            expect(s.db.saved).toEqual([{ Status: 'Closed', CloseReason: 'Error' }]);
            expect(s.models[0].close).toHaveBeenCalled();
        });

        it('releases the slot when the agent session cannot even be created', async () => {
            const s = setup();
            s.sessionManager.CreateSession.mockRejectedValueOnce(new Error('db down'));
            const lease = s.gate.TryAcquire();
            await expect(s.starter.Start(s.args({ Lease: lease }))).rejects.toThrow('db down');
            expect(s.gate.Active).toBe(0);
            expect(s.db.saved).toEqual([]);
        });

        it('does not let a throwing end hook break cleanup', async () => {
            const s = setup();
            await s.starter.Start(s.args({ OnEnded: () => { throw new Error('boom'); } }));
            await expect(s.hostCalls[0].OnSessionEnded?.('Explicit')).resolves.toBeUndefined();
        });
    });
});

describe('RoomCallSessionStarter.StartRoomAgent (an agent taking over, or the first agent of a web room)', () => {
    const request = (over: Record<string, unknown> = {}) => ({
        RoomName: 'call-1',
        AgentID: 'rex-id',
        AgentName: 'Rex',
        Brief: 'Needs legal help with a contract',
        PreviousAgentName: 'Sage',
        CallerLabel: 'Phone caller ****0123',
        ContextUser: USER,
        Provider: {} as IMetadataProvider,
        ...over,
    });

    it('starts the second agent in the SAME conversation, framed with what the first agent said', async () => {
        const s = setup();
        const db = s.db.provider;
        await s.starter.Start(s.args({ Lease: null, MetadataProvider: db }));
        const started = await s.starter.StartRoomAgent(request({ Provider: db }));
        expect(started).toEqual({ SessionBridgeID: 'bridge-2' });
        expect(s.sessionManager.CreateSession).toHaveBeenLastCalledWith(expect.objectContaining({ conversationID: 'CONV1' }), USER, db);
        expect(s.hostCalls[1].HostFraming).toContain('taking this conversation over from Sage');
        expect(s.hostCalls[1].HostFraming).toContain('Needs legal help with a contract');
        expect(s.startParams[1]).toMatchObject({ AgentName: 'Rex', TargetAgentID: 'rex-id' });
    });

    it('takes its own capacity slot for a phone call and gives it back when it ends', async () => {
        const s = setup();
        await s.starter.Start(s.args({ Lease: s.gate.TryAcquire() }));
        expect(s.gate.Active).toBe(1);
        await s.starter.StartRoomAgent(request({ Provider: s.db.provider }));
        expect(s.gate.Active).toBe(2);
        await s.hostCalls[1].OnSessionEnded?.('Explicit');
        expect(s.gate.Active).toBe(1);
    });

    it('refuses to start when every line is busy, without leaking anything', async () => {
        const s = setup();
        await s.starter.Start(s.args({ Lease: s.gate.TryAcquire() }));
        s.gate.TryAcquire();
        await expect(s.starter.StartRoomAgent(request({ Provider: s.db.provider }))).rejects.toThrow(/busy/);
        expect(s.coordinator.StartAgentRoomSession).toHaveBeenCalledTimes(1);
    });

    it('treats a room it knows nothing about as a web room: no capacity slot, no takeover framing without a brief', async () => {
        const s = setup();
        await s.starter.StartRoomAgent(request({ RoomName: 'meet-room', Brief: undefined, PreviousAgentName: undefined, CallerLabel: 'Web visitor', Provider: s.db.provider }));
        expect(s.gate.Active).toBe(0);
        expect(s.hostCalls[0].HostFraming).toContain('live room');
        expect(s.hostCalls[0].HostFraming).not.toContain('taking this conversation over');
        expect(s.hostCalls[0].JoinMethod).toBe('OnDemand');
    });

    it('passes a developer\'s model and voice overrides to the room session', async () => {
        const s = setup();
        await s.starter.StartRoomAgent(request({ RoomName: 'meet-room', Brief: undefined, RealtimeModelID: 'model-1', RealtimeVoice: 'echo', Provider: s.db.provider }));
        expect(s.startParams[0]).toMatchObject({ RealtimeModelID: 'model-1', RealtimeVoice: 'echo' });
    });

    it('forgets the call once its last agent has ended, so a later room of the same name starts fresh', async () => {
        const s = setup();
        await s.starter.Start(s.args({ Lease: null }));
        await s.hostCalls[0].OnSessionEnded?.('Explicit');
        await s.starter.StartRoomAgent(request({ Brief: undefined, Provider: s.db.provider }));
        expect(s.sessionManager.CreateSession).toHaveBeenLastCalledWith(expect.objectContaining({ conversationID: undefined }), USER, expect.anything());
    });
});
