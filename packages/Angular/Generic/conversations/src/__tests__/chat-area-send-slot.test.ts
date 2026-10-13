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

interface Row { ID: string; Role: string; Agent?: string | null; __mj_CreatedAt?: Date; UserID?: string | null; ParentID?: string | null }
interface Harness {
  component: ConversationChatAreaComponent;
  open: Record<string, unknown>;
  cancelAgent: ReturnType<typeof vi.fn>;
  before: BeforeStopClickedEventArgs[];
  after: AfterStopClickedEventArgs[];
}

interface HarnessOptions {
  rows?: Row[];
  inFlight?: string[];
  runs?: Array<[string, Record<string, unknown>]>;
  readOnly?: boolean;
  allow?: boolean;
  veto?: (e: BeforeStopClickedEventArgs) => void;
  /** The viewer. Unset (the default) means ownership is not checked, as a host that binds no user gets. */
  currentUserId?: string;
  /** The conversation's owner; defaults to someone other than the viewer. */
  ownerId?: string;
  /** The grant level the viewer holds on a conversation they do not own. */
  grant?: 'View' | 'Edit' | 'Owner' | null;
}

function createHarness(options: HarnessOptions = {}): Harness {
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
  if (options.currentUserId) {
    const ownerId = options.ownerId ?? 'someone-else';
    open.CurrentUser = { ID: options.currentUserId };
    open.Conversation = { ID: 'conv-1', UserID: ownerId };
    // The engine's rule: the owner, or an Owner-level grant.
    open.engine = { CanShareConversation: (c: { UserID: string }, u: string) => c.UserID === u || options.grant === 'Owner' };
  }
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

  it('formats elapsed time like the reply\'s time pill', () => {
    expect(ConversationChatAreaComponent.FormatElapsed(41_000)).toBe('0:41');
    expect(ConversationChatAreaComponent.FormatElapsed(5 * 60_000 + 3_000)).toBe('5:03');
    expect(ConversationChatAreaComponent.FormatElapsed(3_600_000 + 7_000)).toBe('1:00:07');
  });
});

describe('ConversationChatArea — Stop all stops only the viewer\'s own runs', () => {
  beforeEach(() => { vi.useFakeTimers(); notify.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  const MINE = 'me';
  const THEIRS = 'them';
  const twoRuns = (): Row[] => [
    { ID: 'u1', Role: 'User', UserID: MINE },
    { ID: 'a1', Role: 'AI', Agent: 'Sage', __mj_CreatedAt: new Date(Date.now() - 41_000) },
    { ID: 'u2', Role: 'User', UserID: THEIRS },
    { ID: 'a2', Role: 'AI', Agent: 'Research Agent', __mj_CreatedAt: new Date(Date.now() - 10_000) },
  ];

  it('leaves the slot as Send, and says whose work it is, while only another user\'s run is in flight', async () => {
    const h = createHarness({
      currentUserId: MINE,
      rows: [{ ID: 'u2', Role: 'User', UserID: THEIRS }, { ID: 'a2', Role: 'AI', Agent: 'Sage' }],
      inFlight: ['a2'],
      runs: [['a2', { ID: 'run-2', Agent: 'Sage', UserID: THEIRS }]],
    });
    expect(h.component.CanStopDetail('a2')).toBe(false);
    expect(h.component.StoppableDetailIds).toEqual([]);
    expect(h.component.SendSlotMode).toBe('send');
    expect(h.component.StopCount).toBe(0);
    expect(h.component.StatusText).toBe('Sage is working for another user');
    expect(h.component.StatusElapsed).toBeNull();

    await h.component.OnComposerStopClicked();
    expect(h.cancelAgent).not.toHaveBeenCalled();
    expect(h.before).toHaveLength(0);
  });

  it('with the viewer\'s run beside another user\'s, offers Stop for the viewer\'s run only and stops only it', async () => {
    const h = createHarness({
      currentUserId: MINE,
      rows: twoRuns(),
      inFlight: ['a1', 'a2'],
      runs: [['a1', { ID: 'run-1', Agent: 'Sage', UserID: MINE }], ['a2', { ID: 'run-2', Agent: 'Research Agent', UserID: THEIRS }]],
    });
    expect(h.component.StoppableDetailIds).toEqual(['a1']);
    expect(h.component.SendSlotMode).toBe('stop');
    expect(h.component.StopCount).toBe(1);
    expect(h.component.StopLabel).toBe('Stop Sage');
    expect(h.component.StatusText).toBe('Sage is working');
    expect(h.component.OthersInFlightCount).toBe(1);

    await h.component.OnComposerStopClicked();
    expect(h.cancelAgent).toHaveBeenCalledTimes(1);
    expect(h.cancelAgent).toHaveBeenCalledWith('run-1');
    expect(h.before.map((e) => e.ConversationDetailId)).toEqual(['a1']);
  });

  it('the conversation\'s owner stops every run, including other users\'', async () => {
    const h = createHarness({
      currentUserId: MINE,
      ownerId: MINE,
      rows: twoRuns(),
      inFlight: ['a1', 'a2'],
      runs: [['a1', { ID: 'run-1', Agent: 'Sage', UserID: MINE }], ['a2', { ID: 'run-2', Agent: 'Research Agent', UserID: THEIRS }]],
    });
    expect(h.component.CanStopAnyRun).toBe(true);
    expect(h.component.StopCount).toBe(2);
    expect(h.component.StopLabel).toBe('Stop all 2 runs');

    await h.component.OnComposerStopClicked();
    expect(h.cancelAgent.mock.calls.map((c) => c[0])).toEqual(['run-1', 'run-2']);
  });

  it('an Owner-level grant counts as owning the conversation; an Edit grant does not', () => {
    const base = {
      currentUserId: MINE,
      rows: twoRuns(),
      inFlight: ['a1', 'a2'],
      runs: [['a1', { ID: 'run-1', Agent: 'Sage', UserID: MINE }], ['a2', { ID: 'run-2', Agent: 'Research Agent', UserID: THEIRS }]] as Array<[string, Record<string, unknown>]>,
    };
    expect(createHarness({ ...base, grant: 'Owner' }).component.StopCount).toBe(2);
    expect(createHarness({ ...base, grant: 'Edit' }).component.StopCount).toBe(1);
  });

  it('reads the starter from the reply, then from the request it answers, when the run is not loaded yet', () => {
    const rows: Row[] = [
      { ID: 'u1', Role: 'User', UserID: THEIRS },
      { ID: 'a1', Role: 'AI', Agent: 'Sage', ParentID: 'u1' },
      { ID: 'a3', Role: 'AI', Agent: 'Sage', UserID: THEIRS },
      { ID: 'a4', Role: 'AI', Agent: 'Sage' },
    ];
    const h = createHarness({ currentUserId: MINE, rows, inFlight: ['a1', 'a3', 'a4'], runs: [] });
    expect(h.component.CanStopDetail('a1')).toBe(false); // the request was someone else's
    expect(h.component.CanStopDetail('a3')).toBe(false); // the reply names someone else
    expect(h.component.CanStopDetail('a4')).toBe(true);  // nothing says whose it is: the viewer's own
    expect(h.component.StoppableDetailIds).toEqual(['a4']);
  });

  it('stops everything in flight when the host binds no viewer (ownership cannot be checked)', () => {
    const h = createHarness({
      rows: twoRuns(),
      inFlight: ['a1', 'a2'],
      runs: [['a1', { ID: 'run-1', Agent: 'Sage', UserID: MINE }], ['a2', { ID: 'run-2', Agent: 'Research Agent', UserID: THEIRS }]],
    });
    expect(h.component.StopCount).toBe(2);
  });

  it('counts several other users\' runs in the status line while the slot stays Send', () => {
    const h = createHarness({
      currentUserId: MINE,
      rows: twoRuns(),
      inFlight: ['a1', 'a2'],
      runs: [['a1', { ID: 'run-1', Agent: 'Sage', UserID: THEIRS }], ['a2', { ID: 'run-2', Agent: 'Research Agent', UserID: THEIRS }]],
    });
    expect(h.component.SendSlotMode).toBe('send');
    expect(h.component.StatusText).toBe('2 agents working for other users');
  });
});
