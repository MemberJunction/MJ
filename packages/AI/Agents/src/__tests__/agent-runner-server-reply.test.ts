/**
 * AgentRunner and the agent's reply row (A19): only the server writes agent replies.
 *
 * - `CreateAgentReplyDetail` creates the reply row (`Role` `AI`, In-Progress) and marks it as server-authored, so the
 *   conversation detail gate accepts it.
 * - `RunAgentInConversation` given that row (`agentResponseDetail`) writes the run's progress and result into the same
 *   instance, without reloading it under another identity, so every write carries the marker and its context user.
 * - The runner's own create path marks the reply it creates, and only that one: the user's message is not marked.
 *
 * No DB, no network — the provider is a fake and RunAgent is stubbed on the instance.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import type { MJConversationDetailEntityExtended } from '@memberjunction/core-entities';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        RunView: class {
            async RunView() {
                return { Success: true, Results: [] };
            }
        },
        RunQuery: class {
            async RunQuery() {
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

import { AgentRunner } from '../AgentRunner';

const USER = { ID: 'user-1' } as unknown as UserInfo;

/** A fake conversation detail that records each save's field values and whether it was marked. */
class FakeDetail {
    public ID: string;
    public ConversationID = '';
    public ParentID: string | null = null;
    public Role = '';
    public Message = '';
    public Status = '';
    public AgentID: string | null = null;
    public HiddenToUser = true;
    public TestRunID: string | null = null;
    public UserID: string | null = null;
    public LatestResult = null;
    public Marked = false;
    public Saves: Array<{ Message: string; Status: string; Marked: boolean }> = [];
    public Load = vi.fn(async () => true);

    constructor(id: string) {
        this.ID = id;
    }

    public MarkServerAuthoredReply(): void {
        this.Marked = true;
    }

    public async Save(): Promise<boolean> {
        this.Saves.push({ Message: this.Message, Status: this.Status, Marked: this.Marked });
        return true;
    }

    public async EnsureSaveComplete(): Promise<void> {
        /* no save is ever in flight in this fake */
    }
}

function providerHanding(details: FakeDetail[]): { provider: IMetadataProvider; GetEntityObject: ReturnType<typeof vi.fn> } {
    const queue = [...details];
    const GetEntityObject = vi.fn(async () => queue.shift());
    return { provider: { GetEntityObject } as unknown as IMetadataProvider, GetEntityObject };
}

function params(): ExecuteAgentParams {
    return { agent: { ID: 'agent-1', Name: 'Writer' }, conversationMessages: [], contextUser: USER } as unknown as ExecuteAgentParams;
}

function stubRun(runner: AgentRunner, message = 'final answer'): void {
    const stub = runner as unknown as { RunAgent(p: ExecuteAgentParams): Promise<ExecuteAgentResult> };
    vi.spyOn(stub, 'RunAgent').mockImplementation(async (p: ExecuteAgentParams) => {
        await p.onProgress?.({ step: 'prompt_execution', percentage: 50, message: 'thinking' } as never);
        return { success: true, agentRun: { ID: 'run-1', Message: message } } as unknown as ExecuteAgentResult;
    });
}

describe('AgentRunner — the server writes the agent reply', () => {
    afterEach(() => vi.restoreAllMocks());

    it('CreateAgentReplyDetail creates a marked, in-progress AI row for the asking user', async () => {
        const reply = new FakeDetail('reply-1');
        const { provider, GetEntityObject } = providerHanding([reply]);

        const created = await new AgentRunner(provider).CreateAgentReplyDetail({
            conversationId: 'conv-1',
            agentId: 'agent-1',
            contextUser: USER,
            parentId: 'user-msg-1'
        });

        expect(created).toBe(reply);
        expect(GetEntityObject).toHaveBeenCalledWith('MJ: Conversation Details', USER);
        expect(reply).toMatchObject({ ConversationID: 'conv-1', ParentID: 'user-msg-1', Role: 'AI', Status: 'In-Progress', AgentID: 'agent-1', HiddenToUser: false });
        expect(reply.Saves).toEqual([{ Message: '⏳ Starting...', Status: 'In-Progress', Marked: true }]);
    });

    it('CreateAgentReplyDetail writes a server-composed status line when given its text and status', async () => {
        const line = new FakeDetail('line-1');
        const { provider } = providerHanding([line]);

        await new AgentRunner(provider).CreateAgentReplyDetail({
            conversationId: 'conv-1',
            agentId: 'manager-1',
            contextUser: USER,
            parentId: 'user-msg-1',
            message: 'Continuing with **Research** for refinement...',
            status: 'Complete'
        });

        expect(line).toMatchObject({ Role: 'AI', AgentID: 'manager-1', ParentID: 'user-msg-1' });
        expect(line.Saves).toEqual([{ Message: 'Continuing with **Research** for refinement...', Status: 'Complete', Marked: true }]);
    });

    it('CreateAgentReplyDetail throws with the gate reason when the save is refused', async () => {
        const reply = new FakeDetail('reply-1');
        reply.Save = async () => {
            (reply as unknown as { LatestResult: { CompleteMessage: string } }).LatestResult = { CompleteMessage: 'You have view-only access to this conversation.' };
            return false;
        };
        const { provider } = providerHanding([reply]);

        await expect(
            new AgentRunner(provider).CreateAgentReplyDetail({ conversationId: 'conv-1', agentId: 'agent-1', contextUser: USER })
        ).rejects.toThrow('You have view-only access to this conversation.');
    });

    it('writes progress and the result into the reply row it is handed, without loading another copy', async () => {
        const reply = new FakeDetail('reply-1');
        reply.MarkServerAuthoredReply();
        reply.ConversationID = 'conv-1';
        reply.ParentID = 'user-msg-1';
        reply.Status = 'In-Progress';
        const { provider, GetEntityObject } = providerHanding([]);
        const runner = new AgentRunner(provider);
        stubRun(runner);

        const result = await runner.RunAgentInConversation(params(), { agentResponseDetail: reply as unknown as MJConversationDetailEntityExtended });

        expect(GetEntityObject).not.toHaveBeenCalled();
        expect(result.agentResponseDetailId).toBe('reply-1');
        expect(result.userMessageDetailId).toBe('user-msg-1');
        expect(result.conversationId).toBe('conv-1');
        expect(reply.Saves.map((s) => [s.Message, s.Status, s.Marked])).toEqual([
            ['thinking', 'In-Progress', true],
            ['final answer', 'Complete', true]
        ]);
    });

    it('marks the reply it creates itself, and not the user message', async () => {
        const userMessage = new FakeDetail('user-msg-1');
        const reply = new FakeDetail('reply-1');
        const { provider } = providerHanding([userMessage, reply]);
        const runner = new AgentRunner(provider);
        stubRun(runner);

        const result = await runner.RunAgentInConversation(params(), { conversationId: 'conv-1', userMessage: 'hi' });

        expect(result.agentResponseDetailId).toBe('reply-1');
        expect(userMessage.Marked).toBe(false);
        expect(reply.Saves.every((s) => s.Marked)).toBe(true);
    });

    it('does not mark a detail a caller names by ID: the gate decides whether the run may write into it', async () => {
        const named = new FakeDetail('named-1');
        named.Status = 'In-Progress';
        const { provider } = providerHanding([named]);
        const runner = new AgentRunner(provider);
        stubRun(runner);

        await runner.RunAgentInConversation(params(), { conversationId: 'conv-1', conversationDetailId: 'named-1' });

        expect(named.Marked).toBe(false);
    });
});
