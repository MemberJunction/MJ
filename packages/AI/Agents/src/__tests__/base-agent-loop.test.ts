/**
 * Full-loop unit tests for BaseAgent.Execute() — the first suite that drives the REAL
 * execution loop end-to-end (Execute → executeAgentInternal → executeNextStep →
 * executePromptStep / executeActionsStep → processNextStep → finalizeAgentRun) through
 * multiple iterations, with only the package boundaries mocked:
 *
 *   - the prompt runner (`_promptRunner.ExecutePrompt`) — scripted LoopAgentResponse
 *     envelopes, exactly what the LLM would return (same instance-member replacement
 *     pattern base-agent-step-save.test.ts uses for `_activeProvider`);
 *   - the action engine (`ActionEngineServer.Instance.RunAction`) — scripted ActionResults
 *     via a module mock (only `ActionEngineServer` is imported from that module anywhere
 *     in this package's source);
 *   - the AIEngine metadata singleton — an in-memory row set (agent type, prompts,
 *     agent-prompt junction, agent-action junction) via a module mock, the same approach
 *     parallel-subagents.test.ts uses;
 *   - the entity/persistence layer — `params.provider.GetEntityObject` hands out mock
 *     run/step entities (the proven step-save harness pattern);
 *   - agent-run permissions (`AIAgentPermissionHelper.HasPermission` → true).
 *
 * Everything else is REAL: the loop itself, LoopAgentType.DetermineNextStep parsing the
 * scripted JSON, payload application via PayloadManager, step-entity lifecycle through
 * AgentRunStepSaveQueue, validation, guardrails, and run finalization.
 *
 * Real behaviors documented here (discovered by reading/driving the code — DO NOT
 * "fix" the tests to match intuition; the implementation is the contract):
 *   1. An action that RETURNS Success=false records a Failed action step, but the loop's
 *      summary counts only actions that THREW as "failed" — the conversation header still
 *      says "Action results:" and the run can finish Completed.
 *   2. A transient (non-fatal) prompt failure yields a non-terminating 'Failed' step; the
 *      loop falls back to re-prompting (LoopAgentType.HandleStepFallback → null → prompt).
 *   3. Cancellation between steps surfaces as a throw from the loop that Execute converts
 *      into a Cancelled run — but the fire-and-forget step-save queue is NOT flushed on
 *      that path (only finalizeAgentRun flushes), so tests drain it explicitly.
 *   4. The MaxIterationsPerRun guardrail trips in processNextStep on the prompt DECISION:
 *      the prompt step itself finalizes 'Completed' (the prompt succeeded); the guardrail
 *      converts the decision into a terminating Failed step and the RUN records the error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { AgentDecisionService } from '../AgentDecisionService';
import { AgentContextInjector } from '../agent-context-injector';
import { ClientToolRequestManager } from '../ClientToolRequestManager';
import { BaseAgentType } from '../agent-types/base-agent-type';
// Bare side-effect import: the REAL LoopAgentType must register itself with the ClassFactory
// (its @RegisterClass decorator) so BaseAgentType.GetAgentTypeInstance resolves DriverClass
// 'LoopAgentType'. A named-but-unreferenced import would be dropped by the TS transform.
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import type { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, MJAIAgentEntityExtended, MJAIAgentRunStepEntityExtended, AgentDecisionRequest, AgentFinishIf, BaseAgentNextStep, AgentChatMessage } from '@memberjunction/ai-core-plus';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { RecordToolCallingDecision } from '@memberjunction/ai-prompts';
import { SanitizeToolName } from '../native-tools/action-tool-builder';
import { FINISH_IF_MODE_WARNING_SHOWN_MAX, FINISH_IF_MODE_WARNINGS_REMEMBERED } from '../finish-if-mode-warnings';
import { LogErrorEx, LogStatus } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { AIEngine } from '@memberjunction/aiengine';
import { DEFAULT_LOOP_AGENT_PROMPT_PARAMS } from '../agent-types/loop-agent-prompt-params';
import { PayloadFeedbackManager } from '../PayloadFeedbackManager';

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

// The metadata singleton BaseAgent reads agent-type/prompt/action rows from. Only
// `AIEngine` is imported from this module anywhere in this package's src, so replacing
// the module with a harness-backed singleton is safe (same as parallel-subagents.test.ts).
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return harness.engineInstance;
        },
    },
}));

// The action-execution boundary. ExecuteSingleAction calls ActionEngineServer.Instance.RunAction;
// buildAgentBaseCatalog reads ActionEngineServer.Instance.Actions.
vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: {
        get Instance() {
            return harness.actionEngineInstance;
        },
    },
}));

// Permission check queries AIEngineBase (DB) — grant everything.
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: async (): Promise<boolean> => true,
    },
}));

// ============================================================================
// Fixed IDs (UUID-shaped: initAgentRunStep only stamps TargetID for valid UUIDs)
// ============================================================================

const AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TYPE_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const ACTION_ID = 'aaaaaaaa-0000-4000-8000-000000000005';
const AGENT_ACTION_ID = 'aaaaaaaa-0000-4000-8000-000000000006';
const STORAGE_ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000007';
const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000008';
const ACTION_LOG_ID = 'aaaaaaaa-0000-4000-8000-000000000009';
const ACTION_NAME = 'Test Action';

// ============================================================================
// Harness types
// ============================================================================

/** The agent entity row BaseAgent reads. Structural stand-in for MJAIAgentEntityExtended. */
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

/** ActionParam-shaped record used by the scripted action results. */
interface ScriptedActionParam {
    Name: string;
    Value: unknown;
    Type: 'Input' | 'Output' | 'Both';
}

/** ActionResult-shaped record returned from the scripted RunAction boundary. */
interface ScriptedActionResult {
    Success: boolean;
    Message: string;
    Params: ScriptedActionParam[];
    Result: { ResultCode: string } | null;
    LogEntry: { ID: string } | null;
}

/** What the mocked RunAction receives (the fields the suite asserts on). */
interface RunActionCall {
    actionName: string;
    params: ScriptedActionParam[];
    /** What BaseAgent.ExecuteSingleAction stamped as Context.ActiveSkillIDs (the run's active skills). */
    activeSkillIDs?: unknown;
    /** `RunActionParams.RuntimeAPIKeyResolver` (the run's scoped key resolver) — absent when the run has no keys. */
    resolveAPIKey?: unknown;
}

/** Save-queue flush diagnostics (shape from AgentRunStepSaveQueue.Flush). */
interface FlushResult {
    failures: number;
    rejections: number;
}

/** Minimal MJAIAgentRunStepEntityExtended stand-in — plain assignable fields + Save/NewRecord. */
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

    public saveCount = 0;

    constructor(private readonly seq: number) {}

    public NewRecord(): void {
        this.ID = `aaaaaaaa-1111-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        this.saveCount++;
        return true;
    }
}

/** Minimal MJAIAgentRunEntityExtended stand-in — fields the loop + finalize write. */
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

/** Scripted stand-in for AIPromptRunner — the LLM boundary. */
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

/** Everything the mocked module singletons + provider read, rebuilt per test. */
class LoopHarness {
    public agent: AgentRow = makeAgentRow();
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];
    public runActionCalls: RunActionCall[] = [];
    public runActionParamsJSON: string[] = [];
    /** Scripted RunAction responder — override per test. */
    public runAction: (call: RunActionCall) => ScriptedActionResult = () => ({
        Success: true,
        Message: 'Action completed',
        Params: [],
        Result: { ResultCode: 'SUCCESS' },
        LogEntry: { ID: ACTION_LOG_ID },
    });

    private stepSeq = 0;
    private readonly catalog = new Map<string, unknown>();

    /** The row set the mocked AIEngine.Instance serves. The junction rows follow `agent`, so a test can run a second agent. */
    public get engineInstance(): Record<string, unknown> {
        const agentActionRow = {
            ID: AGENT_ACTION_ID,
            AgentID: this.agent.ID,
            ActionID: ACTION_ID,
            Action: ACTION_NAME,
            Status: 'Active',
            ResultExpirationTurns: null,
            ResultExpirationMode: null,
            CompactMode: null,
            CompactLength: null,
            CompactPromptID: null,
            MaxExecutionsPerRun: null,
            MinExecutionsPerRun: null,
        };
        return {
            Config: async (): Promise<void> => undefined,
            Agents: [],
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
                { ID: 'aaaaaaaa-3333-4000-8000-000000000001', AgentID: this.agent.ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
            ],
            AgentActions: [agentActionRow],
            GetSubAgents: (): unknown[] => [],
            GetAutoActivatableSkillsForAgent: (): unknown[] => [],
            GetSkillsForAgent: (): unknown[] => [],
            GetClientToolsForAgent: (): unknown[] => [],
            GetAgentBaseCatalog: (agentId: string): unknown => this.catalog.get(agentId),
            SetAgentBaseCatalog: (agentId: string, cat: unknown): void => {
                this.catalog.set(agentId, cat);
            },
        };
    }

    /** The mocked ActionEngineServer.Instance — the action-execution boundary. */
    public get actionEngineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Actions: [
                {
                    ID: ACTION_ID,
                    Name: ACTION_NAME,
                    Description: 'A scripted test action',
                    Status: 'Active',
                    // `Params` / `ResultCodes` are generated related-record collections on
                    // MJActionEntityExtended, not plain arrays — callers read `.Items`
                    // (formatActionDetails, ExecuteSingleAction's param-metadata lookup).
                    Params: { Items: [] },
                    ResultCodes: { Items: [] },
                },
            ],
            RunAction: async (input: { Action: { Name: string }; Params: ScriptedActionParam[]; Context?: { ActiveSkillIDs?: unknown }; RuntimeAPIKeyResolver?: unknown }): Promise<ScriptedActionResult> => {
                const call: RunActionCall = { actionName: input.Action.Name, params: input.Params, activeSkillIDs: input.Context?.ActiveSkillIDs };
                if (input.RuntimeAPIKeyResolver !== undefined) call.resolveAPIKey = input.RuntimeAPIKeyResolver;
                // What any log of the whole RunActionParams could contain — kept off the call record so
                // the toEqual assertions over runActionCalls stay exact.
                this.runActionParamsJSON.push(JSON.stringify({ ...input, Action: input.Action.Name }));
                this.runActionCalls.push(call);
                return this.runAction(call);
            },
        };
    }

    /** Entity/persistence boundary: hands out the fake run + step entities by entity name. */
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
            throw new Error(`LoopHarness: unexpected GetEntityObject('${entityName}') — a DB boundary leaked into the loop test`);
        },
    };

    public get run(): FakeAgentRun {
        expect(this.runs).toHaveLength(1);
        return this.runs[0];
    }
}

function makeAgentRow(overrides: Partial<AgentRow> = {}): AgentRow {
    return {
        ID: AGENT_ID,
        Name: 'Loop Test Agent',
        Description: 'Agent used by the full-loop suite',
        Status: 'Active',
        TypeID: TYPE_ID,
        DriverClass: null,
        Parent: null,
        DefaultStorageAccountID: STORAGE_ACCOUNT_ID, // short-circuits getStorageAccountID (no FileStorageEngine touch)
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
        InjectNotes: false, // gates InjectContextMemory off (no DB)
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

// Module-level harness the hoisted mock factories close over (only dereferenced at
// runtime inside getters, never at mock-require time — the parallel-subagents pattern).
let harness: LoopHarness;

// ============================================================================
// Agent under test — REAL BaseAgent with ONLY the search-RAG boundary stubbed
// (AgentPreExecutionRAG calls SearchEngineBase.Config → DB; out of scope here).
// ============================================================================

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    /** Merges the agent's prompt params as each turn of a run does, with `overrides` as the run's runtime overrides. */
    public MergePromptParams(agent: MJAIAgentEntityExtended, overrides: Record<string, unknown>): Record<string, unknown> {
        return this.buildAgentTypePromptParams(undefined, agent, overrides);
    }

    /** The decision service this agent asks through, so a test can spy on this agent's calls alone. */
    public get DecisionService(): AgentDecisionService {
        return this._agentDecisionService;
    }

    /** Builds the agent's base catalog (sub-agents + actions) from the given engine rows. */
    public ExposeBuildAgentBaseCatalog(agent: MJAIAgentEntityExtended, engine: AIEngine) {
        return this.buildAgentBaseCatalog(agent, engine);
    }
}

/** Structural view of the private members the harness touches (step-save test pattern). */
interface AgentInternals {
    _promptRunner: ScriptedPromptRunner;
    _stepSaveQueue: { Flush(): Promise<FlushResult> };
    /** Stubbed by the sub-agent scenarios: the harness has no sub-agent rows to resolve or run. */
    validateSubAgentNextStep: (params: ExecuteAgentParams, nextStep: BaseAgentNextStep) => Promise<BaseAgentNextStep>;
    processSubAgentStep: () => Promise<BaseAgentNextStep>;
}

function makeAgent(script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>): {
    agent: HarnessAgent;
    runner: ScriptedPromptRunner;
    flushSteps: () => Promise<FlushResult>;
    internals: AgentInternals;
} {
    const agent = new HarnessAgent();
    const runner = new ScriptedPromptRunner(script);
    const internals = agent as unknown as AgentInternals;
    internals._promptRunner = runner;
    return { agent, runner, flushSteps: () => internals._stepSaveQueue.Flush(), internals };
}

const TEST_USER = { ID: USER_ID, Name: 'Loop Tester', Email: 'loop@test.mj' };

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: harness.agent as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'Please complete the task' }],
        contextUser: TEST_USER as unknown as UserInfo,
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true, // AgentDataPreloader is a DB boundary — explicitly off
        ...overrides,
    };
}

/** Builds a successful AIPromptRunResult whose result is the given LoopAgentResponse JSON. */
function llmEnvelope(envelope: LoopAgentResponse): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(envelope),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}


/**
 * A native tool-call turn as the REAL runner hands it to the loop: no text, the call on
 * `chatResult`, and the gate's decision recorded on that same result object (which is what the
 * loop reads `sendResultsNatively` from — Plan B / results §16.5).
 */
function llmNativeActionCall(toolCallId: string, toolResults: boolean): AIPromptRunResult {
    const chatResult = {
        success: true,
        data: { choices: [{ message: { role: 'assistant', content: '', toolCalls: [{ id: toolCallId, name: SanitizeToolName(ACTION_NAME), arguments: { foo: 'bar' } }] } }] },
    } as unknown as AIPromptRunResult['chatResult'];
    RecordToolCallingDecision(chatResult, { useNativeTools: true, mode: 'Native', controlFlow: 'envelope', toolResults });
    // What the real runner hands back for a tool-call-only turn: parseAndValidate returns `{ result: null }`
    // and `result: parsed?.result ? parsed.result : parsed` puts that (truthy) object in `result`.
    return { success: true, result: { result: null } as unknown as string, rawResult: '', chatResult };
}

/** Builds a failed AIPromptRunResult (no errorInfo → BaseAgent classifies via message). */
function llmFailure(errorMessage: string): AIPromptRunResult {
    return {
        success: false,
        errorMessage,
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

/** The Actions envelope used by most scenarios. */
function actionsEnvelope(extra: Partial<LoopAgentResponse> = {}): LoopAgentResponse {
    return {
        taskComplete: false,
        reasoning: 'Need to run the action first',
        nextStep: {
            type: 'Actions',
            actions: [{ name: ACTION_NAME, params: { foo: 'bar' } }],
        },
        ...extra,
    };
}

/** The terminal Success envelope. */
function successEnvelope(extra: Partial<LoopAgentResponse> = {}): LoopAgentResponse {
    return {
        taskComplete: true,
        message: 'All work finished',
        ...extra,
    };
}

/** Reads the payload LoopAgentType.InjectPayload placed into a captured prompt call. */
function injectedPayload(promptParams: AIPromptParams): Record<string, unknown> | undefined {
    return promptParams.data?.[BaseAgentType.CURRENT_PAYLOAD_PLACEHOLDER] as Record<string, unknown> | undefined;
}

beforeEach(() => {
    harness = new LoopHarness();
});

// ============================================================================
// Tests
// ============================================================================

describe('BaseAgent.Execute — full loop: prompt → actions → prompt → finalize', () => {
    it('drives the loop through 3 iterations and finalizes the run Completed/Success with ordered step records', async () => {
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams({ payload: { tasks: ['a'] } }));

        // Terminal result
        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2); // prompt, (action), prompt

        // Run entity finalization
        const run = harness.run;
        expect(run.Status).toBe('Completed');
        expect(run.Success).toBe(true);
        expect(run.FinalStep).toBe('Success');
        expect(run.Message).toBe('All work finished');
        expect(run.TotalPromptIterations).toBe(2);
        expect(run.CompletedAt).not.toBeNull();
        expect(run.StartingPayload).toBe(JSON.stringify({ tasks: ['a'] }));
        expect(run.saveCount).toBeGreaterThanOrEqual(2); // initial INSERT + finalize UPDATE

        // Step sequencing (real behavior: every run opens with an 'Agent Validation' step):
        // Validation → Prompt → Actions → Prompt, all Completed, step numbers 1..4
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions', 'Prompt']);
        expect(harness.steps.map((s) => s.Status)).toEqual(['Completed', 'Completed', 'Completed', 'Completed']);
        expect(harness.steps.map((s) => s.StepNumber)).toEqual([1, 2, 3, 4]);
        expect(harness.steps[0].StepName).toContain('Agent Validation');
        expect(harness.steps[1].StepName).toContain('Execute Agent Prompt');
        expect(harness.steps[2].StepName).toContain(`Execute Action: ${ACTION_NAME}`);
        expect(harness.steps.every((s) => s.AgentRunID === run.ID)).toBe(true);
        expect(run.Steps).toHaveLength(4); // tracked on the run entity too

        // The prompt steps link the child prompt; the action step links the action
        expect(harness.steps[1].TargetID).toBe(CHILD_PROMPT_ID);
        expect(harness.steps[2].TargetID).toBe(ACTION_ID);

        // All fire-and-forget saves were flushed by finalizeAgentRun (INSERT + finalize UPDATE each)
        expect(harness.steps.every((s) => s.saveCount >= 2)).toBe(true);
    });

    it("propagates the payload: step N's output payload is exactly what step N+1's prompt receives, and the run records the last step's payload", async () => {
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope({ payloadChangeRequest: { newElements: { step1: 'done' } } })),
            () => llmEnvelope(successEnvelope({ payloadChangeRequest: { newElements: { step2: 'complete' } } })),
        ]);

        const initialPayload = { tasks: ['a'] };
        const afterStep1 = { tasks: ['a'], step1: 'done' };
        const finalPayload = { tasks: ['a'], step1: 'done', step2: 'complete' };

        const result = await agent.Execute(makeParams({ payload: initialPayload }));

        // Prompt 1 saw the caller's starting payload (injected by the real LoopAgentType.InjectPayload)
        expect(injectedPayload(runner.Calls[0])).toEqual(initialPayload);

        // Prompt 1's payloadChangeRequest was applied BEFORE the action step; the action step and
        // prompt 2 both operate on that merged payload — this is the step N → N+1 propagation.
        expect(injectedPayload(runner.Calls[1])).toEqual(afterStep1);

        // Step entities recorded the payload evolution (index 0 is the Agent Validation step)
        const [, prompt1, actionStep, prompt2] = harness.steps;
        expect(JSON.parse(prompt1.PayloadAtStart ?? 'null')).toEqual(initialPayload);
        expect(JSON.parse(prompt1.PayloadAtEnd ?? 'null')).toEqual(afterStep1);
        expect(JSON.parse(actionStep.PayloadAtStart ?? 'null')).toEqual(afterStep1);
        expect(JSON.parse(actionStep.PayloadAtEnd ?? 'null')).toEqual(afterStep1);
        expect(JSON.parse(prompt2.PayloadAtEnd ?? 'null')).toEqual(finalPayload);

        // The final run payload is the LAST step's payload
        expect(result.payload).toEqual(finalPayload);
        expect(JSON.parse(harness.run.FinalPayload ?? 'null')).toEqual(finalPayload);
        expect(harness.run.FinalPayloadObject).toEqual(finalPayload);
    });

    it('wires the action boundary: LLM params reach RunAction, the log ID lands on the step, and results feed the next prompt', async () => {
        harness.runAction = (call) => ({
            Success: true,
            Message: 'Computed the total',
            Params: [...call.params, { Name: 'total', Value: 42, Type: 'Output' }],
            Result: { ResultCode: 'SUCCESS' },
            LogEntry: { ID: ACTION_LOG_ID },
        });
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const params = makeParams();
        await agent.Execute(params);

        // The LLM's action params were converted to the ActionParam array shape
        expect(harness.runActionCalls).toEqual([
            // ActiveSkillIDs is ALWAYS stamped inside a run — an empty array here means "in a run, no
            // skill active", which Scoped Search treats differently from "no run at all" (undefined).
            { actionName: ACTION_NAME, params: [{ Name: 'foo', Value: 'bar', Type: 'Input' }], activeSkillIDs: [] },
        ]);

        // The ActionExecutionLog ID was stamped onto the Actions step (index 2: after Validation + Prompt)
        expect(harness.steps[2].TargetLogID).toBe(ACTION_LOG_ID);

        // The loop pushed BOTH the invocation record and the results message into the conversation,
        // and prompt 2 received them (same mutated array).
        const contents = params.conversationMessages.map((m) => (typeof m.content === 'string' ? m.content : ''));
        expect(contents.some((c) => c.includes(`You invoked the **${ACTION_NAME}** action`))).toBe(true);
        expect(contents.some((c) => c.startsWith('Action results:'))).toBe(true);
        // Prompt 2 received the conversation history with the trailing runtime state fragment appended
        expect(runner.Calls[1].conversationMessages.slice(0, -1)).toEqual(params.conversationMessages);
        expect(runner.Calls[1].conversationMessages.at(-1)?.metadata?.volatileState).toBe(true);
    });
});

describe('BaseAgent.Execute — Context.ActiveSkillIDs carries the run\'s active skills to every action', () => {
    it('merges the parent run\'s activated skills (parentActivatedSkillIDs) into the stamp, so a sub-agent\'s actions see the root\'s skill', async () => {
        const PARENT_SKILL = 'aaaaaaaa-5555-4000-8000-000000000001';
        harness.runAction = () => ({ Success: true, Message: 'ok', Params: [], Result: { ResultCode: 'SUCCESS' }, LogEntry: null });
        const { agent } = makeAgent([
            () => llmEnvelope(actionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);
        await agent.Execute(makeParams({ parentActivatedSkillIDs: [PARENT_SKILL] }));
        expect(harness.runActionCalls[0].activeSkillIDs).toEqual([PARENT_SKILL]);
    });
});

describe('BaseAgent.Execute — the run\'s runtime API keys reach actions as a SCOPED resolver, never as a list', () => {
    // Prompts have always received params.apiKeys (AIPromptRunner → GetAIAPIKey(driverClass, apiKeys)).
    // Actions never did, so a run on a customer's OpenAI key still generated its images on the
    // platform's. The fix hands an action a RESOLVER — one driver class in, one key out — and these
    // cases pin its three properties: an action gets the key for the class it names; no action can
    // enumerate the run's credentials (not from the Context, its JSON, or the resolver itself); and
    // the agent can refuse, a refusal being the platform key rather than an error.
    const KEYS = [
        { driverClass: 'OpenAIImageGenerator', apiKey: 'sk-image' },
        { driverClass: 'OpenAILLM', apiKey: 'sk-llm' },
        { driverClass: 'GeminiLLM', apiKey: 'sk-gemini' },
    ];
    const okAction = () => { harness.runAction = () => ({ Success: true, Message: 'ok', Params: [], Result: { ResultCode: 'SUCCESS' }, LogEntry: null }); };
    const script = () => [() => llmEnvelope(actionsEnvelope()), () => llmEnvelope(successEnvelope())];
    function resolverOf(call: RunActionCall): (driverClass: string) => string | undefined {
        expect(typeof call.resolveAPIKey).toBe('function');
        return call.resolveAPIKey as (driverClass: string) => string | undefined;
    }

    it('an action gets the run\'s key for the ONE driver class it names', async () => {
        okAction();
        const { agent } = makeAgent(script());
        await agent.Execute(makeParams({ apiKeys: KEYS }));
        const resolve = resolverOf(harness.runActionCalls[0]);
        expect(resolve('OpenAIImageGenerator')).toBe('sk-image');
        expect(resolve('GeminiLLM')).toBe('sk-gemini');
    });

    it('no action can enumerate the run\'s credentials — the list is on neither the Context nor the RunActionParams, and the resolver is a closure', async () => {
        // actionContext IS params.context by reference: shared by every action in the run and copied
        // into sub-agent params and run steps. A key that survives JSON.stringify is a key in the
        // database; a list an action can read is ambient authority for every action in the run.
        okAction();
        const { agent } = makeAgent(script());
        const params = makeParams({ apiKeys: KEYS, context: { tenant: 't1' } });
        await agent.Execute(params);
        const ctx = params.context as Record<string, unknown>;
        expect('apiKeys' in ctx).toBe(false);                              // nothing about keys on the shared context…
        expect('RuntimeAPIKeyResolver' in ctx).toBe(false);
        expect('resolveRuntimeAPIKey' in ctx).toBe(false);
        expect(JSON.stringify(ctx)).not.toContain('sk-');
        const call = harness.runActionCalls[0];
        expect(harness.runActionParamsJSON[0]).not.toContain('sk-');       // …and none in anything the engine could log
        expect(harness.runActionParamsJSON[0]).not.toContain('apiKeys');
        const resolve = resolverOf(call);
        expect(String(resolve)).not.toContain('sk-');                      // a closure, not a bag
        expect(resolve('')).toBeUndefined();
    });

    it('the resolver is bound to the action it was handed to — two actions in one turn get two, each naming its own action', async () => {
        // params.context is one object for the whole run, so anything stamped there is last-writer-
        // wins across parallel actions. Per dispatch, the refusing agent sees the right action.
        const seen: string[] = [];
        class RecordingAgent extends HarnessAgent {
            protected override actionMayUseRuntimeAPIKey(action: MJActionEntityExtended): boolean {
                seen.push(action.Name);
                return true;
            }
        }
        okAction();
        const agent = new RecordingAgent();
        (agent as unknown as AgentInternals)._promptRunner = new ScriptedPromptRunner([
            () => llmEnvelope(actionsEnvelope({ nextStep: { type: 'Actions', actions: [{ name: ACTION_NAME, params: { n: 1 } }, { name: ACTION_NAME, params: { n: 2 } }] } })),
            () => llmEnvelope(successEnvelope()),
        ]);
        await agent.Execute(makeParams({ apiKeys: KEYS }));
        expect(harness.runActionCalls).toHaveLength(2);
        const [a, b] = harness.runActionCalls.map(resolverOf);
        expect(a).not.toBe(b);
        a('OpenAILLM'); b('OpenAILLM');
        expect(seen).toEqual([harness.runActionCalls[0].actionName, harness.runActionCalls[1].actionName]);
    });

    it('a driver class the run has no key for resolves to the platform key — none here, so the action falls back exactly as before', async () => {
        okAction();
        const { agent } = makeAgent(script());
        await agent.Execute(makeParams({ apiKeys: KEYS }));
        expect(resolverOf(harness.runActionCalls[0])('NoSuchDriverClass_Loop_Test')).toBeUndefined();
    });

    it('the agent can refuse an action the run\'s key for a driver class — the action then sees the platform key, not an error', async () => {
        class RefusingAgent extends HarnessAgent {
            protected override actionMayUseRuntimeAPIKey(_action: MJActionEntityExtended, driverClass: string): boolean {
                return driverClass !== 'OpenAIImageGenerator';
            }
        }
        okAction();
        const agent = new RefusingAgent();
        (agent as unknown as AgentInternals)._promptRunner = new ScriptedPromptRunner(script());
        await agent.Execute(makeParams({ apiKeys: KEYS }));
        const resolve = resolverOf(harness.runActionCalls[0]);
        expect(resolve('OpenAIImageGenerator')).toBeUndefined();  // refused → platform key applies in the action
        expect(resolve('OpenAILLM')).toBe('sk-llm');               // the policy is per driver class, not all-or-nothing
    });

    it('stamps nothing when the run has no runtime keys — absent, not a resolver that answers undefined', async () => {
        okAction();
        const { agent } = makeAgent(script());
        await agent.Execute(makeParams());
        expect('resolveAPIKey' in harness.runActionCalls[0]).toBe(false);
    });
});

describe('BaseAgent.Execute — native tool results: call turn → tool turn, nothing in between', () => {
    type ToolBlock = { type: string; toolCallId?: string; toolName?: string; isError?: boolean; content?: string };
    const textOf = (m: { content: unknown }): string => (typeof m.content === 'string' ? m.content : '');

    it('answers a native action call with a `tool` turn immediately after the assistant call turn — no recap, no markdown results', async () => {
        const { agent, runner } = makeAgent([
            () => llmNativeActionCall('call_1', true),
            () => llmEnvelope(successEnvelope()),
        ]);
        const params = makeParams();
        const result = await agent.Execute(params);

        expect(result.success).toBe(true);
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions', 'Prompt']);
        // activeSkillIDs is always stamped inside a run — empty here means "in a run, no skill active".
        expect(harness.runActionCalls).toEqual([{ actionName: ACTION_NAME, params: [{ Name: 'foo', Value: 'bar', Type: 'Input' }], activeSkillIDs: [] }]);

        const messages = params.conversationMessages as Array<{ role: string; content: unknown; toolCalls?: Array<{ id: string }> }>;
        const callIndex = messages.findIndex((m) => m.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0);
        expect(callIndex).toBeGreaterThan(-1);
        expect(messages[callIndex].toolCalls?.[0].id).toBe('call_1');
        // The very next message is the tool turn answering that call — the provider contract.
        const next = messages[callIndex + 1];
        expect(next.role).toBe('tool');
        const blocks = next.content as ToolBlock[];
        expect(blocks.map((b) => [b.type, b.toolCallId, b.toolName, b.isError])).toEqual([['tool_result', 'call_1', SanitizeToolName(ACTION_NAME), false]]);
        // Neither the "[You invoked …]" recap nor the markdown "Action results:" message exists.
        expect(messages.some((m) => textOf(m).includes('You invoked'))).toBe(false);
        expect(messages.some((m) => textOf(m).startsWith('Action results:'))).toBe(false);
        // Prompt 2 saw the conversation messages with the trailing runtime state fragment appended.
        expect(runner.Calls[1].conversationMessages.slice(0, -1)).toEqual(params.conversationMessages);
        expect(runner.Calls[1].conversationMessages.at(-1)?.metadata?.volatileState).toBe(true);
    });

    it('keeps the recap and the markdown results when the catalog did not ask for native results', async () => {
        const { agent } = makeAgent([
            () => llmNativeActionCall('call_1', false),
            () => llmEnvelope(successEnvelope()),
        ]);
        const params = makeParams();
        await agent.Execute(params);
        const messages = params.conversationMessages as Array<{ role: string; content: unknown }>;
        expect(messages.some((m) => m.role === 'tool')).toBe(false);
        expect(messages.some((m) => textOf(m).includes(`You invoked the **${ACTION_NAME}** action`))).toBe(true);
        expect(messages.some((m) => textOf(m).startsWith('Action results:'))).toBe(true);
    });
});

describe('BaseAgent.Execute — cancellation', () => {
    it('a cancellation signaled during the action step stops the loop before the next prompt and finalizes the run Cancelled', async () => {
        const controller = new AbortController();
        harness.runAction = () => {
            controller.abort('user cancelled mid-action');
            return {
                Success: true,
                Message: 'Action completed',
                Params: [],
                Result: { ResultCode: 'SUCCESS' },
                LogEntry: null,
            };
        };
        const { agent, runner, flushSteps } = makeAgent([
            () => llmEnvelope(actionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams({ cancellationToken: controller.signal }));

        // The loop stopped: only ONE prompt ran; the scripted second response was never requested.
        expect(runner.Calls).toHaveLength(1);
        expect(result.success).toBe(false);

        const run = harness.run;
        expect(run.Status).toBe('Cancelled');
        expect(run.Success).toBe(false);
        expect(run.ErrorMessage).toBe('user cancelled mid-action');
        expect(run.CompletedAt).not.toBeNull();

        // Real behavior: the cancelled path bypasses finalizeAgentRun, so the fire-and-forget
        // step-save queue is NOT flushed by Execute — drain it here before asserting steps.
        await flushSteps();
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions']);
        // The action itself had already completed before the abort was observed.
        expect(harness.steps[2].Status).toBe('Completed');
    });

    it('a token aborted before execution starts yields a cancelled result without creating a run or executing a prompt', async () => {
        const controller = new AbortController();
        controller.abort('cancelled before start');
        const { agent, runner } = makeAgent([() => llmEnvelope(successEnvelope())]);

        const result = await agent.Execute(makeParams({ cancellationToken: controller.signal }));

        expect(result.success).toBe(false);
        expect(runner.Calls).toHaveLength(0);
        // Real behavior: the pre-start cancellation check runs BEFORE initializeAgentRun,
        // so no AIAgentRun record exists at all (result.agentRun is the field's initial null).
        expect(harness.runs).toHaveLength(0);
        expect(result.agentRun).toBeNull();
        expect(harness.steps).toHaveLength(0);
    });
});

describe('BaseAgent.Execute — failure finalization', () => {
    it('a fatal prompt error terminates the loop and finalizes the run Failed with the error propagated to the run entity', async () => {
        // 'No suitable model found' is one of BaseAgent.isFatalPromptError's permanent-error signatures.
        const fatalMessage = 'No suitable model found for prompt execution';
        const { agent, runner } = makeAgent([() => llmFailure(fatalMessage)]);

        const result = await agent.Execute(makeParams({ payload: { keep: true } }));

        expect(result.success).toBe(false);
        expect(runner.Calls).toHaveLength(1); // fatal → no retry

        const run = harness.run;
        expect(run.Status).toBe('Failed');
        expect(run.Success).toBe(false);
        expect(run.FinalStep).toBe('Failed');
        expect(run.ErrorMessage).toContain(fatalMessage);

        // The prompt step recorded the failure with the error message
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt']);
        expect(harness.steps[1].Status).toBe('Failed');
        expect(harness.steps[1].Success).toBe(false);
        expect(harness.steps[1].ErrorMessage).toBe(fatalMessage);
        // The failure path preserves the in-flight payload on the step record
        expect(JSON.parse(harness.steps[1].PayloadAtEnd ?? 'null')).toEqual({ keep: true });
    });

    it('a transient (non-fatal) prompt failure records a Failed step but the loop re-prompts and can still finish Completed', async () => {
        const { agent, runner } = makeAgent([
            () => llmFailure('Rate limit exceeded — 429'),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        // Real contract: a non-fatal prompt failure yields a NON-terminating 'Failed' step;
        // LoopAgentType.HandleStepFallback returns null, so the loop falls back to the prompt.
        expect(runner.Calls).toHaveLength(2);
        expect(result.success).toBe(true);
        expect(harness.run.Status).toBe('Completed');
        expect(harness.run.TotalPromptIterations).toBe(2);

        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Prompt']);
        expect(harness.steps.map((s) => s.Status)).toEqual(['Completed', 'Failed', 'Completed']);
        expect(harness.steps[1].ErrorMessage).toBe('Rate limit exceeded — 429');
    });

    it('an action returning Success=false records a Failed action step and feeds back to the prompt WITHOUT failing the run', async () => {
        harness.runAction = () => ({
            Success: false,
            Message: 'boom — downstream system unavailable',
            Params: [],
            Result: { ResultCode: 'FAILED' },
            LogEntry: null,
        });
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const params = makeParams();
        const result = await agent.Execute(params);

        // The action STEP is failed… (index 2: after the Validation + Prompt steps)
        expect(harness.steps[2].StepType).toBe('Actions');
        expect(harness.steps[2].Status).toBe('Failed');
        expect(harness.steps[2].Success).toBe(false);
        expect(harness.steps[2].ErrorMessage).toBe('boom — downstream system unavailable');

        // …but the loop continues: the result went back to the LLM, which finished the task.
        expect(runner.Calls).toHaveLength(2);
        expect(result.success).toBe(true);
        expect(harness.run.Status).toBe('Completed');

        // When an action returns Success=false, it correctly counts toward the
        // failed actions header and generates failure guidance for the model.
        const contents = params.conversationMessages.map((m) => (typeof m.content === 'string' ? m.content : ''));
        const resultsMessage = contents.find((c) => c.includes('action(s) failed:'));
        expect(resultsMessage).toBeDefined();
        expect(contents.some((c) => c.includes('Action Execution Failure Guidance'))).toBe(true);
    });
});

describe('BaseAgent.Execute — iteration guardrails', () => {
    it('MaxIterationsPerRun converts the next non-terminal decision into a terminating Failed step', async () => {
        harness.agent = makeAgentRow({ MaxIterationsPerRun: 2 });
        // The model NEVER completes: every prompt asks for another action.
        const { agent, runner } = makeAgent([() => llmEnvelope(actionsEnvelope())]);

        const result = await agent.Execute(makeParams());

        // prompt 1 (iteration 1) → action → prompt 2 (iteration 2) → guardrail trips on its decision
        expect(runner.Calls).toHaveLength(2);
        expect(harness.runActionCalls).toHaveLength(1);
        expect(result.success).toBe(false);

        const run = harness.run;
        expect(run.Status).toBe('Failed');
        expect(run.TotalPromptIterations).toBe(2);
        expect(run.ErrorMessage).toContain('Maximum iteration limit of 2 exceeded');

        // Real contract: the guardrail fails the DECISION, not the prompt step — the second
        // prompt step finalizes Completed (the prompt itself succeeded), and its OutputData
        // carries the converted Failed next-step plus the guardrail diagnostics.
        // (steps: Validation, Prompt, Actions, Prompt)
        const prompt2 = harness.steps[3];
        expect(prompt2.StepType).toBe('Prompt');
        expect(prompt2.Status).toBe('Completed');
        expect(prompt2.OutputData).toContain('Maximum iteration limit of 2 exceeded');
    });

    it('unparseable LLM output trips the consecutive-unproductive-retry breaker after 10 turns and fails the run', async () => {
        // Every turn returns prose instead of the JSON envelope → LoopAgentType returns a
        // corrective Retry (with errorMessage) every time — the exact loop the breaker exists for.
        const { agent, runner } = makeAgent([
            () => ({
                success: true,
                result: 'I am just chatting instead of returning JSON',
                chatResult: {} as AIPromptRunResult['chatResult'],
            }),
        ]);

        const result = await agent.Execute(makeParams());

        // MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES = 10: ten prompt turns, then forced termination.
        expect(runner.Calls).toHaveLength(10);
        expect(result.success).toBe(false);

        const run = harness.run;
        expect(run.Status).toBe('Failed');
        expect(run.ErrorMessage).toContain('consecutive unproductive retries');
        expect(run.TotalPromptIterations).toBe(10);

        // Every turn produced a Prompt step (all Completed — the PROMPTS succeeded; the
        // model's content was what failed validation). Plus the leading Validation step.
        expect(harness.steps).toHaveLength(11);
        expect(harness.steps[0].StepType).toBe('Validation');
        expect(harness.steps.slice(1).every((s) => s.StepType === 'Prompt')).toBe(true);

        // The corrective feedback was pushed into the conversation each turn.
        expect(
            runner.Calls[9].conversationMessages?.some(
                (m) => typeof m.content === 'string' && m.content.includes('Retrying due to:'),
            ),
        ).toBe(true);
    });
});

describe('BaseAgent.Execute — a While whose condition cannot be evaluated', () => {
    // `payload.count =` does not parse, so the loop fails before its first iteration.
    const badWhile = (): LoopAgentResponse => ({
        taskComplete: false,
        reasoning: 'Tick until the count reaches 3',
        nextStep: { type: 'While', while: { condition: 'payload.count =', itemVariable: 'attempt', action: { name: ACTION_NAME, params: {} } } },
    });
    const contentOf = (m: { content: unknown }): string => (typeof m.content === 'string' ? m.content : '');

    it('tells the model why on its next turn, so it can correct the loop', async () => {
        // The trailing runtime-state fragment (metadata.volatileState) rides as the last message of
        // EVERY request and is rebuilt each time; it is framework state, not a message the loop added,
        // so it is excluded before the turns are compared.
        const realMessages = (p: AIPromptParams): string[] =>
            (p.conversationMessages ?? [])
                .filter((m) => (m as { metadata?: { volatileState?: boolean } }).metadata?.volatileState !== true)
                .map(contentOf);
        const turns: string[][] = [];
        const { agent, runner } = makeAgent([
            (p) => { turns.push(realMessages(p)); return llmEnvelope(badWhile()); },
            (p) => { turns.push(realMessages(p)); return llmEnvelope(successEnvelope()); },
        ]);

        const result = await agent.Execute(makeParams({ payload: { count: 0 } }));

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expect(harness.runActionCalls).toHaveLength(0); // the loop body never ran
        // A Failed loop step is answered by another prompt, and nothing on that path reads the
        // step's errorMessage. Turn 2 saw exactly one new message: the loop result carrying the error.
        const added = turns[1].slice(turns[0].length);
        expect(added).toHaveLength(1);
        expect(added[0]).toContain("While condition 'payload.count =' could not be evaluated");
        expect(added[0]).toContain('not a parseable single expression');
        // The While step itself is recorded as failed with the same message.
        const whileStep = harness.steps.find((s) => s.StepType === 'While');
        expect(whileStep?.Status).toBe('Failed');
        expect(whileStep?.ErrorMessage).toContain('could not be evaluated');
    });

    it('a model that keeps emitting the bad While is stopped by the per-run iteration limit', async () => {
        // The consecutive-failed-steps breaker cannot catch this: each prompt's While decision
        // resets it, so the run alternates Prompt → Failed While until an iteration limit trips.
        harness.agent = makeAgentRow({ MaxIterationsPerRun: 4 });
        const { agent, runner } = makeAgent([() => llmEnvelope(badWhile())]);

        const result = await agent.Execute(makeParams({ payload: { count: 0 } }));

        expect(result.success).toBe(false);
        expect(runner.Calls).toHaveLength(4);
        expect(harness.run.Status).toBe('Failed');
        expect(harness.run.ErrorMessage).toContain('Maximum iteration limit of 4 exceeded');
        expect(harness.steps.filter((s) => s.StepType === 'While').map((s) => s.Status)).toEqual(['Failed', 'Failed', 'Failed']);
    });
});

describe('BaseAgent.Execute — the payload change check (opt-in with payloadFeedbackCheck)', () => {
    /** Over 100 characters, so the analyzer measures its truncation. It must never reach the decision. */
    const LONG_SUMMARY = 'The quarterly report covers revenue, churn and hiring across every region in detail. '.repeat(3);
    const SHORT_SUMMARY = 'Short.';
    const REASONING = 'The user asked for a one-line summary, so I am shortening it.';
    const CHANGE_REASONING = 'Replace the long summary with one line.';
    const CHECK_ON = JSON.stringify({ decisionsEnabled: true, payloadFeedbackCheck: true });

    const contentOf = (m: { content: unknown }): string => (typeof m.content === 'string' ? m.content : '');

    function likelihood(probability: number): AIDecisionRunResult {
        return { success: true, Answers: { change_1: { Kind: 'Likelihood', Probability: probability } } };
    }

    /**
     * Turn 1 cuts the summary to one line (a change the analyzer flags for feedback) and runs the
     * action; turn 2 finishes. Each turn records the conversation it was sent.
     */
    function truncatingScript(turns: string[][], changeRequest: LoopAgentResponse['payloadChangeRequest'] = {
        updateElements: { summary: SHORT_SUMMARY },
        reasoning: CHANGE_REASONING,
    }): Array<(params: AIPromptParams) => AIPromptRunResult> {
        // The trailing runtime-state fragment (metadata.volatileState) is rebuilt on every request; it
        // is framework state, not a message the loop added, so it is left out of each recorded turn.
        const realMessages = (p: AIPromptParams): string[] =>
            (p.conversationMessages ?? [])
                .filter((m) => (m as { metadata?: { volatileState?: boolean } }).metadata?.volatileState !== true)
                .map(contentOf);
        return [
            (p) => { turns.push(realMessages(p)); return llmEnvelope(actionsEnvelope({ reasoning: REASONING, payloadChangeRequest: changeRequest })); },
            (p) => { turns.push(realMessages(p)); return llmEnvelope(successEnvelope()); },
        ];
    }

    /** The messages the loop added between turn 1 and turn 2. */
    function addedBeforeTurn2(turns: string[][]): string[] {
        return turns[1].slice(turns[0].length);
    }

    function outputOf(step: MockStepEntity): Record<string, unknown> {
        return JSON.parse(step.OutputData ?? '{}');
    }

    it('defaults to off', () => {
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.payloadFeedbackCheck).toBe(false);
    });

    it.each([
        ['the agent does not set it', null],
        ['the agent does not set it, with the master switch on', JSON.stringify({ decisionsEnabled: true })],
        ['the agent sets it to false', JSON.stringify({ decisionsEnabled: true, payloadFeedbackCheck: false })],
        ['the agent sets it without the master switch (decisionsEnabled)', JSON.stringify({ payloadFeedbackCheck: true })],
    ])('when %s, a flagged change behaves exactly as today: no decision, no message, no extra step', async (_label, promptParams) => {
        harness.agent = makeAgentRow({ AgentTypePromptParams: promptParams });
        const turns: string[][] = [];
        const { agent, runner } = makeAgent(truncatingScript(turns));
        const ask = vi.spyOn(agent.DecisionService, 'Ask');

        const result = await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

        expect(result.success).toBe(true);
        expect(ask).not.toHaveBeenCalled();
        // The analyzer still flags the change, and that still goes to telemetry only.
        const payloadChangeResult = outputOf(harness.steps[1]).payloadChangeResult as { requiresFeedback: boolean };
        expect(payloadChangeResult.requiresFeedback).toBe(true);
        // Today's steps, and today's turn-2 additions: the action's invocation and its results.
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions', 'Prompt']);
        const added = addedBeforeTurn2(turns);
        expect(added).toHaveLength(2);
        expect(added[0]).toContain(`You invoked the **${ACTION_NAME}** action`);
        expect(added[1]).toMatch(/^Action results:/);
        // The change stands.
        expect(injectedPayload(runner.Calls[1])).toEqual({ summary: SHORT_SUMMARY });
        expect(result.payload).toEqual({ summary: SHORT_SUMMARY });
    });

    describe('when the agent turns it on', () => {
        beforeEach(() => {
            harness.agent = makeAgentRow({ AgentTypePromptParams: CHECK_ON });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('asks one Likelihood per flagged change, in one call, about the reasoning and never the payload', async () => {
            const turns: string[][] = [];
            const { agent } = makeAgent(truncatingScript(turns));
            const ask = vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValueOnce(likelihood(0.9));

            await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            expect(ask).toHaveBeenCalledTimes(1);
            const asked = ask.mock.calls[0][0];
            expect(Object.keys(asked.Questions)).toEqual(['change_1']);
            expect(asked.Questions.change_1).toEqual({
                Kind: 'Likelihood',
                Instructions: expect.stringMatching(/^Given the agent's stated reasoning, this change was intended: Content reduced by .* at "summary"$/),
            });
            const state = String(asked.State);
            expect(state).toContain(REASONING);
            expect(state).toContain(CHANGE_REASONING);
            expect(state).toContain(`from ${LONG_SUMMARY.length} to ${SHORT_SUMMARY.length} characters`);
            expect(state).not.toContain(LONG_SUMMARY.slice(0, 40));
            expect(asked.ContextUser?.ID).toBe(USER_ID);
            expect(asked.AgentID).toBe(AGENT_ID);
        });

        it('uses the agent\'s decisionPromptName', async () => {
            harness.agent = makeAgentRow({ AgentTypePromptParams: JSON.stringify({ decisionsEnabled: true, payloadFeedbackCheck: true, decisionPromptName: 'Custom Decision' }) });
            const { agent } = makeAgent(truncatingScript([]));
            const ask = vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValueOnce(likelihood(0.9));

            await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            expect(ask.mock.calls[0][0].PromptName).toBe('Custom Decision');
        });

        it('lists a change judged unintended on the next turn, and never reverts it', async () => {
            const turns: string[][] = [];
            const { agent, runner } = makeAgent(truncatingScript(turns));
            vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValueOnce(likelihood(0.1));

            const result = await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            expect(result.success).toBe(true);
            const added = addedBeforeTurn2(turns);
            expect(added).toHaveLength(3);
            expect(added[0]).toMatch(/^Payload change check: these changes to the payload may not have been intended\./);
            expect(added[0]).toContain('at "summary" (probability it was intended: 0.10)');
            expect(added[0]).toContain('Nothing was reverted.');
            // Never reverted: the agent's next turn, and the run, keep the change.
            expect(injectedPayload(runner.Calls[1])).toEqual({ summary: SHORT_SUMMARY });
            expect(result.payload).toEqual({ summary: SHORT_SUMMARY });
            expect(JSON.parse(harness.run.FinalPayload ?? 'null')).toEqual({ summary: SHORT_SUMMARY });
        });

        it('adds its message as a tool result that expires after three turns, like other results', async () => {
            const { agent } = makeAgent(truncatingScript([]));
            vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValueOnce(likelihood(0.1));
            const params = makeParams({ payload: { summary: LONG_SUMMARY } });

            await agent.Execute(params);

            const message: AgentChatMessage | undefined = params.conversationMessages.find((m) => contentOf(m).startsWith('Payload change check:'));
            expect(message?.role).toBe('user');
            expect(message?.metadata).toEqual({
                turnAdded: 1,
                messageType: 'tool-result',
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            });
        });

        it('never fails the turn: a throw inside the check fails its step, and the turn goes on', async () => {
            const turns: string[][] = [];
            const { agent, runner } = makeAgent(truncatingScript(turns));
            // QueryAgent never throws by contract; this is the guard for anything else in the check that does.
            vi.spyOn(PayloadFeedbackManager.prototype, 'QueryAgent').mockRejectedValueOnce(new Error('unexpected failure'));

            const result = await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            expect(result.success).toBe(true);
            expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Decision', 'Actions', 'Prompt']);
            expect(harness.steps.map((s) => s.Status)).toEqual(['Completed', 'Completed', 'Failed', 'Completed', 'Completed']);
            expect(harness.steps[2].ErrorMessage).toBe('unexpected failure');
            // Turn 2 is exactly what it would be with the check off, and the change stands.
            expect(addedBeforeTurn2(turns)).toHaveLength(2);
            expect(runner.Calls).toHaveLength(2);
            expect(injectedPayload(runner.Calls[1])).toEqual({ summary: SHORT_SUMMARY });
            expect(result.payload).toEqual({ summary: SHORT_SUMMARY });
        });

        it('adds nothing to the next turn for a change judged intended', async () => {
            const turns: string[][] = [];
            const { agent, runner } = makeAgent(truncatingScript(turns));
            vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValueOnce(likelihood(0.9));

            await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            const added = addedBeforeTurn2(turns);
            expect(added).toHaveLength(2);
            expect(added.some((c) => c.includes('Payload change check'))).toBe(false);
            expect(injectedPayload(runner.Calls[1])).toEqual({ summary: SHORT_SUMMARY });
        });

        it('records the check as one Decision step, with the questions and the probabilities', async () => {
            const { agent } = makeAgent(truncatingScript([]));
            vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValueOnce(likelihood(0.1));

            await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Decision', 'Actions', 'Prompt']);
            const check = harness.steps[2];
            expect(check.StepName).toContain('Payload change check');
            expect(check.Status).toBe('Completed');
            const input = JSON.parse(check.InputData ?? '{}') as { questions: Array<{ id: string; path: string; type: string; change: string }> };
            expect(input.questions).toEqual([
                { id: expect.any(String), path: 'summary', type: 'content_truncation', change: expect.stringContaining('at "summary"') },
            ]);
            const output = outputOf(check);
            expect(output.threshold).toBe(0.5);
            expect(output.probabilities).toEqual({ [input.questions[0].id]: 0.1 });
            expect(output.unintendedPaths).toEqual(['summary']);
        });

        it('counts the check toward the run\'s tokens and cost: its step carries the decision\'s prompt run', async () => {
            const CHECK_RUN = {
                ID: 'aaaaaaaa-6666-4000-8000-000000000002',
                TokensUsedRollup: 90,
                TokensPromptRollup: 80,
                TokensCompletionRollup: 10,
                TokensCacheReadRollup: 0,
                TokensCacheWriteRollup: 0,
                TotalCost: 0.0031,
            } satisfies Pick<MJAIPromptRunEntity, 'ID' | 'TokensUsedRollup' | 'TokensPromptRollup' | 'TokensCompletionRollup' | 'TokensCacheReadRollup' | 'TokensCacheWriteRollup' | 'TotalCost'>;
            const { agent } = makeAgent(truncatingScript([]));
            vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValueOnce({ ...likelihood(0.9), promptRun: CHECK_RUN as MJAIPromptRunEntity });

            await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            const check = harness.steps[2];
            expect(check.StepName).toBe('Payload change check');
            // The persisted link to the prompt run.
            expect(check.TargetLogID).toBe(CHECK_RUN.ID);
            // The run's totals read each Decision step's PromptRun. The scripted prompts carry none, so
            // the check is the run's whole spend.
            expect(harness.run.TotalCost).toBe(CHECK_RUN.TotalCost);
            expect(harness.run.TotalTokensUsed).toBe(CHECK_RUN.TokensUsedRollup);
            expect(harness.run.TotalPromptTokensUsed).toBe(CHECK_RUN.TokensPromptRollup);
            expect(harness.run.TotalCompletionTokensUsed).toBe(CHECK_RUN.TokensCompletionRollup);
        });

        it('accepts every change, adds nothing, and records why, when decisions are unavailable', async () => {
            // No spy: the harness has no 'Default Decision' prompt, so the real Ask fails.
            const turns: string[][] = [];
            const { agent, runner } = makeAgent(truncatingScript(turns));

            const result = await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            expect(result.success).toBe(true);
            expect(addedBeforeTurn2(turns)).toHaveLength(2);
            expect(injectedPayload(runner.Calls[1])).toEqual({ summary: SHORT_SUMMARY });
            const check = harness.steps[2];
            expect(check.StepType).toBe('Decision');
            expect(check.Status).toBe('Failed');
            expect(check.ErrorMessage).toBe('Accepted by default (the decision call failed: Decision prompt "Default Decision" not found)');
        });

        it('asks nothing when the analyzer flags nothing', async () => {
            const turns: string[][] = [];
            const { agent } = makeAgent(truncatingScript(turns, { newElements: { note: 'added' } }));
            const ask = vi.spyOn(agent.DecisionService, 'Ask');

            await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY } }));

            expect(ask).not.toHaveBeenCalled();
            expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions', 'Prompt']);
            expect(addedBeforeTurn2(turns)).toHaveLength(2);
        });

        describe('on a step that ends the run, where no turn would read its message', () => {
            const CHANGE: LoopAgentResponse['payloadChangeRequest'] = { updateElements: { summary: SHORT_SUMMARY }, reasoning: CHANGE_REASONING };

            it.each<[string, LoopAgentResponse]>([
                ['a Success step', successEnvelope({ reasoning: REASONING, payloadChangeRequest: CHANGE })],
                ['a Chat step', { taskComplete: false, message: 'Which region should the summary cover?', nextStep: { type: 'Chat' }, reasoning: REASONING, payloadChangeRequest: CHANGE }],
                [
                    'a step that terminates (client tools sent with taskComplete)',
                    { taskComplete: true, message: 'I opened the record.', nextStep: { type: 'ClientTools', clientTools: [{ name: 'OpenRecord', params: {} }] }, reasoning: REASONING, payloadChangeRequest: CHANGE },
                ],
            ])('skips it on %s: no decision call, no step, and nothing added to the caller\'s conversation', async (_label, envelope) => {
                vi.spyOn(ClientToolRequestManager.Instance, 'RequestClientTool').mockResolvedValue({ RequestID: 'ct-1', Success: true, Result: 'opened' });
                const { agent, runner } = makeAgent([() => llmEnvelope(envelope), () => llmEnvelope(successEnvelope())]);
                // Answered "unintended", so a check that ran would add its message.
                const ask = vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValue(likelihood(0.1));
                const params = makeParams({ payload: { summary: LONG_SUMMARY }, sessionID: 'session-1' });

                const result = await agent.Execute(params);

                expect(result.success).toBe(true);
                expect(runner.Calls).toHaveLength(1);
                expect(ask).not.toHaveBeenCalled();
                expect(harness.steps.some((s) => s.StepType === 'Decision')).toBe(false);
                // The analyzer still flagged the change, so the check was on and skipped.
                const payloadChangeResult = outputOf(harness.steps[1]).payloadChangeResult as { requiresFeedback: boolean };
                expect(payloadChangeResult.requiresFeedback).toBe(true);
                // params.conversationMessages is the caller's own array, so nothing may be left in it.
                expect(params.conversationMessages.map(contentOf).some((c) => c.includes('Payload change check'))).toBe(false);
            });

            it('still runs on client tools sent without taskComplete: the prompt after the tools reads it', async () => {
                vi.spyOn(ClientToolRequestManager.Instance, 'RequestClientTool').mockResolvedValue({ RequestID: 'ct-1', Success: true, Result: 'opened' });
                const clientTools: LoopAgentResponse = {
                    taskComplete: false,
                    nextStep: { type: 'ClientTools', clientTools: [{ name: 'OpenRecord', params: {} }] },
                    reasoning: REASONING,
                    payloadChangeRequest: CHANGE,
                };
                const { agent, runner } = makeAgent([() => llmEnvelope(clientTools), () => llmEnvelope(successEnvelope())]);
                const ask = vi.spyOn(agent.DecisionService, 'Ask').mockResolvedValue(likelihood(0.1));

                await agent.Execute(makeParams({ payload: { summary: LONG_SUMMARY }, sessionID: 'session-1' }));

                expect(ask).toHaveBeenCalledOnce();
                expect(runner.Calls[1].conversationMessages?.map(contentOf).some((c) => c.startsWith('Payload change check:'))).toBe(true);
            });
        });
    });
});

describe('BaseAgent.Execute — decisions on a turn', () => {
    /** The decision call's own prompt run, as AIDecisionRunner returns it once finalized. */
    const DECISION_RUN = {
        ID: 'aaaaaaaa-6666-4000-8000-000000000001',
        TokensUsedRollup: 120,
        TokensPromptRollup: 100,
        TokensCompletionRollup: 20,
        TokensCacheReadRollup: 0,
        TokensCacheWriteRollup: 0,
        TotalCost: 0.0042,
    } satisfies Pick<MJAIPromptRunEntity, 'ID' | 'TokensUsedRollup' | 'TokensPromptRollup' | 'TokensCompletionRollup' | 'TokensCacheReadRollup' | 'TokensCacheWriteRollup' | 'TotalCost'>;
    const TRIAGE: AgentDecisionRequest = { id: 'triage', state: 'The printer is on fire.', questions: { urgent: { kind: 'Likelihood', instructions: 'Is this urgent?' } } };
    const FINISH_IF: AgentFinishIf = { questions: ['The results show the action ran.'], message: 'Done, the action ran.' };
    const textOf = (m: { content: unknown }): string => (typeof m.content === 'string' ? m.content : '');
    const statusLines = (): string[] => vi.mocked(LogStatus).mock.calls.map(([message]) => String(message));
    /** The log lines that skip held decision requests. Every way out of the run must log them exactly once. */
    const skippedLines = (): string[] => statusLines().filter((line) => line.startsWith('[Decisions] Skipped') && line.includes('held decision request(s)'));

    /** Answers the finishIf gate (questions q1…) with `gateProbability`, and every decision request with `urgent` 0.8. */
    function answerDecisions(gateProbability = 0.95) {
        return vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(async (args) => 'q1' in args.Questions
            ? { success: true, Answers: { q1: { Kind: 'Likelihood', Probability: gateProbability } } }
            : { success: true, Answers: { urgent: { Kind: 'Likelihood', Probability: 0.8 } }, promptRun: DECISION_RUN as MJAIPromptRunEntity });
    }

    /** Asked only the decision requests, never the gate. */
    const decisionCalls = (ask: ReturnType<typeof answerDecisions>) => ask.mock.calls.filter(([args]) => !('q1' in args.Questions));

    /** The agent's own prompt params: decisions are opt-in, and need the master switch, so every agent here turns both on. */
    const DECISIONS_ON = JSON.stringify({ decisionsEnabled: true, includeDecisionsDocs: true });

    /** Run params for an agent whose finishIf gates are `mode` (gates are opt-in; the default is off). */
    function gateParams(mode: 'on' | 'shadow'): ExecuteAgentParams {
        return makeParams({ data: { __agentTypePromptParams: { finishIfMode: mode } } });
    }

    function gatedActionsEnvelope(): LoopAgentResponse {
        return {
            taskComplete: false,
            nextStep: { type: 'Actions', actions: [{ name: ACTION_NAME, params: { foo: 'bar' } }], finishIf: FINISH_IF },
            decisions: [TRIAGE],
        };
    }

    function clientToolsEnvelope(taskComplete: boolean): LoopAgentResponse {
        return {
            taskComplete,
            message: 'I opened the record.',
            nextStep: { type: 'ClientTools', clientTools: [{ name: 'OpenRecord', params: {} }] },
            decisions: [TRIAGE],
        };
    }

    function subAgentEnvelope(): LoopAgentResponse {
        return {
            taskComplete: false,
            nextStep: { type: 'Sub-Agent', subAgent: { name: 'Worker', message: 'Handle it', terminateAfter: true } },
            decisions: [TRIAGE],
        };
    }

    beforeEach(() => {
        vi.mocked(LogStatus).mockClear();
        harness.agent = makeAgentRow({ AgentTypePromptParams: DECISIONS_ON });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('answers a turn\'s decisions as Decision steps and hands the results to the next prompt', async () => {
        const ask = answerDecisions();
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope({ decisions: [TRIAGE] })),
            () => llmEnvelope(successEnvelope()),
        ]);
        const params = makeParams();

        const result = await agent.Execute(params);

        expect(result.success).toBe(true);
        expect(ask).toHaveBeenCalledOnce();
        expect(ask.mock.calls[0][0].State).toBe('The printer is on fire.');
        // Answered inline, while the prompt that asked is processed — before the actions run.
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Decision', 'Actions', 'Prompt']);
        expect(harness.steps[2].StepName).toContain('Decision: triage');
        expect(harness.steps[2].Status).toBe('Completed');
        const injected = params.conversationMessages.map(textOf).find((c) => c.startsWith('Decision results:'));
        expect(injected).toContain('"id":"triage"');
        expect(injected).toContain('"probability":0.8');
        // The next prompt reads them. It gets a copy with the trailing runtime state appended, not
        // the same array, so check the content it received.
        expect(runner.Calls[1].conversationMessages?.map(textOf).some((c) => c.startsWith('Decision results:'))).toBe(true);
    });

    it('skips the decisions of an agent that has not opted in, and still runs the rest of the turn', async () => {
        harness.agent = makeAgentRow({ AgentTypePromptParams: JSON.stringify({ decisionsEnabled: true }) });
        const ask = answerDecisions();
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope({ decisions: [TRIAGE] })),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(ask).not.toHaveBeenCalled();
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions', 'Prompt']);
        // The prompt the model saw left the decisions docs and field out.
        expect(runner.Calls[0].data).toMatchObject({
            __agentTypePromptParams: { includeDecisionsDocs: false, includeResponseTypeDefinition: { decisions: false } },
        });
    });

    it('skips the decisions of an agent without the master switch, even with the docs and the response field set explicitly', async () => {
        harness.agent = makeAgentRow({ AgentTypePromptParams: JSON.stringify({ includeDecisionsDocs: true, includeResponseTypeDefinition: { decisions: true } }) });
        const ask = answerDecisions();
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope({ decisions: [TRIAGE] })),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(ask).not.toHaveBeenCalled();
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions', 'Prompt']);
        expect(runner.Calls[0].data).toMatchObject({
            __agentTypePromptParams: { includeDecisionsDocs: false, includeResponseTypeDefinition: { decisions: false, finishIf: false } },
        });
    });

    it('asks neither a finishIf gate nor the decisions without the master switch, whatever finishIfMode says', async () => {
        harness.agent = makeAgentRow({ AgentTypePromptParams: JSON.stringify({ includeDecisionsDocs: true }) });
        const ask = answerDecisions(0.95);
        const { agent, runner } = makeAgent([
            () => llmEnvelope(gatedActionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(gateParams('on'));

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expect(ask).not.toHaveBeenCalled();
        expect(harness.steps.some((s) => s.StepType === 'Decision')).toBe(false);
        expect(runner.Calls[0].data).toMatchObject({ __agentTypePromptParams: { includeFinishIfDocs: false } });
    });

    it('answers a decisions field that is not an array with one failed result, and keeps the rest of the turn', async () => {
        const ask = answerDecisions();
        // What a model can send: the envelope parses, but `decisions` is not the array the type promises.
        const malformed: AIPromptRunResult = {
            success: true,
            result: JSON.stringify({ ...actionsEnvelope(), decisions: 'triage' }),
            chatResult: {} as AIPromptRunResult['chatResult'],
        };
        const { agent } = makeAgent([() => malformed, () => llmEnvelope(successEnvelope())]);
        const params = makeParams();

        const result = await agent.Execute(params);

        expect(result.success).toBe(true);
        expect(ask).not.toHaveBeenCalled();
        // The turn's Actions step still ran: the prompt was not thrown away and retried.
        expect(harness.runActionCalls).toHaveLength(1);
        expect(params.conversationMessages.map(textOf).some((c) => c.startsWith('Decision results:') && c.includes('must be an array'))).toBe(true);
    });

    it('counts a decision call toward the run\'s tokens and cost, through its step\'s prompt run', async () => {
        answerDecisions();
        const { agent } = makeAgent([
            () => llmEnvelope(actionsEnvelope({ decisions: [TRIAGE] })),
            () => llmEnvelope(successEnvelope()),
        ]);

        await agent.Execute(makeParams());

        const decisionStep = harness.steps.find((s) => s.StepType === 'Decision');
        expect(decisionStep?.TargetLogID).toBe(DECISION_RUN.ID);
        // The scripted prompts carry no prompt run, so the decision call is the run's whole spend.
        expect(harness.run.TotalCost).toBe(DECISION_RUN.TotalCost);
        expect(harness.run.TotalTokensUsed).toBe(DECISION_RUN.TokensUsedRollup);
        expect(harness.run.TotalPromptTokensUsed).toBe(DECISION_RUN.TokensPromptRollup);
        expect(harness.run.TotalCompletionTokensUsed).toBe(DECISION_RUN.TokensCompletionRollup);
    });

    it('stops the run at MaxCostPerRun when the decision calls alone exceed it', async () => {
        harness.agent = makeAgentRow({ MaxCostPerRun: 0.001, AgentTypePromptParams: DECISIONS_ON });
        answerDecisions();
        const { agent } = makeAgent([
            () => llmEnvelope(actionsEnvelope({ decisions: [TRIAGE] })),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(harness.run.ErrorMessage).toContain('Maximum cost limit of $0.001 exceeded');
        expect(harness.runActionCalls).toHaveLength(0);
    });

    it('never asks decisions sent with a finishIf gate that ends the run, and logs that they were skipped', async () => {
        const ask = answerDecisions(0.95);
        const { agent, runner } = makeAgent([
            () => llmEnvelope(gatedActionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(gateParams('on'));

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(1);
        expect(harness.run.Message).toBe(FINISH_IF.message);
        expect(decisionCalls(ask)).toHaveLength(0);
        expect(harness.steps.some((s) => s.StepName.includes('Decision: triage'))).toBe(false);
        expect(skippedLines()).toEqual([expect.stringContaining('Skipped 1 held decision request(s) (triage)')]);
        expect(skippedLines()[0]).toContain('the run ended after the step that carried them');
        expect(skippedLines()[0]).toContain('finishIf gate');
    });

    it('asks decisions sent with a finishIf gate that does not pass, before the next prompt reads them', async () => {
        const ask = answerDecisions(0.4);
        const { agent, runner } = makeAgent([
            () => llmEnvelope(gatedActionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);
        const params = gateParams('on');

        const result = await agent.Execute(params);

        expect(result.success).toBe(true);
        expect(decisionCalls(ask)).toHaveLength(1);
        // Held through the actions and the gate, then answered ahead of the prompt that reads them.
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Actions', 'Decision', 'Decision', 'Prompt']);
        expect(harness.steps[3].StepName).toContain('Finish check');
        expect(harness.steps[4].StepName).toContain('Decision: triage');
        expect(runner.Calls[1].conversationMessages?.map(textOf).some((c) => c.startsWith('Decision results:') && c.includes('"id":"triage"'))).toBe(true);
    });

    it('in shadow mode, records a passing gate, does not end the run, and asks the decisions for the next prompt', async () => {
        const ask = answerDecisions(0.95);
        const { agent, runner } = makeAgent([
            () => llmEnvelope(gatedActionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(gateParams('shadow'));

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expect(harness.run.Message).not.toBe(FINISH_IF.message);
        expect(decisionCalls(ask)).toHaveLength(1);
        expect(harness.steps.some((s) => s.StepName.includes('Finish check'))).toBe(true);
    });

    it('with gates off (the default), asks no gate, and asks the decisions for the next prompt', async () => {
        const ask = answerDecisions(0.95);
        const { agent, runner } = makeAgent([
            () => llmEnvelope(gatedActionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expect(ask.mock.calls.some(([args]) => 'q1' in args.Questions)).toBe(false);
        expect(decisionCalls(ask)).toHaveLength(1);
        expect(harness.steps.some((s) => s.StepName.includes('Finish check'))).toBe(false);
    });

    it('never asks decisions sent with client tools and taskComplete, which end the run once the tools return', async () => {
        const ask = answerDecisions();
        vi.spyOn(ClientToolRequestManager.Instance, 'RequestClientTool').mockResolvedValue({ RequestID: 'ct-1', Success: true, Result: 'opened' });
        const { agent, runner } = makeAgent([
            () => llmEnvelope(clientToolsEnvelope(true)),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams({ sessionID: 'session-1' }));

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(1);
        expect(ask).not.toHaveBeenCalled();
        expect(harness.steps.some((s) => s.StepType === 'Decision')).toBe(false);
        expect(skippedLines()).toEqual([expect.stringContaining('Skipped 1 held decision request(s) (triage)')]);
        expect(skippedLines()[0]).toContain('taskComplete');
    });

    it('asks decisions sent with client tools alone at once: the prompt after the tools reads them', async () => {
        const ask = answerDecisions();
        vi.spyOn(ClientToolRequestManager.Instance, 'RequestClientTool').mockResolvedValue({ RequestID: 'ct-1', Success: true, Result: 'opened' });
        const { agent, runner } = makeAgent([
            () => llmEnvelope(clientToolsEnvelope(false)),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams({ sessionID: 'session-1' }));

        expect(result.success).toBe(true);
        expect(ask).toHaveBeenCalledOnce();
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Decision', 'Tool', 'Prompt']);
        expect(runner.Calls[1].conversationMessages?.map(textOf).some((c) => c.startsWith('Decision results:'))).toBe(true);
    });

    it('never asks decisions sent with a sub-agent that has terminateAfter, and logs that they were skipped', async () => {
        const ask = answerDecisions();
        const { agent, runner, internals } = makeAgent([
            () => llmEnvelope(subAgentEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);
        vi.spyOn(internals, 'validateSubAgentNextStep').mockImplementation(async (_params, nextStep) => nextStep);
        const runSubAgent = vi.spyOn(internals, 'processSubAgentStep').mockResolvedValue({ step: 'Success', terminate: true, newPayload: {} });

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(runSubAgent).toHaveBeenCalledOnce();
        expect(runner.Calls).toHaveLength(1);
        expect(ask).not.toHaveBeenCalled();
        expect(skippedLines()).toEqual([expect.stringContaining('Skipped 1 held decision request(s) (triage)')]);
        expect(skippedLines()[0]).toContain('terminateAfter');
    });

    it('still asks held decisions when the step that carried them does not end the run after all', async () => {
        // No sub-agent named Worker exists, so validation turns the step into a Retry and the run goes on.
        const ask = answerDecisions();
        const { agent, runner } = makeAgent([
            () => llmEnvelope(subAgentEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(ask).toHaveBeenCalledOnce();
        expect(harness.steps.map((s) => s.StepType)).toEqual(['Validation', 'Prompt', 'Decision', 'Prompt']);
        expect(runner.Calls[1].conversationMessages?.map(textOf).some((c) => c.startsWith('Decision results:'))).toBe(true);
    });

    it('logs held decisions exactly once when the run is cancelled before they are asked', async () => {
        // The gate does not pass, so the decisions stay held for the next prompt, which the cancellation stops.
        const ask = answerDecisions(0.4);
        const controller = new AbortController();
        harness.runAction = () => {
            controller.abort('user cancelled mid-action');
            return { Success: true, Message: 'Action completed', Params: [], Result: { ResultCode: 'SUCCESS' }, LogEntry: null };
        };
        const { agent, runner } = makeAgent([
            () => llmEnvelope(gatedActionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute({ ...gateParams('on'), cancellationToken: controller.signal });

        expect(result.success).toBe(false);
        expect(harness.run.Status).toBe('Cancelled');
        expect(runner.Calls).toHaveLength(1);
        expect(decisionCalls(ask)).toHaveLength(0);
        expect(skippedLines()).toEqual([expect.stringContaining('Skipped 1 held decision request(s) (triage)')]);
        expect(skippedLines()[0]).toContain('the run was cancelled before they were asked');
        expect(skippedLines()[0]).toContain('finishIf gate');
    });

    it('logs held decisions exactly once when a step throws out of the loop', async () => {
        const ask = answerDecisions();
        const { agent, runner, internals } = makeAgent([
            () => llmEnvelope(subAgentEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);
        vi.spyOn(internals, 'validateSubAgentNextStep').mockImplementation(async (_params, nextStep) => nextStep);
        vi.spyOn(internals, 'processSubAgentStep').mockRejectedValue(new Error('sub-agent host crashed'));

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(harness.run.Status).toBe('Failed');
        expect(harness.run.ErrorMessage).toContain('sub-agent host crashed');
        expect(runner.Calls).toHaveLength(1);
        expect(ask).not.toHaveBeenCalled();
        expect(skippedLines()).toEqual([expect.stringContaining('Skipped 1 held decision request(s) (triage)')]);
        expect(skippedLines()[0]).toContain('the run failed before they were asked');
        expect(skippedLines()[0]).toContain('terminateAfter');
    });

    it('tells the next prompt which decision calls the per-turn call budget skipped', async () => {
        const ask = answerDecisions();
        const batch: AgentDecisionRequest = { id: 'batch', forEachItemIn: 'payload.tickets', questions: TRIAGE.questions };
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope({ decisions: [batch, TRIAGE] })),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams({
            payload: { tickets: ['Printer on fire.', 'Password reset.', 'Coffee machine.'] },
            data: { __agentTypePromptParams: { decisionsMaxCallsPerTurn: 2 } },
        }));

        expect(result.success).toBe(true);
        // Three items and one single request want four calls; the budget allows two.
        expect(decisionCalls(ask)).toHaveLength(2);
        const injected = runner.Calls[1].conversationMessages?.map(textOf).find((c) => c.startsWith('Decision results:'));
        expect(injected).toContain('"id":"batch","success":true,"answers":');
        expect(injected).toContain('"skippedCount":1');
        expect(injected).toContain('"id":"triage","success":false');
        expect(injected).toContain('at most 2 decision calls in total');
    });
});

describe('BaseAgent.Execute — a finishIfMode that is not a mode', () => {
    const SECOND_AGENT_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';

    /** The warnings about finishIfMode, in the order they were logged. */
    const finishIfModeWarnings = (): string[] => vi.mocked(LogErrorEx).mock.calls
        .map(([options]) => (typeof options === 'string' ? options : options.message))
        .filter((message) => message.includes('finishIfMode'));

    /**
     * Runs the agent for two prompt turns with `finishIfMode` as a runtime override, which merges the
     * prompt params again on every turn, the path that would warn on every turn without the dedupe.
     */
    async function runWithMode(finishIfMode: string): Promise<void> {
        const { agent, runner } = makeAgent([
            () => llmEnvelope(actionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);
        const result = await agent.Execute(makeParams({ data: { __agentTypePromptParams: { finishIfMode } } }));
        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
    }

    beforeEach(() => {
        vi.mocked(LogErrorEx).mockClear();
    });

    // The warned-about set is process-wide, so each test below uses values no other test uses.

    it('warns once, naming the agent and the value, however many turns and runs read it', async () => {
        await runWithMode('On');
        await runWithMode('On');

        expect(finishIfModeWarnings()).toHaveLength(1);
        const [warning] = finishIfModeWarnings();
        expect(warning).toContain("Agent 'Loop Test Agent'");
        expect(warning).toContain('finishIfMode "On"');
        expect(warning).toContain("not one of 'off', 'shadow', 'on'");
        expect(warning).toContain('gates are off');
    });

    it('warns again for a different value, and for a different agent with the same value', async () => {
        await runWithMode('true');
        await runWithMode('Shadow');
        await runWithMode('true');
        harness.agent = makeAgentRow({ ID: SECOND_AGENT_ID, Name: 'Second Loop Agent' });
        await runWithMode('true');

        expect(finishIfModeWarnings()).toEqual([
            expect.stringContaining(`Agent 'Loop Test Agent' has finishIfMode "true"`),
            expect.stringContaining(`Agent 'Loop Test Agent' has finishIfMode "Shadow"`),
            expect.stringContaining(`Agent 'Second Loop Agent' has finishIfMode "true"`),
        ]);
    });

    it('does not warn for a valid mode or an absent one', async () => {
        await runWithMode('shadow');
        await runWithMode('off');
        const { agent } = makeAgent([() => llmEnvelope(successEnvelope())]);
        await agent.Execute(makeParams());

        expect(finishIfModeWarnings()).toEqual([]);
    });

    it('logs only the start of a huge value from a run request, and still warns about it once', async () => {
        const huge = `huge-${'x'.repeat(200_000)}`;

        await runWithMode(huge);
        await runWithMode(huge);

        expect(finishIfModeWarnings()).toHaveLength(1);
        const [warning] = finishIfModeWarnings();
        expect(warning).toContain(`finishIfMode "${huge.slice(0, FINISH_IF_MODE_WARNING_SHOWN_MAX)}"… (${huge.length} characters)`);
        expect(warning).not.toContain(huge.slice(0, FINISH_IF_MODE_WARNING_SHOWN_MAX + 1));
        expect(warning.length).toBeLessThan(500);
    });

    // Runs last in this block: it fills the process-wide memory of reported values.
    it(`remembers at most ${FINISH_IF_MODE_WARNINGS_REMEMBERED} agent and value pairs, so a run request per value cannot grow it without bound`, () => {
        const agent = new HarnessAgent();
        const agentRow = makeParams().agent;
        const merge = (finishIfMode: string): void => {
            agent.MergePromptParams(agentRow, { finishIfMode });
        };

        merge('flood-first');
        for (let i = 0; i < FINISH_IF_MODE_WARNINGS_REMEMBERED; i++) {
            merge(`flood-${i}`);
        }
        const newest = `flood-${FINISH_IF_MODE_WARNINGS_REMEMBERED - 1}`;
        merge(newest);
        merge('flood-first');

        const warnings = finishIfModeWarnings();
        // Every value warned once. The newest is still remembered, so it did not warn again, but
        // 'flood-first' was the pair seen least recently when the memory filled, so it was dropped
        // to keep the memory at its cap, and it warned a second time.
        expect(warnings).toHaveLength(FINISH_IF_MODE_WARNINGS_REMEMBERED + 2);
        expect(warnings.filter((w) => w.includes(`"${newest}"`))).toHaveLength(1);
        expect(warnings.filter((w) => w.includes('"flood-first"'))).toHaveLength(2);
    });
});

describe("BaseAgent.Execute — a memory rerank's cost", () => {
    /** The rerank's own prompt run, whose rollups hold its decision calls' tokens and cost once it is finalized. */
    const RERANK_RUN = {
        ID: 'aaaaaaaa-7777-4000-8000-000000000001',
        TokensUsedRollup: 420,
        TokensPromptRollup: 400,
        TokensCompletionRollup: 20,
        TokensCacheReadRollup: 0,
        TokensCacheWriteRollup: 0,
        TotalCost: 0.004,
    } satisfies Pick<MJAIPromptRunEntity, 'ID' | 'TokensUsedRollup' | 'TokensPromptRollup' | 'TokensCompletionRollup' | 'TokensCacheReadRollup' | 'TokensCacheWriteRollup' | 'TotalCost'>;

    /** The rerank step fields the run's totals read. */
    type RerankStepFields = Pick<MJAIAgentRunStepEntityExtended, 'ID' | 'StepType' | 'StepName' | 'Status' | 'PromptRun'>;

    /** The rerank step RerankerService creates, through the seam onto the full step entity. */
    function rerankStep(): MJAIAgentRunStepEntityExtended {
        const fields: RerankStepFields = {
            ID: 'aaaaaaaa-7777-4000-8000-000000000002',
            StepType: 'Decision',
            StepName: 'Rerank Notes',
            Status: 'Completed',
            PromptRun: RERANK_RUN as MJAIPromptRunEntity,
        };
        return fields as MJAIAgentRunStepEntityExtended;
    }

    /** Stands in for the notes rerank: it reports its step the way RerankerService does, and returns no notes. */
    function rerankNotesWithCost() {
        return vi.spyOn(AgentContextInjector.prototype, 'GetNotesForContext').mockImplementation(async params => {
            params.observability?.OnStepCreated?.(rerankStep());
            return [];
        });
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("adds the rerank step to the run's steps and counts its prompt run toward the run's tokens and cost", async () => {
        harness.agent = makeAgentRow({ InjectNotes: true });
        const getNotes = rerankNotesWithCost();
        const { agent } = makeAgent([() => llmEnvelope(successEnvelope())]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(true);
        expect(getNotes).toHaveBeenCalledOnce();
        expect(getNotes.mock.calls[0][0].observability?.agentRunID).toBe(harness.run.ID);
        expect(harness.run.Steps.map(s => s.ID)).toContain(rerankStep().ID);
        // The scripted prompt carries no prompt run, so the rerank is the run's whole spend.
        expect(harness.run.TotalCost).toBe(RERANK_RUN.TotalCost);
        expect(harness.run.TotalTokensUsed).toBe(RERANK_RUN.TokensUsedRollup);
        expect(harness.run.TotalPromptTokensUsed).toBe(RERANK_RUN.TokensPromptRollup);
    });

    it('stops the run at MaxCostPerRun when the rerank alone exceeds it', async () => {
        harness.agent = makeAgentRow({ InjectNotes: true, MaxCostPerRun: 0.001 });
        rerankNotesWithCost();
        const { agent } = makeAgent([
            () => llmEnvelope(actionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(harness.run.ErrorMessage).toContain('Maximum cost limit of $0.001 exceeded');
        expect(harness.runActionCalls).toHaveLength(0);
    });

    it('stops the run at MaxTokensPerRun when the rerank alone exceeds it', async () => {
        harness.agent = makeAgentRow({ InjectNotes: true, MaxTokensPerRun: 100 });
        rerankNotesWithCost();
        const { agent } = makeAgent([
            () => llmEnvelope(actionsEnvelope()),
            () => llmEnvelope(successEnvelope()),
        ]);

        const result = await agent.Execute(makeParams());

        expect(result.success).toBe(false);
        expect(harness.run.ErrorMessage).toContain('Maximum token limit of 100 exceeded');
        expect(harness.runActionCalls).toHaveLength(0);
    });
});

describe('BaseAgent.buildAgentBaseCatalog — relationship targets', () => {
    const LEAD_ID = 'aaaaaaaa-4444-4000-8000-000000000001';
    const SKIP_ID = 'aaaaaaaa-4444-4000-8000-000000000002';
    const RESEARCH_ID = 'aaaaaaaa-4444-4000-8000-000000000003';

    it('leaves a Disabled relationship target out of the sub-agent catalog', () => {
        const lead = makeAgentRow({ ID: LEAD_ID, Name: 'Dashboards Expert' });
        const engine = {
            Agents: [
                lead,
                makeAgentRow({ ID: SKIP_ID, Name: 'Skip', Status: 'Disabled' }),
                makeAgentRow({ ID: RESEARCH_ID, Name: 'Research Agent' }),
            ],
            AgentRelationships: [
                { AgentID: LEAD_ID, SubAgentID: SKIP_ID, Status: 'Active' },
                { AgentID: LEAD_ID, SubAgentID: RESEARCH_ID, Status: 'Active' },
            ],
            AgentActions: [],
            AgentTypes: [],
        };

        const catalog = new HarnessAgent().ExposeBuildAgentBaseCatalog(
            lead as unknown as MJAIAgentEntityExtended,
            engine as unknown as AIEngine,
        );

        expect(catalog.uniqueActiveSubAgents.map(a => a.Name)).toEqual(['Research Agent']);
        expect(catalog.subAgentCount).toBe(1);
        expect(catalog.subAgentDetails).toContain('Research Agent');
        expect(catalog.subAgentDetails).not.toContain('Skip');
    });
});
