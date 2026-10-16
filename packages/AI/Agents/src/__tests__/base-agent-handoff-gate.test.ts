/**
 * Full-loop unit tests for the `'Handoff'` step type in BaseAgent.Execute() (VS-SAGE-1):
 *   1. metadata-only gate: an agent with AgentTypePromptParams: { enableHandoff: true } and
 *      nothing in `data`, on a root run with `handoffChain: []` and a conversation detail,
 *      gets its Handoff accepted (VS-SAGE-0's pattern).
 *   2. gate off: Retry, no Handoff step written, the run continues.
 *   3. gate on, root run, `handoffChain: []`, a conversation detail: a `Handoff` step is
 *      written with `TargetID` and the expected `OutputData`; the run ends `Success` with
 *      the message; `ExecuteAgentResult.handoff` is set.
 *   4. gate on, but a sub-agent run (`parentRun`), no `handoffChain`, or no
 *      `conversationDetailId`: withheld from the prompt data and refused.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
// Bare side-effect import so LoopAgentType registers with ClassFactory.
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import type {
    AIPromptParams,
    AIPromptRunResult,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

// ============================================================================
// Module mocks (boundaries only)
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
        HasPermission: async (): Promise<boolean> => true,
        IsDirectlyDiscoverable: (agent: { InvocationMode?: string | null; ParentID?: string | null }): boolean =>
            agent.InvocationMode !== 'Sub-Agent' && (agent.ParentID == null || agent.ParentID.trim() === ''),
        FilterRunnableAgents: async <T extends { Status?: string }>(agents: T[]): Promise<T[]> =>
            agents.filter((a) => a.Status === 'Active'),
    },
}));

// ============================================================================
// Fixed IDs (UUID-shaped: initAgentRunStep only stamps TargetID for valid UUIDs)
// ============================================================================

const SOURCE_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TARGET_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000010';
const INACTIVE_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';
const TYPE_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const STORAGE_ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000007';
const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000008';
const CONV_DETAIL_ID = 'aaaaaaaa-9999-4000-8000-000000000001';

// ============================================================================
// Harness types
// ============================================================================

interface AgentRow {
    ID: string;
    Name: string;
    Description: string;
    Status: string;
    TypeID: string;
    DriverClass: string | null;
    Parent: string | null;
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
        AgentTypePromptParams: null,
        OwnerUserID: null,
        ...overrides,
    };
}

class HandoffLoopHarness {
    public agent: AgentRow = makeAgentRow();
    public targetAgent: AgentRow = makeAgentRow({
        ID: TARGET_AGENT_ID,
        Name: 'Video Studio',
        Description: 'Video Director agent',
        Status: 'Active',
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
            Agents: [this.agent, this.targetAgent, this.inactiveAgent],
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
                { ID: 'aaaaaaaa-3333-4000-8000-000000000001', AgentID: this.agent.ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
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
            throw new Error(`HandoffLoopHarness: unexpected GetEntityObject('${entityName}')`);
        },
    };
}

let harness: HandoffLoopHarness;

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
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

describe('BaseAgent.Execute — Handoff gate and execution (VS-SAGE-1)', () => {
    beforeEach(() => {
        harness = new HandoffLoopHarness();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('1. metadata-only gate: an agent with AgentTypePromptParams.enableHandoff=true and nothing in data has its Handoff accepted on a root conversation run', async () => {
        harness.agent = makeAgentRow({
            AgentTypePromptParams: JSON.stringify({ enableHandoff: true }),
        });
        const { agent, runner } = makeAgent([() => llmEnvelope(handoffEnvelope())]);

        const result = await agent.Execute(
            makeParams({
                handoffChain: [],
                conversationDetailId: CONV_DETAIL_ID,
            }),
        );

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(1);
        expect(harness.steps.map((s) => s.StepType)).toContain('Handoff');
        expect(result.handoff).toBeDefined();
        expect(result.handoff?.targetAgentId).toBe(TARGET_AGENT_ID);
        expect(result.handoff?.targetAgentName).toBe('Video Studio');
    });

    it('2. gate off: Retry, no Handoff step is written, and the run continues to completion', async () => {
        harness.agent = makeAgentRow();
        const { agent, runner } = makeAgent([
            () => llmEnvelope(handoffEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(
            makeParams({
                handoffChain: [],
                conversationDetailId: CONV_DETAIL_ID,
            }),
        );

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        expect(harness.steps.map((s) => s.StepType)).not.toContain('Handoff');
        expect(runner.Calls).toHaveLength(2);
        const turn2Messages = (runner.Calls[1].conversationMessages ?? []).map((m) =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        );
        expect(turn2Messages.some((c) => /Handoff is not (?:enabled|available)/i.test(c))).toBe(true);
    });

    it('3. gate on, root run, handoffChain: [], conversationDetailId set: writes Handoff step with TargetID and OutputData, ends Success with message, and sets ExecuteAgentResult.handoff', async () => {
        harness.agent = makeAgentRow({
            AgentTypePromptParams: JSON.stringify({ enableHandoff: true }),
        });
        const { agent } = makeAgent([
            () => llmEnvelope(handoffEnvelope('video studio', 'Bringing in Video Studio — they have the full brief.')),
        ]);

        const result = await agent.Execute(
            makeParams({
                handoffChain: [],
                conversationDetailId: CONV_DETAIL_ID,
            }),
        );

        expect(result.success).toBe(true);
        expect(result.agentRun.FinalStep).toBe('Success');
        expect(result.agentRun.Message).toBe('Bringing in Video Studio — they have the full brief.');

        const handoffStep = harness.steps.find((s) => s.StepType === 'Handoff');
        expect(handoffStep).toBeDefined();
        expect(handoffStep?.StepName).toBe('Handoff: Video Studio');
        expect(handoffStep?.TargetID).toBe(TARGET_AGENT_ID);
        expect(handoffStep?.Status).toBe('Completed');
        expect(handoffStep?.Success).toBe(true);

        const output = JSON.parse(handoffStep?.OutputData ?? '{}') as Record<string, unknown>;
        expect(output).toMatchObject({
            HandoffToAgentID: TARGET_AGENT_ID,
            TargetAgentName: 'Video Studio',
            Brief: 'Goal: 60-second product demo reel. Audience: retail buyers.',
            Reason: 'User asked to produce a video reel',
            Hop: 1,
            Chain: [SOURCE_AGENT_ID],
        });

        expect(result.handoff).toEqual({
            targetAgentId: TARGET_AGENT_ID,
            targetAgentName: 'Video Studio',
            sourceAgentId: SOURCE_AGENT_ID,
            brief: 'Goal: 60-second product demo reel. Audience: retail buyers.',
            reason: 'User asked to produce a video reel',
            runStepId: handoffStep?.ID,
        });
    });

    it('4a. gate on, but a sub-agent run (parentRun set): withheld from prompt data and refused', async () => {
        harness.agent = makeAgentRow({
            AgentTypePromptParams: JSON.stringify({ enableHandoff: true }),
        });
        const { agent, runner } = makeAgent([
            () => llmEnvelope(handoffEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(
            makeParams({
                parentRun: { ID: 'aaaaaaaa-5555-4000-8000-000000000001' } as unknown as MJAIAgentRunEntityExtended,
                handoffChain: [],
                conversationDetailId: CONV_DETAIL_ID,
            }),
        );

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        expect(harness.steps.map((s) => s.StepType)).not.toContain('Handoff');
        expect(runner.Calls).toHaveLength(2);
        const promptParams = runner.Calls[0].data?.__agentTypePromptParams as {
            enableHandoff?: boolean;
            includeResponseTypeDefinition?: { handoff?: boolean };
        };
        expect(promptParams.enableHandoff).toBe(false);
        expect(promptParams.includeResponseTypeDefinition?.handoff).toBe(false);
    });

    it('4b. gate on, but handoffChain is omitted: withheld from prompt data and refused', async () => {
        harness.agent = makeAgentRow({
            AgentTypePromptParams: JSON.stringify({ enableHandoff: true }),
        });
        const { agent, runner } = makeAgent([
            () => llmEnvelope(handoffEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(
            makeParams({
                conversationDetailId: CONV_DETAIL_ID,
            }),
        );

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        expect(harness.steps.map((s) => s.StepType)).not.toContain('Handoff');
        expect(runner.Calls).toHaveLength(2);
        const promptParams = runner.Calls[0].data?.__agentTypePromptParams as {
            enableHandoff?: boolean;
            includeResponseTypeDefinition?: { handoff?: boolean };
        };
        expect(promptParams.enableHandoff).toBe(false);
        expect(promptParams.includeResponseTypeDefinition?.handoff).toBe(false);
    });

    it('4c. gate on, but conversationDetailId is omitted: withheld from prompt data and refused', async () => {
        harness.agent = makeAgentRow({
            AgentTypePromptParams: JSON.stringify({ enableHandoff: true }),
        });
        const { agent, runner } = makeAgent([
            () => llmEnvelope(handoffEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(
            makeParams({
                handoffChain: [],
            }),
        );

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        expect(harness.steps.map((s) => s.StepType)).not.toContain('Handoff');
        expect(runner.Calls).toHaveLength(2);
        const promptParams = runner.Calls[0].data?.__agentTypePromptParams as {
            enableHandoff?: boolean;
            includeResponseTypeDefinition?: { handoff?: boolean };
        };
        expect(promptParams.enableHandoff).toBe(false);
        expect(promptParams.includeResponseTypeDefinition?.handoff).toBe(false);
    });

    it('5. validateHandoffNextStep refuses inactive or non-existent target agent with Retry', async () => {
        harness.agent = makeAgentRow({
            AgentTypePromptParams: JSON.stringify({ enableHandoff: true }),
        });
        const { agent, runner } = makeAgent([
            () => llmEnvelope(handoffEnvelope('Retired Specialist')),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(
            makeParams({
                handoffChain: [],
                conversationDetailId: CONV_DETAIL_ID,
            }),
        );

        expect(result.success).toBe(true);
        expect(result.handoff).toBeUndefined();
        const handoffSteps = harness.steps.filter((s) => s.StepType === 'Handoff');
        expect(handoffSteps).toHaveLength(1);
        expect(handoffSteps[0].Status).toBe('Failed');
        expect(runner.Calls).toHaveLength(2);
        const turn2Messages = (runner.Calls[1].conversationMessages ?? []).map((m) =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        );
        expect(turn2Messages.some((c) => /not found or not active/i.test(c))).toBe(true);
    });
});
