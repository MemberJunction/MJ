/**
 * @fileoverview Tests for ConversationStreaming.
 *
 * Covers: callback registration/unregistration, message routing by ConversationDetailID,
 * completion event broadcast + late-arrival replay, IActiveTaskTracker adapter wiring,
 * and Dispose cleanup. Does NOT exercise the real PubSub subscription — we call the
 * private `routeAgentProgress` / `routeTaskProgress` paths indirectly by simulating
 * payloads via `handlePushStatusUpdate` (exposed via a tiny test seam).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ConversationStreaming, type CompletionEvent } from '../streaming/ConversationStreaming';
import type { IConversationsRuntimeContext } from '../context/IConversationsRuntimeContext';

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        Instance: {
            PushStatusUpdates: vi.fn(),
        },
    },
}));

function buildContext(): {
    context: IConversationsRuntimeContext;
    removeByAgentRunId: ReturnType<typeof vi.fn>;
    notify: ReturnType<typeof vi.fn>;
} {
    const removeByAgentRunId = vi.fn().mockReturnValue(true);
    const notify = vi.fn();
    const context: IConversationsRuntimeContext = {
        Notification: { Notify: notify },
        Tasks: { RemoveByAgentRunId: removeByAgentRunId },
    };
    return { context, removeByAgentRunId, notify };
}

/**
 * Reach into the streaming instance and invoke the private route handler. We cast
 * through `unknown` to access the private method — keeps the runtime API clean
 * (no test-only public method) while still letting us exercise the routing
 * logic without spinning up a real GraphQL subscription.
 */
async function dispatchAgentProgress(
    streaming: ConversationStreaming,
    payload: Record<string, unknown>
): Promise<void> {
    const priv = streaming as unknown as {
        routeAgentProgress(p: Record<string, unknown>): Promise<void>;
    };
    await priv.routeAgentProgress(payload);
}

async function dispatchTaskProgress(
    streaming: ConversationStreaming,
    payload: Record<string, unknown>
): Promise<void> {
    const priv = streaming as unknown as {
        routeTaskProgress(p: Record<string, unknown>): Promise<void>;
    };
    await priv.routeTaskProgress(payload);
}

describe('ConversationStreaming', () => {
    let streaming: ConversationStreaming;
    let context: IConversationsRuntimeContext;
    let removeByAgentRunId: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        const built = buildContext();
        context = built.context;
        removeByAgentRunId = built.removeByAgentRunId;
        streaming = new ConversationStreaming(context);
    });

    describe('callback registry', () => {
        it('registers and unregisters callbacks', () => {
            const cb = vi.fn();
            streaming.registerMessageCallback('detail-1', cb);
            expect(streaming.getRegisteredCallbackCount()).toBe(1);
            expect(streaming.getTrackedMessageCount()).toBe(1);

            streaming.unregisterMessageCallback('detail-1', cb);
            expect(streaming.getRegisteredCallbackCount()).toBe(0);
            expect(streaming.getTrackedMessageCount()).toBe(0);
        });

        it('supports multiple callbacks per message', () => {
            streaming.registerMessageCallback('detail-1', vi.fn());
            streaming.registerMessageCallback('detail-1', vi.fn());
            expect(streaming.getRegisteredCallbackCount()).toBe(2);
            expect(streaming.getTrackedMessageCount()).toBe(1);
        });

        it('removes only the specified callback when one is supplied', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            streaming.registerMessageCallback('detail-1', cb1);
            streaming.registerMessageCallback('detail-1', cb2);

            streaming.unregisterMessageCallback('detail-1', cb1);
            expect(streaming.getRegisteredCallbackCount()).toBe(1);
        });

        it('removes all callbacks for a message when none is supplied', () => {
            streaming.registerMessageCallback('detail-1', vi.fn());
            streaming.registerMessageCallback('detail-1', vi.fn());
            streaming.unregisterMessageCallback('detail-1');
            expect(streaming.getRegisteredCallbackCount()).toBe(0);
        });
    });

    describe('routing agent progress', () => {
        it('invokes the registered callback for the matching ConversationDetailID', async () => {
            const cb = vi.fn();
            streaming.registerMessageCallback('detail-1', cb);

            await dispatchAgentProgress(streaming, {
                data: {
                    agentRun: { ConversationDetailID: 'detail-1', Agent: 'Sage' },
                    progress: { message: 'thinking', percentage: 25 },
                },
            });

            expect(cb).toHaveBeenCalledOnce();
            const update = cb.mock.calls[0][0];
            expect(update.conversationDetailId).toBe('detail-1');
            expect(update.message).toBe('thinking');
            expect(update.percentComplete).toBe(25);
            expect(update.resolver).toBe('RunAIAgentResolver');
        });

        it('does not invoke unrelated callbacks', async () => {
            const otherCb = vi.fn();
            streaming.registerMessageCallback('detail-other', otherCb);

            await dispatchAgentProgress(streaming, {
                data: {
                    agentRun: { ConversationDetailID: 'detail-1' },
                    progress: { message: 'thinking' },
                },
            });

            expect(otherCb).not.toHaveBeenCalled();
        });

        it('continues with remaining callbacks when one throws', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                const badCb = vi.fn().mockImplementation(() => {
                    throw new Error('boom');
                });
                const goodCb = vi.fn();
                streaming.registerMessageCallback('detail-1', badCb);
                streaming.registerMessageCallback('detail-1', goodCb);

                await dispatchAgentProgress(streaming, {
                    data: {
                        agentRun: { ConversationDetailID: 'detail-1' },
                        progress: { message: 'thinking' },
                    },
                });

                expect(badCb).toHaveBeenCalledOnce();
                expect(goodCb).toHaveBeenCalledOnce();
            } finally {
                consoleSpy.mockRestore();
            }
        });
    });

    describe('completion + late-arrival replay', () => {
        it('clears the matching task via the IActiveTaskTracker adapter on completion', async () => {
            await dispatchAgentProgress(streaming, {
                data: {
                    type: 'complete',
                    agentRunId: 'run-1',
                    conversationDetailId: 'detail-1',
                    success: true,
                },
            });

            expect(removeByAgentRunId).toHaveBeenCalledWith('run-1');
        });

        it('broadcasts a CompletionEvent with enriched data', async () => {
            const events: CompletionEvent[] = [];
            streaming.completionEvents$.subscribe((e) => events.push(e));

            await dispatchAgentProgress(streaming, {
                data: {
                    type: 'complete',
                    agentRunId: 'run-1',
                    conversationDetailId: 'detail-1',
                    success: false,
                    errorMessage: 'timeout',
                },
            });

            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                conversationDetailId: 'detail-1',
                agentRunId: 'run-1',
                success: false,
                errorMessage: 'timeout',
            });
        });

        it('lets a late-mounting component replay a recent completion', async () => {
            await dispatchAgentProgress(streaming, {
                data: {
                    type: 'complete',
                    agentRunId: 'run-1',
                    conversationDetailId: 'detail-1',
                    success: true,
                },
            });

            const replayed = streaming.getRecentCompletion('detail-1');
            expect(replayed).toBeDefined();
            expect(replayed!.agentRunId).toBe('run-1');
        });

        it('clearRecentCompletion drops the replay entry', async () => {
            await dispatchAgentProgress(streaming, {
                data: {
                    type: 'complete',
                    agentRunId: 'run-1',
                    conversationDetailId: 'detail-1',
                },
            });
            streaming.clearRecentCompletion('detail-1');
            expect(streaming.getRecentCompletion('detail-1')).toBeUndefined();
        });
    });

    describe('TaskOrchestrator routing', () => {
        it('routes task progress updates to the matching message callbacks', async () => {
            const cb = vi.fn();
            streaming.registerMessageCallback('detail-1', cb);

            await dispatchTaskProgress(streaming, {
                data: {
                    taskName: 'sync-files',
                    message: 'uploading...',
                    percentComplete: 50,
                    conversationDetailId: 'detail-1',
                },
            });

            expect(cb).toHaveBeenCalledOnce();
            expect(cb.mock.calls[0][0].resolver).toBe('TaskOrchestrator');
            expect(cb.mock.calls[0][0].taskName).toBe('sync-files');
        });

        it('ignores task progress without a conversationDetailId', async () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                const cb = vi.fn();
                streaming.registerMessageCallback('detail-1', cb);

                await dispatchTaskProgress(streaming, {
                    data: { message: 'doing stuff' },
                });

                expect(cb).not.toHaveBeenCalled();
            } finally {
                consoleSpy.mockRestore();
            }
        });
    });

    describe('lifecycle', () => {
        it('Dispose clears state and is safe to call repeatedly', () => {
            streaming.registerMessageCallback('detail-1', vi.fn());
            expect(streaming.getTrackedMessageCount()).toBe(1);

            streaming.Dispose();
            expect(streaming.getTrackedMessageCount()).toBe(0);
            expect(() => streaming.Dispose()).not.toThrow();
        });
    });

    describe('diagnostic snapshot', () => {
        it('reports presence of callbacks + recent completions for a message', async () => {
            streaming.registerMessageCallback('detail-1', vi.fn());
            await dispatchAgentProgress(streaming, {
                data: {
                    type: 'complete',
                    agentRunId: 'run-1',
                    conversationDetailId: 'detail-1',
                },
            });

            const snap = streaming.getDiagnosticSnapshot('detail-1');
            expect(snap.hasCallbacks).toBe(true);
            expect(snap.callbackCount).toBe(1);
            expect(snap.recentCompletion).toBeDefined();
        });
    });
});
