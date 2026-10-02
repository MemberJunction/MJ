/**
 * Flow agent execution mode (#4555): which engine runs a Flow agent, and whether its caller gets
 * the result.
 *
 * Since #3692 a Flow agent compiles to a task graph and the durable dispatcher runs it. The run
 * returns before any step has executed, so a Flow agent could no longer be a sub-agent or answer a
 * synchronous caller. The fix routes a run that needs its result through the in-run walker and
 * keeps dispatch as the default for a top-level run.
 *
 * These tests drive the REAL BaseAgent loop and the REAL FlowAgentType over an in-memory flow
 * shaped like Skip's Conductor: three Sub-Agent steps chained on `stepResult.success`, each with a
 * failure branch, ending in one of two Prompt steps. Only package boundaries are faked: the prompt
 * runner, the sub-agent call, the task-graph submitter, and entity persistence.
 *
 * The first scenario is the one that matters most. Routing only `DetermineInitialStep` would run
 * the first sub-agent and then end the run with Success, because BaseAgent falls through to
 * `HandleStepFallback` when `PreProcessNextStep` returns null. A test that stopped after one step
 * would pass on that broken build.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { FlowAgentType, FlowExecutionState, type FlowAgentExecuteParams } from '../agent-types/flow-agent-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import {
    TaskGraphSubmitter,
    TASK_GRAPH_SUBMITTER_KEY,
    type AgentSubAgentRequest,
    type AIPromptParams,
    type AIPromptRunResult,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type TaskGraphSubmitOutcome,
    type TaskGraphSubmitRequest,
} from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentStepEntity } from '@memberjunction/core-entities';

// ============================================================================
// Module mocks (boundaries only)
// ============================================================================

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    LogErrorEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return harness.engineInstance;
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: {
        get Instance() {
            return { Config: async (): Promise<void> => undefined, Actions: [] };
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: async (): Promise<boolean> => true,
    },
}));

// ============================================================================
// Fixture: a flow shaped like Skip's Conductor
// ============================================================================

const FLOW_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const FLOW_TYPE_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SUCCESS_PROMPT_ID = 'bbbbbbbb-0000-4000-8000-000000000003';
const FAILURE_PROMPT_ID = 'bbbbbbbb-0000-4000-8000-000000000004';
const USER_ID = 'bbbbbbbb-0000-4000-8000-000000000005';
const STORAGE_ACCOUNT_ID = 'bbbbbbbb-0000-4000-8000-000000000006';
const PARENT_RUN_ID = 'bbbbbbbb-0000-4000-8000-000000000007';

const SUB_AGENTS = {
    requirements: { id: 'bbbbbbbb-1000-4000-8000-000000000001', name: 'Requirements Expert' },
    dataExpert: { id: 'bbbbbbbb-1000-4000-8000-000000000002', name: 'Data Expert' },
    tpm: { id: 'bbbbbbbb-1000-4000-8000-000000000003', name: 'Technical Product Manager' },
} as const;

type SubAgentName = (typeof SUB_AGENTS)[keyof typeof SUB_AGENTS]['name'];

/** The AIAgentStep fields the walker and the compiler read. */
interface StepRow {
    ID: string;
    AgentID: string;
    Name: string;
    Description: string | null;
    StepType: 'Sub-Agent' | 'Prompt';
    StartingStep: boolean;
    Status: 'Active';
    SubAgentID: string | null;
    PromptID: string | null;
    ActionID: null;
    ActionInputMapping: null;
    ActionOutputMapping: null;
    Configuration: null;
    LoopBodyType: null;
    PositionX: number;
    PositionY: number;
}

/** The AIAgentStepPath fields the walker and the compiler read. */
interface PathRow {
    ID: string;
    OriginStepID: string;
    DestinationStepID: string;
    Condition: string | null;
    Priority: number;
    Description: string | null;
}

const STEP_IDS = {
    requirements: 'bbbbbbbb-2000-4000-8000-000000000001',
    dataExpert: 'bbbbbbbb-2000-4000-8000-000000000002',
    tpm: 'bbbbbbbb-2000-4000-8000-000000000003',
    successFinal: 'bbbbbbbb-2000-4000-8000-000000000004',
    failureFinal: 'bbbbbbbb-2000-4000-8000-000000000005',
} as const;

function subAgentStep(id: string, name: string, subAgentId: string, starting: boolean): StepRow {
    return {
        ID: id, AgentID: FLOW_ID, Name: name, Description: `Run ${name}`, StepType: 'Sub-Agent',
        StartingStep: starting, Status: 'Active', SubAgentID: subAgentId, PromptID: null, ActionID: null,
        ActionInputMapping: null, ActionOutputMapping: null, Configuration: null, LoopBodyType: null,
        PositionX: 0, PositionY: 0,
    };
}

function promptStep(id: string, name: string, promptId: string): StepRow {
    return {
        ...subAgentStep(id, name, '', false),
        StepType: 'Prompt', SubAgentID: null, PromptID: promptId,
    };
}

const STEPS: StepRow[] = [
    subAgentStep(STEP_IDS.requirements, 'Requirements', SUB_AGENTS.requirements.id, true),
    subAgentStep(STEP_IDS.dataExpert, 'Data Expert', SUB_AGENTS.dataExpert.id, false),
    subAgentStep(STEP_IDS.tpm, 'Technical Product Manager', SUB_AGENTS.tpm.id, false),
    promptStep(STEP_IDS.successFinal, 'Success Finalization', SUCCESS_PROMPT_ID),
    promptStep(STEP_IDS.failureFinal, 'Failure Finalization', FAILURE_PROMPT_ID),
];

/** Each Sub-Agent step goes on when it succeeded and to Failure Finalization when it did not. */
function successFork(origin: string, onSuccess: string, seq: number): PathRow[] {
    return [
        { ID: `bbbbbbbb-3000-4000-8000-00000000000${seq}`, OriginStepID: origin, DestinationStepID: onSuccess, Condition: 'stepResult.success', Priority: 0, Description: null },
        { ID: `bbbbbbbb-3000-4000-8000-00000000010${seq}`, OriginStepID: origin, DestinationStepID: STEP_IDS.failureFinal, Condition: '!stepResult.success', Priority: 0, Description: null },
    ];
}

const PATHS: PathRow[] = [
    ...successFork(STEP_IDS.requirements, STEP_IDS.dataExpert, 1),
    ...successFork(STEP_IDS.dataExpert, STEP_IDS.tpm, 2),
    ...successFork(STEP_IDS.tpm, STEP_IDS.successFinal, 3),
];

// ============================================================================
// Persistence fakes
// ============================================================================

/** Minimal run-step stand-in: plain assignable fields plus Save/NewRecord. */
class FakeStep {
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
    public PayloadAtEnd: string | null = null;
    public Skills: string | null = null;

    constructor(private readonly seq: number) {}

    public NewRecord(): void {
        this.ID = `bbbbbbbb-4000-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        return true;
    }
}

/** Minimal agent-run stand-in: the fields the loop and finalization write. */
class FakeRun {
    public ID = 'bbbbbbbb-5000-4000-8000-000000000001';
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
    public Steps: FakeStep[] = [];

    public async Save(): Promise<boolean> {
        return true;
    }
}

// ============================================================================
// Harness
// ============================================================================

class FlowHarness {
    public runs: FakeRun[] = [];
    public steps: FakeStep[] = [];
    public submissions: TaskGraphSubmitRequest[] = [];
    public readonly agent = makeFlowAgentRow();
    private stepSeq = 0;

    public get engineInstance(): Record<string, unknown> {
        const subAgentRows = Object.values(SUB_AGENTS).map((s) => ({
            ID: s.id, Name: s.name, ParentID: FLOW_ID, Status: 'Active', Description: s.name,
            ExposeAsAction: false, PayloadDownstreamPaths: '["*"]', PayloadUpstreamPaths: '["*"]',
        }));
        return {
            Config: async (): Promise<void> => undefined,
            Agents: subAgentRows,
            AgentRelationships: [],
            AgentCategories: [],
            ScopedPromptParts: [],
            ScopedPromptConfigs: [],
            AgentTypes: [{
                ID: FLOW_TYPE_ID, Name: 'Flow', DriverClass: 'FlowAgentType', SystemPromptID: null,
                AgentPromptPlaceholder: null, PromptParamsSchema: null, DefaultStorageAccountID: null,
            }],
            Prompts: [
                { ID: SUCCESS_PROMPT_ID, Name: 'Success Finalization Prompt', EffortLevel: null },
                { ID: FAILURE_PROMPT_ID, Name: 'Failure Finalization Prompt', EffortLevel: null },
            ],
            AgentPrompts: [],
            AgentActions: [],
            GetSubAgents: (): unknown[] => subAgentRows,
            GetAutoActivatableSkillsForAgent: (): unknown[] => [],
            GetSkillsForAgent: (): unknown[] => [],
            GetClientToolsForAgent: (): unknown[] => [],
            GetAgentBaseCatalog: (): unknown => undefined,
            SetAgentBaseCatalog: (): void => undefined,
            GetAgentSteps: (agentId: string, status?: string): StepRow[] =>
                STEPS.filter((s) => s.AgentID === agentId && (!status || s.Status === status)),
            GetAgentStepByID: (id: string): StepRow | null => STEPS.find((s) => s.ID === id) ?? null,
            GetPathsFromStep: (id: string): PathRow[] => PATHS.filter((p) => p.OriginStepID === id),
        };
    }

    public readonly provider = {
        GetEntityObject: async (entityName: string): Promise<FakeRun | FakeStep> => {
            if (entityName === 'MJ: AI Agent Runs') {
                const run = new FakeRun();
                this.runs.push(run);
                return run;
            }
            if (entityName === 'MJ: AI Agent Run Steps') {
                const step = new FakeStep(++this.stepSeq);
                this.steps.push(step);
                return step;
            }
            throw new Error(`FlowHarness: unexpected GetEntityObject('${entityName}')`);
        },
    };

    public get run(): FakeRun {
        expect(this.runs).toHaveLength(1);
        return this.runs[0];
    }

    /** The routing decision BaseAgent recorded, parsed from its step. */
    public get routingStep(): { name: string; output: Record<string, string> } {
        const decision = this.steps.find((s) => s.StepType === 'Decision' && s.StepName.startsWith('Workflow runs'));
        expect(decision, 'a Decision step recording the execution mode').toBeDefined();
        return { name: decision!.StepName, output: JSON.parse(decision!.OutputData ?? '{}') };
    }
}

function makeFlowAgentRow(): Record<string, string | number | boolean | null> {
    return {
        ID: FLOW_ID, Name: 'Test Conductor', Description: 'Skip-shaped flow', Status: 'Active',
        TypeID: FLOW_TYPE_ID, DriverClass: null, Parent: null, ParentID: null,
        DefaultStorageAccountID: STORAGE_ACCOUNT_ID, CategoryID: null, ModelSelectionMode: 'Agent Type',
        DefaultPromptEffortLevel: null, ScopeConfig: null, PayloadSelfReadPaths: null,
        PayloadSelfWritePaths: null, PayloadScope: null, AllowMemoryWrite: false, ChatHandlingOption: null,
        FinalPayloadValidation: null, StartingPayloadValidation: null, InjectNotes: false,
        InjectExamples: false, RequirePlanMode: false, SupportsPlanMode: false, MaxCostPerRun: null,
        MaxTokensPerRun: null, MaxTimePerRun: null, MaxIterationsPerRun: null,
        AgentTypePromptParams: null, OwnerUserID: null,
    };
}

let harness: FlowHarness;

/** Records every submission, so a test can prove a graph was (or was not) handed to the dispatcher. */
@RegisterClass(TaskGraphSubmitter, TASK_GRAPH_SUBMITTER_KEY, 1000)
export class RecordingSubmitter extends TaskGraphSubmitter {
    public async Submit(request: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome> {
        harness.submissions.push(request);
        return { Success: true, ParentTaskID: 'bbbbbbbb-6000-4000-8000-000000000001' };
    }
}

/** Real BaseAgent. Only the sub-agent call and the search-RAG boundary are replaced. */
class FlowTestAgent extends BaseAgent {
    public readonly SubAgentCalls: SubAgentName[] = [];

    constructor(private readonly failingSubAgent: SubAgentName | null = null) {
        super();
    }

    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    protected override async ExecuteSubAgent<SC, SR>(
        _params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        _subAgent: MJAIAgentEntityExtended,
        _stepEntity: unknown,
        payload?: SR,
    ): Promise<ExecuteAgentResult<SR>> {
        const name = subAgentRequest.name as SubAgentName;
        this.SubAgentCalls.push(name);
        const success = name !== this.failingSubAgent;
        const agentRun = {
            ID: `run-${name}`, FinalStep: success ? 'Success' : 'Failed',
            ErrorMessage: success ? null : `${name} failed`, Steps: [],
        } as unknown as MJAIAgentRunEntityExtended;
        const visited = { ...(payload ?? {}), [`visited ${name}`]: true } as SR;
        return { success, payload: visited, agentRun };
    }
}

/** Scripted LLM boundary: records which prompt ran and returns a JSON object to merge. */
class ScriptedPromptRunner {
    public readonly PromptIDs: string[] = [];

    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        this.PromptIDs.push(params.prompt.ID);
        const outcome = params.prompt.ID === SUCCESS_PROMPT_ID ? 'finalized' : 'reported failure';
        return {
            success: true,
            result: JSON.stringify({ finalization: outcome }),
            chatResult: {} as AIPromptRunResult['chatResult'],
        };
    }
}

function makeAgent(failingSubAgent: SubAgentName | null = null): { agent: FlowTestAgent; prompts: ScriptedPromptRunner } {
    const agent = new FlowTestAgent(failingSubAgent);
    const prompts = new ScriptedPromptRunner();
    (agent as unknown as { _promptRunner: ScriptedPromptRunner })._promptRunner = prompts;
    return { agent, prompts };
}

function makeParams(overrides: Partial<ExecuteAgentParams<unknown, unknown, FlowAgentExecuteParams>> = {}): ExecuteAgentParams {
    return {
        agent: harness.agent as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'Build me a dashboard' }],
        contextUser: { ID: USER_ID, Name: 'Flow Tester', Email: 'flow@test.mj' } as unknown as UserInfo,
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
        payload: {},
        ...overrides,
    } as ExecuteAgentParams;
}

/** What a sub-agent run looks like to the flow: a parent run it reports back to. */
const PARENT_RUN = { ID: PARENT_RUN_ID, RootParentRunID: null, Steps: [] } as unknown as MJAIAgentRunEntityExtended;

function stepAt(name: string): MJAIAgentStepEntity {
    return STEPS.find((s) => s.Name === name) as unknown as MJAIAgentStepEntity;
}

beforeEach(() => {
    harness = new FlowHarness();
});

// ============================================================================
// Full runs through BaseAgent
// ============================================================================

describe('Flow agent as a sub-agent (parentRun set)', () => {
    it('walks every step in order and returns the final payload', async () => {
        const { agent, prompts } = makeAgent();

        const result = await agent.Execute(makeParams({ parentRun: PARENT_RUN }));

        expect(agent.SubAgentCalls).toEqual(['Requirements Expert', 'Data Expert', 'Technical Product Manager']);
        expect(prompts.PromptIDs).toEqual([SUCCESS_PROMPT_ID]);
        expect(result.success).toBe(true);
        expect(result.payload).toMatchObject({
            'visited Requirements Expert': true,
            'visited Data Expert': true,
            'visited Technical Product Manager': true,
            finalization: 'finalized',
        });
        expect(harness.run.Status).toBe('Completed');
        expect(harness.submissions).toHaveLength(0);
    });

    it('records the in-run decision and why on the run', async () => {
        const { agent } = makeAgent();

        await agent.Execute(makeParams({ parentRun: PARENT_RUN }));

        const routing = harness.routingStep;
        expect(routing.name).toBe('Workflow runs in this run');
        expect(routing.output.executionMode).toBe('inRun');
        expect(routing.output.reason).toContain('sub-agent');
        const stepTypes = harness.steps.map((s) => s.StepType);
        expect(stepTypes.indexOf('Decision')).toBeLessThan(stepTypes.indexOf('Sub-Agent'));
    });

    it('follows the failure branch when a sub-agent fails', async () => {
        const { agent, prompts } = makeAgent('Data Expert');

        const result = await agent.Execute(makeParams({ parentRun: PARENT_RUN }));

        expect(agent.SubAgentCalls).toEqual(['Requirements Expert', 'Data Expert']);
        expect(prompts.PromptIDs).toEqual([FAILURE_PROMPT_ID]);
        expect(result.payload).toMatchObject({ finalization: 'reported failure' });
    });

    it('honours startAtStep, which approval resumes rely on', async () => {
        const { agent, prompts } = makeAgent();
        const agentTypeParams: FlowAgentExecuteParams = { startAtStep: stepAt('Technical Product Manager') };

        const result = await agent.Execute(makeParams({ parentRun: PARENT_RUN, agentTypeParams }));

        expect(agent.SubAgentCalls).toEqual(['Technical Product Manager']);
        expect(prompts.PromptIDs).toEqual([SUCCESS_PROMPT_ID]);
        expect(result.success).toBe(true);
    });

    it("refuses an explicit 'dispatch', which would return before the work ran", async () => {
        const { agent } = makeAgent();
        const agentTypeParams: FlowAgentExecuteParams = { executionMode: 'dispatch' };

        const result = await agent.Execute(makeParams({ parentRun: PARENT_RUN, agentTypeParams }));

        expect(result.success).toBe(false);
        expect(harness.run.ErrorMessage).toContain("executionMode 'dispatch'");
        expect(agent.SubAgentCalls).toHaveLength(0);
        expect(harness.submissions).toHaveLength(0);
    });
});

describe('Top-level Flow agent', () => {
    it('is dispatched by default and does not walk any step itself', async () => {
        const { agent, prompts } = makeAgent();

        const result = await agent.Execute(makeParams());

        expect(harness.submissions).toHaveLength(1);
        expect(harness.submissions[0].Spec.tasks.length).toBeGreaterThan(0);
        expect(agent.SubAgentCalls).toHaveLength(0);
        expect(prompts.PromptIDs).toHaveLength(0);
        expect(result.success).toBe(true);
        expect(harness.run.Status).toBe('Paused');

        const routing = harness.routingStep;
        expect(routing.name).toBe('Workflow runs on the task-graph dispatcher');
        expect(routing.output).toMatchObject({ executionMode: 'dispatch', reason: 'default for a top-level run' });
    });

    it("runs in-process and returns the payload with executionMode 'inRun'", async () => {
        const { agent, prompts } = makeAgent();
        const agentTypeParams: FlowAgentExecuteParams = { executionMode: 'inRun' };

        const result = await agent.Execute(makeParams({ agentTypeParams }));

        expect(agent.SubAgentCalls).toEqual(['Requirements Expert', 'Data Expert', 'Technical Product Manager']);
        expect(prompts.PromptIDs).toEqual([SUCCESS_PROMPT_ID]);
        expect(result.payload).toMatchObject({ finalization: 'finalized' });
        expect(harness.run.Status).toBe('Completed');
        expect(harness.submissions).toHaveLength(0);
        expect(harness.routingStep.output).toMatchObject({ executionMode: 'inRun', reason: 'requested by the caller' });
    });

    it('still refuses startAtStep when dispatched, and says how to get it', async () => {
        const { agent } = makeAgent();
        const agentTypeParams: FlowAgentExecuteParams = { startAtStep: stepAt('Data Expert') };

        const result = await agent.Execute(makeParams({ agentTypeParams }));

        expect(result.success).toBe(false);
        expect(harness.run.ErrorMessage).toContain("executionMode to 'inRun'");
        expect(harness.submissions).toHaveLength(0);
    });
});

// ============================================================================
// The safety net: a dispatched run never reaches the walker
// ============================================================================

describe('FlowAgentType hooks in dispatch mode', () => {
    const flowType = new FlowAgentType();

    function dispatchedState(): FlowExecutionState {
        const state = new FlowExecutionState(FLOW_ID);
        state.executionMode = 'dispatch';
        state.executionModeReason = 'default for a top-level run';
        state.currentStepId = STEP_IDS.requirements;
        return state;
    }

    it('DetermineNextStep refuses with a legible Failed step', async () => {
        const next = await flowType.DetermineNextStep(null, makeParams(), {}, dispatchedState());

        expect(next.step).toBe('Failed');
        expect(next.errorMessage).toContain('reached by a dispatched run');
    });

    it('PreProcessNextStep lets the post-submission Success through untouched', async () => {
        const success = { step: 'Success' as const, terminate: true };

        const next = await flowType.PreProcessNextStep(makeParams(), success, {}, dispatchedState());

        expect(next).toBeNull();
    });

    it('defaults a fresh state to dispatch, with nothing to record until a decision is made', () => {
        const state = new FlowExecutionState(FLOW_ID);

        expect(state.executionMode).toBe('dispatch');
        expect(flowType.DescribeExecutionRouting(state)).toBeNull();
    });
});
