// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * `refreshAgentRunsForInProgress` is what every on-demand reconcile reads from, so the run it
 * leaves in `agentRunsByDetailId` decides whether a message is judged against its latest attempt
 * or an abandoned one (MJ #4222).
 *
 * The query orders `__mj_CreatedAt DESC`, so the newest row for a detail arrives first and must
 * win — including when the map already holds an older run from an earlier pass. A detail can
 * accumulate several runs: a task-graph continuation reinvokes the agent against the same
 * `ConversationDetailID`. Judging the message on the older run reconciles against work that was
 * already superseded.
 */

const DETAIL = 'DETAIL-1';
const OLD_RUN = { ID: 'RUN-OLD', ConversationDetailID: DETAIL, Status: 'Failed' };
const NEW_RUN = { ID: 'RUN-NEW', ConversationDetailID: DETAIL, Status: 'Running' };

function createHarness(preloaded: unknown | null, rows: unknown[]) {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;

  open.conversationId = 'CONV-1';
  open.currentUser = { ID: 'U-1' };
  open.messages = [{ ID: DETAIL, Status: 'In-Progress', Role: 'AI' }];
  open.agentRunsByDetailId = new Map(preloaded ? [[DETAIL, preloaded]] : []);
  open.isActiveConversationLoad = vi.fn(() => true);

  const runView = vi.fn(async () => ({ Success: true, Results: rows }));
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);

  return { component, open, runView };
}

function runIdFor(open: Record<string, unknown>): string {
  return (open.agentRunsByDetailId as Map<string, { ID: string }>).get(DETAIL)!.ID;
}

describe('ConversationChatArea.refreshAgentRunsForInProgress', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('takes the newest run when the map is empty', async () => {
    const { open } = createHarness(null, [NEW_RUN, OLD_RUN]);

    await (open.refreshAgentRunsForInProgress as (c: string, t: number) => Promise<void>)('CONV-1', 0);

    expect(runIdFor(open)).toBe('RUN-NEW');
  });

  it('replaces an older run already in the map with the newest one', async () => {
    // The map is cleared only on conversation load, so a reconcile pass routinely starts with a
    // run already in it. Keeping the older one here is what makes the reconcile judge a retried
    // message on an attempt that is already over.
    const { open } = createHarness(OLD_RUN, [NEW_RUN, OLD_RUN]);

    await (open.refreshAgentRunsForInProgress as (c: string, t: number) => Promise<void>)('CONV-1', 0);

    expect(runIdFor(open)).toBe('RUN-NEW');
  });

  it('refreshes in place when the newest run is the one already held', async () => {
    const { open } = createHarness(NEW_RUN, [NEW_RUN]);

    await (open.refreshAgentRunsForInProgress as (c: string, t: number) => Promise<void>)('CONV-1', 0);

    expect(runIdFor(open)).toBe('RUN-NEW');
  });

  it('publishes a new map reference so OnPush children re-read it', async () => {
    const { open } = createHarness(OLD_RUN, [NEW_RUN]);
    const before = open.agentRunsByDetailId;

    await (open.refreshAgentRunsForInProgress as (c: string, t: number) => Promise<void>)('CONV-1', 0);

    expect(open.agentRunsByDetailId).not.toBe(before);
  });
});
