/**
 * Unit tests for VS-CON-4: Escalate to human on a Chat step & reload open sub-agent
 * consults across a Chat round-trip.
 *
 * Drives the real BaseAgent.Execute() loop using the LoopHarness pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { BaseAgentType } from '../agent-types/base-agent-type';
// Register real LoopAgentType with MJGlobal ClassFactory
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import {
    FormatReloadedConsultsMessage,
    SubAgentConsultRecord,
} from '../sub-agent-consult';
import {
    type AIPromptParams,
    type AIPromptRunResult,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type AgentSubAgentRequest,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage, IMetadataProvider, UserInfo } from '@memberjunction/core';

// ============================================================================
// Module mocks (boundaries only — matching sub-agent-chat-consult.test.ts)
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
        RunView: class MockRunView {
            private readonly p: typeof harness.provider;
            constructor(p?: unknown) {
                this.p = (p as typeof harness.provider) ?? harness.provider;
            }
            static FromMetadataProvider(p?: unknown): MockRunView {
                return new MockRunView(p);
            }
            public RunView(params: { EntityName: string; ExtraFilter?: string; OrderBy?: string }) {
                return this.p.RunView(params);
            }
            public RunViews(params: Array<{ EntityName: string; ExtraFilter?: string; OrderBy?: string }>) {
                return this.p.RunViews(params);
            }
        },
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
// Fixed IDs (UUID-shaped)
// ============================================================================

const AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TYPE_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const STORAGE_ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000007';
const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000008';
const CHILD_SUB_AGENT_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const SECOND_SUB_AGENT_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

// ============================================================================
// Harness types
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
    public Skills: string | null = null;
    public SubAgentRun: unknown = null;
    public IsSaved = false;

    constructor(private readonly seq: number) {}

    public NewRecord(): void {
        this.ID = `aaaaaaaa-1111-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        this.IsSaved = true;
        return true;
    }
}

class FakeAgentRun {
    public ID = '';
    public AgentID = '';
    public Status = '';
    public CancellationReason: string | null = null;
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

    constructor(seq: number) {
        this.ID = `aaaaaaaa-2222-4000-8000-${String(seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        return true;
    }
}

class FakeAgentRequest {
    public ID = '';
    public AgentID = '';
    public RequestedAt: Date | null = null;
    public RequestForUserID: string | null = null;
    public Status = '';
    public Request = '';
    public RequestTypeID: string | null = null;
    public ResponseSchema: string | null = null;
    public Priority = 0;
    public OriginatingAgentRunID: string | null = null;
    public OriginatingAgentRunStepID: string | null = null;
    public ExpiresAt: Date | null = null;
    public IsSaved = false;

    constructor(private readonly seq: number) {}

    public NewRecord(): void {
        this.ID = `aaaaaaaa-4444-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }

    public async Save(): Promise<boolean> {
        this.IsSaved = true;
        return true;
    }
}

class ScriptedPromptRunner {
    public readonly Calls: AIPromptParams[] = [];

    constructor(private readonly script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>) {}

    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        const index = this.Calls.length;
        this.Calls.push({
            ...params,
            conversationMessages: params.conversationMessages ? [...params.conversationMessages] : [],
        });
        const responder = this.script[Math.min(index, this.script.length - 1)];
        return responder(params, index);
    }
}

interface PriorRunSeed {
    ID: string;
    FinalStep: string | null;
    Status: string;
    CancellationReason: string | null;
}

interface PriorRunStepSeed {
    AgentRunID: string;
    StepNumber: number;
    StepType: string;
    InputData: string | null;
    OutputData: string | null;
}

class EscalationLoopHarness {
    public agent: Record<string, unknown> = makeAgentRow();
    public subAgents: Record<string, unknown>[] = [];
    public relationships: Record<string, unknown>[] = [];
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];
    public requests: FakeAgentRequest[] = [];
    public priorRuns: PriorRunSeed[] = [];
    public priorRunSteps: PriorRunStepSeed[] = [];
    public runViewCalls: Array<{ EntityName: string; ExtraFilter?: string; OrderBy?: string; Fields?: string[] }> = [];
    public runViewThrowsOnSteps = false;
    public executeSubAgentHandler: (
        request: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended
    ) => Promise<ExecuteAgentResult> = async () => {
        throw new Error('executeSubAgentHandler not configured');
    };

    private runSeq = 0;
    private stepSeq = 0;
    private requestSeq = 0;
    private readonly catalog = new Map<string, unknown>();

    public get engineInstance(): Record<string, unknown> {
        const allAgents = [this.agent, ...this.subAgents];
        return {
            Config: async (): Promise<void> => undefined,
            Agents: allAgents,
            AgentRelationships: this.relationships,
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
            GetSubAgents: (agentId: string, status?: string, relationshipStatus?: string): unknown[] => {
                const children = this.subAgents.filter(
                    a => a.ParentID === agentId && (!status || a.Status === status)
                );
                const relSubAgentIds = this.relationships
                    .filter(ar => ar.AgentID === agentId && (!relationshipStatus || ar.Status === relationshipStatus))
                    .map(ar => ar.SubAgentID);
                const related = this.subAgents.filter(
                    a => relSubAgentIds.includes(a.ID) && (!status || a.Status === status)
                );
                return [...children, ...related];
            },
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
            Actions: [],
            RunAction: vi.fn(),
        };
    }

    public readonly provider = {
        GetEntityObject: async (entityName: string): Promise<unknown> => {
            if (entityName === 'MJ: AI Agent Runs') {
                const run = new FakeAgentRun(++this.runSeq);
                this.runs.push(run);
                return run;
            }
            if (entityName === 'MJ: AI Agent Run Steps') {
                const step = new MockStepEntity(++this.stepSeq);
                this.steps.push(step);
                return step;
            }
            if (entityName === 'MJ: AI Agent Requests') {
                const req = new FakeAgentRequest(++this.requestSeq);
                this.requests.push(req);
                return req;
            }
            throw new Error(`EscalationLoopHarness: unexpected GetEntityObject('${entityName}')`);
        },
        RunView: async (params: { EntityName: string; ExtraFilter?: string; OrderBy?: string; Fields?: string[] }): Promise<{ Success: boolean; Results: unknown[] }> => {
            this.runViewCalls.push(params);
            const filter = params.ExtraFilter ?? '';
            if (params.EntityName === 'MJ: AI Agent Runs') {
                const idMatch = filter.match(/ID='([^']+)'/i);
                if (idMatch) {
                    const targetId = idMatch[1].toLowerCase();
                    const allRuns: PriorRunSeed[] = [
                        ...this.priorRuns,
                        ...this.runs.map(r => ({
                            ID: r.ID,
                            FinalStep: r.FinalStep,
                            Status: r.Status,
                            CancellationReason: r.CancellationReason,
                        })),
                    ];
                    const found = allRuns.filter(r => r.ID.toLowerCase() === targetId);
                    return { Success: true, Results: found };
                }
                return { Success: true, Results: [] };
            }
            if (params.EntityName === 'MJ: AI Agent Run Steps') {
                if (this.runViewThrowsOnSteps) {
                    throw new Error('Simulated RunView failure on MJ: AI Agent Run Steps');
                }
                const runMatch = filter.match(/AgentRunID='([^']+)'/i);
                const targetRunId = runMatch ? runMatch[1].toLowerCase() : '';
                const allSteps: PriorRunStepSeed[] = [
                    ...this.priorRunSteps,
                    ...this.steps.map(s => ({
                        AgentRunID: s.AgentRunID,
                        StepNumber: s.StepNumber,
                        StepType: s.StepType,
                        InputData: s.InputData,
                        OutputData: s.OutputData,
                    })),
                ];
                const matching = allSteps
                    .filter(s => s.AgentRunID.toLowerCase() === targetRunId && (!filter.includes("StepType='Sub-Agent'") || s.StepType === 'Sub-Agent'))
                    .sort((a, b) => a.StepNumber - b.StepNumber);
                return { Success: true, Results: matching };
            }
            return { Success: true, Results: [] };
        },
        RunViews: async (viewParams: Array<{ EntityName: string; ExtraFilter?: string; OrderBy?: string }>): Promise<Array<{ Success: boolean; Results: unknown[] }>> => {
            const results: Array<{ Success: boolean; Results: unknown[] }> = [];
            for (const vp of viewParams) {
                results.push(await this.provider.RunView(vp));
            }
            return results;
        },
    };
}

function makeAgentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: AGENT_ID,
        Name: 'DirectorAgent',
        Description: 'Parent director agent under test',
        Status: 'Active',
        TypeID: TYPE_ID,
        DriverClass: null,
        Parent: null,
        ParentID: null,
        DefaultStorageAccountID: STORAGE_ACCOUNT_ID,
        CategoryID: null,
        ModelSelectionMode: 'Agent Type',
        DefaultPromptEffortLevel: null,
        ScopeConfig: null,
        PayloadSelfReadPaths: null,
        PayloadSelfWritePaths: null,
        PayloadScope: null,
        AllowMemoryWrite: false,
        ChatHandlingOption: 'Consult',
        MaxSubAgentConsultRounds: null,
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

function registerChildSubAgent(overrides: Record<string, unknown> = {}): MJAIAgentEntityExtended {
    const child = {
        ...makeAgentRow(),
        ID: CHILD_SUB_AGENT_ID,
        Name: 'ScriptwriterSubAgent',
        Description: 'Writes scripts and asks clarifying questions when needed',
        ParentID: AGENT_ID,
        ExecutionOrder: 1,
        ExecutionMode: 'Sequential',
        ChatHandlingOption: null,
        PayloadDownstreamPaths: JSON.stringify(['*']),
        PayloadUpstreamPaths: JSON.stringify(['*']),
        ...overrides,
    } as unknown as MJAIAgentEntityExtended;
    harness.subAgents.push(child as unknown as Record<string, unknown>);
    return child;
}

let harness: EscalationLoopHarness;

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    protected override async ResolveAudienceUsers(ids: string[]): Promise<UserInfo[]> {
        return ids.map(
            id =>
                ({
                    ID: id,
                    Name: `Reader ${id}`,
                    Email: `${id}@example.com`,
                    UserRoles: [],
                }) as unknown as UserInfo
        );
    }

    protected override async ExecuteSubAgent<SC = unknown, SR = unknown>(
        _params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended,
        _payload?: SR,
        _contextMessage?: ChatMessage,
        _stepCount: number = 0
    ): Promise<ExecuteAgentResult<SR>> {
        const res = await harness.executeSubAgentHandler(subAgentRequest, subAgent);
        if (stepEntity && res.agentRun?.ID) {
            stepEntity.TargetLogID = res.agentRun.ID;
        }
        return res as ExecuteAgentResult<SR>;
    }
}

function makeAgent(
    script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>
): {
    agent: HarnessAgent;
    runner: ScriptedPromptRunner;
    flushSteps: () => Promise<unknown>;
} {
    const agent = new HarnessAgent();
    const runner = new ScriptedPromptRunner(script);
    const internals = agent as unknown as {
        _promptRunner: ScriptedPromptRunner;
        _stepSaveQueue: { Flush(): Promise<unknown> };
    };
    internals._promptRunner = runner;
    return { agent, runner, flushSteps: () => internals._stepSaveQueue.Flush() };
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    const contextUser = {
        ID: USER_ID,
        Name: 'Test User',
        Email: 'test@example.com',
        UserRoles: [],
    } as unknown as UserInfo;

    const messages: ChatMessage[] = [
        { role: 'user', content: 'Produce a 30-second product launch video.' },
    ];

    return {
        agent: harness.agent as unknown as MJAIAgentEntityExtended,
        conversationMessages: messages,
        contextUser,
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
        ...overrides,
    };
}

function llmEnvelope(response: Partial<LoopAgentResponse>): AIPromptRunResult {
    const full: LoopAgentResponse = {
        taskComplete: false,
        message: 'step message',
        reasoning: 'test reasoning',
        confidence: 0.9,
        ...response,
    };
    return {
        success: true,
        result: JSON.stringify(full),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

function makeSubAgentChatResult<P = Record<string, unknown>>(opts: {
    runId: string;
    agentId: string;
    agentName: string;
    message: string;
    payload?: P;
    responseForm?: ExecuteAgentResult['responseForm'];
}): ExecuteAgentResult<P> {
    return {
        success: true,
        payload: (opts.payload ?? ({} as P)),
        responseForm: opts.responseForm,
        agentRun: {
            ID: opts.runId,
            AgentID: opts.agentId,
            Agent: opts.agentName,
            Status: 'AwaitingFeedback',
            FinalStep: 'Chat',
            Message: opts.message,
            ErrorMessage: null,
            Steps: [],
        } as unknown as MJAIAgentRunEntityExtended,
    };
}

function makeSubAgentSuccessResult<P = Record<string, unknown>>(opts: {
    runId: string;
    agentId: string;
    agentName: string;
    message?: string;
    payload?: P;
}): ExecuteAgentResult<P> {
    return {
        success: true,
        payload: (opts.payload ?? ({} as P)),
        agentRun: {
            ID: opts.runId,
            AgentID: opts.agentId,
            Agent: opts.agentName,
            Status: 'Completed',
            FinalStep: 'Success',
            Message: opts.message ?? 'Completed work',
            ErrorMessage: null,
            Steps: [],
        } as unknown as MJAIAgentRunEntityExtended,
    };
}

// ============================================================================
// Pure helper tests: FormatReloadedConsultsMessage
// ============================================================================

describe('VS-CON-4: FormatReloadedConsultsMessage pure formatting', () => {
    it('returns empty string when consults array is empty', () => {
        expect(FormatReloadedConsultsMessage([])).toBe('');
    });

    it('formats a single open consult with exact required reminder text', () => {
        const record: SubAgentConsultRecord = {
            childRunId: 'bbbbbbbb-2222-4000-8000-000000000001',
            subAgentId: CHILD_SUB_AGENT_ID,
            subAgentName: 'ScriptwriterSubAgent',
            round: 1,
            question: 'What tone should the narrator use?',
        };
        expect(FormatReloadedConsultsMessage([record])).toBe(
            'You asked your caller about a question from sub-agent ScriptwriterSubAgent (run bbbbbbbb-2222-4000-8000-000000000001, round 1): What tone should the narrator use? Their answer follows. To pass it on, call ScriptwriterSubAgent with resumeRunId: "bbbbbbbb-2222-4000-8000-000000000001".'
        );
    });

    it('uses (no message provided) fallback when question is null or blank without rendering ": ."', () => {
        const nullQuestionRecord: SubAgentConsultRecord = {
            childRunId: 'bbbbbbbb-2222-4000-8000-000000000001',
            subAgentId: CHILD_SUB_AGENT_ID,
            subAgentName: 'ScriptwriterSubAgent',
            round: 2,
            question: null,
        };
        const formatted = FormatReloadedConsultsMessage([nullQuestionRecord]);
        expect(formatted).toContain('(no message provided)');
        expect(formatted).not.toContain(': .');
        expect(formatted).toBe(
            'You asked your caller about a question from sub-agent ScriptwriterSubAgent (run bbbbbbbb-2222-4000-8000-000000000001, round 2): (no message provided). Their answer follows. To pass it on, call ScriptwriterSubAgent with resumeRunId: "bbbbbbbb-2222-4000-8000-000000000001".'
        );
    });

    it('lists each open consult on its own line when several are open', () => {
        const records: SubAgentConsultRecord[] = [
            {
                childRunId: 'bbbbbbbb-2222-4000-8000-000000000001',
                subAgentId: CHILD_SUB_AGENT_ID,
                subAgentName: 'ScriptwriterSubAgent',
                round: 1,
                question: 'What tone?',
            },
            {
                childRunId: 'bbbbbbbb-2222-4000-8000-000000000002',
                subAgentId: SECOND_SUB_AGENT_ID,
                subAgentName: 'VoiceCastingAgent',
                round: 2,
                question: 'Male or female voice?',
            },
        ];
        const msg = FormatReloadedConsultsMessage(records);
        const lines = msg.split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('ScriptwriterSubAgent (run bbbbbbbb-2222-4000-8000-000000000001, round 1): What tone? Their answer follows.');
        expect(lines[1]).toContain('VoiceCastingAgent (run bbbbbbbb-2222-4000-8000-000000000002, round 2): Male or female voice? Their answer follows.');
    });
});

// ============================================================================
// Escalation & Open Consult Reload Tests
// ============================================================================

describe('VS-CON-4: Propagated child Chat request creation and open consult reload', () => {
    beforeEach(() => {
        harness = new EscalationLoopHarness();
        vi.clearAllMocks();
    });

    it('propagated child Chat at root under a Consult pairing (bound exceeded) raises one request; with no Consult (null / Success / Failed) none; at depth 1 none; under an audience none', async () => {
        const makeTwoTurnSubAgentScript = () => [
            (_p: AIPromptParams, idx: number) =>
                llmEnvelope({
                    taskComplete: false,
                    message: `Turn ${idx + 1}`,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: `Call ${idx + 1}`,
                            terminateAfter: false,
                        },
                    },
                }),
        ];

        // 1. Root agent (_depth === 0) under Consult pairing with bound exceeded (MaxSubAgentConsultRounds = 1): raises 1 request
        harness.agent.ChatHandlingOption = 'Consult';
        harness.agent.MaxSubAgentConsultRounds = 1;
        const childAgent = registerChildSubAgent();
        let rootSubCalls = 0;
        harness.executeSubAgentHandler = async () => {
            rootSubCalls += 1;
            return makeSubAgentChatResult({
                runId: `bbbbbbbb-2222-4000-8000-00000000000${rootSubCalls}`,
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                message: 'Which target platform: YouTube or TikTok?',
            });
        };

        const { agent: rootAgent, flushSteps: flushRoot } = makeAgent(makeTwoTurnSubAgentScript());
        const rootResult = await rootAgent.Execute(makeParams());
        await flushRoot();

        expect(rootResult.success).toBe(true);
        expect(rootResult.agentRun.FinalStep).toBe('Chat');
        expect(rootResult.agentRun.Status).toBe('AwaitingFeedback');
        expect(harness.requests).toHaveLength(1);
        expect(harness.requests[0].IsSaved).toBe(true);
        expect(harness.requests[0].Request).toBe('Which target platform: YouTube or TikTok?');
        expect(harness.requests[0].OriginatingAgentRunID).toBe(rootResult.agentRun.ID);

        // 2. With no Consult (null / 'Success' / 'Failed') at root: raises 0 requests
        for (const nonConsultOption of [null, 'Success', 'Failed'] as const) {
            harness = new EscalationLoopHarness();
            harness.agent.ChatHandlingOption = nonConsultOption;
            const nonConsultChild = registerChildSubAgent();
            harness.executeSubAgentHandler = async () =>
                makeSubAgentChatResult({
                    runId: 'bbbbbbbb-2222-4000-8000-000000000010',
                    agentId: nonConsultChild.ID,
                    agentName: nonConsultChild.Name,
                    message: 'Non-consult child question?',
                });

            const { agent: nonConsultAgent, flushSteps: flushNonConsult } = makeAgent(makeTwoTurnSubAgentScript());
            await nonConsultAgent.Execute(makeParams());
            await flushNonConsult();
            expect(harness.requests).toHaveLength(0);
        }

        // 3. Non-root agent (_depth === 1 via parentRun) under Consult with bound exceeded: raises 0 requests
        harness = new EscalationLoopHarness();
        harness.agent.ChatHandlingOption = 'Consult';
        harness.agent.MaxSubAgentConsultRounds = 1;
        const childAgentNested = registerChildSubAgent();
        let nestedCalls = 0;
        harness.executeSubAgentHandler = async () => {
            nestedCalls += 1;
            return makeSubAgentChatResult({
                runId: `bbbbbbbb-2222-4000-8000-00000000002${nestedCalls}`,
                agentId: childAgentNested.ID,
                agentName: childAgentNested.Name,
                message: 'Nested question?',
            });
        };

        const { agent: nestedAgent, flushSteps: flushNested } = makeAgent(makeTwoTurnSubAgentScript());
        const nestedResult = await nestedAgent.Execute(
            makeParams({
                parentRun: { ID: '99999999-0000-4000-8000-000000000001' } as unknown as MJAIAgentRunEntityExtended,
                parentDepth: 0,
            })
        );
        await flushNested();

        expect(nestedResult.agentRun.FinalStep).toBe('Chat');
        expect(harness.requests).toHaveLength(0);

        // 4. Root agent under an audience (Audience adds a reader beyond contextUser) under Consult with bound exceeded: raises 0 requests
        harness = new EscalationLoopHarness();
        harness.agent.ChatHandlingOption = 'Consult';
        harness.agent.MaxSubAgentConsultRounds = 1;
        const childAgentAudience = registerChildSubAgent();
        let audienceCalls = 0;
        harness.executeSubAgentHandler = async () => {
            audienceCalls += 1;
            return makeSubAgentChatResult({
                runId: `bbbbbbbb-2222-4000-8000-00000000003${audienceCalls}`,
                agentId: childAgentAudience.ID,
                agentName: childAgentAudience.Name,
                message: 'Question in shared room?',
            });
        };

        const { agent: audienceAgent, flushSteps: flushAudience } = makeAgent(makeTwoTurnSubAgentScript());
        const audienceUserId = 'aaaaaaaa-0000-4000-8000-000000000099';
        vi.spyOn(
            audienceAgent as unknown as { ResolveAudienceUsers: (ids: string[]) => Promise<UserInfo[]> },
            'ResolveAudienceUsers'
        ).mockResolvedValue([{ ID: audienceUserId, Email: 'room@example.com' } as unknown as UserInfo]);

        const audienceResult = await audienceAgent.Execute(
            makeParams({
                Audience: { Mode: 'Intersection', UserIDs: [audienceUserId] },
            })
        );
        await flushAudience();

        expect(audienceResult.agentRun.FinalStep).toBe('Chat');
        expect(harness.requests).toHaveLength(0);
    });

    it('bound-exceeded Consult step still writes OutputData.consult before propagating and creates an MJ: AI Agent Requests row at _depth === 0', async () => {
        harness.agent.ChatHandlingOption = 'Consult';
        harness.agent.MaxSubAgentConsultRounds = 1;
        const childAgent = registerChildSubAgent();

        const runIdRound1 = 'bbbbbbbb-2222-4000-8000-000000000011';
        const runIdRound2 = 'bbbbbbbb-2222-4000-8000-000000000012';

        let subCall = 0;
        harness.executeSubAgentHandler = async () => {
            subCall += 1;
            return makeSubAgentChatResult({
                runId: subCall === 1 ? runIdRound1 : runIdRound2,
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                message: `Consult question ${subCall}?`,
            });
        };

        const { agent, flushSteps } = makeAgent([
            (_p, idx) =>
                llmEnvelope({
                    taskComplete: false,
                    message: `Turn ${idx + 1}`,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: `Call ${idx + 1}`,
                            terminateAfter: false,
                        },
                    },
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        expect(result.agentRun.FinalStep).toBe('Chat');
        expect(result.agentRun.Status).toBe('AwaitingFeedback');
        expect(result.agentRun.Message).toBe('Consult question 2?');

        // Bound-exceeded step (2nd Sub-Agent step) must still have OutputData.consult persisted!
        const subAgentSteps = harness.steps.filter(s => s.StepType === 'Sub-Agent');
        expect(subAgentSteps).toHaveLength(2);
        const step2Output = JSON.parse(subAgentSteps[1].OutputData ?? '{}');
        expect(step2Output.consult).toEqual({
            childRunId: runIdRound2,
            subAgentId: childAgent.ID,
            subAgentName: 'ScriptwriterSubAgent',
            round: 2,
            question: 'Consult question 2?',
        });

        // And because it propagated to root (_depth === 0), an MJ: AI Agent Requests row was created
        expect(harness.requests).toHaveLength(1);
        expect(harness.requests[0].Request).toBe('Consult question 2?');
        expect(harness.requests[0].OriginatingAgentRunID).toBe(result.agentRun.ID);
        expect(harness.requests[0].OriginatingAgentRunStepID).toBe(subAgentSteps[1].ID);
    });

    it('resuming a run with lastRunId pointing to a FinalStep="Chat" run reloads open OutputData.consult, populates _openSubAgentConsults, and injects the reminder before the user answer', async () => {
        const childAgent = registerChildSubAgent();
        const priorParentRunId = 'aaaaaaaa-2222-4000-8000-000000000099';
        const openChildRunId = 'bbbbbbbb-2222-4000-8000-000000000077';

        harness.priorRuns.push({
            ID: priorParentRunId,
            FinalStep: 'Chat',
            Status: 'AwaitingFeedback',
            CancellationReason: null,
        });
        harness.priorRunSteps.push({
            AgentRunID: priorParentRunId,
            StepNumber: 2,
            StepType: 'Sub-Agent',
            InputData: JSON.stringify({ subAgentName: 'ScriptwriterSubAgent', message: 'Draft script' }),
            OutputData: JSON.stringify({
                consult: {
                    childRunId: openChildRunId,
                    subAgentId: childAgent.ID,
                    subAgentName: 'ScriptwriterSubAgent',
                    round: 1,
                    question: 'What is the brand tagline?',
                },
            }),
        });

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Relaying user answer to ScriptwriterSubAgent',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: 'The brand tagline is "Future Ready".',
                            resumeRunId: openChildRunId,
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Video script completed with tagline.',
                }),
        ]);

        let capturedResumeRequest: AgentSubAgentRequest | undefined;
        harness.executeSubAgentHandler = async (req) => {
            capturedResumeRequest = req;
            return makeSubAgentSuccessResult({
                runId: 'bbbbbbbb-2222-4000-8000-000000000078',
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                payload: { tagline: 'Future Ready' },
            });
        };

        const conversationMessages: ChatMessage[] = [
            { role: 'user', content: 'Produce a 30-second product launch video.' },
            { role: 'assistant', content: 'What is your brand tagline?' },
            { role: 'user', content: 'Future Ready' },
        ];

        const result = await agent.Execute(
            makeParams({
                lastRunId: priorParentRunId,
                conversationMessages,
            })
        );
        await flushSteps();

        expect(result.success).toBe(true);
        expect(result.agentRun.FinalStep).toBe('Success');

        // Verify the reminder was injected BEFORE the last user message ('Future Ready') in turn 1
        const turn1Msgs = runner.Calls[0].conversationMessages ?? [];
        const reminderIdx = turn1Msgs.findIndex(
            m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
        );
        const answerIdx = turn1Msgs.findIndex(m => m.role === 'user' && m.content === 'Future Ready');
        expect(reminderIdx).toBeGreaterThan(-1);
        expect(answerIdx).toBeGreaterThan(-1);
        expect(reminderIdx).toBeLessThan(answerIdx);
        expect(turn1Msgs[reminderIdx].content).toBe(
            `You asked your caller about a question from sub-agent ScriptwriterSubAgent (run ${openChildRunId}, round 1): What is the brand tagline? Their answer follows. To pass it on, call ScriptwriterSubAgent with resumeRunId: "${openChildRunId}".`
        );

        // Verify VS-CON-3 validation accepted resumeRunId because _openSubAgentConsults was populated
        expect(capturedResumeRequest).toBeDefined();
        expect(capturedResumeRequest?.resumeRunId).toBe(openChildRunId);
    });

    it('non-Consult agent with lastRunId pointing at a Chat-ended run makes zero AI Agent Runs / Run Steps reads from reload, while an Active Consult relationship enables reload', async () => {
        const childAgent = registerChildSubAgent();
        const chatEndedRunId = 'aaaaaaaa-2222-4000-8000-000000000091';
        const openChildRunId = 'bbbbbbbb-2222-4000-8000-000000000091';

        harness.priorRuns.push({
            ID: chatEndedRunId,
            FinalStep: 'Chat',
            Status: 'AwaitingFeedback',
            CancellationReason: null,
        });
        harness.priorRunSteps.push({
            AgentRunID: chatEndedRunId,
            StepNumber: 2,
            StepType: 'Sub-Agent',
            InputData: JSON.stringify({ subAgentName: 'ScriptwriterSubAgent', message: 'Draft' }),
            OutputData: JSON.stringify({
                consult: {
                    childRunId: openChildRunId,
                    subAgentId: childAgent.ID,
                    subAgentName: 'ScriptwriterSubAgent',
                    round: 1,
                    question: null,
                },
            }),
        });

        // 1. Agent with ChatHandlingOption = null and no Active Consult relationship -> zero RunView calls
        harness.agent.ChatHandlingOption = null;
        harness.relationships = [
            {
                ID: 'cccccccc-0000-4000-8000-000000000001',
                AgentID: AGENT_ID,
                SubAgentID: CHILD_SUB_AGENT_ID,
                Status: 'Active',
                ChatHandlingOption: null,
            },
            {
                ID: 'cccccccc-0000-4000-8000-000000000002',
                AgentID: AGENT_ID,
                SubAgentID: CHILD_SUB_AGENT_ID,
                Status: 'Disabled',
                ChatHandlingOption: 'Consult',
            },
        ];

        {
            const { agent, flushSteps } = makeAgent([
                () => llmEnvelope({ taskComplete: true, message: 'Done without consult reload' }),
            ]);
            const res = await agent.Execute(
                makeParams({
                    lastRunId: chatEndedRunId,
                    conversationMessages: [{ role: 'user', content: 'Continue' }],
                })
            );
            await flushSteps();
            expect(res.success).toBe(true);
            const consultReloadViews = harness.runViewCalls.filter(
                c =>
                    (c.EntityName === 'MJ: AI Agent Runs' && c.Fields?.includes('FinalStep')) ||
                    c.EntityName === 'MJ: AI Agent Run Steps'
            );
            expect(consultReloadViews).toHaveLength(0);
        }

        // 2. Agent with ChatHandlingOption = null BUT an Active relationship with ChatHandlingOption = 'Consult' -> reloads and formats null question as (no message provided)
        harness.runViewCalls = [];
        harness.relationships = [
            {
                ID: 'cccccccc-0000-4000-8000-000000000003',
                AgentID: AGENT_ID,
                SubAgentID: CHILD_SUB_AGENT_ID,
                Status: 'Active',
                ChatHandlingOption: 'Consult',
            },
        ];

        {
            const { agent, runner, flushSteps } = makeAgent([
                () => llmEnvelope({ taskComplete: true, message: 'Done with relationship consult reload' }),
            ]);
            const res = await agent.Execute(
                makeParams({
                    lastRunId: chatEndedRunId,
                    conversationMessages: [{ role: 'user', content: 'Continue with answer' }],
                })
            );
            await flushSteps();
            expect(res.success).toBe(true);
            const consultReloadViews = harness.runViewCalls.filter(
                c =>
                    (c.EntityName === 'MJ: AI Agent Runs' && c.Fields?.includes('FinalStep')) ||
                    c.EntityName === 'MJ: AI Agent Run Steps'
            );
            expect(consultReloadViews).toHaveLength(2);
            const turn1Msgs = runner.Calls[0].conversationMessages ?? [];
            const consultMsgs = turn1Msgs.filter(
                m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
            );
            expect(consultMsgs).toHaveLength(1);
            expect(consultMsgs[0].content).toContain('(no message provided)');
            expect(consultMsgs[0].content).not.toContain(': .');
        }
    });

    it('does NOT re-inject a consult that was already answered in a later step of the same prior run', async () => {
        const childAgent = registerChildSubAgent();
        const priorParentRunId = 'aaaaaaaa-2222-4000-8000-000000000088';
        const answeredChildRunId = 'bbbbbbbb-2222-4000-8000-000000000061';
        const unansweredChildRunId = 'bbbbbbbb-2222-4000-8000-000000000062';

        harness.priorRuns.push({
            ID: priorParentRunId,
            FinalStep: 'Chat',
            Status: 'AwaitingFeedback',
            CancellationReason: null,
        });
        harness.priorRunSteps.push(
            {
                AgentRunID: priorParentRunId,
                StepNumber: 2,
                StepType: 'Sub-Agent',
                InputData: JSON.stringify({ subAgentName: 'ScriptwriterSubAgent', message: 'First call' }),
                OutputData: JSON.stringify({
                    consult: {
                        childRunId: answeredChildRunId,
                        subAgentId: childAgent.ID,
                        subAgentName: 'ScriptwriterSubAgent',
                        round: 1,
                        question: 'Already answered question?',
                    },
                }),
            },
            {
                AgentRunID: priorParentRunId,
                StepNumber: 4,
                StepType: 'Sub-Agent',
                InputData: JSON.stringify({
                    subAgentName: 'ScriptwriterSubAgent',
                    message: 'Here is answer 1',
                    resumeRunId: answeredChildRunId,
                }),
                OutputData: JSON.stringify({
                    consult: {
                        childRunId: unansweredChildRunId,
                        subAgentId: childAgent.ID,
                        subAgentName: 'ScriptwriterSubAgent',
                        round: 2,
                        question: 'Second question needing human input?',
                    },
                }),
            }
        );

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Done',
                }),
        ]);

        await agent.Execute(
            makeParams({
                lastRunId: priorParentRunId,
                conversationMessages: [
                    { role: 'user', content: 'Initial' },
                    { role: 'assistant', content: 'Second question needing human input?' },
                    { role: 'user', content: 'Human answer 2' },
                ],
            })
        );
        await flushSteps();

        const turn1Msgs = runner.Calls[0].conversationMessages ?? [];
        const consultMsgs = turn1Msgs.filter(
            m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
        );
        expect(consultMsgs).toHaveLength(1);
        expect(consultMsgs[0].content).toContain(unansweredChildRunId);
        expect(consultMsgs[0].content).not.toContain(answeredChildRunId);

        const openConsults = (agent as unknown as { _openSubAgentConsults: Map<string, SubAgentConsultRecord> })._openSubAgentConsults;
        expect(openConsults.has(unansweredChildRunId)).toBe(true);
        expect(openConsults.has(answeredChildRunId)).toBe(false);
    });

    it('no lastRunId makes no RunView call; prior run ending Success or user-stopped injects nothing; RunView failure does not throw', async () => {
        const childAgent = registerChildSubAgent();

        // 1. No lastRunId -> no RunView call for runs or steps
        {
            const { agent, flushSteps } = makeAgent([
                () => llmEnvelope({ taskComplete: true, message: 'Done without lastRunId' }),
            ]);
            const res = await agent.Execute(makeParams());
            await flushSteps();
            expect(res.success).toBe(true);
            const consultViews = harness.runViewCalls.filter(
                c => c.EntityName === 'MJ: AI Agent Runs' || c.EntityName === 'MJ: AI Agent Run Steps'
            );
            expect(consultViews).toHaveLength(0);
        }

        // 2. Prior run ended Success or user-stopped -> nothing injected
        const successRunId = 'aaaaaaaa-2222-4000-8000-000000000051';
        const stoppedRunId = 'aaaaaaaa-2222-4000-8000-000000000052';

        harness.priorRuns.push(
            {
                ID: successRunId,
                FinalStep: 'Success',
                Status: 'Completed',
                CancellationReason: null,
            },
            {
                ID: stoppedRunId,
                FinalStep: 'Chat',
                Status: 'Cancelled',
                CancellationReason: 'User Request',
            }
        );
        for (const runId of [successRunId, stoppedRunId]) {
            harness.priorRunSteps.push({
                AgentRunID: runId,
                StepNumber: 2,
                StepType: 'Sub-Agent',
                InputData: JSON.stringify({ subAgentName: 'ScriptwriterSubAgent', message: 'Call' }),
                OutputData: JSON.stringify({
                    consult: {
                        childRunId: `bbbbbbbb-2222-4000-8000-0000000000${runId.slice(-2)}`,
                        subAgentId: childAgent.ID,
                        subAgentName: 'ScriptwriterSubAgent',
                        round: 1,
                        question: 'Should not be reloaded?',
                    },
                }),
            });
        }

        for (const lastRunId of [successRunId, stoppedRunId]) {
            const { agent, runner, flushSteps } = makeAgent([
                () =>
                    llmEnvelope({
                        taskComplete: true,
                        message: 'Done',
                    }),
            ]);

            await agent.Execute(
                makeParams({
                    lastRunId,
                    conversationMessages: [{ role: 'user', content: 'Continue' }],
                })
            );
            await flushSteps();

            const turn1Msgs = runner.Calls[0].conversationMessages ?? [];
            const consultMsgs = turn1Msgs.filter(
                m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
            );
            expect(consultMsgs).toHaveLength(0);
        }

        // 3. RunView fails (throws) when loading steps -> fail-soft, no throw
        const chatRunId = 'aaaaaaaa-2222-4000-8000-000000000053';
        harness.priorRuns.push({
            ID: chatRunId,
            FinalStep: 'Chat',
            Status: 'AwaitingFeedback',
            CancellationReason: null,
        });
        harness.runViewThrowsOnSteps = true;

        {
            const { agent, runner, flushSteps } = makeAgent([
                () => llmEnvelope({ taskComplete: true, message: 'Survived RunView error' }),
            ]);
            const res = await agent.Execute(
                makeParams({
                    lastRunId: chatRunId,
                    conversationMessages: [{ role: 'user', content: 'Continue despite error' }],
                })
            );
            await flushSteps();
            expect(res.success).toBe(true);
            const turn1Msgs = runner.Calls[0].conversationMessages ?? [];
            const consultMsgs = turn1Msgs.filter(
                m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
            );
            expect(consultMsgs).toHaveLength(0);
        }
    });
});
