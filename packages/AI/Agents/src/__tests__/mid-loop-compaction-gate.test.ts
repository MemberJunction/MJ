/**
 * Mid-loop compaction is gated on the configured compaction trigger (plan Lesson 1, vector 2).
 *
 * Rewriting an earlier turn — shortening a replayed tool call's arguments, expiring an old action
 * result — changes bytes inside the provider's cached prefix, so every later turn misses the cache.
 * The gate reuses the operator's `CompactionTriggerPercent`, resolved into `TriggerTokens`, rather
 * than a second threshold of its own: below it there is room to leave history alone.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { EffectiveContextBudget } from '../ConversationCompactionManager';
import type { AgentChatMessage, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

/** A 1,000-token window whose configured trigger is 65%: 650 tokens, about 2,600 characters. */
const BUDGET: EffectiveContextBudget = { MaxTokens: 1000, TriggerTokens: 650, TargetTokens: 300, ClampedToModel: false, BoundedBy: 'Agent' };

class Probe extends BaseAgent {
    protected override resolveCompactionBudget(): EffectiveContextBudget {
        return BUDGET;
    }
    public ThresholdReached(params: ExecuteAgentParams): boolean {
        return this.isMidLoopCompactionThresholdReached(params);
    }
}

function toolTurn(): AgentChatMessage {
    return {
        role: 'tool',
        content: [{ type: 'tool_result', toolCallId: 'c1', toolName: 'run_query', content: 'short content '.repeat(20), isError: false }] as unknown as string,
        metadata: { turnAdded: 1, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Remove' },
    };
}

function paramsWith(messages: AgentChatMessage[]): ExecuteAgentParams {
    return { agent: { Name: 'Probe' }, conversationMessages: messages } as Partial<ExecuteAgentParams> as ExecuteAgentParams;
}

describe('BaseAgent.isMidLoopCompactionThresholdReached', () => {
    it('is false while the window is under the configured trigger', () => {
        const agent = new Probe();
        expect(agent.ThresholdReached(paramsWith([{ role: 'user', content: 'Hello' }, toolTurn()]))).toBe(false);
    });

    it('is true once the window reaches the trigger', () => {
        const agent = new Probe();
        expect(agent.ThresholdReached(paramsWith([
            { role: 'user', content: 'x'.repeat(3000) },
            toolTurn(),
            { role: 'user', content: 'next turn 1' },
            { role: 'assistant', content: 'next turn 2' },
            { role: 'user', content: 'next turn 3' },
        ]))).toBe(true);
    });

    it('counts replayed tool-call arguments toward the window', () => {
        const agent = new Probe();
        expect(agent.ThresholdReached(paramsWith([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'write_file', arguments: { body: 'y'.repeat(3000) } }] },
            toolTurn(),
        ]))).toBe(true);
    });

    it('is false with no messages', () => {
        expect(new Probe().ThresholdReached(paramsWith([]))).toBe(false);
    });
});
