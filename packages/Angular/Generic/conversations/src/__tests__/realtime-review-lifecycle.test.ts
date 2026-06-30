// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { RealtimeSessionReview } from '../lib/services/realtime-session-review.service';

/**
 * SESSION-REVIEW overlay lifecycle on the chat area — every path that must CLEAR (or
 * refuse to host) a review so the overlay can never go stale:
 *
 *  1. Changing the active conversation clears any hosted review (the original stuck
 *     repro: an old session opened in review mode survived conversation switches).
 *  2. The overlay's Close handler clears.
 *  3. The async open path discards stale loads: a live call (before or during the
 *     load) wins; a conversation switch mid-load discards the review UNLESS the
 *     review belongs to the newly active conversation (the deep-link race).
 *
 * Class-level tests without TestBed: the component is created via
 * `Object.create(prototype)` (skipping ctor/inject) and the few collaborators the
 * review paths touch are stubbed directly.
 */

function review(overrides: Partial<RealtimeSessionReview> = {}): RealtimeSessionReview {
  return {
    SessionID: 'SESSION-1',
    AgentID: 'AGENT-1',
    AgentName: 'Voice Co-Agent',
    TargetAgentID: 'AGENT-1',
    ConversationID: 'CONV-A',
    Status: 'Closed',
    CloseReason: 'Explicit',
    StartedAt: new Date(2026, 5, 1, 10, 0, 0),
    LastActiveAt: null,
    ClosedAt: new Date(2026, 5, 1, 10, 10, 0),
    RecordingFileID: null,
    RecordingStartedAt: null,
    RecordingMedia: null,
    Turns: [],
    DelegatedRuns: [],
    ChannelStates: [],
    Legs: [],
    Artifacts: [],
    ...overrides
  };
}

interface HarnessStubs {
  realtimeSession: { IsActive: boolean };
  loadSessionReview: ReturnType<typeof vi.fn>;
  detectChanges: ReturnType<typeof vi.fn>;
}

/** Bare component over the real prototype: real lifecycle methods, stubbed collaborators. */
function createHarness(): { component: ConversationChatAreaComponent; stubs: HarnessStubs } {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const stubs: HarnessStubs = {
    realtimeSession: { IsActive: false },
    loadSessionReview: vi.fn(),
    detectChanges: vi.fn()
  };
  const open = component as unknown as Record<string, unknown>;
  open['RealtimeReview'] = null;
  open['_conversationId'] = null;
  open['isInitialized'] = false; // keep the setter from invoking the heavy load path
  open['Provider'] = {}; // ProviderToUse resolves to this stub, never the global Metadata.Provider
  open['RealtimeSession'] = stubs.realtimeSession;
  open['realtimeReviewService'] = { LoadSessionReview: stubs.loadSessionReview };
  open['cdr'] = { detectChanges: stubs.detectChanges };
  return { component, stubs };
}

describe('Conversation change clears the session review (the stuck-overlay repro)', () => {
  it('clears a hosted review when the conversationId input changes', () => {
    const { component } = createHarness();
    component.conversationId = 'CONV-A';
    component.RealtimeReview = review();

    component.conversationId = 'CONV-B';

    expect(component.RealtimeReview).toBeNull();
  });

  it('clears a hosted review when the conversation changes to NULL (no selection)', () => {
    const { component } = createHarness();
    component.conversationId = 'CONV-A';
    component.RealtimeReview = review();

    component.conversationId = null;

    expect(component.RealtimeReview).toBeNull();
  });

  it('keeps the review when the input re-fires with the SAME conversation', () => {
    const { component } = createHarness();
    component.conversationId = 'CONV-A';
    const hosted = review();
    component.RealtimeReview = hosted;

    component.conversationId = 'CONV-A';

    expect(component.RealtimeReview).toBe(hosted);
  });
});

describe('Overlay Close + explicit clear', () => {
  it('onReviewClosed (the overlay ReviewClosed output) clears the review', () => {
    const { component } = createHarness();
    component.RealtimeReview = review();

    component.onReviewClosed();

    expect(component.RealtimeReview).toBeNull();
  });

  it('ClearRealtimeSessionReview is a safe no-op when nothing is hosted', () => {
    const { component } = createHarness();
    expect(() => component.ClearRealtimeSessionReview()).not.toThrow();
    expect(component.RealtimeReview).toBeNull();
  });
});

describe('OpenRealtimeSessionReview — hosting and staleness guards', () => {
  it('hosts the loaded review for the current conversation and reports success', async () => {
    const { component, stubs } = createHarness();
    component.conversationId = 'CONV-A';
    stubs.loadSessionReview.mockResolvedValue(review({ ConversationID: 'CONV-A' }));

    const opened = await component.OpenRealtimeSessionReview('SESSION-1');

    expect(opened).toBe(true);
    expect(component.RealtimeReview?.SessionID).toBe('SESSION-1');
    expect(stubs.detectChanges).toHaveBeenCalled();
  });

  it('refuses while a LIVE call is active (never fights the live overlay) and does not even load', async () => {
    const { component, stubs } = createHarness();
    stubs.realtimeSession.IsActive = true;

    const opened = await component.OpenRealtimeSessionReview('SESSION-1');

    expect(opened).toBe(false);
    expect(stubs.loadSessionReview).not.toHaveBeenCalled();
    expect(component.RealtimeReview).toBeNull();
  });

  it('reports failure (and hosts nothing) when the session cannot be loaded', async () => {
    const { component, stubs } = createHarness();
    stubs.loadSessionReview.mockResolvedValue(null);

    const opened = await component.OpenRealtimeSessionReview('SESSION-1');

    expect(opened).toBe(false);
    expect(component.RealtimeReview).toBeNull();
  });

  it('discards a load that resolves AFTER a live call started (the call wins)', async () => {
    const { component, stubs } = createHarness();
    stubs.loadSessionReview.mockImplementation(async () => {
      stubs.realtimeSession.IsActive = true; // call starts while the review loads
      return review();
    });

    const opened = await component.OpenRealtimeSessionReview('SESSION-1');

    expect(opened).toBe(false);
    expect(component.RealtimeReview).toBeNull();
  });

  it('discards a load that resolves after the user switched to a DIFFERENT conversation', async () => {
    const { component, stubs } = createHarness();
    component.conversationId = 'CONV-A';
    stubs.loadSessionReview.mockImplementation(async () => {
      component.conversationId = 'CONV-B'; // user moved on mid-load
      return review({ ConversationID: 'CONV-A' });
    });

    const opened = await component.OpenRealtimeSessionReview('SESSION-1');

    expect(opened).toBe(false);
    expect(component.RealtimeReview).toBeNull();
  });

  it('still hosts when the conversation switched mid-load but the review BELONGS to the new one (deep-link race)', async () => {
    const { component, stubs } = createHarness();
    component.conversationId = 'CONV-A';
    stubs.loadSessionReview.mockImplementation(async () => {
      component.conversationId = 'CONV-B'; // deep link selected the session's own conversation
      return review({ ConversationID: 'conv-b' }); // case-insensitive UUID compare
    });

    const opened = await component.OpenRealtimeSessionReview('SESSION-1');

    expect(opened).toBe(true);
    expect(component.RealtimeReview?.ConversationID).toBe('conv-b');
  });
});
