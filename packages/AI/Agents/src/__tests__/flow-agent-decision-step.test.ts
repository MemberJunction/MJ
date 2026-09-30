/**
 * A Flow agent's Decision step, walked in-run and compiled for dispatch (plan Task 4.3, the Flow part).
 *
 * These drive the REAL BaseAgent loop and the REAL FlowAgentType over in-memory flows. Only package
 * boundaries are faked: the decision call (`AgentDecisionService.Ask`), the sub-agent call, the
 * task-graph submitter, and entity persistence. So a Decision step here really is handed to
 * BaseAgent's own decision execution, and really is logged as a `Decision` run step.
 *
 * The hold tests are the ones that matter. A condition reading an answer that is not usable must
 * never be evaluated, because `undefined === 'billing'` is a confident, wrong `false` — so a flow
 * whose top-ranked path reads such an answer stops with the reason rather than taking another path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { AgentDecisionService, type AgentDecisionAskParams } from '../AgentDecisionService';
import type { FlowAgentExecuteParams } from '../agent-types/flow-agent-type';
// Loaded for its @RegisterClass: BaseAgent resolves the Flow agent type by driver class name.
import '../agent-types/flow-agent-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import {
    TaskGraphSubmitter,
    TASK_GRAPH_SUBMITTER_KEY,
    NormalizeDependency,
    type AgentSubAgentRequest,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type FlowDecisionStepConfiguration,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type TaskGraphSubmitOutcome,
    type TaskGraphSubmitRequest,
} from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { DecisionAnswer } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo, type IMetadataProvider } from '@memberjunction/core';
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
// Fixture
// ============================================================================

const FLOW_ID = 'cccccccc-0000-4000-8000-000000000001';
const FLOW_TYPE_ID = 'cccccccc-0000-4000-8000-000000000002';
const USER_ID = 'cccccccc-0000-4000-8000-000000000003';
const STORAGE_ACCOUNT_ID = 'cccccccc-0000-4000-8000-000000000004';
const TRIAGE_PROMPT_ID = 'cccccccc-0000-4000-8000-000000000005';
const TRIAGE_STEP_ID = 'cccccccc-1000-4000-8000-000000000001';

/** The AIAgentStep fields the walker and the compiler read. */
interface StepRow {
    ID: string;
    AgentID: string;
    Name: string;
    Description: string | null;
    StepType: MJAIAgentStepEntity['StepType'];
    StartingStep: boolean;
    Status: MJAIAgentStepEntity['Status'];
    SubAgentID: string | null;
    PromptID: string | null;
    ActionID: null;
    ActionInputMapping: null;
    ActionOutputMapping: null;
    Configuration: string | null;
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

const TRIAGE: FlowDecisionStepConfiguration = {
    key: 'triage',
    state: 'payload.ticket',
    questions: {
        intent: {
            kind: 'Choice',
            instructions: 'Which team should handle this ticket?',
            options: [
                { value: 'billing', description: 'A question about an invoice or a charge.' },
                { value: 'refund', description: 'A request for money back.' },
                { value: 'other', description: 'Anything else.' },
            ],
            minConfidence: 0.7,
        },
        urgent: { kind: 'Likelihood', instructions: 'The customer cannot work until this is fixed.', minConfidence: 0.8 },
    },
};

/** Sub-agents a flow step can hand to, by the name a test refers to them by. */
const SUB_AGENTS = ['Billing', 'Refund', 'Other', 'Escalate', 'Queue', 'VIP', 'Gather', 'Recover'] as const;
type SubAgentName = (typeof SUB_AGENTS)[number];
const subAgentID = (name: SubAgentName): string => `cccccccc-2000-4000-8000-${String(SUB_AGENTS.indexOf(name) + 1).padStart(12, '0')}`;
const stepID = (name: SubAgentName): string => `cccccccc-3000-4000-8000-${String(SUB_AGENTS.indexOf(name) + 1).padStart(12, '0')}`;

function triageStep(over: Partial<StepRow> = {}): StepRow {
    return {
        ID: TRIAGE_STEP_ID, AgentID: FLOW_ID, Name: 'Triage the ticket', Description: null, StepType: 'Decision',
        StartingStep: true, Status: 'Active', SubAgentID: null, PromptID: null, ActionID: null,
        ActionInputMapping: null, ActionOutputMapping: null, Configuration: JSON.stringify(TRIAGE), LoopBodyType: null,
        PositionX: 0, PositionY: 0, ...over,
    };
}

function subAgentStep(name: SubAgentName): StepRow {
    return {
        ...triageStep(), ID: stepID(name), Name: name, Description: `Handle it: ${name}`, StepType: 'Sub-Agent',
        StartingStep: false, SubAgentID: subAgentID(name), Configuration: null,
    };
}

let pathSeq = 0;
function path(from: string, to: string, condition: string | null, priority = 0): PathRow {
    return {
        ID: `cccccccc-4000-4000-8000-${String(++pathSeq).padStart(12, '0')}`,
        OriginStepID: from, DestinationStepID: to, Condition: condition, Priority: priority, Description: null,
    };
}

/** Triage forking on its Choice, one path per option. */
function intentFork(): PathRow[] {
    return [
        path(TRIAGE_STEP_ID, stepID('Billing'), "decisions.triage.intent.value === 'billing'", 3),
        path(TRIAGE_STEP_ID, stepID('Refund'), "decisions.triage.intent.value === 'refund'", 2),
        path(TRIAGE_STEP_ID, stepID('Other'), "decisions.triage.intent.value === 'other'", 1),
    ];
}

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
        this.ID = `cccccccc-5000-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        return true;
    }
}

/** Minimal agent-run stand-in: the fields the loop and finalization write. */
class FakeRun {
    public ID = 'cccccccc-6000-4000-8000-000000000001';
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

class DecisionFlowHarness {
    public runs: FakeRun[] = [];
    public runSteps: FakeStep[] = [];
    public submissions: TaskGraphSubmitRequest[] = [];
    public steps: StepRow[] = [];
    public paths: PathRow[] = [];
    public readonly agent = makeFlowAgentRow();
    private stepSeq = 0;

    public get engineInstance(): Record<string, unknown> {
        const subAgentRows = SUB_AGENTS.map((name) => ({
            ID: subAgentID(name), Name: `${name} Agent`, ParentID: FLOW_ID, Status: 'Active', Description: name,
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
            Prompts: [{ ID: TRIAGE_PROMPT_ID, Name: 'Triage Decision', EffortLevel: null }],
            AgentPrompts: [],
            AgentActions: [],
            GetSubAgents: (): unknown[] => subAgentRows,
            GetAutoActivatableSkillsForAgent: (): unknown[] => [],
            GetSkillsForAgent: (): unknown[] => [],
            GetClientToolsForAgent: (): unknown[] => [],
            GetAgentBaseCatalog: (): unknown => undefined,
            SetAgentBaseCatalog: (): void => undefined,
            GetAgentSteps: (agentId: string, status?: string): StepRow[] =>
                this.steps.filter((s) => s.AgentID === agentId && (!status || s.Status === status)),
            GetAgentStepByID: (id: string): StepRow | null => this.steps.find((s) => s.ID === id) ?? null,
            GetPathsFromStep: (id: string): PathRow[] => this.paths.filter((p) => p.OriginStepID === id),
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
                this.runSteps.push(step);
                return step;
            }
            throw new Error(`DecisionFlowHarness: unexpected GetEntityObject('${entityName}')`);
        },
    };

    public get run(): FakeRun {
        expect(this.runs).toHaveLength(1);
        return this.runs[0];
    }

    /** The run steps a Decision step logged — not the routing record, which is also a `Decision`. */
    public get decisionRunSteps(): FakeStep[] {
        return this.runSteps.filter((s) => s.StepType === 'Decision' && s.StepName.startsWith('Decision: '));
    }
}

function makeFlowAgentRow(): Record<string, string | number | boolean | null> {
    return {
        ID: FLOW_ID, Name: 'Support Triage', Description: 'Routes tickets', Status: 'Active',
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

let harness: DecisionFlowHarness;

/** Records every submission, so a test can prove a graph was (or was not) handed to the dispatcher. */
@RegisterClass(TaskGraphSubmitter, TASK_GRAPH_SUBMITTER_KEY, 1000)
export class RecordingDecisionSubmitter extends TaskGraphSubmitter {
    public async Submit(request: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome> {
        harness.submissions.push(request);
        return { Success: true, ParentTaskID: 'cccccccc-7000-4000-8000-000000000001' };
    }
}

/** The decision call, scripted: records what it was asked and answers as told. */
class ScriptedDecisionService extends AgentDecisionService {
    public readonly Calls: AgentDecisionAskParams[] = [];

    constructor(private readonly result: AIDecisionRunResult) {
        super();
    }

    public override async Ask(args: AgentDecisionAskParams): Promise<AIDecisionRunResult> {
        this.Calls.push(args);
        return this.result;
    }
}

/** Real BaseAgent. Only the sub-agent call, the search-RAG boundary and the decision call are replaced. */
class DecisionFlowAgent extends BaseAgent {
    public readonly SubAgentCalls: string[] = [];

    constructor(public readonly Decisions: ScriptedDecisionService) {
        super();
        this._agentDecisionService = Decisions;
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
        this.SubAgentCalls.push(subAgentRequest.name);
        const agentRun = { ID: `run-${subAgentRequest.name}`, FinalStep: 'Success', ErrorMessage: null, Steps: [] } as unknown as MJAIAgentRunEntityExtended;
        return { success: true, payload, agentRun };
    }
}

/** Answers from the decision model, in the typed shape `AIDecisionRunner` returns. */
function answered(intent: { value: string; confidence: number }, urgent: number): AIDecisionRunResult {
    const answers: Record<string, DecisionAnswer> = {
        intent: {
            Kind: 'Choice', Value: intent.value, Confidence: intent.confidence,
            Probabilities: { billing: 0, refund: 0, other: 0, [intent.value]: intent.confidence },
        },
        urgent: { Kind: 'Likelihood', Probability: urgent },
    };
    return { success: true, Answers: answers };
}

const FAILED_CALL: AIDecisionRunResult = { success: false, errorMessage: 'the model timed out', Answers: {} };

function makeAgent(result: AIDecisionRunResult): DecisionFlowAgent {
    return new DecisionFlowAgent(new ScriptedDecisionService(result));
}

/**
 * The seam onto BaseAgent's entity-typed parameters. The fakes carry only the fields a run reads;
 * constructing real entity objects would need a live provider.
 */
function makeParams(agentTypeParams: FlowAgentExecuteParams = { executionMode: 'inRun' }, payload: Record<string, unknown> = { ticket: 'I was charged twice' }): ExecuteAgentParams {
    return {
        agent: harness.agent as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'Route this ticket' }],
        contextUser: new UserInfo(undefined, { ID: USER_ID, Name: 'Flow Tester', Email: 'flow@test.mj' }),
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
        payload,
        agentTypeParams,
    } as ExecuteAgentParams;
}

/** A step row as the entity the flow's `skipSteps` takes. The walker reads only its ID. */
function asStepEntity(row: StepRow): MJAIAgentStepEntity {
    return row as unknown as MJAIAgentStepEntity;
}

beforeEach(() => {
    harness = new DecisionFlowHarness();
    pathSeq = 0;
});

// ============================================================================
// In-run: the walker
// ============================================================================

describe('a Decision step walked in-run', () => {
    beforeEach(() => {
        harness.steps = [triageStep(), subAgentStep('Billing'), subAgentStep('Refund'), subAgentStep('Other')];
        harness.paths = intentFork();
    });

    it("runs through BaseAgent's decision execution, once, and logs a Decision run step", async () => {
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.92 }, 0.1));

        await agent.Execute(makeParams());

        expect(agent.Decisions.Calls).toHaveLength(1);
        const call = agent.Decisions.Calls[0];
        expect(call.State).toBe('I was charged twice');
        expect(call.PromptName).toBe('Default Decision');
        expect(Object.keys(call.Questions)).toEqual(['intent', 'urgent']);

        expect(harness.decisionRunSteps).toHaveLength(1);
        const logged = harness.decisionRunSteps[0];
        expect(logged).toMatchObject({ StepName: 'Decision: triage', Success: true });
        // The answers are logged whole, distribution included, because the walker routes on them.
        expect(JSON.parse(logged.OutputData ?? '{}').answers.intent).toEqual({
            value: 'billing', confidence: 0.92, probabilities: { billing: 0.92, refund: 0, other: 0 },
        });
    });

    it('asks about the whole payload when the step names no state', async () => {
        harness.steps[0] = triageStep({ Configuration: JSON.stringify({ key: TRIAGE.key, questions: TRIAGE.questions }) });
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.92 }, 0.1));

        await agent.Execute(makeParams());

        expect(agent.Decisions.Calls[0].State).toBe(JSON.stringify({ ticket: 'I was charged twice' }, undefined, 1));
    });

    it('runs on the prompt the step names', async () => {
        harness.steps[0] = triageStep({ PromptID: TRIAGE_PROMPT_ID });
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.92 }, 0.1));

        await agent.Execute(makeParams());

        expect(agent.Decisions.Calls[0].PromptName).toBe('Triage Decision');
    });

    it('routes on a confident Choice, and writes no answers into the payload', async () => {
        const agent = makeAgent(answered({ value: 'refund', confidence: 0.88 }, 0.1));

        const result = await agent.Execute(makeParams());

        expect(agent.SubAgentCalls).toEqual(['Refund Agent']);
        expect(result.success).toBe(true);
        expect(result.payload).toEqual({ ticket: 'I was charged twice' });
    });

    it("routes on a Likelihood's probability, and a confident no is as usable as a yes", async () => {
        harness.steps = [triageStep(), subAgentStep('Escalate'), subAgentStep('Queue')];
        harness.paths = [
            path(TRIAGE_STEP_ID, stepID('Escalate'), 'decisions.triage.urgent.probability >= 0.8', 2),
            path(TRIAGE_STEP_ID, stepID('Queue'), null, 1),
        ];

        const urgent = makeAgent(answered({ value: 'billing', confidence: 0.9 }, 0.93));
        await urgent.Execute(makeParams());
        expect(urgent.SubAgentCalls).toEqual(['Escalate Agent']);

        harness.runs = [];
        const calm = makeAgent(answered({ value: 'billing', confidence: 0.9 }, 0.05));
        await calm.Execute(makeParams());
        expect(calm.SubAgentCalls).toEqual(['Queue Agent']);
    });

    it('fails the run on an answer below its minConfidence, and takes no other path', async () => {
        harness.steps.push(subAgentStep('Queue'));
        harness.paths.push(path(TRIAGE_STEP_ID, stepID('Queue'), null, 0));
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.55 }, 0.1));

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(agent.SubAgentCalls).toEqual([]);
        expect(harness.run.ErrorMessage).toContain('Step "Triage the ticket" cannot choose its next step');
        expect(harness.run.ErrorMessage).toContain('the decision "Triage the ticket" answered "intent" with confidence 0.55, below its minConfidence of 0.7');
    });

    it('fails the run when the decision call fails and no path can be taken without its answer', async () => {
        const agent = makeAgent(FAILED_CALL);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(agent.SubAgentCalls).toEqual([]);
        expect(harness.run.ErrorMessage).toContain('the decision "Triage the ticket" failed: the model timed out');
        expect(harness.decisionRunSteps[0]).toMatchObject({ Success: false, ErrorMessage: 'the model timed out' });
    });

    it('takes a recovery path ranked BELOW every path reading the failed decision — the probe', async () => {
        // The intent fork at 3/2/1 and the recovery path at 0: a walker cannot retry, so the paths that
        // read the answer that never came are passed over, not held.
        harness.steps.push(subAgentStep('Recover'));
        harness.paths.push(path(TRIAGE_STEP_ID, stepID('Recover'), 'stepResult.Success === false', 0));
        const agent = makeAgent(FAILED_CALL);

        const result = await agent.Execute(makeParams());

        expect(agent.SubAgentCalls).toEqual(['Recover Agent']);
        expect(result.success).toBe(true);
    });

    it('never evaluates a path reading the failed decision, so a negated one is not taken', async () => {
        harness.steps = [triageStep(), subAgentStep('Billing'), subAgentStep('Other'), subAgentStep('Recover')];
        harness.paths = [
            path(TRIAGE_STEP_ID, stepID('Billing'), "decisions.triage.intent.value === 'billing'", 3),
            // With no answer, `undefined !== 'billing'` is true: evaluated, this would route on nothing.
            path(TRIAGE_STEP_ID, stepID('Other'), "decisions.triage.intent.value !== 'billing'", 2),
            path(TRIAGE_STEP_ID, stepID('Recover'), 'stepResult.Success === false', 0),
        ];
        const agent = makeAgent(FAILED_CALL);

        await agent.Execute(makeParams());

        expect(agent.SubAgentCalls).toEqual(['Recover Agent']);
    });

    it('takes a recovery path that outranks every path reading the failed decision', async () => {
        harness.steps.push(subAgentStep('Recover'));
        harness.paths.push(path(TRIAGE_STEP_ID, stepID('Recover'), 'stepResult.Success === false', 9));
        const agent = makeAgent(FAILED_CALL);

        const result = await agent.Execute(makeParams());

        expect(agent.SubAgentCalls).toEqual(['Recover Agent']);
        expect(result.success).toBe(true);
    });

    it('fails the run when the Decision step was skipped, without asking anything', async () => {
        harness.steps.push(subAgentStep('Queue'));
        harness.paths.push(path(TRIAGE_STEP_ID, stepID('Queue'), null, 0));
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.92 }, 0.1));

        const result = await agent.Execute(makeParams({ executionMode: 'inRun', skipSteps: [asStepEntity(harness.steps[0])] }));

        expect(result.success).toBe(false);
        expect(agent.Decisions.Calls).toHaveLength(0);
        expect(agent.SubAgentCalls).toEqual([]);
        expect(harness.run.ErrorMessage).toContain('the decision "Triage the ticket" has not answered (it is Skipped)');
    });

    it('ignores a held path ranked below the path it takes', async () => {
        harness.steps.push(subAgentStep('VIP'));
        harness.paths.push(path(TRIAGE_STEP_ID, stepID('VIP'), 'payload.vip === true', 10));
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.55 }, 0.1));

        const result = await agent.Execute(makeParams({ executionMode: 'inRun' }, { ticket: 'I was charged twice', vip: true }));

        expect(agent.SubAgentCalls).toEqual(['VIP Agent']);
        expect(result.success).toBe(true);
    });

    it("lets a later step's path read an earlier Decision step's answer", async () => {
        harness.steps = [triageStep(), subAgentStep('Gather'), subAgentStep('Escalate'), subAgentStep('Queue')];
        harness.paths = [
            // The Decision step's own stepResult is the walker's `{ Success, step, result }`.
            path(TRIAGE_STEP_ID, stepID('Gather'), "stepResult.Success === true && stepResult.step === 'Success'"),
            path(stepID('Gather'), stepID('Escalate'), 'decisions.triage.urgent.probability >= 0.8', 2),
            path(stepID('Gather'), stepID('Queue'), null, 1),
        ];
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.9 }, 0.97));

        const result = await agent.Execute(makeParams());

        expect(agent.SubAgentCalls).toEqual(['Gather Agent', 'Escalate Agent']);
        expect(result.success).toBe(true);
    });

    it("fails the run with the reader's error when the step's configuration is bad", async () => {
        harness.steps[0] = triageStep({ Configuration: JSON.stringify({ key: 'triage', questions: {} }) });
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.92 }, 0.1));

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(agent.Decisions.Calls).toHaveLength(0);
        expect(harness.run.ErrorMessage).toContain('Decision step "Triage the ticket" cannot run: it asks no questions.');
    });

    it('refuses an incomplete Choice fork before any step runs, as the dispatched path does', async () => {
        harness.steps = [triageStep(), subAgentStep('Billing'), subAgentStep('Refund')];
        harness.paths = intentFork().slice(0, 2);
        const agent = makeAgent(answered({ value: 'other', confidence: 0.95 }, 0.1));

        const result = await agent.Execute(makeParams());

        // Walked unchecked, the model's "other" matched no path and the flow ended "successfully".
        expect(result.success).toBe(false);
        expect(agent.Decisions.Calls).toHaveLength(0);
        expect(agent.SubAgentCalls).toEqual([]);
        expect(harness.run.ErrorMessage).toContain('[IncompleteFork] Exclusive group "Triage the ticket"');
        expect(harness.run.ErrorMessage).toContain('no path for "other"');
        expect(harness.run.ErrorMessage).not.toContain(TRIAGE_STEP_ID);
    });

    it('refuses a path that reads the answers through the payload, as the dispatched path does', async () => {
        harness.paths = [
            ...intentFork(),
            path(TRIAGE_STEP_ID, stepID('Other'), "payload.decisions.triage.intent.value === 'other'", 0),
        ];
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.92 }, 0.1));

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(agent.Decisions.Calls).toHaveLength(0);
        expect(harness.run.ErrorMessage).toContain('through "payload.decisions"');
    });

    it('refuses a flow whose Decision steps share a key before any step runs', async () => {
        harness.steps.push(triageStep({ ID: 'cccccccc-1000-4000-8000-000000000002', Name: 'Triage again', StartingStep: false }));
        const agent = makeAgent(answered({ value: 'billing', confidence: 0.92 }, 0.1));

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(agent.Decisions.Calls).toHaveLength(0);
        expect(harness.run.ErrorMessage).toContain('"Triage the ticket" and "Triage again" both use the key "triage"');
    });
});

// ============================================================================
// Dispatch: the compiled graph
// ============================================================================

describe('a Decision step dispatched', () => {
    it('compiles to a Decision node whose paths name it by step ID', async () => {
        harness.steps = [triageStep(), subAgentStep('Billing'), subAgentStep('Refund'), subAgentStep('Other')];
        harness.paths = intentFork();

        const result = await makeAgent(FAILED_CALL).Execute(makeParams({}));

        expect(result.success).toBe(true);
        expect(harness.submissions).toHaveLength(1);
        const tasks = harness.submissions[0].Spec.tasks;
        expect(tasks.find((t) => t.tempId === TRIAGE_STEP_ID)?.kind).toBe('Decision');
        const billing = tasks.find((t) => t.tempId === stepID('Billing'));
        expect(billing?.dependsOn.map(NormalizeDependency)[0].condition).toBe(`decisions['${TRIAGE_STEP_ID}'].intent.value === 'billing'`);
    });

    it("refuses an incomplete Choice fork before submitting, naming the author's steps rather than their IDs", async () => {
        harness.steps = [triageStep(), subAgentStep('Billing'), subAgentStep('Refund')];
        harness.paths = intentFork().slice(0, 2);

        const result = await makeAgent(FAILED_CALL).Execute(makeParams({}));

        expect(result.success).toBe(false);
        expect(harness.submissions).toHaveLength(0);
        expect(harness.run.ErrorMessage).toContain('[IncompleteFork] Exclusive group "Triage the ticket"');
        expect(harness.run.ErrorMessage).toContain('no path for "other"');
        expect(harness.run.ErrorMessage).not.toContain(TRIAGE_STEP_ID);
    });
});
