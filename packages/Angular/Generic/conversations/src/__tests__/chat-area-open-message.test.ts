// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Subject } from 'rxjs';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW, ReadBranchIdOf, type ConversationOpenView } from '../lib/utils/conversation-forks';

/**
 * `OpenMessage`: opens a search hit in the active conversation. It opens the hit's fork (a Main
 * hit opens Main) when that is not the open view, pages older history until the window holds the
 * hit's sequence, scrolls to the row and highlights it for 2 s.
 *
 * Built via `Object.create(prototype)` so the real methods run against stubbed collaborators,
 * matching `chat-area-open-view.test.ts`.
 */

interface Row {
  ID: string;
  ConversationID: string;
  BranchID: string | null;
  Sequence: number;
}

/** A window store over a fixed path: `LoadOlder` prepends the next page of `history`. */
class FakeWindowStore {
  public Loaded: Row[];
  public LoadOlderCalls = 0;

  constructor(private history: Row[], private pageSize: number) {
    this.Loaded = history.slice(-pageSize);
  }

  public Show(history: Row[]): void {
    this.history = history;
    this.Loaded = history.slice(-this.pageSize);
  }

  public GetSnapshot(): { Details: Row[]; Cursor: { OldestSequence: number | null; HasMoreAbove: boolean } } {
    return {
      Details: [...this.Loaded],
      Cursor: {
        OldestSequence: this.Loaded[0]?.Sequence ?? null,
        HasMoreAbove: this.Loaded.length < this.history.length,
      },
    };
  }

  public async LoadOlder(): Promise<void> {
    this.LoadOlderCalls++;
    const start = Math.max(0, this.history.length - this.Loaded.length - this.pageSize);
    this.Loaded = this.history.slice(start);
  }
}

function rows(branchId: string | null, from: number, to: number): Row[] {
  const out: Row[] = [];
  for (let s = from; s <= to; s++) {
    out.push({ ID: `${branchId ?? 'TRUNK'}-${s}`, ConversationID: 'CONV-1', BranchID: branchId, Sequence: s });
  }
  return out;
}

const TRUNK = rows(null, 1, 30);
const BRANCH_B = [...rows(null, 1, 2), ...rows('BRANCH-B', 3, 12)];
/** A sibling of B: forked from Main at the same point. */
const BRANCH_C = [...rows(null, 1, 2), ...rows('BRANCH-C', 3, 8)];

function pathOf(branchId: string | null): Row[] {
  return branchId === 'BRANCH-B' ? BRANCH_B : branchId === 'BRANCH-C' ? BRANCH_C : TRUNK;
}

interface Harness {
  component: ConversationChatAreaComponent;
  open: Record<string, unknown>;
  store: FakeWindowStore;
  reload: ReturnType<typeof vi.fn>;
  scrollToMessage: ReturnType<typeof vi.fn>;
  highlighted: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  querySelector: ReturnType<typeof vi.fn>;
  loadEnded: Subject<void>;
}

function createHarness(opts: { view?: ConversationOpenView; ready?: boolean } = {}): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const view = opts.view ?? MAIN_OPEN_VIEW;
  const store = new FakeWindowStore(pathOf(ReadBranchIdOf(view)), 10);
  const reload = vi.fn(async () => {
    store.Show(pathOf(ReadBranchIdOf(open['openView'] as ConversationOpenView)));
    open['messages'] = store.GetSnapshot().Details;
    return true;
  });
  const scrollToMessage = vi.fn(() => true);
  const highlighted = { add: vi.fn(), remove: vi.fn() };
  const querySelector = vi.fn(() => ({ classList: highlighted }));
  const loadEnded = new Subject<void>();

  open['_conversationId'] = 'CONV-1';
  open['CurrentUser'] = { ID: 'USER-1' };
  open['openView'] = view;
  open['viewChangeInFlight'] = false;
  open['readyConversationId'] = opts.ready === false ? null : 'CONV-1';
  open['conversationLoadEnded$'] = loadEnded;
  open['destroy$'] = new Subject<void>();
  open['reloadWindowForView'] = reload;
  open['windowStore'] = store;
  open['RealtimeSession'] = { IsActiveFor: () => false, EndRealtimeSession: vi.fn(async () => undefined) };
  open['messages'] = store.GetSnapshot().Details;
  open['mergePeripheralsForNewRows'] = vi.fn(async () => undefined);
  open['cdr'] = { detectChanges: vi.fn() };
  open['messageListComponent'] = { ScrollToMessage: scrollToMessage };
  open['scrollContainer'] = { nativeElement: { querySelector } };
  open['scrollToBottom'] = false;
  open['bottomFollowSuppressedUntil'] = 0;

  return { component, open, store, reload, scrollToMessage, highlighted, querySelector, loadEnded };
}

describe('ConversationChatAreaComponent.OpenMessage', () => {
  let notify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notify = vi.fn();
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns false for a conversation that is not the active one, and does nothing', async () => {
    const h = createHarness();

    expect(await h.component.OpenMessage('CONV-OTHER', null, 5)).toBe(false);

    expect(h.reload).not.toHaveBeenCalled();
    expect(h.scrollToMessage).not.toHaveBeenCalled();
  });

  it('scrolls to a row already in the window without changing the view', async () => {
    const h = createHarness();

    expect(await h.component.OpenMessage('CONV-1', null, 25)).toBe(true);

    expect(h.reload).not.toHaveBeenCalled();
    expect(h.store.LoadOlderCalls).toBe(0);
    expect(h.scrollToMessage).toHaveBeenCalledWith('TRUNK-25');
  });

  it('pages older history until the window holds the sequence, then scrolls to the row', async () => {
    const h = createHarness();

    expect(await h.component.OpenMessage('CONV-1', null, 4)).toBe(true);

    expect(h.store.LoadOlderCalls).toBe(2);
    expect(h.scrollToMessage).toHaveBeenCalledWith('TRUNK-4');
    expect((h.open['messages'] as Row[]).some(m => m.ID === 'TRUNK-4')).toBe(true);
  });

  it("opens the hit's fork, then scrolls to the row", async () => {
    const h = createHarness();

    expect(await h.component.OpenMessage('CONV-1', 'BRANCH-B', 7)).toBe(true);

    expect(h.component.OpenView).toEqual({ Kind: 'Fork', BranchID: 'BRANCH-B' });
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.scrollToMessage).toHaveBeenCalledWith('BRANCH-B-7');
  });

  it('opens Main for a Main hit while a fork is open, even for a row the fork inherits', async () => {
    const h = createHarness({ view: { Kind: 'Fork', BranchID: 'BRANCH-B' } });

    expect(await h.component.OpenMessage('CONV-1', null, 2)).toBe(true);

    expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.scrollToMessage).toHaveBeenCalledWith('TRUNK-2');
  });

  it('opens a sibling fork for a hit in it', async () => {
    const h = createHarness({ view: { Kind: 'Fork', BranchID: 'BRANCH-B' } });

    expect(await h.component.OpenMessage('CONV-1', 'BRANCH-C', 5)).toBe(true);

    expect(h.component.OpenView).toEqual({ Kind: 'Fork', BranchID: 'BRANCH-C' });
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.scrollToMessage).toHaveBeenCalledWith('BRANCH-C-5');
  });

  it('compares fork ids without case', async () => {
    const h = createHarness({ view: { Kind: 'Fork', BranchID: 'BRANCH-B' } });

    expect(await h.component.OpenMessage('CONV-1', 'branch-b', 7)).toBe(true);

    expect(h.reload).not.toHaveBeenCalled();
    expect(h.scrollToMessage).toHaveBeenCalledWith('BRANCH-B-7');
  });

  it('returns false when the view change fails', async () => {
    const h = createHarness();
    h.reload.mockResolvedValue(false);

    expect(await h.component.OpenMessage('CONV-1', 'BRANCH-B', 7)).toBe(false);

    expect(h.scrollToMessage).not.toHaveBeenCalled();
  });

  it('returns false while another view change is running', async () => {
    const h = createHarness();
    h.open['viewChangeInFlight'] = true;

    expect(await h.component.OpenMessage('CONV-1', 'BRANCH-B', 7)).toBe(false);

    expect(h.reload).not.toHaveBeenCalled();
    expect(h.scrollToMessage).not.toHaveBeenCalled();
  });

  it('returns false with a notice when the row is not on the path', async () => {
    const h = createHarness();

    expect(await h.component.OpenMessage('CONV-1', null, 99)).toBe(false);

    expect(h.scrollToMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Could not find that message in this conversation', 'info', 3000);
  });

  it('highlights the row for 2 s after the scroll and stops the bottom-follow from moving away', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    h.open['scrollToBottom'] = true;

    expect(await h.component.OpenMessage('CONV-1', null, 25)).toBe(true);
    expect(h.open['scrollToBottom']).toBe(false);
    expect(h.open['bottomFollowSuppressedUntil'] as number).toBeGreaterThan(Date.now());

    await vi.advanceTimersByTimeAsync(400);
    expect(h.querySelector).toHaveBeenCalledWith('[data-message-id="TRUNK-25"]');
    expect(h.highlighted.add).toHaveBeenCalledWith('search-hit-highlight');
    expect(h.highlighted.remove).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    expect(h.highlighted.remove).toHaveBeenCalledWith('search-hit-highlight');
  });

  it('waits for the conversation load to end before it reads the window', async () => {
    const h = createHarness({ ready: false });

    const opening = h.component.OpenMessage('CONV-1', null, 25);
    await Promise.resolve();
    expect(h.scrollToMessage).not.toHaveBeenCalled();

    h.open['readyConversationId'] = 'CONV-1';
    h.loadEnded.next();

    expect(await opening).toBe(true);
    expect(h.scrollToMessage).toHaveBeenCalledWith('TRUNK-25');
  });

  it('marks the conversation ready and signals when its load ends', async () => {
    vi.useFakeTimers();
    const h = createHarness({ ready: false });
    const ended = vi.fn();
    h.loadEnded.subscribe(ended);
    h.open['conversationLoadToken'] = 0;
    h.open['currentlyLoadingConversationId'] = null;
    h.open['messageInputMetadataCache'] = new Map();
    h.open['engine'] = { HasCachedDetails: () => true };
    h.open['resetConversationScopedViewState'] = vi.fn();
    h.open['restoreActiveTasks'] = vi.fn(async () => undefined);
    h.open['agentStateService'] = { startPolling: vi.fn(), stopPolling: vi.fn() };
    h.open['openViewScope'] = vi.fn();
    let finishLoad: () => void = () => undefined;
    h.open['loadMessages'] = vi.fn(() => new Promise<void>(resolve => { finishLoad = resolve; }));

    const loading = (h.open['onConversationChanged'] as (id: string) => Promise<void>).call(h.component, 'CONV-1');
    expect(h.open['readyConversationId']).toBeNull();
    expect(ended).not.toHaveBeenCalled();

    finishLoad();
    await loading;

    expect(h.open['readyConversationId']).toBe('CONV-1');
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('returns false when another conversation becomes active during the load', async () => {
    const h = createHarness({ ready: false });

    const opening = h.component.OpenMessage('CONV-1', null, 25);
    h.open['_conversationId'] = 'CONV-2';
    h.open['readyConversationId'] = 'CONV-2';
    h.loadEnded.next();

    expect(await opening).toBe(false);
    expect(h.scrollToMessage).not.toHaveBeenCalled();
  });
});
