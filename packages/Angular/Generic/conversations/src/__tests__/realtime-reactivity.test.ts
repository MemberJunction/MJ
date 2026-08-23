// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * REACTIVITY fixes for two "new realtime data doesn't appear until a manual refresh" bugs,
 * exercised at the chat-area level WITHOUT TestBed (the component is created via
 * `Object.create(prototype)` so the real private methods run against stubbed collaborators):
 *
 *  BUG 1 — a brand-new conversation a realtime session creates server-side must be folded
 *          into the engine's reactive cache the moment the session STARTS (so the sidebar
 *          list shows it), independent of the host's refresh round-trip.
 *  BUG 2 — when a realtime session ENDS, the active conversation's timeline must reload so
 *          the just-recorded session surfaces as a reviewable past-session block.
 */

interface EngineStub {
  EnsureConversationLoaded: ReturnType<typeof vi.fn>;
}

/**
 * The transcript is WINDOWED: the chat area refreshes the newest page through the window
 * store rather than re-running the engine's full-history `RefreshConversationDetails`, which
 * would re-query the whole conversation and replace the loaded window with every row.
 */
interface WindowStoreStub {
  RefreshLatest: ReturnType<typeof vi.fn>;
  GetSnapshot: ReturnType<typeof vi.fn>;
}

interface Harness {
  component: ConversationChatAreaComponent;
  engine: EngineStub;
  windowStore: WindowStoreStub;
  realtimeConversationReadyEmit: ReturnType<typeof vi.fn>;
  loadPeripheralData: ReturnType<typeof vi.fn>;
  sessionCreatedConversationId: { value: string | null };
}

function createHarness(): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;

  const engine: EngineStub = {
    EnsureConversationLoaded: vi.fn().mockResolvedValue(null)
  };
  const snapshot = {
    ConversationID: 'CONV-ACTIVE',
    Details: [],
    Timeline: [],
    Cursor: { OldestSequence: null, NewestSequence: null, HasMoreAbove: false },
    PinnedDetails: [],
    AgentRunsByDetailId: new Map(),
    UserAvatars: new Map(),
    RatingsByDetailId: new Map(),
    ArtifactsByDetailId: new Map(),
    IsLoadingLatest: false,
    IsLoadingOlder: false
  };
  const windowStore: WindowStoreStub = {
    RefreshLatest: vi.fn().mockResolvedValue(undefined),
    GetSnapshot: vi.fn().mockReturnValue(snapshot)
  };
  const realtimeConversationReadyEmit = vi.fn();
  const loadPeripheralData = vi.fn().mockResolvedValue(undefined);
  const sessionCreatedConversationId = { value: null as string | null };

  open['engine'] = engine;
  open['windowStore'] = windowStore;
  open['currentUser'] = { ID: 'USER-1' };
  open['cdr'] = { detectChanges: vi.fn() };
  open['realtimeConversationReady'] = { emit: realtimeConversationReadyEmit };
  // Stub the private peripheral-data reload so the timeline-refresh test stays focused.
  open['loadPeripheralData'] = loadPeripheralData;
  open['lastLoadedConversationId'] = 'STALE';
  open['messages'] = [];
  open['RealtimeSession'] = {
    get SessionCreatedConversationId() {
      return sessionCreatedConversationId.value;
    }
  };

  return {
    component, engine, windowStore, realtimeConversationReadyEmit,
    loadPeripheralData, sessionCreatedConversationId
  };
}

/** Reaches a private method on the prototype-built component. */
function invokePrivate(component: ConversationChatAreaComponent, name: string, ...args: unknown[]): unknown {
  const fn = (component as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
  return fn.apply(component, args);
}

describe('BUG 1 — server-created conversation folds into the engine cache on session start', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness();
  });

  it('folds the new conversation into the engine cache when the session created one', () => {
    h.sessionCreatedConversationId.value = 'CONV-NEW';

    invokePrivate(h.component, 'onRealtimeSessionStarted');

    expect(h.engine.EnsureConversationLoaded).toHaveBeenCalledWith('CONV-NEW', { ID: 'USER-1' });
    expect(h.realtimeConversationReadyEmit).toHaveBeenCalledWith({ conversationId: 'CONV-NEW', select: false });
  });

  it('does nothing when the session joined an EXISTING conversation (no server-created one)', () => {
    h.sessionCreatedConversationId.value = null;

    invokePrivate(h.component, 'onRealtimeSessionStarted');

    expect(h.engine.EnsureConversationLoaded).not.toHaveBeenCalled();
    expect(h.realtimeConversationReadyEmit).not.toHaveBeenCalled();
  });
});

describe('BUG 2 — session end reloads the active conversation timeline', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness();
  });

  it('reloads the active conversation details so the just-recorded session appears', async () => {
    (h.component as unknown as Record<string, unknown>)['_conversationId'] = 'CONV-ACTIVE';
    // conversationId getter reads _conversationId
    Object.defineProperty(h.component, 'conversationId', {
      get() {
        return 'CONV-ACTIVE';
      },
      configurable: true
    });

    await invokePrivate(h.component, 'reloadActiveConversationTimeline');

    expect(h.windowStore.RefreshLatest).toHaveBeenCalledWith({ ID: 'USER-1' });
    expect(h.windowStore.GetSnapshot).toHaveBeenCalled();
    expect(h.loadPeripheralData).toHaveBeenCalledWith('CONV-ACTIVE', expect.anything());
    // lastLoadedConversationId is reset so peripheral data (incl. session meta) reprocesses
    expect((h.component as unknown as Record<string, unknown>)['lastLoadedConversationId']).toBeNull();
  });

  it('is a safe no-op when no conversation is open', async () => {
    Object.defineProperty(h.component, 'conversationId', {
      get() {
        return null;
      },
      configurable: true
    });

    await invokePrivate(h.component, 'reloadActiveConversationTimeline');

    expect(h.windowStore.RefreshLatest).not.toHaveBeenCalled();
    expect(h.loadPeripheralData).not.toHaveBeenCalled();
  });

  it('onRealtimeSessionEnded reloads the timeline AND emits ready for a session-created conversation', () => {
    Object.defineProperty(h.component, 'conversationId', {
      get() {
        return 'CONV-ACTIVE';
      },
      configurable: true
    });
    h.sessionCreatedConversationId.value = 'CONV-ACTIVE';

    invokePrivate(h.component, 'onRealtimeSessionEnded');

    // Timeline refresh fired (BUG 2) ...
    expect(h.windowStore.RefreshLatest).toHaveBeenCalledWith({ ID: 'USER-1' });
    // ... and the host was told to fold + select the created conversation.
    expect(h.realtimeConversationReadyEmit).toHaveBeenCalledWith({ conversationId: 'CONV-ACTIVE', select: true });
  });

  it('onRealtimeSessionEnded still refreshes the timeline when NO conversation was created (existing-conversation call)', () => {
    Object.defineProperty(h.component, 'conversationId', {
      get() {
        return 'CONV-ACTIVE';
      },
      configurable: true
    });
    h.sessionCreatedConversationId.value = null; // joined an existing conversation

    invokePrivate(h.component, 'onRealtimeSessionEnded');

    expect(h.windowStore.RefreshLatest).toHaveBeenCalledWith({ ID: 'USER-1' });
    expect(h.realtimeConversationReadyEmit).not.toHaveBeenCalled();
  });
});
