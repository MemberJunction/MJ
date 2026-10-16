/**
 * Full-loop unit tests for `BaseAgent.validateHandoffNextStep` -> `executeHandoffStep` (VS-SAGE-2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
// Bare side-effect import so LoopAgentType registers with ClassFactory.
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import {
    MAX_HANDOFF_HOPS,
    type AIPromptParams,
    type AIPromptRunResult,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';

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
            return {
                Config: async (): Promise<void> => undefined,
                Actions: [],
                RunAction: async () => ({
                    Success: true,
                    Message: 'Action completed',
                    Params: [],
                    Result: { ResultCode: 'SUCCESS' },
                    LogEntry: null,
                }),
            };
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: vi.fn(async (): Promise<boolean> => true),
        IsDirectlyDiscoverable: vi.fn(
            (agent: { InvocationMode?: string | null; ParentID?: string | null }): boolean =>
                agent.InvocationMode !== 'Sub-Agent' && (agent.ParentID == null || agent.ParentID.trim() === ''),
        ),
        FilterRunnableAgents: vi.fn(async <T extends { Status?: string }>(agents: T[]): Promise<T[]> =>
            agents.filter((a) => a.Status === 'Active'),
        ),
    },
}));

const SOURCE_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TARGET_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000010';
const PEER_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000012';
const INACTIVE_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';
const SUB_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000013';
const TYPE_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const STORAGE_ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000007';
const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000008';
const CONV_DETAIL_ID = 'aaaaaaaa-9999-4000-8000-000000000001';

interface AgentRow {
    ID: string;
    Name: string;
    Description: string;
    Status: string;
    TypeID: string;
    DriverClass: string | null;
    Parent: string | null;
    ParentID: string | null;
    InvocationMode: string | null;
    DefaultStorageAccountID: string | null;
    CategoryID: string | null;
    ModelSelectionMode: string;
    DefaultPromptEffortLevel: number | null;
    ScopeConfig: string | null;
    PayloadSelfReadPaths: string | null;
    PayloadSelfWritePaths: string | null;
    PayloadScope: string | null;
    AllowMemoryWrite: boolean;
    ChatHandlingOption: string | null;
    FinalPayloadValidation: string | null;
    StartingPayloadValidation: string | null;
    InjectNotes: boolean;
    InjectExamples: boolean;
    RequirePlanMode: boolean;
    SupportsPlanMode: boolean;
    MaxCostPerRun: number | null;
    MaxTokensPerRun: number | null;
    MaxTimePerRun: number | null;
    MaxIterationsPerRun: number | null;
    AgentTypePromptParams: string | null;
    OwnerUserID: string | null;
}

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
    public saveCount = 0;
    public IsSaved = false;

    constructor(private readonly seq: number) {}

    public NewRecord(): void {
        this.ID = `aaaaaaaa-1111-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        this.saveCount++;
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
    public saveCount = 0;

    public async Save(): Promise<boolean> {
        this.saveCount++;
        return true;
    }
}

class ScriptedPromptRunner {
    public readonly Calls: AIPromptParams[] = [];

    constructor(private readonly script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>) {}

    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        const index = this.Calls.length;
        this.Calls.push(params);
        const responder = this.script[Math.min(index, this.script.length - 1)];
        return responder(params, index);
    }
}

function makeAgentRow(overrides: Partial<AgentRow> = {}): AgentRow {
    return {
        ID: SOURCE_AGENT_ID,
        Name: 'Sage',
        Description: 'Ambient assistant',
        Status: 'Active',
        TypeID: TYPE_ID,
        DriverClass: null,
        Parent: null,
        ParentID: null,
        InvocationMode: 'Any',
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
        AgentTypePromptParams: JSON.stringify({ enableHandoff: true }),
        OwnerUserID: null,
        ...overrides,
    };
}

class HandoffValidationHarness {
    public agent: AgentRow = makeAgentRow();
    public targetAgent: AgentRow = makeAgentRow({
        ID: TARGET_AGENT_ID,
        Name: 'Video Studio',
        Description: 'Video Director agent',
        Status: 'Active',
    });
    public peerAgent: AgentRow = makeAgentRow({
        ID: PEER_AGENT_ID,
        Name: 'Research Agent',
        Description: 'Research specialist',
        Status: 'Active',
    });
    public subAgent: AgentRow = makeAgentRow({
        ID: SUB_AGENT_ID,
        Name: 'Internal SubAgent',
        Description: 'Sub-agent only',
        Status: 'Active',
        InvocationMode: 'Sub-Agent',
    });
    public inactiveAgent: AgentRow = makeAgentRow({
        ID: INACTIVE_AGENT_ID,
        Name: 'Retired Specialist',
        Description: 'Disabled agent',
        Status: 'Disabled',
    });
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];

    private stepSeq = 0;
    private readonly catalog = new Map<string, unknown>();

    public get engineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Agents: [this.agent, this.targetAgent, this.peerAgent, this.subAgent, this.inactiveAgent],
            AgentRelationships: [],
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
                {
                    ID: 'aaaaaaaa-3333-4000-8000-000000000001',
                    AgentID: this.agent.ID,
                    PromptID: CHILD_PROMPT_ID,
                    Status: 'Active',
                    ExecutionOrder: 1,
                },
            ],
            AgentActions: [],
            GetSubAgents: (): unknown[] => [],
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
            if (entityName === 'MJ: Conversation Details') {
                return {
                    ConversationID: 'aaaaaaaa-9999-4000-8000-000000000000',
                    Load: async (): Promise<boolean> => true,
                };
            }
            throw new Error(`HandoffValidationHarness: unexpected GetEntityObject('${entityName}')`);
        },
    };
}

let harness: HandoffValidationHarness;

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    public get ValidationRetryCount(): number {
        return this._generalValidationRetryCount;
    }
}

interface AgentInternals {
    _promptRunner: ScriptedPromptRunner;
}

function makeAgent(script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>): {
    agent: HarnessAgent;
    runner: ScriptedPromptRunner;
} {
    const agent = new HarnessAgent();
    const runner = new ScriptedPromptRunner(script);
    const internals = agent as unknown as AgentInternals;
    internals._promptRunner = runner;
    return { agent, runner };
}

const TEST_USER = { ID: USER_ID, Name: 'Loop Tester', Email: 'loop@test.mj' };

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: harness.agent as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'Help me produce a 60s video reel' }],
        contextUser: TEST_USER as unknown as UserInfo,
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
        handoffChain: [],
        conversationDetailId: CONV_DETAIL_ID,
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

function handoffEnvelope(
    agentName = 'Video Studio',
    message = 'Bringing in Video Studio — they have the full brief.',
): LoopAgentResponse {
    return {
        taskComplete: false,
        message,
        reasoning: 'User wants to produce a video reel; Video Studio is the dedicated specialist.',
        nextStep: {
            type: 'Handoff',
            handoff: {
                agentName,
                brief: 'Goal: 60-second product demo reel. Audience: retail buyers.',
                reason: 'User asked to produce a video reel',
            },
        },
    };
}

function successEnvelope(extra: Partial<LoopAgentResponse> = {}): LoopAgentResponse {
    return {
        taskComplete: true,
        message: 'All work finished',
        ...extra,
    };
}

describe('BaseAgent validateHandoffNextStep -> executeHandoffStep (VS-SAGE-2)', () => {
    beforeEach(() => {
        harness = new HandoffValidationHarness();
        vi.clearAllMocks();
        vi.mocked(AIAgentPermissionHelper.HasPermission).mockResolvedValue(true);
        vi.mocked(AIAgentPermissionHelper.IsDirectlyDiscoverable).mockImplementation(
            (agent: { InvocationMode?: string | null; ParentID?: string | null }) =>
                agent.InvocationMode !== 'Sub-Agent' && (agent.ParentID == null || agent.ParentID.trim() === ''),
        );
        vi.mocked(AIAgentPermissionHelper.FilterRunnableAgents).mockImplementation(
            async <T extends { Status?: string }>(agents: T[]) => agents.filter((a) => a.Status === 'Active'),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('approved handoff creates one Completed Handoff step with TargetID, OutputData.HandoffToAgentID, Hop, Chain, sets ExecuteAgentResult.handoff, and ends Success', async () => {
        const priorId = 'aaaaaaaa-0000-4000-8000-000000000099';
        const { agent, runner } = makeAgent([() => llmEnvelope(handoffEnvelope('  video studio  '))]);

        const result = await agent.Execute(
            makeParams({
                handoffChain: [priorId],
            }),
        );

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(1);
        expect(agent.ValidationRetryCount).toBe(0);

        const handoffSteps = harness.steps.filter((s) => s.StepType === 'Handoff');
        expect(handoffSteps).toHaveLength(1);
        const step = handoffSteps[0];
        expect(step.Status).toBe('Completed');
        expect(step.TargetID).toBe(TARGET_AGENT_ID);
        const output = JSON.parse(step.OutputData ?? '{}') as Record<string, unknown>;
        expect(output.HandoffToAgentID).toBe(TARGET_AGENT_ID);
        expect(output.TargetAgentName).toBe('Video Studio');
        expect(output.Hop).toBe(2);
        expect(output.Chain).toEqual([priorId, SOURCE_AGENT_ID]);

        expect(result.handoff).toEqual({
            targetAgentId: TARGET_AGENT_ID,
            targetAgentName: 'Video Studio',
            sourceAgentId: SOURCE_AGENT_ID,
            brief: 'Goal: 60-second product demo reel. Audience: retail buyers.',
            reason: 'User asked to produce a video reel',
            runStepId: step.ID,
        });
    });

    it('refused handoff (NotFound) writes a Failed Handoff step with RefusalReason, increments _generalValidationRetryCount, injects candidates into retry turn, and does not set result.handoff', async () => {
        const { agent, runner } = makeAgent([
            () => llmEnvelope(handoffEnvelope('Missing Specialist')),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        expect(agent.ValidationRetryCount).toBe(1);

        const handoffSteps = harness.steps.filter((s) => s.StepType === 'Handoff');
        expect(handoffSteps).toHaveLength(1);
        expect(handoffSteps[0].Status).toBe('Failed');
        expect(handoffSteps[0].ErrorMessage).toMatch(/not found or not active/i);
        expect(handoffSteps[0].ErrorMessage).toContain('Research Agent, Video Studio');
        const output = JSON.parse(handoffSteps[0].OutputData ?? '{}') as Record<string, unknown>;
        expect(output.RefusalReason).toBe('NotFound');
        expect(output.AgentName).toBe('Missing Specialist');
        expect(output.Brief).toBe('Goal: 60-second product demo reel. Audience: retail buyers.');
        expect(output.Reason).toBe('User asked to produce a video reel');

        expect(runner.Calls).toHaveLength(2);
        const turn2Messages = (runner.Calls[1].conversationMessages ?? []).map((m) =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        );
        expect(
            turn2Messages.some(
                (c) => /not found or not active/i.test(c) && c.includes('Research Agent, Video Studio'),
            ),
        ).toBe(true);
    });

    it('refused handoff (NoRunPermission) writes a Failed Handoff step, increments retry count, and injects refusal message with candidates', async () => {
        vi.mocked(AIAgentPermissionHelper.HasPermission).mockImplementation(async (agentId: string) => {
            return agentId !== TARGET_AGENT_ID;
        });
        vi.mocked(AIAgentPermissionHelper.FilterRunnableAgents).mockImplementation(
            async <T extends { ID?: string; Status?: string }>(agents: T[]) =>
                agents.filter((a) => a.Status === 'Active' && a.ID !== TARGET_AGENT_ID),
        );

        const { agent, runner } = makeAgent([
            () => llmEnvelope(handoffEnvelope('Video Studio')),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        expect(agent.ValidationRetryCount).toBe(1);

        const handoffSteps = harness.steps.filter((s) => s.StepType === 'Handoff');
        expect(handoffSteps).toHaveLength(1);
        expect(handoffSteps[0].Status).toBe('Failed');
        expect(handoffSteps[0].ErrorMessage).toMatch(/does not have permission to run Video Studio/i);
        const output = JSON.parse(handoffSteps[0].OutputData ?? '{}') as Record<string, unknown>;
        expect(output.RefusalReason).toBe('NoRunPermission');

        expect(runner.Calls).toHaveLength(2);
        const turn2Messages = (runner.Calls[1].conversationMessages ?? []).map((m) =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        );
        expect(
            turn2Messages.some(
                (c) => /does not have permission to run Video Studio/i.test(c) && c.includes('Research Agent'),
            ),
        ).toBe(true);
    });

    it('refused handoff (AlreadyInThisTurn) writes a Failed Handoff step, increments retry count, and instructs agent to answer directly', async () => {
        const { agent, runner } = makeAgent([
            () => llmEnvelope(handoffEnvelope('Video Studio')),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(
            makeParams({
                handoffChain: [TARGET_AGENT_ID],
            }),
        );

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        expect(agent.ValidationRetryCount).toBe(1);

        const handoffSteps = harness.steps.filter((s) => s.StepType === 'Handoff');
        expect(handoffSteps).toHaveLength(1);
        expect(handoffSteps[0].Status).toBe('Failed');
        expect(handoffSteps[0].ErrorMessage).toContain('Video Studio has already participated in this turn');
        const output = JSON.parse(handoffSteps[0].OutputData ?? '{}') as Record<string, unknown>;
        expect(output.RefusalReason).toBe('AlreadyInThisTurn');

        expect(runner.Calls).toHaveLength(2);
        const turn2Messages = (runner.Calls[1].conversationMessages ?? []).map((m) =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        );
        expect(turn2Messages.some((c) => c.includes('Video Studio has already participated in this turn'))).toBe(true);
    });

    it('refused handoff (HopLimit) when handoffChain has MAX_HANDOFF_HOPS entries writes a Failed Handoff step', async () => {
        const { agent } = makeAgent([
            () => llmEnvelope(handoffEnvelope('Video Studio')),
            () => llmEnvelope(successEnvelope()),
        ]);

        const fullChain = Array.from(
            { length: MAX_HANDOFF_HOPS },
            (_, i) => `bbbbbbbb-0000-4000-8000-00000000000${i + 1}`,
        );
        const result = await agent.Execute(
            makeParams({
                handoffChain: fullChain,
            }),
        );

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        const handoffSteps = harness.steps.filter((s) => s.StepType === 'Handoff');
        expect(handoffSteps).toHaveLength(1);
        expect(handoffSteps[0].Status).toBe('Failed');
        const output = JSON.parse(handoffSteps[0].OutputData ?? '{}') as Record<string, unknown>;
        expect(output.RefusalReason).toBe('HopLimit');
    });

    it('ten refusals in a row hit MAX_VALIDATION_RETRIES and end the run Failed', async () => {
        const { agent, runner } = makeAgent([() => llmEnvelope(handoffEnvelope('Missing Specialist'))]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(result.handoff).toBeUndefined();
        expect(agent.ValidationRetryCount).toBe(10);
        expect(runner.Calls).toHaveLength(10);
        const handoffSteps = harness.steps.filter((s) => s.StepType === 'Handoff');
        expect(handoffSteps).toHaveLength(10);
        expect(handoffSteps.every((s) => s.Status === 'Failed')).toBe(true);
        expect(result.agentRun.ErrorMessage).toMatch(/Maximum validation retries of 10 exceeded/i);
    });
});
