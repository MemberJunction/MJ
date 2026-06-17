// type-graphql decorators on the resolver call `Reflect.getMetadata`, which only exists when this
// polyfill is loaded first. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteBrowserCapabilityNotSupportedError } from '@memberjunction/remote-browser-base';

// type-graphql's `@Field()`/`@ObjectType()`/`@Mutation()` decorators need `emitDecoratorMetadata`
// reflection (a build-time tsc feature) that vitest's esbuild transform does NOT apply, so importing the
// decorated resolver throws "Unable to infer GraphQL type". This unit test exercises the resolver's plain
// TS logic (idempotency / capability fallback / publish envelope), not its GraphQL schema — so we replace
// the decorators with no-ops. (The real schema is validated by the build + integration tests.)
vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator,
    Mutation: noopDecorator,
    Query: noopDecorator,
    Subscription: noopDecorator,
    ObjectType: noopDecorator,
    InputType: noopDecorator,
    Field: noopDecorator,
    Arg: noopDecorator,
    Args: noopDecorator,
    Ctx: noopDecorator,
    PubSub: noopDecorator,
    Root: noopDecorator,
    Float: class {},
    Int: class {},
    ID: class {},
  };
});

// --- Mock the live-session engine the resolver drives. A single mutable session object lets each
//     test script what StartAudioStream/StopAudioStream do (succeed / throw a capability error). ---
interface FakeLiveSession {
  StartAudioStream: ReturnType<typeof vi.fn>;
  StopAudioStream: ReturnType<typeof vi.fn>;
}
const liveSession: FakeLiveSession = {
  StartAudioStream: vi.fn(async () => undefined),
  StopAudioStream: vi.fn(async () => undefined),
};
const startSessionMock = vi.fn(async () => liveSession);
const getSessionMock = vi.fn(() => liveSession as FakeLiveSession | undefined);
vi.mock('@memberjunction/remote-browser-server', () => ({
  RemoteBrowserEngine: {
    Instance: {
      StartSessionForAgentSession: (...args: unknown[]) => startSessionMock(...(args as [])),
      GetSessionForAgentSession: (...args: unknown[]) => getSessionMock(...(args as [])),
    },
  },
}));

// Keep the AI imports (visual interpreter) inert — they aren't exercised by the audio path.
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn(), Prompts: [] } } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
// Spread the real module so transitively-loaded code (e.g. ArtifactToolManager → DataSnapshotToolLibrary,
// which needs BaseArtifactToolLibrary) still resolves; only AIPromptParams is overridden for the test.
vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ai-core-plus')>()),
  AIPromptParams: class {},
}));

import { RemoteBrowserActionResolver } from '../resolvers/RemoteBrowserActionResolver.js';

/**
 * A test subclass that bypasses the ownership/provider plumbing (covered elsewhere) so the audio-stream
 * logic — idempotency, capability fallback, the publish envelope — is exercised in isolation.
 */
class TestableResolver extends RemoteBrowserActionResolver {
  // Stub the user/provider gate to a fixed authenticated user.
  protected requireUserAndProvider() {
    return { contextUser: { ID: 'user-1' }, provider: {} } as never;
  }
  // Stub session ownership + provider-name resolution.
  protected async loadOwnedSession() {
    return { ID: 'sess-1', AgentID: 'agent-1', UserID: 'user-1' } as never;
  }
  protected async resolveProviderName() {
    return 'Self-Hosted Chrome';
  }
}

/** A minimal pub/sub spy capturing every published envelope. */
function makePubSub(): { publish: ReturnType<typeof vi.fn>; published: Array<{ topic: string; payload: unknown }> } {
  const published: Array<{ topic: string; payload: unknown }> = [];
  return {
    publish: vi.fn((topic: string, payload: unknown) => {
      published.push({ topic, payload });
      return Promise.resolve();
    }),
    published,
  };
}

const ctx = { userPayload: { sessionId: 'push-sess-1' }, providers: {} } as never;

describe('RemoteBrowserActionResolver — audio stream', () => {
  let resolver: TestableResolver;

  beforeEach(() => {
    resolver = new TestableResolver();
    liveSession.StartAudioStream.mockReset().mockResolvedValue(undefined);
    liveSession.StopAudioStream.mockReset().mockResolvedValue(undefined);
    startSessionMock.mockReset().mockResolvedValue(liveSession);
    getSessionMock.mockReset().mockReturnValue(liveSession);
  });

  it('starts the stream and reports Streaming: true', async () => {
    const pubSub = makePubSub();
    const result = await resolver.StartRemoteBrowserAudioStream('sess-1', ctx, pubSub as never);
    expect(result).toEqual({ Streaming: true });
    expect(liveSession.StartAudioStream).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second start does not re-invoke StartAudioStream', async () => {
    const pubSub = makePubSub();
    await resolver.StartRemoteBrowserAudioStream('sess-1', ctx, pubSub as never);
    const second = await resolver.StartRemoteBrowserAudioStream('sess-1', ctx, pubSub as never);
    expect(second).toEqual({ Streaming: true });
    expect(liveSession.StartAudioStream).toHaveBeenCalledTimes(1);
  });

  it('reports Streaming: false when the backend has no audio capability (graceful fallback)', async () => {
    liveSession.StartAudioStream.mockRejectedValueOnce(
      new RemoteBrowserCapabilityNotSupportedError('AudioStreaming', 'Browserless'),
    );
    const pubSub = makePubSub();
    const result = await resolver.StartRemoteBrowserAudioStream('sess-1', ctx, pubSub as never);
    expect(result).toEqual({ Streaming: false });
  });

  it('publishes each chunk as a RemoteBrowserAudioChunk envelope scoped to the push session', async () => {
    const pubSub = makePubSub();
    // Capture the onChunk callback the resolver hands to StartAudioStream, then drive a chunk through it.
    let onChunk: ((c: unknown) => void) | null = null;
    liveSession.StartAudioStream.mockImplementationOnce(async (cb: (c: unknown) => void) => {
      onChunk = cb;
    });
    await resolver.StartRemoteBrowserAudioStream('sess-1', ctx, pubSub as never);

    onChunk?.({ DataBase64: 'QUJD', Codec: 'webm-opus', SampleRate: 48000, Channels: 2, SequenceNumber: 7 });

    expect(pubSub.published).toHaveLength(1);
    const envelope = pubSub.published[0] as { topic: string; payload: { message: string; sessionId: string } };
    expect(envelope.topic).toBe('PUSH_STATUS_UPDATES');
    expect(envelope.payload.sessionId).toBe('push-sess-1');
    expect(JSON.parse(envelope.payload.message)).toEqual({
      resolver: 'RemoteBrowserActionResolver',
      type: 'RemoteBrowserAudioChunk',
      agentSessionID: 'sess-1',
      dataBase64: 'QUJD',
      codec: 'webm-opus',
      sampleRate: 48000,
      channels: 2,
      seq: 7,
    });
  });

  it('stop clears the started set (so a later start re-invokes) and best-effort stops the session', async () => {
    const pubSub = makePubSub();
    await resolver.StartRemoteBrowserAudioStream('sess-1', ctx, pubSub as never);
    const stopped = await resolver.StopRemoteBrowserAudioStream('sess-1', ctx);
    expect(stopped).toBe(true);
    expect(liveSession.StopAudioStream).toHaveBeenCalledTimes(1);

    // After stop, a new start re-invokes StartAudioStream (idempotency set was cleared).
    await resolver.StartRemoteBrowserAudioStream('sess-1', ctx, pubSub as never);
    expect(liveSession.StartAudioStream).toHaveBeenCalledTimes(2);
  });

  it('stop is best-effort — a StopAudioStream rejection still resolves true', async () => {
    const pubSub = makePubSub();
    await resolver.StartRemoteBrowserAudioStream('sess-1', ctx, pubSub as never);
    liveSession.StopAudioStream.mockRejectedValueOnce(new Error('no audio backend'));
    await expect(resolver.StopRemoteBrowserAudioStream('sess-1', ctx)).resolves.toBe(true);
  });
});
