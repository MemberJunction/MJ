/**
 * @fileoverview ConversationChatAreaComponent.OnMessageStreamed — the in-place path for a
 * streamed delta. It must refresh the rendered bubble through the list instead of replacing
 * the messages array (while keeping the array and the window pointing at the streamed entity),
 * and keep the viewport steady: with ReadReplyFromTop the turn's top is pinned as high as the
 * content allows on every frame until the reader moves, and completion then skips its own
 * landing; without it a reader at the bottom is followed there in the same frame. Instantiated
 * via the prototype with only the members the path touches stubbed.
 */
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

interface ScrollState {
    readerAtBottom: boolean;
    currentTurnStartMessageId: string | null;
    pendingTurnStartMessageId: string | null;
    streamAnchor: number | 'declined' | null;
    bottomFollowSuppressedUntil: number;
    scrollToBottom: boolean;
    turnStartRetryHandle: ReturnType<typeof setTimeout> | null;
    messages: MJConversationDetailEntity[];
    scrollContainer: { nativeElement: { scrollHeight: number; clientHeight: number; scrollTop: number } };
}

interface Harness {
    component: ConversationChatAreaComponent;
    state: ScrollState;
    container: ScrollState['scrollContainer']['nativeElement'];
    refresh: ReturnType<typeof vi.fn>;
    applyLocalDetail: ReturnType<typeof vi.fn>;
    onMessageSent: ReturnType<typeof vi.fn>;
    followTranscript: (change: 'load' | 'new' | 'update' | 'stream', message?: MJConversationDetailEntity) => void;
    clearTurnTracking: () => void;
    /** Simulates the reply growing by `px` (the pane does not move by itself). */
    grow: (px: number) => void;
}

interface HarnessOptions {
    readReplyFromTop?: boolean;
    refreshed?: boolean;
    readerAtBottom?: boolean;
    currentTurnStartMessageId?: string | null;
    messages?: MJConversationDetailEntity[];
    /** Where the turn's first message starts, in scroller content coordinates. */
    turnTop?: number;
    /** Content height when the turn's first delta arrives. */
    scrollHeight?: number;
}

const PANE = 600;

function detail(overrides: Partial<{ ID: string; Role: string; Status: string; Message: string }> = {}): MJConversationDetailEntity {
    return {
        ID: 'ai-1',
        ConversationID: 'conv-1',
        Role: 'AI',
        Status: 'In-Progress',
        Message: 'partial',
        ...overrides,
    } as unknown as MJConversationDetailEntity;
}

function buildHarness(options: HarnessOptions = {}): Harness {
    const refresh = vi.fn(() => options.refreshed ?? true);
    const applyLocalDetail = vi.fn();
    const onMessageSent = vi.fn(async () => undefined);
    const turnTop = options.turnTop ?? 900;
    const container = { scrollHeight: options.scrollHeight ?? 1000, clientHeight: PANE, scrollTop: 0 };
    container.scrollTop = container.scrollHeight - PANE; // the reader sits at the bottom
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const state = component as unknown as ScrollState;
    Object.assign(component as unknown as Record<string, unknown>, {
        ReadReplyFromTop: options.readReplyFromTop ?? false,
        readerAtBottom: options.readerAtBottom ?? true,
        currentTurnStartMessageId: options.currentTurnStartMessageId === undefined ? 'user-1' : options.currentTurnStartMessageId,
        pendingTurnStartMessageId: null,
        streamAnchor: null,
        bottomFollowSuppressedUntil: 0,
        scrollToBottom: false,
        turnStartRetryHandle: null,
        messages: options.messages ?? [],
        scrollContainer: { nativeElement: container },
        messageListComponent: { RefreshRenderedMessage: refresh, FindTimelineElement: () => ({}) },
        windowStore: { ApplyLocalDetail: applyLocalDetail },
        ngZone: { run: (fn: () => void) => fn() },
        isActiveConversation: (conversationId: string) => conversationId === 'conv-1',
        offsetWithinScroller: () => turnTop,
        turnTopClearance: () => 0,
        OnMessageSent: onMessageSent,
    });
    const internals = component as unknown as {
        followTranscript(change: 'load' | 'new' | 'update' | 'stream', message?: MJConversationDetailEntity): void;
        clearTurnTracking(): void;
    };
    return {
        component,
        state,
        container,
        refresh,
        applyLocalDetail,
        onMessageSent,
        followTranscript: internals.followTranscript.bind(component),
        clearTurnTracking: internals.clearTurnTracking.bind(component),
        grow: (px: number) => { container.scrollHeight += px; },
    };
}

/** A hold that is armed: later than now. */
function expectArmedHold(until: number): void {
    expect(until).toBeGreaterThan(Date.now() - 1);
}

describe('ConversationChatAreaComponent.OnMessageStreamed', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('the in-place refresh', () => {
        it('refreshes the rendered bubble instead of going through OnMessageSent', () => {
            const h = buildHarness();
            const message = detail();
            h.component.OnMessageStreamed(message);
            expect(h.refresh).toHaveBeenCalledWith(message);
            expect(h.onMessageSent).not.toHaveBeenCalled();
        });

        it('points the messages array and the window at the streamed entity once, not per frame', () => {
            const stale = detail({ Message: 'older copy from a reload' });
            const h = buildHarness({ messages: [stale] });
            const live = detail();
            h.component.OnMessageStreamed(live);
            h.component.OnMessageStreamed(live);
            expect(h.state.messages[0]).toBe(live); // edited in place — same array, no timeline rebuild
            expect(h.applyLocalDetail).toHaveBeenCalledTimes(1);
            expect(h.applyLocalDetail).toHaveBeenCalledWith(live);
        });

        it('yields to the completion path when the array already holds the message settled (a frame that outlived completion)', () => {
            const settled = detail({ Status: 'Complete', Message: 'the saved reply' });
            const h = buildHarness({ messages: [settled] });
            h.component.OnMessageStreamed(detail({ Message: 'stale partial' }));
            expect(h.refresh).not.toHaveBeenCalled();
            expect(h.onMessageSent).not.toHaveBeenCalled();
            expect(h.state.messages[0]).toBe(settled);
        });

        it('falls back to the full path once when the bubble has no rendered entry yet', () => {
            const h = buildHarness({ refreshed: false });
            const message = detail();
            h.component.OnMessageStreamed(message);
            expect(h.onMessageSent).toHaveBeenCalledTimes(1);
            expect(h.onMessageSent).toHaveBeenCalledWith(message);
        });

        it('ignores a message that is no longer in progress', () => {
            const h = buildHarness();
            h.component.OnMessageStreamed(detail({ Status: 'Complete' }));
            expect(h.refresh).not.toHaveBeenCalled();
            expect(h.onMessageSent).not.toHaveBeenCalled();
        });

        it("ignores a background conversation's delta", () => {
            const h = buildHarness();
            const other = { ...detail(), ConversationID: 'conv-2' } as unknown as MJConversationDetailEntity;
            h.component.OnMessageStreamed(other);
            expect(h.refresh).not.toHaveBeenCalled();
        });
    });

    describe('without ReadReplyFromTop', () => {
        it('follows the bottom in the same frame while the reader is at the bottom', () => {
            const h = buildHarness();
            h.grow(300);
            h.component.OnMessageStreamed(detail());
            expect(h.container.scrollTop).toBe(h.container.scrollHeight);
            expect(h.state.scrollToBottom).toBe(false); // no deferred follow timer
        });

        it('leaves a reader who scrolled away where they are', () => {
            const h = buildHarness({ readerAtBottom: false });
            const before = h.container.scrollTop;
            h.grow(300);
            h.component.OnMessageStreamed(detail());
            expect(h.container.scrollTop).toBe(before);
        });
    });

    describe('with ReadReplyFromTop', () => {
        it('pins the turn as high as the content allows and raises it to its top as the reply grows', () => {
            const h = buildHarness({ readReplyFromTop: true, turnTop: 900, scrollHeight: 1000 });
            h.component.OnMessageStreamed(detail());
            expect(h.container.scrollTop).toBe(400); // clamped: only 100px of content below the turn's top
            h.grow(300);
            h.component.OnMessageStreamed(detail({ Message: 'partial and more' }));
            expect(h.container.scrollTop).toBe(700);
            h.grow(600);
            h.component.OnMessageStreamed(detail({ Message: 'partial and much more' }));
            expect(h.container.scrollTop).toBe(900); // the question sits at the top; the reply fills the pane below
            expect(h.state.streamAnchor).toBe(900);
            expect(h.state.scrollToBottom).toBe(false);
            expectArmedHold(h.state.bottomFollowSuppressedUntil);
        });

        it('cancels a landing still queued or retrying before it pins the turn itself', () => {
            vi.useFakeTimers();
            try {
                const h = buildHarness({ readReplyFromTop: true });
                const stray = vi.fn();
                h.state.pendingTurnStartMessageId = 'user-1';
                h.state.turnStartRetryHandle = setTimeout(stray, 50) as unknown as ScrollState['turnStartRetryHandle'];
                h.component.OnMessageStreamed(detail());
                vi.advanceTimersByTime(100);
                expect(stray).not.toHaveBeenCalled();
                expect(h.state.turnStartRetryHandle).toBeNull();
                expect(h.state.pendingTurnStartMessageId).toBeNull();
            } finally {
                vi.useRealTimers();
            }
        });

        it('follows the bottom instead when no turn is being tracked (a reload mid-stream)', () => {
            const h = buildHarness({ readReplyFromTop: true, currentTurnStartMessageId: null });
            h.grow(300);
            h.component.OnMessageStreamed(detail());
            expect(h.container.scrollTop).toBe(h.container.scrollHeight);
            expect(h.state.streamAnchor).toBeNull();
        });

        it('leaves a reader who had scrolled away alone, for every delta, and lets completion land as before', () => {
            const h = buildHarness({ readReplyFromTop: true, readerAtBottom: false });
            const before = h.container.scrollTop;
            h.component.OnMessageStreamed(detail());
            h.state.readerAtBottom = true; // they came back to read along
            h.grow(300);
            h.component.OnMessageStreamed(detail({ Message: 'partial and more' }));
            expect(h.container.scrollTop).toBe(before);
            expect(h.state.streamAnchor).toBe('declined');
            expect(h.state.bottomFollowSuppressedUntil).toBe(0);
            h.followTranscript('update', detail({ Status: 'Complete' }));
            expect(h.state.pendingTurnStartMessageId).toBe('user-1'); // the normal completion landing
        });

        it('releases the pin for the turn once the reader scrolls away mid-stream', () => {
            const h = buildHarness({ readReplyFromTop: true });
            h.component.OnMessageStreamed(detail());
            h.container.scrollTop -= 150; // the reader scrolled up to re-read something
            h.grow(300);
            h.component.OnMessageStreamed(detail({ Message: 'partial and more' }));
            expect(h.container.scrollTop).toBe(250);
            expect(h.state.streamAnchor).toBe('declined');
        });

        it('lets completion skip the landing a stream already made, keeping the post-landing hold', () => {
            const h = buildHarness({ readReplyFromTop: true });
            h.component.OnMessageStreamed(detail());
            h.followTranscript('update', detail({ Status: 'Complete' }));
            expect(h.state.pendingTurnStartMessageId).toBeNull(); // no second landing queued
            expect(h.state.scrollToBottom).toBe(false);
            expectArmedHold(h.state.bottomFollowSuppressedUntil);
        });

        it('still lands at completion for a turn that never streamed', () => {
            const h = buildHarness({ readReplyFromTop: true });
            h.followTranscript('update', detail({ Status: 'Complete' }));
            expect(h.state.pendingTurnStartMessageId).toBe('user-1');
        });

        it('starts a fresh pin for the next turn', () => {
            const h = buildHarness({ readReplyFromTop: true });
            h.component.OnMessageStreamed(detail());
            h.followTranscript('update', detail({ Status: 'Complete' }));
            h.followTranscript('new', detail({ ID: 'user-2', Role: 'User' }));
            expect(h.state.streamAnchor).toBeNull();
            h.state.readerAtBottom = true;
            h.component.OnMessageStreamed(detail({ ID: 'ai-2' }));
            expect(typeof h.state.streamAnchor).toBe('number');
        });

        it('forgets the pin with the rest of the turn tracking', () => {
            const h = buildHarness({ readReplyFromTop: true });
            h.component.OnMessageStreamed(detail());
            h.clearTurnTracking();
            expect(h.state.streamAnchor).toBeNull();
            expect(h.state.bottomFollowSuppressedUntil).toBe(0);
            expect(h.state.pendingTurnStartMessageId).toBeNull();
            expect(h.state.turnStartRetryHandle).toBeNull();
        });
    });
});
