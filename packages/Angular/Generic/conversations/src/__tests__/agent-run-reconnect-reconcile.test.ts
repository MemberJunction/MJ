/**
 * @fileoverview A run that finishes while the socket is down must be reconciled on reconnect —
 * including a message the client already gave up on and marked Error.
 *
 * ## What this pins
 *
 * The reconnect trigger itself belongs to the liveness supervisor (MJ #4222):
 * `ConversationsRuntime.Instance.Liveness.ReconciliationRequired$` emits `socket-reconnected` /
 * `stream-reconnected`, and the chat area answers with one coalesced `ReconcileNow` pass. That pass
 * re-reads run rows for In-Progress messages only, which leaves two gaps after a transport outage:
 *
 *  - a message the client marked **Error** (e.g. on a socket timeout) while the server went on to
 *    complete the run is never corrected — `correctStaleErrorMessages` judges it against the run
 *    map, and nothing refreshed that message's run;
 *  - rows written while the socket was down never reach the window, because their events were
 *    dropped.
 *
 * So a TRANSPORT reconnect, when any AI message is unsettled (In-Progress or Error), re-reads the
 * newest window page and rebuilds the peripherals before the usual run refresh and reconcile. The
 * other supervisor reasons keep next's narrow refresh only.
 *
 * Driven off the prototype (no constructor/TestBed), in the style of chat-area-reconcile.test.ts:
 * the real `ReconcileNow` → `reconcileOnce` path runs against stubbed collaborators.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

function detail(id: string, role: 'AI' | 'User', status: string): MJConversationDetailEntity {
    return { ID: id, ConversationID: CONVERSATION_ID, Role: role, Status: status } as unknown as MJConversationDetailEntity;
}

interface Harness {
    component: ConversationChatAreaComponent;
    open: Record<string, unknown>;
    /** Every collaborator call, in order. */
    calls: string[];
    peripheralLoadTokens: Array<number | undefined>;
}

function buildHarness(options: {
    messages: MJConversationDetailEntity[] | undefined;
    refreshed?: MJConversationDetailEntity[];
    /** Simulates another conversation being selected while the window refresh is awaited. */
    invalidateDuringRefresh?: boolean;
    /** Makes the window refresh reject, to check the pass cannot break the live conversation. */
    refreshThrows?: boolean;
    /** Replaces the run-row refresh, e.g. with a gate that holds a pass open. */
    refreshRuns?: () => Promise<void>;
}): Harness {
    const calls: string[] = [];
    const peripheralLoadTokens: Array<number | undefined> = [];
    const refreshed = options.refreshed ?? options.messages ?? [];

    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;

    open.conversationId = CONVERSATION_ID;
    open.currentUser = { ID: 'user-1' };
    open.conversationLoadToken = 7;
    open.lastLoadedConversationId = CONVERSATION_ID;
    open.messages = options.messages;
    open.isActiveConversationLoad = vi.fn((_c: string, token: number) => token === open.conversationLoadToken);
    open.windowStore = {
        RefreshLatest: vi.fn(async (): Promise<void> => {
            calls.push('window');
            if (options.refreshThrows) {
                throw new Error('network down');
            }
            if (options.invalidateDuringRefresh) {
                open.conversationLoadToken = 99;
            }
        }),
        GetSnapshot: () => ({ Details: refreshed }),
    };
    open.loadPeripheralData = vi.fn(async (_c: string, _s: unknown, loadToken?: number): Promise<void> => {
        calls.push('peripherals');
        peripheralLoadTokens.push(loadToken);
    });
    open.refreshAgentRunsForInProgress = vi.fn(options.refreshRuns ?? (async (): Promise<void> => {
        calls.push('runs');
    }));
    open.detectAndReconcileAgentRuns = vi.fn(async (): Promise<void> => {
        calls.push('reconcile');
    });

    return { component, open, calls, peripheralLoadTokens };
}

afterEach(() => vi.restoreAllMocks());

describe('ReconcileNow on a transport reconnect — the catch-up', () => {
    for (const reason of ['socket-reconnected', 'stream-reconnected']) {
        it(`re-reads the window and rebuilds peripherals BEFORE the run refresh and reconcile (${reason})`, async () => {
            // The reconcile decides from the run map. Reconciling before the map is rebuilt from a
            // fresh read compares stale rows against themselves and concludes nothing changed.
            const h = buildHarness({
                messages: [detail('d-user', 'User', 'Complete'), detail('d-ai', 'AI', 'In-Progress')],
            });

            await h.component.ReconcileNow(reason);

            expect(h.calls).toEqual(['window', 'peripherals', 'runs', 'reconcile']);
            expect(h.peripheralLoadTokens).toEqual([7]);
        });
    }

    it('adopts the refreshed window as the message list', async () => {
        const h = buildHarness({
            messages: [detail('d-ai', 'AI', 'In-Progress')],
            refreshed: [detail('d-ai', 'AI', 'Complete'), detail('d-new', 'AI', 'Complete')],
        });

        await h.component.ReconcileNow('stream-reconnected');

        const after = h.open.messages as MJConversationDetailEntity[];
        expect(after.map(m => m.ID)).toEqual(['d-ai', 'd-new']);
    });

    it('clears lastLoadedConversationId so loadPeripheralData does not short-circuit', async () => {
        // loadPeripheralData returns immediately when it has already run for this conversation;
        // without clearing the marker the refreshed agent runs would never reach the run map.
        const h = buildHarness({ messages: [detail('d-ai', 'AI', 'In-Progress')] });

        await h.component.ReconcileNow('socket-reconnected');

        expect(h.open.lastLoadedConversationId).toBeNull();
    });

    it('also refreshes for a message the client marked Error — the server may have completed it', async () => {
        const h = buildHarness({ messages: [detail('d-ai', 'AI', 'Error')] });

        await h.component.ReconcileNow('stream-reconnected');

        expect(h.calls).toEqual(['window', 'peripherals', 'runs', 'reconcile']);
    });

    it('skips the window read when every message has settled, and still reconciles', async () => {
        const h = buildHarness({
            messages: [detail('d-user', 'User', 'Complete'), detail('d-ai', 'AI', 'Complete')],
        });

        await h.component.ReconcileNow('socket-reconnected');

        expect(h.calls).toEqual(['runs', 'reconcile']);
    });

    it('ignores an In-Progress USER message — only agent replies are unsettled', async () => {
        const h = buildHarness({ messages: [detail('d-user', 'User', 'In-Progress')] });

        await h.component.ReconcileNow('stream-reconnected');

        expect(h.calls).toEqual(['runs', 'reconcile']);
    });

    for (const reason of ['tab-visible', 'browser-online', 'message-liveness', 'completion-for-unloaded-message']) {
        it(`keeps the narrow refresh only for a non-transport trigger (${reason})`, async () => {
            // These fire far more often than a reconnect, and the transport was not down.
            const h = buildHarness({ messages: [detail('d-ai', 'AI', 'Error')] });

            await h.component.ReconcileNow(reason);

            expect(h.calls).toEqual(['runs', 'reconcile']);
        });
    }

    it('abandons the pass when the user switches conversation mid-refresh', async () => {
        const h = buildHarness({
            messages: [detail('d-ai', 'AI', 'In-Progress')],
            invalidateDuringRefresh: true,
        });

        await h.component.ReconcileNow('socket-reconnected');

        // Writing the old conversation's peripherals or repairs onto the new one is the bug the
        // load-token check exists to prevent.
        expect(h.calls).toEqual(['window']);
    });

    it('swallows a failed window refresh rather than breaking the live conversation', async () => {
        const h = buildHarness({
            messages: [detail('d-ai', 'AI', 'In-Progress')],
            refreshThrows: true,
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(h.component.ReconcileNow('stream-reconnected')).resolves.toBeUndefined();
        expect(consoleError).toHaveBeenCalled();
    });

    it('consumes the request: a later non-transport pass does not refresh the window again', async () => {
        const h = buildHarness({ messages: [detail('d-ai', 'AI', 'In-Progress')] });

        await h.component.ReconcileNow('socket-reconnected');
        h.calls.length = 0;
        await h.component.ReconcileNow('tab-visible');

        expect(h.calls).toEqual(['runs', 'reconcile']);
    });
});

describe('ReconcileNow coalescing keeps a reconnect that arrives mid-pass', () => {
    it('runs the window refresh in the follow-up pass even when a later reason replaced it', async () => {
        // ReconcileNow folds mid-pass requests into ONE follow-up carrying the LAST reason. A wake
        // from sleep produces a reconnect and a tab-visible together; if the follow-up were keyed
        // on its reason alone, the tab-visible would erase the reconnect's window refresh.
        const gates: Array<() => void> = [];
        const h = buildHarness({
            messages: [detail('d-ai', 'AI', 'In-Progress')],
            refreshRuns: async () => {
                h.calls.push('runs');
                await new Promise<void>(resolve => gates.push(resolve));
            },
        });
        const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

        const first = h.component.ReconcileNow('message-liveness');
        await settle();
        const second = h.component.ReconcileNow('socket-reconnected');
        const third = h.component.ReconcileNow('tab-visible');

        gates.shift()?.();
        await settle();
        gates.shift()?.();
        await Promise.all([first, second, third]);

        expect(h.calls).toEqual(['runs', 'reconcile', 'window', 'peripherals', 'runs', 'reconcile']);
    });
});

describe('ReconcileNow corrects a stale Error after a reconnect, end to end', () => {
    it('completes an Error message whose run the server finished while the socket was down', async () => {
        // The real run-refresh and reconcile run here; only I/O is stubbed. The run map still holds
        // the pre-outage `Running` row. Only the window re-read brings the `Completed` row in, and
        // only then can correctStaleErrorMessages repair the message.
        const message = detail('d-ai', 'AI', 'Error');
        const staleRun = { ID: 'run-1', ConversationDetailID: 'd-ai', Status: 'Running' };
        const freshRun = { ID: 'run-1', ConversationDetailID: 'd-ai', Status: 'Completed' };

        const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
        const open = component as unknown as Record<string, unknown>;
        open.conversationId = CONVERSATION_ID;
        open.currentUser = { ID: 'user-1' };
        open.conversationLoadToken = 7;
        open.lastLoadedConversationId = CONVERSATION_ID;
        open.messages = [message];
        open.AgentRunsByDetailId = new Map([['d-ai', staleRun]]);
        open.isActiveConversationLoad = vi.fn(() => true);
        open.windowStore = {
            RefreshLatest: vi.fn(async () => {}),
            GetSnapshot: () => ({ Details: [message], AgentRunsByDetailId: new Map([['d-ai', freshRun]]) }),
        };
        // Stands in for the real rebuild: copy the snapshot's runs into the component's map.
        open.loadPeripheralData = vi.fn(async (_c: string, snapshot: { AgentRunsByDetailId: Map<string, unknown> }) => {
            open.AgentRunsByDetailId = new Map(snapshot.AgentRunsByDetailId);
        });
        const handleMessageCompletion = vi.fn(async () => {});
        open.handleMessageCompletion = handleMessageCompletion;

        await component.ReconcileNow('stream-reconnected');

        expect(handleMessageCompletion).toHaveBeenCalledTimes(1);
        expect(handleMessageCompletion).toHaveBeenCalledWith(message, 'run-1', CONVERSATION_ID, 7);
    });
});
