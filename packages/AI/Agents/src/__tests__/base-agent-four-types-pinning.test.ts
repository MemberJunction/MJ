/**
 * Stage 1 Behavior-Pinning Suite: 4-Agent-Type Integration Pinning (Loop, Flow, Harness, Realtime).
 *
 * Pins today's untouched BaseAgent behavior end-to-end across all four MJ agent types before
 * Stage 2 helper extractions begin:
 *   1. LoopAgentType: Prompt -> Actions -> Prompt -> Success, Sub-Agent delegation, Skill activation,
 *      TaskGraph submission, Handoff, MaxIterationsPerRun guardrail, and Cooperative Pause.
 *   2. FlowAgentType (inRun mode): multi-step Prompt -> Action -> Prompt graph with conditional paths
 *      and payload mapping.
 *   3. Harness protocol subclass: verifies BaseAgent's core virtual lifecycle hooks
 *      (validateAgent, preparePromptParams, executePrompt, determineNextStep,
 *      validateSuccessNextStep, finalizeRun) fire in exact order with super.* dispatch intact.
 *   4. RealtimeAgentType (session-driven): drives full BaseAgent.Execute() -> executeRealtimeSession ->
 *      RealtimeSessionRunner -> transcript persistence + usage checkpointing -> finalizeRealtimeRun.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActiveRunGovernanceRegistry } from '../ActiveRunGovernanceRegistry';
import { BaseAgent } from '../base-agent';
import '../agent-types/loop-agent-type';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { FlowAgentType } from '../agent-types/flow-agent-type';
import '../agent-types/realtime-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import { BaseAgentType } from '../agent-types/base-agent-type';
import {
    BaseRealtimeModel,
    type IRealtimeSession,
    type RealtimeSessionParams,
    type RealtimeTranscript,
    type RealtimeUsage,
} from '@memberjunction/ai';
import {
    AttachCooperativePauseRequestToRunData,
    RegisterTaskGraphSubmitter,
    TaskGraphSubmitter,
    type AgentConfiguration,
    type AgentSubAgentRequest,
    type AIPromptParams,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type TaskGraphSubmitOutcome,
    type TaskGraphSubmitRequest,
} from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

// ============================================================================
// Module Boundary Mocks
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
            return state.engineInstance;
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return state.actionEngineInstance;
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

// ============================================================================
// Fixed UUIDs
// ============================================================================

const LOOP_AGENT_ID = '10000000-0000-4000-8000-000000000001';
const SUB_AGENT_ID = '10000000-0000-4000-8000-000000000002';
const HANDOFF_AGENT_ID = '10000000-0000-4000-8000-000000000003';
const FLOW_AGENT_ID = '10000000-0000-4000-8000-000000000004';
const HARNESS_AGENT_ID = '10000000-0000-4000-8000-000000000005';
const REALTIME_AGENT_ID = '10000000-0000-4000-8000-000000000006';

const LOOP_TYPE_ID = '20000000-0000-4000-8000-000000000001';
const FLOW_TYPE_ID = '20000000-0000-4000-8000-000000000002';
const HARNESS_TYPE_ID = '20000000-0000-4000-8000-000000000003';
const REALTIME_TYPE_ID = '20000000-0000-4000-8000-000000000004';

const SYS_PROMPT_ID = '30000000-0000-4000-8000-000000000001';
const CHILD_PROMPT_ID = '30000000-0000-4000-8000-000000000002';
const FLOW_PROMPT_1_ID = '30000000-0000-4000-8000-000000000003';
const FLOW_PROMPT_2_ID = '30000000-0000-4000-8000-000000000004';

const ACTION_ID = '40000000-0000-4000-8000-000000000001';
const ACTION_NAME = 'Pinning Compute';
const ACTION_LOG_ID = '40000000-0000-4000-8000-000000000099';
const SKILL_ID = '50000000-0000-4000-8000-000000000001';
const SKILL_NAME = 'Finance Analysis';
const STORAGE_ACCOUNT_ID = '60000000-0000-4000-8000-000000000001';
const USER_ID = '70000000-0000-4000-8000-000000000001';

const FLOW_STEP_1_ID = '80000000-0000-4000-8000-000000000001';
const FLOW_STEP_2_ID = '80000000-0000-4000-8000-000000000002';
const FLOW_STEP_3_ID = '80000000-0000-4000-8000-000000000003';

// Register a Harness-protocol AgentType inheriting LoopAgentType (mirrors HarnessAgentType)
@RegisterClass(BaseAgentType, 'PinningHarnessAgentType')
class PinningHarnessAgentType extends LoopAgentType {}

// ============================================================================
// Mock Entities & Harness
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
    public PayloadAtEndSourceStepID: string | null = null;
    public Skills: string | null = null;
    public IsSaved = false;
    public saveCount = 0;

    constructor(private readonly seq: number) {}
    public NewRecord(): void {
        this.ID = `90000000-1111-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }
    public async Save(): Promise<boolean> {
        this.saveCount++;
        this.IsSaved = true;
        return true;
    }
}

class MockRunEntity {
    public ID = '90000000-2222-4000-8000-000000000001';
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
    public Data: string | null = null;
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

class MockPromptRunEntity {
    public ID = '90000000-3333-4000-8000-000000000001';
    public PromptID: string | null = null;
    public ModelID = '';
    public VendorID: string | null = null;
    public AgentID: string | null = null;
    public UserID: string | null = null;
    public Status = '';
    public RunAt: Date | null = null;
    public StreamingEnabled = false;
    public Cancelled = false;
    public CacheHit = false;
    public TokensPrompt = 0;
    public TokensCompletion = 0;
    public TokensUsed = 0;
    public LatestResult = { CompleteMessage: '' };
    public saveCount = 0;
    public NewRecord(): void {
        this.ID = '90000000-3333-4000-8000-000000000001';
    }
    public async Save(): Promise<boolean> {
        this.saveCount++;
        return true;
    }
}

class MockConversationDetail {
    public ID = '';
    public ConversationID = '';
    public Role: 'AI' | 'Error' | 'User' = 'User';
    public Message = '';
    public Status: 'Complete' | 'Error' | 'In-Progress' = 'In-Progress';
    public UserID: string | null = null;
    public AgentSessionID: string | null = null;
    public TurnEndedAt: Date | null = null;
    public LatestResult = { CompleteMessage: '' };
    constructor(private readonly seq: number, private readonly store: Map<string, MockConversationDetail>) {}
    public MarkServerAuthoredReply(): void { /* marker */ }
    public NewRecord(): void {
        this.ID = `90000000-4444-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }
    public async Save(): Promise<boolean> {
        this.store.set(this.ID, this);
        return true;
    }
    public async Load(id: string): Promise<boolean> {
        const existing = this.store.get(id);
        if (!existing) return false;
        this.ID = existing.ID;
        this.Status = existing.Status;
        this.Message = existing.Message;
        this.Role = existing.Role;
        return true;
    }
}

interface ActionCallRecord {
    actionName: string;
    params: Array<{ Name: string; Value: unknown; Type: string }>;
    activeSkillIDs?: unknown;
    contextUserID?: string;
}

function makeAgentRow(id: string, name: string, typeId: string, overrides: Record<string, unknown> = {}): MJAIAgentEntityExtended {
    return {
        ID: id,
        Name: name,
        Description: `${name} pinning fixture`,
        Status: 'Active',
        TypeID: typeId,
        DriverClass: null,
        Parent: null,
        ParentID: null,
        BaseAgentID: null,
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
        AcceptsSkills: 'All',
        SkillActivationMode: 'Auto',
        MaxCostPerRun: null,
        MaxTokensPerRun: null,
        MaxTimePerRun: null,
        MaxIterationsPerRun: null,
        AgentTypePromptParams: null,
        OwnerUserID: null,
        TypeConfiguration: null,
        ...overrides,
    } as unknown as MJAIAgentEntityExtended;
}

class FourTypesHarness {
    public runs: MockRunEntity[] = [];
    public steps: MockStepEntity[] = [];
    public promptRuns: MockPromptRunEntity[] = [];
    public detailStore = new Map<string, MockConversationDetail>();
    public actionCalls: ActionCallRecord[] = [];
    public loopAgent = makeAgentRow(LOOP_AGENT_ID, 'Pinning Loop Agent', LOOP_TYPE_ID);
    public subAgent = makeAgentRow(SUB_AGENT_ID, 'Pinning Sub Agent', LOOP_TYPE_ID, {
        ParentID: LOOP_AGENT_ID,
        InvocationMode: 'Sub-Agent',
    });
    public handoffAgent = makeAgentRow(HANDOFF_AGENT_ID, 'Specialist Handoff Agent', LOOP_TYPE_ID);
    public flowAgent = makeAgentRow(FLOW_AGENT_ID, 'Pinning Flow Agent', FLOW_TYPE_ID);
    public harnessAgent = makeAgentRow(HARNESS_AGENT_ID, 'Pinning Harness Agent', HARNESS_TYPE_ID);
    public realtimeAgent = makeAgentRow(REALTIME_AGENT_ID, 'Pinning Realtime Agent', REALTIME_TYPE_ID);
    private stepSeq = 0;
    private detailSeq = 0;
    private readonly catalog = new Map<string, unknown>();

    public get engineInstance(): Record<string, unknown> {
        const skillRow = {
            ID: SKILL_ID,
            Name: SKILL_NAME,
            Description: 'Financial analysis methodology',
            Instructions: 'Always verify currency precision to 2 decimals.',
            Status: 'Active',
        };
        return {
            Config: async (): Promise<void> => undefined,
            Agents: [
                this.loopAgent,
                this.subAgent,
                this.handoffAgent,
                this.flowAgent,
                this.harnessAgent,
                this.realtimeAgent,
            ],
            AgentRelationships: [],
            AgentCategories: [],
            ResolveAgentStorageAccountID: () => STORAGE_ACCOUNT_ID,
            ScopedPromptParts: [],
            ScopedPromptConfigs: [],
            AgentTypes: [
                {
                    ID: LOOP_TYPE_ID,
                    Name: 'Loop',
                    DriverClass: 'LoopAgentType',
                    SystemPromptID: SYS_PROMPT_ID,
                    AgentPromptPlaceholder: '_AGENT_PROMPT_',
                    PromptParamsSchema: null,
                    DefaultStorageAccountID: null,
                },
                {
                    ID: FLOW_TYPE_ID,
                    Name: 'Flow',
                    DriverClass: 'FlowAgentType',
                    SystemPromptID: null,
                    AgentPromptPlaceholder: null,
                    PromptParamsSchema: null,
                    DefaultStorageAccountID: null,
                },
                {
                    ID: HARNESS_TYPE_ID,
                    Name: 'Harness',
                    DriverClass: 'PinningHarnessAgentType',
                    SystemPromptID: SYS_PROMPT_ID,
                    AgentPromptPlaceholder: '_AGENT_PROMPT_',
                    PromptParamsSchema: null,
                    DefaultStorageAccountID: null,
                },
                {
                    ID: REALTIME_TYPE_ID,
                    Name: 'Realtime',
                    DriverClass: 'RealtimeAgentType',
                    SystemPromptID: null,
                    AgentPromptPlaceholder: null,
                    PromptParamsSchema: null,
                    DefaultConfiguration: null,
                    DefaultStorageAccountID: null,
                },
            ],
            Prompts: [
                { ID: SYS_PROMPT_ID, Name: 'Loop System Prompt', EffortLevel: null },
                { ID: CHILD_PROMPT_ID, Name: 'Child Prompt', EffortLevel: null },
                { ID: FLOW_PROMPT_1_ID, Name: 'Flow Step 1 Prompt', EffortLevel: null },
                { ID: FLOW_PROMPT_2_ID, Name: 'Flow Step 2 Prompt', EffortLevel: null },
            ],
            AgentPrompts: [
                { ID: '31000000-0000-4000-8000-000000000001', AgentID: LOOP_AGENT_ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
                { ID: '31000000-0000-4000-8000-000000000002', AgentID: HARNESS_AGENT_ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
            ],
            AgentActions: [
                {
                    ID: '41000000-0000-4000-8000-000000000001',
                    AgentID: LOOP_AGENT_ID,
                    ActionID: ACTION_ID,
                    Action: ACTION_NAME,
                    Status: 'Active',
                },
                {
                    ID: '41000000-0000-4000-8000-000000000002',
                    AgentID: FLOW_AGENT_ID,
                    ActionID: ACTION_ID,
                    Action: ACTION_NAME,
                    Status: 'Active',
                },
            ],
            AgentSteps: [
                {
                    ID: FLOW_STEP_1_ID,
                    AgentID: FLOW_AGENT_ID,
                    Name: 'Prepare Input',
                    Description: 'Prompt step 1',
                    StepType: 'Prompt',
                    StartingStep: true,
                    Status: 'Active',
                    PromptID: FLOW_PROMPT_1_ID,
                    ActionID: null,
                    SubAgentID: null,
                    ActionInputMapping: null,
                    ActionOutputMapping: null,
                    Configuration: null,
                    LoopBodyType: null,
                    PositionX: 0,
                    PositionY: 0,
                },
                {
                    ID: FLOW_STEP_2_ID,
                    AgentID: FLOW_AGENT_ID,
                    Name: 'Run Compute',
                    Description: 'Action step 2',
                    StepType: 'Action',
                    StartingStep: false,
                    Status: 'Active',
                    PromptID: null,
                    ActionID: ACTION_ID,
                    SubAgentID: null,
                    ActionInputMapping: JSON.stringify({ value: 'payload.seed' }),
                    ActionOutputMapping: JSON.stringify({ doubled: 'computed' }),
                    Configuration: null,
                    LoopBodyType: null,
                    PositionX: 100,
                    PositionY: 0,
                },
                {
                    ID: FLOW_STEP_3_ID,
                    AgentID: FLOW_AGENT_ID,
                    Name: 'Summarize Result',
                    Description: 'Prompt step 3',
                    StepType: 'Prompt',
                    StartingStep: false,
                    Status: 'Active',
                    PromptID: FLOW_PROMPT_2_ID,
                    ActionID: null,
                    SubAgentID: null,
                    ActionInputMapping: null,
                    ActionOutputMapping: null,
                    Configuration: null,
                    LoopBodyType: null,
                    PositionX: 200,
                    PositionY: 0,
                },
            ],
            AgentStepPaths: [
                {
                    ID: '81000000-0000-4000-8000-000000000001',
                    OriginStepID: FLOW_STEP_1_ID,
                    DestinationStepID: FLOW_STEP_2_ID,
                    Condition: null,
                    Priority: 1,
                },
                {
                    ID: '81000000-0000-4000-8000-000000000002',
                    OriginStepID: FLOW_STEP_2_ID,
                    DestinationStepID: FLOW_STEP_3_ID,
                    Condition: 'payload.computed == 42',
                    Priority: 1,
                },
            ],
            GetAgentSteps: (agentId: string) =>
                agentId === FLOW_AGENT_ID ? (this.engineInstance.AgentSteps as unknown[]) : [],
            GetAgentStepByID: (stepId: string) =>
                (this.engineInstance.AgentSteps as Array<{ ID: string }>).find((s) => s.ID === stepId),
            GetAgentStepPaths: (agentId: string) =>
                agentId === FLOW_AGENT_ID ? (this.engineInstance.AgentStepPaths as unknown[]) : [],
            GetPathsFromStep: (stepId: string) =>
                (this.engineInstance.AgentStepPaths as Array<{ OriginStepID: string }>).filter((p) => p.OriginStepID === stepId),
            GetEffectiveModelConfiguration: () => null,
            GetSubAgents: (agentId: string) => (agentId === LOOP_AGENT_ID ? [this.subAgent] : []),
            GetAutoActivatableSkillsForAgent: (agent: { ID: string }) => (agent.ID === LOOP_AGENT_ID ? [skillRow] : []),
            GetSkillsForAgent: (agent: { ID: string }) => (agent.ID === LOOP_AGENT_ID ? [skillRow] : []),
            GetSkillExposedActionIDs: () => [],
            GetSkillActionIDs: () => [],
            GetSkillExposedSubAgentIDs: () => [],
            GetSkillSubAgentIDs: () => [],
            GetSkillSubAgents: () => [],
            GetSkillActions: () => [],
            Skills: [skillRow],
            AgentSkills: [
                { ID: '51000000-0000-4000-8000-000000000001', AgentID: LOOP_AGENT_ID, SkillID: SKILL_ID, Status: 'Active' },
            ],
            SkillActions: [],
            GetClientToolsForAgent: () => [],
            GetAgentConfigurationPresets: () => [],
            GetAgentBaseCatalog: (agentId: string) => this.catalog.get(agentId),
            SetAgentBaseCatalog: (agentId: string, cat: unknown) => {
                this.catalog.set(agentId, cat);
            },
        };
    }

    public get actionEngineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Actions: [
                {
                    ID: ACTION_ID,
                    Name: ACTION_NAME,
                    Description: 'Doubles a numeric input',
                    Status: 'Active',
                    Params: {
                        Items: [
                            { Name: 'value', Type: 'Input', IsRequired: false },
                            { Name: 'doubled', Type: 'Output', IsRequired: false },
                        ],
                    },
                    ResultCodes: { Items: [] },
                },
            ],
            RunAction: async (input: {
                Action: { Name: string };
                Params: Array<{ Name: string; Value: unknown; Type: string }>;
                Context?: { ActiveSkillIDs?: unknown };
                ContextUser?: { ID?: string };
            }) => {
                this.actionCalls.push({
                    actionName: input.Action.Name,
                    params: input.Params,
                    activeSkillIDs: input.Context?.ActiveSkillIDs,
                    contextUserID: input.ContextUser?.ID,
                });
                const rawVal = Number(input.Params.find((p) => p.Name === 'value')?.Value ?? 21);
                return {
                    Success: true,
                    Message: `Computed ${rawVal * 2}`,
                    Params: [
                        ...input.Params,
                        { Name: 'doubled', Value: rawVal * 2, Type: 'Output' },
                    ],
                    Result: { ResultCode: 'SUCCESS' },
                    LogEntry: { ID: ACTION_LOG_ID },
                };
            },
        };
    }

    public readonly provider = {
        GetEntityObject: async (entityName: string): Promise<unknown> => {
            if (entityName === 'MJ: AI Agent Runs') {
                const run = new MockRunEntity();
                this.runs.push(run);
                return run;
            }
            if (entityName === 'MJ: AI Agent Run Steps') {
                const step = new MockStepEntity(++this.stepSeq);
                this.steps.push(step);
                return step;
            }
            if (entityName === 'MJ: AI Prompt Runs') {
                const pr = new MockPromptRunEntity();
                this.promptRuns.push(pr);
                return pr;
            }
            if (entityName === 'MJ: Conversation Details') {
                return new MockConversationDetail(++this.detailSeq, this.detailStore);
            }
            throw new Error(`FourTypesHarness: unexpected GetEntityObject('${entityName}')`);
        },
        RunView: async () => ({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 0,
        }),
        EntityByName: () => undefined,
    };
}

let state: FourTypesHarness;

class ScriptedRunner {
    public readonly Calls: AIPromptParams[] = [];
    constructor(private readonly script: Array<(p: AIPromptParams, i: number) => AIPromptRunResult>) {}
    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        const idx = this.Calls.length;
        this.Calls.push(params);
        return this.script[Math.min(idx, this.script.length - 1)](params, idx);
    }
}

function envelope(e: LoopAgentResponse): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(e),
        promptTokens: 120,
        completionTokens: 45,
        combinedTokensUsed: 165,
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

class PinningBaseAgent extends BaseAgent {
    public SubAgentCalls: Array<{ name: string; userID?: string }> = [];

    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    protected override async ExecuteSubAgent<P, R>(
        params: ExecuteAgentParams<unknown, P>,
        request: AgentSubAgentRequest,
        _subAgent: MJAIAgentEntityExtended,
        _stepEntity: MJAIAgentRunStepEntityExtended,
    ): Promise<ExecuteAgentResult<R>> {
        this.SubAgentCalls.push({ name: request.name, userID: params.contextUser?.ID });
        return {
            success: true,
            payload: { subAgentDone: true, echo: request.message } as unknown as R,
            agentRun: {
                ID: '90000000-5555-4000-8000-000000000001',
                Status: 'Completed',
                Success: true,
                Message: `Sub-agent ${request.name} completed`,
                FinalStep: 'Success',
            } as unknown as MJAIAgentRunEntityExtended,
        };
    }
}

class PinningHarnessSubclass extends PinningBaseAgent {
    public HookTrace: string[] = [];

    protected override async validateAgent(agent: MJAIAgentEntityExtended): Promise<ExecuteAgentResult | null> {
        this.HookTrace.push('validateAgent');
        return super.validateAgent(agent);
    }

    protected override async preparePromptParams<P>(
        config: AgentConfiguration,
        payload: P,
        params: ExecuteAgentParams,
    ): Promise<AIPromptParams> {
        this.HookTrace.push('preparePromptParams');
        return super.preparePromptParams(config, payload, params);
    }

    protected override async executePrompt(
        promptParams: AIPromptParams,
        config: AgentConfiguration,
        attemptNumber?: number,
    ): Promise<AIPromptRunResult> {
        this.HookTrace.push('executePrompt');
        return super.executePrompt(promptParams, config, attemptNumber);
    }

    protected override async determineNextStep<P>(
        promptResult: AIPromptRunResult | null,
        params: ExecuteAgentParams,
        payload: P,
        agentTypeState: unknown,
    ): Promise<BaseAgentNextStep<P>> {
        this.HookTrace.push('determineNextStep');
        return super.determineNextStep(promptResult, params, payload, agentTypeState);
    }

    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep?: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>> {
        this.HookTrace.push('validateSuccessNextStep');
        return super.validateSuccessNextStep(params, nextStep, currentPayload, agentRun, currentStep);
    }

    protected override async finalizeRun(outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        this.HookTrace.push(`finalizeRun:${outcome}`);
        await super.finalizeRun(outcome);
    }
}

class MockDriveableRealtimeSession implements IRealtimeSession {
    private transcriptHandler?: (t: RealtimeTranscript) => void;
    private usageHandler?: (u: RealtimeUsage) => void;
    public Closed = false;

    public SendInput(): void { /* no-op */ }
    public async RegisterTools(): Promise<void> { /* no-op */ }
    public OnOutput(): void { /* no-op */ }
    public OnTranscript(cb: (t: RealtimeTranscript) => void): void {
        this.transcriptHandler = cb;
        queueMicrotask(() => this.EmitDemoExchange());
    }
    public OnToolCall(): void { /* no-op */ }
    public OnInterruption(): void { /* no-op */ }
    public OnUsage(cb: (u: RealtimeUsage) => void): void { this.usageHandler = cb; }
    public OnError(): void { /* no-op */ }
    public async SendToolResult(): Promise<void> { /* no-op */ }
    public async Close(): Promise<void> { this.Closed = true; }

    public EmitDemoExchange(): void {
        this.transcriptHandler?.({ Role: 'user', Text: 'Hello co-agent', IsFinal: true });
        this.transcriptHandler?.({ Role: 'assistant', Text: 'Hi! Ready to help.', IsFinal: true });
        this.usageHandler?.({ InputTokens: 50, OutputTokens: 25 });
    }
}

class MockDriveableRealtimeModel extends BaseRealtimeModel {
    public Session = new MockDriveableRealtimeSession();
    constructor() {
        super('mock-realtime-key');
    }
    public async StartSession(_params: RealtimeSessionParams): Promise<IRealtimeSession> {
        return this.Session;
    }
}

class PinningRealtimeAgent extends PinningBaseAgent {
    public Model = new MockDriveableRealtimeModel();
    protected override async resolveRealtimeModel() {
        return { model: this.Model, modelID: 'rt-model-1', vendorID: 'rt-vendor-1', apiName: 'mock-rt-api' };
    }
}

const TEST_USER = { ID: USER_ID, Name: 'Pinning User', Email: 'pin@test.mj' } as UserInfo;

function baseParams(agent: MJAIAgentEntityExtended, overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent,
        conversationMessages: [{ role: 'user', content: 'Run pinning scenario' }],
        contextUser: TEST_USER,
        provider: state.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
        ...overrides,
    };
}

function wirePromptRunner(agent: BaseAgent, script: Array<(p: AIPromptParams, i: number) => AIPromptRunResult>): ScriptedRunner {
    const runner = new ScriptedRunner(script);
    (agent as unknown as { _promptRunner: ScriptedRunner })._promptRunner = runner;
    return runner;
}

describe('Stage 1 Pinning — 4-Agent-Type Integration Suite (Loop, Flow, Harness, Realtime)', () => {
    beforeEach(() => {
        void PinningHarnessAgentType;
        state = new FourTypesHarness();
        RegisterTaskGraphSubmitter(null);
    });

    afterEach(() => {
        RegisterTaskGraphSubmitter(null);
    });

    it('1. LoopAgentType: Prompt -> Skill -> Action (with active skill) -> Sub-Agent -> Success', async () => {
        const agent = new PinningBaseAgent();
        wirePromptRunner(agent, [
            () => envelope({
                taskComplete: false,
                nextStep: { type: 'Skill', skills: [{ name: SKILL_NAME, reason: 'Needed for precision' }] },
            }),
            () => envelope({
                taskComplete: false,
                payloadChangeRequest: { newElements: { stage: 'post-skill' } },
                nextStep: { type: 'Actions', actions: [{ name: ACTION_NAME, params: { value: 21 } }] },
            }),
            () => envelope({
                taskComplete: false,
                nextStep: {
                    type: 'Sub-Agent',
                    subAgent: { name: 'Pinning Sub Agent', message: 'Check result 42', terminateAfter: false },
                },
            }),
            () => envelope({
                taskComplete: true,
                message: 'Loop completed all stages',
                payloadChangeRequest: { newElements: { done: true } },
            }),
        ]);

        const res = await agent.Execute(baseParams(state.loopAgent, { payload: { initial: 1 } }));
        expect(res.agentRun.ErrorMessage).toBeFalsy();
        expect(res.success).toBe(true);
        expect(state.runs[0].Status).toBe('Completed');
        expect(state.runs[0].FinalStep).toBe('Success');
        expect(res.payload).toEqual({
            initial: 1,
            stage: 'post-skill',
            subAgentDone: true,
            echo: 'Check result 42',
            done: true,
        });

        // Skill activation stamped ActiveSkillIDs onto the subsequent action
        expect(state.actionCalls).toHaveLength(1);
        expect(state.actionCalls[0].activeSkillIDs).toEqual([SKILL_ID]);
        expect(state.actionCalls[0].contextUserID).toBe(USER_ID);

        // Sub-agent received the invoking contextUser
        expect(agent.SubAgentCalls).toEqual([{ name: 'Pinning Sub Agent', userID: USER_ID }]);

        // Step sequence includes Validation, Skill, Actions, Sub-Agent, Prompt
        const stepTypes = state.steps.map((s) => s.StepType);
        expect(stepTypes).toContain('Validation');
        expect(stepTypes).toContain('Skill');
        expect(stepTypes).toContain('Actions');
        expect(stepTypes).toContain('Sub-Agent');
    });

    it('2. LoopAgentType: TaskGraph submission parks run in Paused and records TaskGraph step', async () => {
        const submitted: TaskGraphSubmitRequest[] = [];
        class MockSubmitter extends TaskGraphSubmitter {
            public override get EnforcesSecurityEnvelope(): boolean {
                return true;
            }
            public override async Submit(req: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome> {
                submitted.push(req);
                return {
                    Success: true,
                    ParentTaskID: '99999999-0000-4000-8000-000000000001',
                    ChildTaskIDs: ['99999999-0000-4000-8000-000000000002'],
                };
            }
        }
        RegisterTaskGraphSubmitter(new MockSubmitter());

        state.loopAgent.AgentTypePromptParams = JSON.stringify({ enableTaskGraphs: true });
        const agent = new PinningBaseAgent();
        wirePromptRunner(agent, [
            () => envelope({
                taskComplete: false,
                nextStep: {
                    type: 'Tasks',
                    tasks: {
                        workflowName: 'Pinning DAG',
                        continuation: 'none',
                        tasks: [{ tempId: 't1', name: 'Compute', description: 'Run action', kind: 'Action', dependsOn: [], configuration: { actionName: ACTION_NAME } }],
                    },
                },
            }),
        ]);

        const res = await agent.Execute(baseParams(state.loopAgent));
        expect(submitted).toHaveLength(1);
        expect(submitted[0].Spec.workflowName).toBe('Pinning DAG');
        expect(state.steps.some((s) => s.StepType === 'TaskGraph')).toBe(true);
        expect(res.agentRun.Status).toBe('Paused');
    });

    it('3. LoopAgentType: Handoff validates target agent and returns handoffRequest', async () => {
        state.loopAgent.AgentTypePromptParams = JSON.stringify({ enableHandoff: true });
        const agent = new PinningBaseAgent();
        wirePromptRunner(agent, [
            () => envelope({
                taskComplete: false,
                nextStep: {
                    type: 'Handoff',
                    handoff: {
                        agentName: 'Specialist Handoff Agent',
                        brief: 'Handle specialist request',
                        reason: 'Requires specialist domain',
                    },
                },
            }),
        ]);

        const res = await agent.Execute(
            baseParams(state.loopAgent, {
                conversationDetailId: '99999999-1111-4000-8000-000000000001',
                handoffChain: [],
            }),
        );
        expect(res.agentRun.ErrorMessage).toBeFalsy();
        expect(res.success).toBe(true);
        expect(res.handoff?.targetAgentId).toBe(HANDOFF_AGENT_ID);
        expect(res.handoff?.brief).toBe('Handle specialist request');
        expect(state.steps.some((s) => s.StepType === 'Handoff')).toBe(true);
    });

    it('4. LoopAgentType: MaxIterationsPerRun guardrail & cooperative non-destructive pause', async () => {
        // 4a. MaxIterationsPerRun = 1 trips when prompt asks for a 2nd step
        state.loopAgent.MaxIterationsPerRun = 1;
        const limitedAgent = new PinningBaseAgent();
        wirePromptRunner(limitedAgent, [
            () => envelope({
                taskComplete: false,
                nextStep: { type: 'Actions', actions: [{ name: ACTION_NAME, params: { value: 5 } }] },
            }),
            () => envelope({ taskComplete: true, message: 'Should not reach iteration 2' }),
        ]);

        const limitedRes = await limitedAgent.Execute(baseParams(state.loopAgent));
        expect(limitedRes.success).toBe(false);
        expect(state.runs[0].Status).toBe('Failed');
        expect(state.runs[0].ErrorMessage ?? '').toMatch(/iteration/i);

        // 4b. Cooperative pause signal via ActiveRunGovernanceRegistry pauses non-destructively with checkpoint
        state.loopAgent.MaxIterationsPerRun = 10;
        const pausedAgent = new PinningBaseAgent();
        wirePromptRunner(pausedAgent, [
            () => {
                const activeRun = state.runs.at(-1)!;
                ActiveRunGovernanceRegistry.Instance.RequestCooperativePause(
                    activeRun.ID,
                    'Pinning test cooperative pause',
                    state.provider as unknown as IMetadataProvider,
                );
                activeRun.Data = AttachCooperativePauseRequestToRunData(activeRun.Data, {
                    RequestedAt: new Date().toISOString(),
                    RequestedByUserID: USER_ID,
                    Reason: 'Pinning test cooperative pause',
                });
                return envelope({
                    taskComplete: false,
                    nextStep: { type: 'Actions', actions: [{ name: ACTION_NAME, params: { value: 3 } }] },
                });
            },
            () => envelope({ taskComplete: true, message: 'Resumed finish' }),
        ]);

        const pausedRes = await pausedAgent.Execute(baseParams(state.loopAgent));
        expect(pausedRes.agentRun.Status).toBe('Paused');
    });

    it('5. FlowAgentType (inRun mode): traverses Prompt -> Action -> conditional edge -> Prompt with payload mapping', async () => {
        const agent = new PinningBaseAgent();
        wirePromptRunner(agent, [
            () => ({
                success: true,
                result: JSON.stringify({ seed: 21 }),
                chatResult: {} as AIPromptRunResult['chatResult'],
            }),
            () => ({
                success: true,
                result: JSON.stringify({ summary: 'Flow saw computed=42' }),
                chatResult: {} as AIPromptRunResult['chatResult'],
            }),
        ]);

        // Passing parentRun triggers FlowAgentType's synchronous inRun walker (same as sub-agent calls)
        const res = await agent.Execute(
            baseParams(state.flowAgent, {
                payload: { seed: 21 },
                parentRun: { ID: '90000000-0000-4000-8000-000000000099' } as unknown as MJAIAgentRunEntityExtended,
            }),
        );

        expect(res.agentRun.ErrorMessage).toBeFalsy();
        expect(res.success).toBe(true);
        expect(state.runs[0].Status).toBe('Completed');
        expect(state.actionCalls).toHaveLength(1);
        expect(state.actionCalls[0].actionName).toBe(ACTION_NAME);
        expect((res.payload as Record<string, unknown>).computed).toBe(42);
        const stepTypes = state.steps.map((s) => s.StepType);
        expect(stepTypes).toContain('Prompt');
        expect(stepTypes).toContain('Actions');
        // Verify real FlowAgentType class is registered
        expect(FlowAgentType).toBeDefined();
    });

    it('6. HarnessAgentType + BaseAgent subclass: preserves virtual hook ordering and super.* dispatch', async () => {
        const harnessSub = new PinningHarnessSubclass();
        wirePromptRunner(harnessSub, [
            () => envelope({
                taskComplete: true,
                message: 'Harness turn complete',
                payloadChangeRequest: { newElements: { harnessRan: true } },
            }),
        ]);

        const res = await harnessSub.Execute(baseParams(state.harnessAgent, { payload: {} }));
        expect(res.agentRun.ErrorMessage).toBeFalsy();
        expect(res.success).toBe(true);
        expect(res.payload).toEqual({ harnessRan: true });
        expect(harnessSub.HookTrace).toEqual([
            'validateAgent',
            'preparePromptParams',
            'executePrompt',
            'determineNextStep',
            'validateSuccessNextStep',
            'finalizeRun:success',
        ]);
    });

    it('7. RealtimeAgentType: drives full BaseAgent.Execute() -> RealtimeSessionRunner -> transcripts & usage -> finalize', async () => {
        const rtAgent = new PinningRealtimeAgent();
        const abortController = new AbortController();
        // Close the duplex session shortly after the mock emits transcripts + usage
        setTimeout(() => abortController.abort('pinning-session-complete'), 40);

        const res = await rtAgent.Execute(
            baseParams(state.realtimeAgent, {
                cancellationToken: abortController.signal,
                data: { conversationId: 'conv-pin-1' },
                agentSessionID: 'sess-pin-1',
            }),
        );

        expect(res.agentRun.ErrorMessage).toBeFalsy();
        expect(rtAgent.Model.Session.Closed).toBe(true);
        expect(state.runs).toHaveLength(1);
        expect(state.promptRuns).toHaveLength(1);
        // Both user and assistant transcripts were persisted as ConversationDetail rows
        const persistedMessages = [...state.detailStore.values()].map((d) => `${d.Role}:${d.Message}`).sort();
        expect(persistedMessages).toEqual(['AI:Hi! Ready to help.', 'User:Hello co-agent']);
        // Run finalized cleanly without throwing
        expect(res.agentRun).toBeDefined();
    });
});
