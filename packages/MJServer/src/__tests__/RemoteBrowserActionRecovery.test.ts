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
const restrictMock = vi.fn(async (_agentSessionID: string, _allowedHosts: string[]) => undefined);
vi.mock('@memberjunction/remote-browser-server', () => ({
  NormalizeInstanceKey: (key?: string) => key?.trim() || null,
  RemoteBrowserEngine: {
    Instance: {
      StartSessionForAgentSession: (...args: unknown[]) => startSessionMock(...(args as [])),
      RecoverDeadAgentSession: (...args: unknown[]) => recoverDeadSessionMock(...(args as [])),
      EndSessionForAgentSession: (agentSessionID: string) => endSessionMock(agentSessionID),
      RestrictPrivateNetworkForAgentSession: (agentSessionID: string, allowedHosts: string[]) => restrictMock(agentSessionID, allowedHosts),
      GetSessionForAgentSession: () => undefined,
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

// The resolver reads its conversation-browser settings from the server config; off, as by default.
vi.mock('../config.js', () => ({ configInfo: { realtime: { conversationBrowser: { enabled: false } } } }));

import { RemoteBrowserActionResolver } from '../resolvers/RemoteBrowserActionResolver.js';
import { ConversationBrowserLedger } from '../agentSessions/conversationBrowsers.js';
import type { ConversationBrowserConfig } from '../config.js';

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

  const ENABLED: ConversationBrowserConfig = { enabled: true, allowAnonymous: false, maxPerUser: 2, maxAnonymousTotal: 4, idleMinutes: 15, allowedPrivateHosts: ['localhost:4200'] };

  /**
   * A resolver whose provider has no agent session by that ID, only conversations owned by `ownerID`
   * (stamped with `externalID`, an anonymous guest's scope id), called by `caller`, under `settings`.
   */
  function conversationResolver(
    ownerID: string,
    caller: Record<string, unknown> = { ID: userID },
    externalID: string | null = null,
    settings: ConversationBrowserConfig = ENABLED,
  ): RemoteBrowserActionResolver {
    const getEntityObject = vi.fn(async (entityName: string) => {
      if (entityName !== 'MJ: Conversations') {
        return { Load: vi.fn(async () => false) };
      }
      const conversation = { ID: '', UserID: ownerID, ExternalID: externalID, Load: vi.fn(async (id: string) => {
        conversation.ID = id;
        return id.startsWith('b2b2b2b2');
      }) };
      return conversation;
    });
    class OwnershipResolver extends RemoteBrowserActionResolver {
      protected override requireUserAndProvider() {
        return { contextUser: caller, provider: { GetEntityObject: getEntityObject } } as never;
      }
      protected override ConversationBrowserSettings(): ConversationBrowserConfig {
        return settings;
      }
    }
    return new OwnershipResolver();
  }

  beforeEach(() => {
    recoverDeadSessionMock.mockReset().mockResolvedValue(null);
    for (const id of [convID, convID2, convID3]) {
      ConversationBrowserLedger.Instance.Release(id);
    }
  });
  const convID2 = 'b2b2b2b2-0000-4000-8000-000000000012';
  const convID3 = 'b2b2b2b2-0000-4000-8000-000000000013';

  it('refuses an instance key for a conversation, which would key a second, uncounted browser', async () => {
    startSessionMock.mockReset();
    const resolver = conversationResolver(userID);
    await expect(
      resolver.ExecuteRemoteBrowserAction(convID, 'inspect', ctx, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'x'),
    ).rejects.toThrow('instanceKey is not accepted');
    await expect(resolver.EndRemoteBrowserSession(convID, ctx, 'x')).rejects.toThrow('instanceKey is not accepted');
    expect(startSessionMock).not.toHaveBeenCalled();
  });

  it('applies the network policy when the browser starts, not on every poll', async () => {
    deadSession = makeSession();
    startSessionMock.mockReset().mockResolvedValue(deadSession);
    restrictMock.mockClear();
    const resolver = conversationResolver(userID);
    await resolver.RemoteBrowserSnapshot(convID, ctx);
    expect(restrictMock).not.toHaveBeenCalled();
    await resolver.ExecuteRemoteBrowserAction(convID, 'inspect', ctx);
    expect(restrictMock).toHaveBeenCalledWith(convID, ['localhost:4200']);
  });

  it('after the idle reaper ends a browser, the next open streams the new one instead of answering "already streaming"', async () => {
    const streamingSession = { ...makeSession(), StartScreencast: vi.fn(async () => undefined) };
    startSessionMock.mockReset().mockResolvedValue(streamingSession as never);
    endSessionMock.mockClear();
    const resolver = conversationResolver(userID, { ID: userID }, null, { ...ENABLED, idleMinutes: -1 });
    const pubSub = { publish: vi.fn() } as never;

    expect((await resolver.StartRemoteBrowserScreencast(convID, ctx, pubSub)).Streaming).toBe(true);
    expect(await ConversationBrowserLedger.Instance.ReapIdle()).toBe(1);
    expect(endSessionMock).toHaveBeenCalledWith(convID);

    expect((await resolver.StartRemoteBrowserScreencast(convID, ctx, pubSub)).Streaming).toBe(true);
    expect(streamingSession.StartScreencast).toHaveBeenCalledTimes(2);
  });

  it('caps each anonymous guest on its own, not every guest as one shared Anonymous user', async () => {
    deadSession = makeSession();
    startSessionMock.mockReset().mockResolvedValue(deadSession);
    const settings = { ...ENABLED, allowAnonymous: true, maxPerUser: 1 };
    const guestA = { ID: userID, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'visitor-a' };
    const guestB = { ID: userID, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'visitor-b' };
    expect((await conversationResolver(userID, guestA, 'visitor-a', settings).ExecuteRemoteBrowserAction(convID, 'inspect', ctx)).Success).toBe(true);
    expect((await conversationResolver(userID, guestB, 'visitor-b', settings).ExecuteRemoteBrowserAction(convID2, 'inspect', ctx)).Success).toBe(true);
  });

  it('caps all anonymous guests together, since a guest can start a new scope cheaply; signed-in users are not counted', async () => {
    deadSession = makeSession();
    startSessionMock.mockReset().mockResolvedValue(deadSession);
    const settings = { ...ENABLED, allowAnonymous: true, maxPerUser: 1, maxAnonymousTotal: 2 };
    const guest = (visitor: string) => ({ ID: userID, IsMagicLinkAnonymous: true, AnonymousVisitorID: visitor });
    const open = (visitor: string, conversationID: string) =>
      conversationResolver(userID, guest(visitor), visitor, settings).ExecuteRemoteBrowserAction(conversationID, 'inspect', ctx);
    expect((await open('visitor-a', convID)).Success).toBe(true);
    expect((await open('visitor-b', convID2)).Success).toBe(true);
    const third = await open('visitor-c', convID3);
    expect(third.Success).toBe(false);
    expect(third.Detail).toContain('allows for guests is in use');
    expect((await conversationResolver(userID, { ID: userID }, null, settings).ExecuteRemoteBrowserAction(convID3, 'inspect', ctx)).Success).toBe(true);
  });

  it('every refusal carries the REMOTE_BROWSER_REFUSED code, so a client stops asking', async () => {
    deadSession = makeSession();
    startSessionMock.mockReset().mockResolvedValue({ ...deadSession, StartScreencast: vi.fn(async () => undefined) } as never);
    const refused = { extensions: { code: 'REMOTE_BROWSER_REFUSED' } };
    const guest = { ID: userID, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'visitor-a' };
    const pubSub = { publish: vi.fn() } as never;
    await expect(conversationResolver(userID, { ID: userID }, null, { ...ENABLED, enabled: false }).RemoteBrowserSnapshot(convID, ctx)).rejects.toMatchObject(refused);
    await expect(conversationResolver(userID, guest, 'visitor-a').RemoteBrowserSnapshot(convID, ctx)).rejects.toMatchObject(refused);
    await expect(conversationResolver(userID).EndRemoteBrowserSession(convID, ctx, 'x')).rejects.toMatchObject(refused);
    await expect(conversationResolver(otherUserID).RemoteBrowserSnapshot(convID, ctx)).rejects.toMatchObject(refused);
    await expect(conversationResolver(userID).RemoteBrowserSnapshot('d4d4d4d4-0000-4000-8000-000000000004', ctx)).rejects.toMatchObject(refused);
    const capped = conversationResolver(userID, { ID: userID }, null, { ...ENABLED, maxPerUser: 1 });
    await capped.StartRemoteBrowserScreencast(convID, ctx, pubSub);
    await expect(capped.StartRemoteBrowserScreencast(convID2, ctx, pubSub)).rejects.toMatchObject(refused);
  });

  it('forgets where a stopped stream went, so a browser that never ends cannot leak its targets', async () => {
    const streamingSession = { ...makeSession(), StartScreencast: vi.fn(async () => undefined) };
    startSessionMock.mockReset().mockResolvedValue(streamingSession as never);
    const resolver = conversationResolver(userID);
    const pubSub = { publish: vi.fn() } as never;
    const targets = (resolver as unknown as { streamTargets: Map<string, unknown> }).streamTargets;

    await resolver.StartRemoteBrowserScreencast(convID, ctx, pubSub);
    await resolver.StopRemoteBrowserScreencast(convID, ctx);
    await resolver.StartRemoteBrowserScreencast(convID2, ctx, pubSub);
    expect(targets.size).toBe(1);
  });

  it('a reloaded tab (a new push session) takes the frames over instead of hearing "already streaming"', async () => {
    let onFrame: ((frame: { DataBase64: string; Width: number; Height: number; SequenceNumber: number }) => void) | null = null;
    const streamingSession = { ...makeSession(), StartScreencast: vi.fn(async (cb: typeof onFrame) => { onFrame = cb; }) };
    startSessionMock.mockReset().mockResolvedValue(streamingSession as never);
    const resolver = conversationResolver(userID);
    const publish = vi.spyOn(resolver as unknown as { PublishStatusUpdate: (...args: unknown[]) => void }, 'PublishStatusUpdate').mockImplementation(() => undefined);
    const pubSub = { publish: vi.fn() } as never;
    const tab = (sessionId: string) => ({ userPayload: { sessionId }, providers: {} }) as never;

    await resolver.StartRemoteBrowserScreencast(convID, tab('push-A'), pubSub);
    await resolver.StartRemoteBrowserScreencast(convID, tab('push-B'), pubSub);
    expect(streamingSession.StartScreencast).toHaveBeenCalledTimes(1);
    onFrame!({ DataBase64: 'f', Width: 1, Height: 1, SequenceNumber: 1 });
    expect(publish.mock.calls[0][1]).toBe('push-B');
  });

  it('a cap refusal on opening the live view reaches the client as an error, not a silent "not streaming"', async () => {
    deadSession = makeSession();
    startSessionMock.mockReset().mockResolvedValue({ ...deadSession, StartScreencast: vi.fn(async () => undefined) } as never);
    const resolver = conversationResolver(userID, { ID: userID }, null, { ...ENABLED, maxPerUser: 1 });
    const pubSub = { publish: vi.fn() } as never;
    expect((await resolver.StartRemoteBrowserScreencast(convID, ctx, pubSub)).Streaming).toBe(true);
    await expect(resolver.StartRemoteBrowserScreencast(convID2, ctx, pubSub)).rejects.toThrow('the most this server allows');
  });

  it('refuses every conversation operation while the server has not enabled conversation browsers', async () => {
    startSessionMock.mockReset();
    const off = conversationResolver(userID, { ID: userID }, null, { ...ENABLED, enabled: false });
    await expect(off.ExecuteRemoteBrowserAction(convID, 'inspect', ctx)).rejects.toThrow('not enabled');
    expect(startSessionMock).not.toHaveBeenCalled();
  });

  it('refuses an anonymous guest its own conversation browser unless anonymous use is enabled', async () => {
    deadSession = makeSession();
    startSessionMock.mockReset().mockResolvedValue(deadSession);
    const guest = { ID: userID, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'visitor-a' };
    await expect(conversationResolver(userID, guest, 'visitor-a').ExecuteRemoteBrowserAction(convID, 'inspect', ctx)).rejects.toThrow('anonymous');
    expect(startSessionMock).not.toHaveBeenCalled();
    const allowed = conversationResolver(userID, guest, 'visitor-a', { ...ENABLED, allowAnonymous: true });
    expect((await allowed.ExecuteRemoteBrowserAction(convID, 'inspect', ctx)).Success).toBe(true);
  });

  it('caps the conversation browsers one user holds, keeps it off the private network, and refuses goal runs', async () => {
    deadSession = makeSession();
    startSessionMock.mockReset().mockResolvedValue(deadSession);
    restrictMock.mockClear();
    const resolver = conversationResolver(userID);
    expect((await resolver.ExecuteRemoteBrowserAction(convID, 'inspect', ctx)).Success).toBe(true);
    expect((await resolver.ExecuteRemoteBrowserAction(convID2, 'inspect', ctx)).Success).toBe(true);
    expect((await resolver.ExecuteRemoteBrowserAction(convID, 'inspect', ctx)).Success).toBe(true); // already held
    const third = await resolver.ExecuteRemoteBrowserAction(convID3, 'inspect', ctx);
    expect(third.Success).toBe(false);
    expect(third.Detail).toContain('the most this server allows');
    expect(startSessionMock).toHaveBeenCalledTimes(3);
    expect(restrictMock).toHaveBeenCalledWith(convID, ['localhost:4200']);

    const goal = await resolver.ExecuteRemoteBrowserGoal(convID, 'buy the thing', ctx);
    expect(goal.Success).toBe(false);
    expect(goal.Detail).toContain('not available in a text conversation');
  });

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
