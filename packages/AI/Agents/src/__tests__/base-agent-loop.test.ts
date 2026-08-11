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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { BaseAgentType } from '../agent-types/base-agent-type';
// Bare side-effect import: the REAL LoopAgentType must register itself with the ClassFactory
// (its @RegisterClass decorator) so BaseAgentType.GetAgentTypeInstance resolves DriverClass
// 'LoopAgentType'. A named-but-unreferenced import would be dropped by the TS transform.
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import type { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
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

    /** The row set the mocked AIEngine.Instance serves. */
    public get engineInstance(): Record<string, unknown> {
        const agentActionRow = {
            ID: AGENT_ACTION_ID,
            AgentID: AGENT_ID,
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
                { ID: 'aaaaaaaa-3333-4000-8000-000000000001', AgentID: AGENT_ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
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
            RunAction: async (input: { Action: { Name: string }; Params: ScriptedActionParam[] }): Promise<ScriptedActionResult> => {
                const call: RunActionCall = { actionName: input.Action.Name, params: input.Params };
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
}

/** Structural view of the private members the harness touches (step-save test pattern). */
interface AgentInternals {
    _promptRunner: ScriptedPromptRunner;
    _stepSaveQueue: { Flush(): Promise<FlushResult> };
}

function makeAgent(script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>): {
    agent: HarnessAgent;
    runner: ScriptedPromptRunner;
    flushSteps: () => Promise<FlushResult>;
} {
    const agent = new HarnessAgent();
    const runner = new ScriptedPromptRunner(script);
    const internals = agent as unknown as AgentInternals;
    internals._promptRunner = runner;
    return { agent, runner, flushSteps: () => internals._stepSaveQueue.Flush() };
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
            { actionName: ACTION_NAME, params: [{ Name: 'foo', Value: 'bar', Type: 'Input' }] },
        ]);

        // The ActionExecutionLog ID was stamped onto the Actions step (index 2: after Validation + Prompt)
        expect(harness.steps[2].TargetLogID).toBe(ACTION_LOG_ID);

        // The loop pushed BOTH the invocation record and the results message into the conversation,
        // and prompt 2 received them (same mutated array).
        const contents = params.conversationMessages.map((m) => (typeof m.content === 'string' ? m.content : ''));
        expect(contents.some((c) => c.includes(`You invoked the **${ACTION_NAME}** action`))).toBe(true);
        expect(contents.some((c) => c.startsWith('Action results:'))).toBe(true);
        expect(runner.Calls[1].conversationMessages).toBe(params.conversationMessages);
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

        // Surprising-but-real behavior: only actions that THROW count toward the
        // "N of M action(s) failed" header — a returned Success=false still renders
        // under the plain "Action results:" header (with its FAILED result code).
        const contents = params.conversationMessages.map((m) => (typeof m.content === 'string' ? m.content : ''));
        const resultsMessage = contents.find((c) => c.includes('Action results:'));
        expect(resultsMessage).toBeDefined();
        expect(contents.some((c) => c.includes('action(s) failed'))).toBe(false);
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
