/**
 * @fileoverview ConversationChatAreaComponent.OnMessageStreamed — the in-place path for a
 * streamed delta. It must refresh the rendered bubble through the list instead of replacing
 * the messages array (while keeping the array and the window pointing at the streamed entity),
 * keep the viewport steady — one landing per turn with ReadReplyFromTop, a synchronous bottom
 * follow otherwise — and let completion skip a landing the stream already made while keeping
 * the post-landing hold. Instantiated via the prototype with only the members the path touches.
 */
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

interface ScrollState {
    readerAtBottom: boolean;
    currentTurnStartMessageId: string | null;
    pendingTurnStartMessageId: string | null;
    streamLanding: { turnId: string; landed: boolean } | null;
    bottomFollowSuppressedUntil: number;
    scrollToBottom: boolean;
    turnStartRetryHandle: ReturnType<typeof setTimeout> | null;
    messages: MJConversationDetailEntity[];
    scrollContainer: { nativeElement: { scrollHeight: number; scrollTop: number } };
}

interface Harness {
    component: ConversationChatAreaComponent;
    state: ScrollState;
    refresh: ReturnType<typeof vi.fn>;
    applyLocalDetail: ReturnType<typeof vi.fn>;
    scrollTurnToTop: ReturnType<typeof vi.fn>;
    onMessageSent: ReturnType<typeof vi.fn>;
    followTranscript: (change: 'load' | 'new' | 'update', message?: MJConversationDetailEntity) => void;
    clearTurnTracking: () => void;
}

interface HarnessOptions {
    readReplyFromTop?: boolean;
    refreshed?: boolean;
    readerAtBottom?: boolean;
    currentTurnStartMessageId?: string | null;
    messages?: MJConversationDetailEntity[];
}

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
    const scrollTurnToTop = vi.fn();
    const onMessageSent = vi.fn(async () => undefined);
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const state = component as unknown as ScrollState;
    Object.assign(component as unknown as Record<string, unknown>, {
        ReadReplyFromTop: options.readReplyFromTop ?? false,
        readerAtBottom: options.readerAtBottom ?? true,
        currentTurnStartMessageId: options.currentTurnStartMessageId === undefined ? 'user-1' : options.currentTurnStartMessageId,
        pendingTurnStartMessageId: null,
        streamLanding: null,
        bottomFollowSuppressedUntil: 0,
        scrollToBottom: false,
        turnStartRetryHandle: null,
        messages: options.messages ?? [],
        scrollContainer: { nativeElement: { scrollHeight: 900, scrollTop: 0 } },
        messageListComponent: { RefreshRenderedMessage: refresh },
        windowStore: { ApplyLocalDetail: applyLocalDetail },
        isActiveConversation: (conversationId: string) => conversationId === 'conv-1',
        scrollTurnToTop,
        OnMessageSent: onMessageSent,
    });
    const internals = component as unknown as {
        followTranscript(change: 'load' | 'new' | 'update', message?: MJConversationDetailEntity): void;
        clearTurnTracking(): void;
    };
    return {
        component,
        state,
        refresh,
        applyLocalDetail,
        scrollTurnToTop,
        onMessageSent,
        followTranscript: internals.followTranscript.bind(component),
        clearTurnTracking: internals.clearTurnTracking.bind(component),
    };
}

/** A hold that is armed: later than now, and not the open-ended value the first draft used. */
function expectArmedHold(until: number): void {
    expect(until).toBeGreaterThan(Date.now() - 1);
    expect(Number.isFinite(until)).toBe(true);
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

        it('mirrors a message the array does not hold yet into the window', () => {
            const h = buildHarness();
            const live = detail();
            h.component.OnMessageStreamed(live);
            expect(h.applyLocalDetail).toHaveBeenCalledWith(live);
            expect(h.state.messages).toHaveLength(0); // the array is not grown here; OnMessageSent appends
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
            expect(h.state.scrollContainer.nativeElement.scrollTop).toBe(0);
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
        it('follows the bottom synchronously while the reader is at the bottom', () => {
            const h = buildHarness();
            h.component.OnMessageStreamed(detail());
            expect(h.state.scrollContainer.nativeElement.scrollTop).toBe(900);
            expect(h.state.scrollToBottom).toBe(false); // no deferred follow timer
        });

        it('leaves a reader who scrolled away where they are', () => {
            const h = buildHarness({ readerAtBottom: false });
            h.component.OnMessageStreamed(detail());
            expect(h.state.scrollContainer.nativeElement.scrollTop).toBe(0);
        });
    });

    describe('with ReadReplyFromTop', () => {
        it('lands the turn at its top once, on the first delta, and re-arms the follow hold per delta', () => {
            const h = buildHarness({ readReplyFromTop: true });
            h.component.OnMessageStreamed(detail());
            const firstHold = h.state.bottomFollowSuppressedUntil;
            h.component.OnMessageStreamed(detail({ Message: 'partial and more' }));
            expect(h.scrollTurnToTop).toHaveBeenCalledTimes(1);
            expect(h.scrollTurnToTop).toHaveBeenCalledWith('user-1', 0, true);
            expect(h.state.streamLanding).toEqual({ turnId: 'user-1', landed: true });
            expect(h.state.scrollToBottom).toBe(false);
            expectArmedHold(firstHold);
            expect(h.state.bottomFollowSuppressedUntil).toBeGreaterThanOrEqual(firstHold);
            expect(h.state.scrollContainer.nativeElement.scrollTop).toBe(0); // never pinned to the bottom
        });

        it('cancels a landing still queued or retrying before it lands the turn itself', () => {
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
            h.component.OnMessageStreamed(detail());
            expect(h.scrollTurnToTop).not.toHaveBeenCalled();
            expect(h.state.scrollContainer.nativeElement.scrollTop).toBe(900);
        });

        it('leaves a reader who had scrolled away alone, for every delta, and lets completion land as before', () => {
            const h = buildHarness({ readReplyFromTop: true, readerAtBottom: false });
            h.component.OnMessageStreamed(detail());
            h.state.readerAtBottom = true; // they came back to read along
            h.component.OnMessageStreamed(detail({ Message: 'partial and more' }));
            expect(h.scrollTurnToTop).not.toHaveBeenCalled();
            expect(h.state.streamLanding).toEqual({ turnId: 'user-1', landed: false });
            expect(h.state.bottomFollowSuppressedUntil).toBe(0);
            h.followTranscript('update', detail({ Status: 'Complete' }));
            expect(h.state.pendingTurnStartMessageId).toBe('user-1'); // the normal completion landing
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

        it('lands again for the next turn', () => {
            const h = buildHarness({ readReplyFromTop: true });
            h.component.OnMessageStreamed(detail());
            h.followTranscript('update', detail({ Status: 'Complete' }));
            h.followTranscript('new', detail({ ID: 'user-2', Role: 'User' }));
            h.component.OnMessageStreamed(detail({ ID: 'ai-2' }));
            expect(h.scrollTurnToTop).toHaveBeenCalledTimes(2);
            expect(h.scrollTurnToTop).toHaveBeenLastCalledWith('user-2', 0, true);
        });

        it('forgets the landing with the rest of the turn tracking', () => {
            const h = buildHarness({ readReplyFromTop: true });
            h.component.OnMessageStreamed(detail());
            h.clearTurnTracking();
            expect(h.state.streamLanding).toBeNull();
            expect(h.state.bottomFollowSuppressedUntil).toBe(0);
            expect(h.state.pendingTurnStartMessageId).toBeNull();
            expect(h.state.turnStartRetryHandle).toBeNull();
        });
    });
});
