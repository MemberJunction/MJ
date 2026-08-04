/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks return minimal cast fixtures for the SDK/engine seams */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS, type BridgeOps } from '../livekit-agent-room-coordinator';
import { LiveKitEgressService, wsToHttpUrl, type EgressClientLike } from '../livekit-egress-service';
import { LiveKitTokenService } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

/** A bridge-ops mock that captures the StartBridgeSession params and returns a canned active session. */
function makeBridgeOps(providerFound = true) {
  const startCalls: Record<string, unknown>[] = [];
  const reconfigureCalls: Array<{ id: string }> = [];
  let seq = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops = {
    Config: vi.fn(async () => undefined),
    ProviderByDriverClass: vi.fn(() => (providerFound ? ({ ID: 'p1', DriverClass: LIVEKIT_BRIDGE_DRIVER_CLASS } as any) : undefined)),
    StartBridgeSession: vi.fn(async (params: Record<string, unknown>) => {
      startCalls.push(params);
      return { SessionBridgeID: `bridge-${++seq}` } as any;
    }),
    StopBridgeSession: vi.fn(async () => true),
    ReconfigureSessionToMeeting: vi.fn((id: string) => {
      reconfigureCalls.push({ id });
      return true;
    }),
  } satisfies BridgeOps;
  return { ops, startCalls, reconfigureCalls };
}

describe('LiveKitAgentRoomCoordinator', () => {
  let coordinator: LiveKitAgentRoomCoordinator;

  beforeEach(() => {
    coordinator = LiveKitAgentRoomCoordinator.Instance;
    coordinator.SetTokenService(new LiveKitTokenService(CONFIG));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinator.SetSessionFactory(async () => ({}) as any); // stub IRealtimeSession
  });

  // Meeting/moderator mode is opt-in via MJ_REALTIME_MODERATOR_MODE=on; restore env after each test.
  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('multi-agent room: the FIRST agent is solo 1:1, a SECOND agent joins in MEETING mode (auto-response off + addressed-only)', async () => {
    vi.stubEnv('MJ_REALTIME_MODERATOR_MODE', 'on'); // meeting mode is gated behind the moderator opt-in
    const { ops, startCalls } = makeBridgeOps(true);
    coordinator.SetBridgeOps(ops);
    const factoryCtx: Record<string, unknown>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinator.SetSessionFactory(async (ctx: any) => { factoryCtx.push(ctx); return {} as any; });

    const room = 'meeting-room-unique-1';
    // First agent → solo: model auto-responds (no meeting flag), and it answers freely (AlwaysAddressedMatcher).
    await coordinator.StartAgentRoomSession({ AgentSessionID: 'm1', RoomName: room, AgentName: 'Sage' });
    expect(startCalls[0].DisableAutoResponse).toBeUndefined();
    expect(factoryCtx[0].MeetingMode).toBeUndefined();
    // The agent-session id must reach the realtime factory so the co-agent observability run can group by it.
    expect(factoryCtx[0].AgentSessionID).toBe('m1');
    expect((startCalls[0].TurnMatcher as object).constructor.name).toBe('AlwaysAddressedMatcher');

    // Second agent into the SAME room → meeting mode: auto-response disabled + addressed-only matcher.
    await coordinator.StartAgentRoomSession({
      AgentSessionID: 'm2', RoomName: room, AgentName: 'Marketing', AgentAliases: ['Marketing Agent'],
    });
    expect(startCalls[1].DisableAutoResponse).toBe(true);
    expect(factoryCtx[1].MeetingMode).toBe(true);
    expect(factoryCtx[1].SelfNames).toEqual(['Marketing', 'Marketing Agent']);
    expect((startCalls[1].TurnMatcher as object).constructor.name).toBe('RegexAddressedMatcher');
  });

  it('re-gates the agents already in the room when it becomes multi-agent', async () => {
    vi.stubEnv('MJ_REALTIME_MODERATOR_MODE', 'on'); // meeting mode is gated behind the moderator opt-in
    const { ops, reconfigureCalls } = makeBridgeOps(true);
    coordinator.SetBridgeOps(ops);

    const room = 'regate-room-1';
    // First agent → solo: nobody to re-gate yet.
    await coordinator.StartAgentRoomSession({ AgentSessionID: 'g1', RoomName: room, AgentName: 'Sage', AgentAliases: ['Sage AI'] });
    expect(reconfigureCalls.length).toBe(0);

    // Second agent joins → the FIRST agent (bridge-1) is retroactively re-gated to meeting mode.
    await coordinator.StartAgentRoomSession({ AgentSessionID: 'g2', RoomName: room, AgentName: 'Marketing' });
    expect(reconfigureCalls.map((c) => c.id)).toContain('bridge-1');
    // The re-gate matcher carries the first agent's names (built into a RegexAddressedMatcher).
    expect(ops.ReconfigureSessionToMeeting).toHaveBeenCalledWith('bridge-1', expect.anything());
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

  // --- Output surfacing from EgressInfo.fileResults (stop/complete) -------------
  // The SDK reports size/duration as bigint and duration in NANOseconds; toRecordingInfo
  // normalizes both. These are the values a caller copies into MJStorage + the Conversation.

  /** A stop client whose stopEgress returns the given EgressInfo-shaped payload. */
  function makeStopClient(info: Record<string, unknown>): EgressClientLike {
    return {
      startRoomCompositeEgress: vi.fn(async () => ({}) as never),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stopEgress: vi.fn(async () => info as any),
      listEgress: vi.fn(async () => []),
    } satisfies EgressClientLike;
  }

  it('surfaces OutputLocation/OutputSizeBytes/OutputDurationMs (ns→ms) from fileResults[0] on stop', async () => {
    const client = makeStopClient({
      egressId: 'eg-9',
      roomName: 'room-9',
      status: 'EGRESS_COMPLETE',
      // duration is NANOseconds (90s = 90_000_000_000 ns); size is a bigint byte count.
      fileResults: [{ filename: 'room-9/2026.mp4', size: BigInt(1234567), duration: BigInt(90_000_000_000) }],
    });
    const svc = new LiveKitEgressService(CONFIG, client);
    const info = await svc.StopRecording('eg-9');

    expect(info.OutputLocation).toBe('room-9/2026.mp4');
    expect(info.OutputSizeBytes).toBe(1234567);
    expect(info.OutputDurationMs).toBe(90000); // 90_000_000_000 ns / 1_000_000 = 90_000 ms
  });

  it('rounds a sub-millisecond-precision nanosecond duration to the nearest ms', async () => {
    const client = makeStopClient({
      egressId: 'eg-r',
      roomName: 'room-r',
      status: 'EGRESS_COMPLETE',
      // 1500ms expressed in ns, plus 600000 ns (0.6ms) → rounds up to 1501.
      fileResults: [{ filename: 'f.mp4', size: BigInt(10), duration: BigInt(1_500_600_000) }],
    });
    const svc = new LiveKitEgressService(CONFIG, client);
    const info = await svc.StopRecording('eg-r');
    expect(info.OutputDurationMs).toBe(1501);
  });

  it('leaves output fields undefined while the recording is in progress (no fileResults yet)', async () => {
    const client = makeStopClient({ egressId: 'eg-2', roomName: 'room-2', status: 'EGRESS_ACTIVE' });
    const svc = new LiveKitEgressService(CONFIG, client);
    const info = await svc.StopRecording('eg-2');

    expect(info.Status).toBe('EGRESS_ACTIVE');
    expect(info.OutputLocation).toBeUndefined();
    expect(info.OutputSizeBytes).toBeUndefined();
    expect(info.OutputDurationMs).toBeUndefined();
  });

  it('tolerates a partial fileResult — only the present fields are surfaced', async () => {
    const client = makeStopClient({
      egressId: 'eg-3',
      roomName: 'room-3',
      status: 'EGRESS_COMPLETE',
      // filename present, but no size/duration reported (empty file edge / early result).
      fileResults: [{ filename: 'partial.mp4' }],
    });
    const svc = new LiveKitEgressService(CONFIG, client);
    const info = await svc.StopRecording('eg-3');

    expect(info.OutputLocation).toBe('partial.mp4');
    expect(info.OutputSizeBytes).toBeUndefined();
    expect(info.OutputDurationMs).toBeUndefined();
  });
});
