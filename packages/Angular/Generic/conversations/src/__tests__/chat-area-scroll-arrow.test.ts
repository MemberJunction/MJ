import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/** A scroller stub whose sizes the test changes, with one content child (the message list). */
function scroller(scrollHeight: number, clientHeight: number, scrollTop: number) {
    const child = { tagName: 'MJ-CONVERSATION-MESSAGE-LIST' };
    return { scrollHeight, clientHeight, scrollTop, children: [child], child };
}

/** A ResizeObserver stand-in that records what it watches and lets the test fire a resize. */
class FakeResizeObserver {
    public static Last: FakeResizeObserver | null = null;
    public Watched: object[] = [];
    public Disconnected = false;
    constructor(private readonly callback: () => void) {
        FakeResizeObserver.Last = this;
    }
    public observe(target: object): void {
        this.Watched.push(target);
    }
    public disconnect(): void {
        this.Disconnected = true;
    }
    public Fire(): void {
        this.callback();
    }
}

function createChatArea() {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        ShowScrollToBottomIcon: false,
        cdr: { detectChanges: vi.fn() },
        scrollResizeObserver: null,
    });
    return component;
}

/** Hands the chat area its scroller, as the @ViewChild query does. */
function attach(component: ConversationChatAreaComponent, element: ReturnType<typeof scroller> | null): void {
    const setter = Object.getOwnPropertyDescriptor(ConversationChatAreaComponent.prototype, 'scrollContainerRef')?.set;
    setter?.call(component, element ? { nativeElement: element } : undefined);
}

describe('ConversationChatAreaComponent scroll-to-bottom arrow', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        FakeResizeObserver.Last = null;
    });

    it('shows the arrow when scrolled up in content taller than the pane', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const c = createChatArea();
        attach(c, scroller(2000, 600, 0));
        c.CheckScroll();
        expect(c.ShowScrollToBottomIcon).toBe(true);
    });

    it('hides the arrow when the content shrinks below the pane without a scroll event (a new fork view)', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const c = createChatArea();
        const el = scroller(2000, 600, 0);
        attach(c, el);
        c.CheckScroll();
        expect(c.ShowScrollToBottomIcon).toBe(true);

        el.scrollHeight = 500;
        FakeResizeObserver.Last?.Fire();
        expect(c.ShowScrollToBottomIcon).toBe(false);
    });

    it('watches the scroller and its content, and stops watching when the scroller goes away', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const c = createChatArea();
        const el = scroller(600, 600, 0);
        attach(c, el);
        const observer = FakeResizeObserver.Last;
        expect(observer?.Watched).toEqual([el, el.child]);

        attach(c, null);
        expect(observer?.Disconnected).toBe(true);
    });
});
