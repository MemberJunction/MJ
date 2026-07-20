/**
 * Tests for the PR-review hardening around BaseAgent's conversation-tool execution and
 * cross-turn compaction hooks:
 * - the per-turn conversationToolCalls cap (excess calls come back as skipped
 *   failure-shaped results through the normal rendering path, no DB rows)
 * - the post-turn compaction gate firing for settled runs (Completed AND
 *   AwaitingFeedback — the normal chat-turn ending) and threading
 *   ExcludeDetailIds/AgentRunId into CompactIfNeeded
 * - recordCompactionRunStep attaching the summary AIPromptRun to the step and topping
 *   up the run's token totals after a fired post-turn pass
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import { ConversationCompactionManager, CompactionOutcome } from '../ConversationCompactionManager';
import { MAX_CONVERSATION_TOOL_CALLS_PER_TURN, ConversationToolCall } from '../ConversationToolManager';

const ctx = { ID: 'u1', Name: 'Tester' } as never;

/** Minimal step entity stand-in (mirrors base-agent-step-save.test.ts's MockStep). */
function makeStepEntity(): Record<string, unknown> {
    return {
        ID: '',
        AgentRunID: '', StepNumber: 0, StepType: '', StepName: '',
        TargetID: null, TargetLogID: null, ParentID: null,
        Status: '', StartedAt: new Date(0), CompletedAt: null, Success: null,
        ErrorMessage: null, InputData: null, OutputData: null,
        PayloadAtStart: null, PayloadAtEnd: null, PromptRun: undefined,
        NewRecord(): void { (this as { ID: string }).ID = `step-${Math.floor(Math.random() * 1e9)}`; },
        Save: vi.fn().mockResolvedValue(true),
    };
}

describe('BaseAgent.executeConversationToolCallsAsSteps — per-turn cap', () => {
    it('executes the first 8 of 10 calls and synthesizes skipped results for the rest, order preserved', async () => {
        const agent = new BaseAgent();
        const createdSteps: Array<Record<string, unknown>> = [];
        const executeSingle = vi.fn().mockImplementation(async (call: ConversationToolCall) => ({
            tool: call.tool,
            input: call.input,
            result: { success: true, data: `ran-${(call.input as { sequence: number }).sequence}` },
            durationMs: 1,
        }));
        const a = agent as unknown as {
            _activeProvider: { GetEntityObject: () => Promise<Record<string, unknown>> };
            _agentRun: { ID: string; Steps: Array<Record<string, unknown>> };
            _conversationToolManager: { ExecuteSingleToolCall: typeof executeSingle };
            executeConversationToolCallsAsSteps(calls: ConversationToolCall[], params: Record<string, unknown>): Promise<Array<{ tool: string; input: unknown; result: { success: boolean; errorMessage?: string } }>>;
        };
        a._activeProvider = {
            GetEntityObject: async () => { const s = makeStepEntity(); createdSteps.push(s); return s; },
        };
        a._agentRun = { ID: 'run-1', Steps: [] };
        a._conversationToolManager = { ExecuteSingleToolCall: executeSingle };

        const calls: ConversationToolCall[] = Array.from({ length: 10 }, (_, i) => ({
            tool: 'getMessageBySequence',
            input: { sequence: i + 1 },
        }));
        const results = await a.executeConversationToolCallsAsSteps(calls, { contextUser: ctx, conversationId: 'conv-1' });

        expect(results).toHaveLength(10);
        expect(executeSingle).toHaveBeenCalledTimes(MAX_CONVERSATION_TOOL_CALLS_PER_TURN);
        expect(createdSteps).toHaveLength(MAX_CONVERSATION_TOOL_CALLS_PER_TURN); // no DB rows for skipped calls
        // First 8 executed in order, last 2 skipped-shaped
        for (let i = 0; i < MAX_CONVERSATION_TOOL_CALLS_PER_TURN; i++) {
            expect(results[i].result.success).toBe(true);
            expect((results[i].input as { sequence: number }).sequence).toBe(i + 1);
        }
        for (let i = MAX_CONVERSATION_TOOL_CALLS_PER_TURN; i < 10; i++) {
            expect(results[i].result.success).toBe(false);
            expect(results[i].result.errorMessage).toContain('per-turn cap');
            expect(results[i].result.errorMessage).toContain('Re-request');
            expect((results[i].input as { sequence: number }).sequence).toBe(i + 1);
        }
    });
});

describe('BaseAgent.startPostTurnCompaction — settled-status gate + input threading', () => {
    function wireAgent(status: string) {
        const agent = new BaseAgent();
        const a = agent as unknown as {
            _executeParams: Record<string, unknown> | undefined;
            _agentConfig: undefined;
            _depth: number;
            _agentRun: Record<string, unknown>;
            startPostTurnCompaction(): void;
        };
        a._executeParams = {
            conversationId: 'CONV-1',
            conversationDetailId: 'PLACEHOLDER-DETAIL-1',
            contextUser: ctx,
            verbose: false,
            agent: { ID: 'AGENT-1', Name: 'Test Agent', ContextWindowMaxTokens: 10_000, CompactionTriggerPercent: 50, CompactionTargetPercent: 30 },
        };
        a._agentConfig = undefined;
        a._depth = 0;
        a._agentRun = { ID: 'RUN-1', Status: status, AgentID: 'AGENT-1', Steps: [] };
        return a;
    }

    it('fires for AwaitingFeedback runs (the chat-turn ending) and threads ExcludeDetailIds + AgentRunId', async () => {
        const spy = vi.spyOn(ConversationCompactionManager, 'CompactIfNeeded').mockResolvedValue({
            Fired: false, SkippedReason: 'test', TokensBefore: 0, Warnings: [],
        } as CompactionOutcome);
        try {
            wireAgent('AwaitingFeedback').startPostTurnCompaction();
            await new Promise(resolve => setImmediate(resolve)); // drain the fire-and-forget
            expect(spy).toHaveBeenCalledOnce();
            const input = spy.mock.calls[0][0];
            expect(input.ExcludeDetailIds).toEqual(['PLACEHOLDER-DETAIL-1']);
            expect(input.AgentRunId).toBe('RUN-1');
        } finally {
            spy.mockRestore();
        }
    });

    it('fires for Completed runs and stays silent for Failed/Running/Cancelled', async () => {
        const spy = vi.spyOn(ConversationCompactionManager, 'CompactIfNeeded').mockResolvedValue({
            Fired: false, SkippedReason: 'test', TokensBefore: 0, Warnings: [],
        } as CompactionOutcome);
        try {
            wireAgent('Completed').startPostTurnCompaction();
            await new Promise(resolve => setImmediate(resolve));
            expect(spy).toHaveBeenCalledTimes(1);

            for (const status of ['Failed', 'Running', 'Cancelled']) {
                wireAgent(status).startPostTurnCompaction();
            }
            await new Promise(resolve => setImmediate(resolve));
            expect(spy).toHaveBeenCalledTimes(1); // unchanged — unsettled statuses never fire
        } finally {
            spy.mockRestore();
        }
    });
});

describe('BaseAgent.recordCompactionRunStep — PromptRun linkage + post-turn token top-up', () => {
    it('attaches the summary PromptRun to the step and tops the run row up with recomputed totals', async () => {
        const agent = new BaseAgent();
        const stepEntity = makeStepEntity();
        const runUpdate = {
            ID: '', TotalTokensUsed: 0, TotalPromptTokensUsed: 0, TotalCompletionTokensUsed: 0,
            TotalCacheReadTokensUsed: 0, TotalCacheWriteTokensUsed: 0, TotalCost: 0,
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
        };
        const a = agent as unknown as {
            _activeProvider: { GetEntityObject: (name: string) => Promise<Record<string, unknown>> };
            _agentRun: { ID: string; Steps: Array<Record<string, unknown>> };
            _stepSaveQueue: { Insert: () => void; Flush: () => Promise<{ failures: number }> };
            recordCompactionRunStep(phase: string, params: Record<string, unknown>, budget: Record<string, unknown>, outcome: CompactionOutcome): Promise<void>;
        };
        a._activeProvider = {
            GetEntityObject: async (name: string) =>
                name === 'MJ: AI Agent Runs' ? (runUpdate as unknown as Record<string, unknown>) : stepEntity,
        };
        a._agentRun = { ID: 'RUN-9', Steps: [] };
        a._stepSaveQueue = { Insert: vi.fn(), Flush: vi.fn().mockResolvedValue({ failures: 0 }) };

        const summaryPromptRun = {
            ID: 'PR-1', TokensUsedRollup: 4200, TokensPromptRollup: 3000, TokensCompletionRollup: 1200,
            TokensCacheReadRollup: 0, TokensCacheWriteRollup: 0, TotalCost: 0.12,
        };
        const outcome: CompactionOutcome = {
            Fired: true, BoundarySequence: 5, TokensBefore: 6000, TokensAfter: 2000,
            PromptRunId: 'PR-1', PromptRun: summaryPromptRun as never, Warnings: [],
        };
        await a.recordCompactionRunStep('post-turn', { conversationId: 'CONV-1', contextUser: ctx }, { MaxTokens: 1 }, outcome);

        // The step carries the transient PromptRun → calculateTokenStats' Compaction branch is live
        expect(stepEntity.PromptRun).toBe(summaryPromptRun);
        // Fresh-loaded run entity got the recomputed totals (the Compaction step is in Steps)
        expect(runUpdate.Load).toHaveBeenCalledWith('RUN-9');
        expect(runUpdate.TotalTokensUsed).toBe(4200);
        expect(runUpdate.TotalCost).toBe(0.12);
        expect(runUpdate.Save).toHaveBeenCalled();
    });

    it('skips the top-up for unfired passes and for pre-turn fires (finalize handles those)', async () => {
        const agent = new BaseAgent();
        const stepEntity = makeStepEntity();
        const getEntityObject = vi.fn().mockResolvedValue(stepEntity);
        const a = agent as unknown as {
            _activeProvider: { GetEntityObject: typeof getEntityObject };
            _agentRun: { ID: string; Steps: Array<Record<string, unknown>> };
            _stepSaveQueue: { Insert: () => void; Flush: () => Promise<{ failures: number }> };
            recordCompactionRunStep(phase: string, params: Record<string, unknown>, budget: Record<string, unknown>, outcome: CompactionOutcome): Promise<void>;
        };
        a._activeProvider = { GetEntityObject: getEntityObject };
        a._agentRun = { ID: 'RUN-9', Steps: [] };
        a._stepSaveQueue = { Insert: vi.fn(), Flush: vi.fn().mockResolvedValue({ failures: 0 }) };

        // Post-turn but NOT fired → only the step entity is created, never a run entity
        await a.recordCompactionRunStep('post-turn', { contextUser: ctx }, {}, { Fired: false, TokensBefore: 100, Warnings: [], ErrorMessage: 'x' } as CompactionOutcome);
        // Pre-turn fired → finalizeAgentRun's own rollup covers it, no top-up load
        await a.recordCompactionRunStep('pre-turn', { contextUser: ctx }, {}, { Fired: true, TokensBefore: 100, PromptRun: { ID: 'PR' } as never, Warnings: [] } as CompactionOutcome);
        const requestedEntities = getEntityObject.mock.calls.map(c => c[0]);
        expect(requestedEntities).not.toContain('MJ: AI Agent Runs');
    });
});
