// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';

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

describe('ConversationChatArea.ReconcileNow overlapping callers', () => {
  /**
   * REGRESSION: every quiet message asked for its own pass, and nothing stopped passes overlapping.
   * Each pass tails every in-progress message, so N quiet rows made about N² tail calls per window,
   * and two overlapping passes could complete the same message twice.
   */

  /** A refresh stub whose passes stay open until released, recording how many run at once. */
  function gatedRefresh() {
    const gates: Array<() => void> = [];
    let running = 0;
    let maxConcurrent = 0;
    const refresh = vi.fn(async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise<void>(resolve => gates.push(resolve));
      running--;
    });
    const releaseNext = async () => {
      gates.shift()?.();
      // Let the pass finish and any follow-up start.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    const releaseAll = async () => {
      while (gates.length > 0) {
        await releaseNext();
      }
    };
    return { refresh, releaseNext, releaseAll, maxConcurrent: () => maxConcurrent };
  }

  it('never runs two passes at once, and folds mid-pass requests into one follow-up', async () => {
    const gate = gatedRefresh();
    const { component } = createHarness({ refreshAgentRunsForInProgress: gate.refresh });

    const first = component.ReconcileNow('message-liveness');
    const second = component.ReconcileNow('message-liveness');
    const third = component.ReconcileNow('message-liveness');

    await gate.releaseNext(); // first pass ends; one follow-up starts for the two waiting callers
    await gate.releaseAll(); // follow-up ends
    await Promise.all([first, second, third]);

    expect(gate.refresh).toHaveBeenCalledTimes(2);
    expect(gate.maxConcurrent()).toBe(1);
  });

  it('does not resolve a mid-pass caller until a pass that started after its request has finished', async () => {
    // A completion can land while a pass is already reading. Handing the caller that pass's result
    // would drop it; the caller must wait for the follow-up.
    const gate = gatedRefresh();
    const { component } = createHarness({ refreshAgentRunsForInProgress: gate.refresh });

    void component.ReconcileNow('socket-reconnected');
    let lateResolved = false;
    void component.ReconcileNow('completion-for-unloaded-message').then(() => { lateResolved = true; });

    await gate.releaseNext();
    expect(lateResolved).toBe(false);

    await gate.releaseNext();
    expect(lateResolved).toBe(true);
  });

  it('starts a fresh pass once the previous one has finished, even if it failed', async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined);
    const { component } = createHarness({ refreshAgentRunsForInProgress: refresh });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await component.ReconcileNow('browser-online');
    await component.ReconcileNow('browser-online');

    expect(refresh).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});

describe('ConversationChatArea.OnLivenessCheckRequested', () => {
  it('goes through the coalescing liveness trigger rather than starting a pass directly', () => {
    // Quiet rows ask within the same second or so. The runtime's trigger collapses a burst into
    // one pass; calling ReconcileNow per row would start one pass per row.
    const trigger = vi.spyOn(ConversationsRuntime.Instance.Liveness, 'Trigger').mockImplementation(() => {});
    const { component, calls } = createHarness();

    component.OnLivenessCheckRequested('MSG-1');

    expect(trigger).toHaveBeenCalledWith('message-liveness');
    expect(calls).toEqual([]);
    trigger.mockRestore();
  });
});
