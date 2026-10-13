import { describe, expect, it, vi, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { parse, type OperationDefinitionNode, type FieldNode } from 'graphql';
import { GraphQLAIClient } from '../graphQLAIClient';
import type { AgentReplyAcknowledgement } from '../graphQLAIClient';
import { GraphQLDataProvider } from '../graphQLDataProvider';
import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';

/**
 * RunAIAgentFromConversationDetail after A19: the client names the user's message, the server creates the agent's
 * reply row and names it in the acknowledgement, and that ID keys the run from then on. Progress or a completion that
 * reaches the socket before the acknowledgement is held, then attributed by the ID the acknowledgement brings.
 */

const REPLY = 'REPLY-0000-0000-0000-000000000001';
const CREATED_AT = '2026-10-12T10:00:00.000Z';

type RunParams = Parameters<GraphQLAIClient['RunAIAgentFromConversationDetail']>[0];

/** A browser-like provider: a PubSub stream, and an ack the test releases when it chooses. */
function makeProvider(ackResult: Record<string, unknown>) {
    const stream = new Subject<string>();
    let releaseAck: () => void = () => undefined;
    const ackGate = new Promise<void>((resolve) => { releaseAck = resolve; });
    const executeGQL = vi.fn(async () => {
        await ackGate;
        return { RunAIAgentFromConversationDetail: ackResult };
    });
    const provider = {
        sessionId: 'sess-1',
        PushStatusUpdates: () => stream.asObservable(),
        ExecuteGQL: executeGQL,
        RunView: vi.fn(async () => ({ Success: true, Results: [] })),
    } as unknown as GraphQLDataProvider;
    return { provider, stream, executeGQL, releaseAck };
}

function ack(replyId: string | null = REPLY): Record<string, unknown> {
    const body: Record<string, unknown> = { accepted: true, fireAndForget: true, createdAt: CREATED_AT };
    if (replyId) {
        body.conversationDetailId = replyId;
    }
    return { success: true, result: JSON.stringify(body) };
}

function progress(detailId: string, message: string): string {
    return JSON.stringify({
        resolver: 'RunAIAgentResolver',
        type: 'ExecutionProgress',
        status: 'ok',
        data: { type: 'progress', conversationDetailId: detailId, agentRunId: 'run-1', progress: { currentStep: 'prompt_execution', message } },
    });
}

function completion(detailId: string): string {
    return JSON.stringify({
        resolver: 'RunAIAgentResolver',
        type: 'StreamingContent',
        status: 'ok',
        data: { type: 'complete', conversationDetailId: detailId, agentRunId: 'run-1', success: true, result: JSON.stringify({ success: true, agentRun: { ID: 'run-1' } }) },
    });
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => vi.restoreAllMocks());

describe('GraphQLAIClient.RunAIAgentFromConversationDetail — the server names the reply row', () => {
    it("sends the user's message ID and no reply ID", async () => {
        const { provider, stream, executeGQL, releaseAck } = makeProvider(ack());
        const p = new GraphQLAIClient(provider).RunAIAgentFromConversationDetail({ userMessageId: 'user-msg-1', agentId: 'agent-1' } as RunParams);
        releaseAck();
        await settle();
        stream.next(completion(REPLY));
        await p;

        const [document, variables] = executeGQL.mock.calls[0] as unknown as [string, Record<string, unknown>];
        const operation = parse(document).definitions[0] as OperationDefinitionNode;
        const args = ((operation.selectionSet.selections[0] as FieldNode).arguments ?? []).map((a) => a.name.value);
        expect(args).toContain('userMessageId');
        expect(args).not.toContain('conversationDetailId');
        expect(variables).toMatchObject({ userMessageId: 'user-msg-1', fireAndForget: true });
        expect(variables).not.toHaveProperty('conversationDetailId');
    });

    it('hands the acknowledged reply row to onAccepted before any progress, even progress that beat the ack', async () => {
        const { provider, stream, releaseAck } = makeProvider(ack());
        const events: string[] = [];
        let accepted: AgentReplyAcknowledgement | null = null;
        const p = new GraphQLAIClient(provider).RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
            agentId: 'agent-1',
            onAccepted: (reply) => { accepted = reply; events.push('accepted'); },
            onProgress: (update) => events.push(`progress:${update.message}`),
        } as RunParams);
        await settle();

        stream.next(progress(REPLY, 'early'));
        await settle();
        expect(events).toEqual([]); // held: nothing can say whose it is yet

        releaseAck();
        await settle();
        stream.next(progress(REPLY, 'late'));
        stream.next(completion(REPLY));
        const result = (await p) as ExecuteAgentResult;

        expect(result.success).toBe(true);
        expect(events).toEqual(['accepted', 'progress:early', 'progress:late']);
        expect(accepted).toEqual({ ConversationDetailId: REPLY, CreatedAt: new Date(CREATED_AT) });
    });

    it('resolves on a completion that arrived before the ack', async () => {
        const { provider, stream, releaseAck } = makeProvider(ack());
        const p = new GraphQLAIClient(provider).RunAIAgentFromConversationDetail({ userMessageId: 'user-msg-1', agentId: 'agent-1' } as RunParams);
        await settle();

        stream.next(completion(REPLY));
        releaseAck();

        expect(((await p) as ExecuteAgentResult).success).toBe(true);
    });

    it("does not hand this run another run's progress from the same session", async () => {
        const { provider, stream, releaseAck } = makeProvider(ack());
        const messages: string[] = [];
        const p = new GraphQLAIClient(provider).RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
            agentId: 'agent-1',
            onProgress: (update) => messages.push(update.message),
        } as RunParams);
        releaseAck();
        await settle();

        stream.next(progress('OTHER-REPLY', 'theirs'));
        stream.next(progress(REPLY, 'ours'));
        stream.next(completion(REPLY));
        await p;

        expect(messages).toEqual(['ours']);
    });

    it("ignores another run's completion and waits for its own", async () => {
        const { provider, stream, releaseAck } = makeProvider(ack());
        const p = new GraphQLAIClient(provider).RunAIAgentFromConversationDetail({ userMessageId: 'user-msg-1', agentId: 'agent-1' } as RunParams);
        let settled = false;
        void p.then(() => { settled = true; });
        releaseAck();
        await settle();

        stream.next(completion('OTHER-REPLY'));
        await settle();
        expect(settled).toBe(false);

        stream.next(completion(REPLY.toLowerCase())); // the same row, as another database spells it
        expect(((await p) as ExecuteAgentResult).success).toBe(true);
    });

    it('treats an ack that names no reply row as a refusal, not a run to wait on forever', async () => {
        const { provider, releaseAck } = makeProvider(ack(null));
        const onAccepted = vi.fn();
        const p = new GraphQLAIClient(provider).RunAIAgentFromConversationDetail({ userMessageId: 'user-msg-1', agentId: 'agent-1', onAccepted } as RunParams);
        releaseAck();

        const result = (await p) as ExecuteAgentResult;
        expect(result.success).toBe(false);
        expect(onAccepted).not.toHaveBeenCalled();
    });

    it('sends where the reply sits only when asked, and reads the announcement the ack names', async () => {
        const announced = ack();
        announced.result = JSON.stringify({ ...JSON.parse(announced.result as string), announcementDetailId: 'ANNOUNCEMENT-1' });
        const { provider, stream, executeGQL, releaseAck } = makeProvider(announced);
        let accepted: AgentReplyAcknowledgement | null = null;
        const p = new GraphQLAIClient(provider).RunAIAgentFromConversationDetail({
            userMessageId: 'user-msg-1',
            agentId: 'agent-1',
            replyParentId: 'manager-reply-1',
            announcedByAgentId: 'manager-1',
            onAccepted: (reply) => { accepted = reply; },
        } as RunParams);
        releaseAck();
        await settle();
        stream.next(completion(REPLY));
        await p;

        const [, variables] = executeGQL.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(variables).toMatchObject({ replyParentId: 'manager-reply-1', announcedByAgentId: 'manager-1' });
        expect(accepted).toMatchObject({ ConversationDetailId: REPLY, AnnouncementDetailId: 'ANNOUNCEMENT-1' });
    });

    it('leaves the threading variables out when none are asked for', async () => {
        const { provider, stream, executeGQL, releaseAck } = makeProvider(ack());
        const p = new GraphQLAIClient(provider).RunAIAgentFromConversationDetail({ userMessageId: 'user-msg-1', agentId: 'agent-1' } as RunParams);
        releaseAck();
        await settle();
        stream.next(completion(REPLY));
        await p;

        const [, variables] = executeGQL.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(variables).not.toHaveProperty('replyParentId');
        expect(variables).not.toHaveProperty('announcedByAgentId');
    });
});
