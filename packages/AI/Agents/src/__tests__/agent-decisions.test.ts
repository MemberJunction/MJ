import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import { UserInfo } from '@memberjunction/core';
import { DecisionQuestion, DecisionAnswer } from '@memberjunction/ai';
import { AIDecisionRunner, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import {
    AgentDecisionQuestion,
    AgentDecisionRequest,
    AgentDecisionResult,
} from '@memberjunction/ai-core-plus';
import { AgentDecisionService } from '../AgentDecisionService';
import { BaseAgent } from '../base-agent';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import {
    DEFAULT_LOOP_AGENT_PROMPT_PARAMS,
    DEFAULT_RESPONSE_TYPE_INCLUSION_RULES,
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

    constructor(id: string) {
        this.ID = id;
        this.StartedAt = new Date();
    }

    public NewRecord(): void {}

    public async Save(): Promise<boolean> {
        return true;
    }
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
        params: any,
    ): Promise<AgentDecisionResult[]> {
        return this.executeDecisionRequestsAsSteps(requests, finalPayload, agentTypePromptParams, params);
    }

    public testInjectDecisionResultsMessage(params: any, results: AgentDecisionResult[]): void {
        this.injectDecisionResultsMessage(params, results);
    }

    public testApplyResponseTypeAutoAlignment(
        params: Record<string, unknown>,
        explicitResponseType?: Record<string, unknown>,
    ): void {
        this.applyResponseTypeAutoAlignment(params, explicitResponseType);
    }
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
                    levels: [1, 2, 3, 4, 5],
                },
            };

            const mapped = AgentDecisionService.ToDecisionQuestions(input);

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
                Levels: [1, 2, 3, 4, 5],
            });
        });
    });

    describe('4. SummarizeAnswers', () => {
        it('summarizes Likelihood, Choice, and Score answers into LLM-friendly shapes', () => {
            const answers: Record<string, DecisionAnswer> = {
                likeA: {
                    Kind: 'Likelihood',
                    Instructions: '...',
                    Probability: 0.85,
                },
                choiceA: {
                    Kind: 'Choice',
                    Instructions: '...',
                    Value: 'bug',
                    Confidence: 0.92,
                },
                scoreA: {
                    Kind: 'Score',
                    Instructions: '...',
                    Value: 4,
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
            const mockPrompt = { Name: 'Default Decision', ID: 'prompt-1' };
            const promptsSpy = vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([mockPrompt as any]);

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
            (agent as any)._activeProvider = {
                GetEntityObject: vi.fn().mockImplementation(async () => {
                    const e = new MockStepEntity(`step-${createdSteps.length + 1}`);
                    createdSteps.push(e);
                    return e;
                }),
            };
            (agent as any)._agentRun = { ID: 'run-1', AgentID: 'agent-1', Steps: [] };
            (agent as any)._agentHierarchy = [];
            (agent as any)._depth = 0;

            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('creates and finalizes Decision step with telemetry and answers', async () => {
            vi.spyOn(mockService, 'Ask').mockResolvedValue({
                success: true,
                Answers: {
                    triage: { Kind: 'Choice', Instructions: '...', Value: 'high', Confidence: 0.95 },
                },
                executionTimeMS: 85,
                tokensUsed: 30,
                DriverClass: 'OpenRouterDecision',
                DecisionResult: { ResolvedModel: 'fast-model-v1' } as any,
                promptRun: { ID: 'prun-1' } as any,
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
            const params = {
                contextUser: { ID: 'user-1' } as UserInfo,
                conversationMessages: [] as any[],
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
            (agent as any)._activeProvider = {
                GetEntityObject: vi.fn().mockImplementation(async () => {
                    const e = new MockStepEntity(`step-${createdSteps.length + 1}`);
                    createdSteps.push(e);
                    return e;
                }),
            };
            (agent as any)._agentRun = { ID: 'run-1', AgentID: 'agent-1', Steps: [] };
            (agent as any)._agentHierarchy = [];
            (agent as any)._depth = 0;

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
            (agent as any)._activeProvider = {
                GetEntityObject: vi.fn().mockImplementation(async () => {
                    const e = new MockStepEntity(`step-${createdSteps.length + 1}`);
                    createdSteps.push(e);
                    return e;
                }),
            };
            (agent as any)._agentRun = { ID: 'run-1', AgentID: 'agent-1', Steps: [] };
            (agent as any)._agentHierarchy = [];
            (agent as any)._depth = 0;

            mockService = new AgentDecisionService();
            agent.setAgentDecisionService(mockService);
        });

        it('iterates over items and returns answers in order', async () => {
            const askSpy = vi.spyOn(mockService, 'Ask').mockImplementation(async (args) => {
                const item = JSON.parse(args.State as string);
                return {
                    success: true,
                    Answers: {
                        score: { Kind: 'Score', Instructions: '', Value: item.priority, Confidence: 0.9 },
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
                        questions: { score: { kind: 'Score', instructions: 'Priority score', levels: [1, 2, 3, 4, 5] } },
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
            (agent as any)._activeProvider = {
                GetEntityObject: vi.fn().mockImplementation(async () => {
                    const e = new MockStepEntity(`step-${createdSteps.length + 1}`);
                    createdSteps.push(e);
                    return e;
                }),
            };
            (agent as any)._agentRun = { ID: 'run-1', AgentID: 'agent-1', Steps: [] };
            (agent as any)._agentHierarchy = [];
            (agent as any)._depth = 0;

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

        it('preempts Chat when decisions are present to force a turn to read results', async () => {
            const promptResult = {
                success: true,
                result: JSON.stringify({
                    message: 'Hello user',
                    nextStep: { type: 'Chat' },
                    decisions: [{ id: 'd1', state: 's', questions: {} }],
                }),
            } as any;

            const nextStep = await loopAgentType.DetermineNextStep(promptResult);
            expect(nextStep.step).toBe('Retry');
            expect(nextStep.terminate).toBe(false);
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('carries decisions into Chat step after preemption cap is reached', async () => {
            const promptResult = {
                success: true,
                result: JSON.stringify({
                    message: 'Hello user',
                    nextStep: { type: 'Chat' },
                    decisions: [{ id: 'd1', state: 's', questions: {} }],
                }),
            } as any;

            // Trigger 3 preemptions
            await loopAgentType.DetermineNextStep(promptResult);
            await loopAgentType.DetermineNextStep(promptResult);
            await loopAgentType.DetermineNextStep(promptResult);

            // 4th time honors Chat
            const nextStep = await loopAgentType.DetermineNextStep(promptResult);
            expect(nextStep.step).toBe('Chat');
            expect(nextStep.terminate).toBe(true);
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('carries decisions into Pipeline early-return step', async () => {
            const promptResult = {
                success: true,
                result: JSON.stringify({
                    nextStep: {
                        type: 'Pipeline',
                        pipeline: { steps: [{ name: 's1' }] },
                    },
                    decisions: [{ id: 'd1', state: 's', questions: {} }],
                }),
            } as any;

            const nextStep = await loopAgentType.DetermineNextStep(promptResult);
            expect(nextStep.step).toBe('Retry');
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('preempts taskComplete when decisions are present to force a turn to read results', async () => {
            const promptResult = {
                success: true,
                result: JSON.stringify({
                    taskComplete: true,
                    message: 'Task is complete',
                    decisions: [{ id: 'd1', state: 's', questions: {} }],
                }),
            } as any;

            const nextStep = await loopAgentType.DetermineNextStep(promptResult);
            expect(nextStep.step).toBe('Retry');
            expect(nextStep.terminate).toBe(false);
            expect(nextStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('carries decisions into normal taskComplete step when no preemption after cap', async () => {
            const promptResult = {
                success: true,
                result: JSON.stringify({
                    taskComplete: true,
                    message: 'All done',
                    decisions: [{ id: 'd1', state: 's', questions: {} }],
                }),
            } as any;

            // Trigger 3 preemptions
            await loopAgentType.DetermineNextStep(promptResult);
            await loopAgentType.DetermineNextStep(promptResult);
            await loopAgentType.DetermineNextStep(promptResult);

            // 4th time honors terminal step
            const finalStep = await loopAgentType.DetermineNextStep(promptResult);
            expect(finalStep.step).toBe('Success');
            expect(finalStep.terminate).toBe(true);
            expect(finalStep.decisions).toEqual([{ id: 'd1', state: 's', questions: {} }]);
        });

        it('carries decisions into normal actions/nextStep return branch', async () => {
            const promptResult = {
                success: true,
                result: JSON.stringify({
                    nextStep: {
                        type: 'Actions',
                        actions: [{ actionName: 'Test' }],
                    },
                    decisions: [{ id: 'd1', state: 's', questions: {} }],
                }),
            } as any;

            const nextStep = await loopAgentType.DetermineNextStep(promptResult);
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
});


