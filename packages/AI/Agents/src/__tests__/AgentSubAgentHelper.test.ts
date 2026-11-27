import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@memberjunction/ai';
import type {
    AgentChatMessage,
    AgentSubAgentRequest,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { RegisterClass } from '@memberjunction/global';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { BaseAgentSubAgentHelper } from '../helpers/subagents/BaseAgentSubAgentHelper';
import { AgentSubAgentHelper } from '../helpers/subagents/AgentSubAgentHelper';
import type { ParallelSubAgentExecution } from '../helpers/base-agent-types';
import { BuildToolResultTurn } from '../native-tools/tool-result-turns';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

@RegisterClass(BaseAgentSubAgentHelper, 'TestCustomSubAgentHelper')
class TestCustomSubAgentHelper extends AgentSubAgentHelper {
    public readonly CustomTag = 'TestCustomSubAgentHelper';
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return {
        ID: '10000000-0000-4000-8000-000000000100',
        Name: 'ParentAgent',
        Status: 'Active',
        ...overrides,
    } as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        ...overrides,
    } as ExecuteAgentParams;
}

describe('BaseAgentSubAgentHelper / AgentSubAgentHelper', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves AgentSubAgentHelper as default implementation and rejects metadata override for code-only subAgents seam (S3)', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'subAgents',
            BaseClass: BaseAgentSubAgentHelper,
            DefaultClass: AgentSubAgentHelper,
        });
        expect(helper).toBeInstanceOf(AgentSubAgentHelper);

        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'subAgents',
                BaseClass: BaseAgentSubAgentHelper,
                DefaultClass: AgentSubAgentHelper,
                DriverClass: 'TestCustomSubAgentHelper',
            })
        ).toThrow(/code-only/);
    });

    it('GetRequestedSubAgents prefers plural subAgents array, falls back to singular subAgent, and handles null/empty', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.GetRequestedSubAgents(ctx, null)).toEqual([]);
        expect(helper.GetRequestedSubAgents(ctx, undefined)).toEqual([]);
        expect(helper.GetRequestedSubAgents(ctx, { step: 'Sub-Agent', terminate: false, subAgents: [] })).toEqual([]);
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

    it('StripSubAgentToolPrefix and MatchNamedBySanitizedToolName handle prefixes, ambiguity, and empty input', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.StripSubAgentToolPrefix(ctx, 'delegate_to_query_builder')).toBe('query_builder');
        expect(helper.StripSubAgentToolPrefix(ctx, 'DELEGATE_TO_Query_Builder')).toBe('Query_Builder');
        expect(helper.StripSubAgentToolPrefix(ctx, 'Query Builder')).toBe('Query Builder');

        const pool = [{ Name: 'Query Builder' }, { Name: 'Research Agent' }];
        expect(helper.MatchNamedBySanitizedToolName(ctx, 'delegate_to_query_builder', pool, true).match?.Name).toBe(
            'Query Builder'
        );
        expect(helper.MatchNamedBySanitizedToolName(ctx, '   ', pool, true)).toEqual({});

        const ambiguousPool = [{ Name: 'Data-Sync' }, { Name: 'Data Sync' }];
        const ambiguous = helper.MatchNamedBySanitizedToolName(ctx, 'data_sync', ambiguousPool, false);
        expect(ambiguous.match).toBeUndefined();
        expect(ambiguous.ambiguous).toHaveLength(2);
    });

    it('MakeToolTurnsSelfConsistent drops orphan tool results, demotes unanswered assistant calls, and keeps paired turns', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        const orphanTool = BuildToolResultTurn([
            { toolCallId: 'orphan-1', toolName: 'run_action', content: 'stray', isError: false },
        ]);
        const pairedTool = BuildToolResultTurn([
            { toolCallId: 'paired-3', toolName: 'run_action', content: 'ok', isError: false },
        ]);

        const window: ChatMessage[] = [
            orphanTool,
            {
                role: 'assistant',
                content: '',
                toolCalls: [{ id: 'unanswered-2', name: 'run_action', arguments: {} }],
            } as AgentChatMessage,
            {
                role: 'assistant',
                content: 'paired call',
                toolCalls: [{ id: 'paired-3', name: 'run_action', arguments: {} }],
            } as AgentChatMessage,
            pairedTool,
        ];

        const repaired = helper.MakeToolTurnsSelfConsistent(ctx, window);
        expect(repaired).toHaveLength(3);
        expect((repaired[0] as AgentChatMessage).toolCalls).toBeUndefined();
        expect(repaired[0].content).toBe('[tool call omitted for context management]');
        expect((repaired[1] as AgentChatMessage).toolCalls?.[0]?.id).toBe('paired-3');
        expect(repaired[2].role).toBe('tool');
    });

    it('PrepareSubAgentMessages honors None/All/Latest/Bookend modes, strips volatileState, and appends context/consult/request', () => {
        const helper = new AgentSubAgentHelper();
        vi.spyOn(AIEngine.Instance, 'AgentRelationships', 'get').mockReturnValue([]);
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                MakeToolTurnsSelfConsistent: (w) => helper.MakeToolTurnsSelfConsistent(ctx, w),
            },
        });
        const history: AgentChatMessage[] = [
            { role: 'user', content: 'm1' },
            { role: 'assistant', content: 'm2' },
            { role: 'user', content: 'm3' },
            { role: 'assistant', content: 'm4' },
            { role: 'user', content: 'volatile', metadata: { volatileState: true } },
            { role: 'user', content: 'm5' },
        ];
        const params = makeParams({ conversationMessages: history });
        const req: AgentSubAgentRequest = { id: 'sa-1', name: 'Worker', message: 'Summarize', terminateAfter: false };

        const noneMsgs = helper.PrepareSubAgentMessages(ctx, params, req, makeAgent({ ID: 'sa-1', MessageMode: 'None' }));
        expect(noneMsgs).toEqual([{ role: 'user', content: 'Summarize' }]);

        const allMsgs = helper.PrepareSubAgentMessages(ctx, params, req, makeAgent({ ID: 'sa-1', MessageMode: 'All' }));
        expect(allMsgs).toHaveLength(6); // 5 non-volatile + 1 request
        expect(allMsgs.some((m) => m.content === 'volatile')).toBe(false);

        const latestMsgs = helper.PrepareSubAgentMessages(
            ctx,
            params,
            req,
            makeAgent({ ID: 'sa-1', MessageMode: 'Latest', MaxMessages: 2 })
        );
        expect(latestMsgs.map((m) => m.content)).toEqual(['m4', 'm5', 'Summarize']);

        const bookendMsgs = helper.PrepareSubAgentMessages(
            ctx,
            params,
            req,
            makeAgent({ ID: 'sa-1', MessageMode: 'Bookend', MaxMessages: 3 }),
            { role: 'system', content: 'Context block' },
            'Which quarter?'
        );
        expect(bookendMsgs.map((m) => m.content)).toEqual([
            'm1',
            'm2',
            '[2 messages omitted for context management]',
            'm5',
            'Context block',
            'Which quarter?',
            'Summarize',
        ]);
    });

    it('CloneMessageForSubAgent isolates metadata and artifactIds arrays from parent mutation', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        const original: AgentChatMessage = {
            role: 'user',
            content: 'hello',
            metadata: { turnAdded: 1, artifactIds: ['art-1', 'art-2'] },
        };
        const cloned = helper.CloneMessageForSubAgent(ctx, original) as AgentChatMessage;
        cloned.metadata?.artifactIds?.push('art-3');

        expect(original.metadata?.artifactIds).toEqual(['art-1', 'art-2']);
        expect(cloned.metadata?.artifactIds).toEqual(['art-1', 'art-2', 'art-3']);
    });

    it('SubAgentTaint propagates run taint to SecurityEnvelope or ParentRunTainted while keeping clean runs untainted', () => {
        const helper = new AgentSubAgentHelper();
        const taintedCtx = CreateMockAgentRunContext({ IsRunTainted: true });
        const cleanCtx = CreateMockAgentRunContext({ IsRunTainted: false });

        const baseParams = makeParams();

        expect(helper.SubAgentTaint(cleanCtx, baseParams)).toEqual({});
        expect(helper.SubAgentTaint(taintedCtx, baseParams)).toEqual({ ParentRunTainted: true });
        expect(
            helper.SubAgentTaint(taintedCtx, makeParams({ SecurityEnvelope: { IsRunTainted: false } }))
        ).toEqual({ SecurityEnvelope: { IsRunTainted: true } });
        expect(
            helper.SubAgentTaint(cleanCtx, makeParams({ SecurityEnvelope: { IsRunTainted: true } }))
        ).toEqual({ SecurityEnvelope: { IsRunTainted: true } });
    });

    it('ExtractSubAgentWorkflowTaskID reads latest parentTaskID from steps, skips invalid JSON, and falls back to run ID', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        const runWithTask = {
            ID: 'run-fallback',
            Steps: [
                { OutputData: JSON.stringify({ parentTaskID: 'task-111' }) } as MJAIAgentRunStepEntityExtended,
                { OutputData: 'not-json' } as MJAIAgentRunStepEntityExtended,
                { OutputData: JSON.stringify({ parentTaskID: 'task-222' }) } as MJAIAgentRunStepEntityExtended,
            ],
        } as MJAIAgentRunEntityExtended;

        expect(helper.ExtractSubAgentWorkflowTaskID(ctx, runWithTask)).toBe('task-222');
        expect(helper.ExtractSubAgentWorkflowTaskID(ctx, { ID: 'run-only', Steps: [] } as MJAIAgentRunEntityExtended)).toBe(
            'run-only'
        );
        expect(helper.ExtractSubAgentWorkflowTaskID(ctx, undefined)).toBe('sub-agent-workflow');
    });

    it('ValidateSubAgentNextStep validates missing sub-agents, execution limits, invalid/duplicate resumeRunId, and valid requests', async () => {
        const helper = new AgentSubAgentHelper();
        const worker = makeAgent({
            ID: '20000000-0000-4000-8000-000000000201',
            Name: 'WorkerAgent',
            MaxExecutionsPerRun: 2,
        });
        const consultRunId = '30000000-0000-4000-8000-000000000301';
        let execCount = 0;
        const ctx = CreateMockAgentRunContext({
            OpenSubAgentConsults: new Map([
                [
                    consultRunId,
                    {
                        childRunId: consultRunId,
                        subAgentId: worker.ID,
                        subAgentName: worker.Name,
                        round: 1,
                        question: 'Need info',
                    },
                ],
            ]),
            Hooks: {
                GetEffectiveSubAgentsForValidation: () => [worker],
                GetRequestedSubAgents: (s) => helper.GetRequestedSubAgents(ctx, s),
                GetSubAgentExecutionCount: async () => execCount,
            },
        });
        const params = makeParams();
        const run = { ID: 'run-1' } as MJAIAgentRunEntityExtended;
        const stepEntity = { ID: 'step-1' } as MJAIAgentRunStepEntityExtended;

        // Empty list
        const emptyRes = await helper.ValidateSubAgentNextStep(
            ctx,
            params,
            { step: 'Sub-Agent', terminate: false },
            {},
            run,
            stepEntity
        );
        expect(emptyRes.step).toBe('Retry');

        // Unknown agent
        const unknownRes = await helper.ValidateSubAgentNextStep(
            ctx,
            params,
            { step: 'Sub-Agent', terminate: false, subAgent: { id: '', name: 'Ghost', message: 'hi', terminateAfter: false } },
            {},
            run,
            stepEntity
        );
        expect(unknownRes.step).toBe('Retry');
        expect(unknownRes.errorMessage).toContain('Ghost');

        // Exceeded MaxExecutionsPerRun
        execCount = 2;
        const overLimit = await helper.ValidateSubAgentNextStep(
            ctx,
            params,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { id: worker.ID, name: 'WorkerAgent', message: 'go', terminateAfter: false },
            },
            {},
            run,
            stepEntity
        );
        expect(overLimit.step).toBe('Retry');
        expect(overLimit.errorMessage).toContain('maximum execution limit');

        // Invalid resumeRunId
        execCount = 0;
        const badResume = await helper.ValidateSubAgentNextStep(
            ctx,
            params,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: {
                    id: worker.ID,
                    name: 'WorkerAgent',
                    message: 'answer',
                    terminateAfter: false,
                    resumeRunId: 'not-a-uuid',
                },
            },
            {},
            run,
            stepEntity
        );
        expect(badResume.step).toBe('Retry');
        expect(badResume.errorMessage).toContain('Invalid resumeRunId');

        // Duplicate resumeRunId in parallel subAgents
        const dupResume = await helper.ValidateSubAgentNextStep(
            ctx,
            params,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgents: [
                    { id: worker.ID, name: 'WorkerAgent', message: 'a', terminateAfter: false, resumeRunId: consultRunId },
                    { id: worker.ID, name: 'WorkerAgent', message: 'b', terminateAfter: false, resumeRunId: consultRunId },
                ],
            },
            {},
            run,
            stepEntity
        );
        expect(dupResume.step).toBe('Retry');
        expect(dupResume.errorMessage).toContain('used more than once');

        // Valid request passes through
        const valid = await helper.ValidateSubAgentNextStep(
            ctx,
            params,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: {
                    id: worker.ID,
                    name: 'WorkerAgent',
                    message: 'answer',
                    terminateAfter: false,
                    resumeRunId: consultRunId,
                },
            },
            {},
            run,
            stepEntity
        );
        expect(valid.step).toBe('Sub-Agent');
    });

    it('resolves ChatHandlingOption precedence and disables Consult when InjectLoopResultsAsMessage is false', () => {
        const helper = new AgentSubAgentHelper();
        const logStatus = vi.fn();
        const parent = makeAgent({ ChatHandlingOption: 'Consult' });
        const rel = { ChatHandlingOption: 'Retry' } as MJAIAgentRelationshipEntity;

        const ctx = CreateMockAgentRunContext({
            AgentTypeInstance: {
                InjectLoopResultsAsMessage: false,
            } as NonNullable<ReturnType<typeof CreateMockAgentRunContext>['AgentTypeInstance']>,
            Hooks: {
                LogStatus: logStatus,
                ResolveSubAgentChatHandlingOption: (p, r) => helper.ResolveSubAgentChatHandlingOption(ctx, p, r),
            },
        });

        expect(helper.ResolveSubAgentChatHandlingOption(ctx, parent, rel)).toBe('Retry');
        expect(helper.ResolveSubAgentChatHandlingOption(ctx, parent, undefined)).toBe('Consult');

        expect(helper.IsSubAgentConsultActive(ctx, 'Consult')).toBe(false);
        expect(helper.IsSubAgentConsultActive(ctx, 'Consult')).toBe(false);
        // Warning logged once per run
        expect(logStatus).toHaveBeenCalledTimes(1);
        expect(helper.EffectiveSubAgentChatHandlingOption(ctx, parent, undefined)).toBeNull();
    });

    it('GetTotalSubAgentConsultRounds sums counts across all tracked sub-agents', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.GetTotalSubAgentConsultRounds(ctx)).toBe(0);
        ctx.SubAgentConsultRounds.set('sa-1', 2);
        ctx.SubAgentConsultRounds.set('sa-2', 3);
        expect(helper.GetTotalSubAgentConsultRounds(ctx)).toBe(5);
    });

    it('ExecuteParallelSubAgents isolates payload clones per sibling and synthesizes unresolved sub-agent failures', async () => {
        const helper = new AgentSubAgentHelper();
        const alpha = makeAgent({ ID: '20000000-0000-4000-8000-000000000210', Name: 'Alpha' });
        const receivedPayloads: Array<Record<string, unknown>> = [];

        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveSubAgentByName: (_p, name) => (name === 'Alpha' ? { subAgentEntity: alpha } : undefined),
                CreateStepEntity: vi.fn(async () => ({ ID: 'step-par-1' } as MJAIAgentRunStepEntityExtended)),
                FinalizeStepEntity: vi.fn(async () => undefined),
                ExecuteSubAgent: vi.fn(async (_p, _req, _entity, _step, payload) => {
                    const cloned = payload as Record<string, unknown>;
                    receivedPayloads.push(cloned);
                    cloned.mutatedByAlpha = true;
                    return {
                        success: true,
                        payload: { alphaDone: true },
                        agentRun: { ID: 'child-run-1', FinalStep: 'Success', Steps: [] } as MJAIAgentRunEntityExtended,
                    } as ExecuteAgentResult;
                }),
            },
        });

        const startingPayload = { shared: { count: 1 } };
        const params = makeParams();
        const result = await helper.ExecuteParallelSubAgents(
            ctx,
            params,
            [
                { id: alpha.ID, name: 'Alpha', message: 'run alpha', terminateAfter: false },
                { id: 'missing', name: 'MissingAgent', message: 'run missing', terminateAfter: false },
            ],
            { step: 'Sub-Agent', terminate: false, newPayload: startingPayload }
        );

        // Parent startingPayload was NOT mutated by Alpha's execution clone
        expect('mutatedByAlpha' in startingPayload).toBe(false);
        expect(receivedPayloads).toHaveLength(1);
        // Any failure in parallel batch returns step: 'Failed' while recording summary
        expect(result.step).toBe('Failed');
        expect(params.conversationMessages.some((m) => String(m.content).includes('MissingAgent'))).toBe(true);
    });

    it('ExecuteParallelSubAgents terminates with Failed when pre-dispatch or post-dispatch tree budget is exceeded', async () => {
        const helper = new AgentSubAgentHelper();
        const alpha = makeAgent({ ID: '20000000-0000-4000-8000-000000000211', Name: 'Alpha' });
        const executeSpy = vi.fn();

        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveSubAgentByName: () => ({ subAgentEntity: alpha }),
                CheckTreeBudgetLimit: () => ({ exceeded: true, reason: 'Token ceiling hit' }),
                ExecuteSubAgent: executeSpy,
            },
        });

        const res = await helper.ExecuteParallelSubAgents(
            ctx,
            makeParams(),
            [{ id: alpha.ID, name: 'Alpha', message: 'work', terminateAfter: true }],
            { step: 'Sub-Agent', terminate: false, newPayload: {} }
        );
        expect(executeSpy).not.toHaveBeenCalled();
        expect(res.step).toBe('Failed');
        expect(res.terminate).toBe(true);
        expect(res.errorMessage).toContain('Token ceiling hit');
    });

    it('ExecuteParallelSubAgents routes native toolCallId results via PushToolResultTurn and terminates when terminateAfter is true', async () => {
        const helper = new AgentSubAgentHelper();
        const alpha = makeAgent({ ID: '20000000-0000-4000-8000-000000000212', Name: 'Alpha' });
        const pushToolTurn = vi.fn();

        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveSubAgentByName: () => ({ subAgentEntity: alpha }),
                CreateStepEntity: vi.fn(async () => ({ ID: 'step-par-native' } as MJAIAgentRunStepEntityExtended)),
                FinalizeStepEntity: vi.fn(async () => undefined),
                PushToolResultTurn: pushToolTurn,
                ExecuteSubAgent: vi.fn(async () => ({
                    success: true,
                    payload: { done: true },
                    agentRun: { ID: 'child-1', FinalStep: 'Success', Steps: [] } as MJAIAgentRunEntityExtended,
                })),
            },
        });

        const res = await helper.ExecuteParallelSubAgents(
            ctx,
            makeParams(),
            [{ id: alpha.ID, name: 'Alpha', message: 'work', terminateAfter: true, toolCallId: 'tc-alpha' }],
            {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                nativeTurn: {
                    toolCalls: [{ id: 'tc-alpha', name: 'delegate_to_alpha', arguments: {} }],
                    sendResultsNatively: true,
                },
            }
        );

        expect(pushToolTurn).toHaveBeenCalledTimes(1);
        expect(res.step).toBe('Success');
        expect(res.terminate).toBe(true);
    });

    it('BuildParallelSubAgentSummary renders success, error, Chat question, and consult resume instructions', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        const executions: ParallelSubAgentExecution<Record<string, unknown>>[] = [
            {
                request: { id: 'a1', name: 'Analyst', message: 'Analyze Q4', terminateAfter: false },
                subAgentEntity: makeAgent({ ID: 'a1', Name: 'Analyst' }),
                upstreamPaths: [],
                consult: {
                    childRunId: 'child-run-99',
                    subAgentId: 'a1',
                    subAgentName: 'Analyst',
                    round: 1,
                    question: 'Include EMEA?',
                },
                maxConsultRounds: 3,
                result: {
                    success: true,
                    agentRun: { ID: 'child-run-99', FinalStep: 'Chat', Message: 'Include EMEA?' } as MJAIAgentRunEntityExtended,
                },
            },
            {
                request: { id: 'a2', name: 'Fetcher', message: 'Pull data', terminateAfter: false },
                subAgentEntity: makeAgent({ ID: 'a2', Name: 'Fetcher' }),
                upstreamPaths: [],
                result: {
                    success: false,
                    agentRun: { ID: 'child-run-100', FinalStep: 'Failed', ErrorMessage: 'Timeout' } as MJAIAgentRunEntityExtended,
                },
            },
        ];

        const summary = helper.BuildParallelSubAgentSummary(ctx, executions);
        expect(summary).toContain('Analyst');
        expect(summary).toContain('round 1 of 3');
        expect(summary).toContain('resumeRunId: "child-run-99"');
        expect(summary).toContain('Fetcher');
        expect(summary).toContain('Timeout');
    });

    it('ParseSubAgentContextPaths parses valid arrays and returns empty array for missing or malformed JSON', () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext();

        expect(
            helper.ParseSubAgentContextPaths(
                ctx,
                { SubAgentContextPaths: JSON.stringify(['customer.id', 'order.total']) } as MJAIAgentRelationshipEntity,
                'BillingAgent'
            )
        ).toEqual(['customer.id', 'order.total']);

        expect(
            helper.ParseSubAgentContextPaths(ctx, { SubAgentContextPaths: null } as MJAIAgentRelationshipEntity, 'BillingAgent')
        ).toEqual([]);

        expect(
            helper.ParseSubAgentContextPaths(
                ctx,
                { SubAgentContextPaths: '{malformed-json' } as MJAIAgentRelationshipEntity,
                'BillingAgent'
            )
        ).toEqual([]);
    });

    it('PushSubAgentConversationMessage applies messageExpirationOverride metadata and handles native vs user messages', () => {
        const helper = new AgentSubAgentHelper();
        const pushToolTurn = vi.fn();
        const ctx = CreateMockAgentRunContext({
            PromptTurnCount: 5,
            Hooks: { PushToolResultTurn: pushToolTurn },
        });
        const subEntity = makeAgent({ ID: 'sa-9', Name: 'Researcher' });
        const req: AgentSubAgentRequest = { id: 'sa-9', name: 'Researcher', message: 'go', terminateAfter: false, toolCallId: 'tc-9' };

        const userParams = makeParams({
            messageExpirationOverride: { expirationTurns: 1, expirationMode: 'Compact', compactLength: 100 },
        });
        helper.PushSubAgentConversationMessage(
            ctx,
            userParams,
            { step: 'Sub-Agent', terminate: false },
            req,
            subEntity,
            'Result markdown',
            'sub-agent-result',
            false
        );
        expect(userParams.conversationMessages).toHaveLength(1);
        const meta = (userParams.conversationMessages[0] as AgentChatMessage).metadata;
        expect(meta?.expirationTurns).toBe(1);
        expect(meta?.expirationMode).toBe('Compact');

        const nativeParams = makeParams();
        helper.PushSubAgentConversationMessage(
            ctx,
            nativeParams,
            {
                step: 'Sub-Agent',
                terminate: false,
                nativeTurn: { toolCalls: [{ id: 'tc-9', name: 'delegate_to_researcher', arguments: {} }], sendResultsNatively: true },
            },
            req,
            subEntity,
            'Native result',
            'sub-agent-result',
            false
        );
        expect(pushToolTurn).toHaveBeenCalledTimes(1);
    });

    it('ExecuteHandoffStep records HandoffResult, rejects missing target or withheld handoff, and ValidateHandoffNextStep retries when withheld', async () => {
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
        const params = makeParams({
            agent: makeAgent({ ID: 'source-id', Name: 'Source Agent' }),
            handoffChain: [],
        });
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

        // Missing resolved target fails cleanly
        const noTargetCtx = CreateMockAgentRunContext({ ResolvedHandoffTarget: null });
        const failedNoTarget = await helper.ExecuteHandoffStep(noTargetCtx, params, decision);
        expect(failedNoTarget.step).toBe('Failed');
        expect(failedNoTarget.terminate).toBe(true);

        // Withheld handoff fails in execute & retries in validate
        const withheldCtx = CreateMockAgentRunContext({
            ResolvedHandoffTarget: { id: 'target-id', name: 'Target Agent' },
            Hooks: { RunWithholdsHandoff: () => true },
        });
        const failedWithheld = await helper.ExecuteHandoffStep(withheldCtx, params, decision);
        expect(failedWithheld.step).toBe('Failed');

        const retryWithheld = await helper.ValidateHandoffNextStep(
            withheldCtx,
            params,
            decision,
            {},
            { ID: 'run-1' } as MJAIAgentRunEntityExtended,
            { ID: 'step-1' } as MJAIAgentRunStepEntityExtended
        );
        expect(retryWithheld.step).toBe('Retry');
        expect(withheldCtx.GeneralValidationRetryCount).toBe(1);
    });

    it('ExecuteRelatedSubAgentStep throws immediately when AbortSignal is already aborted', async () => {
        const helper = new AgentSubAgentHelper();
        const controller = new AbortController();
        controller.abort('cancelled');
        const ctx = CreateMockAgentRunContext();

        await expect(
            helper.ExecuteRelatedSubAgentStep(
                ctx,
                makeParams({ cancellationToken: controller.signal }),
                {
                    step: 'Sub-Agent',
                    terminate: false,
                    subAgent: { id: 'sa-1', name: 'Related', message: 'go', terminateAfter: false },
                },
                makeAgent({ ID: 'sa-1', Name: 'Related' }),
                {} as MJAIAgentRelationshipEntity
            )
        ).rejects.toThrow(/Cancelled before related sub-agent execution/);
    });

    it('ExecuteTasksStep fails cleanly when spec is missing, TaskGraphRefusal triggers, or no submitter is registered', async () => {
        const helper = new AgentSubAgentHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                CreateStepEntity: vi.fn(async () => ({ ID: 'step-tg-1' } as MJAIAgentRunStepEntityExtended)),
                FinalizeStepEntity: vi.fn(async () => undefined),
            },
        });
        const params = makeParams();

        const noSpec = await helper.ExecuteTasksStep(ctx, params, { step: 'Tasks', terminate: false });
        expect(noSpec.step).toBe('Failed');
        expect(noSpec.errorMessage).toContain('no task graph attached');

        const refusedCtx = CreateMockAgentRunContext({
            Hooks: {
                TaskGraphRefusal: () => ({
                    step: 'Failed',
                    terminate: true,
                    errorMessage: 'Withheld by audience',
                }),
            },
        });
        const specDecision: BaseAgentNextStep = {
            step: 'Tasks',
            terminate: false,
            taskGraph: {
                spec: { workflowName: 'NightlySync', tasks: [] },
            },
        };
        const refused = await helper.ExecuteTasksStep(refusedCtx, params, specDecision);
        expect(refused.step).toBe('Failed');
        expect(refused.errorMessage).toBe('Withheld by audience');

        const noSubmitter = await helper.ExecuteTasksStep(ctx, params, specDecision);
        expect(noSubmitter.step).toBe('Failed');
        expect(noSubmitter.errorMessage).toContain('No task-graph submitter');
    });
});
