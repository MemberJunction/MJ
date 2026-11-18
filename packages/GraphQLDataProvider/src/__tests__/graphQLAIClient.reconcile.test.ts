import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { GraphQLAIClient } from '../graphQLAIClient';
import { DEFAULT_IDLE_TIMEOUT_MS } from '../fireAndForgetHelper';
import { GraphQLDataProvider } from '../graphQLDataProvider';
import { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

/**
 * Covers the idle-stall reconciliation added to the fire-and-forget agent paths:
 * - payload rehydration from the persisted run record's FinalPayload, or Result on older rows
 *   (recovers a lost completion event)
 * - the run selector used to query the record (ConversationDetailID for the conversation
 *   path, the captured run id for the plain path)
 */

// Imported, never restated: this window and MJServer's liveness-pulse cadence are a matched
// pair (see DEFAULT_IDLE_TIMEOUT_MS), and a hardcoded copy silently advances past several
// windows when the real value shrinks — turning "one stall" into four.
const IDLE_MS = DEFAULT_IDLE_TIMEOUT_MS;

interface RunRow {
    ID: string;
    Status: string;
    FinalPayload: string | null;
    Result: string | null;
    ErrorMessage: string | null;
}

/**
 * Stub provider whose PubSub stream is the supplied Subject and whose RunView returns `run`. The
 * conversation-detail ack names the reply row `replyId`, as the server's does.
 */
function makeProvider(stream: Subject<string>, run: RunRow | undefined, runView = vi.fn(), replyId = 'cd-1') {
    runView.mockResolvedValue({ Success: true, Results: run ? [run] : [] });
    return {
        sessionId: 'sess-1',
        PushStatusUpdates: () => stream.asObservable(),
        ExecuteGQL: vi.fn().mockImplementation((_m: string, _v: Record<string, unknown>) =>
            Promise.resolve({
                RunAIAgent: { success: true },
                RunAIAgentFromConversationDetail: {
                    success: true,
                    result: JSON.stringify({ accepted: true, fireAndForget: true, conversationDetailId: replyId, createdAt: '2026-10-12T10:00:00.000Z' }),
                },
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
            FinalPayload: JSON.stringify({ answer: 42 }),
            Result: null,
            ErrorMessage: null,
        };
        const client = new GraphQLAIClient(makeProvider(stream, run, runView, 'cd-123'));

        const p = client.RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
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

    it('does not query the run record while the conversation-detail ack is still pending', async () => {
        // The idle window starts before the mutation, so a slow server (a long history load) stalls before the ack
        // names the reply row. With no row yet there is nothing to reconcile by; an empty ID is not a filter.
        const stream = new Subject<string>();
        const runView = vi.fn();
        const provider = makeProvider(stream, undefined, runView);
        (provider as unknown as { ExecuteGQL: ReturnType<typeof vi.fn> }).ExecuteGQL.mockReturnValue(new Promise(() => {}));
        const client = new GraphQLAIClient(provider);

        void client.RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
            agentId: 'agent-1',
        } as Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0]);

        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_MS);
        expect(runView).not.toHaveBeenCalled();
    });

    it('plain RunAIAgent path reconciles by the run id captured from the stream', async () => {
        const stream = new Subject<string>();
        const runView = vi.fn();
        const run: RunRow = { ID: 'run-7', Status: 'Completed', FinalPayload: null, Result: null, ErrorMessage: null };
        const client = new GraphQLAIClient(makeProvider(stream, run, runView));

        const p = client.RunAIAgent(agentParams);

        await flush();
        // A progress message carries the agent run id; capture wires it into the reconcile filter.
        stream.next(JSON.stringify({ resolver: 'RunAIAgentResolver', type: 'ExecutionProgress', data: { agentRunId: 'run-7' } }));
        await vi.advanceTimersByTimeAsync(IDLE_MS);

        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(true);
        expect(result.payload).toBeUndefined(); // no FinalPayload or Result -> no payload
        expect(runView.mock.calls[0][0].ExtraFilter).toBe("ID='run-7'");
    });

    it('keeps waiting while the run record is still Running, then resolves once terminal', async () => {
        const stream = new Subject<string>();
        // FinalPayload is filled during the run, so a Running row can already carry one.
        const running: RunRow = { ID: 'run-1', Status: 'Running', FinalPayload: JSON.stringify({ partial: true }), Result: null, ErrorMessage: null };
        const completed: RunRow = { ID: 'run-1', Status: 'Completed', FinalPayload: JSON.stringify({ ok: true }), Result: null, ErrorMessage: null };
        const runView = vi.fn().mockResolvedValueOnce({ Success: true, Results: [running] })
            .mockResolvedValueOnce({ Success: true, Results: [completed] });
        const client = new GraphQLAIClient(makeProvider(stream, undefined, runView));

        const p = client.RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
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
        const run: RunRow = { ID: 'run-3', Status: 'AwaitingFeedback', FinalPayload: JSON.stringify({ q: 'x' }), Result: null, ErrorMessage: null };
        const client = new GraphQLAIClient(makeProvider(stream, run, vi.fn(), 'cd-2'));

        const p = client.RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
            agentId: 'agent-1',
        } as Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0]);

        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_MS);

        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(true);
        expect(result.payload).toEqual({ q: 'x' });
    });

    it('falls back to Result on an older row that has no FinalPayload', async () => {
        const stream = new Subject<string>();
        const run: RunRow = { ID: 'run-4', Status: 'Completed', FinalPayload: null, Result: JSON.stringify({ legacy: true }), ErrorMessage: null };
        const client = new GraphQLAIClient(makeProvider(stream, run, vi.fn(), 'cd-4'));

        const p = client.RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
            agentId: 'agent-1',
        } as Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0]);

        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_MS);

        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(true);
        expect(result.payload).toEqual({ legacy: true });
    });

    it('prefers FinalPayload over Result when a row has both', async () => {
        const stream = new Subject<string>();
        const run: RunRow = {
            ID: 'run-5',
            Status: 'Completed',
            FinalPayload: JSON.stringify({ source: 'FinalPayload' }),
            Result: JSON.stringify({ source: 'Result' }),
            ErrorMessage: null,
        };
        const client = new GraphQLAIClient(makeProvider(stream, run, vi.fn(), 'cd-5'));

        const p = client.RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
            agentId: 'agent-1',
        } as Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0]);

        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_MS);

        const result = (await p) as ExecuteAgentResult;
        expect(result.payload).toEqual({ source: 'FinalPayload' });
    });

    it('returns the partial payload a Cancelled run saved, with success false', async () => {
        const stream = new Subject<string>();
        // Cancelling saves the run with no Result, but it keeps the FinalPayload saved during the run.
        const run: RunRow = {
            ID: 'run-6',
            Status: 'Cancelled',
            FinalPayload: JSON.stringify({ partial: true }),
            Result: null,
            ErrorMessage: 'Cancelled by user',
        };
        const client = new GraphQLAIClient(makeProvider(stream, run, vi.fn(), 'cd-6'));

        const p = client.RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
            agentId: 'agent-1',
        } as Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0]);

        await flush();
        await vi.advanceTimersByTimeAsync(IDLE_MS);

        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(false);
        expect(result.payload).toEqual({ partial: true });
        expect(result.errorMessage).toBe('Cancelled by user');
    });
});
