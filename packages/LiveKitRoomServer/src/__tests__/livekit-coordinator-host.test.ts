/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks return minimal cast fixtures for the engine / session seams */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS, type AgentRoomHostOptions, type BridgeOps, type RealtimeSessionStartContext } from '../livekit-agent-room-coordinator';
import { LiveKitTokenService } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

// Module-level so bridge ids stay unique across tests: the coordinator's room roster is a process-wide singleton.
let seq = 0;

function makeBridgeOps() {
  const startCalls: Record<string, any>[] = [];
  const ops = {
    Config: vi.fn(async () => undefined),
    ProviderByDriverClass: vi.fn(() => ({ ID: 'p1', DriverClass: LIVEKIT_BRIDGE_DRIVER_CLASS }) as any),
    StartBridgeSession: vi.fn(async (params: Record<string, any>) => {
      startCalls.push(params);
      return { SessionBridgeID: `bridge-${++seq}` } as any;
    }),
    StopBridgeSession: vi.fn(async () => true),
    ReconfigureSessionToMeeting: vi.fn(() => true),
  } satisfies BridgeOps;
  return { ops, startCalls };
}

describe('LiveKitAgentRoomCoordinator host options (a host that owns the call)', () => {
  let coordinator: LiveKitAgentRoomCoordinator;
  let factoryCalls: RealtimeSessionStartContext[];
  let sessions: object[];

  beforeEach(() => {
    coordinator = LiveKitAgentRoomCoordinator.Instance;
    coordinator.SetTokenService(new LiveKitTokenService(CONFIG));
    factoryCalls = [];
    sessions = [];
    coordinator.SetSessionFactory(async (ctx) => {
      factoryCalls.push(ctx);
      const session = { id: sessions.length };
      sessions.push(session);
      return session as any;
    });
  });

  it('passes the host tools, framing and conversation to the model session', async () => {
    const { ops } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);
    const host: AgentRoomHostOptions = {
      HostTools: [{ Name: 'transfer_call', Description: 'x', ParametersSchema: {} }],
      HostFraming: 'You are on a phone call.',
      ConversationID: 'conv-1',
    };
    await coordinator.StartAgentRoomSession({ AgentSessionID: 's', RoomName: 'host-room-1', Host: host });
    expect(factoryCalls[0].HostTools).toEqual(expect.arrayContaining(host.HostTools!));
    expect(factoryCalls[0]).toMatchObject({ HostFraming: 'You are on a phone call.', ConversationID: 'conv-1' });
    expect(factoryCalls[0].PriorTranscript).toBeUndefined();
  });

  it('hands every model session it opens to the host, so tool handlers can be attached to each', async () => {
    const { ops, startCalls } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);
    const seen: object[] = [];
    await coordinator.StartAgentRoomSession({
      AgentSessionID: 's',
      RoomName: 'host-room-2',
      Host: { OnModelSession: (s) => seen.push(s), RecoverModelSession: true },
    });
    expect(seen).toEqual([sessions[0]]);

    // The engine re-opens the session after a drop; the replacement is seeded with the transcript and also reaches the host.
    const replacement = await startCalls[0].RecoverRealtimeSession({ PriorTranscript: 'User: hi', Attempt: 1, Reason: 'closed' });
    expect(replacement).toBe(sessions[1]);
    expect(factoryCalls[1].PriorTranscript).toBe('User: hi');
    expect(seen).toEqual([sessions[0], sessions[1]]);
  });

  it('forwards the transcript sink, barge-in policy, join method and direction to the bridge session', async () => {
    const { ops, startCalls } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);
    const sink = vi.fn();
    const onBargeIn = vi.fn();
    await coordinator.StartAgentRoomSession({
      AgentSessionID: 's',
      RoomName: 'host-room-3',
      TurnMode: 'Active',
      Host: { TranscriptSink: sink, OnBargeIn: onBargeIn, JoinMethod: 'InboundRoute', Direction: 'Inbound' },
    });
    expect(startCalls[0]).toMatchObject({ TranscriptSink: sink, OnBargeIn: onBargeIn, JoinMethod: 'InboundRoute', Direction: 'Inbound', TurnMode: 'Active' });
  });

  it('does not offer model recovery unless the host asks for it', async () => {
    const { ops, startCalls } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);
    await coordinator.StartAgentRoomSession({ AgentSessionID: 's', RoomName: 'host-room-4', Host: {} });
    expect(startCalls[0].RecoverRealtimeSession).toBeUndefined();
  });

  it('runs the host\'s end-of-session hook and drops the agent from the room roster when the engine ends the session on its own', async () => {
    const { ops, startCalls } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);
    const ended = vi.fn();
    await coordinator.StartAgentRoomSession({ AgentSessionID: 's', RoomName: 'host-room-5', Host: { OnSessionEnded: ended } });
    await startCalls[0].OnSessionEnded('Janitor');
    expect(ended).toHaveBeenCalledWith('Janitor');
    // The roster is empty again, so ending the room finds no agents to stop.
    expect(await coordinator.StopAllAgentsInRoom('host-room-5')).toBe(0);
  });

  it('behaves exactly as before for a plain Meet room (no host options)', async () => {
    const { ops, startCalls } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);
    await coordinator.StartAgentRoomSession({ AgentSessionID: 's', RoomName: 'plain-room-1', AgentName: 'Sage' });
    expect(factoryCalls[0].HostTools?.map((t) => t.Name)).toEqual(['i_am_addressed', 'yield_turn']);
    expect(factoryCalls[0].HostFraming).toBeUndefined();
    expect(startCalls[0].TranscriptSink).toBeUndefined();
    expect(startCalls[0].RecoverRealtimeSession).toBeUndefined();
    expect(startCalls[0].JoinMethod).toBe('OnDemand');
  });
});
