/**
 * Mid-loop compaction is gated on context utilization (plan Lesson 1, vector 2).
 *
 * Rewriting an earlier turn — shortening a replayed tool call's arguments, expiring an old action
 * result — changes bytes inside the provider's cached prefix, so every later turn misses the cache.
 * Below 65% of the resolved budget there is room to leave history alone; the gate holds both the
 * argument compaction and the message expiry until the window is actually filling up.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { AgentChatMessage, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

class Probe extends BaseAgent {
    public ThresholdReached(params: ExecuteAgentParams): boolean {
        return (this as unknown as { isMidLoopCompactionThresholdReached: (p: ExecuteAgentParams) => boolean }).isMidLoopCompactionThresholdReached(params);
    }
    public async Prune(params: ExecuteAgentParams, currentTurn: number): Promise<void> {
        return this.pruneAndCompactExpiredMessages(params, currentTurn);
    }
}

/** A probe inside a live run with a 1,000-token budget, so 65% is 650 tokens (about 2,600 characters). */
function liveProbe(): Probe {
    const agent = new Probe();
    (agent as unknown as { _agentRun: Record<string, unknown> })._agentRun = { ID: 'run-1' };
    (agent as unknown as { logStatus: () => void }).logStatus = vi.fn();
    (agent as unknown as { resolveCompactionBudget: () => { MaxTokens: number } }).resolveCompactionBudget = () => ({ MaxTokens: 1000 });
    return agent;
}

/** An action result that expired turns ago and would be removed by any unguarded prune. */
function expiredToolTurn(): AgentChatMessage {
    return {
        role: 'tool',
        content: [{ type: 'tool_result', toolCallId: 'c1', toolName: 'run_query', content: 'short content '.repeat(20), isError: false }] as unknown as string,
        metadata: { turnAdded: 1, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Remove' },
    };
}

describe('BaseAgent mid-loop compaction gate', () => {
    it('leaves an expired message in place while the window is under 65% of the budget', async () => {
        const agent = liveProbe();
        const params = {
            agent: { Name: 'Probe' },
            conversationMessages: [{ role: 'user', content: 'Hello' }, expiredToolTurn()],
        } as unknown as ExecuteAgentParams;

        expect(agent.ThresholdReached(params)).toBe(false);
        await agent.Prune(params, 5);
        expect(params.conversationMessages).toHaveLength(2);
    });

    it('reports the threshold reached once the window passes 65% of the budget', () => {
        const agent = liveProbe();
        const params = {
            agent: { Name: 'Probe' },
            conversationMessages: [
                { role: 'user', content: 'x'.repeat(3000) },
                expiredToolTurn(),
                { role: 'user', content: 'next turn 1' },
                { role: 'assistant', content: 'next turn 2' },
                { role: 'user', content: 'next turn 3' },
            ],
        } as unknown as ExecuteAgentParams;

        expect(agent.ThresholdReached(params)).toBe(true);
    });

    it('counts replayed tool call arguments toward utilization', () => {
        const agent = liveProbe();
        const params = {
            agent: { Name: 'Probe' },
            conversationMessages: [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'write_file', arguments: { body: 'y'.repeat(3000) } }] },
                expiredToolTurn(),
            ],
        } as unknown as ExecuteAgentParams;

        expect(agent.ThresholdReached(params)).toBe(true);
    });
});
