// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * `ReconcileNow` is the recovery path for MJ #4222 — the case where a completion was
 * published while the client's transport was silently dead. Tier 0 makes the socket close;
 * this is what recovers the event dropped while it was down.
 *
 * Two properties make it safe to call from an event handler, and both are easy to break:
 *
 * 1. **It must refresh agent runs BEFORE reconciling.** `reconnectInProgressRuns` decides
 *    from `agentRunsByDetailId`, an in-memory map. On the load path that map was just
 *    populated by a fresh fetch, so the staleness is invisible. A reconcile triggered by a
 *    reconnect has no such fetch in front of it, so without the refresh it reads the same
 *    stale `Running` status it held before the outage and silently no-ops.
 *
 * 2. **It must READ `conversationLoadToken`, never increment it.** That field is a
 *    CANCELLATION token: every in-flight conversation load compares against it and bails when
 *    it changes. Incrementing here would abort a load already running.
 *
 * Built via `Object.create(prototype)` so the real method runs against stubbed collaborators,
 * matching `chat-area-incremental-paging.test.ts` — the component injects a dozen services, so
 * a TestBed render is disproportionate for one method.
 */

interface Harness {
  component: ConversationChatAreaComponent;
  calls: string[];
  open: Record<string, unknown>;
}

function createHarness(overrides: Record<string, unknown> = {}): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const calls: string[] = [];

  open.conversationId = 'CONV-1';
  open.currentUser = { ID: 'U-1' };
  open.conversationLoadToken = 5;

  open.refreshAgentRunsForInProgress = vi.fn(async () => { calls.push('refresh'); });
  open.reconnectInProgressRuns = vi.fn(async () => { calls.push('reconnect'); });
  open.correctStaleErrorMessages = vi.fn(async () => { calls.push('correctStale'); });
  open.isActiveConversationLoad = vi.fn(() => true);

  Object.assign(open, overrides);
  return { component, calls, open };
}

describe('ConversationChatArea.ReconcileNow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refreshes agent runs BEFORE reconciling, so it cannot read stale state', async () => {
    const { component, calls } = createHarness();

    await component.ReconcileNow('socket-reconnected');

    // Order is the whole point. Reversed, the reconcile decides from the pre-outage snapshot
    // and concludes nothing finished.
    expect(calls).toEqual(['refresh', 'reconnect', 'correctStale']);
  });

  it('reads the load token without incrementing it', async () => {
    const { component, open } = createHarness();

    await component.ReconcileNow('tab-visible');

    // Incrementing would cancel an in-flight conversation load rather than tag this work.
    expect(open.conversationLoadToken).toBe(5);
    expect(open.refreshAgentRunsForInProgress).toHaveBeenCalledWith('CONV-1', 5);
  });

  it('does nothing without a conversation', async () => {
    const { component, calls } = createHarness({ conversationId: null });
    await component.ReconcileNow('browser-online');
    expect(calls).toEqual([]);
  });

  it('does nothing without a current user', async () => {
    const { component, calls } = createHarness({ currentUser: null });
    await component.ReconcileNow('browser-online');
    expect(calls).toEqual([]);
  });

  it('abandons the pass when the conversation changed mid-flight', async () => {
    const { component, calls } = createHarness({
      // Refresh succeeds, then the user navigates away before the reconcile runs.
      isActiveConversationLoad: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
    });

    await component.ReconcileNow('socket-reconnected');

    // Repairing messages belonging to a conversation no longer on screen would write the
    // previous conversation's state into the current view.
    expect(calls).toEqual(['refresh']);
  });

  it('swallows a failed reconcile instead of surfacing it', async () => {
    const { component } = createHarness({
      refreshAgentRunsForInProgress: vi.fn(async () => { throw new Error('network down'); }),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Recovery is best-effort and fires on events the user did not initiate — a toast here
    // would turn a transient blip into a visible error. The next trigger retries.
    await expect(component.ReconcileNow('browser-online')).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('runs for every trigger reason the supervisor emits', async () => {
    for (const reason of ['socket-reconnected', 'stream-reconnected', 'tab-visible', 'browser-online']) {
      const { component, calls } = createHarness();
      await component.ReconcileNow(reason);
      expect(calls, `reason ${reason} should reconcile`).toEqual(['refresh', 'reconnect', 'correctStale']);
    }
  });
});
