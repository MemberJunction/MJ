/**
 * Unit and loop-integration tests for ChatHandlingOption functionality on BaseAgent.
 *
 * Verifies:
 * 1. Direct `validateChatNextStep` behavior across NULL, 'Consult', 'Success', 'Failed', 'Retry', and verbose logging.
 * 2. Real `BaseAgent.Execute()` loop behavior for:
 *    - Own Chat under 'Retry': loop re-prompts with `Retrying due to: <question>`, second turn succeeds, run Completed.
 *    - Child Chat under parent 'Retry' (child path and related path): parent continues, next prompt sees child's question as a sub-agent result, run Completed.
 *    - Child Chat remapped to 'Success': parent terminates with Success and merged payload.
 *    - Bounded unproductive retries: model returns Chat every turn under 'Retry', run ends Failed after 10 consecutive retries (not at the first Chat).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
// Register real LoopAgentType with MJGlobal ClassFactory
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import {
    type AIPromptParams,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type AgentSubAgentRequest,
} from '@memberjunction/ai-core-plus';
import { LogStatus } from '@memberjunction/core';
import type { ChatMessage, IMetadataProvider, UserInfo } from '@memberjunction/core';

// ============================================================================
// Module mocks (boundaries only — matching base-agent-loop.test.ts)
// ============================================================================

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return harness.engineInstance;
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return harness.actionEngineInstance;
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: async (): Promise<boolean> => true,
    },
}));

// ============================================================================
// Fixed IDs (UUID-shaped)
// ============================================================================

const AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TYPE_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const STORAGE_ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000007';
const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000008';

const CHILD_SUB_AGENT_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const RELATED_SUB_AGENT_ID = 'cccccccc-0000-4000-8000-000000000001';
const RELATIONSHIP_ID = 'dddddddd-0000-4000-8000-000000000001';

// ============================================================================
// Harness types
// ============================================================================

class MockStepEntity {
    public ID = '';
    public AgentRunID = '';
    public StepNumber = 0;
    public StepType = '';
    public StepName = '';
    public TargetID: string | null = null;
    public TargetLogID: string | null = null;
    public ParentID: string | null = null;
    public Status = '';
    public StartedAt: Date = new Date(0);
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public ErrorMessage: string | null = null;
    public InputData: string | null = null;
    public OutputData: string | null = null;
    public PayloadAtStart: string | null = null;
    public PayloadAtStartSourceStepID: string | null = null;
    public PayloadAtEnd: string | null = null;
    public Skills: string | null = null;
    public SubAgentRun: unknown = null;
    public IsSaved = false;

    constructor(private readonly seq: number) {}

    public NewRecord(): void {
        this.ID = `aaaaaaaa-1111-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        this.IsSaved = true;
        return true;
    }
}

class FakeAgentRun {
    public ID = 'aaaaaaaa-2222-4000-8000-000000000001';
    public AgentID = '';
    public Status = '';
    public StartedAt: Date | null = null;
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public ErrorMessage: string | null = null;
    public UserID: string | null = null;
    public CompanyID: string | null = null;
    public ParentRunID: string | null = null;
    public StartingPayload: string | null = null;
    public Verbose = false;
    public TotalPromptIterations = 0;
    public Result: string | null = null;
    public FinalStep: string | null = null;
    public Message: string | null = null;
    public FinalPayload: string | null = null;
    public FinalPayloadObject: unknown = undefined;
    public PlanMode = false;
    public TotalTokensUsed = 0;
    public TotalPromptTokensUsed = 0;
    public TotalCompletionTokensUsed = 0;
    public TotalCacheReadTokensUsed = 0;
    public TotalCacheWriteTokensUsed = 0;
    public TotalCost = 0;
    public Steps: MockStepEntity[] = [];

    public async Save(): Promise<boolean> {
        return true;
    }
}

class ScriptedPromptRunner {
    public readonly Calls: AIPromptParams[] = [];

    constructor(private readonly script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>) {}

    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        const index = this.Calls.length;
        this.Calls.push({
            ...params,
            conversationMessages: params.conversationMessages ? [...params.conversationMessages] : [],
        });
        const responder = this.script[Math.min(index, this.script.length - 1)];
        return responder(params, index);
    }
}

class ChatHandlingHarness {
    public agent: Record<string, unknown> = makeAgentRow();
    public subAgents: Record<string, unknown>[] = [];
    public relationships: Record<string, unknown>[] = [];
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];
    public executeSubAgentHandler: (
        request: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended
    ) => Promise<ExecuteAgentResult> = async () => {
        throw new Error('executeSubAgentHandler not configured');
    };

    private stepSeq = 0;
    private readonly catalog = new Map<string, unknown>();

    public get engineInstance(): Record<string, unknown> {
        const allAgents = [this.agent, ...this.subAgents];
        return {
            Config: async (): Promise<void> => undefined,
            Agents: allAgents,
            AgentRelationships: this.relationships,
            AgentCategories: [],
            ResolveAgentStorageAccountID: () => null,
            ScopedPromptParts: [],
            ScopedPromptConfigs: [],
            AgentTypes: [
                {
                    ID: TYPE_ID,
                    Name: 'Loop',
                    DriverClass: 'LoopAgentType',
                    SystemPromptID: SYS_PROMPT_ID,
                    AgentPromptPlaceholder: '_AGENT_PROMPT_',
                    PromptParamsSchema: null,
                    DefaultStorageAccountID: null,
                },
            ],
            Prompts: [
                { ID: SYS_PROMPT_ID, Name: 'Loop System Prompt', EffortLevel: null },
                { ID: CHILD_PROMPT_ID, Name: 'Agent Child Prompt', EffortLevel: null },
            ],
            AgentPrompts: [
                { ID: 'aaaaaaaa-3333-4000-8000-000000000001', AgentID: this.agent.ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
            ],
            AgentActions: [],
            GetSubAgents: (agentId: string, status?: string, relationshipStatus?: string): unknown[] => {
                const children = this.subAgents.filter(
                    a => a.ParentID === agentId && (!status || a.Status === status)
                );
                const relSubAgentIds = this.relationships
                    .filter(ar => ar.AgentID === agentId && (!relationshipStatus || ar.Status === relationshipStatus))
                    .map(ar => ar.SubAgentID);
                const related = this.subAgents.filter(
                    a => relSubAgentIds.includes(a.ID) && (!status || a.Status === status)
                );
                return [...children, ...related];
            },
            GetAutoActivatableSkillsForAgent: (): unknown[] => [],
            GetSkillsForAgent: (): unknown[] => [],
            GetClientToolsForAgent: (): unknown[] => [],
            GetAgentConfigurationPresets: (): unknown[] => [],
            GetAgentBaseCatalog: (agentId: string): unknown => this.catalog.get(agentId),
            SetAgentBaseCatalog: (agentId: string, cat: unknown): void => {
                this.catalog.set(agentId, cat);
            },
        };
    }

    public get actionEngineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Actions: [],
            RunAction: vi.fn(),
        };
    }

    public readonly provider = {
        GetEntityObject: async (entityName: string): Promise<unknown> => {
            if (entityName === 'MJ: AI Agent Runs') {
                const run = new FakeAgentRun();
                this.runs.push(run);
                return run;
            }
            if (entityName === 'MJ: AI Agent Run Steps') {
                const step = new MockStepEntity(++this.stepSeq);
                this.steps.push(step);
                return step;
            }
            throw new Error(`ChatHandlingHarness: unexpected GetEntityObject('${entityName}')`);
        },
    };
}

function makeAgentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: AGENT_ID,
        Name: 'ParentAgent',
        Description: 'Parent agent under test',
        Status: 'Active',
        TypeID: TYPE_ID,
        DriverClass: null,
        Parent: null,
        ParentID: null,
        DefaultStorageAccountID: STORAGE_ACCOUNT_ID,
        CategoryID: null,
        ModelSelectionMode: 'Agent Type',
        DefaultPromptEffortLevel: null,
        ScopeConfig: null,
        PayloadSelfReadPaths: null,
        PayloadSelfWritePaths: null,
        PayloadScope: null,
        AllowMemoryWrite: false,
        ChatHandlingOption: null,
        MaxSubAgentConsultRounds: null,
        FinalPayloadValidation: null,
        StartingPayloadValidation: null,
        InjectNotes: false,
        InjectExamples: false,
        RequirePlanMode: false,
        SupportsPlanMode: false,
        MaxCostPerRun: null,
        MaxTokensPerRun: null,
        MaxTimePerRun: null,
        MaxIterationsPerRun: null,
        AgentTypePromptParams: null,
        OwnerUserID: null,
        ...overrides,
    };
}

function registerChildSubAgent(overrides: Record<string, unknown> = {}): MJAIAgentEntityExtended {
    const child = {
        ...makeAgentRow(),
        ID: CHILD_SUB_AGENT_ID,
        Name: 'ChildSubAgent',
        Description: 'Child sub-agent under test',
        ParentID: AGENT_ID,
        ExecutionOrder: 1,
        ExecutionMode: 'Sequential',
        ChatHandlingOption: null,
        PayloadDownstreamPaths: JSON.stringify(['*']),
        PayloadUpstreamPaths: JSON.stringify(['*']),
        ...overrides,
    } as unknown as MJAIAgentEntityExtended;
    harness.subAgents.push(child as unknown as Record<string, unknown>);
    return child;
}

function registerRelatedSubAgent(
    agentOverrides: Record<string, unknown> = {},
    relOverrides: Record<string, unknown> = {}
): { subAgent: MJAIAgentEntityExtended; relationship: Record<string, unknown> } {
    const subAgent = {
        ...makeAgentRow(),
        ID: RELATED_SUB_AGENT_ID,
        Name: 'RelatedSubAgent',
        Description: 'Related sub-agent under test',
        ParentID: null,
        ExecutionOrder: 1,
        ExecutionMode: 'Sequential',
        ChatHandlingOption: null,
        ...agentOverrides,
    } as unknown as MJAIAgentEntityExtended;
    const relationship = {
        ID: RELATIONSHIP_ID,
        AgentID: AGENT_ID,
        SubAgentID: subAgent.ID,
        SubAgent: subAgent.Name,
        Status: 'Active',
        SubAgentOutputMapping: JSON.stringify({ '*': '*' }),
        SubAgentInputMapping: JSON.stringify({ '*': '*' }),
        SubAgentContextPaths: null,
        ChatHandlingOption: null,
        ConfigurationPresetID: null,
        ...relOverrides,
    };
    harness.subAgents.push(subAgent as unknown as Record<string, unknown>);
    harness.relationships.push(relationship);
    return { subAgent, relationship };
}

let harness: ChatHandlingHarness;

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    protected override async ExecuteSubAgent<SC = unknown, SR = unknown>(
        _params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended,
        _payload?: SR,
        _contextMessage?: ChatMessage,
        _stepCount: number = 0
    ): Promise<ExecuteAgentResult<SR>> {
        const res = await harness.executeSubAgentHandler(subAgentRequest, subAgent);
        if (stepEntity && res.agentRun?.ID) {
            stepEntity.TargetLogID = res.agentRun.ID;
        }
        return res as ExecuteAgentResult<SR>;
    }

    public async CallValidateChatNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
        chatHandlingOption?: 'Consult' | 'Failed' | 'Retry' | 'Success' | null
    ): Promise<BaseAgentNextStep<P>> {
        return await this.validateChatNextStep(
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep,
            chatHandlingOption
        );
    }
}

const TEST_USER = { ID: USER_ID, Name: 'Loop Tester', Email: 'loop@test.mj' } as unknown as UserInfo;

function makeAgent(script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>): {
    agent: HarnessAgent;
    runner: ScriptedPromptRunner;
    flushSteps: () => Promise<unknown>;
} {
    const agent = new HarnessAgent();
    const runner = new ScriptedPromptRunner(script);
    const internals = agent as unknown as {
        _promptRunner: ScriptedPromptRunner;
        _stepSaveQueue: { Flush(): Promise<unknown> };
    };
    internals._promptRunner = runner;
    return { agent, runner, flushSteps: () => internals._stepSaveQueue.Flush() };
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: harness.agent as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'Please complete the task' }],
        contextUser: TEST_USER,
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
        ...overrides,
    };
}

function llmEnvelope(envelope: LoopAgentResponse): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(envelope),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

function makeSubAgentChatResult(params: {
    runId: string;
    agentId: string;
    agentName: string;
    message: string;
    payload?: Record<string, unknown>;
}): ExecuteAgentResult {
    const run = new FakeAgentRun();
    run.ID = params.runId;
    run.AgentID = params.agentId;
    run.Status = 'AwaitingFeedback';
    run.FinalStep = 'Chat';
    run.Success = true;
    run.Message = params.message;
    run.FinalPayload = JSON.stringify(params.payload ?? {});
    run.FinalPayloadObject = params.payload ?? {};
    return {
        success: true,
        payload: params.payload ?? {},
        agentRun: run as unknown as MJAIAgentRunEntityExtended,
    };
}

function makeSubAgentSuccessResult(params: {
    runId: string;
    agentId: string;
    message?: string;
    payload?: Record<string, unknown>;
}): ExecuteAgentResult {
    const run = new FakeAgentRun();
    run.ID = params.runId;
    run.AgentID = params.agentId;
    run.Status = 'Completed';
    run.FinalStep = 'Success';
    run.Success = true;
    run.Message = params.message ?? 'Done';
    run.FinalPayload = JSON.stringify(params.payload ?? {});
    run.FinalPayloadObject = params.payload ?? {};
    return {
        success: true,
        payload: params.payload ?? {},
        agentRun: run as unknown as MJAIAgentRunEntityExtended,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    harness = new ChatHandlingHarness();
});

// ============================================================================
// 1. Unit tests against real BaseAgent.validateChatNextStep
// ============================================================================

describe('BaseAgent.validateChatNextStep (unit)', () => {
    it('null (default behavior) - Chat step is not remapped', async () => {
        harness.agent.ChatHandlingOption = null;
        const agent = new HarnessAgent();
        const params = makeParams();
        const dummyRun = new FakeAgentRun() as unknown as MJAIAgentRunEntityExtended;
        const dummyStep = new MockStepEntity(1) as unknown as MJAIAgentRunStepEntityExtended;
        const chatStep: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Chat',
            terminate: true,
            message: 'Need user input',
            newPayload: { someData: 'test' },
        };

        const result = await agent.CallValidateChatNextStep(params, chatStep, {}, dummyRun, dummyStep);

        expect(result.step).toBe('Chat');
        expect(result.message).toBe('Need user input');
        expect(result.terminate).toBe(true);
    });

    it('"Consult" - own Chat step propagates unchanged with terminate: true', async () => {
        harness.agent.ChatHandlingOption = 'Consult';
        const agent = new HarnessAgent();
        const params = makeParams();
        const dummyRun = new FakeAgentRun() as unknown as MJAIAgentRunEntityExtended;
        const dummyStep = new MockStepEntity(1) as unknown as MJAIAgentRunStepEntityExtended;
        const chatStep: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Chat',
            terminate: true,
            message: 'Asking human caller',
            newPayload: { someData: 'test' },
        };

        const result = await agent.CallValidateChatNextStep(params, chatStep, {}, dummyRun, dummyStep);

        expect(result.step).toBe('Chat');
        expect(result.message).toBe('Asking human caller');
        expect(result.terminate).toBe(true);
    });

    it('"Success" - remaps Chat to Success with terminate: true', async () => {
        harness.agent.ChatHandlingOption = 'Success';
        const agent = new HarnessAgent();
        const params = makeParams();
        const dummyRun = new FakeAgentRun() as unknown as MJAIAgentRunEntityExtended;
        const dummyStep = new MockStepEntity(1) as unknown as MJAIAgentRunStepEntityExtended;
        const chatStep: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Chat',
            terminate: true,
            message: 'Need user input',
            newPayload: { someData: 'test' },
            responseForm: { questions: [] },
            actionableCommands: [{ type: 'open:resource', label: 'Open', resourceType: 'Record', entityName: 'Users', recordId: '1' }],
        };

        const result = await agent.CallValidateChatNextStep(params, chatStep, {}, dummyRun, dummyStep);

        expect(result.step).toBe('Success');
        expect(result.message).toBe('Need user input');
        expect(result.terminate).toBe(true);
        expect(result.newPayload).toEqual({ someData: 'test' });
        expect(result.responseForm).toEqual({ questions: [] });
    });

    it('"Failed" - remaps Chat to Failed with terminate: true', async () => {
        harness.agent.ChatHandlingOption = 'Failed';
        const agent = new HarnessAgent();
        const params = makeParams();
        const dummyRun = new FakeAgentRun() as unknown as MJAIAgentRunEntityExtended;
        const dummyStep = new MockStepEntity(1) as unknown as MJAIAgentRunStepEntityExtended;
        const chatStep: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Chat',
            terminate: true,
            message: 'Cannot proceed without user input',
            newPayload: { someData: 'test' },
        };

        const result = await agent.CallValidateChatNextStep(params, chatStep, {}, dummyRun, dummyStep);

        expect(result.step).toBe('Failed');
        expect(result.message).toBe('Cannot proceed without user input');
        expect(result.terminate).toBe(true);
    });

    it('"Retry" - remaps Chat to Retry with terminate: false and populates errorMessage', async () => {
        harness.agent.ChatHandlingOption = 'Retry';
        const agent = new HarnessAgent();
        const params = makeParams();
        const dummyRun = new FakeAgentRun() as unknown as MJAIAgentRunEntityExtended;
        const dummyStep = new MockStepEntity(1) as unknown as MJAIAgentRunStepEntityExtended;
        const chatStep: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Chat',
            terminate: true,
            message: 'Need clarification',
            newPayload: { someData: 'test' },
        };

        const result = await agent.CallValidateChatNextStep(params, chatStep, {}, dummyRun, dummyStep);

        expect(result.step).toBe('Retry');
        expect(result.terminate).toBe(false);
        expect(result.message).toBe('Need clarification');
        expect(result.errorMessage).toBe('Chat was remapped to Retry by ChatHandlingOption');
    });

    it('"Retry" - preserves existing errorMessage when remapping Chat to Retry', async () => {
        harness.agent.ChatHandlingOption = 'Retry';
        const agent = new HarnessAgent();
        const params = makeParams();
        const dummyRun = new FakeAgentRun() as unknown as MJAIAgentRunEntityExtended;
        const dummyStep = new MockStepEntity(1) as unknown as MJAIAgentRunStepEntityExtended;
        const chatStep: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Chat',
            terminate: true,
            message: 'Need clarification',
            errorMessage: 'orig',
            newPayload: { someData: 'test' },
        };

        const result = await agent.CallValidateChatNextStep(params, chatStep, {}, dummyRun, dummyStep);

        expect(result.step).toBe('Retry');
        expect(result.terminate).toBe(false);
        expect(result.message).toBe('Need clarification');
        expect(result.errorMessage).toBe('orig');
    });

    it('Verbose logging logs remap status when verbose is true', async () => {
        harness.agent.ChatHandlingOption = 'Success';
        const agent = new HarnessAgent();
        const params = makeParams({ verbose: true });
        const dummyRun = new FakeAgentRun() as unknown as MJAIAgentRunEntityExtended;
        const dummyStep = new MockStepEntity(1) as unknown as MJAIAgentRunStepEntityExtended;
        const chatStep: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Chat',
            terminate: true,
            message: 'Test',
        };

        const result = await agent.CallValidateChatNextStep(params, chatStep, {}, dummyRun, dummyStep);

        expect(result.step).toBe('Success');
        expect(LogStatus).toHaveBeenCalledWith(
            expect.stringContaining('Remapping Chat step to Success')
        );
    });
});

// ============================================================================
// 2. Real Execute() loop tests for ChatHandlingOption
// ============================================================================

describe('ChatHandlingOption in real BaseAgent.Execute() loop', () => {
    it('Parent remaps child Chat to Success and finishes Completed', async () => {
        harness.agent.ChatHandlingOption = 'Success';
        registerChildSubAgent();

        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: 'child-run-success-remap',
                agentId: CHILD_SUB_AGENT_ID,
                agentName: 'ChildSubAgent',
                message: 'Need design approval',
                payload: { technicalDesign: 'Component architecture' },
            });

        const { agent, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Delegating to child',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ChildSubAgent',
                            message: 'Create design',
                            terminateAfter: false,
                        },
                    },
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        expect(result.success).toBe(true);
        expect(result.agentRun.Status).toBe('Completed');
        expect(result.agentRun.FinalStep).toBe('Success');
        expect(result.agentRun.Message).toBe('Need design approval');
        expect(result.payload).toEqual({ technicalDesign: 'Component architecture' });
    });

    it('Own Chat under Retry: loop re-prompts with "Retrying due to: <question>", second turn succeeds, run Completed', async () => {
        harness.agent.ChatHandlingOption = 'Retry';

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Which region should I query?',
                    nextStep: { type: 'Chat' },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Defaulted to all regions and completed.',
                    payloadChangeRequest: { newElements: { region: 'ALL' } },
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        const firstPromptStep = harness.steps.find(s => s.StepType === 'Prompt');
        const firstStepOutput = JSON.parse(firstPromptStep?.OutputData ?? '{}') as {
            nextStep?: { step?: string; terminate?: boolean; errorMessage?: string };
        };
        expect(firstStepOutput.nextStep?.step).toBe('Retry');
        expect(firstStepOutput.nextStep?.terminate).toBe(false);
        expect(firstStepOutput.nextStep?.errorMessage).toBeTruthy();

        expect(runner.Calls).toHaveLength(2);
        const turn2Messages = runner.Calls[1].conversationMessages ?? [];
        const retryMsg = turn2Messages.find(
            m => typeof m.content === 'string' && m.content.includes('Retrying due to: Which region should I query?')
        );
        expect(retryMsg).toBeDefined();

        expect(result.success).toBe(true);
        expect(result.agentRun.Status).toBe('Completed');
        expect(result.agentRun.FinalStep).toBe('Success');
        expect(result.payload).toEqual({ region: 'ALL' });
    });

    it('Child Chat under parent Retry (child path): parent continues, next prompt sees child question as sub-agent result, run Completed', async () => {
        harness.agent.ChatHandlingOption = 'Retry';
        registerChildSubAgent();

        let subAgentCallCount = 0;
        harness.executeSubAgentHandler = async () => {
            subAgentCallCount++;
            if (subAgentCallCount === 1) {
                return makeSubAgentChatResult({
                    runId: 'child-run-retry-1',
                    agentId: CHILD_SUB_AGENT_ID,
                    agentName: 'ChildSubAgent',
                    message: 'Should I include archived records?',
                    payload: { draft: true },
                });
            }
            return makeSubAgentSuccessResult({
                runId: 'child-run-retry-2',
                agentId: CHILD_SUB_AGENT_ID,
                message: 'Completed without archived records',
                payload: { draft: false, completed: true },
            });
        };

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Calling ChildSubAgent',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ChildSubAgent',
                            message: 'Process records',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Proceeded after seeing child question',
                    payloadChangeRequest: { newElements: { handledRetry: true } },
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        expect(runner.Calls).toHaveLength(2);
        const turn2Messages = runner.Calls[1].conversationMessages ?? [];
        const subAgentResultMsg = turn2Messages.find(
            m =>
                typeof m.content === 'string' &&
                m.content.includes('Should I include archived records?') &&
                (m as unknown as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-result'
        );
        expect(subAgentResultMsg).toBeDefined();

        expect(result.success).toBe(true);
        expect(result.agentRun.Status).toBe('Completed');
        expect(result.agentRun.FinalStep).toBe('Success');
        expect(result.payload).toEqual({ draft: true, handledRetry: true });
    });

    it('Child Chat under parent Retry (related path): parent continues, next prompt sees child question as sub-agent result, run Completed', async () => {
        harness.agent.ChatHandlingOption = 'Retry';
        registerRelatedSubAgent();

        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: 'related-run-retry-1',
                agentId: RELATED_SUB_AGENT_ID,
                agentName: 'RelatedSubAgent',
                message: 'What voice gender is preferred?',
                payload: { voicePending: true },
            });

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Calling RelatedSubAgent',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'RelatedSubAgent',
                            message: 'Select voice',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Selected default voice after retry',
                    payloadChangeRequest: { newElements: { voiceSelected: 'neutral' } },
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        expect(runner.Calls).toHaveLength(2);
        const turn2Messages = runner.Calls[1].conversationMessages ?? [];
        const subAgentResultMsg = turn2Messages.find(
            m =>
                typeof m.content === 'string' &&
                m.content.includes('What voice gender is preferred?') &&
                (m as unknown as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-result'
        );
        expect(subAgentResultMsg).toBeDefined();

        expect(result.success).toBe(true);
        expect(result.agentRun.Status).toBe('Completed');
        expect(result.agentRun.FinalStep).toBe('Success');
    });

    it('Bounded: model returns Chat every turn under Retry — run ends Failed after 10 consecutive retries (not at first Chat)', async () => {
        harness.agent.ChatHandlingOption = 'Retry';

        const { agent, runner, flushSteps } = makeAgent([
            (_params, callIndex) =>
                llmEnvelope({
                    taskComplete: false,
                    message: `Still asking question #${callIndex + 1}`,
                    nextStep: { type: 'Chat' },
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        // MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES = 10 -> 10 prompt calls before safety net stops the loop
        expect(runner.Calls).toHaveLength(10);
        expect(result.success).toBe(false);
        expect(result.agentRun.Status).toBe('Failed');
        expect(result.agentRun.ErrorMessage).toContain('10 consecutive unproductive retries');
    });
});
