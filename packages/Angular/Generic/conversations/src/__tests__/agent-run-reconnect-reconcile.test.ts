/**
 * @fileoverview A run that finishes while the socket is down must be reconciled on reconnect.
 *
 * ## What was actually wrong
 *
 * Nothing needed building. A reconciler
 * (`ConversationChatAreaComponent.detectAndReconcileAgentRuns`) and a server-side heartbeat
 * (`packages/AI/Agents/src/agent-run-watchdog.ts`) both already existed. Neither was
 * REACHABLE after a socket drop:
 *
 *  - the reconciler had exactly ONE caller, inside the conversation-*load* path, so the only
 *    way to trigger it was to navigate away and back;
 *  - the polling fallback fires on a FALLING edge (`hadActiveAgents && !hasActiveAgents`), and
 *    `AgentStateService` stops polling itself once a cycle returns no active runs — so if the
 *    client never saw the run go active, the edge never came;
 *  - `ConversationStreaming.getConnectionStatus$()` — which emits
 *    `connected → error/disconnected → reconnecting → connected` around a drop — had **zero
 *    subscribers anywhere in the repo**.
 *
 * So the message displayed "running" indefinitely. The fix subscribes to that observable.
 *
 * Both halves are pinned here off the prototype (no constructor/TestBed), in the style of
 * agent-awaiting-feedback.test.ts: the transition rule that decides whether to act, and the
 * catch-up itself.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi } from 'vitest';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { StreamingConnectionStatus } from '../lib/services/conversation-streaming.service';

import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

function detail(id: string, role: 'AI' | 'User', status: string): MJConversationDetailEntity {
    return { ID: id, ConversationID: CONVERSATION_ID, Role: role, Status: status } as unknown as MJConversationDetailEntity;
}

interface TransitionHarness {
    /** Feed one status emission; returns whether the component decided to reconcile. */
    feed(status: StreamingConnectionStatus): boolean;
}

function buildTransitionHarness(): TransitionHarness {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        streamConnected: false,
        streamHasConnected: false,
    });
    const decide = (
        component as unknown as { onStreamConnectionStatus(s: StreamingConnectionStatus): boolean }
    ).onStreamConnectionStatus.bind(component);
    return { feed: decide };
}

describe('onStreamConnectionStatus — reconnect, not first connect', () => {
    it('does not reconcile on the FIRST connect', () => {
        const harness = buildTransitionHarness();
        // The BehaviorSubject starts at 'disconnected', then initialize() emits 'connected'.
        expect(harness.feed('disconnected')).toBe(false);
        expect(harness.feed('connected')).toBe(false);
    });

    it('reconciles when the socket comes back after an error', () => {
        const harness = buildTransitionHarness();
        harness.feed('connected');
        expect(harness.feed('error')).toBe(false);
        expect(harness.feed('reconnecting')).toBe(false);
        expect(harness.feed('connected')).toBe(true);
    });

    it('reconciles after a clean disconnect too', () => {
        const harness = buildTransitionHarness();
        harness.feed('connected');
        harness.feed('disconnected');
        harness.feed('reconnecting');
        expect(harness.feed('connected')).toBe(true);
    });

    it('does not reconcile on a duplicate "connected" with no drop in between', () => {
        // A BehaviorSubject replaying its current value must not trigger a catch-up.
        const harness = buildTransitionHarness();
        harness.feed('connected');
        expect(harness.feed('connected')).toBe(false);
        expect(harness.feed('connected')).toBe(false);
    });

    it('reconciles on EVERY subsequent reconnect, not just the first', () => {
        const harness = buildTransitionHarness();
        harness.feed('connected');
        for (let i = 0; i < 3; i++) {
            harness.feed('error');
            harness.feed('reconnecting');
            expect(harness.feed('connected')).toBe(true);
        }
    });

    it('never reconciles on a non-connected status', () => {
        const harness = buildTransitionHarness();
        harness.feed('connected');
        for (const status of ['error', 'disconnected', 'reconnecting'] as StreamingConnectionStatus[]) {
            expect(harness.feed(status)).toBe(false);
        }
    });
});

interface ReconcileHarness {
    run(): Promise<void>;
    refreshCalls: number;
    peripheralCalls: Array<{ conversationId: string; loadToken: number | undefined }>;
    reconcileCalls: Array<{ conversationId: string; loadToken: number }>;
    messagesAfter(): MJConversationDetailEntity[];
    lastLoadedConversationId(): string | null;
}

function buildReconcileHarness(options: {
    messages: MJConversationDetailEntity[];
    refreshed?: MJConversationDetailEntity[];
    conversationId?: string | null;
    /** Simulates another conversation being selected mid-refresh. */
    invalidateDuringRefresh?: boolean;
    /** Makes the reconciler throw, to check the catch-up cannot break the live conversation. */
    reconcilerThrows?: boolean;
}): ReconcileHarness {
    const state = {
        refreshCalls: 0,
        peripheralCalls: [] as Array<{ conversationId: string; loadToken: number | undefined }>,
        reconcileCalls: [] as Array<{ conversationId: string; loadToken: number }>,
    };
    const refreshed = options.refreshed ?? options.messages;

    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        _conversationId: options.conversationId === undefined ? CONVERSATION_ID : options.conversationId,
        messages: options.messages,
        currentUser: { ID: 'user-1' },
        conversationLoadToken: 7,
        lastLoadedConversationId: CONVERSATION_ID,
        windowStore: {
            RefreshLatest: async (): Promise<void> => {
                state.refreshCalls++;
                if (options.invalidateDuringRefresh) {
                    // A different conversation was selected while we awaited the refresh.
                    (component as unknown as { conversationLoadToken: number }).conversationLoadToken = 99;
                }
            },
            GetSnapshot: () => ({ Details: refreshed }),
        },
        loadPeripheralData: async (conversationId: string, _snapshot: unknown, loadToken?: number): Promise<void> => {
            state.peripheralCalls.push({ conversationId, loadToken });
        },
        detectAndReconcileAgentRuns: async (conversationId: string, loadToken: number): Promise<void> => {
            state.reconcileCalls.push({ conversationId, loadToken });
            if (options.reconcilerThrows) {
                throw new Error('reconcile blew up');
            }
        },
        cdr: { detectChanges: vi.fn() },
    });

    const run = (component as unknown as { reconcileAfterStreamReconnect(): Promise<void> })
        .reconcileAfterStreamReconnect.bind(component);

    return {
        run,
        get refreshCalls() { return state.refreshCalls; },
        get peripheralCalls() { return state.peripheralCalls; },
        get reconcileCalls() { return state.reconcileCalls; },
        messagesAfter: () => (component as unknown as { messages: MJConversationDetailEntity[] }).messages,
        lastLoadedConversationId: () => (component as unknown as { lastLoadedConversationId: string | null }).lastLoadedConversationId,
    };
}

describe('reconcileAfterStreamReconnect — the catch-up', () => {
    it('reconciles when an AI message is still showing In-Progress', async () => {
        const harness = buildReconcileHarness({
            messages: [detail('d-user', 'User', 'Complete'), detail('d-ai', 'AI', 'In-Progress')],
        });

        await harness.run();

        expect(harness.reconcileCalls).toEqual([{ conversationId: CONVERSATION_ID, loadToken: 7 }]);
    });

    it('re-reads the window BEFORE reconciling — order is load-bearing', async () => {
        // detectAndReconcileAgentRuns compares message status against agentRunsByDetailId,
        // which is a snapshot taken when the window loaded. Reconciling without refreshing it
        // compares the stale rows against themselves and always concludes nothing changed.
        const harness = buildReconcileHarness({
            messages: [detail('d-ai', 'AI', 'In-Progress')],
            refreshed: [detail('d-ai', 'AI', 'Complete')],
        });

        await harness.run();

        expect(harness.refreshCalls).toBe(1);
        expect(harness.peripheralCalls).toHaveLength(1);
        expect(harness.reconcileCalls).toHaveLength(1);
        expect(harness.messagesAfter().map(m => m.Status)).toEqual(['Complete']);
    });

    it('clears lastLoadedConversationId so loadPeripheralData does not short-circuit', async () => {
        // loadPeripheralData returns immediately when it has already run for this conversation;
        // without clearing the marker the refreshed agent runs would never reach the maps.
        const harness = buildReconcileHarness({ messages: [detail('d-ai', 'AI', 'In-Progress')] });

        await harness.run();

        expect(harness.lastLoadedConversationId()).toBeNull();
    });

    it('also reconciles a message the client marked Error — the server may have completed it', async () => {
        const harness = buildReconcileHarness({ messages: [detail('d-ai', 'AI', 'Error')] });

        await harness.run();

        expect(harness.reconcileCalls).toHaveLength(1);
    });

    it('does nothing at all when every message has settled', async () => {
        const harness = buildReconcileHarness({
            messages: [detail('d-user', 'User', 'Complete'), detail('d-ai', 'AI', 'Complete')],
        });

        await harness.run();

        expect(harness.refreshCalls).toBe(0);
        expect(harness.reconcileCalls).toEqual([]);
    });

    it('ignores an In-Progress USER message — only agent runs are reconciled', async () => {
        const harness = buildReconcileHarness({ messages: [detail('d-user', 'User', 'In-Progress')] });

        await harness.run();

        expect(harness.refreshCalls).toBe(0);
    });

    it('does nothing when no conversation is loaded', async () => {
        const harness = buildReconcileHarness({
            messages: [detail('d-ai', 'AI', 'In-Progress')],
            conversationId: null,
        });

        await harness.run();

        expect(harness.refreshCalls).toBe(0);
        expect(harness.reconcileCalls).toEqual([]);
    });

    it('abandons the catch-up when the user switches conversation mid-refresh', async () => {
        const harness = buildReconcileHarness({
            messages: [detail('d-ai', 'AI', 'In-Progress')],
            invalidateDuringRefresh: true,
        });

        await harness.run();

        expect(harness.refreshCalls).toBe(1);
        // Writing the old conversation's peripherals onto the new one is the bug the
        // load-token check exists to prevent.
        expect(harness.peripheralCalls).toEqual([]);
        expect(harness.reconcileCalls).toEqual([]);
    });

    it('swallows a failed catch-up rather than breaking the live conversation', async () => {
        // The polling fallback and the next conversation load remain; a rejected promise here
        // would surface as an unhandled rejection from a `void`-ed call in a subscription.
        const harness = buildReconcileHarness({
            messages: [detail('d-ai', 'AI', 'In-Progress')],
            reconcilerThrows: true,
        });

        await expect(harness.run()).resolves.toBeUndefined();
        expect(harness.reconcileCalls).toHaveLength(1);
    });
});
