// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import type { ConversationTailResult } from '@memberjunction/conversations-runtime';

/**
 * Tier 2 of MJ #4222, client side: the durable tail as the last step of the recovery chain.
 *
 * Every other step here reads `MJ: AI Agent Runs` through the client's own provider. When that
 * returns nothing the message simply waits — which is exactly the reported symptom, a message
 * spinning forever after its completion was dropped. The tail asks the server the same question
 * from a cursor, over plain HTTP, so it answers while the WebSocket is still dead.
 *
 * What must hold, and what each failure would look like:
 *
 * - **A failed or inconclusive read completes nothing.** Otherwise a transient network error
 *   would end a live message with no answer on it — worse than the bug being fixed.
 * - **Completion routes through `handleMessageCompletion`.** Four writers already move a message
 *   out of In-Progress; a fifth would race them.
 * - **A conversation switched mid-read is not written to.** The result belongs to the old view.
 */

interface Harness {
  component: ConversationChatAreaComponent;
  open: Record<string, unknown>;
  completions: string[];
  forgotten: string[];
  tail: ReturnType<typeof vi.fn>;
}

const MESSAGE = { ID: 'MSG-1', Status: 'In-Progress', Role: 'AI' };

const tailResult = (over: Partial<ConversationTailResult> = {}): ConversationTailResult => ({
  Success: true,
  Message: '',
  Events: [],
  LatestSeq: 0,
  IsInFlight: true,
  ...over,
});

function createHarness(result: ConversationTailResult, opts: { stillActive?: boolean } = {}): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const completions: string[] = [];
  const forgotten: string[] = [];

  const tail = vi.fn(async () => result);
  vi.spyOn(ConversationsRuntime.Instance, 'Tail', 'get').mockReturnValue({
    Tail: tail,
    Forget: (id: string) => forgotten.push(id),
  } as unknown as ConversationsRuntime['Tail']);

  open.isActiveConversationLoad = vi.fn(() => opts.stillActive !== false);
  open.handleMessageCompletion = vi.fn(async (msg: { ID: string }) => {
    completions.push(msg.ID);
  });

  return { component, open, completions, forgotten, tail };
}

function recover(h: Harness): Promise<boolean> {
  const fn = h.open.tryRecoverFromTail as (
    m: typeof MESSAGE,
    c: string,
    t: number
  ) => Promise<boolean>;
  return fn.call(h.component, MESSAGE, 'CONV-1', 7);
}

describe('ConversationChatAreaComponent.tryRecoverFromTail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes the message when the tail reports a finished run', async () => {
    const h = createHarness(tailResult({ RunID: 'RUN-1', RunStatus: 'Completed', IsInFlight: false }));

    await expect(recover(h)).resolves.toBe(true);
    expect(h.completions).toEqual(['MSG-1']);
  });

  it('completes the message when the detail itself is terminal but no run exists', async () => {
    // The gap the run-map path cannot cover: nothing in `MJ: AI Agent Runs` to read.
    const h = createHarness(tailResult({ IsInFlight: false, DetailStatus: 'Complete' }));

    await expect(recover(h)).resolves.toBe(true);
    expect(h.completions).toEqual(['MSG-1']);
  });

  it('completes the message when the detail ended in error', async () => {
    const h = createHarness(tailResult({ IsInFlight: false, DetailStatus: 'Error' }));

    await expect(recover(h)).resolves.toBe(true);
  });

  it('leaves the message alone while the run is genuinely still in flight', async () => {
    const h = createHarness(tailResult({ RunID: 'RUN-1', RunStatus: 'Running', IsInFlight: true }));

    await expect(recover(h)).resolves.toBe(false);
    expect(h.completions).toEqual([]);
  });

  it('completes nothing when the tail read failed', async () => {
    const h = createHarness(tailResult({ Success: false, IsInFlight: false, DetailStatus: 'Complete' }));

    await expect(recover(h)).resolves.toBe(false);
    expect(h.completions).toEqual([]);
  });

  it('completes nothing when the conversation changed during the read', async () => {
    const h = createHarness(
      tailResult({ RunID: 'RUN-1', IsInFlight: false }),
      { stillActive: false }
    );

    await expect(recover(h)).resolves.toBe(false);
    expect(h.completions).toEqual([]);
  });

  it('drops the cursor once the message is terminal', async () => {
    const h = createHarness(tailResult({ RunID: 'RUN-1', IsInFlight: false }));

    await recover(h);

    expect(h.forgotten).toEqual(['MSG-1']);
  });

  it('does not complete a message whose detail the server still reports as open', async () => {
    // The orphan window: the run is over but its detail was never closed, because the process
    // died between the two writes. `handleMessageCompletion` re-reads the detail rather than
    // writing it, so completing here cannot settle the message — it reloads the whole
    // conversation and leaves it spinning, then repeats on the next trigger. The server-side
    // reconciler is what closes that row.
    const h = createHarness(tailResult({
      RunID: 'RUN-1',
      RunStatus: 'Completed',
      IsInFlight: false,
      DetailStatus: 'In-Progress',
    }));

    await expect(recover(h)).resolves.toBe(false);
    expect(h.completions).toEqual([]);
  });

  it('keeps the cursor through the orphan window', async () => {
    const h = createHarness(tailResult({
      RunID: 'RUN-1',
      IsInFlight: false,
      DetailStatus: 'In-Progress',
    }));

    await recover(h);

    expect(h.forgotten).toEqual([]);
  });

  it('completes once the reconciler has closed the detail', async () => {
    const h = createHarness(tailResult({
      RunID: 'RUN-1',
      RunStatus: 'Completed',
      IsInFlight: false,
      DetailStatus: 'Complete',
    }));

    await expect(recover(h)).resolves.toBe(true);
    expect(h.completions).toEqual(['MSG-1']);
    expect(h.forgotten).toEqual(['MSG-1']);
  });

  it('keeps the cursor while the run is still in flight', async () => {
    const h = createHarness(tailResult({ RunID: 'RUN-1', IsInFlight: true }));

    await recover(h);

    expect(h.forgotten).toEqual([]);
  });

  it('routes completion through handleMessageCompletion with the run id the tail reported', async () => {
    const h = createHarness(tailResult({ RunID: 'RUN-7', IsInFlight: false }));

    await recover(h);

    const call = vi.mocked(h.open.handleMessageCompletion as (...a: unknown[]) => unknown).mock.calls[0];
    expect(call[1]).toBe('RUN-7');
    expect(call[2]).toBe('CONV-1');
    expect(call[3]).toBe(7);
  });
});

/**
 * The tail is consulted for EVERY in-progress message, not only ones with no run row.
 *
 * Gate 7 of the manual runbook could not be reproduced: with HTTP healthy the run-map lookup always
 * succeeds, so the old "only when the run is missing" branch was unreachable outside a sub-second
 * INSERT race — the client tail was effectively dead code. It also meant the one thing the run map
 * cannot carry, the conversation detail's own status, was never read on the recovery path.
 */
describe('ConversationChatAreaComponent.reconnectInProgressRuns tail usage', () => {
  afterEach(() => vi.restoreAllMocks());

  function listHarness(result: ConversationTailResult, runStatus?: string) {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    const completions: string[] = [];
    const tail = vi.fn(async () => result);

    vi.spyOn(ConversationsRuntime.Instance, 'Tail', 'get').mockReturnValue({
      Tail: tail,
      Forget: vi.fn(),
    } as unknown as ConversationsRuntime['Tail']);

    open.messages = [MESSAGE];
    open.agentRunsByDetailId = new Map(
      runStatus ? [[MESSAGE.ID, { ID: 'RUN-1', Status: runStatus }]] : []
    );
    open.isActiveConversationLoad = vi.fn(() => true);
    open.handleMessageCompletion = vi.fn(async (m: { ID: string }) => { completions.push(m.ID); });

    return { component, open, tail, completions };
  }

  const run = (h: { component: ConversationChatAreaComponent; open: Record<string, unknown> }) =>
    (h.open.reconnectInProgressRuns as (c: string, t: number) => Promise<void>).call(h.component, 'CONV-1', 7);

  it('consults the tail when the run row still reads as running', async () => {
    const h = listHarness(tailResult({ RunID: 'RUN-1', IsInFlight: true }), 'Running');
    await run(h);
    expect(h.tail).toHaveBeenCalledWith(MESSAGE.ID);
  });

  it('completes from the detail status even while the run row says running', async () => {
    // The run is not the only thing that can finish a message; the run map cannot see this.
    const h = listHarness(tailResult({ RunID: 'RUN-1', IsInFlight: false, DetailStatus: 'Complete' }), 'Running');
    await run(h);
    expect(h.completions).toEqual([MESSAGE.ID]);
  });

  it('consults the tail even when the run is already terminal', async () => {
    const h = listHarness(tailResult({ RunID: 'RUN-1', IsInFlight: false, DetailStatus: 'Complete' }), 'Completed');
    await run(h);
    expect(h.tail).toHaveBeenCalledWith(MESSAGE.ID);
  });

  it('does not complete a message whose detail is still open beside a finished run', async () => {
    // The orphan window seen from the run map: the run is over but its detail was never closed.
    // Completing from the run alone reloads the whole conversation on every trigger and leaves
    // the message spinning until the server-side reconciler closes the detail.
    const h = listHarness(tailResult({
      RunID: 'RUN-1',
      RunStatus: 'Completed',
      IsInFlight: false,
      DetailStatus: 'In-Progress',
    }), 'Completed');
    await run(h);
    expect(h.completions).toEqual([]);
  });

  it('completes a message with a finished run once its detail is closed', async () => {
    const h = listHarness(tailResult({ RunID: 'RUN-1', IsInFlight: false, DetailStatus: 'Complete' }), 'Completed');
    await run(h);
    expect(h.completions).toEqual([MESSAGE.ID]);
  });

  it('still consults the tail when there is no run row at all', async () => {
    const h = listHarness(tailResult({ IsInFlight: true }));
    await run(h);
    expect(h.tail).toHaveBeenCalledWith(MESSAGE.ID);
  });

  it('leaves the message alone when durable state agrees it is running', async () => {
    const h = listHarness(tailResult({ RunID: 'RUN-1', IsInFlight: true }), 'Running');
    await run(h);
    expect(h.completions).toEqual([]);
  });
});
