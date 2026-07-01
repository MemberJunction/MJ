// type-graphql decorators on the resolver call `Reflect.getMetadata`, which only exists when this
// polyfill is loaded first. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// type-graphql's `@Field()`/`@ObjectType()`/`@Query()` decorators need `emitDecoratorMetadata`
// reflection (a build-time tsc feature) that vitest's esbuild transform does NOT apply, so importing the
// decorated resolver throws "Unable to infer GraphQL type". This unit test exercises the resolver's plain
// TS logic (the snapshot best-effort contract), not its GraphQL schema — so we replace the decorators with
// no-ops. (The real schema is validated by the build + integration tests.)
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

// --- Mock the live-session engine the resolver reads. A single mutable session object lets each test
//     script what CaptureScreenshot does (resolve a frame / throw "Browser not launched"). ---
interface FakeLiveSession {
  CaptureScreenshot: ReturnType<typeof vi.fn>;
  GetCurrentUrl: ReturnType<typeof vi.fn>;
}
const liveSession: FakeLiveSession = {
  CaptureScreenshot: vi.fn(async () => 'QUJD'),
  GetCurrentUrl: vi.fn(() => 'https://www.wikipedia.org/'),
};
// The snapshot path is a pure READ: it looks up an existing session via GetSessionForAgentSession and never
// lazily starts one. `undefined` models "no live browser for this agent session".
const getSessionMock = vi.fn<[], FakeLiveSession | undefined>(() => liveSession);
vi.mock('@memberjunction/remote-browser-server', () => ({
  RemoteBrowserEngine: {
    Instance: {
      GetSessionForAgentSession: (...args: unknown[]) => getSessionMock(...(args as [])),
    },
  },
}));

// Keep the AI imports (visual interpreter) inert — they aren't exercised by the snapshot path.
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn(), Prompts: [] } } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
// Spread the real module so transitively-loaded code still resolves with its REAL base classes; only
// AIPromptParams is overridden for the test.
vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ai-core-plus')>()),
  AIPromptParams: class {},
}));

import { RemoteBrowserActionResolver } from '../resolvers/RemoteBrowserActionResolver.js';

/**
 * A test subclass that bypasses the ownership/provider plumbing (covered elsewhere) so the snapshot
 * best-effort contract is exercised in isolation.
 */
class TestableResolver extends RemoteBrowserActionResolver {
  protected requireUserAndProvider() {
    return { contextUser: { ID: 'user-1' }, provider: {} } as never;
  }
  protected async loadOwnedSession() {
    return { ID: 'sess-1', AgentID: 'agent-1', UserID: 'user-1' } as never;
  }
}

const ctx = { userPayload: { sessionId: 'push-sess-1' }, providers: {} } as never;

describe('RemoteBrowserActionResolver — snapshot (best-effort perception poll)', () => {
  let resolver: TestableResolver;

  beforeEach(() => {
    resolver = new TestableResolver();
    liveSession.CaptureScreenshot.mockReset().mockResolvedValue('QUJD');
    liveSession.GetCurrentUrl.mockReset().mockReturnValue('https://www.wikipedia.org/');
    getSessionMock.mockReset().mockReturnValue(liveSession);
  });

  it('returns the screenshot + URL when the browser is live', async () => {
    const result = await resolver.RemoteBrowserSnapshot('sess-1', ctx);
    expect(result).toEqual({ ScreenshotBase64: 'QUJD', CurrentUrl: 'https://www.wikipedia.org/' });
    expect(liveSession.CaptureScreenshot).toHaveBeenCalledTimes(1);
  });

  it('returns an empty snapshot when no live browser exists (never started / already torn down)', async () => {
    getSessionMock.mockReturnValue(undefined);
    const result = await resolver.RemoteBrowserSnapshot('sess-1', ctx);
    expect(result).toEqual({});
    expect(liveSession.CaptureScreenshot).not.toHaveBeenCalled();
  });

  // The regression the fix targets: a session handle survives in the live map but its underlying browser
  // adapter has been torn down, so CaptureScreenshot throws "Browser not launched". The ~700ms client poll
  // must NOT surface that as a recurring GraphQL error — the query's documented contract is empty fields,
  // not an error. So the resolver catches and degrades to {} (the surface keeps its last good frame).
  it('degrades to an empty snapshot — does NOT throw — when the adapter is torn down', async () => {
    liveSession.CaptureScreenshot.mockRejectedValueOnce(
      new Error('Browser not launched. Call Launch() before using the adapter.'),
    );
    const result = await resolver.RemoteBrowserSnapshot('sess-1', ctx);
    expect(result).toEqual({});
    expect(liveSession.CaptureScreenshot).toHaveBeenCalledTimes(1);
  });

  it('does not read the URL when the capture fails (no half-populated snapshot)', async () => {
    liveSession.CaptureScreenshot.mockRejectedValueOnce(new Error('Target page, context or browser has been closed'));
    const result = await resolver.RemoteBrowserSnapshot('sess-1', ctx);
    expect(result).toEqual({});
    expect(liveSession.GetCurrentUrl).not.toHaveBeenCalled();
  });
});
