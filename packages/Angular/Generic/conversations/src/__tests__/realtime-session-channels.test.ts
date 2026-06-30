import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { RegisterClass } from '@memberjunction/global';
import { RealtimeToolDefinition } from '@memberjunction/ai';
import { RealtimeSessionService, RealtimeChannelFocusEvent } from '../lib/services/realtime-session.service';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../lib/components/realtime/channels/base-realtime-channel-client';

/**
 * INTERACTIVE-CHANNEL plumbing in the session service — the registry-driven plugin path:
 * `MJ: AI Agent Channels` rows → ClassFactory resolution by ClientPluginClass → per-session
 * plugin instances → tool aggregation + prefix-handler registration → debounced channel
 * saves → teardown flush + dispose. The service is channel-agnostic throughout; these tests
 * drive it with a FAKE channel plugin registered the same way real ones are.
 */

/** The private surface the tests drive — no `any`, just the members under test. */
interface RealtimeSessionChannelInternals {
  client: FakeRealtimeClient | null;
  agentSessionId: string | null;
  startChannels(): Promise<RealtimeToolDefinition[]>;
  handleToolCall(call: { CallID: string; ToolName: string; ArgumentsJson: string }): Promise<void>;
  teardown(closeServerSession: boolean): Promise<void>;
}

class FakeRealtimeClient {
  public ToolResults: Array<{ CallID: string; ResultJson: string }> = [];
  public SendToolResult(callId: string, resultJson: string): void {
    this.ToolResults.push({ CallID: callId, ResultJson: resultJson });
  }
  public SendContextNote(_text: string): void {
    // not under test here
  }
  public async Disconnect(): Promise<void> {
    // no-op for teardown
  }
}

function internals(service: RealtimeSessionService): RealtimeSessionChannelInternals {
  return service as unknown as RealtimeSessionChannelInternals;
}

/** A minimal surface stand-in (never instantiated by these node tests). */
class FakeSurface {}

/**
 * A fake interactive-channel plugin, registered exactly like production plugins
 * (`@RegisterClass(BaseRealtimeChannelClient, '<ClientPluginClass>')`).
 */
@RegisterClass(BaseRealtimeChannelClient, 'TestEchoChannel')
class TestEchoChannel extends BaseRealtimeChannelClient<FakeSurface> {
  public AppliedCalls: Array<{ ToolName: string; ArgsJson: string }> = [];
  public Disposed = false;
  public BoundSurface: FakeSurface | null = null;

  public get ChannelName(): string {
    return 'Echo';
  }
  public get ToolNamePrefix(): string {
    return 'Echo.';
  }
  public get TabTitle(): string {
    return 'Echo';
  }
  public get TabIcon(): string {
    return 'fa-solid fa-microphone';
  }
  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return [
      { Name: 'Echo.Say', Description: 'Echo a phrase', ParametersSchema: { type: 'object' } },
      { Name: 'Echo.Clear', Description: 'Clear echoes', ParametersSchema: { type: 'object' } }
    ];
  }
  public GetSurfaceComponent(): import('@angular/core').Type<FakeSurface> {
    return FakeSurface;
  }
  public BindSurface(instance: FakeSurface): void {
    this.BoundSurface = instance;
  }
  public ApplyAgentTool(toolName: string, argsJson: string): string {
    this.AppliedCalls.push({ ToolName: toolName, ArgsJson: argsJson });
    return JSON.stringify({ success: true, echoed: toolName });
  }
  public override Dispose(): void {
    this.Disposed = true;
    super.Dispose();
  }

  /** Test seam: expose the host context the service handed us. */
  public get Ctx(): RealtimeChannelContext | null {
    return this.Context;
  }
}

/**
 * Stubs the provider-scoped AIEngineBase whose cached `AgentChannels` the service reads
 * (rows default to ACTIVE; pass `IsActive: false` to exercise the active-only filter).
 * `success = false` makes the engine load reject — the registry-failure degradation path.
 */
function mockChannelRegistry(
  rows: Array<{ ID: string; Name: string; ClientPluginClass: string; IsActive?: boolean }>,
  success = true
): ReturnType<typeof vi.fn> {
  const configFn = vi.fn(async () => {
    if (!success) {
      throw new Error('boom');
    }
  });
  const fakeEngine = {
    Config: configFn,
    get AgentChannels() {
      return rows.map(r => ({ IsActive: true, ...r }));
    }
  };
  vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue(fakeEngine as unknown as AIEngineBase);
  return configFn;
}

describe('RealtimeSessionService — interactive-channel registry resolution', () => {
  let service: RealtimeSessionService;

  beforeEach(() => {
    service = new RealtimeSessionService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves ACTIVE registry rows into per-session plugin instances via the ClassFactory', async () => {
    const configFn = mockChannelRegistry([
      { ID: 'c1', Name: 'Echo', ClientPluginClass: 'TestEchoChannel' },
      // Inactive rows never become session plugins (parity with the old `IsActive = 1` filter).
      { ID: 'c2', Name: 'Dormant', ClientPluginClass: 'TestEchoChannel', IsActive: false }
    ]);

    await internals(service).startChannels();

    // Lazily configures the provider-scoped engine before reading the cached registry.
    expect(configFn).toHaveBeenCalledWith(false, undefined, service.Provider);
    expect(service.ActiveChannels).toHaveLength(1);
    expect(service.ActiveChannels[0]).toBeInstanceOf(TestEchoChannel);
  });

  it('creates a FRESH instance per session (plugins are not singletons)', async () => {
    mockChannelRegistry([{ ID: 'c1', Name: 'Echo', ClientPluginClass: 'TestEchoChannel' }]);
    await internals(service).startChannels();
    const first = service.ActiveChannels[0];

    await internals(service).startChannels();
    expect(service.ActiveChannels[0]).not.toBe(first);
  });

  it('skips rows whose ClientPluginClass has no registration (logged, never fatal)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockChannelRegistry([
      { ID: 'c1', Name: 'Ghost', ClientPluginClass: 'NoSuchChannelPlugin' },
      { ID: 'c2', Name: 'Echo', ClientPluginClass: 'TestEchoChannel' }
    ]);

    await internals(service).startChannels();

    expect(service.ActiveChannels).toHaveLength(1);
    expect(service.ActiveChannels[0]).toBeInstanceOf(TestEchoChannel);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No client plugin registered for channel 'Ghost'"));
  });

  it('degrades to NO channels when the registry load fails (the voice session must proceed)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockChannelRegistry([], false);

    const tools = await internals(service).startChannels();

    expect(tools).toEqual([]);
    expect(service.ActiveChannels).toEqual([]);
  });

  it('degrades to NO channels when the engine acquisition throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(AIEngineBase, 'GetProviderInstance').mockImplementation(() => {
      throw new Error('no provider');
    });

    const tools = await internals(service).startChannels();

    expect(tools).toEqual([]);
    expect(service.ActiveChannels).toEqual([]);
  });

  it('aggregates every plugin tool definition into the clientTools set for the mint', async () => {
    mockChannelRegistry([{ ID: 'c1', Name: 'Echo', ClientPluginClass: 'TestEchoChannel' }]);

    const tools = await internals(service).startChannels();

    expect(tools.map(t => t.Name)).toEqual(['Echo.Say', 'Echo.Clear']);
  });

  it('emits the resolved plugins on ActiveChannels$ (the overlay registers tabs from it)', async () => {
    mockChannelRegistry([{ ID: 'c1', Name: 'Echo', ClientPluginClass: 'TestEchoChannel' }]);
    const emissions: number[] = [];
    const sub = service.ActiveChannels$.subscribe(channels => emissions.push(channels.length));

    await internals(service).startChannels();

    sub.unsubscribe();
    expect(emissions).toEqual([0, 1]); // BehaviorSubject replay, then the resolved set
  });
});

describe('RealtimeSessionService — per-plugin tool routing + host context', () => {
  let service: RealtimeSessionService;
  let fakeClient: FakeRealtimeClient;
  let plugin: TestEchoChannel;

  beforeEach(async () => {
    service = new RealtimeSessionService();
    fakeClient = new FakeRealtimeClient();
    internals(service).client = fakeClient;
    mockChannelRegistry([{ ID: 'c1', Name: 'Echo', ClientPluginClass: 'TestEchoChannel' }]);
    await internals(service).startChannels();
    plugin = service.ActiveChannels[0] as TestEchoChannel;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes prefix-matched tool calls to the plugin and feeds its result back to the model', async () => {
    await internals(service).handleToolCall({ CallID: 'call-1', ToolName: 'Echo.Say', ArgumentsJson: '{"phrase":"hi"}' });

    expect(plugin.AppliedCalls).toEqual([{ ToolName: 'Echo.Say', ArgsJson: '{"phrase":"hi"}' }]);
    expect(fakeClient.ToolResults).toEqual([
      { CallID: 'call-1', ResultJson: JSON.stringify({ success: true, echoed: 'Echo.Say' }) }
    ]);
  });

  it('marks a channel USED on its first tool call (the overlay tabs it on first use)', async () => {
    expect(service.HasChannelBeenUsed('Echo')).toBe(false);
    expect([...service.UsedChannelNames]).toEqual([]);

    await internals(service).handleToolCall({ CallID: 'call-1', ToolName: 'Echo.Say', ArgumentsJson: '{}' });

    expect(service.HasChannelBeenUsed('Echo')).toBe(true);
    expect([...service.UsedChannelNames]).toEqual(['Echo']);
  });

  it('UsedChannelNames is a snapshot — mutating it does not affect the service', async () => {
    await internals(service).handleToolCall({ CallID: 'call-1', ToolName: 'Echo.Say', ArgumentsJson: '{}' });
    const snapshot = service.UsedChannelNames as Set<string>;
    snapshot.delete('Echo');
    expect(service.HasChannelBeenUsed('Echo')).toBe(true);
  });

  it('hands each plugin a context whose AgentName matches the session agent', () => {
    expect(plugin.Ctx?.AgentName).toBe(service.CurrentAgentName);
  });

  it('SetFocusMode rides ChannelFocus$ tagged with the requesting plugin', () => {
    const events: RealtimeChannelFocusEvent[] = [];
    const sub = service.ChannelFocus$.subscribe(e => events.push(e));

    plugin.Ctx?.SetFocusMode(true);
    plugin.Ctx?.SetFocusMode(false);

    sub.unsubscribe();
    expect(events).toEqual([
      { Channel: plugin, Focused: true },
      { Channel: plugin, Focused: false }
    ]);
  });
});

describe('RealtimeSessionService — debounced channel saves + teardown flush/dispose', () => {
  let service: RealtimeSessionService;
  let plugin: TestEchoChannel;
  let saveSpy: MockInstance<RealtimeSessionService['SaveChannelState']>;

  beforeEach(async () => {
    vi.useFakeTimers();
    service = new RealtimeSessionService();
    internals(service).agentSessionId = 'session-123';
    saveSpy = vi.spyOn(service, 'SaveChannelState').mockResolvedValue(true);
    mockChannelRegistry([{ ID: 'c1', Name: 'Echo', ClientPluginClass: 'TestEchoChannel' }]);
    await internals(service).startChannels();
    plugin = service.ActiveChannels[0] as TestEchoChannel;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces RequestSave: a change burst becomes ONE save with the LATEST state', () => {
    plugin.Ctx?.RequestSave('{"v":1}');
    plugin.Ctx?.RequestSave('{"v":2}');
    plugin.Ctx?.RequestSave('{"v":3}');
    expect(saveSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith('Echo', '{"v":3}', 'session-123');
  });

  it('teardown FLUSHES a pending save immediately (captured session id) and disposes plugins', async () => {
    plugin.Ctx?.RequestSave('{"final":true}');

    await internals(service).teardown(false);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith('Echo', '{"final":true}', 'session-123');
    expect(plugin.Disposed).toBe(true);
    expect(service.ActiveChannels).toEqual([]);
  });

  it('teardown with nothing pending saves nothing but still disposes', async () => {
    await internals(service).teardown(false);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(plugin.Disposed).toBe(true);
  });

  it('a Dispose error in one plugin is contained (teardown completes)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(plugin, 'Dispose').mockImplementation(() => {
      throw new Error('plugin exploded');
    });

    await internals(service).teardown(false);

    expect(service.ActiveChannels).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Channel 'Echo' Dispose failed"), expect.any(Error));
  });
});
