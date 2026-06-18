/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks return minimal cast fixtures for the SDK/engine seams */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS, type BridgeOps } from '../livekit-agent-room-coordinator';
import { LiveKitEgressService, wsToHttpUrl, type EgressClientLike } from '../livekit-egress-service';
import { LiveKitTokenService } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

/** A bridge-ops mock that captures the StartBridgeSession params and returns a canned active session. */
function makeBridgeOps(providerFound = true) {
  const startCalls: Record<string, unknown>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops = {
    Config: vi.fn(async () => undefined),
    ProviderByDriverClass: vi.fn(() => (providerFound ? ({ ID: 'p1', DriverClass: LIVEKIT_BRIDGE_DRIVER_CLASS } as any) : undefined)),
    StartBridgeSession: vi.fn(async (params: Record<string, unknown>) => {
      startCalls.push(params);
      return { SessionBridgeID: 'bridge-1' } as any;
    }),
    StopBridgeSession: vi.fn(async () => true),
  } satisfies BridgeOps;
  return { ops, startCalls };
}

describe('LiveKitAgentRoomCoordinator', () => {
  let coordinator: LiveKitAgentRoomCoordinator;

  beforeEach(() => {
    coordinator = LiveKitAgentRoomCoordinator.Instance;
    coordinator.SetTokenService(new LiveKitTokenService(CONFIG));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinator.SetSessionFactory(async () => ({}) as any); // stub IRealtimeSession
  });

  it('is a process-wide singleton exposing the LiveKit driver key', () => {
    expect(LiveKitAgentRoomCoordinator.Instance).toBe(LiveKitAgentRoomCoordinator.Instance);
    expect(LIVEKIT_BRIDGE_DRIVER_CLASS).toBe('LiveKitBridge');
  });

  it('mints a bot token and bridges the session with the right transport config', async () => {
    const { ops, startCalls } = makeBridgeOps(true);
    coordinator.SetBridgeOps(ops);

    const result = await coordinator.StartAgentRoomSession({ AgentSessionID: 's1', RoomName: 'room-1', AgentName: 'Sage' });

    expect(result.SessionBridgeID).toBe('bridge-1');
    expect(result.RoomName).toBe('room-1');
    expect(result.ServerUrl).toBe(CONFIG.ServerUrl);
    expect(ops.Config).toHaveBeenCalledOnce();

    const params = startCalls[0];
    expect(params.AgentSessionID).toBe('s1');
    expect(params.Address).toBe(CONFIG.ServerUrl);
    expect(params.TurnMode).toBe('Passive'); // default
    expect(params.TurnMatcher).toBeDefined();
    const config = params.Configuration as { AccessToken: string; BotDisplayName: string; RoomName: string; NativeModuleSpecifier: string };
    expect(config.BotDisplayName).toBe('Sage');
    expect(config.RoomName).toBe('room-1');
    expect(config.AccessToken.split('.')).toHaveLength(3); // a signed JWT
    // The native room-client module the bridge will load — defaults to the @livekit/rtc-node wrapper.
    expect(config.NativeModuleSpecifier).toBe('@memberjunction/ai-bridge-livekit-native');
  });

  it('honors a SetNativeModuleSpecifier override for the native room-client module', async () => {
    const { ops, startCalls } = makeBridgeOps(true);
    coordinator.SetBridgeOps(ops);
    coordinator.SetNativeModuleSpecifier('@acme/livekit-gemini-16k');

    await coordinator.StartAgentRoomSession({ AgentSessionID: 's3', RoomName: 'room-3', AgentName: 'Sage' });

    const config = startCalls[0].Configuration as { NativeModuleSpecifier: string };
    expect(config.NativeModuleSpecifier).toBe('@acme/livekit-gemini-16k');
    coordinator.SetNativeModuleSpecifier(undefined); // restore default for other tests
  });

  it('throws a clear error when no LiveKit provider row is active', async () => {
    const { ops } = makeBridgeOps(false);
    coordinator.SetBridgeOps(ops);
    await expect(coordinator.StartAgentRoomSession({ AgentSessionID: 's2', RoomName: 'r2' })).rejects.toThrow(/LiveKitBridge/);
  });

  it('delegates StopAgentRoomSession to the bridge ops', async () => {
    const { ops } = makeBridgeOps(true);
    coordinator.SetBridgeOps(ops);
    const ok = await coordinator.StopAgentRoomSession('bridge-1');
    expect(ok).toBe(true);
    expect(ops.StopBridgeSession).toHaveBeenCalledWith('bridge-1', 'Explicit', undefined, undefined);
  });
});

describe('wsToHttpUrl', () => {
  it('maps wss → https and ws → http', () => {
    expect(wsToHttpUrl('wss://x.livekit.cloud')).toBe('https://x.livekit.cloud');
    expect(wsToHttpUrl('ws://localhost:7880')).toBe('http://localhost:7880');
  });
});

describe('LiveKitEgressService', () => {
  function makeClient(): { client: EgressClientLike; calls: { method: string; args: unknown[] }[] } {
    const calls: { method: string; args: unknown[] }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = {
      startRoomCompositeEgress: vi.fn(async (...args: unknown[]) => {
        calls.push({ method: 'start', args });
        return { egressId: 'eg-1', roomName: 'room-1', status: 'EGRESS_ACTIVE' } as any;
      }),
      stopEgress: vi.fn(async (...args: unknown[]) => {
        calls.push({ method: 'stop', args });
        return { egressId: 'eg-1', roomName: 'room-1', status: 'EGRESS_COMPLETE' } as any;
      }),
      listEgress: vi.fn(async () => [{ egressId: 'eg-1', roomName: 'room-1', status: 'EGRESS_ACTIVE' } as any]),
    } satisfies EgressClientLike;
    return { client, calls };
  }

  it('starts a composite recording and maps the egress info', async () => {
    const { client, calls } = makeClient();
    const svc = new LiveKitEgressService(CONFIG, client);
    const info = await svc.StartRoomRecording({ RoomName: 'room-1', Layout: 'grid' });
    expect(info.EgressID).toBe('eg-1');
    expect(info.Status).toBe('EGRESS_ACTIVE');
    expect(calls[0].args[0]).toBe('room-1');
    expect(calls[0].args[2]).toEqual({ layout: 'grid' });
  });

  it('stops a recording and maps the egress info', async () => {
    const { client } = makeClient();
    const svc = new LiveKitEgressService(CONFIG, client);
    const info = await svc.StopRecording('eg-1');
    expect(info.Status).toBe('EGRESS_COMPLETE');
  });

  it('lists active recordings', async () => {
    const { client } = makeClient();
    const svc = new LiveKitEgressService(CONFIG, client);
    const list = await svc.ListActiveRecordings('room-1');
    expect(list).toHaveLength(1);
    expect(list[0].EgressID).toBe('eg-1');
  });
});
