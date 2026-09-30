/**
 * Decision discovery (plan Task 3.1), driven through the REAL BaseAgent.Execute with only the package
 * boundaries mocked, the harness recipe of agent-catalog-narrowing.test.ts: a scripted prompt runner,
 * an in-memory AIEngine / ActionEngineServer, and mock run/step entities. The decision boundary is
 * `AgentDecisionService.Ask`, spied on its prototype; the permission boundary is the
 * `AIAgentPermissionHelper` filter from ai-engine-base, faked here and tested there.
 *
 * Contract pinned:
 *   1. Off by default: no decision call, no step, and the first prompt's messages are untouched.
 *   2. On: one call per run, over the agents the user may run (rebuilt every run, minus the running
 *      agent, Sub-Agents and agents without a description), as agent IDs with their descriptions.
 *      An @mention of another agent, a follow-up turn, or fewer than three options means no call.
 *   3. A confident Choice and Likelihood put a <suggested_agent> system message first in the first
 *      prompt; a low Choice confidence, a low Likelihood, an error, a throw, an unusable answer, a
 *      timeout and a cancelled run each inject nothing. Every call is recorded as one
 *      `Agent discovery` Decision step, which links the call's prompt run so the run counts its cost:
 *      on time, and after a timeout or a cancellation once the call settles.
 *   4. A catalog over the decision model's option cap is narrowed first by the semantic search, and
 *      the step says so.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
// Side-effect import: registers the real LoopAgentType with the ClassFactory.
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import { AgentDecisionService, AgentDecisionAskParams } from '../AgentDecisionService';
import {
    DECISION_DISCOVERY_APPLIES_INSTRUCTIONS,
    DECISION_DISCOVERY_MAX_OPTIONS,
    DECISION_DISCOVERY_MAX_RECORDED_IDS,
    DECISION_DISCOVERY_MIN_OPTIONS,
    DECISION_DISCOVERY_TIMEOUT_MS,
    SuggestedAgentMessage,
} from '../decision-discovery';
import type { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { ChatMessage, ChoiceQuestion, DecisionAnswer } from '@memberjunction/ai';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { LogErrorEx } from '@memberjunction/core';
import type { EntitySearchResult, IMetadataProvider, SearchEntityParams, UserInfo } from '@memberjunction/core';

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
    ActionEngineServer: {
        get Instance() {
            return harness.actionEngineInstance;
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: async (): Promise<boolean> => true,
        FilterRunnableAgents: async <T extends { ID: string }>(agents: T[], user: UserInfo): Promise<T[]> => {
            harness.filterCalls.push({ AgentIDs: agents.map(a => a.ID), UserID: user.ID });
            return agents.filter(a => harness.runnableIDs.has(a.ID));
        },
        IsDirectlyDiscoverable: (agent: { ID: string }): boolean => !harness.subAgentIDs.has(agent.ID),
    },
}));

// ============================================================================
// Fixture
// ============================================================================

const SELF_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const TYPE_ID = 'eeeeeeee-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'eeeeeeee-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'eeeeeeee-0000-4000-8000-000000000004';
const STORAGE_ACCOUNT_ID = 'eeeeeeee-0000-4000-8000-000000000005';
const USER_ID = 'eeeeeeee-0000-4000-8000-000000000006';
const DECISION_PROMPT_ID = 'eeeeeeee-0000-4000-8000-000000000007';
const DECISION_MODEL_ID = 'eeeeeeee-0000-4000-8000-000000000008';
const DECISION_VENDOR_ID = 'eeeeeeee-0000-4000-8000-000000000009';
const DECISION_MODEL_VENDOR_ID = 'eeeeeeee-0000-4000-8000-000000000010';
const OPENING_REQUEST = 'Please invoice Acme for the March consulting work';

/** The agent entity row BaseAgent reads. Catalog agents use the same shape. */
interface AgentRow {
    ID: string;
    Name: string;
    Description: string | null;
    Status: string;
    TypeID: string;
    InvocationMode: string;
    ParentID: string | null;
    ExecutionOrder: number;
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

function agentRow(id: string, name: string, description: string | null, promptParams: Record<string, unknown> | null = null): AgentRow {
    return {
        ID: id,
        Name: name,
        Description: description,
        Status: 'Active',
        TypeID: TYPE_ID,
        InvocationMode: 'Top-Level',
        ParentID: null,
        ExecutionOrder: 0,
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
        AgentTypePromptParams: promptParams ? JSON.stringify(promptParams) : null,
        OwnerUserID: null,
    };
}

function makeSelf(promptParams: Record<string, unknown> | null = null): AgentRow {
    return agentRow(SELF_ID, 'Sage Test Agent', 'Routes requests to the right agent', promptParams);
}

const RESEARCH = agentRow('eeeeeeee-1000-4000-8000-000000000001', 'Research Agent', 'Researches topics on the web');
const BILLING = agentRow('eeeeeeee-1000-4000-8000-000000000002', 'Billing Agent', 'Handles invoices and payments');
const MARKETING = agentRow('eeeeeeee-1000-4000-8000-000000000003', 'Marketing Agent', 'Writes marketing copy');
/** Not runnable by the user. */
const SECRET = agentRow('eeeeeeee-1000-4000-8000-000000000004', 'Secret Agent', 'Does things the user may not run');
/** Runnable, but not directly discoverable. */
const HELPER = agentRow('eeeeeeee-1000-4000-8000-000000000005', 'Helper Sub', 'Only other agents call it');
/** Runnable and discoverable, but with nothing for the decision model to read. */
const BLANK = agentRow('eeeeeeee-1000-4000-8000-000000000006', 'Blank Agent', null);
/** Added to the engine between two runs. */
const LATECOMER = agentRow('eeeeeeee-1000-4000-8000-000000000007', 'Latecomer Agent', 'Joined the catalog after the first run');

const ON = { decisionDiscovery: true };

// ============================================================================
// Harness
// ============================================================================

/** Minimal step entity: plain assignable fields plus Save/NewRecord. */
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
    public PayloadAtEnd: string | null = null;
    public Skills: string | null = null;
    public PromptRun: MJAIPromptRunEntity | undefined = undefined;

    constructor(private readonly seq: number) {}

    public NewRecord(): void {
        this.ID = `eeeeeeee-4000-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        return true;
    }
}

/** Minimal agent run entity: the fields the loop and finalize write. */
class FakeAgentRun {
    public ID = 'eeeeeeee-5000-4000-8000-000000000001';
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

/** Whether a message is the loop agent's trailing runtime-state fragment. */
function isVolatileState(message: ChatMessage<{ volatileState?: boolean }>): boolean {
    return message.metadata?.volatileState === true;
}

/** Scripted stand-in for AIPromptRunner that also snapshots the messages each prompt was sent. */
class RecordingPromptRunner {
    public readonly Calls: AIPromptParams[] = [];
    public readonly MessagesAtCall: ChatMessage[][] = [];

    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        this.Calls.push(params);
        // The trailing <mj-runtime-state> fragment is framework state appended to every loop turn, not
        // conversation; these tests assert on the conversation the discovery decision shapes.
        this.MessagesAtCall.push((params.conversationMessages ?? []).filter(m => !isVolatileState(m)));
        const done: LoopAgentResponse = { taskComplete: true, message: 'All done' };
        return { success: true, result: JSON.stringify(done), chatResult: {} as AIPromptRunResult['chatResult'] };
    }
}

/** A prompt-model binding row: the fields the option-cap lookup reads. */
interface PromptModelRow {
    PromptID: string;
    ModelID: string;
    VendorID: string | null;
    Status: string;
}

/** Everything the mocked singletons and the provider read, rebuilt per test. */
class DiscoveryHarness {
    public self: AgentRow = makeSelf();
    public catalog: AgentRow[] = [RESEARCH, BILLING, MARKETING, SECRET, HELPER, BLANK];
    public runnableIDs = new Set<string>([SELF_ID, RESEARCH.ID, BILLING.ID, MARKETING.ID, HELPER.ID, BLANK.ID, LATECOMER.ID]);
    public subAgentIDs = new Set<string>([HELPER.ID]);
    public filterCalls: Array<{ AgentIDs: string[]; UserID: string }> = [];
    public promptModels: PromptModelRow[] = [];
    public modelConfigCalls: Array<{ ModelID: string; ModelVendorID: string | undefined }> = [];
    public maxChoiceOptions: number | null = null;
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];

    private stepSeq = 0;
    private readonly baseCatalog = new Map<string, unknown>();

    public get engineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Agents: [this.self, ...this.catalog],
            AgentRelationships: [],
            AgentCategories: [],
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
                { ID: DECISION_PROMPT_ID, Name: 'Default Decision', EffortLevel: null },
            ],
            PromptModels: this.promptModels,
            ModelVendors: [{ ID: DECISION_MODEL_VENDOR_ID, ModelID: DECISION_MODEL_ID, VendorID: DECISION_VENDOR_ID }],
            GetEffectiveModelConfiguration: (modelID: string, modelVendorID?: string): unknown => {
                this.modelConfigCalls.push({ ModelID: modelID, ModelVendorID: modelVendorID });
                return { Decision: { MaxChoiceOptions: this.maxChoiceOptions } };
            },
            AgentPrompts: [
                { ID: 'eeeeeeee-7000-4000-8000-000000000001', AgentID: SELF_ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
            ],
            AgentActions: [],
            GetSubAgents: (): unknown[] => [],
            GetAutoActivatableSkillsForAgent: (): unknown[] => [],
            GetSkillsForAgent: (): unknown[] => [],
            GetClientToolsForAgent: (): unknown[] => [],
            GetAgentBaseCatalog: (agentId: string): unknown => this.baseCatalog.get(agentId),
            SetAgentBaseCatalog: (agentId: string, cat: unknown): void => {
                this.baseCatalog.set(agentId, cat);
            },
        };
    }

    public get actionEngineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Actions: [],
            RunAction: async (): Promise<Record<string, unknown>> => ({ Success: true, Message: 'done', Params: [], Result: { ResultCode: 'SUCCESS' }, LogEntry: null }),
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
            throw new Error(`DiscoveryHarness: unexpected GetEntityObject('${entityName}')`);
        },
    };

    /** The same provider, able to run the semantic search, ranking the given agent IDs. */
    public searchingProvider(rankedIDs: string[], searches: SearchEntityParams[]): typeof this.provider & { SearchEntity: (params: SearchEntityParams) => Promise<EntitySearchResult[]> } {
        return {
            ...this.provider,
            SearchEntity: async (params: SearchEntityParams): Promise<EntitySearchResult[]> => {
                searches.push(params);
                return rankedIDs.map((id, i) => ({ entityRecordDocumentId: null, recordId: id, score: 1 / (i + 1), matchType: 'hybrid', components: {} }));
            },
        };
    }
}

let harness: DiscoveryHarness;

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }
}

/** The private member the tests replace. */
interface AgentInternals {
    _promptRunner: RecordingPromptRunner;
}

function makeAgent(): { agent: HarnessAgent; runner: RecordingPromptRunner } {
    const agent = new HarnessAgent();
    const runner = new RecordingPromptRunner();
    (agent as unknown as AgentInternals)._promptRunner = runner;
    return { agent, runner };
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: harness.self as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: OPENING_REQUEST }],
        contextUser: { ID: USER_ID, Name: 'Discovery Tester', Email: 'discovery@test.mj' } as unknown as UserInfo,
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
        ...overrides,
    };
}

/** An Ask that picks `agent` with `confidence`, and says any agent applies with `applies`. */
function answering(agent: AgentRow, confidence: number, applies: number): (args: AgentDecisionAskParams) => Promise<AIDecisionRunResult> {
    return async (args) => {
        const options = choiceOf(args).Options;
        const others = options.length > 1 ? (1 - confidence) / (options.length - 1) : 0;
        const probabilities: Record<string, number> = {};
        for (const option of options) {
            probabilities[option.Value] = option.Value === agent.ID ? confidence : others;
        }
        const answers: Record<string, DecisionAnswer> = {
            agent: { Kind: 'Choice', Value: agent.ID, Confidence: confidence, Probabilities: probabilities },
            anyApplies: { Kind: 'Likelihood', Probability: applies },
        };
        return { success: true, Answers: answers };
    };
}

/** The Choice question an Ask was given. */
function choiceOf(args: AgentDecisionAskParams): ChoiceQuestion {
    const question = args.Questions.agent;
    if (question?.Kind !== 'Choice') {
        throw new Error('the agent question is not a Choice');
    }
    return question;
}

function discoverySteps(): MockStepEntity[] {
    return harness.steps.filter(s => s.StepName.includes('Agent discovery'));
}

function stepOutput(step: MockStepEntity): Record<string, unknown> {
    return JSON.parse(step.OutputData ?? '{}');
}

/** The system messages carrying a suggestion, in the messages the first prompt was sent. */
function suggestionsInFirstPrompt(runner: RecordingPromptRunner): ChatMessage[] {
    return (runner.MessagesAtCall[0] ?? []).filter(m => typeof m.content === 'string' && m.content.includes('<suggested_agent>'));
}

function expectWarning(): void {
    expect(vi.mocked(LogErrorEx)).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning', category: 'DecisionDiscovery' }));
}

/** The discovery decision's own prompt run, as AIDecisionRunner returns it once finalized. */
const DISCOVERY_RUN = {
    ID: 'eeeeeeee-8000-4000-8000-000000000001',
    TokensUsedRollup: 700,
    TokensPromptRollup: 650,
    TokensCompletionRollup: 50,
    TokensCacheReadRollup: 0,
    TokensCacheWriteRollup: 0,
    TotalCost: 0.0023,
} satisfies Pick<MJAIPromptRunEntity, 'ID' | 'TokensUsedRollup' | 'TokensPromptRollup' | 'TokensCompletionRollup' | 'TokensCacheReadRollup' | 'TokensCacheWriteRollup' | 'TotalCost'>;

/** What AIDecisionRunner returns for an aborted call: it wrote the prompt run before it called the model. */
const ABORTED: AIDecisionRunResult = { success: false, errorMessage: 'The operation was aborted', Answers: {}, promptRun: DISCOVERY_RUN as MJAIPromptRunEntity };

/** `ask`, with the discovery call's prompt run on its result. */
function withPromptRun(ask: (args: AgentDecisionAskParams) => Promise<AIDecisionRunResult>): (args: AgentDecisionAskParams) => Promise<AIDecisionRunResult> {
    return async (args) => ({ ...(await ask(args)), promptRun: DISCOVERY_RUN as MJAIPromptRunEntity });
}

/**
 * An Ask that calls `onAsked`, then settles with `result` once its signal aborts, as the runner
 * finalizes its prompt run after the abort.
 */
function settlesOnAbort(result: AIDecisionRunResult, onAsked: () => void): (args: AgentDecisionAskParams) => Promise<AIDecisionRunResult> {
    return (args) => new Promise<AIDecisionRunResult>(resolve => {
        args.CancellationToken?.addEventListener('abort', () => resolve(result), { once: true });
        onAsked();
    });
}

/** `Asked` resolves once `Mark` is called: the moment the decision is asked. */
function askedSignal(): { Asked: Promise<void>; Mark: () => void } {
    let mark: () => void = () => undefined;
    const asked = new Promise<void>(resolve => {
        mark = resolve;
    });
    return { Asked: asked, Mark: mark };
}

/** The discovery step links DISCOVERY_RUN, and the run's totals include it. */
function expectDiscoveryRunCounted(): void {
    const step = discoverySteps()[0];
    expect(step.TargetLogID).toBe(DISCOVERY_RUN.ID);
    expect(step.PromptRun).toBe(DISCOVERY_RUN);
    // The scripted prompt carries no prompt run, so the discovery call is the run's whole spend.
    const run = harness.runs[0];
    expect(run.TotalCost).toBe(DISCOVERY_RUN.TotalCost);
    expect(run.TotalTokensUsed).toBe(DISCOVERY_RUN.TokensUsedRollup);
    expect(run.TotalPromptTokensUsed).toBe(DISCOVERY_RUN.TokensPromptRollup);
    expect(run.TotalCompletionTokensUsed).toBe(DISCOVERY_RUN.TokensCompletionRollup);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    harness = new DiscoveryHarness();
});

describe('decision discovery — off by default', () => {
    it('asks nothing, records no step, and leaves the first prompt untouched', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent();

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(ask).not.toHaveBeenCalled();
        expect(harness.filterCalls).toHaveLength(0);
        expect(discoverySteps()).toHaveLength(0);
        expect(harness.steps.map(s => s.StepType)).toEqual(['Validation', 'Prompt']);
        expect(runner.MessagesAtCall[0]).toEqual([{ role: 'user', content: OPENING_REQUEST }]);
    });

    it.each([
        ['false', { decisionDiscovery: false }],
        ['the string "true"', { decisionDiscovery: 'true' }],
    ])('stays off when decisionDiscovery is %s', async (_label, promptParams) => {
        harness.self = makeSelf(promptParams);
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent } = makeAgent();

        await agent.Execute(makeParams());

        expect(ask).not.toHaveBeenCalled();
        expect(discoverySteps()).toHaveLength(0);
    });
});

describe('decision discovery — the options', () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
    });

    it('asks one decision about the opening request, with the permitted agents as IDs and descriptions', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams());

        expect(ask).toHaveBeenCalledTimes(1);
        const asked = ask.mock.calls[0][0];
        expect(asked.State).toBe(OPENING_REQUEST);
        expect(asked.PromptName).toBe('Default Decision');
        expect(asked.AgentID).toBe(SELF_ID);
        expect(asked.CancellationToken).toBeInstanceOf(AbortSignal);
        // Not the running agent, not SECRET (not runnable), not HELPER (a Sub-Agent), not BLANK (no description).
        expect(choiceOf(asked).Options).toEqual([
            { Value: RESEARCH.ID, Description: RESEARCH.Description },
            { Value: BILLING.ID, Description: BILLING.Description },
            { Value: MARKETING.ID, Description: MARKETING.Description },
        ]);
        expect(asked.Questions.anyApplies).toEqual({
            Kind: 'Likelihood',
            Instructions: DECISION_DISCOVERY_APPLIES_INSTRUCTIONS,
        });
    });

    it('never shows the decision model an agent name', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams());

        const questions = JSON.stringify(ask.mock.calls[0][0].Questions);
        for (const name of ['Research Agent', 'Billing Agent', 'Marketing Agent']) {
            expect(questions).not.toContain(name);
        }
    });

    it("filters the engine's whole catalog through the shared permission filter, for the run's user", async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams());

        expect(harness.filterCalls).toEqual([
            { AgentIDs: [SELF_ID, ...harness.catalog.map(a => a.ID)], UserID: USER_ID },
        ]);
    });

    it('rebuilds the options on every run, never from a cached list', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams());
        harness.runnableIDs.delete(RESEARCH.ID);
        harness.catalog = [...harness.catalog, LATECOMER];
        await agent.Execute(makeParams());

        expect(ask).toHaveBeenCalledTimes(2);
        expect(choiceOf(ask.mock.calls[0][0]).Options.map(o => o.Value)).toEqual([RESEARCH.ID, BILLING.ID, MARKETING.ID]);
        expect(choiceOf(ask.mock.calls[1][0]).Options.map(o => o.Value)).toEqual([BILLING.ID, MARKETING.ID, LATECOMER.ID]);
    });

    it('is turned on by a per-run prompt-param override too', async () => {
        harness.self = makeSelf();
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams({ data: { __agentTypePromptParams: ON } }));

        expect(ask).toHaveBeenCalledTimes(1);
    });

    it('reads the decision prompt name from the prompt params', async () => {
        harness.self = makeSelf({ ...ON, decisionPromptName: 'Routing Decision' });
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams());

        expect(ask.mock.calls[0][0].PromptName).toBe('Routing Decision');
    });

    it.each([
        ['one agent', [BILLING.ID]],
        // A Choice between two cannot say that neither fits: its top answer is at least 0.5.
        ['two agents', [BILLING.ID, MARKETING.ID]],
    ])(`asks nothing, and records why, when %s (fewer than ${DECISION_DISCOVERY_MIN_OPTIONS}) are left to choose from`, async (_label, runnable) => {
        harness.runnableIDs = new Set([SELF_ID, ...runnable]);
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams());

        expect(ask).not.toHaveBeenCalled();
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(0);
        const steps = discoverySteps();
        expect(steps).toHaveLength(1);
        expect(steps[0].Status).toBe('Completed');
        expect(stepOutput(steps[0])).toMatchObject({ injected: false, catalogSize: runnable.length, options: runnable.length });
        expect(String(stepOutput(steps[0]).reason)).toContain(`fewer than the ${DECISION_DISCOVERY_MIN_OPTIONS} a suggestion needs`);
    });

    it(`asks once ${DECISION_DISCOVERY_MIN_OPTIONS} agents are left to choose from`, async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams());

        expect(choiceOf(ask.mock.calls[0][0]).Options).toHaveLength(DECISION_DISCOVERY_MIN_OPTIONS);
    });
});

describe('decision discovery — @mentions', () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
    });

    const token = (agent: AgentRow): string => `@{"_mode":"mention","type":"agent","id":"${agent.ID}","name":"${agent.Name}"}`;

    it.each([
        ['a mention token, converted to "@Name" text before the run', `${token(BILLING)} please invoke`, {}],
        ['a mention token left as markup', `${token(BILLING)} please invoke`, { convertUIMarkupToPlainText: false }],
        ['"@Agent Name" typed by the user', '@billing agent please invoice Acme', {}],
    ])('makes no call for %s', async (_label, request, overrides) => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams({ conversationMessages: [{ role: 'user', content: request }], ...overrides }));

        expect(ask).not.toHaveBeenCalled();
        expect(discoverySteps()).toHaveLength(0);
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(0);
    });

    it('still asks when the only mention is of the running agent itself', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams({ conversationMessages: [{ role: 'user', content: `${token(harness.self)} ${OPENING_REQUEST}` }] }));

        expect(ask).toHaveBeenCalledTimes(1);
    });
});

describe('decision discovery — what reaches the prompt', () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
    });

    it('puts the suggestion first in the first prompt when both answers are confident, and records it', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent, runner } = makeAgent();

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        const expected = [
            '<suggested_agent>',
            'A typed decision over the agents you may delegate to chose: Billing Agent — Handles invoices and payments',
            '(confidence 0.84). Delegate to it directly unless the request clearly needs something else.',
            '</suggested_agent>',
        ].join('\n');
        expect(runner.MessagesAtCall[0]).toEqual([
            { role: 'system', content: expected },
            { role: 'user', content: OPENING_REQUEST },
        ]);
        expect(harness.steps.map(s => s.StepType)).toEqual(['Validation', 'Decision', 'Prompt']);
        const steps = discoverySteps();
        expect(steps).toHaveLength(1);
        expect(steps[0].Status).toBe('Completed');
        expect(JSON.parse(steps[0].InputData ?? '{}')).toMatchObject({
            request: OPENING_REQUEST,
            promptName: 'Default Decision',
            minConfidence: 0.7,
            timeoutMS: DECISION_DISCOVERY_TIMEOUT_MS,
        });
        expect(stepOutput(steps[0])).toMatchObject({
            injected: true,
            catalogSize: 4,
            hostAllowList: false,
            withoutDescription: { count: 1, agentIds: [BLANK.ID] },
            options: 3,
            optionLimit: DECISION_DISCOVERY_MAX_OPTIONS,
            narrowed: false,
            answer: { agentId: BILLING.ID, agent: 'Billing Agent', confidence: 0.84, anyApplies: 0.9 },
        });
        expect(stepOutput(steps[0]).answer).toMatchObject({ probabilities: { 'Billing Agent': 0.84 } });
    });

    it('matches the message SuggestedAgentMessage builds', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(MARKETING, 0.91, 0.95));
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams());

        const message = SuggestedAgentMessage({ ID: MARKETING.ID, Name: MARKETING.Name, Description: MARKETING.Description ?? '' }, 0.91);
        expect(suggestionsInFirstPrompt(runner)).toEqual([{ role: 'system', content: message }]);
    });

    it.each([
        ['it injects a suggestion', answering(BILLING, 0.84, 0.9), true],
        ['it is unsure, and injects nothing', answering(BILLING, 0.55, 0.9), false],
    ])("counts the decision toward the run's tokens and cost when %s: its step links the prompt run", async (_label, answer, injected) => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(withPromptRun(answer));
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams());

        expect(suggestionsInFirstPrompt(runner)).toHaveLength(injected ? 1 : 0);
        expect(stepOutput(discoverySteps()[0])).toMatchObject({ injected, promptRunId: DISCOVERY_RUN.ID });
        expectDiscoveryRunCounted();
    });

    it.each([
        ['a low Choice confidence', 0.55, 0.95, 'agent confidence 0.55 is below 0.7'],
        ['a low Likelihood', 0.9, 0.3, 'any agent applies, 0.30, is below 0.7'],
    ])('injects nothing for %s, and records the answer as not injected', async (_label, confidence, applies, reason) => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, confidence, applies));
        const { agent, runner } = makeAgent();

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(runner.MessagesAtCall[0]).toEqual([{ role: 'user', content: OPENING_REQUEST }]);
        const steps = discoverySteps();
        expect(steps).toHaveLength(1);
        expect(steps[0].Status).toBe('Completed');
        expect(stepOutput(steps[0])).toMatchObject({ injected: false, answer: { agent: 'Billing Agent', confidence, anyApplies: applies } });
        expect(String(stepOutput(steps[0]).reason)).toContain(reason);
    });

    it.each([
        ['the call fails', async (): Promise<AIDecisionRunResult> => ({ success: false, errorMessage: 'No decision model', Answers: {} }), 'No decision model'],
        ['the call throws', async (): Promise<AIDecisionRunResult> => { throw new Error('network down'); }, 'network down'],
        ['the answer is missing', async (): Promise<AIDecisionRunResult> => ({ success: true, Answers: {} }), 'missing'],
        ['the answer names no option', answering(SECRET, 0.99, 0.99), 'not one of the options'],
    ])('injects nothing, warns, and records the step as failed, when %s', async (_label, answer, reason) => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answer);
        const { agent, runner } = makeAgent();

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(runner.MessagesAtCall[0]).toEqual([{ role: 'user', content: OPENING_REQUEST }]);
        expectWarning();
        const steps = discoverySteps();
        expect(steps).toHaveLength(1);
        expect(steps[0].Status).toBe('Failed');
        expect(stepOutput(steps[0])).toMatchObject({ injected: false });
        expect(String(stepOutput(steps[0]).reason)).toContain(reason);
    });

    describe('the timeout', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it(`holds the first prompt for at most ${DECISION_DISCOVERY_TIMEOUT_MS}ms, then aborts the call and injects nothing`, async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            let signal: AbortSignal | undefined;
            let markAsked: () => void = () => undefined;
            const asked = new Promise<void>(resolve => {
                markAsked = resolve;
            });
            vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation((args) => {
                signal = args.CancellationToken;
                markAsked();
                return new Promise<AIDecisionRunResult>(() => undefined);
            });
            const { agent, runner } = makeAgent();

            const pending = agent.Execute(makeParams());
            await asked;
            await vi.advanceTimersByTimeAsync(DECISION_DISCOVERY_TIMEOUT_MS - 1);
            expect(signal?.aborted).toBe(false);
            expect(runner.Calls).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(1);
            const result = await pending;

            expect(result.success).toBe(true);
            expect(signal?.aborted).toBe(true);
            expect(runner.MessagesAtCall[0]).toEqual([{ role: 'user', content: OPENING_REQUEST }]);
            expectWarning();
            const steps = discoverySteps();
            expect(steps).toHaveLength(1);
            expect(steps[0].Status).toBe('Failed');
            expect(stepOutput(steps[0])).toMatchObject({ injected: false });
            expect(String(stepOutput(steps[0]).reason)).toContain('timed out');
        });

        it('links the prompt run of the call it stopped waiting for, so the run still counts it', async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            const { Asked, Mark } = askedSignal();
            vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(settlesOnAbort(ABORTED, Mark));
            const { agent, runner } = makeAgent();

            const pending = agent.Execute(makeParams());
            await Asked;
            await vi.advanceTimersByTimeAsync(DECISION_DISCOVERY_TIMEOUT_MS);
            const result = await pending;

            expect(result.success).toBe(true);
            expect(suggestionsInFirstPrompt(runner)).toHaveLength(0);
            const step = discoverySteps()[0];
            expect(step.Status).toBe('Failed');
            expect(String(stepOutput(step).reason)).toContain('timed out');
            expectDiscoveryRunCounted();
        });
    });
});

describe('decision discovery — a cancelled run', () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
    });

    it('stops at once when the run is cancelled, injects nothing, and still counts the call', async () => {
        const run = new AbortController();
        const { Asked, Mark } = askedSignal();
        let signal: AbortSignal | undefined;
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation((args) => {
            signal = args.CancellationToken;
            return settlesOnAbort(ABORTED, Mark)(args);
        });
        const { agent, runner } = makeAgent();

        const pending = agent.Execute(makeParams({ cancellationToken: run.signal }));
        await Asked;
        expect(signal?.aborted).toBe(false);
        run.abort('user cancelled');
        const result = await pending;

        expect(result.success).toBe(false);
        expect(signal?.aborted).toBe(true);
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(0);
        expectWarning();
        const step = discoverySteps()[0];
        expect(step.Status).toBe('Failed');
        expect(stepOutput(step)).toMatchObject({ injected: false });
        // Not the timeout: the run's cancellation reached the call before DECISION_DISCOVERY_TIMEOUT_MS.
        expect(String(stepOutput(step).reason)).toContain('cancelled');
        expectDiscoveryRunCounted();
    });
});

describe('decision discovery — follow-up turns', () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
    });

    it.each([
        ['a follow-up to an agent already at work', [
            { role: 'user', content: OPENING_REQUEST },
            { role: 'assistant', content: 'Billing Agent drafted the invoice.' },
            { role: 'user', content: 'Make it shorter' },
        ]],
        ['a turn after a summary of the earlier conversation', [
            { role: 'user', content: 'Summary: Billing Agent is drafting an invoice for Acme.', metadata: { isConversationSummary: true } },
            { role: 'user', content: 'Make it shorter' },
        ]],
    ] satisfies Array<[string, ChatMessage[]]>)('asks nothing, records no step and leaves the prompt untouched on %s', async (_label, messages) => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(MARKETING, 0.99, 0.99));
        const { agent, runner } = makeAgent();

        const result = await agent.Execute(makeParams({ conversationMessages: messages }));

        expect(result.success).toBe(true);
        expect(ask).not.toHaveBeenCalled();
        expect(harness.filterCalls).toHaveLength(0);
        expect(discoverySteps()).toHaveLength(0);
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(0);
    });

    it("still asks on the conversation's opening request when a greeting came before it", async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams({ conversationMessages: [
            { role: 'assistant', content: 'Hi! What can I help you with?' },
            { role: 'user', content: OPENING_REQUEST },
        ] }));

        expect(ask).toHaveBeenCalledTimes(1);
        expect(ask.mock.calls[0][0].State).toBe(OPENING_REQUEST);
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(1);
    });

    it('asks again on the opening request of the next conversation the same agent instance runs', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams({ conversationMessages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'user', content: 'Make it shorter' },
        ] }));
        await agent.Execute(makeParams());

        expect(ask).toHaveBeenCalledTimes(1);
        expect(ask.mock.calls[0][0].State).toBe(OPENING_REQUEST);
    });
});

describe('decision discovery — a catalog over the option cap', () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
        harness.promptModels = [{ PromptID: DECISION_PROMPT_ID, ModelID: DECISION_MODEL_ID, VendorID: DECISION_VENDOR_ID, Status: 'Active' }];
    });

    it('offers the whole catalog when it fits the cap, and runs no search', async () => {
        harness.maxChoiceOptions = 3;
        const searches: SearchEntityParams[] = [];
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams({ provider: harness.searchingProvider([], searches) as unknown as IMetadataProvider }));

        expect(searches).toHaveLength(0);
        expect(choiceOf(ask.mock.calls[0][0]).Options).toHaveLength(3);
        expect(stepOutput(discoverySteps()[0])).toMatchObject({ optionLimit: 3, declaredOptionCap: 3, narrowed: false });
    });

    it("reads the cap from the model configuration of the decision prompt's bound model", async () => {
        harness.maxChoiceOptions = 3;
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams());

        expect(harness.modelConfigCalls).toEqual([{ ModelID: DECISION_MODEL_ID, ModelVendorID: DECISION_MODEL_VENDOR_ID }]);
    });

    it('narrows the catalog first with the semantic search, in its rank order, and says so in the step', async () => {
        harness.maxChoiceOptions = 3;
        harness.catalog = [...harness.catalog, LATECOMER];
        const searches: SearchEntityParams[] = [];
        const ranked = [SECRET.ID, MARKETING.ID, RESEARCH.ID, LATECOMER.ID, BILLING.ID];
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(MARKETING, 0.84, 0.9));
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams({ provider: harness.searchingProvider(ranked, searches) as unknown as IMetadataProvider }));

        expect(searches).toHaveLength(1);
        expect(searches[0]).toMatchObject({
            entityName: 'MJ: AI Agents',
            searchText: OPENING_REQUEST,
            options: { mode: 'hybrid', topK: 9, minScore: 0 },
        });
        expect(searches[0].options?.contextUser?.ID).toBe(USER_ID);
        // The cap (3) is below DECISION_DISCOVERY_MAX_OPTIONS, so 3 are kept; SECRET is not permitted.
        expect(choiceOf(ask.mock.calls[0][0]).Options.map(o => o.Value)).toEqual([MARKETING.ID, RESEARCH.ID, LATECOMER.ID]);
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(1);
        expect(stepOutput(discoverySteps()[0])).toMatchObject({
            injected: true,
            catalogSize: 5,
            options: 3,
            optionLimit: 3,
            declaredOptionCap: 3,
            narrowed: { by: 'semantic search', from: 4, to: 3 },
        });
    });

    it('fails safe when the catalog is over the cap and the provider cannot search', async () => {
        harness.maxChoiceOptions = 2;
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams());

        expect(ask).not.toHaveBeenCalled();
        expect(runner.MessagesAtCall[0]).toEqual([{ role: 'user', content: OPENING_REQUEST }]);
        expectWarning();
        const steps = discoverySteps();
        expect(steps).toHaveLength(1);
        expect(steps[0].Status).toBe('Failed');
        expect(String(stepOutput(steps[0]).reason)).toContain('semantic search');
    });
});

describe('decision discovery — the option limit always applies', () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
    });

    /** `count` runnable, discoverable agents with descriptions, added to the catalog. */
    function specialists(count: number): AgentRow[] {
        const rows = Array.from({ length: count }, (_, i) =>
            agentRow(`eeeeeeee-2000-4000-8000-${String(i + 1).padStart(12, '0')}`, `Specialist ${i + 1}`, `Handles task type ${i + 1}`));
        rows.forEach(r => harness.runnableIDs.add(r.ID));
        return rows;
    }

    it(`offers a catalog of up to ${DECISION_DISCOVERY_MAX_OPTIONS} whole when no model declares a cap, and runs no search`, async () => {
        const searches: SearchEntityParams[] = [];
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams({ provider: harness.searchingProvider([], searches) as unknown as IMetadataProvider }));

        expect(searches).toHaveLength(0);
        expect(choiceOf(ask.mock.calls[0][0]).Options).toHaveLength(3);
        const output = stepOutput(discoverySteps()[0]);
        expect(output).toMatchObject({ optionLimit: DECISION_DISCOVERY_MAX_OPTIONS, narrowed: false });
        expect(output).not.toHaveProperty('declaredOptionCap');
    });

    it(`narrows a catalog over ${DECISION_DISCOVERY_MAX_OPTIONS} with the semantic search even when no model declares a cap`, async () => {
        const many = specialists(30);
        harness.catalog = many;
        const ranked = [...many].reverse().map(a => a.ID);
        const searches: SearchEntityParams[] = [];
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(many[29], 0.84, 0.9));
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams({ provider: harness.searchingProvider(ranked, searches) as unknown as IMetadataProvider }));

        expect(harness.promptModels).toHaveLength(0);
        expect(searches).toHaveLength(1);
        expect(searches[0].options).toMatchObject({ mode: 'hybrid', topK: DECISION_DISCOVERY_MAX_OPTIONS * 3, minScore: 0 });
        expect(choiceOf(ask.mock.calls[0][0]).Options.map(o => o.Value)).toEqual(ranked.slice(0, DECISION_DISCOVERY_MAX_OPTIONS));
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(1);
        const output = stepOutput(discoverySteps()[0]);
        expect(output).toMatchObject({
            catalogSize: 30,
            options: DECISION_DISCOVERY_MAX_OPTIONS,
            optionLimit: DECISION_DISCOVERY_MAX_OPTIONS,
            narrowed: { by: 'semantic search', from: 30, to: DECISION_DISCOVERY_MAX_OPTIONS },
        });
        expect(output).not.toHaveProperty('declaredOptionCap');
    });

    it(`fails safe when a catalog over ${DECISION_DISCOVERY_MAX_OPTIONS} cannot be searched`, async () => {
        harness.catalog = specialists(30);
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams());

        expect(ask).not.toHaveBeenCalled();
        expect(runner.MessagesAtCall[0]).toEqual([{ role: 'user', content: OPENING_REQUEST }]);
        const steps = discoverySteps();
        expect(steps[0].Status).toBe('Failed');
        expect(String(stepOutput(steps[0]).reason)).toContain(`limit of ${DECISION_DISCOVERY_MAX_OPTIONS} options`);
    });
});

describe("decision discovery — the host's allow-list", () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
    });

    /** The host's catalog, as ConversationAgentRunner sends it in ALL_AVAILABLE_AGENTS. */
    function hostCatalog(...agents: Array<{ ID: string; Name: string; Description: string | null }>): Record<string, unknown> {
        return { ALL_AVAILABLE_AGENTS: agents.map(a => ({ ID: a.ID, Name: a.Name, Description: a.Description })) };
    }

    it('offers only the permitted agents the host lists, matching IDs in any case, and records the list', async () => {
        harness.catalog = [...harness.catalog, LATECOMER];
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(MARKETING, 0.84, 0.9));
        const { agent, runner } = makeAgent();
        const upperResearch = { ...RESEARCH, ID: RESEARCH.ID.toUpperCase() };

        await agent.Execute(makeParams({ data: hostCatalog(upperResearch, MARKETING, LATECOMER, SECRET) }));

        // BILLING is not listed by the host; SECRET is listed but the user may not run it.
        expect(choiceOf(ask.mock.calls[0][0]).Options.map(o => o.Value)).toEqual([RESEARCH.ID, MARKETING.ID, LATECOMER.ID]);
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(1);
        expect(stepOutput(discoverySteps()[0])).toMatchObject({ injected: true, catalogSize: 3, options: 3, hostAllowList: { size: 4 } });
    });

    it('never suggests an agent the host excluded, even when the decision picks it', async () => {
        harness.catalog = [...harness.catalog, LATECOMER];
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.99, 0.99));
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams({ data: hostCatalog(RESEARCH, MARKETING, LATECOMER) }));

        expect(suggestionsInFirstPrompt(runner)).toHaveLength(0);
        const steps = discoverySteps();
        expect(steps[0].Status).toBe('Failed');
        expect(String(stepOutput(steps[0]).reason)).toContain('not one of the options');
    });

    it('asks nothing when the host allows no agents', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent();

        await agent.Execute(makeParams({ data: { ALL_AVAILABLE_AGENTS: [] } }));

        expect(ask).not.toHaveBeenCalled();
        expect(suggestionsInFirstPrompt(runner)).toHaveLength(0);
        expect(stepOutput(discoverySteps()[0])).toMatchObject({ injected: false, catalogSize: 0, options: 0, hostAllowList: { size: 0 } });
    });

    it('offers every permitted agent, and records no allow-list, when the run carries none', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams({ data: { ticketNumber: 42 } }));

        expect(choiceOf(ask.mock.calls[0][0]).Options.map(o => o.Value)).toEqual([RESEARCH.ID, BILLING.ID, MARKETING.ID]);
        expect(stepOutput(discoverySteps()[0])).toMatchObject({ hostAllowList: false });
    });
});

describe('decision discovery — agents without a description', () => {
    beforeEach(() => {
        harness.self = makeSelf(ON);
    });

    it(`records the IDs of the agents left out, at most ${DECISION_DISCOVERY_MAX_RECORDED_IDS}, with their count`, async () => {
        const blanks = Array.from({ length: 55 }, (_, i) =>
            agentRow(`eeeeeeee-3000-4000-8000-${String(i + 1).padStart(12, '0')}`, `Blank ${i + 1}`, i % 2 === 0 ? null : '   '));
        blanks.forEach(b => harness.runnableIDs.add(b.ID));
        harness.catalog = [RESEARCH, BILLING, MARKETING, ...blanks];
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answering(BILLING, 0.84, 0.9));
        const { agent } = makeAgent();

        await agent.Execute(makeParams());

        expect(choiceOf(ask.mock.calls[0][0]).Options).toHaveLength(3);
        expect(stepOutput(discoverySteps()[0])).toMatchObject({
            catalogSize: 58,
            options: 3,
            withoutDescription: { count: 55, agentIds: blanks.slice(0, DECISION_DISCOVERY_MAX_RECORDED_IDS).map(b => b.ID) },
        });
    });
});
