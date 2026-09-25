/**
 * Tests for Fix 2A: High-Priority Action Failure Directives and In-Memory Circuit Breaker.
 *
 * Verifies:
 * 1. isFatalActionError correctly classifies unrecoverable credential/auth errors vs recoverable errors.
 * 2. ExecuteSingleAction tracks fatal and consecutive failures and short-circuits subsequent attempts in 0ms.
 * 3. executeActionsStep generates high-priority [CRITICAL/ACTION_UNAVAILABLE] and [WARNING/ACTION_FAILURE]
 *    directives in conversation messages to prevent LLMs from looping on broken tools under trailing state.
 * 4. Markdown action results include actionable guidance notes for both fatal and recoverable failures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent, CircuitBreakerActionResult } from '../base-agent';
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ActionResult, RunActionParams } from '@memberjunction/actions-base';

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
// Harness IDs
// ============================================================================

const AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TYPE_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const ACTION_ID = 'aaaaaaaa-0000-4000-8000-000000000005';
const AGENT_ACTION_ID = 'aaaaaaaa-0000-4000-8000-000000000006';
const STORAGE_ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000007';
const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000008';
const ACTION_NAME = 'Perplexity Search';

// ============================================================================
// Harness state & entity stubs
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
    public PayloadAtEnd: string | null = null;
    public Skills: string | null = null;

    constructor(private readonly seq: number) {}

    public NewRecord(): void {
        this.ID = `aaaaaaaa-1111-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
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

class FailureHarness {
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];
    public runActionCallCount = 0;
    public runAction: () => ActionResult = () => {
        this.runActionCallCount++;
        const ar = new ActionResult();
        ar.Success = true;
        ar.Message = 'Action completed';
        ar.Result = { ResultCode: 'SUCCESS' } as unknown as import('@memberjunction/core-entities').MJActionResultCodeEntity;
        return ar;
    };

    private stepSeq = 0;
    private readonly catalog = new Map<string, unknown>();

    public get engineInstance(): Record<string, unknown> {
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
            AgentActions: [
                {
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
                },
            ],
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

    public get actionEngineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Actions: [
                {
                    ID: ACTION_ID,
                    Name: ACTION_NAME,
                    Description: 'Search via Perplexity',
                    Status: 'Active',
                    Params: { Items: [] },
                    ResultCodes: { Items: [] },
                },
            ],
            RunAction: async () => this.runAction(),
        };
    }

    public readonly provider: IMetadataProvider = {
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
            throw new Error(`Unexpected GetEntityObject('${entityName}')`);
        },
        EntityByName: () => undefined,
    } as unknown as IMetadataProvider;

    public get run(): FakeAgentRun {
        return this.runs[0];
    }
}

class TestAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }
}

let harness: FailureHarness;

function makeAgentRow(): MJAIAgentEntityExtended {
    return {
        ID: AGENT_ID,
        Name: 'Action Failure Test Agent',
        Description: 'Testing failure directives',
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
        MaxIterationsPerRun: 10,
        AgentTypePromptParams: null,
        OwnerUserID: null,
    } as unknown as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgentRow(),
        conversationMessages: [{ role: 'user', content: 'Please complete the search task' }],
        provider: harness.provider,
        contextUser: { ID: USER_ID } as UserInfo,
        payload: {},
        disableDataPreloading: true,
        ...overrides,
    };
}

function llmEnvelope(resp: LoopAgentResponse): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(resp),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

function actionsEnvelope(actionName = ACTION_NAME): LoopAgentResponse {
    return {
        taskComplete: false,
        reasoning: 'Need to run the search action first',
        nextStep: {
            type: 'Actions',
            actions: [{ name: actionName, params: { query: 'test search' } }],
        },
    };
}

function successEnvelope(): LoopAgentResponse {
    return {
        taskComplete: true,
        message: 'All work finished successfully.',
    };
}

function makeAgent(promptResponses: Array<() => AIPromptRunResult>) {
    const agent = new TestAgent();
    let callIdx = 0;
    const runner = {
        Calls: [] as AIPromptParams[],
        ExecutePrompt: vi.fn(async (params: AIPromptParams) => {
            runner.Calls.push(params);
            const fn = promptResponses[callIdx] ?? promptResponses[promptResponses.length - 1];
            callIdx++;
            return fn();
        }),
    };
    (agent as unknown as { _promptRunner: unknown })._promptRunner = runner;
    return { agent, runner };
}

beforeEach(() => {
    harness = new FailureHarness();
});

describe('BaseAgent — Fix 2A: Action Failure Handling & Circuit Breaker', () => {

    describe('isFatalActionError classification', () => {
        it('classifies missing API key errors as fatal', () => {
            const agent = new BaseAgent();
            const helper = (msg: string | null | undefined) =>
                (agent as unknown as { isFatalActionError(m: string | null | undefined): boolean }).isFatalActionError(msg);

            expect(helper('Perplexity API key not found. Set perplexityApiKey in mj.config.cjs or PERPLEXITY_API_KEY environment variable')).toBe(true);
            expect(helper('No API key found for OpenAIImageGenerator or vendor OpenAI')).toBe(true);
            expect(helper('api_key is required')).toBe(true);
            expect(helper('api_key required')).toBe(true);
            expect(helper('API key missing')).toBe(true);
            expect(helper('Invalid API key provided')).toBe(true);
        });

        it('classifies configuration and credential failures as fatal', () => {
            const agent = new BaseAgent();
            const helper = (msg: string | null | undefined) =>
                (agent as unknown as { isFatalActionError(m: string | null | undefined): boolean }).isFatalActionError(msg);

            expect(helper('Authentication failed for user service')).toBe(true);
            expect(helper('Authentication failed')).toBe(true); // no status code needed
            expect(helper('Credentials not found in environment')).toBe(true);
            expect(helper('Action is not configured for this tenant')).toBe(true);
            expect(helper('Integration is not configured')).toBe(true);
            expect(helper('Search provider not configured in this environment')).toBe(true);
            expect(helper('Not configured')).toBe(true);
        });

        it('treats HTTP authorization statuses as recoverable so they flow into the attempt budget', () => {
            // 401/403/unauthorized/forbidden are usually per-resource (one site blocking a fetch, one
            // record the user cannot read) or transient (a provider using 403 as a rate limit). They
            // must not lock the whole action out of the run.
            const agent = new BaseAgent();
            const helper = (msg: string | null | undefined) =>
                (agent as unknown as { isFatalActionError(m: string | null | undefined): boolean }).isFatalActionError(msg);

            expect(helper('Request failed with status code 401: Unauthorized')).toBe(false);
            expect(helper('HTTP 403: Forbidden - insufficient permissions')).toBe(false);
            expect(helper('Forbidden')).toBe(false);
            expect(helper('Unauthorized access to record 12345 in entity Contacts')).toBe(false);
            expect(helper('Rate limited (403) by search provider')).toBe(false);
        });

        it('classifies recoverable argument and transient errors as non-fatal', () => {
            const agent = new BaseAgent();
            const helper = (msg: string | null | undefined) =>
                (agent as unknown as { isFatalActionError(m: string | null | undefined): boolean }).isFatalActionError(msg);

            expect(helper('Missing required parameter: query')).toBe(false);
            expect(helper('Invalid date format for startDate: 2026-99-99')).toBe(false);
            expect(helper('Downstream service timeout after 5000ms')).toBe(false);
            expect(helper('No records found matching criteria')).toBe(false);
            expect(helper("Parameter 'webhookUrl' is not configured")).toBe(false);
            expect(helper("Option 'channel' not configured")).toBe(false);
            expect(helper("Input argument 'destination' is not configured")).toBe(false);
            expect(helper("Field 'sender' is not configured")).toBe(false);
            expect(helper("Target column 'status' not configured in schema mapping")).toBe(false);
            expect(helper(null)).toBe(false);
            expect(helper(undefined)).toBe(false);
            expect(helper('')).toBe(false);
        });

        it('a credential failure the model can correct is not fatal: parameter wording or credential-shaped arguments', () => {
            const agent = new BaseAgent();
            const helper = (msg: string | null | undefined, params?: Record<string, unknown>) =>
                (agent as unknown as { isFatalActionError(m: string | null | undefined, p?: Record<string, unknown>): boolean }).isFatalActionError(msg, params);

            // The message names a parameter: argument problem, whatever else it says
            expect(helper('Authentication failed: invalid password parameter')).toBe(false);
            expect(helper('API key not found in input')).toBe(false);

            // The call itself supplied the credential: the model can fix it
            expect(helper('Authentication failed', { host: 'db.example.com', user: 'svc', password: 'wrong' })).toBe(false);
            expect(helper('Authentication failed for user svc', { accessToken: 'stale' })).toBe(false);
            expect(helper('Invalid API key provided', { apiKey: 'sk-typo' })).toBe(false);

            // No parameter wording and no credential in the arguments: environment-level, still fatal
            expect(helper('Authentication failed', { query: 'cities' })).toBe(true);
            expect(helper('Authentication failed', { maxTokens: 500 })).toBe(true);
            expect(helper('Perplexity API key not found', { query: 'cities' })).toBe(true);
        });
    });

    describe('ExecuteSingleAction circuit breaker', () => {
        it('short-circuits subsequent calls in 0ms when an action fails fatally', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            // First call fails with fatal missing API key error
            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'Perplexity API key not found. Set PERPLEXITY_API_KEY';
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            const firstResult = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(firstResult.Success).toBe(false);
            expect(harness.runActionCallCount).toBe(1);

            // Second call with same action should be intercepted by the circuit breaker (0ms, no RunAction dispatch)
            const secondResult = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(secondResult.Success).toBe(false);
            expect(secondResult.Message).toContain('disabled for this run because it previously failed with an unrecoverable configuration or credential error');
            expect(harness.runActionCallCount).toBe(1); // Call count DID NOT increment!
        });

        it('short-circuits an action after 2 consecutive identical failures', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            // Returns non-fatal parameter error
            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'Downstream 500 error';
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            // Attempt 1: fails with params { query: 'test' }, not yet tripped
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'test' } }, actionEntity);
            expect(harness.runActionCallCount).toBe(1);

            // Attempt 2: fails with identical params, reaches threshold of 2 identical failures
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'test' } }, actionEntity);
            expect(harness.runActionCallCount).toBe(2);

            // Attempt 3: short-circuited by breaker without dispatching
            const thirdResult = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'test' } }, actionEntity);
            expect(thirdResult.Success).toBe(false);
            expect(thirdResult.Message).toContain('disabled for these inputs because it already failed 2 times with identical arguments');
            expect(harness.runActionCallCount).toBe(2); // Still 2!
        });

        it('allows self-correction when parameters are modified across attempts', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            let attempt = 0;
            harness.runAction = () => {
                harness.runActionCallCount++;
                attempt++;
                const ar = new ActionResult();
                // Attempts 1 and 2 fail, attempt 3 succeeds
                ar.Success = attempt >= 3;
                ar.Message = attempt >= 3 ? 'success' : `Syntax error on attempt ${attempt}`;
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            // Attempt 1: fails with query A
            const r1 = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'bad syntax A' } }, actionEntity);
            expect(r1.Success).toBe(false);
            expect(harness.runActionCallCount).toBe(1);

            // Attempt 2: fails with query B (MODIFIED arguments: NOT blocked by circuit breaker!)
            const r2 = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'bad syntax B' } }, actionEntity);
            expect(r2.Success).toBe(false);
            expect(harness.runActionCallCount).toBe(2); // Dispatched! Not blocked!

            // Attempt 3: succeeds with query C
            const r3 = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'correct syntax C' } }, actionEntity);
            expect(r3.Success).toBe(true);
            expect(harness.runActionCallCount).toBe(3); // Successfully self-corrected!
        });

        it('short-circuits after 5 consecutive failures even with modified parameters (budget exhausted)', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'Query failed';
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            // Run 5 attempts with different parameters — all 5 should dispatch
            for (let i = 1; i <= 5; i++) {
                const res = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: `attempt_${i}` } }, actionEntity);
                expect(res.Success).toBe(false);
                expect(harness.runActionCallCount).toBe(i);
            }

            // Attempt 6: should be short-circuited in 0ms (budget of 5 exhausted)
            const res6 = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'attempt_6' } }, actionEntity);
            expect(res6.Success).toBe(false);
            expect(res6.Message).toContain('disabled for this run after 5 consecutive failures');
            expect(harness.runActionCallCount).toBe(5); // Still 5!
        });

        it('a 403 counts toward the attempt budget and is blocked on the sixth attempt, not the first', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'HTTP 403: Forbidden';
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            // Five different URLs each 403 — every one must actually dispatch (no fatal lockout).
            for (let i = 1; i <= 5; i++) {
                const res = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { url: `https://site-${i}.example` } }, actionEntity);
                expect(res.Success).toBe(false);
                expect(res.Message).toBe('HTTP 403: Forbidden');
                expect(harness.runActionCallCount).toBe(i);
            }

            // Sixth: the budget, not the fatal path, stops it.
            const res6 = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { url: 'https://site-6.example' } }, actionEntity);
            expect(res6.Success).toBe(false);
            expect(res6.Message).toContain('disabled for this run after 5 consecutive failures');
            expect(res6.Message).not.toContain('credential');
            expect(harness.runActionCallCount).toBe(5);
        });

        it('skipCircuitBreaker: pipeline-originated calls are never short-circuited', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'Perplexity API key not found'; // would be fatal on the LLM path
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            // Six identical failures, including a fatal-looking message: every one still dispatches.
            for (let i = 1; i <= 6; i++) {
                const res = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: 'same' } }, actionEntity, undefined, { skipCircuitBreaker: true });
                expect(res.Success).toBe(false);
                expect(res.Message).toBe('Perplexity API key not found');
                expect(harness.runActionCallCount).toBe(i);
            }
        });

        it('skipCircuitBreaker: pipeline outcomes neither increment nor reset the LLM-path failure history', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            let nextSucceeds = false;
            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = nextSucceeds;
                ar.Message = nextSucceeds ? 'ok' : 'Query failed';
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            // (a) Five pipeline failures do not consume the LLM path's budget.
            for (let i = 1; i <= 5; i++) {
                await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { row: i } }, actionEntity, undefined, { skipCircuitBreaker: true });
            }
            const llmCall = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'first llm attempt' } }, actionEntity);
            expect(llmCall.Message).toBe('Query failed'); // dispatched, not blocked
            expect(harness.runActionCallCount).toBe(6);

            // (b) Two identical LLM failures arm the identical-arguments rule...
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'stuck' } }, actionEntity);
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'stuck' } }, actionEntity);
            expect(harness.runActionCallCount).toBe(8);

            // ...a pipeline SUCCESS in between must not clear that record...
            nextSucceeds = true;
            const pipelineOk = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { row: 99 } }, actionEntity, undefined, { skipCircuitBreaker: true });
            expect(pipelineOk.Success).toBe(true);
            expect(harness.runActionCallCount).toBe(9);
            nextSucceeds = false;

            // ...so the third identical LLM call is still blocked.
            const blocked = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { query: 'stuck' } }, actionEntity);
            expect(blocked.Success).toBe(false);
            expect(blocked.Message).toContain('identical arguments');
            expect(harness.runActionCallCount).toBe(9);
        });

        it('resets consecutive failure count when an action succeeds', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            let shouldSucceed = false;
            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = shouldSucceed;
                ar.Message = shouldSucceed ? 'ok' : 'Temporary 500';
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            // Attempt 1: fail
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: '1' } }, actionEntity);
            expect(harness.runActionCallCount).toBe(1);

            // Attempt 2: succeed (resets failure history)
            shouldSucceed = true;
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: '1' } }, actionEntity);
            expect(harness.runActionCallCount).toBe(2);

            // Attempt 3: fail
            shouldSucceed = false;
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: '1' } }, actionEntity);
            expect(harness.runActionCallCount).toBe(3);

            // Attempt 4: fails again with identical params (identical count = 2)
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: '1' } }, actionEntity);
            expect(harness.runActionCallCount).toBe(4);

            // Attempt 5: short-circuited!
            const r5 = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: '1' } }, actionEntity);
            expect(r5.Success).toBe(false);
            expect(r5.Message).toContain('disabled for these inputs');
            expect(harness.runActionCallCount).toBe(4);
        });

        it('a blocked call carries the rule that fired, and a spent budget wins over an identical tail', async () => {
            const agent = new BaseAgent();
            const actionEntity = { ID: ACTION_ID, Name: ACTION_NAME } as unknown as import('@memberjunction/actions-base').MJActionEntityExtended;
            const params = makeParams();

            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'Downstream 500 error';
                ar.RunParams = new RunActionParams();
                ar.RunParams.Action = actionEntity;
                return ar;
            };

            // Five dispatched failures: A, B, C, D, D — the last two identical, total = 5
            for (const q of ['A', 'B', 'C', 'D', 'D']) {
                await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q } }, actionEntity);
            }
            expect(harness.runActionCallCount).toBe(5);

            // A NEW argument is blocked by the budget, not the identical-arguments rule
            const blocked = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: 'E' } }, actionEntity);
            expect(harness.runActionCallCount).toBe(5);
            expect(blocked).toBeInstanceOf(CircuitBreakerActionResult);
            expect((blocked as CircuitBreakerActionResult).Reason).toBe('attempts-exhausted');
            expect(blocked.Message).toContain('after 5 consecutive failures');

            // The identical rule still names itself when it is the one that fires
            const agent2 = new BaseAgent();
            await agent2.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: 'X' } }, actionEntity);
            await agent2.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: 'X' } }, actionEntity);
            const identical = await agent2.ExecuteSingleAction(params, { name: ACTION_NAME, params: { q: 'X' } }, actionEntity);
            expect((identical as CircuitBreakerActionResult).Reason).toBe('identical-arguments');
        });
    });

    describe('Full execution loop failure guidance directives', () => {
        it('injects [CRITICAL/ACTION_UNAVAILABLE] directive for fatal credential errors', async () => {
            harness.runAction = () => {
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'Perplexity API key not found. Set PERPLEXITY_API_KEY';
                ar.Params = [];
                ar.Result = { ResultCode: 'ERROR' } as unknown as import('@memberjunction/core-entities').MJActionResultCodeEntity;
                return ar;
            };

            const { agent } = makeAgent([
                () => llmEnvelope(actionsEnvelope()),
                () => llmEnvelope(successEnvelope()),
            ]);

            const params = makeParams();
            const result = await agent.Execute(params);
            expect(result.success).toBe(true);

            // Verify conversation messages contain the critical failure guidance
            const contents = params.conversationMessages.map(m => typeof m.content === 'string' ? m.content : '');
            const guidanceMsg = contents.find(c => c.includes('[CRITICAL/ACTION_UNAVAILABLE]'));

            expect(guidanceMsg).toBeDefined();
            expect(guidanceMsg).toContain("Action 'Perplexity Search' failed with an unrecoverable configuration or credential error");
            expect(guidanceMsg).toContain("DO NOT call 'Perplexity Search' again during this run");
            expect(guidanceMsg).toContain("You MUST select an alternative tool");
        });

        it('injects [WARNING/ACTION_FAILURE] directive for recoverable errors with attempt count', async () => {
            harness.runAction = () => {
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'Parameter "query" cannot be empty';
                ar.Params = [];
                ar.Result = { ResultCode: 'ERROR' } as unknown as import('@memberjunction/core-entities').MJActionResultCodeEntity;
                return ar;
            };

            const { agent } = makeAgent([
                () => llmEnvelope(actionsEnvelope()),
                () => llmEnvelope(successEnvelope()),
            ]);

            const params = makeParams();
            const result = await agent.Execute(params);

            expect(result.success).toBe(true);

            // Verify conversation messages contain the warning failure guidance with attempt info
            const contents = params.conversationMessages.map(m => typeof m.content === 'string' ? m.content : '');
            const guidanceMsg = contents.find(c => c.includes('[WARNING/ACTION_FAILURE]'));

            expect(guidanceMsg).toBeDefined();
            expect(guidanceMsg).toContain('Parameter "query" cannot be empty');
            expect(guidanceMsg).toContain('(attempt 1 of 5)');
            expect(guidanceMsg).toContain("DO NOT retry calling 'Perplexity Search' with identical arguments");
        });

        it('once the budget is spent the directive says ATTEMPTS_EXHAUSTED, never REPEATED_IDENTICAL_CALL', async () => {
            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'Downstream 500 error';
                ar.Params = [];
                ar.Result = { ResultCode: 'ERROR' } as unknown as import('@memberjunction/core-entities').MJActionResultCodeEntity;
                return ar;
            };

            // A, B, C, D, D spend the budget with an identical tail; E is then blocked; then the model gives up.
            const queries = ['A', 'B', 'C', 'D', 'D', 'E'];
            const { agent } = makeAgent([
                ...queries.map(q => () => llmEnvelope({
                    taskComplete: false,
                    reasoning: `Try query ${q}`,
                    nextStep: { type: 'Actions', actions: [{ name: ACTION_NAME, params: { query: q } }] },
                })),
                () => llmEnvelope(successEnvelope()),
            ]);

            const params = makeParams();
            const result = await agent.Execute(params);
            expect(result.success).toBe(true);
            expect(harness.runActionCallCount).toBe(5); // E never dispatched

            const guidance = params.conversationMessages
                .map(m => typeof m.content === 'string' ? m.content : '')
                .filter(c => c.includes('Action Execution Failure Guidance'));
            expect(guidance).toHaveLength(6);

            // Attempts 1–4 warn with a running count
            expect(guidance[0]).toContain('(attempt 1 of 5)');
            expect(guidance[3]).toContain('(attempt 4 of 5)');
            // The fifth failure spends the budget: exhausted, even though its arguments repeated the fourth's
            expect(guidance[4]).toContain('[CRITICAL/ATTEMPTS_EXHAUSTED]');
            // The blocked sixth call reports the rule that blocked it — not "same arguments", which E was not
            expect(guidance[5]).toContain('[CRITICAL/ATTEMPTS_EXHAUSTED]');
            expect(guidance[5]).toContain('after 5 consecutive failures');
            expect(guidance.some(g => g.includes('[CRITICAL/REPEATED_IDENTICAL_CALL]'))).toBe(false);
        });

        it('ForEach iterations bypass the breaker and do not consume the model\'s attempt budget', async () => {
            harness.runAction = () => {
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = false;
                ar.Message = 'HTTP 404 from downstream';
                ar.Params = [];
                ar.Result = { ResultCode: 'ERROR' } as unknown as import('@memberjunction/core-entities').MJActionResultCodeEntity;
                return ar;
            };

            const { agent } = makeAgent([
                // Six items, every one fails
                () => llmEnvelope({
                    taskComplete: false,
                    reasoning: 'Fetch every URL',
                    nextStep: {
                        type: 'ForEach',
                        forEach: {
                            collectionPath: 'payload.urls',
                            itemVariable: 'url',
                            continueOnError: true,
                            executionMode: 'sequential',
                            action: { name: ACTION_NAME, params: { query: '{{url}}' } },
                        },
                    },
                }),
                // Then the model calls the same action directly
                () => llmEnvelope(actionsEnvelope()),
                () => llmEnvelope(successEnvelope()),
            ]);

            const params = makeParams({ payload: { urls: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'] } });
            const result = await agent.Execute(params);
            expect(result.success).toBe(true);

            // All six loop items dispatched (no lockout after the fifth), plus the model's direct call
            expect(harness.runActionCallCount).toBe(7);

            // The direct call is the model's FIRST attempt as far as the breaker is concerned
            const contents = params.conversationMessages.map(m => typeof m.content === 'string' ? m.content : '');
            const guidance = contents.filter(c => c.includes('Action Execution Failure Guidance'));
            expect(guidance).toHaveLength(1);
            expect(guidance[0]).toContain('[WARNING/ACTION_FAILURE]');
            expect(guidance[0]).toContain('(attempt 1 of 5)');
        });

        it('a wrong password supplied by the model gets a WARNING and a retry, not a run-long lockout', async () => {
            let attempts = 0;
            harness.runAction = () => {
                attempts++;
                harness.runActionCallCount++;
                const ar = new ActionResult();
                ar.Success = attempts > 1; // first password wrong, corrected one works
                ar.Message = attempts > 1 ? 'Connected' : 'Authentication failed';
                ar.Params = [];
                ar.Result = { ResultCode: attempts > 1 ? 'SUCCESS' : 'ERROR' } as unknown as import('@memberjunction/core-entities').MJActionResultCodeEntity;
                return ar;
            };

            const attempt = (password: string): LoopAgentResponse => ({
                taskComplete: false,
                reasoning: 'Connect to the database',
                nextStep: { type: 'Actions', actions: [{ name: ACTION_NAME, params: { host: 'db.example.com', password } }] },
            });
            const { agent } = makeAgent([
                () => llmEnvelope(attempt('wrong')),
                () => llmEnvelope(attempt('right')),
                () => llmEnvelope(successEnvelope()),
            ]);

            const params = makeParams();
            const result = await agent.Execute(params);
            expect(result.success).toBe(true);
            expect(harness.runActionCallCount).toBe(2); // the corrected call was dispatched, not short-circuited

            const contents = params.conversationMessages.map(m => typeof m.content === 'string' ? m.content : '');
            const guidance = contents.filter(c => c.includes('Action Execution Failure Guidance'));
            expect(guidance).toHaveLength(1);
            expect(guidance[0]).toContain('[WARNING/ACTION_FAILURE]');
            expect(guidance[0]).not.toContain('[CRITICAL/ACTION_UNAVAILABLE]');
        });

        it('does NOT inject failure directives when all actions succeed', async () => {
            harness.runAction = () => {
                const ar = new ActionResult();
                ar.Success = true;
                ar.Message = 'Search completed';
                ar.Params = [];
                ar.Result = { ResultCode: 'SUCCESS' } as unknown as import('@memberjunction/core-entities').MJActionResultCodeEntity;
                return ar;
            };

            const { agent } = makeAgent([
                () => llmEnvelope(actionsEnvelope()),
                () => llmEnvelope(successEnvelope()),
            ]);

            const params = makeParams();
            const result = await agent.Execute(params);

            expect(result.success).toBe(true);

            const contents = params.conversationMessages.map(m => typeof m.content === 'string' ? m.content : '');
            expect(contents.some(c => c.includes('Action Execution Failure Guidance'))).toBe(false);
        });
    });
});
