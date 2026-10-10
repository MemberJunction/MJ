// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const notify = vi.fn();
vi.mock('@memberjunction/ng-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ng-notifications')>()),
  MJNotificationService: { get Instance() { return { CreateSimpleNotification: notify }; } },
}));

import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { AfterStopClickedEventArgs } from '../lib/events/chat-events';

/**
 * The chat area's side of the stop pair: it resolves the run behind the reply (mapped, or by
 * the reply's detail id), asks the agent state service to stop it, and fires `AfterStopClicked`
 * with the outcome, so a host that let the `BeforeStopClicked` through learns what happened.
 * Built off the prototype as `chat-area-reconcile.test.ts` is.
 */
interface Harness {
  component: ConversationChatAreaComponent;
  cancelAgent: ReturnType<typeof vi.fn>;
  cancelForDetail: ReturnType<typeof vi.fn>;
  after: AfterStopClickedEventArgs[];
}

function createHarness(options: { mapped?: boolean; stopped?: boolean } = {}): Harness {
  const { mapped = true, stopped = true } = options;
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const cancelAgent = vi.fn(async () => stopped);
  const cancelForDetail = vi.fn(async () => stopped);
  const after: AfterStopClickedEventArgs[] = [];
  open.AgentRunsByDetailId = new Map(mapped ? [['m1', { ID: 'run-1' }]] : []);
  open.agentStateService = { CancelAgent: cancelAgent, CancelAgentForDetail: cancelForDetail };
  open.AfterStopClicked = { emit: (e: AfterStopClickedEventArgs) => after.push(e) };
  return { component, cancelAgent, cancelForDetail, after };
}

const message = { ID: 'm1' } as unknown as Parameters<ConversationChatAreaComponent['OnStopMessage']>[0];

describe('ConversationChatArea.OnStopMessage', () => {
  beforeEach(() => notify.mockClear());

  it('stops the mapped run and reports success with the run id', async () => {
    const h = createHarness();
    await h.component.OnStopMessage(message);

    expect(h.cancelAgent).toHaveBeenCalledWith('run-1');
    expect(h.cancelForDetail).not.toHaveBeenCalled();
    expect(h.after).toHaveLength(1);
    expect(h.after[0]).toMatchObject({ ConversationDetailId: 'm1', AgentRunId: 'run-1', Stopped: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('falls back to the reply\'s detail id when the run row has not been seen yet', async () => {
    const h = createHarness({ mapped: false });
    await h.component.OnStopMessage(message);

    expect(h.cancelForDetail).toHaveBeenCalledWith('m1');
    expect(h.after[0]).toMatchObject({ ConversationDetailId: 'm1', AgentRunId: null, Stopped: true });
  });

  it('reports a stop that did not take, and tells the person', async () => {
    const h = createHarness({ stopped: false });
    await h.component.OnStopMessage(message);

    expect(h.after[0].Stopped).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
