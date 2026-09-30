import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import { UserInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { DecisionQuestion, DecisionAnswer, DecisionResult } from '@memberjunction/ai';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { AIDecisionRunner, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import {
    AgentDecisionQuestion,
    AgentDecisionRequest,
    AgentDecisionResult,
    AIPromptRunResult,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AgentDecisionService, AgentDecisionAskParams } from '../AgentDecisionService';
import { BaseAgent } from '../base-agent';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import {
    DEFAULT_LOOP_AGENT_PROMPT_PARAMS,
    DEFAULT_RESPONSE_TYPE_INCLUSION_RULES,
    MAX_DECISION_CALLS_PER_TURN,
    MAX_DECISION_REQUESTS_PER_TURN,
} from '../agent-types/loop-agent-prompt-params';

// Quiet logging
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

// Mock step entity capturing create/finalize calls
class MockStepEntity {
    public ID: string;
    public StepType?: string;
    public StepName?: string;
    public Status?: string;
    public StartedAt: Date;
    public CompletedAt?: Date;
    public Success?: boolean;
    public ErrorMessage?: string;
    public InputData?: unknown;
    public OutputData?: unknown;
    public ParentID?: string | null;
    public TargetLogID?: string | null;
    public PromptRun?: MJAIPromptRunEntity;

    constructor(id: string) {
        this.ID = id;
        this.StartedAt = new Date();
    }

    public NewRecord(): void {}

    public async Save(): Promise<boolean> {
        return true;
    }
}

/** The ExecuteAgentParams members the paths under test read — all a test has to supply. */
type DecisionStepParams = Pick<ExecuteAgentParams, 'contextUser' | 'conversationMessages'>;

/** The seam onto the full ExecuteAgentParams that the methods under test are declared to take. */
function asAgentParams(params: DecisionStepParams): ExecuteAgentParams {
    return params as ExecuteAgentParams;
}

/**
 * The private BaseAgent run state a Decision step reads, each member narrowed from its real type.
 * A subclass cannot reach private members, so the tests seed them through this seam.
 */
interface AgentInternals {
    _activeProvider: Pick<IMetadataProvider, 'GetEntityObject'>;
    _agentRun: Pick<MJAIAgentRunEntityExtended, 'ID' | 'AgentID' | 'Steps'>;
    _agentHierarchy: string[];
    _depth: number;
}

// Concrete BaseAgent subclass exposing protected methods for testing
class TestAgent extends BaseAgent {
    public setAgentDecisionService(service: AgentDecisionService): void {
        this._agentDecisionService = service;
    }

    public async testExecuteDecisionRequestsAsSteps(
        requests: AgentDecisionRequest[],
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: DecisionStepParams,
    ): Promise<AgentDecisionResult[]> {
        return this.executeDecisionRequestsAsSteps(requests, finalPayload, agentTypePromptParams, asAgentParams(params));
    }

    public testInjectDecisionResultsMessage(params: DecisionStepParams, results: AgentDecisionResult[]): void {
        this.injectDecisionResultsMessage(asAgentParams(params), results);
    }

    public testApplyResponseTypeAutoAlignment(
        params: Record<string, unknown>,
        explicitResponseType?: Record<string, unknown>,
    ): void {
        this.applyResponseTypeAutoAlignment(params, explicitResponseType);
    }
}

/** Seeds the private run state a Decision step needs, collecting each step entity it creates. */
function seedDecisionRun(agent: TestAgent, createdSteps: MockStepEntity[]): void {
    const internals = agent as unknown as AgentInternals;
    internals._activeProvider = {
        GetEntityObject: vi.fn().mockImplementation(async () => {
            const e = new MockStepEntity(`step-${createdSteps.length + 1}`);
            createdSteps.push(e);
            return e;
        }),
    };
    internals._agentRun = { ID: 'run-1', AgentID: 'agent-1', Steps: [] };
    internals._agentHierarchy = [];
    internals._depth = 0;
}

describe('Agent Decisions', () => {
    describe('1. Schema and defaults', () => {
        it('has decisions enabled by default in DEFAULT_RESPONSE_TYPE_INCLUSION_RULES', () => {
            expect(DEFAULT_RESPONSE_TYPE_INCLUSION_RULES.decisions).toBe(true);
        });

        it('has expected decision defaults in DEFAULT_LOOP_AGENT_PROMPT_PARAMS', () => {
            expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeDecisionsDocs).toBe(true);
            expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.decisionsMaxItems).toBe(100);
            expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.decisionPromptName).toBe('Default Decision');
            expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeResponseTypeDefinition?.decisions).toBe(true);
        });
    });

    describe('2. Auto-alignment', () => {
        let agent: TestAgent;

        beforeEach(() => {
            agent = new TestAgent();
        });

        it('flips includeResponseTypeDefinition.decisions to false when includeDecisionsDocs is false', () => {
            const params: Record<string, unknown> = {
                includeDecisionsDocs: false,
            };
            agent.testApplyResponseTypeAutoAlignment(params);
            const rules = params.includeResponseTypeDefinition as Record<string, unknown>;
            expect(rules.decisions).toBe(false);
        });

        it('preserves explicit includeResponseTypeDefinition.decisions = true when includeDecisionsDocs is false', () => {
            const params: Record<string, unknown> = {
                includeDecisionsDocs: false,
                includeResponseTypeDefinition: {
                    decisions: true,
                },
            };
            agent.testApplyResponseTypeAutoAlignment(params, { decisions: true });
            const rules = params.includeResponseTypeDefinition as Record<string, unknown>;
            expect(rules.decisions).toBe(true);
        });

        it('keeps includeResponseTypeDefinition.decisions = true when includeDecisionsDocs is true', () => {
            const params: Record<string, unknown> = {
                includeDecisionsDocs: true,
            };
            agent.testApplyResponseTypeAutoAlignment(params);
            const rules = params.includeResponseTypeDefinition as Record<string, unknown>;
            expect(rules.decisions).toBe(true);
        });
    });

    describe('3. ToDecisionQuestions mapping', () => {
        it('maps Likelihood, Choice, and Score questions from camelCase to PascalCase', () => {
            const input: Record<string, AgentDecisionQuestion> = {
                likeQ: {
                    kind: 'Likelihood',
                    instructions: 'Is this high priority?',
                },
                choiceQ: {
                    kind: 'Choice',
                    instructions: 'Pick category',
                    options: [
                        { value: 'bug', description: 'Software defect' },
                        { value: 'feature', description: 'Feature request' },
                    ],
                },
                scoreQ: {
                    kind: 'Score',
                    instructions: 'Rate complexity',
                    levels: ['Trivial', 'Minor', 'Moderate', 'Major', 'Critical'],
                },
            };

            const mapping = AgentDecisionService.ToDecisionQuestions(input);
            const mapped = mapping.Questions;

            expect(mapping.Invalid).toEqual([]);
            expect(mapped.likeQ).toEqual({
                Kind: 'Likelihood',
                Instructions: 'Is this high priority?',
            });
            expect(mapped.choiceQ).toEqual({
                Kind: 'Choice',
                Instructions: 'Pick category',
                Options: [
                    { Value: 'bug', Description: 'Software defect' },
                    { Value: 'feature', Description: 'Feature request' },
                ],
            });
            expect(mapped.scoreQ).toEqual({
                Kind: 'Score',
                Instructions: 'Rate complexity',
                Levels: ['Trivial', 'Minor', 'Moderate', 'Major', 'Critical'],
            });
        });
    });

    describe('4. SummarizeAnswers', () => {
        it('summarizes Likelihood, Choice, and Score answers into LLM-friendly shapes', () => {
            const answers: Record<string, DecisionAnswer> = {
                likeA: {
                    Kind: 'Likelihood',
                    Probability: 0.85,
                },
                choiceA: {
                    Kind: 'Choice',
                    Value: 'bug',
                    Probabilities: { bug: 0.92, feature: 0.08 },
                    Confidence: 0.92,
                },
                scoreA: {
                    Kind: 'Score',
                    Value: 4,
                    Probabilities: { Major: 0.12, Critical: 0.88 },
                    Confidence: 0.88,
                },
            };

            const summary = AgentDecisionService.SummarizeAnswers(answers);

            expect(summary.likeA).toEqual({ probability: 0.85 });
            expect(summary.choiceA).toEqual({ value: 'bug', confidence: 0.92 });
            expect(summary.scoreA).toEqual({ value: 4, confidence: 0.88 });
        });
    });

    describe('5. AgentDecisionService.Ask', () => {
        it('returns failed result when decision prompt is not found', async () => {
            const service = new AgentDecisionService();
            const promptsSpy = vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([]);

            try {
                const res = await service.Ask({
                    State: 'test',
                    Questions: {},
                    ContextUser: {} as UserInfo,
                    PromptName: 'Nonexistent Prompt',
                });

                expect(res.success).toBe(false);
                expect(res.errorMessage).toContain('Nonexistent Prompt');
                expect(res.Answers).toEqual({});
            } finally {
                promptsSpy.mockRestore();
            }
        });

        it('resolves decision prompt case-insensitively and invokes AIDecisionRunner', async () => {
            const service = new AgentDecisionService();
            const mockPrompt = { Name: 'Default Decision', ID: 'prompt-1' } satisfies Pick<MJAIPromptEntityExtended, 'Name' | 'ID'>;
            const promptsSpy = vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([mockPrompt as MJAIPromptEntityExtended]);

            const executeSpy = vi.spyOn(AIDecisionRunner.prototype, 'ExecuteDecision').mockResolvedValue({
                success: true,
                Answers: {
                    q1: { Kind: 'Likelihood', Instructions: '', Probability: 0.9 },
                },
                executionTimeMS: 120,
                tokensUsed: 45,
            } as AIDecisionRunResult);

            try {
                const res = await service.Ask({
                    State: 'some state',
                    Questions: { q1: { Kind: 'Likelihood', Instructions: '' } },
                    ContextUser: { ID: 'user-1' } as UserInfo,
                    PromptName: '  default decision  ',
                    AgentID: 'agent-123',
                });

                expect(executeSpy).toHaveBeenCalledOnce();
                const callParams = executeSpy.mock.calls[0][0];
                expect(callParams.prompt).toBe(mockPrompt);
                expect(callParams.State).toBe('some state');
                expect(callParams.agentId).toBe('agent-123');
                expect(res.success).toBe(true);
            } finally {
                executeSpy.mockRestore();
                promptsSpy.mockRestore();
            }
        });
    });

    describe('6. Inline decision execution on BaseAgent', () => {
        let agent: TestAgent;
        let createdSteps: MockStepEntity[];
        let mockService: AgentDecisionService;

        beforeEach(() => {
            agent = new TestAgent();
            createdSteps = [];
            seedDecisionRun(agent, createdSteps);

            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('creates and finalizes Decision step with telemetry and answers', async () => {
            const decisionResult = new DecisionResult(true, new Date(), new Date());
            decisionResult.ResolvedModel = 'fast-model-v1';
            const promptRun = { ID: 'prun-1' } satisfies Pick<MJAIPromptRunEntity, 'ID'>;
            vi.spyOn(mockService, 'Ask').mockResolvedValue({
                success: true,
                Answers: {
                    triage: { Kind: 'Choice', Value: 'high', Probabilities: { high: 0.95, low: 0.05 }, Confidence: 0.95 },
                },
                executionTimeMS: 85,
                tokensUsed: 30,
                DriverClass: 'OpenRouterDecision',
                DecisionResult: decisionResult,
                promptRun: promptRun as MJAIPromptRunEntity,
            } as AIDecisionRunResult);

            const requests: AgentDecisionRequest[] = [
                {
                    id: 'req1',
                    state: 'Some raw state text',
                    questions: {
                        triage: {
                            kind: 'Choice',
                            instructions: 'Triage priority',
                            options: [
                                { value: 'high', description: 'Urgent' },
                                { value: 'low', description: 'Non-urgent' },
                            ],
                        },
                    },
                },
            ];

            const params = {
                contextUser: { ID: 'user-1' } as UserInfo,
                conversationMessages: [],
            };

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                requests,
                {},
                undefined,
                params,
            );

            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(true);
            expect(results[0].answers).toEqual({
                triage: { value: 'high', confidence: 0.95 },
            });

            // Verify step entity
            expect(createdSteps).toHaveLength(1);
            const step = createdSteps[0];
            expect(step.StepType).toBe('Decision');
            expect(step.StepName).toBe('Decision: req1');
            expect(step.Success).toBe(true);
            const outputData = typeof step.OutputData === 'string' ? JSON.parse(step.OutputData) : step.OutputData;
            expect(outputData.executionTimeMS).toBe(85);
            expect(outputData.tokensUsed).toBe(30);
            expect(outputData.model).toBe('fast-model-v1');
            expect(outputData.promptRunId).toBe('prun-1');
            expect(outputData.driverClass).toBe('OpenRouterDecision');
        });

        it('injects decision results into conversationMessages with expiration metadata', () => {
            const params: DecisionStepParams = {
                contextUser: { ID: 'user-1' } as UserInfo,
                conversationMessages: [],
            };

            const results: AgentDecisionResult[] = [
                {
                    id: 'req1',
                    success: true,
                    answers: { triage: { value: 'high', confidence: 0.95 } },
                },
            ];

            agent.testInjectDecisionResultsMessage(params, results);

            expect(params.conversationMessages).toHaveLength(1);
            const msg = params.conversationMessages[0];
            expect(msg.role).toBe('user');
            expect(msg.content).toContain('Decision results:');
            expect(msg.content).toContain('"triage"');
            expect(msg.metadata).toEqual({
                turnAdded: 0,
                messageType: 'tool-result',
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            });
        });
    });

    describe('7. State resolution', () => {
        let agent: TestAgent;
        let createdSteps: MockStepEntity[];
        let mockService: AgentDecisionService;

        beforeEach(() => {
            agent = new TestAgent();
            createdSteps = [];
            seedDecisionRun(agent, createdSteps);

            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('resolves string state literally', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask').mockResolvedValue({
                success: true,
                Answers: {},
            } as AIDecisionRunResult);

            await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'literal-state',
                        state: 'Literal text describing situation',
                        questions: { q: { kind: 'Likelihood', instructions: 'Is good?' } },
                    },
                ],
                { ticket: { status: 'open' } },
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).toHaveBeenCalledOnce();
            expect(askSpy.mock.calls[0][0].State).toBe('Literal text describing situation');
        });

        it('resolves dotted payload path', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask').mockResolvedValue({
                success: true,
                Answers: {},
            } as AIDecisionRunResult);

            await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'dotted-state',
                        state: 'payload.ticket.status',
                        questions: { q: { kind: 'Likelihood', instructions: 'Is open?' } },
                    },
                ],
                { ticket: { status: 'in-review' } },
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).toHaveBeenCalledOnce();
            expect(askSpy.mock.calls[0][0].State).toBe('in-review');
        });

        it('stringifies object payload values with indentation 1', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask').mockResolvedValue({
                success: true,
                Answers: {},
            } as AIDecisionRunResult);

            const payload = { ticket: { id: 101, title: 'Bug report' } };
            await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'obj-state',
                        state: 'payload.ticket',
                        questions: { q: { kind: 'Likelihood', instructions: 'Is urgent?' } },
                    },
                ],
                payload,
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).toHaveBeenCalledOnce();
            expect(askSpy.mock.calls[0][0].State).toBe(JSON.stringify(payload.ticket, undefined, 1));
        });

        it('fails cleanly when a payload path does not exist without calling runner', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask');

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'missing-path',
                        state: 'payload.nonexistent.item',
                        questions: { q: { kind: 'Likelihood', instructions: 'Is present?' } },
                    },
                ],
                { ticket: { status: 'open' } },
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).not.toHaveBeenCalled();
            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(false);
            expect(results[0].error).toContain('Path "payload.nonexistent.item" not found in payload');
            expect(createdSteps[0].Success).toBe(false);
        });

        it('fails cleanly when neither state nor forEachItemIn is provided', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask');

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'no-state',
                        questions: { q: { kind: 'Likelihood', instructions: '...' } },
                    },
                ],
                {},
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).not.toHaveBeenCalled();
            expect(results[0].success).toBe(false);
            expect(results[0].error).toContain('Either state or forEachItemIn is required');
            expect(createdSteps[0].Success).toBe(false);
        });

        it('fails cleanly when questions object is empty', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask');

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'empty-questions',
                        state: 'some state',
                        questions: {},
                    },
                ],
                {},
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).not.toHaveBeenCalled();
            expect(results[0].success).toBe(false);
            expect(results[0].error).toContain('At least one question is required');
            expect(createdSteps[0].Success).toBe(false);
        });
    });

    describe('8. Array mapping with forEachItemIn', () => {
        let agent: TestAgent;
        let createdSteps: MockStepEntity[];
        let mockService: AgentDecisionService;

        beforeEach(() => {
            agent = new TestAgent();
            createdSteps = [];
            seedDecisionRun(agent, createdSteps);

            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('iterates over items and returns answers in order', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask').mockImplementation(async (args) => {
                const item: { priority: number } = JSON.parse(args.State as string);
                return {
                    success: true,
                    Answers: {
                        score: { Kind: 'Score', Value: item.priority, Probabilities: {}, Confidence: 0.9 },
                    },
                    executionTimeMS: 10,
                    tokensUsed: 5,
                } as AIDecisionRunResult;
            });

            const tickets = [
                { id: 1, priority: 3 },
                { id: 2, priority: 5 },
                { id: 3, priority: 1 },
            ];

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'batch-req',
                        forEachItemIn: 'payload.tickets',
                        questions: { score: { kind: 'Score', instructions: 'Priority score', levels: ['P1', 'P2', 'P3', 'P4', 'P5'] } },
                    },
                ],
                { tickets },
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).toHaveBeenCalledTimes(3);
            expect(results[0].success).toBe(true);
            const answers = results[0].answers as Array<Record<string, unknown>>;
            expect(answers).toHaveLength(3);
            expect(answers[0].score).toEqual({ value: 3, confidence: 0.9 });
            expect(answers[1].score).toEqual({ value: 5, confidence: 0.9 });
            expect(answers[2].score).toEqual({ value: 1, confidence: 0.9 });

            expect(createdSteps[0].Success).toBe(true);
            const stepOutput = typeof createdSteps[0].OutputData === 'string'
                ? JSON.parse(createdSteps[0].OutputData)
                : createdSteps[0].OutputData;
            expect(stepOutput.executionTimeMS).toBe(30);
            expect(stepOutput.tokensUsed).toBe(15);
        });

        it('truncates at decisionsMaxItems when input array exceeds cap', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask').mockResolvedValue({
                success: true,
                Answers: {},
            } as AIDecisionRunResult);

            const items = Array.from({ length: 15 }, (_, i) => ({ id: i }));

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'capped-req',
                        forEachItemIn: 'items',
                        questions: { q: { kind: 'Likelihood', instructions: 'Test' } },
                    },
                ],
                { items },
                { decisionsMaxItems: 5 },
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).toHaveBeenCalledTimes(5);
            expect(results[0].skippedCount).toBe(10);
        });

        it('bounds concurrency to at most 8 in flight', async () => {
            let active = 0;
            let maxActive = 0;
            vi.spyOn(mockService, 'Ask').mockImplementation(async () => {
                active++;
                maxActive = Math.max(maxActive, active);
                await new Promise(r => setTimeout(r, 15));
                active--;
                return { success: true, Answers: {} } as AIDecisionRunResult;
            });

            const items = Array.from({ length: 20 }, (_, i) => ({ id: i }));
            await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'concurrency-req',
                        forEachItemIn: 'items',
                        questions: { q: { kind: 'Likelihood', instructions: 'Test' } },
                    },
                ],
                { items },
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(maxActive).toBeLessThanOrEqual(8);
            expect(maxActive).toBeGreaterThan(1);
        });

        it('handles empty array by returning answers: [] without calling runner', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask');

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'empty-req',
                        forEachItemIn: 'payload.emptyList',
                        questions: { q: { kind: 'Likelihood', instructions: 'Test' } },
                    },
                ],
                { emptyList: [] },
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).not.toHaveBeenCalled();
            expect(results[0]).toEqual({
                id: 'empty-req',
                success: true,
                answers: [],
            });
            expect(createdSteps[0].Success).toBe(true);
        });

        it('handles non-array target by failing cleanly without calling runner', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask');

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'non-array-req',
                        forEachItemIn: 'payload.notAnArray',
                        questions: { q: { kind: 'Likelihood', instructions: 'Test' } },
                    },
                ],
                { notAnArray: 'this is a string' },
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(askSpy).not.toHaveBeenCalled();
            expect(results[0].success).toBe(false);
            expect(results[0].error).toContain('is not an array');
            expect(createdSteps[0].Success).toBe(false);
        });

        it('handles failure in an item cleanly', async () => {
            vi.spyOn(mockService, 'Ask').mockResolvedValueOnce({
                success: true,
                Answers: { q: { Kind: 'Likelihood', Instructions: '', Probability: 0.5 } },
            } as AIDecisionRunResult).mockResolvedValueOnce({
                success: false,
                errorMessage: 'Model rate limit exceeded',
                Answers: {},
            } as AIDecisionRunResult);

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'item-failure-req',
                        forEachItemIn: 'items',
                        questions: { q: { kind: 'Likelihood', instructions: 'Test' } },
                    },
                ],
                { items: ['a', 'b'] },
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(results[0].success).toBe(false);
            expect(results[0].error).toContain('Model rate limit exceeded');
            expect(createdSteps[0].Success).toBe(false);
            expect(createdSteps[0].ErrorMessage).toContain('Model rate limit exceeded');
        });
    });

    describe('9. Single decision runner failure handling', () => {
        let agent: TestAgent;
        let createdSteps: MockStepEntity[];
        let mockService: AgentDecisionService;

        beforeEach(() => {
            agent = new TestAgent();
            createdSteps = [];
            seedDecisionRun(agent, createdSteps);

            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('handles single decision evaluation failure cleanly', async () => {
            vi.spyOn(mockService, 'Ask').mockResolvedValue({
                success: false,
                errorMessage: 'Context length exceeded',
                Answers: {},
            } as AIDecisionRunResult);

            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [
                    {
                        id: 'fail-single',
                        state: 'some context',
                        questions: { q: { kind: 'Likelihood', instructions: 'Test' } },
                    },
                ],
                {},
                undefined,
                { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(results[0].success).toBe(false);
            expect(results[0].error).toBe('Context length exceeded');
            expect(createdSteps[0].Success).toBe(false);
            expect(createdSteps[0].ErrorMessage).toBe('Context length exceeded');
        });
    });

    describe('10. DetermineNextStep carrying and read-tool preemption', () => {
        let loopAgentType: LoopAgentType;

        beforeEach(() => {
            loopAgentType = new LoopAgentType();
        });

        /** A successful prompt run whose result is the loop response, serialized as the model returns it. */
        const promptResultFor = (response: Record<string, unknown>): AIPromptRunResult => {
            const run = { success: true, result: JSON.stringify(response) } satisfies Pick<AIPromptRunResult, 'success' | 'result'>;
            return run as AIPromptRunResult;
        };

        /** The preemption paths read none of params, payload or agent-type state; they are supplied because the signature requires them. */
        const determineNextStep = (promptResult: AIPromptRunResult) =>
            loopAgentType.DetermineNextStep(promptResult, asAgentParams({ contextUser: {} as UserInfo, conversationMessages: [] }), {}, {});

        it('preempts Chat when decisions are present to force a turn to read results', async () => {
            const promptResult = promptResultFor({
                message: 'Hello user',
                nextStep: { type: 'Chat' },
                decisions: [{ id: 'd1', state: 's', questions: {} }],
            });

            const nextStep = await determineNextStep(promptResult);
            expect(nextStep.step).toBe('Retry');
            expect(nextStep.terminate).toBe(false);
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('carries decisions into Chat step after preemption cap is reached', async () => {
            const promptResult = promptResultFor({
                message: 'Hello user',
                nextStep: { type: 'Chat' },
                decisions: [{ id: 'd1', state: 's', questions: {} }],
            });

            // Trigger 3 preemptions
            await determineNextStep(promptResult);
            await determineNextStep(promptResult);
            await determineNextStep(promptResult);

            // 4th time honors Chat
            const nextStep = await determineNextStep(promptResult);
            expect(nextStep.step).toBe('Chat');
            expect(nextStep.terminate).toBe(true);
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('carries decisions into Pipeline early-return step', async () => {
            const promptResult = promptResultFor({
                nextStep: {
                    type: 'Pipeline',
                    pipeline: { steps: [{ name: 's1' }] },
                },
                decisions: [{ id: 'd1', state: 's', questions: {} }],
            });

            const nextStep = await determineNextStep(promptResult);
            expect(nextStep.step).toBe('Retry');
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('preempts taskComplete when decisions are present to force a turn to read results', async () => {
            const promptResult = promptResultFor({
                taskComplete: true,
                message: 'Task is complete',
                decisions: [{ id: 'd1', state: 's', questions: {} }],
            });

            const nextStep = await determineNextStep(promptResult);
            expect(nextStep.step).toBe('Retry');
            expect(nextStep.terminate).toBe(false);
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('carries decisions into normal taskComplete step when no preemption after cap', async () => {
            const promptResult = promptResultFor({
                taskComplete: true,
                message: 'All done',
                decisions: [{ id: 'd1', state: 's', questions: {} }],
            });

            // Trigger 3 preemptions
            await determineNextStep(promptResult);
            await determineNextStep(promptResult);
            await determineNextStep(promptResult);

            // 4th time honors terminal step
            const finalStep = await determineNextStep(promptResult);
            expect(finalStep.step).toBe('Success');
            expect(finalStep.terminate).toBe(true);
            expect(finalStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('carries decisions into normal actions/nextStep return branch', async () => {
            const promptResult = promptResultFor({
                nextStep: {
                    type: 'Actions',
                    actions: [{ actionName: 'Test' }],
                },
                decisions: [{ id: 'd1', state: 's', questions: {} }],
            });

            const nextStep = await determineNextStep(promptResult);
            expect(nextStep.step).toBe('Actions');
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });
    });

    describe('11. Gating enforcement', () => {
        let agent: TestAgent;
        let mockService: AgentDecisionService;

        beforeEach(() => {
            agent = new TestAgent();
            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('verifies decisions gate check is honored', () => {
            const mergedParamsWithDisabled = {
                includeResponseTypeDefinition: {
                    decisions: false,
                },
            };

            expect(mergedParamsWithDisabled.includeResponseTypeDefinition.decisions !== false).toBe(false);

            const mergedParamsWithEnabled = {
                includeResponseTypeDefinition: {
                    decisions: true,
                },
            };

            expect(mergedParamsWithEnabled.includeResponseTypeDefinition.decisions !== false).toBe(true);
        });
    });

    describe('12. Malformed decision requests never throw away the turn', () => {
        let agent: TestAgent;
        let createdSteps: MockStepEntity[];
        let mockService: AgentDecisionService;

        /** Decision requests as the loop hands them over: parsed from the model's JSON, their shapes unchecked. */
        const modelRequests = (json: string): AgentDecisionRequest[] => JSON.parse(json);
        const stepParams = (): DecisionStepParams => ({ contextUser: {} as UserInfo, conversationMessages: [] });
        const answered = (): AIDecisionRunResult => ({ success: true, Answers: { ok: { Kind: 'Likelihood', Probability: 0.7 } } });
        const stepNamed = (name: string): MockStepEntity | undefined => createdSteps.find(s => s.StepName?.endsWith(`Decision: ${name}`));

        beforeEach(() => {
            agent = new TestAgent();
            createdSteps = [];
            seedDecisionRun(agent, createdSteps);
            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('ToDecisionQuestions drops each invalid question with a reason naming it, and keeps the valid ones', () => {
            const mapping = AgentDecisionService.ToDecisionQuestions({
                ok: { kind: 'Likelihood', instructions: 'Is it fine?' },
                nothing: null,
                words: 'Is it fine?',
                noInstructions: { kind: 'Likelihood' },
                unknownKind: { kind: 'Maybe', instructions: 'Is it fine?' },
                choiceNoOptions: { kind: 'Choice', instructions: 'Pick one' },
                choiceEmptyOptions: { kind: 'Choice', instructions: 'Pick one', options: [] },
                choiceBadOption: { kind: 'Choice', instructions: 'Pick one', options: [{ value: 'a' }] },
                scoreNoLevels: { kind: 'Score', instructions: 'Rate it' },
                scoreEmptyLevels: { kind: 'Score', instructions: 'Rate it', levels: [] },
            });

            expect(Object.keys(mapping.Questions)).toEqual(['ok']);
            const invalidKeys = ['nothing', 'words', 'noInstructions', 'unknownKind', 'choiceNoOptions', 'choiceEmptyOptions', 'choiceBadOption', 'scoreNoLevels', 'scoreEmptyLevels'];
            expect(mapping.Invalid).toHaveLength(invalidKeys.length);
            for (const key of invalidKeys) {
                expect(mapping.Invalid.some(reason => reason.startsWith(`Question "${key}"`))).toBe(true);
            }
            expect(mapping.Invalid.find(reason => reason.includes('unknownKind'))).toContain('unknown kind "Maybe"');
        });

        it('fails a request with no valid question, giving the reasons, while its siblings still run', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());

            const results = await agent.testExecuteDecisionRequestsAsSteps(modelRequests(JSON.stringify([
                { id: 'broken', state: 's', questions: { bad: null, pick: { kind: 'Choice', instructions: 'Pick one' } } },
                { id: 'fine', state: 's', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' } } },
            ])), {}, undefined, stepParams());

            expect(results.map(r => [r.id, r.success])).toEqual([['broken', false], ['fine', true]]);
            expect(results[0].error).toContain('No valid questions');
            expect(results[0].error).toContain('Question "bad"');
            expect(results[0].error).toContain('Question "pick"');
            expect(ask).toHaveBeenCalledOnce();
            expect(stepNamed('broken')?.Status).toBe('Failed');
            expect(stepNamed('fine')?.Status).toBe('Completed');
        });

        it('asks only the valid questions of a request, and records the dropped ones on its step', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());

            const results = await agent.testExecuteDecisionRequestsAsSteps(modelRequests(JSON.stringify([
                { id: 'mixed', state: 's', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' }, bad: { kind: 'Score', instructions: 'Rate it', levels: [] } } },
            ])), {}, undefined, stepParams());

            expect(results[0].success).toBe(true);
            expect(Object.keys(ask.mock.calls[0][0].Questions)).toEqual(['ok']);
            const output = typeof createdSteps[0].OutputData === 'string' ? JSON.parse(createdSteps[0].OutputData) : createdSteps[0].OutputData;
            expect(output.droppedQuestions).toEqual([expect.stringContaining('Question "bad"')]);
        });

        it('finishes the step as failed when anything throws after it is created, and never leaves it Running', async () => {
            vi.spyOn(mockService, 'Ask').mockImplementation(async (args) => {
                if (args.State === 'explodes') {
                    throw new Error('socket hang up');
                }
                return answered();
            });

            const results = await agent.testExecuteDecisionRequestsAsSteps([
                { id: 'throws', state: 'explodes', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' } } },
                { id: 'fine', state: 'calm', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' } } },
            ], {}, undefined, stepParams());

            expect(results[0]).toMatchObject({ id: 'throws', success: false });
            expect(results[0].error).toContain('socket hang up');
            expect(results[1]).toMatchObject({ id: 'fine', success: true });
            expect(stepNamed('throws')?.Status).toBe('Failed');
            expect(stepNamed('throws')?.ErrorMessage).toContain('socket hang up');
        });

        it('settles a request that cannot even start as a failed result, without rejecting its siblings', async () => {
            vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());

            const results = await agent.testExecuteDecisionRequestsAsSteps(modelRequests(JSON.stringify([
                null,
                { id: 'fine', state: 's', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' } } },
            ])), {}, undefined, stepParams());

            expect(results).toHaveLength(2);
            expect(results[0]).toMatchObject({ id: 'request 1', success: false });
            expect(results[0].error).toContain('The decision request failed');
            expect(results[1]).toMatchObject({ id: 'fine', success: true });
        });

        it('Ask returns a failed result, never a throw, when the AI metadata cannot load', async () => {
            const configSpy = vi.spyOn(AIEngine.Instance, 'Config').mockRejectedValueOnce(new Error('metadata unavailable'));
            try {
                const result = await new AgentDecisionService().Ask({ State: 's', Questions: {}, ContextUser: {} as UserInfo });

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain('metadata unavailable');
                expect(result.Answers).toEqual({});
            } finally {
                configSpy.mockRestore();
            }
        });

        it('answers at most MAX_DECISION_REQUESTS_PER_TURN (8) requests per turn; each one over the cap gets a failed result saying why', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());
            const requests: AgentDecisionRequest[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, state: 's', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' } } }));

            const results = await agent.testExecuteDecisionRequestsAsSteps(requests, {}, undefined, stepParams());

            expect(MAX_DECISION_REQUESTS_PER_TURN).toBe(8);
            expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.decisionsMaxRequests).toBe(MAX_DECISION_REQUESTS_PER_TURN);
            expect(ask).toHaveBeenCalledTimes(8);
            expect(createdSteps).toHaveLength(8);
            expect(results.map(r => r.success)).toEqual([true, true, true, true, true, true, true, true, false, false]);
            expect(results.slice(8).map(r => r.id)).toEqual(['r8', 'r9']);
            expect(results[9].error).toContain('at most 8 decision requests');
        });

        it('reads the per-turn cap from decisionsMaxRequests', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());
            const requests: AgentDecisionRequest[] = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, state: 's', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' } } }));

            const results = await agent.testExecuteDecisionRequestsAsSteps(requests, {}, { decisionsMaxRequests: 2 }, stepParams());

            expect(ask).toHaveBeenCalledTimes(2);
            expect(results.filter(r => r.success).map(r => r.id)).toEqual(['r0', 'r1']);
            expect(results[4].error).toContain('at most 2 decision requests');
        });
    });

    describe('13. Decision calls link their prompt runs', () => {
        let agent: TestAgent;
        let createdSteps: MockStepEntity[];
        let mockService: AgentDecisionService;

        /** Every call answers, and carries a prompt run named after the state it was asked about. */
        const answerWithRun = async (args: AgentDecisionAskParams): Promise<AIDecisionRunResult> => {
            const promptRun = { ID: `prun-${String(args.State)}` } satisfies Pick<MJAIPromptRunEntity, 'ID'>;
            return { success: true, Answers: { ok: { Kind: 'Likelihood', Probability: 0.7 } }, promptRun: promptRun as MJAIPromptRunEntity };
        };

        beforeEach(() => {
            agent = new TestAgent();
            createdSteps = [];
            seedDecisionRun(agent, createdSteps);
            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
            vi.spyOn(mockService, 'Ask').mockImplementation(answerWithRun);
        });

        it("links a single-state request's prompt run to its Decision step", async () => {
            await agent.testExecuteDecisionRequestsAsSteps(
                [{ id: 'once', state: 'only', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' } } }],
                {}, undefined, { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(createdSteps).toHaveLength(1);
            expect(createdSteps[0].TargetLogID).toBe('prun-only');
            expect(createdSteps[0].PromptRun?.ID).toBe('prun-only');
        });

        it('gives each forEachItemIn item its own child step carrying that call\'s prompt run, and the parent none', async () => {
            const results = await agent.testExecuteDecisionRequestsAsSteps(
                [{ id: 'batch', forEachItemIn: 'payload.items', questions: { ok: { kind: 'Likelihood', instructions: 'Fine?' } } }],
                { items: ['a', 'b', 'c'] }, undefined, { contextUser: {} as UserInfo, conversationMessages: [] },
            );

            expect(results[0].success).toBe(true);
            const [parent, ...items] = createdSteps;
            expect(parent.StepName).toContain('Decision: batch');
            expect(parent.PromptRun).toBeUndefined();
            expect(parent.Status).toBe('Completed');
            expect(items).toHaveLength(3);
            expect(items.every(s => s.StepType === 'Decision' && s.ParentID === parent.ID && s.Status === 'Completed')).toBe(true);
            expect(items.map(s => s.TargetLogID).sort()).toEqual(['prun-a', 'prun-b', 'prun-c']);
            expect(items.map(s => s.PromptRun?.ID).sort()).toEqual(['prun-a', 'prun-b', 'prun-c']);
        });
    });

    describe('14. Per-turn budget on decision calls', () => {
        let agent: TestAgent;
        let createdSteps: MockStepEntity[];
        let mockService: AgentDecisionService;

        const QUESTIONS: AgentDecisionRequest['questions'] = { ok: { kind: 'Likelihood', instructions: 'Is it fine?' } };
        const answered = (): AIDecisionRunResult => ({ success: true, Answers: { ok: { Kind: 'Likelihood', Probability: 0.7 } } });
        const stepParams = (): DecisionStepParams => ({ contextUser: {} as UserInfo, conversationMessages: [] });
        const itemsOf = (count: number): number[] => Array.from({ length: count }, (_, i) => i);
        const stepNamed = (name: string): MockStepEntity | undefined => createdSteps.find(s => s.StepName === `Decision: ${name}`);

        beforeEach(() => {
            agent = new TestAgent();
            createdSteps = [];
            seedDecisionRun(agent, createdSteps);
            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('bounds the calls one turn makes, forEachItemIn items included, at MAX_DECISION_CALLS_PER_TURN (100) by default', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());

            const results = await agent.testExecuteDecisionRequestsAsSteps([
                { id: 'first', forEachItemIn: 'payload.first', questions: QUESTIONS },
                { id: 'second', forEachItemIn: 'payload.second', questions: QUESTIONS },
                { id: 'third', state: 'One more thing.', questions: QUESTIONS },
            ], { first: itemsOf(60), second: itemsOf(60) }, undefined, stepParams());

            expect(MAX_DECISION_CALLS_PER_TURN).toBe(100);
            expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.decisionsMaxCallsPerTurn).toBe(MAX_DECISION_CALLS_PER_TURN);
            // 121 calls asked for, and each request is well under decisionsMaxItems and the request cap.
            expect(ask).toHaveBeenCalledTimes(100);
            // Handed out in request order: the first gets all it wants, the second what is left.
            expect(results[0]).toMatchObject({ id: 'first', success: true });
            expect(results[0].answers).toHaveLength(60);
            expect(results[0].skippedCount).toBeUndefined();
            expect(results[1]).toMatchObject({ id: 'second', success: true, skippedCount: 20 });
            expect(results[1].answers).toHaveLength(40);
            // The third is left nothing, so it is not run and records no step, and its result says why.
            expect(results[2]).toMatchObject({ id: 'third', success: false });
            expect(results[2].error).toContain('at most 100 decision calls in total');
            expect(stepNamed('third')).toBeUndefined();
        });

        it('reads the budget from decisionsMaxCallsPerTurn, and applies it after decisionsMaxItems', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());

            const results = await agent.testExecuteDecisionRequestsAsSteps([
                { id: 'once', state: 'First.', questions: QUESTIONS },
                { id: 'items', forEachItemIn: 'payload.items', questions: QUESTIONS },
                { id: 'late', state: 'Last.', questions: QUESTIONS },
            ], { items: itemsOf(10) }, { decisionsMaxCallsPerTurn: 5, decisionsMaxItems: 6 }, stepParams());

            expect(ask).toHaveBeenCalledTimes(5);
            expect(results.map(r => [r.id, r.success])).toEqual([['once', true], ['items', true], ['late', false]]);
            // Ten items: decisionsMaxItems allows 6, and the budget left after 'once' allows 4.
            expect(results[1].answers).toHaveLength(4);
            expect(results[1].skippedCount).toBe(6);
            expect(results[2].error).toContain('at most 5 decision calls in total');
        });

        it('caps what a forEachItemIn request claims from the budget at decisionsMaxItems, so the requests after it still run', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());

            const results = await agent.testExecuteDecisionRequestsAsSteps([
                { id: 'items', forEachItemIn: 'payload.items', questions: QUESTIONS },
                { id: 'after', state: 'Something else.', questions: QUESTIONS },
            ], { items: itemsOf(10) }, { decisionsMaxCallsPerTurn: 5, decisionsMaxItems: 2 }, stepParams());

            // Ten items, but decisionsMaxItems lets the request make only 2 calls, so it claims 2 of
            // the 5, not all of them, and the single request after it gets its call.
            expect(ask).toHaveBeenCalledTimes(3);
            expect(results.map(r => [r.id, r.success])).toEqual([['items', true], ['after', true]]);
            expect(results[0].answers).toHaveLength(2);
            expect(results[0].skippedCount).toBe(8);
            expect(stepNamed('after')).toBeDefined();
        });

        it('with a budget of 0, makes no call and records no step, and every request says why', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());

            const results = await agent.testExecuteDecisionRequestsAsSteps([
                { id: 'single', state: 'Anything.', questions: QUESTIONS },
                { id: 'batch', forEachItemIn: 'payload.items', questions: QUESTIONS },
            ], { items: itemsOf(3) }, { decisionsMaxCallsPerTurn: 0 }, stepParams());

            expect(ask).not.toHaveBeenCalled();
            expect(createdSteps).toHaveLength(0);
            expect(results.map(r => [r.id, r.success])).toEqual([['single', false], ['batch', false]]);
            expect(results.every(r => r.error?.includes('at most 0 decision calls in total'))).toBe(true);
        });

        it('charges nothing for a request that makes no calls, so it cannot starve the requests after it', async () => {
            const ask = vi.spyOn(mockService, 'Ask').mockResolvedValue(answered());

            const results = await agent.testExecuteDecisionRequestsAsSteps([
                { id: 'notArray', forEachItemIn: 'payload.text', questions: QUESTIONS },
                { id: 'empty', forEachItemIn: 'payload.none', questions: QUESTIONS },
                { id: 'real', state: 'Something.', questions: QUESTIONS },
            ], { text: 'not a list', none: [] }, { decisionsMaxCallsPerTurn: 1 }, stepParams());

            expect(ask).toHaveBeenCalledTimes(1);
            expect(results.map(r => [r.id, r.success])).toEqual([['notArray', false], ['empty', true], ['real', true]]);
            expect(results[0].error).toContain('is not an array');
        });
    });
});


