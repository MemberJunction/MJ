/**
 * An expired native tool turn is compacted in its action's own mode.
 *
 * A tool turn cannot be rewritten into prose — it answers the model's call — so compaction works
 * block by block. Each block goes through the same compactor an envelope action result does, so
 * an action set to 'AI Summary' gets a summary on the native path too, not a plain truncation.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { AgentChatMessage, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

type Block = { type: string; toolCallId?: string; content?: string };

class Probe extends BaseAgent {
    public Summaries: string[] = [];
    protected override async compactMessage(message: AgentChatMessage, metadata: { compactMode: 'First N Chars' | 'AI Summary' }): Promise<string> {
        this.Summaries.push(`${metadata.compactMode}:${String(message.content)}`);
        return `summary of ${String(message.content).slice(0, 8)}`;
    }
    public async Prune(params: ExecuteAgentParams, turn: number): Promise<void> {
        return this.pruneAndCompactExpiredMessages(params, turn);
    }
}

function toolTurn(): AgentChatMessage {
    return {
        role: 'tool',
        content: [
            { type: 'tool_result', toolCallId: 'c1', toolName: 'run_query', content: 'first result '.repeat(50), isError: false },
            { type: 'tool_result', toolCallId: 'c2', toolName: 'run_query', content: 'second result '.repeat(50), isError: false }
        ],
        metadata: { turnAdded: 1, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Compact', compactMode: 'AI Summary', compactLength: 100, compactPromptId: 'p1' }
    } as unknown as AgentChatMessage;
}

describe('BaseAgent.pruneAndCompactExpiredMessages — a native tool turn', () => {
    it('summarizes each result block through the action\'s compaction mode, keeping the blocks and their call ids', async () => {
        const agent = new Probe();
        (agent as unknown as { logStatus: () => void }).logStatus = vi.fn();
        const params = {
            agent: { Name: 'P' },
            conversationMessages: [
                { role: 'user', content: 'Run the queries.' },
                { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'run_query', arguments: {} }, { id: 'c2', name: 'run_query', arguments: {} }] },
                toolTurn()
            ]
        } as unknown as ExecuteAgentParams;

        await agent.Prune(params, 5);

        expect(agent.Summaries.map((s) => s.split(':')[0])).toEqual(['AI Summary', 'AI Summary']);
        const blocks = params.conversationMessages[2].content as unknown as Block[];
        expect(blocks.map((b) => [b.type, b.toolCallId, b.content])).toEqual([
            ['tool_result', 'c1', 'summary of first re'],
            ['tool_result', 'c2', 'summary of second r']
        ]);
        expect((params.conversationMessages[2] as AgentChatMessage).metadata?.wasCompacted).toBe(true);
    });
});
