import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@memberjunction/ai';
import type {
    AgentChatMessage,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { BaseAgentSubAgentHelper } from '../helpers/subagents/BaseAgentSubAgentHelper';
import { AgentSubAgentHelper } from '../helpers/subagents/AgentSubAgentHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('BaseAgentSubAgentHelper / AgentSubAgentHelper', () => {
    it('resolves AgentSubAgentHelper as default implementation via ClassFactory', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'subAgents',
            BaseClass: BaseAgentSubAgentHelper,
            DefaultClass: AgentSubAgentHelper,
        });
        expect(helper).toBeInstanceOf(AgentSubAgentHelper);
    });

    it('GetRequestedSubAgents prefers plural subAgents array and falls back to singular subAgent', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.GetRequestedSubAgents(ctx, null)).toEqual([]);
        expect(
            helper.GetRequestedSubAgents(ctx, {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { id: 'a1', name: 'Alpha', message: 'do work', terminateAfter: false },
            })
        ).toHaveLength(1);
        expect(
            helper.GetRequestedSubAgents(ctx, {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { id: 'a1', name: 'Alpha', message: 'do work', terminateAfter: false },
                subAgents: [
                    { id: 'a1', name: 'Alpha', message: 'work 1', terminateAfter: false },
                    { id: 'a2', name: 'Beta', message: 'work 2', terminateAfter: false },
                ],
            })
        ).toHaveLength(2);
    });

    it('StripSubAgentToolPrefix and MatchNamedBySanitizedToolName match native delegate_to_* names', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.StripSubAgentToolPrefix(ctx, 'delegate_to_query_builder')).toBe('query_builder');
        expect(helper.StripSubAgentToolPrefix(ctx, 'Query Builder')).toBe('Query Builder');

        const pool = [{ Name: 'Query Builder' }, { Name: 'Research Agent' }];
        const matched = helper.MatchNamedBySanitizedToolName(ctx, 'delegate_to_query_builder', pool, true);
        expect(matched.match?.Name).toBe('Query Builder');
    });

    it('MakeToolTurnsSelfConsistent drops orphan tool results and demotes unanswered assistant calls', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        const window: ChatMessage[] = [
            {
                role: 'tool',
                content: [{ type: 'tool_result', toolCallId: 'orphan-1', content: 'stray' }],
            } as unknown as ChatMessage,
            {
                role: 'assistant',
                content: 'calling tool',
                toolCalls: [{ id: 'unanswered-2', name: 'run_action', arguments: {} }],
            } as AgentChatMessage,
            {
                role: 'assistant',
                content: 'paired call',
                toolCalls: [{ id: 'paired-3', name: 'run_action', arguments: {} }],
            } as AgentChatMessage,
            {
                role: 'tool',
                content: [{ type: 'tool_result', toolCallId: 'paired-3', content: 'ok' }],
            } as unknown as ChatMessage,
        ];

        const repaired = helper.MakeToolTurnsSelfConsistent(ctx, window);
        expect(repaired).toHaveLength(3);
        expect((repaired[0] as AgentChatMessage).toolCalls).toBeUndefined();
        expect(repaired[0].content).toBe('calling tool');
        expect((repaired[1] as AgentChatMessage).toolCalls?.[0]?.id).toBe('paired-3');
        expect(repaired[2].role).toBe('tool');
    });

    it('SubAgentTaint propagates run taint to SecurityEnvelope or ParentRunTainted', () => {
        const helper = new AgentSubAgentHelper();
        const taintedCtx = CreateMockAgentRunContext({ IsRunTainted: true });
        const cleanCtx = CreateMockAgentRunContext({ IsRunTainted: false });

        const baseParams = {
            agent: { ID: 'a1', Name: 'Parent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams;

        expect(helper.SubAgentTaint(cleanCtx, baseParams)).toEqual({});
        expect(helper.SubAgentTaint(taintedCtx, baseParams)).toEqual({ ParentRunTainted: true });
        expect(
            helper.SubAgentTaint(taintedCtx, {
                ...baseParams,
                SecurityEnvelope: { IsRunTainted: false },
            } as unknown as ExecuteAgentParams)
        ).toEqual({ SecurityEnvelope: { IsRunTainted: true } });
    });

    it('ExtractSubAgentWorkflowTaskID reads latest parentTaskID from steps or falls back to run ID', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        const runWithTask = {
            ID: 'run-fallback',
            Steps: [
                { OutputData: JSON.stringify({ parentTaskID: 'task-111' }) } as MJAIAgentRunStepEntityExtended,
                { OutputData: 'not-json' } as MJAIAgentRunStepEntityExtended,
            ],
        } as unknown as MJAIAgentRunEntityExtended;
        expect(helper.ExtractSubAgentWorkflowTaskID(ctx, runWithTask)).toBe('task-111');
        expect(helper.ExtractSubAgentWorkflowTaskID(ctx, { ID: 'run-only', Steps: [] } as unknown as MJAIAgentRunEntityExtended)).toBe('run-only');
    });

    it('ExecuteHandoffStep records HandoffResult and finalizes Handoff step', async () => {
        const helper = new AgentSubAgentHelper();
        const createStep = vi.fn(async () => ({ ID: 'step-handoff-1' } as MJAIAgentRunStepEntityExtended));
        const finalizeStep = vi.fn(async () => undefined);
        const ctx = CreateMockAgentRunContext({
            ResolvedHandoffTarget: { id: 'target-id', name: 'Target Agent' },
            Hooks: {
                CreateStepEntity: createStep,
                FinalizeStepEntity: finalizeStep,
            },
        });
        const params = {
            agent: { ID: 'source-id', Name: 'Source Agent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
            handoffChain: [],
        } as unknown as ExecuteAgentParams;
        const decision: BaseAgentNextStep = {
            step: 'Handoff',
            terminate: true,
            handoff: { agentName: 'Target Agent', brief: 'Handle billing', reason: 'Specialist' },
        };

        const out = await helper.ExecuteHandoffStep(ctx, params, decision);
        expect(out.step).toBe('Success');
        expect(out.terminate).toBe(true);
        expect(ctx.HandoffResult).toEqual({
            targetAgentId: 'target-id',
            targetAgentName: 'Target Agent',
            sourceAgentId: 'source-id',
            brief: 'Handle billing',
            reason: 'Specialist',
            runStepId: 'step-handoff-1',
        });
        expect(finalizeStep).toHaveBeenCalledTimes(1);
    });
});
