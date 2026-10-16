/**
 * Unit tests for VS-CON-3: Resume a sub-agent that asked a question (`resumeRunId`).
 *
 * Covers:
 * 1. `ExecuteSubAgent` with `resumeRunId` (child path with computed payload and related path with mapped payload):
 *    `AgentRunner.RunAgent` receives `lastRunId`, `autoPopulateLastRunPayload: true`, `payload: undefined`,
 *    and `conversationMessages` ending with `assistant: <question>` then `user: <answer>`.
 * 2. Payload continuity: a run with `lastRunId` + `autoPopulateLastRunPayload: true` and `payload: undefined`
 *    starts execution from the prior run's `FinalPayload`.
 * 3. Loop (VS-CON-2 harness): child asks, parent answers with `resumeRunId`, second `ExecuteSubAgent` call
 *    carries the resume, step `InputData` records `resumeRunId`, and parent finishes `Completed`.
 * 4. Validation in `validateSubAgentNextStep`: non-UUID -> Retry; UUID not in open consults -> Retry listing
 *    open IDs; another sub-agent's consult ID -> Retry.
 * 5. Parsing: explicit envelope (single and parallel) and native `delegate_to_*` call carry `resumeRunId`.
 * 6. Prompt & native tool gating: `gatherPromptTemplateData` sets `subAgentConsultEnabled` only when Consult
 *    is active for at least one sub-agent, and `applyNativeTools` exposes `resumeRunId` only on sub-agents
 *    with Consult active.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import type { SubAgentConsultRecord } from '../sub-agent-consult';
import { FormatSubAgentConsultMessage } from '../sub-agent-consult';
import {
    type AIPromptParams,
    type AIPromptRunResult,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type AgentSubAgentRequest,
} from '@memberjunction/ai-core-plus';
import { RecordToolCallingDecision, type ToolCallingMode } from '@memberjunction/ai-prompts';
import type { ChatResult } from '@memberjunction/ai';
import { LogErrorEx, type ChatMessage, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { NativeToolBinding } from '../native-tools/control-tools';

// ============================================================================
// Module mocks
// ============================================================================

const mockRunView = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
        RunView: class {
            RunView = mockRunView;
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

const mockRunAgent = vi.fn();

vi.mock('../AgentRunner', () => ({
    AgentRunner: class {
        RunAgent = mockRunAgent;
    },
}));

// ============================================================================
// Fixed UUIDs
// ============================================================================

const AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TYPE_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const STORAGE_ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000007';
const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000008';

const CHILD_SUB_AGENT_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const RELATED_SUB_AGENT_ID = 'cccccccc-0000-4000-8000-000000000001';
const RELATIONSHIP_ID = 'dddddddd-0000-4000-8000-000000000001';

const CONSULT_RUN_ID_1 = '11111111-1111-4000-8000-000000000001';
const CONSULT_RUN_ID_2 = '22222222-2222-4000-8000-000000000002';
const UNKNOWN_RUN_ID = '99999999-9999-4000-8000-000000000099';

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
    public LastRunID: string | null = null;
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

    public NewRecord(): void {
        // no-op
    }

    public async Save(): Promise<boolean> {
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

class ResumeLoopHarness {
    public agent: Record<string, unknown> = makeAgentRow();
    public subAgents: Record<string, unknown>[] = [];
    public relationships: Record<string, unknown>[] = [];
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];
    public executeSubAgentCalls: Array<{
        request: AgentSubAgentRequest;
        subAgent: MJAIAgentEntityExtended;
        payload: unknown;
    }> = [];
    public executeSubAgentHandler: (
        request: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        payload: unknown
    ) => Promise<ExecuteAgentResult> = async () => {
        throw new Error('executeSubAgentHandler not configured');
    };

    private stepSeq = 0;
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
                const run = new FakeAgentRun();
                this.runs.push(run);
                return run;
            }
            if (entityName === 'MJ: AI Agent Run Steps') {
                const step = new MockStepEntity(++this.stepSeq);
                this.steps.push(step);
                return step;
            }
            throw new Error(`ResumeLoopHarness: unexpected GetEntityObject('${entityName}')`);
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

function registerRelatedSubAgent(
    agentOverrides: Record<string, unknown> = {},
    relOverrides: Record<string, unknown> = {}
): { subAgent: MJAIAgentEntityExtended; relationship: Record<string, unknown> } {
    const subAgent = {
        ...makeAgentRow(),
        ID: RELATED_SUB_AGENT_ID,
        Name: 'VoiceCastingAgent',
        Description: 'Casts voices for characters',
        ParentID: null,
        ExecutionOrder: 1,
        ExecutionMode: 'Sequential',
        ChatHandlingOption: null,
        ...agentOverrides,
    } as unknown as MJAIAgentEntityExtended;
    const relationship = {
        ID: RELATIONSHIP_ID,
        AgentID: AGENT_ID,
        SubAgentID: subAgent.ID,
        SubAgent: subAgent.Name,
        Status: 'Active',
        SubAgentOutputMapping: JSON.stringify({ '*': '*' }),
        SubAgentInputMapping: JSON.stringify({ '*': '*' }),
        SubAgentContextPaths: null,
        ChatHandlingOption: null,
        ConfigurationPresetID: null,
        ...relOverrides,
    };
    harness.subAgents.push(subAgent as unknown as Record<string, unknown>);
    harness.relationships.push(relationship);
    return { subAgent, relationship };
}

let harness: ResumeLoopHarness;

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    protected override async ExecuteSubAgent<SC = unknown, SR = unknown>(
        _params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended,
        payload?: SR,
        _contextMessage?: ChatMessage,
        _stepCount: number = 0
    ): Promise<ExecuteAgentResult<SR>> {
        harness.executeSubAgentCalls.push({
            request: subAgentRequest,
            subAgent,
            payload,
        });
        if (subAgentRequest.resumeRunId) {
            (this as unknown as { _openSubAgentConsults: Map<string, SubAgentConsultRecord> })._openSubAgentConsults.delete(
                subAgentRequest.resumeRunId
            );
        }
        const res = await harness.executeSubAgentHandler(subAgentRequest, subAgent, payload);
        if (stepEntity && res.agentRun?.ID) {
            stepEntity.TargetLogID = res.agentRun.ID;
        }
        return res as ExecuteAgentResult<SR>;
    }
}

class RealExecuteSubAgentCaller extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }

    private get openConsultsMap(): Map<string, SubAgentConsultRecord> {
        return (this as unknown as { _openSubAgentConsults: Map<string, SubAgentConsultRecord> })._openSubAgentConsults;
    }

    public setOpenConsult(record: SubAgentConsultRecord): void {
        this.openConsultsMap.set(record.childRunId, record);
    }

    public getOpenConsult(runId: string): SubAgentConsultRecord | undefined {
        return this.openConsultsMap.get(runId);
    }

    public async invokeExecuteSubAgent<SC = unknown, SR = unknown>(
        params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended,
        payload?: SR,
        contextMessage?: ChatMessage
    ): Promise<ExecuteAgentResult<SR>> {
        return this.ExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity, payload, contextMessage);
    }
}

const TEST_USER = { ID: USER_ID, Name: 'Loop Tester', Email: 'loop@test.mj' } as unknown as UserInfo;

function makeAgent(script: Array<(params: AIPromptParams, callIndex: number) => AIPromptRunResult>): {
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
    return {
        agent: harness.agent as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'Please complete the task' }],
        contextUser: TEST_USER,
        provider: harness.provider as unknown as IMetadataProvider,
        disableDataPreloading: true,
        ...overrides,
    };
}

function llmEnvelope(envelope: LoopAgentResponse): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(envelope),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('VS-CON-3: Resume a sub-agent that asked a question (resumeRunId)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        harness = new ResumeLoopHarness();
        mockRunAgent.mockResolvedValue({
            success: true,
            agentRun: { ID: 'resumed-child-run-id', Status: 'Completed', FinalStep: 'Success' },
            payload: { script: 'final' },
        });
    });

    // ------------------------------------------------------------------------
    // 1. ExecuteSubAgent with resumeRunId (child + related paths)
    // ------------------------------------------------------------------------
    describe('1. ExecuteSubAgent with resumeRunId', () => {
        it('passes lastRunId, autoPopulateLastRunPayload: true, payload: undefined, and injects the consult question as an assistant turn before the answer on the child path (computed payload present)', async () => {
            const caller = new RealExecuteSubAgentCaller();
            const childAgent = registerChildSubAgent();
            caller.setOpenConsult({
                childRunId: CONSULT_RUN_ID_1,
                subAgentId: childAgent.ID,
                subAgentName: childAgent.Name,
                round: 1,
                question: 'Should the narrator sound upbeat or dramatic?',
            });

            const params = makeParams({
                conversationMessages: [{ role: 'user', content: 'Create a 30s spot' }],
            });
            const stepEntity = new MockStepEntity(1) as unknown as MJAIAgentRunStepEntityExtended;
            const computedChildPayload = { draft: 'fresh-parent-slice-that-must-be-ignored' };

            await caller.invokeExecuteSubAgent(
                params,
                {
                    name: childAgent.Name,
                    message: 'Make it dramatic with a warm baritone.',
                    terminateAfter: false,
                    resumeRunId: CONSULT_RUN_ID_1,
                },
                childAgent,
                stepEntity,
                computedChildPayload
            );

            expect(mockRunAgent).toHaveBeenCalledTimes(1);
            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.lastRunId).toBe(CONSULT_RUN_ID_1);
            expect(passedParams.autoPopulateLastRunPayload).toBe(true);
            expect(passedParams.payload).toBeUndefined();

            const msgs = passedParams.conversationMessages;
            expect(msgs.length).toBeGreaterThanOrEqual(2);
            expect(msgs[msgs.length - 2]).toEqual({
                role: 'assistant',
                content: 'Should the narrator sound upbeat or dramatic?',
            });
            expect(msgs[msgs.length - 1]).toEqual({
                role: 'user',
                content: 'Make it dramatic with a warm baritone.',
            });

            // Open consult was removed once answered
            expect(caller.getOpenConsult(CONSULT_RUN_ID_1)).toBeUndefined();
        });

        it('passes lastRunId, autoPopulateLastRunPayload: true, payload: undefined, and injects the consult question before the answer on the related path (mapped payload and contextMessage present)', async () => {
            const caller = new RealExecuteSubAgentCaller();
            const { subAgent } = registerRelatedSubAgent();
            caller.setOpenConsult({
                childRunId: CONSULT_RUN_ID_2,
                subAgentId: subAgent.ID,
                subAgentName: subAgent.Name,
                round: 1,
                question: 'Which accent should Character A use?',
            });

            const params = makeParams();
            const stepEntity = new MockStepEntity(2) as unknown as MJAIAgentRunStepEntityExtended;
            const mappedInputPayload = { mappedField: 'should-be-ignored-on-resume' };
            const contextMessage: ChatMessage = {
                role: 'system',
                content: '# Context from Parent Agent\n{"project":"demo"}',
            };

            await caller.invokeExecuteSubAgent(
                params,
                {
                    name: subAgent.Name,
                    message: 'Use a British RP accent.',
                    terminateAfter: false,
                    resumeRunId: CONSULT_RUN_ID_2,
                },
                subAgent,
                stepEntity,
                mappedInputPayload,
                contextMessage
            );

            expect(mockRunAgent).toHaveBeenCalledTimes(1);
            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.lastRunId).toBe(CONSULT_RUN_ID_2);
            expect(passedParams.autoPopulateLastRunPayload).toBe(true);
            expect(passedParams.payload).toBeUndefined();

            const msgs = passedParams.conversationMessages;
            expect(msgs[0]).toEqual(contextMessage);
            expect(msgs[msgs.length - 2]).toEqual({
                role: 'assistant',
                content: 'Which accent should Character A use?',
            });
            expect(msgs[msgs.length - 1]).toEqual({
                role: 'user',
                content: 'Use a British RP accent.',
            });
            expect(caller.getOpenConsult(CONSULT_RUN_ID_2)).toBeUndefined();
        });

        it('ignores unknown resumeRunId or another sub-agent open resumeRunId when ExecuteSubAgent is called directly (runs fresh with normal payload, no lastRunId, and no injected assistant turn)', async () => {
            const caller = new RealExecuteSubAgentCaller();
            const childAgent = registerChildSubAgent();
            const { subAgent: otherSubAgent } = registerRelatedSubAgent();

            // Register an open consult belonging to otherSubAgent
            caller.setOpenConsult({
                childRunId: CONSULT_RUN_ID_2,
                subAgentId: otherSubAgent.ID,
                subAgentName: otherSubAgent.Name,
                round: 1,
                question: 'Question from otherSubAgent?',
            });

            const params = makeParams();
            const stepEntity = new MockStepEntity(3) as unknown as MJAIAgentRunStepEntityExtended;
            const normalPayload = { normal: 'fresh-payload' };

            // Case A: unknown resumeRunId
            await caller.invokeExecuteSubAgent(
                params,
                {
                    name: childAgent.Name,
                    message: 'Task with unknown resumeRunId',
                    terminateAfter: false,
                    resumeRunId: UNKNOWN_RUN_ID,
                },
                childAgent,
                stepEntity,
                normalPayload
            );

            expect(mockRunAgent).toHaveBeenCalledTimes(1);
            const unknownCallParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(unknownCallParams.lastRunId).toBeUndefined();
            expect(unknownCallParams.autoPopulateLastRunPayload).toBeUndefined();
            expect(unknownCallParams.payload).toEqual(normalPayload);
            expect(unknownCallParams.conversationMessages.some(m => m.role === 'assistant')).toBe(false);
            expect(LogErrorEx).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(UNKNOWN_RUN_ID),
                })
            );

            // Case B: another sub-agent's open resumeRunId
            vi.mocked(LogErrorEx).mockClear();
            await caller.invokeExecuteSubAgent(
                params,
                {
                    name: childAgent.Name,
                    message: 'Task with mismatched sub-agent resumeRunId',
                    terminateAfter: false,
                    resumeRunId: CONSULT_RUN_ID_2,
                },
                childAgent,
                stepEntity,
                normalPayload
            );

            expect(mockRunAgent).toHaveBeenCalledTimes(2);
            const mismatchedCallParams: ExecuteAgentParams = mockRunAgent.mock.calls[1][0];
            expect(mismatchedCallParams.lastRunId).toBeUndefined();
            expect(mismatchedCallParams.autoPopulateLastRunPayload).toBeUndefined();
            expect(mismatchedCallParams.payload).toEqual(normalPayload);
            expect(mismatchedCallParams.conversationMessages.some(m => m.role === 'assistant')).toBe(false);
            expect(LogErrorEx).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(CONSULT_RUN_ID_2),
                })
            );
            // The other sub-agent's open consult remains untouched
            expect(caller.getOpenConsult(CONSULT_RUN_ID_2)).toBeDefined();
        });
    });

    // ------------------------------------------------------------------------
    // 2. Payload continuity with lastRunId + autoPopulateLastRunPayload
    // ------------------------------------------------------------------------
    describe('2. Payload continuity with lastRunId + autoPopulateLastRunPayload', () => {
        it('starts execution from the prior run FinalPayload when payload is undefined', async () => {
            const priorFinalPayload = {
                outline: ['Scene 1', 'Scene 2'],
                partialDraft: 'Opening hook drafted before asking question',
            };

            mockRunView.mockImplementation(async (rvParams: { EntityName?: string; ExtraFilter?: string }) => {
                if (rvParams.EntityName === 'MJ: AI Agent Runs' && rvParams.ExtraFilter?.includes(CONSULT_RUN_ID_1)) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: CONSULT_RUN_ID_1,
                                AgentID: AGENT_ID,
                                Status: 'Completed',
                                LastRunID: null,
                                FinalPayload: JSON.stringify(priorFinalPayload),
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            });

            const { agent, flushSteps } = makeAgent([
                () =>
                    llmEnvelope({
                        taskComplete: true,
                        message: 'Finished using prior payload',
                        payloadChangeRequest: {
                            newElements: { finalized: true },
                        },
                    }),
            ]);

            const result = await agent.Execute(
                makeParams({
                    lastRunId: CONSULT_RUN_ID_1,
                    autoPopulateLastRunPayload: true,
                    payload: undefined,
                })
            );
            await flushSteps();

            expect(result.success).toBe(true);
            expect(harness.runs[0].StartingPayload).toBe(JSON.stringify(priorFinalPayload));
            expect(result.payload).toEqual({
                ...priorFinalPayload,
                finalized: true,
            });
        });
    });

    // ------------------------------------------------------------------------
    // 3. Loop (VS-CON-2 harness): child asks, parent answers with resumeRunId
    // ------------------------------------------------------------------------
    describe('3. Loop: child asks -> parent answers with resumeRunId -> Completed', () => {
        it('resumes the child sub-agent with resumeRunId, records resumeRunId in step InputData, and finishes Completed', async () => {
            registerChildSubAgent();

            harness.executeSubAgentHandler = async (req, subAgent) => {
                if (!req.resumeRunId) {
                    return {
                        success: true,
                        payload: { partialOutline: 'Scene 1 ready' },
                        agentRun: {
                            ID: CONSULT_RUN_ID_1,
                            AgentID: subAgent.ID,
                            Agent: subAgent.Name,
                            Status: 'Completed',
                            FinalStep: 'Chat',
                            Message: 'What aspect ratio should the video target?',
                        } as unknown as ExecuteAgentResult['agentRun'],
                    };
                }
                return {
                    success: true,
                    payload: { partialOutline: 'Scene 1 ready', aspectRatio: '16:9' },
                    agentRun: {
                        ID: '33333333-3333-4000-8000-000000000003',
                        AgentID: subAgent.ID,
                        Agent: subAgent.Name,
                        Status: 'Completed',
                        FinalStep: 'Success',
                        Message: 'Script completed in 16:9.',
                    } as unknown as ExecuteAgentResult['agentRun'],
                };
            };

            const { agent, runner, flushSteps } = makeAgent([
                // Turn 1: parent delegates to ScriptwriterSubAgent
                () =>
                    llmEnvelope({
                        taskComplete: false,
                        message: 'Delegating to scriptwriter',
                        nextStep: {
                            type: 'Sub-Agent',
                            subAgent: {
                                name: 'ScriptwriterSubAgent',
                                message: 'Draft the script',
                                terminateAfter: false,
                            },
                        },
                    }),
                // Turn 2: parent sees the consult question and answers with resumeRunId
                () =>
                    llmEnvelope({
                        taskComplete: false,
                        message: 'Answering scriptwriter consult question',
                        nextStep: {
                            type: 'Sub-Agent',
                            subAgent: {
                                name: 'ScriptwriterSubAgent',
                                message: 'Target 16:9 landscape.',
                                terminateAfter: false,
                                resumeRunId: CONSULT_RUN_ID_1,
                            },
                        },
                    }),
                // Turn 3: parent finishes Completed
                () =>
                    llmEnvelope({
                        taskComplete: true,
                        message: 'Video script is ready.',
                    }),
            ]);

            const result = await agent.Execute(makeParams());
            await flushSteps();

            expect(result.success).toBe(true);
            expect(result.agentRun?.Status).toBe('Completed');
            expect(result.agentRun?.FinalStep).toBe('Success');

            // Verify the consult message on turn 2 included the resumeRunId instruction
            const turn2Messages = runner.Calls[1].conversationMessages ?? [];
            const consultMsg = turn2Messages.find(m => m.content.includes(CONSULT_RUN_ID_1));
            expect(consultMsg).toBeDefined();
            expect(consultMsg!.content).toContain(
                `To answer, call ScriptwriterSubAgent again with resumeRunId: "${CONSULT_RUN_ID_1}" and your answer as the message.`
            );

            // Verify second ExecuteSubAgent call carried resumeRunId
            expect(harness.executeSubAgentCalls).toHaveLength(2);
            expect(harness.executeSubAgentCalls[0].request.resumeRunId).toBeUndefined();
            expect(harness.executeSubAgentCalls[1].request.resumeRunId).toBe(CONSULT_RUN_ID_1);
            expect(harness.executeSubAgentCalls[1].request.message).toBe('Target 16:9 landscape.');

            // Verify Sub-Agent step InputData recorded resumeRunId on the second Sub-Agent step
            const subAgentSteps = harness.steps.filter(s => s.StepType === 'Sub-Agent');
            expect(subAgentSteps).toHaveLength(2);
            const firstInput = JSON.parse(subAgentSteps[0].InputData ?? '{}');
            const secondInput = JSON.parse(subAgentSteps[1].InputData ?? '{}');
            expect(firstInput.resumeRunId).toBeUndefined();
            expect(secondInput.resumeRunId).toBe(CONSULT_RUN_ID_1);
        });
    });

    // ------------------------------------------------------------------------
    // 4. Validation in validateSubAgentNextStep
    // ------------------------------------------------------------------------
    describe('4. Validation of resumeRunId in validateSubAgentNextStep', () => {
        const fakeRun = new FakeAgentRun() as unknown as ExecuteAgentResult['agentRun'];
        const fakeStep = new MockStepEntity(99) as unknown as MJAIAgentRunStepEntityExtended;

        it('returns Retry when resumeRunId is not a valid UUID and increments _generalValidationRetryCount', async () => {
            const child = registerChildSubAgent();
            const caller = new RealExecuteSubAgentCaller();
            caller.setOpenConsult({
                childRunId: CONSULT_RUN_ID_1,
                subAgentId: child.ID,
                subAgentName: child.Name,
                round: 1,
                question: 'Question 1?',
            });

            const internals = caller as unknown as {
                validateSubAgentNextStep: (
                    params: ExecuteAgentParams,
                    nextStep: { step: string; subAgent?: AgentSubAgentRequest },
                    currentPayload: unknown,
                    agentRun: unknown,
                    currentStep: unknown
                ) => Promise<{ step: string; errorMessage?: string }>;
                _generalValidationRetryCount: number;
            };

            const retry = await internals.validateSubAgentNextStep(
                makeParams(),
                {
                    step: 'Sub-Agent',
                    subAgent: {
                        name: child.Name,
                        message: 'Answer',
                        terminateAfter: false,
                        resumeRunId: 'not-a-valid-uuid',
                    },
                },
                {},
                fakeRun,
                fakeStep
            );

            expect(retry.step).toBe('Retry');
            expect(retry.errorMessage).toContain(`Invalid resumeRunId 'not-a-valid-uuid' for sub-agent '${child.Name}'`);
            expect(retry.errorMessage).toContain(CONSULT_RUN_ID_1);
            expect(internals._generalValidationRetryCount).toBe(1);
        });

        it('returns Retry listing open IDs (or "none") when resumeRunId is a UUID that is not an open consult', async () => {
            const child = registerChildSubAgent();
            const caller = new RealExecuteSubAgentCaller();
            const internals = caller as unknown as {
                validateSubAgentNextStep: (
                    params: ExecuteAgentParams,
                    nextStep: { step: string; subAgent?: AgentSubAgentRequest },
                    currentPayload: unknown,
                    agentRun: unknown,
                    currentStep: unknown
                ) => Promise<{ step: string; errorMessage?: string }>;
                _generalValidationRetryCount: number;
            };

            // No open consults -> lists "none"
            const retryNone = await internals.validateSubAgentNextStep(
                makeParams(),
                {
                    step: 'Sub-Agent',
                    subAgent: {
                        name: child.Name,
                        message: 'Answer',
                        terminateAfter: false,
                        resumeRunId: UNKNOWN_RUN_ID,
                    },
                },
                {},
                fakeRun,
                fakeStep
            );
            expect(retryNone.step).toBe('Retry');
            expect(retryNone.errorMessage).toContain(`Open consult run IDs for '${child.Name}': none`);

            // With an open consult -> lists that open consult ID
            caller.setOpenConsult({
                childRunId: CONSULT_RUN_ID_1,
                subAgentId: child.ID,
                subAgentName: child.Name,
                round: 1,
                question: 'Question 1?',
            });
            const retryWithOpen = await internals.validateSubAgentNextStep(
                makeParams(),
                {
                    step: 'Sub-Agent',
                    subAgent: {
                        name: child.Name,
                        message: 'Answer',
                        terminateAfter: false,
                        resumeRunId: UNKNOWN_RUN_ID,
                    },
                },
                {},
                fakeRun,
                fakeStep
            );
            expect(retryWithOpen.step).toBe('Retry');
            expect(retryWithOpen.errorMessage).toContain(`Open consult run IDs for '${child.Name}': ${CONSULT_RUN_ID_1}`);
        });

        it('returns Retry when resumeRunId belongs to another sub-agent', async () => {
            const child = registerChildSubAgent();
            const { subAgent: related } = registerRelatedSubAgent();
            const caller = new RealExecuteSubAgentCaller();

            // Open consult belongs to related sub-agent, NOT child sub-agent
            caller.setOpenConsult({
                childRunId: CONSULT_RUN_ID_2,
                subAgentId: related.ID,
                subAgentName: related.Name,
                round: 1,
                question: 'Question from VoiceCastingAgent?',
            });

            const internals = caller as unknown as {
                validateSubAgentNextStep: (
                    params: ExecuteAgentParams,
                    nextStep: { step: string; subAgent?: AgentSubAgentRequest },
                    currentPayload: unknown,
                    agentRun: unknown,
                    currentStep: unknown
                ) => Promise<{ step: string; errorMessage?: string }>;
            };

            const retry = await internals.validateSubAgentNextStep(
                makeParams(),
                {
                    step: 'Sub-Agent',
                    subAgent: {
                        name: child.Name,
                        message: 'Trying to answer wrong sub-agent',
                        terminateAfter: false,
                        resumeRunId: CONSULT_RUN_ID_2,
                    },
                },
                {},
                fakeRun,
                fakeStep
            );

            expect(retry.step).toBe('Retry');
            expect(retry.errorMessage).toContain(`Open consult run IDs for '${child.Name}': none`);
        });

        it('returns Retry when a parallel step carries the same open resumeRunId more than once', async () => {
            const child = registerChildSubAgent();
            const caller = new RealExecuteSubAgentCaller();
            caller.setOpenConsult({
                childRunId: CONSULT_RUN_ID_1,
                subAgentId: child.ID,
                subAgentName: child.Name,
                round: 1,
                question: 'Should we use 16:9 or 9:16?',
            });

            const internals = caller as unknown as {
                validateSubAgentNextStep: (
                    params: ExecuteAgentParams,
                    nextStep: { step: string; subAgents?: AgentSubAgentRequest[] },
                    currentPayload: unknown,
                    agentRun: unknown,
                    currentStep: unknown
                ) => Promise<{ step: string; errorMessage?: string }>;
                _generalValidationRetryCount: number;
            };

            const retry = await internals.validateSubAgentNextStep(
                makeParams(),
                {
                    step: 'Sub-Agent',
                    subAgents: [
                        {
                            name: child.Name,
                            message: 'Answer 1',
                            terminateAfter: false,
                            resumeRunId: CONSULT_RUN_ID_1,
                        },
                        {
                            name: child.Name,
                            message: 'Answer 2',
                            terminateAfter: false,
                            resumeRunId: CONSULT_RUN_ID_1,
                        },
                    ],
                },
                {},
                fakeRun,
                fakeStep
            );

            expect(retry.step).toBe('Retry');
            expect(retry.errorMessage).toContain(`resumeRunId '${CONSULT_RUN_ID_1}' is used more than once`);
            expect(internals._generalValidationRetryCount).toBe(1);
        });
    });

    // ------------------------------------------------------------------------
    // 5. Parsing: explicit envelope (single + parallel) and native tool call
    // ------------------------------------------------------------------------
    describe('5. Parsing resumeRunId in LoopAgentType', () => {
        it('carries resumeRunId in explicit envelope (single and parallel) and native delegate_to_* calls', async () => {
            const loopType = new LoopAgentType();

            const singleResult = await loopType.DetermineNextStep(
                llmEnvelope({
                    taskComplete: false,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: 'Answer single',
                            terminateAfter: false,
                            resumeRunId: CONSULT_RUN_ID_1,
                        },
                    },
                }),
                makeParams(),
                {},
                {}
            );
            expect(singleResult.step).toBe('Sub-Agent');
            expect(singleResult.subAgent?.resumeRunId).toBe(CONSULT_RUN_ID_1);

            const parallelResult = await loopType.DetermineNextStep(
                llmEnvelope({
                    taskComplete: false,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgents: [
                            {
                                name: 'ScriptwriterSubAgent',
                                message: 'Answer 1',
                                terminateAfter: false,
                                resumeRunId: CONSULT_RUN_ID_1,
                            },
                            {
                                name: 'VoiceCastingAgent',
                                message: 'Answer 2',
                                terminateAfter: false,
                                resumeRunId: CONSULT_RUN_ID_2,
                            },
                        ],
                    },
                }),
                makeParams(),
                {},
                {}
            );
            expect(parallelResult.step).toBe('Sub-Agent');
            expect(parallelResult.subAgents?.map(s => s.resumeRunId)).toEqual([CONSULT_RUN_ID_1, CONSULT_RUN_ID_2]);

            // Native tool call
            const chatResult = {
                data: {
                    choices: [
                        {
                            message: {
                                content: '',
                                toolCalls: [
                                    {
                                        id: 'call_1',
                                        name: 'delegate_to_scriptwriter_sub_agent',
                                        arguments: {
                                            message: 'Native answer',
                                            terminateAfter: false,
                                            resumeRunId: CONSULT_RUN_ID_1,
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            } as unknown as ChatResult;
            RecordToolCallingDecision(chatResult, {
                useNativeTools: true,
                mode: 'NativeImplicit' as ToolCallingMode,
                controlFlow: 'implicit',
                toolResults: true,
            });
            const bindings = new Map<string, NativeToolBinding>([
                [
                    'delegate_to_scriptwriter_sub_agent',
                    {
                        kind: 'subAgent',
                        toolName: 'delegate_to_scriptwriter_sub_agent',
                        agent: { Name: 'ScriptwriterSubAgent' },
                        tool: { name: 'delegate_to_scriptwriter_sub_agent', inputSchema: {} },
                    } as unknown as NativeToolBinding,
                ],
            ]);
            const probe = loopType as unknown as {
                nextStepFromNativeToolCalls: (
                    res: AIPromptRunResult,
                    b?: ReadonlyMap<string, NativeToolBinding>
                ) => { step: string; subAgent?: AgentSubAgentRequest } | null;
            };
            const nativeStep = probe.nextStepFromNativeToolCalls(
                {
                    success: true,
                    result: '',
                    rawResult: '',
                    promptRun: { ToolCallingMode: 'NativeImplicit' },
                    chatResult,
                } as unknown as AIPromptRunResult,
                bindings
            );
            expect(nativeStep?.step).toBe('Sub-Agent');
            expect(nativeStep?.subAgent?.resumeRunId).toBe(CONSULT_RUN_ID_1);
        });
    });

    // ------------------------------------------------------------------------
    // 6. Prompt & native tool gating in BaseAgent
    // ------------------------------------------------------------------------
    describe('6. Prompt contextData & native tool gating in BaseAgent', () => {
        it('sets subAgentConsultEnabled in gatherPromptTemplateData only when Consult is active for at least one sub-agent', async () => {
            registerChildSubAgent({ ChatHandlingOption: null });
            const caller = new RealExecuteSubAgentCaller();
            const internals = caller as unknown as {
                gatherPromptTemplateData: (
                    agent: MJAIAgentEntityExtended,
                    contextUser?: UserInfo
                ) => Promise<{ subAgentConsultEnabled?: boolean }>;
            };

            // Parent has ChatHandlingOption='Consult' -> child inherits Consult -> subAgentConsultEnabled is true
            const dataWithConsult = await internals.gatherPromptTemplateData(
                harness.agent as unknown as MJAIAgentEntityExtended,
                TEST_USER
            );
            expect(dataWithConsult.subAgentConsultEnabled).toBe(true);

            // Parent has ChatHandlingOption=null and child has ChatHandlingOption=null -> subAgentConsultEnabled is omitted
            harness.agent.ChatHandlingOption = null;
            const dataWithoutConsult = await internals.gatherPromptTemplateData(
                harness.agent as unknown as MJAIAgentEntityExtended,
                TEST_USER
            );
            expect(dataWithoutConsult.subAgentConsultEnabled).toBeUndefined();
        });

        it('FormatSubAgentConsultMessage includes the resumeRunId instruction line', () => {
            const msg = FormatSubAgentConsultMessage({
                subAgentName: 'ScriptwriterSubAgent',
                childRunId: CONSULT_RUN_ID_1,
                question: 'Which tone?',
                round: 1,
                maxRounds: 3,
            });
            expect(msg).toContain(
                `To answer, call ScriptwriterSubAgent again with resumeRunId: "${CONSULT_RUN_ID_1}" and your answer as the message.`
            );
        });
    });
});
