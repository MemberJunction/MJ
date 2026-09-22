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
import { BaseAgent } from '../base-agent';
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

        it('classifies auth and credential failures as fatal', () => {
            const agent = new BaseAgent();
            const helper = (msg: string | null | undefined) =>
                (agent as unknown as { isFatalActionError(m: string | null | undefined): boolean }).isFatalActionError(msg);

            expect(helper('Request failed with status code 401: Unauthorized')).toBe(true);
            expect(helper('HTTP 403: Forbidden - insufficient permissions')).toBe(true);
            expect(helper('Authentication failed for user service')).toBe(true);
            expect(helper('Credentials not found in environment')).toBe(true);
            expect(helper('Action is not configured for this tenant')).toBe(true);
        });

        it('classifies recoverable argument and transient errors as non-fatal', () => {
            const agent = new BaseAgent();
            const helper = (msg: string | null | undefined) =>
                (agent as unknown as { isFatalActionError(m: string | null | undefined): boolean }).isFatalActionError(msg);

            expect(helper('Missing required parameter: query')).toBe(false);
            expect(helper('Invalid date format for startDate: 2026-99-99')).toBe(false);
            expect(helper('Downstream service timeout after 5000ms')).toBe(false);
            expect(helper('No records found matching criteria')).toBe(false);
            expect(helper(null)).toBe(false);
            expect(helper(undefined)).toBe(false);
            expect(helper('')).toBe(false);
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

        it('short-circuits an action after 2 consecutive non-fatal failures', async () => {
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

            // Attempt 1: fails, not yet tripped
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(harness.runActionCallCount).toBe(1);

            // Attempt 2: fails, trips circuit breaker
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(harness.runActionCallCount).toBe(2);

            // Attempt 3: short-circuited by breaker without dispatching
            const thirdResult = await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(thirdResult.Success).toBe(false);
            expect(thirdResult.Message).toContain('disabled for this run');
            expect(harness.runActionCallCount).toBe(2); // Still 2!
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

            // Attempt 1: fail (count = 1)
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(harness.runActionCallCount).toBe(1);

            // Attempt 2: succeed (resets count to 0)
            shouldSucceed = true;
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(harness.runActionCallCount).toBe(2);

            // Attempt 3: fail (count = 1 again, NOT 2, so breaker should NOT trip)
            shouldSucceed = false;
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(harness.runActionCallCount).toBe(3);

            // Attempt 4: dispatches normally (count reaches 2 here)
            await agent.ExecuteSingleAction(params, { name: ACTION_NAME, params: {} }, actionEntity);
            expect(harness.runActionCallCount).toBe(4);
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

        it('injects [WARNING/ACTION_FAILURE] directive for recoverable errors', async () => {
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

            // Verify conversation messages contain the warning failure guidance
            const contents = params.conversationMessages.map(m => typeof m.content === 'string' ? m.content : '');
            const guidanceMsg = contents.find(c => c.includes('[WARNING/ACTION_FAILURE]'));

            expect(guidanceMsg).toBeDefined();
            expect(guidanceMsg).toContain('Parameter "query" cannot be empty');
            expect(guidanceMsg).toContain("DO NOT retry calling 'Perplexity Search' with identical arguments");
            expect(guidanceMsg).toContain("You must either adjust your inputs to resolve the error or pivot");
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
