/**
 * Tests for a run's history floor (`ExecuteAgentParams.ConversationHistoryFrom`) in BaseAgent.
 *
 * The resolver loads a floored run's messages from the floor onward. These pin two of the reads
 * BaseAgent makes of the conversation on the run's behalf, which must not reach back past it:
 * - the previous run's tool results are not carried forward (they can quote earlier messages);
 * - cross-turn compaction runs neither before nor after the turn (a summary folds in the
 *   conversation from its first message).
 * The conversation-history tools' filtering is pinned in conversation-tool-manager.test.ts, and
 * the artifact scan in agent-runner-conversation-artifacts.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { ConversationCompactionManager, CompactionOutcome } from '../ConversationCompactionManager';

const ctx = { ID: 'u1', Name: 'Tester' } as never;
const FLOOR = new Date('2026-09-01T12:00:00.000Z');

interface FloorHarness {
    _executeParams: Record<string, unknown> | undefined;
    _agentConfig: undefined;
    _depth: number;
    _agentRun: Record<string, unknown>;
    startPostTurnCompaction(): void;
    checkPreTurnCompaction(params: Record<string, unknown>, config: undefined): Promise<void>;
    injectPriorTurnToolResults(params: Record<string, unknown>): Promise<void>;
    loadPriorTurnToolResultSteps(params: Record<string, unknown>): Promise<unknown[]>;
    resolveCompactionBudget(params: Record<string, unknown>, config: undefined): unknown;
}

function makeParams(historyFrom?: Date): Record<string, unknown> {
    return {
        conversationId: 'CONV-1',
        conversationDetailId: 'PLACEHOLDER-DETAIL-1',
        contextUser: ctx,
        verbose: false,
        conversationMessages: [{ role: 'user', content: 'x'.repeat(400_000) }],
        agent: { ID: 'AGENT-1', Name: 'Test Agent', ContextWindowMaxTokens: 10_000, CompactionTriggerPercent: 50, CompactionTargetPercent: 30 },
        ...(historyFrom ? { ConversationHistoryFrom: historyFrom } : {}),
    };
}

function wireAgent(params: Record<string, unknown>): FloorHarness {
    const a = new BaseAgent() as unknown as FloorHarness;
    a._executeParams = params;
    a._agentConfig = undefined;
    a._depth = 0;
    a._agentRun = { ID: 'RUN-1', Status: 'Completed', AgentID: 'AGENT-1', Steps: [] };
    return a;
}

function spyOnCompaction() {
    return vi.spyOn(ConversationCompactionManager, 'CompactIfNeeded').mockResolvedValue({
        Fired: false, SkippedReason: 'test', TokensBefore: 0, Warnings: [],
    } as CompactionOutcome);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('BaseAgent under a history floor', () => {
    it('does not compact after the turn', async () => {
        const spy = spyOnCompaction();
        wireAgent(makeParams(FLOOR)).startPostTurnCompaction();
        await new Promise(resolve => setImmediate(resolve));
        expect(spy).not.toHaveBeenCalled();
    });

    it('still compacts after the turn without a floor (control)', async () => {
        const spy = spyOnCompaction();
        wireAgent(makeParams()).startPostTurnCompaction();
        await new Promise(resolve => setImmediate(resolve));
        expect(spy).toHaveBeenCalledOnce();
    });

    it('does not compact before the turn, even over the trigger', async () => {
        const spy = spyOnCompaction();
        const params = makeParams(FLOOR);
        const agent = wireAgent(params);
        const budget = vi.spyOn(agent, 'resolveCompactionBudget');
        await agent.checkPreTurnCompaction(params, undefined);
        expect(budget).not.toHaveBeenCalled();
        expect(spy).not.toHaveBeenCalled();
    });

    it('still weighs pre-turn compaction without a floor (control)', async () => {
        const params = makeParams();
        const agent = wireAgent(params);
        const budget = vi.spyOn(agent, 'resolveCompactionBudget').mockReturnValue({ BoundedBy: 'Default' });
        await agent.checkPreTurnCompaction(params, undefined);
        expect(budget).toHaveBeenCalledOnce();
    });

    it('does not carry the previous run\'s tool results forward', async () => {
        const params = makeParams(FLOOR);
        const agent = wireAgent(params);
        const load = vi.spyOn(agent, 'loadPriorTurnToolResultSteps');
        await agent.injectPriorTurnToolResults(params);
        expect(load).not.toHaveBeenCalled();
        expect(params.conversationMessages).toHaveLength(1);
    });

    it('still looks for the previous run\'s tool results without a floor (control)', async () => {
        const params = makeParams();
        const agent = wireAgent(params);
        const load = vi.spyOn(agent, 'loadPriorTurnToolResultSteps').mockResolvedValue([]);
        await agent.injectPriorTurnToolResults(params);
        expect(load).toHaveBeenCalledOnce();
    });
});
