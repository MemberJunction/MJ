import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import {
  RealtimeSessionService,
  RealtimeConnectionState,
  StartRealtimeClientSessionResult
} from '../lib/services/realtime-session.service';
import { BaseRealtimeChannelClient } from '../lib/components/realtime/channels/base-realtime-channel-client';

/**
 * The MINT / RUN split of a session start (issue #3853): `StartRealtimeSession` is now
 * prologue + `mintSession` + the shared run half, and `StartRealtimeSessionFromResult` is the run
 * half on its own — for hosts that mint through their OWN server surface (per-session prompt
 * authority the stock mutation can't carry) and want MJ's overlay to run the result.
 *
 * Two things this suite must prove: the new entry point opens a real session with NO mint mutation
 * on the wire, and the all-in-one entry point is byte-for-byte the behavior it always had (the
 * refactor is invisible to its callers).
 *
 * Node preset. The run half touches three browser-only seams, all faked here the same narrow way
 * the sibling voice-session suites do: the ClassFactory-resolved provider driver (a registered
 * fake `BaseRealtimeClient`), `navigator.mediaDevices.getUserMedia` (stubbed via `vi.stubGlobal` —
 * node has no media stack), and the GraphQL provider (a fake with `ExecuteGQL` + the
 * push-status seam `subscribeDelegationProgress` needs).
 */

/** Provider key of the fake driver — never collides with a real registered provider. */
const FAKE_PROVIDER = 'test-realtime-provider';

/** A driver stand-in that records what the service connected it with. */
@RegisterClass(BaseRealtimeClient, FAKE_PROVIDER)
class FakeRealtimeDriver extends BaseRealtimeClient {
  /** Every Connect() the service made, newest last — length doubles as a "started once" assert. */
  public static Connects: ClientRealtimeSessionConfig[] = [];
  public Disconnected = false;

  public override async Connect(config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {
    FakeRealtimeDriver.Connects.push(config);
  }
  public override SendText(_text: string): void {
    /* not under test */
  }
  public override CancelActiveResponse(): void {
    /* not under test */
  }
  public override SendContextNote(_text: string): void {
    /* not under test */
  }
  public override RequestSpokenUpdate(_instructions: string): void {
    /* not under test */
  }
  public override SendToolResult(_callID: string, _outputJson: string): void {
    /* not under test */
  }
  public override SetMuted(_muted: boolean): void {
    /* not under test */
  }
  public override async Disconnect(): Promise<void> {
    this.Disconnected = true;
  }
  public override get IsBusy(): boolean {
    return false;
  }
  public override get IsAudioPlaying(): boolean {
    return false;
  }
}

/** A channel plugin stand-in, used only to prove PriorChannelStatesJson reaches RestoreState. */
class FakeSurface {}
class RestoringChannel extends BaseRealtimeChannelClient<FakeSurface> {
  public RestoredWith: string | null = null;
  public get ChannelName(): string {
    return 'Whiteboard';
  }
  public get ToolNamePrefix(): string {
    return 'Whiteboard.';
  }
  public get TabTitle(): string {
    return 'Whiteboard';
  }
  public get TabIcon(): string {
    return 'fa-solid fa-chalkboard';
  }
  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return [];
  }
  public GetSurfaceComponent(): import('@angular/core').Type<FakeSurface> {
    return FakeSurface;
  }
  public BindSurface(_instance: FakeSurface): void {
    /* no surface in node */
  }
  public ApplyAgentTool(_toolName: string, _argsJson: string): string {
    return '{}';
  }
  public override RestoreState(stateJson: string): boolean {
    this.RestoredWith = stateJson;
    return true;
  }
}

/** The private surface these tests drive — no `any`, just the members under test. */
interface RealtimeSessionInternals {
  narrationTemplate: string | null;
  sessionConversationId: string | null;
  client: BaseRealtimeClient | null;
  _activeChannels$: { next(channels: BaseRealtimeChannelClient[]): void };
}

function internals(service: RealtimeSessionService): RealtimeSessionInternals {
  return service as unknown as RealtimeSessionInternals;
}

/** A minted result carrying all ten server fields, so we can assert where each one lands. */
function mintedResult(overrides: Partial<StartRealtimeClientSessionResult> = {}): StartRealtimeClientSessionResult {
  return {
    AgentSessionId: 'host-session-1',
    ConversationId: 'conv-from-server',
    Provider: FAKE_PROVIDER,
    Model: 'gpt-realtime',
    EphemeralToken: 'ek_host_minted',
    ExpiresAt: '2026-01-01T00:00:00Z',
    SessionConfigJson: '{"instructions":"be an interviewer"}',
    ModelName: 'GPT Realtime 2',
    NarrationInstructionsTemplate: 'Say: {{ progressMessage }}',
    PriorChannelStatesJson: null,
    ...overrides
  };
}

/** The same payload shape the `StartRealtimeClientSession` mutation returns. */
const MINT_REPLY = { StartRealtimeClientSession: mintedResult({ AgentSessionId: 'minted-session-1' }) };

function latestState(service: RealtimeSessionService): RealtimeConnectionState {
  let state: RealtimeConnectionState = 'closed';
  service.ConnectionState$.subscribe(s => (state = s)).unsubscribe();
  return state;
}

/** Every mutation document `ExecuteGQL` was called with. */
function mutationsSent(executeGQL: ReturnType<typeof vi.fn>): string[] {
  return executeGQL.mock.calls.map(call => call[0] as string);
}

describe('RealtimeSessionService — mint/run split (StartRealtimeSessionFromResult)', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeRealtimeDriver.Connects = [];
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => MINT_REPLY);
    // gql() is just `this.Provider as GraphQLDataProvider`: ExecuteGQL covers the mutations and
    // sessionId/PushStatusUpdates cover the delegation-progress subscription the run half opens.
    service.Provider = {
      ExecuteGQL: executeGQL,
      sessionId: 'transport-1',
      PushStatusUpdates: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) })
    } as unknown as IMetadataProvider;
    // Node has no media stack — the run half acquires the mic before Connect().
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [] }))
      }
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
  });

  it('runs a host-minted session WITHOUT sending the StartRealtimeClientSession mutation', async () => {
    await service.StartRealtimeSessionFromResult(mintedResult(), { agentName: 'Interviewer' });

    expect(mutationsSent(executeGQL).some(m => m.includes('StartRealtimeClientSession'))).toBe(false);
    expect(service.IsActive).toBe(true);
    expect(service.CurrentAgentSessionId).toBe('host-session-1');
    expect(FakeRealtimeDriver.Connects).toHaveLength(1);
  });

  it('lands the ten result fields where the live session reads them', async () => {
    const channel = new RestoringChannel();
    internals(service)._activeChannels$.next([channel]);

    let startedWith: { sessionId: string; channelNames: string[] } | null = null;
    const sub = service.SessionStarted$.subscribe(e => (startedWith = e));
    let modelName: string | null = null;
    const modelSub = service.ModelName$.subscribe(m => (modelName = m));

    await service.StartRealtimeSessionFromResult(
      mintedResult({ PriorChannelStatesJson: JSON.stringify({ Whiteboard: '{"shapes":1}' }) }),
      { conversationId: 'conv-from-server' }
    );
    sub.unsubscribe();
    modelSub.unsubscribe();

    // AgentSessionId / ConversationId / ModelName / NarrationInstructionsTemplate
    expect(service.CurrentAgentSessionId).toBe('host-session-1');
    expect(internals(service).sessionConversationId).toBe('conv-from-server');
    expect(modelName).toBe('GPT Realtime 2');
    expect(internals(service).narrationTemplate).toBe('Say: {{ progressMessage }}');
    // PriorChannelStatesJson → the matching plugin's RestoreState
    expect(channel.RestoredWith).toBe('{"shapes":1}');
    // Provider / Model / EphemeralToken / ExpiresAt / SessionConfigJson → the driver's Connect
    const config = FakeRealtimeDriver.Connects[0];
    expect(config.Provider).toBe(FAKE_PROVIDER);
    expect(config.Model).toBe('gpt-realtime');
    expect(config.EphemeralToken).toBe('ek_host_minted');
    expect(config.ExpiresAt).toBe('2026-01-01T00:00:00Z');
    expect(config.SessionConfig).toEqual({ instructions: 'be an interviewer' });
    // The session-started event fires after Connect, carrying the live channel names
    expect(startedWith).toEqual({ sessionId: 'host-session-1', channelNames: ['Whiteboard'] });
    expect(latestState(service)).toBe('connecting'); // 'listening' awaits the driver's state event
  });

  it('surfaces the agent name and app context the host supplied', async () => {
    let agentName = '';
    const sub = service.AgentName$.subscribe(n => (agentName = n));
    await service.StartRealtimeSessionFromResult(mintedResult(), {
      agentName: 'Interviewer',
      appContext: {
        App: { Name: 'Caliber', Description: '' },
        ActiveNavItem: { Name: 'Engagements' },
        OtherNavItems: [],
        User: { Name: 'Madhav', Roles: [] }
      }
    });
    sub.unsubscribe();

    expect(agentName).toBe('Interviewer');
    let contextAppName: string | null = null;
    service.AppContext$.subscribe(c => (contextAppName = c?.App.Name ?? null)).unsubscribe();
    expect(contextAppName).toBe('Caliber');
  });

  it('treats a result ConversationId as SERVER-CREATED only when the host asked for none', async () => {
    await service.StartRealtimeSessionFromResult(mintedResult({ ConversationId: 'conv-new' }));
    expect(service.SessionCreatedConversationId).toBe('conv-new');
  });

  it('does NOT report a created conversation when the host minted against an existing one', async () => {
    await service.StartRealtimeSessionFromResult(mintedResult({ ConversationId: 'conv-existing' }), {
      conversationId: 'conv-existing'
    });
    expect(service.SessionCreatedConversationId).toBeNull();
    expect(internals(service).sessionConversationId).toBe('conv-existing');
  });

  it('ignores a duplicate start while a session is already running (the IsActive guard)', async () => {
    await service.StartRealtimeSessionFromResult(mintedResult());
    await service.StartRealtimeSessionFromResult(mintedResult({ AgentSessionId: 'host-session-2' }));

    expect(FakeRealtimeDriver.Connects).toHaveLength(1);
    expect(service.CurrentAgentSessionId).toBe('host-session-1');
  });

  it('lands a run-half failure in the error state and tears the session back down', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // An unregistered provider makes createRealtimeClient throw — the first run-half step to fail.
    await service.StartRealtimeSessionFromResult(mintedResult({ Provider: 'no-such-provider' }));

    expect(latestState(service)).toBe('error');
    expect(service.IsActive).toBe(false);
    expect(logged).toHaveBeenCalled(); // never swallowed
    expect(FakeRealtimeDriver.Connects).toHaveLength(0);
  });
});

describe('RealtimeSessionService — StartRealtimeSession after the mint/run split (regression guard)', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeRealtimeDriver.Connects = [];
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => MINT_REPLY);
    service.Provider = {
      ExecuteGQL: executeGQL,
      sessionId: 'transport-1',
      PushStatusUpdates: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) })
    } as unknown as IMetadataProvider;
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [] }))
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still mints over GraphQL and runs the minted session end to end', async () => {
    const states: RealtimeConnectionState[] = [];
    const stateSub = service.ConnectionState$.subscribe(s => states.push(s));

    await service.StartRealtimeSession('agent-1', null, 'prior-session', 'Sage', 'model-9');
    stateSub.unsubscribe();

    const mint = executeGQL.mock.calls.find(call => (call[0] as string).includes('StartRealtimeClientSession'));
    expect(mint).toBeDefined();
    const variables = mint?.[1] as Record<string, unknown>;
    expect(variables['targetAgentId']).toBe('agent-1');
    expect(variables['lastSessionId']).toBe('prior-session');
    expect(variables['preferredModelId']).toBe('model-9');
    expect(variables['recordingConsent']).toBe(false); // no persisted consent in the test env

    expect(service.IsActive).toBe(true);
    expect(service.CurrentAgentSessionId).toBe('minted-session-1');
    expect(service.SessionCreatedConversationId).toBe('conv-from-server'); // started without one
    expect(FakeRealtimeDriver.Connects[0].EphemeralToken).toBe('ek_host_minted');
    expect(states).toEqual(['closed', 'connecting']); // same order, no extra emissions
  });

  it('goes live BEFORE the mint resolves, so a second start during minting is suppressed', async () => {
    let releaseMint: (value: typeof MINT_REPLY) => void = () => undefined;
    executeGQL.mockImplementationOnce(
      () => new Promise<typeof MINT_REPLY>(resolve => (releaseMint = resolve))
    );

    const started = service.StartRealtimeSession('agent-1');
    // Mint in flight: the guard must already be armed and the overlay already 'connecting'.
    expect(service.IsActive).toBe(true);
    expect(latestState(service)).toBe('connecting');

    // The mint lands one tick later (startChannels runs first) — wait for it to be in flight.
    await vi.waitFor(() => expect(executeGQL).toHaveBeenCalled());
    await service.StartRealtimeSession('agent-2'); // duplicate — must be a no-op
    releaseMint(MINT_REPLY);
    await started;

    const mints = mutationsSent(executeGQL).filter(m => m.includes('StartRealtimeClientSession'));
    expect(mints).toHaveLength(1);
    expect(FakeRealtimeDriver.Connects).toHaveLength(1);
  });

  it('still lands a MINT failure in the error state (never a half-open session)', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    executeGQL.mockImplementationOnce(async () => ({ StartRealtimeClientSession: null }));

    await service.StartRealtimeSession('agent-1');

    expect(latestState(service)).toBe('error');
    expect(service.IsActive).toBe(false);
    expect(service.CurrentAgentSessionId).toBeNull();
    expect(FakeRealtimeDriver.Connects).toHaveLength(0);
    expect(logged).toHaveBeenCalled();
  });

  it('respects an explicit recordingConsent=false without touching the persisted preference', async () => {
    await service.StartRealtimeSession('agent-1', 'conv-1', null, null, null, null, null, null, false);

    const mint = executeGQL.mock.calls.find(call => (call[0] as string).includes('StartRealtimeClientSession'));
    const variables = mint?.[1] as Record<string, unknown>;
    expect(variables['recordingConsent']).toBe(false);
    expect(variables['recordingStartedAt']).toBeNull();
    expect(service.SessionCreatedConversationId).toBeNull(); // joined an existing conversation
  });
});
