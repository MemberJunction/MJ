// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * Where the viewport goes when the transcript changes — `followTranscript` and the landing
 * measurement behind `readReplyFromTop`.
 *
 * Background: message-input re-emits `messageSent` for the in-progress reply on EVERY
 * progress update, and `onMessageSent` used to arm the scroll-to-bottom on each one, so a
 * reader who scrolled up to reread history was yanked back once a second for the whole
 * run. The tail is now followed only for a reader who is already there. The opt-in
 * `readReplyFromTop` additionally scrolls a finished turn to the top of the pane when it is
 * taller than the pane, so the run ends at the start of the answer.
 *
 * Exercised WITHOUT TestBed: the component is created via Object.create(prototype) so the
 * real methods run against directly-seeded state.
 */

type Open = Record<string, unknown>;

function createComponent(readReplyFromTop = false): ConversationChatAreaComponent {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Open;
  // Object.create skips field initializers — seed what the scroll paths read.
  component.readReplyFromTop = readReplyFromTop;
  component.showScrollToBottomIcon = false;
  open['scrollToBottom'] = false;
  open['readerAtBottom'] = true;
  open['currentTurnStartMessageId'] = null;
  open['pendingTurnStartMessageId'] = null;
  open['bottomFollowSuppressedUntil'] = 0;
  open['turnStartRetryHandle'] = null;
  open['cdr'] = { detectChanges: vi.fn() };
  return component;
}

const userMessage = { ID: 'user-1', Role: 'User', Status: 'Complete' };
const replyInProgress = { ID: 'ai-1', Role: 'AI', Status: 'In-Progress' };
const replyComplete = { ID: 'ai-1', Role: 'AI', Status: 'Complete' };
/** The refinement path's "Continuing with X for refinement…" line — settled the moment it is emitted. */
const refinementStatus = { ID: 'ai-status', Role: 'AI', Status: 'Complete' };

function follow(component: ConversationChatAreaComponent, change: 'load' | 'new' | 'update', message?: unknown): void {
  (component as unknown as { followTranscript(c: string, m?: unknown): void }).followTranscript(change, message);
}
const armed = (component: ConversationChatAreaComponent) => (component as unknown as Open)['scrollToBottom'] as boolean;
const pendingLanding = (component: ConversationChatAreaComponent) => (component as unknown as Open)['pendingTurnStartMessageId'];
const disarm = (component: ConversationChatAreaComponent) => { (component as unknown as Open)['scrollToBottom'] = false; };

describe('followTranscript — following the tail (both modes)', () => {
  it('follows a new message', () => {
    const component = createComponent();
    follow(component, 'new', replyInProgress);
    expect(armed(component)).toBe(true);
  });

  it('follows an in-place update while the reader is at the bottom (the bubble grows under them)', () => {
    const component = createComponent();
    follow(component, 'update', replyInProgress);
    expect(armed(component)).toBe(true);
  });

  it('does NOT follow an in-place update once the reader has scrolled up — the per-progress yank', () => {
    const component = createComponent();
    (component as unknown as Open)['readerAtBottom'] = false;
    follow(component, 'update', replyInProgress);
    expect(armed(component)).toBe(false);
  });

  it('opening a conversation lands at the bottom', () => {
    const component = createComponent();
    (component as unknown as Open)['readerAtBottom'] = false;
    follow(component, 'load');
    expect(armed(component)).toBe(true);
  });

  it('default mode never schedules a landing at the top', () => {
    const component = createComponent();
    follow(component, 'new', userMessage);
    follow(component, 'new', replyInProgress);
    follow(component, 'update', replyComplete);
    expect(pendingLanding(component)).toBeNull();
    expect(armed(component)).toBe(true);
  });
});

describe('followTranscript — readReplyFromTop', () => {
  it("the reader's own message opens the turn and still follows, like a normal send", () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);
    expect((component as unknown as Open)['currentTurnStartMessageId']).toBe('user-1');
    expect(armed(component)).toBe(true);
  });

  it('progress keeps following a reader at the bottom, and never moves one who left', () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);
    disarm(component);
    follow(component, 'update', replyInProgress);
    expect(armed(component)).toBe(true);
    disarm(component);
    (component as unknown as Open)['readerAtBottom'] = false;
    follow(component, 'update', replyInProgress);
    expect(armed(component)).toBe(false);
  });

  it('the reply landing schedules the top-of-turn landing instead of the bottom snap', () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);
    disarm(component);
    follow(component, 'update', replyComplete);
    expect(pendingLanding(component)).toBe('user-1');
    expect(armed(component)).toBe(false);
  });

  it('a bottom-follow armed by the last progress update is disarmed and suppressed while the landing runs', () => {
    const component = createComponent(true);
    const open = component as unknown as Open;
    follow(component, 'new', userMessage);
    follow(component, 'update', replyInProgress);   // arms the follow (reader at the bottom)
    expect(armed(component)).toBe(true);
    follow(component, 'update', replyComplete);
    expect(armed(component)).toBe(false);
    expect(open['bottomFollowSuppressedUntil'] as number).toBeGreaterThan(Date.now());
  });

  it('a reader who scrolled away is not landed anywhere when the reply arrives', () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);
    disarm(component);
    (component as unknown as Open)['readerAtBottom'] = false;
    follow(component, 'update', replyComplete);
    expect(pendingLanding(component)).toBeNull();
    expect(armed(component)).toBe(false);
  });

  it('repeat completion emits for the same reply never fall through to the bottom snap', () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);
    disarm(component);
    follow(component, 'update', replyComplete);
    expect(pendingLanding(component)).toBe('user-1');
    (component as unknown as Open)['pendingTurnStartMessageId'] = null;
    (component as unknown as Open)['readerAtBottom'] = false; // the landing moved the reader off the bottom
    follow(component, 'update', replyComplete); // message-input emits completion twice
    follow(component, 'new', replyComplete);    // ...and onAgentResponse appends the finished message again
    expect(pendingLanding(component)).toBeNull();
    expect(armed(component)).toBe(false);
  });

  it('the refinement path lands again on the real reply, not only on the settled status line before it', () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);
    disarm(component);
    follow(component, 'new', refinementStatus);         // "Continuing with X for refinement…" — already Complete
    expect(pendingLanding(component)).toBe('user-1');    // lands (the turn fits: bottom), reader stays at the bottom
    (component as unknown as Open)['pendingTurnStartMessageId'] = null;
    follow(component, 'new', { ID: 'ai-2', Role: 'AI', Status: 'Complete' }); // the reply, created already Complete
    expect(pendingLanding(component)).toBe('user-1');    // lands again — now the turn is the real thing
    expect(armed(component)).toBe(false);
  });

  it('a message the reader sends right after a landing follows normally — the landing suppression is lifted', () => {
    const component = createComponent(true);
    const open = component as unknown as Open;
    follow(component, 'new', userMessage);
    follow(component, 'update', replyComplete);
    expect(open['bottomFollowSuppressedUntil'] as number).toBeGreaterThan(Date.now());
    follow(component, 'new', { ID: 'user-2', Role: 'User', Status: 'Complete' });
    expect(armed(component)).toBe(true);
    expect(open['bottomFollowSuppressedUntil']).toBe(0);
  });

  it("the reader's message arriving as an update (the auto-send path) still opens the turn", () => {
    const component = createComponent(true);
    follow(component, 'update', userMessage);
    expect((component as unknown as Open)['currentTurnStartMessageId']).toBe('user-1');
    disarm(component);
    follow(component, 'update', replyComplete);
    expect(pendingLanding(component)).toBe('user-1');
  });

  it('the next message opens a new turn that can land again', () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);
    follow(component, 'update', replyComplete);
    (component as unknown as Open)['pendingTurnStartMessageId'] = null;
    follow(component, 'new', { ID: 'user-2', Role: 'User', Status: 'Complete' });
    follow(component, 'update', { ID: 'ai-2', Role: 'AI', Status: 'Complete' });
    expect(pendingLanding(component)).toBe('user-2');
  });

  it('an errored reply lands the same way a finished one does', () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);
    disarm(component);
    follow(component, 'update', { ID: 'ai-1', Role: 'AI', Status: 'Error' });
    expect(pendingLanding(component)).toBe('user-1');
  });

  it('the initial load of a just-created conversation lands at the bottom but keeps the turn in flight', () => {
    const component = createComponent(true);
    follow(component, 'new', userMessage);   // the first message goes out...
    disarm(component);
    follow(component, 'load');               // ...while the initial load is still finishing
    expect(armed(component)).toBe(true);
    disarm(component);
    follow(component, 'update', replyComplete);
    expect(pendingLanding(component)).toBe('user-1');
  });

  it('switching conversations forgets the turn in flight', () => {
    const component = createComponent(true);
    const open = component as unknown as Open;
    follow(component, 'new', userMessage);
    (component as unknown as { clearTurnTracking(): void }).clearTurnTracking();
    follow(component, 'update', replyComplete);
    expect(pendingLanding(component)).toBeNull();
    expect(open['currentTurnStartMessageId']).toBeNull();
  });
});

describe('scrollTurnToTop — where the finished turn lands', () => {
  interface PaneOptions {
    clientHeight: number;
    scrollTop: number;
    scrollHeight: number;
    /** The turn's first message, in content coordinates. */
    turnStartTop: number;
    /** A pinned sticky date header, when the conversation shows one. */
    stickyHeader?: { offsetHeight: number; cssTop: string; offsetTop: number };
  }

  /**
   * Stubs answer per selector, so the code's own queries are what is exercised: the turn's
   * message comes from the LIST (FindTimelineElement), the sticky header from the pane.
   */
  function seedPane(component: ConversationChatAreaComponent, opts: PaneOptions) {
    const open = component as unknown as Open;
    const scroll = vi.fn();
    const turnStart = { getBoundingClientRect: () => ({ top: opts.turnStartTop - opts.scrollTop }) };
    const stickyHeader = opts.stickyHeader
      ? { offsetHeight: opts.stickyHeader.offsetHeight, offsetTop: opts.stickyHeader.offsetTop, offsetParent: {} }
      : null;
    open['scrollContainer'] = {
      nativeElement: {
        clientHeight: opts.clientHeight,
        scrollTop: opts.scrollTop,
        scrollHeight: opts.scrollHeight,
        getBoundingClientRect: () => ({ top: 0 }),
        querySelector: (selector: string) => (selector === '.sticky-date-header' ? stickyHeader : null),
        scroll
      }
    };
    open['messageListComponent'] = { FindTimelineElement: (id: string) => (id === 'user-1' ? turnStart : null) };
    if (opts.stickyHeader) {
      vi.stubGlobal('getComputedStyle', () => ({ top: opts.stickyHeader!.cssTop }));
    }
    return scroll;
  }
  const land = (component: ConversationChatAreaComponent) =>
    (component as unknown as { scrollTurnToTop(id: string): void }).scrollTurnToTop('user-1');

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a turn taller than the pane is scrolled so its first message sits at the top (gap 16)', () => {
    const component = createComponent(true);
    const scroll = seedPane(component, { clientHeight: 369, scrollTop: 900, scrollHeight: 1600, turnStartTop: 914 });
    land(component);
    expect(scroll).toHaveBeenCalledWith({ top: 898, behavior: 'smooth' });
  });

  it('a turn that fits in the pane is left at the bottom — it is all on screen already', () => {
    const component = createComponent(true);
    const scroll = seedPane(component, { clientHeight: 369, scrollTop: 900, scrollHeight: 1200, turnStartTop: 914 });
    const open = component as unknown as Open;
    const scrollToBottomNow = vi.fn();
    open['scrollToBottomNow'] = scrollToBottomNow;
    land(component);
    expect(scroll).not.toHaveBeenCalled();
    expect(scrollToBottomNow).toHaveBeenCalled();
  });

  it('a pinned sticky date header is cleared by its height plus its CSS inset — never its offsetTop, which tracks the scroll', () => {
    const component = createComponent(true);
    // 5000px down a long conversation: offsetTop of the pinned header reports ~5000
    const scroll = seedPane(component, {
      clientHeight: 369, scrollTop: 5000, scrollHeight: 5800, turnStartTop: 5016,
      stickyHeader: { offsetHeight: 28, cssTop: '12px', offsetTop: 5012 }
    });
    land(component);
    // 5016 - (16 + 28 + 12) = 4960 — the turn starts under the header, not at the top of the conversation
    expect(scroll).toHaveBeenCalledWith({ top: 4960, behavior: 'smooth' });
  });

  it('with a sticky header, a turn that fits is still judged by its real height', () => {
    const component = createComponent(true);
    const scroll = seedPane(component, {
      clientHeight: 369, scrollTop: 5000, scrollHeight: 5300, turnStartTop: 5016,
      stickyHeader: { offsetHeight: 28, cssTop: '12px', offsetTop: 5012 }
    });
    const scrollToBottomNow = vi.fn();
    (component as unknown as Open)['scrollToBottomNow'] = scrollToBottomNow;
    land(component);
    expect(scroll).not.toHaveBeenCalled();
    expect(scrollToBottomNow).toHaveBeenCalled();
  });

  it('resolves the message through the list, so an unmounted or session-folded message is still found', () => {
    const component = createComponent(true);
    const scroll = seedPane(component, { clientHeight: 369, scrollTop: 900, scrollHeight: 1600, turnStartTop: 914 });
    const open = component as unknown as Open;
    const list = open['messageListComponent'] as { FindTimelineElement: (id: string) => unknown };
    const spy = vi.spyOn(list, 'FindTimelineElement');
    land(component);
    expect(spy).toHaveBeenCalledWith('user-1');
    expect(scroll).toHaveBeenCalled();
  });

  it('does nothing in default mode', () => {
    const component = createComponent(false);
    const scroll = seedPane(component, { clientHeight: 369, scrollTop: 900, scrollHeight: 1600, turnStartTop: 914 });
    land(component);
    expect(scroll).not.toHaveBeenCalled();
  });
});
