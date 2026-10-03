/**
 * Shared fakes for the widget's tests: a fake realtime driver, a GraphQL-shaped provider that answers the
 * mint and serves the event subscription, in-memory storage, and a controller wired from them. The runtime
 * under test is the REAL `RealtimeSessionRuntime` — only the network, the microphone and the driver are fake.
 */
import { Subject, type Observable } from 'rxjs';
import { vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import { SerializeRealtimeSessionEvent } from '@memberjunction/ai-core-plus';
import { BaseRealtimeChannelClient, RealtimeSessionRuntime, type IRealtimeMediaHost, type StartRealtimeClientSessionResult } from '@memberjunction/realtime-runtime';
import { WidgetController, type WidgetControllerDeps, type WidgetGuestSessionSource } from '../lib/session/widget-controller';
import { WidgetAuthAdapter, type AuthProviderPort, type HttpPostPort } from '../lib/auth/widget-auth.adapter';
import type { WidgetGuestSession } from '../lib/auth/widget-key-client';
import { WidgetPageClose } from '../lib/lifecycle/widget-page-close';
import { WidgetResumeStore, type StorageLike } from '../lib/resume/widget-resume-store';
import { DefaultWidgetConfig } from '../lib/config';
import type { WidgetConfig, WidgetOutboundEvent } from '../lib/types';

export const SESSION_ID = 'session-1';

/** A realtime driver that connects instantly and records what it was told. */
@RegisterClass(BaseRealtimeClient, 'widget-fake-provider')
export class WidgetFakeClient extends BaseRealtimeClient {
  public static Notes: string[] = [];
  public static Spoken: string[] = [];
  public static Instance: WidgetFakeClient | null = null;
  /** Set to make `Connect` fail (a provider that cannot start). */
  public static ConnectError: Error | null = null;
  public async Connect(): Promise<void> {
    WidgetFakeClient.Instance = this;
    if (WidgetFakeClient.ConnectError) {
      throw WidgetFakeClient.ConnectError;
    }
    this.emitStateChange('listening');
  }
  public Drop(): void {
    this.emitStateChange('error');
  }
  public SendText(): void {}
  public CancelActiveResponse(): void {}
  public SendContextNote(text: string): void {
    WidgetFakeClient.Notes.push(text);
  }
  public RequestSpokenUpdate(text: string): void {
    WidgetFakeClient.Spoken.push(text);
  }
  public SendToolResult(): void {}
  public SetMuted(): void {}
  public async Disconnect(): Promise<void> {}
  public get IsBusy(): boolean {
    return false;
  }
  public get IsAudioPlaying(): boolean {
    return false;
  }
}

export class FakeMediaHost implements IRealtimeMediaHost {
  public MicAcquisitions = 0;
  public Deny: Error | null = null;
  public async AcquireMicrophone(): Promise<MediaStream> {
    this.MicAcquisitions++;
    if (this.Deny) {
      throw this.Deny;
    }
    return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
  }
}

export interface GqlCall {
  query: string;
  variables: Record<string, unknown>;
}

/** A GraphQL-shaped provider: answers the mint, closes sessions, and exposes the event subscription. */
export class FakeProvider {
  public readonly sessionId = 'transport-1';
  /** No entity metadata: a connect-only session, so the registry is never read and only host channels mount. */
  public Entities: unknown[] = [];
  public Calls: GqlCall[] = [];
  public Streams: Subject<unknown>[] = [];
  public MintError: Error | null = null;
  public MintOverrides: Partial<StartRealtimeClientSessionResult> = {};
  public async ExecuteGQL(query: string, variables: Record<string, unknown>): Promise<unknown> {
    this.Calls.push({ query, variables });
    if (query.includes('mutation StartRealtimeClientSession')) {
      if (this.MintError) {
        throw this.MintError;
      }
      const result: StartRealtimeClientSessionResult = {
        AgentSessionId: SESSION_ID,
        ConversationId: 'conv-1',
        Provider: 'widget-fake-provider',
        Model: 'm',
        EphemeralToken: 't',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfigJson: '{}',
        ModelName: 'Fake',
        NarrationInstructionsTemplate: null,
        PriorChannelStatesJson: null,
        ...this.MintOverrides
      };
      return { StartRealtimeClientSession: result };
    }
    return {};
  }
  public Subscribe(): Observable<unknown> {
    const stream = new Subject<unknown>();
    this.Streams.push(stream);
    return stream.asObservable();
  }
  public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
    return { subscribe: () => ({ unsubscribe: () => undefined }) };
  }
  public mints(): GqlCall[] {
    return this.Calls.filter((c) => c.query.includes('mutation StartRealtimeClientSession'));
  }
  /** Publishes a session event the way the server wire does. */
  public Publish(type: string, payload: object, sessionId = SESSION_ID): void {
    const wire = SerializeRealtimeSessionEvent({ Type: type, AgentSessionID: sessionId, OccurredAt: '2030-01-01T00:00:00Z', Payload: payload });
    this.Streams[this.Streams.length - 1]?.next({ RealtimeSessionEvents: wire });
  }
}

export class MemoryStorage implements StorageLike {
  public Data = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.Data.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.Data.set(key, value);
  }
  public removeItem(key: string): void {
    this.Data.delete(key);
  }
}

/** A JWT with the given expiry (epoch seconds) in its payload — unsigned, which is all the widget reads. */
export function makeJwt(expSeconds: number | null, extra: Record<string, unknown> = {}): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'none' })}.${encode({ ...(expSeconds === null ? {} : { exp: expSeconds }), ...extra })}.sig`;
}

export class FakeAuthProvider implements AuthProviderPort {
  public Configured = false;
  public Accept = true;
  public Held: string[] = [];
  public Refreshers: Array<() => Promise<string>> = [];
  public isConfigured(): boolean {
    return this.Configured;
  }
  public async configure(jwt: string, onRefresh: () => Promise<string>): Promise<boolean> {
    if (!this.Accept) {
      return false;
    }
    this.Held.push(jwt);
    this.Refreshers.push(onRefresh);
    this.Configured = true;
    return true;
  }
}

export function guestSession(overrides: Partial<WidgetGuestSession> = {}): WidgetGuestSession {
  return {
    token: makeJwt(Math.floor(Date.now() / 1000) + 3600),
    expiresAtMs: Date.now() + 3_600_000,
    widgetId: 'widget-1',
    applicationId: 'app-1',
    pinnedAgentId: 'agent-pinned',
    modality: 'Voice',
    voiceMaxSessionMinutes: null,
    enabledChannels: [],
    ...overrides
  };
}

export class FakeGuestSessions implements WidgetGuestSessionSource {
  public Mints = 0;
  public Refreshes = 0;
  public Next: WidgetGuestSession | Error = guestSession();
  public async Mint(): Promise<WidgetGuestSession> {
    this.Mints++;
    if (this.Next instanceof Error) {
      throw this.Next;
    }
    return this.Next;
  }
  public async Refresh(): Promise<WidgetGuestSession> {
    this.Refreshes++;
    if (this.Next instanceof Error) {
      throw this.Next;
    }
    return this.Next;
  }
}

export interface Harness {
  controller: WidgetController;
  runtime: RealtimeSessionRuntime;
  provider: FakeProvider;
  media: FakeMediaHost;
  authProvider: FakeAuthProvider;
  guest: FakeGuestSessions;
  storage: MemoryStorage;
  posts: Array<{ url: string; body: Readonly<Record<string, string>> }>;
  PostAnswer: { ok: boolean; json: unknown };
  closes: Array<{ url: string; token: string; sessionId: string }>;
  events: WidgetOutboundEvent[];
  eventNames: () => string[];
  phases: () => string[];
  config: (overrides: Partial<WidgetConfig>) => void;
}

export function buildHarness(initial: Partial<WidgetConfig> = {}): Harness {
  const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
  const media = (runtime as unknown as { mediaHost: FakeMediaHost }).mediaHost;
  const provider = new FakeProvider();
  runtime.Provider = provider as unknown as IMetadataProvider;
  const authProvider = new FakeAuthProvider();
  const guest = new FakeGuestSessions();
  const storage = new MemoryStorage();
  const harness = {
    posts: [] as Array<{ url: string; body: Readonly<Record<string, string>> }>,
    PostAnswer: { ok: true, json: { success: true, token: makeJwt(Math.floor(Date.now() / 1000) + 3600) } } as { ok: boolean; json: unknown },
    closes: [] as Array<{ url: string; token: string; sessionId: string }>,
    events: [] as WidgetOutboundEvent[]
  };
  const post: HttpPostPort = async (url, body) => {
    harness.posts.push({ url, body });
    return harness.PostAnswer;
  };
  const deps: WidgetControllerDeps = {
    runtime,
    createAuth: (apiUrl, refresh) => new WidgetAuthAdapter({ apiUrl, provider: authProvider, post, refresh }),
    createGuestSessions: () => guest,
    createResumeStore: (scope) => new WidgetResumeStore(scope, storage),
    pageClose: new WidgetPageClose({
      config: () => ({ url: 'https://api.example.com/', token: 'live-token' }),
      send: (url, token, sessionId) => harness.closes.push({ url, token, sessionId })
    })
  };
  const controller = new WidgetController(deps, { ...DefaultWidgetConfig(), requireConsent: false, agentName: 'Sage', ...initial });
  controller.Events$.subscribe((e) => harness.events.push(e));
  // Assign onto the live object (not a copy) so a test that reassigns PostAnswer reaches `post`.
  return Object.assign(harness, {
    controller,
    runtime,
    provider,
    media,
    authProvider,
    guest,
    storage,
    eventNames: () => harness.events.map((e) => e.name),
    phases: () =>
      harness.events.flatMap((e) => (e.name === 'mj-phase-changed' ? [e.detail.phase] : [])),
    config: (overrides: Partial<WidgetConfig>) => controller.Configure({ ...controller.Config, ...overrides })
  }) as Harness;
}

/** What a test needs from an instance of the page-supplied test channel. */
export interface TestPanelInstance extends BaseRealtimeChannelClient {
  OpenedWith: unknown;
  EmitForTest(eventName: string, payload?: Record<string, never>): void;
  FinishForTest(): void;
}

/** The test channel's class, with the instances it has created (newest last). */
export interface TestPanelClass {
  new (): TestPanelInstance;
  Instances: TestPanelInstance[];
}

/** A channel the page brings: one verb, and a way to emit events/outputs on demand. */
export function makeTestChannelClass(name = 'TestPanel'): TestPanelClass {
  @RegisterClass(BaseRealtimeChannelClient, `${name}Channel`)
  class TestPanelChannel extends BaseRealtimeChannelClient {
    public static Instances: TestPanelChannel[] = [];
    public OpenedWith: unknown = null;
    constructor() {
      super();
      TestPanelChannel.Instances.push(this);
    }
    public get ChannelName(): string {
      return name;
    }
    public override GetDescriptor() {
      return {
        Key: name,
        Version: '2.0.0',
        DisplayName: name,
        Instructions: 'A test panel.',
        Nouns: [],
        Verbs: [],
        Inputs: { type: 'object', properties: { title: { type: 'string' } }, additionalProperties: false },
        DisplayPolicy: 'on-demand' as const,
        DefaultAvailability: 'opt-in' as const,
        MaxExposure: 'state' as const
      };
    }
    protected override OnOpen(inputs: Record<string, unknown>): void {
      this.OpenedWith = inputs;
    }
    public EmitForTest(eventName: string, payload: Record<string, never> = {}): void {
      this.EmitChannelEvent(eventName, payload);
    }
    public FinishForTest(): void {
      this.Complete({ done: true });
    }
  }
  return TestPanelChannel;
}

export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export const spyConsole = () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
};
