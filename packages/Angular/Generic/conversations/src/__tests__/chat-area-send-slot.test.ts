// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const notify = vi.fn();
vi.mock('@memberjunction/ng-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ng-notifications')>()),
  MJNotificationService: { get Instance() { return { CreateSimpleNotification: notify }; } },
}));

import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { STOP_RETRY_AFTER_MS } from '../lib/components/message/message-item.component';
import { AfterStopClickedEventArgs, BeforeStopClickedEventArgs } from '../lib/events/chat-events';

/**
 * The composer's send slot as the stop control: the chat area derives the slot's mode, count,
 * label and status line from the replies in flight, stops them all through the same cancelable
 * path as the per-reply pill, holds "stopping" until a reply leaves In-Progress or the retry
 * window passes, and swaps the placeholder after a stopped reply. Built off the prototype as
 * `chat-area-stop-request.test.ts` is.
 */

interface Row { ID: string; Role: string; Agent?: string | null; __mj_CreatedAt?: Date }
interface Harness {
  component: ConversationChatAreaComponent;
  open: Record<string, unknown>;
  cancelAgent: ReturnType<typeof vi.fn>;
  before: BeforeStopClickedEventArgs[];
  after: AfterStopClickedEventArgs[];
}

function createHarness(options: { rows?: Row[]; inFlight?: string[]; runs?: Array<[string, Record<string, unknown>]>; readOnly?: boolean; allow?: boolean; veto?: (e: BeforeStopClickedEventArgs) => void } = {}): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const cancelAgent = vi.fn(async () => true);
  const before: BeforeStopClickedEventArgs[] = [];
  const after: AfterStopClickedEventArgs[] = [];
  const rows = options.rows ?? [{ ID: 'u1', Role: 'User' }, { ID: 'a1', Role: 'AI', Agent: 'Sage', __mj_CreatedAt: new Date(Date.now() - 41_000) }];
  open.messages = rows;
  Object.defineProperty(open, 'DisplayMessages', { get: () => rows, configurable: true });
  Object.defineProperty(open, 'IsReadOnlyView', { get: () => false, configurable: true });
  open.ReadOnly = options.readOnly ?? false;
  open.AllowStopRun = options.allow ?? true;
  open.AgentRunsByDetailId = new Map(options.runs ?? [['a1', { ID: 'run-1', Agent: 'Sage' }]]);
  open.agentStateService = { CancelAgent: cancelAgent, CancelAgentForDetail: vi.fn(async () => true) };
  open.BeforeStopClicked = { emit: (e: BeforeStopClickedEventArgs) => { before.push(e); options.veto?.(e); } };
  open.AfterStopClicked = { emit: (e: AfterStopClickedEventArgs) => after.push(e) };
  Object.defineProperty(open, 'OpenView', { get: () => ({ Kind: 'Main' }), configurable: true });
  open.ConversationId = 'conv-1';
  open.cdr = { markForCheck: vi.fn() };
  open.StoppingDetailIds = new Set<string>();
  open._stopFallbackTimers = new Map();
  open._sendSlotTicker = null;
  open._inProgressMessageIds = [];
  component.InProgressMessageIds = options.inFlight ?? ['a1'];
  return { component, open, cancelAgent, before, after };
}

describe('ConversationChatArea — the send slot as the stop control', () => {
  beforeEach(() => { vi.useFakeTimers(); notify.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is Send with nothing in flight, read-only, or when the host turns stopping off', () => {
    expect(createHarness({ inFlight: [] }).component.SendSlotMode).toBe('send');
    expect(createHarness({ readOnly: true }).component.SendSlotMode).toBe('send');
    expect(createHarness({ allow: false }).component.SendSlotMode).toBe('send');
    expect(createHarness({ inFlight: [] }).component.StatusText).toBeNull();
    expect(createHarness({ inFlight: [] }).component.StopCount).toBe(0);
  });

  it('with one run: Stop, named for the agent, with a status line and the elapsed time', () => {
    const h = createHarness();
    expect(h.component.SendSlotMode).toBe('stop');
    expect(h.component.StopCount).toBe(1);
    expect(h.component.StopLabel).toBe('Stop Sage');
    expect(h.component.StatusText).toBe('Sage is working');
    expect(h.component.StatusElapsed).toBe('0:41');
  });

  it('with two runs: Stop all with the count, and a status line that counts agents', () => {
    const rows: Row[] = [{ ID: 'a1', Role: 'AI', Agent: 'Sage' }, { ID: 'a2', Role: 'AI', Agent: 'Research Agent' }];
    const h = createHarness({ rows, inFlight: ['a1', 'a2'], runs: [['a1', { ID: 'run-1', Agent: 'Sage' }], ['a2', { ID: 'run-2', Agent: 'Research Agent' }]] });
    expect(h.component.StopCount).toBe(2);
    expect(h.component.StopLabel).toBe('Stop all 2 runs');
    expect(h.component.StatusText).toBe('2 agents working');
    expect(h.component.StatusElapsed).toBeNull();
    expect(h.component.InFlightCount).toBe(2);
  });

  it('a click stops every in-flight run through the cancelable path and reads as stopping', async () => {
    const rows: Row[] = [{ ID: 'a1', Role: 'AI', Agent: 'Sage' }, { ID: 'a2', Role: 'AI', Agent: 'Research Agent' }];
    const h = createHarness({ rows, inFlight: ['a1', 'a2'], runs: [['a1', { ID: 'run-1', Agent: 'Sage' }], ['a2', { ID: 'run-2', Agent: 'Research Agent' }]] });
    await h.component.OnComposerStopClicked();
    expect(h.before.map((e) => e.ConversationDetailId)).toEqual(['a1', 'a2']);
    expect(h.cancelAgent.mock.calls.map((c) => c[0])).toEqual(['run-1', 'run-2']);
    expect(h.after).toHaveLength(2);
    expect(h.component.SendSlotMode).toBe('stopping');
    expect(h.component.StatusText).toBe('Stopping 2 runs…');
  });

  it('a run a listener vetoes is skipped and stays in flight', async () => {
    const rows: Row[] = [{ ID: 'a1', Role: 'AI', Agent: 'Sage' }, { ID: 'a2', Role: 'AI', Agent: 'Research Agent' }];
    const h = createHarness({ rows, inFlight: ['a1', 'a2'], runs: [['a1', { ID: 'run-1', Agent: 'Sage' }], ['a2', { ID: 'run-2', Agent: 'Research Agent' }]], veto: (e) => { if (e.ConversationDetailId === 'a1') { e.Cancel = true; } } });
    await h.component.OnComposerStopClicked();
    expect(h.cancelAgent.mock.calls.map((c) => c[0])).toEqual(['run-2']);
    expect(h.component.StoppingDetailIds.has('a1')).toBe(false);
    expect(h.component.StoppingDetailIds.has('a2')).toBe(true);
  });

  it('stopping clears when the reply leaves In-Progress', async () => {
    const h = createHarness();
    await h.component.OnComposerStopClicked();
    expect(h.component.SendSlotMode).toBe('stopping');
    expect(h.component.StatusText).toBe('Stopping Sage…');
    h.component.InProgressMessageIds = [];
    expect(h.component.SendSlotMode).toBe('send');
    expect(h.component.StoppingDetailIds.size).toBe(0);
  });

  it('after the retry window with the run still going, offers Stop again and says the stop did not take', async () => {
    const h = createHarness();
    await h.component.OnComposerStopClicked();
    vi.advanceTimersByTime(STOP_RETRY_AFTER_MS);
    expect(h.component.SendSlotMode).toBe('stop');
    expect(notify).toHaveBeenCalledWith('Sage did not stop. Try again.', 'warning', 4000);
  });

  it('a click while the slot is not Stop does nothing', async () => {
    const h = createHarness({ inFlight: [] });
    await h.component.OnComposerStopClicked();
    expect(h.cancelAgent).not.toHaveBeenCalled();
  });

  it('the placeholder invites a continuation after a reply the user stopped, and only then', () => {
    const h = createHarness({ inFlight: [], runs: [['a1', { ID: 'run-1', Agent: 'Sage', WasStoppedByUser: true }]] });
    expect(h.component.ComposerPlaceholderFor('conv-1')).toBe('Continue, or tell Sage what to do differently');
    const settled = createHarness({ inFlight: [], runs: [['a1', { ID: 'run-1', Agent: 'Sage', WasStoppedByUser: false }]] });
    expect(settled.component.ComposerPlaceholderFor('conv-1')).toBe('Type a message... (Ctrl+Enter to send)');
    expect(h.component.ComposerPlaceholderFor('other-conv')).toBe('Type a message... (Ctrl+Enter to send)');
  });

  it('keeps the plain placeholder after a stopped reply when the host turns stopping off', () => {
    const off = createHarness({ inFlight: [], allow: false, runs: [['a1', { ID: 'run-1', Agent: 'Sage', WasStoppedByUser: true }]] });
    expect(off.component.ComposerPlaceholderFor('conv-1')).toBe('Type a message... (Ctrl+Enter to send)');
  });

  it('with stopping off, a reply in flight leaves the slot as Send, with no status line and nothing to stop', async () => {
    const off = createHarness({ allow: false });
    expect(off.component.SendSlotMode).toBe('send');
    expect(off.component.StatusText).toBeNull();
    expect(off.component.StopCount).toBe(0);
    await off.component.OnComposerStopClicked();
    expect(off.cancelAgent).not.toHaveBeenCalled();
  });

  it('formats elapsed time like the reply\'s time pill', () => {
    expect(ConversationChatAreaComponent.FormatElapsed(41_000)).toBe('0:41');
    expect(ConversationChatAreaComponent.FormatElapsed(5 * 60_000 + 3_000)).toBe('5:03');
    expect(ConversationChatAreaComponent.FormatElapsed(3_600_000 + 7_000)).toBe('1:00:07');
  });
});
