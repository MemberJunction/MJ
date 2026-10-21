import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MJAIBridgeProviderEntity, MJAIModelEntity, MJAIModelVendorEntity } from '@memberjunction/core-entities';
import type { ActiveBridgeSession, StartBridgeSessionParams, RoomTurnSnapshot } from '@memberjunction/ai-bridge-server';
import type { IRealtimeSession } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS, type BridgeOps, type RealtimeSessionStartContext } from '../livekit-agent-room-coordinator';
import { LiveKitTokenService } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

function createStubSession(): IRealtimeSession {
  return {
    SendInput: () => {},
    RegisterTools: async () => {},
    OnOutput: () => {},
    OnTranscript: () => {},
    OnToolCall: () => {},
    SendToolResult: async () => {},
    OnInterruption: () => {},
    OnError: () => {},
    OnUsage: () => {},
    Close: async () => {},
  };
}

/** A bridge-ops mock whose started session optionally carries the engine's turn-taking tool handler. */
function makeBridgeOps(handler?: { Handles: (n: string) => boolean; Execute: (c: { ToolName: string; Arguments: string }) => Promise<string> }) {
  const startCalls: StartBridgeSessionParams[] = [];
  let seq = 0;
  const ops = {
    Config: vi.fn(async () => undefined),
    ProviderByDriverClass: vi.fn(() => ({ ID: 'p1', DriverClass: LIVEKIT_BRIDGE_DRIVER_CLASS } as unknown as MJAIBridgeProviderEntity)),
    StartBridgeSession: vi.fn(async (params: StartBridgeSessionParams) => {
      startCalls.push(params);
      return { SessionBridgeID: `bridge-${++seq}`, TurnTakingToolHandler: handler } as unknown as ActiveBridgeSession;
    }),
    StopBridgeSession: vi.fn(async () => true),
    ReconfigureSessionToMeeting: vi.fn(() => true),
  } satisfies BridgeOps;
  return { ops, startCalls };
}

describe('LiveKitAgentRoomCoordinator — full-duplex turn-taking wiring', () => {
  let coordinator: LiveKitAgentRoomCoordinator;
  const factoryContexts: RealtimeSessionStartContext[] = [];
  const session: IRealtimeSession = createStubSession();

  beforeEach(() => {
    factoryContexts.length = 0;
    coordinator = LiveKitAgentRoomCoordinator.Instance;
    coordinator.SetTokenService(new LiveKitTokenService(CONFIG));
    coordinator.SetSessionFactory(async (ctx) => {
      factoryContexts.push(ctx);
      return session;
    });
    coordinator.SetTurnToolBinder(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('defaults the agent to auto addressing and hands its model the turn-taking tools at connect', async () => {
    const { ops, startCalls } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);

    await coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-1', RoomName: 'tt-room-1', AgentName: 'Sage' });

    expect(startCalls[0].TurnAddressing).toBe('Auto');
    expect(factoryContexts[0].HostTools?.map(t => t.Name)).toEqual(['i_am_addressed', 'yield_turn']);
  });

  it('withholds turn-taking tools when FullDuplex is true', async () => {
    const { ops } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);

    await coordinator.StartAgentRoomSession({
      AgentSessionID: 'tt-fd',
      RoomName: 'tt-room-fd',
      AgentName: 'Sage',
      FullDuplex: true,
    });

    expect(factoryContexts[0].HostTools).toBeUndefined();
  });

  it('withholds turn tools, sets FullDuplex true, and skips binder when model has no explicit FullDuplex metadata but vendor has GPT-Live driver', async () => {
    const handler = { Handles: () => true, Execute: async () => '{}' };
    const { ops, startCalls } = makeBridgeOps(handler);
    coordinator.SetBridgeOps(ops);
    const binder = vi.fn();
    coordinator.SetTurnToolBinder(binder);

    const mockModel = {
      ID: 'gpt-live-model-1',
      Name: 'GPT-Live 1',
      AIModelType: 'Realtime',
      IsActive: true,
      PowerRank: 100,
      ModelConfigurationObject: null,
    } as unknown as MJAIModelEntity;

    const mockVendor = {
      ID: 'mv-1',
      ModelID: 'gpt-live-model-1',
      DriverClass: 'OpenAILiveRealtime',
      Status: 'Active',
      Priority: 10,
    } as unknown as MJAIModelVendorEntity;

    vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([mockModel]);
    vi.spyOn(AIEngine.Instance, 'ModelVendors', 'get').mockReturnValue([mockVendor]);
    vi.spyOn(AIEngine.Instance, 'GetEffectiveModelConfiguration').mockReturnValue(null);

    await coordinator.StartAgentRoomSession({
      AgentSessionID: 'tt-gpt-live',
      RoomName: 'tt-room-gpt-live',
      AgentName: 'Sage',
      RealtimeModelID: 'gpt-live-model-1',
    });

    // 1. Turn tools are withheld from session factory HostTools
    expect(factoryContexts[0].HostTools).toBeUndefined();
    // 2. FullDuplex is passed as true to StartBridgeSession
    expect(startCalls[0].FullDuplex).toBe(true);
    // 3. Tool binder is NOT called for full-duplex session
    expect(binder).not.toHaveBeenCalled();
  });

  it('post-open full-duplex discovery re-registers tools without turn tools and binds a no-op turn handler', async () => {
    const registerTools = vi.fn(async () => {});
    const discoveredFdSession: IRealtimeSession = {
      ...createStubSession(),
      RegisterTools: registerTools,
      Capabilities: { FullDuplex: true },
    };
    coordinator.SetSessionFactory(async (ctx) => {
      factoryContexts.push(ctx);
      return discoveredFdSession;
    });
    const { ops } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);
    const binder = vi.fn();
    coordinator.SetTurnToolBinder(binder);

    // No FullDuplex param and no model id: full-duplex is only discoverable after the session opens.
    await coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-post-open', RoomName: 'tt-room-post-open', AgentName: 'Sage' });

    expect(factoryContexts[0].HostTools?.map(t => t.Name)).toEqual(['i_am_addressed', 'yield_turn']);
    expect(registerTools).toHaveBeenCalledTimes(1);
    expect(registerTools).toHaveBeenCalledWith([]);
    expect(binder).toHaveBeenCalledTimes(1);
    const bound = binder.mock.calls[0][1] as { Handles(name: string): boolean; Execute(call: { ToolName: string; Arguments: string }): Promise<string> };
    expect(bound.Handles('yield_turn')).toBe(true);
    expect(bound.Handles('some_other_tool')).toBe(false);
    const result = JSON.parse(await bound.Execute({ ToolName: 'yield_turn', Arguments: '{}' })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('full-duplex');
  });

  it('passes an explicit addressing mode through, and withholds the tools when name matching is forced', async () => {
    const { ops, startCalls } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);

    await coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-2', RoomName: 'tt-room-2', AgentName: 'Sage', TurnAddressing: 'Regex' });
    await coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-3', RoomName: 'tt-room-3', AgentName: 'Sage', TurnAddressing: 'ModelSide' });

    expect(startCalls[0].TurnAddressing).toBe('Regex');
    expect(factoryContexts[0].HostTools).toBeUndefined();
    expect(startCalls[1].TurnAddressing).toBe('ModelSide');
    expect(factoryContexts[1].HostTools).toHaveLength(2);
  });

  it('forces name matching, with no turn tools, for an agent joining a moderated meeting', async () => {
    vi.stubEnv('MJ_REALTIME_MODERATOR_MODE', 'on');
    const { ops, startCalls } = makeBridgeOps();
    coordinator.SetBridgeOps(ops);

    await coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-4', RoomName: 'tt-room-4', AgentName: 'Sage' });
    await coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-5', RoomName: 'tt-room-4', AgentName: 'Demo', TurnAddressing: 'ModelSide' });

    expect(startCalls[1].TurnAddressing).toBe('Regex');
    expect(factoryContexts[1].HostTools).toBeUndefined();
    expect(factoryContexts[1].MeetingMode).toBe(true);
  });

  it('binds the engine\'s tool handler to the model session through the injected binder', async () => {
    const handler = { Handles: () => true, Execute: async () => '{}' };
    const { ops } = makeBridgeOps(handler);
    coordinator.SetBridgeOps(ops);
    const binder = vi.fn();
    coordinator.SetTurnToolBinder(binder);

    await coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-6', RoomName: 'tt-room-6', AgentName: 'Sage' });

    expect(binder).toHaveBeenCalledWith(session, handler);
  });

  it('does not bind anything for a session that has no handler (a turn-based model)', async () => {
    const { ops } = makeBridgeOps(undefined);
    coordinator.SetBridgeOps(ops);
    const binder = vi.fn();
    coordinator.SetTurnToolBinder(binder);

    await coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-7', RoomName: 'tt-room-7', AgentName: 'Sage' });

    expect(binder).not.toHaveBeenCalled();
  });

  it('serves a room\'s turn-taking snapshot from the injected source, trimming the room name, and null for an empty room', () => {
    const snapshot: RoomTurnSnapshot = {
      RoomId: 'tt-room-9',
      Agents: [],
      AgentSessionIds: [],
      FacilitatorAgentSessionId: null,
      FloorHolderAgentSessionId: null,
      FloorHeldSinceMs: null,
      HumanSpeaking: false,
      PendingHandoffToAgentSessionId: null,
      ConsecutiveAgentTurns: 0,
    };
    const source = vi.fn((roomKey: string) => (roomKey === 'tt-room-9' ? snapshot : null));
    coordinator.SetTurnStateSource(source);

    expect(coordinator.GetRoomTurnState('  tt-room-9 ')).toBe(snapshot);
    expect(source).toHaveBeenCalledWith('tt-room-9');
    expect(coordinator.GetRoomTurnState('empty-room')).toBeNull();
  });

  it('still starts the agent when a handler exists but no binder was set (the floor gate keeps protecting the room)', async () => {
    const { ops } = makeBridgeOps({ Handles: () => true, Execute: async () => '{}' });
    coordinator.SetBridgeOps(ops);

    await expect(coordinator.StartAgentRoomSession({ AgentSessionID: 'tt-8', RoomName: 'tt-room-8', AgentName: 'Sage' })).resolves.toMatchObject({
      RoomName: 'tt-room-8',
    });
  });
});
