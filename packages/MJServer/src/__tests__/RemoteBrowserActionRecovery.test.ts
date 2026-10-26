// type-graphql decorators on the resolver call `Reflect.getMetadata`, which only exists when this
// polyfill is loaded first. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same reason as RemoteBrowserSnapshot.test.ts: vitest's esbuild transform does not emit the decorator
// metadata type-graphql needs, so the decorators are replaced with no-ops and the resolver's plain TS
// logic — here, the action path's dead-handle recovery — is what gets exercised.
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

interface FakeSession {
  ExecuteAction: ReturnType<typeof vi.fn>;
  CaptureScreenshot: ReturnType<typeof vi.fn>;
  GetCurrentUrl: ReturnType<typeof vi.fn>;
}
const makeSession = (): FakeSession => ({
  ExecuteAction: vi.fn(async () => ({ Success: true, CurrentUrl: 'https://www.wikipedia.org/' })),
  CaptureScreenshot: vi.fn(async () => 'QUJD'),
  GetCurrentUrl: vi.fn(() => 'https://www.wikipedia.org/'),
});

// The browser that died, and the one the engine launches to replace it. Keeping them distinct is what
// lets a test assert the retry ran against the REPLACEMENT rather than the corpse.
let deadSession: FakeSession;
let replacementSession: FakeSession;

const startSessionMock = vi.fn<[], Promise<FakeSession>>(async () => deadSession);
// Mirrors `(agentSessionID, error, opts?) => Promise<IRemoteBrowserSession | null>`. `null` is the
// documented outcome for anything that is not a dead handle, so it is the default: the pre-existing
// error-reporting contract must survive untouched for every ordinary failure.
const recoverDeadSessionMock = vi.fn<[], Promise<FakeSession | null>>(async () => null);
const endSessionMock = vi.fn(async (_agentSessionID: string) => true);
vi.mock('@memberjunction/remote-browser-server', () => ({
  NormalizeInstanceKey: (key?: string) => key?.trim() || null,
  RemoteBrowserEngine: {
    Instance: {
      StartSessionForAgentSession: (...args: unknown[]) => startSessionMock(...(args as [])),
      RecoverDeadAgentSession: (...args: unknown[]) => recoverDeadSessionMock(...(args as [])),
      EndSessionForAgentSession: (agentSessionID: string) => endSessionMock(agentSessionID),
    },
  },
}));

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn(), Prompts: [] } } }));
// Spread the real module, as for ai-core-plus below, so transitively-loaded modules resolve: runners such as
// AIRerankerRunner (which extends BaseModelRunner), and RunDecisionResolver's AIDecisionRunner. Only
// AIPromptRunner is overridden for the test.
vi.mock('@memberjunction/ai-prompts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ai-prompts')>()),
  AIPromptRunner: class {},
}));
vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ai-core-plus')>()),
  AIPromptParams: class {},
}));

import { RemoteBrowserActionResolver } from '../resolvers/RemoteBrowserActionResolver.js';

/** Bypasses the ownership/provider plumbing (covered elsewhere) so the recovery branch stands alone. */
class TestableResolver extends RemoteBrowserActionResolver {
  protected requireUserAndProvider() {
    return { contextUser: { ID: 'user-1' }, provider: {} } as never;
  }
  protected async loadOwnedSession() {
    return { ID: 'sess-1', AgentID: 'agent-1', UserID: 'user-1' } as never;
  }
  protected async resolveProviderName() {
    return 'Self-Hosted Chrome';
  }
}

const ctx = { userPayload: { sessionId: 'push-sess-1' }, providers: {} } as never;
const DEAD = new Error('Browser not launched. Call Launch() before using the adapter.');

describe('RemoteBrowserActionResolver — dead-handle recovery on the action path (#3598)', () => {
  let resolver: TestableResolver;

  beforeEach(() => {
    resolver = new TestableResolver();
    deadSession = makeSession();
    replacementSession = makeSession();
    startSessionMock.mockReset().mockImplementation(async () => deadSession);
    recoverDeadSessionMock.mockReset().mockResolvedValue(null);
  });

  it('reports an ordinary failure exactly as before — no recovery, no retry', async () => {
    deadSession.ExecuteAction.mockRejectedValueOnce(new Error('waiting for selector "#nope" failed: timeout'));
    const result = await resolver.ExecuteRemoteBrowserAction('sess-1', 'click', ctx, undefined, '#nope');
    expect(result.Success).toBe(false);
    expect(result.Detail).toContain('waiting for selector');
    // The engine is still ASKED (it owns the grammar of "dead"), but it declined — so the resolver must
    // fall through to the pre-existing report rather than inventing a recovery of its own.
    expect(recoverDeadSessionMock).toHaveBeenCalledTimes(1);
    expect(replacementSession.ExecuteAction).not.toHaveBeenCalled();
  });

  // The regression this closes: recovery was wired only into the ~700ms snapshot poll, so an agent-driven
  // surface with no pane polling it never healed at all — every action threw "Browser not launched" for
  // the rest of the session, which is the 232-error case from the issue.
  it('heals the surface and re-runs the action against the replacement', async () => {
    deadSession.ExecuteAction.mockRejectedValueOnce(DEAD);
    recoverDeadSessionMock.mockResolvedValue(replacementSession);
    replacementSession.ExecuteAction.mockResolvedValue({ Success: true, CurrentUrl: 'https://example.com/' });

    const result = await resolver.ExecuteRemoteBrowserAction('sess-1', 'navigate', ctx, 'https://example.com/');

    expect(result).toEqual({ Success: true, CurrentUrl: 'https://example.com/', Detail: undefined });
    expect(replacementSession.ExecuteAction).toHaveBeenCalledTimes(1);
    // Retrying is only safe because the original never reached a browser — pin that it ran once, not twice.
    expect(deadSession.ExecuteAction).toHaveBeenCalledTimes(1);
  });

  it('hands the engine the instance key and provider a relaunch needs', async () => {
    deadSession.ExecuteAction.mockRejectedValueOnce(DEAD);
    recoverDeadSessionMock.mockResolvedValue(replacementSession);

    await resolver.ExecuteRemoteBrowserAction(
      'sess-1', 'navigate', ctx, 'https://example.com/',
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'research',
    );

    const [agentSessionID, error, opts] = recoverDeadSessionMock.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>];
    expect(agentSessionID).toBe('sess-1');
    expect(error).toBe(DEAD);
    expect(opts.InstanceKey).toBe('research');
    expect(opts.ProviderName).toBe('Self-Hosted Chrome');
  });

  // A replacement is a FRESH browser on a blank page, so a selector-bound action legitimately fails on it.
  // The agent has to be told why, or it re-tries the same click forever against a page it thinks it loaded.
  it('says the browser was replaced when the retried action fails on the blank replacement', async () => {
    deadSession.ExecuteAction.mockRejectedValueOnce(DEAD);
    recoverDeadSessionMock.mockResolvedValue(replacementSession);
    replacementSession.ExecuteAction.mockResolvedValue({ Success: false, Detail: 'No element matching "#submit".' });

    const result = await resolver.ExecuteRemoteBrowserAction('sess-1', 'click', ctx, undefined, '#submit');

    expect(result.Success).toBe(false);
    expect(result.Detail).toContain('replaced');
    expect(result.Detail).toContain('No element matching');
  });

  it('does not recurse when the replacement itself throws', async () => {
    deadSession.ExecuteAction.mockRejectedValueOnce(DEAD);
    recoverDeadSessionMock.mockResolvedValue(replacementSession);
    replacementSession.ExecuteAction.mockRejectedValue(DEAD);

    const result = await resolver.ExecuteRemoteBrowserAction('sess-1', 'navigate', ctx, 'https://example.com/');

    expect(result.Success).toBe(false);
    expect(result.Detail).toContain('still failed');
    // One recovery per fault: a retry that dies too is a broken provider, and the engine's own budget is
    // what bounds that — the resolver must not open a second loop around it.
    expect(recoverDeadSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe('RemoteBrowserActionResolver — conversation-scoped ownership & structured text actions', () => {
  const userID = 'a1a1a1a1-0000-4000-8000-000000000001';
  const otherUserID = 'c3c3c3c3-0000-4000-8000-000000000003';
  const convID = 'b2b2b2b2-0000-4000-8000-000000000002';

  /**
   * A resolver whose provider has no agent session by that ID, only a conversation owned by `ownerID`
   * (stamped with `externalID`, an anonymous guest's scope id), called by `caller`.
   */
  function conversationResolver(ownerID: string, caller: Record<string, unknown> = { ID: userID }, externalID: string | null = null): RemoteBrowserActionResolver {
    const getEntityObject = vi.fn(async (entityName: string) =>
      entityName === 'MJ: Conversations'
        ? { ID: convID, UserID: ownerID, ExternalID: externalID, Load: vi.fn(async (id: string) => id === convID) }
        : { Load: vi.fn(async () => false) },
    );
    class OwnershipResolver extends RemoteBrowserActionResolver {
      protected override requireUserAndProvider() {
        return { contextUser: caller, provider: { GetEntityObject: getEntityObject } } as never;
      }
    }
    return new OwnershipResolver();
  }

  it('acts on a conversation the caller owns', async () => {
    deadSession = makeSession();
    deadSession.ExecuteAction.mockResolvedValue({
      Success: true,
      CurrentUrl: 'https://httpbin.org/forms/post',
      Detail: 'Inspected',
      Observation: { ObservationID: 'obs-1', Url: 'https://httpbin.org/forms/post', Title: 'Order Form', Text: '', Fields: [], Actions: [], Links: [] },
    });
    startSessionMock.mockReset().mockResolvedValue(deadSession);

    const res = await conversationResolver(userID).ExecuteRemoteBrowserAction(convID, 'inspect', ctx);
    expect(res.Success).toBe(true);
    expect(JSON.parse(res.ObservationJson!).ObservationID).toBe('obs-1');
  });

  it("refuses another user's conversation, for actions and for ending its browser", async () => {
    startSessionMock.mockReset();
    endSessionMock.mockClear();
    const resolver = conversationResolver(otherUserID);
    await expect(resolver.ExecuteRemoteBrowserAction(convID, 'inspect', ctx)).rejects.toThrow('Not authorized');
    await expect(resolver.EndRemoteBrowserSession(convID, ctx)).rejects.toThrow('Not authorized');
    expect(startSessionMock).not.toHaveBeenCalled();
    expect(endSessionMock).not.toHaveBeenCalled();
  });

  it("refuses an anonymous guest another guest's conversation, though both share the Anonymous user", async () => {
    startSessionMock.mockReset();
    const guest = { ID: userID, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'visitor-b' };
    await expect(conversationResolver(userID, guest, 'visitor-a').ExecuteRemoteBrowserAction(convID, 'inspect', ctx)).rejects.toThrow('Not authorized');
    expect(startSessionMock).not.toHaveBeenCalled();
  });

  it("ends the caller's own conversation browser", async () => {
    endSessionMock.mockClear();
    await expect(conversationResolver(userID).EndRemoteBrowserSession(convID, ctx)).resolves.toBe(true);
    expect(endSessionMock).toHaveBeenCalledWith(convID);
  });

  it('maps a fill values object to field inputs and returns FilledJson + ObservationJson; any other shape is refused', async () => {
    const resolver = new TestableResolver();
    deadSession = makeSession();
    deadSession.ExecuteAction.mockResolvedValue({
      Success: true,
      CurrentUrl: 'https://httpbin.org/forms/post',
      Detail: 'Filled 1 field(s).',
      Filled: [{ Ref: 'f1', Label: 'Customer name', Value: 'Colin' }],
      Observation: { ObservationID: 'obs-2', Url: 'https://httpbin.org/forms/post', Title: 'Order Form', Text: '', Fields: [], Actions: [], Links: [] },
    });
    startSessionMock.mockReset().mockResolvedValue(deadSession);
    const fill = (valuesJson: string) =>
      resolver.ExecuteRemoteBrowserAction('sess-1', 'fill', ctx, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, valuesJson);

    const res = await fill(JSON.stringify({ f1: 'Colin', f9: true }));
    expect(res.Success).toBe(true);
    expect(deadSession.ExecuteAction).toHaveBeenCalledWith({ Kind: 'fill', Values: [{ Target: 'f1', Value: 'Colin' }, { Target: 'f9', Value: true }] });
    expect(JSON.parse(res.FilledJson!)).toEqual([{ Ref: 'f1', Label: 'Customer name', Value: 'Colin' }]);

    expect((await fill(JSON.stringify([{ ref: 'f1', value: 'Colin' }]))).Success).toBe(false);
    expect((await fill('not json')).Success).toBe(false);
  });

  it('maps getPageText and a ref/text click', async () => {
    const resolver = new TestableResolver();
    deadSession = makeSession();
    deadSession.ExecuteAction.mockResolvedValue({ Success: true, CurrentUrl: 'https://example.com/', Detail: 'Example Domain' });
    startSessionMock.mockReset().mockResolvedValue(deadSession);

    expect((await resolver.ExecuteRemoteBrowserAction('sess-1', 'getPageText', ctx)).Success).toBe(true);
    expect(deadSession.ExecuteAction).toHaveBeenCalledWith({ Kind: 'getPageText' });

    const clickRes = await resolver.ExecuteRemoteBrowserAction(
      'sess-1', 'click', ctx, undefined, undefined, undefined, undefined, 'Learn more', undefined, undefined, undefined, undefined, undefined, 'a1',
    );
    expect(clickRes.Success).toBe(true);
    expect(deadSession.ExecuteAction).toHaveBeenLastCalledWith({ Kind: 'click', Selector: undefined, Ref: 'a1', Text: 'Learn more', X: undefined, Y: undefined });
  });
});
