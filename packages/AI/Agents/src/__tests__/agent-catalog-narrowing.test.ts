/**
 * Catalog narrowing (plan Task 3.7), driven through the REAL BaseAgent.Execute loop with only the
 * package boundaries mocked — the same harness recipe as base-agent-loop.test.ts: a scripted prompt
 * runner, an in-memory AIEngine / ActionEngineServer, and mock run/step entities. The decision
 * boundary is `AgentDecisionService.Ask`, spied on its prototype.
 *
 * Contract pinned:
 *   1. Off by default: the template data is identical to what BaseAgent produced before narrowing
 *      existed (GOLDEN was captured from the unmodified code), and no decision call is made.
 *   2. With a limit: one decision per run, not per step, and a fresh one on the next run; the top N
 *      plus every MinExecutionsPerRun item and the Find Candidate tools are shown;
 *      _effectiveActions / _effectiveSubAgents stay whole, so a hidden action can still be called;
 *      one `Catalog narrowing` Decision step is recorded, and its prompt run counts toward the run.
 *      Hidden is never unreachable: each narrowed list starts with a note on how many it hides and how
 *      to reach them, the counts stay whole, and actions are narrowed only when the agent has Find
 *      Candidate Actions.
 *   3. Fail open: a failed, throwing, timed-out, cancelled or answer-less decision, or a missing
 *      prompt, shows the full catalog and logs a warning. A timed-out or cancelled call's prompt run
 *      is still linked to the step once the call settles, so the run counts it.
 *   4. Skills: narrowed in the catalog only, after the filterAvailableSkills policy (which stays the
 *      identity, so an override that skips super keeps narrowing), and an error while narrowing
 *      returns them all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
// Side-effect import: registers the real LoopAgentType with the ClassFactory.
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import { AgentDecisionService, AgentDecisionAskParams } from '../AgentDecisionService';
import { NoCatalogNarrowing, type CatalogNarrowingKind, type CatalogNarrowingOutcome } from '../catalog-narrowing';
import type { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, MJAIAgentEntityExtended, SkillAvailabilityPurpose } from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { DecisionQuestion } from '@memberjunction/ai';
import type { MJAIPromptRunEntity, MJAISkillEntity } from '@memberjunction/core-entities';
import { LogErrorEx } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

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
    },
}));

// ============================================================================
// Fixture
// ============================================================================

const AGENT_ID = 'cccccccc-0000-4000-8000-000000000001';
const TYPE_ID = 'cccccccc-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'cccccccc-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'cccccccc-0000-4000-8000-000000000004';
const STORAGE_ACCOUNT_ID = 'cccccccc-0000-4000-8000-000000000005';
const USER_ID = 'cccccccc-0000-4000-8000-000000000006';
const OPENING_REQUEST = 'Please invoice Acme for the March consulting work';

/** An action row: the fields BaseAgent formats and the harness serves. */
interface ActionRow {
    ID: string;
    Name: string;
    Description: string;
    Status: string;
    Params: { Items: [] };
    ResultCodes: { Items: [] };
}

/** An AIAgentAction junction row. */
interface AgentActionRow {
    ID: string;
    AgentID: string;
    ActionID: string;
    Action: string;
    Status: string;
    ResultExpirationTurns: null;
    ResultExpirationMode: null;
    CompactMode: null;
    CompactLength: null;
    CompactPromptID: null;
    MaxExecutionsPerRun: null;
    MinExecutionsPerRun: number | null;
}

/** A child agent row. */
interface SubAgentRow {
    ID: string;
    Name: string;
    Description: string;
    Status: string;
    ParentID: string;
    ExecutionOrder: number;
    ExecutionMode: string;
    MinExecutionsPerRun: number | null;
}

/** A skill row. */
interface SkillRow {
    ID: string;
    Name: string;
    Description: string;
}

function action(n: number, name: string, description: string): ActionRow {
    return {
        ID: `cccccccc-1000-4000-8000-00000000000${n}`,
        Name: name,
        Description: description,
        Status: 'Active',
        Params: { Items: [] },
        ResultCodes: { Items: [] },
    };
}

const ACTIONS: ActionRow[] = [
    action(1, 'Look Up Weather', 'Returns the forecast for a city'),
    action(2, 'Send Email', 'Sends an email to one recipient'),
    action(3, 'Create Invoice', 'Creates an invoice for a customer'),
    action(4, 'Find Candidate Actions', 'Finds the actions that suit a task'),
    action(5, 'Translate Text', 'Translates text into another language'),
];

function subAgent(n: number, name: string, description: string, minExecutions: number | null): SubAgentRow {
    return {
        ID: `cccccccc-2000-4000-8000-00000000000${n}`,
        Name: name,
        Description: description,
        Status: 'Active',
        ParentID: AGENT_ID,
        ExecutionOrder: n,
        ExecutionMode: 'Sequential',
        MinExecutionsPerRun: minExecutions,
    };
}

const SUB_AGENTS: SubAgentRow[] = [
    subAgent(1, 'Research Agent', 'Researches topics on the web', null),
    subAgent(2, 'Billing Agent', 'Handles invoices and payments', null),
    subAgent(3, 'Audit Agent', 'Reviews every run for compliance', 1),
];

const SKILLS: SkillRow[] = [
    { ID: 'cccccccc-3000-4000-8000-000000000001', Name: 'Tax Advisor', Description: 'Explains tax rules' },
    { ID: 'cccccccc-3000-4000-8000-000000000002', Name: 'Poet', Description: 'Writes poems' },
    { ID: 'cccccccc-3000-4000-8000-000000000003', Name: 'Accountant', Description: 'Keeps the books' },
];

/** The agent entity row BaseAgent reads. */
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

function makeAgentRow(promptParams: Record<string, unknown> | null = null): AgentRow {
    return {
        ID: AGENT_ID,
        Name: 'Catalog Test Agent',
        Description: 'Agent used by the catalog narrowing suite',
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
        AgentTypePromptParams: promptParams ? JSON.stringify(promptParams) : null,
        OwnerUserID: null,
    };
}

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
        this.ID = `cccccccc-4000-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        return true;
    }
}

/** Minimal agent run entity: the fields the loop and finalize write. */
class FakeAgentRun {
    public ID = 'cccccccc-5000-4000-8000-000000000001';
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

/** Scripted stand-in for AIPromptRunner: the LLM boundary. */
class ScriptedPromptRunner {
    public readonly Calls: AIPromptParams[] = [];

    constructor(private readonly script: Array<() => AIPromptRunResult>) {}

    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        const index = this.Calls.length;
        this.Calls.push(params);
        return this.script[Math.min(index, this.script.length - 1)]();
    }
}

/** Everything the mocked singletons and the provider read, rebuilt per test. */
class CatalogHarness {
    public agent: AgentRow = makeAgentRow();
    /** The agent's actions. */
    public actions: ActionRow[] = ACTIONS;
    public minExecutionsByAction = new Map<string, number>([[ACTIONS[2].ID, 1]]);
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];
    public actionsRun: string[] = [];

    private stepSeq = 0;
    private readonly catalog = new Map<string, unknown>();

    public get engineInstance(): Record<string, unknown> {
        const agentActions: AgentActionRow[] = this.actions.map((a, i) => ({
            ID: `cccccccc-6000-4000-8000-00000000000${i + 1}`,
            AgentID: AGENT_ID,
            ActionID: a.ID,
            Action: a.Name,
            Status: 'Active',
            ResultExpirationTurns: null,
            ResultExpirationMode: null,
            CompactMode: null,
            CompactLength: null,
            CompactPromptID: null,
            MaxExecutionsPerRun: null,
            MinExecutionsPerRun: this.minExecutionsByAction.get(a.ID) ?? null,
        }));
        return {
            Config: async (): Promise<void> => undefined,
            Agents: [this.agent, ...SUB_AGENTS],
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
            ],
            AgentPrompts: [
                { ID: 'cccccccc-7000-4000-8000-000000000001', AgentID: AGENT_ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
            ],
            AgentActions: agentActions,
            GetSubAgents: (): unknown[] => [],
            GetAutoActivatableSkillsForAgent: (): unknown[] => SKILLS,
            GetSkillsForAgent: (): unknown[] => SKILLS,
            GetClientToolsForAgent: (): unknown[] => [],
            GetAgentBaseCatalog: (agentId: string): unknown => this.catalog.get(agentId),
            SetAgentBaseCatalog: (agentId: string, cat: unknown): void => {
                this.catalog.set(agentId, cat);
            },
        };
    }

    public get actionEngineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Actions: this.actions,
            RunAction: async (input: { Action: { Name: string } }): Promise<Record<string, unknown>> => {
                this.actionsRun.push(input.Action.Name);
                return { Success: true, Message: 'done', Params: [], Result: { ResultCode: 'SUCCESS' }, LogEntry: null };
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
            throw new Error(`CatalogHarness: unexpected GetEntityObject('${entityName}')`);
        },
    };
}

let harness: CatalogHarness;

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }
}

/** The private members the tests reach. */
interface AgentInternals {
    _promptRunner: ScriptedPromptRunner;
    _effectiveActions: ActionRow[];
    _effectiveSubAgents: SubAgentRow[];
    _catalogNarrowing: CatalogNarrowingOutcome | undefined;
    _openingRequest: string;
    _executeParams: { cancellationToken?: AbortSignal } | undefined;
    hideNarrowedOut<T extends { ID: string }>(kind: CatalogNarrowingKind, items: T[]): T[];
    askCatalogNarrowing(
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        questions: Record<string, DecisionQuestion>,
        promptName: string
    ): Promise<AIDecisionRunResult>;
}

function makeAgent(script: Array<() => AIPromptRunResult>, agent: HarnessAgent = new HarnessAgent()): { agent: HarnessAgent; runner: ScriptedPromptRunner } {
    const runner = new ScriptedPromptRunner(script);
    (agent as unknown as AgentInternals)._promptRunner = runner;
    return { agent, runner };
}

function makeParams(
    conversationMessages: ExecuteAgentParams['conversationMessages'] = [{ role: 'user', content: OPENING_REQUEST }]
): ExecuteAgentParams {
    return {
        agent: harness.agent as unknown as MJAIAgentEntityExtended,
        conversationMessages,
        contextUser: { ID: USER_ID, Name: 'Catalog Tester', Email: 'catalog@test.mj' } as unknown as UserInfo,
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
    };
}

function llmEnvelope(envelope: LoopAgentResponse): AIPromptRunResult {
    return { success: true, result: JSON.stringify(envelope), chatResult: {} as AIPromptRunResult['chatResult'] };
}

const SUCCESS: LoopAgentResponse = { taskComplete: true, message: 'All done' };

/** The keys gatherPromptTemplateData writes into the prompt's template data. */
const CATALOG_KEYS = [
    'agentName', 'agentDescription', 'parentAgentName',
    'subAgentCount', 'subAgentDetails', 'actionCount', 'actionDetails',
    'clientToolDetails', 'skillCount', 'skillsCatalog',
    'planModeActive', 'planApproved', 'appContext', '__agentTypePromptParams',
] as const;

function templateData(call: AIPromptParams): Record<string, unknown> {
    const data = call.data ?? {};
    const picked: Record<string, unknown> = {};
    for (const key of CATALOG_KEYS) {
        picked[key] = data[key];
    }
    return picked;
}

/** The template data without the prompt params, which a test's own AgentTypePromptParams change. */
function catalogOnly(data: Record<string, unknown>): Record<string, unknown> {
    const { __agentTypePromptParams: _promptParams, ...rest } = data;
    return rest;
}

/**
 * The template data the UNMODIFIED BaseAgent produced for this fixture's first prompt, captured
 * before catalog narrowing existed. With the default params the new code must reproduce it exactly.
 */
const GOLDEN: Record<string, unknown> = {
    agentName: 'Catalog Test Agent',
    agentDescription: 'Agent used by the catalog narrowing suite',
    parentAgentName: '',
    subAgentCount: 3,
    subAgentDetails: '- **Research Agent** — Researches topics on the web\n- **Billing Agent** — Handles invoices and payments\n- **Audit Agent** — Reviews every run for compliance',
    actionCount: 5,
    actionDetails: '### Look Up Weather\nReturns the forecast for a city\n\n### Send Email\nSends an email to one recipient\n\n### Create Invoice\nCreates an invoice for a customer\n\n### Find Candidate Actions\nFinds the actions that suit a task\n\n### Translate Text\nTranslates text into another language',
    clientToolDetails: '',
    skillCount: 3,
    skillsCatalog: '- **Tax Advisor** — Explains tax rules\n- **Poet** — Writes poems\n- **Accountant** — Keeps the books',
    planModeActive: false,
    planApproved: false,
    appContext: '',
    __agentTypePromptParams: {
        // finishIf gates are opt-in (finishIfMode defaults to 'off'), so BaseAgent leaves their docs out.
        includeFinishIfDocs: false,
        // Decisions are opt-in too (includeDecisionsDocs defaults to false), so their docs and type are out.
        includeDecisionsDocs: false,
        includeResponseTypeDefinition: {
            payload: true,
            responseForms: true,
            commands: true,
            forEach: true,
            while: true,
            scratchpad: true,
            decisions: false,
            finishIf: false,
            artifactToolCalls: true,
            conversationToolCalls: true,
            pipeline: true,
            memoryWrites: true,
            tasks: false,
        },
    },
};

/** The action catalog markdown for these actions, in the given order. */
function actionDetailsFor(...names: string[]): string {
    return names.map(n => `### ${n}\n${ACTIONS.find(a => a.Name === n)?.Description}`).join('\n\n');
}

/** The sub-agent catalog markdown for these sub-agents, in the given order. */
function subAgentDetailsFor(...names: string[]): string {
    return names.map(n => `- **${n}** — ${SUB_AGENTS.find(s => s.Name === n)?.Description}`).join('\n');
}

/** The skill catalog markdown for these skills, in the given order. */
function skillsCatalogFor(...names: string[]): string {
    return names.map(n => `- **${n}** — ${SKILLS.find(s => s.Name === n)?.Description}`).join('\n');
}

/** A narrowed section: the note on what it hides and how to reach it, then the items it shows. */
function narrowedSection(note: string, details: string): string {
    return `${note}\n\n${details}`;
}

const ONE_ACTION_HIDDEN = '1 of your actions is not described below. If none below fits the task, call Find Candidate Actions to find one and its parameters, then call it by name.';

const TEST_USER = { ID: USER_ID, Name: 'Catalog Tester', Email: 'catalog@test.mj' } as unknown as UserInfo;

/** Narrowing on: 2 actions (and skills), 1 sub-agent. */
const NARROWED = { maxActionsInPrompt: 2, maxSubAgentsInPrompt: 1 };

/** What the decision says about each unpinned item. */
const PROBABILITIES: Record<string, number> = {
    'Look Up Weather': 0.1,
    'Send Email': 0.8,
    'Translate Text': 0.3,
    'Research Agent': 0.2,
    'Billing Agent': 0.9,
    'Tax Advisor': 0.7,
    'Poet': 0.05,
    'Accountant': 0.95,
};

/** An Ask that answers each question with the probability of the item it names. */
function answerByName(probabilities: Record<string, number>): (args: AgentDecisionAskParams) => Promise<AIDecisionRunResult> {
    return async (args) => {
        const answers: AIDecisionRunResult['Answers'] = {};
        for (const [key, question] of Object.entries(args.Questions)) {
            const name = Object.keys(probabilities).find(n => question.Instructions.includes(`request: ${n}:`));
            answers[key] = { Kind: 'Likelihood', Probability: name === undefined ? 0 : probabilities[name] };
        }
        return { success: true, Answers: answers };
    };
}

function actionsEnvelope(...names: string[]): LoopAgentResponse {
    return {
        taskComplete: false,
        reasoning: 'Run the actions',
        nextStep: { type: 'Actions', actions: names.map(name => ({ name, params: {} })) },
    };
}

/** Two prompts: Create Invoice first (its MinExecutionsPerRun must be met before Success), then Success. */
function twoTurnScript(...extraActions: string[]): Array<() => AIPromptRunResult> {
    return [() => llmEnvelope(actionsEnvelope('Create Invoice', ...extraActions)), () => llmEnvelope(SUCCESS)];
}

function narrowingSteps(): MockStepEntity[] {
    return harness.steps.filter(s => s.StepName.includes('Catalog narrowing'));
}

/** The narrowing decision's own prompt run, as AIDecisionRunner returns it once finalized. */
const NARROWING_RUN = {
    ID: 'cccccccc-8000-4000-8000-000000000001',
    TokensUsedRollup: 900,
    TokensPromptRollup: 850,
    TokensCompletionRollup: 50,
    TokensCacheReadRollup: 0,
    TokensCacheWriteRollup: 0,
    TotalCost: 0.0031,
} satisfies Pick<MJAIPromptRunEntity, 'ID' | 'TokensUsedRollup' | 'TokensPromptRollup' | 'TokensCompletionRollup' | 'TokensCacheReadRollup' | 'TokensCacheWriteRollup' | 'TotalCost'>;

/** The narrowing step links NARROWING_RUN, and the run's totals include it. */
function expectNarrowingRunCounted(): void {
    const step = narrowingSteps()[0];
    expect(step.TargetLogID).toBe(NARROWING_RUN.ID);
    expect(step.PromptRun).toBe(NARROWING_RUN);
    // The scripted prompts carry no prompt run, so the narrowing call is the run's whole spend.
    const run = harness.runs[0];
    expect(run.TotalCost).toBe(NARROWING_RUN.TotalCost);
    expect(run.TotalTokensUsed).toBe(NARROWING_RUN.TokensUsedRollup);
    expect(run.TotalPromptTokensUsed).toBe(NARROWING_RUN.TokensPromptRollup);
    expect(run.TotalCompletionTokensUsed).toBe(NARROWING_RUN.TokensCompletionRollup);
}

/** Exposes the protected skill hook. */
class SkillHookAgent extends HarnessAgent {
    public FilterSkills(skills: MJAISkillEntity[], purpose: SkillAvailabilityPurpose): Promise<MJAISkillEntity[]> {
        return this.filterAvailableSkills(skills, purpose, harness.agent as unknown as MJAIAgentEntityExtended, TEST_USER);
    }
}

/** A skill policy that refuses Tax Advisor everywhere, and never calls `super`. */
class NoTaxAdvisorAgent extends HarnessAgent {
    protected override async filterAvailableSkills(skills: MJAISkillEntity[]): Promise<MJAISkillEntity[]> {
        return skills.filter(s => s.Name !== 'Tax Advisor');
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    harness = new CatalogHarness();
});

describe('catalog narrowing — off by default', () => {
    it('reproduces the template data BaseAgent produced before narrowing existed, and asks nothing', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent(twoTurnScript());

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expect(templateData(runner.Calls[0])).toEqual(GOLDEN);
        expect(templateData(runner.Calls[1])).toEqual(GOLDEN);
        expect(ask).not.toHaveBeenCalled();
        expect(narrowingSteps()).toHaveLength(0);
        expect(harness.steps.map(s => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions', 'Prompt']);
    });

    it.each([
        ['the shipped default of -1', { maxActionsInPrompt: -1, maxSubAgentsInPrompt: -1 }],
        ['0', { maxActionsInPrompt: 0, maxSubAgentsInPrompt: 0 }],
        ['limits the catalog does not exceed', { maxActionsInPrompt: 5, maxSubAgentsInPrompt: 3 }],
        ['an action limit the unpinned actions already fit', { maxActionsInPrompt: 4 }],
    ])('changes nothing with %s', async (_label, promptParams) => {
        harness.agent = makeAgentRow(promptParams);
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        expect(catalogOnly(templateData(runner.Calls[0]))).toEqual(catalogOnly(GOLDEN));
        expect(ask).not.toHaveBeenCalled();
        expect(narrowingSteps()).toHaveLength(0);
    });

    it('the expected-markdown helpers reproduce the golden catalog', () => {
        expect(actionDetailsFor(...ACTIONS.map(a => a.Name))).toBe(GOLDEN.actionDetails);
        expect(subAgentDetailsFor(...SUB_AGENTS.map(s => s.Name))).toBe(GOLDEN.subAgentDetails);
        expect(skillsCatalogFor(...SKILLS.map(s => s.Name))).toBe(GOLDEN.skillsCatalog);
    });
});

describe('catalog narrowing — with a limit', () => {
    beforeEach(() => {
        harness.agent = makeAgentRow(NARROWED);
    });

    it('asks one decision per run, not per step, and every prompt sees the same narrowed catalog', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript());

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expect(ask).toHaveBeenCalledTimes(1);
        expect(catalogOnly(templateData(runner.Calls[1]))).toEqual(catalogOnly(templateData(runner.Calls[0])));
    });

    it('asks one Likelihood per unpinned action, sub-agent and skill, against the opening request', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        const asked: AgentDecisionAskParams = ask.mock.calls[0][0];
        expect(asked.State).toBe(OPENING_REQUEST);
        expect(asked.PromptName).toBe('Default Decision');
        expect(asked.AgentID).toBe(AGENT_ID);
        const likelihood = (instructions: string): DecisionQuestion => ({ Kind: 'Likelihood', Instructions: instructions });
        expect(Object.values(asked.Questions)).toEqual([
            likelihood('This action is useful for the request: Look Up Weather: Returns the forecast for a city'),
            likelihood('This action is useful for the request: Send Email: Sends an email to one recipient'),
            likelihood('This action is useful for the request: Translate Text: Translates text into another language'),
            likelihood('This agent is useful for the request: Research Agent: Researches topics on the web'),
            likelihood('This agent is useful for the request: Billing Agent: Handles invoices and payments'),
            likelihood('This skill is useful for the request: Tax Advisor: Explains tax rules'),
            likelihood('This skill is useful for the request: Poet: Writes poems'),
            likelihood('This skill is useful for the request: Accountant: Keeps the books'),
        ]);
    });

    it('shows the top N by probability, plus every MinExecutionsPerRun item and the Find Candidate tools', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        const data = templateData(runner.Calls[0]);
        // Actions: Send Email and Translate Text win; Create Invoice (MinExecutionsPerRun) and Find
        // Candidate Actions are pinned; Look Up Weather is hidden. Catalog order is kept.
        expect(data.actionDetails).toBe(narrowedSection(
            ONE_ACTION_HIDDEN,
            actionDetailsFor('Send Email', 'Create Invoice', 'Find Candidate Actions', 'Translate Text')));
        // Sub-agents: Billing Agent wins; Audit Agent (MinExecutionsPerRun) is pinned.
        expect(data.subAgentDetails).toBe(narrowedSection(
            '1 of your sub-agents is not described below: Research Agent. Call one by name if it fits the task.',
            subAgentDetailsFor('Billing Agent', 'Audit Agent')));
        // Skills share the action limit of 2.
        expect(data.skillsCatalog).toBe(narrowedSection(
            '1 of your skills is not described below: Poet. Activate one by name if it fits the task.',
            skillsCatalogFor('Tax Advisor', 'Accountant')));
    });

    it('keeps each count whole: it is what the model can call, and the native tool path declares all of it', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        const data = templateData(runner.Calls[0]);
        expect([data.actionCount, data.subAgentCount, data.skillCount]).toEqual([GOLDEN.actionCount, GOLDEN.subAgentCount, GOLDEN.skillCount]);
    });

    it('narrows the prose only: native tool calling still declares every action and sub-agent', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        const data = templateData(runner.Calls[0]);
        expect(String(data.actionDetails)).not.toContain('### Look Up Weather');
        expect(String(data.subAgentDetails)).not.toContain('**Research Agent**');
        const declared = (runner.Calls[0].tools ?? []).map(t => t.name);
        expect(declared).toEqual(expect.arrayContaining(['look_up_weather', 'delegate_to_research_agent']));
        expect(declared).toEqual(expect.arrayContaining(ACTIONS.map(a => a.Name.toLowerCase().replace(/ /g, '_'))));
    });

    it('names every hidden sub-agent and skill, and counts the hidden actions', async () => {
        // A limit of 1 hides two actions and two skills.
        harness.agent = makeAgentRow({ maxActionsInPrompt: 1, maxSubAgentsInPrompt: 1 });
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        const data = templateData(runner.Calls[0]);
        expect(String(data.actionDetails)).toMatch(/^2 of your actions are not described below\. If none below fits the task, call Find Candidate Actions/);
        expect(String(data.skillsCatalog)).toMatch(/^2 of your skills are not described below: Tax Advisor, Poet\. Activate one by name/);
    });

    it('leaves the actions whole, and warns, when the agent has no Find Candidate Actions; sub-agents and skills still narrow', async () => {
        harness.actions = ACTIONS.filter(a => a.Name !== 'Find Candidate Actions');
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        const asked = Object.values(ask.mock.calls[0][0].Questions).map(q => q.Instructions);
        expect(asked.filter(i => i.startsWith('This action'))).toEqual([]);
        expect(asked).toHaveLength(5);
        const data = templateData(runner.Calls[0]);
        expect(data.actionCount).toBe(4);
        expect(data.actionDetails).toBe(actionDetailsFor('Look Up Weather', 'Send Email', 'Create Invoice', 'Translate Text'));
        expect(String(data.subAgentDetails)).toMatch(/^1 of your sub-agents is not described below: Research Agent\./);
        expect(String(data.skillsCatalog)).toMatch(/^1 of your skills is not described below: Poet\./);
        expect(vi.mocked(LogErrorEx)).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'warning',
            category: 'CatalogNarrowing',
            message: expect.stringContaining('has no Find Candidate Actions action'),
        }));
    });

    it('hides, never forbids: _effectiveActions and _effectiveSubAgents stay whole, and a hidden action still runs', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript('Look Up Weather'));

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(String(templateData(runner.Calls[0]).actionDetails)).not.toContain('Look Up Weather');
        expect([...harness.actionsRun].sort()).toEqual(['Create Invoice', 'Look Up Weather']);
        const internals = agent as unknown as AgentInternals;
        expect(internals._effectiveActions.map(a => a.Name)).toEqual(ACTIONS.map(a => a.Name));
        expect(internals._effectiveSubAgents.map(s => s.Name)).toEqual(SUB_AGENTS.map(s => s.Name));
    });

    it('records one Catalog narrowing Decision step with its counts, kept names and probabilities', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        expect(harness.steps.map(s => s.StepType)).toEqual(['Validation', 'Prompt', 'Decision', 'Actions', 'Prompt']);
        const steps = narrowingSteps();
        expect(steps).toHaveLength(1);
        expect(steps[0].StepType).toBe('Decision');
        expect(steps[0].Status).toBe('Completed');
        expect(JSON.parse(steps[0].InputData ?? '{}')).toMatchObject({
            request: OPENING_REQUEST,
            promptName: 'Default Decision',
            limits: { actions: 2, subAgents: 1, skills: 2 },
            asked: { actions: 3, subAgents: 2, skills: 3 },
        });
        expect(JSON.parse(steps[0].OutputData ?? '{}')).toMatchObject({
            actions: {
                total: 5,
                limit: 2,
                shown: 4,
                kept: ['Send Email', 'Create Invoice', 'Find Candidate Actions', 'Translate Text'],
                pinned: ['Create Invoice', 'Find Candidate Actions'],
                probabilities: { 'Look Up Weather': 0.1, 'Send Email': 0.8, 'Translate Text': 0.3 },
            },
            subAgents: {
                total: 3,
                limit: 1,
                shown: 2,
                kept: ['Billing Agent', 'Audit Agent'],
                pinned: ['Audit Agent'],
                probabilities: { 'Research Agent': 0.2, 'Billing Agent': 0.9 },
            },
            skills: {
                total: 3,
                limit: 2,
                shown: 2,
                kept: ['Tax Advisor', 'Accountant'],
                pinned: [],
                probabilities: { 'Tax Advisor': 0.7, 'Poet': 0.05, 'Accountant': 0.95 },
            },
        });
    });

    it('counts the decision toward the run\'s tokens and cost: its step links the prompt run', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(async (args) => ({
            ...(await answerByName(PROBABILITIES)(args)),
            promptRun: NARROWING_RUN as MJAIPromptRunEntity,
        }));
        const { agent } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        expectNarrowingRunCounted();
        expect(narrowingSteps()[0].Status).toBe('Completed');
    });

    it('counts the decision even when it fails open', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockResolvedValue({
            success: true,
            Answers: {},
            promptRun: NARROWING_RUN as MJAIPromptRunEntity,
        });
        const { agent } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        expectNarrowingRunCounted();
        expect(narrowingSteps()[0].Status).toBe('Failed');
    });

    it('narrows only the list whose limit is set', async () => {
        harness.agent = makeAgentRow({ maxSubAgentsInPrompt: 1 });
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        expect(Object.keys(ask.mock.calls[0][0].Questions)).toHaveLength(2);
        const data = templateData(runner.Calls[0]);
        expect(data.actionDetails).toBe(GOLDEN.actionDetails);
        expect(data.skillsCatalog).toBe(GOLDEN.skillsCatalog);
        expect(data.subAgentDetails).toBe(narrowedSection(
            '1 of your sub-agents is not described below: Research Agent. Call one by name if it fits the task.',
            subAgentDetailsFor('Billing Agent', 'Audit Agent')));
    });

    it('reads the decision prompt name from the merged prompt params', async () => {
        harness.agent = makeAgentRow({ ...NARROWED, decisionPromptName: 'Catalog Decision' });
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams());

        expect(ask.mock.calls[0][0].PromptName).toBe('Catalog Decision');
    });

    it('narrows each run afresh: a second run of the same instance asks again, about its own request', async () => {
        const secondRequest = 'What is the weather in Lisbon tomorrow?';
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask')
            .mockImplementationOnce(answerByName(PROBABILITIES))
            .mockImplementationOnce(answerByName({ ...PROBABILITIES, 'Look Up Weather': 0.99, 'Send Email': 0.01 }));
        const { agent, runner } = makeAgent([...twoTurnScript(), ...twoTurnScript()]);

        await agent.Execute(makeParams());
        await agent.Execute(makeParams([{ role: 'user', content: secondRequest }]));

        expect(ask).toHaveBeenCalledTimes(2);
        expect(ask.mock.calls[1][0].State).toBe(secondRequest);
        expect(runner.Calls).toHaveLength(4);
        expect(templateData(runner.Calls[2]).actionDetails).toBe(narrowedSection(
            ONE_ACTION_HIDDEN,
            actionDetailsFor('Look Up Weather', 'Create Invoice', 'Find Candidate Actions', 'Translate Text')));
    });
});

describe('catalog narrowing — fails open', () => {
    beforeEach(() => {
        harness.agent = makeAgentRow(NARROWED);
    });

    function expectFullCatalogAndWarning(runner: ScriptedPromptRunner): void {
        expect(runner.Calls.length).toBeGreaterThan(0);
        for (const call of runner.Calls) {
            expect(catalogOnly(templateData(call))).toEqual(catalogOnly(GOLDEN));
        }
        expect(vi.mocked(LogErrorEx)).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning', category: 'CatalogNarrowing' }));
    }

    it.each([
        ['the decision call fails', async (): Promise<AIDecisionRunResult> => ({ success: false, errorMessage: 'No decision model', Answers: {} })],
        ['the decision call throws', async (): Promise<AIDecisionRunResult> => { throw new Error('network down'); }],
        ['an answer is missing', async (): Promise<AIDecisionRunResult> => ({ success: true, Answers: {} })],
        ['a probability is not a number', answerByName({ ...PROBABILITIES, 'Send Email': Number.NaN })],
    ])('shows the full catalog, logs a warning, records the step as failed, and asks once, when %s', async (_label, answer) => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answer);
        const { agent, runner } = makeAgent(twoTurnScript());

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expectFullCatalogAndWarning(runner);
        expect(ask).toHaveBeenCalledTimes(1);
        const steps = narrowingSteps();
        expect(steps).toHaveLength(1);
        expect(steps[0].Status).toBe('Failed');
        expect(JSON.parse(steps[0].OutputData ?? '{}')).toMatchObject({ failedOpen: true });
    });

    it('shows the full catalog when the decision prompt is missing', async () => {
        // No spy: the real AgentDecisionService looks for 'Default Decision', which this AIEngine lacks.
        const { agent, runner } = makeAgent(twoTurnScript());

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expectFullCatalogAndWarning(runner);
        expect(vi.mocked(LogErrorEx)).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('not found') }));
    });

    it('shows the full catalog, and asks nothing, when the run has no user message', async () => {
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent(twoTurnScript());

        await agent.Execute(makeParams([]));

        expect(ask).not.toHaveBeenCalled();
        expectFullCatalogAndWarning(runner);
        expect(narrowingSteps()).toHaveLength(0);
    });

    it('shows every list whole, and logs a warning, when narrowing a list throws after a good decision', async () => {
        vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript());
        agent['hideNarrowedOut'] = (): never => {
            throw new Error('boom');
        };

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expectFullCatalogAndWarning(runner);
        expect(vi.mocked(LogErrorEx)).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('could not narrow the skill list') }));
    });

    describe('the decision call', () => {
        const QUESTIONS: Record<string, DecisionQuestion> = { c1: { Kind: 'Likelihood', Instructions: 'This action is useful for the request: Send Email' } };

        afterEach(() => {
            vi.useRealTimers();
        });

        it('gives up after 30 seconds, aborts the call, and returns a failure', async () => {
            vi.useFakeTimers();
            let signal: AbortSignal | undefined;
            vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation((args) => {
                signal = args.CancellationToken;
                return new Promise<AIDecisionRunResult>(() => undefined);
            });
            const internals = new HarnessAgent() as unknown as AgentInternals;
            internals._openingRequest = OPENING_REQUEST;

            const pending = internals.askCatalogNarrowing(harness.agent as unknown as MJAIAgentEntityExtended, TEST_USER, QUESTIONS, 'Default Decision');
            await vi.advanceTimersByTimeAsync(29999);
            expect(signal?.aborted).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            const result = await pending;

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('timed out');
            expect(signal?.aborted).toBe(true);
        });

        it('stops when the run is cancelled', async () => {
            const controller = new AbortController();
            vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(() => new Promise<AIDecisionRunResult>(() => undefined));
            const internals = new HarnessAgent() as unknown as AgentInternals;
            internals._openingRequest = OPENING_REQUEST;
            internals._executeParams = { cancellationToken: controller.signal };

            const pending = internals.askCatalogNarrowing(harness.agent as unknown as MJAIAgentEntityExtended, TEST_USER, QUESTIONS, 'Default Decision');
            controller.abort('user cancelled');
            const result = await pending;

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('cancelled');
        });

        it('stops at once when the run was cancelled before the call began', async () => {
            vi.useFakeTimers();
            const controller = new AbortController();
            controller.abort('user cancelled');
            let signal: AbortSignal | undefined;
            vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation((args) => {
                signal = args.CancellationToken;
                return new Promise<AIDecisionRunResult>(() => undefined);
            });
            const agent = new HarnessAgent();
            const params: ExecuteAgentParams = { ...makeParams(), cancellationToken: controller.signal };
            agent['_executeParams'] = params;
            agent['_openingRequest'] = OPENING_REQUEST;

            // An abort listener added to an already-aborted signal never fires, so without its own
            // check the call would wait out the 30-second timeout.
            let result: AIDecisionRunResult | undefined;
            void agent['askCatalogNarrowing'](params.agent, TEST_USER, QUESTIONS, 'Default Decision').then(r => {
                result = r;
            });
            await vi.advanceTimersByTimeAsync(0);

            expect(result?.success).toBe(false);
            expect(result?.errorMessage).toContain('cancelled');
            expect(signal?.aborted).toBe(true);
        });
    });

    describe('a call the run stopped waiting for still counts', () => {
        /** What AIDecisionRunner returns for an aborted call: it wrote the prompt run before calling the model. */
        const ABORTED: AIDecisionRunResult = { success: false, errorMessage: 'The operation was aborted', Answers: {}, promptRun: NARROWING_RUN as MJAIPromptRunEntity };

        let markAsked: () => void;
        let asked: Promise<void>;

        /** An Ask that settles with `result` once its signal aborts, as the runner finalizes its row after the abort. */
        function settlesOnAbort(result: AIDecisionRunResult): (args: AgentDecisionAskParams) => Promise<AIDecisionRunResult> {
            return (args) => new Promise<AIDecisionRunResult>(resolve => {
                args.CancellationToken?.addEventListener('abort', () => resolve(result), { once: true });
                markAsked();
            });
        }

        beforeEach(() => {
            asked = new Promise<void>(resolve => {
                markAsked = resolve;
            });
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('links the prompt run of a timed-out call to the step, and the run counts it', async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(settlesOnAbort(ABORTED));
            const { agent, runner } = makeAgent(twoTurnScript());

            const pending = agent.Execute(makeParams());
            await asked;
            await vi.advanceTimersByTimeAsync(30000);
            const result = await pending;

            expect(result.success).toBe(true);
            expectFullCatalogAndWarning(runner);
            const step = narrowingSteps()[0];
            expect(step.Status).toBe('Failed');
            expect(JSON.parse(step.OutputData ?? '{}')).toMatchObject({ failedOpen: true, reason: expect.stringContaining('timed out') });
            expectNarrowingRunCounted();
        });

        it('links the prompt run of a call the run cancelled to the step, and the cancelled run counts it', async () => {
            const run = new AbortController();
            vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(settlesOnAbort(ABORTED));
            const { agent } = makeAgent(twoTurnScript());

            const pending = agent.Execute({ ...makeParams(), cancellationToken: run.signal });
            await asked;
            run.abort('user cancelled');
            const result = await pending;

            expect(result.success).toBe(false);
            const step = narrowingSteps()[0];
            expect(step.Status).toBe('Failed');
            expect(JSON.parse(step.OutputData ?? '{}')).toMatchObject({ failedOpen: true, reason: expect.stringContaining('cancelled') });
            expectNarrowingRunCounted();
        });

        it('links a prompt run that arrives after the run ended, so the trace still finds it', async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            let settle: (result: AIDecisionRunResult) => void = () => undefined;
            vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(() => new Promise<AIDecisionRunResult>(resolve => {
                settle = resolve;
                markAsked();
            }));
            const { agent } = makeAgent(twoTurnScript());

            const pending = agent.Execute(makeParams());
            await asked;
            await vi.advanceTimersByTimeAsync(30000);
            await pending;
            const step = narrowingSteps()[0];
            expect(step.Status).toBe('Failed');
            expect(step.TargetLogID).toBeNull();
            const savedLinks: Array<string | null> = [];
            vi.spyOn(step, 'Save').mockImplementation(async () => {
                savedLinks.push(step.TargetLogID);
                return true;
            });
            settle(ABORTED);
            await vi.advanceTimersByTimeAsync(0);

            expect(step.TargetLogID).toBe(NARROWING_RUN.ID);
            expect(step.PromptRun).toBe(NARROWING_RUN);
            // The step was already finalized, so the link is saved on its own.
            expect(savedLinks).toEqual([NARROWING_RUN.ID]);
        });
    });
});

describe('catalog narrowing — skills', () => {
    const skills = SKILLS as unknown as MJAISkillEntity[];

    /** Gives the agent a run narrowing that hides the Poet skill. */
    function hidePoet(agent: HarnessAgent): void {
        const narrowing = NoCatalogNarrowing();
        narrowing.Hidden.skill = new Set([SKILLS[1].ID]);
        agent['_catalogNarrowing'] = narrowing;
    }

    it('filterAvailableSkills stays the identity for every purpose, even while the run hides a skill', async () => {
        const agent = new SkillHookAgent();
        hidePoet(agent);

        for (const purpose of ['catalog', 'auto-activation', 'requested'] as const) {
            expect(await agent.FilterSkills(skills, purpose)).toBe(skills);
        }
    });

    it('narrows the catalog after the policy, even when a filterAvailableSkills override skips super', async () => {
        // Actions (and so skills) narrowed to 1. The policy refuses Tax Advisor, leaving 2 skills.
        harness.agent = makeAgentRow({ maxActionsInPrompt: 1 });
        const ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(answerByName(PROBABILITIES));
        const { agent, runner } = makeAgent(twoTurnScript(), new NoTaxAdvisorAgent());

        await agent.Execute(makeParams());

        const skillQuestions = Object.values(ask.mock.calls[0][0].Questions).map(q => q.Instructions).filter(i => i.startsWith('This skill'));
        expect(skillQuestions).toEqual([
            'This skill is useful for the request: Poet: Writes poems',
            'This skill is useful for the request: Accountant: Keeps the books',
        ]);
        const data = templateData(runner.Calls[0]);
        expect(data.skillsCatalog).toBe(narrowedSection(
            '1 of your skills is not described below: Poet. Activate one by name if it fits the task.',
            skillsCatalogFor('Accountant')));
    });
});
