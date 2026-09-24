// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * Prepending an older page must cost the PAGE, not the window.
 *
 * `loadPeripheralData` clears and rebuilds all four display maps over every loaded row,
 * re-queries attachments for every loaded id, and re-allocates every `LazyArtifactInfo`.
 * Paying that on each sentinel fire makes scroll-up paging quadratic: ten pages back
 * re-queries attachments for roughly fifty-five pages' worth of ids. Stacked on the per-page
 * round trips the windowed read already carries, paging back a long way then costs MORE than
 * the single full load this feature exists to replace — the regression hides as a slow scroll
 * rather than a bug, which is why it is pinned here.
 *
 * Built via `Object.create(prototype)` so the real private methods run against stubbed
 * collaborators, matching the convention in `realtime-reactivity.test.ts`.
 */

function detail(id: string, sequence: number) {
  return { ID: id, ConversationID: 'CONV-1', Sequence: sequence, AgentSessionID: null };
}

interface Harness {
  component: ConversationChatAreaComponent;
  loadAttachmentsForMessages: ReturnType<typeof vi.fn>;
  fetchRealtimeSessionMeta: ReturnType<typeof vi.fn>;
  messageAssignments: { count: number };
}

/**
 * @param rendered - rows already on screen
 * @param loaded - rows the store now holds (rendered + whatever the page added)
 */
function createHarness(rendered: string[], loaded: string[]): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;

  const details = loaded.map((id, i) => detail(id, i + 1));
  const snapshot = {
    ConversationID: 'CONV-1',
    Details: details,
    Cursor: { OldestSequence: 1, NewestSequence: details.length, HasMoreAbove: true },
    PinnedDetails: [],
    PinnedTotalCount: 0,
    // Peripherals accumulate across pages in the store, so the snapshot holds entries for
    // every loaded row — the point is that the merge reads only the NEW ids out of them.
    AgentRunsByDetailId: new Map(loaded.map(id => [id, { ID: `run-${id}` }])),
    UserAvatars: new Map(),
    RatingsByDetailId: new Map(),
    ArtifactsByDetailId: new Map(),
    IsLoadingLatest: false,
    IsLoadingOlder: false,
    LoadFailed: false
  };

  const loadAttachmentsForMessages = vi.fn().mockResolvedValue(new Map());
  const fetchRealtimeSessionMeta = vi.fn().mockResolvedValue(new Map());
  const messageAssignments = { count: 0 };
  let messagesBacking = rendered.map((id, i) => detail(id, i + 1));

  open['windowStore'] = { GetSnapshot: vi.fn().mockReturnValue(snapshot) };
  open['currentUser'] = { ID: 'USER-1' };
  open['conversationId'] = 'CONV-1';
  open['cdr'] = { detectChanges: vi.fn() };
  open['attachmentService'] = { loadAttachmentsForMessages };
  open['fetchRealtimeSessionMeta'] = fetchRealtimeSessionMeta;
  open['isActiveConversation'] = () => true;
  open['calculateUniqueArtifactCount'] = () => 0;
  open['updateArtifactCountDisplay'] = () => undefined;
  open['lastLoadedConversationId'] = 'CONV-1';
  open['realtimeSessionMetaMap'] = new Map();
  open['agentRunsByDetailId'] = new Map();
  open['artifactsByDetailId'] = new Map();
  open['systemArtifactsByDetailId'] = new Map();
  open['ratingsByDetailId'] = new Map();
  open['attachmentsByDetailId'] = new Map();

  // Counted rather than assigned: a second assignment re-renders the list AFTER it has
  // already restored the scroll position for the prepend, which the reader sees as a jump.
  Object.defineProperty(component, 'messages', {
    get: () => messagesBacking,
    set: (v) => { messagesBacking = v; messageAssignments.count++; },
    configurable: true
  });

  return { component, loadAttachmentsForMessages, fetchRealtimeSessionMeta, messageAssignments };
}

function refreshAfterPaging(h: Harness): Promise<void> {
  const fn = (h.component as unknown as Record<string, (id: string) => Promise<void>>)['refreshAfterPaging'];
  return fn.call(h.component, 'CONV-1');
}

describe('refreshAfterPaging — cost is proportional to the page, not the window', () => {
  let h: Harness;

  beforeEach(() => {
    // Three rows on screen; a page brought three more.
    h = createHarness(['d-1', 'd-2', 'd-3'], ['n-1', 'n-2', 'n-3', 'd-1', 'd-2', 'd-3']);
  });

  it('queries attachments for the NEW rows only', async () => {
    await refreshAfterPaging(h);

    expect(h.loadAttachmentsForMessages).toHaveBeenCalledTimes(1);
    const [ids] = h.loadAttachmentsForMessages.mock.calls[0];
    // Not the six loaded rows — the three the page added.
    expect([...ids].sort()).toEqual(['n-1', 'n-2', 'n-3']);
  });

  it('reads session meta for the new rows only', async () => {
    await refreshAfterPaging(h);

    const [newDetails] = h.fetchRealtimeSessionMeta.mock.calls[0];
    expect((newDetails as Array<{ ID: string }>).map(d => d.ID).sort()).toEqual(['n-1', 'n-2', 'n-3']);
  });

  it('extends the display maps instead of clearing them', async () => {
    const open = h.component as unknown as Record<string, Map<string, unknown>>;
    open['agentRunsByDetailId'].set('d-1', { ID: 'run-d-1-existing' });

    await refreshAfterPaging(h);

    const runs = (h.component as unknown as Record<string, Map<string, { ID: string }>>)['agentRunsByDetailId'];
    // The row already on screen keeps what it was rendered with…
    expect(runs.get('d-1')?.ID).toBe('run-d-1-existing');
    // …and the prepended rows gained theirs.
    expect(runs.get('n-1')?.ID).toBe('run-n-1');
  });

  it('renders once per prepend', async () => {
    await refreshAfterPaging(h);

    expect(h.messageAssignments.count).toBe(1);
  });

  it('assigns messages only after the peripherals land', async () => {
    // Ordering matters: rows painted before their artifacts change height afterwards, and the
    // list has already scrolled by then.
    let attachmentsResolved = false;
    let messagesAssignedBeforeAttachments = false;
    h.loadAttachmentsForMessages.mockImplementation(async () => {
      await Promise.resolve();
      attachmentsResolved = true;
      return new Map();
    });
    const original = Object.getOwnPropertyDescriptor(h.component, 'messages')!;
    Object.defineProperty(h.component, 'messages', {
      get: original.get!,
      set: (v) => {
        if (!attachmentsResolved) { messagesAssignedBeforeAttachments = true; }
        original.set!.call(h.component, v);
      },
      configurable: true
    });

    await refreshAfterPaging(h);

    expect(messagesAssignedBeforeAttachments).toBe(false);
  });

  it('does no peripheral work when the page added nothing', async () => {
    // LoadOlder no-ops when a load is already in flight, so the sentinel can land here with
    // nothing new. Re-querying the whole window for that is pure waste.
    const same = createHarness(['d-1', 'd-2'], ['d-1', 'd-2']);
    await refreshAfterPaging(same);

    expect(same.loadAttachmentsForMessages).not.toHaveBeenCalled();
    expect(same.fetchRealtimeSessionMeta).not.toHaveBeenCalled();
  });

  it('scales with the page, not the window, across repeated paging', async () => {
    // Six sentinel fires, two new rows each. The window reaches 12 rows; the total attachment
    // ids queried must stay 12 (2 per page), not 2+4+6+8+10+12 = 42.
    let loaded: string[] = [];
    let rendered: string[] = [];
    let totalIds = 0;

    for (let page = 0; page < 6; page++) {
      loaded = [`p${page}-a`, `p${page}-b`, ...loaded];
      const paged = createHarness(rendered, loaded);
      await refreshAfterPaging(paged);
      for (const call of paged.loadAttachmentsForMessages.mock.calls) {
        totalIds += (call[0] as string[]).length;
      }
      rendered = loaded;
    }

    expect(totalIds).toBe(12);
  });
});
