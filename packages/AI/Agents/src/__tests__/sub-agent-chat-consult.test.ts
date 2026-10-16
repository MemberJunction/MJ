/**
 * Unit tests for VS-CON-2: Sub-agent ChatHandlingOption='Consult' resolution and consult flow
 * across child, related, parallel, and native sub-agent tool call paths.
 *
 * Drives the real BaseAgent.Execute() loop using the LoopHarness pattern from base-agent-loop.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { BaseAgentType } from '../agent-types/base-agent-type';
// Register real LoopAgentType with MJGlobal ClassFactory
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import {
    DEFAULT_MAX_SUB_AGENT_CONSULT_ROUNDS,
    FormatResponseFormSummary,
    FormatSubAgentConsultMessage,
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
import { RecordToolCallingDecision } from '@memberjunction/ai-prompts';
import { SanitizeToolName } from '../native-tools/action-tool-builder';
import { LogError, LogStatus } from '@memberjunction/core';
import type { ChatMessage, IMetadataProvider, MJAIAgentRelationshipEntity, UserInfo } from '@memberjunction/core';

// ============================================================================
// Module mocks (boundaries only — matching base-agent-loop.test.ts)
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
const RELATED_SUB_AGENT_ID = 'cccccccc-0000-4000-8000-000000000001';
const RELATIONSHIP_ID = 'dddddddd-0000-4000-8000-000000000001';

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

class ConsultLoopHarness {
    public agent: Record<string, unknown> = makeAgentRow();
    public subAgents: Record<string, unknown>[] = [];
    public relationships: Record<string, unknown>[] = [];
    public runs: FakeAgentRun[] = [];
    public steps: MockStepEntity[] = [];
    public executeSubAgentHandler: (
        request: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended
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
            GetAgentConfigurationPresets: (): unknown[] => [],
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
            if (entityName === 'MJ: AI Agent Requests') {
                return {
                    ID: '',
                    NewRecord() {
                        this.ID = 'aaaaaaaa-4444-4000-8000-000000000001';
                    },
                    Save: async () => true,
                };
            }
            throw new Error(`ConsultLoopHarness: unexpected GetEntityObject('${entityName}')`);
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

let harness: ConsultLoopHarness;

class HarnessAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
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

class FlowAgentTypeStub extends BaseAgentType {
    public override get InjectLoopResultsAsMessage(): boolean {
        return false;
    }
    public async Initialize(): Promise<void> {}
    public async DetermineInitialStep(): Promise<null> {
        return null;
    }
    public async DetermineNextStep(): Promise<null> {
        return null;
    }
    public async PreProcessNextStep(): Promise<void> {}
    public GetPromptForStep(): null {
        return null;
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

function makeSubAgentChatResult(params: {
    runId: string;
    agentId: string;
    agentName: string;
    message: string;
    payload?: Record<string, unknown>;
    responseForm?: Record<string, unknown>;
}): ExecuteAgentResult {
    return {
        success: true,
        payload: params.payload ?? { draft: 'v1' },
        responseForm: params.responseForm as ExecuteAgentResult['responseForm'],
        agentRun: {
            ID: params.runId,
            AgentID: params.agentId,
            Agent: params.agentName,
            Status: 'Completed',
            FinalStep: 'Chat',
            Message: params.message,
            TotalTokensUsed: 50,
            TotalCost: 0.01,
            TotalPromptTokensUsed: 30,
            TotalCompletionTokensUsed: 20,
            TotalCostRollup: 0.01,
            TotalPromptTokensRollup: 30,
            TotalCompletionTokensRollup: 20,
            Steps: [],
        } as unknown as MJAIAgentRunEntityExtended,
    };
}

function makeSubAgentSuccessResult(params: {
    runId: string;
    agentId: string;
    agentName: string;
    payload?: Record<string, unknown>;
}): ExecuteAgentResult {
    return {
        success: true,
        payload: params.payload ?? { completed: true },
        agentRun: {
            ID: params.runId,
            AgentID: params.agentId,
            Agent: params.agentName,
            Status: 'Completed',
            FinalStep: 'Success',
            Message: 'Done!',
            TotalTokensUsed: 40,
            TotalCost: 0.01,
            TotalPromptTokensUsed: 20,
            TotalCompletionTokensUsed: 20,
            TotalCostRollup: 0.01,
            TotalPromptTokensRollup: 20,
            TotalCompletionTokensRollup: 20,
            Steps: [],
        } as unknown as MJAIAgentRunEntityExtended,
    };
}

// ============================================================================
// Pure Formatting Helper Tests
// ============================================================================

describe('VS-CON-2: Sub-Agent Consult pure formatting helpers', () => {
    it('FormatResponseFormSummary returns empty string for empty or missing forms and formats questions cleanly', () => {
        expect(FormatResponseFormSummary(null)).toBe('');
        expect(FormatResponseFormSummary(undefined)).toBe('');
        expect(FormatResponseFormSummary({ questions: [] })).toBe('');

        const summary = FormatResponseFormSummary({
            title: 'Creative Brief Clarification',
            description: 'Select format options',
            questions: [
                {
                    id: 'aspectRatio',
                    label: 'Target aspect ratio',
                    required: true,
                    type: {
                        type: 'buttongroup',
                        options: [
                            { value: '16:9', label: 'Landscape (16:9)' },
                            { value: '9:16', label: 'Vertical (9:16)' },
                        ],
                    },
                },
                {
                    id: 'duration',
                    label: 'Duration in seconds',
                    required: false,
                    type: { type: 'number' },
                },
            ],
        });

        expect(summary).toContain('Title: Creative Brief Clarification');
        expect(summary).toContain('Description: Select format options');
        expect(summary).toContain('- Target aspect ratio (buttongroup, required) [Landscape (16:9), Vertical (9:16)]');
        expect(summary).toContain('- Duration in seconds (number, optional)');
    });

    it('FormatSubAgentConsultMessage includes SubAgentName, round x of y, Question, Form summary, Child run ID, and guidance', () => {
        const msg = FormatSubAgentConsultMessage({
            subAgentName: 'ScriptwriterSubAgent',
            round: 1,
            maxRounds: 3,
            question: 'Should the tone be cinematic or playful?',
            responseForm: {
                questions: [
                    {
                        id: 'tone',
                        label: 'Tone',
                        required: true,
                        type: {
                            type: 'radio',
                            options: [
                                { value: 'cinematic', label: 'Cinematic' },
                                { value: 'playful', label: 'Playful' },
                            ],
                        },
                    },
                ],
            },
            childRunId: 'run-sub-123',
        });

        expect(msg).toContain('## Sub-agent ScriptwriterSubAgent is asking you (round 1 of 3)');
        expect(msg).toContain('**Question:** Should the tone be cinematic or playful?');
        expect(msg).toContain('**Form:**');
        expect(msg).toContain('- Tone (radio, required) [Cinematic, Playful]');
        expect(msg).toContain('**Child run ID:** run-sub-123');
        expect(msg).toContain('Answer this question from what you already know, ask your own caller with a Chat step only if they alone can answer, or tell the sub-agent to proceed without it.');
    });

    it('FormatSubAgentConsultMessage uses "(no message provided)" when question is null or empty and never prints "null"', () => {
        const msgNull = FormatSubAgentConsultMessage({
            subAgentName: 'ScriptwriterSubAgent',
            round: 1,
            maxRounds: 3,
            question: null,
            childRunId: 'run-sub-null',
        });
        expect(msgNull).toContain('**Question:** (no message provided)');
        expect(msgNull).not.toContain('**Question:** null');

        const msgBlank = FormatSubAgentConsultMessage({
            subAgentName: 'ScriptwriterSubAgent',
            round: 1,
            maxRounds: 3,
            question: '   ',
            childRunId: 'run-sub-blank',
        });
        expect(msgBlank).toContain('**Question:** (no message provided)');
    });
});

// ============================================================================
// BaseAgent.Execute() Loop Integration Tests for Consult
// ============================================================================

describe('VS-CON-2: Sub-Agent Consult flow in BaseAgent.Execute()', () => {
    beforeEach(() => {
        harness = new ConsultLoopHarness();
        vi.clearAllMocks();
    });

    it('Case 1 (Answer): Consult parent, child returns Chat with question + responseForm -> parent continues with consult message, re-calls child which succeeds, and parent finishes Completed', async () => {
        const childAgent = registerChildSubAgent();
        const childRunId1 = 'bbbbbbbb-2222-4000-8000-000000000001';
        const childRunId2 = 'bbbbbbbb-2222-4000-8000-000000000002';

        let subCall = 0;
        harness.executeSubAgentHandler = async () => {
            subCall += 1;
            if (subCall === 1) {
                return makeSubAgentChatResult({
                    runId: childRunId1,
                    agentId: childAgent.ID,
                    agentName: childAgent.Name,
                    message: 'What aspect ratio should I target?',
                    payload: { scriptDraft: 'Scene 1...' },
                    responseForm: {
                        questions: [
                            {
                                id: 'ratio',
                                label: 'Aspect Ratio',
                                required: true,
                                type: {
                                    type: 'buttongroup',
                                    options: [
                                        { value: '16:9', label: '16:9' },
                                        { value: '9:16', label: '9:16' },
                                    ],
                                },
                            },
                        ],
                    },
                });
            }
            return makeSubAgentSuccessResult({
                runId: childRunId2,
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                payload: { scriptDraft: 'Final 16:9 script' },
            });
        };

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Delegating to scriptwriter',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: 'Write a 30s script',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Answering scriptwriter: use 16:9',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: 'Use 16:9 aspect ratio',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Finished after child succeeded',
                    payloadChangeRequest: { newElements: { status: 'done' } },
                }),
        ]);

        const result = await agent.Execute(makeParams({ payload: {} }));
        await flushSteps();

        expect(result.success).toBe(true);
        expect(result.agentRun.Status).toBe('Completed');
        expect(result.agentRun.FinalStep).toBe('Success');
        expect(runner.Calls).toHaveLength(3);

        // Verify sub-agent-consult message was injected into parent conversationMessages before turn 2
        const turn2Messages = runner.Calls[1].conversationMessages ?? [];
        const consultMsg = turn2Messages.find(
            m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
        ) as { content: string; metadata?: Record<string, unknown> } | undefined;
        expect(consultMsg).toBeDefined();
        expect(consultMsg?.metadata?.subAgentName).toBe('ScriptwriterSubAgent');
        expect(consultMsg?.metadata?.subAgentId).toBe(childAgent.ID);
        expect(consultMsg?.metadata?.turnAdded).toBeDefined();
        expect(consultMsg?.content).toContain('## Sub-agent ScriptwriterSubAgent is asking you (round 1 of 3)');
        expect(consultMsg?.content).toContain('**Question:** What aspect ratio should I target?');
        expect(consultMsg?.content).toContain('- Aspect Ratio (buttongroup, required) [16:9, 9:16]');
        expect(consultMsg?.content).toContain(`**Child run ID:** ${childRunId1}`);

        // Verify _openSubAgentConsults has the entry keyed by childRunId1
        const openConsults = (agent as unknown as { _openSubAgentConsults: Map<string, SubAgentConsultRecord> })._openSubAgentConsults;
        expect(openConsults.has(childRunId1)).toBe(true);
        expect(openConsults.get(childRunId1)).toEqual({
            childRunId: childRunId1,
            subAgentId: childAgent.ID,
            subAgentName: 'ScriptwriterSubAgent',
            round: 1,
            question: 'What aspect ratio should I target?',
        });

        // Verify parent Sub-Agent step 1 preserved TargetLogID = childRunId1 and completed with OutputData.consult
        const subAgentSteps = harness.steps.filter(s => s.StepType === 'Sub-Agent');
        expect(subAgentSteps).toHaveLength(2);
        expect(subAgentSteps[0].TargetLogID).toBe(childRunId1);
        expect(subAgentSteps[0].Status).toBe('Completed');
        const parsedOutput = JSON.parse(subAgentSteps[0].OutputData ?? '{}');
        expect(parsedOutput.consult).toEqual({
            childRunId: childRunId1,
            subAgentId: childAgent.ID,
            subAgentName: 'ScriptwriterSubAgent',
            round: 1,
            question: 'What aspect ratio should I target?',
        });
    });

    it('Case 2 (Escalate): Parent next turn after consult is a Chat step -> run ends AwaitingFeedback, FinalStep Chat, with the parent message and no error logged', async () => {
        const childAgent = registerChildSubAgent();
        const childRunId = 'bbbbbbbb-2222-4000-8000-000000000005';

        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: childRunId,
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                message: 'What is the client brand color?',
            });

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Delegating to scriptwriter',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: 'Write script',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Could you tell me your brand primary hex color?',
                    nextStep: {
                        type: 'Chat',
                    },
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        expect(runner.Calls).toHaveLength(2);
        expect(result.success).toBe(true);
        expect(result.agentRun.Status).toBe('AwaitingFeedback');
        expect(result.agentRun.FinalStep).toBe('Chat');
        expect(result.agentRun.Message).toBe('Could you tell me your brand primary hex color?');
        expect(LogError).not.toHaveBeenCalledWith(expect.stringContaining('Invalid ChatHandlingOption'));
    });

    it('Case 3 & 4 (Bound exceeded + Default bound): MaxSubAgentConsultRounds=2 gives 2 consults then propagates 3rd Chat; NULL gives default 3 consults then propagates 4th Chat', async () => {
        harness.agent.MaxSubAgentConsultRounds = 2;
        const childAgent = registerChildSubAgent();

        const finalForm = {
            questions: [
                {
                    id: 'finalApproval',
                    label: 'Approve script?',
                    required: true,
                    type: { type: 'text' as const },
                },
            ],
        };

        let subCall = 0;
        harness.executeSubAgentHandler = async () => {
            subCall += 1;
            return makeSubAgentChatResult({
                runId: `bbbbbbbb-2222-4000-8000-00000000001${subCall}`,
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                message: `Question ${subCall}?`,
                responseForm: subCall === 3 ? finalForm : undefined,
            });
        };

        const { agent, runner, flushSteps } = makeAgent([
            (_p, idx) =>
                llmEnvelope({
                    taskComplete: false,
                    message: `Delegating turn ${idx + 1}`,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: `Attempt ${idx + 1}`,
                            terminateAfter: false,
                        },
                    },
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        // Turn 1 -> consult round 1 of 2 (continues)
        // Turn 2 -> consult round 2 of 2 (continues)
        // Turn 3 -> exceeds MaxSubAgentConsultRounds=2 -> bubbles Chat with terminate:true!
        expect(runner.Calls).toHaveLength(3);
        const allConsultMsgs = (runner.Calls[2].conversationMessages ?? []).filter(
            m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
        );
        expect(allConsultMsgs).toHaveLength(2);
        expect(result.success).toBe(true);
        expect(result.agentRun.FinalStep).toBe('Chat');
        expect(result.agentRun.Message).toBe('Question 3?');
        expect(result.responseForm).toEqual(finalForm);

        // Now verify NULL MaxSubAgentConsultRounds uses DEFAULT_MAX_SUB_AGENT_CONSULT_ROUNDS (3)
        expect(DEFAULT_MAX_SUB_AGENT_CONSULT_ROUNDS).toBe(3);
        harness = new ConsultLoopHarness();
        harness.agent.MaxSubAgentConsultRounds = null;
        const childAgentDefault = registerChildSubAgent();
        let defaultSubCall = 0;
        harness.executeSubAgentHandler = async () => {
            defaultSubCall += 1;
            return makeSubAgentChatResult({
                runId: `bbbbbbbb-2222-4000-8000-00000000009${defaultSubCall}`,
                agentId: childAgentDefault.ID,
                agentName: childAgentDefault.Name,
                message: `Default bound question ${defaultSubCall}?`,
            });
        };
        const { agent: agent2, runner: runner2, flushSteps: flush2 } = makeAgent([
            (_p, idx) =>
                llmEnvelope({
                    taskComplete: false,
                    message: `Delegating default turn ${idx + 1}`,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: `Attempt ${idx + 1}`,
                            terminateAfter: false,
                        },
                    },
                }),
        ]);
        const result2 = await agent2.Execute(makeParams());
        await flush2();

        expect(runner2.Calls).toHaveLength(4);
        const defaultConsultMsgs = (runner2.Calls[3].conversationMessages ?? []).filter(
            m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
        );
        expect(defaultConsultMsgs).toHaveLength(3);
        expect(result2.agentRun.FinalStep).toBe('Chat');
        expect(result2.agentRun.Message).toBe('Default bound question 4?');
    });

    it('Case 5 (Resolution): relationship Consult over parent NULL; relationship NULL inherits parent Consult; relationship Success over parent Consult ends Success; ParentID child uses parent value', async () => {
        // 5a: relationship Consult over parent NULL
        harness.agent.ChatHandlingOption = null;
        const { subAgent } = registerRelatedSubAgent(
            { ChatHandlingOption: null },
            { ChatHandlingOption: 'Consult' }
        );
        const relRunId = 'cccccccc-2222-4000-8000-000000000001';

        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: relRunId,
                agentId: subAgent.ID,
                agentName: subAgent.Name,
                message: 'Should narrator voice be warm or energetic?',
            });

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Calling VoiceCastingAgent',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'VoiceCastingAgent',
                            message: 'Cast narrator voice',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Resolved voice casting',
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        const consultMsg = (runner.Calls[1].conversationMessages ?? []).find(
            m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
        ) as { content: string } | undefined;
        expect(consultMsg).toBeDefined();
        expect(consultMsg?.content).toContain(`**Child run ID:** ${relRunId}`);

        // 5b: relationship NULL inherits parent Consult
        harness = new ConsultLoopHarness();
        harness.agent.ChatHandlingOption = 'Consult';
        const { subAgent: subInherit } = registerRelatedSubAgent(
            { ChatHandlingOption: null },
            { ChatHandlingOption: null }
        );
        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: 'cccccccc-2222-4000-8000-000000000002',
                agentId: subInherit.ID,
                agentName: subInherit.Name,
                message: 'Inherited consult question?',
            });
        const { agent: agentB, runner: runnerB, flushSteps: flushB } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Calling VoiceCastingAgent',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'VoiceCastingAgent',
                            message: 'Cast narrator voice',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Done',
                }),
        ]);
        const resultB = await agentB.Execute(makeParams());
        await flushB();
        expect(resultB.success).toBe(true);
        expect(runnerB.Calls).toHaveLength(2);

        // 5c: relationship Success over parent Consult -> parent ends Success (in 1 turn, as today)
        harness = new ConsultLoopHarness();
        harness.agent.ChatHandlingOption = 'Consult';
        const { subAgent: subSuccessOverride } = registerRelatedSubAgent(
            { ChatHandlingOption: null },
            { ChatHandlingOption: 'Success' }
        );
        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: 'cccccccc-2222-4000-8000-000000000003',
                agentId: subSuccessOverride.ID,
                agentName: subSuccessOverride.Name,
                message: 'Should remap to Success',
            });
        const { agent: agentC, runner: runnerC, flushSteps: flushC } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Calling VoiceCastingAgent',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'VoiceCastingAgent',
                            message: 'Cast narrator voice',
                            terminateAfter: false,
                        },
                    },
                }),
        ]);
        const resultC = await agentC.Execute(makeParams());
        await flushC();
        expect(runnerC.Calls).toHaveLength(1);
        expect(resultC.success).toBe(true);
        expect(resultC.agentRun.FinalStep).toBe('Success');
    });

    it('Case 6 (Flow parent): when parent agent type has InjectLoopResultsAsMessage=false, Consult is downgraded to null (propagates Chat with terminate:true) and logs a warning once per run', async () => {
        const flowParent = makeAgentRow({ ChatHandlingOption: 'Consult' }) as unknown as MJAIAgentEntityExtended;
        const childWithConsult = registerChildSubAgent();
        const flowTypeInstance = new FlowAgentTypeStub();

        const runner = new BaseAgent() as unknown as {
            _agentTypeInstance: BaseAgentType | null;
            _loggedConsultUnsupportedAgentType: boolean;
            effectiveSubAgentChatHandlingOption: (
                parentAgent: MJAIAgentEntityExtended,
                relationship?: MJAIAgentRelationshipEntity,
                params?: ExecuteAgentParams
            ) => 'Consult' | 'Failed' | 'Retry' | 'Success' | null;
            handleSingleSubAgentChatStep: (
                params: ExecuteAgentParams,
                previousDecision: Record<string, unknown>,
                subAgentRequest: { name: string; message: string; terminateAfter: boolean },
                subAgentEntity: MJAIAgentEntityExtended,
                relationship: undefined,
                subAgentResult: ExecuteAgentResult,
                mergedPayload: Record<string, unknown>,
                stepEntity: MJAIAgentRunStepEntityExtended,
                outputData: Record<string, unknown>
            ) => Promise<{ step: string; terminate: boolean }>;
        };

        runner._agentTypeInstance = flowTypeInstance;
        runner._loggedConsultUnsupportedAgentType = false;

        const execParams = makeParams({ agent: flowParent });

        // First check: returns null and logs warning
        const effective1 = runner.effectiveSubAgentChatHandlingOption(flowParent, undefined, execParams);
        // Second check in same run: returns null without duplicate warning
        const effective2 = runner.effectiveSubAgentChatHandlingOption(flowParent, undefined, execParams);

        expect(effective1).toBeNull();
        expect(effective2).toBeNull();
        const warnCalls = vi.mocked(LogStatus).mock.calls.filter(c =>
            String(c[0]).includes("ChatHandlingOption 'Consult' is not supported for agent types where InjectLoopResultsAsMessage is false")
        );
        expect(warnCalls).toHaveLength(1);

        // Verify handleSingleSubAgentChatStep propagates Chat with terminate: true for Flow parent
        const parentStep = new MockStepEntity(99) as unknown as MJAIAgentRunStepEntityExtended;
        const subResult = makeSubAgentChatResult({
            runId: 'bbbbbbbb-2222-4000-8000-000000000099',
            agentId: childWithConsult.ID,
            agentName: childWithConsult.Name,
            message: 'Flow child needs user input',
        });

        const nextStep = await runner.handleSingleSubAgentChatStep(
            execParams,
            { step: 'Sub-Agent', terminate: false },
            { name: childWithConsult.Name, message: 'Run', terminateAfter: false },
            childWithConsult,
            undefined,
            subResult,
            {},
            parentStep,
            {}
        );

        expect(nextStep.step).toBe('Chat');
        expect(nextStep.terminate).toBe(true);
    });

    it('Case 7 (Parallel): two children both Chat under Consult -> one summary with both questions and both run IDs and parent continues even with terminateAfter:true; without Consult -> question line appears and run behaves as today', async () => {
        const childA = registerChildSubAgent({
            ID: 'bbbbbbbb-0000-4000-8000-000000000010',
            Name: 'AudioMixerSubAgent',
        });
        const childB = registerChildSubAgent({
            ID: 'bbbbbbbb-0000-4000-8000-000000000011',
            Name: 'VisualDirectorSubAgent',
        });
        const consultRunIdA = 'bbbbbbbb-2222-4000-8000-000000000020';
        const consultRunIdB = 'bbbbbbbb-2222-4000-8000-000000000021';

        harness.executeSubAgentHandler = async (_req, subAgent) => {
            if (subAgent.ID === childA.ID) {
                return makeSubAgentChatResult({
                    runId: consultRunIdA,
                    agentId: childA.ID,
                    agentName: childA.Name,
                    message: 'Should audio use synthwave or orchestral?',
                    payload: { audioDraft: 'synth' },
                });
            }
            return makeSubAgentChatResult({
                runId: consultRunIdB,
                agentId: childB.ID,
                agentName: childB.Name,
                message: 'Should visuals use neon or pastel palette?',
                payload: { visualDraft: 'board-1' },
            });
        };

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Running audio and visual sub-agents in parallel',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgents: [
                            { name: 'AudioMixerSubAgent', message: 'Mix audio', terminateAfter: true },
                            { name: 'VisualDirectorSubAgent', message: 'Design visuals', terminateAfter: true },
                        ],
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Both parallel sub-agents handled',
                }),
        ]);

        const result = await agent.Execute(makeParams({ payload: {} }));
        await flushSteps();

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expect(result.payload).toMatchObject({
            audioDraft: 'synth',
            visualDraft: 'board-1',
        });

        const turn2Messages = runner.Calls[1].conversationMessages ?? [];
        const summaryMsg = turn2Messages.find(
            m => typeof m.content === 'string' && m.content.startsWith('Parallel Sub-Agents Completed:')
        ) as { content: string } | undefined;

        expect(summaryMsg).toBeDefined();
        expect(summaryMsg?.content).toContain('* Question (round 1 of 3): Should audio use synthwave or orchestral?');
        expect(summaryMsg?.content).toContain(`* Child run ID: ${consultRunIdA}`);
        expect(summaryMsg?.content).toContain('* Question (round 1 of 3): Should visuals use neon or pastel palette?');
        expect(summaryMsg?.content).toContain(`* Child run ID: ${consultRunIdB}`);

        const openConsults = (agent as unknown as { _openSubAgentConsults: Map<string, SubAgentConsultRecord> })._openSubAgentConsults;
        expect(openConsults.has(consultRunIdA)).toBe(true);
        expect(openConsults.has(consultRunIdB)).toBe(true);

        // Without Consult: question line appears and run behaves as today (terminateAfter: true ends parent)
        harness = new ConsultLoopHarness();
        harness.agent.ChatHandlingOption = null;
        const childNoConsult = registerChildSubAgent({
            ID: 'bbbbbbbb-0000-4000-8000-000000000012',
            Name: 'NoConsultSubAgent',
        });
        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: 'bbbbbbbb-2222-4000-8000-000000000029',
                agentId: childNoConsult.ID,
                agentName: childNoConsult.Name,
                message: 'Unconsulted parallel question?',
            });

        const { agent: agentNoConsult, runner: runnerNoConsult, flushSteps: flushNoConsult } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Running parallel without consult',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgents: [
                            { name: 'NoConsultSubAgent', message: 'Do work', terminateAfter: false },
                        ],
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Done',
                }),
        ]);
        const resultNoConsult = await agentNoConsult.Execute(makeParams());
        await flushNoConsult();
        expect(resultNoConsult.success).toBe(true);
        const turn2NoConsultMsgs = runnerNoConsult.Calls[1].conversationMessages ?? [];
        const noConsultSummary = turn2NoConsultMsgs.find(
            m => typeof m.content === 'string' && m.content.startsWith('Parallel Sub-Agents Completed:')
        ) as { content: string } | undefined;
        expect(noConsultSummary?.content).toContain('* Question: Unconsulted parallel question?');
        expect(noConsultSummary?.content).not.toContain('Child run ID:');
    });

    it('Case 8 (Native): with sendResultsNatively and a toolCallId, consult answers the call as a tool-result turn with no user turn between call and result', async () => {
        const childAgent = registerChildSubAgent();
        const nativeRunId = 'bbbbbbbb-2222-4000-8000-000000000041';

        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: nativeRunId,
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                message: 'Native tool sub-agent asks: what tone?',
                payload: { nativeDraft: true },
            });

        const toolName = `delegate_to_${SanitizeToolName(childAgent.Name)}`;
        const { agent, runner, flushSteps } = makeAgent([
            () => {
                const chatResult = {
                    success: true,
                    data: {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: '',
                                toolCalls: [{
                                    id: 'call_sub_1',
                                    name: toolName,
                                    arguments: {
                                        message: 'Write script via native tool',
                                        terminateAfter: false,
                                    },
                                }],
                            },
                        }],
                    },
                } as unknown as AIPromptRunResult['chatResult'];
                RecordToolCallingDecision(chatResult, {
                    useNativeTools: true,
                    mode: 'Native',
                    controlFlow: 'implicit',
                    toolResults: true,
                });
                return {
                    success: true,
                    result: { result: null } as unknown as string,
                    rawResult: '',
                    chatResult,
                    promptRun: { ToolCallingMode: 'NativeImplicit' } as unknown as AIPromptRunResult['promptRun'],
                };
            },
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Completed after native sub-agent consult',
                }),
        ]);

        const params = makeParams();
        const result = await agent.Execute(params);
        await flushSteps();

        expect(result.success).toBe(true);
        expect(result.agentRun.FinalStep).toBe('Success');
        expect(runner.Calls).toHaveLength(2);

        const messages = params.conversationMessages as Array<{
            role: string;
            content: unknown;
            toolCalls?: Array<{ id: string }>;
            metadata?: Record<string, unknown>;
        }>;
        const callIndex = messages.findIndex(m => m.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0);
        expect(callIndex).toBeGreaterThan(-1);
        expect(messages[callIndex].toolCalls?.[0].id).toBe('call_sub_1');

        // Immediately following the assistant tool call turn is the tool-result turn, with no user turn in between
        const toolTurn = messages[callIndex + 1];
        expect(toolTurn.role).toBe('tool');
        expect(toolTurn.metadata?.messageType).toBe('sub-agent-consult');
        const blocks = toolTurn.content as Array<{ type: string; toolCallId?: string; toolName?: string; content?: string }>;
        expect(blocks[0].type).toBe('tool_result');
        expect(blocks[0].toolCallId).toBe('call_sub_1');
        expect(blocks[0].toolName).toBe(toolName);
        expect(blocks[0].content).toContain(`**Child run ID:** ${nativeRunId}`);
        expect(blocks[0].content).toContain('Native tool sub-agent asks: what tone?');
    });

    it('Case 9 (Compaction): sub-agent-consult messages are treated as volatile by IsVolatileResultMessage and compacted across turns', async () => {
        const childAgent = registerChildSubAgent();

        const baseRunner = new BaseAgent() as unknown as {
            IsVolatileResultMessage: (msg: { metadata?: { messageType?: string } }) => boolean;
        };
        expect(baseRunner.IsVolatileResultMessage({ metadata: { messageType: 'sub-agent-consult' } })).toBe(true);

        let subCall = 0;
        harness.executeSubAgentHandler = async () => {
            subCall += 1;
            if (subCall === 1) {
                return makeSubAgentChatResult({
                    runId: 'bbbbbbbb-2222-4000-8000-000000000031',
                    agentId: childAgent.ID,
                    agentName: childAgent.Name,
                    message: 'Consult question turn 1: ' + 'x'.repeat(600),
                });
            }
            return makeSubAgentSuccessResult({
                runId: 'bbbbbbbb-2222-4000-8000-000000000032',
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                payload: { done: true },
            });
        };

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Turn 1',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: 'Call 1',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Turn 2',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: 'Call 2',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'All done',
                }),
        ]);

        const result = await agent.Execute(
            makeParams({
                messageExpirationOverride: {
                    expirationTurns: 0,
                    expirationMode: 'Compact',
                    compactMode: 'First N Chars',
                    compactLength: 50,
                },
            })
        );
        await flushSteps();

        expect(result.success).toBe(true);
        const turn3Messages = runner.Calls[2].conversationMessages ?? [];
        const turn1ConsultMsg = turn3Messages.find(
            m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'sub-agent-consult'
        ) as { metadata?: Record<string, unknown> } | undefined;
        expect(turn1ConsultMsg).toBeDefined();
        expect(turn1ConsultMsg?.metadata?.wasCompacted).toBe(true);
    });

    it('VS-CON-6: gatherPromptTemplateData sets parentConsults=true for child and related sub-agents under Consult (depth > 0) and omits it at depth 0 or non-Consult pairings', async () => {
        const child = registerChildSubAgent({ Parent: 'DirectorAgent', ChatHandlingOption: null });
        const { subAgent: related, relationship } = registerRelatedSubAgent(
            {},
            { ChatHandlingOption: 'Consult' }
        );
        harness.agent.ChatHandlingOption = 'Consult';

        const parentRun = new FakeAgentRun();
        parentRun.AgentID = AGENT_ID;

        const gatherFor = async (
            agentEntity: MJAIAgentEntityExtended,
            depth: number,
            run?: FakeAgentRun
        ): Promise<{ parentConsults?: boolean; parentAgentName?: string }> => {
            const instance = new BaseAgent();
            (instance as unknown as { _depth: number })._depth = depth;
            const gather = (
                instance as unknown as {
                    gatherPromptTemplateData: (
                        ag: MJAIAgentEntityExtended,
                        u: UserInfo,
                        extra?: Record<string, unknown>,
                        actionChanges?: unknown,
                        subAgentChanges?: unknown,
                        withholding?: unknown,
                        pr?: MJAIAgentRunEntityExtended
                    ) => Promise<{ parentConsults?: boolean; parentAgentName?: string }>;
                }
            ).gatherPromptTemplateData.bind(instance);
            return gather(
                agentEntity,
                { ID: USER_ID } as unknown as UserInfo,
                undefined,
                undefined,
                undefined,
                undefined,
                run as unknown as MJAIAgentRunEntityExtended | undefined
            );
        };

        // 1. Child sub-agent (ParentID === AGENT_ID) at depth 1 under Consult -> parentConsults: true
        const childData = await gatherFor(child, 1, parentRun);
        expect(childData.parentConsults).toBe(true);
        expect(childData.parentAgentName).toBe('DirectorAgent');

        // 2. Related sub-agent (ParentID === null, relationship.ChatHandlingOption === 'Consult') at depth 1 -> parentConsults: true
        const relatedData = await gatherFor(related, 1, parentRun);
        expect(relatedData.parentConsults).toBe(true);
        expect(relatedData.parentAgentName).toBe('');

        // 3. Depth 0 (root / task-graph run where parentRun is passed for lineage) -> parentConsults omitted
        const rootWithParentRunData = await gatherFor(child, 0, parentRun);
        expect(rootWithParentRunData.parentConsults).toBeUndefined();

        // 4. Non-Consult pairing (relationship.ChatHandlingOption === 'Retry') at depth 1 -> parentConsults omitted
        relationship.ChatHandlingOption = 'Retry';
        const nonConsultRelatedData = await gatherFor(related, 1, parentRun);
        expect(nonConsultRelatedData.parentConsults).toBeUndefined();
    });

    it('Single-path terminateAfter:true under Consult does not end the parent: runner gets a second call and OutputData has shouldTerminate:false and a consult record', async () => {
        const childAgent = registerChildSubAgent();
        const childRunId = 'bbbbbbbb-2222-4000-8000-000000000055';

        harness.executeSubAgentHandler = async () =>
            makeSubAgentChatResult({
                runId: childRunId,
                agentId: childAgent.ID,
                agentName: childAgent.Name,
                message: 'Should I include captions?',
            });

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Delegating with terminateAfter: true',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'ScriptwriterSubAgent',
                            message: 'Write final script',
                            terminateAfter: true,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Resolved after consult on second turn',
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        const subAgentStep = harness.steps.find(s => s.StepType === 'Sub-Agent');
        expect(subAgentStep).toBeDefined();
        const parsedOutput = JSON.parse(subAgentStep?.OutputData ?? '{}');
        expect(parsedOutput.shouldTerminate).toBe(false);
        expect(parsedOutput.consult).toEqual({
            childRunId,
            subAgentId: childAgent.ID,
            subAgentName: 'ScriptwriterSubAgent',
            round: 1,
            question: 'Should I include captions?',
        });
    });

    it('Related sub-agent path does not roll child TotalCost or TotalTokensUsed into the parent run totals', async () => {
        const { subAgent } = registerRelatedSubAgent(
            {},
            { ChatHandlingOption: 'Consult' }
        );
        harness.executeSubAgentHandler = async () =>
            makeSubAgentSuccessResult({
                runId: 'cccccccc-2222-4000-8000-000000000077',
                agentId: subAgent.ID,
                agentName: subAgent.Name,
                payload: { voiceCast: 'warm' },
            });

        const { agent, runner, flushSteps } = makeAgent([
            () =>
                llmEnvelope({
                    taskComplete: false,
                    message: 'Calling related VoiceCastingAgent',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'VoiceCastingAgent',
                            message: 'Cast voice',
                            terminateAfter: false,
                        },
                    },
                }),
            () =>
                llmEnvelope({
                    taskComplete: true,
                    message: 'Completed after related sub-agent',
                }),
        ]);

        const result = await agent.Execute(makeParams());
        await flushSteps();

        expect(result.success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        // makeSubAgentSuccessResult sets child TotalCost=0.01 and TotalTokensUsed=40;
        // parent prompt calls have 0 cost/tokens, so parent TotalCost must remain 0.
        expect(result.agentRun.TotalCost).toBe(0);
        expect(result.agentRun.TotalTokensUsed).toBe(0);
    });
});


