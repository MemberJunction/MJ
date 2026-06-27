import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { GraphQLAIClient } from '../graphQLAIClient';
import { GraphQLDataProvider } from '../graphQLDataProvider';
import { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

/**
 * Covers the idle-stall reconciliation added to the fire-and-forget agent paths:
 * - payload rehydration from the persisted run record (recovers a lost completion event)
 * - the run selector used to query the record (ConversationDetailID for the conversation
 *   path, the captured run id for the plain path)
 */

const IDLE_MS = 12 * 60 * 1000; // GraphQLAIClient uses the FireAndForgetHelper default

interface RunRow {
    ID: string;
    Status: string;
    Result: string | null;
    ErrorMessage: string | null;
}

/** Stub provider whose PubSub stream is the supplied Subject and whose RunView returns `run`. */
function makeProvider(stream: Subject<string>, run: RunRow | undefined, runView = vi.fn()) {
    runView.mockResolvedValue({ Success: true, Results: run ? [run] : [] });
    return {
        sessionId: 'sess-1',
        PushStatusUpdates: () => stream.asObservable(),
        ExecuteGQL: vi.fn().mockImplementation((_m: string, _v: Record<string, unknown>) =>
            Promise.resolve({
                RunAIAgent: { success: true },
                RunAIAgentFromConversationDetail: { success: true },
            })),
        RunView: runView,
    } as unknown as GraphQLDataProvider;
}

const agentParams = { agent: { ID: 'agent-1' }, conversationMessages: [] } as unknown as ExecuteAgentParams;

/** Flush the awaited mutation ack microtask under fake timers. */
async function flush() {
    await vi.advanceTimersByTimeAsync(0);
}

describe('GraphQLAIClient idle-stall reconciliation', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('conversation-detail path reconciles by ConversationDetailID and rehydrates payload', async () => {
        const stream = new Subject<string>();
        const runView = vi.fn();
        const run: RunRow = {
            ID: 'run-9',
            Status: 'Completed',
            Result: JSON.stringify({ answer: 42 }),
            ErrorMessage: null,
        };
        const client = new GraphQLAIClient(makeProvider(stream, run, runView));

        const p = client.RunAIAgentFromConversationDetail({
            conversationDetailId: 'cd-123',
            agentId: 'agent-1',
        } as Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0]);

        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_MS); // idle window elapses -> reconcile

        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(true);
        expect(result.payload).toEqual({ answer: 42 });
        expect(result.agentRun).toBe(run);

        // Selector is the stable, operation-specific ConversationDetailID — not a scraped run id.
        const filter = runView.mock.calls[0][0].ExtraFilter as string;
        expect(filter).toBe("ConversationDetailID='cd-123'");
    });

    it('plain RunAIAgent path reconciles by the run id captured from the stream', async () => {
        const stream = new Subject<string>();
        const runView = vi.fn();
        const run: RunRow = { ID: 'run-7', Status: 'Completed', Result: null, ErrorMessage: null };
        const client = new GraphQLAIClient(makeProvider(stream, run, runView));

        const p = client.RunAIAgent(agentParams);

        await flush();
        // A progress message carries the agent run id; capture wires it into the reconcile filter.
        stream.next(JSON.stringify({ resolver: 'RunAIAgentResolver', type: 'ExecutionProgress', data: { agentRunId: 'run-7' } }));
        await vi.advanceTimersByTimeAsync(IDLE_MS);

        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(true);
        expect(result.payload).toBeUndefined(); // null Result -> no payload
        expect(runView.mock.calls[0][0].ExtraFilter).toBe("ID='run-7'");
    });

    it('keeps waiting while the run record is still Running, then resolves once terminal', async () => {
        const stream = new Subject<string>();
        const runView = vi.fn().mockResolvedValueOnce({ Success: true, Results: [{ ID: 'run-1', Status: 'Running', Result: null, ErrorMessage: null }] })
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'run-1', Status: 'Completed', Result: JSON.stringify({ ok: true }), ErrorMessage: null }] });
        const client = new GraphQLAIClient(makeProvider(stream, undefined, runView));

        const p = client.RunAIAgentFromConversationDetail({
            conversationDetailId: 'cd-1',
            agentId: 'agent-1',
        } as Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0]);
        let settled = false;
        void p.then(() => { settled = true; });

        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_MS); // first stall -> Running -> continue
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(IDLE_MS); // second stall -> Completed -> resolve
        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(true);
        expect(result.payload).toEqual({ ok: true });
        expect(runView).toHaveBeenCalledTimes(2);
    });

    it('treats Paused / AwaitingFeedback as a successful recovery', async () => {
        const stream = new Subject<string>();
        const run: RunRow = { ID: 'run-3', Status: 'AwaitingFeedback', Result: JSON.stringify({ q: 'x' }), ErrorMessage: null };
        const client = new GraphQLAIClient(makeProvider(stream, run));

        const p = client.RunAIAgentFromConversationDetail({
            conversationDetailId: 'cd-2',
            agentId: 'agent-1',
        } as Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0]);

        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_MS);

        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(true);
        expect(result.payload).toEqual({ q: 'x' });
    });
});
